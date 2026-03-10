import { useState, useRef, useEffect } from 'react';
import {
    Modal, Stack, Text, Group, Button, Divider, Badge, ThemeIcon, Box, Alert, Loader, TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CheckCircle, Printer, X, Mail, Receipt, AlertCircle, Info, FileText, Download } from 'lucide-react';
import { usePOSUIStore } from '../../store/usePOSUIStore';
import { formatARS } from '../../utils/format';
import { PrintableTicket } from './PrintableTicket';
import { getComprobante, descargarPDF, abrirFacturaHTML, enviarEmailComprobante, type FacturacionResponse } from '../../services/api/facturacion';

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
    const [printing, setPrinting] = useState(false);
    const [smtpConfigured, setSMTPConfigured] = useState<boolean | null>(null);
    const [comprobante, setComprobante] = useState<FacturacionResponse | null>(null);
    const [loadingComprobante, setLoadingComprobante] = useState(false);
    const [downloadingPDF, setDownloadingPDF] = useState(false);
    const [openingFactura, setOpeningFactura] = useState(false);
    const [emailCliente, setEmailCliente] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const ticketRef = useRef<HTMLDivElement>(null);

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
        console.log('[PostSaleModal] Iniciando impresión...', {
            numeroTicket: record.numeroTicket,
        });
        
        setPrinting(true);
        
        try {
            // Obtener el contenido HTML del ticket
            const ticketElement = ticketRef.current;
            if (!ticketElement) {
                throw new Error('No se pudo obtener el contenido del ticket');
            }

            // Crear una ventana nueva para imprimir
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            if (!printWindow) {
                throw new Error('No se pudo abrir la ventana de impresión. Verifica que los popups no estén bloqueados.');
            }

            // Escribir el HTML con estilos incluidos
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Ticket #${record.numeroTicket}</title>
                    <style>
                        * { 
                            margin: 0; 
                            padding: 0; 
                            box-sizing: border-box; 
                        }
                        body { 
                            font-family: 'Courier New', monospace;
                            padding: 10mm;
                            background: white;
                            font-size: 12px;
                            color: #000;
                        }
                        .ticket {
                            max-width: 80mm;
                            margin: 0 auto;
                            padding: 20px;
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            color: #000;
                            background: white;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 15px;
                        }
                        .storeName {
                            font-size: 20px;
                            font-weight: bold;
                            margin: 0 0 5px 0;
                        }
                        .storeSubtitle {
                            font-size: 11px;
                            margin: 0;
                            color: #666;
                        }
                        .section {
                            margin: 10px 0;
                        }
                        .row {
                            display: flex;
                            justify-content: space-between;
                            margin: 4px 0;
                            font-size: 11px;
                        }
                        .label {
                            font-weight: normal;
                            color: #333;
                        }
                        .value {
                            font-weight: bold;
                            text-align: right;
                        }
                        .totalRow {
                            font-size: 14px;
                            font-weight: bold;
                            margin-top: 8px;
                            padding-top: 8px;
                            border-top: 1px solid #000;
                        }
                        .totalRow .label,
                        .totalRow .value {
                            font-weight: bold;
                        }
                        .divider {
                            border-top: 1px dashed #666;
                            margin: 10px 0;
                        }
                        .itemsTable {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 10px;
                            margin: 5px 0;
                        }
                        .itemsTable thead th {
                            border-bottom: 1px solid #000;
                            padding: 4px 2px;
                            font-weight: bold;
                            text-align: left;
                            font-size: 10px;
                        }
                        .itemsTable tbody td {
                            padding: 3px 2px;
                            font-size: 10px;
                        }
                        .pagosMixtos {
                            margin-left: 10px;
                            font-size: 10px;
                        }
                        .footer {
                            text-align: center;
                            margin-top: 20px;
                            padding-top: 10px;
                            border-top: 1px dashed #666;
                        }
                        .footer p {
                            margin: 5px 0;
                            font-size: 11px;
                        }
                        .small {
                            font-size: 9px !important;
                            color: #666;
                        }
                        @media print {
                            @page { 
                                size: 80mm auto;
                                margin: 5mm;
                            }
                            body { 
                                padding: 0; 
                                margin: 0;
                            }
                            .ticket {
                                padding: 5mm;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${ticketElement.innerHTML}
                </body>
                </html>
            `);
            printWindow.document.close();

            // Esperar a que se cargue y abrir diálogo de impresión
            printWindow.onload = () => {
                printWindow.focus();
                printWindow.print();
                // Cerrar la ventana después de imprimir (el usuario puede cancelar)
                setTimeout(() => {
                    printWindow.close();
                }, 100);
            };

            console.log('[PostSaleModal] Ventana de impresión abierta');
            
            notifications.show({
                title: 'Impresión iniciada',
                message: `Ticket #${record.numeroTicket}`,
                color: 'blue',
                icon: <Printer size={14} />,
                autoClose: 3000,
            });
        } catch (err) {
            console.error('[PostSaleModal] Error de impresión:', err);
            
            const errorMessage = err instanceof Error ? err.message : 'No se pudo iniciar la impresión.';
            const isPopupBlocked = errorMessage.includes('popup') || errorMessage.includes('ventana');
            
            notifications.show({
                title: 'Error de impresión',
                message: isPopupBlocked 
                    ? 'Los popups están bloqueados. Por favor, permite ventanas emergentes para este sitio y vuelve a intentar.'
                    : errorMessage,
                color: 'red',
                autoClose: isPopupBlocked ? 8000 : 5000,
            });
        } finally {
            setPrinting(false);
        }
    };

    const handleDownloadFactura = async () => {
        if (!comprobante) return;
        
        setDownloadingPDF(true);
        try {
            const tipoLetra = record.tipoComprobante === 'factura_a' ? 'A' 
                : record.tipoComprobante === 'factura_b' ? 'B' 
                : 'C';
            const fileName = `factura_${tipoLetra}_${comprobante.punto_de_venta.toString().padStart(4, '0')}_${comprobante.numero?.toString().padStart(8, '0') || '00000000'}.pdf`;
            
            await descargarPDF(comprobante.id, fileName);
            
            notifications.show({
                title: 'Factura descargada',
                message: `${fileName}`,
                color: 'green',
                icon: <Download size={14} />,
                autoClose: 3000,
            });
        } catch (err) {
            console.error('[PostSaleModal] Error descargando factura:', err);
            notifications.show({
                title: 'Error al descargar',
                message: 'La factura aún no está disponible. Intenta nuevamente en unos segundos.',
                color: 'orange',
                autoClose: 5000,
            });
        } finally {
            setDownloadingPDF(false);
        }
    };

    const handleOpenFactura = async () => {
        if (!comprobante) return;

        setOpeningFactura(true);
        try {
            await abrirFacturaHTML(comprobante.id);
            notifications.show({
                title: 'Factura abierta',
                message: 'Se abrio la factura en una nueva ventana para imprimir o guardar como PDF.',
                color: 'green',
                icon: <FileText size={14} />,
                autoClose: 3000,
            });
        } catch (err) {
            notifications.show({
                title: 'No se pudo abrir la factura',
                message: err instanceof Error ? err.message : 'Error desconocido.',
                color: 'red',
                autoClose: 5000,
            });
        } finally {
            setOpeningFactura(false);
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
                    {/* Descargar Factura Fiscal (si es factura A/B/C) */}
                    {isFiscal && comprobante && comprobante.estado === 'emitido' && (
                        <>
                            <Button
                                size="lg"
                                leftSection={<Printer size={18} />}
                                onClick={handleOpenFactura}
                                loading={openingFactura}
                                variant="gradient"
                                gradient={{ from: 'teal', to: 'lime', deg: 90 }}
                                fullWidth
                            >
                                Abrir Factura para Imprimir
                            </Button>

                            <Button
                                size="lg"
                                leftSection={<FileText size={18} />}
                                onClick={handleDownloadFactura}
                                loading={downloadingPDF}
                                variant="gradient"
                                gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
                                fullWidth
                            >
                                Descargar Factura Fiscal PDF
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

                    {/* Imprimir ticket térmico */}
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

            {/* Ticket para impresión - renderizado pero oculto visualmente */}
            <div 
                style={{ 
                    position: 'fixed',
                    left: '-9999px',
                    width: '80mm',
                    background: 'white'
                }} 
                className="printable-content"
            >
                <PrintableTicket ref={ticketRef} record={record} />
            </div>
        </Modal>
    );
}
