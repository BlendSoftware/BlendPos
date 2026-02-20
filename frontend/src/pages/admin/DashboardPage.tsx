import {
    SimpleGrid, Paper, Text, Title, Group, Stack, Badge,
    Skeleton, Table, ThemeIcon, Divider, Center,
} from '@mantine/core';
import { AreaChart, BarChart, DonutChart } from '@mantine/charts';
import {
    TrendingUp, ShoppingCart, Package, AlertTriangle,
    CheckCircle, CreditCard, Banknote, QrCode, Landmark,
} from 'lucide-react';
import { formatARS } from '../../api/mockAdmin';
import { useEffect, useState } from 'react';
import { useSaleStore } from '../../store/useSaleStore';
import { getAlertasStock } from '../../services/api/inventario';
import type { AlertaStockResponse } from '../../services/api/inventario';
import { listarVentas, type VentaListItem } from '../../services/api/ventas';

// ── Helpers ────────────────────────────────────────────────────────────────

const METODO_COLOR: Record<string, string> = {
    efectivo: 'teal',
    debito:   'blue',
    credito:  'violet',
    qr:       'orange',
};

function metodoIcon(m: string): React.ReactNode {
    if (m === 'efectivo') return <Banknote size={14} />;
    if (m === 'debito')   return <CreditCard size={14} />;
    if (m === 'credito')  return <Landmark size={14} />;
    if (m === 'qr')       return <QrCode size={14} />;
    return null;
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color }: {
    label: string; value: string; sub: string; icon: React.ReactNode; color: string;
}) {
    return (
        <Paper
            p="lg" radius="md" withBorder
            style={{
                background: 'var(--mantine-color-dark-8)',
                borderLeft: `3px solid var(--mantine-color-${color}-5)`,
            }}
        >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={2}>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: '0.08em' }}>
                        {label}
                    </Text>
                    <Title order={2} fw={900} lh={1.1}>{value}</Title>
                    <Text size="xs" c="dimmed" mt={2}>{sub}</Text>
                </Stack>
                <ThemeIcon color={color} variant="light" size={46} radius="md">
                    {icon}
                </ThemeIcon>
            </Group>
        </Paper>
    );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DashboardPage() {
    const [loading, setLoading] = useState(true);
    const [alertas, setAlertas] = useState<AlertaStockResponse[]>([]);
    const [apiVentas, setApiVentas] = useState<VentaListItem[]>([]);

    const historial = useSaleStore((s) => s.historial);

    useEffect(() => {
        const today = new Date().toLocaleDateString('en-CA');
        setLoading(true);
        Promise.allSettled([
            getAlertasStock(),
            listarVentas({ fecha: today, estado: 'completada', limit: 200 }),
        ]).then(([alertasRes, ventasRes]) => {
            if (alertasRes.status === 'fulfilled') setAlertas(alertasRes.value);
            if (ventasRes.status === 'fulfilled') setApiVentas(ventasRes.value.data);
        }).finally(() => setLoading(false));
    }, []);

    const hoyKey = new Date().toLocaleDateString('en-CA');
    // Merge local + API ventas for today, deduplicate by id
    const localIds = new Set(historial.map((v) => v.id));
    const apiFiltradas = apiVentas.filter((v) => !localIds.has(v.id));
    const ventasHoy = [
        ...historial.filter((v) => new Date(v.fecha).toLocaleDateString('en-CA') === hoyKey),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...apiFiltradas.map((v) => ({ id: v.id, fecha: v.created_at, total: v.total, totalConDescuento: v.total, metodoPago: v.pagos[0]?.metodo ?? 'efectivo', items: v.items.map((i) => ({ cantidad: i.cantidad })) } as any)),
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const totalHoy      = ventasHoy.reduce((s, v) => s + (v.totalConDescuento ?? v.total), 0);
    const ticketProm    = ventasHoy.length ? totalHoy / ventasHoy.length : 0;
    const itemsVendidos = ventasHoy.reduce((s, v) => s + v.items.reduce((si: number, i: { cantidad: number }) => si + i.cantidad, 0), 0);

    const stockCritico = alertas;
    const sinStock     = alertas.filter((a) => a.stock_actual === 0);

    const metodoPagoTotals = ventasHoy.reduce<Record<string, { count: number; total: number }>>((acc, v) => {
        if (!acc[v.metodoPago]) acc[v.metodoPago] = { count: 0, total: 0 };
        acc[v.metodoPago].count++;
        acc[v.metodoPago].total += (v.totalConDescuento ?? v.total);
        return acc;
    }, {});
    const totalGeneral = Object.values(metodoPagoTotals).reduce((s, m) => s + m.total, 0);

    const ventasPorHoraBase = Array.from({ length: 24 }, (_, hour) => ({
        hora: `${String(hour).padStart(2, '0')}:00`,
        total: 0,
        tickets: 0,
    }));

    for (const venta of ventasHoy) {
        const hour = new Date(venta.fecha).getHours();
        ventasPorHoraBase[hour]!.total += (venta.totalConDescuento ?? venta.total);
        ventasPorHoraBase[hour]!.tickets += 1;
    }

    const horasConVentas = ventasPorHoraBase
        .map((h, idx) => (h.tickets > 0 ? idx : null))
        .filter((v): v is number => v !== null);

    const startHour = horasConVentas.length ? Math.max(0, Math.min(...horasConVentas) - 1) : 8;
    const endHour = horasConVentas.length ? Math.min(23, Math.max(...horasConVentas) + 1) : 20;
    const ventasPorHora = ventasPorHoraBase.slice(startHour, endHour + 1);

    const donutData = Object.entries(metodoPagoTotals)
        .map(([metodo, data]) => ({
            name: metodo,
            value: data.total,
            color: METODO_COLOR[metodo] ?? 'gray',
        }))
        .sort((a, b) => b.value - a.value);

    const productosMap = new Map<string, { nombre: string; cantidad: number; total: number }>();
    for (const venta of ventasHoy) {
        for (const item of venta.items) {
            const prev = productosMap.get(item.id) ?? { nombre: item.nombre, cantidad: 0, total: 0 };
            productosMap.set(item.id, {
                nombre: prev.nombre,
                cantidad: prev.cantidad + item.cantidad,
                total: prev.total + item.subtotal,
            });
        }
    }

    const topProductos = Array.from(productosMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
        .map((p) => ({
            producto: p.nombre.length > 18 ? `${p.nombre.slice(0, 17)}…` : p.nombre,
            cantidad: p.cantidad,
            total: p.total,
        }));

    return (
        <Stack gap="xl">
            {/* Header */}
            <div>
                <Title order={2} fw={800}>Dashboard</Title>
                <Text c="dimmed" size="sm">
                    {new Date().toLocaleDateString('es-AR', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                </Text>
            </div>

            {/* KPI row */}
            {loading ? (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} h={110} radius="md" />)}
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                    <KpiCard label="Ventas hoy"     value={formatARS(totalHoy)}       sub={`${ventasHoy.length} transacciones`}  icon={<TrendingUp size={22} />}  color="blue"   />
                    <KpiCard label="Ticket promedio" value={formatARS(ticketProm)}     sub="por transacción"                       icon={<ShoppingCart size={22} />} color="teal"   />
                    <KpiCard label="Stock crítico"   value={String(stockCritico.length)} sub="productos bajo mínimo"               icon={<AlertTriangle size={22} />} color="yellow" />
                    <KpiCard label="Sin stock"       value={String(sinStock.length)}   sub="productos agotados"                    icon={<Package size={22} />}      color="red"    />
                </SimpleGrid>
            )}

            {/* Gráficos */}
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
                <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5}>Ventas por hora</Title>
                            <Text size="xs" c="dimmed">Total acumulado hoy</Text>
                        </div>
                        <Badge variant="light" color="teal">{formatARS(totalHoy)}</Badge>
                    </Group>

                    {loading ? (
                        <Skeleton h={240} radius="md" />
                    ) : ventasHoy.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ventas registradas hoy</Text></Center>
                    ) : (
                        <AreaChart
                            h={240}
                            data={ventasPorHora}
                            dataKey="hora"
                            series={[{ name: 'total', label: 'Total', color: 'teal.6' }]}
                            withDots={false}
                            strokeWidth={2}
                            withLegend={false}
                            valueFormatter={(value) => formatARS(value)}
                            tickLine="none"
                            gridAxis="y"
                        />
                    )}
                </Paper>

                <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5}>Métodos de pago</Title>
                            <Text size="xs" c="dimmed">Distribución de hoy</Text>
                        </div>
                        <Badge variant="light" color="blue">{ventasHoy.length} ventas</Badge>
                    </Group>

                    {loading ? (
                        <Skeleton h={240} radius="md" />
                    ) : ventasHoy.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ventas registradas hoy</Text></Center>
                    ) : (
                        <Group align="flex-start" justify="space-between" wrap="nowrap" gap="lg">
                            <DonutChart
                                data={donutData}
                                size={190}
                                thickness={22}
                                withTooltip
                                chartLabel={formatARS(totalGeneral)}
                                valueFormatter={(value) => formatARS(value)}
                            />
                            <Stack gap="xs" style={{ flex: 1 }}>
                                {Object.entries(metodoPagoTotals)
                                    .sort(([, a], [, b]) => b.total - a.total)
                                    .map(([metodo, data]) => {
                                        const pct = totalGeneral > 0 ? Math.round((data.total / totalGeneral) * 100) : 0;
                                        return (
                                            <Group key={metodo} justify="space-between" wrap="nowrap">
                                                <Group gap="xs" wrap="nowrap">
                                                    <ThemeIcon color={METODO_COLOR[metodo] ?? 'gray'} variant="light" size="sm" radius="sm">
                                                        {metodoIcon(metodo)}
                                                    </ThemeIcon>
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

                <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5}>Top productos</Title>
                            <Text size="xs" c="dimmed">Por facturación hoy</Text>
                        </div>
                        <Badge variant="light" color="violet">{itemsVendidos} ud</Badge>
                    </Group>

                    {loading ? (
                        <Skeleton h={240} radius="md" />
                    ) : ventasHoy.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ventas registradas hoy</Text></Center>
                    ) : topProductos.length === 0 ? (
                        <Center py="xl"><Text size="sm" c="dimmed">Sin ítems vendidos hoy</Text></Center>
                    ) : (
                        <BarChart
                            h={240}
                            data={topProductos}
                            dataKey="producto"
                            series={[{ name: 'total', label: 'Total', color: 'violet.6' }]}
                            withLegend={false}
                            tickLine="none"
                            gridAxis="x"
                            valueFormatter={(value) => formatARS(value)}
                            xAxisProps={{ tick: { fontSize: 11 } }}
                        />
                    )}
                </Paper>
            </SimpleGrid>

            {/* Paneles */}
            <SimpleGrid cols={{ base: 1, md: 2 }}>
                {/* Stock crítico */}
                <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                    <Group justify="space-between" mb="lg">
                        <Title order={5}>Alertas de stock</Title>
                        {stockCritico.length > 0 && (
                            <Badge color="red" size="sm" variant="filled">{stockCritico.length} urgentes</Badge>
                        )}
                    </Group>
                    {loading ? (
                        <Stack gap="xs">{[1, 2, 3].map((i) => <Skeleton key={i} h={36} radius="sm" />)}</Stack>
                    ) : stockCritico.length === 0 ? (
                        <Group gap="sm" pt="xs">
                            <ThemeIcon color="teal" variant="light" size="lg" radius="xl">
                                <CheckCircle size={18} />
                            </ThemeIcon>
                            <Stack gap={0}>
                                <Text size="sm" fw={600}>Todo en orden</Text>
                                <Text size="xs" c="dimmed">Sin productos bajo el mínimo</Text>
                            </Stack>
                        </Group>
                    ) : (
                        <Stack gap="xs">
                            {stockCritico.slice(0, 7).map((a) => (
                                <Paper
                                    key={a.producto_id} p="xs" radius="sm"
                                    style={{
                                        background: 'var(--mantine-color-dark-7)',
                                        borderLeft: `2px solid var(--mantine-color-${a.stock_actual === 0 ? 'red' : 'yellow'}-6)`,
                                    }}
                                >
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

                {/* Ventas del día */}
                <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                    <Group justify="space-between" mb="md">
                        <div>
                            <Title order={5}>Ventas del día</Title>
                            <Text size="xs" c="dimmed">Últimas transacciones completadas</Text>
                        </div>
                        <Badge variant="light" color="blue" size="md">
                            {ventasHoy.length} {ventasHoy.length === 1 ? 'venta' : 'ventas'} · {formatARS(totalHoy)}
                        </Badge>
                    </Group>

                    {ventasHoy.length === 0 ? (
                        <Center py="xl">
                            <Stack align="center" gap="xs">
                                <ThemeIcon size={48} radius="xl" variant="light" color="gray">
                                    <ShoppingCart size={24} />
                                </ThemeIcon>
                                <Text c="dimmed" size="sm">No hay ventas registradas hoy todavía</Text>
                            </Stack>
                        </Center>
                    ) : (
                        <Table verticalSpacing="sm" highlightOnHover withRowBorders={false}>
                            <Table.Thead>
                                <Table.Tr style={{ borderBottom: '1px solid var(--mantine-color-dark-5)' }}>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Ticket</Text></Table.Th>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Hora</Text></Table.Th>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Cajero</Text></Table.Th>
                                    <Table.Th><Text size="xs" c="dimmed" fw={700} tt="uppercase">Método</Text></Table.Th>
                                    <Table.Th ta="right"><Text size="xs" c="dimmed" fw={700} tt="uppercase">Total</Text></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {ventasHoy.slice(0, 10).map((v) => (
                                    <Table.Tr key={v.id}>
                                        <Table.Td>
                                            <Text size="sm" fw={700} ff="monospace" c="blue.4">#{v.numeroTicket}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">
                                                {new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td><Text size="sm">{v.cajero}</Text></Table.Td>
                                        <Table.Td>
                                            <Badge
                                                color={METODO_COLOR[v.metodoPago] ?? 'gray'}
                                                size="sm"
                                                variant="light"
                                                leftSection={metodoIcon(v.metodoPago)}
                                            >
                                                {v.metodoPago}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td ta="right">
                                            <Text size="sm" fw={800} c="teal.4">{formatARS(v.totalConDescuento ?? v.total)}</Text>
                                        </Table.Td>
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

