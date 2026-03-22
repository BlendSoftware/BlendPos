// ─────────────────────────────────────────────────────────────────────────────
// Promociones API — discounts applied to specific products
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TipoPromocion = 'porcentaje' | 'monto_fijo' | 'precio_fijo_combo';
export type ModoPromocion = 'clasico' | 'grupos';
export type TipoSeleccion = 'productos' | 'categoria';
export type EstadoPromocion = 'activa' | 'pendiente' | 'vencida';

export interface PromocionProducto {
    id: string;
    nombre: string;
    precio_venta: number;
}

export interface PromocionGrupoResponse {
    id: string;
    nombre: string;
    orden: number;
    cantidad_requerida: number;
    tipo_seleccion: TipoSeleccion;
    categoria_id?: string;
    categoria_nombre?: string;
    productos: PromocionProducto[];
}

export interface PromocionGrupoRequest {
    nombre: string;
    orden: number;
    cantidad_requerida: number;
    tipo_seleccion: TipoSeleccion;
    categoria_id?: string;
    producto_ids: string[];
}

export interface PromocionResponse {
    id: string;
    nombre: string;
    descripcion?: string;
    tipo: TipoPromocion;
    valor: number;
    modo: ModoPromocion;
    /** For single-product quantity promos (e.g. 2x1): minimum units needed. Default 1. */
    cantidad_requerida: number;
    fecha_inicio: string;
    fecha_fin: string;
    activa: boolean;
    estado: EstadoPromocion;
    productos: PromocionProducto[];
    grupos?: PromocionGrupoResponse[];
    created_at: string;
}

export interface CrearPromocionRequest {
    nombre: string;
    descripcion?: string;
    tipo: TipoPromocion;
    valor: number;
    modo: ModoPromocion;
    /** Minimum units for a single-product quantity promo (e.g. 2 for 2x1). Default 1. */
    cantidad_requerida: number;
    fecha_inicio: string; // "YYYY-MM-DD"
    fecha_fin: string;    // "YYYY-MM-DD"
    producto_ids: string[];
    grupos?: PromocionGrupoRequest[];
}

export interface ActualizarPromocionRequest extends CrearPromocionRequest {
    activa: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const TIPO_OPTIONS = [
    { value: 'porcentaje',        label: 'Porcentaje (%)'           },
    { value: 'monto_fijo',        label: 'Monto fijo ($)'           },
    { value: 'precio_fijo_combo', label: 'Precio fijo del combo ($)' },
];

// ── API Functions ─────────────────────────────────────────────────────────────

export function listarPromociones(soloActivas?: boolean): Promise<PromocionResponse[]> {
    return apiClient.get<PromocionResponse[]>('/v1/promociones', soloActivas ? { activas: 'true' } : undefined);
}

export function obtenerPromocion(id: string): Promise<PromocionResponse> {
    return apiClient.get<PromocionResponse>(`/v1/promociones/${id}`);
}

export function crearPromocion(data: CrearPromocionRequest): Promise<PromocionResponse> {
    return apiClient.post<PromocionResponse>('/v1/promociones', data);
}

export function actualizarPromocion(id: string, data: ActualizarPromocionRequest): Promise<PromocionResponse> {
    return apiClient.put<PromocionResponse>(`/v1/promociones/${id}`, data);
}

export function eliminarPromocion(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/promociones/${id}`);
}
