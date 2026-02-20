import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Select, Badge,
    Table, ActionIcon, Tooltip, Modal, NumberInput, Textarea,
    Switch, Skeleton, Paper, Divider, Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, Search, Edit, PowerOff, Power, X, AlertCircle } from 'lucide-react';
import { formatARS } from '../../api/mockAdmin';
import {
    listarProductos, crearProducto, actualizarProducto, desactivarProducto,
    type ProductoResponse,
} from '../../services/api/products';
import type { IProducto, CategoriaProducto } from '../../types';

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapProducto(p: ProductoResponse): IProducto {
    return {
        id: p.id,
        codigoBarras: p.codigo_barras,
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        categoria: (p.categoria as CategoriaProducto) ?? 'otros',
        precioCosto: p.precio_costo,
        precioVenta: p.precio_venta,
        stock: p.stock_actual,
        stockMinimo: p.stock_minimo,
        activo: p.activo,
        creadoEn: new Date().toISOString(),
        actualizadoEn: new Date().toISOString(),
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORIAS: { value: CategoriaProducto; label: string }[] = [
    { value: 'bebidas',   label: 'Bebidas' },
    { value: 'panaderia', label: 'Panadería' },
    { value: 'lacteos',   label: 'Lácteos' },
    { value: 'limpieza',  label: 'Limpieza' },
    { value: 'golosinas', label: 'Golosinas' },
    { value: 'otros',     label: 'Otros' },
];

const ESTADO_BADGE = (activo: boolean) =>
    activo
        ? <Badge color="teal"  size="sm" variant="light">Activo</Badge>
        : <Badge color="gray"  size="sm" variant="light">Inactivo</Badge>;

// ── Form values ───────────────────────────────────────────────────────────────

interface FormValues {
    codigoBarras: string;
    nombre: string;
    descripcion: string;
    categoria: CategoriaProducto;
    precioCosto: number;
    precioVenta: number;
    stock: number;
    stockMinimo: number;
    activo: boolean;
}

const EMPTY_FORM: FormValues = {
    codigoBarras: '', nombre: '', descripcion: '',
    categoria: 'otros', precioCosto: 0, precioVenta: 0,
    stock: 0, stockMinimo: 5, activo: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function GestionProductosPage() {
    const [productos, setProductos] = useState<IProducto[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
    const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState<string | null>(null);

    const fetchProductos = useCallback(async () => {
        setLoading(true);
        setApiError(null);
        try {
            const resp = await listarProductos({ limit: 500, page: 1 });
            setProductos(resp.data.map(mapProducto));
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al cargar productos';
            setApiError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProductos(); }, [fetchProductos]);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<IProducto | null>(null);

    const form = useForm<FormValues>({
        initialValues: EMPTY_FORM,
        validate: {
            codigoBarras: (v) => (v.trim() ? null : 'Requerido'),
            nombre:        (v) => (v.trim().length >= 3 ? null : 'Mínimo 3 caracteres'),
            precioCosto:   (v) => (v >= 0 ? null : 'Debe ser ≥ 0'),
            precioVenta:   (v, values) =>
                v > values.precioCosto ? null : 'El precio de venta debe ser mayor al costo',
            stock:         (v) => (v >= 0 ? null : 'Debe ser ≥ 0'),
            stockMinimo:   (v) => (v >= 0 ? null : 'Debe ser ≥ 0'),
        },
    });

    // ── Filtros ──────────────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        return productos.filter((p) => {
            const matchBusqueda =
                !busqueda ||
                p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                p.codigoBarras.includes(busqueda);
            const matchCat = !filtroCategoria || p.categoria === filtroCategoria;
            const matchEstado =
                !filtroEstado ||
                (filtroEstado === 'activo' ? p.activo : !p.activo);
            return matchBusqueda && matchCat && matchEstado;
        });
    }, [productos, busqueda, filtroCategoria, filtroEstado]);

    // ── Acciones ──────────────────────────────────────────────────────────────

    const openCreate = () => {
        setEditTarget(null);
        form.setValues(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (p: IProducto) => {
        setEditTarget(p);
        form.setValues({
            codigoBarras: p.codigoBarras,
            nombre: p.nombre,
            descripcion: p.descripcion,
            categoria: p.categoria,
            precioCosto: p.precioCosto,
            precioVenta: p.precioVenta,
            stock: p.stock,
            stockMinimo: p.stockMinimo,
            activo: p.activo,
        });
        setModalOpen(true);
    };

    const toggleActivo = async (id: string) => {
        const tgt = productos.find((p) => p.id === id);
        try {
            await desactivarProducto(id);
            setProductos((prev) =>
                prev.map((p) => p.id === id ? { ...p, activo: !p.activo, actualizadoEn: new Date().toISOString() } : p)
            );
            notifications.show({
                title: tgt?.activo ? 'Producto desactivado' : 'Producto activado',
                message: tgt?.nombre,
                color: tgt?.activo ? 'gray' : 'teal',
            });
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: err instanceof Error ? err.message : 'No se pudo cambiar el estado',
                color: 'red',
            });
        }
    };

    const handleSubmit = form.onSubmit(async (values) => {
        try {
            if (editTarget) {
                await actualizarProducto(editTarget.id, {
                    nombre: values.nombre,
                    descripcion: values.descripcion || undefined,
                    categoria: values.categoria,
                    precio_costo: values.precioCosto,
                    precio_venta: values.precioVenta,
                    stock_minimo: values.stockMinimo,
                });
                notifications.show({ title: 'Producto actualizado', message: values.nombre, color: 'blue' });
            } else {
                await crearProducto({
                    codigo_barras: values.codigoBarras,
                    nombre: values.nombre,
                    descripcion: values.descripcion || undefined,
                    categoria: values.categoria,
                    precio_costo: values.precioCosto,
                    precio_venta: values.precioVenta,
                    stock_actual: values.stock,
                    stock_minimo: values.stockMinimo,
                });
                notifications.show({ title: 'Producto creado', message: values.nombre, color: 'teal' });
            }
            setModalOpen(false);
            await fetchProductos();
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: err instanceof Error ? err.message : 'No se pudo guardar',
                color: 'red',
            });
        }
    });

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <Stack gap="xl">
            {/* Encabezado */}
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Gestión de Productos</Title>
                    <Text c="dimmed" size="sm">{productos.filter((p) => p.activo).length} activos · {productos.length} total</Text>
                </div>
                <Button leftSection={<Plus size={16} />} onClick={openCreate}>
                    Nuevo producto
                </Button>
            </Group>

            {apiError && (
                <Alert color="red" icon={<AlertCircle size={16} />} variant="light">
                    {apiError}
                </Alert>
            )}

            {/* Filtros */}
            <Group gap="sm" wrap="wrap">
                <TextInput
                    placeholder="Buscar por nombre o código..."
                    leftSection={<Search size={14} />}
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.currentTarget.value)}
                    style={{ flex: 1, minWidth: 200 }}
                    rightSection={busqueda ? <ActionIcon size="sm" variant="subtle" onClick={() => setBusqueda('')}><X size={12} /></ActionIcon> : null}
                />
                <Select
                    placeholder="Categoría"
                    data={CATEGORIAS}
                    value={filtroCategoria}
                    onChange={setFiltroCategoria}
                    clearable
                    style={{ width: 150 }}
                />
                <Select
                    placeholder="Estado"
                    data={[{ value: 'activo', label: 'Activos' }, { value: 'inactivo', label: 'Inactivos' }]}
                    value={filtroEstado}
                    onChange={setFiltroEstado}
                    clearable
                    style={{ width: 130 }}
                />
            </Group>

            {/* Tabla */}
            <Paper radius="md" withBorder style={{ background: 'var(--mantine-color-dark-8)', overflow: 'hidden' }}>
                {loading ? (
                    <Stack p="md" gap="sm">
                        {[...Array(6)].map((_, i) => <Skeleton key={i} height={40} radius="sm" />)}
                    </Stack>
                ) : (
                    <Table highlightOnHover striped stripedColor="dark.7" verticalSpacing="sm">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Código</Table.Th>
                                <Table.Th>Nombre</Table.Th>
                                <Table.Th>Categoría</Table.Th>
                                <Table.Th>Costo</Table.Th>
                                <Table.Th>Venta</Table.Th>
                                <Table.Th>Margen</Table.Th>
                                <Table.Th>Stock</Table.Th>
                                <Table.Th>Estado</Table.Th>
                                <Table.Th style={{ width: 90 }}>Acciones</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filtered.length === 0 ? (
                                <Table.Tr>
                                    <Table.Td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--mantine-color-dimmed)' }}>
                                        Sin resultados
                                    </Table.Td>
                                </Table.Tr>
                            ) : (
                                filtered.map((p) => (
                                    <Table.Tr key={p.id} style={{ opacity: p.activo ? 1 : 0.5 }}>
                                        <Table.Td>
                                            <Text size="xs" ff="monospace">{p.codigoBarras}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" fw={500}>{p.nombre}</Text>
                                            {p.cantidadHija && (
                                                <Text size="xs" c="blue.4">Caja × {p.cantidadHija} unidades</Text>
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge size="xs" variant="outline">
                                                {CATEGORIAS.find((c) => c.value === p.categoria)?.label}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{formatARS(p.precioCosto)}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" fw={600} c="teal.4">{formatARS(p.precioVenta)}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {p.precioCosto > 0 ? (
                                                <Badge
                                                    size="sm"
                                                    variant="light"
                                                    color={
                                                        ((p.precioVenta - p.precioCosto) / p.precioCosto) * 100 >= 30 ? 'teal'
                                                        : ((p.precioVenta - p.precioCosto) / p.precioCosto) * 100 >= 15 ? 'yellow'
                                                        : 'red'
                                                    }
                                                >
                                                    {(((p.precioVenta - p.precioCosto) / p.precioCosto) * 100).toFixed(0)}%
                                                </Badge>
                                            ) : <Text size="xs" c="dimmed">—</Text>}
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge
                                                size="sm"
                                                color={p.stock === 0 ? 'red' : p.stock <= p.stockMinimo ? 'yellow' : 'gray'}
                                                variant="light"
                                            >
                                                {p.stock} ud
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>{ESTADO_BADGE(p.activo)}</Table.Td>
                                        <Table.Td>
                                            <Group gap={4}>
                                                <Tooltip label="Editar" withArrow>
                                                    <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(p)}>
                                                        <Edit size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label={p.activo ? 'Desactivar' : 'Activar'} withArrow>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color={p.activo ? 'gray' : 'teal'}
                                                        onClick={() => toggleActivo(p.id)}
                                                    >
                                                        {p.activo ? <PowerOff size={15} /> : <Power size={15} />}
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))
                            )}
                        </Table.Tbody>
                    </Table>
                )}
            </Paper>

            {/* ── Modal Crear / Editar ─────────────────────────────────────── */}
            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={<Text fw={700}>{editTarget ? 'Editar producto' : 'Nuevo producto'}</Text>}
                size="lg"
                centered
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <Group grow>
                            <TextInput label="Código de barras" placeholder="7790000000000" {...form.getInputProps('codigoBarras')} />
                            <Select
                                label="Categoría"
                                data={CATEGORIAS}
                                {...form.getInputProps('categoria')}
                            />
                        </Group>

                        <TextInput label="Nombre" placeholder="Nombre del producto" {...form.getInputProps('nombre')} />
                        <Textarea label="Descripción" placeholder="Descripción opcional" rows={2} {...form.getInputProps('descripcion')} />

                        <Divider label="Precios" labelPosition="left" />

                        <Group grow>
                            <NumberInput
                                label="Precio de costo"
                                prefix="$"
                                decimalScale={2}
                                thousandSeparator="."
                                decimalSeparator=","
                                min={0}
                                {...form.getInputProps('precioCosto')}
                            />
                            <NumberInput
                                label="Precio de venta"
                                prefix="$"
                                decimalScale={2}
                                thousandSeparator="."
                                decimalSeparator=","
                                min={0}
                                {...form.getInputProps('precioVenta')}
                            />
                        </Group>

                        {form.values.precioCosto > 0 && form.values.precioVenta > form.values.precioCosto && (
                            <Text size="xs" c="teal">
                                Margen: {(((form.values.precioVenta - form.values.precioCosto) / form.values.precioCosto) * 100).toFixed(1)}%
                            </Text>
                        )}

                        <Divider label="Stock" labelPosition="left" />

                        <Group grow>
                            <NumberInput label="Stock actual" min={0} {...form.getInputProps('stock')} />
                            <NumberInput label="Stock mínimo" min={0} {...form.getInputProps('stockMinimo')} />
                        </Group>

                        <Switch
                            label="Producto activo"
                            checked={form.values.activo}
                            onChange={(e) => form.setFieldValue('activo', e.currentTarget.checked)}
                        />

                        <Group justify="flex-end" mt="sm">
                            <Button variant="subtle" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button type="submit">{editTarget ? 'Guardar cambios' : 'Crear producto'}</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Stack>
    );
}
