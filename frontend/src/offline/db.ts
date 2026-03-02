import Dexie, { type Table } from 'dexie';
import type { CartItem, MetodoPago, PagoDetalle } from '../store/useCartStore';

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
    }
}

export const db = new BlendPosDB();
