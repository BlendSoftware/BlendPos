// ─────────────────────────────────────────────────────────────────────────────
// Auth API — conecta con POST /v1/auth/login y POST /v1/auth/refresh
// Mapea los DTOs del backend Go exactamente.
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

export interface LoginResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user: UsuarioResponse;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * POST /v1/auth/login
 * Autentica al usuario y retorna tokens JWT.
 */
export async function loginApi(username: string, password: string): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/v1/auth/login', { username, password });
}

/**
 * POST /v1/auth/refresh
 * Renueva el access token usando el refresh token.
 */
export async function refreshApi(refreshToken: string): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/v1/auth/refresh', { refresh_token: refreshToken });
}
