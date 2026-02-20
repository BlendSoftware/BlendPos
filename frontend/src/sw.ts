/// <reference lib="webworker" />

/**
 * Custom Service Worker — BlendPOS
 *
 * Responsabilidades:
 * 1. Pre-caché de assets (inyectado por vite-plugin-pwa con injectManifest).
 * 2. Background Sync: cuando el navegador recupera conectividad, el SW
 *    notifica a la pestaña activa para que ejecute trySyncQueue().
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
    addEventListener(type: 'sync', listener: (event: ExtendableEvent & { tag: string }) => void, options?: boolean | AddEventListenerOptions): void;
};

// ── Precache ──────────────────────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Background Sync ───────────────────────────────────────────────────────────
/**
 * 'sync' event: disparado por el browser cuando la conexión se restaura
 * y el tag 'blendpos-sync-ventas' está pendiente.
 *
 * Estrategia: postMessage a todos los clientes (pestañas) abiertos para
 * que ejecuten trySyncQueue() en el main thread donde IndexedDB está disponible.
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'blendpos-sync-ventas') {
        event.waitUntil(notifyClientsToSync());
    }
});

async function notifyClientsToSync(): Promise<void> {
    const clients = await self.clients.matchAll({
        includeUncontrolled: true,
        type: 'window',
    });
    for (const client of clients) {
        client.postMessage({ type: 'SYNC_SALES' });
    }
}

// ── Activate ──────────────────────────────────────────────────────────────────
// Toma control inmediato de todos los clientes sin esperar recarga.
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
