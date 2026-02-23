import type { SaleRecord } from '../store/useSaleStore';
import { db, type LocalSale, type SyncQueueItem } from './db';
import { syncSalesBatch } from '../services/api/sales';

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

    const saleIds = batch
        .map((q) => (q.payload as { saleId?: string } | undefined)?.saleId)
        .filter((id): id is string => typeof id === 'string');

    const sales = (await db.sales.bulkGet(saleIds)).filter((s): s is LocalSale => Boolean(s));
    if (sales.length === 0) return;

    try {
        await syncSalesBatch(sales);

        await db.transaction('rw', db.sales, db.sync_queue, async () => {
            await db.sales.bulkPut(sales.map((s) => ({ ...s, synced: 1 as const })));
            await db.sync_queue.bulkDelete(batch.map((b) => b.id!).filter((id): id is number => typeof id === 'number'));
        });
    } catch (err) {
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

export async function getSyncStats(): Promise<{ pending: number; error: number }> {
    const [pendingAll, error] = await Promise.all([
        db.sync_queue.where('status').equals('pending').toArray(),
        db.sync_queue.where('status').equals('error').count(),
    ]);

    return { pending: pendingAll.length, error };
}
