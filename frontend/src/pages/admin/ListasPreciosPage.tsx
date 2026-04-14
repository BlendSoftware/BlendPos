import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Modal, Table, Paper,
    ActionIcon, Tooltip, Skeleton, NumberInput, Badge, Pagination, Select,
    Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
    Plus, Edit, Trash2, FileText, Search, X, Download, Percent, AlertTriangle,
    ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import {
    listarListasPrecios, crearListaPrecios, actualizarListaPrecios,
    eliminarListaPrecios, obtenerListaPrecios, asignarProducto, quitarProducto,
    aplicarMasivo, descargarPDFListaPrecios,
    type ListaPreciosResponse, type ListaPreciosDetalleResponse,
    type ListaPreciosProductoResponse,
} from '../../services/api/listasPrecios';
import { listarProductos, type ProductoResponse } from '../../services/api/products';

export function ListasPreciosPage() {
    // ── State ────────────────────────────────────────────────────────────────
    const [listas, setListas] = useState<ListaPreciosResponse[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');

    // Modals
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<ListaPreciosResponse | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<ListaPreciosResponse | null>(null);
    const [saving, setSaving] = useState(false);

    // Detail view
    const [detalle, setDetalle] = useState<ListaPreciosDetalleResponse | null>(null);
    const [detalleLoading, setDetalleLoading] = useState(false);

    // Sorting
    type SortField = 'nombre' | 'precio_venta' | 'descuento' | 'precio_final' | 'barcode';
    type SortDir = 'asc' | 'desc';
    const [sortBy, setSortBy] = useState<SortField>('nombre');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // Bulk apply
    const [masivoOpen, setMasivoOpen] = useState(false);
    const [masivoConfirm, setMasivoConfirm] = useState(false);
    const [masivoDescuento, setMasivoDescuento] = useState<number | string>(10);
    const [masivoLoading, setMasivoLoading] = useState(false);

    // Add product
    const [addProductoOpen, setAddProductoOpen] = useState(false);
    const [productos, setProductos] = useState<ProductoResponse[]>([]);
    const [prodSearchLoading, setProdSearchLoading] = useState(false);

    // ── Forms ────────────────────────────────────────────────────────────────
    const listaForm = useForm({
        initialValues: { nombre: '', logo_url: '' },
        validate: {
            nombre: (v: string) => (v.trim().length >= 2 ? null : 'Mínimo 2 caracteres'),
        },
    });

    const addForm = useForm({
        initialValues: { producto_id: '', descuento_porcentaje: 10 },
        validate: {
            producto_id: (v: string) => (v ? null : 'Seleccioná un producto'),
            descuento_porcentaje: (v: number) => {
                if (v < 0) return 'No puede ser negativo';
                if (v > 90) return 'Máximo 90%';
                return null;
            },
        },
    });

    // ── Fetch ────────────────────────────────────────────────────────────────
    const fetchListas = useCallback(async () => {
        setLoading(true);
        try {
            const res = await listarListasPrecios({ nombre: busqueda || undefined, page, limit: 20 });
            setListas(res.data);
            setTotal(res.total_pages);
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error al cargar listas', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, [busqueda, page]);

    useEffect(() => { fetchListas(); }, [fetchListas]);

    const fetchDetalle = useCallback(async (id: string) => {
        setDetalleLoading(true);
        try {
            const data = await obtenerListaPrecios(id);
            setDetalle(data);
        } catch (err) {
            notifications.show({ title: 'Error', message: 'No se pudo cargar el detalle', color: 'red' });
        } finally {
            setDetalleLoading(false);
        }
    }, []);

    const fetchProductos = useCallback(async () => {
        setProdSearchLoading(true);
        try {
            const res = await listarProductos({ activo: 'true', limit: 100, page: 1 });
            setProductos(res.data);
        } catch {
            // silent
        } finally {
            setProdSearchLoading(false);
        }
    }, []);

    // ── Handlers: CRUD Lista ─────────────────────────────────────────────────
    const openCreate = () => {
        setEditTarget(null);
        listaForm.reset();
        setModalOpen(true);
    };

    const openEdit = (l: ListaPreciosResponse) => {
        setEditTarget(l);
        listaForm.setValues({ nombre: l.nombre, logo_url: l.logo_url ?? '' });
        setModalOpen(true);
    };

    const handleSubmitLista = listaForm.onSubmit(async (values) => {
        setSaving(true);
        try {
            const body = {
                nombre: values.nombre.trim(),
                logo_url: values.logo_url.trim() || undefined,
            };
            if (editTarget) {
                await actualizarListaPrecios(editTarget.id, body);
                notifications.show({ title: 'Lista actualizada', message: body.nombre, color: 'blue' });
            } else {
                await crearListaPrecios(body);
                notifications.show({ title: 'Lista creada', message: body.nombre, color: 'teal' });
            }
            setModalOpen(false);
            await fetchListas();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        } finally {
            setSaving(false);
        }
    });

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        try {
            await eliminarListaPrecios(deleteConfirm.id);
            notifications.show({ title: 'Lista eliminada', message: deleteConfirm.nombre, color: 'gray' });
            setDeleteConfirm(null);
            if (detalle?.id === deleteConfirm.id) setDetalle(null);
            await fetchListas();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    // ── Handlers: Productos en lista ─────────────────────────────────────────
    const openAddProducto = () => {
        addForm.reset();
        fetchProductos();
        setAddProductoOpen(true);
    };

    const handleAddProducto = addForm.onSubmit(async (values) => {
        if (!detalle) return;
        setSaving(true);
        try {
            await asignarProducto(detalle.id, {
                producto_id: values.producto_id,
                descuento_porcentaje: values.descuento_porcentaje,
            });
            notifications.show({ title: 'Producto asignado', message: '', color: 'teal' });
            setAddProductoOpen(false);
            await fetchDetalle(detalle.id);
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        } finally {
            setSaving(false);
        }
    });

    const handleRemoveProducto = async (productoId: string) => {
        if (!detalle) return;
        try {
            await quitarProducto(detalle.id, productoId);
            notifications.show({ title: 'Producto quitado', message: '', color: 'gray' });
            await fetchDetalle(detalle.id);
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    const handleUpdateDescuento = async (item: ListaPreciosProductoResponse, nuevoDescuento: number) => {
        if (!detalle) return;
        if (nuevoDescuento < 0 || nuevoDescuento > 90) return;
        try {
            await asignarProducto(detalle.id, {
                producto_id: item.producto_id,
                descuento_porcentaje: nuevoDescuento,
            });
            await fetchDetalle(detalle.id);
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    // ── Handlers: Masivo ─────────────────────────────────────────────────────
    const openMasivo = () => {
        setMasivoDescuento(10);
        setMasivoOpen(true);
    };

    const handleMasivoConfirm = async () => {
        if (!detalle) return;
        const desc = Number(masivoDescuento);
        if (isNaN(desc) || desc < 0 || desc > 90) {
            notifications.show({ title: 'Error', message: 'Descuento inválido (0-90%)', color: 'red' });
            return;
        }
        setMasivoLoading(true);
        try {
            const res = await aplicarMasivo(detalle.id, { descuento_porcentaje: desc });
            setDetalle(res);
            notifications.show({
                title: 'Descuento masivo aplicado',
                message: `${desc}% aplicado a ${res.productos.length} productos`,
                color: 'teal',
            });
            setMasivoConfirm(false);
            setMasivoOpen(false);
            await fetchListas();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        } finally {
            setMasivoLoading(false);
        }
    };

    // ── Handlers: PDF ────────────────────────────────────────────────────────
    const handleDescargarPDF = async (lista: ListaPreciosResponse | ListaPreciosDetalleResponse) => {
        try {
            await descargarPDFListaPrecios(lista.id, lista.nombre);
            notifications.show({ title: 'PDF descargado', message: lista.nombre, color: 'teal' });
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error al descargar PDF', color: 'red' });
        }
    };

    // ── Sorting ───────────────────────────────────────────────────────────────
    const toggleSort = (field: SortField) => {
        if (sortBy === field) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortBy !== field) return <ArrowUpDown size={12} opacity={0.3} />;
        return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
    };

    const sortedProductos = useMemo(() => {
        if (!detalle) return [];
        const items = [...detalle.productos];
        items.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'nombre':
                    cmp = a.producto_nombre.localeCompare(b.producto_nombre, 'es');
                    break;
                case 'barcode':
                    cmp = a.producto_barcode.localeCompare(b.producto_barcode);
                    break;
                case 'precio_venta':
                    cmp = parseFloat(String(a.precio_venta)) - parseFloat(String(b.precio_venta));
                    break;
                case 'descuento':
                    cmp = parseFloat(String(a.descuento_porcentaje)) - parseFloat(String(b.descuento_porcentaje));
                    break;
                case 'precio_final':
                    cmp = parseFloat(String(a.precio_final)) - parseFloat(String(b.precio_final));
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return items;
    }, [detalle, sortBy, sortDir]);

    // ── Product select data ──────────────────────────────────────────────────
    const productoSelectData = useMemo(() => {
        const existingIds = new Set(detalle?.productos.map((p) => p.producto_id) ?? []);
        return productos
            .filter((p) => !existingIds.has(p.id))
            .map((p) => ({
                value: p.id,
                label: `${p.nombre} (${p.codigo_barras}) — $${parseFloat(String(p.precio_venta)).toFixed(2)}`,
            }));
    }, [productos, detalle]);

    // ── Render ───────────────────────────────────────────────────────────────

    // If viewing detail
    if (detalle) {
        return (
            <Stack gap="lg">
                <Group justify="space-between">
                    <div>
                        <Group gap="xs">
                            <Button variant="subtle" size="xs" onClick={() => setDetalle(null)}>← Volver</Button>
                            <Title order={2} fw={800}>{detalle.nombre}</Title>
                        </Group>
                        <Text c="dimmed" size="sm">{detalle.productos.length} productos asignados</Text>
                    </div>
                    <Group>
                        <Button
                            variant="light"
                            color="orange"
                            leftSection={<Percent size={16} />}
                            onClick={openMasivo}
                        >
                            Aplicar descuento masivo
                        </Button>
                        <Button
                            variant="light"
                            leftSection={<Plus size={16} />}
                            onClick={openAddProducto}
                        >
                            Agregar producto
                        </Button>
                        <Button
                            variant="light"
                            color="teal"
                            leftSection={<Download size={16} />}
                            onClick={() => handleDescargarPDF(detalle)}
                        >
                            Descargar PDF
                        </Button>
                    </Group>
                </Group>

                {detalleLoading ? (
                    <Skeleton height={200} />
                ) : (
                    <Paper radius="md" withBorder style={{ overflow: 'auto' }}>
                        <Table verticalSpacing="sm" striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('nombre')}>
                                        <Group gap={4}>Producto <SortIcon field="nombre" /></Group>
                                    </Table.Th>
                                    <Table.Th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('barcode')}>
                                        <Group gap={4}>Código <SortIcon field="barcode" /></Group>
                                    </Table.Th>
                                    <Table.Th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('precio_venta')}>
                                        <Group gap={4} justify="flex-end">Precio Público <SortIcon field="precio_venta" /></Group>
                                    </Table.Th>
                                    <Table.Th style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('descuento')}>
                                        <Group gap={4} justify="center">% Descuento <SortIcon field="descuento" /></Group>
                                    </Table.Th>
                                    <Table.Th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('precio_final')}>
                                        <Group gap={4} justify="flex-end">Precio Final <SortIcon field="precio_final" /></Group>
                                    </Table.Th>
                                    <Table.Th>Acciones</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {sortedProductos.length === 0 ? (
                                    <Table.Tr>
                                        <Table.Td colSpan={6}>
                                            <Text ta="center" c="dimmed" py="xl" size="sm">
                                                No hay productos asignados. Agregá productos o usá el descuento masivo.
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                ) : sortedProductos.map((item) => (
                                    <Table.Tr key={item.id}>
                                        <Table.Td>
                                            <Text size="sm" fw={500}>{item.producto_nombre}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs" c="dimmed">{item.producto_barcode}</Text>
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>
                                            <Text size="sm">${parseFloat(String(item.precio_venta)).toFixed(2)}</Text>
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'center', width: 130 }}>
                                            <NumberInput
                                                value={parseFloat(String(item.descuento_porcentaje))}
                                                onChange={(val) => {
                                                    if (typeof val === 'number') {
                                                        handleUpdateDescuento(item, val);
                                                    }
                                                }}
                                                min={0}
                                                max={90}
                                                step={0.5}
                                                decimalScale={2}
                                                suffix="%"
                                                size="xs"
                                                styles={{ input: { textAlign: 'center' } }}
                                            />
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>
                                            <Badge color="teal" size="lg" variant="light">
                                                ${parseFloat(String(item.precio_final)).toFixed(2)}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Tooltip label="Quitar" withArrow>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="red"
                                                    onClick={() => handleRemoveProducto(item.producto_id)}
                                                >
                                                    <Trash2 size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                )}

                {/* ── Modal: Agregar Producto ──────────────────────────────── */}
                <Modal
                    opened={addProductoOpen}
                    onClose={() => setAddProductoOpen(false)}
                    title={<Text fw={700}>Agregar producto a la lista</Text>}
                    size="md"
                    centered
                >
                    <form onSubmit={handleAddProducto}>
                        <Stack gap="md">
                            <Select
                                label="Producto"
                                placeholder="Buscá por nombre o código..."
                                data={productoSelectData}
                                searchable
                                nothingFoundMessage={prodSearchLoading ? 'Cargando...' : 'Sin resultados'}
                                {...addForm.getInputProps('producto_id')}
                            />
                            <NumberInput
                                label="Descuento (%)"
                                min={0}
                                max={90}
                                step={0.5}
                                decimalScale={2}
                                {...addForm.getInputProps('descuento_porcentaje')}
                            />
                            <Group justify="flex-end" mt="sm">
                                <Button variant="subtle" onClick={() => setAddProductoOpen(false)}>Cancelar</Button>
                                <Button type="submit" loading={saving}>Agregar</Button>
                            </Group>
                        </Stack>
                    </form>
                </Modal>

                {/* ── Modal: Descuento Masivo ─────────────────────────────── */}
                <Modal
                    opened={masivoOpen}
                    onClose={() => { setMasivoOpen(false); setMasivoConfirm(false); }}
                    title={<Text fw={700}>Aplicar descuento masivo</Text>}
                    size="sm"
                    centered
                >
                    {!masivoConfirm ? (
                        <Stack gap="md">
                            <Text size="sm">
                                Esto asignará el descuento indicado a <strong>todos los productos activos</strong> del sistema.
                            </Text>
                            <NumberInput
                                label="Porcentaje de descuento"
                                value={masivoDescuento}
                                onChange={setMasivoDescuento}
                                min={0}
                                max={90}
                                step={0.5}
                                decimalScale={2}
                                suffix="%"
                            />
                            <Group justify="flex-end" mt="sm">
                                <Button variant="subtle" onClick={() => setMasivoOpen(false)}>Cancelar</Button>
                                <Button
                                    color="orange"
                                    onClick={() => setMasivoConfirm(true)}
                                    disabled={Number(masivoDescuento) < 0 || Number(masivoDescuento) > 90}
                                >
                                    Continuar
                                </Button>
                            </Group>
                        </Stack>
                    ) : (
                        <Stack gap="md">
                            <Alert
                                icon={<AlertTriangle size={18} />}
                                title="Confirmar acción masiva"
                                color="orange"
                                variant="light"
                            >
                                Se sobrescribirán todos los descuentos actuales de esta lista
                                con un <strong>{Number(masivoDescuento).toFixed(2)}%</strong> de descuento
                                aplicado a todos los productos activos.
                                Esta acción no se puede deshacer.
                            </Alert>
                            <Group justify="flex-end" mt="sm">
                                <Button variant="subtle" onClick={() => setMasivoConfirm(false)}>Volver</Button>
                                <Button color="orange" loading={masivoLoading} onClick={handleMasivoConfirm}>
                                    Confirmar y aplicar
                                </Button>
                            </Group>
                        </Stack>
                    )}
                </Modal>
            </Stack>
        );
    }

    // ── Main list view ───────────────────────────────────────────────────────
    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Listas de Precios</Title>
                    <Text c="dimmed" size="sm">Listas de precios diferenciales para clientes específicos</Text>
                </div>
                <Button leftSection={<Plus size={16} />} onClick={openCreate}>Nueva lista</Button>
            </Group>

            <TextInput
                placeholder="Buscar lista..."
                leftSection={<Search size={14} />}
                value={busqueda}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setBusqueda(e.currentTarget.value); setPage(1); }}
                style={{ maxWidth: 320 }}
                rightSection={busqueda ? <ActionIcon size="sm" variant="subtle" onClick={() => { setBusqueda(''); setPage(1); }}><X size={12} /></ActionIcon> : null}
            />

            <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
                <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Nombre</Table.Th>
                            <Table.Th style={{ textAlign: 'center' }}>Productos</Table.Th>
                            <Table.Th>Creada</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <Table.Tr key={i}>
                                    {Array.from({ length: 4 }).map((__, j) => (
                                        <Table.Td key={j}><Skeleton height={20} radius="sm" /></Table.Td>
                                    ))}
                                </Table.Tr>
                            ))
                        ) : listas.length === 0 ? (
                            <Table.Tr>
                                <Table.Td colSpan={4}>
                                    <Text ta="center" c="dimmed" py="xl" size="sm">
                                        {busqueda ? 'Sin resultados' : 'No hay listas de precios. Creá la primera.'}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ) : listas.map((lista) => (
                            <Table.Tr
                                key={lista.id}
                                style={{ cursor: 'pointer' }}
                                onClick={() => fetchDetalle(lista.id)}
                            >
                                <Table.Td>
                                    <Group gap="xs">
                                        <FileText size={14} color="var(--mantine-color-blue-5)" />
                                        <Text size="sm" fw={500}>{lista.nombre}</Text>
                                    </Group>
                                </Table.Td>
                                <Table.Td style={{ textAlign: 'center' }}>
                                    <Badge size="sm" variant="light">{lista.cantidad_productos}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="xs" c="dimmed">
                                        {new Date(lista.created_at).toLocaleDateString('es-AR')}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                        <Tooltip label="Editar" withArrow>
                                            <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(lista)}>
                                                <Edit size={15} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Descargar PDF" withArrow>
                                            <ActionIcon variant="subtle" color="teal" onClick={() => handleDescargarPDF(lista)}>
                                                <Download size={15} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Eliminar" withArrow>
                                            <ActionIcon variant="subtle" color="red" onClick={() => setDeleteConfirm(lista)}>
                                                <Trash2 size={15} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            {total > 1 && (
                <Group justify="center">
                    <Pagination value={page} onChange={setPage} total={total} />
                </Group>
            )}

            {/* ── Modal Create/Edit Lista ─────────────────────────────────── */}
            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={<Text fw={700}>{editTarget ? 'Editar lista' : 'Nueva lista de precios'}</Text>}
                size="sm"
                centered
            >
                <form onSubmit={handleSubmitLista}>
                    <Stack gap="md">
                        <TextInput
                            label="Nombre"
                            placeholder="Ej: Kiosco Escuela San Martín"
                            {...listaForm.getInputProps('nombre')}
                        />
                        <TextInput
                            label="URL del logo (opcional)"
                            placeholder="https://..."
                            {...listaForm.getInputProps('logo_url')}
                        />
                        <Group justify="flex-end" mt="sm">
                            <Button variant="subtle" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" loading={saving}>{editTarget ? 'Guardar' : 'Crear'}</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            {/* ── Delete Confirm ───────────────────────────────────────────── */}
            <Modal
                opened={!!deleteConfirm}
                onClose={() => setDeleteConfirm(null)}
                title={<Text fw={700} c="red">Eliminar lista de precios</Text>}
                size="sm"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        ¿Eliminar la lista <strong>{deleteConfirm?.nombre}</strong>?
                        Se eliminarán todos los productos y descuentos asociados.
                        Esta acción no se puede deshacer.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
                        <Button color="red" onClick={handleDelete}>Eliminar</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
