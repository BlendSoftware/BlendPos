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
    /** Precio mayorista opcional. Si está ausente o es null, el producto no tiene precio mayorista. */
    precio_mayorista?: number | null;
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
    /**
     * ISO-8601 timestamp. When provided, only products updated after this
     * time are returned. Used by the frontend delta-sync to avoid downloading
     * the full catalog on every POS mount.
     */
    updated_after?: string;
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
    precio_mayorista?: number | null;
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
    precio_mayorista?: number | null;
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
        updated_after: filter.updated_after,
        page: filter.page ?? 1,
        limit: filter.limit ?? 50,
    });
}

/** Tamaño de página al recorrer el catálogo completo. */
export const PAGE_SIZE_CATALOGO = 500;

/**
 * Tope de páginas. Es una red contra un backend que ignore `page` y devuelva
 * siempre una página llena: sin esto el bucle no termina nunca.
 */
const MAX_PAGINAS_CATALOGO = 50;

/**
 * Trae el catálogo COMPLETO recorriendo la paginación del backend.
 *
 * Por qué existe: las pantallas de administración pedían `limit: 500` y
 * filtraban del lado del cliente sobre ese array. El día que el catálogo pasó
 * los 500 productos (536 en producción), los que caían después en el orden
 * alfabético dejaron de existir para la aplicación: no aparecían en el listado
 * ni con "Mostrar inactivos", pero seguían ocupando su código de barras, así
 * que intentar volver a crearlos fallaba con "ya existe".
 *
 * Un `limit` más grande sólo corre el problema de lugar. Esto lo saca: no hay
 * número mágico, el corte lo marca el backend.
 */
export async function listarTodosLosProductos(
    filter: Omit<ProductoFilter, 'page' | 'limit'> = {},
): Promise<ProductoResponse[]> {
    const acumulado: ProductoResponse[] = [];

    for (let page = 1; page <= MAX_PAGINAS_CATALOGO; page++) {
        const resp = await listarProductos({ ...filter, page, limit: PAGE_SIZE_CATALOGO });
        const lote = resp?.data ?? [];
        acumulado.push(...lote);

        // Página incompleta = era la última.
        if (lote.length < PAGE_SIZE_CATALOGO) return acumulado;
        // Ya tenemos todo lo que el backend dice que hay.
        if (typeof resp.total === 'number' && acumulado.length >= resp.total) return acumulado;
    }

    // Nunca truncar en silencio: si llegamos acá, el listado está incompleto.
    console.warn(
        `[productos] se alcanzó el tope de ${MAX_PAGINAS_CATALOGO} páginas ` +
        `(${acumulado.length} productos). El listado puede estar incompleto.`,
    );
    return acumulado;
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
