import type { LocalSale } from '../../offline/db';
import { apiClient } from '../../api/client';
import { round } from '../../utils/money';

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
 *
 * Reglas de descuento:
 *   - Backend persiste VentaItem.DescuentoItem como MONTO ($), no porcentaje.
 *   - Frontend mantiene descuentos por línea (manual/promo) en % y descuento global en {type,value,amount}.
 *   - Al sincronizar:
 *       1. Aplicamos primero el descuento por línea (%) a cada item → afterPerItem
 *       2. Distribuimos el monto global proporcionalmente a afterPerItem entre líneas
 *       3. El descuento total por ítem = lineTotal - (afterPerItem - shareGlobal)
 *   - Para descuento fijo en $ funciona igual: globalAmount es el monto directo.
 */
function toRegistrarVentaRequest(sale: LocalSale): Record<string, unknown> {
    // Paso 1: subtotal de cada línea con descuento por ítem aplicado
    const lineSubtotals = sale.items.map((item) => {
        const lineTotal = item.precio * item.cantidad;
        const perItemPct =
            Math.max(
                item.descuento ?? 0,
                (item as unknown as { promoDescuento?: number }).promoDescuento ?? 0,
            ) / 100;
        return {
            lineTotal,
            afterPerItem: lineTotal * (1 - perItemPct),
        };
    });
    const totalAfterPerItem = lineSubtotals.reduce((s, l) => s + l.afterPerItem, 0);

    // Paso 2: monto global a distribuir. Preferir globalDiscount canónico; fallback a legacy %.
    let globalAmount = 0;
    if (sale.globalDiscount && sale.globalDiscount.amount > 0) {
        globalAmount = sale.globalDiscount.amount;
    } else if (sale.descuentoGlobal && sale.descuentoGlobal > 0) {
        globalAmount = totalAfterPerItem * (sale.descuentoGlobal / 100);
    }

    // Paso 3: distribuir el global proporcionalmente y armar ítems
    const items = sale.items.map((item, i) => {
        const { lineTotal, afterPerItem } = lineSubtotals[i];
        const share = totalAfterPerItem > 0
            ? globalAmount * (afterPerItem / totalAfterPerItem)
            : 0;
        const effectiveSubtotal = Math.max(0, afterPerItem - share);
        const discountAmount = Math.max(0, lineTotal - effectiveSubtotal);
        return {
            producto_id: item.id,
            cantidad: item.cantidad,
            descuento: round(discountAmount),
            tipo_precio: item.tipoPrecio ?? 'minorista',
            precio_unitario_aplicado: round(item.precio),
        };
    });

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

    // Incluir descuento global tipado (Etapa 4) — backend lo persiste en ventas.discount_*.
    if (sale.globalDiscount && sale.globalDiscount.amount > 0) {
        payload.descuento_global = {
            type: sale.globalDiscount.type,
            value: round(sale.globalDiscount.value),
            amount: round(sale.globalDiscount.amount),
        };
    } else if (sale.descuentoGlobal && sale.descuentoGlobal > 0) {
        // Legacy: ventas viejas sin globalDiscount. Reconstruir como percentage.
        const amount = totalAfterPerItem * (sale.descuentoGlobal / 100);
        payload.descuento_global = {
            type: 'percentage',
            value: sale.descuentoGlobal,
            amount: round(amount),
        };
    }

    // Include customer email if present (RF-21)
    if (sale.clienteEmail && sale.clienteEmail.trim() !== '') {
        payload.cliente_email = sale.clienteEmail.trim();
    }

    // Include fiscal comprobante fields if present
    const tipoComp = sale.tipoComprobante ?? 'ticket_interno';
    payload.tipo_comprobante = tipoComp;
    if (sale.receptorNombre && sale.receptorNombre.trim() !== '') {
        payload.receptor_nombre = sale.receptorNombre.trim();
    }
    if (sale.receptorDomicilio && sale.receptorDomicilio.trim() !== '') {
        payload.receptor_domicilio = sale.receptorDomicilio.trim();
    }
    if (sale.tipoDocReceptor && sale.nroDocReceptor) {
        payload.tipo_doc_receptor = sale.tipoDocReceptor;
        payload.nro_doc_receptor = sale.nroDocReceptor;
    } else if (tipoComp === 'factura_a' && sale.cuitReceptor) {
        payload.tipo_doc_receptor = 80; // CUIT
        payload.nro_doc_receptor = sale.cuitReceptor;
    } else if (tipoComp !== 'ticket_interno') {
        payload.tipo_doc_receptor = 99; // ConsumidorFinal
        payload.nro_doc_receptor = '0';
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
