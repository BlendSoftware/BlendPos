import { db, type LocalProduct } from './db';
import { listarProductos } from '../services/api/products';

const SEED_LIMIT = 5000;
const LAST_SYNC_KEY = 'catalogLastSyncAt';

// ── Sync meta helpers ─────────────────────────────────────────────────────────

async function getLastSyncAt(): Promise<string | null> {
    const meta = await db.sync_meta.get(LAST_SYNC_KEY);
    return meta?.value ?? null;
}

async function setLastSyncAt(iso: string): Promise<void> {
    await db.sync_meta.put({ key: LAST_SYNC_KEY, value: iso });
}

// ── Full seed (first launch or explicit reset) ────────────────────────────────

/** Descarga el catálogo completo del backend y reemplaza IndexedDB. */
export async function seedCatalogFromAPI(): Promise<boolean> {
    try {
        const resp = await listarProductos({ limit: SEED_LIMIT, page: 1 });
        if (resp.data && resp.data.length > 0) {
            const seed: LocalProduct[] = resp.data
                .filter((p) => p.activo)
                .map((p) => ({
                    id: p.id,
                    codigoBarras: p.codigo_barras,
                    nombre: p.nombre,
                    precio: typeof p.precio_venta === 'number' ? p.precio_venta : parseFloat(p.precio_venta as unknown as string),
                    stock: p.stock_actual ?? 0,
                }));
            await db.products.clear();
            await db.products.bulkPut(seed);
            await setLastSyncAt(new Date().toISOString());
            return true;
        }
        return false;
    } catch (err) {
        console.warn('[BlendPOS] No se pudo sincronizar catálogo desde API:', err);
        return false;
    }
}

// ── Delta sync (subsequent syncs) ────────────────────────────────────────────

/**
 * Descarga solo los productos modificados desde la última sincronización.
 * Si no hay registro previo, hace una sincronización completa.
 * Devuelve true si hubo cambios; false si no hay conectividad o sin cambios.
 */
export async function deltaSyncCatalog(): Promise<boolean> {
    const lastSync = await getLastSyncAt();

    // No previous sync: fall back to full seed
    if (!lastSync) {
        return seedCatalogFromAPI();
    }

    try {
        const syncStart = new Date().toISOString();
        const resp = await listarProductos({
            limit: SEED_LIMIT,
            page: 1,
            activo: 'all',        // include deactivated so we can mark them locally
            updated_after: lastSync,
        });

        if (!resp.data || resp.data.length === 0) {
            // No changes since last sync — update timestamp to avoid redundant queries
            await setLastSyncAt(syncStart);
            return false;
        }

        // Upsert changed products; soft-delete (stock=0) for deactivated ones
        const upserts: LocalProduct[] = resp.data.map((p) => ({
            id: p.id,
            codigoBarras: p.codigo_barras,
            nombre: p.nombre,
            precio: typeof p.precio_venta === 'number' ? p.precio_venta : parseFloat(p.precio_venta as unknown as string),
            // If product was deactivated, set stock=0 so the POS blocks sales
            stock: p.activo ? (p.stock_actual ?? 0) : 0,
        }));

        await db.products.bulkPut(upserts);
        await setLastSyncAt(syncStart);
        return true;
    } catch (err) {
        console.warn('[BlendPOS] Delta sync falló, usando catálogo local:', err);
        return false;
    }
}

/**
 * Sincroniza el catálogo desde el backend.
 * Si no hay conectividad y ya hay datos en IndexedDB, los usa tal cual.
 * Se llama en cada mount del POS → productos siempre sincronizados con gestión.
 */
export async function seedCatalogFromMocksIfEmpty(): Promise<void> {
    await seedCatalogFromAPI();
    // Si el backend no está disponible, el catálogo local (IndexedDB) se usa tal cual.
    // No se cargan datos mock — el POS mostrará "sin productos" hasta que haya conexión.
}

/** Fuerza una re-sincronización delta del catálogo desde el backend. */
export async function forceRefreshCatalog(): Promise<void> {
    await deltaSyncCatalog();
}

export async function findCatalogProductByBarcode(barcode: string): Promise<LocalProduct | undefined> {
    const trimmed = barcode.trim();
    if (!trimmed) return undefined;

    const byBarcode = await db.products.where('codigoBarras').equals(trimmed).first();
    if (byBarcode && byBarcode.stock > 0) return byBarcode;

    const byScan = await db.products.filter((p) => p.codigoBarras === trimmed && p.stock > 0).first();
    return byScan;
}

export async function searchCatalogProducts(query: string, limit = 50): Promise<LocalProduct[]> {
    const q = query.trim().toLowerCase();

    if (!q) {
        // Sin query: devolver solo productos con stock > 0 (limited)
        return db.products.filter((p) => p.stock > 0).limit(limit).toArray();
    }

    // Barcode exact match via index (fast path)
    const barcode = query.trim();
    if (/^\d{4,}$/.test(barcode)) {
        const exact = await db.products.where('codigoBarras').equals(barcode).first();
        if (exact && exact.stock > 0) return [exact];
    }

    // Name search: index-assisted startsWith + fallback contains filter
    const startsWithResults = await db.products
        .where('nombre')
        .startsWithIgnoreCase(q)
        .filter((p) => p.stock > 0)
        .limit(limit)
        .toArray();

    if (startsWithResults.length >= limit) return startsWithResults;

    // Fallback: substring match for names that don't start with query
    const remaining = limit - startsWithResults.length;
    const startsWithIds = new Set(startsWithResults.map((p) => p.id));
    const containsResults = await db.products
        .filter((p) =>
            p.stock > 0 &&
            !startsWithIds.has(p.id) &&
            (p.nombre.toLowerCase().includes(q) || p.codigoBarras.includes(barcode))
        )
        .limit(remaining)
        .toArray();

    return [...startsWithResults, ...containsResults];
}

/** Obtiene el stock local actual de un producto en IndexedDB. */
export async function getLocalStock(productId: string): Promise<number> {
    const product = await db.products.get(productId);
    return product?.stock ?? 0;
}

/**
 * Descuenta stock localmente en IndexedDB tras confirmar una venta.
 * Esto evita que el POS permita vender más de lo disponible entre
 * la confirmación y la próxima sincronización con el backend.
 */
export async function deductLocalStock(items: { id: string; cantidad: number }[]): Promise<void> {
    await db.transaction('rw', db.products, async () => {
        for (const item of items) {
            const product = await db.products.get(item.id);
            if (product) {
                await db.products.update(item.id, {
                    stock: product.stock - item.cantidad,
                });
            }
        }
    });
}

