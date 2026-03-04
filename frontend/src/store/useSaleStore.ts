/**
 * useSaleStore — lean sale orchestrator.
 *
 * Responsibilities:
 *   - Owns: historial, cajero, ticketCounter
 *   - confirmSale(): reads cart from useCartStore, persists the sale record,
 *     triggers thermal print + offline sync + local stock deduction.
 *
 * Cart state   → useCartStore  (frontend/src/store/useCartStore.ts)
 * Modal / UI   → usePOSUIStore (frontend/src/store/usePOSUIStore.ts)
 *
 * Types re-exported here for backward compatibility with existing imports.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { enqueueSale, trySyncQueue } from '../offline/sync';
import { useCajaStore } from './useCajaStore';
import { useCartStore, deductLocalStock } from './useCartStore';
import type { CartItem, MetodoPago, PagoDetalle } from './useCartStore';
import { getLastTicketNumber } from '../services/api/ventas';

// ── Re-export shared types for backward compatibility ─────────────────────────
export type { CartItem, MetodoPago, PagoDetalle } from './useCartStore';

export interface SaleRecord {
    id: string;
    numeroTicket: string;
    fecha: Date;
    items: CartItem[];
    total: number;
    totalConDescuento: number;
    metodoPago: MetodoPago;
    /** Desglose de pagos cuando aplica (ej: mixto). */
    pagos?: PagoDetalle[];
    /** En efectivo, cuánto entrego el cliente (para vuelto). */
    efectivoRecibido?: number;
    /** Vuelto calculado (solo sobre efectivo). */
    vuelto?: number;
    cajero: string;
    /** ID de sesión de caja activa al momento de la venta (para sync batch). */
    sesionCajaId?: string;
    /** Email del cliente para envío de comprobante digital. */
    clienteEmail?: string;
    /** Tipo de comprobante fiscal solicitado. Defaults to 'ticket_interno'. */
    tipoComprobante: 'ticket_interno' | 'factura_a' | 'factura_b' | 'factura_c';
    /** CUIT del receptor (requerido para factura_a). */
    cuitReceptor?: string;
}

// ── Lean state — only what belongs here ──────────────────────────────────────

interface SaleState {
    historial: SaleRecord[];
    cajero: string;
    ticketCounter: number;

    confirmSale: (pago: {
        metodoPago: MetodoPago;
        pagos?: PagoDetalle[];
        efectivoRecibido?: number;
        vuelto?: number;
        /** Optional customer email — backend will mail the PDF receipt. */
        clienteEmail?: string;
        /** Fiscal receipt type. Defaults to 'ticket_interno'. */
        tipoComprobante?: 'ticket_interno' | 'factura_a' | 'factura_b' | 'factura_c';
        /** CUIT del receptor (required for factura_a). */
        cuitReceptor?: string;
    }) => SaleRecord;
    setCajero: (nombre: string) => void;
    /** Sync ticket counter with backend's last ticket number */
    syncTicketCounter: () => Promise<void>;
}

const MAX_HISTORIAL = 200;

export const useSaleStore = create<SaleState>()(
    persist(
        (set, get) => ({
            historial: [],
            cajero: 'Cajero',
            ticketCounter: 0,

            confirmSale: (pago) => {
                // Pull cart from the cart sub-store — single source of truth.
                const { cart, total, totalConDescuento, clearCart } = useCartStore.getState();
                const { historial, cajero, ticketCounter } = get();

                const nextCounter = ticketCounter + 1;
                const numeroTicket = nextCounter.toString().padStart(6, '0');
                const sesionId: string | undefined = useCajaStore.getState().sesionId ?? undefined;

                // Always build a pagos array for ALL payment methods so that
                // MovimientoCaja entries are created for debit/credit/qr too.
                const finalTotal = totalConDescuento || total;
                let pagos: PagoDetalle[] | undefined = pago.pagos;
                if (!pagos || pagos.length === 0) {
                    if (pago.metodoPago !== 'mixto') {
                        pagos = [{ metodo: pago.metodoPago as Exclude<MetodoPago, 'mixto'>, monto: finalTotal }];
                    }
                }

                const record: SaleRecord = {
                    id: crypto.randomUUID(),
                    numeroTicket,
                    fecha: new Date(),
                    items: [...cart],
                    total,
                    totalConDescuento,
                    metodoPago: pago.metodoPago,
                    pagos,
                    efectivoRecibido: pago.efectivoRecibido,
                    vuelto: pago.vuelto,
                    cajero,
                    sesionCajaId: sesionId,
                    clienteEmail: pago.clienteEmail,
                    tipoComprobante: pago.tipoComprobante ?? 'ticket_interno',
                    cuitReceptor: pago.cuitReceptor,
                };

                // 🖨️ Printing is now handled by PostSaleModal (user-initiated).

                // 💾 Offline-first: persist + enqueue for backend sync
                enqueueSale(record)
                    .then(() => trySyncQueue())
                    .catch(console.warn);

                // 📦 Deduct local stock immediately (no full catalog refresh needed —
                // periodic delta sync every 15min handles backend reconciliation)
                deductLocalStock(cart.map((i) => ({ id: i.id, cantidad: i.cantidad })))
                    .catch(console.warn);

                const nextHistorial = [record, ...historial].slice(0, MAX_HISTORIAL);
                set({ historial: nextHistorial, ticketCounter: nextCounter });
                clearCart();
                return record;
            },
            setCajero: (nombre) => set({ cajero: nombre }),
            syncTicketCounter: async () => {
                try {
                    const lastTicketNumber = await getLastTicketNumber();
                    const currentCounter = get().ticketCounter;
                    if (lastTicketNumber > currentCounter) {
                        set({ ticketCounter: lastTicketNumber });
                    }
                } catch (error) {
                    console.error('[useSaleStore] Error al sincronizar contador de tickets:', error);
                }
            },
        }),
        {
            name: 'blendpos-sale',
            partialize: (state) => ({
                historial: state.historial,
                ticketCounter: state.ticketCounter,
            }),
            merge: (persistedState, currentState) => {
                const persisted = persistedState as Partial<SaleState> | undefined;
                const rawHistorial = (persisted?.historial ?? []) as Array<
                    Omit<SaleRecord, 'fecha'> & { fecha: string | Date }
                >;

                const historial = rawHistorial
                    .map((s) => ({
                        ...s,
                        fecha: s.fecha instanceof Date ? s.fecha : new Date(s.fecha),
                    }))
                    .slice(0, MAX_HISTORIAL);

                return {
                    ...currentState,
                    ...persisted,
                    historial,
                } as SaleState;
            },
        }
    )
);
