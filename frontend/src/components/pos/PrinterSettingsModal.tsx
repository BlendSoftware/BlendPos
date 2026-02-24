import {
    Modal, Stack, TextInput, Select, Switch,
    Button, Group, Divider, Text, SimpleGrid,
} from '@mantine/core';
import { usePrinterStore } from '../../store/usePrinterStore';
import type { PrinterConfig } from '../../services/ThermalPrinterService';
import { thermalPrinter } from '../../services/ThermalPrinterService';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

interface Props {
    opened: boolean;
    onClose: () => void;
}

const BAUD_OPTIONS = [
    { value: '9600',   label: '9600 baud (estándar POS)' },
    { value: '19200',  label: '19200 baud' },
    { value: '38400',  label: '38400 baud' },
    { value: '115200', label: '115200 baud (alta velocidad)' },
];

const PAPER_OPTIONS = [
    { value: '32', label: '58 mm  (32 caracteres)' },
    { value: '48', label: '80 mm  (48 caracteres)' },
];

const CODE_PAGE_OPTIONS = [
    { value: '0',  label: 'PC437 — USA / EE.UU.' },
    { value: '2',  label: 'PC850 — Europeo Occidental  ✓ recomendado' },
    { value: '16', label: 'PC858 — Europeo + símbolo €' },
];

const COPIES_OPTIONS = [
    { value: '1', label: '1 copia  (cliente)' },
    { value: '2', label: '2 copias  (cliente + local)' },
];

export function PrinterSettingsModal({ opened, onClose }: Props) {
    const { config, setConfig, reset } = usePrinterStore();
    const [testingDrawer, setTestingDrawer] = useState(false);

    function update<K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) {
        setConfig({ [key]: value } as Partial<PrinterConfig>);
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Configuración de impresora"
            size="md"
            centered
        >
            <Stack gap="sm">
                {/* ── Datos del comercio ─────────────────── */}
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                    Datos del comercio
                </Text>

                <SimpleGrid cols={1} spacing="xs">
                    <TextInput
                        label="Nombre del comercio"
                        description="Se imprime en grande al principio del ticket"
                        value={config.storeName}
                        onChange={(e) => update('storeName', e.target.value)}
                        placeholder="BLEND POS"
                    />
                    <TextInput
                        label="Subtítulo"
                        description="Segunda línea del encabezado"
                        value={config.storeSubtitle}
                        onChange={(e) => update('storeSubtitle', e.target.value)}
                        placeholder="Sistema de Punto de Venta"
                    />
                    <TextInput
                        label="Dirección"
                        description="Se imprime debajo del subtítulo si no está vacío"
                        value={config.storeAddress}
                        onChange={(e) => update('storeAddress', e.target.value)}
                        placeholder="Av. Corrientes 1234, CABA"
                    />
                    <TextInput
                        label="Teléfono"
                        value={config.storePhone}
                        onChange={(e) => update('storePhone', e.target.value)}
                        placeholder="011-4555-1234"
                    />
                    <TextInput
                        label="Mensaje de pie"
                        value={config.storeFooter}
                        onChange={(e) => update('storeFooter', e.target.value)}
                        placeholder="¡Gracias por su compra!"
                    />
                </SimpleGrid>

                <Divider my="xs" />

                {/* ── Hardware ───────────────────────────── */}
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                    Hardware
                </Text>

                <SimpleGrid cols={2} spacing="sm">
                    <Select
                        label="Ancho de papel"
                        data={PAPER_OPTIONS}
                        value={String(config.paperWidth)}
                        onChange={(v) => update('paperWidth', (v === '48' ? 48 : 32) as PrinterConfig['paperWidth'])}
                    />
                    <Select
                        label="Velocidad (Baud rate)"
                        data={BAUD_OPTIONS}
                        value={String(config.baudRate)}
                        onChange={(v) => update('baudRate', Number(v) as PrinterConfig['baudRate'])}
                    />
                    <Select
                        label="Codificación de caracteres"
                        data={CODE_PAGE_OPTIONS}
                        value={String(config.codePage)}
                        onChange={(v) => update('codePage', Number(v) as PrinterConfig['codePage'])}
                    />
                    <Select
                        label="Copias por venta"
                        data={COPIES_OPTIONS}
                        value={String(config.copies)}
                        onChange={(v) => update('copies', Number(v) as PrinterConfig['copies'])}
                    />
                </SimpleGrid>

                <Switch
                    label="Abrir cajón portamonedas al imprimir"
                    description="Envía el comando ESC p después del corte de papel"
                    checked={config.openDrawer}
                    onChange={(e) => update('openDrawer', e.currentTarget.checked)}
                    mt="xs"
                />

                <Button
                    variant="outline"
                    color="orange"
                    size="xs"
                    mt={4}
                    loading={testingDrawer}
                    disabled={!config.openDrawer}
                    onClick={async () => {
                        setTestingDrawer(true);
                        try {
                            const ok = await thermalPrinter.openCashDrawer();
                            notifications.show({
                                title: ok ? 'Cajón abierto' : 'Simulación (sin impresora)',
                                message: ok
                                    ? 'El comando ESC p fue enviado correctamente.'
                                    : 'No hay conexión activa. Verifica que la impresora esté conectada.',
                                color: ok ? 'teal' : 'orange',
                                autoClose: 4000,
                            });
                        } finally {
                            setTestingDrawer(false);
                        }
                    }}
                >
                    Probar apertura de cajón
                </Button>

                <Divider my="xs" />

                <Group justify="space-between">
                    <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={() => {
                            reset();
                        }}
                    >
                        Restablecer valores por defecto
                    </Button>
                    <Button onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
