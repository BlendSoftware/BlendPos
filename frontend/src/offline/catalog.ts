import { db, type LocalProduct } from './db';
import { MOCK_PRODUCTS } from '../api/mockProducts';
import { listarProductos } from '../services/api/products';

const SEED_LIMIT = 5000;

/** Descarga el catálogo completo del backend y reemplaza IndexedDB. */
export async function seedCatalogFromAPI(): Promise<boolean> {
    try {
        const resp = await listarProductos({ limit: SEED_LIMIT, page: 1 });
        if (resp.data && resp.data.length > 0) {
            const seed: LocalProduct[] = resp.data.map((p) => ({
                id: p.id,
                codigoBarras: p.codigo_barras,
                nombre: p.nombre,
                precio: typeof p.precio_venta === 'number' ? p.precio_venta : parseFloat(p.precio_venta as unknown as string),
            }));
            // Reemplazar todo el catálogo local con lo que viene del backend
            await db.products.clear();
            await db.products.bulkPut(seed);
            return true;
        }
        return false;
    } catch (err) {
        console.warn('[BlendPOS] No se pudo sincronizar catálogo desde API:', err);
        return false;
    }
}

/**
 * Sincroniza el catálogo SIEMPRE desde el backend.
 * Si el backend falla, usa mocks como fallback (solo si IndexedDB está vacío).
 * Se llama en cada mount del POS → productos siempre sincronizados con gestión.
 */
export async function seedCatalogFromMocksIfEmpty(): Promise<void> {
    const synced = await seedCatalogFromAPI();
    if (synced) return;

    // Fallback: mocks locales solo si IndexedDB está vacío
    const count = await db.products.count();
    if (count > 0) return;

    const seed: LocalProduct[] = MOCK_PRODUCTS.slice(0, SEED_LIMIT).map((p) => ({
        id: p.id,
        codigoBarras: p.codigoBarras,
        nombre: p.nombre,
        precio: p.precio,
    }));

    await db.products.bulkPut(seed);
}

/** Fuerza una re-sincronización completa del catálogo desde el backend. */
export async function forceRefreshCatalog(): Promise<void> {
    await seedCatalogFromAPI();
}

export async function findCatalogProductByBarcode(barcode: string): Promise<LocalProduct | undefined> {
    const trimmed = barcode.trim();
    if (!trimmed) return undefined;

    const byBarcode = await db.products.where('codigoBarras').equals(trimmed).first();
    if (byBarcode) return byBarcode;

    const byScan = await db.products.filter((p) => p.codigoBarras === trimmed).first();
    return byScan;
}

export async function searchCatalogProducts(query: string, limit = 200): Promise<LocalProduct[]> {
    const q = query.trim().toLowerCase();

    if (!q) {
        return db.products.limit(limit).toArray();
    }

    const all = await db.products.toArray();
    return all
        .filter((p) => p.nombre.toLowerCase().includes(q) || p.codigoBarras.includes(query.trim()))
        .slice(0, limit);
}
