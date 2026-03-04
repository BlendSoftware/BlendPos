// ─────────────────────────────────────────────────────────────────────────────
// Compras API — purchase orders (facturas de proveedor)
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Request Types ─────────────────────────────────────────────────────────────

export interface CompraItemRequest {
    producto_id?: string;
    nombre_producto: string;
    precio: number;
    descuento_pct: number;
    impuesto_pct: number;
    cantidad: number;
    observaciones?: string;
}

export type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta_debito' | 'tarjeta_credito' | 'cuenta_corriente' | 'otro';

export interface PagoCompraRequest {
    metodo: MetodoPago;
    monto: number;
    referencia?: string;
}

export interface PagoCompraResponse {
    id: string;
    metodo: MetodoPago;
    monto: number;
    referencia?: string;
    created_at: string;
}

export interface CrearCompraRequest {
    numero?: string;
    proveedor_id: string;
    fecha_compra: string;       // "YYYY-MM-DD"
    fecha_vencimiento?: string; // "YYYY-MM-DD"
    moneda?: string;
    deposito?: string;
    notas?: string;
    items: CompraItemRequest[];
    pagos?: PagoCompraRequest[];
}

export interface ActualizarEstadoRequest {
    estado: 'pendiente' | 'pagada' | 'anulada';
}

// ── Response Types ────────────────────────────────────────────────────────────

export interface CompraItemResponse {
    id: string;
    producto_id?: string;
    nombre_producto: string;
    precio: number;
    descuento_pct: number;
    impuesto_pct: number;
    cantidad: number;
    observaciones?: string;
    total: number;
}

export interface CompraResponse {
    id: string;
    numero?: string;
    proveedor_id: string;
    nombre_proveedor: string;
    fecha_compra: string;
    fecha_vencimiento?: string;
    moneda: string;
    deposito: string;
    notas?: string;
    subtotal: number;
    descuento_total: number;
    total: number;
    estado: 'pendiente' | 'pagada' | 'anulada';
    items: CompraItemResponse[];
    pagos: PagoCompraResponse[];
    created_at: string;
}

export interface CompraListResponse {
    data: CompraResponse[];
    total: number;
    page: number;
    limit: number;
}

// ── API Functions ─────────────────────────────────────────────────────────────

export function listarCompras(opts?: {
    estado?: string;
    proveedor_id?: string;
    page?: number;
    limit?: number;
}): Promise<CompraListResponse> {
    return apiClient.get<CompraListResponse>('/v1/compras', {
        estado:       opts?.estado,
        proveedor_id: opts?.proveedor_id,
        page:         opts?.page,
        limit:        opts?.limit,
    });
}

export function crearCompra(data: CrearCompraRequest): Promise<CompraResponse> {
    return apiClient.post<CompraResponse>('/v1/compras', data);
}

export function obtenerCompra(id: string): Promise<CompraResponse> {
    return apiClient.get<CompraResponse>(`/v1/compras/${id}`);
}

export function actualizarEstadoCompra(id: string, estado: ActualizarEstadoRequest['estado']): Promise<CompraResponse> {
    return apiClient.patch<CompraResponse>(`/v1/compras/${id}/estado`, { estado });
}

export function eliminarCompra(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/compras/${id}`);
}
