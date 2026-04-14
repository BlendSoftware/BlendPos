// ─────────────────────────────────────────────────────────────────────────────
// Listas de Precios API — mapea los DTOs del backend Go.
// CRUD + aplicación masiva + descarga PDF
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';
import { tokenStore } from '../../store/tokenStore';

const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';

// ── Response Types ────────────────────────────────────────────────────────────

export interface ListaPreciosResponse {
    id: string;
    nombre: string;
    logo_url: string | null;
    cantidad_productos: number;
    created_at: string;
    updated_at: string;
}

export interface ListaPreciosProductoResponse {
    id: string;
    producto_id: string;
    producto_nombre: string;
    producto_barcode: string;
    precio_venta: number;
    descuento_porcentaje: number;
    precio_final: number;
}

export interface ListaPreciosDetalleResponse {
    id: string;
    nombre: string;
    logo_url: string | null;
    productos: ListaPreciosProductoResponse[];
    created_at: string;
    updated_at: string;
}

export interface ListaPreciosListResponse {
    data: ListaPreciosResponse[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

// ── Request Types ─────────────────────────────────────────────────────────────

export interface CrearListaPreciosRequest {
    nombre: string;
    logo_url?: string;
}

export interface ActualizarListaPreciosRequest {
    nombre?: string;
    logo_url?: string;
}

export interface AsignarProductoRequest {
    producto_id: string;
    descuento_porcentaje: number;
}

export interface AplicarMasivoRequest {
    descuento_porcentaje: number;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

export async function listarListasPrecios(
    params: { nombre?: string; page?: number; limit?: number } = {}
): Promise<ListaPreciosListResponse> {
    return apiClient.get<ListaPreciosListResponse>('/v1/listas-precios', {
        nombre: params.nombre,
        page: params.page ?? 1,
        limit: params.limit ?? 20,
    });
}

export async function obtenerListaPrecios(id: string): Promise<ListaPreciosDetalleResponse> {
    return apiClient.get<ListaPreciosDetalleResponse>(`/v1/listas-precios/${id}`);
}

export async function crearListaPrecios(data: CrearListaPreciosRequest): Promise<ListaPreciosResponse> {
    return apiClient.post<ListaPreciosResponse>('/v1/listas-precios', data);
}

export async function actualizarListaPrecios(
    id: string,
    data: ActualizarListaPreciosRequest
): Promise<ListaPreciosResponse> {
    return apiClient.put<ListaPreciosResponse>(`/v1/listas-precios/${id}`, data);
}

export async function eliminarListaPrecios(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/listas-precios/${id}`);
}

export async function asignarProducto(
    listaId: string,
    data: AsignarProductoRequest
): Promise<ListaPreciosProductoResponse> {
    return apiClient.post<ListaPreciosProductoResponse>(
        `/v1/listas-precios/${listaId}/productos`,
        data
    );
}

export async function quitarProducto(listaId: string, productoId: string): Promise<void> {
    return apiClient.delete<void>(`/v1/listas-precios/${listaId}/productos/${productoId}`);
}

export async function aplicarMasivo(
    listaId: string,
    data: AplicarMasivoRequest
): Promise<ListaPreciosDetalleResponse> {
    return apiClient.post<ListaPreciosDetalleResponse>(
        `/v1/listas-precios/${listaId}/aplicar-masivo`,
        data
    );
}

export async function descargarPDFListaPrecios(listaId: string, nombreLista: string): Promise<void> {
    const token = tokenStore.getAccessToken();
    const url = `${BASE_URL}/v1/listas-precios/${listaId}/pdf`;
    const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resp.ok) throw new Error(`PDF no disponible: ${resp.status}`);

    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `lista_precios_${nombreLista.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
}
