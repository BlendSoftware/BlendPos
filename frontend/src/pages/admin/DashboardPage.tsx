import {
    SimpleGrid, Paper, Text, Title, Group, Stack, Badge,
    Skeleton, Table, ThemeIcon, Divider, Center, ActionIcon, Tooltip, SegmentedControl,
} from '@mantine/core';
import { AreaChart, BarChart, DonutChart } from '@mantine/charts';
import {
    TrendingUp, ShoppingCart, Package, AlertTriangle,
    CheckCircle, CreditCard, Banknote, QrCode, Landmark, RefreshCw, Receipt,
} from 'lucide-react';
import { formatARS } from '../../utils/format';
import styles from './DashboardPage.module.css';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getAlertasStock } from '../../services/api/inventario';
import type { AlertaStockResponse } from '../../services/api/inventario';
import { listarVentas, type VentaListItem } from '../../services/api/ventas';
import { listarCompras } from '../../services/api/compras';
import { trySyncQueue, recoverLostSales } from '../../offline/sync';

type Periodo = 'dia' | 'semana' | 'mes';

const PERIODO_LABEL: Record<Periodo, string> = {
    dia: 'Hoy',
    semana: 'Esta semana',
    mes: 'Este mes',
};

function getDateRange(periodo: Periodo): { fecha?: string; desde?: string; hasta?: string; limit: number } {
    const today = new Date();
    const toStr = (d: Date) => d.toLocaleDateString('en-CA');
    const todayStr = toStr(today);
    if (periodo === 'dia') return { fecha: todayStr, limit: 500 };
    if (periodo === 'semana') {
        const desde = new Date(today);
        desde.setDate(today.getDate() - 6);
        return { desde: toStr(desde), hasta: todayStr, limit: 500 };
    }
    // 'mes' = últimos 30 días (igual que FacturacionPage)
    const desde = new Date(today.getTime() - 30 * 86400000);
    return { desde: toStr(desde), hasta: todayStr, limit: 1000 };
}

const METODO_COLOR: Record<string, string> = {
    efectivo: 'teal', debito: 'blue', credito: 'violet', transferencia: 'cyan', qr: 'orange',
};

function metodoIcon(m: string): React.ReactNode {
    if (m === 'efectivo') return <Banknote size={14} />;
    if (m === 'debito') return <CreditCard size={14} />;
    if (m === 'credito' || m === 'transferencia') return <Landmark size={14} />;
    if (m === 'qr') return <QrCode size={14} />;
    return null;
}

function KpiCard({ label, value, sub, icon, color }: {
    label: string; value: string; sub: string; icon: React.ReactNode; color: string;
}) {
    return (
        <Paper p="lg" radius="md" withBorder className={`${styles.card} ${styles.kpiCard}`}
            style={{ borderLeft: `4px solid var(--mantine-color-${color}-5)` }}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.08em' }}>{label}</Text>
                    <Title order={2} fw={900} lh={1.1} c={`${color}.4`}>{value}</Title>
                    <Text size="xs" c="dimmed">{sub}</Text>
                </Stack>
                <ThemeIcon
                    variant="gradient"
                    gradient={{ from: `${color}.9`, to: `${color}.5`, deg: 135 }}
                    size={46} radius="md"
                >{icon}</ThemeIcon>
            </Group>
        </Paper>
    );
}

export function DashboardPage() {
    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [alertas, setAlertas]         = useState<AlertaStockResponse[]>([]);
    const [apiVentas, setApiVentas]     = useState<VentaListItem[]>([]);
    const [comprasPendientes, setComprasPendientes] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
    const [periodo, setPeriodo]         = useState<Periodo>('mes');

    const fetchDashboardData = useCallback(async (showSpinner = false, p: Periodo = periodo) => {
        if (showSpinner) setRefreshing(true);
        const range = getDateRange(p);
        try {
            await recoverLostSales().then(() => trySyncQueue()).catch(() => { });
            const [alertasRes, ventasRes, comprasRes] = await Promise.allSettled([
                getAlertasStock(),
                listarVentas({ ...range, estado: 'completada' }),
                listarCompras({ estado: 'pendiente', limit: 200 }),
            ]);
            if (alertasRes.status === 'fulfilled') setAlertas(alertasRes.value);
            if (ventasRes.status === 'fulfilled') setApiVentas(ventasRes.value.data);
            if (comprasRes.status === 'fulfilled') {
                const items = comprasRes.value.data ?? [];
                setComprasPendientes({ count: items.length, total: items.reduce((s, c) => s + Number(c.total), 0) });
            }
            setLastRefresh(new Date());
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [periodo]);

    const fetchRef = useRef(fetchDashboardData);
    fetchRef.current = fetchDashboardData;
    useEffect(() => {
        setLoading(true);
        fetchRef.current(false, periodo);
        const interval = setInterval(() => fetchRef.current(false, periodo), 60_000);
        return () => clearInterval(interval);
    }, [periodo]);

    const parseNum = (v: unknown): number => typeof v === 'number' ? v : parseFloat(String(v)) || 0;

    const ventasHoy = apiVentas
        .map((v) => ({
            id: v.id, fecha: v.created_at,
            total: parseNum(v.total),
            metodoPago: v.pagos[0]?.metodo ?? 'efectivo',
            items: v.items.map((i) => ({
                id: i.producto, nombre: i.producto, cantidad: i.cantidad,
                subtotal: parseNum(i.subtotal), precio: parseNum(i.precio_unitario),
                codigoBarras: '', descuento: 0,
            })),
            numeroTicket: v.numero_ticket,
            cajero: v.cajero_nombre || '',
        }))
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const totalHoy     = ventasHoy.reduce((s, v) => s + v.total, 0);
    const ticketProm   = ventasHoy.length ? totalHoy / ventasHoy.length : 0;
    const stockCritico = alertas;
    const sinStock     = alertas.filter((a) => a.stock_actual === 0);

    const metodoPagoTotals = ventasHoy.reduce<Record<string, { count: number; total: number }>>((acc, v) => {
        if (!acc[v.metodoPago]) acc[v.metodoPago] = { count: 0, total: 0 };
        acc[v.metodoPago].count++;
        acc[v.metodoPago].total += v.total;
        return acc;
    }, {});
    const totalGeneral = Object.values(metodoPagoTotals).reduce((s, m) => s + m.total, 0);

    const ventasPorHoraBase = Array.from({ length: 24 }, (_, hour) => ({
        hora: `${String(hour).padStart(2, '0')}:00`, total: 0, tickets: 0,
    }));
    for (const venta of ventasHoy) {
        const h = new Date(venta.fecha).getHours();
        ventasPorHoraBase[h]!.total += venta.total;
        ventasPorHoraBase[h]!.tickets += 1;
    }
    const horasConVentas = ventasPorHoraBase.map((h, i) => h.tickets > 0 ? i : null).filter((v): v is number => v !== null);
    const startHour = horasConVentas.length ? Math.max(0, Math.min(...horasConVentas) - 1) : 8;
    const endHour   = horasConVentas.length ? Math.min(23, Math.max(...horasConVentas) + 1) : 20;
    const ventasPorHora = ventasPorHoraBase.slice(startHour, endHour + 1);

    const buildDayChart = () => {
        const today = new Date();
        const days  = periodo === 'semana' ? 7 : today.getDate();
        return Array.from({ length: days }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() - (days - 1 - i));
            return {
                dia: periodo === 'semana'
                    ? d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit' })
                    : String(d.getDate()).padStart(2, '0'),
                total: 0, tickets: 0,
                _dateStr: d.toLocaleDateString('en-CA'),
            };
        });
    };
    const ventasPorDiaBase = buildDayChart();
    if (periodo !== 'dia') {
        for (const venta of ventasHoy) {
            const ds   = new Date(venta.fecha).toLocaleDateString('en-CA');
            const slot = ventasPorDiaBase.find((s) => s._dateStr === ds);
            if (slot) { slot.total += venta.total; slot.tickets += 1; }
        }
    }

    const chartData    = periodo === 'dia' ? ventasPorHora : ventasPorDiaBase;
    const chartDataKey = periodo === 'dia' ? 'hora' : 'dia';
    const chartTitle   = periodo === 'dia' ? 'Ventas por hora'
        : periodo === 'semana' ? 'Ventas por día (semana)' : 'Ventas por día (mes)';
    const chartSub     = periodo === 'dia' ? 'Total acumulado hoy'
        : periodo === 'semana' ? 'Últimos 7 días' : 'Días del mes actual';

    const donutData = Object.entries(metodoPagoTotals)
        .map(([metodo, data]) => ({ name: metodo, value: data.total, color: METODO_COLOR[metodo] ?? 'gray' }))
        .sort((a, b) => b.value - a.value);

    const productosMap = new Map<string, { nombre: string; cantidad: number; total: number }>();
    for (const venta of ventasHoy) {
        for (const item of venta.items) {
            const prev = productosMap.get(item.id) ?? { nombre: item.nombre, cantidad: 0, total: 0 };
            productosMap.set(item.id, { nombre: prev.nombre, cantidad: prev.cantidad + item.cantidad, total: prev.total + item.subtotal });
        }
    }
    const itemsVendidos = Array.from(productosMap.values()).reduce((s, p) => s + p.cantidad, 0);
    const topProductos = Array.from(productosMap.values())
        .sort((a, b) => b.total - a.total).slice(0, 8)
        .map((p) => ({
            producto: (p.nombre ?? 'Desconocido').length > 18
                ? `${(p.nombre ?? 'Desconocido').slice(0, 17)}…`
                : (p.nombre ?? 'Desconocido'),
            cantidad: p.cantidad, total: p.total,
        }));

    return (
        <Stack gap="xl">
            <Group justify="space-between" align="flex-end">
                <div>
                    <Title order={2} fw={800} c="blue.4">BlendPOS</Title>
                    <Text c="dimmed" size="sm" style={{ textTransform: 'capitalize' }}>
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                </div>
                <Group gap="md" align="center">
                    <SegmentedControl
                        value={periodo}
                        onChange={(v) => setPeriodo(v as Periodo)}
                        data={[
                            { value: 'dia', label: 'Hoy' },
                            { value: 'semana', label: 'Semana' },
                            { value: 'mes', label: 'Mes' },
                        ]}
                        size="sm"
                    />
                    <Group gap="xs" align="center">
                        {lastRefresh && (
                            <Text size="xs" c="dimmed">
                                Actualizado: {lastRefresh.toLocaleTimeString('es-AR')}
                            </Text>
                        )}
                        <Tooltip label="Actualizar datos">
                            <ActionIcon
                                variant="subtle" color="gray" size="lg"
                                onClick={() => fetchDashboardData(true)}
                                loading={refreshing}
                                aria-label="Actualizar dashboard"
                            >
                                <RefreshCw size={18} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </Group>

            {loading ? (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
                    {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={110} radius="md" />)}
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
                    <KpiCard label={`Ventas · ${PERIODO_LABEL[periodo]}`} value={formatARS(totalHoy)} sub={`${ventasHoy.length} transacciones`} icon={<TrendingUp size={22} />} color="blue" />
                    <KpiCard label="Ticket promedio" value={formatARS(ticketProm)} sub="por transacción" icon={<ShoppingCart size={22} />} color="teal" />
                    <KpiCard label="Stock crítico" value={String(stockCritico.length)} sub="productos bajo mínimo" icon={<AlertTriangle size={22} />} color="yellow" />
                    <KpiCard label="Sin stock" value={String(sinStock.length)} sub="productos agotados" icon={<Package size={22} />} color="red" />
                    <KpiCard label="Compras pendientes" value={String(comprasPendientes.count)} sub={comprasPendientes.count > 0 ? `Total: ${formatARS(comprasPendientes.total)}` : 'Sin facturas pendientes'} icon={<Receipt size={22} />} color={comprasPendientes.count > 0 ? 'orange' : 'gray'} />
                </SimpleGrid>
            )}

            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
                <Paper p="lg" radius="md" withBorder className={styles.card}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5} c="teal.4">{chartTitle}</Title>
                            <Text size="xs" c="dimmed">{chartSub}</Text>
                        </div>
                        <Badge variant="filled" color="teal" radius="sm">{formatARS(totalHoy)}</Badge>
                    </Group>
                    {loading ? (
                        <Skeleton h={240} radius="md" />
                    ) : ventasHoy.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ventas en {PERIODO_LABEL[periodo].toLowerCase()}</Text></Center>
                    ) : (
                        <AreaChart h={240} data={chartData} dataKey={chartDataKey}
                            series={[{ name: 'total', label: 'Total', color: 'teal.6' }]}
                            withDots={periodo !== 'dia'} strokeWidth={2} withLegend={false}
                            valueFormatter={(value) => formatARS(value)} tickLine="none" gridAxis="y" />
                    )}
                </Paper>

                <Paper p="lg" radius="md" withBorder className={styles.card}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5} c="blue.4">Métodos de pago</Title>
                            <Text size="xs" c="dimmed">Distribución · {PERIODO_LABEL[periodo].toLowerCase()}</Text>
                        </div>
                        <Badge variant="filled" color="blue" radius="sm">{ventasHoy.length} ventas</Badge>
                    </Group>
                    {loading ? (
                        <Skeleton h={240} radius="md" />
                    ) : ventasHoy.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ventas en {PERIODO_LABEL[periodo].toLowerCase()}</Text></Center>
                    ) : (
                        <Group align="flex-start" justify="space-between" wrap="nowrap" gap="lg">
                            <DonutChart data={donutData} size={190} thickness={22} withTooltip
                                chartLabel={formatARS(totalGeneral)} valueFormatter={(value) => formatARS(value)} />
                            <Stack gap="xs" style={{ flex: 1 }}>
                                {Object.entries(metodoPagoTotals).sort(([, a], [, b]) => b.total - a.total).map(([metodo, data]) => {
                                    const pct = totalGeneral > 0 ? Math.round((data.total / totalGeneral) * 100) : 0;
                                    return (
                                        <Group key={metodo} justify="space-between" wrap="nowrap">
                                            <Group gap="xs" wrap="nowrap">
                                                <ThemeIcon color={METODO_COLOR[metodo] ?? 'gray'} variant="light" size="sm" radius="sm">{metodoIcon(metodo)}</ThemeIcon>
                                                <Text size="sm" fw={600} tt="capitalize">{metodo}</Text>
                                            </Group>
                                            <Group gap="xs" wrap="nowrap">
                                                <Text size="sm" fw={800}>{formatARS(data.total)}</Text>
                                                <Badge color={METODO_COLOR[metodo] ?? 'gray'} size="xs" variant="light">{pct}%</Badge>
                                            </Group>
                                        </Group>
                                    );
                                })}
                            </Stack>
                        </Group>
                    )}
                </Paper>

                <Paper p="lg" radius="md" withBorder className={styles.card}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5} c="violet.4">Top productos</Title>
                            <Text size="xs" c="dimmed">Por facturación · {PERIODO_LABEL[periodo].toLowerCase()}</Text>
                        </div>
                        <Badge variant="filled" color="violet" radius="sm">{itemsVendidos} ud</Badge>
                    </Group>
                    {loading ? (
                        <Skeleton h={240} radius="md" />
                    ) : ventasHoy.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ventas en {PERIODO_LABEL[periodo].toLowerCase()}</Text></Center>
                    ) : topProductos.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ítems vendidos en {PERIODO_LABEL[periodo].toLowerCase()}</Text></Center>
                    ) : (
                        <BarChart h={240} data={topProductos} dataKey="producto"
                            series={[{ name: 'total', label: 'Total', color: 'violet.6' }]}
                            withLegend={false} tickLine="none" gridAxis="x"
                            valueFormatter={(value) => formatARS(value)}
                            xAxisProps={{ tick: { fontSize: 11 } }} />
                    )}
                </Paper>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 2 }}>
                <Paper p="lg" radius="md" withBorder className={styles.card}>
                    <Group justify="space-between" mb="lg">
                        <Title order={5} c={stockCritico.length > 0 ? 'red.4' : 'teal.4'}>Alertas de stock</Title>
                        {stockCritico.length > 0 && <Badge color="red" size="sm" variant="filled" radius="sm">{stockCritico.length} urgentes</Badge>}
                    </Group>
                    {loading ? (
                        <Stack gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} h={36} radius="sm" />)}</Stack>
                    ) : stockCritico.length === 0 ? (
                        <Group gap="sm" pt="xs">
                            <ThemeIcon color="teal" variant="light" size="lg" radius="xl"><CheckCircle size={18} /></ThemeIcon>
                            <Stack gap={0}>
                                <Text size="sm" fw={600}>Todo en orden</Text>
                                <Text size="xs" c="dimmed">Sin productos bajo el mínimo</Text>
                            </Stack>
                        </Group>
                    ) : (
                        <Stack gap="xs">
                            {stockCritico.slice(0, 7).map((a) => (
                                <Paper key={a.producto_id} p="xs" radius="sm" className={styles.alertRow}
                                    style={{ borderLeft: `2px solid var(--mantine-color-${a.stock_actual === 0 ? 'red' : 'yellow'}-6)` }}>
                                    <Group justify="space-between" wrap="nowrap">
                                        <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>{a.nombre}</Text>
                                        <Group gap="xs" wrap="nowrap">
                                            <Badge color={a.stock_actual === 0 ? 'red' : 'yellow'} size="sm" variant={a.stock_actual === 0 ? 'filled' : 'light'}>
                                                {a.stock_actual === 0 ? 'SIN STOCK' : `${a.stock_actual} ud`}
                                            </Badge>
                                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>mín: {a.stock_minimo}</Text>
                                        </Group>
                                    </Group>
                                </Paper>
                            ))}
                        </Stack>
                    )}
                </Paper>

                <Paper p="lg" radius="md" withBorder className={styles.card}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5} c="blue.4">Ventas · {PERIODO_LABEL[periodo]}</Title>
                            <Text size="xs" c="dimmed">Últimas transacciones completadas</Text>
                        </div>
                        <Badge variant="filled" color="blue" size="md" radius="sm">
                            {ventasHoy.length} {ventasHoy.length === 1 ? 'venta' : 'ventas'} · {formatARS(totalHoy)}
                        </Badge>
                    </Group>
                    {ventasHoy.length === 0 ? (
                        <Center py="xl">
                            <Stack align="center" gap="xs">
                                <ThemeIcon size={48} radius="xl" variant="light" color="gray"><ShoppingCart size={24} /></ThemeIcon>
                                <Text c="dimmed" size="sm">No hay ventas en {PERIODO_LABEL[periodo].toLowerCase()}</Text>
                            </Stack>
                        </Center>
                    ) : (
                        <Table verticalSpacing="sm" highlightOnHover withRowBorders={false}>
                            <Table.Thead>
                                <Table.Tr style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Ticket</Text></Table.Th>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">{periodo === 'dia' ? 'Hora' : 'Fecha'}</Text></Table.Th>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Cajero</Text></Table.Th>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Método</Text></Table.Th>
                                    <Table.Th ta="right"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Total</Text></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {ventasHoy.slice(0, 10).map((v) => (
                                    <Table.Tr key={v.id}>
                                        <Table.Td><Text size="sm" fw={700} ff="monospace" className={styles.ticketCell}>#{v.numeroTicket}</Text></Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {periodo === 'dia'
                                                    ? new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                                                    : new Date(v.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td><Text size="sm">{v.cajero}</Text></Table.Td>
                                        <Table.Td>
                                            <Badge color={METODO_COLOR[v.metodoPago] ?? 'gray'} size="sm" variant="light" leftSection={metodoIcon(v.metodoPago)}>
                                                {v.metodoPago}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td ta="right"><Text size="sm" fw={800} className={styles.totalCell}>{formatARS(v.total)}</Text></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
                </Paper>
            </SimpleGrid>

            <Divider />
        </Stack>
    );
}
