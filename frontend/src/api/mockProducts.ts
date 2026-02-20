// ─────────────────────────────────────────────────────────────────────────────
// mockProducts — re-exporta los productos del mock admin para que
// el POS y el panel de administración usen exactamente el mismo dataset.
// ─────────────────────────────────────────────────────────────────────────────

import { MOCK_PRODUCTOS } from './mockAdmin';

export interface MockProduct {
    id: string;
    nombre: string;
    precio: number;
    codigoBarras: string;
}

/** Lista unificada de productos para el POS y el admin panel */
export const MOCK_PRODUCTS: MockProduct[] = MOCK_PRODUCTOS
    .filter((p) => p.activo)
    .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precioVenta,
        codigoBarras: p.codigoBarras,
    }));

/**
 * Busca un producto por código de barras exacto.
 * Incluye productos inactivos para el caso de reimpresión de tickets.
 */
export function findProductByBarcode(barcode: string): MockProduct | undefined {
    const all = MOCK_PRODUCTOS.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precioVenta,
        codigoBarras: p.codigoBarras,
    }));
    return all.find((p) => p.codigoBarras === barcode);
}
