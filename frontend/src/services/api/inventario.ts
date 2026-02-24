// ─────────────────────────────────────────────────────────────────────────────
// Inventario API — jerarquía padre/hijo, desarme, alertas de stock mínimo.
// GET  /v1/inventario/vinculos     → VinculoResponse[]
// POST /v1/inventario/vinculos     → VinculoResponse
// POST /v1/inventario/desarme      → DesarmeManualResponse
// GET  /v1/inventario/alertas      → AlertaStockResponse[]
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Response Types ────────────────────────────────────────────────────────────

export interface VinculoResponse {
    id: string;
    producto_padre_id: string;
    nombre_padre: string;
    producto_hijo_id: string;
    nombre_hijo: string;
    unidades_por_padre: number;
    desarme_auto: boolean;
}

export interface DesarmeManualResponse {
    vinculo_id: string;
    padres_desarmados: number;
    unidades_generadas: number;
}

export interface AlertaStockResponse {
    producto_id: string;
    nombre: string;
    codigo_barras?: string;
    stock_actual: number;
    stock_minimo: number;
    deficit?: number;
    precio_venta?: number;
}

// ── Request Types ─────────────────────────────────────────────────────────────

export interface CrearVinculoRequest {
    producto_padre_id: string;
    producto_hijo_id: string;
    unidades_por_padre: number;
    desarme_auto: boolean;
}

export interface DesarmeManualRequest {
    vinculo_id: string;
    cantidad_padres: number;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * GET /v1/inventario/vinculos  (administrador, supervisor)
 */
export async function listarVinculos(): Promise<VinculoResponse[]> {
    return apiClient.get<VinculoResponse[]>('/v1/inventario/vinculos');
}

/**
 * POST /v1/inventario/vinculos  (administrador, supervisor)
 */
export async function crearVinculo(data: CrearVinculoRequest): Promise<VinculoResponse> {
    return apiClient.post<VinculoResponse>('/v1/inventario/vinculos', data);
}

/**
 * POST /v1/inventario/desarme  (administrador, supervisor)
 * Executa el desarme manual de N unidades padre → acredita unidades hijo.
 * Operación ACID dentro de una transacción PostgreSQL.
 */
export async function ejecutarDesarme(data: DesarmeManualRequest): Promise<DesarmeManualResponse> {
    return apiClient.post<DesarmeManualResponse>('/v1/inventario/desarme', data);
}

/**
 * GET /v1/inventario/alertas  (administrador, supervisor)
/**
 * GET /v1/inventario/alertas  (administrador, supervisor)
 * Retorna productos cuyo stock_actual <= stock_minimo.
 */
export async function getAlertasStock(): Promise<AlertaStockResponse[]> {
    return apiClient.get<AlertaStockResponse[]>('/v1/inventario/alertas');
}

// ── Movimientos de stock ──────────────────────────────────────────────────────

export interface MovimientoStockResponse {
    id: string;
    producto_id: string;
    producto_nombre?: string;
    tipo: string;
    cantidad: number;
    stock_anterior: number;
    stock_nuevo: number;
    motivo: string;
    referencia_id?: string;
    created_at: string;
}

export interface MovimientoStockListResponse {
    data: MovimientoStockResponse[];
    total: number;
    page: number;
    limit: number;
}

/**
 * GET /v1/inventario/movimientos  (administrador, supervisor)
 * Lista paginada de movimientos de stock.
 */
export async function listarMovimientos(opts: {
    productoId?: string;
    tipo?: string;
    page?: number;
    limit?: number;
} = {}): Promise<MovimientoStockListResponse> {
    return apiClient.get<MovimientoStockListResponse>('/v1/inventario/movimientos', {
        producto_id: opts.productoId,
        tipo: opts.tipo,
        page: opts.page ?? 1,
        limit: opts.limit ?? 100,
    });
}
