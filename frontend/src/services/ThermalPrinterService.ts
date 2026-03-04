/**
 * ThermalPrinterService — Simulación de impresora ESC/POS de 58mm
 *
 * En producción este servicio enviaría comandos ESC/POS a una impresora
 * térmica via USB/Serial/Network. Por ahora genera un buffer de texto plano
 * formateado para rollo de 58mm (32 caracteres de ancho) y lo imprime
 * en consola simulando la salida de papel.
 */

import type { CartItem } from '../store/useCartStore';
import type { SaleRecord } from '../store/useSaleStore';

// ── Printer configuration ─────────────────────────────────────────────────────

/** Configuración de la impresora térmica (persistida en PrinterStore). */
export interface PrinterConfig {
    /** Nombre del comercio en el encabezado del ticket */
    storeName: string;
    /** Subtítulo / descripción breve del comercio */
    storeSubtitle: string;
    /** Dirección del local (opcional) */
    storeAddress: string;
    /** Teléfono del local (opcional) */
    storePhone: string;
    /** Mensaje de pie de ticket */
    storeFooter: string;
    /** Ancho de papel: 32 = 58 mm · 48 = 80 mm */
    paperWidth: 32 | 48;
    /** Velocidad de comunicación serie (baud rate) */
    baudRate: 9600 | 19200 | 38400 | 115200;
    /** Cantidad de copias a imprimir por venta */
    copies: 1 | 2;
    /** Abrir cajón portamonedas al finalizar la impresión */
    openDrawer: boolean;
    /** Página de códigos ESC/POS: 0 = PC437 · 2 = PC850 · 16 = PC858 */
    codePage: 0 | 2 | 16;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
    storeName: 'BLEND POS',
    storeSubtitle: 'Sistema de Punto de Venta',
    storeAddress: '',
    storePhone: '',
    storeFooter: '\u00a1Gracias por su compra!',
    paperWidth: 32,
    baudRate: 9600,
    copies: 1,
    openDrawer: true,
    codePage: 2,
};

/** Ancho de papel por defecto (58 mm = 32 caracteres) */
const PAPER_WIDTH = 32;

// ── Helpers de formato ────────────────────────────────────────────────────────

function repeat(char: string, n: number): string {
    return char.repeat(Math.max(0, n));
}

function center(text: string, width = PAPER_WIDTH): string {
    const pad = Math.max(0, width - text.length);
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return repeat(' ', left) + text + repeat(' ', right);
}

function leftRight(left: string, right: string, width = PAPER_WIDTH): string {
    const maxLeft = width - right.length - 1;
    const trimmedLeft = left.length > maxLeft ? left.substring(0, maxLeft - 1) + '…' : left;
    const spaces = width - trimmedLeft.length - right.length;
    return trimmedLeft + repeat(' ', Math.max(1, spaces)) + right;
}

function divider(char = '-', width = PAPER_WIDTH): string {
    return repeat(char, width);
}

function formatPrice(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

// ── Core ─────────────────────────────────────────────────────────────────────

export interface PrintTicketOptions {
    /** Número de copia (default: 1) */
    copy?: number;
}

export class ThermalPrinterService {
    private static instance: ThermalPrinterService | null = null;

    private static readonly STORAGE_KEY_LAST_PORT_INFO = 'pos.printer.lastPortInfo';
    private static readonly DEFAULT_BAUD_RATE = 9600;

    // ── Web Serial state ──────────────────────────────────────────────────────
    private port: SerialPort | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    isConnected = false;

    private constructor() {}

    static getInstance(): ThermalPrinterService {
        if (!ThermalPrinterService.instance) {
            ThermalPrinterService.instance = new ThermalPrinterService();
        }
        return ThermalPrinterService.instance;
    }

    // ── Web Serial API ────────────────────────────────────────────────────────

    private canUseWebSerial(): boolean {
        return typeof navigator !== 'undefined' && !!navigator.serial;
    }

    private getLastPortInfo(): { usbVendorId?: number; usbProductId?: number } | null {
        try {
            const raw = localStorage.getItem(ThermalPrinterService.STORAGE_KEY_LAST_PORT_INFO);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object') return null;
            const obj = parsed as { usbVendorId?: unknown; usbProductId?: unknown };
            return {
                usbVendorId: typeof obj.usbVendorId === 'number' ? obj.usbVendorId : undefined,
                usbProductId: typeof obj.usbProductId === 'number' ? obj.usbProductId : undefined,
            };
        } catch {
            return null;
        }
    }

    private setLastPortInfo(info: { usbVendorId?: number; usbProductId?: number } | null): void {
        try {
            if (!info) {
                localStorage.removeItem(ThermalPrinterService.STORAGE_KEY_LAST_PORT_INFO);
                return;
            }
            localStorage.setItem(ThermalPrinterService.STORAGE_KEY_LAST_PORT_INFO, JSON.stringify(info));
        } catch {
            // ignore
        }
    }

    private async openPort(port: SerialPort, baudRate = ThermalPrinterService.DEFAULT_BAUD_RATE): Promise<boolean> {
        try {
            await port.open({ baudRate });
            this.port = port;
            this.writer = port.writable!.getWriter();
            this.isConnected = true;
            return true;
        } catch (err) {
            console.warn('[ThermalPrinter] No se pudo abrir el puerto serie:', err);
            this.isConnected = false;
            this.port = null;
            this.writer = null;
            return false;
        }
    }

    /**
     * Intenta reconectar a un puerto previamente autorizado (sin gesto del usuario).
     * Usa navigator.serial.getPorts() y matchea por USB VID/PID si está disponible.
     */
    async autoConnectIfPossible(baudRate?: number): Promise<boolean> {
        if (!this.canUseWebSerial()) return false;
        if (!navigator.serial?.getPorts) return false;
        if (this.isConnected && this.writer) return true;

        try {
            const ports = await navigator.serial.getPorts();
            if (!ports || ports.length === 0) return false;

            const saved = this.getLastPortInfo();
            let candidate: SerialPort | undefined;

            if (saved?.usbVendorId || saved?.usbProductId) {
                candidate = ports.find((p) => {
                    const info = p.getInfo?.();
                    if (!info) return false;
                    if (typeof saved.usbVendorId === 'number' && info.usbVendorId !== saved.usbVendorId) return false;
                    if (typeof saved.usbProductId === 'number' && info.usbProductId !== saved.usbProductId) return false;
                    return true;
                });
            }

            // Si no hay match y hay un solo puerto autorizado, probamos ese.
            if (!candidate && ports.length === 1) candidate = ports[0];

            if (!candidate) return false;
            return await this.openPort(candidate, baudRate);
        } catch (err) {
            console.warn('[ThermalPrinter] Auto-connect falló:', err);
            return false;
        }
    }

    /**
     * Solicita el puerto serie al navegador y lo abre.
     * Requiere gesto del usuario (llamar desde un click o similar).
     * @returns true si se conectó corectamente, false si se canceló o falló.
     */
    async connect(baudRate?: number): Promise<boolean> {
        if (!this.canUseWebSerial()) {
            console.warn('[ThermalPrinter] Web Serial API no disponible en este navegador.');
            return false;
        }
        try {
            const port = await navigator.serial!.requestPort();
            const ok = await this.openPort(port, baudRate);
            if (ok) {
                const info = port.getInfo?.();
                if (info && (info.usbVendorId || info.usbProductId)) {
                    this.setLastPortInfo({ usbVendorId: info.usbVendorId, usbProductId: info.usbProductId });
                }
            }
            console.info('[ThermalPrinter] Puerto serie conectado. ✓');
            return ok;
        } catch (err) {
            console.warn('[ThermalPrinter] No se pudo abrir el puerto serie:', err);
            this.isConnected = false;
            return false;
        }
    }

    /** Cierra el puerto serie activo. */
    async disconnect(): Promise<void> {
        try {
            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
        } catch (err) {
            console.warn('[ThermalPrinter] Error al cerrar el puerto:', err);
        } finally {
            this.isConnected = false;
        }
    }

    // ── ESC/POS binary helpers ────────────────────────────────────────────────

    private static readonly ESC = 0x1b;
    private static readonly GS  = 0x1d;
    private static readonly LF  = 0x0a;

    /** Codifica una cadena como bytes Latin-1 (compatible con la mayoría de impresoras POS). */
    private encodeText(text: string): number[] {
        const bytes: number[] = [];
        for (const ch of text) {
            const code = ch.charCodeAt(0);
            bytes.push(code <= 0xff ? code : 0x3f /* '?' */);
        }
        return bytes;
    }

    /**
     * Construye el buffer ESC/POS binario para un ticket completo.
     * Comandos usados:
     *  ESC @           — Inicializar impresora
     *  ESC t n         — Seleccionar página de códigos (PC850 = 0x02)
     *  ESC a n         — Alineación (0=izq, 1=centro, 2=der)
     *  ESC E n         — Negrita (1=on, 0=off)
     *  ESC ! n         — Tamaño de fuente (bit 4-5 = altura ×2)
     *  GS V n          — Corte de papel (1=corte parcial)
     *  ESC p m t1 t2   — Apertura de cajón portamonedas
     */
    buildEscPosBuffer(sale: SaleRecord, options: PrintTicketOptions = {}, cfg: Partial<PrinterConfig> = {}): Uint8Array {
        const { copy = 1 } = options;
        const E = ThermalPrinterService.ESC;
        const G = ThermalPrinterService.GS;
        const L = ThermalPrinterService.LF;
        const bytes: number[] = [];

        // Extraer configuración con fallbacks a los defaults
        const W           = cfg.paperWidth    ?? PAPER_WIDTH;
        const storeName   = cfg.storeName     ?? DEFAULT_PRINTER_CONFIG.storeName;
        const storeSub    = cfg.storeSubtitle ?? DEFAULT_PRINTER_CONFIG.storeSubtitle;
        const storeAddr   = cfg.storeAddress  ?? '';
        const storePhone  = cfg.storePhone    ?? '';
        const footer      = cfg.storeFooter   ?? DEFAULT_PRINTER_CONFIG.storeFooter;
        const doDrawer    = cfg.openDrawer    ?? DEFAULT_PRINTER_CONFIG.openDrawer;
        const codePage    = cfg.codePage      ?? DEFAULT_PRINTER_CONFIG.codePage;

        const push = (...b: number[]) => bytes.push(...b);
        const line  = (text = '') => { push(...this.encodeText(text)); push(L); };
        const align = (n: 0 | 1 | 2) => push(E, 0x61, n);
        const bold  = (on: boolean) => push(E, 0x45, on ? 1 : 0);
        const dbl   = (on: boolean) => push(E, 0x21, on ? 0x30 : 0x00);
        const feed  = (n = 1) => { for (let i = 0; i < n; i++) push(L); };

        const fecha = new Date(sale.fecha);
        const dateStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Init + selección de página de códigos
        push(E, 0x40);              // ESC @ — inicializar
        push(E, 0x74, codePage);    // ESC t n — página de códigos (PC850 por defecto)

        // ── Encabezado / "Logo" del comercio ───────────────
        feed(1);
        align(1);
        dbl(true); bold(true);
        line(storeName);
        dbl(false); bold(false);
        if (storeSub)   line(storeSub);
        if (storeAddr)  line(storeAddr);
        if (storePhone) line(`Tel: ${storePhone}`);
        line(repeat('-', W));
        align(0);
        line(leftRight('Fecha:', dateStr, W));
        line(leftRight('Hora:', timeStr, W));
        line(leftRight('Cajero:', sale.cajero, W));
        line(leftRight('Ticket N\u00b0:', sale.id.replace('T-', '').replace('SALE-', ''), W));
        if (copy > 1) { align(1); line(`[ COPIA ${copy} ]`); align(0); }
        line(repeat('=', W));

        // ── Items ──────────────────────────────────────────
        align(1); bold(true); line('DETALLE DE VENTA'); bold(false); align(0);
        line(repeat('-', W));

        sale.items.forEach((item: CartItem) => {
            const nombre = item.nombre.length > W
                ? item.nombre.substring(0, W - 1) + '\u2026'
                : item.nombre;
            line(nombre);
            const cantStr = `${item.cantidad} x ${formatPrice(item.precio)}`;
            line(leftRight(cantStr, formatPrice(item.subtotal), W));
            if (item.descuento > 0) {
                line(leftRight(`  Dto. ${item.descuento}%`, `- ${formatPrice(item.precio * item.cantidad * (item.descuento / 100))}`, W));
            } else if ((item as unknown as { promoDescuento?: number }).promoDescuento ?? 0 > 0) {
                const pct = (item as unknown as { promoDescuento: number }).promoDescuento;
                line(leftRight(`  Dto.promo ${pct}%`, `- ${formatPrice(item.precio * item.cantidad * (pct / 100))}`, W));
            }
        });

        line(repeat('-', W));

        // ── Totales ────────────────────────────────────────
        const hasDiscount = sale.totalConDescuento < sale.total;
        if (hasDiscount) {
            line(leftRight('Subtotal:', formatPrice(sale.total), W));
            line(leftRight('Descuento:', `- ${formatPrice(sale.total - sale.totalConDescuento)}`, W));
            line(repeat('-', W));
        }
        bold(true); dbl(true);
        line(leftRight('TOTAL:', formatPrice(sale.totalConDescuento), W));
        dbl(false); bold(false);
        line(repeat('=', W));

        // ── Pago ───────────────────────────────────────────
        const metodoLabel: Record<string, string> = {
            efectivo: 'Efectivo', debito: 'Tarjeta D\u00e9bito',
            credito: 'Tarjeta Crédito', qr: 'QR',
            transferencia: 'Transferencia', mixto: 'Mixto',
        };
        line(leftRight('Forma de pago:', metodoLabel[sale.metodoPago] ?? sale.metodoPago, W));
        if (sale.metodoPago === 'mixto' && sale.pagos && sale.pagos.length > 0) {
            sale.pagos.forEach((p) => {
                line(leftRight(`  ${metodoLabel[p.metodo] ?? p.metodo}:`, formatPrice(p.monto), W));
            });
            if (typeof sale.vuelto === 'number' && sale.vuelto > 0) {
                line(leftRight('  Vuelto:', formatPrice(sale.vuelto), W));
            }
        }
        line(repeat('-', W));

        // ── Pie ────────────────────────────────────────────
        feed(1);
        align(1);
        line(footer);
        line('Conserve su ticket');
        feed(1);
        line(repeat('=', Math.min(16, W)));
        feed(4);

        // Corte parcial de papel
        push(G, 0x56, 0x01);

        // Abrir cajón portamonedas (ESC p m t1 t2)
        // pin 2 (m=0), pulso ON=50 ms (0x19 × 2ms), pulso OFF=500 ms (0xFA × 2ms)
        if (doDrawer) {
            push(E, 0x70, 0x00, 0x19, 0xFA);
        }

        return new Uint8Array(bytes);
    }

    /**
     * Envía el ticket completo a la impresora vía Web Serial API.
     * Si el puerto no está abierto (o no disponible), hace fallback a consola.
     */
    async printEscPos(sale: SaleRecord, options: PrintTicketOptions = {}, cfg: Partial<PrinterConfig> = {}): Promise<void> {
        if (!this.isConnected || !this.writer) {
            const ok = await this.autoConnectIfPossible(cfg.baudRate);
            if (!ok || !this.writer) {
                this.printToConsole(sale, options);
                return;
            }
        }
        try {
            const buffer = this.buildEscPosBuffer(sale, options, cfg);
            await this.writer.write(buffer);
            console.info(`[ThermalPrinter] Ticket ${sale.id} enviado (${buffer.byteLength} bytes).`);
        } catch (err) {
            console.error('[ThermalPrinter] Error al escribir en el puerto:', err);
            // Fallback a consola
            this.printToConsole(sale, options);
        }
    }

    // ── Genera el buffer de texto del ticket (fallback / preview) ─────────────

    buildTicketBuffer(sale: SaleRecord, options: PrintTicketOptions = {}): string {
        const { copy = 1 } = options;
        const lines: string[] = [];
        const fecha = new Date(sale.fecha);

        const dateStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        lines.push('');
        lines.push(center('★ BLEND POS ★'));
        lines.push(center('Sistema de Punto de Venta'));
        lines.push(divider());
        lines.push(leftRight('Fecha:', dateStr));
        lines.push(leftRight('Hora:', timeStr));
        lines.push(leftRight('Cajero:', sale.cajero));
        lines.push(leftRight('Ticket N°:', sale.id.replace('SALE-', '')));
        if (copy > 1) lines.push(center(`[ COPIA ${copy} ]`));
        lines.push(divider('='));

        lines.push(center('DETALLE DE VENTA'));
        lines.push(divider());

        sale.items.forEach((item: CartItem) => {
            const nombre = item.nombre.length > PAPER_WIDTH ? item.nombre.substring(0, PAPER_WIDTH - 1) + '…' : item.nombre;
            lines.push(nombre);
            lines.push(leftRight(`${item.cantidad} x ${formatPrice(item.precio)}`, formatPrice(item.subtotal)));
            if (item.descuento > 0) {
                lines.push(leftRight(`  Dto. ${item.descuento}%`, `- ${formatPrice(item.precio * item.cantidad * (item.descuento / 100))}`));
            } else if ((item as unknown as { promoDescuento?: number }).promoDescuento ?? 0 > 0) {
                const pct = (item as unknown as { promoDescuento: number }).promoDescuento;
                lines.push(leftRight(`  Dto.promo ${pct}%`, `- ${formatPrice(item.precio * item.cantidad * (pct / 100))}`));
            }
        });

        lines.push(divider());

        const hasDiscount = sale.totalConDescuento < sale.total;
        if (hasDiscount) {
            lines.push(leftRight('Subtotal:', formatPrice(sale.total)));
            lines.push(leftRight('Descuento:', `- ${formatPrice(sale.total - sale.totalConDescuento)}`));
            lines.push(divider());
        }

        lines.push(leftRight('TOTAL:', formatPrice(sale.totalConDescuento)));
        lines.push(divider('='));

        const metodoLabel: Record<string, string> = {
            efectivo: 'Efectivo', debito: 'Tarjeta Débito',
            credito: 'Tarjeta Crédito', qr: 'QR',
            transferencia: 'Transferencia', mixto: 'Mixto',
        };
        lines.push(leftRight('Forma de pago:', metodoLabel[sale.metodoPago] ?? sale.metodoPago));
        if (sale.metodoPago === 'mixto' && sale.pagos && sale.pagos.length > 0) {
            sale.pagos.forEach((p) => {
                lines.push(leftRight(`  ${metodoLabel[p.metodo] ?? p.metodo}:`, formatPrice(p.monto)));
            });
            if (typeof sale.vuelto === 'number' && sale.vuelto > 0) {
                lines.push(leftRight('  Vuelto:', formatPrice(sale.vuelto)));
            }
        }
        lines.push(divider());
        lines.push('');
        lines.push(center('¡Gracias por su compra!'));
        lines.push(center('Conserve su ticket'));
        lines.push('');
        lines.push(center(repeat('=', 16)));
        lines.push('');

        return lines.join('\n');
    }

    /** Imprime en consola (simulación / fallback). */
    private printToConsole(sale: SaleRecord, options: PrintTicketOptions = {}): void {
        const buffer = this.buildTicketBuffer(sale, options);
        console.group(`%c🖨️  THERMAL PRINTER — Ticket ${sale.id}`, 'color: #2b8a3e; font-weight: bold; font-size: 14px;');
        console.log('%c' + buffer, 'font-family: monospace; white-space: pre;');
        console.groupEnd();
    }

    /** @deprecated Usa printEscPos() para producción. */
    print(sale: SaleRecord, options: PrintTicketOptions = {}): void {
        this.printToConsole(sale, options);
    }

    /**
     * Imprime N copias según config (1 = cliente, 2 = cliente + local).
     * Si hay conexión serie usa ESC/POS binario; si no, fallback a consola.
     */
    async printAll(sale: SaleRecord, cfg: Partial<PrinterConfig> = {}): Promise<void> {
        const copies = cfg.copies ?? 1;
        for (let i = 1; i <= copies; i++) {
            await this.printEscPos(sale, { copy: i }, cfg);
        }
    }

    /**
     * Abre el cajón portamonedas de forma independiente (sin imprimir ticket).
     * Útil para probar el hardware o para ventas donde no se imprime ticket.
     * Comando ESC/POS: ESC p m t1 t2 → [0x1B, 0x70, 0x00, 0x19, 0xFA]
     * @returns true si el comando fue enviado a la impresora, false si no hay conexión activa.
     */
    async openCashDrawer(): Promise<boolean> {
        if (!this.isConnected || !this.writer) {
            console.warn('[ThermalPrinter] openCashDrawer: sin conexión activa — intento de reconexión...');
            const ok = await this.autoConnectIfPossible();
            if (!ok || !this.writer) {
                console.warn('[ThermalPrinter] openCashDrawer: no se pudo conectar. Simula apertura en consola.');
                console.info('%c[CAJÓN PORTAMONEDAS] ▶ APERTURA SIMULADA', 'color: #e67700; font-weight: bold;');
                return false;
            }
        }
        try {
            // ESC p  pin0  t1=50ms  t2=500ms
            const cmd = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
            await this.writer.write(cmd);
            console.info('[ThermalPrinter] openCashDrawer: comando enviado (5 bytes).');
            return true;
        } catch (err) {
            console.error('[ThermalPrinter] openCashDrawer: error al escribir en el puerto:', err);
            return false;
        }
    }
}

/** Singleton exportado para uso directo */
export const thermalPrinter = ThermalPrinterService.getInstance();
