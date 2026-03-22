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
        const printWindow = window.open('', '_blank', 'width=800,height=700');
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
            efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
            qr: 'QR', transferencia: 'Transferencia', mixto: 'Mixto',
        };

        const storeName = printerConfig.storeName || 'BLEND POS';
        const storeSub  = printerConfig.storeSubtitle || '';
        const storeAddr = printerConfig.storeAddress || '';
        const storePhone = printerConfig.storePhone || '';
        const storeFooter = printerConfig.storeFooter || '¡Gracias por su compra!';
        const ars = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

        const ticketHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ticket #${record.numeroTicket}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; background: white; display: flex; justify-content: center; padding: 10mm; }
        .ticket { width: 76mm; max-width: 76mm; background: white; padding: 5mm; }
        .header { text-align: center; margin-bottom: 12px; }
        .store-name { font-size: 20px; font-weight: bold; margin-bottom: 3px; }
        .store-sub { font-size: 11px; color: #222; margin-bottom: 2px; }
        .store-addr { font-size: 10px; color: #222; margin-bottom: 1px; }
        .divider { border-top: 1px dashed #555; margin: 8px 0; }
        .divider-solid { border-top: 2px solid #000; margin: 8px 0; }
        .section { margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; font-size: 13px; }
        .label { color: #000; font-weight: 600; }
        .value { font-weight: bold; text-align: right; }
        .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
        .items-table thead th { font-size: 12px; font-weight: bold; border-bottom: 1px solid #000; padding: 3px 2px; text-align: left; }
        .items-table thead th:not(:first-child) { text-align: right; }
        .items-table tbody td { font-size: 12px; padding: 3px 2px; }
        .items-table tbody td:not(:first-child) { text-align: right; }
        .items-table .name-col { max-width: 36mm; word-break: break-word; }
        .total-row { font-size: 18px; font-weight: bold; margin-top: 6px; padding-top: 6px; border-top: 2px solid #000; }
        .pagos-mixtos { margin-left: 8px; }
        .footer { text-align: center; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #555; }
        .footer p { font-size: 12px; margin: 3px 0; }
        .no-print { text-align: center; margin-bottom: 14px; }
        .btn-print { padding: 9px 22px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-family: sans-serif; }
        @media print { body { padding: 0; } .no-print { display: none !important; } @page { size: 80mm auto; margin: 5mm; } }
    </style>
</head>
<body>
<div class="ticket">
    <div class="no-print"><button class="btn-print" onclick="window.print()">Imprimir</button></div>
    <div class="header">
        <div class="store-name">${storeName}</div>
        ${storeSub ? `<div class="store-sub">${storeSub}</div>` : ''}
        ${storeAddr ? `<div class="store-addr">${storeAddr}</div>` : ''}
        ${storePhone ? `<div class="store-addr">${storePhone}</div>` : ''}
    </div>
    <div class="divider-solid"></div>
    <div class="section">
        <div class="row"><span class="label">Ticket N°</span><span class="value">#${record.numeroTicket}</span></div>
        <div class="row"><span class="label">Fecha</span><span class="value">${new Date(record.fecha).toLocaleDateString('es-AR')} ${new Date(record.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="row"><span class="label">Cajero</span><span class="value">${record.cajero}</span></div>
    </div>
    <div class="divider"></div>
    <div class="section">
        <table class="items-table">
            <thead><tr><th class="name-col">Producto</th><th>Cant</th><th>P.Unit</th><th>Total</th></tr></thead>
            <tbody>${record.items.map(item => `
                <tr>
                    <td class="name-col">${item.nombre}</td>
                    <td>${item.cantidad}</td>
                    <td>${ars(item.precio)}</td>
                    <td>${ars(item.cantidad * item.precio)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>
    <div class="divider"></div>
    <div class="section">
        ${tieneDescuento ? `
        <div class="row"><span class="label">Subtotal</span><span class="value">${ars(record.total)}</span></div>
        <div class="row"><span class="label">Descuento</span><span class="value">-${ars(record.total - record.totalConDescuento)}</span></div>
        ` : ''}
        <div class="row total-row"><span class="label">TOTAL</span><span class="value">${ars(totalFinal)}</span></div>
    </div>
    <div class="divider"></div>
    <div class="section">
        <div class="row"><span class="label">Método de pago</span><span class="value">${METODO_PRINT[record.metodoPago] ?? record.metodoPago}</span></div>
        ${record.metodoPago === 'mixto' && record.pagos ? `<div class="pagos-mixtos">${record.pagos.map(p => `<div class="row"><span class="label">• ${METODO_PRINT[p.metodo] ?? p.metodo}</span><span class="value">${ars(p.monto)}</span></div>`).join('')}</div>` : ''}
        ${record.efectivoRecibido && record.efectivoRecibido > 0 ? `
        <div class="row"><span class="label">Efectivo recibido</span><span class="value">${ars(record.efectivoRecibido)}</span></div>
        ${vuelto > 0 ? `<div class="row"><span class="label">Vuelto</span><span class="value">${ars(vuelto)}</span></div>` : ''}` : ''}
    </div>
    ${record.clienteEmail ? `<div class="divider"></div><div class="section"><div class="row"><span class="label">Email</span><span class="value">${record.clienteEmail}</span></div></div>` : ''}
    <div class="footer">
        <p>${storeFooter}</p>
    </div>
</div>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(ticketHTML);
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
            setTimeout(() => printWindow.close(), 100);
        };

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
