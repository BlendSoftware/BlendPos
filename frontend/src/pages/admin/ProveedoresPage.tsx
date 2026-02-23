import { Fragment, useState, useCallback, useMemo, useEffect } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Modal, Tabs,
    Table, Paper, Badge, ActionIcon, Tooltip, Divider, Alert,
    List, Skeleton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Dropzone, type FileWithPath } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { Plus, Edit, Upload, CheckCircle, X, ChevronDown, ChevronUp, Search, Trash2 } from 'lucide-react';
import {
    listarProveedores, crearProveedor, actualizarProveedor, importarCSV,
    type ProveedorResponse,
} from '../../services/api/proveedores';
import type { IProveedor, IContactoProveedor, IFilaPrecioCSV } from '../../types';

// Mapper ProveedorResponse → IProveedor
function mapProveedor(p: ProveedorResponse): IProveedor {
    const contactos: IContactoProveedor[] = [];
    if (p.telefono || p.email) {
        contactos.push({ nombre: 'Contacto', telefono: p.telefono ?? '', email: p.email ?? '' });
    }
    return { id: p.id, razonSocial: p.razon_social, cuit: p.cuit, direccion: p.direccion ?? '', contactos, activo: p.activo, creadoEn: '' };
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): IFilaPrecioCSV[] {
    const lines = text.trim().split('\n').slice(1); // skip header
    return lines.map((line): IFilaPrecioCSV => {
        const [codigo, nombre, precioNuevoStr] = line.split(',').map((s) => s.trim());
        const precioNuevo = parseFloat(precioNuevoStr);
        const valido = Boolean(codigo && nombre && !isNaN(precioNuevo) && precioNuevo > 0);
        return {
            codigoBarras: codigo ?? '',
            nombre: nombre ?? '',
            precioActual: 1000, // mock: vendría del backend
            precioNuevo: valido ? precioNuevo : 0,
            diferencia: valido ? precioNuevo - 1000 : 0,
            valido,
            error: !valido ? 'Fila inválida' : undefined,
        };
    });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<IProveedor[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<IProveedor | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);

    // CSV
    const [csvPreview, setCsvPreview] = useState<IFilaPrecioCSV[] | null>(null);
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvFile, setCsvFile] = useState<FileWithPath | null>(null);

    const fetchProveedores = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listarProveedores();
            setProveedores(data.map(mapProveedor));
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error al cargar proveedores', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProveedores(); }, [fetchProveedores]);

    const filtered = useMemo(() => {
        if (!busqueda.trim()) return proveedores;
        const q = busqueda.toLowerCase();
        return proveedores.filter(
            (p) => p.razonSocial.toLowerCase().includes(q) || p.cuit.includes(q)
        );
    }, [proveedores, busqueda]);

    const form = useForm({
        initialValues: {
            razonSocial: '', cuit: '', direccion: '',
            contactoNombre: '', telefonos: [''], contactoEmail: '',
        },
        validate: {
            razonSocial: (v) => (v.trim().length >= 3 ? null : 'Requerido'),
            cuit: (v) => (/^\d{2}-\d{8}-\d$/.test(v) ? null : 'Formato: 30-12345678-9'),
        },
    });

    const openCreate = () => {
        setEditTarget(null);
        form.reset();
        form.setFieldValue('telefonos', ['']);
        setModalOpen(true);
    };

    const openEdit = (p: IProveedor) => {
        setEditTarget(p);
        const c = p.contactos[0];
        // Split existing telefono on " / " to restore dynamic list
        const telefonos = c?.telefono ? c.telefono.split(' / ').filter(Boolean) : [''];
        form.setValues({
            razonSocial: p.razonSocial, cuit: p.cuit, direccion: p.direccion,
            contactoNombre: c?.nombre ?? '', telefonos: telefonos.length > 0 ? telefonos : [''], contactoEmail: c?.email ?? '',
        });
        setModalOpen(true);
    };

    const handleSubmit = form.onSubmit(async (values) => {
        const telefonoJoined = values.telefonos.filter((t) => t.trim()).join(' / ');
        const req = {
            razon_social: values.razonSocial,
            cuit: values.cuit,
            direccion: values.direccion || undefined,
            telefono: telefonoJoined || undefined,
            email: values.contactoEmail || undefined,
        };
        try {
            if (editTarget) {
                await actualizarProveedor(editTarget.id, req);
                notifications.show({ title: 'Proveedor actualizado', message: values.razonSocial, color: 'blue' });
            } else {
                await crearProveedor(req);
                notifications.show({ title: 'Proveedor creado', message: values.razonSocial, color: 'teal' });
            }
            setModalOpen(false);
            await fetchProveedores();
        } catch (err) {
            notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    });

    // CSV drop
    const onDrop = useCallback((files: FileWithPath[]) => {
        const file = files[0];
        if (!file) return;
        setCsvFile(file);
        setCsvLoading(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const filas = parseCSV(text);
            setCsvPreview(filas);
            setCsvLoading(false);
        };
        reader.readAsText(file);
    }, []);

    const aplicarCSV = async () => {
        // Use the first proveedor as target for CSV import, or require selection
        if (!csvFile) return;
        const provId = editTarget?.id ?? proveedores[0]?.id;
        if (!provId) { notifications.show({ title: 'Sin proveedor', message: 'Seleccione un proveedor primero', color: 'yellow' }); return; }
        try {
            const resp = await importarCSV(provId, csvFile);
            notifications.show({ title: 'CSV importado', message: `${resp.procesadas} productos actualizados, ${resp.errores} errores.`, color: 'teal' });
            setCsvPreview(null);
            setCsvFile(null);
        } catch (err) {
            notifications.show({ title: 'Error CSV', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        }
    };

    return (
        <Stack gap="xl">
            <Group justify="space-between">
                <div>
                    <Title order={2} fw={800}>Proveedores</Title>
                    <Text c="dimmed" size="sm">{proveedores.filter((p) => p.activo).length} activos</Text>
                </div>
                <Button leftSection={<Plus size={16} />} onClick={openCreate}>Nuevo proveedor</Button>
            </Group>

            <TextInput
                placeholder="Buscar por razón social o CUIT..."
                leftSection={<Search size={14} />}
                value={busqueda}
                onChange={(e) => setBusqueda(e.currentTarget.value)}
                style={{ maxWidth: 360 }}
                rightSection={busqueda ? <ActionIcon size="sm" variant="subtle" onClick={() => setBusqueda('')}><X size={12} /></ActionIcon> : null}
            />

            <Tabs defaultValue="lista">
                <Tabs.List>
                    <Tabs.Tab value="lista">Lista de proveedores</Tabs.Tab>
                    <Tabs.Tab value="csv" leftSection={<Upload size={14} />}>Importar precios CSV</Tabs.Tab>
                </Tabs.List>

                {/* ── Tab: Lista ────────────────────────────────────────── */}
                <Tabs.Panel value="lista" pt="lg">
                    <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                        <Table verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Razón Social</Table.Th>
                                    <Table.Th>CUIT</Table.Th>
                                    <Table.Th>Dirección</Table.Th>
                                    <Table.Th>Contactos</Table.Th>
                                    <Table.Th>Estado</Table.Th>
                                    <Table.Th>Acciones</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <Table.Tr key={i}>
                                            {Array.from({ length: 6 }).map((__, j) => (
                                                <Table.Td key={j}><Skeleton height={20} radius="sm" /></Table.Td>
                                            ))}
                                        </Table.Tr>
                                    ))
                                ) : filtered.map((p) => (
                                    <Fragment key={p.id}>
                                        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                                            <Table.Td>
                                                <Group gap="xs">
                                                    {expandedId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    <Text size="sm" fw={500}>{p.razonSocial}</Text>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td><Text size="xs" ff="monospace">{p.cuit}</Text></Table.Td>
                                            <Table.Td><Text size="xs" c="dimmed">{p.direccion}</Text></Table.Td>
                                            <Table.Td>
                                                <Badge size="sm" variant="outline">{p.contactos.length}</Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Badge color={p.activo ? 'teal' : 'gray'} size="sm" variant="light">
                                                    {p.activo ? 'Activo' : 'Inactivo'}
                                                </Badge>
                                            </Table.Td>
                                            <Table.Td>
                                                <Tooltip label="Editar" withArrow>
                                                    <ActionIcon variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                                                        <Edit size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Table.Td>
                                        </Table.Tr>
                                        {expandedId === p.id && p.contactos.length > 0 && (
                                            <Table.Tr key={`${p.id}-contacts`}>
                                                <Table.Td colSpan={6} style={{ background: 'var(--mantine-color-dark-7)', padding: '12px 24px' }}>
                                                    <Text size="xs" fw={600} mb="xs" c="dimmed">CONTACTOS</Text>
                                                    <List size="sm" spacing={4}>
                                                        {p.contactos.map((c, i) => (
                                                            <List.Item key={i}>
                                                                <strong>{c.nombre}</strong>{c.cargo ? ` (${c.cargo})` : ''} — {c.telefono} — {c.email}
                                                            </List.Item>
                                                        ))}
                                                    </List>
                                                </Table.Td>
                                            </Table.Tr>
                                        )}
                                    </Fragment>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </Tabs.Panel>

                {/* ── Tab: CSV ────────────────────────────────────────────── */}
                <Tabs.Panel value="csv" pt="lg">
                    <Stack gap="md">
                        <Alert color="blue" variant="light">
                            El CSV acepta dos formatos (con encabezado en la primera fila):<br />
                            • <strong>codigo_barras,nombre,precio_nuevo</strong> — precio de venta simplificado<br />
                            • <strong>codigo_barras,nombre,precio_costo,precio_venta</strong> — precios completos
                        </Alert>

                        {!csvPreview ? (
                            <Dropzone
                                onDrop={onDrop}
                                accept={['text/csv', '.csv']}
                                loading={csvLoading}
                                maxSize={2 * 1024 * 1024}
                                style={{ background: 'var(--mantine-color-dark-8)', border: '2px dashed var(--mantine-color-dark-4)' }}
                            >
                                <Stack align="center" gap="xs" py="xl">
                                    <Upload size={36} color="var(--mantine-color-dimmed)" />
                                    <Text size="sm" fw={500}>Arrastrá el CSV aquí o hacé click</Text>
                                    <Text size="xs" c="dimmed">Solo archivos .csv — máx 2MB</Text>
                                </Stack>
                            </Dropzone>
                        ) : (
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Text fw={600}>
                                        Vista previa: {csvPreview.filter((f) => f.valido).length} válidas / {csvPreview.length} filas
                                    </Text>
                                    <Group gap="sm">
                                        <Button variant="subtle" leftSection={<X size={14} />} onClick={() => setCsvPreview(null)}>
                                            Cancelar
                                        </Button>
                                        <Button leftSection={<CheckCircle size={14} />} onClick={aplicarCSV}>
                                            Aplicar {csvPreview.filter((f) => f.valido).length} cambios
                                        </Button>
                                    </Group>
                                </Group>

                                <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                                    <Table verticalSpacing="xs">
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Código</Table.Th>
                                                <Table.Th>Nombre</Table.Th>
                                                <Table.Th>Precio actual</Table.Th>
                                                <Table.Th>Precio nuevo</Table.Th>
                                                <Table.Th>Diferencia</Table.Th>
                                                <Table.Th>Estado</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {csvPreview.map((fila, i) => (
                                                <Table.Tr key={i} style={{ opacity: fila.valido ? 1 : 0.5 }}>
                                                    <Table.Td><Text size="xs" ff="monospace">{fila.codigoBarras}</Text></Table.Td>
                                                    <Table.Td><Text size="sm">{fila.nombre}</Text></Table.Td>
                                                    <Table.Td><Text size="sm">${fila.precioActual.toFixed(2)}</Text></Table.Td>
                                                    <Table.Td><Text size="sm" fw={600}>${fila.precioNuevo.toFixed(2)}</Text></Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm" c={fila.diferencia > 0 ? 'red' : 'teal'}>
                                                            {fila.diferencia > 0 ? '+' : ''}{fila.diferencia.toFixed(2)}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {fila.valido
                                                            ? <Badge color="teal" size="xs">OK</Badge>
                                                            : <Badge color="red"  size="xs">Error: {fila.error}</Badge>
                                                        }
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </Paper>
                            </Stack>
                        )}
                    </Stack>
                </Tabs.Panel>
            </Tabs>

            {/* ── Modal Proveedor ─────────────────────────────────────────── */}
            <Modal
                opened={modalOpen}
                onClose={() => setModalOpen(false)}
                title={<Text fw={700}>{editTarget ? 'Editar proveedor' : 'Nuevo proveedor'}</Text>}
                size="md"
                centered
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput label="Razón Social" {...form.getInputProps('razonSocial')} />
                        <TextInput label="CUIT" placeholder="30-12345678-9" {...form.getInputProps('cuit')} />
                        <TextInput label="Dirección" {...form.getInputProps('direccion')} />
                        <Divider label="Contacto principal" labelPosition="left" />
                        <TextInput label="Nombre" {...form.getInputProps('contactoNombre')} />
                        <div>
                            <Text size="sm" fw={500} mb={4}>Teléfonos</Text>
                            <Stack gap="xs">
                                {form.values.telefonos.map((tel, idx) => (
                                    <Group key={idx} gap="xs">
                                        <TextInput
                                            placeholder={`Teléfono ${idx + 1}`}
                                            style={{ flex: 1 }}
                                            value={tel}
                                            onChange={(e) => {
                                                const updated = [...form.values.telefonos];
                                                updated[idx] = e.currentTarget.value;
                                                form.setFieldValue('telefonos', updated);
                                            }}
                                        />
                                        {form.values.telefonos.length > 1 && (
                                            <ActionIcon
                                                color="red" variant="subtle" size="sm"
                                                onClick={() => {
                                                    const updated = form.values.telefonos.filter((_, i) => i !== idx);
                                                    form.setFieldValue('telefonos', updated);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </ActionIcon>
                                        )}
                                    </Group>
                                ))}
                                <Button
                                    variant="subtle" size="xs" leftSection={<Plus size={12} />}
                                    onClick={() => form.setFieldValue('telefonos', [...form.values.telefonos, ''])}
                                >
                                    Agregar teléfono
                                </Button>
                            </Stack>
                        </div>
                        <TextInput label="Email" placeholder="contacto@empresa.com" {...form.getInputProps('contactoEmail')} />
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
