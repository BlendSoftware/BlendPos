export class ApiError extends Error {
    status: number;
    body?: unknown;

    constructor(message: string, status: number, body?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

const baseUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });

    const text = await res.text();
    const body = text ? safeJsonParse(text) : undefined;

    if (!res.ok) {
        throw new ApiError(`HTTP ${res.status} for ${path}`, res.status, body);
    }

    return body as T;
}

export async function apiPostJson<T>(path: string, data: unknown, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
        method: 'POST',
        body: JSON.stringify(data),
        ...init,
    });
}

function safeJsonParse(input: string): unknown {
    try {
        return JSON.parse(input);
    } catch {
        return input;
    }
}
