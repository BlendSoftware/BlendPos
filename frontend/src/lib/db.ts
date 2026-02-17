// db.ts — Dexie (IndexedDB) database for offline-first PWA
// SyncQueue stores operations performed while offline

import Dexie, { type Table } from 'dexie'

export interface SyncQueueItem {
  id?: number
  operation: 'venta' | 'anulacion'
  payload: unknown
  timestamp: number
  retryCount: number
}

export class BlendPOSDB extends Dexie {
  syncQueue!: Table<SyncQueueItem>

  constructor() {
    super('blendpos')
    this.version(1).stores({
      syncQueue: '++id, operation, timestamp'
    })
  }
}

export const db = new BlendPOSDB()
