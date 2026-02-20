// ─────────────────────────────────────────────────────────────────────────────
// Facturación API — comprobantes y PDFs.
// GET /v1/facturacion/:venta_id → FacturacionResponse
// GET /v1/facturacion/pdf/:id  → blob descarga
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

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
    estado: 'pendiente' | 'emitido' | 'error';
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
    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080';
    return `${baseUrl}/v1/facturacion/pdf/${comprobanteId}`;
}

/**
 * Descarga el PDF del comprobante en el navegador.
 */
export async function descargarPDF(comprobanteId: string, nombreArchivo?: string): Promise<void> {
    const raw = localStorage.getItem('blendpos-auth');
    const token: string | null = raw
        ? ((JSON.parse(raw) as { state?: { token?: string } }).state?.token ?? null)
        : null;

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
