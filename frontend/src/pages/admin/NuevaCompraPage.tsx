import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Stack, Title, Text, Group, Button, TextInput, Textarea,
    Select, NumberInput, Paper, ActionIcon, Tooltip, Divider,
    Grid, SimpleGrid, Anchor, Breadcrumbs,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { Plus, Trash2, ChevronLeft, Save } from 'lucide-react';
import { crearCompra, type CompraItemRequest, type MetodoPago, type PagoCompraRequest } from '../../services/api/compras';
import { listarProveedores, type ProveedorResponse } from '../../services/api/proveedores';

// ── Constants ─────────────────────────────────────────────────────────────────

const METODO_PAGO_OPTIONS: { value: MetodoPago; label: string }[] = [
    { value: 'efectivo',         label: 'Efectivo'          },
    { value: 'transferencia',    label: 'Transferencia'     },
    { value: 'cheque',           label: 'Cheque'            },
    { value: 'tarjeta_debito',   label: 'Tarjeta débito'   },
    { value: 'tarjeta_credito',  label: 'Tarjeta crédito'  },
    { value: 'cuenta_corriente', label: 'Cuenta corriente' },
    { value: 'otro',             label: 'Otro'              },
];

const IMPUESTO_OPTIONS = [
    { value: '0',    label: '0%'    },
    { value: '10.5', label: '10.5%' },
    { value: '21',   label: '21%'   },
];

const DEPOSITO_OPTIONS = [
    { value: 'Principal',   label: 'Principal'   },
    { value: 'Secundario',  label: 'Secundario'  },
    { value: 'Depósito 3',  label: 'Depósito 3'  },
];

// ── Row type ──────────────────────────────────────────────────────────────────

interface PagoRow {
    key:        number;
    metodo:     MetodoPago;
    monto:      number;
    referencia: string;
}

interface ItemRow {
    key:          number;
    nombre:       string;
    precio:       number;
    descuento:    number;
    impuesto:     string;   // "0" | "10.5" | "21"
    cantidad:     number;
    observaciones: string;
}

function calcLineTotal(row: ItemRow) {
    const base     = row.precio * row.cantidad;
    const descMon  = base * (row.descuento / 100);
    const impMon   = (base - descMon) * (parseFloat(row.impuesto) / 100);
    return Math.max(0, base - descMon + impMon);
}

function fmt(n: number) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function toDateStr(d: Date | null): string {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NuevaCompraPage() {
    const navigate = useNavigate();

    // Header fields
    const [numero,           setNumero]         = useState('');
    const [fechaCompra,      setFechaCompra]    = useState<Date | null>(new Date());
    const [fechaVence,       setFechaVence]     = useState<Date | null>(null);
    const [moneda,           setMoneda]         = useState('ARS');
    const [deposito,         setDeposito]       = useState<string | null>('Principal');
    const [notas,            setNotas]          = useState('');

    // Proveedor section
    const [proveedores,      setProveedores]    = useState<ProveedorResponse[]>([]);
    const [proveedorId,      setProveedorId]    = useState<string | null>(null);
    const [cuit,             setCuit]           = useState('');
    const [telefono,         setTelefono]       = useState('');
    const [telefonoOptions,  setTelefonoOptions] = useState<{ value: string; label: string }[]>([]);

    // Items
    const [items, setItems] = useState<ItemRow[]>([
        { key: 1, nombre: '', precio: 0, descuento: 0, impuesto: '21', cantidad: 1, observaciones: '' },
    ]);
    const [nextKey, setNextKey] = useState(2);

    // Pagos
    const [pagos, setPagos]       = useState<PagoRow[]>([]);
    const [nextPagoKey, setNextPagoKey] = useState(1);

    // Saving
    const [saving, setSaving] = useState(false);

    // ── Load proveedores ──────────────────────────────────────────────────────
    useEffect(() => {
        listarProveedores().then(res => {
            setProveedores(res.filter(p => p.activo !== false));
        }).catch(() => {});
    }, []);

    // Auto-fill CUIT + teléfono when proveedor selected
    useEffect(() => {
        const prov = proveedores.find(p => p.id === proveedorId);
        if (prov) {
            setCuit(prov.cuit ?? '');
            // Build phone options from all contacts
            const phones = (prov.contactos ?? []).map(c => ({
                value: c.telefono ?? '',
                label: c.telefono ? `${c.nombre}: ${c.telefono}` : c.nombre,
            })).filter(o => o.value);
            // Fallback to legacy field
            if (phones.length === 0 && prov.telefono) {
                phones.push({ value: prov.telefono, label: prov.telefono });
            }
            setTelefonoOptions(phones);
            setTelefono(phones[0]?.value ?? prov.telefono ?? '');
        } else {
            setCuit('');
            setTelefono('');
            setTelefonoOptions([]);
        }
    }, [proveedorId, proveedores]);

    const proveedorData = useMemo(() =>
        proveedores.map(p => ({ value: p.id, label: p.razon_social })),
    [proveedores]);

    // ── Item helpers ──────────────────────────────────────────────────────────
    const addRow = useCallback(() => {
        setItems(prev => [...prev, {
            key: nextKey, nombre: '', precio: 0, descuento: 0,
            impuesto: '21', cantidad: 1, observaciones: '',
        }]);
        setNextKey(k => k + 1);
    }, [nextKey]);

    const removeRow = useCallback((key: number) => {
        setItems(prev => prev.filter(r => r.key !== key));
    }, []);

    const updateRow = useCallback(<K extends keyof ItemRow>(key: number, field: K, value: ItemRow[K]) => {
        setItems(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
    }, []);

    // ── Totals ────────────────────────────────────────────────────────────────
    const { subtotal, descuento, total } = useMemo(() => {
        let sub = 0, desc = 0;
        for (const row of items) {
            const base    = row.precio * row.cantidad;
            const descMon = base * (row.descuento / 100);
            const impMon  = (base - descMon) * (parseFloat(row.impuesto) / 100);
            sub  += base + impMon;
            desc += descMon;
        }
        return { subtotal: sub, descuento: desc, total: sub - desc };
    }, [items]);

    const totalPagado = useMemo(() => pagos.reduce((s, p) => s + p.monto, 0), [pagos]);

    // ── Pago helpers ──────────────────────────────────────────────────────────
    const addPago = useCallback(() => {
        setPagos(prev => [...prev, { key: nextPagoKey, metodo: 'efectivo', monto: 0, referencia: '' }]);
        setNextPagoKey(k => k + 1);
    }, [nextPagoKey]);

    const removePago = useCallback((key: number) => {
        setPagos(prev => prev.filter(p => p.key !== key));
    }, []);

    const updatePago = useCallback(<K extends keyof PagoRow>(key: number, field: K, value: PagoRow[K]) => {
        setPagos(prev => prev.map(p => p.key === key ? { ...p, [field]: value } : p));
    }, []);

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleGuardar = async () => {
        if (!proveedorId) {
            notifications.show({ color: 'yellow', message: 'Seleccioná un proveedor' });
            return;
        }
        if (!fechaCompra) {
            notifications.show({ color: 'yellow', message: 'Ingresá la fecha de compra' });
            return;
        }
        const validItems = items.filter(r => r.nombre.trim() !== '' || r.precio > 0);
        if (validItems.length === 0) {
            notifications.show({ color: 'yellow', message: 'Agregá al menos un producto' });
            return;
        }

        setSaving(true);
        try {
            const payload: import('../../services/api/compras').CrearCompraRequest = {
                numero:            numero.trim() || undefined,
                proveedor_id:      proveedorId,
                fecha_compra:      toDateStr(fechaCompra),
                fecha_vencimiento: fechaVence ? toDateStr(fechaVence) : undefined,
                moneda:            moneda.trim() || 'ARS',
                deposito:          deposito ?? undefined,
                notas:             notas.trim() || undefined,
                items:             validItems.map(r => ({
                    nombre_producto: r.nombre,
                    precio:          r.precio,
                    descuento_pct:   r.descuento,
                    impuesto_pct:    parseFloat(r.impuesto),
                    cantidad:        r.cantidad,
                    observaciones:   r.observaciones.trim() || undefined,
                } as CompraItemRequest)),
                pagos: pagos
                    .filter(p => p.monto > 0)
                    .map(p => ({
                        metodo:     p.metodo,
                        monto:      p.monto,
                        referencia: p.referencia.trim() || undefined,
                    } as PagoCompraRequest)),
            };

            await crearCompra(payload);
            notifications.show({ color: 'teal', message: 'Compra guardada correctamente' });
            navigate('/admin/proveedores?tab=compras');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al guardar la compra';
            notifications.show({ color: 'red', message: msg });
        } finally {
            setSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Stack gap="lg" p="md">
            {/* Breadcrumb */}
            <Breadcrumbs>
                <Anchor onClick={() => navigate('/admin/proveedores?tab=compras')} size="sm" style={{ cursor: 'pointer' }}>
                    <Group gap={4}><ChevronLeft size={14} /> Compras</Group>
                </Anchor>
                <Text size="sm">Nueva compra</Text>
            </Breadcrumbs>

            {/* Page title */}
            <Group justify="space-between" align="flex-start">
                <Title order={2}>Nueva compra</Title>
            </Group>

            <Grid gutter="md">
                {/* ── Left / Main column ─────────────────────────────────── */}
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Stack gap="md">

                        {/* Factura N° + Fecha compra */}
                        <Paper withBorder radius="md" p="md">
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                <TextInput
                                    label="Factura N°"
                                    placeholder="Ej: FAC-0001"
                                    value={numero}
                                    onChange={e => setNumero(e.currentTarget.value)}
                                />
                                <DateInput
                                    label="Fecha de compra"
                                    placeholder="dd/mm/aaaa"
                                    valueFormat="DD/MM/YYYY"
                                    value={fechaCompra}
                                    onChange={(v) => setFechaCompra(v ? new Date(v) : null)}
                                />
                            </SimpleGrid>
                        </Paper>

                        {/* Información general */}
                        <Paper withBorder radius="md" p="md">
                            <Stack gap="sm">
                                <Text fw={600} size="sm">Información general</Text>
                                <Divider />
                                <Grid>
                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <Select
                                            label="Proveedor"
                                            placeholder="Seleccionar proveedor"
                                            searchable
                                            data={proveedorData}
                                            value={proveedorId}
                                            onChange={setProveedorId}
                                            required
                                        />
                                    </Grid.Col>
                                    <Grid.Col span={{ base: 12, sm: 3 }}>
                                        <TextInput
                                            label="Identificación (CUIT)"
                                            value={cuit}
                                            readOnly
                                            placeholder="Auto"
                                            styles={{ input: { backgroundColor: 'var(--mantine-color-default-hover)' } }}
                                        />
                                    </Grid.Col>
                                    <Grid.Col span={{ base: 12, sm: 3 }}>
                                        {telefonoOptions.length > 1 ? (
                                            <Select
                                                label="Teléfono"
                                                data={telefonoOptions}
                                                value={telefono}
                                                onChange={v => setTelefono(v ?? '')}
                                                searchable
                                                allowDeselect={false}
                                            />
                                        ) : (
                                            <TextInput
                                                label="Teléfono"
                                                value={telefono}
                                                onChange={e => setTelefono(e.currentTarget.value)}
                                                placeholder="Opcional"
                                            />
                                        )}
                                    </Grid.Col>
                                    <Grid.Col span={{ base: 12, sm: 3 }}>
                                        <TextInput
                                            label="Moneda"
                                            value={moneda}
                                            onChange={e => setMoneda(e.currentTarget.value)}
                                            placeholder="ARS"
                                        />
                                    </Grid.Col>
                                    <Grid.Col span={{ base: 12, sm: 3 }}>
                                        <DateInput
                                            label="Fecha vencimiento"
                                            placeholder="dd/mm/aaaa"
                                            valueFormat="DD/MM/YYYY"
                                            clearable
                                            value={fechaVence}
                                            onChange={(v) => setFechaVence(v ? new Date(v) : null)}
                                        />
                                    </Grid.Col>
                                    <Grid.Col span={{ base: 12, sm: 3 }}>
                                        <Select
                                            label="Depósito"
                                            placeholder="Seleccionar"
                                            data={DEPOSITO_OPTIONS}
                                            value={deposito}
                                            onChange={setDeposito}
                                        />
                                    </Grid.Col>
                                </Grid>
                            </Stack>
                        </Paper>

                        {/* Productos */}
                        <Paper withBorder radius="md" p="md">
                            <Stack gap="sm">
                                <Text fw={600} size="sm">Productos comprados</Text>
                                <Divider />

                                {/* Header row */}
                                <Grid align="center" style={{ borderBottom: '1px solid var(--mantine-color-default-border)', paddingBottom: '0.5rem' }}>
                                    <Grid.Col span={3}><Text size="xs" fw={600} c="dimmed">Producto</Text></Grid.Col>
                                    <Grid.Col span={2}><Text size="xs" fw={600} c="dimmed">Precio</Text></Grid.Col>
                                    <Grid.Col span={1}><Text size="xs" fw={600} c="dimmed">Desc.%</Text></Grid.Col>
                                    <Grid.Col span={2}><Text size="xs" fw={600} c="dimmed">Impuesto</Text></Grid.Col>
                                    <Grid.Col span={1}><Text size="xs" fw={600} c="dimmed">Cant.</Text></Grid.Col>
                                    <Grid.Col span={2}><Text size="xs" fw={600} c="dimmed">Obs.</Text></Grid.Col>
                                    <Grid.Col span={1} style={{ textAlign: 'right' }}><Text size="xs" fw={600} c="dimmed">Total</Text></Grid.Col>
                                </Grid>

                                {/* Item rows */}
                                {items.map(row => (
                                    <Grid key={row.key} align="center" gutter="xs">
                                        <Grid.Col span={3}>
                                            <TextInput
                                                placeholder="Nombre del producto"
                                                size="xs"
                                                value={row.nombre}
                                                onChange={e => updateRow(row.key, 'nombre', e.currentTarget.value)}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={2}>
                                            <NumberInput
                                                placeholder="0.00"
                                                size="xs"
                                                min={0}
                                                decimalScale={2}
                                                value={row.precio}
                                                onChange={v => updateRow(row.key, 'precio', typeof v === 'number' ? v : parseFloat(String(v)) || 0)}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={1}>
                                            <NumberInput
                                                placeholder="0"
                                                size="xs"
                                                min={0}
                                                max={100}
                                                decimalScale={1}
                                                value={row.descuento}
                                                onChange={v => updateRow(row.key, 'descuento', typeof v === 'number' ? v : parseFloat(String(v)) || 0)}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={2}>
                                            <Select
                                                size="xs"
                                                data={IMPUESTO_OPTIONS}
                                                value={row.impuesto}
                                                onChange={v => updateRow(row.key, 'impuesto', v ?? '21')}
                                                comboboxProps={{ withinPortal: true }}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={1}>
                                            <NumberInput
                                                placeholder="1"
                                                size="xs"
                                                min={1}
                                                allowDecimal={false}
                                                value={row.cantidad}
                                                onChange={v => updateRow(row.key, 'cantidad', typeof v === 'number' ? Math.max(1, v) : Math.max(1, parseInt(String(v)) || 1))}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={2}>
                                            <TextInput
                                                placeholder="Observación"
                                                size="xs"
                                                value={row.observaciones}
                                                onChange={e => updateRow(row.key, 'observaciones', e.currentTarget.value)}
                                            />
                                        </Grid.Col>
                                        <Grid.Col span={1}>
                                            <Group justify="flex-end" gap={4}>
                                                <Text size="xs" fw={600}>{fmt(calcLineTotal(row))}</Text>
                                                {items.length > 1 && (
                                                    <Tooltip label="Quitar fila">
                                                        <ActionIcon
                                                            size="xs"
                                                            color="red"
                                                            variant="subtle"
                                                            onClick={() => removeRow(row.key)}
                                                        >
                                                            <Trash2 size={12} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </Group>
                                        </Grid.Col>
                                    </Grid>
                                ))}

                                {/* Add row */}
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={<Plus size={14} />}
                                    onClick={addRow}
                                    justify="flex-start"
                                    w="fit-content"
                                >
                                    + Agregar producto
                                </Button>
                            </Stack>
                        </Paper>

                        {/* Notas */}
                        <Paper withBorder radius="md" p="md">
                            <Textarea
                                label="Notas"
                                placeholder="Observaciones de la compra..."
                                autosize
                                minRows={2}
                                maxRows={5}
                                value={notas}
                                onChange={e => setNotas(e.currentTarget.value)}
                            />
                        </Paper>

                    </Stack>
                </Grid.Col>

                {/* ── Right / Summary column ─────────────────────────────── */}
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder radius="md" p="md" pos="sticky" top={80}>
                        <Stack gap="sm">
                            <Text fw={600} size="sm">Resumen</Text>
                            <Divider />

                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Subtotal (c/imp.)</Text>
                                <Text size="sm" fw={500}>${fmt(subtotal)}</Text>
                            </Group>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">Descuento</Text>
                                <Text size="sm" fw={500} c="red">-${fmt(descuento)}</Text>
                            </Group>
                            <Divider />
                            <Group justify="space-between">
                                <Text fw={700}>Total</Text>
                                <Text fw={700} size="lg">${fmt(total)}</Text>
                            </Group>

                            <Divider mt="xs" />

                            <Button
                                leftSection={<Save size={16} />}
                                fullWidth
                                loading={saving}
                                onClick={() => void handleGuardar()}
                            >
                                Guardar compra
                            </Button>

                            <Divider mt="xs" />

                            {/* Pagos */}
                            <Group justify="space-between" align="center">
                                <Text fw={600} size="sm">Pagos</Text>
                                {pagos.length > 0 && total > 0 && (
                                    <Text size="xs" c={totalPagado >= total ? 'teal' : 'orange'} fw={600}>
                                        {totalPagado >= total ? 'Saldado' : `Resta $${fmt(total - totalPagado)}`}
                                    </Text>
                                )}
                            </Group>

                            {pagos.map((p, idx) => (
                                <Paper key={p.key} withBorder radius="sm" p="xs">
                                    <Stack gap={6}>
                                        <Group justify="space-between" align="center">
                                            <Text size="xs" fw={600} c="dimmed">PAGO {idx + 1}</Text>
                                            <ActionIcon size="xs" color="red" variant="subtle" onClick={() => removePago(p.key)}>
                                                <Trash2 size={12} />
                                            </ActionIcon>
                                        </Group>
                                        <Select
                                            size="xs"
                                            label="Método"
                                            data={METODO_PAGO_OPTIONS}
                                            value={p.metodo}
                                            onChange={(v) => updatePago(p.key, 'metodo', (v ?? 'efectivo') as MetodoPago)}
                                        />
                                        <NumberInput
                                            size="xs"
                                            label="Monto"
                                            prefix="$"
                                            min={0}
                                            decimalScale={2}
                                            thousandSeparator="."
                                            decimalSeparator=","
                                            value={p.monto}
                                            onChange={(v) => updatePago(p.key, 'monto', typeof v === 'number' ? v : parseFloat(String(v)) || 0)}
                                        />
                                        <TextInput
                                            size="xs"
                                            label="Referencia (opcional)"
                                            placeholder="N° cheque, CBU..."
                                            value={p.referencia}
                                            onChange={(e) => updatePago(p.key, 'referencia', e.currentTarget.value)}
                                        />
                                    </Stack>
                                </Paper>
                            ))}

                            {pagos.length > 0 && (
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Total pagado</Text>
                                    <Text size="sm" fw={600} c={totalPagado >= total ? 'teal' : 'orange'}>
                                        ${fmt(totalPagado)}
                                    </Text>
                                </Group>
                            )}

                            <Button
                                variant="light"
                                fullWidth
                                leftSection={<Plus size={14} />}
                                onClick={addPago}
                            >
                                + Agregar pago
                            </Button>

                            <Button
                                variant="subtle"
                                color="gray"
                                fullWidth
                                onClick={() => navigate('/admin/proveedores?tab=compras')}
                            >
                                Cancelar
                            </Button>
                        </Stack>
                    </Paper>
                </Grid.Col>
            </Grid>
        </Stack>
    );
}
