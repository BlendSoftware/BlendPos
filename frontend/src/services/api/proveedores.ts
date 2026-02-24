// ─────────────────────────────────────────────────────────────────────────────
// Proveedores API — CRUD, actualización masiva de precios, import CSV.
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Response Types ────────────────────────────────────────────────────────────

export interface ContactoProveedorResponse {
    id: string;
    nombre: string;
    cargo?: string;
    telefono?: string;
    email?: string;
}

export interface ProveedorResponse {
    id: string;
    razon_social: string;
    cuit: string;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    condicion_pago: string | null;
    activo: boolean;
    contactos: ContactoProveedorResponse[];
}

export interface PrecioPreviewItem {
    producto_id: string;
    nombre: string;
    precio_costo_actual: number;
    precio_costo_nuevo: number;
    precio_venta_actual: number;
    precio_venta_nuevo: number;
    diferencia_costo: number;
    margen_nuevo: number;
}

export interface ActualizacionMasivaResponse {
    proveedor: string;
    porcentaje: number;
    productos_afectados: number;
    preview?: PrecioPreviewItem[];
}

export interface CSVErrorRow {
    fila: number;
    codigo_barras?: string;
    nombre?: string;
    error_code: string; // BARCODE_MISSING|BARCODE_DUPLICATE|PRICE_NOT_NUMBER|PRICE_NEGATIVE|NAME_MISSING|ROW_FORMAT|READ_ERROR
    motivo: string;
}

export interface CSVImportResponse {
    total_filas: number;
    procesadas: number;
    errores: number;
    creadas: number;
    actualizadas: number;
    detalle_errores: CSVErrorRow[];
}

// ── Request Types ─────────────────────────────────────────────────────────────

export interface CrearProveedorRequest {
    razon_social: string;
    cuit: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    condicion_pago?: string;
}

export interface ActualizarPreciosMasivoRequest {
    porcentaje: number;
    recalcular_venta: boolean;
    margen_default: number;
    preview: boolean;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/** GET /v1/proveedores */
export async function listarProveedores(): Promise<ProveedorResponse[]> {
    return apiClient.get<ProveedorResponse[]>('/v1/proveedores');
}

/** GET /v1/proveedores/:id */
export async function getProveedor(id: string): Promise<ProveedorResponse> {
    return apiClient.get<ProveedorResponse>(`/v1/proveedores/${id}`);
}

/** POST /v1/proveedores */
export async function crearProveedor(data: CrearProveedorRequest): Promise<ProveedorResponse> {
    return apiClient.post<ProveedorResponse>('/v1/proveedores', data);
}

/** PUT /v1/proveedores/:id */
export async function actualizarProveedor(id: string, data: CrearProveedorRequest): Promise<ProveedorResponse> {
    return apiClient.put<ProveedorResponse>(`/v1/proveedores/${id}`, data);
}

/** DELETE /v1/proveedores/:id — soft delete */
export async function eliminarProveedor(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/proveedores/${id}`);
}

/**
 * POST /v1/proveedores/:id/precios/masivo
 * Con preview=true retorna lista de precios actuales/nuevos sin aplicar cambios.
 * Con preview=false aplica los cambios.
 */
export async function actualizarPreciosMasivo(
    id: string,
    data: ActualizarPreciosMasivoRequest,
): Promise<ActualizacionMasivaResponse> {
    return apiClient.post<ActualizacionMasivaResponse>(
        `/v1/proveedores/${id}/precios/masivo`,
        data,
    );
}

/**
 * POST /v1/csv/import  (multipart/form-data)
 * Importa productos desde CSV — upsert por código de barras.
 */
export async function importarCSV(
    proveedorId: string,
    file: File,
): Promise<CSVImportResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('proveedor_id', proveedorId);

    // Usamos fetch directo porque apiClient serializa a JSON
    const raw = localStorage.getItem('blendpos-auth');
    const token: string | null = raw
        ? ((JSON.parse(raw) as { state?: { token?: string } }).state?.token ?? null)
        : null;

    const baseUrl = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';
    const resp = await fetch(`${baseUrl}/v1/csv/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
    });

    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`CSV import failed ${resp.status}: ${txt}`);
    }
    return resp.json() as Promise<CSVImportResponse>;
}
