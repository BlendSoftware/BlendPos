import { useState, useRef } from 'react';
import {
    Modal, Stack, Text, Group, Button, Divider, Badge, ThemeIcon, Box, Alert,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { CheckCircle, Printer, X, Mail, Receipt, AlertCircle, Info } from 'lucide-react';
import { usePOSUIStore } from '../../store/usePOSUIStore';
import { formatARS } from '../../utils/format';
import { PrintableTicket } from './PrintableTicket';

const METODO_LABEL: Record<string, string> = {
    efectivo: '💵 Efectivo',
    debito: '💳 Débito',
    credito: '💳 Crédito',
    qr: '📱 QR',
    mixto: '🧾 Mixto',
    transferencia: '📱 Transferencia',
};

export function PostSaleModal() {
    const isOpen = usePOSUIStore((s) => s.isPostSaleModalOpen);
    const record = usePOSUIStore((s) => s.lastSaleRecord);
    const close = usePOSUIStore((s) => s.closePostSaleModal);
    const [printing, setPrinting] = useState(false);
    const ticketRef = useRef<HTMLDivElement>(null);

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
            hasRef: !!ticketRef.current,
        });
        
        setPrinting(true);
        
        // Dar un pequeño delay para asegurar que el DOM esté listo
        setTimeout(() => {
            try {
                window.print();
                
                console.log('[PostSaleModal] Diálogo de impresión abierto');
                
                notifications.show({
                    title: 'Impresión iniciada',
                    message: `Ticket #${record.numeroTicket}`,
                    color: 'blue',
                    icon: <Printer size={14} />,
                    autoClose: 3000,
                });
            } catch (err) {
                console.error('[PostSaleModal] Error de impresión:', err);
                notifications.show({
                    title: 'Error de impresión',
                    message: 'No se pudo iniciar la impresión.',
                    color: 'red',
                    autoClose: 5000,
                });
            } finally {
                setPrinting(false);
            }
        }, 100);
    };

    const total = record.totalConDescuento || record.total;
    const vuelto = record.vuelto ?? 0;

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

                {record.clienteEmail && (
                    <>
                        <Divider />
                        <Alert 
                            icon={<Info size={16} />} 
                            color="blue"
                            variant="light"
                            title="Email pendiente"
                        >
                            <Text size="xs">
                                El comprobante se enviará a <strong>{record.clienteEmail}</strong> cuando
                                la venta se sincronice con el servidor.<br/><br/>
                                <strong>Nota:</strong> El servidor debe tener configurado SMTP para enviar emails.
                                Si no recibes el email, contacta al administrador para verificar la configuración.
                            </Text>
                        </Alert>
                    </>
                )}

                <Divider />

                {/* Actions */}
                <Stack gap="sm">
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
