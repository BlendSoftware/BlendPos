import { useAuthStore } from '../../store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_BASE as string;

export interface CategoriaResponse {
    id: string;
    nombre: string;
    descripcion?: string;
    activo: boolean;
}

function authHeaders(): HeadersInit {
    const token = useAuthStore.getState().token;
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function listarCategorias(): Promise<CategoriaResponse[]> {
    const res = await fetch(`${API_BASE}/v1/categorias`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Error al cargar categorías');
    return res.json();
}

export async function crearCategoria(body: { nombre: string; descripcion?: string }): Promise<CategoriaResponse> {
    const res = await fetch(`${API_BASE}/v1/categorias`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Error al crear categoría');
    }
    return res.json();
}

export async function actualizarCategoria(
    id: string,
    body: { nombre?: string; descripcion?: string; activo?: boolean },
): Promise<CategoriaResponse> {
    const res = await fetch(`${API_BASE}/v1/categorias/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Error al actualizar categoría');
    }
    return res.json();
}

export async function desactivarCategoria(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/v1/categorias/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Error al eliminar categoría');
    }
}
