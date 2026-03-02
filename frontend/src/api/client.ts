// ─────────────────────────────────────────────────────────────────────────────
// API Client — BlendPOS
// Cliente HTTP centralizado. Cuando el backend Go esté disponible,
// configurar VITE_API_URL en .env y reemplazar las funciones mock de
// cada módulo por llamadas a apiClient.get/post/put/delete.
// ─────────────────────────────────────────────────────────────────────────────

import { tokenStore } from '../store/tokenStore';

// VITE_API_BASE debe apuntar al backend Go, SIN path final (ej: http://localhost:8000)
const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';

// ── Auto-refresh shared state (B-03) ────────────────────────────────────────
// Prevents multiple concurrent refresh attempts when several requests
// receive 401 at the same time.
let _refreshPromise: Promise<string> | null = null;

/**
 * Attempts to obtain a new access token using the stored refresh token.
 * Only ONE refresh request is in-flight at any time; concurrent callers
 * share the same promise.
 */
async function refreshAccessToken(): Promise<string> {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
        const refreshToken = tokenStore.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token available');

        const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) throw new Error('Refresh failed');

        const data = (await res.json()) as {
            access_token: string;
            refresh_token: string;
        };
        tokenStore.setTokens(data.access_token, data.refresh_token);

        // Schedule proactive refresh before new access token expires.
        scheduleProactiveRefresh(data.access_token);

        return data.access_token;
    })();

    try {
        return await _refreshPromise;
    } finally {
        _refreshPromise = null;
    }
}

// ── Proactive refresh timer (B-03 Option B) ─────────────────────────────────
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Decodes the JWT payload (without verifying signature — that's the
 * backend's job) and schedules a silent refresh 60 s before expiry.
 */
export function scheduleProactiveRefresh(accessToken: string): void {
    if (_refreshTimer) clearTimeout(_refreshTimer);

    try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const exp = (payload.exp as number) * 1000; // ms
        const msUntilRefresh = exp - Date.now() - 60_000; // 60 s before

        if (msUntilRefresh <= 0) return; // already very close; reactive path will handle it

        _refreshTimer = setTimeout(() => {
            refreshAccessToken().catch(() => {
                // Proactive refresh failed — will be retried reactively on next 401.
            });
        }, msUntilRefresh);
    } catch {
        // Malformed token — ignore; reactive path will handle it.
    }
}

/** Cancel any pending proactive refresh (call on logout). */
export function cancelProactiveRefresh(): void {
    if (_refreshTimer) {
        clearTimeout(_refreshTimer);
        _refreshTimer = null;
    }
}

// Read the JWT access token from the in-memory store (P1-003).
// Tokens are never written to localStorage — this function can only return
// a value if the user has logged in during the current page session.
function getToken(): string | null {
    return tokenStore.getAccessToken();
}

type QueryParams = Record<string, string | number | boolean | undefined | null>;

async function request<T>(
    path: string,
    options: RequestInit & { params?: QueryParams } = {},
    _isRetry = false,
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
        // ── B-03: Try silent refresh before giving up ────────────────────
        // Only attempt refresh if we had a token (session expired) and this
        // isn't already a retry (prevents infinite loop).
        if (token && !_isRetry) {
            try {
                await refreshAccessToken();
                // Retry the original request with the fresh token.
                return request<T>(path, options, true);
            } catch {
                // Refresh failed — session truly expired.
            }
        }

        // Redirect to login only if there was a token and we're not already there.
        if (token) {
            cancelProactiveRefresh();
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
