import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Stack, Title, Text, Group, Button, Badge, Table,
    Modal, Alert, Tabs, Paper, SimpleGrid, Skeleton,
    Select, NumberInput, Textarea, Switch,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Scissors, AlertTriangle, ArrowUp, PackagePlus, Plus, Link2 } from 'lucide-react';
import { listarProductos, ajustarStock } from '../../services/api/products';
import { getAlertasStock, ejecutarDesarme as apiEjecutarDesarme, listarVinculos, crearVinculo, type AlertaStockResponse, type VinculoResponse } from '../../services/api/inventario';
import type { IProducto, IMovimientoStock } from '../../types';

// -- Types --

type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';

interface AjusteFormValues {
    productoId: string;
    tipo: TipoMovimiento;
    cantidad: number;
    motivo: string;
}

// -- Helpers --

const TIPO_COLOR: Record<string, string> = {
    entrada: 'teal', salida: 'red', ajuste: 'yellow', desarme: 'violet',
};

const TIPO_LABEL: Record<TipoMovimiento, string> = {
    entrada: 'Entrada de stock', salida: 'Salida de stock', ajuste: 'Ajuste de inventario',
};

export function InventarioPage() {
    const [productos, setProductos] = useState<IProducto[]>([]);
    const [movimientos] = useState<IMovimientoStock[]>([]);
    const [alertas, setAlertas] = useState<AlertaStockResponse[]>([]);
    const [vinculos, setVinculos] = useState<VinculoResponse[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [productosResp, alertasResp, vinculosResp] = await Promise.allSettled([
                listarProductos({ limit: 500 }),
                getAlertasStock(),
                listarVinculos(),
            ]);
            if (productosResp.status === 'fulfilled') {
                setProductos(productosResp.value.data.map((p) => ({
                    id: p.id, codigoBarras: p.codigo_barras, nombre: p.nombre,
                    descripcion: p.descripcion ?? '', categoria: p.categoria as IProducto['categoria'],
                    precioCosto: p.precio_costo, precioVenta: p.precio_venta,
                    stock: p.stock_actual, stockMinimo: p.stock_minimo,
                    activo: p.activo, creadoEn: '', actualizadoEn: '',
                    cantidadHija: undefined,
                })));
            }
            if (alertasResp.status === 'fulfilled') setAlertas(alertasResp.value);
            if (vinculosResp.status === 'fulfilled') setVinculos(vinculosResp.value);
        } catch { /* handled via allSettled */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Modal desarme
    const [desarmeVinculo, setDesarmeVinculo] = useState<VinculoResponse | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // Modal crear vínculo
    const [vinculoModalOpen, setVinculoModalOpen] = useState(false);
    const [savingVinculo, setSavingVinculo] = useState(false);

    const vinculoForm = useForm({
        initialValues: {
            producto_padre_id: '',
            producto_hijo_id: '',
            unidades_por_padre: 12,
            desarme_auto: true,
        },
        validate: {
            producto_padre_id: (v) => (v ? null : 'Requerido'),
            producto_hijo_id: (v, vals) =>
                !v ? 'Requerido' : v === vals.producto_padre_id ? 'Padre e hijo no pueden ser el mismo' : null,
            unidades_por_padre: (v) => (v >= 1 ? null : 'Mínimo 1'),
        },
    });

    // Form ajuste manual
    const ajusteForm = useForm<AjusteFormValues>({
        initialValues: { productoId: '', tipo: 'entrada', cantidad: 1, motivo: '' },
        validate: {
            productoId: (v) => (v ? null : 'Seleccioná un producto'),
            cantidad:   (v) => (v >= 1 ? null : 'Mínimo 1'),
            motivo:     (v) => (v.trim().length >= 3 ? null : 'Mínimo 3 caracteres'),
        },
    });

    // -- Computed --

    // stockCritico computed from alertas API (fallback to local if backend unavailable)
    const stockCritico = alertas.length > 0
        ? alertas.map((a) => ({
            id: a.producto_id,
            nombre: a.nombre,
            codigoBarras: a.codigo_barras ?? '',
            stock: a.stock_actual,
            stockMinimo: a.stock_minimo,
            deficit: a.deficit ?? Math.max(0, a.stock_minimo - a.stock_actual),
          }))
        : productos.filter((p) => p.activo && p.stock <= p.stockMinimo).map((p) => ({ id: p.id, nombre: p.nombre, codigoBarras: p.codigoBarras, stock: p.stock, stockMinimo: p.stockMinimo, deficit: p.stockMinimo - p.stock }));

    const productosSelect = useMemo(
        () => productos.filter((p) => p.activo).map((p) => ({
            value: p.id,
            label: `${p.nombre} (stock: ${p.stock})`,
        })),
        [productos]
    );

    // -- Handlers --

    const openDesarme = (v: VinculoResponse) => {
        setDesarmeVinculo(v);
        setConfirmOpen(true);
    };

    const ejecutarDesarmeLocal = async () => {
        if (!desarmeVinculo) return;
        try {
            const resp = await apiEjecutarDesarme({ vinculo_id: desarmeVinculo.id, cantidad_padres: 1 });
            notifications.show({
                title: 'Desarme realizado',
                message: `${resp.unidades_generadas} unidades acreditadas`,
                color: 'teal',
            });
            setConfirmOpen(false);
            await fetchData();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    const handleCrearVinculo = vinculoForm.onSubmit(async (values) => {
        setSavingVinculo(true);
        try {
            await crearVinculo({
                producto_padre_id: values.producto_padre_id,
                producto_hijo_id: values.producto_hijo_id,
                unidades_por_padre: values.unidades_por_padre,
                desarme_auto: values.desarme_auto,
            });
            notifications.show({ title: 'Vínculo creado', message: 'La relación padre/hijo fue registrada.', color: 'teal' });
            setVinculoModalOpen(false);
            vinculoForm.reset();
            await fetchData();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        } finally {
            setSavingVinculo(false);
        }
    });

    const handleAjuste = ajusteForm.onSubmit(async (values) => {
        const producto = productos.find((p) => p.id === values.productoId);
        if (!producto) return;

        const delta = values.tipo === 'salida' ? -values.cantidad : values.cantidad;
        const stockAnterior = producto.stock;
        const stockNuevo = stockAnterior + delta;

        try {
            const updated = await ajustarStock(values.productoId, delta, values.motivo);
            // Sync local state with server response
            setProductos((prev) =>
                prev.map((p) =>
                    p.id === values.productoId
                        ? { ...p, stock: updated.stock_actual, actualizadoEn: new Date().toISOString() }
                        : p
                )
            );
            notifications.show({
                title: TIPO_LABEL[values.tipo],
                message: `${producto.nombre}: ${stockAnterior} → ${updated.stock_actual}`,
                color: TIPO_COLOR[values.tipo],
            });
            ajusteForm.reset();
            // Refresh alerts in background
            getAlertasStock().then(setAlertas).catch(() => {});
        } catch (err) {
            // Fallback: optimistic update for offline/demo mode
            const fallbackStock = Math.max(0, stockNuevo);
            setProductos((prev) =>
                prev.map((p) =>
                    p.id === values.productoId
                        ? { ...p, stock: fallbackStock, actualizadoEn: new Date().toISOString() }
                        : p
                )
            );
            notifications.show({
                title: TIPO_LABEL[values.tipo],
                message: err instanceof Error && err.message.includes('stock') ? err.message : `${producto.nombre}: ${stockAnterior} → ${fallbackStock} (sin conexión)`,
                color: err instanceof Error && err.message.includes('stock') ? 'red' : TIPO_COLOR[values.tipo],
            });
            if (err instanceof Error && err.message.includes('stock')) {
                // Don't reset form on validation errors so user can correct
            } else {
                ajusteForm.reset();
            }
        }
    });

    // -- Render --

    return (
        <Stack gap="xl">
            <div>
                <Title order={2} fw={800}>Inventario</Title>
                <Text c="dimmed" size="sm">Control de stock, movimientos y ajustes manuales</Text>
            </div>

            <Tabs defaultValue="alertas">
                <Tabs.List>
                    <Tabs.Tab value="alertas" leftSection={<AlertTriangle size={14} />}>
                        Alertas ({stockCritico.length})
                    </Tabs.Tab>
                    <Tabs.Tab value="relaciones" leftSection={<Scissors size={14} />}>
                        Cajas / Packs
                    </Tabs.Tab>
                    <Tabs.Tab value="ajuste" leftSection={<PackagePlus size={14} />}>
                        Ajuste Manual
                    </Tabs.Tab>
                    <Tabs.Tab value="movimientos" leftSection={<ArrowUp size={14} />}>
                        Movimientos ({movimientos.length})
                    </Tabs.Tab>
                </Tabs.List>

                {/* -- Tab: Alertas -- */}
                <Tabs.Panel value="alertas" pt="lg">
                    {loading ? (
                        <Stack gap="sm">
                            {[1, 2, 3].map((i) => <Skeleton key={i} h={44} radius="sm" />)}
                        </Stack>
                    ) : stockCritico.length === 0 ? (
                        <Alert color="teal" variant="light" title="Sin alertas">
                            Todos los productos están sobre su stock mínimo.
                        </Alert>
                    ) : (
                        <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                            <Table highlightOnHover verticalSpacing="sm">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Producto</Table.Th>
                                        <Table.Th>Stock Actual</Table.Th>
                                        <Table.Th>Stock Mínimo</Table.Th>
                                        <Table.Th>Faltante</Table.Th>
                                        <Table.Th>Estado</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {stockCritico.map((p) => (
                                        <Table.Tr key={p.id}>
                                            <Table.Td>
                                                <Text size="sm" fw={500}>{p.nombre}</Text>
                                                <Text size="xs" c="dimmed" ff="monospace">{p.codigoBarras}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text fw={700} c={p.stock === 0 ? 'red' : 'yellow'}>{p.stock}</Text>
                                            </Table.Td>
                                            <Table.Td>{p.stockMinimo}</Table.Td>
                                            <Table.Td>
                                                <Text size="sm" c="red" fw={600}>{p.deficit}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge color={p.stock === 0 ? 'red' : 'yellow'} size="sm">
                                                    {p.stock === 0 ? 'Sin stock' : 'Crítico'}
                                                </Badge>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Paper>
                    )}
                </Tabs.Panel>

                {/* -- Tab: Relaciones Padre/Hijo -- */}
                <Tabs.Panel value="relaciones" pt="lg">
                    <Stack gap="md">
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Relaciones padre/hijo (cajas/packs). Por cada venta de una unidad se descuenta 1 unidad del hijo o se desarma 1 padre automáticamente.
                            </Text>
                            <Button size="xs" leftSection={<Plus size={14} />} onClick={() => setVinculoModalOpen(true)}>
                                Crear vínculo
                            </Button>
                        </Group>
                        {loading ? (
                            <Stack gap="sm">{[1, 2, 3].map((i) => <Skeleton key={i} h={44} radius="sm" />)}</Stack>
                        ) : vinculos.length === 0 ? (
                            <Alert color="blue" variant="light" title="Sin vínculos">
                                No hay relaciones padre/hijo configuradas.
                                Usá el botón &quot;Crear vínculo&quot; para definir relaciones caja/unidad.
                            </Alert>
                        ) : (
                            <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                                <Table highlightOnHover verticalSpacing="sm">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Padre (bulto/caja)</Table.Th>
                                            <Table.Th>Hijo (unidad)</Table.Th>
                                            <Table.Th>Unidades/padre</Table.Th>
                                            <Table.Th>Desarme autom.</Table.Th>
                                            <Table.Th>Acción</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {vinculos.map((v) => {
                                            const padre = productos.find((p) => p.id === v.producto_padre_id);
                                            return (
                                                <Table.Tr key={v.id}>
                                                    <Table.Td>
                                                        <Text size="sm" fw={500}>{v.nombre_padre}</Text>
                                                        {padre && (
                                                            <Text size="xs" c="dimmed">Stock: {padre.stock}</Text>
                                                        )}
                                                    </Table.Td>
                                                    <Table.Td><Text size="sm">{v.nombre_hijo}</Text></Table.Td>
                                                    <Table.Td>
                                                        <Badge color="gray" variant="outline" size="sm">× {v.unidades_por_padre}</Badge>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Badge color={v.desarme_auto ? 'teal' : 'gray'} size="sm" variant="light">
                                                            {v.desarme_auto ? 'Sí' : 'No'}
                                                        </Badge>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Button
                                                            size="xs" variant="light" color="violet"
                                                            leftSection={<Scissors size={12} />}
                                                            onClick={() => openDesarme(v)}
                                                            disabled={padre?.stock === 0}
                                                        >
                                                            Desarmar 1
                                                        </Button>
                                                    </Table.Td>
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
                            </Paper>
                        )}
                    </Stack>
                </Tabs.Panel>

                {/* Tab: Ajuste Manual */}
                <Tabs.Panel value="ajuste" pt="lg">
                    <SimpleGrid cols={{ base: 1, md: 2 }}>
                        <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                            <Title order={5} mb="md">Registrar movimiento</Title>
                            <form onSubmit={handleAjuste}>
                                <Stack gap="md">
                                    <Select
                                        label="Producto"
                                        placeholder="Seleccioná un producto..."
                                        data={productosSelect}
                                        searchable
                                        {...ajusteForm.getInputProps('productoId')}
                                    />
                                    <Select
                                        label="Tipo de movimiento"
                                        data={[
                                            { value: 'entrada', label: 'Entrada de stock' },
                                            { value: 'salida',  label: 'Salida de stock' },
                                            { value: 'ajuste',  label: 'Ajuste de inventario' },
                                        ]}
                                        {...ajusteForm.getInputProps('tipo')}
                                    />
                                    <NumberInput
                                        label="Cantidad"
                                        min={1}
                                        {...ajusteForm.getInputProps('cantidad')}
                                    />
                                    <Textarea
                                        label="Motivo"
                                        placeholder="Ej: recepción de mercadería de proveedor"
                                        rows={3}
                                        {...ajusteForm.getInputProps('motivo')}
                                    />
                                    <Button type="submit" leftSection={<PackagePlus size={16} />}>
                                        Registrar movimiento
                                    </Button>
                                </Stack>
                            </form>
                        </Paper>

                        <Paper p="lg" radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)' }}>
                            <Title order={5} mb="md">Vista previa</Title>
                            {ajusteForm.values.productoId ? (() => {
                                const p = productos.find((x) => x.id === ajusteForm.values.productoId);
                                if (!p) return null;
                                const stockNuevo = ajusteForm.values.tipo === 'salida'
                                    ? Math.max(0, p.stock - ajusteForm.values.cantidad)
                                    : p.stock + ajusteForm.values.cantidad;
                                return (
                                    <Stack gap="sm">
                                        <Group justify="space-between">
                                            <Text size="sm" c="dimmed">Producto</Text>
                                            <Text size="sm" fw={600}>{p.nombre}</Text>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text size="sm" c="dimmed">Stock actual</Text>
                                            <Text size="sm" fw={600}>{p.stock}</Text>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text size="sm" c="dimmed">Operación</Text>
                                            <Badge color={TIPO_COLOR[ajusteForm.values.tipo]} variant="light">
                                                {ajusteForm.values.tipo === 'salida' ? '-' : '+'}{ajusteForm.values.cantidad}
                                            </Badge>
                                        </Group>
                                        <Group justify="space-between">
                                            <Text size="sm" c="dimmed">Stock resultante</Text>
                                            <Text size="sm" fw={800} c={stockNuevo < p.stockMinimo ? 'red' : 'teal'}>
                                                {stockNuevo}
                                            </Text>
                                        </Group>
                                        {stockNuevo < p.stockMinimo && (
                                            <Alert color="yellow" variant="light" icon={<AlertTriangle size={14} />}>
                                                Stock resultante bajo el mínimo ({p.stockMinimo})
                                            </Alert>
                                        )}
                                    </Stack>
                                );
                            })() : (
                                <Text size="sm" c="dimmed">Seleccioná un producto para ver la previsualización.</Text>
                            )}
                        </Paper>
                    </SimpleGrid>
                </Tabs.Panel>

                {/* Tab: Movimientos */}
                <Tabs.Panel value="movimientos" pt="lg">
                    <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                        <Table highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th>Producto</Table.Th>
                                    <Table.Th>Tipo</Table.Th>
                                    <Table.Th>Cant.</Table.Th>
                                    <Table.Th>Stock ant.</Table.Th>
                                    <Table.Th>Stock nuevo</Table.Th>
                                    <Table.Th>Motivo</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {movimientos.map((m) => (
                                    <Table.Tr key={m.id}>
                                        <Table.Td>
                                            <Text size="xs">
                                                {new Date(m.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td><Text size="sm">{m.productoNombre}</Text></Table.Td>
                                        <Table.Td>
                                            <Badge color={TIPO_COLOR[m.tipo]} size="sm" variant="light">{m.tipo}</Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" fw={600}
                                                c={m.tipo === 'entrada' || m.tipo === 'desarme' ? 'teal' : m.tipo === 'salida' ? 'red' : 'yellow'}>
                                                {m.tipo === 'salida' ? '-' : '+'}{m.cantidad}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td><Text size="sm" c="dimmed">{m.stockAnterior}</Text></Table.Td>
                                        <Table.Td><Text size="sm" fw={600}>{m.stockNuevo}</Text></Table.Td>
                                        <Table.Td><Text size="xs" c="dimmed">{m.motivo}</Text></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </Tabs.Panel>
            </Tabs>

            {/* Modal Confirmar Desarme */}
            <Modal
                opened={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                title={<Text fw={700} c="violet">Confirmar Desarme</Text>}
                size="sm"
                centered
            >
                {desarmeVinculo && (
                    <Stack gap="md">
                        <Alert color="violet" variant="light">
                            Se desarmará <strong>1 unidad</strong> de{' '}
                            <strong>&quot;{desarmeVinculo.nombre_padre}&quot;</strong> y se
                            sumarán <strong>{desarmeVinculo.unidades_por_padre} unidades</strong> al stock de{' '}
                            <strong>&quot;{desarmeVinculo.nombre_hijo}&quot;</strong>.
                        </Alert>
                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
                            <Button color="violet" onClick={ejecutarDesarmeLocal}>Confirmar desarme</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            {/* Modal Crear Vínculo */}
            <Modal
                opened={vinculoModalOpen}
                onClose={() => setVinculoModalOpen(false)}
                title={<Group gap="xs"><Link2 size={16} /><Text fw={700}>Crear vínculo padre/hijo</Text></Group>}
                size="md"
                centered
            >
                <form onSubmit={handleCrearVinculo}>
                    <Stack gap="md">
                        <Select
                            label="Producto padre (bulto/caja)"
                            description="El producto que se va a desarmar"
                            placeholder="Seleccioná el padre..."
                            data={productosSelect}
                            searchable
                            {...vinculoForm.getInputProps('producto_padre_id')}
                        />
                        <Select
                            label="Producto hijo (unidad)"
                            description="El producto que se genera al desarmar"
                            placeholder="Seleccioná el hijo..."
                            data={productosSelect}
                            searchable
                            {...vinculoForm.getInputProps('producto_hijo_id')}
                        />
                        <NumberInput
                            label="Unidades por padre"
                            description="Cuántas unidades hijo se obtienen al desarmar 1 padre"
                            min={1}
                            {...vinculoForm.getInputProps('unidades_por_padre')}
                        />
                        <Switch
                            label="Desarme automático en venta"
                            description="Si el hijo no tiene stock, se desarma automáticamente 1 padre"
                            {...vinculoForm.getInputProps('desarme_auto', { type: 'checkbox' })}
                        />
                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => setVinculoModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" leftSection={<Link2 size={14} />} loading={savingVinculo}>
                                Crear vínculo
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Stack>
    );
}
