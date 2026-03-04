// ─────────────────────────────────────────────────────────────────────────────
// Ventas API — POST /v1/ventas, DELETE /v1/ventas/:id, POST /v1/ventas/sync-batch
// GET /v1/ventas (listado paginado con filtros)
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';
import type { LocalSale } from '../../offline/db';

// ── Response Types ────────────────────────────────────────────────────────────

export interface ItemVentaResponse {
    producto: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
}

export interface PagoResponse {
    metodo: string;
    monto: number;
}

export interface VentaResponse {
    id: string;
    numero_ticket: number;
    items: ItemVentaResponse[];
    subtotal: number;
    descuento_total: number;
    total: number;
    pagos: PagoResponse[];
    vuelto: number;
    estado: string;
    conflicto_stock: boolean;
    created_at: string;
}

export interface VentaListItem {
    id: string;
    numero_ticket: number;
    sesion_caja_id: string;
    usuario_id: string;
    cajero_nombre: string;
    total: number;
    descuento_total: number;
    subtotal: number;
    estado: string;
    items: ItemVentaResponse[];
    pagos: PagoResponse[];
    created_at: string;
}

export interface VentaListResponse {
    data: VentaListItem[];
    total: number;
    page: number;
    limit: number;
}

export interface VentaFilter {
    fecha?: string;
    /** ISO date string YYYY-MM-DD */
    desde?: string;
    /** ISO date string YYYY-MM-DD */
    hasta?: string;
    estado?: string;
    /** "fecha" | "total" | "numero_ticket" */
    ordenar_por?: string;
    /** "asc" | "desc" */
    orden?: string;
    page?: number;
    limit?: number;
}

// ── Request Types ─────────────────────────────────────────────────────────────

export interface ItemVentaRequest {
    producto_id: string;
    cantidad: number;
    descuento: number;
}

export interface PagoRequest {
    metodo: 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'qr';
    monto: number;
}

export interface RegistrarVentaRequest {
    sesion_caja_id: string;
    items: ItemVentaRequest[];
    pagos: PagoRequest[];
    offline_id?: string;
    /** Optional — when provided the backend emails the PDF receipt to this address. */
    cliente_email?: string;
    /** Fiscal receipt type. Defaults to 'ticket_interno' when omitted. */
    tipo_comprobante?: 'ticket_interno' | 'factura_a' | 'factura_b' | 'factura_c';
    /** 96=DNI, 80=CUIT, 99=ConsumidorFinal */
    tipo_doc_receptor?: number;
    /** CUIT/DNI del receptor. "0" for ConsumidorFinal */
    nro_doc_receptor?: string;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * POST /v1/ventas  (cajero, supervisor, administrador)
 * Registra una venta en transacción ACID. Requiere sesión de caja abierta.
 */
export async function registrarVenta(data: RegistrarVentaRequest): Promise<VentaResponse> {
    return apiClient.post<VentaResponse>('/v1/ventas', data);
}

/**
 * DELETE /v1/ventas/:id  (supervisor, administrador)
 * Anula una venta — genera movimiento inverso de caja, restaura stock.
 */
export async function anularVenta(id: string, motivo: string): Promise<void> {
    return apiClient.delete<void>(`/v1/ventas/${id}`, { motivo });
}

/**
 * POST /v1/ventas/sync-batch  (cajero, supervisor, administrador)
 * Sincroniza ventas creadas offline. El backend deduplica por offline_id.
 */
export async function syncSalesBatch(sales: LocalSale[]): Promise<VentaResponse[]> {
    const ventas: RegistrarVentaRequest[] = sales.map((s) => ({
        sesion_caja_id: s.sesionCajaId ?? '',
        offline_id: s.id,
        cliente_email: s.clienteEmail || undefined,
        items: s.items.map((item) => ({
            producto_id: item.id,
            cantidad: item.cantidad,
            descuento: item.descuento ?? 0,
        })),
        pagos: s.pagos?.map((p) => ({
            metodo: p.metodo as PagoRequest['metodo'],
            monto: p.monto,
        })) ?? [{ metodo: 'efectivo' as const, monto: s.total }],
    }));

    return apiClient.post<VentaResponse[]>('/v1/ventas/sync-batch', { ventas });
}

/**
 * GET /v1/ventas  (cajero, supervisor, administrador)
 * Lista paginada y filtrable de ventas registradas en el backend.
 */
export async function listarVentas(filter: VentaFilter = {}): Promise<VentaListResponse> {
    return apiClient.get<VentaListResponse>('/v1/ventas', {
        fecha: filter.fecha,
        desde: filter.desde,
        hasta: filter.hasta,
        estado: filter.estado,
        ordenar_por: filter.ordenar_por,
        orden: filter.orden,
        page: filter.page ?? 1,
        limit: filter.limit ?? 50,
    });
}

/**
 * Obtiene el último número de ticket del backend para sincronizar el contador local.
 * Consulta las últimas 10 ventas ordenadas por numero_ticket descendente.
 */
export async function getLastTicketNumber(): Promise<number> {
    try {
        const response = await listarVentas({
            ordenar_por: 'numero_ticket',
            orden: 'desc',
            limit: 1,
            estado: 'all',
        });
        
        if (response.data.length > 0) {
            return response.data[0].numero_ticket;
        }
        
        return 0;
    } catch (error) {
        console.warn('Failed to get last ticket number from backend:', error);
        return 0;
    }
}
