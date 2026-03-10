import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Stack, Title, Text, Group, Button, Badge, Table,
    Paper, ActionIcon, Tooltip, Select, Skeleton, Alert,
    Modal,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Plus, Eye, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import {
    listarCompras, actualizarEstadoCompra, eliminarCompra,
    type CompraResponse,
} from '../../services/api/compras';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
    pendiente: 'yellow',
    pagada:    'teal',
    anulada:   'gray',
};

const ESTADO_LABEL: Record<string, string> = {
    pendiente: 'Pendiente',
    pagada:    'Pagada',
    anulada:   'Anulada',
};

function fmt(amount: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
}

function fmtDate(iso: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-AR');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ComprasPage() {
    const navigate = useNavigate();
    const [compras, setCompras]           = useState<CompraResponse[]>([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState<string | null>(null);
    const [filtroEstado, setFiltroEstado] = useState<string | null>(null);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget]   = useState<CompraResponse | null>(null);
    const [deleting, setDeleting]           = useState(false);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listarCompras({ estado: filtroEstado ?? undefined, limit: 100 });
            setCompras(res.data ?? []);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al cargar compras';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [filtroEstado]);

    useEffect(() => { void cargar(); }, [cargar]);

    const handleCambiarEstado = async (id: string, estado: 'pendiente' | 'pagada' | 'anulada') => {
        try {
            const updated = await actualizarEstadoCompra(id, estado);
            setCompras(prev => prev.map(c => c.id === id ? { ...c, estado: updated.estado } : c));
            notifications.show({ color: 'teal', message: 'Estado actualizado correctamente' });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al actualizar estado';
            notifications.show({ color: 'red', message: msg });
        }
    };

    const handleEliminar = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await eliminarCompra(deleteTarget.id);
            setCompras(prev => prev.filter(c => c.id !== deleteTarget.id));
            notifications.show({ color: 'teal', message: 'Compra eliminada' });
            setDeleteTarget(null);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al eliminar compra';
            notifications.show({ color: 'red', message: msg });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Stack gap="lg" p="md">
            {/* Header */}
            <Group justify="space-between" align="center">
                <Stack gap={2}>
                    <Title order={2}>Compras</Title>
                    <Text size="sm" c="dimmed">Facturas de proveedores registradas</Text>
                </Stack>
                <Button
                    leftSection={<Plus size={16} />}
                    onClick={() => navigate('/admin/compras/nueva')}
                >
                    Nueva compra
                </Button>
            </Group>

            {/* Filters */}
            <Group>
                <Select
                    placeholder="Filtrar por estado"
                    clearable
                    data={[
                        { value: 'pendiente', label: 'Pendiente' },
                        { value: 'pagada',    label: 'Pagada' },
                        { value: 'anulada',   label: 'Anulada' },
                    ]}
                    value={filtroEstado}
                    onChange={setFiltroEstado}
                    w={180}
                />
                <Tooltip label="Actualizar">
                    <ActionIcon variant="light" onClick={() => void cargar()} loading={loading}>
                        <RefreshCw size={16} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            {/* Error */}
            {error && (
                <Alert icon={<AlertCircle size={16} />} color="red" title="Error">
                    {error}
                </Alert>
            )}

            {/* Table */}
            <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>N°</Table.Th>
                            <Table.Th>Proveedor</Table.Th>
                            <Table.Th>Fecha</Table.Th>
                            <Table.Th>Vencimiento</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Saldo pendiente</Table.Th>
                            <Table.Th>Estado</Table.Th>
                            <Table.Th style={{ textAlign: 'center' }}>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <Table.Tr key={i}>
                                    {Array.from({ length: 8 }).map((_, j) => (
                                        <Table.Td key={j}><Skeleton height={16} /></Table.Td>
                                    ))}
                                </Table.Tr>
                            ))
                        ) : compras.length === 0 ? (
                            <Table.Tr>
                                <Table.Td colSpan={8} style={{ textAlign: 'center' }}>
                                    <Text c="dimmed" py="xl">No hay compras registradas</Text>
                                </Table.Td>
                            </Table.Tr>
                        ) : (
                            compras.map(c => (
                                <Table.Tr key={c.id}>
                                    <Table.Td>
                                        <Text fw={500} size="sm">{c.numero ?? '—'}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{c.nombre_proveedor}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{fmtDate(c.fecha_compra)}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{c.fecha_vencimiento ? fmtDate(c.fecha_vencimiento) : '—'}</Text>
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>
                                        {(() => {
                                            const totalConIva = (c.items ?? []).reduce((s, i) => s + Number(i.total), 0);
                                            return (
                                                <Text size="sm" fw={600}>{fmt(totalConIva)}</Text>
                                            );
                                        })()}
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>
                                        {(() => {
                                            // Si el estado es "pagada", mostrar $0 independientemente del saldo real
                                            if (c.estado === 'pagada') {
                                                return <Text size="sm" c="teal" fw={500}>{fmt(0)}</Text>;
                                            }
                                            // Si está anulada, no mostrar saldo
                                            if (c.estado === 'anulada') {
                                                return <Text size="sm" c="dimmed">—</Text>;
                                            }
                                            // Calcular saldo pendiente para estado "pendiente"
                                            const totalConIva = (c.items ?? []).reduce((s, i) => s + Number(i.total), 0);
                                            const pagado = (c.pagos ?? []).reduce((s, p) => s + Number(p.monto), 0);
                                            const saldo = totalConIva - pagado;
                                            return saldo > 0.005
                                                ? <Text size="sm" fw={600} c="orange">{fmt(saldo)}</Text>
                                                : <Text size="sm" c="teal" fw={500}>{fmt(0)}</Text>;
                                        })()}
                                    </Table.Td>
                                    <Table.Td>
                                        <Select
                                            size="xs"
                                            w={120}
                                            value={c.estado}
                                            data={[
                                                { value: 'pendiente', label: 'Pendiente' },
                                                { value: 'pagada',    label: 'Pagada' },
                                                { value: 'anulada',   label: 'Anulada' },
                                            ]}
                                            onChange={(val) => {
                                                if (val) void handleCambiarEstado(c.id, val as 'pendiente' | 'pagada' | 'anulada');
                                            }}
                                            leftSection={
                                                <Badge
                                                    size="xs"
                                                    color={ESTADO_COLOR[c.estado] ?? 'gray'}
                                                    variant="dot"
                                                    p={0}
                                                    style={{ border: 'none', background: 'transparent' }}
                                                >
                                                    {''}
                                                </Badge>
                                            }
                                            styles={{ input: { paddingLeft: '1.8rem' } }}
                                            comboboxProps={{ withinPortal: true }}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Group justify="center" gap={4}>
                                            <Tooltip label="Ver detalle">
                                                <ActionIcon
                                                    variant="light"
                                                    color="blue"
                                                    size="sm"
                                                    onClick={() => navigate(`/admin/compras/${c.id}`)}
                                                >
                                                    <Eye size={14} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Eliminar">
                                                <ActionIcon
                                                    variant="light"
                                                    color="red"
                                                    size="sm"
                                                    onClick={() => setDeleteTarget(c)}
                                                >
                                                    <Trash2 size={14} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))
                        )}
                    </Table.Tbody>
                </Table>
            </Paper>

            {/* Estado badge legend */}
            {!loading && compras.length > 0 && (
                <Group gap="xs">
                    {Object.entries(ESTADO_LABEL).map(([k, v]) => (
                        <Badge key={k} color={ESTADO_COLOR[k]} variant="light" size="sm">{v}</Badge>
                    ))}
                </Group>
            )}

            {/* Delete confirmation modal */}
            <Modal
                opened={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar compra"
                centered
                size="sm"
            >
                <Stack>
                    <Text>
                        ¿Seguro que deseas eliminar la compra{' '}
                        <b>{deleteTarget?.numero ?? deleteTarget?.id.slice(0, 8)}</b>{' '}
                        de <b>{deleteTarget?.nombre_proveedor}</b>?
                        Esta acción no se puede deshacer.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button color="red" loading={deleting} onClick={() => void handleEliminar()}>
                            Eliminar
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
