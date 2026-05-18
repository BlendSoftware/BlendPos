import Dexie, { type Table } from 'dexie';
import type { CartItem, MetodoPago, PagoDetalle } from '../store/useCartStore';
import type { AppliedDiscount } from '../utils/money';

export interface LocalSale {
    id: string;
    numeroTicket: string;
    fecha: string; // ISO
    items: CartItem[];
    total: number;
    totalConDescuento: number;
    metodoPago: MetodoPago;
    pagos?: PagoDetalle[];
    efectivoRecibido?: number;
    vuelto?: number;
    cajero: string;
    /** ID de sesión de caja activa al momento de la venta. */
    sesionCajaId?: string;
    /** Email del cliente para envío de comprobante digital. */
    clienteEmail?: string;
    /** Tipo de comprobante fiscal. Defaults to 'ticket_interno'. */
    tipoComprobante?: 'ticket_interno' | 'factura_a' | 'factura_b' | 'factura_c';
    /** CUIT del receptor (requerido para factura_a). */
    cuitReceptor?: string;
    /** 80=CUIT, 96=DNI, 99=Consumidor Final. */
    tipoDocReceptor?: number;
    /** Documento/CUIT del comprador. */
    nroDocReceptor?: string;
    /** Nombre/Razón Social del receptor. */
    receptorNombre?: string;
    /** Domicilio del comprador para comprobantes fiscales. */
    receptorDomicilio?: string;
    /**
     * Descuento global canónico (tipo + valor + monto). Agregado en Dexie v5.
     * Las ventas anteriores tienen este campo derivado del legacy `descuentoGlobal` durante upgrade.
     */
    globalDiscount?: AppliedDiscount;
    /**
     * Legacy: porcentaje 0-100. Se mantiene para retrocompatibilidad de tickets y vistas históricas.
     * En ventas nuevas se llena solo cuando globalDiscount.type === 'percentage'.
     */
    descuentoGlobal?: number;
    synced: 0 | 1;
}

export type SyncQueueStatus = 'pending' | 'synced' | 'error';

export interface SyncQueueItem {
    id?: number;
    type: 'sale';
    payload: unknown;
    createdAt: string; // ISO
    updatedAt?: string; // ISO
    status: SyncQueueStatus;
    tries: number;
    nextAttemptAt?: string; // ISO
    lastError?: string;
}

export interface LocalProduct {
    id: string;
    codigoBarras: string;
    nombre: string;
    precio: number;
    /** Precio mayorista opcional. Undefined/null/0 = sin precio mayorista. */
    precioMayorista?: number | null;
    stock: number;
}

export interface SyncMeta {
    key: string;   // e.g. 'catalogLastSyncAt'
    value: string; // ISO-8601 timestamp
}

class BlendPosDB extends Dexie {
    sales!: Table<LocalSale, string>;
    sync_queue!: Table<SyncQueueItem, number>;
    products!: Table<LocalProduct, string>;
    sync_meta!: Table<SyncMeta, string>;

    constructor() {
        super('blendpos-db');
        this.version(1).stores({
            sales: 'id, fecha, synced',
            sync_queue: '++id, status, createdAt, type',
            products: 'id, codigoBarras, nombre',
        });

        // v2: agrega campos para backoff (nextAttemptAt/updatedAt)
        this.version(2).stores({
            sales: 'id, fecha, synced',
            sync_queue: '++id, status, createdAt, type, nextAttemptAt',
            products: 'id, codigoBarras, nombre',
        });

        // v3: agrega stock al catálogo local para filtrar sin-stock en POS
        this.version(3).stores({
            sales: 'id, fecha, synced',
            sync_queue: '++id, status, createdAt, type, nextAttemptAt',
            products: 'id, codigoBarras, nombre, stock',
        });

        // v4: agrega sync_meta para rastrear lastSyncAt del catálogo (delta sync)
        this.version(4).stores({
            sales: 'id, fecha, synced',
            sync_queue: '++id, status, createdAt, type, nextAttemptAt',
            products: 'id, codigoBarras, nombre, stock',
            sync_meta: 'key',
        });

        // v5: schema unchanged. El upgrade migra in-place el campo legacy
        // `descuentoGlobal: number` (porcentaje) al canónico `globalDiscount: AppliedDiscount`.
        // Las ventas nuevas escriben ambos campos para tickets y vistas que aún leen el legacy.
        this.version(5)
            .stores({
                sales: 'id, fecha, synced',
                sync_queue: '++id, status, createdAt, type, nextAttemptAt',
                products: 'id, codigoBarras, nombre, stock',
                sync_meta: 'key',
            })
            .upgrade(async (tx) => {
                await tx.table('sales').toCollection().modify((sale: LocalSale) => {
                    if (sale.globalDiscount) return;
                    const pct = sale.descuentoGlobal ?? 0;
                    if (pct <= 0) return;
                    const amount = (sale.total ?? 0) * pct / 100;
                    sale.globalDiscount = {
                        type: 'percentage',
                        value: pct,
                        amount: Math.round(amount * 100) / 100,
                    };
                });
            });
    }
}

export const db = new BlendPosDB();
