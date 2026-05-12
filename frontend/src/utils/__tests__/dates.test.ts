import { describe, it, expect } from 'vitest';
import {
    startOfDay,
    endOfDay,
    isSameDay,
    getTodayRange,
    getYesterdayRange,
    getCurrentWeekRange,
    getCurrentMonthRange,
    getSingleDayRange,
    normalizeDateRange,
    formatDateForAPI,
} from '../dates';

describe('startOfDay / endOfDay', () => {
    it('startOfDay sets 00:00:00.000', () => {
        const d = new Date(2026, 4, 12, 15, 30, 45, 999);
        const s = startOfDay(d);
        expect(s.getHours()).toBe(0);
        expect(s.getMinutes()).toBe(0);
        expect(s.getSeconds()).toBe(0);
        expect(s.getMilliseconds()).toBe(0);
        expect(s.getDate()).toBe(12);
    });
    it('endOfDay sets 23:59:59.999', () => {
        const d = new Date(2026, 4, 12, 0, 0, 0, 0);
        const e = endOfDay(d);
        expect(e.getHours()).toBe(23);
        expect(e.getMinutes()).toBe(59);
        expect(e.getSeconds()).toBe(59);
        expect(e.getMilliseconds()).toBe(999);
        expect(e.getDate()).toBe(12);
    });
    it('no muta el argumento', () => {
        const d = new Date(2026, 4, 12, 15, 30);
        startOfDay(d);
        expect(d.getHours()).toBe(15);
    });
});

describe('isSameDay', () => {
    it('mismo día distinta hora', () => {
        expect(isSameDay(new Date(2026, 4, 12, 8), new Date(2026, 4, 12, 22))).toBe(true);
    });
    it('días distintos', () => {
        expect(isSameDay(new Date(2026, 4, 12), new Date(2026, 4, 13))).toBe(false);
    });
});

describe('getTodayRange', () => {
    it('from < to del mismo día', () => {
        const ref = new Date(2026, 4, 12, 10, 30);
        const r = getTodayRange(ref);
        expect(isSameDay(r.from, ref)).toBe(true);
        expect(isSameDay(r.to, ref)).toBe(true);
        expect(r.from.getHours()).toBe(0);
        expect(r.to.getHours()).toBe(23);
    });
});

describe('getYesterdayRange', () => {
    it('día anterior completo', () => {
        const ref = new Date(2026, 4, 12, 10, 0);
        const r = getYesterdayRange(ref);
        expect(r.from.getDate()).toBe(11);
        expect(r.to.getDate()).toBe(11);
        expect(r.from.getHours()).toBe(0);
        expect(r.to.getHours()).toBe(23);
    });
    it('cruza inicio de mes', () => {
        const ref = new Date(2026, 4, 1); // 1 de mayo
        const r = getYesterdayRange(ref);
        expect(r.from.getMonth()).toBe(3); // abril
        expect(r.from.getDate()).toBe(30);
    });
});

describe('getCurrentWeekRange (lunes → domingo)', () => {
    it('miércoles 2026-05-13 → lunes 11 / domingo 17', () => {
        const wed = new Date(2026, 4, 13);
        const r = getCurrentWeekRange(wed);
        expect(r.from.getDate()).toBe(11);
        expect(r.from.getDay()).toBe(1); // lunes
        expect(r.to.getDate()).toBe(17);
        expect(r.to.getDay()).toBe(0); // domingo
    });
    it('domingo 2026-05-17 → lunes 11 / domingo 17 (no salta a la próxima semana)', () => {
        const sun = new Date(2026, 4, 17);
        const r = getCurrentWeekRange(sun);
        expect(r.from.getDate()).toBe(11);
        expect(r.to.getDate()).toBe(17);
    });
    it('lunes 2026-05-11 → lunes 11 / domingo 17', () => {
        const mon = new Date(2026, 4, 11);
        const r = getCurrentWeekRange(mon);
        expect(r.from.getDate()).toBe(11);
        expect(r.to.getDate()).toBe(17);
    });
    it('cruza fin de mes', () => {
        // jueves 2026-04-30 → lunes 27 abril / domingo 3 mayo
        const thu = new Date(2026, 3, 30);
        const r = getCurrentWeekRange(thu);
        expect(r.from.getMonth()).toBe(3);
        expect(r.from.getDate()).toBe(27);
        expect(r.to.getMonth()).toBe(4);
        expect(r.to.getDate()).toBe(3);
    });
});

describe('getCurrentMonthRange', () => {
    it('mayo 2026 → 1 → 31', () => {
        const r = getCurrentMonthRange(new Date(2026, 4, 12));
        expect(r.from.getDate()).toBe(1);
        expect(r.to.getDate()).toBe(31);
    });
    it('febrero año no bisiesto → 1 → 28', () => {
        const r = getCurrentMonthRange(new Date(2025, 1, 10));
        expect(r.from.getDate()).toBe(1);
        expect(r.to.getDate()).toBe(28);
    });
    it('febrero año bisiesto 2024 → 1 → 29', () => {
        const r = getCurrentMonthRange(new Date(2024, 1, 10));
        expect(r.to.getDate()).toBe(29);
    });
    it('abril → 30 días', () => {
        const r = getCurrentMonthRange(new Date(2026, 3, 15));
        expect(r.to.getDate()).toBe(30);
    });
});

describe('getSingleDayRange', () => {
    it('normaliza una fecha al rango 00:00 → 23:59', () => {
        const r = getSingleDayRange(new Date(2026, 4, 12, 9, 0));
        expect(r.from.getHours()).toBe(0);
        expect(r.to.getHours()).toBe(23);
    });
});

describe('normalizeDateRange', () => {
    it('ambos null devuelve null', () => {
        expect(normalizeDateRange(null, null)).toBeNull();
    });
    it('solo from → rango de ese día', () => {
        const r = normalizeDateRange(new Date(2026, 4, 12), null)!;
        expect(isSameDay(r.from, r.to)).toBe(true);
    });
    it('reordena si están invertidos', () => {
        const r = normalizeDateRange(new Date(2026, 4, 20), new Date(2026, 4, 10))!;
        expect(r.from.getDate()).toBe(10);
        expect(r.to.getDate()).toBe(20);
    });
    it('extiende a inicio/fin de día', () => {
        const r = normalizeDateRange(new Date(2026, 4, 10, 14), new Date(2026, 4, 20, 8))!;
        expect(r.from.getHours()).toBe(0);
        expect(r.to.getHours()).toBe(23);
    });
});

describe('formatDateForAPI', () => {
    it('formato YYYY-MM-DD en timezone local', () => {
        // Ojo: hora local no debe cambiar el día renderizado
        const d = new Date(2026, 4, 12, 23, 59);
        expect(formatDateForAPI(d)).toBe('2026-05-12');
    });
    it('pads ceros', () => {
        const d = new Date(2026, 0, 5);
        expect(formatDateForAPI(d)).toBe('2026-01-05');
    });
});
