// ─────────────────────────────────────────────────────────────────────────────
// usePromocionesStore — caches active promotions for the POS terminal.
//
// Promotions are COMBO-based: a discount only activates when ALL products that
// belong to a promotion are simultaneously present in the cart.
//
// Usage flow:
// 1. Call fetchActivePromociones() on POS mount.
// 2. After every cart change call computePromoDescuentos(cartProductIds, priceMap, quantityMap)
//    to get { descuentos, promoNombres }, then pass both to setPromoDiscounts().
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
     * Given the products currently in the cart, returns discount and promo-name maps.
     *
     * **Multi-product combo** (promo.productos.length > 1):
     *   All listed products must be in the cart.
     *   Complete combos = min(floor(qty_i / N)) across all combo products.
     *   This is the "bottleneck" product — the one with the fewest complete sets.
     *   Each product only gets a weighted discount for its discounted units:
     *     effectivePct_i = D × (completeSets × N / qty_i)
     *
     *   Example: combo "1 Coca + 1 Alfajor = 20%", cart = 2 Cocas + 1 Alfajor
     *     → completeSets = min(floor(2/1), floor(1/1)) = 1
     *     → Coca:   20% × (1/2) = 10%  (1 unit discounted, 1 pays full)
     *     → Alfajor: 20% × (1/1) = 20%  (1 unit discounted)
     *
     * **Single-product quantity promo** (promo.productos.length === 1):
     *   effectivePct = D × (floor(Q / N) × N) / Q
     *   e.g. 2x1 at 50%, Q=3 → effective = 50 × 2/3 = 33.33%
     */
    computePromoDescuentos: (
        cartProductIds: string[],
        priceMap: Record<string, number>,
        quantityMap: Record<string, number>,
    ) => { descuentos: Record<string, number>; promoNombres: Record<string, string> };
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
        const descuentos: Record<string, number> = {};
        const promoNombres: Record<string, string> = {};

        for (const promo of promociones) {
            if (!promo.activa) continue;

            const n = Math.max(1, promo.cantidad_requerida ?? 1);
            const isSingleProduct = promo.productos.length === 1;

            if (isSingleProduct) {
                // ── QUANTITY-BASED PROMO (e.g. 2x1) ─────────────────────────────
                const p = promo.productos[0];
                if (!cartProductIds.includes(p.id)) continue;

                const Q = quantityMap[p.id] ?? 0;
                const completeSets = Math.floor(Q / n);
                if (completeSets === 0) continue;

                const discountedUnits = completeSets * n;
                let effectivePct: number;

                if (promo.tipo === 'porcentaje') {
                    effectivePct = promo.valor * (discountedUnits / Q);
                } else {
                    const price = priceMap[p.id] ?? p.precio_venta;
                    const totalDiscount = completeSets * promo.valor;
                    effectivePct = price > 0 ? (totalDiscount / (price * Q)) * 100 : 0;
                }

                const newPct = Math.min(100, Math.max(0, effectivePct));
                if (newPct > (descuentos[p.id] ?? 0)) {
                    descuentos[p.id] = newPct;
                    promoNombres[p.id] = promo.nombre;
                }
            } else {
                // ── COMBO PROMO (multiple different products) ───────────────────
                const allPresent = promo.productos.every((p) =>
                    cartProductIds.includes(p.id),
                );
                if (!allPresent) continue;

                // Complete combos = bottleneck: product with fewest complete sets.
                // e.g. 2 Cocas + 1 Alfajor, n=1 → min(floor(2/1), floor(1/1)) = 1
                const completeSets = Math.floor(
                    Math.min(...promo.productos.map((p) => (quantityMap[p.id] ?? 0) / n)),
                );
                if (completeSets === 0) continue;

                for (const p of promo.productos) {
                    const qty = quantityMap[p.id] ?? 0;
                    if (qty === 0) continue;

                    // Only completeSets × n units of this product are in a combo;
                    // remaining units pay full price.
                    const discountedQty = completeSets * n;
                    let effectivePct: number;

                    if (promo.tipo === 'porcentaje') {
                        effectivePct = promo.valor * (discountedQty / qty);
                    } else {
                        // Distribute fixed discount proportionally to each product's
                        // value contribution within the complete combos.
                        const totalComboValue = promo.productos.reduce((sum, cp) => {
                            const cpPrice = priceMap[cp.id] ?? cp.precio_venta;
                            const cpDiscQty = Math.min(completeSets * n, quantityMap[cp.id] ?? 0);
                            return sum + cpPrice * cpDiscQty;
                        }, 0);
                        const price = priceMap[p.id] ?? p.precio_venta;
                        const thisValue = price * discountedQty;
                        const totalDiscount = completeSets * promo.valor;
                        effectivePct = (totalComboValue > 0 && price > 0)
                            ? (totalDiscount * (thisValue / totalComboValue)) / (price * qty) * 100
                            : 0;
                    }

                    const newPct = Math.min(100, Math.max(0, effectivePct));
                    if (newPct > (descuentos[p.id] ?? 0)) {
                        descuentos[p.id] = newPct;
                        promoNombres[p.id] = promo.nombre;
                    }
                }
            }
        }

        return { descuentos, promoNombres };
    },
}));
