import type { SaleRecord } from '../store/useSaleStore';
import { db, type LocalSale, type SyncQueueItem } from './db';
import { syncSalesBatch, type SyncSaleResult } from '../services/api/sales';

const SYNC_BATCH_SIZE = 25;
const MAX_TRIES_BEFORE_ERROR = 3;
const MIN_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

function computeBackoffMs(tries: number): number {
    const base = MIN_BACKOFF_MS * Math.pow(2, Math.max(0, tries - 1));
    const jitter = 0.25 + Math.random() * 0.5; // 0.25x..0.75x
    return Math.min(MAX_BACKOFF_MS, Math.floor(base * (1 + jitter)));
}

function nowIso(): string {
    return new Date().toISOString();
}

function toLocalSale(sale: SaleRecord): LocalSale {
    return {
        id: sale.id,
        numeroTicket: sale.numeroTicket,
        fecha: sale.fecha.toISOString(),
        items: sale.items,
        total: sale.total,
        totalConDescuento: sale.totalConDescuento,
        metodoPago: sale.metodoPago,
        pagos: sale.pagos,
        efectivoRecibido: sale.efectivoRecibido,
        vuelto: sale.vuelto,
        cajero: sale.cajero,
        sesionCajaId: sale.sesionCajaId,
        synced: 0,
    };
}

export async function enqueueSale(sale: SaleRecord): Promise<void> {
    const localSale = toLocalSale(sale);
    const createdAt = nowIso();

    await db.transaction('rw', db.sales, db.sync_queue, async () => {
        await db.sales.put(localSale);
        await db.sync_queue.add({
            type: 'sale',
            payload: { saleId: sale.id },
            createdAt,
            updatedAt: createdAt,
            status: 'pending',
            tries: 0,
            nextAttemptAt: createdAt,
        });
    });
}

/** Returns true when the backend result indicates the sale was accepted. */
function isSyncSuccess(r: SyncSaleResult): boolean {
    return r.estado === 'completada' || (!!r.id && r.estado !== 'error' && r.estado !== 'rechazada');
}

export async function trySyncQueue(): Promise<void> {
    if (!navigator.onLine) return;

    const now = Date.now();

    const pendingAll = await db.sync_queue
        .where('status')
        .equals('pending')
        .sortBy('createdAt');

    const pending = pendingAll.filter((q) => {
        if (!q.nextAttemptAt) return true;
        const ts = Date.parse(q.nextAttemptAt);
        return Number.isNaN(ts) ? true : ts <= now;
    });

    const batch = pending.slice(0, SYNC_BATCH_SIZE);
    if (batch.length === 0) return;

    // Build a map from saleId → queue item for correlation
    const batchBySaleId = new Map<string, SyncQueueItem>();
    for (const q of batch) {
        const saleId = (q.payload as { saleId?: string } | undefined)?.saleId;
        if (saleId) batchBySaleId.set(saleId, q);
    }

    const saleIds = [...batchBySaleId.keys()];
    const sales = (await db.sales.bulkGet(saleIds)).filter((s): s is LocalSale => Boolean(s));

    if (sales.length === 0) {
        // Orphaned queue items — remove them
        await db.sync_queue.bulkDelete(
            batch.map((b) => b.id!).filter((id): id is number => typeof id === 'number'),
        );
        return;
    }

    try {
        const results: SyncSaleResult[] = await syncSalesBatch(sales);

        // Correlate results with sales (backend returns one result per sale, same order)
        const okSaleIds: string[] = [];
        const failedEntries: { saleId: string; estado: string }[] = [];

        for (let i = 0; i < sales.length; i++) {
            const result = results[i];
            if (result && isSyncSuccess(result)) {
                okSaleIds.push(sales[i].id);
            } else {
                failedEntries.push({
                    saleId: sales[i].id,
                    estado: result?.estado ?? 'unknown',
                });
            }
        }

        await db.transaction('rw', db.sales, db.sync_queue, async () => {
            // Mark successful sales as synced and remove their queue items
            if (okSaleIds.length > 0) {
                const okSales = sales.filter((s) => okSaleIds.includes(s.id));
                await db.sales.bulkPut(okSales.map((s) => ({ ...s, synced: 1 as const })));

                const okQueueIds = okSaleIds
                    .map((sid) => batchBySaleId.get(sid)?.id)
                    .filter((id): id is number => typeof id === 'number');
                if (okQueueIds.length > 0) {
                    await db.sync_queue.bulkDelete(okQueueIds);
                }
            }

            // Mark failed sales for retry with backoff
            for (const { saleId, estado } of failedEntries) {
                const q = batchBySaleId.get(saleId);
                if (!q) continue;
                const tries = (q.tries ?? 0) + 1;
                const updatedAt = nowIso();
                const nextAttemptAt = new Date(Date.now() + computeBackoffMs(tries)).toISOString();
                await db.sync_queue.put({
                    ...q,
                    tries,
                    lastError: `Backend: estado=${estado}`,
                    updatedAt,
                    nextAttemptAt,
                    status: tries >= MAX_TRIES_BEFORE_ERROR ? 'error' : 'pending',
                });
            }
        });

        if (failedEntries.length > 0) {
            console.warn(`[sync] ${failedEntries.length}/${sales.length} ventas rechazadas por el servidor`, failedEntries);
        }
    } catch (err) {
        // HTTP-level failure — retry the whole batch
        const message = err instanceof Error ? err.message : String(err);
        await db.transaction('rw', db.sync_queue, async () => {
            await Promise.all(
                batch.map(async (q) => {
                    const tries = (q.tries ?? 0) + 1;
                    const updatedAt = nowIso();
                    const nextAttemptAt = new Date(Date.now() + computeBackoffMs(tries)).toISOString();
                    const next: SyncQueueItem = {
                        ...q,
                        tries,
                        lastError: message,
                        updatedAt,
                        nextAttemptAt,
                        status: tries >= MAX_TRIES_BEFORE_ERROR ? 'error' : 'pending',
                    };
                    await db.sync_queue.put(next);
                })
            );
        });
    }
}

/**
 * Re-enqueue all local sales that were incorrectly marked as synced
 * but don't exist on the backend, AND reset any 'error' queue items
 * back to 'pending' so they get another chance (e.g. after a DB
 * constraint fix or transient backend issue).
 */
export async function recoverLostSales(): Promise<number> {
    let recovered = 0;
    const createdAt = nowIso();

    // 1. Reset all 'error' queue items to 'pending' for a fresh retry
    const errorItems = await db.sync_queue.where('status').equals('error').toArray();
    if (errorItems.length > 0) {
        await db.transaction('rw', db.sync_queue, async () => {
            for (const q of errorItems) {
                await db.sync_queue.put({
                    ...q,
                    status: 'pending',
                    tries: 0,
                    nextAttemptAt: createdAt,
                    updatedAt: createdAt,
                });
            }
        });
        recovered += errorItems.length;
        console.info(`[sync] reset ${errorItems.length} error queue items to pending`);
    }

    // 2. Re-enqueue synced sales that don't have a queue entry
    const syncedSales = await db.sales.where('synced').equals(1).toArray();
    if (syncedSales.length > 0) {
        const existingQueueSaleIds = new Set(
            (await db.sync_queue.toArray())
                .map((q) => (q.payload as { saleId?: string } | undefined)?.saleId)
                .filter(Boolean),
        );

        await db.transaction('rw', db.sales, db.sync_queue, async () => {
            for (const sale of syncedSales) {
                if (existingQueueSaleIds.has(sale.id)) continue;

                await db.sales.put({ ...sale, synced: 0 as const });
                await db.sync_queue.add({
                    type: 'sale',
                    payload: { saleId: sale.id },
                    createdAt,
                    updatedAt: createdAt,
                    status: 'pending',
                    tries: 0,
                    nextAttemptAt: createdAt,
                });
                recovered++;
            }
        });
    }

    if (recovered > 0) {
        console.info(`[sync] total recovered: ${recovered} sales — will re-sync`);
    }
    return recovered;
}

export async function getSyncStats(): Promise<{ pending: number; error: number }> {
    const [pendingAll, error] = await Promise.all([
        db.sync_queue.where('status').equals('pending').toArray(),
        db.sync_queue.where('status').equals('error').count(),
    ]);

    return { pending: pendingAll.length, error };
}
