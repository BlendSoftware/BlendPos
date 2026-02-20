import { useEffect, useState } from 'react';
import { Modal, Stack, Text, Group, Button, Slider, NumberInput, Divider, Badge, Alert } from '@mantine/core';
import { Percent, Check, ShieldAlert } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';
import { useAuthStore } from '../../store/useAuthStore';
import styles from './DiscountModal.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

const QUICK_DISCOUNTS = [5, 10, 15, 20, 25, 30];

/** Cajero puede aplicar hasta este % sin aprobación */
const CAJERO_DESCUENTO_MAX = 30;

export function DiscountModal() {
    const isOpen = useSaleStore((s) => s.isDiscountModalOpen);
    const close = useSaleStore((s) => s.closeDiscountModal);
    const total = useSaleStore((s) => s.total);
    const descuentoGlobal = useSaleStore((s) => s.descuentoGlobal);
    const setGlobalDiscount = useSaleStore((s) => s.setGlobalDiscount);
    const discountTargetItemId = useSaleStore((s) => s.discountTargetItemId);
    const cart = useSaleStore((s) => s.cart);
    const setItemDiscount = useSaleStore((s) => s.setItemDiscount);
    const { hasRole } = useAuthStore();

    const targetItem = discountTargetItemId
        ? cart.find((i) => i.id === discountTargetItemId) ?? null
        : null;

    const initialDiscount = targetItem ? targetItem.descuento : descuentoGlobal;
    const baseAmount = targetItem ? (targetItem.precio * targetItem.cantidad) : total;

    const [localDiscount, setLocalDiscount] = useState<number | string>(initialDiscount);

    useEffect(() => {
        if (!isOpen) return;
        setLocalDiscount(initialDiscount);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, discountTargetItemId]);

    const numericDiscount = typeof localDiscount === 'string' ? parseFloat(localDiscount) || 0 : localDiscount;
    const clamped = Math.max(0, Math.min(100, numericDiscount));
    const ahorro = baseAmount * (clamped / 100);
    const nuevoTotal = baseAmount - ahorro;

    // Role guard: cajero can only apply up to CAJERO_DESCUENTO_MAX%
    const isCajero = !hasRole(['admin', 'supervisor']);
    const exceedsPermission = isCajero && clamped > CAJERO_DESCUENTO_MAX;

    const handleApply = () => {
        if (exceedsPermission) return;
        if (targetItem) setItemDiscount(targetItem.id, clamped);
        else setGlobalDiscount(clamped);
        close();
    };

    const handleRemove = () => {
        if (targetItem) setItemDiscount(targetItem.id, 0);
        else setGlobalDiscount(0);
        setLocalDiscount(0);
        close();
    };

    const currentlyAppliedDiscount = targetItem ? targetItem.descuento : descuentoGlobal;

    return (
        <Modal
            opened={isOpen}
            onClose={close}
            title={
                <Group gap="xs">
                    <Percent size={20} />
                    <Text size="lg" fw={700}>
                        {targetItem ? 'Descuento de Ítem' : 'Descuento Global'}
                    </Text>
                </Group>
            }
            size="sm"
            centered
        >
            <Stack gap="lg">
                {targetItem && (
                    <Alert color="blue" variant="light">
                        Aplicando descuento a: <strong>{targetItem.nombre}</strong> ({targetItem.cantidad}×)
                    </Alert>
                )}
                <div className={styles.summary}>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Total original</Text>
                        <Text size="sm" fw={500}>{formatCurrency(baseAmount)}</Text>
                    </Group>
                    <Group justify="space-between" mt={4}>
                        <Text size="sm" c="dimmed">Descuento</Text>
                        <Text size="sm" fw={500} c="orange.4">
                            - {formatCurrency(ahorro)} ({clamped}%)
                        </Text>
                    </Group>
                    <Divider my="xs" />
                    <Group justify="space-between">
                        <Text size="lg" fw={700}>Total final</Text>
                        <Text size="xl" fw={800} c="green.5" ff="monospace">
                            {formatCurrency(nuevoTotal)}
                        </Text>
                    </Group>
                </div>

                <Stack gap="xs">
                    <Text size="sm" c="dimmed">Porcentaje de descuento</Text>
                    <NumberInput
                        value={localDiscount}
                        onChange={setLocalDiscount}
                        min={0}
                        max={100}
                        step={1}
                        suffix="%"
                        size="md"
                        data-pos-focusable
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.stopPropagation(); handleApply(); }
                            if (e.key === 'Escape') { e.stopPropagation(); close(); }
                        }}
                    />

                    {exceedsPermission && (
                        <Alert
                            color="orange"
                            variant="light"
                            icon={<ShieldAlert size={16} />}
                        >
                            Los cajeros solo pueden aplicar hasta{' '}
                            <strong>{CAJERO_DESCUENTO_MAX}%</strong> de descuento.
                            Contactá a un supervisor o admin para descuentos mayores.
                        </Alert>
                    )}
                    <Slider
                        value={clamped}
                        onChange={(val) => setLocalDiscount(val)}
                        min={0}
                        max={50}
                        step={1}
                        marks={[
                            { value: 0, label: '0%' },
                            { value: 10, label: '10%' },
                            { value: 25, label: '25%' },
                            { value: 50, label: '50%' },
                        ]}
                        mt="sm"
                        mb="xl"
                    />
                </Stack>

                <Stack gap="xs">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Descuentos rápidos</Text>
                    <Group gap="xs" wrap="wrap">
                        {QUICK_DISCOUNTS.map((d) => (
                            <Badge
                                key={d}
                                variant={clamped === d ? 'filled' : 'outline'}
                                color="blue"
                                size="lg"
                                className={styles.quickBadge}
                                onClick={() => setLocalDiscount(d)}
                            >
                                {d}%
                            </Badge>
                        ))}
                    </Group>
                </Stack>

                <Group grow mt="md">
                    <Button
                        variant="outline"
                        color="gray"
                        onClick={handleRemove}
                    >
                        Quitar descuento
                    </Button>
                    <Button
                        color="green"
                        leftSection={<Check size={16} />}
                        onClick={handleApply}
                        disabled={exceedsPermission || (clamped === 0 && currentlyAppliedDiscount === 0)}
                    >
                        Aplicar
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
