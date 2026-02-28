import { useState, useEffect } from 'react';
import {
    Stack, Title, Text, Group, Button, NumberInput, Textarea,
    Paper, Divider, Alert, SimpleGrid, Tabs, Table, Skeleton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Lock, CheckCircle, AlertTriangle, History, ClipboardList, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useCajaStore } from '../../store/useCajaStore';
import { formatARS } from '../../api/mockAdmin';
import type { IArqueoItem } from '../../types';
import type { ReporteCajaResponse, ArqueoResponse as ApiArqueoResponse } from '../../services/api/caja';
import { getHistorialCajas } from '../../services/api/caja';

// Denominaciones billetes/monedas ARS
const DENOMINACIONES = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];

interface FormValues {
    items: IArqueoItem[];
    observaciones: string;
}

export function CierreCajaPage() {
    const { user, hasRole } = useAuthStore();
    const { sesionId, cerrar, recargarReporte } = useCajaStore();
    const [submitted, setSubmitted] = useState(false);
    const [apiResult, setApiResult] = useState<ApiArqueoResponse | null>(null);
    const [reporte, setReporte] = useState<ReporteCajaResponse | null>(null);
    const [loadingReporte, setLoadingReporte] = useState(false);
    const [historial, setHistorial] = useState<ReporteCajaResponse[]>([]);
    const [loadingHistorial, setLoadingHistorial] = useState(false);
    const [activeTab, setActiveTab] = useState<string | null>('arqueo');
    const [desvioCritico, setDesvioCritico] = useState(false);

    const cargarReporte = async () => {
        if (!sesionId) return;
        setLoadingReporte(true);
        recargarReporte().then((r) => { setReporte(r); setLoadingReporte(false); }).catch(() => setLoadingReporte(false));
    };

    // Cargar reporte de la sesión activa
    useEffect(() => {
        cargarReporte();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sesionId]);

    // Cargar historial cuando el tab se activa
    useEffect(() => {
        if (activeTab !== 'historial') return;
        setLoadingHistorial(true);
        getHistorialCajas(1, 20)
            .then((resp) => setHistorial(resp.data))
            .catch(() => { })
            .finally(() => setLoadingHistorial(false));
    }, [activeTab]);

    const statsDia = {
        totalEfectivoEsperado: reporte?.monto_esperado?.efectivo ?? 0,
        totalTarjeta: (reporte?.monto_esperado?.debito ?? 0) + (reporte?.monto_esperado?.credito ?? 0),
        totalQR: reporte?.monto_esperado?.qr ?? 0,
        totalTransferencia: reporte?.monto_esperado?.transferencia ?? 0,
        cantidadVentas: reporte?.ventas_del_dia ?? 0,
    };

    const form = useForm<FormValues>({
        initialValues: {
            items: DENOMINACIONES.map((d) => ({ denominacion: d, cantidad: 0 })),
            observaciones: '',
        },
    });

    const efectivoContado = form.values.items.reduce(
        (sum, item) => sum + item.denominacion * item.cantidad,
        0
    );

    const handleSubmit = form.onSubmit(async (values) => {
        if (!sesionId) {
            notifications.show({ title: 'Sin sesión', message: 'No hay una sesión de caja abierta', color: 'red' });
            return;
        }
        const contado = values.items.reduce((s, i) => s + i.denominacion * i.cantidad, 0);
        // Los medios digitales (débito, crédito, transferencia) se confirman del sistema
        // ya que el operador no puede "contar" tarjetas como billetes.
        const debitoSistema = Number(reporte?.monto_esperado?.debito ?? 0);
        const creditoSistema = Number(reporte?.monto_esperado?.credito ?? 0);
        const transferenciaSistema = Number(reporte?.monto_esperado?.transferencia ?? 0);
        const qrSistema = Number(reporte?.monto_esperado?.qr ?? 0);
        try {
            const resp = await cerrar({
                sesion_caja_id: sesionId,
                declaracion: {
                    efectivo: contado,
                    debito: debitoSistema,
                    credito: creditoSistema,
                    transferencia: transferenciaSistema,
                    qr: qrSistema,
                },
                observaciones: values.observaciones || undefined,
            });
            setApiResult(resp);
            setSubmitted(true);
            notifications.show({
                title: 'Arqueo enviado',
                message: 'El cierre de caja fue registrado correctamente.',
                color: 'teal',
                icon: <CheckCircle size={16} />,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            const esCritico = msg.toLowerCase().includes('desvío crítico') || msg.toLowerCase().includes('desvio critico');
            if (esCritico) {
                setDesvioCritico(true);
            }
            notifications.show({
                title: esCritico ? 'Desvío crítico detectado' : 'Error al cerrar caja',
                message: esCritico
                    ? 'El efectivo contado difiere más del 5% del esperado. Completá el campo "Observaciones" para continuar.'
                    : msg,
                color: 'orange',
                autoClose: 7000,
            });
        }
    });

    const esSupervisor = hasRole(['admin', 'supervisor']);

    // Resultado para mostrar post-submit
    const resultado = apiResult ? {
        efectivoContado: apiResult.monto_declarado?.efectivo ?? 0,
        diferencia: apiResult.desvio?.monto ?? 0,
    } : null;

    return (
        <Stack gap="xl">
            <div>
                <Title order={2} fw={800}>Cierre de Caja</Title>
                <Text c="dimmed" size="sm">
                    {sesionId ? `Sesión activa: ${sesionId.slice(0, 8)}…` : 'Sin sesión activa'}
                </Text>
            </div>

            <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List mb="lg">
                    <Tabs.Tab value="arqueo" leftSection={<ClipboardList size={15} />}>Nuevo Arqueo</Tabs.Tab>
                    <Tabs.Tab value="historial" leftSection={<History size={15} />}>
                        Historial
                    </Tabs.Tab>
                </Tabs.List>

                {/* ── TAB: Nuevo Arqueo ── */}
                <Tabs.Panel value="arqueo">
                    {!submitted ? (
                        <form onSubmit={handleSubmit}>
                            <Stack gap="lg">
                                <Group justify="flex-end">
                                    <Button
                                        size="xs"
                                        variant="subtle"
                                        leftSection={<RefreshCw size={13} />}
                                        loading={loadingReporte}
                                        onClick={cargarReporte}
                                        disabled={!sesionId}
                                    >
                                        Actualizar totales
                                    </Button>
                                </Group>

                                <Alert color="blue" variant="light" icon={<Lock size={16} />}>
                                    <strong>Arqueo ciego:</strong> No verás el monto esperado hasta enviar el formulario.
                                    Contá el efectivo y completá las denominaciones.
                                </Alert>

                                {/* Resumen de pagos digitales del sistema */}
                                {reporte && (
                                    <Paper p="md" radius="md" withBorder style={{ background: 'var(--mantine-color-default-hover)' }}>
                                        <Text size="sm" fw={600} mb="xs" c="dimmed">Medios digitales (confirmados por el sistema)</Text>
                                        <SimpleGrid cols={4} spacing="sm">
                                            {[
                                                { label: 'Débito', value: Number(reporte.monto_esperado?.debito ?? 0) },
                                                { label: 'Crédito', value: Number(reporte.monto_esperado?.credito ?? 0) },
                                                { label: 'QR', value: Number(reporte.monto_esperado?.qr ?? 0) },
                                                { label: 'Transferencia', value: Number(reporte.monto_esperado?.transferencia ?? 0) },
                                            ].map(({ label, value }) => (
                                                <Paper key={label} p="sm" radius="sm" withBorder>
                                                    <Text size="xs" c="dimmed">{label}</Text>
                                                    <Text fw={700} c="blue.4">{formatARS(value)}</Text>
                                                </Paper>
                                            ))}
                                        </SimpleGrid>
                                    </Paper>
                                )}

                                <Paper p="lg" radius="md" withBorder>
                                    <Title order={5} mb="md">Conteo de denominaciones</Title>
                                    <Stack gap="sm">
                                        {form.values.items.map((item, i) => (
                                            <Group key={item.denominacion} justify="space-between" align="center">
                                                <Text size="sm" w={100} fw={500}>
                                                    {formatARS(item.denominacion)}
                                                </Text>
                                                <NumberInput
                                                    min={0}
                                                    w={110}
                                                    placeholder="0"
                                                    value={form.values.items[i].cantidad}
                                                    onChange={(v) => {
                                                        const newItems = [...form.values.items];
                                                        newItems[i] = { ...newItems[i], cantidad: Number(v) || 0 };
                                                        form.setFieldValue('items', newItems);
                                                    }}
                                                />
                                                <Text size="sm" c="dimmed" w={120} ta="right">
                                                    = {formatARS(item.denominacion * form.values.items[i].cantidad)}
                                                </Text>
                                            </Group>
                                        ))}
                                    </Stack>

                                    <Divider my="md" />

                                    <Group justify="space-between">
                                        <Text fw={700}>Total contado:</Text>
                                        <Text fw={800} size="xl" c="teal">{formatARS(efectivoContado)}</Text>
                                    </Group>
                                </Paper>

                                {desvioCritico && (
                                    <Alert color="orange" variant="filled" icon={<AlertTriangle size={16} />} title="Desvío crítico (>5%)">
                                        El monto contado difiere significativamente del esperado. Completá las observaciones
                                        explicando la diferencia para poder enviar el arqueo.
                                    </Alert>
                                )}
                                <Textarea
                                    label={desvioCritico ? 'Observaciones del supervisor (REQUERIDO)' : 'Observaciones (opcional)'}
                                    placeholder="Ej: faltante por cambio a cliente, etc."
                                    rows={3}
                                    styles={desvioCritico ? { input: { borderColor: 'var(--mantine-color-orange-5)', borderWidth: 2 } } : undefined}
                                    {...form.getInputProps('observaciones')}
                                />

                                <Button type="submit" size="md" leftSection={<Lock size={16} />}>
                                    Enviar arqueo
                                </Button>
                            </Stack>
                        </form>
                    ) : (
                        resultado && (
                            <Stack gap="lg">
                                <Alert
                                    color={resultado.diferencia === 0 ? 'teal' : resultado.diferencia > 0 ? 'blue' : 'red'}
                                    variant="light"
                                    icon={resultado.diferencia === 0 ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                                    title={
                                        resultado.diferencia === 0
                                            ? 'Arqueo exacto'
                                            : resultado.diferencia > 0
                                                ? 'Sobrante de caja'
                                                : 'Faltante de caja'
                                    }
                                >
                                    {esSupervisor
                                        ? resultado.diferencia === 0
                                            ? 'El efectivo contado coincide exactamente con lo esperado.'
                                            : `Diferencia: ${formatARS(Math.abs(resultado.diferencia))} ${resultado.diferencia > 0 ? 'sobrante' : 'faltante'}.`
                                        : 'El arqueo fue registrado. Un supervisor revisará las diferencias.'}
                                </Alert>

                                {esSupervisor && (
                                    <Paper p="lg" radius="md" withBorder>
                                        <Title order={5} mb="md">Reporte completo — {user?.rol}</Title>
                                        <SimpleGrid cols={2} spacing="sm">
                                            {[
                                                { label: 'Efectivo contado', value: formatARS(resultado.efectivoContado), color: 'teal' },
                                                { label: 'Efectivo esperado', value: formatARS(statsDia.totalEfectivoEsperado), color: 'blue' },
                                                { label: 'Diferencia', value: formatARS(resultado.diferencia), color: resultado.diferencia >= 0 ? 'teal' : 'red' },
                                                { label: 'Total tarjeta', value: formatARS(statsDia.totalTarjeta), color: 'gray' },
                                                { label: 'Total QR', value: formatARS(statsDia.totalQR), color: 'gray' }, { label: 'Total transferencia', value: formatARS(statsDia.totalTransferencia), color: 'gray' }, { label: 'Ventas del día', value: String(statsDia.cantidadVentas), color: 'gray' },
                                            ].map(({ label, value, color }) => (
                                                <Paper key={label} p="sm" radius="sm" withBorder style={{ background: 'var(--mantine-color-default-hover)' }}>
                                                    <Text size="xs" c="dimmed">{label}</Text>
                                                    <Text size="lg" fw={700} c={`${color}.4`}>{value}</Text>
                                                </Paper>
                                            ))}
                                        </SimpleGrid>
                                    </Paper>
                                )}

                                <Button variant="outline" onClick={() => { setSubmitted(false); setApiResult(null); form.reset(); }}>
                                    Nuevo arqueo
                                </Button>
                            </Stack>
                        )
                    )}
                </Tabs.Panel>

                {/* ── TAB: Historial ── */}
                <Tabs.Panel value="historial">
                    <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
                        <Table highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th>Cajero</Table.Th>
                                    <Table.Th ta="right">Contado</Table.Th>
                                    <Table.Th ta="right">Esperado</Table.Th>
                                    <Table.Th ta="right">Diferencia</Table.Th>
                                    <Table.Th ta="right">Tarjeta</Table.Th>
                                    <Table.Th ta="right">QR</Table.Th>
                                    <Table.Th ta="right">Total ventas</Table.Th>
                                    <Table.Th>Cerrado por</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {loadingHistorial ? (
                                    [1, 2, 3].map((i) => (
                                        <Table.Tr key={i}>
                                            {[...Array(9)].map((_, j) => (
                                                <Table.Td key={j}><Skeleton height={14} /></Table.Td>
                                            ))}
                                        </Table.Tr>
                                    ))
                                ) : historial.length === 0 ? (
                                    <Table.Tr>
                                        <Table.Td colSpan={9} ta="center">
                                            <Text c="dimmed" size="sm" py="xl">
                                                No hay cierres registrados.
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                ) : historial.map((h) => {
                                    const esperadoEfectivo = h.monto_esperado?.efectivo ?? 0;
                                    const declaradoEfectivo = h.monto_declarado?.efectivo ?? 0;
                                    const diferencia = declaradoEfectivo - esperadoEfectivo;
                                    const tarjeta = (h.monto_esperado?.debito ?? 0) + (h.monto_esperado?.credito ?? 0);
                                    const qr = h.monto_esperado?.qr ?? 0;
                                    const totalVentas = h.monto_esperado?.total ?? 0;
                                    return (
                                        <Table.Tr key={h.sesion_caja_id}>
                                            <Table.Td>{h.closed_at ? new Date(h.closed_at).toLocaleDateString('es-AR') : '-'}</Table.Td>
                                            <Table.Td>{h.usuario}</Table.Td>
                                            <Table.Td ta="right">{formatARS(declaradoEfectivo)}</Table.Td>
                                            <Table.Td ta="right">{formatARS(esperadoEfectivo)}</Table.Td>
                                            <Table.Td ta="right">
                                                <Text c={diferencia >= 0 ? 'teal' : 'red'} fw={600}>
                                                    {diferencia >= 0 ? '+' : ''}{formatARS(diferencia)}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td ta="right">{formatARS(tarjeta)}</Table.Td>
                                            <Table.Td ta="right">{formatARS(qr)}</Table.Td>
                                            <Table.Td ta="right">{formatARS(totalVentas)}</Table.Td>
                                            <Table.Td>{h.usuario}</Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}
