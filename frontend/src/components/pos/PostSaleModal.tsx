import { useState, useEffect } from 'react';
import {
    Modal, Stack, Text, Group, Button, Divider, Badge, ThemeIcon, Box, Alert, Loader, TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CheckCircle, Printer, X, Mail, Receipt, AlertCircle, Info, FileText } from 'lucide-react';
import { usePOSUIStore } from '../../store/usePOSUIStore';
import { usePrinterStore } from '../../store/usePrinterStore';
import { formatARS } from '../../utils/format';
import { getComprobante, abrirFacturaHTML, enviarEmailComprobante, type FacturacionResponse } from '../../services/api/facturacion';

const METODO_LABEL: Record<string, string> = {
    efectivo: '💵 Efectivo',
    debito: '💳 Débito',
    credito: '💳 Crédito',
    qr: '📱 QR',
    mixto: '🧾 Mixto',
    transferencia: '📱 Transferencia',
};

const BASE_URL = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8000';

export function PostSaleModal() {
    const isOpen = usePOSUIStore((s) => s.isPostSaleModalOpen);
    const record = usePOSUIStore((s) => s.lastSaleRecord);
    const close = usePOSUIStore((s) => s.closePostSaleModal);
    const { config: printerConfig } = usePrinterStore();
    const [printing, setPrinting] = useState(false);
    const [smtpConfigured, setSMTPConfigured] = useState<boolean | null>(null);
    const [comprobante, setComprobante] = useState<FacturacionResponse | null>(null);
    const [loadingComprobante, setLoadingComprobante] = useState(false);
    const [openingFactura, setOpeningFactura] = useState(false);
    const [openingDuplicado, setOpeningDuplicado] = useState(false);
    const [emailCliente, setEmailCliente] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);

    const isFiscal = record && ['factura_a', 'factura_b', 'factura_c'].includes(record.tipoComprobante);

    // Check SMTP configuration on mount
    useEffect(() => {
        const checkSMTP = async () => {
            try {
                const res = await fetch(`${BASE_URL}/health`);
                if (res.ok) {
                    const data = await res.json() as { smtp?: boolean };
                    setSMTPConfigured(data.smtp ?? false);
                }
            } catch {
                // Silently fail — assume SMTP not configured if health check fails
                setSMTPConfigured(false);
            }
        };
        checkSMTP();
    }, []);

    // Reset email field when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            // Pre-fill with cliente email if it was provided during sale
            setEmailCliente(record?.clienteEmail || '');
        } else {
            setEmailCliente('');
        }
    }, [isOpen, record]);

    const fetchComprobante = async (saleId: string) => {
        const comp = await getComprobante(saleId);
        setComprobante(comp);
        return comp;
    };

    // Load comprobante if this is a fiscal invoice — retry every 3s up to 30s
    useEffect(() => {
        if (!record || !isFiscal || !isOpen) {
            setComprobante(null);
            setLoadingComprobante(false);
            return;
        }

        let cancelled = false;
        const MAX_POLLS = 10;
        const POLL_INTERVAL = 3000;

        const poll = async () => {
            setLoadingComprobante(true);
            for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
                if (cancelled) return;
                try {
                    const comp = await fetchComprobante(record.id);
                    if (!cancelled) {
                        // If still pending, keep polling
                        if (comp.estado === 'emitido' || comp.estado === 'error' || comp.estado === 'rechazado') {
                            setLoadingComprobante(false);
                            return;
                        }
                    }
                } catch {
                    // Comprobante not yet created — keep waiting
                }
                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            }
            if (!cancelled) setLoadingComprobante(false);
        };

        // Kick off first poll after 2s (give worker a head start)
        const timer = setTimeout(() => { poll(); }, 2000);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [record, isFiscal, isOpen]);

    if (!record) return null;

    console.log('[PostSaleModal] Rendered with record:', {
        numeroTicket: record.numeroTicket,
        total: record.total,
        clienteEmail: record.clienteEmail,
        metodoPago: record.metodoPago,
    });

    const handlePrint = () => {
        const printWindow = window.open('', '_blank', 'width=420,height=700');
        if (!printWindow) {
            notifications.show({
                title: 'Error de impresión',
                message: 'Los popups están bloqueados. Permití las ventanas emergentes para este sitio e intentá de nuevo.',
                color: 'red',
                autoClose: 8000,
            });
            return;
        }

        setPrinting(true);

        const totalFinal = record.totalConDescuento || record.total;
        const tieneDescuento = record.totalConDescuento > 0 && record.total !== record.totalConDescuento;
        const vuelto = record.vuelto ?? 0;

        const METODO_PRINT: Record<string, string> = {
            efectivo: 'Efectivo', debito: 'Debito', credito: 'Credito',
            qr: 'QR', transferencia: 'Transferencia', mixto: 'Mixto',
        };

        const storeName = printerConfig.storeName || 'BLEND POS';
        const storeSub  = printerConfig.storeSubtitle || '';
        const storeAddr = printerConfig.storeAddress || '';
        const storePhone = printerConfig.storePhone || '';
        const storeFooter = printerConfig.storeFooter || 'Gracias por su compra';
        const ars = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n);
        const fechaStr = `${new Date(record.fecha).toLocaleDateString('es-AR')} ${new Date(record.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
        const escape = (s: string) =>
            String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const itemsHTML = (record.items ?? []).map((item) => `
            <tr>
                <td class="prod">${escape(item.nombre)}</td>
                <td class="num">${item.cantidad}</td>
                <td class="num">${ars(item.precio)}</td>
                <td class="num">${ars(item.cantidad * item.precio)}</td>
            </tr>
        `).join('');

        const pagosMixtosHTML = record.metodoPago === 'mixto' && record.pagos
            ? record.pagos.map((p) => `
                <div class="row sub"><span>· ${escape(METODO_PRINT[p.metodo] ?? p.metodo)}</span><span>${ars(p.monto)}</span></div>
            `).join('')
            : '';

        const efectivoBlock = record.efectivoRecibido && record.efectivoRecibido > 0
            ? `
                <div class="row"><span>Efectivo recibido</span><span>${ars(record.efectivoRecibido)}</span></div>
                ${vuelto > 0 ? `<div class="row bold"><span>Vuelto</span><span>${ars(vuelto)}</span></div>` : ''}
            `
            : '';

        const ticketHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Ticket #${record.numeroTicket}</title>
    <style>
        /* Forzá tamaño exacto del papel térmico: 80mm de ancho, alto auto. */
        @page { size: 80mm auto; margin: 0; }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 80mm; margin: 0; padding: 0; background: #fff; color: #000; }

        body {
            /* Courier monospace garantiza alineación de columnas en impresora térmica */
            font-family: "Courier", "Courier New", "Liberation Mono", monospace;
            font-size: 12pt;
            line-height: 1.25;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .ticket { width: 80mm; padding: 3mm 2mm; }
        .header { text-align: center; margin-bottom: 3mm; }
        .store-name { font-size: 16pt; font-weight: 700; letter-spacing: 1px; }
        .store-sub, .store-addr { font-size: 10pt; }
        .sep   { border-top: 1px dashed #000; margin: 2mm 0; }
        .sep-h { border-top: 2px solid #000; margin: 2mm 0; }
        .row { display: flex; justify-content: space-between; gap: 2mm; margin: 0.5mm 0; }
        .row.sub { padding-left: 3mm; font-size: 10pt; }
        .row.bold, .bold { font-weight: 700; }
        .total { font-size: 16pt; font-weight: 700; padding: 1mm 0; }

        table { width: 100%; border-collapse: collapse; margin: 1mm 0; }
        thead th {
            font-size: 10pt; font-weight: 700; text-align: left;
            border-bottom: 1px solid #000; padding: 1mm 0;
        }
        thead th.num { text-align: right; }
        tbody td { font-size: 11pt; padding: 0.8mm 0; vertical-align: top; }
        tbody td.num { text-align: right; white-space: nowrap; }
        tbody td.prod { word-break: break-word; }

        .footer { text-align: center; margin-top: 3mm; font-size: 10pt; }
        .no-print { padding: 10px; text-align: center; background: #f3f4f6; border-bottom: 2px solid #d1d5db; }
        .btn-print {
            padding: 10px 22px; background: #2563eb; color: white; border: none;
            border-radius: 4px; cursor: pointer; font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }

        @media print {
            .no-print { display: none !important; }
            html, body { width: 80mm; }
            .ticket { padding: 2mm 2mm; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button class="btn-print" onclick="window.print()">Imprimir ahora</button>
    </div>
    <div class="ticket">
        <div class="header">
            <div class="store-name">${escape(storeName)}</div>
            ${storeSub ? `<div class="store-sub">${escape(storeSub)}</div>` : ''}
            ${storeAddr ? `<div class="store-addr">${escape(storeAddr)}</div>` : ''}
            ${storePhone ? `<div class="store-addr">${escape(storePhone)}</div>` : ''}
        </div>
        <div class="sep-h"></div>
        <div class="row"><span>Ticket N°</span><span class="bold">#${record.numeroTicket}</span></div>
        <div class="row"><span>Fecha</span><span>${fechaStr}</span></div>
        <div class="row"><span>Cajero</span><span>${escape(record.cajero)}</span></div>
        <div class="sep"></div>
        <table>
            <thead>
                <tr>
                    <th>Producto</th>
                    <th class="num">Cant</th>
                    <th class="num">P.Unit</th>
                    <th class="num">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>
        <div class="sep"></div>
        ${tieneDescuento ? `
            <div class="row"><span>Subtotal</span><span>${ars(record.total)}</span></div>
            <div class="row"><span>Descuento</span><span>-${ars(record.total - record.totalConDescuento)}</span></div>
        ` : ''}
        <div class="row total"><span>TOTAL</span><span>${ars(totalFinal)}</span></div>
        <div class="sep"></div>
        <div class="row bold"><span>Pago</span><span>${escape(METODO_PRINT[record.metodoPago] ?? record.metodoPago)}</span></div>
        ${pagosMixtosHTML}
        ${efectivoBlock}
        ${record.clienteEmail ? `<div class="sep"></div><div class="row"><span>Email</span><span>${escape(record.clienteEmail)}</span></div>` : ''}
        <div class="sep"></div>
        <div class="footer">${escape(storeFooter)}</div>
    </div>
    <script>
        // Auto-print al cargar; cierre tras imprimir (o cancelar) usando afterprint
        // para que el documento alcance a spoolearse a la impresora.
        window.addEventListener('load', function () {
            window.focus();
            setTimeout(function () { window.print(); }, 250);
        });
        window.addEventListener('afterprint', function () {
            setTimeout(function () { window.close(); }, 200);
        });
    </script>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(ticketHTML);
        printWindow.document.close();

        notifications.show({
            title: 'Impresión iniciada',
            message: `Ticket #${record.numeroTicket}`,
            color: 'blue',
            icon: <Printer size={14} />,
            autoClose: 3000,
        });

        setPrinting(false);
    };

    // Abre el HTML de la factura (ORIGINAL o DUPLICADO, opcionalmente formato ticket)
    const handleOpenFactura = async (esCopia: boolean, formato?: 'ticket') => {
        if (!comprobante) return;

        if (esCopia) setOpeningDuplicado(true);
        else setOpeningFactura(true);
        try {
            await abrirFacturaHTML(comprobante.id, false, esCopia, formato);
        } catch (err) {
            notifications.show({
                title: 'No se pudo abrir la factura',
                message: err instanceof Error ? err.message : 'Error desconocido.',
                color: 'red',
                autoClose: 5000,
            });
        } finally {
            if (esCopia) setOpeningDuplicado(false);
            else setOpeningFactura(false);
        }
    };

    const handleRefreshComprobante = async () => {
        if (!record || !isFiscal) return;

        setLoadingComprobante(true);
        try {
            await fetchComprobante(record.id);
        } catch {
            notifications.show({
                title: 'Factura aun no disponible',
                message: 'Todavia no se genero el comprobante fiscal. Reintenta en unos segundos.',
                color: 'orange',
                autoClose: 4000,
            });
        } finally {
            setLoadingComprobante(false);
        }
    };

    const handleEnviarEmail = async () => {
        if (!comprobante || !emailCliente.trim()) return;

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailCliente.trim())) {
            notifications.show({
                title: 'Email inválido',
                message: 'Por favor ingresá un email válido.',
                color: 'red',
                autoClose: 4000,
            });
            return;
        }

        setSendingEmail(true);
        try {
            await enviarEmailComprobante(comprobante.id, emailCliente.trim());
            notifications.show({
                title: '✅ Email enviado',
                message: `El comprobante se enviará a ${emailCliente.trim()}`,
                color: 'green',
                icon: <Mail size={14} />,
                autoClose: 5000,
            });
            setEmailCliente(''); // Limpiar campo después de enviar
        } catch (err) {
            console.error('[PostSaleModal] Error enviando email:', err);
            notifications.show({
                title: 'Error al enviar email',
                message: err instanceof Error ? err.message : 'No se pudo encolar el email. Intenta nuevamente.',
                color: 'red',
                autoClose: 5000,
            });
        } finally {
            setSendingEmail(false);
        }
    };

    const total = record.totalConDescuento || record.total;
    const vuelto = record.vuelto ?? 0;

    const TIPO_COMPROBANTE_LABEL: Record<string, { label: string; color: string }> = {
        ticket_interno: { label: 'Ticket Interno', color: 'gray' },
        factura_a: { label: 'Factura A', color: 'orange' },
        factura_b: { label: 'Factura B', color: 'blue' },
        factura_c: { label: 'Factura C', color: 'cyan' },
    };

    const comprobanteInfo = TIPO_COMPROBANTE_LABEL[record.tipoComprobante] || { label: 'Ticket', color: 'gray' };

    return (
        <Modal
            opened={isOpen}
            onClose={close}
            title={
                <Group gap="xs">
                    <ThemeIcon color="teal" variant="light" size="lg" radius="xl">
                        <CheckCircle size={20} />
                    </ThemeIcon>
                    <Text size="lg" fw={700}>
                        Venta registrada
                    </Text>
                </Group>
            }
            size="sm"
            centered
            closeOnClickOutside={false}
        >
            <Stack gap="lg">
                {/* Success banner */}
                <Box
                    style={{
                        background: 'var(--mantine-color-teal-light)',
                        borderRadius: 'var(--mantine-radius-md)',
                        padding: 'var(--mantine-spacing-md)',
                        textAlign: 'center',
                    }}
                >
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>
                        Ticket
                    </Text>
                    <Text size="xl" fw={900} ff="monospace" c="teal">
                        #{record.numeroTicket}
                    </Text>
                </Box>

                {/* Summary */}
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Total</Text>
                        <Text size="lg" fw={800} ff="monospace">{formatARS(total)}</Text>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Comprobante</Text>
                        <Badge variant="light" color={comprobanteInfo.color} size="md">
                            {comprobanteInfo.label}
                        </Badge>
                    </Group>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Método</Text>
                        <Badge variant="light" color="blue" size="md">
                            {METODO_LABEL[record.metodoPago] ?? record.metodoPago}
                        </Badge>
                    </Group>
                    {vuelto > 0 && (
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">Vuelto</Text>
                            <Text size="sm" fw={700} c="teal" ff="monospace">
                                {formatARS(vuelto)}
                            </Text>
                        </Group>
                    )}
                    {record.clienteEmail && (
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                <Group gap={4} wrap="nowrap">
                                    <Mail size={14} />
                                    Email
                                </Group>
                            </Text>
                            <Text size="sm" fw={500}>
                                {record.clienteEmail}
                            </Text>
                        </Group>
                    )}
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Artículos</Text>
                        <Text size="sm" fw={600}>
                            {record.items.reduce((s, i) => s + i.cantidad, 0)} items
                        </Text>
                    </Group>
                </Stack>

                {/* Factura fiscal status */}
                {isFiscal && (
                    <>
                        <Divider />
                        {loadingComprobante ? (
                            <Alert icon={<Loader size={16} />} color="blue" variant="light">
                                <Text size="xs">
                                    Consultando AFIP, aguardá unos segundos...
                                </Text>
                            </Alert>
                        ) : comprobante ? (
                            <Alert 
                                icon={<FileText size={16} />} 
                                color={comprobante.estado === 'emitido' ? 'green' : comprobante.estado === 'error' || comprobante.estado === 'rechazado' ? 'red' : 'orange'}
                                variant="light"
                                title={comprobante.estado === 'emitido' ? 'Factura emitida' : comprobante.estado === 'error' || comprobante.estado === 'rechazado' ? 'Error en facturación' : 'Factura pendiente'}
                            >
                                <Stack gap={4}>
                                    {comprobante.cae && (
                                        <Text size="xs">
                                            <strong>CAE:</strong> {comprobante.cae}
                                        </Text>
                                    )}
                                    {comprobante.numero && (
                                        <Text size="xs">
                                            <strong>Comprobante:</strong> {comprobante.punto_de_venta.toString().padStart(4, '0')}-{comprobante.numero.toString().padStart(8, '0')}
                                        </Text>
                                    )}
                                    <Text size="xs" c="dimmed">
                                        {comprobante.estado === 'emitido' 
                                            ? 'La factura fiscal está lista para descargar'
                                            : comprobante.estado === 'error' || comprobante.estado === 'rechazado'
                                            ? 'Hubo un error al generar la factura'
                                            : 'La factura se está procesando en AFIP'}
                                    </Text>
                                </Stack>
                            </Alert>
                        ) : (
                            <Alert icon={<AlertCircle size={16} />} color="orange" variant="light">
                                <Text size="xs">
                                    La factura fiscal aún se está procesando. Cerrá y volvé a abrir la venta en unos segundos para descargarla.
                                </Text>
                            </Alert>
                        )}
                    </>
                )}

                {record.clienteEmail && (
                    <>
                        <Divider />
                        <Alert 
                            icon={<Info size={16} />} 
                            color={smtpConfigured ? "blue" : "orange"}
                            variant="light"
                            title={smtpConfigured ? "Email pendiente" : "Configuración SMTP requerida"}
                        >
                            <Text size="xs">
                                {smtpConfigured ? (
                                    <>
                                        El comprobante se enviará a <strong>{record.clienteEmail}</strong> cuando la factura quede lista.
                                    </>
                                ) : (
                                    <>
                                        <strong>Nota:</strong> El servidor no tiene configurado SMTP para enviar emails.
                                        El comprobante no se enviará a <strong>{record.clienteEmail}</strong>.
                                        Contactá al administrador para configurar las credenciales de email.
                                    </>
                                )}
                            </Text>
                        </Alert>
                    </>
                )}

                {/* Enviar factura por email */}
                {comprobante && comprobante.estado === 'emitido' && smtpConfigured && (
                    <>
                        <Divider />
                        <Stack gap="xs">
                            <Text size="sm" fw={600} c="dimmed">
                                <Group gap={4}>
                                    <Mail size={14} />
                                    Enviar comprobante por email
                                </Group>
                            </Text>
                            <Group align="flex-end">
                                <TextInput
                                    placeholder="cliente@ejemplo.com"
                                    value={emailCliente}
                                    onChange={(e) => setEmailCliente(e.currentTarget.value)}
                                    style={{ flex: 1 }}
                                    leftSection={<Mail size={16} />}
                                    disabled={sendingEmail}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && emailCliente.trim()) {
                                            handleEnviarEmail();
                                        }
                                    }}
                                />
                                <Button
                                    onClick={handleEnviarEmail}
                                    loading={sendingEmail}
                                    disabled={!emailCliente.trim()}
                                    leftSection={<Mail size={16} />}
                                    variant="light"
                                    color="blue"
                                >
                                    Enviar
                                </Button>
                            </Group>
                            <Text size="xs" c="dimmed">
                                Se enviará el PDF de la factura al email ingresado
                            </Text>
                        </Stack>
                    </>
                )}

                <Divider />

                {/* Actions */}
                <Stack gap="sm">
                    {/* Factura fiscal emitida: botones Original y Duplicado */}
                    {isFiscal && comprobante && comprobante.estado === 'emitido' && (
                        <>
                            <Button
                                size="lg"
                                leftSection={<Printer size={18} />}
                                onClick={() => handleOpenFactura(false)}
                                loading={openingFactura}
                                variant="gradient"
                                gradient={{ from: 'teal', to: 'lime', deg: 90 }}
                                fullWidth
                            >
                                Imprimir ORIGINAL
                            </Button>

                            <Button
                                size="lg"
                                leftSection={<FileText size={18} />}
                                onClick={() => handleOpenFactura(true)}
                                loading={openingDuplicado}
                                variant="outline"
                                color="teal"
                                fullWidth
                            >
                                Imprimir DUPLICADO
                            </Button>

                            <Button
                                size="lg"
                                leftSection={<Receipt size={18} />}
                                onClick={() => handleOpenFactura(false, 'ticket')}
                                loading={openingFactura}
                                variant="outline"
                                color="blue"
                                fullWidth
                            >
                                Imprimir formato Ticket
                            </Button>
                        </>
                    )}

                    {isFiscal && (!comprobante || comprobante.estado === 'pendiente') && (
                        <Button
                            size="md"
                            variant="outline"
                            color="orange"
                            leftSection={<FileText size={16} />}
                            onClick={handleRefreshComprobante}
                            loading={loadingComprobante}
                            fullWidth
                        >
                            Reintentar consultar factura
                        </Button>
                    )}

                    {/* Imprimir ticket (solo para ticket_interno) */}
                    {!isFiscal && (
                    <Button
                        size="lg"
                        leftSection={<Printer size={18} />}
                        onClick={handlePrint}
                        loading={printing}
                        variant="light"
                        color="blue"
                        fullWidth
                    >
                        Imprimir Ticket
                    </Button>
                    )}

                    <Button
                        size="lg"
                        leftSection={<Receipt size={18} />}
                        onClick={() => {
                            handlePrint();
                            close();
                        }}
                        loading={printing}
                        color="teal"
                        fullWidth
                    >
                        Imprimir y Cerrar
                    </Button>

                    <Button
                        variant="subtle"
                        color="gray"
                        size="md"
                        leftSection={<X size={16} />}
                        onClick={close}
                        fullWidth
                    >
                        Cerrar sin imprimir
                    </Button>
                </Stack>
            </Stack>

        </Modal>
    );
}
