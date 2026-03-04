// ─────────────────────────────────────────────────────────────────────────────
// usePromocionesStore — caches active promotions for the POS terminal.
//
// Promotions are COMBO-based: a discount only activates when ALL products that
// belong to a promotion are simultaneously present in the cart.
//
// Usage flow:
// 1. Call fetchActivePromociones() on POS mount.
// 2. After every cart change call computePromoDiscounts(cartProductIds, priceMap)
//    to get a {productId → discountPct} map, then pass it to setPromoDiscounts().
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { listarPromociones } from '../services/api/promociones';
import type { PromocionResponse } from '../services/api/promociones';

// ── State ─────────────────────────────────────────────────────────────────────

interface PromocionesState {
    /** All currently-active promotions fetched from the backend. */
    promociones: PromocionResponse[];
    loading: boolean;

    /** Fetch active promotions and store them. Safe to call on every POS open. */
    fetchActivePromociones: () => Promise<void>;

    /**
     * Given the products currently in the cart, returns a map of
     * { productId → discountPercentage } accounting for two promo types:
     *
     * **Multi-product combo** (promo.productos.length > 1):
     *   All listed products must be present in the cart (each at least once).
     *   If the combo is complete every product gets the full discount %.
     *
     * **Single-product quantity promo** (promo.productos.length === 1, cantidad_requerida > 1):
     *   The product must be in the cart with quantity >= cantidad_requerida.
     *   The effective discount is weighted so that only complete sets are discounted
     *   and leftover units pay full price:
     *     effectivePct = D × (floor(Q / N) × N) / Q
     *   e.g. 2x1 at 50%, Q=3 → effective = 50 × 2/3 = 33.33%
     */
    computePromoDescuentos: (
        cartProductIds: string[],
        priceMap: Record<string, number>,
        quantityMap: Record<string, number>,
    ) => Record<string, number>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePromocionesStore = create<PromocionesState>()((set, get) => ({
    promociones: [],
    loading: false,

    fetchActivePromociones: async () => {
        if (!navigator.onLine) return;
        set({ loading: true });
        try {
            const data = await listarPromociones(true); // soloActivas = true
            set({ promociones: data });
        } catch (err) {
            console.warn('[BlendPOS] No se pudieron cargar las promociones:', err);
        } finally {
            set({ loading: false });
        }
    },

    computePromoDescuentos: (cartProductIds, priceMap, quantityMap) => {
        const { promociones } = get();
        const now = new Date();
        const discountMap: Record<string, number> = {};

        for (const promo of promociones) {
            if (!promo.activa || promo.estado !== 'activa') continue;
            const desde = new Date(promo.fecha_inicio);
            const hasta = new Date(promo.fecha_fin);
            if (now < desde || now > hasta) continue;

            const n = Math.max(1, promo.cantidad_requerida ?? 1);
            const isSingleProduct = promo.productos.length === 1;

            if (isSingleProduct) {
                // ── QUANTITY-BASED PROMO (e.g. 2x1) ─────────────────────────────
                const p = promo.productos[0];
                if (!cartProductIds.includes(p.id)) continue;

                const Q = quantityMap[p.id] ?? 0;
                const completeSets = Math.floor(Q / n);
                if (completeSets === 0) continue; // not enough units yet

                const discountedUnits = completeSets * n;
                let effectivePct: number;

                if (promo.tipo === 'porcentaje') {
                    // Weighted: only complete-set units get the discount
                    effectivePct = promo.valor * (discountedUnits / Q);
                } else {
                    // monto_fijo per set: convert to % of total line value
                    const price = priceMap[p.id] ?? p.precio_venta;
                    const totalDiscount = completeSets * promo.valor;
                    effectivePct = price > 0 ? (totalDiscount / (price * Q)) * 100 : 0;
                }

                discountMap[p.id] = Math.min(100, Math.max(0, effectivePct));
            } else {
                // ── COMBO PROMO (multiple different products) ───────────────────
                const allPresent = promo.productos.every((p) =>
                    cartProductIds.includes(p.id),
                );
                if (!allPresent) continue;

                for (const p of promo.productos) {
                    if (promo.tipo === 'porcentaje') {
                        discountMap[p.id] = Math.min(100, Math.max(0, promo.valor));
                    } else {
                        const price = priceMap[p.id] ?? p.precio_venta;
                        if (price > 0) {
                            discountMap[p.id] = Math.min(100, Math.max(0, (promo.valor / price) * 100));
                        }
                    }
                }
            }
        }

        return discountMap;
    },
}));
