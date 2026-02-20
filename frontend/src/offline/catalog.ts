import { db, type LocalProduct } from './db';
import { MOCK_PRODUCTS } from '../api/mockProducts';
import { listarProductos } from '../services/api/products';

const SEED_LIMIT = 5000;

/** Descarga el catálogo del backend y lo guarda en IndexedDB */
export async function seedCatalogFromAPI(): Promise<void> {
    try {
        const resp = await listarProductos({ limit: SEED_LIMIT, page: 1 });
        if (resp.data && resp.data.length > 0) {
            const seed: LocalProduct[] = resp.data.map((p) => ({
                id: p.id,
                codigoBarras: p.codigo_barras,
                nombre: p.nombre,
                precio: typeof p.precio_venta === 'number' ? p.precio_venta : parseFloat(p.precio_venta as unknown as string),
            }));
            await db.products.bulkPut(seed);
        }
    } catch (err) {
        console.warn('[BlendPOS] No se pudo sincronizar catálogo desde API:', err);
    }
}

export async function seedCatalogFromMocksIfEmpty(): Promise<void> {
    // Intentar sincronizar desde backend primero (si VITE_API_URL está configurada)
    if (import.meta.env.VITE_API_URL) {
        await seedCatalogFromAPI();
        const count = await db.products.count();
        if (count > 0) return;
    }

    // Fallback: mocks locales
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

export async function findCatalogProductByBarcode(barcode: string): Promise<LocalProduct | undefined> {
    const trimmed = barcode.trim();
    if (!trimmed) return undefined;

    // Fast path via index
    const byBarcode = await db.products.where('codigoBarras').equals(trimmed).first();
    if (byBarcode) return byBarcode;

    // Fallback: some datasets may have missing barcode index consistency
    const byScan = await db.products.filter((p) => p.codigoBarras === trimmed).first();
    return byScan;
}

export async function searchCatalogProducts(query: string, limit = 200): Promise<LocalProduct[]> {
    const q = query.trim().toLowerCase();

    if (!q) {
        return db.products.limit(limit).toArray();
    }

    // Dexie doesn't do full-text by default; for mocks this is fine.
    // We keep it simple: scan + filter.
    const all = await db.products.toArray();
    return all
        .filter((p) => p.nombre.toLowerCase().includes(q) || p.codigoBarras.includes(query.trim()))
        .slice(0, limit);
}
