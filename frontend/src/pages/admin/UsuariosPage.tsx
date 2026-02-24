import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Select, Table,
    Paper, Badge, ActionIcon, Tooltip, Modal, Skeleton, PasswordInput, Alert, Switch, NumberInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { Plus, Edit, Search, Power, PowerOff, AlertCircle } from 'lucide-react';
import {
    listarUsuarios, crearUsuario, actualizarUsuario, desactivarUsuario, reactivarUsuario,
    type UsuarioResponse,
} from '../../services/api/usuarios';
import type { IUser, Rol } from '../../types';

const ROL_COLOR: Record<Rol, string> = {
    admin: 'red', supervisor: 'yellow', cajero: 'teal',
};

function mapRolFE(backendRol: string): Rol {
    if (backendRol === 'administrador') return 'admin';
    if (backendRol === 'supervisor') return 'supervisor';
    return 'cajero';
}
function mapRolBE(frontendRol: Rol): 'cajero' | 'supervisor' | 'administrador' {
    if (frontendRol === 'admin') return 'administrador';
    if (frontendRol === 'supervisor') return 'supervisor';
    return 'cajero';
}
function mapUsuario(u: UsuarioResponse): IUser {
    return { id: u.id, nombre: u.nombre, email: u.email ?? '', rol: mapRolFE(u.rol), activo: u.activo, creadoEn: '', puntoDeVenta: u.punto_de_venta ?? undefined };
}

export function UsuariosPage() {
    const [usuarios, setUsuarios] = useState<IUser[]>([]);
    const [busqueda, setBusqueda] = useState('');
    const [mostrarInactivos, setMostrarInactivos] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<IUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState<string | null>(null);

    const fetchUsuarios = useCallback(async (inclInactivos = false) => {
        setLoading(true);
        setApiError(null);
        try {
            const data = await listarUsuarios(inclInactivos);
            setUsuarios(data.map(mapUsuario));
        } catch (err) {
            setApiError(err instanceof Error ? err.message : 'Error al cargar usuarios');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsuarios(mostrarInactivos); }, [fetchUsuarios, mostrarInactivos]);

    const filtered = useMemo(() => {
        if (!busqueda.trim()) return usuarios;
        const q = busqueda.toLowerCase();
        return usuarios.filter(
            (u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
    }, [usuarios, busqueda]);

    const form = useForm({
        initialValues: { nombre: '', username: '', email: '', password: '', rol: 'cajero' as Rol, activo: true, puntoDeVenta: '' as string },
        validate: {
            nombre:   (v) => (v.trim().length >= 3 ? null : 'Mínimo 3 caracteres'),
            username: (v, _vals) => (!editTarget && !v.trim() ? 'Requerido' : null),
            password: (v, _vals) => {
                if (editTarget && !v) return null; // Al editar, password es opcional
                if (!editTarget && v.length < 8) return 'Mínimo 8 caracteres';
                if (v.length > 0 && v.length < 8) return 'Mínimo 8 caracteres';
                if (v.length >= 8) {
                    const hasUpper = /[A-Z]/.test(v);
                    const hasLower = /[a-z]/.test(v);
                    const hasNumber = /[0-9]/.test(v);
                    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(v);
                    if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
                        return 'Debe contener mayúsculas, minúsculas, números y símbolos';
                    }
                }
                return null;
            },
        },
    });

    const openCreate = () => {
        setEditTarget(null);
        form.reset();
        setModalOpen(true);
    };

    const openEdit = (u: IUser) => {
        setEditTarget(u);
        form.setValues({ nombre: u.nombre, username: '', email: u.email, password: '', rol: u.rol, activo: u.activo, puntoDeVenta: u.puntoDeVenta != null ? String(u.puntoDeVenta) : '' });
        setModalOpen(true);
    };

    const handleSubmit = form.onSubmit(async (values) => {
        try {
            const pdv = values.puntoDeVenta ? parseInt(values.puntoDeVenta) : undefined;
            if (editTarget) {
                const payload: any = {
                    nombre: values.nombre,
                    rol: mapRolBE(values.rol),
                    punto_de_venta: pdv,
                };
                // Solo enviar email y password si fueron modificados
                if (values.email && values.email !== editTarget.email) payload.email = values.email;
                if (values.password) payload.password = values.password;
                await actualizarUsuario(editTarget.id, payload);
                notifications.show({ title: 'Usuario actualizado', message: values.nombre, color: 'blue' });
            } else {
                await crearUsuario({
                    username: values.username,
                    nombre: values.nombre,
                    email: values.email || undefined,
                    password: values.password,
                    rol: mapRolBE(values.rol),
                    punto_de_venta: pdv,
                });
                notifications.show({ title: 'Usuario creado', message: values.nombre, color: 'teal' });
            }
            setModalOpen(false);
            await fetchUsuarios(mostrarInactivos);
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    });

    const toggleActivo = async (id: string) => {
        const u = usuarios.find((x) => x.id === id);
        if (!u) return;
        try {
            if (u.activo) {
                await desactivarUsuario(id);
            } else {
                await reactivarUsuario(id);
            }
            setUsuarios((prev) => prev.map((x) => x.id === id ? { ...x, activo: !x.activo } : x));
            notifications.show({
                title: u.activo ? 'Usuario desactivado' : 'Usuario reactivado',
                message: u.nombre, color: u.activo ? 'gray' : 'teal',
            });
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Usuarios</Title>
                    <Text c="dimmed" size="sm">{usuarios.filter((u) => u.activo).length} activos · {usuarios.length} total</Text>
                </div>
                <Group gap="sm">
                    <Switch
                        label="Mostrar inactivos"
                        checked={mostrarInactivos}
                        onChange={(e) => setMostrarInactivos(e.currentTarget.checked)}
                    />
                    <Button leftSection={<Plus size={16} />} onClick={openCreate}>Nuevo usuario</Button>
                </Group>
            </Group>

            {apiError && <Alert color="red" icon={<AlertCircle size={16} />} variant="light">{apiError}</Alert>}

            <TextInput
                placeholder="Buscar por nombre o email..."
                leftSection={<Search size={14} />}
                value={busqueda}
                onChange={(e) => setBusqueda(e.currentTarget.value)}
                style={{ maxWidth: 360 }}
            />

            <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                <Table highlightOnHover verticalSpacing="sm">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Nombre</Table.Th>
                            <Table.Th>Email</Table.Th>
                            <Table.Th>Rol</Table.Th>
                            <Table.Th>Estado</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {loading
                            ? Array.from({ length: 4 }).map((_, i) => (
                                <Table.Tr key={i}>
                                    {[1, 2, 3, 4, 5].map((j) => (
                                        <Table.Td key={j}><Skeleton h={20} radius="sm" /></Table.Td>
                                    ))}
                                </Table.Tr>
                            ))
                            : filtered.map((u) => (
                            <Table.Tr key={u.id} style={{ opacity: u.activo ? 1 : 0.5 }}>
                                <Table.Td><Text size="sm" fw={500}>{u.nombre}</Text></Table.Td>
                                <Table.Td><Text size="sm" c="dimmed">{u.email || '—'}</Text></Table.Td>
                                <Table.Td>
                                    <Badge color={ROL_COLOR[u.rol]} size="sm" variant="light">{u.rol}</Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Badge color={u.activo ? 'teal' : 'gray'} size="sm" variant="light">
                                        {u.activo ? 'Activo' : 'Inactivo'}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4}>
                                        <Tooltip label="Editar" withArrow>
                                            <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(u)}>
                                                <Edit size={15} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label={u.activo ? 'Desactivar' : 'Activar'} withArrow>
                                            <ActionIcon
                                                variant="subtle"
                                                color={u.activo ? 'gray' : 'teal'}
                                                onClick={() => toggleActivo(u.id)}
                                            >
                                                {u.activo ? <PowerOff size={15} /> : <Power size={15} />}
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={<Text fw={700}>{editTarget ? 'Editar usuario' : 'Nuevo usuario'}</Text>}
                size="sm"
                centered
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput label="Nombre completo" {...form.getInputProps('nombre')} />
                        {!editTarget && (
                            <TextInput label="Username" placeholder="ej: cajero01" {...form.getInputProps('username')} />
                        )}
                        <TextInput label="Email (opcional)" {...form.getInputProps('email')} />
                        <PasswordInput
                            label={editTarget ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
                            {...form.getInputProps('password')}
                        />
                        <Select
                            label="Rol"
                            data={[
                                { value: 'admin',      label: 'Administrador' },
                                { value: 'supervisor', label: 'Supervisor' },
                                { value: 'cajero',     label: 'Cajero' },
                            ]}
                            {...form.getInputProps('rol')}
                        />
                        <NumberInput
                            label="Punto de Venta (opcional)"
                            description="Número de terminal asignada a este usuario (solo cajeros)"
                            placeholder="Ej: 1, 2, 3..."
                            min={1}
                            max={99}
                            value={form.values.puntoDeVenta === '' ? '' : Number(form.values.puntoDeVenta)}
                            onChange={(val) => form.setFieldValue('puntoDeVenta', val === '' ? '' : String(val))}
                        />
                        <Group justify="flex-end" mt="sm">
                            <Button variant="subtle" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button type="submit">{editTarget ? 'Guardar' : 'Crear'}</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Stack>
    );
}