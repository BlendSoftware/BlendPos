// ─────────────────────────────────────────────────────────────────────────────
// Money helpers — parsing, formatting and arithmetic for monetary values.
//
// El backend serializa los decimales como strings JSON (shopspring/decimal),
// por eso `parseMoney` acepta `unknown` y coacciona con seguridad: nada de NaN
// circulando por la UI.
// ─────────────────────────────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed';

export interface DiscountInput {
    type: DiscountType;
    value: number;
}

export interface AppliedDiscount extends DiscountInput {
    /** Monto en $ resultante del descuento, ya clampeado al rango válido. */
    amount: number;
}

/** Descuento neutro reutilizable (carrito vacío / descuento removido). */
export const ZERO_DISCOUNT: AppliedDiscount = {
    type: 'percentage',
    value: 0,
    amount: 0,
};

/**
 * Coacciona string | number | null | undefined a un número finito.
 * Cualquier valor inválido devuelve 0 — nunca propaga NaN.
 */
export function parseMoney(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

/** Formatea un valor como moneda argentina. Acepta entradas crudas via parseMoney. */
export function formatMoney(value: unknown): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(parseMoney(value));
}

/** Redondea a N decimales (default 2) sin propagar NaN. */
export function round(value: number, decimals = 2): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/** Restringe un número al intervalo [min, max]. NaN o ±Infinity colapsan a `min`. */
export function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

// ── Cálculos de línea / carrito ──────────────────────────────────────────────

export interface LineArgs {
    cantidad: number;
    precioUnitario: number;
    /** Porcentaje 0-100. Default 0. */
    descuentoPct?: number;
}

/** Subtotal de una línea con descuento porcentual aplicado al precio unitario. */
export function calcLineSubtotal({ cantidad, precioUnitario, descuentoPct = 0 }: LineArgs): number {
    const cant = clamp(cantidad, 0, Number.MAX_SAFE_INTEGER);
    const unit = parseMoney(precioUnitario);
    const pct = clamp(descuentoPct, 0, 100);
    return round(cant * unit * (1 - pct / 100));
}

/** Suma una lista de líneas (campo `subtotal` ya calculado). */
export function calcCartSubtotal(items: Array<{ subtotal: number }>): number {
    return round(items.reduce((sum, it) => sum + parseMoney(it.subtotal), 0));
}

// ── Cálculos de descuento global ─────────────────────────────────────────────

/**
 * Calcula el monto real de descuento ($) sobre un total dado.
 * Para 'percentage' multiplica; para 'fixed' devuelve el valor clampeado al total.
 * Total negativo o no finito devuelve 0.
 */
export function calcDiscountAmount(total: number, discount: DiscountInput): number {
    const t = parseMoney(total);
    if (t <= 0) return 0;
    if (discount.type === 'percentage') {
        const pct = clamp(discount.value, 0, 100);
        return round(t * pct / 100);
    }
    return round(clamp(discount.value, 0, t));
}

/**
 * Clampea el `value` ingresado al rango válido según el tipo:
 *   - percentage: 0..100
 *   - fixed:      0..total
 */
export function clampDiscountValue(total: number, discount: DiscountInput): number {
    if (discount.type === 'percentage') return clamp(discount.value, 0, 100);
    return clamp(discount.value, 0, Math.max(0, parseMoney(total)));
}

/**
 * Aplica un descuento a un total y devuelve la estructura canónica `AppliedDiscount`.
 * `value` queda clampeado y `amount` es la verdad monetaria que el resto del sistema
 * (UI, persistencia, payload de sync) debe consumir.
 */
export function applyDiscount(total: number, discount: DiscountInput): AppliedDiscount {
    const value = clampDiscountValue(total, discount);
    const amount = calcDiscountAmount(total, { type: discount.type, value });
    return { type: discount.type, value, amount };
}

/** Total final aplicando un descuento. Nunca devuelve negativo. */
export function calcFinalTotal(total: number, discount: DiscountInput): number {
    const t = parseMoney(total);
    const amount = calcDiscountAmount(t, discount);
    return Math.max(0, round(t - amount));
}
