// ─────────────────────────────────────────────────────────────────────────────
// AbrirCajaModal — Modal para abrir una sesión de caja antes de operar.
// Mostrado automáticamente si no hay sesión activa en useCajaStore.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { Modal, Stack, NumberInput, Button, Text, Alert, Group } from '@mantine/core';
import { TriangleAlert, Store } from 'lucide-react';
import { useCajaStore } from '../../store/useCajaStore';
import { useAuthStore } from '../../store/useAuthStore';

interface Props {
    opened: boolean;
    /** onClose se llama solo cuando la caja se abrió correctamente */
    onSuccess: () => void;
}

export function AbrirCajaModal({ opened, onSuccess }: Props) {
    const { abrir, restaurar, loading, error } = useCajaStore();
    const { user } = useAuthStore();

    const [puntoDeVenta, setPuntoDeVenta] = useState<number | string>(1);
    const [montoInicial, setMontoInicial] = useState<number | string>(0);

    // Auto-asignar punto de venta del usuario al abrir el modal
    useEffect(() => {
        if (user?.puntoDeVenta != null) {
            setPuntoDeVenta(user.puntoDeVenta);
        }
    }, [user?.puntoDeVenta, opened]);

    const handleSubmit = async () => {
        const pdv = typeof puntoDeVenta === 'number' ? puntoDeVenta : parseInt(puntoDeVenta, 10);
        const monto = typeof montoInicial === 'number' ? montoInicial : parseFloat(montoInicial);

        if (!pdv || pdv < 1) return;
        if (isNaN(monto) || monto < 0) return;

        try {
            await abrir({ punto_de_venta: pdv, monto_inicial: monto });
            onSuccess();
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            // Si ya existe una caja abierta en ese PDV, recuperar la sesión activa
            if (msg.toLowerCase().includes('ya existe una caja abierta')) {
                await restaurar().catch(() => {});
                // Only close modal if restaurar() actually recovered a session
                const { sesionId } = useCajaStore.getState();
                if (sesionId) onSuccess();
            }
            // El store ya setea `error` en su catch para otros casos
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={() => { /* No permite cerrar sin abrir caja */ }}
            title={
                <Group gap="xs">
                    <Store size={20} />
                    <Text fw={700} size="lg">Abrir Sesión de Caja</Text>
                </Group>
            }
            closeOnClickOutside={false}
            closeOnEscape={false}
            withCloseButton={false}
            size="sm"
            centered
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Antes de operar, debe abrir una sesión de caja con el monto inicial en efectivo.
                </Text>

                {error && (
                    <Alert icon={<TriangleAlert size={16} />} color="red" variant="light">
                        {error}
                    </Alert>
                )}

                <NumberInput
                    label="Punto de Venta"
                    description={user?.puntoDeVenta != null ? "Asignado automáticamente" : "Número de terminal (1, 2, 3…)"}
                    placeholder="1"
                    min={1}
                    max={99}
                    value={puntoDeVenta}
                    onChange={setPuntoDeVenta}
                    allowDecimal={false}
                    allowNegative={false}
                    disabled={user?.puntoDeVenta != null}
                />

                <NumberInput
                    label="Monto Inicial en Efectivo ($)"
                    description="Dinero con el que inicia la caja"
                    placeholder="0.00"
                    min={0}
                    decimalScale={2}
                    fixedDecimalScale
                    thousandSeparator="."
                    decimalSeparator=","
                    value={montoInicial}
                    onChange={setMontoInicial}
                    allowNegative={false}
                />

                <Button
                    fullWidth
                    size="md"
                    onClick={handleSubmit}
                    loading={loading}
                    disabled={!puntoDeVenta || Number(puntoDeVenta) < 1}
                >
                    Abrir Caja
                </Button>
            </Stack>
        </Modal>
    );
}
