import { db, type LocalProduct } from './db';
import { MOCK_PRODUCTS } from '../api/mockProducts';
import { listarProductos } from '../services/api/products';

const SEED_LIMIT = 5000;

/** Descarga el catálogo completo del backend y reemplaza IndexedDB. */
export async function seedCatalogFromAPI(): Promise<boolean> {
    try {
        const resp = await listarProductos({ limit: SEED_LIMIT, page: 1 });
        if (resp.data && resp.data.length > 0) {
            const seed: LocalProduct[] = resp.data
                .filter((p) => p.activo) // solo productos activos
                .map((p) => ({
                    id: p.id,
                    codigoBarras: p.codigo_barras,
                    nombre: p.nombre,
                    precio: typeof p.precio_venta === 'number' ? p.precio_venta : parseFloat(p.precio_venta as unknown as string),
                    stock: p.stock_actual ?? 0,
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
        stock: 'stock' in p ? (p as unknown as { stock: number }).stock : 99,
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
    if (byBarcode && byBarcode.stock > 0) return byBarcode;

    const byScan = await db.products.filter((p) => p.codigoBarras === trimmed && p.stock > 0).first();
    return byScan;
}

export async function searchCatalogProducts(query: string, limit = 200): Promise<LocalProduct[]> {
    const q = query.trim().toLowerCase();

    if (!q) {
        // Sin query: devolver solo productos con stock > 0
        const all = await db.products.toArray();
        return all.filter((p) => p.stock > 0).slice(0, limit);
    }

    const all = await db.products.toArray();
    return all
        .filter((p) => p.stock > 0 && (p.nombre.toLowerCase().includes(q) || p.codigoBarras.includes(query.trim())))
        .slice(0, limit);
}

