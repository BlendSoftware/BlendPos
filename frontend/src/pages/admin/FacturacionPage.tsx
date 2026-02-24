import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Stack, Title, Text, Group, Table, Paper, Badge, ActionIcon,
    Tooltip, TextInput, Modal, Button, Select, Alert,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { Printer, Download, ChevronDown, ChevronUp, Search, Ban, AlertTriangle, RefreshCw } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { useAuthStore } from '../../store/useAuthStore';
import { useSaleStore, type SaleRecord, type MetodoPago } from '../../store/useSaleStore';
import { anularVenta, listarVentas, type VentaListItem } from '../../services/api/ventas';
import { getComprobante, descargarPDF } from '../../services/api/facturacion';
import { thermalPrinter } from '../../services/ThermalPrinterService';
import { usePrinterStore } from '../../store/usePrinterStore';
import { formatARS } from '../../api/mockAdmin';
import type { IVenta } from '../../types';

const METODO_COLOR: Record<string, string> = {
    efectivo: 'teal', debito: 'blue', credito: 'violet', qr: 'orange',
};

type Periodo = 'hoy' | 'ayer' | 'semana' | 'todas';

function matchesPeriodo(fecha: string, periodo: Periodo): boolean {
    const d = new Date(fecha);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    if (periodo === 'hoy') return d >= today;
    if (periodo === 'ayer') return d >= yesterday && d < today;
    if (periodo === 'semana') return d >= weekAgo;
    return true;
}

export function FacturacionPage() {
    const { hasRole } = useAuthStore();
    const historialLocal = useSaleStore((s) => s.historial);
    const [apiVentas, setApiVentas] = useState<VentaListItem[]>([]);
    const [loadingVentas, setLoadingVentas] = useState(false);
    const [desde, setDesde] = useState<Date | null>(null);
    const [hasta, setHasta] = useState<Date | null>(null);
    const [ordenarPor, setOrdenarPor] = useState<string>('fecha');
    const [orden, setOrden] = useState<string>('desc');

    const toDateStr = (d: Date | null) => d ? d.toISOString().slice(0, 10) : undefined;

    const cargarVentas = useCallback(async () => {
        setLoadingVentas(true);
        try {
            const resp = await listarVentas({
                estado: 'completada',
                limit: 200,
                desde: toDateStr(desde),
                hasta: toDateStr(hasta),
                ordenar_por: ordenarPor,
                orden,
            });
            setApiVentas(resp.data);
        } catch { /* silent */ } finally {
            setLoadingVentas(false);
        }
    }, [desde, hasta, ordenarPor, orden]);

    useEffect(() => { cargarVentas(); }, [cargarVentas]);

    // Map SaleRecord to IVenta for display, merging API data with local session
    const ventas: IVenta[] = useMemo(() => {
        // Convert local session records
        const localIds = new Set(historialLocal.map((r) => r.id));
        const localVentas: IVenta[] = historialLocal.map((r: SaleRecord) => ({
            id: r.id,
            numeroTicket: r.numeroTicket,
            items: r.items.map((item) => ({
                productoId: item.id,
                productoNombre: item.nombre,
                codigoBarras: item.codigoBarras,
                cantidad: item.cantidad,
                precioUnitario: item.precio,
                descuento: item.descuento,
                subtotal: item.subtotal,
            })),
            subtotal: r.total,
            descuentoGlobal: 0,
            total: r.totalConDescuento,
            metodoPago: r.metodoPago,
            pagos: r.pagos?.map((p) => ({ metodo: p.metodo, monto: p.monto })),
            vuelto: r.vuelto,
            cajeroId: 'local',
            cajeroNombre: r.cajero,
            fecha: r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha),
            anulada: false,
        }));
        // Merge API ventas (deduplicate by id against local)
        const apiConverted: IVenta[] = (apiVentas
            .filter((v) => !localIds.has(v.id))
            .map((v) => ({
                id: v.id,
                numeroTicket: String(v.numero_ticket),
                items: v.items.map((item) => ({
                    productoId: '',
                    productoNombre: item.producto,
                    codigoBarras: '',
                    cantidad: item.cantidad,
                    precioUnitario: item.precio_unitario,
                    descuento: 0,
                    subtotal: item.subtotal,
                })),
                subtotal: v.subtotal,
                descuentoGlobal: v.descuento_total,
                total: v.total,
                metodoPago: (v.pagos[0]?.metodo ?? 'efectivo') as MetodoPago,
                pagos: v.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
                vuelto: 0,
                cajeroId: v.usuario_id,
                cajeroNombre: '',
                fecha: v.created_at,
                anulada: v.estado === 'anulada',
            }))) as unknown as IVenta[];
        return [...localVentas, ...apiConverted].sort(
            (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        );
    }, [historialLocal, apiVentas]);

    const [busqueda, setBusqueda] = useState('');
    const [periodo, setPeriodo] = useState<string>('todas');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [anularTarget, setAnularTarget] = useState<IVenta | null>(null);
    const [anuladas, setAnuladas] = useState<Set<string>>(new Set());

    const filtered = useMemo(() => {
        const q = busqueda.toLowerCase();
        return ventas
            .map((v) => ({ ...v, anulada: anuladas.has(v.id) }))
            .filter(
                (v) =>
                    matchesPeriodo(v.fecha, periodo as Periodo) &&
                    (!q ||
                        v.numeroTicket.includes(q) ||
                        v.cajeroNombre.toLowerCase().includes(q) ||
                        v.id.toLowerCase().includes(q))
            );
    }, [ventas, anuladas, busqueda, periodo]);

    const handleReprint = async (v: IVenta) => {
        // Reconstruye un SaleRecord desde IVenta y lo manda a la impresora
        const saleRecord: SaleRecord = {
            id: v.id,
            numeroTicket: v.numeroTicket,
            fecha: new Date(v.fecha),
            items: v.items.map((item) => ({
                id: item.productoId,
                nombre: item.productoNombre,
                precio: item.precioUnitario,
                codigoBarras: item.codigoBarras || '',
                cantidad: item.cantidad,
                subtotal: item.subtotal,
                descuento: item.descuento,
            })),
            total: v.total,
            totalConDescuento: v.total,
            metodoPago: v.metodoPago as MetodoPago,
            pagos: v.pagos as SaleRecord['pagos'],
            vuelto: v.vuelto ?? 0,
            cajero: v.cajeroNombre,
        };
        const cfg = usePrinterStore.getState().config;
        thermalPrinter.printAll(saleRecord, cfg).catch(console.error);
        notifications.show({
            title: 'Reimpresión enviada',
            message: `Ticket #${v.numeroTicket}`,
            color: 'blue',
            icon: <Printer size={14} />,
        });
    };

    const handleDownloadPDF = async (v: IVenta) => {
        try {
            // Intentar obtener el id real del comprobante desde el backend
            const comp = await getComprobante(v.id).catch(() => null);
            const pdfId = comp?.id ?? v.id;
            await descargarPDF(pdfId, `ticket_${v.numeroTicket}.pdf`);
        } catch {
            notifications.show({
                title: 'PDF no disponible',
                message: 'El comprobante aún no fue generado o el backend no está conectado.',
                color: 'orange',
                icon: <Download size={14} />,
            });
        }
    };

    const handleAnular = async () => {
        if (!anularTarget) return;
        try {
            await anularVenta(anularTarget.id, 'Anulación manual desde admin');
        } catch {
            // If backend fails (e.g. not connected), still update local state
        }
        setAnuladas((prev) => new Set([...prev, anularTarget.id]));
        notifications.show({
            title: 'Venta anulada',
            message: `Ticket #${anularTarget.numeroTicket}`,
            color: 'red',
            icon: <Ban size={14} />,
        });
        setAnularTarget(null);
    };

    const canAnular = hasRole(['admin', 'supervisor']);

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Historial de Facturación</Title>
                    <Text c="dimmed" size="sm">{ventas.length} tickets registrados</Text>
                </div>
            </Group>

            <Group wrap="wrap" gap="sm">
                <TextInput
                    placeholder="Buscar por número de ticket o cajero..."
                    leftSection={<Search size={14} />}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.currentTarget.value)}
                    style={{ flex: 1, minWidth: 240 }}
                />
                <DateInput
                    placeholder="Desde"
                    value={desde}
                    onChange={setDesde}
                    clearable
                    valueFormat="DD/MM/YYYY"
                    style={{ width: 150 }}
                />
                <DateInput
                    placeholder="Hasta"
                    value={hasta}
                    onChange={setHasta}
                    clearable
                    valueFormat="DD/MM/YYYY"
                    style={{ width: 150 }}
                />
                <Select
                    placeholder="Período"
                    value={periodo}
                    onChange={(v) => setPeriodo(v ?? 'todas')}
                    data={[
                        { value: 'hoy',    label: 'Hoy' },
                        { value: 'ayer',   label: 'Ayer' },
                        { value: 'semana', label: 'Última semana' },
                        { value: 'todas',  label: 'Todas' },
                    ]}
                    style={{ width: 150 }}
                    clearable
                />
                <Select
                    placeholder="Ordenar por"
                    value={ordenarPor}
                    onChange={(v) => setOrdenarPor(v ?? 'fecha')}
                    data={[
                        { value: 'fecha', label: 'Fecha' },
                        { value: 'total', label: 'Total' },
                        { value: 'numero_ticket', label: 'N° Ticket' },
                    ]}
                    style={{ width: 150 }}
                />
                <Select
                    value={orden}
                    onChange={(v) => setOrden(v ?? 'desc')}
                    data={[
                        { value: 'desc', label: '↓ Descendente' },
                        { value: 'asc',  label: '↑ Ascendente' },
                    ]}
                    style={{ width: 150 }}
                />
                <Tooltip label="Actualizar" withArrow>
                    <ActionIcon variant="light" loading={loadingVentas} onClick={cargarVentas}>
                        <RefreshCw size={15} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                <Table highlightOnHover verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th style={{ width: 30 }} />
                            <Table.Th>Ticket</Table.Th>
                            <Table.Th>Fecha</Table.Th>
                            <Table.Th>Cajero</Table.Th>
                            <Table.Th>Método</Table.Th>
                            <Table.Th>Total</Table.Th>
                            <Table.Th>Estado</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {filtered.map((v) => (
                            <>
                                <Table.Tr
                                    key={v.id}
                                    style={{ cursor: 'pointer', opacity: v.anulada ? 0.5 : 1 }}
                                    onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                                >
                                    <Table.Td>
                                        {expandedId === v.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={600} ff="monospace">#{v.numeroTicket}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="xs">
                                            {new Date(v.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td><Text size="sm">{v.cajeroNombre}</Text></Table.Td>
                                    <Table.Td>
                                        <Badge color={METODO_COLOR[v.metodoPago]} size="sm" variant="light">
                                            {v.metodoPago}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700}>{formatARS(v.total)}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        {v.anulada
                                            ? <Badge color="red" size="sm" variant="light">Anulada</Badge>
                                            : <Badge color="teal" size="sm" variant="light">Válida</Badge>
                                        }
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={4} onClick={(e) => e.stopPropagation()}>
                                            <Tooltip label="Reimprimir" withArrow>
                                                <ActionIcon variant="subtle" color="blue" onClick={() => handleReprint(v)} disabled={v.anulada}>
                                                    <Printer size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Descargar PDF" withArrow>
                                                <ActionIcon variant="subtle" color="gray" onClick={() => handleDownloadPDF(v)}>
                                                    <Download size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            {canAnular && !v.anulada && (
                                                <Tooltip label="Anular venta" withArrow>
                                                    <ActionIcon variant="subtle" color="red" onClick={() => setAnularTarget(v)}>
                                                        <Ban size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>

                                {expandedId === v.id && (
                                    <Table.Tr key={`${v.id}-detail`}>
                                        <Table.Td colSpan={8} style={{ background: 'var(--mantine-color-dark-7)', padding: '12px 24px' }}>
                                            <Text size="xs" fw={600} mb="xs" c="dimmed">DETALLE DE ITEMS</Text>
                                            <Table verticalSpacing="xs">
                                                <Table.Thead>
                                                    <Table.Tr>
                                                        <Table.Th><Text size="xs">Producto</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Cant.</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Precio unit.</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Dto.</Text></Table.Th>
                                                        <Table.Th><Text size="xs">Subtotal</Text></Table.Th>
                                                    </Table.Tr>
                                                </Table.Thead>
                                                <Table.Tbody>
                                                    {v.items.map((item, i) => (
                                                        <Table.Tr key={i}>
                                                            <Table.Td><Text size="xs">{item.productoNombre}</Text></Table.Td>
                                                            <Table.Td><Text size="xs">{item.cantidad}</Text></Table.Td>
                                                            <Table.Td><Text size="xs">{formatARS(item.precioUnitario)}</Text></Table.Td>
                                                            <Table.Td><Text size="xs" c={item.descuento > 0 ? 'yellow' : 'dimmed'}>{item.descuento}%</Text></Table.Td>
                                                            <Table.Td><Text size="xs" fw={600}>{formatARS(item.subtotal)}</Text></Table.Td>
                                                        </Table.Tr>
                                                    ))}
                                                </Table.Tbody>
                                            </Table>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            {/* Anular Modal */}
            <Modal
                opened={!!anularTarget}
                onClose={() => setAnularTarget(null)}
                title={<Text fw={700} c="red">Confirmar Anulación</Text>}
                size="sm"
                centered
            >
                {anularTarget && (
                    <Stack gap="md">
                        <Alert color="red" variant="light" icon={<AlertTriangle size={16} />}>
                            Estás por anular el ticket <strong>#{anularTarget.numeroTicket}</strong> por{' '}
                            <strong>{formatARS(anularTarget.total)}</strong>.
                            Esta acción no se puede deshacer.
                        </Alert>
                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => setAnularTarget(null)}>Cancelar</Button>
                            <Button color="red" leftSection={<Ban size={14} />} onClick={handleAnular}>
                                Anular venta
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}
