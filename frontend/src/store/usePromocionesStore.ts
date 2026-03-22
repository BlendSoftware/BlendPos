// ─────────────────────────────────────────────────────────────────────────────
// usePromocionesStore — caches active promotions for the POS terminal.
//
// Supports two promotion modes:
// - "clasico": a discount activates when ALL listed products are in the cart.
// - "grupos":  each grupo defines a set of eligible products. The promo
//              activates when the cart contains >= cantidad_requerida items
//              from EACH grupo. Complete sets = min across groups.
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
     *
     * **Group-based promo** (promo.modo === 'grupos'):
     *   For each grupo, check if cart has >= grupo.cantidad_requerida items
     *   from that group's product list. Complete sets = min across groups.
     *   Discount is applied to matched items from each group.
     */
    computePromoDescuentos: (
        cartProductIds: string[],
        priceMap: Record<string, number>,
        quantityMap: Record<string, number>,
    ) => { descuentos: Record<string, number>; promoNombres: Record<string, string> };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Applies a discount to a product, keeping the highest discount if multiple
 * promotions compete for the same product.
 */
function applyDiscount(
    productId: string,
    effectivePct: number,
    promoName: string,
    descuentos: Record<string, number>,
    promoNombres: Record<string, string>,
) {
    const newPct = Math.min(100, Math.max(0, effectivePct));
    if (newPct > (descuentos[productId] ?? 0)) {
        descuentos[productId] = newPct;
        promoNombres[productId] = promoName;
    }
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

            // ── GROUP-BASED PROMO ────────────────────────────────────────
            if (promo.modo === 'grupos' && promo.grupos && promo.grupos.length > 0) {
                // For each group, find matching cart items and how many complete
                // sets of grupo.cantidad_requerida we can form.
                const groupMatches: Array<{
                    grupoReq: number;
                    matchedProducts: Array<{ id: string; qty: number; price: number }>;
                    totalMatchedQty: number;
                }> = [];

                let allGroupsSatisfied = true;

                for (const grupo of promo.grupos) {
                    const grupoProductIds = new Set(grupo.productos.map((p) => p.id));
                    const matched: Array<{ id: string; qty: number; price: number }> = [];
                    let totalQty = 0;

                    for (const pid of cartProductIds) {
                        if (!grupoProductIds.has(pid)) continue;
                        const qty = quantityMap[pid] ?? 0;
                        if (qty <= 0) continue;
                        const price = priceMap[pid] ?? (grupo.productos.find((p) => p.id === pid)?.precio_venta ?? 0);
                        // Avoid counting the same product twice
                        if (!matched.some((m) => m.id === pid)) {
                            matched.push({ id: pid, qty, price });
                            totalQty += qty;
                        }
                    }

                    const grupoReq = Math.max(1, grupo.cantidad_requerida);
                    if (totalQty < grupoReq) {
                        allGroupsSatisfied = false;
                        break;
                    }

                    groupMatches.push({
                        grupoReq,
                        matchedProducts: matched,
                        totalMatchedQty: totalQty,
                    });
                }

                if (!allGroupsSatisfied) continue;

                // Complete sets = min across groups of floor(totalMatchedQty / grupoReq)
                const completeSets = Math.min(
                    ...groupMatches.map((gm) => Math.floor(gm.totalMatchedQty / gm.grupoReq)),
                );
                if (completeSets === 0) continue;

                // Gather all matched products with how many units participate in the combo
                const allMatchedProducts: Array<{ id: string; discountedQty: number; totalQty: number; price: number }> = [];

                for (const gm of groupMatches) {
                    const discountedUnitsForGroup = completeSets * gm.grupoReq;
                    // Distribute discounted units across products in the group
                    // proportionally to their quantities (greedy: fill from first)
                    let remaining = discountedUnitsForGroup;
                    for (const mp of gm.matchedProducts) {
                        const take = Math.min(remaining, mp.qty);
                        if (take > 0) {
                            const existing = allMatchedProducts.find((x) => x.id === mp.id);
                            if (existing) {
                                existing.discountedQty += take;
                            } else {
                                allMatchedProducts.push({
                                    id: mp.id,
                                    discountedQty: take,
                                    totalQty: mp.qty,
                                    price: mp.price,
                                });
                            }
                            remaining -= take;
                        }
                        if (remaining <= 0) break;
                    }
                }

                // Calculate total combo value for proportional distribution
                const totalComboValue = allMatchedProducts.reduce(
                    (sum, mp) => sum + mp.price * mp.discountedQty,
                    0,
                );

                for (const mp of allMatchedProducts) {
                    let effectivePct: number;

                    if (promo.tipo === 'porcentaje') {
                        effectivePct = promo.valor * (mp.discountedQty / mp.totalQty);
                    } else if (promo.tipo === 'precio_fijo_combo') {
                        // Discount = sum of original prices - fixed combo price
                        const totalDiscount = Math.max(0, totalComboValue - promo.valor) * completeSets;
                        const thisValue = mp.price * mp.discountedQty;
                        effectivePct =
                            totalComboValue > 0 && mp.price > 0
                                ? ((totalDiscount * (thisValue / totalComboValue)) / (mp.price * mp.totalQty)) * 100
                                : 0;
                    } else {
                        // monto_fijo: distribute proportionally
                        const totalDiscount = completeSets * promo.valor;
                        const thisValue = mp.price * mp.discountedQty;
                        effectivePct =
                            totalComboValue > 0 && mp.price > 0
                                ? ((totalDiscount * (thisValue / totalComboValue)) / (mp.price * mp.totalQty)) * 100
                                : 0;
                    }

                    applyDiscount(mp.id, effectivePct, promo.nombre, descuentos, promoNombres);
                }

                continue;
            }

            // ── CLASSIC PROMO ────────────────────────────────────────────
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
                } else if (promo.tipo === 'precio_fijo_combo') {
                    const price = priceMap[p.id] ?? p.precio_venta;
                    const originalTotal = price * discountedUnits;
                    const totalDiscount = Math.max(0, originalTotal - promo.valor * completeSets);
                    effectivePct = price > 0 ? (totalDiscount / (price * Q)) * 100 : 0;
                } else {
                    const price = priceMap[p.id] ?? p.precio_venta;
                    const totalDiscount = completeSets * promo.valor;
                    effectivePct = price > 0 ? (totalDiscount / (price * Q)) * 100 : 0;
                }

                applyDiscount(p.id, effectivePct, promo.nombre, descuentos, promoNombres);
            } else {
                // ── COMBO PROMO (multiple different products) ───────────────────
                const allPresent = promo.productos.every((p) =>
                    cartProductIds.includes(p.id),
                );
                if (!allPresent) continue;

                // Complete combos = bottleneck: product with fewest complete sets.
                const completeSets = Math.floor(
                    Math.min(...promo.productos.map((p) => (quantityMap[p.id] ?? 0) / n)),
                );
                if (completeSets === 0) continue;

                // Calculate total combo value for proportional distribution
                const totalComboValue = promo.productos.reduce((sum, cp) => {
                    const cpPrice = priceMap[cp.id] ?? cp.precio_venta;
                    const cpDiscQty = Math.min(completeSets * n, quantityMap[cp.id] ?? 0);
                    return sum + cpPrice * cpDiscQty;
                }, 0);

                for (const p of promo.productos) {
                    const qty = quantityMap[p.id] ?? 0;
                    if (qty === 0) continue;

                    const discountedQty = completeSets * n;
                    let effectivePct: number;

                    if (promo.tipo === 'porcentaje') {
                        effectivePct = promo.valor * (discountedQty / qty);
                    } else if (promo.tipo === 'precio_fijo_combo') {
                        const price = priceMap[p.id] ?? p.precio_venta;
                        const totalDiscount = Math.max(0, totalComboValue - promo.valor * completeSets);
                        const thisValue = price * discountedQty;
                        effectivePct =
                            totalComboValue > 0 && price > 0
                                ? ((totalDiscount * (thisValue / totalComboValue)) / (price * qty)) * 100
                                : 0;
                    } else {
                        // monto_fijo
                        const price = priceMap[p.id] ?? p.precio_venta;
                        const thisValue = price * discountedQty;
                        const totalDiscount = completeSets * promo.valor;
                        effectivePct = (totalComboValue > 0 && price > 0)
                            ? (totalDiscount * (thisValue / totalComboValue)) / (price * qty) * 100
                            : 0;
                    }

                    applyDiscount(p.id, effectivePct, promo.nombre, descuentos, promoNombres);
                }
            }
        }

        return { descuentos, promoNombres };
    },
}));
