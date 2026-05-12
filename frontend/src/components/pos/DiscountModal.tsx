import { useEffect, useMemo, useState } from 'react';
import {
    Modal, Stack, Text, Group, Button, Slider, NumberInput, Divider, Badge, Alert, SegmentedControl,
} from '@mantine/core';
import { Percent, DollarSign, Check, ShieldAlert } from 'lucide-react';
import { useCartStore } from '../../store/useCartStore';
import { usePOSUIStore } from '../../store/usePOSUIStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
    formatMoney,
    applyDiscount,
    calcFinalTotal,
    type DiscountType,
} from '../../utils/money';
import styles from './DiscountModal.module.css';

const QUICK_PERCENT = [5, 10, 15, 20, 25, 30];
const QUICK_FIXED_FALLBACK = [100, 500, 1000, 2000];

/** Cajero puede aplicar hasta este % sin aprobación */
const CAJERO_DESCUENTO_MAX = 30;

export function DiscountModal() {
    const isOpen = usePOSUIStore((s) => s.isDiscountModalOpen);
    const close = usePOSUIStore((s) => s.closeDiscountModal);
    const total = useCartStore((s) => s.total);
    const globalDiscount = useCartStore((s) => s.globalDiscount);
    const setGlobalDiscount = useCartStore((s) => s.setGlobalDiscount);
    const clearGlobalDiscount = useCartStore((s) => s.clearGlobalDiscount);
    const discountTargetItemId = usePOSUIStore((s) => s.discountTargetItemId);
    const cart = useCartStore((s) => s.cart);
    const setItemDiscount = useCartStore((s) => s.setItemDiscount);
    const { hasRole } = useAuthStore();

    const targetItem = discountTargetItemId
        ? cart.find((i) => i.id === discountTargetItemId) ?? null
        : null;
    /** El descuento por ítem solo soporta porcentaje — no es necesario tipo fijo a nivel línea. */
    const isItemMode = !!targetItem;

    const baseAmount = targetItem ? (targetItem.precio * targetItem.cantidad) : total;

    const [tipo, setTipo] = useState<DiscountType>('percentage');
    const [valor, setValor] = useState<number | string>(0);

    // Resetear estado al abrir, leyendo el descuento actual aplicado
    useEffect(() => {
        if (!isOpen) return;
        if (isItemMode && targetItem) {
            setTipo('percentage');
            setValor(targetItem.descuento);
        } else {
            setTipo(globalDiscount.type);
            setValor(globalDiscount.value);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, discountTargetItemId]);

    const numericValor = typeof valor === 'string' ? parseFloat(valor) || 0 : valor;

    // Clampeo + cálculo final via helpers puros
    const preview = useMemo(() => {
        if (isItemMode || tipo === 'percentage') {
            return applyDiscount(baseAmount, { type: 'percentage', value: numericValor });
        }
        return applyDiscount(baseAmount, { type: 'fixed', value: numericValor });
    }, [baseAmount, numericValor, tipo, isItemMode]);

    const nuevoTotal = calcFinalTotal(baseAmount, preview);

    // Role guard: cajero solo puede aplicar hasta CAJERO_DESCUENTO_MAX en %.
    // Para monto fijo no hay equivalente directo → permitimos cualquier valor (admin/supervisor controla via modal).
    const isCajero = !hasRole(['admin', 'supervisor']);
    const exceedsPermission =
        isCajero && preview.type === 'percentage' && preview.value > CAJERO_DESCUENTO_MAX;

    const handleApply = () => {
        if (exceedsPermission) return;
        if (targetItem) {
            // Ítem: solo porcentaje
            setItemDiscount(targetItem.id, preview.value);
        } else {
            setGlobalDiscount({ type: preview.type, value: preview.value });
        }
        close();
    };

    const handleRemove = () => {
        if (targetItem) setItemDiscount(targetItem.id, 0);
        else clearGlobalDiscount();
        setValor(0);
        close();
    };

    const titleIcon = preview.type === 'fixed' && !isItemMode ? <DollarSign size={20} /> : <Percent size={20} />;
    const hasActiveDiscount = isItemMode
        ? (targetItem?.descuento ?? 0) > 0
        : globalDiscount.amount > 0;

    return (
        <Modal
            opened={isOpen}
            onClose={close}
            title={
                <Group gap="xs">
                    {titleIcon}
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

                {/* Selector tipo — solo en modo global. Ítem siempre es porcentaje. */}
                {!isItemMode && (
                    <SegmentedControl
                        fullWidth
                        value={tipo}
                        onChange={(v) => {
                            setTipo(v as DiscountType);
                            setValor(0);
                        }}
                        data={[
                            { label: 'Porcentaje (%)', value: 'percentage' },
                            { label: 'Monto fijo ($)', value: 'fixed' },
                        ]}
                    />
                )}

                <div className={styles.summary}>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Total original</Text>
                        <Text size="sm" fw={500}>{formatMoney(baseAmount)}</Text>
                    </Group>
                    <Group justify="space-between" mt={4}>
                        <Text size="sm" c="dimmed">Descuento</Text>
                        <Text size="sm" fw={500} c="orange.4">
                            - {formatMoney(preview.amount)}
                            {' '}
                            ({preview.type === 'percentage' ? `${preview.value}%` : 'monto fijo'})
                        </Text>
                    </Group>
                    <Divider my="xs" />
                    <Group justify="space-between">
                        <Text size="lg" fw={700}>Total final</Text>
                        <Text size="xl" fw={800} c="green.5" ff="monospace">
                            {formatMoney(nuevoTotal)}
                        </Text>
                    </Group>
                </div>

                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        {preview.type === 'percentage' ? 'Porcentaje de descuento' : 'Monto a descontar'}
                    </Text>
                    <NumberInput
                        value={valor}
                        onChange={setValor}
                        min={0}
                        max={preview.type === 'percentage' ? 100 : Math.max(0, baseAmount)}
                        step={preview.type === 'percentage' ? 1 : 50}
                        allowNegative={false}
                        clampBehavior="strict"
                        decimalScale={2}
                        suffix={preview.type === 'percentage' ? '%' : undefined}
                        prefix={preview.type === 'fixed' ? '$ ' : undefined}
                        thousandSeparator={preview.type === 'fixed' ? '.' : undefined}
                        decimalSeparator={preview.type === 'fixed' ? ',' : undefined}
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

                    {/* Slider solo en modo porcentaje */}
                    {preview.type === 'percentage' && (
                        <Slider
                            value={preview.value}
                            onChange={(val) => setValor(val)}
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
                    )}
                </Stack>

                {/* Atajos rápidos según tipo */}
                <Stack gap="xs">
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                        {preview.type === 'percentage' ? 'Descuentos rápidos' : 'Montos rápidos'}
                    </Text>
                    <Group gap="xs" wrap="wrap">
                        {(preview.type === 'percentage' ? QUICK_PERCENT : quickFixedFor(baseAmount)).map((d) => (
                            <Badge
                                key={d}
                                variant={preview.value === d ? 'filled' : 'outline'}
                                color="blue"
                                size="lg"
                                className={styles.quickBadge}
                                onClick={() => setValor(d)}
                            >
                                {preview.type === 'percentage' ? `${d}%` : formatMoney(d)}
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
                        disabled={exceedsPermission || (preview.amount === 0 && !hasActiveDiscount)}
                    >
                        Aplicar
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

/** Genera montos rápidos contextualizados al total del carrito (sin hardcodear). */
function quickFixedFor(total: number): number[] {
    if (total <= 0) return QUICK_FIXED_FALLBACK;
    // Atajos como % del total, redondeados a múltiplos legibles
    const cents = [0.05, 0.1, 0.15, 0.2]
        .map((pct) => Math.round((total * pct) / 50) * 50)
        .filter((v) => v > 0);
    // Si todos quedan 0 (total muy chico), caer a fallback
    return cents.length ? Array.from(new Set(cents)) : QUICK_FIXED_FALLBACK;
}
