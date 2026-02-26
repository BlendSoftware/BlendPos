import { Modal, Stack, Text, Group, Badge, Divider, ScrollArea, Box, ActionIcon } from '@mantine/core';
import { History, Clock, ShoppingBag, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useSaleStore, type SaleRecord } from '../../store/useSaleStore';
import styles from './SaleHistoryModal.module.css';

interface Props {
    opened: boolean;
    onClose: () => void;
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const METODO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo',
    debito: 'Débito',
    credito: 'Crédito',
    qr: 'QR/Transferencia',
    mixto: 'Mixto',
};

const METODO_COLOR: Record<string, string> = {
    efectivo: 'green',
    debito: 'blue',
    credito: 'violet',
    qr: 'cyan',
    mixto: 'orange',
};

const PAGO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo',
    debito: 'Débito',
    credito: 'Crédito',
    qr: 'QR/Transferencia',
};

function SaleRow({ sale }: { sale: SaleRecord }) {
    const [expanded, setExpanded] = useState(false);
    const hasDiscount = sale.totalConDescuento < sale.total;

    return (
        <Box className={styles.saleCard}>
            <Group justify="space-between" onClick={() => setExpanded((v) => !v)} className={styles.saleHeader}>
                <Group gap="sm">
                    <ShoppingBag size={16} color="var(--mantine-color-dark-3)" />
                    <Stack gap={0}>
                        <Text size="sm" fw={600} ff="monospace">
                            #{sale.numeroTicket}
                        </Text>
                        <Group gap="xs">
                            <Clock size={11} color="#909296" />
                            <Text size="xs" c="dimmed">
                                {formatTime(sale.fecha)}
                            </Text>
                            <Text size="xs" c="dimmed">•</Text>
                            <Text size="xs" c="dimmed">
                                {sale.items.reduce((s, i) => s + i.cantidad, 0)} artículos
                            </Text>
                        </Group>
                    </Stack>
                </Group>
                <Group gap="sm">
                    <Badge color={METODO_COLOR[sale.metodoPago] ?? 'gray'} variant="light" size="sm">
                        <Group gap={4}>
                            <CreditCard size={10} />
                            {METODO_LABEL[sale.metodoPago] ?? sale.metodoPago}
                        </Group>
                    </Badge>
                    <Stack gap={0} align="flex-end">
                        {hasDiscount && (
                            <Text size="xs" c="dimmed" td="line-through" ff="monospace">
                                {formatCurrency(sale.total)}
                            </Text>
                        )}
                        <Text size="md" fw={800} c="green.5" ff="monospace">
                            {formatCurrency(sale.totalConDescuento)}
                        </Text>
                    </Stack>
                    <ActionIcon variant="subtle" color="gray" size="sm">
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </ActionIcon>
                </Group>
            </Group>

            {expanded && (
                <Box className={styles.saleDetail}>
                    <Divider mb="xs" />
                    {sale.pagos && sale.pagos.length > 0 && (
                        <>
                            {sale.pagos.map((p) => (
                                <Group key={p.metodo} justify="space-between" py={2}>
                                    <Text size="xs" c="dimmed">{PAGO_LABEL[p.metodo] ?? p.metodo}</Text>
                                    <Text size="xs" ff="monospace" c="dimmed">
                                        {formatCurrency(p.monto)}
                                    </Text>
                                </Group>
                            ))}
                            {typeof sale.vuelto === 'number' && sale.vuelto > 0 && (
                                <Group justify="space-between" py={2}>
                                    <Text size="xs" c="dimmed">Vuelto</Text>
                                    <Text size="xs" ff="monospace" c="dimmed">
                                        {formatCurrency(sale.vuelto)}
                                    </Text>
                                </Group>
                            )}
                            <Divider my="xs" />
                        </>
                    )}
                    {sale.items.map((item) => (
                        <Group key={item.id} justify="space-between" py={4}>
                            <Group gap="xs">
                                <Text size="xs" c="dimmed" w={20}>{item.cantidad}×</Text>
                                <Text size="xs">{item.nombre}</Text>
                                {item.descuento > 0 && (
                                    <Badge size="xs" color="orange" variant="light">-{item.descuento}%</Badge>
                                )}
                            </Group>
                            <Text size="xs" ff="monospace" c="dimmed">
                                {formatCurrency(item.subtotal)}
                            </Text>
                        </Group>
                    ))}
                </Box>
            )}
        </Box>
    );
}

export function SaleHistoryModal({ opened, onClose }: Props) {
    const historial = useSaleStore((s) => s.historial);

    const totalVendido = historial.reduce((sum, s) => sum + s.totalConDescuento, 0);
    const totalTransactions = historial.length;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="xs">
                    <History size={20} />
                    <Text size="lg" fw={700}>Historial de Ventas</Text>
                </Group>
            }
            size="lg"
            centered
        >
            <Stack gap="md">
                {historial.length > 0 && (
                    <Group grow className={styles.statsRow}>
                        <Box className={styles.statCard}>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Ventas hoy</Text>
                            <Text size="xl" fw={800}>{totalTransactions}</Text>
                        </Box>
                        <Box className={styles.statCard}>
                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total cobrado</Text>
                            <Text size="xl" fw={800} c="green.5" ff="monospace">
                                {formatCurrency(totalVendido)}
                            </Text>
                        </Box>
                    </Group>
                )}

                <Divider />

                {historial.length === 0 ? (
                    <Stack align="center" py="xl" gap="sm">
                        <History size={48} strokeWidth={1} color="var(--mantine-color-dark-3)" />
                        <Text c="dimmed" size="md" fw={600}>No hay ventas registradas</Text>
                        <Text c="dimmed" size="sm">Las ventas confirmadas aparecerán aquí.</Text>
                    </Stack>
                ) : (
                    <ScrollArea h={420} scrollbarSize={6}>
                        <Stack gap="xs">
                            {historial.map((sale) => (
                                <SaleRow key={sale.id} sale={sale} />
                            ))}
                        </Stack>
                    </ScrollArea>
                )}
            </Stack>
        </Modal>
    );
}
