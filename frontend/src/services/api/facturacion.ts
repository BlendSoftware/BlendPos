// ─────────────────────────────────────────────────────────────────────────────
// Facturación API — comprobantes y PDFs.
// GET /v1/facturacion/:venta_id → FacturacionResponse
// GET /v1/facturacion/pdf/:id  → blob descarga
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';
import { tokenStore } from '../../store/tokenStore';

// ── Response Types ────────────────────────────────────────────────────────────

export interface FacturacionResponse {
    id: string;
    tipo: string;
    numero: number | null;
    punto_de_venta: number;
    cae: string | null;
    cae_vencimiento: string | null;
    receptor_cuit: string | null;
    receptor_nombre: string | null;
    monto_neto: number;
    monto_iva: number;
    monto_total: number;
    estado: 'pendiente' | 'emitido' | 'error' | 'rechazado';
    pdf_url: string | null;
    created_at: string;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * GET /v1/facturacion/:venta_id  (administrador, supervisor)
 * Obtiene el comprobante asociado a una venta.
 */
export async function getComprobante(ventaId: string): Promise<FacturacionResponse> {
    return apiClient.get<FacturacionResponse>(`/v1/facturacion/${ventaId}`);
}

/**
 * GET /v1/facturacion/pdf/:id  (administrador, supervisor)
 * Retorna la URL pública del PDF. Para descarga directa se usa un <a href> con esa URL.
 */
export function getPDFUrl(comprobanteId: string): string {
    const baseUrl = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';
    return `${baseUrl}/v1/facturacion/pdf/${comprobanteId}`;
}

/**
 * Obtiene el HTML autocontenido de la factura fiscal.
 * Usar esta función cuando se necesita abrir la ventana ANTES del fetch
 * (evita que el popup blocker la bloquee al estar dentro de un async handler).
 */
export async function fetchFacturaHTML(comprobanteId: string): Promise<string> {
    const token = tokenStore.getAccessToken();
    const baseUrl = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';
    const url = `${baseUrl}/v1/facturacion/html/${comprobanteId}`;
    const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`Factura HTML no disponible: ${resp.status}`);
    return resp.text();
}

/**
 * Abre la factura HTML en una nueva pestaña del navegador.
 * El HTML es autocontenido (logo + barcode en base64) y tiene un botón "Imprimir / Guardar como PDF".
 * @param comprobanteId - ID del comprobante
 * @param autoPrint - Si es true, el HTML abrirá automáticamente el diálogo de impresión
 * @param esCopia - Si es true, muestra "DUPLICADO" en lugar de "ORIGINAL"
 */
export async function abrirFacturaHTML(comprobanteId: string, autoPrint = false, esCopia = false): Promise<void> {
    const token = tokenStore.getAccessToken();
    const baseUrl = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';
    const params = new URLSearchParams();
    if (autoPrint) params.set('autoprint', 'true');
    if (esCopia) params.set('copia', 'true');
    const queryParam = params.toString() ? `?${params.toString()}` : '';
    const url = `${baseUrl}/v1/facturacion/html/${comprobanteId}${queryParam}`;

    const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resp.ok) throw new Error(`Factura HTML no disponible: ${resp.status}`);

    const html = await resp.text();
    const blob = new Blob([html], { type: 'text/html' });
    const objectUrl = URL.createObjectURL(blob);
    const win = window.open(objectUrl, '_blank');
    // Revoke después de que la ventana cargue; 30s es suficiente.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    if (!win) throw new Error('El navegador bloqueó la ventana emergente. Permití las ventanas emergentes para este sitio.');
}

/**
 * Descarga el PDF del comprobante en el navegador.
 */
export async function descargarPDF(comprobanteId: string, nombreArchivo?: string): Promise<void> {
    const token = tokenStore.getAccessToken();

    const url = getPDFUrl(comprobanteId);
    const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resp.ok) throw new Error(`PDF no disponible: ${resp.status}`);

    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = nombreArchivo ?? `comprobante_${comprobanteId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
}

/**
 * POST /v1/facturacion/:id/regen-pdf
 * Regenera el PDF fiscal del comprobante en disco (solo comprobantes con CAE).
 */
export async function regenerarPDF(comprobanteId: string): Promise<void> {
    await apiClient.post(`/v1/facturacion/${comprobanteId}/regen-pdf`, {});
}

/**
 * POST /v1/facturacion/:id/enviar-email
 * Envía el comprobante por email a la dirección indicada.
 */
export async function enviarEmailComprobante(comprobanteId: string, email: string): Promise<{ message: string; email: string }> {
    return apiClient.post<{ message: string; email: string }>(`/v1/facturacion/${comprobanteId}/enviar-email`, { email });
}
