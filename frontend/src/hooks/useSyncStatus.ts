import { useEffect, useState } from 'react';
import { getSyncStats, trySyncQueue } from '../offline/sync';

export function useSyncStatus() {
    const [pending, setPending] = useState(0);
    const [error, setError] = useState(0);

    useEffect(() => {
        let mounted = true;

        const refresh = async () => {
            const stats = await getSyncStats();
            if (!mounted) return;
            setPending(stats.pending);
            setError(stats.error);
        };

        refresh();

        const interval = setInterval(refresh, 2000);

        const syncInterval = setInterval(() => {
            if (!navigator.onLine) return;
            trySyncQueue().catch(console.warn);
        }, 5000);

        const onOnline = () => {
            trySyncQueue().catch(console.warn);
            refresh().catch(console.warn);
            // Also register a Background Sync task so the SW can retry when tab reopens
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

        return () => {
            mounted = false;
            clearInterval(interval);
            clearInterval(syncInterval);
            window.removeEventListener('online', onOnline);
        };
    }, []);

    return { pending, error };
}
