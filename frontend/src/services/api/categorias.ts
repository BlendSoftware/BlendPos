import { apiClient } from '../../api/client';

export interface CategoriaResponse {
    id: string;
    nombre: string;
    descripcion?: string;
    activo: boolean;
}

export async function listarCategorias(): Promise<CategoriaResponse[]> {
    return apiClient.get<CategoriaResponse[]>('/v1/categorias');
}

export async function crearCategoria(body: { nombre: string; descripcion?: string }): Promise<CategoriaResponse> {
    return apiClient.post<CategoriaResponse>('/v1/categorias', body);
}

export async function actualizarCategoria(
    id: string,
    body: { nombre?: string; descripcion?: string; activo?: boolean },
): Promise<CategoriaResponse> {
    return apiClient.put<CategoriaResponse>(`/v1/categorias/${id}`, body);
}

export async function desactivarCategoria(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/categorias/${id}`);
}
