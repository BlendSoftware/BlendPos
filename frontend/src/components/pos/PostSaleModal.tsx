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
