import { Fragment, useState, useCallback, useMemo, useEffect } from 'react';
import {
    Stack, Title, Text, Group, Button, TextInput, Modal, Tabs,
    Table, Paper, Badge, ActionIcon, Tooltip, Divider, Alert,
    List, Skeleton, Select,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { Dropzone, type FileWithPath } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { Plus, Edit, Upload, CheckCircle, X, ChevronDown, ChevronUp, Search, Trash2,
    Barcode, Copy, Hash, TrendingDown, FileText, AlertCircle, CheckSquare } from 'lucide-react';
import {
    listarProveedores, crearProveedor, actualizarProveedor, importarCSV,
    type ProveedorResponse, type CSVImportResponse,
} from '../../services/api/proveedores';
import type { IProveedor, IContactoProveedor } from '../../types';

// Mapper ProveedorResponse → IProveedor
function mapProveedor(p: ProveedorResponse): IProveedor {
    const contactos: IContactoProveedor[] = (p.contactos ?? []).map((c) => ({
        nombre: c.nombre,
        cargo: c.cargo,
        telefono: c.telefono ?? '',
        email: c.email ?? '',
    }));
    // Fallback: if API returns no contacts list but has legacy telefono/email fields
    if (contactos.length === 0 && (p.telefono || p.email)) {
        contactos.push({ nombre: 'Contacto', telefono: p.telefono ?? '', email: p.email ?? '' });
    }
    return { id: p.id, razonSocial: p.razon_social, cuit: p.cuit, direccion: p.direccion ?? '', contactos, activo: p.activo, creadoEn: '' };
}

// ── CSV error-code → icon mapping ────────────────────────────────────────────

const ERROR_ICONS: Record<string, React.ReactNode> = {
    BARCODE_MISSING:   <Barcode size={15} color="var(--mantine-color-red-5)" />,
    BARCODE_DUPLICATE: <Copy size={15} color="var(--mantine-color-orange-5)" />,
    PRICE_NOT_NUMBER:  <Hash size={15} color="var(--mantine-color-yellow-5)" />,
    PRICE_NEGATIVE:    <TrendingDown size={15} color="var(--mantine-color-red-5)" />,
    NAME_MISSING:      <FileText size={15} color="var(--mantine-color-orange-5)" />,
    ROW_FORMAT:        <AlertCircle size={15} color="var(--mantine-color-red-5)" />,
    READ_ERROR:        <AlertCircle size={15} color="var(--mantine-color-red-5)" />,
};

const ERROR_LABELS: Record<string, string> = {
    BARCODE_MISSING:   'Código de barras vacío',
    BARCODE_DUPLICATE: 'Código duplicado en el CSV',
    PRICE_NOT_NUMBER:  'El precio no es un número válido',
    PRICE_NEGATIVE:    'El precio no puede ser negativo',
    NAME_MISSING:      'Nombre del producto vacío',
    ROW_FORMAT:        'Formato de fila incorrecto',
    READ_ERROR:        'Error de lectura',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<IProveedor[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<IProveedor | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [loading, setLoading] = useState(true);

    // CSV
    const [csvFile, setCsvFile] = useState<FileWithPath | null>(null);
    const [csvLoading, setCsvLoading] = useState(false);
    const [importResult, setImportResult] = useState<CSVImportResponse | null>(null);
    const [csvProveedorId, setCsvProveedorId] = useState<string | null>(null);

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
            contactos: [{ nombre: '', cargo: '', telefono: '', email: '' }],
        },
        validate: {
            razonSocial: (v) => (v.trim().length >= 3 ? null : 'Requerido'),
            cuit: (v) => (/^\d{2}-\d{8}-\d$/.test(v) ? null : 'Formato: 30-12345678-9'),
        },
    });

    const openCreate = () => {
        setEditTarget(null);
        form.reset();
        form.setFieldValue('contactos', [{ nombre: '', cargo: '', telefono: '', email: '' }]);
        setModalOpen(true);
    };

    const openEdit = (p: IProveedor) => {
        setEditTarget(p);
        const contactos = p.contactos.length > 0
            ? p.contactos.map((c) => ({
                nombre: c.nombre,
                cargo: c.cargo ?? '',
                telefono: c.telefono,
                email: c.email,
            }))
            : [{ nombre: '', cargo: '', telefono: '', email: '' }];
        form.setValues({ razonSocial: p.razonSocial, cuit: p.cuit, direccion: p.direccion, contactos });
        setModalOpen(true);
    };

    const handleSubmit = form.onSubmit(async (values) => {
        const contactosPayload = values.contactos
            .filter((c) => c.nombre.trim())
            .map((c) => ({
                nombre: c.nombre.trim(),
                cargo: c.cargo?.trim() || undefined,
                telefono: c.telefono?.trim() || undefined,
                email: c.email?.trim() || undefined,
            }));
        // Legacy single telefono/email from first contact for backwards compatibility
        const firstContact = contactosPayload[0];
        const req = {
            razon_social: values.razonSocial,
            cuit: values.cuit,
            direccion: values.direccion || undefined,
            telefono: firstContact?.telefono || undefined,
            email: firstContact?.email || undefined,
            contactos: contactosPayload,
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

    // CSV drop — just store the file, no client-side preview
    const onDrop = useCallback((files: FileWithPath[]) => {
        const file = files[0];
        if (!file) return;
        setCsvFile(file);
        setImportResult(null);
    }, []);

    const aplicarCSV = async () => {
        if (!csvFile) return;
        const provId = csvProveedorId;
        if (!provId) {
            notifications.show({ title: 'Sin proveedor', message: 'Seleccioná un proveedor antes de importar', color: 'yellow' });
            return;
        }
        setCsvLoading(true);
        try {
            const resp = await importarCSV(provId, csvFile);
            setImportResult(resp);
            if (resp.errores === 0) {
                notifications.show({ title: 'CSV importado', message: `${resp.procesadas} productos actualizados sin errores.`, color: 'teal' });
            } else {
                notifications.show({ title: 'CSV importado con errores', message: `${resp.procesadas} actualizados · ${resp.errores} errores.`, color: 'orange' });
            }
            setCsvFile(null);
        } catch (err) {
            notifications.show({ title: 'Error CSV', message: err instanceof Error ? err.message : 'Error', color: 'red' });
        } finally {
            setCsvLoading(false);
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
                            El CSV debe tener el siguiente encabezado en la primera fila:<br />
                            <strong>codigo_barras,nombre,precio_desactualizado,precio_actualizado</strong><br />
                            <Text size="xs" c="dimmed" mt={4}>También se acepta: <em>codigo_barras,nombre,precio_costo,precio_venta</em></Text>
                        </Alert>

                        <Select
                            label="Proveedor"
                            placeholder="Seleccioná el proveedor para esta importación"
                            required
                            data={proveedores
                                .filter((p) => p.activo)
                                .map((p) => ({ value: p.id, label: p.razonSocial }))
                            }
                            value={csvProveedorId}
                            onChange={setCsvProveedorId}
                        />

                        {/* ── Upload zone or file selected ── */}
                        {!importResult && (
                            <>
                                <Dropzone
                                    onDrop={onDrop}
                                    accept={['text/csv', '.csv']}
                                    loading={csvLoading}
                                    maxSize={2 * 1024 * 1024}
                                    style={{ background: 'var(--mantine-color-dark-8)', border: '2px dashed var(--mantine-color-dark-4)' }}
                                >
                                    <Stack align="center" gap="xs" py="xl">
                                        <Upload size={36} color="var(--mantine-color-dimmed)" />
                                        {csvFile
                                            ? <Text size="sm" fw={600} c="teal">{csvFile.name}</Text>
                                            : <Text size="sm" fw={500}>Arrastrá el CSV aquí o hacé click</Text>
                                        }
                                        <Text size="xs" c="dimmed">Solo archivos .csv — máx 2MB</Text>
                                    </Stack>
                                </Dropzone>

                                {csvFile && (
                                    <Group justify="flex-end" gap="sm">
                                        <Button variant="subtle" leftSection={<X size={14} />} onClick={() => setCsvFile(null)}>
                                            Quitar archivo
                                        </Button>
                                        <Button leftSection={<CheckCircle size={14} />} loading={csvLoading} onClick={aplicarCSV}>
                                            Importar precios
                                        </Button>
                                    </Group>
                                )}
                            </>
                        )}

                        {/* ── Import result table ── */}
                        {importResult && (
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Group gap="sm">
                                        <Badge color="teal" size="md" variant="light">
                                            {importResult.procesadas} actualizados
                                        </Badge>
                                        {importResult.errores > 0 && (
                                            <Badge color="red" size="md" variant="light">
                                                {importResult.errores} errores
                                            </Badge>
                                        )}
                                    </Group>
                                    <Button
                                        variant="subtle" size="sm" leftSection={<Upload size={14} />}
                                        onClick={() => { setImportResult(null); setCsvFile(null); setCsvProveedorId(null); }}
                                    >
                                        Importar otro archivo
                                    </Button>
                                </Group>

                                {importResult.detalle_errores.length > 0 ? (
                                    <Paper radius="md" withBorder style={{ overflow: 'hidden', background: 'var(--mantine-color-dark-8)' }}>
                                        <Table verticalSpacing="xs">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th style={{ width: 60 }}>N° Fila</Table.Th>
                                                    <Table.Th>Código</Table.Th>
                                                    <Table.Th>Nombre</Table.Th>
                                                    <Table.Th style={{ width: 48 }}>Estado</Table.Th>
                                                    <Table.Th>Detalle</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {importResult.detalle_errores.map((err, i) => (
                                                    <Table.Tr key={i}>
                                                        <Table.Td>
                                                            <Text size="xs" ff="monospace" c="dimmed">{err.fila}</Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="xs" ff="monospace">{err.codigo_barras || '—'}</Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm">{err.nombre || '—'}</Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Tooltip
                                                                label={ERROR_LABELS[err.error_code] ?? err.error_code}
                                                                withArrow
                                                                position="top"
                                                            >
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}>
                                                                    {ERROR_ICONS[err.error_code] ?? <AlertCircle size={15} color="var(--mantine-color-red-5)" />}
                                                                </span>
                                                            </Tooltip>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="xs" c="dimmed">{err.motivo}</Text>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Paper>
                                ) : (
                                    <Alert color="teal" variant="light" icon={<CheckSquare size={16} />}>
                                        Todos los productos fueron actualizados correctamente.
                                    </Alert>
                                )}
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
                size="lg"
                centered
            >
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput label="Razón Social" {...form.getInputProps('razonSocial')} />
                        <TextInput label="CUIT" placeholder="30-12345678-9" {...form.getInputProps('cuit')} />
                        <TextInput label="Dirección" {...form.getInputProps('direccion')} />

                        <Divider label="Contactos" labelPosition="left" />

                        {form.values.contactos.map((_, idx) => (
                            <Paper key={idx} p="sm" radius="sm" withBorder style={{ background: 'var(--mantine-color-dark-7)' }}>
                                <Stack gap="xs">
                                    <Group justify="space-between" align="center">
                                        <Text size="xs" fw={600} c="dimmed">CONTACTO {idx + 1}</Text>
                                        {form.values.contactos.length > 1 && (
                                            <ActionIcon
                                                color="red" variant="subtle" size="sm"
                                                onClick={() => {
                                                    const updated = form.values.contactos.filter((_, i) => i !== idx);
                                                    form.setFieldValue('contactos', updated);
                                                }}
                                            >
                                                <Trash2 size={12} />
                                            </ActionIcon>
                                        )}
                                    </Group>
                                    <Group grow gap="xs">
                                        <TextInput
                                            label="Nombre"
                                            placeholder="Juan Pérez"
                                            value={form.values.contactos[idx].nombre}
                                            onChange={(e) => {
                                                const updated = [...form.values.contactos];
                                                updated[idx] = { ...updated[idx], nombre: e.currentTarget.value };
                                                form.setFieldValue('contactos', updated);
                                            }}
                                        />
                                        <TextInput
                                            label="Cargo (opcional)"
                                            placeholder="Ej: Ventas"
                                            value={form.values.contactos[idx].cargo}
                                            onChange={(e) => {
                                                const updated = [...form.values.contactos];
                                                updated[idx] = { ...updated[idx], cargo: e.currentTarget.value };
                                                form.setFieldValue('contactos', updated);
                                            }}
                                        />
                                    </Group>
                                    <Group grow gap="xs">
                                        <TextInput
                                            label="Teléfono"
                                            placeholder="11-1234-5678"
                                            value={form.values.contactos[idx].telefono}
                                            onChange={(e) => {
                                                const updated = [...form.values.contactos];
                                                updated[idx] = { ...updated[idx], telefono: e.currentTarget.value };
                                                form.setFieldValue('contactos', updated);
                                            }}
                                        />
                                        <TextInput
                                            label="Email"
                                            placeholder="contacto@empresa.com"
                                            value={form.values.contactos[idx].email}
                                            onChange={(e) => {
                                                const updated = [...form.values.contactos];
                                                updated[idx] = { ...updated[idx], email: e.currentTarget.value };
                                                form.setFieldValue('contactos', updated);
                                            }}
                                        />
                                    </Group>
                                </Stack>
                            </Paper>
                        ))}

                        <Button
                            variant="subtle" size="xs" leftSection={<Plus size={12} />}
                            onClick={() => form.setFieldValue('contactos', [...form.values.contactos, { nombre: '', cargo: '', telefono: '', email: '' }])}
                        >
                            Agregar contacto
                        </Button>

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
