// ─────────────────────────────────────────────────────────────────────────────
// Products API — mapea exactamente los DTOs del backend Go.
// - GET /v1/precio/:barcode  (público, sin auth) → ConsultaPreciosResponse
// - GET /v1/productos         (admin)             → ProductoListResponse
// - POST/PUT/DELETE /v1/productos                 → ProductoResponse
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Response Types ────────────────────────────────────────────────────────────

export interface ConsultaPreciosResponse {
    nombre: string;
    precio_venta: number;
    stock_disponible: number;
    categoria: string;
    promocion: string | null;
}

export interface ProductoResponse {
    id: string;
    codigo_barras: string;
    nombre: string;
    descripcion: string | null;
    categoria: string;
    precio_costo: number;
    precio_venta: number;
    margen_pct: number;
    stock_actual: number;
    stock_minimo: number;
    unidad_medida: string;
    es_padre: boolean;
    activo: boolean;
    proveedor_id: string | null;
}

export interface ProductoListResponse {
    data: ProductoResponse[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

export interface ProductoFilter {
    barcode?: string;
    nombre?: string;
    categoria?: string;
    proveedor_id?: string;
    /** "true" = activos (default), "false" = inactivos, "all" = todos */
    activo?: 'true' | 'false' | 'all';
    page?: number;
    limit?: number;
}

export interface CrearProductoRequest {
    codigo_barras: string;
    nombre: string;
    descripcion?: string;
    categoria: string;
    precio_costo: number;
    precio_venta: number;
    stock_actual: number;
    stock_minimo: number;
    unidad_medida?: string;
    proveedor_id?: string;
}

export interface ActualizarProductoRequest {
    nombre?: string;
    descripcion?: string;
    categoria?: string;
    precio_costo?: number;
    precio_venta?: number;
    stock_minimo?: number;
    unidad_medida?: string;
    proveedor_id?: string;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * GET /v1/precio/:barcode  (no requiere autenticación — RF-27)
 * Usado por el POS para búsqueda rápida y por ConsultaPrecios.
 */
export async function getPrecioPorBarcode(barcode: string): Promise<ConsultaPreciosResponse> {
    return apiClient.get<ConsultaPreciosResponse>(`/v1/precio/${encodeURIComponent(barcode)}`);
}

/**
 * GET /v1/productos  (requiere rol: administrador)
 * Lista productos con filtros y paginación.
 */
export async function listarProductos(filter: ProductoFilter = {}): Promise<ProductoListResponse> {
    return apiClient.get<ProductoListResponse>('/v1/productos', {
        barcode: filter.barcode,
        nombre: filter.nombre,
        categoria: filter.categoria,
        proveedor_id: filter.proveedor_id,
        activo: filter.activo,
        page: filter.page ?? 1,
        limit: filter.limit ?? 50,
    });
}

/**
 * GET /v1/productos/:id  (requiere rol: administrador)
 */
export async function getProducto(id: string): Promise<ProductoResponse> {
    return apiClient.get<ProductoResponse>(`/v1/productos/${id}`);
}

/**
 * POST /v1/productos  (requiere rol: administrador)
 */
export async function crearProducto(data: CrearProductoRequest): Promise<ProductoResponse> {
    return apiClient.post<ProductoResponse>('/v1/productos', data);
}

/**
 * PUT /v1/productos/:id  (requiere rol: administrador)
 */
export async function actualizarProducto(id: string, data: ActualizarProductoRequest): Promise<ProductoResponse> {
    return apiClient.put<ProductoResponse>(`/v1/productos/${id}`, data);
}

/**
 * DELETE /v1/productos/:id  (requiere rol: administrador) — soft-delete
 */
export async function desactivarProducto(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/productos/${id}`);
}

/**
 * PATCH /v1/productos/:id/reactivar  (requiere rol: administrador)
 */
export async function reactivarProducto(id: string): Promise<void> {
    return apiClient.patch<void>(`/v1/productos/${id}/reactivar`, {});
}

/**
 * PATCH /v1/productos/:id/stock  (requiere rol: administrador)
 * Ajusta el stock en ±delta unidades con motivo auditado.
 */
export async function ajustarStock(
    id: string,
    delta: number,
    motivo: string
): Promise<ProductoResponse> {
    return apiClient.patch<ProductoResponse>(`/v1/productos/${id}/stock`, { delta, motivo });
}
