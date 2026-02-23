// ─────────────────────────────────────────────────────────────────────────────
// useCajaStore — gestiona el ciclo de vida de la sesión de caja activa.
//
// La sesión de caja es REQUERIDA para registrar ventas (RF-05).
// El store persiste la sesión activa en localStorage para sobrevivir recargas.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    abrirCaja,
    cerrarCajaArqueo,
    getCajaActiva,
    getReporteCaja,
    registrarMovimiento,
    type AbrirCajaRequest,
    type ArqueoRequest,
    type MovimientoManualRequest,
    type ReporteCajaResponse,
    type ArqueoResponse,
} from '../services/api/caja';

// ── State Interface ───────────────────────────────────────────────────────────

interface CajaState {
    /** ID de la sesión de caja activa (UUID del backend). */
    sesionId: string | null;
    /** Punto de venta de la sesión activa. */
    puntoDeVenta: number | null;
    /** Estado de la caja. */
    estado: 'abierta' | 'cerrada' | null;
    /** Monto inicial declarado al abrir. */
    montoInicial: number | null;
    /** Timestamp de apertura. */
    abiertaEn: string | null;
    /** Usuario propietario de la sesión. */
    usuarioNombre: string | null;
    /** Indica si hay una operación en curso (loading). */
    loading: boolean;
    /** Último error ocurrido. */
    error: string | null;

    // ── Actions ───────────────────────────────────────────────────────────────

    /** Abre una nueva sesión de caja. Requiere autenticación. */
    abrir: (data: AbrirCajaRequest) => Promise<ReporteCajaResponse>;

    /** Registra arqueo ciego y cierra la sesión. */
    cerrar: (data: ArqueoRequest) => Promise<ArqueoResponse>;

    /** Registra un ingreso o egreso manual en la caja activa. */
    movimiento: (data: MovimientoManualRequest) => Promise<void>;

    /** Recarga el reporte de la sesión activa desde el backend. */
    recargarReporte: () => Promise<ReporteCajaResponse | null>;

    /** Limpia la sesión del store (sin llamar al backend). */
    limpiar: () => void;

    /**
     * Restaura la sesión de caja desde el backend.
     * Si el backend confirma que hay una sesión activa, sincroniza el estado local.
     * Si no hay sesión activa, limpia cualquier estado obsoleto del localStorage.
     */
    restaurar: () => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCajaStore = create<CajaState>()(
    persist(
        (set, get) => ({
            sesionId: null,
            puntoDeVenta: null,
            estado: null,
            montoInicial: null,
            abiertaEn: null,
            usuarioNombre: null,
            loading: false,
            error: null,

            abrir: async (data) => {
                set({ loading: true, error: null });
                try {
                    const reporte = await abrirCaja(data);
                    set({
                        sesionId: reporte.sesion_caja_id,
                        puntoDeVenta: reporte.punto_de_venta,
                        estado: 'abierta',
                        montoInicial: reporte.monto_inicial,
                        abiertaEn: reporte.opened_at,
                        usuarioNombre: reporte.usuario,
                        loading: false,
                    });
                    return reporte;
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Error al abrir la caja';
                    set({ loading: false, error: msg });
                    throw err;
                }
            },

            cerrar: async (data) => {
                set({ loading: true, error: null });
                try {
                    const resp = await cerrarCajaArqueo(data);
                    // Limpiar toda la sesión para que el POS muestre el modal de apertura
                    set({
                        sesionId: null,
                        estado: 'cerrada',
                        puntoDeVenta: null,
                        montoInicial: null,
                        abiertaEn: null,
                        usuarioNombre: null,
                        loading: false,
                    });
                    return resp;
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Error al cerrar la caja';
                    set({ loading: false, error: msg });
                    throw err;
                }
            },

            movimiento: async (data) => {
                set({ loading: true, error: null });
                try {
                    await registrarMovimiento(data);
                    set({ loading: false });
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Error al registrar movimiento';
                    set({ loading: false, error: msg });
                    throw err;
                }
            },

            recargarReporte: async () => {
                const { sesionId } = get();
                if (!sesionId) return null;
                set({ loading: true, error: null });
                try {
                    const reporte = await getReporteCaja(sesionId);
                    set({
                        estado: reporte.estado,
                        loading: false,
                    });
                    return reporte;
                } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Error al recargar reporte';
                    set({ loading: false, error: msg });
                    return null;
                }
            },

            limpiar: () =>
                set({
                    sesionId: null,
                    puntoDeVenta: null,
                    estado: null,
                    montoInicial: null,
                    abiertaEn: null,
                    usuarioNombre: null,
                    error: null,
                }),

            restaurar: async () => {
                const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
                if (!baseUrl || !navigator.onLine) return;
                try {
                    const reporte = await getCajaActiva();
                    if (reporte) {
                        set({
                            sesionId: reporte.sesion_caja_id,
                            puntoDeVenta: reporte.punto_de_venta,
                            estado: 'abierta',
                            montoInicial: reporte.monto_inicial,
                            abiertaEn: reporte.opened_at,
                            usuarioNombre: reporte.usuario,
                            error: null,
                        });
                    } else {
                        // El backend confirma que no hay sesión activa; limpiar localStorage obsoleto
                        set({
                            sesionId: null,
                            puntoDeVenta: null,
                            estado: null,
                            montoInicial: null,
                            abiertaEn: null,
                            usuarioNombre: null,
                            error: null,
                        });
                    }
                } catch {
                    // Sin conexión o error temporal: conservar estado local
                }
            },
        }),
        {
            name: 'blendpos-caja',
            // Solo persistir la info de sesión, no el estado de loading/error
            partialize: (state) => ({
                sesionId: state.sesionId,
                puntoDeVenta: state.puntoDeVenta,
                estado: state.estado,
                montoInicial: state.montoInicial,
                abiertaEn: state.abiertaEn,
                usuarioNombre: state.usuarioNombre,
            }),
        },
    ),
);
