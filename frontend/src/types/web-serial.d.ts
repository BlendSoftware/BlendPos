// Tipos mínimos para Web Serial API.
// Evita depender de @types externos y permite compilar en entornos donde
// TypeScript no incluye estas definiciones.

export {};

declare global {
    interface SerialPortInfo {
        usbVendorId?: number;
        usbProductId?: number;
    }

    interface SerialPort {
        getInfo?: () => SerialPortInfo;
        open: (options: { baudRate: number }) => Promise<void>;
        close: () => Promise<void>;
        readable: ReadableStream<Uint8Array> | null;
        writable: WritableStream<Uint8Array> | null;
    }

    interface Serial {
        requestPort: () => Promise<SerialPort>;
        getPorts?: () => Promise<SerialPort[]>;
    }

    interface Navigator {
        serial?: Serial;
    }
}
