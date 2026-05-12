import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock notifications (Mantine) — no DOM side-effects en tests.
vi.mock('@mantine/notifications', () => ({
    notifications: { show: vi.fn() },
}));

// Mock offline catalog — stock siempre suficiente, no toca IndexedDB.
vi.mock('../../offline/catalog', () => ({
    getLocalStock: vi.fn().mockResolvedValue(999),
    deductLocalStock: vi.fn().mockResolvedValue(undefined),
}));

import { useCartStore } from '../useCartStore';

async function addItem(opts: Parameters<ReturnType<typeof useCartStore.getState>['addItem']>[0]) {
    await useCartStore.getState().addItem(opts);
    // El store usa setTimeout para limpiar lastAdded → en tests no necesitamos esperar.
}

beforeEach(() => {
    useCartStore.getState().clearCart();
});

describe('useCartStore — cantidad', () => {
    it('addItem crea línea con cantidad 1 y subtotal = precio', async () => {
        await addItem({ id: 'p1', nombre: 'Producto A', precio: 100, codigoBarras: '111' });
        const s = useCartStore.getState();
        expect(s.cart).toHaveLength(1);
        expect(s.cart[0].cantidad).toBe(1);
        expect(s.cart[0].subtotal).toBe(100);
        expect(s.total).toBe(100);
        expect(s.totalConDescuento).toBe(100);
    });

    it('addItem dos veces incrementa cantidad', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 100, codigoBarras: '111' });
        await addItem({ id: 'p1', nombre: 'A', precio: 100, codigoBarras: '111' });
        const s = useCartStore.getState();
        expect(s.cart[0].cantidad).toBe(2);
        expect(s.cart[0].subtotal).toBe(200);
        expect(s.total).toBe(200);
    });

    it('updateQuantity recalcula subtotal y totales', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 50, codigoBarras: '111' });
        await useCartStore.getState().updateQuantity('p1', 5);
        const s = useCartStore.getState();
        expect(s.cart[0].cantidad).toBe(5);
        expect(s.cart[0].subtotal).toBe(250);
        expect(s.total).toBe(250);
    });

    it('updateQuantity con 0 elimina el ítem', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 50, codigoBarras: '111' });
        await useCartStore.getState().updateQuantity('p1', 0);
        expect(useCartStore.getState().cart).toHaveLength(0);
    });
});

describe('useCartStore — mayorista', () => {
    it('addItem guarda precioMinoristaOriginal y precioMayorista correctamente', async () => {
        await addItem({ id: 'p1', nombre: 'Cigarro', precio: 1000, precioMayorista: 800, codigoBarras: '111' });
        const item = useCartStore.getState().cart[0];
        expect(item.precio).toBe(1000); // arranca minorista
        expect(item.precioMinoristaOriginal).toBe(1000);
        expect(item.precioMayorista).toBe(800);
        expect(item.tipoPrecio).toBe('minorista');
    });

    it('setItemPriceType("mayorista") cambia precio efectivo y recalcula', async () => {
        await addItem({ id: 'p1', nombre: 'Cigarro', precio: 1000, precioMayorista: 800, codigoBarras: '111' });
        await useCartStore.getState().updateQuantity('p1', 3);
        useCartStore.getState().setItemPriceType('p1', 'mayorista');
        const s = useCartStore.getState();
        expect(s.cart[0].precio).toBe(800);
        expect(s.cart[0].tipoPrecio).toBe('mayorista');
        expect(s.cart[0].subtotal).toBe(2400);
        expect(s.total).toBe(2400);
    });

    it('volver a minorista restaura precio original', async () => {
        await addItem({ id: 'p1', nombre: 'Cigarro', precio: 1000, precioMayorista: 800, codigoBarras: '111' });
        useCartStore.getState().setItemPriceType('p1', 'mayorista');
        useCartStore.getState().setItemPriceType('p1', 'minorista');
        expect(useCartStore.getState().cart[0].precio).toBe(1000);
    });

    it('setItemPriceType es no-op si el producto no tiene precio mayorista', async () => {
        await addItem({ id: 'p1', nombre: 'X', precio: 500, precioMayorista: null, codigoBarras: '111' });
        useCartStore.getState().setItemPriceType('p1', 'mayorista');
        expect(useCartStore.getState().cart[0].precio).toBe(500);
        expect(useCartStore.getState().cart[0].tipoPrecio).toBe('minorista');
    });

    it('mayorista afecta solo al ítem seleccionado, no a otros', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 1000, precioMayorista: 800, codigoBarras: '111' });
        await addItem({ id: 'p2', nombre: 'B', precio: 500, precioMayorista: 400, codigoBarras: '222' });
        useCartStore.getState().setItemPriceType('p1', 'mayorista');
        const cart = useCartStore.getState().cart;
        expect(cart.find((c) => c.id === 'p1')!.precio).toBe(800);
        expect(cart.find((c) => c.id === 'p2')!.precio).toBe(500);
    });
});

describe('useCartStore — descuento global', () => {
    it('porcentaje 10% sobre $1000 → totalConDescuento $900', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 1000, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'percentage', value: 10 });
        const s = useCartStore.getState();
        expect(s.globalDiscount.amount).toBe(100);
        expect(s.totalConDescuento).toBe(900);
        expect(s.descuentoGlobal).toBe(10); // legacy
    });

    it('monto fijo $300 sobre $1000 → totalConDescuento $700', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 1000, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'fixed', value: 300 });
        const s = useCartStore.getState();
        expect(s.globalDiscount.amount).toBe(300);
        expect(s.totalConDescuento).toBe(700);
        expect(s.descuentoGlobal).toBe(0); // legacy no aplica para fixed
    });

    it('monto fijo mayor al total se autolimita', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 500, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'fixed', value: 9999 });
        const s = useCartStore.getState();
        expect(s.globalDiscount.value).toBe(500); // clampeado al total
        expect(s.totalConDescuento).toBe(0);
    });

    it('total final nunca queda negativo', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 100, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'percentage', value: 200 });
        expect(useCartStore.getState().totalConDescuento).toBe(0);
    });

    it('clearGlobalDiscount restaura totales', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 1000, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'fixed', value: 200 });
        useCartStore.getState().clearGlobalDiscount();
        const s = useCartStore.getState();
        expect(s.globalDiscount.amount).toBe(0);
        expect(s.totalConDescuento).toBe(1000);
    });

    it('cambiar cantidad recalcula el monto del descuento global', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 100, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'percentage', value: 10 });
        await useCartStore.getState().updateQuantity('p1', 5); // total ahora $500
        const s = useCartStore.getState();
        expect(s.total).toBe(500);
        expect(s.globalDiscount.amount).toBe(50);
        expect(s.totalConDescuento).toBe(450);
    });

    it('activar mayorista recalcula el descuento global', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 1000, precioMayorista: 600, codigoBarras: '111' });
        useCartStore.getState().setGlobalDiscount({ type: 'percentage', value: 10 });
        useCartStore.getState().setItemPriceType('p1', 'mayorista');
        const s = useCartStore.getState();
        expect(s.total).toBe(600);
        expect(s.globalDiscount.amount).toBe(60);
        expect(s.totalConDescuento).toBe(540);
    });
});

describe('useCartStore — descuento por ítem coexistiendo con mayorista', () => {
    it('descuento manual % se aplica sobre precio aplicado (mayorista)', async () => {
        await addItem({ id: 'p1', nombre: 'A', precio: 1000, precioMayorista: 800, codigoBarras: '111' });
        useCartStore.getState().setItemPriceType('p1', 'mayorista');
        useCartStore.getState().setItemDiscount('p1', 10);
        // subtotal = 800 * 1 * (1 - 0.10) = 720
        expect(useCartStore.getState().cart[0].subtotal).toBe(720);
    });
});
