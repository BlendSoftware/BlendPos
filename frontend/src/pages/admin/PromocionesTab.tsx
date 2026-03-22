import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Stack, Group, Button, Text, Badge, Table, ActionIcon, Tooltip,
    Modal, TextInput, Textarea, Select, NumberInput, MultiSelect,
    Skeleton, Alert, Paper, Divider, SegmentedControl, Box, CloseButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, Edit, Trash2, Tag, AlertCircle } from 'lucide-react';
import {
    listarPromociones, crearPromocion, actualizarPromocion, eliminarPromocion,
    TIPO_OPTIONS,
    type PromocionResponse, type TipoPromocion, type ModoPromocion, type TipoSeleccion,
} from '../../services/api/promociones';
import { listarProductos, type ProductoResponse } from '../../services/api/products';
import { listarCategorias, type CategoriaResponse } from '../../services/api/categorias';
import { formatARS } from '../../utils/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null): string {
    if (!d) return '';

    if (typeof d === 'string') {
        const raw = d.trim();
        if (!raw) return '';

        // Already ISO date (or ISO datetime)
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

        // Common typed format in es-AR inputs: DD/MM/YYYY
        const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (ddmmyyyy) {
            const [, dd, mm, yyyy] = ddmmyyyy;
            return `${yyyy}-${mm}-${dd}`;
        }

        // Fallback for parseable date strings.
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
        return '';
    }

    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function tipoBadge(tipo: TipoPromocion) {
    if (tipo === 'porcentaje') return <Badge color="blue" size="sm" variant="dot">%</Badge>;
    if (tipo === 'precio_fijo_combo') return <Badge color="green" size="sm" variant="dot">Combo $</Badge>;
    return <Badge color="violet" size="sm" variant="dot">$</Badge>;
}

function formatValor(tipo: TipoPromocion, valor: number) {
    return tipo === 'porcentaje' ? `${valor}%` : formatARS(valor);
}

function formatFecha(iso: string) {
    try {
        return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return iso; }
}

// ── Form types ────────────────────────────────────────────────────────────────

interface GrupoFormValues {
    nombre:            string;
    orden:             number;
    cantidadRequerida: number;
    tipoSeleccion:     TipoSeleccion;
    categoriaId:       string | null;
    productoIds:       string[];
}

const EMPTY_GRUPO: GrupoFormValues = {
    nombre: '', orden: 0, cantidadRequerida: 1,
    tipoSeleccion: 'productos', categoriaId: null, productoIds: [],
};

interface FormValues {
    nombre:             string;
    descripcion:        string;
    tipo:               TipoPromocion;
    valor:              number;
    modo:               ModoPromocion;
    cantidadRequerida:  number;
    fechaInicio:        Date | string | null;
    fechaFin:           Date | string | null;
    activa:             boolean;
    productoIds:        string[];
    grupos:             GrupoFormValues[];
}

const EMPTY_FORM: FormValues = {
    nombre: '', descripcion: '', tipo: 'porcentaje', valor: 0,
    modo: 'clasico',
    cantidadRequerida: 1,
    fechaInicio: null, fechaFin: null, activa: true, productoIds: [],
    grupos: [],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PromocionesTab() {
    const [promociones, setPromociones] = useState<PromocionResponse[]>([]);
    const [productos,   setProductos]   = useState<ProductoResponse[]>([]);
    const [categorias,  setCategorias]  = useState<CategoriaResponse[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [apiError,    setApiError]    = useState<string | null>(null);
    const [modalOpen,   setModalOpen]   = useState(false);
    const [editTarget,  setEditTarget]  = useState<PromocionResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<PromocionResponse | null>(null);
    const [saving,      setSaving]      = useState(false);
    const [deleting,    setDeleting]    = useState(false);

    const form = useForm<FormValues>({
        initialValues: EMPTY_FORM,
        validate: {
            nombre: (v) => v.trim().length < 2 ? 'Minimo 2 caracteres' : null,
            valor:  (v) => v <= 0 ? 'El valor debe ser mayor a 0' : null,
            tipo:   (v) => !v ? 'Selecciona un tipo' : null,
            fechaInicio: (v) => !v ? 'Requerida' : null,
            fechaFin:    (v, vals) => {
                if (!v) return 'Requerida';
                const finStr   = toDateStr(v as Date | null);
                const inicioStr = vals.fechaInicio ? toDateStr(vals.fechaInicio as Date | null) : null;
                if (inicioStr && finStr && finStr <= inicioStr) return 'Debe ser posterior a la fecha de inicio';
                return null;
            },
            productoIds: (v, vals) => {
                if (vals.modo === 'grupos') return null;
                return v.length === 0 ? 'Selecciona al menos un producto' : null;
            },
            grupos: {
                nombre: (v, _vals, path) => {
                    // Only validate when modo=grupos
                    const rootVals = form.values;
                    if (rootVals.modo !== 'grupos') return null;
                    // nombre is optional but if set, check length
                    if (v && v.trim().length > 0 && v.trim().length < 2) return 'Minimo 2 caracteres';
                    // Check path to know which group this is
                    void path;
                    return null;
                },
                productoIds: (v, _vals, path) => {
                    const rootVals = form.values;
                    if (rootVals.modo !== 'grupos') return null;
                    // Get the group index from the path
                    const match = path.match(/grupos\.(\d+)\./);
                    if (!match) return null;
                    const idx = parseInt(match[1], 10);
                    const grupo = rootVals.grupos[idx];
                    if (!grupo) return null;
                    if (grupo.tipoSeleccion === 'productos' && (!v || v.length === 0)) {
                        return 'Selecciona al menos un producto';
                    }
                    return null;
                },
                categoriaId: (v, _vals, path) => {
                    const rootVals = form.values;
                    if (rootVals.modo !== 'grupos') return null;
                    const match = path.match(/grupos\.(\d+)\./);
                    if (!match) return null;
                    const idx = parseInt(match[1], 10);
                    const grupo = rootVals.grupos[idx];
                    if (!grupo) return null;
                    if (grupo.tipoSeleccion === 'categoria' && !v) {
                        return 'Selecciona una categoria';
                    }
                    return null;
                },
            },
        },
    });

    // ── Data loading ──────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        setApiError(null);
        try {
            const [promoRes, prodRes, catRes] = await Promise.allSettled([
                listarPromociones(),
                listarProductos({ limit: 500 }),
                listarCategorias(),
            ]);
            if (promoRes.status === 'fulfilled') setPromociones(promoRes.value);
            else setApiError('Error al cargar promociones');
            if (prodRes.status === 'fulfilled') setProductos(prodRes.value.data.filter(p => p.activo));
            if (catRes.status === 'fulfilled') setCategorias(catRes.value.filter(c => c.activo));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const productoOptions = useMemo(() =>
        productos.map(p => ({ value: p.id, label: `${p.nombre} — ${formatARS(p.precio_venta)}` })),
    [productos]);

    const categoriaOptions = useMemo(() =>
        categorias.map(c => ({ value: c.id, label: c.nombre })),
    [categorias]);

    // ── Modal helpers ─────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditTarget(null);
        form.setValues(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (p: PromocionResponse) => {
        setEditTarget(p);
        const modo: ModoPromocion = p.modo ?? 'clasico';
        const grupos: GrupoFormValues[] = (p.grupos ?? []).map((g) => ({
            nombre:            g.nombre,
            orden:             g.orden,
            cantidadRequerida: g.cantidad_requerida ?? 1,
            tipoSeleccion:     (g.tipo_seleccion ?? 'productos') as TipoSeleccion,
            categoriaId:       g.categoria_id ?? null,
            productoIds:       g.productos.map((pr) => pr.id),
        }));

        form.setValues({
            nombre:            p.nombre,
            descripcion:       p.descripcion ?? '',
            tipo:              p.tipo,
            valor:             p.valor,
            modo,
            cantidadRequerida: p.cantidad_requerida ?? 1,
            fechaInicio:       p.fecha_inicio.slice(0, 10),
            fechaFin:          p.fecha_fin.slice(0, 10),
            activa:            p.activa,
            productoIds:       p.productos.map(pr => pr.id),
            grupos,
        });
        setModalOpen(true);
    };

    // ── Group management ──────────────────────────────────────────────────────
    const addGrupo = () => {
        const currentGrupos = form.values.grupos;
        form.setFieldValue('grupos', [
            ...currentGrupos,
            { ...EMPTY_GRUPO, orden: currentGrupos.length },
        ]);
    };

    const removeGrupo = (index: number) => {
        const currentGrupos = [...form.values.grupos];
        currentGrupos.splice(index, 1);
        // Reindex orden
        currentGrupos.forEach((g, i) => { g.orden = i; });
        form.setFieldValue('grupos', currentGrupos);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (values: FormValues) => {
        // Extra validation for grupos mode
        if (values.modo === 'grupos' && values.grupos.length < 2) {
            notifications.show({ color: 'red', message: 'Se necesitan al menos 2 grupos para una promo por grupos' });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                nombre:            values.nombre.trim(),
                descripcion:       values.descripcion.trim() || undefined,
                tipo:              values.tipo,
                valor:             values.valor,
                modo:              values.modo,
                cantidad_requerida: Math.max(1, values.cantidadRequerida),
                fecha_inicio:      toDateStr(values.fechaInicio),
                fecha_fin:         toDateStr(values.fechaFin),
                activa:            values.activa,
                producto_ids:      values.modo === 'clasico' ? values.productoIds : [],
                grupos:            values.modo === 'grupos'
                    ? values.grupos.map((g, i) => ({
                        nombre:             g.nombre,
                        orden:              i,
                        cantidad_requerida: Math.max(1, g.cantidadRequerida),
                        tipo_seleccion:     g.tipoSeleccion,
                        categoria_id:       g.tipoSeleccion === 'categoria' ? (g.categoriaId ?? undefined) : undefined,
                        producto_ids:       g.productoIds,
                    }))
                    : undefined,
            };

            if (editTarget) {
                await actualizarPromocion(editTarget.id, { ...payload, activa: values.activa });
                notifications.show({ color: 'teal', message: 'Promocion actualizada' });
            } else {
                await crearPromocion(payload);
                notifications.show({ color: 'teal', message: 'Promocion creada' });
            }
            setModalOpen(false);
            await fetchData();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al guardar';
            notifications.show({ color: 'red', message: msg });
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await eliminarPromocion(deleteTarget.id);
            notifications.show({ color: 'teal', message: 'Promocion eliminada' });
            setDeleteTarget(null);
            await fetchData();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al eliminar';
            notifications.show({ color: 'red', message: msg });
        } finally {
            setDeleting(false);
        }
    };

    // ── Render helpers ────────────────────────────────────────────────────────
    const renderProductosBadge = (p: PromocionResponse) => {
        if (p.modo === 'grupos' && p.grupos && p.grupos.length > 0) {
            return (
                <Badge variant="outline" size="sm" color="cyan">
                    {p.grupos.length} grupo{p.grupos.length !== 1 ? 's' : ''}
                </Badge>
            );
        }
        return (
            <Badge variant="outline" size="sm">
                {p.productos.length} producto{p.productos.length !== 1 ? 's' : ''}
            </Badge>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">Promociones</Text>
                    <Text size="sm" c="dimmed">{promociones.filter(p => p.activa).length} activas de {promociones.length} total</Text>
                </div>
                <Button leftSection={<Plus size={15} />} onClick={openCreate}>
                    Nueva promocion
                </Button>
            </Group>

            {apiError && (
                <Alert color="red" icon={<AlertCircle size={16} />} variant="light">{apiError}</Alert>
            )}

            {loading ? (
                <Stack gap="xs">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={44} radius="sm" />)}
                </Stack>
            ) : promociones.length === 0 ? (
                <Paper withBorder radius="md" p="xl" ta="center">
                    <Tag size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <Text c="dimmed" size="sm">No hay promociones creadas todavia</Text>
                    <Button mt="sm" leftSection={<Plus size={14} />} onClick={openCreate} variant="light">
                        Crear primera promocion
                    </Button>
                </Paper>
            ) : (
                <Table.ScrollContainer minWidth={700}>
                    <Table highlightOnHover verticalSpacing="sm" striped>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Nombre</Table.Th>
                                <Table.Th>Tipo</Table.Th>
                                <Table.Th>Descuento</Table.Th>
                                <Table.Th>Vigencia</Table.Th>
                                <Table.Th>Productos</Table.Th>
                                <Table.Th style={{ width: 80 }}></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {promociones.map(p => (
                                <Table.Tr key={p.id}>
                                    <Table.Td>
                                        <Group gap={6}>
                                            <Text fw={500}>{p.nombre}</Text>
                                            {p.modo === 'grupos' && (
                                                <Badge size="xs" variant="light" color="cyan">grupos</Badge>
                                            )}
                                        </Group>
                                        {p.descripcion && <Text size="xs" c="dimmed">{p.descripcion}</Text>}
                                    </Table.Td>
                                    <Table.Td>{tipoBadge(p.tipo)}</Table.Td>
                                    <Table.Td>
                                        <Text fw={600}>{formatValor(p.tipo, p.valor)}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{formatFecha(p.fecha_inicio)}</Text>
                                        <Text size="xs" c="dimmed">hasta {formatFecha(p.fecha_fin)}</Text>
                                    </Table.Td>
                                    <Table.Td>{renderProductosBadge(p)}</Table.Td>
                                    <Table.Td>
                                        <Group gap={4} justify="flex-end">
                                            <Tooltip label="Editar">
                                                <ActionIcon variant="subtle" onClick={() => openEdit(p)}>
                                                    <Edit size={14} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Eliminar">
                                                <ActionIcon variant="subtle" color="red" onClick={() => setDeleteTarget(p)}>
                                                    <Trash2 size={14} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}

            {/* ── Create / Edit Modal ────────────────────────────────────── */}
            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={<Text fw={700}>{editTarget ? 'Editar promocion' : 'Nueva promocion'}</Text>}
                size="lg"
                centered
            >
                <form onSubmit={form.onSubmit((v) => void handleSubmit(v))}>
                    <Stack gap="md">
                        <TextInput
                            label="Nombre"
                            placeholder="Ej: Descuento verano, 2x1 bebidas..."
                            {...form.getInputProps('nombre')}
                        />
                        <Textarea
                            label="Descripcion (opcional)"
                            placeholder="Detalles de la promocion..."
                            autosize
                            minRows={2}
                            maxRows={4}
                            {...form.getInputProps('descripcion')}
                        />

                        <Divider label="Descuento" labelPosition="left" />

                        <Group grow>
                            <Select
                                label="Tipo de descuento"
                                data={TIPO_OPTIONS}
                                {...form.getInputProps('tipo')}
                            />
                            <NumberInput
                                label={
                                    form.values.tipo === 'porcentaje'
                                        ? 'Descuento (%)'
                                        : form.values.tipo === 'precio_fijo_combo'
                                            ? 'Precio del combo ($)'
                                            : 'Monto a descontar ($)'
                                }
                                placeholder={
                                    form.values.tipo === 'porcentaje' ? 'Ej: 15'
                                    : form.values.tipo === 'precio_fijo_combo' ? 'Ej: 1500'
                                    : 'Ej: 500'
                                }
                                min={0}
                                max={form.values.tipo === 'porcentaje' ? 100 : undefined}
                                decimalScale={2}
                                prefix={form.values.tipo !== 'porcentaje' ? '$' : undefined}
                                suffix={form.values.tipo === 'porcentaje' ? '%' : undefined}
                                {...form.getInputProps('valor')}
                                onChange={(v) => form.setFieldValue('valor', typeof v === 'number' ? v : parseFloat(String(v)) || 0)}
                            />
                        </Group>

                        <Divider label="Vigencia" labelPosition="left" />

                        <Group grow>
                            <DateInput
                                label="Fecha de inicio"
                                placeholder="dd/mm/aaaa"
                                valueFormat="DD/MM/YYYY"
                                {...form.getInputProps('fechaInicio')}
                                onChange={(v) => form.setFieldValue('fechaInicio', v)}
                            />
                            <DateInput
                                label="Fecha de fin"
                                placeholder="dd/mm/aaaa"
                                valueFormat="DD/MM/YYYY"
                                minDate={form.values.fechaInicio ?? undefined}
                                {...form.getInputProps('fechaFin')}
                                onChange={(v) => form.setFieldValue('fechaFin', v)}
                            />
                        </Group>

                        <Divider label="Productos" labelPosition="left" />

                        <SegmentedControl
                            fullWidth
                            data={[
                                { value: 'clasico', label: 'Clasico' },
                                { value: 'grupos',  label: 'Por grupos' },
                            ]}
                            {...form.getInputProps('modo')}
                        />

                        {form.values.modo === 'clasico' ? (
                            <>
                                <MultiSelect
                                    label="Productos"
                                    placeholder="Selecciona uno o mas productos"
                                    data={productoOptions}
                                    searchable
                                    clearable
                                    maxDropdownHeight={220}
                                    {...form.getInputProps('productoIds')}
                                />

                                <NumberInput
                                    label="Unidades minimas para activar"
                                    description="Usa 2 para una promo 2x1, 3 para 3x1, etc."
                                    min={1}
                                    max={99}
                                    allowDecimal={false}
                                    {...form.getInputProps('cantidadRequerida')}
                                    onChange={(v) => form.setFieldValue('cantidadRequerida', typeof v === 'number' ? v : 1)}
                                />
                            </>
                        ) : (
                            <Stack gap="sm">
                                {form.values.grupos.map((grupo, idx) => (
                                    <Paper key={idx} withBorder p="sm" radius="sm">
                                        <Stack gap="xs">
                                            <Group justify="space-between">
                                                <Text size="sm" fw={600}>Grupo {idx + 1}</Text>
                                                <CloseButton
                                                    size="sm"
                                                    onClick={() => removeGrupo(idx)}
                                                    aria-label="Eliminar grupo"
                                                />
                                            </Group>

                                            <TextInput
                                                label="Nombre del grupo"
                                                placeholder="Ej: Jugos, Obleas, etc."
                                                size="xs"
                                                {...form.getInputProps(`grupos.${idx}.nombre`)}
                                            />

                                            <Group grow>
                                                <NumberInput
                                                    label="Cantidad requerida"
                                                    min={1}
                                                    max={99}
                                                    allowDecimal={false}
                                                    size="xs"
                                                    {...form.getInputProps(`grupos.${idx}.cantidadRequerida`)}
                                                    onChange={(v) =>
                                                        form.setFieldValue(
                                                            `grupos.${idx}.cantidadRequerida`,
                                                            typeof v === 'number' ? v : 1,
                                                        )
                                                    }
                                                />
                                                <Box>
                                                    <Text size="xs" fw={500} mb={4}>Seleccion por</Text>
                                                    <SegmentedControl
                                                        fullWidth
                                                        size="xs"
                                                        data={[
                                                            { value: 'productos', label: 'Productos' },
                                                            { value: 'categoria', label: 'Categoria' },
                                                        ]}
                                                        {...form.getInputProps(`grupos.${idx}.tipoSeleccion`)}
                                                    />
                                                </Box>
                                            </Group>

                                            {grupo.tipoSeleccion === 'productos' ? (
                                                <MultiSelect
                                                    label="Productos del grupo"
                                                    placeholder="Selecciona productos"
                                                    data={productoOptions}
                                                    searchable
                                                    clearable
                                                    maxDropdownHeight={180}
                                                    size="xs"
                                                    {...form.getInputProps(`grupos.${idx}.productoIds`)}
                                                />
                                            ) : (
                                                <Select
                                                    label="Categoria"
                                                    placeholder="Selecciona una categoria"
                                                    data={categoriaOptions}
                                                    searchable
                                                    clearable
                                                    size="xs"
                                                    {...form.getInputProps(`grupos.${idx}.categoriaId`)}
                                                />
                                            )}
                                        </Stack>
                                    </Paper>
                                ))}

                                <Button
                                    variant="light"
                                    leftSection={<Plus size={14} />}
                                    onClick={addGrupo}
                                    size="xs"
                                >
                                    Agregar grupo
                                </Button>

                                {form.values.grupos.length > 0 && form.values.grupos.length < 2 && (
                                    <Alert color="yellow" variant="light" icon={<AlertCircle size={14} />}>
                                        Se necesitan al menos 2 grupos para una promocion por grupos
                                    </Alert>
                                )}
                            </Stack>
                        )}

                        {editTarget && (
                            <Select
                                label="Estado"
                                data={[
                                    { value: 'true',  label: 'Activa' },
                                    { value: 'false', label: 'Inactiva' },
                                ]}
                                value={form.values.activa ? 'true' : 'false'}
                                onChange={(v) => form.setFieldValue('activa', v === 'true')}
                            />
                        )}

                        <Group justify="flex-end" mt="xs">
                            <Button variant="subtle" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" loading={saving}>
                                {editTarget ? 'Guardar cambios' : 'Crear promocion'}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            {/* ── Delete Confirmation Modal ──────────────────────────────── */}
            <Modal
                opened={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title={<Text fw={700}>Eliminar promocion</Text>}
                size="sm"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        Eliminar <strong>{deleteTarget?.nombre}</strong>? Esta accion no se puede deshacer.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button color="red" loading={deleting} onClick={() => void handleDelete()}>
                            Eliminar
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
