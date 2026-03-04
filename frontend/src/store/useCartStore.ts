import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { getLocalStock, deductLocalStock } from '../offline/catalog';

// ── Shared types ─────────────────────────────────────────────────────────────
// Exported here so other stores and services can import them without creating
// a circular dependency through useSaleStore.

export type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'qr' | 'mixto';

export interface PagoDetalle {
    metodo: Exclude<MetodoPago, 'mixto'>;
    monto: number;
}

export interface CartItem {
    id: string;
    nombre: string;
    precio: number;
    codigoBarras: string;
    cantidad: number;
    subtotal: number;
    descuento: number; // porcentaje 0-100
}

// ── State interface ───────────────────────────────────────────────────────────

interface CartState {
    cart: CartItem[];
    total: number;
    descuentoGlobal: number; // porcentaje 0-100
    totalConDescuento: number;
    lastAdded: CartItem | null;
    selectedRowIndex: number;

    // Cart actions
    addItem: (item: Pick<CartItem, 'id' | 'nombre' | 'precio' | 'codigoBarras'>) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, cantidad: number) => void;
    setItemDiscount: (id: string, descuento: number) => void;
    /**
     * Batch-updates promotion discounts for all cart items.
     * Receives a map of { productId → discountPct } — items not present in the
     * map are reset to 0. Only triggers a re-render if something actually changed.
     */
    setPromoDiscounts: (map: Record<string, number>) => void;
    setGlobalDiscount: (descuento: number) => void;
    clearCart: () => void;

    // Keyboard navigation
    setSelectedRowIndex: (index: number) => void;
    moveSelectionUp: () => void;
    moveSelectionDown: () => void;
    removeSelectedItem: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const computeTotal = (cart: CartItem[]): number =>
    cart.reduce((sum, item) => sum + item.subtotal, 0);

const computeTotalConDescuento = (total: number, descuentoGlobal: number): number =>
    total * (1 - descuentoGlobal / 100);

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartState>()((set, get) => ({
    cart: [],
    total: 0,
    descuentoGlobal: 0,
    totalConDescuento: 0,
    lastAdded: null,
    selectedRowIndex: -1,

    addItem: async (item) => {
        // ── Stock validation ──────────────────────────────────────────────
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

        // ── Add to cart ───────────────────────────────────────────────────
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

        // Actualizar codigoBarras si aún no lo tiene
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

    setPromoDiscounts: (map) => {
        const { cart, descuentoGlobal } = get();
        let changed = false;
        const updatedCart = cart.map((c) => {
            const newDescuento = map[c.id] ?? 0;
            if (c.descuento === newDescuento) return c;
            changed = true;
            return {
                ...c,
                descuento: newDescuento,
                subtotal: c.cantidad * c.precio * (1 - newDescuento / 100),
            };
        });
        if (!changed) return; // avoid unnecessary re-render
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
}));

// Re-export deductLocalStock so callers (confirmSale) have a single import path.
export { deductLocalStock };
