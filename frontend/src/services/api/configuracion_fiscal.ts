import { apiClient } from '../../api/client';

export interface ConfiguracionFiscalResponse {
    cuit_emisor: string;
    razon_social: string;
    condicion_fiscal: string;
    punto_de_venta: number;
    modo: string;
    fecha_inicio_actividades?: string;
    iibb?: string;
    tiene_certificado_crt: boolean;
    tiene_certificado_key: boolean;
}

interface APIResponseWrapper<T> {
    data: T;
    message?: string;
}

export interface UpdateConfiguracionFiscalResult {
    message: string;
    /** Present when config was saved but AFIP WSAA auth failed (HTTP 200 with warning). */
    afip_warning?: string;
}

export async function getConfiguracionFiscal(): Promise<ConfiguracionFiscalResponse> {
    const res = await apiClient.get<APIResponseWrapper<ConfiguracionFiscalResponse>>('/v1/configuracion/fiscal');
    return res.data;
}

export async function updateConfiguracionFiscal(
    data: Omit<ConfiguracionFiscalResponse, 'tiene_certificado_crt' | 'tiene_certificado_key'>,
    crtFile?: File | null,
    keyFile?: File | null,
): Promise<UpdateConfiguracionFiscalResult> {
    // Use FormData + native fetch to support file uploads,
    // since apiClient.put() serialises to JSON and can't handle multipart.
    const form = new FormData();
    form.append('cuit_emisor', data.cuit_emisor);
    form.append('razon_social', data.razon_social);
    form.append('condicion_fiscal', data.condicion_fiscal);
    form.append('punto_de_venta', String(data.punto_de_venta));
    form.append('modo', data.modo);
    if (data.fecha_inicio_actividades) form.append('fecha_inicio_actividades', data.fecha_inicio_actividades);
    if (data.iibb) form.append('iibb', data.iibb);
    if (crtFile) form.append('certificado_crt', crtFile);
    if (keyFile) form.append('certificado_key', keyFile);

    // apiClient doesn't support multipart, so use fetch directly.
    const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';
    const { tokenStore } = await import('../../store/tokenStore');
    const token = tokenStore.getAccessToken();

    const res = await fetch(`${BASE_URL}/v1/configuracion/fiscal`, {
        method: 'PUT',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body}`);
    }

    return res.json() as Promise<UpdateConfiguracionFiscalResult>;
}
