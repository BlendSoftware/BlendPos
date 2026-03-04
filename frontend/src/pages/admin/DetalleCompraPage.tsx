import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Stack, Title, Text, Group, Button, Badge, Table,
    Paper, Divider, Grid, Skeleton, Alert, Select,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { obtenerCompra, actualizarEstadoCompra, type CompraResponse } from '../../services/api/compras';
import { formatARS } from '../../utils/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
    pendiente: 'yellow',
    pagada:    'teal',
    anulada:   'gray',
};

function fmtDate(iso: string | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-AR');
}

function fmtNum(n: number | undefined) {
    if (n === undefined) return '—';
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Number(n));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DetalleCompraPage() {
    const { id }     = useParams<{ id: string }>();
    const navigate   = useNavigate();
    const [compra, setCompra]     = useState<CompraResponse | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [savingEstado, setSavingEstado] = useState(false);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        obtenerCompra(id)
            .then(setCompra)
            .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar la compra'))
            .finally(() => setLoading(false));
    }, [id]);

    const handleCambiarEstado = async (estado: 'pendiente' | 'pagada' | 'anulada') => {
        if (!compra) return;
        setSavingEstado(true);
        try {
            const updated = await actualizarEstadoCompra(compra.id, estado);
            setCompra(prev => prev ? { ...prev, estado: updated.estado } : prev);
            notifications.show({ color: 'teal', message: 'Estado actualizado' });
        } catch (e: unknown) {
            notifications.show({ color: 'red', message: e instanceof Error ? e.message : 'Error' });
        } finally {
            setSavingEstado(false);
        }
    };

    if (loading) return (
        <Stack gap="lg" p="md">
            <Skeleton h={32} w={200} />
            <Skeleton h={120} />
            <Skeleton h={200} />
        </Stack>
    );

    if (error || !compra) return (
        <Stack gap="lg" p="md">
            <Button variant="subtle" leftSection={<ChevronLeft size={16} />} w="fit-content"
                onClick={() => navigate('/admin/proveedores?tab=compras')}>
                Volver a Compras
            </Button>
            <Alert icon={<AlertCircle size={16} />} color="red">{error ?? 'Compra no encontrada'}</Alert>
        </Stack>
    );

    const subtotal = Number(compra.subtotal);
    const descuento = Number(compra.descuento_total);
    const total = Number(compra.total);

    return (
        <Stack gap="lg" p="md">
            {/* Breadcrumb */}
            <Button
                variant="subtle"
                leftSection={<ChevronLeft size={16} />}
                w="fit-content"
                onClick={() => navigate('/admin/proveedores?tab=compras')}
            >
                Volver a Compras
            </Button>

            {/* Header */}
            <Group justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={2}>
                    <Group gap="sm">
                        <Title order={2}>Compra {compra.numero ?? `#${compra.id.slice(0, 8)}`}</Title>
                        <Badge color={ESTADO_COLOR[compra.estado] ?? 'gray'} size="lg" variant="light">
                            {compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1)}
                        </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">Registrada el {fmtDate(compra.created_at)}</Text>
                </Stack>
                <Select
                    label="Cambiar estado"
                    w={160}
                    data={[
                        { value: 'pendiente', label: 'Pendiente' },
                        { value: 'pagada',    label: 'Pagada' },
                        { value: 'anulada',   label: 'Anulada' },
                    ]}
                    value={compra.estado}
                    onChange={v => { if (v) void handleCambiarEstado(v as 'pendiente' | 'pagada' | 'anulada'); }}
                    disabled={savingEstado}
                    comboboxProps={{ withinPortal: true }}
                />
            </Group>

            <Grid gutter="md">
                {/* Left: items table */}
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Stack gap="md">
                        {/* Proveedor info */}
                        <Paper withBorder radius="md" p="md">
                            <Grid>
                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                    <Text size="xs" c="dimmed" fw={600}>PROVEEDOR</Text>
                                    <Text size="sm" fw={500}>{compra.nombre_proveedor}</Text>
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                    <Text size="xs" c="dimmed" fw={600}>FECHA COMPRA</Text>
                                    <Text size="sm">{fmtDate(compra.fecha_compra)}</Text>
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                    <Text size="xs" c="dimmed" fw={600}>VENCIMIENTO</Text>
                                    <Text size="sm">{fmtDate(compra.fecha_vencimiento)}</Text>
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                    <Text size="xs" c="dimmed" fw={600}>MONEDA</Text>
                                    <Text size="sm">{compra.moneda}</Text>
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                    <Text size="xs" c="dimmed" fw={600}>DEPÓSITO</Text>
                                    <Text size="sm">{compra.deposito || '—'}</Text>
                                </Grid.Col>
                                {compra.notas && (
                                    <Grid.Col span={12}>
                                        <Text size="xs" c="dimmed" fw={600}>NOTAS</Text>
                                        <Text size="sm">{compra.notas}</Text>
                                    </Grid.Col>
                                )}
                            </Grid>
                        </Paper>

                        {/* Items */}
                        <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Producto</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Precio</Table.Th>
                                        <Table.Th style={{ textAlign: 'center' }}>Cant.</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Desc.%</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Imp.%</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {(compra.items ?? []).map(item => (
                                        <Table.Tr key={item.id}>
                                            <Table.Td>
                                                <Text size="sm">{item.nombre_producto}</Text>
                                                {item.observaciones && (
                                                    <Text size="xs" c="dimmed">{item.observaciones}</Text>
                                                )}
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="sm">${fmtNum(item.precio)}</Text>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'center' }}>
                                                <Text size="sm">{item.cantidad}</Text>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="sm" c="dimmed">{Number(item.descuento_pct)}%</Text>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="sm" c="dimmed">{Number(item.impuesto_pct)}%</Text>
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                <Text size="sm" fw={600}>${fmtNum(item.total)}</Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Paper>
                    </Stack>
                </Grid.Col>

                {/* Right: totals */}
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder radius="md" p="md">
                        <Stack gap="sm">
                            <Text fw={600} size="sm">Resumen</Text>
                            <Divider />
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Subtotal</Text>
                                <Text size="sm">${fmtNum(subtotal + descuento)}</Text>
                            </Group>
                            {descuento > 0 && (
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Descuento</Text>
                                    <Text size="sm" c="red">-${fmtNum(descuento)}</Text>
                                </Group>
                            )}
                            <Divider />
                            <Group justify="space-between">
                                <Text fw={700}>Total</Text>
                                <Text fw={700} size="lg">{formatARS(total)}</Text>
                            </Group>
                        </Stack>
                    </Paper>
                </Grid.Col>
            </Grid>
        </Stack>
    );
}
