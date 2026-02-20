import { useState, useEffect, useRef } from 'react';

/**
 * useSimulatedLoad — Simula la latencia de una llamada a la API.
 *
 * Devuelve `loading: true` durante `delayMs` ms y luego `false`.
 * Útil para mostrar skeletons mientras se espera la conexión al backend.
 *
 * CUANDO SE CONECTE LA API REAL: reemplazar esta lógica por el estado real
 * del hook de fetching (useQuery, SWR, o lo que se use).
 *
 * @param delayMs  Tiempo de simulación en ms (default: 600)
 */
export function useSimulatedLoad(delayMs = 600): boolean {
    const [loading, setLoading] = useState(true);
    // Avoid state update on unmounted component
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        const timer = setTimeout(() => {
            if (mounted.current) setLoading(false);
        }, delayMs);
        return () => {
            mounted.current = false;
            clearTimeout(timer);
        };
    }, [delayMs]);

    return loading;
}
