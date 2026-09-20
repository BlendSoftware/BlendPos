import { describe, it, expect, beforeEach, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../../../api/client', () => ({
    apiClient: {
        get: (...args: unknown[]) => getMock(...args),
    },
}));

import { listarTodosLosProductos, PAGE_SIZE_CATALOGO } from '../products';
import type { ProductoResponse } from '../products';

function fakeProducto(n: number): ProductoResponse {
    return {
        id: `id-${n}`,
        codigo_barras: String(7790000000000 + n),
        nombre: `PRODUCTO ${String(n).padStart(4, '0')}`,
        activo: true,
    } as ProductoResponse;
}

/** Responde como el backend: ordenado, paginado, con el total real. */
function backendCon(total: number) {
    const todos = Array.from({ length: total }, (_, i) => fakeProducto(i + 1));
    return (_path: string, params: { page: number; limit: number }) => {
        const offset = (params.page - 1) * params.limit;
        return Promise.resolve({
            data: todos.slice(offset, offset + params.limit),
            total,
            page: params.page,
            limit: params.limit,
            total_pages: Math.ceil(total / params.limit),
        });
    };
}

beforeEach(() => {
    getMock.mockReset();
});

describe('listarTodosLosProductos', () => {
    it('trae el catálogo completo cuando supera el tamaño de página', async () => {
        // 536 = el catálogo real de producción el día del bug.
        getMock.mockImplementation(backendCon(536));

        const productos = await listarTodosLosProductos();

        expect(productos).toHaveLength(536);
        expect(productos[535].nombre).toBe('PRODUCTO 0536');
    });

    it('no pierde ningún producto ni lo duplica', async () => {
        getMock.mockImplementation(backendCon(1234));

        const productos = await listarTodosLosProductos();
        const ids = new Set(productos.map((p) => p.id));

        expect(productos).toHaveLength(1234);
        expect(ids.size).toBe(1234);
    });

    it('hace una sola request cuando el catálogo entra en una página', async () => {
        getMock.mockImplementation(backendCon(10));

        const productos = await listarTodosLosProductos();

        expect(productos).toHaveLength(10);
        expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('propaga los filtros a todas las páginas', async () => {
        getMock.mockImplementation(backendCon(PAGE_SIZE_CATALOGO + 5));

        await listarTodosLosProductos({ activo: 'all' });

        expect(getMock.mock.calls.length).toBeGreaterThan(1);
        for (const [, params] of getMock.mock.calls) {
            expect((params as { activo?: string }).activo).toBe('all');
        }
    });

    it('corta y avisa si el backend nunca deja de devolver páginas llenas', async () => {
        // Backend defectuoso: ignora `page` y siempre devuelve una página llena.
        getMock.mockImplementation((_path: string, params: { limit: number }) =>
            Promise.resolve({
                data: Array.from({ length: params.limit }, (_, i) => fakeProducto(i)),
                total: Number.MAX_SAFE_INTEGER,
                page: 1,
                limit: params.limit,
                total_pages: 1,
            }),
        );
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

        await listarTodosLosProductos();

        expect(getMock.mock.calls.length).toBeLessThanOrEqual(50);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
