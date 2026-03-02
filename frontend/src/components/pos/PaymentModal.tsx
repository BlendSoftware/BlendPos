import { useState, useEffect } from 'react';
import {
    Modal, Stack, Text, Group, Button, Divider, Select, NumberInput,
    Badge, Box, Alert, TextInput, Collapse
} from '@mantine/core';
import { CreditCard, Check, X, Wallet, AlertCircle, Mail } from 'lucide-react';
import { CreditCard, Check, X, Wallet, AlertCircle, Mail } from 'lucide-react';
import { usePOSUIStore } from '../../store/usePOSUIStore';
import { useCartStore } from '../../store/useCartStore';
import type { MetodoPago, PagoDetalle } from '../../store/useCartStore';
import { useSaleStore } from '../../store/useSaleStore';
import styles from './PaymentModal.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

export function PaymentModal() {
    const isOpen = usePOSUIStore((s) => s.isPaymentModalOpen);
    const closePaymentModal = usePOSUIStore((s) => s.closePaymentModal);
    const total = useCartStore((s) => s.total);
    const descuentoGlobal = useCartStore((s) => s.descuentoGlobal);
    const totalConDescuento = useCartStore((s) => s.totalConDescuento);
    const cart = useCartStore((s) => s.cart);
    const confirmSale = useSaleStore((s) => s.confirmSale);

    const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
    const [montoRecibido, setMontoRecibido] = useState<number | string>('');
    const [mixtoDebito, setMixtoDebito] = useState<number | string>('');
    const [mixtoCredito, setMixtoCredito] = useState<number | string>('');
    const [mixtoQr, setMixtoQr] = useState<number | string>('');
    const [clienteEmail, setClienteEmail] = useState('');

    const isEmailValid = clienteEmail === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clienteEmail);

    const toNumber = (val: number | string): number =>
        (typeof val === 'string' ? parseFloat(val) || 0 : val) || 0;

    const finalTotal = descuentoGlobal > 0 ? totalConDescuento : total;
    const itemCount = cart.reduce((sum, item) => sum + item.cantidad, 0);

    const isRecibidoVacio = (metodoPago === 'efectivo' || metodoPago === 'mixto') && montoRecibido === '';

    const numericRecibido = toNumber(montoRecibido);

    const nonCashTotal = metodoPago === 'mixto'
        ? (toNumber(mixtoDebito) + toNumber(mixtoCredito) + toNumber(mixtoQr))
        : 0;

    const cashDue = metodoPago === 'mixto' ? (finalTotal - nonCashTotal) : 0;

    const efectivoRecibido = metodoPago === 'efectivo'
        ? (isRecibidoVacio ? finalTotal : numericRecibido)
        : metodoPago === 'mixto'
            ? (cashDue > 0 ? (isRecibidoVacio ? cashDue : numericRecibido) : 0)
            : 0;

    const vuelto = metodoPago === 'efectivo'
        ? (efectivoRecibido - finalTotal)
        : metodoPago === 'mixto'
            ? (cashDue > 0 ? (efectivoRecibido - cashDue) : 0)
            : null;

    const canConfirm = (() => {
        if (metodoPago === 'efectivo') return efectivoRecibido >= finalTotal;
        if (metodoPago !== 'mixto') return true;

        // No permitir que los pagos no-efectivo superen el total.
        if (cashDue < 0) return false;
        if (cashDue === 0) return nonCashTotal === finalTotal;
        return efectivoRecibido >= cashDue;
    })();

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setMetodoPago('efectivo');
            setMontoRecibido('');
            setMixtoDebito('');
            setMixtoCredito('');
            setMixtoQr('');
            setClienteEmail('');
        }
    }, [isOpen]);

    const handleConfirmPayment = () => {
        if (!canConfirm) return;

        let pagos: PagoDetalle[] | undefined;
        let vueltoCalc: number | undefined;
        let efectivoRecibidoToSave: number | undefined;

        if (metodoPago === 'efectivo') {
            efectivoRecibidoToSave = efectivoRecibido;
            vueltoCalc = efectivoRecibido - finalTotal;
        } else if (metodoPago === 'mixto') {
            const deb = toNumber(mixtoDebito);
            const cre = toNumber(mixtoCredito);
            const qr = toNumber(mixtoQr);
            const detalles: PagoDetalle[] = [];

            if (deb > 0) detalles.push({ metodo: 'debito', monto: deb });
            if (cre > 0) detalles.push({ metodo: 'credito', monto: cre });
            if (qr > 0) detalles.push({ metodo: 'qr', monto: qr });

            if (cashDue > 0) detalles.push({ metodo: 'efectivo', monto: cashDue });

            pagos = detalles;
            if (cashDue > 0) {
                efectivoRecibidoToSave = efectivoRecibido;
                vueltoCalc = efectivoRecibido - cashDue;
            }
        }

        const record = confirmSale({
            metodoPago,
            pagos,
            efectivoRecibido: efectivoRecibidoToSave,
            vuelto: vueltoCalc,
            clienteEmail: clienteEmail.trim() || undefined,
        });
        closePaymentModal();

        // Open the post-sale modal for print option
        const { openPostSaleModal } = usePOSUIStore.getState();
        openPostSaleModal(record);
    };

    // Confirm with Enter key when modal is open and not on efectivo input
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && canConfirm && metodoPago !== 'efectivo') {
                e.preventDefault();
                e.stopPropagation();
                handleConfirmPayment();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, canConfirm, metodoPago]);

    return (
        <Modal
            opened={isOpen}
            onClose={closePaymentModal}
            title={
                <Group gap="xs">
                    <CreditCard size={22} />
                    <Text size="lg" fw={700}>
                        Cobrar Venta
                    </Text>
                </Group>
            }
            size="md"
            centered
        >
            <Stack gap="lg" className={styles.content}>
                {/* Resumen */}
                <div className={styles.summary}>
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Artículos</Text>
                        <Text size="sm" fw={600}>{itemCount}</Text>
                    </Group>

                    {descuentoGlobal > 0 && (
                        <>
                            <Group justify="space-between" mt={4}>
                                <Text size="sm" c="dimmed">Subtotal</Text>
                                <Text size="sm" td="line-through" c="dimmed" ff="monospace">
                                    {formatCurrency(total)}
                                </Text>
                            </Group>
                            <Group justify="space-between" mt={4}>
                                <Group gap="xs">
                                    <Text size="sm" c="dimmed">Descuento</Text>
                                    <Badge size="xs" color="orange" variant="light">
                                        -{descuentoGlobal}%
                                    </Badge>
                                </Group>
                                <Text size="sm" fw={500} c="orange.4" ff="monospace">
                                    - {formatCurrency(total - totalConDescuento)}
                                </Text>
                            </Group>
                        </>
                    )}

                    <Divider my="xs" />
                    <Group justify="space-between">
                        <Text size="lg" fw={700}>TOTAL</Text>
                        <Text size="xl" fw={800} className={styles.modalTotal} ff="monospace">
                            {formatCurrency(finalTotal)}
                        </Text>
                    </Group>
                </div>

                {/* Método de pago */}
                <Select
                    label="Método de pago"
                    placeholder="Seleccione un método"
                    value={metodoPago}
                    onChange={(val) => setMetodoPago((val as MetodoPago) ?? 'efectivo')}
                    data={[
                        { value: 'efectivo', label: '💵 Efectivo' },
                        { value: 'debito', label: '💳 Tarjeta de Débito' },
                        { value: 'credito', label: '💳 Tarjeta de Crédito' },
                        { value: 'qr', label: '📱 QR / Transferencia' },
                        { value: 'mixto', label: '🧾 Mixto' },
                    ]}
                    data-pos-focusable
                    size="md"
                />

                {/* Efectivo: monto recibido + vuelto */}
                {metodoPago === 'efectivo' && (
                    <Stack gap="sm">
                        <NumberInput
                            label="Monto recibido"
                            placeholder={formatCurrency(finalTotal)}
                            value={montoRecibido}
                            onChange={setMontoRecibido}
                            min={0}
                            prefix="$ "
                            thousandSeparator="."
                            decimalSeparator=","
                            decimalScale={2}
                            size="md"
                            leftSection={<Wallet size={16} />}
                            data-pos-focusable
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && canConfirm) { e.stopPropagation(); handleConfirmPayment(); }
                                if (e.key === 'Escape') { e.stopPropagation(); closePaymentModal(); }
                            }}
                        />

                        {vuelto !== null && vuelto >= 0 && (
                            <Box className={styles.vueltoBox}>
                                <Group justify="space-between">
                                    <Text size="md" fw={700}>Vuelto</Text>
                                    <Text size="xl" fw={800} c="teal.4" ff="monospace">
                                        {formatCurrency(vuelto)}
                                    </Text>
                                </Group>
                            </Box>
                        )}

                        {vuelto !== null && vuelto < 0 && (
                            <Alert
                                icon={<AlertCircle size={16} />}
                                color="red"
                                variant="light"
                            >
                                El monto recibido es insuficiente. Faltan{' '}
                                <strong>{formatCurrency(Math.abs(vuelto))}</strong>.
                            </Alert>
                        )}
                    </Stack>
                )}

                {metodoPago === 'mixto' && (
                    <Stack gap="sm">
                        <Group grow>
                            <NumberInput
                                label="Débito"
                                placeholder="$ 0"
                                value={mixtoDebito}
                                onChange={setMixtoDebito}
                                min={0}
                                prefix="$ "
                                thousandSeparator="."
                                decimalSeparator=","
                                decimalScale={2}
                                size="md"
                                data-pos-focusable
                                autoFocus
                            />
                            <NumberInput
                                label="Crédito"
                                placeholder="$ 0"
                                value={mixtoCredito}
                                onChange={setMixtoCredito}
                                min={0}
                                prefix="$ "
                                thousandSeparator="."
                                decimalSeparator=","
                                decimalScale={2}
                                size="md"
                                data-pos-focusable
                            />
                        </Group>

                        <NumberInput
                            label="QR / Transferencia"
                            placeholder="$ 0"
                            value={mixtoQr}
                            onChange={setMixtoQr}
                            min={0}
                            prefix="$ "
                            thousandSeparator="."
                            decimalSeparator=","
                            decimalScale={2}
                            size="md"
                            data-pos-focusable
                        />

                        {cashDue > 0 && (
                            <NumberInput
                                label="Efectivo recibido"
                                placeholder={formatCurrency(cashDue)}
                                value={montoRecibido}
                                onChange={setMontoRecibido}
                                min={0}
                                prefix="$ "
                                thousandSeparator="."
                                decimalSeparator=","
                                decimalScale={2}
                                size="md"
                                leftSection={<Wallet size={16} />}
                                data-pos-focusable
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && canConfirm) { e.stopPropagation(); handleConfirmPayment(); }
                                    if (e.key === 'Escape') { e.stopPropagation(); closePaymentModal(); }
                                }}
                            />
                        )}

                        {cashDue < 0 && (
                            <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
                                Los pagos con tarjeta/QR superan el total.
                            </Alert>
                        )}

                        {cashDue > 0 && vuelto !== null && vuelto >= 0 && (
                            <Box className={styles.vueltoBox}>
                                <Group justify="space-between">
                                    <Text size="md" fw={700}>Vuelto</Text>
                                    <Text size="xl" fw={800} c="teal.4" ff="monospace">
                                        {formatCurrency(vuelto)}
                                    </Text>
                                </Group>
                            </Box>
                        )}

                        {cashDue > 0 && vuelto !== null && vuelto < 0 && (
                            <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
                                El efectivo es insuficiente. Faltan{' '}
                                <strong>{formatCurrency(Math.abs(vuelto))}</strong>.
                            </Alert>
                        )}
                    </Stack>
                )}

                {/* Email opcional para recibo digital (RF-21) */}
                <Collapse in>
                    <TextInput
                        label="Email del cliente (opcional)"
                        description="Si se indica, se enviará el comprobante por email."
                        placeholder="cliente@ejemplo.com"
                        value={clienteEmail}
                        onChange={(e) => setClienteEmail(e.currentTarget.value)}
                        leftSection={<Mail size={16} />}
                        error={!isEmailValid ? 'Email inválido' : undefined}
                        size="sm"
                    />
                </Collapse>

                <Group grow mt="xs">
                    <Button
                        variant="outline"
                        color="gray"
                        size="lg"
                        leftSection={<X size={18} />}
                        onClick={closePaymentModal}
                    >
                        Cancelar
                    </Button>
                    <Button
                        color="green"
                        size="lg"
                        leftSection={<Check size={18} />}
                        onClick={handleConfirmPayment}
                        disabled={!canConfirm || !isEmailValid}
                    >
                        Confirmar Pago
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
