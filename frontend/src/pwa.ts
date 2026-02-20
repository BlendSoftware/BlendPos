import { registerSW } from 'virtual:pwa-register';
import { trySyncQueue } from './offline/sync';

// Registra el Service Worker generado/inyectado por vite-plugin-pwa.
registerSW({
    immediate: true,
});

/**
 * Escucha mensajes del Service Worker.
 * Cuando el SW detecta conectividad (Background Sync 'blendpos-sync-ventas'),
 * envía { type: 'SYNC_SALES' } para que el main thread ejecute trySyncQueue().
 */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type === 'SYNC_SALES') {
            trySyncQueue().catch(console.warn);
        }
    });
}
