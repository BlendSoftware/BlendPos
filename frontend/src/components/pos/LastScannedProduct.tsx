import { Box, Text, Stack, Group } from '@mantine/core';
import { ScanBarcode, PackageCheck } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';
import styles from './LastScannedProduct.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

export function LastScannedProduct() {
    const lastAdded = useSaleStore((s) => s.lastAdded);

    if (!lastAdded) {
        return (
            <Box className={styles.emptyContainer}>
                <Stack align="center" gap="xs">
                    <ScanBarcode
                        size={40}
                        strokeWidth={1.2}
                        color="var(--mantine-color-dark-4)"
                    />
                    <Text size="xs" c="dimmed" ta="center" style={{ userSelect: 'none' }}>
                        Último producto escaneado
                    </Text>
                </Stack>
            </Box>
        );
    }

    return (
        <Box className={styles.productContainer}>
            <Group gap="xs" mb={6}>
                <PackageCheck size={14} color="#2b8a3e" />
                <Text size="xs" c="green.6" fw={600} tt="uppercase">
                    Producto escaneado
                </Text>
            </Group>

            <Text className={styles.productName} lineClamp={2}>
                {lastAdded.nombre}
            </Text>

            <Text size="xs" c="dimmed" ff="monospace" mt={4}>
                {lastAdded.codigoBarras}
            </Text>

            <Group justify="space-between" mt={8} align="flex-end">
                <Stack gap={0}>
                    <Text size="xs" c="dimmed">Precio unit.</Text>
                    <Text size="md" c="dimmed" ff="monospace">
                        {formatCurrency(lastAdded.precio)}
                    </Text>
                </Stack>
                <Stack gap={0} align="flex-end">
                    <Text size="xs" c="dimmed">Cant. / Subtotal</Text>
                    <Text size="lg" fw={800} c="white" ff="monospace">
                        {lastAdded.cantidad} × {formatCurrency(lastAdded.subtotal)}
                    </Text>
                </Stack>
            </Group>
        </Box>
    );
}
