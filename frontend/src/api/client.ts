// ─────────────────────────────────────────────────────────────────────────────
// API Client — BlendPOS
// Cliente HTTP centralizado. Cuando el backend Go esté disponible,
// configurar VITE_API_URL en .env y reemplazar las funciones mock de
// cada módulo por llamadas a apiClient.get/post/put/delete.
// ─────────────────────────────────────────────────────────────────────────────

import { tokenStore } from '../store/tokenStore';

// VITE_API_BASE debe apuntar al backend Go, SIN path final (ej: http://localhost:8000)
const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';


// Read the JWT access token from the in-memory store (P1-003).
// Tokens are never written to localStorage — this function can only return
// a value if the user has logged in during the current page session.
function getToken(): string | null {
    return tokenStore.getAccessToken();
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

async function request<T>(
    path: string,
    options: RequestInit & { params?: QueryParams } = {}
): Promise<T> {
    const { params, ...init } = options;

    let url = `${BASE_URL}${path}`;
    if (params) {
        const search = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) search.set(k, String(v));
        }
        const q = search.toString();
        if (q) url += `?${q}`;
    }

    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined ?? {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, { ...init, headers });

    if (response.status === 401) {
        // Only redirect if there was a token (expired session), not on anonymous calls.
        // Avoid the loop: unauthenticated call → 401 → reload → 401 → ...
        if (token) {
            tokenStore.clearTokens();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        throw new Error('Sesión expirada o no autorizado.');
    }

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${response.statusText}: ${body}`);
    }

    // 204 No Content
    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
}

export const apiClient = {
    get: <T>(path: string, params?: QueryParams) =>
        request<T>(path, { method: 'GET', params }),

    post: <T>(path: string, body: unknown) =>
        request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

    put: <T>(path: string, body: unknown) =>
        request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

    patch: <T>(path: string, body: unknown) =>
        request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

    delete: <T>(path: string, body?: unknown) =>
        request<T>(path, {
            method: 'DELETE',
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
};
