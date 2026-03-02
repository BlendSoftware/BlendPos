import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../offline/db';
import { enqueueSale } from '../../offline/sync';
import type { SaleRecord } from '../../store/useSaleStore';

function makeSale(overrides?: Partial<SaleRecord>): SaleRecord {
    return {
        id: crypto.randomUUID(),
        numeroTicket: '001',
        fecha: new Date(),
        items: [
            {
                id: crypto.randomUUID(),
                nombre: 'Test Product',
                precio: 1000,
                cantidad: 1,
                subtotal: 1000,
                codigoBarras: '7790001000012',
            },
        ],
        total: 1000,
        totalConDescuento: 1000,
        metodoPago: 'efectivo',
        cajero: 'testuser',
        sesionCajaId: crypto.randomUUID(),
        ...overrides,
    } as SaleRecord;
}

describe('syncQueue - enqueueSale', () => {
    beforeEach(async () => {
        await db.sales.clear();
        await db.sync_queue.clear();
    });

    it('enqueues a sale with status "pending"', async () => {
        const sale = makeSale();
        await enqueueSale(sale);

        const queueItems = await db.sync_queue.toArray();
        expect(queueItems).toHaveLength(1);
        expect(queueItems[0].status).toBe('pending');
        expect(queueItems[0].tries).toBe(0);
        expect(queueItems[0].type).toBe('sale');
    });

    it('persists the sale locally', async () => {
        const sale = makeSale();
        await enqueueSale(sale);

        const stored = await db.sales.get(sale.id);
        expect(stored).toBeDefined();
        expect(stored!.id).toBe(sale.id);
        expect(stored!.synced).toBe(0);
    });

    it('stores the saleId in queue payload', async () => {
        const sale = makeSale();
        await enqueueSale(sale);

        const queueItems = await db.sync_queue.toArray();
        const payload = queueItems[0].payload as { saleId: string };
        expect(payload.saleId).toBe(sale.id);
    });

    it('can enqueue multiple sales', async () => {
        await enqueueSale(makeSale());
        await enqueueSale(makeSale());
        await enqueueSale(makeSale());

        const queueItems = await db.sync_queue.toArray();
        expect(queueItems).toHaveLength(3);
    });

    it('sets createdAt timestamp', async () => {
        const before = new Date().toISOString();
        await enqueueSale(makeSale());
        const after = new Date().toISOString();

        const queueItems = await db.sync_queue.toArray();
        expect(queueItems[0].createdAt >= before).toBe(true);
        expect(queueItems[0].createdAt <= after).toBe(true);
    });
});
