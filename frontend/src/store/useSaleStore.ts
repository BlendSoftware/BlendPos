import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { thermalPrinter } from '../services/ThermalPrinterService';
import { enqueueSale, trySyncQueue } from '../offline/sync';
import { registrarVenta } from '../services/api/ventas';
import { useCajaStore } from './useCajaStore';
import { usePrinterStore } from './usePrinterStore';

export interface CartItem {
    id: string;
    nombre: string;
    precio: number;
    codigoBarras: string;
    cantidad: number;
    subtotal: number;
    descuento: number; // porcentaje 0-100
}

export type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'qr' | 'mixto';

export interface PagoDetalle {
    metodo: Exclude<MetodoPago, 'mixto'>;
    monto: number;
}

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
    /** En efectivo, cuánto entregó el cliente (para vuelto). */
    efectivoRecibido?: number;
    /** Vuelto calculado (solo sobre efectivo). */
    vuelto?: number;
    cajero: string;
}

interface SaleState {
    cart: CartItem[];
    total: number;
    descuentoGlobal: number; // porcentaje 0-100
    totalConDescuento: number;
    lastAdded: CartItem | null;
    isPaymentModalOpen: boolean;
    isPriceCheckModalOpen: boolean;
    isDiscountModalOpen: boolean;
    discountTargetItemId: string | null;
    selectedRowIndex: number;
    historial: SaleRecord[];
    cajero: string;
    ticketCounter: number;

    // Cart actions
    addItem: (item: Pick<CartItem, 'id' | 'nombre' | 'precio' | 'codigoBarras'>) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, cantidad: number) => void;
    setItemDiscount: (id: string, descuento: number) => void;
    setGlobalDiscount: (descuento: number) => void;
    clearCart: () => void;

    // Modal actions
    openPaymentModal: () => void;
    closePaymentModal: () => void;
    openPriceCheckModal: () => void;
    closePriceCheckModal: () => void;
    openDiscountModal: () => void;
    closeDiscountModal: () => void;
    openItemDiscountModal: (itemId: string) => void;

    // Navigation
    setSelectedRowIndex: (index: number) => void;
    moveSelectionUp: () => void;
    moveSelectionDown: () => void;
    removeSelectedItem: () => void;

    // Sale
    confirmSale: (pago: {
        metodoPago: MetodoPago;
        pagos?: PagoDetalle[];
        efectivoRecibido?: number;
        vuelto?: number;
        /** Optional customer email — backend will mail the PDF receipt. */
        clienteEmail?: string;
    }) => SaleRecord;
    setCajero: (nombre: string) => void;
}

const MAX_HISTORIAL = 200;

const computeTotal = (cart: CartItem[]): number =>
    cart.reduce((sum, item) => sum + item.subtotal, 0);

const computeTotalConDescuento = (total: number, descuentoGlobal: number): number =>
    total * (1 - descuentoGlobal / 100);

export const useSaleStore = create<SaleState>()(
    persist(
        (set, get) => ({
    cart: [],
    total: 0,
    descuentoGlobal: 0,
    totalConDescuento: 0,
    lastAdded: null,
    isPaymentModalOpen: false,
    isPriceCheckModalOpen: false,
    isDiscountModalOpen: false,
    discountTargetItemId: null,
    selectedRowIndex: -1,
    historial: [],
    cajero: 'Cajero',
    ticketCounter: 0,

    addItem: (item) => {
        const { cart } = get();
        const existingIndex = cart.findIndex((c) => c.id === item.id);

        let updatedCart: CartItem[];

        if (existingIndex >= 0) {
            updatedCart = cart.map((c, i) =>
                i === existingIndex
                    ? {
                        ...c,
                        cantidad: c.cantidad + 1,
                        subtotal: (c.cantidad + 1) * c.precio * (1 - c.descuento / 100),
                    }
                    : c
            );
        } else {
            const newItem: CartItem = {
                ...item,
                cantidad: 1,
                subtotal: item.precio,
                descuento: 0,
            };
            updatedCart = [...cart, newItem];
        }

        // actualizar codigoBarras si aún no lo tiene (caso repath update)
        updatedCart = updatedCart.map((c) =>
            c.id === item.id && !c.codigoBarras
                ? { ...c, codigoBarras: item.codigoBarras }
                : c
        );

        const lastAdded = updatedCart.find((c) => c.id === item.id) ?? null;
        const total = computeTotal(updatedCart);

        set({
            cart: updatedCart,
            total,
            totalConDescuento: computeTotalConDescuento(total, get().descuentoGlobal),
            lastAdded,
            selectedRowIndex: updatedCart.findIndex((c) => c.id === item.id),
        });

        setTimeout(() => {
            if (get().lastAdded?.id === item.id) {
                set({ lastAdded: null });
            }
        }, 1500);
    },

    removeItem: (id) => {
        const { cart, descuentoGlobal, selectedRowIndex } = get();
        const updatedCart = cart.filter((c) => c.id !== id);
        const total = computeTotal(updatedCart);
        set({
            cart: updatedCart,
            total,
            totalConDescuento: computeTotalConDescuento(total, descuentoGlobal),
            selectedRowIndex: Math.max(0, Math.min(selectedRowIndex, updatedCart.length - 1)),
        });
    },

    updateQuantity: (id, cantidad) => {
        if (cantidad <= 0) {
            get().removeItem(id);
            return;
        }
        const { descuentoGlobal } = get();
        const updatedCart = get().cart.map((c) =>
            c.id === id
                ? { ...c, cantidad, subtotal: cantidad * c.precio * (1 - c.descuento / 100) }
                : c
        );
        const total = computeTotal(updatedCart);
        set({
            cart: updatedCart,
            total,
            totalConDescuento: computeTotalConDescuento(total, descuentoGlobal),
        });
    },

    setItemDiscount: (id, descuento) => {
        const { descuentoGlobal } = get();
        const updatedCart = get().cart.map((c) =>
            c.id === id
                ? { ...c, descuento, subtotal: c.cantidad * c.precio * (1 - descuento / 100) }
                : c
        );
        const total = computeTotal(updatedCart);
        set({
            cart: updatedCart,
            total,
            totalConDescuento: computeTotalConDescuento(total, descuentoGlobal),
        });
    },

    setGlobalDiscount: (descuento) => {
        const total = get().total;
        set({
            descuentoGlobal: descuento,
            totalConDescuento: computeTotalConDescuento(total, descuento),
        });
    },

    clearCart: () =>
        set({
            cart: [],
            total: 0,
            descuentoGlobal: 0,
            totalConDescuento: 0,
            lastAdded: null,
            selectedRowIndex: -1,
        }),

    openPaymentModal: () => set({ isPaymentModalOpen: true }),
    closePaymentModal: () => set({ isPaymentModalOpen: false }),
    openPriceCheckModal: () => set({ isPriceCheckModalOpen: true }),
    closePriceCheckModal: () => set({ isPriceCheckModalOpen: false }),
    openDiscountModal: () => set({ isDiscountModalOpen: true, discountTargetItemId: null }),
    closeDiscountModal: () => set({ isDiscountModalOpen: false, discountTargetItemId: null }),
    openItemDiscountModal: (itemId) => set({ isDiscountModalOpen: true, discountTargetItemId: itemId }),

    setSelectedRowIndex: (index) => set({ selectedRowIndex: index }),

    moveSelectionUp: () => {
        const { selectedRowIndex, cart } = get();
        if (cart.length === 0) return;
        set({
            selectedRowIndex: selectedRowIndex <= 0 ? cart.length - 1 : selectedRowIndex - 1,
        });
    },

    moveSelectionDown: () => {
        const { selectedRowIndex, cart } = get();
        if (cart.length === 0) return;
        set({
            selectedRowIndex: selectedRowIndex >= cart.length - 1 ? 0 : selectedRowIndex + 1,
        });
    },

    removeSelectedItem: () => {
        const { cart, selectedRowIndex } = get();
        if (cart.length === 0 || selectedRowIndex < 0) return;
        const item = cart[selectedRowIndex];
        if (item) get().removeItem(item.id);
    },

    confirmSale: (pago) => {
        const { cart, total, totalConDescuento, historial, cajero, ticketCounter } = get();
        const nextCounter = ticketCounter + 1;
        const numeroTicket = nextCounter.toString().padStart(6, '0');
        const record: SaleRecord = {
            id: `T-${numeroTicket}`,
            numeroTicket,
            fecha: new Date(),
            items: [...cart],
            total,
            totalConDescuento,
            metodoPago: pago.metodoPago,
            pagos: pago.pagos,
            efectivoRecibido: pago.efectivoRecibido,
            vuelto: pago.vuelto,
            cajero,
        };
        // 🖨️ Imprime el ticket (ESC/POS via Web Serial, fallback a consola)
        // Usa la configuración de impresora almacenada (nombre comercio, ancho papel, copias, etc.)
        thermalPrinter.printAll(record, usePrinterStore.getState().config).catch(console.error);

        // 💾 Offline-first: persistir venta localmente y encolar para sync.
        enqueueSale(record)
            .then(() => trySyncQueue())
            .catch(console.warn);

        // 🌐 Si hay sesión de caja activa y hay conexión → registrar directamente en backend.
        const sesionId = useCajaStore.getState().sesionId;
        if (sesionId && navigator.onLine) {
            const metodosSinMixto = (pago.pagos && pago.pagos.length > 0)
                ? pago.pagos
                : [{ metodo: pago.metodoPago as Exclude<MetodoPago, 'mixto'>, monto: totalConDescuento }];

            // Mapea 'qr' → 'transferencia' según el enum del backend
            const toBackendMetodo = (m: string): 'efectivo' | 'debito' | 'credito' | 'transferencia' => {
                if (m === 'qr') return 'transferencia';
                return m as 'efectivo' | 'debito' | 'credito' | 'transferencia';
            };
            registrarVenta({
                sesion_caja_id: sesionId,
                items: cart.map((item) => ({
                    producto_id: item.id,
                    cantidad: item.cantidad,
                    descuento: item.descuento,
                })),
                pagos: metodosSinMixto.map((p) => ({
                    metodo: toBackendMetodo(p.metodo),
                    monto: p.monto,
                })),
                offline_id: record.id,
                ...(pago.clienteEmail ? { cliente_email: pago.clienteEmail } : {}),
            }).catch((err) => console.warn('[BlendPOS] Error registrando venta en backend:', err));
        }

        const nextHistorial = [record, ...historial].slice(0, MAX_HISTORIAL);
        set({
            historial: nextHistorial,
            ticketCounter: nextCounter,
        });
        get().clearCart();
        return record;
    },

    setCajero: (nombre) => set({ cajero: nombre }),
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
