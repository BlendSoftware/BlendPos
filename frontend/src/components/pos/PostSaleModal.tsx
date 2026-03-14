import { useState, useEffect } from 'react';
import {
    Modal, Stack, Text, Group, Button, Divider, Badge, ThemeIcon, Box, Alert, Loader, TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CheckCircle, Printer, X, Mail, Receipt, AlertCircle, Info, FileText } from 'lucide-react';
import { usePOSUIStore } from '../../store/usePOSUIStore';
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

    const handlePrintTicket = async () => {
        setPrinting(true);
        try {
            const comp = await getComprobante(record.id);
            await abrirFacturaHTML(comp.id, true, false);
        } catch (err) {
            notifications.show({
                title: 'No se pudo abrir el comprobante',
                message: err instanceof Error ? err.message : 'Error desconocido.',
                color: 'red',
                autoClose: 5000,
            });
        } finally {
            setPrinting(false);
        }
    };

    // Abre el HTML de la factura (ORIGINAL o DUPLICADO)
    const handleOpenFactura = async (esCopia: boolean) => {
        if (!comprobante) return;

        if (esCopia) setOpeningDuplicado(true);
        else setOpeningFactura(true);
        try {
            await abrirFacturaHTML(comprobante.id, false, esCopia);
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
                        onClick={handlePrintTicket}
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
                        onClick={async () => {
                            if (isFiscal && comprobante?.estado === 'emitido') {
                                await handleOpenFactura(false);
                            } else if (!isFiscal) {
                                await handlePrintTicket();
                            }
                            close();
                        }}
                        loading={printing || openingFactura}
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
