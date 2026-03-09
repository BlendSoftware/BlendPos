import React, { useEffect } from 'react';
import { Modal, Text, Stack, Group, Button, UnstyledButton, Badge, Alert, Loader } from '@mantine/core';
import { Receipt, FileText, Building2, Info } from 'lucide-react';
import { usePOSUIStore } from '../../store/usePOSUIStore';
import { useConfiguracionFiscal } from '../../hooks/useConfiguracionFiscal';

type TipoComprobante = 'ticket' | 'factura_b' | 'factura_a' | 'factura_c';

interface Opcion {
    tipo: TipoComprobante;
    label: string;
    subtitulo: string;
    icon: React.ReactNode;
    color: string;
    hotkey: string;
}

const OPCIONES: Opcion[] = [
    {
        tipo: 'ticket',
        label: 'Ticket',
        subtitulo: 'Comprobante no fiscal (sin AFIP)',
        icon: <Receipt size={28} />,
        color: 'teal',
        hotkey: '1',
    },
    {
        tipo: 'factura_c',
        label: 'Factura C',
        subtitulo: 'Consumidor final sin discriminar IVA',
        icon: <FileText size={28} />,
        color: 'cyan',
        hotkey: '2',
    },
    {
        tipo: 'factura_b',
        label: 'Factura B',
        subtitulo: 'Consumidor final con CUIT (Responsable Inscripto)',
        icon: <FileText size={28} />,
        color: 'blue',
        hotkey: '3',
    },
    {
        tipo: 'factura_a',
        label: 'Factura A',
        subtitulo: 'Responsable inscripto (Responsable Inscripto)',
        icon: <Building2 size={28} />,
        color: 'orange',
        hotkey: '4',
    },
];

export function ComprobanteModal() {
    const {
        isComprobanteModalOpen, closeComprobanteModal,
        setTipoComprobante, openPaymentModal,
    } = usePOSUIStore();

    const { config, loading } = useConfiguracionFiscal();

    // Determine allowed options based on fiscal condition
    const opcionesDisponibles = React.useMemo(() => {
        if (!config) return OPCIONES.filter(op => op.tipo === 'ticket');

        const condicion = config.condicion_fiscal;

        // Monotributista: Solo puede emitir tickets internos y factura C
        if (condicion === 'Monotributo') {
            return OPCIONES.filter(op => op.tipo === 'ticket' || op.tipo === 'factura_c');
        }

        // Responsable Inscripto: Puede emitir todos los tipos
        if (condicion === 'Responsable Inscripto') {
            return OPCIONES;
        }

        // Default: Solo tickets
        return OPCIONES.filter(op => op.tipo === 'ticket');
    }, [config]);

    const handleSelect = (tipo: TipoComprobante) => {
        setTipoComprobante(tipo as 'ticket' | 'factura_b' | 'factura_a' | 'factura_c');
        closeComprobanteModal();
        openPaymentModal();
    };

    useEffect(() => {
        if (!isComprobanteModalOpen) return;
        const keyMap: Record<string, TipoComprobante> = { 
            '1': 'ticket', 
            '2': 'factura_c',
            '3': 'factura_b', 
            '4': 'factura_a' 
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key in keyMap) {
                const tipo = keyMap[e.key];
                // Only allow if option is available
                if (opcionesDisponibles.some(op => op.tipo === tipo)) {
                    e.preventDefault();
                    handleSelect(tipo);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isComprobanteModalOpen, opcionesDisponibles]);

    return (
        <Modal
            opened={isComprobanteModalOpen}
            onClose={closeComprobanteModal}
            title={<Text fw={700} size="lg">Tipo de comprobante</Text>}
            size="sm"
            centered
            trapFocus
        >
            {loading ? (
                <Stack align="center" py="xl">
                    <Loader size="md" />
                    <Text size="sm" c="dimmed">Cargando configuración fiscal...</Text>
                </Stack>
            ) : (
                <>
                    {config && (
                        <Alert icon={<Info size={16} />} color="blue" variant="light" mb="md">
                            <Text size="xs">
                                {config.condicion_fiscal === 'Monotributo' 
                                    ? '⚡ Como Monotributista, solo podés emitir Tickets internos o Facturas C'
                                    : config.condicion_fiscal === 'Responsable Inscripto'
                                    ? '⚡ Como Responsable Inscripto, podés emitir todos los tipos de comprobante'
                                    : '⚡ Configurá tu condición fiscal en Administración → Configuración Fiscal'}
                            </Text>
                        </Alert>
                    )}
                    <Stack gap="sm">
                        {opcionesDisponibles.map((op) => (
                            <UnstyledButton
                                key={op.tipo}
                                onClick={() => handleSelect(op.tipo)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '12px 16px',
                                    borderRadius: 8,
                                    border: '1px solid var(--mantine-color-dark-4)',
                                    background: 'var(--mantine-color-dark-7)',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--mantine-color-dark-6)'; }}
                                onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--mantine-color-dark-7)'; }}
                            >
                                <span style={{ color: `var(--mantine-color-${op.color}-5)` }}>{op.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <Text fw={600} size="sm">{op.label}</Text>
                                    <Text size="xs" c="dimmed">{op.subtitulo}</Text>
                                </div>
                                <Badge size="xs" variant="outline" color="gray">Teclado: {op.hotkey}</Badge>
                            </UnstyledButton>
                        ))}
                    </Stack>
                    <Group justify="flex-end" mt="md">
                        <Button variant="subtle" size="sm" onClick={closeComprobanteModal}>
                            Cancelar
                        </Button>
                    </Group>
                </>
            )}
        </Modal>
    );
}
