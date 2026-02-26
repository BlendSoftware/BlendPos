import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Select, Badge,
    Table, ActionIcon, Tooltip, Modal, NumberInput, Textarea,
    Switch, Skeleton, Paper, Divider, Alert, UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, Search, Edit, PowerOff, Power, X, AlertCircle, PackagePlus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { formatARS } from '../../api/mockAdmin';
import {
    listarProductos, crearProducto, actualizarProducto, desactivarProducto, reactivarProducto, ajustarStock,
    type ProductoResponse,
} from '../../services/api/products';
import { listarCategorias, type CategoriaResponse } from '../../services/api/categorias';
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

const ESTADO_BADGE = (activo: boolean) =>
    activo
        ? <Badge color="teal" size="sm" variant="light">Activo</Badge>
        : <Badge color="gray" size="sm" variant="light">Inactivo</Badge>;

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
    const [categorias, setCategorias] = useState<CategoriaResponse[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
    const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
    const [mostrarInactivos, setMostrarInactivos] = useState(false);
    const [sortBy, setSortBy] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState<string | null>(null);

    // ── Stock adjustment modal state ───────────────────────────────────────
    const [stockModalOpen, setStockModalOpen] = useState(false);
    const [stockTarget, setStockTarget] = useState<IProducto | null>(null);
    const stockForm = useForm({
        initialValues: { delta: 0, motivo: '' },
        validate: {
            delta: (v) => (v !== 0 ? null : 'El ajuste no puede ser 0'),
            motivo: (v) => (v.trim().length >= 3 ? null : 'Mínimo 3 caracteres'),
        },
    });

    const fetchProductos = useCallback(async () => {
        setLoading(true);
        setApiError(null);
        try {
            // Fetch all products including inactive so that client-side filter works
            const [productosResp, categoriasResp] = await Promise.all([
                listarProductos({ limit: 500, page: 1, activo: 'all' }),
                listarCategorias(),
            ]);
            setProductos(productosResp.data.map(mapProducto));
            setCategorias(categoriasResp.filter((c) => c.activo));
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
            nombre: (v) => (v.trim().length >= 3 ? null : 'Mínimo 3 caracteres'),
            precioCosto: (v) => (v >= 0 ? null : 'Debe ser ≥ 0'),
            precioVenta: (v, values) =>
                v > values.precioCosto ? null : 'El precio de venta debe ser mayor al costo',
            stock: (v) => (v >= 0 ? null : 'Debe ser ≥ 0'),
            stockMinimo: (v) => (v >= 0 ? null : 'Debe ser ≥ 0'),
        },
    });

    // ── Filtros ──────────────────────────────────────────────────────────────

    const filtered = useMemo(() => {
        const arr = productos.filter((p) => {
            const matchBusqueda =
                !busqueda ||
                p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
                p.codigoBarras.includes(busqueda);
            const matchCat = !filtroCategoria || p.categoria === filtroCategoria;
            const matchEstado =
                !filtroEstado ||
                (filtroEstado === 'activo' ? p.activo : !p.activo);
            // Si no se muestra inactivos, filtrar solo activos
            const matchActivo = mostrarInactivos || p.activo;
            return matchBusqueda && matchCat && matchEstado && matchActivo;
        });

        if (!sortBy) return arr;

        return [...arr].sort((a, b) => {
            let valA: number | string;
            let valB: number | string;
            switch (sortBy) {
                case 'categoria': valA = a.categoria; valB = b.categoria; break;
                case 'precioCosto': valA = a.precioCosto; valB = b.precioCosto; break;
                case 'precioVenta': valA = a.precioVenta; valB = b.precioVenta; break;
                case 'margen': {
                    valA = a.precioCosto > 0 ? ((a.precioVenta - a.precioCosto) / a.precioCosto) : 0;
                    valB = b.precioCosto > 0 ? ((b.precioVenta - b.precioCosto) / b.precioCosto) : 0;
                    break;
                }
                case 'stock': valA = a.stock; valB = b.stock; break;
                default: valA = a.nombre.toLowerCase(); valB = b.nombre.toLowerCase();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [productos, busqueda, filtroCategoria, filtroEstado, mostrarInactivos, sortBy, sortDir]);

    const toggleSort = (col: string) => {
        if (sortBy === col) {
            if (sortDir === 'asc') setSortDir('desc');
            else { setSortBy(null); setSortDir('asc'); }
        } else {
            setSortBy(col);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ col }: { col: string }) => {
        if (sortBy !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />;
        return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
    };

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
            if (tgt?.activo) {
                await desactivarProducto(id);
            } else {
                await reactivarProducto(id);
            }
            setProductos((prev) =>
                prev.map((p) => p.id === id ? { ...p, activo: !p.activo, actualizadoEn: new Date().toISOString() } : p)
            );
            notifications.show({
                title: tgt?.activo ? 'Producto desactivado' : 'Producto reactivado',
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

    const openStockModal = (p: IProducto) => {
        setStockTarget(p);
        stockForm.reset();
        setStockModalOpen(true);
    };

    const handleStockSubmit = stockForm.onSubmit(async (values) => {
        if (!stockTarget) return;
        try {
            const updated = await ajustarStock(stockTarget.id, values.delta, values.motivo);
            setProductos((prev) =>
                prev.map((p) => p.id === stockTarget.id ? { ...p, stock: updated.stock_actual } : p)
            );
            notifications.show({
                title: 'Stock ajustado',
                message: `${stockTarget.nombre}: ${values.delta > 0 ? '+' : ''}${values.delta} unidades`,
                color: 'teal',
            });
            setStockModalOpen(false);
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: err instanceof Error ? err.message : 'No se pudo ajustar el stock',
                color: 'red',
            });
        }
    });

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
                <Group gap="sm">
                    <Switch
                        label="Mostrar inactivos"
                        checked={mostrarInactivos}
                        onChange={(e) => setMostrarInactivos(e.currentTarget.checked)}
                    />
                    <Button leftSection={<Plus size={16} />} onClick={openCreate}>
                        Nuevo producto
                    </Button>
                </Group>
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
                    data={categorias.map((c) => ({ value: c.nombre, label: c.nombre }))}
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
            <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
                {loading ? (
                    <Stack p="md" gap="sm">
                        {[...Array(6)].map((_, i) => <Skeleton key={i} height={40} radius="sm" />)}
                    </Stack>
                ) : (
                    <Table highlightOnHover striped verticalSpacing="sm">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Código</Table.Th>
                                <Table.Th>
                                    <UnstyledButton onClick={() => toggleSort('nombre')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                        Nombre <SortIcon col="nombre" />
                                    </UnstyledButton>
                                </Table.Th>
                                <Table.Th>
                                    <UnstyledButton onClick={() => toggleSort('categoria')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                        Categoría <SortIcon col="categoria" />
                                    </UnstyledButton>
                                </Table.Th>
                                <Table.Th>
                                    <UnstyledButton onClick={() => toggleSort('precioCosto')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                        Costo <SortIcon col="precioCosto" />
                                    </UnstyledButton>
                                </Table.Th>
                                <Table.Th>
                                    <UnstyledButton onClick={() => toggleSort('precioVenta')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                        Venta <SortIcon col="precioVenta" />
                                    </UnstyledButton>
                                </Table.Th>
                                <Table.Th>
                                    <UnstyledButton onClick={() => toggleSort('margen')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                        Margen <SortIcon col="margen" />
                                    </UnstyledButton>
                                </Table.Th>
                                <Table.Th>
                                    <UnstyledButton onClick={() => toggleSort('stock')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'inherit', fontWeight: 'inherit' }}>
                                        Stock <SortIcon col="stock" />
                                    </UnstyledButton>
                                </Table.Th>
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
                                                {categorias.find((c) => c.nombre === p.categoria)?.nombre || p.categoria}
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
                                                <Tooltip label="Ajustar stock" withArrow>
                                                    <ActionIcon variant="subtle" color="yellow" onClick={() => openStockModal(p)}>
                                                        <PackagePlus size={15} />
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
                                data={categorias.map((c) => ({ value: c.nombre, label: c.nombre }))}
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
            {/* ── Modal Ajuste de Stock ───────────────────────────────────── */}
            <Modal
                opened={stockModalOpen}
                onClose={() => setStockModalOpen(false)}
                title={<Text fw={700}>Ajustar stock — {stockTarget?.nombre}</Text>}
                size="sm"
                centered
            >
                <form onSubmit={handleStockSubmit}>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed">Stock actual: <strong>{stockTarget?.stock ?? 0} ud</strong></Text>
                        <NumberInput
                            label="Ajuste (+/−)"
                            description="Positivo para ingresar, negativo para retirar"
                            allowNegative
                            {...stockForm.getInputProps('delta')}
                        />
                        <TextInput
                            label="Motivo"
                            placeholder="Ej: recepción de mercadería, merma, etc."
                            {...stockForm.getInputProps('motivo')}
                        />
                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => setStockModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" color="yellow">Aplicar ajuste</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Stack>
    );
}
