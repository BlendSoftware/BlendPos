import { useState, useEffect, useRef } from 'react';
import {
    Stack, Title, Text, Group, Paper, Badge, Button, TextInput,
    Select, Alert, Loader, Divider, Box, ThemeIcon, SimpleGrid,
    Card, Tooltip, Anchor,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
    ShieldCheck, AlertTriangle, Check, Upload, FileKey, FileBadge,
    RefreshCw, ExternalLink, BookOpen, Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    getConfiguracionFiscal,
    updateConfiguracionFiscal,
    type ConfiguracionFiscalResponse,
} from '../../services/api/configuracion_fiscal';

// ─────────────────────────────────────────────────────────────────────────────

interface FormValues {
    cuit_emisor: string;
    razon_social: string;
    condicion_fiscal: string;
    punto_de_venta: string;
    modo: string;
    fecha_inicio_actividades: string;
    iibb: string;
    domicilio_comercial: string;
    domicilio_ciudad: string;
    domicilio_provincia: string;
    domicilio_codigo_postal: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export function ConfiguracionFiscalPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [certStatus, setCertStatus] = useState({ crt: false, key: false });
    const [afipResponse, setAfipResponse] = useState<{ ok: boolean; message: string; hint?: string } | null>(null);

    const crtInputRef = useRef<HTMLInputElement>(null);
    const keyInputRef = useRef<HTMLInputElement>(null);
    const [crtFile, setCrtFile] = useState<File | null>(null);
    const [keyFile, setKeyFile] = useState<File | null>(null);

    const form = useForm<FormValues>({
        initialValues: {
            cuit_emisor: '',
            razon_social: '',
            condicion_fiscal: 'Monotributo',
            punto_de_venta: '1',
            modo: 'homologacion',
            fecha_inicio_actividades: '',
            iibb: '',
            domicilio_comercial: '',
            domicilio_ciudad: '',
            domicilio_provincia: '',
            domicilio_codigo_postal: '',
        },
        validate: {
            cuit_emisor: (v) => (!v ? 'El CUIT es obligatorio' : null),
            razon_social: (v) => (!v ? 'La razón social es obligatoria' : null),
            punto_de_venta: (v) => (!v || Number(v) <= 0 ? 'El punto de venta debe ser un número positivo' : null),
        },
    });

    // Load existing config from backend
    useEffect(() => {
        getConfiguracionFiscal()
            .then((cfg) => {
                if (cfg.cuit_emisor) {
                    form.setValues({
                        cuit_emisor: cfg.cuit_emisor ?? '',
                        razon_social: cfg.razon_social ?? '',
                        condicion_fiscal: cfg.condicion_fiscal ?? 'Monotributo',
                        punto_de_venta: String(cfg.punto_de_venta ?? 1),
                        modo: cfg.modo ?? 'homologacion',
                        fecha_inicio_actividades: cfg.fecha_inicio_actividades ?? '',
                        iibb: cfg.iibb ?? '',
                        domicilio_comercial: cfg.domicilio_comercial ?? '',
                        domicilio_ciudad: cfg.domicilio_ciudad ?? '',
                        domicilio_provincia: cfg.domicilio_provincia ?? '',
                        domicilio_codigo_postal: cfg.domicilio_codigo_postal ?? '',
                    });
                    setCertStatus({ crt: cfg.tiene_certificado_crt, key: cfg.tiene_certificado_key });
                }
            })
            .catch(() => { /* first setup — empty state is ok */ })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (values: FormValues) => {
        setSaving(true);
        setAfipResponse(null);
        try {
            const result = await updateConfiguracionFiscal(
                {
                    cuit_emisor: values.cuit_emisor,
                    razon_social: values.razon_social,
                    condicion_fiscal: values.condicion_fiscal,
                    punto_de_venta: Number(values.punto_de_venta),
                    modo: values.modo,
                    fecha_inicio_actividades: values.fecha_inicio_actividades || undefined,
                    iibb: values.iibb || undefined,
                    domicilio_comercial: values.domicilio_comercial || undefined,
                    domicilio_ciudad: values.domicilio_ciudad || undefined,
                    domicilio_provincia: values.domicilio_provincia || undefined,
                    domicilio_codigo_postal: values.domicilio_codigo_postal || undefined,
                },
                crtFile,
                keyFile,
            );
            if (crtFile) setCertStatus((s) => ({ ...s, crt: true }));
            if (keyFile) setCertStatus((s) => ({ ...s, key: true }));

            if (result.afip_warning) {
                setAfipResponse({
                    ok: false,
                    message: result.afip_warning,
                    hint: 'Verificá que el certificado esté registrado en ARCA y asociado al servicio "wsfe". Podés reintentar una vez que el certificado esté activo.',
                });
                notifications.show({ title: 'Guardado con advertencia AFIP', message: result.afip_warning, color: 'orange', icon: <AlertTriangle size={14} /> });
            } else {
                setAfipResponse({ ok: true, message: 'Configuración guardada y AFIP notificado correctamente.' });
                notifications.show({ title: 'Guardado', message: 'Configuración fiscal actualizada', color: 'teal', icon: <Check size={14} /> });
            }
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { data?: string; message?: string } } })?.response?.data?.data
                ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'Error desconocido';
            setAfipResponse({ ok: false, message: detail });
            notifications.show({ title: 'Error al guardar', message: detail, color: 'red', icon: <AlertTriangle size={14} /> });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Stack align="center" justify="center" h={300}>
                <Loader size="lg" />
                <Text c="dimmed">Cargando configuración fiscal...</Text>
            </Stack>
        );
    }

    const hasCerts = certStatus.crt && certStatus.key;

    return (
        <Stack gap="xl">
            {/* Header */}
            <Group justify="space-between" wrap="wrap">
                <div>
                    <Title order={2} fw={800}>Configuración Fiscal AFIP/ARCA</Title>
                    <Text c="dimmed" size="sm">
                        Configurá los datos para emitir facturas electrónicas. Las ventas se facturarán automáticamente.
                    </Text>
                </div>
                <Button
                    variant="light"
                    leftSection={<BookOpen size={16} />}
                    onClick={() => navigate('/admin/guia-afip')}
                >
                    Guía paso a paso AFIP
                </Button>
            </Group>

            {/* Status bar */}
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Card withBorder radius="md" p="md">
                    <Group gap="sm">
                        <ThemeIcon size={36} radius="xl" color={hasCerts ? 'teal' : 'gray'} variant="light">
                            <ShieldCheck size={20} />
                        </ThemeIcon>
                        <div>
                            <Text size="xs" c="dimmed">Estado Certificados</Text>
                            <Badge color={hasCerts ? 'teal' : 'orange'} size="sm" variant="light">
                                {hasCerts ? 'Cargados ✓' : 'Sin certificados'}
                            </Badge>
                        </div>
                    </Group>
                </Card>
                <Card withBorder radius="md" p="md">
                    <Group gap="sm">
                        <ThemeIcon size={36} radius="xl" color={form.values.modo === 'produccion' ? 'green' : 'orange'} variant="light">
                            {form.values.modo === 'produccion' ? <Check size={20} /> : <AlertTriangle size={20} />}
                        </ThemeIcon>
                        <div>
                            <Text size="xs" c="dimmed">Modo AFIP</Text>
                            <Badge color={form.values.modo === 'produccion' ? 'green' : 'orange'} size="sm" variant="light">
                                {form.values.modo === 'produccion' ? 'Producción' : 'Homologación (testing)'}
                            </Badge>
                        </div>
                    </Group>
                </Card>
                <Card withBorder radius="md" p="md">
                    <Group gap="sm">
                        <ThemeIcon size={36} radius="xl" color="blue" variant="light">
                            <FileBadge size={20} />
                        </ThemeIcon>
                        <div>
                            <Text size="xs" c="dimmed">Condición Fiscal</Text>
                            <Text size="sm" fw={600}>{form.values.condicion_fiscal || '—'}</Text>
                        </div>
                    </Group>
                </Card>
            </SimpleGrid>

            {/* AFIP response alert */}
            {afipResponse && (
                <Alert
                    color={afipResponse.ok ? 'teal' : 'orange'}
                    icon={afipResponse.ok ? <Check size={16} /> : <AlertTriangle size={16} />}
                    title={afipResponse.ok ? 'Configuración aplicada' : 'Guardado con advertencia'}
                    withCloseButton
                    onClose={() => setAfipResponse(null)}
                >
                    {afipResponse.message}
                    {afipResponse.hint && <><br /><Text size="xs" mt={4}>{afipResponse.hint}</Text></>}
                </Alert>
            )}

            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="lg">
                    {/* ── Datos del negocio ─────────────────────────────────── */}
                    <Paper radius="md" withBorder p="lg">
                        <Title order={4} mb="md">Datos del Emisor</Title>
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <TextInput
                                label="CUIT del emisor"
                                placeholder="20123456789"
                                description="Sin guiones"
                                required
                                {...form.getInputProps('cuit_emisor')}
                            />
                            <TextInput
                                label="Razón Social"
                                placeholder="Mi Empresa S.A."
                                required
                                {...form.getInputProps('razon_social')}
                            />
                            <Select
                                label="Condición ante IVA"
                                description="Determina el tipo de comprobante y cálculo de IVA"
                                data={[
                                    { value: 'Monotributo', label: 'Monotributo → Factura C (sin IVA)' },
                                    { value: 'Responsable Inscripto', label: 'Responsable Inscripto → Factura A/B (21% IVA)' },
                                    { value: 'Exento', label: 'Exento → Factura C (sin IVA)' },
                                ]}
                                required
                                {...form.getInputProps('condicion_fiscal')}
                            />
                            <TextInput
                                label="Domicilio Comercial"
                                placeholder="Av. Corrientes 1234"
                                description="Dirección completa del local (requerido para factura legal)"
                                {...form.getInputProps('domicilio_comercial')}
                            />
                            <TextInput
                                label="Ciudad"
                                placeholder="Buenos Aires"
                                {...form.getInputProps('domicilio_ciudad')}
                            />
                            <TextInput
                                label="Provincia"
                                placeholder="Buenos Aires"
                                {...form.getInputProps('domicilio_provincia')}
                            />
                            <TextInput
                                label="Código Postal"
                                placeholder="C1043"
                                {...form.getInputProps('domicilio_codigo_postal')}
                            />
                            <TextInput
                                label="Punto de Venta"
                                placeholder="1"
                                description="El PV registrado en AFIP como 'Web Services'"
                                required
                                type="number"
                                {...form.getInputProps('punto_de_venta')}
                            />
                            <TextInput
                                label="N° de IIBB (opcional)"
                                placeholder="20123456789"
                                {...form.getInputProps('iibb')}
                            />
                            <TextInput
                                label="Fecha inicio de actividades (opcional)"
                                placeholder="2020-01-01"
                                description="Formato YYYY-MM-DD"
                                {...form.getInputProps('fecha_inicio_actividades')}
                            />
                        </SimpleGrid>
                    </Paper>

                    {/* ── Conexión AFIP ─────────────────────────────────────── */}
                    <Paper radius="md" withBorder p="lg">
                        <Title order={4} mb="xs">Modo de Conexión AFIP</Title>
                        <Text size="sm" c="dimmed" mb="md">
                            Usá <b>Homologación</b> para pruebas y <b>Producción</b> para facturar legalmente.
                        </Text>
                        <Select
                            label="Ambiente"
                            data={[
                                { value: 'homologacion', label: 'Homologación (testing — no genera CAEs reales)' },
                                { value: 'produccion', label: 'Producción (facturación real)' },
                            ]}
                            w={320}
                            {...form.getInputProps('modo')}
                        />
                    </Paper>

                    {/* ── Certificados ─────────────────────────────────────── */}
                    <Paper radius="md" withBorder p="lg">
                        <Group justify="space-between" mb="xs">
                            <Title order={4}>Certificados Digitales AFIP</Title>
                            <Anchor
                                href="https://www.afip.gob.ar/ws/documentacion/certificados.asp"
                                target="_blank"
                                size="xs"
                            >
                                ¿Cómo obtenerlos? <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                            </Anchor>
                        </Group>
                        <Text size="sm" c="dimmed" mb="md">
                            Subí el <b>.crt</b> (certificado firmado por AFIP) y el <b>.key</b> (clave privada) generados con OpenSSL.
                            Si no subís archivos, se conservan los existentes.
                        </Text>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            {/* CRT */}
                            <Box>
                                <Text size="sm" fw={600} mb={4}>
                                    Certificado (.crt)
                                    {certStatus.crt && (
                                        <Badge size="xs" color="teal" variant="light" ml={8}>Subido ✓</Badge>
                                    )}
                                </Text>
                                <input
                                    ref={crtInputRef}
                                    type="file"
                                    accept=".crt,.pem,.cer"
                                    style={{ display: 'none' }}
                                    onChange={(e) => setCrtFile(e.target.files?.[0] ?? null)}
                                />
                                <Button
                                    variant={crtFile ? 'filled' : 'light'}
                                    color={crtFile ? 'teal' : 'blue'}
                                    leftSection={crtFile ? <Check size={14} /> : <Upload size={14} />}
                                    onClick={() => crtInputRef.current?.click()}
                                    size="sm"
                                    fullWidth
                                >
                                    {crtFile ? crtFile.name : certStatus.crt ? 'Reemplazar certificado' : 'Subir archivo .crt'}
                                </Button>
                            </Box>

                            {/* KEY */}
                            <Box>
                                <Text size="sm" fw={600} mb={4}>
                                    Clave privada (.key)
                                    {certStatus.key && (
                                        <Badge size="xs" color="teal" variant="light" ml={8}>Subida ✓</Badge>
                                    )}
                                </Text>
                                <input
                                    ref={keyInputRef}
                                    type="file"
                                    accept=".key,.pem"
                                    style={{ display: 'none' }}
                                    onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
                                />
                                <Button
                                    variant={keyFile ? 'filled' : 'light'}
                                    color={keyFile ? 'teal' : 'blue'}
                                    leftSection={keyFile ? <Check size={14} /> : <FileKey size={14} />}
                                    onClick={() => keyInputRef.current?.click()}
                                    size="sm"
                                    fullWidth
                                >
                                    {keyFile ? keyFile.name : certStatus.key ? 'Reemplazar clave' : 'Subir archivo .key'}
                                </Button>
                            </Box>
                        </SimpleGrid>

                        {(crtFile || keyFile) && (
                            <Alert color="blue" icon={<ShieldCheck size={16} />} mt="md" variant="light">
                                Los archivos serán enviados al servidor AFIP y se intentará autenticación WSAA inmediatamente.
                                Verás el resultado al guardar.
                            </Alert>
                        )}
                    </Paper>

                    <Divider />

                    {/* ── Submit ─────────────────────────────────────────────── */}
                    <Group justify="flex-end">
                        <Button
                            type="submit"
                            size="md"
                            loading={saving}
                            leftSection={saving ? <Loader size={14} color="white" /> : <Save size={16} />}
                            color="teal"
                        >
                            Guardar Configuración
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Stack>
    );
}
