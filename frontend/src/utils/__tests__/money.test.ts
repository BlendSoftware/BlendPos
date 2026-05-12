import { describe, it, expect } from 'vitest';
import {
    parseMoney,
    formatMoney,
    round,
    clamp,
    calcLineSubtotal,
    calcCartSubtotal,
    calcDiscountAmount,
    clampDiscountValue,
    applyDiscount,
    calcFinalTotal,
    ZERO_DISCOUNT,
} from '../money';

describe('parseMoney', () => {
    it('returns 0 for null/undefined', () => {
        expect(parseMoney(null)).toBe(0);
        expect(parseMoney(undefined)).toBe(0);
    });
    it('returns 0 for NaN / non-finite', () => {
        expect(parseMoney(NaN)).toBe(0);
        expect(parseMoney(Infinity)).toBe(0);
        expect(parseMoney(-Infinity)).toBe(0);
    });
    it('parses backend decimal strings', () => {
        expect(parseMoney('650.00')).toBe(650);
        expect(parseMoney('1234.56')).toBe(1234.56);
    });
    it('returns 0 for malformed strings', () => {
        expect(parseMoney('abc')).toBe(0);
        expect(parseMoney('')).toBe(0);
    });
    it('passes through numbers', () => {
        expect(parseMoney(42.42)).toBe(42.42);
        expect(parseMoney(0)).toBe(0);
    });
});

describe('formatMoney', () => {
    it('formats ARS currency', () => {
        // Intl es-AR uses "$" with non-breaking spaces; test the meaningful parts.
        const out = formatMoney(1234.5);
        expect(out).toContain('1.234,50');
        expect(out).toContain('$');
    });
    it('handles raw strings from backend', () => {
        expect(formatMoney('99.00')).toContain('99,00');
    });
});

describe('round / clamp', () => {
    it('round defaults to 2 decimals', () => {
        expect(round(1.234)).toBe(1.23);
        expect(round(1.235)).toBeCloseTo(1.24, 5); // Math.round half-up
    });
    it('round NaN → 0', () => {
        expect(round(NaN)).toBe(0);
    });
    it('clamp bounds', () => {
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(11, 0, 10)).toBe(10);
        expect(clamp(NaN, 0, 10)).toBe(0); // falls to min
    });
});

describe('calcLineSubtotal', () => {
    it('básico cantidad * precio', () => {
        expect(calcLineSubtotal({ cantidad: 3, precioUnitario: 100 })).toBe(300);
    });
    it('aplica descuento porcentual', () => {
        expect(calcLineSubtotal({ cantidad: 2, precioUnitario: 100, descuentoPct: 10 })).toBe(180);
    });
    it('clampea descuento fuera de rango', () => {
        expect(calcLineSubtotal({ cantidad: 1, precioUnitario: 100, descuentoPct: 150 })).toBe(0);
        expect(calcLineSubtotal({ cantidad: 1, precioUnitario: 100, descuentoPct: -10 })).toBe(100);
    });
    it('acepta precio como string del backend', () => {
        expect(calcLineSubtotal({ cantidad: 2, precioUnitario: '50.50' as unknown as number })).toBe(101);
    });
    it('cantidades negativas colapsan a 0', () => {
        expect(calcLineSubtotal({ cantidad: -3, precioUnitario: 100 })).toBe(0);
    });
});

describe('calcCartSubtotal', () => {
    it('suma campos subtotal', () => {
        expect(calcCartSubtotal([{ subtotal: 100 }, { subtotal: 200 }, { subtotal: 50 }])).toBe(350);
    });
    it('ignora valores inválidos', () => {
        expect(calcCartSubtotal([{ subtotal: 100 }, { subtotal: NaN }, { subtotal: 50 }])).toBe(150);
    });
});

describe('calcDiscountAmount', () => {
    it('% 10 sobre 1000 = 100', () => {
        expect(calcDiscountAmount(1000, { type: 'percentage', value: 10 })).toBe(100);
    });
    it('fixed $500 sobre 1000 = 500', () => {
        expect(calcDiscountAmount(1000, { type: 'fixed', value: 500 })).toBe(500);
    });
    it('% clamp: 150% → 100%', () => {
        expect(calcDiscountAmount(1000, { type: 'percentage', value: 150 })).toBe(1000);
    });
    it('fixed clamp: $9000 sobre $1000 → $1000', () => {
        expect(calcDiscountAmount(1000, { type: 'fixed', value: 9000 })).toBe(1000);
    });
    it('total 0 → 0', () => {
        expect(calcDiscountAmount(0, { type: 'percentage', value: 10 })).toBe(0);
        expect(calcDiscountAmount(0, { type: 'fixed', value: 500 })).toBe(0);
    });
    it('value negativo → 0', () => {
        expect(calcDiscountAmount(1000, { type: 'percentage', value: -5 })).toBe(0);
        expect(calcDiscountAmount(1000, { type: 'fixed', value: -100 })).toBe(0);
    });
});

describe('clampDiscountValue', () => {
    it('% clamped 0..100', () => {
        expect(clampDiscountValue(1000, { type: 'percentage', value: 200 })).toBe(100);
        expect(clampDiscountValue(1000, { type: 'percentage', value: -5 })).toBe(0);
    });
    it('fixed clamped 0..total', () => {
        expect(clampDiscountValue(1000, { type: 'fixed', value: 9999 })).toBe(1000);
        expect(clampDiscountValue(1000, { type: 'fixed', value: -100 })).toBe(0);
    });
});

describe('applyDiscount', () => {
    it('devuelve estructura completa con value clampeado', () => {
        const d = applyDiscount(1000, { type: 'percentage', value: 200 });
        expect(d).toEqual({ type: 'percentage', value: 100, amount: 1000 });
    });
    it('fixed sobre total bajo se autolimita', () => {
        const d = applyDiscount(500, { type: 'fixed', value: 9999 });
        expect(d).toEqual({ type: 'fixed', value: 500, amount: 500 });
    });
});

describe('calcFinalTotal', () => {
    it('total - descuento %', () => {
        expect(calcFinalTotal(1000, { type: 'percentage', value: 10 })).toBe(900);
    });
    it('total - descuento fixed', () => {
        expect(calcFinalTotal(1000, { type: 'fixed', value: 250 })).toBe(750);
    });
    it('nunca queda negativo', () => {
        expect(calcFinalTotal(500, { type: 'fixed', value: 9999 })).toBe(0);
        expect(calcFinalTotal(500, { type: 'percentage', value: 200 })).toBe(0);
    });
});

describe('ZERO_DISCOUNT', () => {
    it('amount es 0', () => {
        expect(ZERO_DISCOUNT.amount).toBe(0);
        expect(ZERO_DISCOUNT.value).toBe(0);
    });
});
