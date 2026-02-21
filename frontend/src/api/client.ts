// ─────────────────────────────────────────────────────────────────────────────
// API Client — BlendPOS
// Cliente HTTP centralizado. Cuando el backend Go esté disponible,
// configurar VITE_API_URL en .env y reemplazar las funciones mock de
// cada módulo por llamadas a apiClient.get/post/put/delete.
// ─────────────────────────────────────────────────────────────────────────────

// VITE_API_BASE debe apuntar al backend Go, SIN path final (ej: http://localhost:8000)
const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';


// Lee el token JWT del store persistido en localStorage sin importar Zustand
function getToken(): string | null {
    try {
        const raw = localStorage.getItem('blendpos-auth');
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { state?: { token?: string } };
        return parsed?.state?.token ?? null;
    } catch {
        return null;
    }
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
        // Solo redirigir si había un token (sesión expirada), no si era anónimo.
        // Evita el loop: llamada sin token → 401 → reload → 401 → ...
        if (token) {
            localStorage.removeItem('blendpos-auth');
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
