import { useState, useCallback, useEffect } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Modal, Table, Paper,
    ActionIcon, Tooltip, Skeleton, Textarea, Collapse, Badge,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, Edit, Trash2, Tag, Search, X, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import {
    listarCategorias, crearCategoria, actualizarCategoria, desactivarCategoria,
    type CategoriaResponse,
} from '../../services/api/categorias';

export function CategoriasPage() {
    const [categorias, setCategorias] = useState<CategoriaResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<CategoriaResponse | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<CategoriaResponse | null>(null);
    const [saving, setSaving] = useState(false);
    const [inactivosOpen, setInactivosOpen] = useState(false);

    const form = useForm({
        initialValues: { nombre: '', descripcion: '' },
        validate: {
            nombre: (v: string) => (v.trim().length >= 2 ? null : 'El nombre debe tener al menos 2 caracteres'),
        },
    });

    const fetchCategorias = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listarCategorias();
            setCategorias(data);
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error al cargar categorías', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCategorias(); }, [fetchCategorias]);

    const activas = categorias.filter((c) => c.activo);
    const inactivas = categorias.filter((c) => !c.activo);

    const filtered = busqueda.trim()
        ? activas.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
        : activas;

    const openCreate = () => {
        setEditTarget(null);
        form.reset();
        setModalOpen(true);
    };

    const openEdit = (c: CategoriaResponse) => {
        setEditTarget(c);
        form.setValues({ nombre: c.nombre, descripcion: c.descripcion ?? '' });
        setModalOpen(true);
    };

    const handleSubmit = form.onSubmit(async (values: { nombre: string; descripcion: string }) => {
        setSaving(true);
        try {
            const body = {
                nombre: values.nombre.trim(),
                descripcion: values.descripcion.trim() || undefined,
            };
            if (editTarget) {
                await actualizarCategoria(editTarget.id, body);
                notifications.show({ title: 'Categoría actualizada', message: body.nombre, color: 'blue' });
            } else {
                await crearCategoria(body);
                notifications.show({ title: 'Categoría creada', message: body.nombre, color: 'teal' });
            }
            setModalOpen(false);
            await fetchCategorias();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        } finally {
            setSaving(false);
        }
    });

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        try {
            await desactivarCategoria(deleteConfirm.id);
            notifications.show({ title: 'Categoría desactivada', message: deleteConfirm.nombre, color: 'gray' });
            setDeleteConfirm(null);
            await fetchCategorias();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    const handleReactivar = async (c: CategoriaResponse) => {
        try {
            await actualizarCategoria(c.id, { activo: true });
            notifications.show({ title: 'Categoría reactivada', message: c.nombre, color: 'teal' });
            await fetchCategorias();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    const activos = activas.length;

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Categorías</Title>
                    <Text c="dimmed" size="sm">{activos} activas · {inactivas.length} inactivas</Text>
                </div>
                <Button leftSection={<Plus size={16} />} onClick={openCreate}>Nueva categoría</Button>
            </Group>

            <TextInput
                placeholder="Buscar categoría..."
                leftSection={<Search size={14} />}
                value={busqueda}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusqueda(e.currentTarget.value)}
                style={{ maxWidth: 320 }}
                rightSection={busqueda ? <ActionIcon size="sm" variant="subtle" onClick={() => setBusqueda('')}><X size={12} /></ActionIcon> : null}
            />

            <Paper radius="md" withBorder style={{ overflow: 'hidden' }}>
                <Table verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Nombre</Table.Th>
                            <Table.Th>Descripción</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <Table.Tr key={i}>
                                    {Array.from({ length: 3 }).map((__, j) => (
                                        <Table.Td key={j}><Skeleton height={20} radius="sm" /></Table.Td>
                                    ))}
                                </Table.Tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <Table.Tr>
                                <Table.Td colSpan={3}>
                                    <Text ta="center" c="dimmed" py="xl" size="sm">
                                        {busqueda ? 'Sin resultados' : 'No hay categorías. Creá la primera.'}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ) : filtered.map((cat) => (
                            <Table.Tr key={cat.id}>
                                <Table.Td>
                                    <Group gap="xs">
                                        <Tag size={14} color="var(--mantine-color-blue-5)" />
                                        <Text size="sm" fw={500}>{cat.nombre}</Text>
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="xs" c="dimmed">{cat.descripcion || '—'}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4}>
                                        <Tooltip label="Editar" withArrow>
                                            <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(cat)}>
                                                <Edit size={15} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Eliminar" withArrow>
                                            <ActionIcon variant="subtle" color="red" onClick={() => setDeleteConfirm(cat)}>
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

            {/* ── Sección Inactivos ────────────────────────────────────────── */}
            {inactivas.length > 0 && (
                <Stack gap="xs">
                    <Group
                        gap="sm"
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setInactivosOpen((v) => !v)}
                    >
                        <ActionIcon variant="subtle" color="gray" size="sm">
                            {inactivosOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </ActionIcon>
                        <Text size="sm" fw={600} c="dimmed">Inactivos</Text>
                        <Badge size="sm" color="gray" variant="light">{inactivas.length}</Badge>
                    </Group>
                    <Collapse in={inactivosOpen}>
                        <Paper radius="md" withBorder style={{ overflow: 'hidden', opacity: 0.85 }}>
                            <Table verticalSpacing="sm">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Nombre</Table.Th>
                                        <Table.Th>Descripción</Table.Th>
                                        <Table.Th>Acciones</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {inactivas.map((cat) => (
                                        <Table.Tr key={cat.id}>
                                            <Table.Td>
                                                <Group gap="xs">
                                                    <Tag size={14} color="var(--mantine-color-gray-5)" />
                                                    <Text size="sm" c="dimmed">{cat.nombre}</Text>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="xs" c="dimmed">{cat.descripcion || '—'}</Text>
                                            </Table.Td>
                                            <Table.Td>
                                                <Tooltip label="Reactivar" withArrow>
                                                    <ActionIcon variant="subtle" color="teal" onClick={() => handleReactivar(cat)}>
                                                        <RotateCcw size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Paper>
                    </Collapse>
                </Stack>
            )}

            {/* ── Modal Create/Edit ────────────────────────────────────────── */}
            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={<Text fw={700}>{editTarget ? 'Editar categoría' : 'Nueva categoría'}</Text>}
                size="sm"
                centered
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label="Nombre"
                            placeholder="Ej: Bebidas, Lácteos, Limpieza..."
                            {...form.getInputProps('nombre')}
                        />
                        <Textarea
                            label="Descripción (opcional)"
                            placeholder="Breve descripción de la categoría"
                            rows={3}
                            {...form.getInputProps('descripcion')}
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
                title={<Text fw={700} c="red">Desactivar categoría</Text>}
                size="sm"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        ¿Desactivar la categoría <strong>{deleteConfirm?.nombre}</strong>?
                        Quedará en la sección <em>Inactivos</em> y podrás reactivarla cuando quieras.
                        Los productos asociados no se verán afectados.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="subtle" autoFocus onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
                        <Button color="red" onClick={handleDelete}>Desactivar</Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
