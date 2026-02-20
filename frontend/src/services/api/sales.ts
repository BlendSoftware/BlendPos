import type { LocalSale } from '../../offline/db';
import { apiPostJson } from './http';

export async function syncSalesBatch(sales: LocalSale[]): Promise<void> {
    const baseUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '';
    if (!baseUrl) {
        // Modo mock: sin backend real todavía.
        await new Promise((r) => setTimeout(r, 250));
        return;
    }
    await apiPostJson('/v1/ventas/sync-batch', { sales });
}
