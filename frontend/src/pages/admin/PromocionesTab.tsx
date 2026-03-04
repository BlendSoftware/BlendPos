import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Stack, Group, Button, Text, Badge, Table, ActionIcon, Tooltip,
    Modal, TextInput, Textarea, Select, NumberInput, MultiSelect,
    Skeleton, Alert, Paper, Divider,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, Edit, Trash2, Tag, AlertCircle } from 'lucide-react';
import {
    listarPromociones, crearPromocion, actualizarPromocion, eliminarPromocion,
    type PromocionResponse, type TipoPromocion,
} from '../../services/api/promociones';
import { listarProductos, type ProductoResponse } from '../../services/api/products';
import { formatARS } from '../../utils/format';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPO_OPTIONS = [
    { value: 'porcentaje',  label: 'Porcentaje (%)'  },
    { value: 'monto_fijo',  label: 'Monto fijo ($)'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function estadoBadge(estado: string) {
    switch (estado) {
        case 'activa':    return <Badge color="teal"   size="sm" variant="light">Activa</Badge>;
        case 'pendiente': return <Badge color="yellow" size="sm" variant="light">Pendiente</Badge>;
        default:          return <Badge color="gray"   size="sm" variant="light">Vencida</Badge>;
    }
}

function tipoBadge(tipo: TipoPromocion) {
    return tipo === 'porcentaje'
        ? <Badge color="blue"   size="sm" variant="dot">%</Badge>
        : <Badge color="violet" size="sm" variant="dot">$</Badge>;
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

interface FormValues {
    nombre:             string;
    descripcion:        string;
    tipo:               TipoPromocion;
    valor:              number;
    cantidadRequerida:  number;
    fechaInicio:        Date | null;
    fechaFin:           Date | null;
    activa:             boolean;
    productoIds:        string[];
}

const EMPTY_FORM: FormValues = {
    nombre: '', descripcion: '', tipo: 'porcentaje', valor: 0,
    cantidadRequerida: 1,
    fechaInicio: null, fechaFin: null, activa: true, productoIds: [],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function PromocionesTab() {
    const [promociones, setPromociones] = useState<PromocionResponse[]>([]);
    const [productos,   setProductos]   = useState<ProductoResponse[]>([]);
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
            nombre: (v) => v.trim().length < 2 ? 'Mínimo 2 caracteres' : null,
            valor:  (v) => v <= 0 ? 'El valor debe ser mayor a 0' : null,
            tipo:   (v) => !v ? 'Seleccioná un tipo' : null,
            fechaInicio: (v) => !v ? 'Requerida' : null,
            fechaFin:    (v, vals) =>
                !v ? 'Requerida' : (vals.fechaInicio && v <= vals.fechaInicio) ? 'Debe ser posterior a la fecha de inicio' : null,
            productoIds: (v) => v.length === 0 ? 'Seleccioná al menos un producto' : null,
        },
    });

    // ── Data loading ──────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        setApiError(null);
        try {
            const [promoRes, prodRes] = await Promise.allSettled([
                listarPromociones(),
                listarProductos({ limit: 500 }),
            ]);
            if (promoRes.status === 'fulfilled') setPromociones(promoRes.value);
            else setApiError('Error al cargar promociones');
            if (prodRes.status === 'fulfilled') setProductos(prodRes.value.data.filter(p => p.activo));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const productoOptions = useMemo(() =>
        productos.map(p => ({ value: p.id, label: `${p.nombre} — ${formatARS(p.precio_venta)}` })),
    [productos]);

    // ── Modal helpers ─────────────────────────────────────────────────────────
    const openCreate = () => {
        setEditTarget(null);
        form.setValues(EMPTY_FORM);
        setModalOpen(true);
    };

    const openEdit = (p: PromocionResponse) => {
        setEditTarget(p);
        form.setValues({
            nombre:            p.nombre,
            descripcion:       p.descripcion ?? '',
            tipo:              p.tipo,
            valor:             p.valor,
            cantidadRequerida: p.cantidad_requerida ?? 1,
            fechaInicio:       new Date(p.fecha_inicio),
            fechaFin:          new Date(p.fecha_fin),
            activa:            p.activa,
            productoIds:       p.productos.map(pr => pr.id),
        });
        setModalOpen(true);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (values: FormValues) => {
        setSaving(true);
        try {
            const payload = {
                nombre:            values.nombre.trim(),
                descripcion:       values.descripcion.trim() || undefined,
                tipo:              values.tipo,
                valor:             values.valor,
                cantidad_requerida: values.productoIds.length === 1 ? Math.max(1, values.cantidadRequerida) : 1,
                fecha_inicio:      toDateStr(values.fechaInicio),
                fecha_fin:         toDateStr(values.fechaFin),
                activa:            values.activa,
                producto_ids:      values.productoIds,
            };

            if (editTarget) {
                await actualizarPromocion(editTarget.id, { ...payload, activa: values.activa });
                notifications.show({ color: 'teal', message: 'Promoción actualizada' });
            } else {
                await crearPromocion(payload);
                notifications.show({ color: 'teal', message: 'Promoción creada' });
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
            notifications.show({ color: 'teal', message: 'Promoción eliminada' });
            setDeleteTarget(null);
            await fetchData();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al eliminar';
            notifications.show({ color: 'red', message: msg });
        } finally {
            setDeleting(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <div>
                    <Text fw={700} size="lg">Promociones</Text>
                    <Text size="sm" c="dimmed">{promociones.filter(p => p.estado === 'activa').length} activas de {promociones.length} total</Text>
                </div>
                <Button leftSection={<Plus size={15} />} onClick={openCreate}>
                    Nueva promoción
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
                    <Text c="dimmed" size="sm">No hay promociones creadas todavía</Text>
                    <Button mt="sm" leftSection={<Plus size={14} />} onClick={openCreate} variant="light">
                        Crear primera promoción
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
                                <Table.Th>Estado</Table.Th>
                                <Table.Th style={{ width: 80 }}></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {promociones.map(p => (
                                <Table.Tr key={p.id}>
                                    <Table.Td>
                                        <Text fw={500}>{p.nombre}</Text>
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
                                    <Table.Td>
                                        <Badge variant="outline" size="sm">
                                            {p.productos.length} producto{p.productos.length !== 1 ? 's' : ''}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>{estadoBadge(p.estado)}</Table.Td>
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
                title={<Text fw={700}>{editTarget ? 'Editar promoción' : 'Nueva promoción'}</Text>}
                size="lg"
                centered
            >
                <form onSubmit={form.onSubmit((v) => void handleSubmit(v))}>
                    <Stack gap="md">
                        <TextInput
                            label="Nombre"
                            placeholder="Ej: Descuento verano, 2x1 bebidas…"
                            {...form.getInputProps('nombre')}
                        />
                        <Textarea
                            label="Descripción (opcional)"
                            placeholder="Detalles de la promoción…"
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
                                label={form.values.tipo === 'porcentaje' ? 'Descuento (%)' : 'Monto a descontar ($)'}
                                placeholder={form.values.tipo === 'porcentaje' ? 'Ej: 15' : 'Ej: 500'}
                                min={0}
                                max={form.values.tipo === 'porcentaje' ? 100 : undefined}
                                decimalScale={2}
                                prefix={form.values.tipo === 'monto_fijo' ? '$' : undefined}
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
                                onChange={(v) => form.setFieldValue('fechaInicio', v ? new Date(v) : null)}
                            />
                            <DateInput
                                label="Fecha de fin"
                                placeholder="dd/mm/aaaa"
                                valueFormat="DD/MM/YYYY"
                                minDate={form.values.fechaInicio ?? undefined}
                                {...form.getInputProps('fechaFin')}
                                onChange={(v) => form.setFieldValue('fechaFin', v ? new Date(v) : null)}
                            />
                        </Group>

                        <Divider label="Productos incluidos" labelPosition="left" />

                        <MultiSelect
                            label="Productos"
                            placeholder="Seleccioná uno o más productos"
                            data={productoOptions}
                            searchable
                            clearable
                            maxDropdownHeight={220}
                            {...form.getInputProps('productoIds')}
                        />

                        {/* Only relevant when a single product is selected — enables quantity promos (e.g. 2x1) */}
                        {form.values.productoIds.length === 1 && (
                            <NumberInput
                                label="Unidades mínimas para activar"
                                description="Cantidad de unidades del producto requeridas para que se aplique el descuento. Usá 2 para un 2×1, 3 para un 3×1, etc."
                                min={1}
                                max={99}
                                allowDecimal={false}
                                {...form.getInputProps('cantidadRequerida')}
                                onChange={(v) => form.setFieldValue('cantidadRequerida', typeof v === 'number' ? v : 1)}
                            />
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
                                {editTarget ? 'Guardar cambios' : 'Crear promoción'}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            {/* ── Delete Confirmation Modal ──────────────────────────────── */}
            <Modal
                opened={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title={<Text fw={700}>Eliminar promoción</Text>}
                size="sm"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        ¿Eliminar <strong>{deleteTarget?.nombre}</strong>? Esta acción no se puede deshacer.
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
