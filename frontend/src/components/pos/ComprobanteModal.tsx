import React from 'react';
import { Modal, Text, Stack, Group, Button, UnstyledButton, Badge } from '@mantine/core';
import { Receipt, FileText, Building2 } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';

type TipoComprobante = 'ticket' | 'factura_b' | 'factura_a';

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
        subtitulo: 'Consumidor final (sin CUIT)',
        icon: <Receipt size={28} />,
        color: 'teal',
        hotkey: '1',
    },
    {
        tipo: 'factura_b',
        label: 'Factura B',
        subtitulo: 'Consumidor final con CUIT',
        icon: <FileText size={28} />,
        color: 'blue',
        hotkey: '2',
    },
    {
        tipo: 'factura_a',
        label: 'Factura A',
        subtitulo: 'Responsable inscripto',
        icon: <Building2 size={28} />,
        color: 'orange',
        hotkey: '3',
    },
];

export function ComprobanteModal() {
    const {
        isComprobanteModalOpen, closeComprobanteModal,
        setTipoComprobante, openPaymentModal,
    } = useSaleStore();

    const handleSelect = (tipo: TipoComprobante) => {
        setTipoComprobante(tipo);
        closeComprobanteModal();
        openPaymentModal();
    };

    return (
        <Modal
            opened={isComprobanteModalOpen}
            onClose={closeComprobanteModal}
            title={<Text fw={700} size="lg">Tipo de comprobante</Text>}
            size="sm"
            centered
            trapFocus
        >
            <Stack gap="sm">
                {OPCIONES.map((op) => (
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
        </Modal>
    );
}
