// ─────────────────────────────────────────────────────────────────────────────
// Caja API — ciclo de vida completo de sesión de caja.
// POST /v1/caja/abrir     → ReporteCajaResponse
// POST /v1/caja/arqueo    → ArqueoResponse
// GET  /v1/caja/:id/reporte → ReporteCajaResponse
// POST /v1/caja/movimiento → 204
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Response Types ────────────────────────────────────────────────────────────

export interface MontosPorMetodo {
    efectivo: number;
    debito: number;
    credito: number;
    transferencia: number;
    total: number;
}

export interface DesvioResponse {
    monto: number;
    porcentaje: number;
    clasificacion: 'normal' | 'advertencia' | 'critico';
}

export interface ReporteCajaResponse {
    sesion_caja_id: string;
    punto_de_venta: number;
    usuario: string;
    monto_inicial: number;
    monto_esperado: MontosPorMetodo;
    monto_declarado: MontosPorMetodo | null;
    desvio: DesvioResponse | null;
    estado: 'abierta' | 'cerrada';
    observaciones: string | null;
    opened_at: string;
    closed_at: string | null;
}

export interface ArqueoResponse {
    sesion_caja_id: string;
    monto_esperado: MontosPorMetodo;
    monto_declarado: MontosPorMetodo;
    desvio: DesvioResponse;
    estado: string;
}

// ── Request Types ─────────────────────────────────────────────────────────────

export interface AbrirCajaRequest {
    punto_de_venta: number;
    monto_inicial: number;
}

export interface DeclaracionArqueo {
    efectivo: number;
    debito: number;
    credito: number;
    transferencia: number;
}

export interface ArqueoRequest {
    sesion_caja_id: string;
    declaracion: DeclaracionArqueo;
    observaciones?: string;
}

export interface MovimientoManualRequest {
    sesion_caja_id: string;
    tipo: 'ingreso_manual' | 'egreso_manual';
    metodo_pago: 'efectivo' | 'debito' | 'credito' | 'transferencia';
    monto: number;
    descripcion: string;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * POST /v1/caja/abrir  (cajero, supervisor, administrador)
 * Abre una nueva sesión de caja. Devuelve la sesión con su ID.
 */
export async function abrirCaja(data: AbrirCajaRequest): Promise<ReporteCajaResponse> {
    return apiClient.post<ReporteCajaResponse>('/v1/caja/abrir', data);
}

/**
 * POST /v1/caja/arqueo  (cajero, supervisor, administrador)
 * Arqueo ciego + cierre de caja. Calcula desvío DESPUÉS de recibir la declaración.
 */
export async function cerrarCajaArqueo(data: ArqueoRequest): Promise<ArqueoResponse> {
    return apiClient.post<ArqueoResponse>('/v1/caja/arqueo', data);
}

/**
 * GET /v1/caja/:id/reporte  (cajero, supervisor, administrador)
 * Reporte detallado de la sesión de caja.
 */
export async function getReporteCaja(sesionId: string): Promise<ReporteCajaResponse> {
    return apiClient.get<ReporteCajaResponse>(`/v1/caja/${sesionId}/reporte`);
}

/**
 * POST /v1/caja/movimiento  (cajero, supervisor, administrador)
 * Registra un ingreso o egreso manual (inmutable).
 */
export async function registrarMovimiento(data: MovimientoManualRequest): Promise<void> {
    return apiClient.post<void>('/v1/caja/movimiento', data);
}

/**
 * GET /v1/caja/activa  (cajero, supervisor, administrador)
 * Devuelve la sesión de caja abierta del usuario autenticado, o null si no hay ninguna.
 */
export async function getCajaActiva(): Promise<ReporteCajaResponse | null> {
    try {
        return await apiClient.get<ReporteCajaResponse>('/v1/caja/activa');
    } catch {
        // 404 = no hay sesión activa
        return null;
    }
}

/**
 * GET /v1/caja/historial  (supervisor, administrador)
 * Devuelve el historial paginado de sesiones de caja cerradas.
 */
export async function getHistorialCajas(
    page = 1,
    limit = 20
): Promise<{ data: ReporteCajaResponse[]; page: number; limit: number }> {
    return apiClient.get('/v1/caja/historial', { page, limit });
}
