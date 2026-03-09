import { useEffect, useState } from 'react';
import { getConfiguracionFiscal, type ConfiguracionFiscalResponse } from '../services/api/configuracion_fiscal';

/**
 * Hook to fetch and cache fiscal configuration.
 * Returns the configuration and loading state.
 */
export function useConfiguracionFiscal() {
    const [config, setConfig] = useState<ConfiguracionFiscalResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        getConfiguracionFiscal()
            .then((cfg) => {
                setConfig(cfg);
                setError(null);
            })
            .catch((err) => {
                console.error('Error al cargar configuración fiscal:', err);
                setError(err);
                // Set default config on error to allow POS to function
                setConfig({
                    cuit_emisor: '',
                    razon_social: '',
                    condicion_fiscal: 'Monotributo',
                    punto_de_venta: 1,
                    modo: 'homologacion',
                    tiene_certificado_crt: false,
                    tiene_certificado_key: false,
                });
            })
            .finally(() => setLoading(false));
    }, []);

    return { config, loading, error };
}
