import { useCallback, useEffect, useRef, useState } from 'react';
import { getSyncStats, trySyncQueue } from '../offline/sync';
import { notifications } from '@mantine/notifications';

const BASE_INTERVAL_MS = 30_000;   // 30 s initial retry
const MAX_INTERVAL_MS = 5 * 60_000; // 5 min max
const QUEUE_ALERT_LIMIT = 100;

export type SyncState = 'idle' | 'syncing' | 'error';

export function useSyncStatus() {
    const [pending, setPending] = useState(0);
    const [error, setError] = useState(0);
    const [syncState, setSyncState] = useState<SyncState>('idle');

    const intervalRef = useRef(BASE_INTERVAL_MS);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const alertedRef = useRef(false); // prevent repeated >100 alerts

    // ── Core sync attempt with adaptive backoff ──────────────────────────
    const attemptSync = useCallback(async () => {
        if (!navigator.onLine) { setSyncState('idle'); return; }
        setSyncState('syncing');
        try {
            await trySyncQueue();
            // On success → reset interval
            intervalRef.current = BASE_INTERVAL_MS;
            setSyncState('idle');
        } catch (err) {
            // Network errors while offline → don't alarm the user
            // Keep state as 'idle' to avoid showing error badges
            intervalRef.current = Math.min(intervalRef.current * 2, MAX_INTERVAL_MS);
            setSyncState('idle');
        }
    }, []);

    // ── Scheduled loop ───────────────────────────────────────────────────
    const scheduleNextRef = useRef<() => void>(() => { });
    const scheduleNext = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            await attemptSync();
            // Refresh stats after sync
            const stats = await getSyncStats();
            setPending(stats.pending);
            setError(stats.error);
            scheduleNextRef.current();
        }, intervalRef.current);
    }, [attemptSync]);
    useEffect(() => { scheduleNextRef.current = scheduleNext; }, [scheduleNext]);

    useEffect(() => {
        let mounted = true;

        // ── Poll stats every 2 s for UI responsiveness ───────────────────
        const statsInterval = setInterval(async () => {
            const stats = await getSyncStats();
            if (!mounted) return;
            setPending(stats.pending);
            setError(stats.error);

            // Queue overflow alert
            if (stats.pending > QUEUE_ALERT_LIMIT && !alertedRef.current) {
                alertedRef.current = true;
                notifications.show({
                    title: 'Cola de sincronización grande',
                    message: `Hay ${stats.pending} ventas pendientes de sincronizar. Verificá la conexión al servidor.`,
                    color: 'orange',
                    autoClose: false,
                });
            }
            if (stats.pending <= QUEUE_ALERT_LIMIT) {
                alertedRef.current = false;
            }
        }, 2_000);

        // ── Connectivity events ──────────────────────────────────────────
        const onOnline = () => {
            // Reset backoff and sync immediately on reconnect
            intervalRef.current = BASE_INTERVAL_MS;
            attemptSync().catch(console.warn);

            // Register Background Sync tag
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready
                    .then((reg) => {
                        if ('sync' in reg) {
                            (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
                                .sync.register('blendpos-sync-ventas')
                                .catch(console.warn);
                        }
                    })
                    .catch(console.warn);
            }
        };

        window.addEventListener('online', onOnline);

        // Kick off first sync + schedule loop
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Async: setState happens after await, not synchronously
        attemptSync().catch(console.warn);
        scheduleNext();

        return () => {
            mounted = false;
            clearInterval(statsInterval);
            if (timerRef.current) clearTimeout(timerRef.current);
            window.removeEventListener('online', onOnline);
        };
    }, [attemptSync, scheduleNext]);

    return { pending, error, syncState };
}
