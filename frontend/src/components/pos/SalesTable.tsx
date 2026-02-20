import { useState } from 'react';
import { Table, Text, Flex, Box, ActionIcon, NumberInput, Tooltip, Badge } from '@mantine/core';
import { ScanBarcode, Trash2, Plus, Minus } from 'lucide-react';
import { useSaleStore } from '../../store/useSaleStore';
import styles from './SalesTable.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

export function SalesTable() {
    const cart = useSaleStore((s) => s.cart);
    const lastAdded = useSaleStore((s) => s.lastAdded);
    const selectedRowIndex = useSaleStore((s) => s.selectedRowIndex);
    const updateQuantity = useSaleStore((s) => s.updateQuantity);
    const removeItem = useSaleStore((s) => s.removeItem);
    const setSelectedRowIndex = useSaleStore((s) => s.setSelectedRowIndex);

    // Track which item is being edited inline
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<number | string>(1);

    const startEdit = (id: string, cantidad: number) => {
        setEditingId(id);
        setEditingValue(cantidad);
    };

    const commitEdit = (id: string) => {
        const val = typeof editingValue === 'string' ? parseInt(editingValue) : editingValue;
        if (!isNaN(val)) updateQuantity(id, val);
        setEditingId(null);
    };

    if (cart.length === 0) {
        return (
            <Flex
                direction="column"
                align="center"
                justify="center"
                h="100%"
                className={styles.emptyState}
            >
                <ScanBarcode size={80} strokeWidth={1} color="var(--mantine-color-dark-3)" />
                <Text size="xl" fw={700} c="dark.3" mt="lg">
                    ESCANEE UN PRODUCTO
                </Text>
                <Text size="sm" c="dark.4" mt="xs">
                    Use el escáner o presione F2 para buscar manualmente
                </Text>
            </Flex>
        );
    }

    return (
        <div className={styles.tableWrapper}>
            <Table
                striped
                highlightOnHover
                verticalSpacing="sm"
                className={styles.table}
            >
                <Table.Thead>
                    <Table.Tr className={styles.headerRow}>
                        <Table.Th w={44}>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">#</Text>
                        </Table.Th>
                        <Table.Th w={130}>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Código</Text>
                        </Table.Th>
                        <Table.Th>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Producto</Text>
                        </Table.Th>
                        <Table.Th w={100} style={{ textAlign: 'right' }}>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Precio</Text>
                        </Table.Th>
                        <Table.Th w={120} style={{ textAlign: 'center' }}>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Cant.</Text>
                        </Table.Th>
                        <Table.Th w={120} style={{ textAlign: 'right' }}>
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Subtotal</Text>
                        </Table.Th>
                        <Table.Th w={44} />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {cart.map((item, index) => {
                        const isLastAdded = lastAdded?.id === item.id;
                        const isSelected = selectedRowIndex === index;
                        const isEditing = editingId === item.id;

                        return (
                            <Table.Tr
                                key={item.id}
                                className={`${styles.row} ${isLastAdded ? styles.rowHighlight : ''} ${isSelected ? styles.rowSelected : ''}`}
                                onClick={() => setSelectedRowIndex(index)}
                            >
                                <Table.Td>
                                    <Text size="sm" c="dimmed">{index + 1}</Text>
                                </Table.Td>

                                <Table.Td>
                                    <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                                        {item.codigoBarras}
                                    </Text>
                                </Table.Td>

                                <Table.Td>
                                    <Box>
                                        <Text size="sm" fw={600} c="white" lineClamp={1}>
                                            {item.nombre}
                                        </Text>
                                        {item.descuento > 0 && (
                                            <Badge size="xs" color="orange" variant="light" mt={2}>
                                                -{item.descuento}% dto.
                                            </Badge>
                                        )}
                                    </Box>
                                </Table.Td>

                                <Table.Td style={{ textAlign: 'right' }}>
                                    <Text size="sm" c="dimmed" ff="monospace">
                                        {formatCurrency(item.precio)}
                                    </Text>
                                </Table.Td>

                                <Table.Td style={{ textAlign: 'center' }}>
                                    {isEditing ? (
                                        <NumberInput
                                            value={editingValue}
                                            onChange={setEditingValue}
                                            min={1}
                                            max={999}
                                            size="xs"
                                            w={70}
                                            data-pos-focusable
                                            autoFocus
                                            onBlur={() => commitEdit(item.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') commitEdit(item.id);
                                                if (e.key === 'Escape') setEditingId(null);
                                            }}
                                            style={{ display: 'inline-block' }}
                                        />
                                    ) : (
                                        <Box className={styles.quantityControl}>
                                            <Tooltip label="Restar" position="top" withArrow>
                                                <ActionIcon
                                                    size="xs"
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id, item.cantidad - 1);
                                                    }}
                                                >
                                                    <Minus size={10} />
                                                </ActionIcon>
                                            </Tooltip>

                                            <Tooltip label="Editar cantidad" withArrow>
                                                <Box
                                                    className={styles.quantityBadge}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startEdit(item.id, item.cantidad);
                                                    }}
                                                >
                                                    <Text size="sm" fw={700} c="white">
                                                        {item.cantidad}
                                                    </Text>
                                                </Box>
                                            </Tooltip>

                                            <Tooltip label="Sumar" position="top" withArrow>
                                                <ActionIcon
                                                    size="xs"
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(item.id, item.cantidad + 1);
                                                    }}
                                                >
                                                    <Plus size={10} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Table.Td>

                                <Table.Td style={{ textAlign: 'right' }}>
                                    <Text size="sm" fw={700} c="white" ff="monospace">
                                        {formatCurrency(item.subtotal)}
                                    </Text>
                                </Table.Td>

                                <Table.Td>
                                    <Tooltip label="Eliminar (Del)" withArrow>
                                        <ActionIcon
                                            size="sm"
                                            variant="subtle"
                                            color="red"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeItem(item.id);
                                            }}
                                            className={styles.deleteBtn}
                                        >
                                            <Trash2 size={14} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </div>
    );
}
