import { useState, useCallback } from 'react';
import { Modal, TextInput, Stack, Text, Group, Badge, Divider, Box } from '@mantine/core';
import { Tag, ScanLine, Search } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';
import { MOCK_PRODUCTS, findProductByBarcode, type MockProduct } from '../../api/mockProducts';
import { findCatalogProductByBarcode, searchCatalogProducts } from '../../offline/catalog';
import styles from './PriceCheckModal.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

export function PriceCheckModal() {
    const isOpen = useSaleStore((s) => s.isPriceCheckModalOpen);
    const close = useSaleStore((s) => s.closePriceCheckModal);
    const [query, setQuery] = useState('');
    const [found, setFound] = useState<MockProduct | null>(null);
    const [notFound, setNotFound] = useState(false);

    const handleSearch = useCallback(async (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            setFound(null);
            setNotFound(false);
            return;
        }

        // Try barcode first, then name
        const byBarcode = await findCatalogProductByBarcode(trimmed);
        if (byBarcode) {
            setFound({
                id: byBarcode.id,
                nombre: byBarcode.nombre,
                precio: byBarcode.precio,
                codigoBarras: byBarcode.codigoBarras,
            });
            setNotFound(false);
            return;
        }

        const byBarcodeMock = findProductByBarcode(trimmed);
        if (byBarcodeMock) {
            setFound(byBarcodeMock);
            setNotFound(false);
            return;
        }

        const res = await searchCatalogProducts(trimmed, 1);
        const byName = res[0];

        if (byName) {
            setFound({
                id: byName.id,
                nombre: byName.nombre,
                precio: byName.precio,
                codigoBarras: byName.codigoBarras,
            });
            setNotFound(false);
        } else {
            const byNameMock = MOCK_PRODUCTS.find((p) =>
                p.nombre.toLowerCase().includes(trimmed.toLowerCase())
            );
            if (byNameMock) {
                setFound(byNameMock);
                setNotFound(false);
            } else {
                setFound(null);
                setNotFound(true);
            }
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            handleSearch(e.currentTarget.value);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            handleClose();
        }
    };

    const handleClose = () => {
        setQuery('');
        setFound(null);
        setNotFound(false);
        close();
    };

    return (
        <Modal
            opened={isOpen}
            onClose={handleClose}
            title={
                <Group gap="xs">
                    <Tag size={20} />
                    <Text size="lg" fw={700}>
                        Consultar Precio
                    </Text>
                </Group>
            }
            size="sm"
            centered
        >
            <Stack gap="md">
                <TextInput
                    value={query}
                    onChange={(e) => {
                        setQuery(e.currentTarget.value);
                        handleSearch(e.currentTarget.value);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Código de barras o nombre..."
                    leftSection={<ScanLine size={16} />}
                    rightSection={<Search size={16} color="#909296" />}
                    size="md"
                    data-pos-focusable
                    autoFocus
                />

                {found && (
                    <Box className={styles.resultBox}>
                        <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                                <Text size="md" fw={700} c="white" style={{ flex: 1 }}>
                                    {found.nombre}
                                </Text>
                            </Group>
                            <Text size="xs" c="dimmed" ff="monospace">
                                Cód: {found.codigoBarras}
                            </Text>
                            <Divider my={4} />
                            <Group justify="center">
                                <Badge
                                    size="xl"
                                    variant="light"
                                    color="green"
                                    className={styles.priceBadge}
                                >
                                    {formatCurrency(found.precio)}
                                </Badge>
                            </Group>
                        </Stack>
                    </Box>
                )}

                {notFound && (
                    <Box className={styles.notFoundBox}>
                        <Text c="orange.5" size="sm" ta="center">
                            No se encontró ningún producto con ese código o nombre.
                        </Text>
                    </Box>
                )}
            </Stack>
        </Modal>
    );
}
