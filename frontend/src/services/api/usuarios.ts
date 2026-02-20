// ─────────────────────────────────────────────────────────────────────────────
// Usuarios API — gestión de usuarios y roles.
// GET    /v1/usuarios     → UsuarioResponse[]
// POST   /v1/usuarios     → UsuarioResponse
// PUT    /v1/usuarios/:id → UsuarioResponse
// DELETE /v1/usuarios/:id → 204
// ─────────────────────────────────────────────────────────────────────────────

import { apiClient } from '../../api/client';

// ── Response Types ────────────────────────────────────────────────────────────

export interface UsuarioResponse {
    id: string;
    username: string;
    nombre: string;
    rol: 'cajero' | 'supervisor' | 'administrador';
    punto_de_venta: number | null;
}

// ── Request Types ─────────────────────────────────────────────────────────────

export interface CrearUsuarioRequest {
    username: string;
    nombre: string;
    email?: string;
    password: string;
    rol: 'cajero' | 'supervisor' | 'administrador';
    punto_de_venta?: number;
}

export interface ActualizarUsuarioRequest {
    nombre?: string;
    email?: string;
    rol?: 'cajero' | 'supervisor' | 'administrador';
    punto_de_venta?: number;
    password?: string;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/** GET /v1/usuarios  (administrador) */
export async function listarUsuarios(): Promise<UsuarioResponse[]> {
    return apiClient.get<UsuarioResponse[]>('/v1/usuarios');
}

/** POST /v1/usuarios  (administrador) */
export async function crearUsuario(data: CrearUsuarioRequest): Promise<UsuarioResponse> {
    return apiClient.post<UsuarioResponse>('/v1/usuarios', data);
}

/** PUT /v1/usuarios/:id  (administrador) */
export async function actualizarUsuario(id: string, data: ActualizarUsuarioRequest): Promise<UsuarioResponse> {
    return apiClient.put<UsuarioResponse>(`/v1/usuarios/${id}`, data);
}

/** DELETE /v1/usuarios/:id  (administrador) — soft delete */
export async function desactivarUsuario(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/usuarios/${id}`);
}
