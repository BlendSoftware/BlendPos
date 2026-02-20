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
    cantidad_desarmada: number;
    unidades_acreditadas: number;
    stock_padre_nuevo: number;
    stock_hijo_nuevo: number;
}

export interface AlertaStockResponse {
    producto_id: string;
    nombre: string;
    codigo_barras: string;
    stock_actual: number;
    stock_minimo: number;
    deficit: number;
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
    cantidad: number;
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
 * Retorna productos cuyo stock_actual <= stock_minimo.
 */
export async function getAlertasStock(): Promise<AlertaStockResponse[]> {
    return apiClient.get<AlertaStockResponse[]>('/v1/inventario/alertas');
}
