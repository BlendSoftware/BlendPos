import { registerSW } from 'virtual:pwa-register';
import { trySyncQueue } from './offline/sync';

// Registra el Service Worker solo en producción.
// En dev con registerType:'autoUpdate' + HMR el SW se actualiza constantemente
// y dispara recargas infinitas de página. devOptions.enabled=false en vite.config.ts
// hace que registerSW sea un no-op en dev, así que la llamada es segura.
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
