// ─────────────────────────────────────────────────────────────────────────────
// Date helpers — rangos calendario (no "últimos N días") en timezone local.
//
// Convención:
//   - `from` siempre 00:00:00.000 del día inicial
//   - `to`   siempre 23:59:59.999 del día final
//   - Semana ISO: lunes (start) → domingo (end)
//   - Mes: día 1 → último día real (28/29/30/31)
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRange {
    from: Date;
    to: Date;
}

export function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/** Hoy: 00:00:00 → 23:59:59 (día calendario actual). */
export function getTodayRange(reference: Date = new Date()): DateRange {
    return { from: startOfDay(reference), to: endOfDay(reference) };
}

/** Ayer: 00:00:00 → 23:59:59 del día anterior. */
export function getYesterdayRange(reference: Date = new Date()): DateRange {
    const y = new Date(reference);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
}

/**
 * Semana ISO actual: LUNES 00:00:00 → DOMINGO 23:59:59.
 * No es "últimos 7 días".
 */
export function getCurrentWeekRange(reference: Date = new Date()): DateRange {
    const d = new Date(reference);
    const day = d.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: startOfDay(monday), to: endOfDay(sunday) };
}

/**
 * Mes calendario actual: día 1 → último día real del mes.
 * Contempla 28/29/30/31 días sin hardcodeos.
 */
export function getCurrentMonthRange(reference: Date = new Date()): DateRange {
    const year = reference.getFullYear();
    const month = reference.getMonth();
    const first = new Date(year, month, 1);
    // day 0 del mes siguiente = último día real del mes actual
    const last = new Date(year, month + 1, 0);
    return { from: startOfDay(first), to: endOfDay(last) };
}

/** Rango de un día específico, normalizado a 00:00:00 → 23:59:59. */
export function getSingleDayRange(date: Date): DateRange {
    return { from: startOfDay(date), to: endOfDay(date) };
}

/**
 * Normaliza un rango ingresado por el usuario:
 *   - acepta solo `from`, solo `to` o ambos
 *   - si están invertidos, los reordena
 *   - extiende a 00:00:00 / 23:59:59
 * Devuelve null si ambos son null.
 */
export function normalizeDateRange(from: Date | null, to: Date | null): DateRange | null {
    if (!from && !to) return null;
    const f = from ?? to!;
    const t = to ?? from!;
    if (f.getTime() > t.getTime()) {
        return { from: startOfDay(t), to: endOfDay(f) };
    }
    return { from: startOfDay(f), to: endOfDay(t) };
}

/**
 * Serializa una fecha al formato 'YYYY-MM-DD' usando el timezone LOCAL.
 * Evita el bug de `toISOString()` que convierte a UTC y puede correr el día.
 */
export function formatDateForAPI(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Helper de etiqueta humana para mostrar el rango activo. */
export function formatRangeLabel(range: DateRange): string {
    const fmt = (d: Date) =>
        new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    if (isSameDay(range.from, range.to)) return fmt(range.from);
    return `${fmt(range.from)} – ${fmt(range.to)}`;
}
