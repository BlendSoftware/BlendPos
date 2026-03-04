import type { LocalSale } from '../../offline/db';
import { apiClient } from '../../api/client';

/**
 * Result returned by the backend for each individual sale in a sync-batch.
 */
export interface SyncSaleResult {
    id?: string;
    numero_ticket?: number;
    estado: string;
    conflicto_stock?: boolean;
    /** Echoes the offline_id sent in the request so the client can correlate
     *  results by ID rather than by array position (P2-005). */
    offline_id?: string;
}

/**
 * Transforma una LocalSale (formato frontend) a RegistrarVentaRequest (formato backend).
 * Asegura que items, pagos y campos clave estén en el schema correcto.
 */
function toRegistrarVentaRequest(sale: LocalSale): Record<string, unknown> {
    // Transformar CartItem[] → ItemVentaRequest[]
    const items = sale.items.map((item) => ({
        producto_id: item.id,
        cantidad: item.cantidad,
        descuento: (() => {
            const pct = Math.max(item.descuento, (item as unknown as { promoDescuento?: number }).promoDescuento ?? 0);
            return pct > 0 ? +(item.cantidad * item.precio * pct / 100).toFixed(2) : 0;
        })(),
    }));

    // Construir pagos: usar sale.pagos si existe, sino construir desde metodoPago + total
    let pagos: { metodo: string; monto: number }[];
    if (sale.pagos && sale.pagos.length > 0) {
        pagos = sale.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto }));
    } else {
        // Fallback para ventas legacy sin pagos array
        const monto = sale.totalConDescuento ?? sale.total;
        pagos = [{ metodo: sale.metodoPago === 'mixto' ? 'efectivo' : sale.metodoPago, monto }];
    }

    const payload: Record<string, unknown> = {
        sesion_caja_id: sale.sesionCajaId ?? '',
        items,
        pagos,
        offline_id: sale.id,
    };

    // Include customer email if present (RF-21)
    if (sale.clienteEmail && sale.clienteEmail.trim() !== '') {
        payload.cliente_email = sale.clienteEmail.trim();
    }

    return payload;
}

/**
 * Sends a batch of local sales to the backend for sync.
 * Returns per-sale results so the caller can determine which sales
 * were accepted and which were rejected.
 */
export async function syncSalesBatch(sales: LocalSale[]): Promise<SyncSaleResult[]> {
    const ventas = sales.map(toRegistrarVentaRequest);
    const resp = await apiClient.post<SyncSaleResult[]>('/v1/ventas/sync-batch', { ventas });
    return resp;
}
