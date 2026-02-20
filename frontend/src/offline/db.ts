import Dexie, { type Table } from 'dexie';
import type { CartItem, MetodoPago, PagoDetalle } from '../store/useSaleStore';

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
}

class BlendPosDB extends Dexie {
    sales!: Table<LocalSale, string>;
    sync_queue!: Table<SyncQueueItem, number>;
    products!: Table<LocalProduct, string>;

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
    }
}

export const db = new BlendPosDB();
