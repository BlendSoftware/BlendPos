import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { notifications } from '@mantine/notifications';
import { thermalPrinter } from '../services/ThermalPrinterService';
import { enqueueSale, trySyncQueue } from '../offline/sync';
import { forceRefreshCatalog, getLocalStock, deductLocalStock } from '../offline/catalog';
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
    /** ID de sesión de caja activa al momento de la venta (para sync batch). */
    sesionCajaId?: string;
}

interface SaleState {
    cart: CartItem[];
    total: number;
    descuentoGlobal: number; // porcentaje 0-100
    totalConDescuento: number;
    lastAdded: CartItem | null;
    isPaymentModalOpen: boolean;
    isComprobanteModalOpen: boolean;
    isPriceCheckModalOpen: boolean;
    isDiscountModalOpen: boolean;
    discountTargetItemId: string | null;
    selectedRowIndex: number;
    historial: SaleRecord[];
    cajero: string;
    ticketCounter: number;
    tipoComprobante: 'ticket' | 'factura_b' | 'factura_a';

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
    openComprobanteModal: () => void;
    closeComprobanteModal: () => void;
    setTipoComprobante: (tipo: 'ticket' | 'factura_b' | 'factura_a') => void;
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
            isComprobanteModalOpen: false,
            isPriceCheckModalOpen: false,
            isDiscountModalOpen: false,
            discountTargetItemId: null,
            selectedRowIndex: -1,
            historial: [],
            cajero: 'Cajero',
            ticketCounter: 0,
            tipoComprobante: 'ticket' as const,

            addItem: async (item) => {
                // ── Stock validation ──────────────────────────────────
                try {
                    const localStock = await getLocalStock(item.id);
                    const { cart } = get();
                    const existing = cart.find((c) => c.id === item.id);
                    const currentInCart = existing?.cantidad ?? 0;

                    if (localStock <= 0) {
                        notifications.show({
                            title: 'Sin stock',
                            message: `"${item.nombre}" no tiene stock disponible`,
                            color: 'orange',
                            autoClose: 3000,
                        });
                        return;
                    }

                    if (currentInCart + 1 > localStock) {
                        notifications.show({
                            title: 'Stock insuficiente',
                            message: `"${item.nombre}" solo tiene ${localStock} ud. en stock (ya hay ${currentInCart} en el carrito)`,
                            color: 'orange',
                            autoClose: 3000,
                        });
                        return;
                    }
                } catch (err) {
                    console.warn('[BlendPOS] Error al verificar stock local:', err);
                    // En caso de error de IndexedDB, permitir la venta (offline-first)
                }

                // ── Add to cart ───────────────────────────────────────
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

            updateQuantity: async (id, cantidad) => {
                if (cantidad <= 0) {
                    get().removeItem(id);
                    return;
                }

                // ── Stock validation ──────────────────────────────────
                try {
                    const localStock = await getLocalStock(id);
                    if (cantidad > localStock) {
                        const item = get().cart.find((c) => c.id === id);
                        notifications.show({
                            title: 'Stock insuficiente',
                            message: `"${item?.nombre ?? 'Producto'}" solo tiene ${localStock} ud. disponibles`,
                            color: 'orange',
                            autoClose: 3000,
                        });
                        return;
                    }
                } catch (err) {
                    console.warn('[BlendPOS] Error al verificar stock local:', err);
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
            openComprobanteModal: () => set({ isComprobanteModalOpen: true }),
            closeComprobanteModal: () => set({ isComprobanteModalOpen: false }),
            setTipoComprobante: (tipo) => set({ tipoComprobante: tipo }),
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

                const sesionId: string | undefined = useCajaStore.getState().sesionId ?? undefined;

                // BUG-FIX: Always build pagos array for ALL payment methods.
                // Previously pagos was only populated for 'mixto', causing
                // debito/credito/qr MovimientoCaja entries to never be created.
                const finalTotal = pago.metodoPago === 'mixto' ? totalConDescuento || total : totalConDescuento || total;
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
                };
                // 🖨️ Imprime el ticket (ESC/POS via Web Serial, fallback a consola)
                // Usa la configuración de impresora almacenada (nombre comercio, ancho papel, copias, etc.)
                thermalPrinter.printAll(record, usePrinterStore.getState().config).catch(console.error);

                // 💾 Offline-first: persistir venta localmente y encolar para sync.
                // El sync queue es el ÚNICO camino al backend (elimina doble-escritura).
                enqueueSale(record)
                    .then(() => trySyncQueue())
                    .catch(console.warn);

                // 📦 Descontar stock localmente de inmediato para que el POS
                // no permita vender más unidades de las disponibles antes de
                // que el backend sincronice el stock real.
                deductLocalStock(cart.map((i) => ({ id: i.id, cantidad: i.cantidad })))
                    .catch(console.warn);

                // Refrescar catálogo desde backend (actualiza stock real si hay conexión).
                forceRefreshCatalog().catch(console.warn);

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
