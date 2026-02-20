/**
 * usePrinterStore — Configuración persistente de la impresora térmica.
 *
 * Los ajustes se guardan en localStorage con la clave 'blendpos-printer-config'
 * y se restauran automáticamente al recargar la página.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PrinterConfig } from '../services/ThermalPrinterService';
import { DEFAULT_PRINTER_CONFIG } from '../services/ThermalPrinterService';

interface PrinterState {
    config: PrinterConfig;
    setConfig: (partial: Partial<PrinterConfig>) => void;
    reset: () => void;
}

export const usePrinterStore = create<PrinterState>()(
    persist(
        (set) => ({
            config: { ...DEFAULT_PRINTER_CONFIG },
            setConfig: (partial) =>
                set((s) => ({ config: { ...s.config, ...partial } })),
            reset: () => set({ config: { ...DEFAULT_PRINTER_CONFIG } }),
        }),
        { name: 'blendpos-printer-config' },
    ),
);
