// ─────────────────────────────────────────────────────────────────────────────
// Formatters — utilidades de formato compartidas
// ─────────────────────────────────────────────────────────────────────────────

export function formatARS(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}
