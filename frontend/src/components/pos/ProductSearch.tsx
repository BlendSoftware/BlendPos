import { useState, useRef, useCallback, useEffect, useDeferredValue } from 'react';
import { TextInput, Paper, Stack, Text, Group, Badge, Kbd, Box } from '@mantine/core';
import { Search, X } from 'lucide-react';
import type { LocalProduct } from '../../offline/db';
import { searchCatalogProducts } from '../../offline/catalog';
import { useSaleStore } from '../../store/useSaleStore';
import styles from './ProductSearch.module.css';

interface ProductSearchProps {
    onClose: () => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

export function ProductSearch({ onClose, inputRef }: ProductSearchProps) {
    const [query, setQuery] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(0);
    const deferredQuery = useDeferredValue(query);
    const addItem = useSaleStore((s) => s.addItem);
    const listRef = useRef<HTMLDivElement>(null);

    const [results, setResults] = useState<LocalProduct[]>([]);

    useEffect(() => {
        searchCatalogProducts(deferredQuery, 200)
            .then(setResults)
            .catch(() => setResults([]));
    }, [deferredQuery]);

    // Scroll highlighted item into view
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [highlightIndex]);

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        setHighlightIndex(0);
    };

    const selectProduct = useCallback(
        (product: LocalProduct) => {
            addItem({ id: product.id, nombre: product.nombre, precio: product.precio, codigoBarras: product.codigoBarras });
            onClose();
        },
        [addItem, onClose]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setHighlightIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (results[highlightIndex]) selectProduct(results[highlightIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        },
        [results, highlightIndex, selectProduct, onClose]
    );

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.container} onClick={(e) => e.stopPropagation()}>
                <Paper shadow="xl" radius="md" className={styles.searchBox} withBorder>
                    <Box className={styles.header}>
                        <Group justify="space-between" mb="sm">
                            <Group gap="xs">
                                <Search size={18} color="var(--mantine-color-blue-5)" />
                                <Text fw={700} size="md" c="white">
                                    Buscar Producto
                                </Text>
                            </Group>
                            <Group gap="xs">
                                <Kbd size="xs">↑↓</Kbd>
                                <Text size="xs" c="dimmed">navegar</Text>
                                <Kbd size="xs">Enter</Kbd>
                                <Text size="xs" c="dimmed">agregar</Text>
                                <Kbd size="xs">Esc</Kbd>
                                <Text size="xs" c="dimmed">cerrar</Text>
                                <X
                                    size={18}
                                    color="#909296"
                                    className={styles.closeBtn}
                                    onClick={onClose}
                                />
                            </Group>
                        </Group>
                        <TextInput
                            ref={inputRef}
                            value={query}
                            onChange={(e) => handleQueryChange(e.currentTarget.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Nombre del producto o código de barras..."
                            leftSection={<Search size={16} />}
                            size="md"
                            data-pos-focusable
                            autoFocus
                            className={styles.searchInput}
                        />
                    </Box>

                    <div ref={listRef} className={styles.resultsList}>
                        {results.length === 0 ? (
                            <Stack align="center" py="xl" gap="xs">
                                <Text c="dimmed" size="sm">
                                    No se encontraron resultados para "{query}"
                                </Text>
                            </Stack>
                        ) : (
                            results.map((product, index) => (
                                <div
                                    key={product.id}
                                    data-index={index}
                                    className={`${styles.resultItem} ${index === highlightIndex ? styles.resultItemActive : ''}`}
                                    onClick={() => selectProduct(product)}
                                    onMouseEnter={() => setHighlightIndex(index)}
                                >
                                    <Group justify="space-between" gap="md">
                                        <div>
                                            <Text size="sm" fw={600} c="white">
                                                {product.nombre}
                                            </Text>
                                            <Text size="xs" c="dimmed" ff="monospace">
                                                {product.codigoBarras}
                                            </Text>
                                        </div>
                                        <Badge
                                            variant="light"
                                            color="green"
                                            size="lg"
                                            className={styles.priceBadge}
                                        >
                                            {formatCurrency(product.precio)}
                                        </Badge>
                                    </Group>
                                </div>
                            ))
                        )}
                    </div>

                    <Box className={styles.footer}>
                        <Text size="xs" c="dimmed">
                            {results.length} producto{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                        </Text>
                    </Box>
                </Paper>
            </div>
        </div>
    );
}
