import { Stack, Text, Button, Divider, Group, Badge, Box } from '@mantine/core';
import { ShoppingCart, CreditCard, X, Percent } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';
import { LastScannedProduct } from './LastScannedProduct';
import styles from './TotalPanel.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

export function TotalPanel() {
    const total = useSaleStore((s) => s.total);
    const descuentoGlobal = useSaleStore((s) => s.descuentoGlobal);
    const totalConDescuento = useSaleStore((s) => s.totalConDescuento);
    const cart = useSaleStore((s) => s.cart);
    const openPaymentModal = useSaleStore((s) => s.openPaymentModal);
    const clearCart = useSaleStore((s) => s.clearCart);
    const openDiscountModal = useSaleStore((s) => s.openDiscountModal);

    const itemCount = cart.reduce((sum, item) => sum + item.cantidad, 0);
    const hasDiscount = descuentoGlobal > 0;
    const displayTotal = hasDiscount ? totalConDescuento : total;

    return (
        <div className={styles.panel}>
            {/* ── Último producto escaneado (feedback visual) ─────── */}
            <Stack gap="xs" className={styles.scanSection}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.05em' }}>
                    Último Escaneado
                </Text>
                <LastScannedProduct />
            </Stack>

            <Divider my="sm" />

            {/* ── Total ─────────────────────────────────────────────── */}
            <Stack gap="xs" align="center" className={styles.totalSection}>
                <Text size="sm" c="dimmed" tt="uppercase" fw={600}>
                    Total a pagar
                </Text>

                {hasDiscount && (
                    <Box className={styles.originalPrice}>
                        <Text size="md" c="dimmed" td="line-through" ff="monospace">
                            {formatCurrency(total)}
                        </Text>
                        <Badge color="orange" variant="light" size="sm">
                            -{descuentoGlobal}%
                        </Badge>
                    </Box>
                )}

                <Text className={`${styles.totalAmount} ${hasDiscount ? styles.totalDiscount : styles.totalNormal}`} fw={800}>
                    {formatCurrency(displayTotal)}
                </Text>

                <Group gap="xs" mt={4}>
                    <ShoppingCart size={16} color="#909296" />
                    <Text size="sm" c="dimmed">
                        {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}
                    </Text>
                </Group>
            </Stack>

            <Divider my="md" />

            <Stack gap="sm" className={styles.actions}>
                <Button
                    size="xl"
                    color="green"
                    leftSection={<CreditCard size={22} />}
                    fullWidth
                    onClick={openPaymentModal}
                    disabled={cart.length === 0}
                    className={styles.actionButton}
                >
                    <Stack gap={0} align="flex-start">
                        <Text size="lg" fw={700}>COBRAR</Text>
                        <Text size="xs" className={styles.shortcutLabel}>F10</Text>
                    </Stack>
                </Button>

                <Button
                    size="md"
                    color="blue"
                    variant="light"
                    leftSection={<Percent size={18} />}
                    fullWidth
                    onClick={openDiscountModal}
                    disabled={cart.length === 0}
                    className={styles.actionButton}
                >
                    <Stack gap={0} align="flex-start">
                        <Text size="sm" fw={700}>
                            {hasDiscount ? `Descuento (${descuentoGlobal}%)` : 'DESCUENTO'}
                        </Text>
                        <Text size="xs" className={styles.shortcutLabel}>F8</Text>
                    </Stack>
                </Button>

                <Button
                    size="xl"
                    color="red"
                    variant="outline"
                    leftSection={<X size={22} />}
                    fullWidth
                    onClick={clearCart}
                    disabled={cart.length === 0}
                    className={styles.actionButton}
                >
                    <Stack gap={0} align="flex-start">
                        <Text size="lg" fw={700}>CANCELAR</Text>
                        <Text size="xs" className={styles.shortcutLabel}>ESC</Text>
                    </Stack>
                </Button>
            </Stack>
        </div>
    );
}
