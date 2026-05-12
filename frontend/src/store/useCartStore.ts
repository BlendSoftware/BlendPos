import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { getLocalStock, deductLocalStock } from '../offline/catalog';
import {
    parseMoney,
    calcLineSubtotal,
    calcCartSubtotal,
    applyDiscount,
    calcFinalTotal,
    ZERO_DISCOUNT,
    type AppliedDiscount,
    type DiscountInput,
} from '../utils/money';
import type { TipoPrecio } from '../types';

// ── Shared types ─────────────────────────────────────────────────────────────
// Exported here so other stores and services can import them without creating
// a circular dependency through useSaleStore.

export type MetodoPago = 'efectivo' | 'debito' | 'credito' | 'qr' | 'transferencia' | 'mixto';

export interface PagoDetalle {
    metodo: Exclude<MetodoPago, 'mixto'>;
    monto: number;
}

export interface CartItem {
    id: string;
    nombre: string;
    /** Precio unitario APLICADO (minorista o mayorista). Usar este campo para cálculos. */
    precio: number;
    /** Precio minorista original — siempre presente, fuente de verdad para el toggle. */
    precioMinoristaOriginal: number;
    /** Precio mayorista del producto si existe (null = el producto no tiene precio mayorista). */
    precioMayorista?: number | null;
    /** Tipo de precio actualmente aplicado en esta línea. */
    tipoPrecio: TipoPrecio;
    codigoBarras: string;
    cantidad: number;
    subtotal: number;
    descuento: number;        // porcentaje 0-100 — descuento MANUAL via DiscountModal
    promoDescuento?: number;  // porcentaje 0-100 — descuento aplicado por promoción automática
    promoNombre?: string;     // nombre de la promoción que aplica el descuento automático
}

// ── State interface ───────────────────────────────────────────────────────────

interface CartState {
    cart: CartItem[];
    total: number;
    /** Descuento global canónico: tipo + valor ingresado + monto $ derivado. */
    globalDiscount: AppliedDiscount;
    /**
     * Equivalente legacy: porcentaje 0-100 cuando el descuento es porcentual; 0 cuando es monto fijo.
     * Mantenido para retrocompatibilidad de lectura con componentes existentes. NO escribir directamente.
     */
    descuentoGlobal: number;
    totalConDescuento: number;
    lastAdded: CartItem | null;
    selectedRowIndex: number;

    // Cart actions
    addItem: (item: {
        id: string;
        nombre: string;
        precio: number;
        precioMayorista?: number | null;
        codigoBarras: string;
    }) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, cantidad: number) => void;
    setItemDiscount: (id: string, descuento: number) => void;
    /** Cambia el tipo de precio (minorista/mayorista) de un ítem. No-op si no hay precio mayorista. */
    setItemPriceType: (id: string, tipoPrecio: TipoPrecio) => void;
    /**
     * Batch-updates promotion discounts for all cart items.
     * Receives a map of { productId → discountPct } and optionally { productId → promoNombre }.
     * Items not present in the map are reset to 0. Only re-renders if something changed.
     */
    setPromoDiscounts: (map: Record<string, number>, nombres?: Record<string, string>) => void;
    /** Aplica/actualiza el descuento global. Acepta porcentaje o monto fijo. */
    setGlobalDiscount: (input: DiscountInput) => void;
    /** Atajo: aplicar un porcentaje (retrocompatibilidad con llamadores existentes). */
    setGlobalDiscountPct: (pct: number) => void;
    /** Quita el descuento global. */
    clearGlobalDiscount: () => void;
    clearCart: () => void;

    // Keyboard navigation
    setSelectedRowIndex: (index: number) => void;
    moveSelectionUp: () => void;
    moveSelectionDown: () => void;
    removeSelectedItem: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Devuelve el mayor entre el descuento manual y el descuento por promoción. */
const effectivePct = (item: CartItem): number =>
    Math.max(item.descuento, item.promoDescuento ?? 0);

/** Recalcula el subtotal de una línea respetando el precio APLICADO (minorista/mayorista). */
const recomputeSubtotal = (item: CartItem): number =>
    calcLineSubtotal({
        cantidad: item.cantidad,
        precioUnitario: item.precio,
        descuentoPct: effectivePct(item),
    });

const recomputeTotals = (cart: CartItem[], discount: AppliedDiscount) => {
    const total = calcCartSubtotal(cart);
    const applied = applyDiscount(total, { type: discount.type, value: discount.value });
    return {
        cart,
        total,
        globalDiscount: applied,
        descuentoGlobal: applied.type === 'percentage' ? applied.value : 0,
        totalConDescuento: calcFinalTotal(total, applied),
    };
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartState>()((set, get) => ({
    cart: [],
    total: 0,
    globalDiscount: { ...ZERO_DISCOUNT },
    descuentoGlobal: 0,
    totalConDescuento: 0,
    lastAdded: null,
    selectedRowIndex: -1,

    addItem: async (raw) => {
        // Defensive: backend manda decimales como string — parseMoney los coacciona.
        const precioMinorista = parseMoney(raw.precio);
        const precioMayoristaRaw = raw.precioMayorista == null ? null : parseMoney(raw.precioMayorista);
        // 0 o negativos en mayorista se consideran "no tiene precio mayorista".
        const precioMayorista = precioMayoristaRaw && precioMayoristaRaw > 0 ? precioMayoristaRaw : null;

        // ── Stock validation ──────────────────────────────────────────────
        try {
            const localStock = await getLocalStock(raw.id);
            const { cart } = get();
            const existing = cart.find((c) => c.id === raw.id);
            const currentInCart = existing?.cantidad ?? 0;

            if (localStock <= 0) {
                notifications.show({
                    title: 'Sin stock',
                    message: `"${raw.nombre}" no tiene stock disponible`,
                    color: 'orange',
                    autoClose: 3000,
                });
                return;
            }

            if (currentInCart + 1 > localStock) {
                notifications.show({
                    title: 'Stock insuficiente',
                    message: `"${raw.nombre}" solo tiene ${localStock} ud. en stock (ya hay ${currentInCart} en el carrito)`,
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
        const { cart, globalDiscount } = get();
        const existingIndex = cart.findIndex((c) => c.id === raw.id);

        let updatedCart: CartItem[];

        if (existingIndex >= 0) {
            updatedCart = cart.map((c, i) => {
                if (i !== existingIndex) return c;
                const cantidad = c.cantidad + 1;
                const next: CartItem = { ...c, cantidad };
                return { ...next, subtotal: recomputeSubtotal(next) };
            });
        } else {
            const newItem: CartItem = {
                id: raw.id,
                nombre: raw.nombre,
                codigoBarras: raw.codigoBarras,
                precio: precioMinorista,
                precioMinoristaOriginal: precioMinorista,
                precioMayorista,
                tipoPrecio: 'minorista',
                cantidad: 1,
                subtotal: precioMinorista,
                descuento: 0,
                promoDescuento: 0,
            };
            updatedCart = [...cart, newItem];
        }

        // Actualizar codigoBarras si aún no lo tiene
        updatedCart = updatedCart.map((c) =>
            c.id === raw.id && !c.codigoBarras
                ? { ...c, codigoBarras: raw.codigoBarras }
                : c
        );

        const lastAdded = updatedCart.find((c) => c.id === raw.id) ?? null;

        set({
            ...recomputeTotals(updatedCart, globalDiscount),
            lastAdded,
            selectedRowIndex: updatedCart.findIndex((c) => c.id === raw.id),
        });

        setTimeout(() => {
            if (get().lastAdded?.id === raw.id) {
                set({ lastAdded: null });
            }
        }, 1500);
    },

    removeItem: (id) => {
        const { cart, globalDiscount, selectedRowIndex } = get();
        const updatedCart = cart.filter((c) => c.id !== id);
        set({
            ...recomputeTotals(updatedCart, globalDiscount),
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

        const { globalDiscount } = get();
        const updatedCart = get().cart.map((c) => {
            if (c.id !== id) return c;
            const next: CartItem = { ...c, cantidad };
            return { ...next, subtotal: recomputeSubtotal(next) };
        });
        set(recomputeTotals(updatedCart, globalDiscount));
    },

    setItemDiscount: (id, descuento) => {
        const { globalDiscount } = get();
        const updatedCart = get().cart.map((c) => {
            if (c.id !== id) return c;
            const next: CartItem = { ...c, descuento };
            return { ...next, subtotal: recomputeSubtotal(next) };
        });
        set(recomputeTotals(updatedCart, globalDiscount));
    },

    setItemPriceType: (id, tipoPrecio) => {
        const { globalDiscount } = get();
        const updatedCart = get().cart.map((c) => {
            if (c.id !== id) return c;
            // No-op si el producto no tiene precio mayorista pero piden mayorista
            if (tipoPrecio === 'mayorista' && (c.precioMayorista == null || c.precioMayorista <= 0)) {
                return c;
            }
            const nuevoPrecio = tipoPrecio === 'mayorista'
                ? (c.precioMayorista ?? c.precioMinoristaOriginal)
                : c.precioMinoristaOriginal;
            const next: CartItem = { ...c, tipoPrecio, precio: nuevoPrecio };
            return { ...next, subtotal: recomputeSubtotal(next) };
        });
        set(recomputeTotals(updatedCart, globalDiscount));
    },

    setPromoDiscounts: (map, nombres = {}) => {
        const { cart, globalDiscount } = get();
        let changed = false;
        const updatedCart = cart.map((c) => {
            const newPromo = map[c.id] ?? 0;
            const newNombre = nombres[c.id] ?? undefined;
            if (c.promoDescuento === newPromo && c.promoNombre === newNombre) return c;
            changed = true;
            const next: CartItem = {
                ...c,
                promoDescuento: newPromo,
                promoNombre: newNombre,
                // NOTE: descuento (manual) is intentionally NOT touched here
            };
            return { ...next, subtotal: recomputeSubtotal(next) };
        });
        if (!changed) return; // avoid unnecessary re-render
        set(recomputeTotals(updatedCart, globalDiscount));
    },

    setGlobalDiscount: (input) => {
        const { cart } = get();
        const total = calcCartSubtotal(cart);
        const applied = applyDiscount(total, input);
        set({
            globalDiscount: applied,
            descuentoGlobal: applied.type === 'percentage' ? applied.value : 0,
            total,
            totalConDescuento: calcFinalTotal(total, applied),
        });
    },

    setGlobalDiscountPct: (pct) => {
        get().setGlobalDiscount({ type: 'percentage', value: pct });
    },

    clearGlobalDiscount: () => {
        const { cart } = get();
        const total = calcCartSubtotal(cart);
        set({
            globalDiscount: { ...ZERO_DISCOUNT },
            descuentoGlobal: 0,
            total,
            totalConDescuento: total,
        });
    },

    clearCart: () =>
        set({
            cart: [],
            total: 0,
            globalDiscount: { ...ZERO_DISCOUNT },
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
