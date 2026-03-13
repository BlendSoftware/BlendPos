import { useState } from 'react';
import { Table, Text, Flex, Box, ActionIcon, NumberInput, Tooltip, Badge, Stack } from '@mantine/core';
import { ScanBarcode, Trash2, Plus, Minus, Tag } from 'lucide-react';
import { useCartStore } from '../../store/useCartStore';
import type { CartItem } from '../../store/useCartStore';
import { usePromocionesStore } from '../../store/usePromocionesStore';
import type { PromocionResponse } from '../../services/api/promociones';
import styles from './SalesTable.module.css';

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

// ── Display row types ─────────────────────────────────────────────────────────

type ComboRow = {
    type: 'combo';
    key: string;
    promo: PromocionResponse;
    completeSets: number;
    n: number;
    items: Array<{ cartItem: CartItem; qty: number }>;
    totalSinDescuento: number;
    totalConDescuento: number;
};

type IndividualRow = {
    type: 'individual';
    key: string;
    cartItem: CartItem;
    /** Units from this product NOT assigned to any combo. */
    displayQty: number;
    /** Subtotal for the extra units at full price (no promo). */
    subtotal: number;
    /** Cart index for keyboard nav sync. */
    cartIndex: number;
};

type DisplayRow = ComboRow | IndividualRow;

// ── Helper: build virtual rows from cart + active promotions ──────────────────

function buildDisplayRows(cart: CartItem[], promociones: PromocionResponse[]): DisplayRow[] {
    // remaining[id] = how many units of this product are NOT yet assigned to a combo
    const remaining: Record<string, number> = {};
    cart.forEach((item) => { remaining[item.id] = item.cantidad; });

    const rows: DisplayRow[] = [];

    // 1. Create combo rows for complete multi-product combos
    for (const promo of promociones) {
        if (!promo.activa || promo.productos.length <= 1) continue;

        const n = Math.max(1, promo.cantidad_requerida ?? 1);

        // Need at least n of EVERY combo product still remaining
        const allPresent = promo.productos.every((p) => (remaining[p.id] ?? 0) >= n);
        if (!allPresent) continue;

        // Complete sets = bottleneck product (fewest available sets)
        const completeSets = Math.floor(
            Math.min(...promo.productos.map((p) => (remaining[p.id] ?? 0) / n)),
        );
        if (completeSets === 0) continue;

        const comboItems = promo.productos
            .map((p) => {
                const cartItem = cart.find((c) => c.id === p.id);
                return cartItem ? { cartItem, qty: completeSets * n } : null;
            })
            .filter((x): x is { cartItem: CartItem; qty: number } => x !== null);

        const totalSinDescuento = comboItems.reduce(
            (sum, { cartItem, qty }) => sum + cartItem.precio * qty,
            0,
        );
        const totalConDescuento =
            promo.tipo === 'porcentaje'
                ? totalSinDescuento * (1 - promo.valor / 100)
                : Math.max(0, totalSinDescuento - completeSets * promo.valor);

        rows.push({
            type: 'combo',
            key: `combo-${promo.id}`,
            promo,
            completeSets,
            n,
            items: comboItems,
            totalSinDescuento,
            totalConDescuento,
        });

        // Consume combo units from remaining pool
        promo.productos.forEach((p) => {
            remaining[p.id] = (remaining[p.id] ?? 0) - completeSets * n;
        });
    }

    // 2. Individual rows for leftover units (no promo, full price)
    cart.forEach((item, cartIndex) => {
        const qty = remaining[item.id] ?? 0;
        if (qty <= 0) return;

        // Single-product quantity promos (2x1 etc.) keep their badge on individual rows
        const effectivePct = Math.max(item.descuento, item.promoDescuento ?? 0);
        const subtotal = qty * item.precio * (1 - effectivePct / 100);

        rows.push({
            type: 'individual',
            key: `ind-${item.id}`,
            cartItem: item,
            displayQty: qty,
            subtotal,
            cartIndex,
        });
    });

    return rows;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SalesTable() {
    const cart = useCartStore((s) => s.cart);
    const lastAdded = useCartStore((s) => s.lastAdded);
    const updateQuantity = useCartStore((s) => s.updateQuantity);
    const removeItem = useCartStore((s) => s.removeItem);
    const setSelectedRowIndex = useCartStore((s) => s.setSelectedRowIndex);

    const promociones = usePromocionesStore((s) => s.promociones);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<number | string>(1);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const startEdit = (id: string, cantidad: number) => {
        setEditingId(id);
        setEditingValue(cantidad);
    };

    const commitEdit = (id: string, currentTotal: number, displayQty: number) => {
        const val = typeof editingValue === 'string' ? parseInt(editingValue) : editingValue;
        if (!isNaN(val) && val > 0) {
            // Map display qty edit → total qty edit: keep combo units, replace extra units
            const comboUnits = currentTotal - displayQty;
            updateQuantity(id, comboUnits + val);
        }
        setEditingId(null);
    };

    // Delete all combo units from the cart (one complete combo set)
    const handleDeleteCombo = (row: ComboRow) => {
        row.items.forEach(({ cartItem, qty }) => {
            const newQty = cartItem.cantidad - qty;
            if (newQty <= 0) removeItem(cartItem.id);
            else updateQuantity(cartItem.id, newQty);
        });
    };

    // Delete individual extra units from the cart
    const handleDeleteIndividual = (row: IndividualRow) => {
        const newQty = row.cartItem.cantidad - row.displayQty;
        if (newQty <= 0) removeItem(row.cartItem.id);
        else updateQuantity(row.cartItem.id, newQty);
    };

    if (cart.length === 0) {
        return (
            <Flex direction="column" align="center" justify="center" h="100%" className={styles.emptyState}>
                <ScanBarcode size={80} strokeWidth={1} color="var(--mantine-color-dark-3)" />
                <Text size="xl" fw={700} c="dark.3" mt="lg">ESCANEE UN PRODUCTO</Text>
                <Text size="sm" c="dark.4" mt="xs">Use el escáner o presione F2 para buscar manualmente</Text>
            </Flex>
        );
    }

    const displayRows = buildDisplayRows(cart, promociones);

    return (
        <div className={styles.tableWrapper}>
            <Table striped highlightOnHover verticalSpacing="sm" className={styles.table}>
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
                    {displayRows.map((row, displayIndex) => {
                        const isSelected = selectedKey === row.key;

                        if (row.type === 'combo') {
                            // ── COMBO ROW ────────────────────────────────────────
                            const descuento = row.totalSinDescuento - row.totalConDescuento;
                            return (
                                <Table.Tr
                                    key={row.key}
                                    className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
                                    onClick={() => setSelectedKey(row.key)}
                                    style={{ background: 'var(--mantine-color-orange-light)' }}
                                >
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">{displayIndex + 1}</Text>
                                    </Table.Td>

                                    {/* Code cell — promo icon */}
                                    <Table.Td>
                                        <Badge
                                            size="sm"
                                            color="orange"
                                            variant="filled"
                                            leftSection={<Tag size={10} />}
                                        >
                                            PROMO
                                        </Badge>
                                    </Table.Td>

                                    {/* Product name + items detail */}
                                    <Table.Td>
                                        <Box>
                                            <Text size="sm" fw={700} c="orange.4">
                                                {row.promo.nombre}
                                            </Text>
                                            <Stack gap={0} mt={2}>
                                                {row.items.map(({ cartItem, qty }) => (
                                                    <Text key={cartItem.id} size="xs" c="dimmed" lineClamp={1}>
                                                        {qty}× {cartItem.nombre}
                                                    </Text>
                                                ))}
                                            </Stack>
                                            <Text size="xs" c="orange.5" mt={2}>
                                                −{formatCurrency(descuento)} de descuento
                                            </Text>
                                        </Box>
                                    </Table.Td>

                                    {/* Price — show discounted unit price for 1 set */}
                                    <Table.Td style={{ textAlign: 'right' }}>
                                        {row.completeSets > 1 ? (
                                            <Text size="xs" c="dimmed" ff="monospace">
                                                {formatCurrency(row.totalConDescuento / row.completeSets)}/u
                                            </Text>
                                        ) : null}
                                    </Table.Td>

                                    {/* Quantity — number of complete combos */}
                                    <Table.Td style={{ textAlign: 'center' }}>
                                        <Text size="sm" fw={700}>{row.completeSets}</Text>
                                    </Table.Td>

                                    {/* Subtotal */}
                                    <Table.Td style={{ textAlign: 'right' }}>
                                        <Box>
                                            <Text size="sm" fw={700} ff="monospace" c="orange.4">
                                                {formatCurrency(row.totalConDescuento)}
                                            </Text>
                                            {row.totalSinDescuento !== row.totalConDescuento && (
                                                <Text size="xs" c="dimmed" td="line-through" ff="monospace">
                                                    {formatCurrency(row.totalSinDescuento)}
                                                </Text>
                                            )}
                                        </Box>
                                    </Table.Td>

                                    {/* Delete */}
                                    <Table.Td>
                                        <Tooltip label="Quitar combo" withArrow>
                                            <ActionIcon
                                                size="sm"
                                                variant="subtle"
                                                color="red"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteCombo(row); }}
                                                className={styles.deleteBtn}
                                            >
                                                <Trash2 size={14} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        }

                        // ── INDIVIDUAL ROW ────────────────────────────────────
                        const { cartItem, displayQty, subtotal } = row;
                        const isLastAdded = lastAdded?.id === cartItem.id;
                        const isEditing = editingId === cartItem.id;
                        const effectivePct = Math.max(cartItem.descuento, cartItem.promoDescuento ?? 0);

                        return (
                            <Table.Tr
                                key={row.key}
                                className={`${styles.row} ${isLastAdded ? styles.rowHighlight : ''} ${isSelected ? styles.rowSelected : ''}`}
                                onClick={() => {
                                    setSelectedKey(row.key);
                                    setSelectedRowIndex(row.cartIndex);
                                }}
                            >
                                <Table.Td>
                                    <Text size="sm" c="dimmed">{displayIndex + 1}</Text>
                                </Table.Td>

                                <Table.Td>
                                    <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                                        {cartItem.codigoBarras}
                                    </Text>
                                </Table.Td>

                                <Table.Td>
                                    <Box>
                                        <Text size="sm" fw={600} lineClamp={1}>
                                            {cartItem.nombre}
                                        </Text>
                                        {/* Manual discount or single-product promo badge */}
                                        {effectivePct > 0 && !cartItem.promoNombre && (
                                            <Badge size="xs" color="orange" variant="light" mt={2}>
                                                −{Math.round(effectivePct * 10) / 10}% dto.
                                            </Badge>
                                        )}
                                        {effectivePct > 0 && cartItem.promoNombre && (
                                            <Badge size="xs" color="orange" variant="light" mt={2}>
                                                🏷 {cartItem.promoNombre}
                                            </Badge>
                                        )}
                                    </Box>
                                </Table.Td>

                                <Table.Td style={{ textAlign: 'right' }}>
                                    <Text size="sm" c="dimmed" ff="monospace">
                                        {formatCurrency(cartItem.precio)}
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
                                            onBlur={() => commitEdit(cartItem.id, cartItem.cantidad, displayQty)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') commitEdit(cartItem.id, cartItem.cantidad, displayQty);
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
                                                        const newTotal = cartItem.cantidad - 1;
                                                        if (newTotal <= 0) removeItem(cartItem.id);
                                                        else updateQuantity(cartItem.id, newTotal);
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
                                                        startEdit(cartItem.id, displayQty);
                                                    }}
                                                >
                                                    <Text size="sm" fw={700}>{displayQty}</Text>
                                                </Box>
                                            </Tooltip>

                                            <Tooltip label="Sumar" position="top" withArrow>
                                                <ActionIcon
                                                    size="xs"
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateQuantity(cartItem.id, cartItem.cantidad + 1);
                                                    }}
                                                >
                                                    <Plus size={10} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </Table.Td>

                                <Table.Td style={{ textAlign: 'right' }}>
                                    <Text size="sm" fw={700} ff="monospace">
                                        {formatCurrency(subtotal)}
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
                                                handleDeleteIndividual(row);
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
