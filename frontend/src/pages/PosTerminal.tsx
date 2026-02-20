import { useRef, useCallback, useState, useEffect } from 'react';
import { TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ScanLine, AlertCircle } from 'lucide-react';

import { PosHeader } from '../components/pos/PosHeader';
import { SalesTable } from '../components/pos/SalesTable';
import { TotalPanel } from '../components/pos/TotalPanel';
import { HotkeysFooter } from '../components/pos/HotkeysFooter';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ProductSearch } from '../components/pos/ProductSearch';
import { PriceCheckModal } from '../components/pos/PriceCheckModal';
import { DiscountModal } from '../components/pos/DiscountModal';
import { SaleHistoryModal } from '../components/pos/SaleHistoryModal';
import { AbrirCajaModal } from '../components/pos/AbrirCajaModal';

import { useSaleStore } from '../store/useSaleStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCajaStore } from '../store/useCajaStore';
import { usePosFocus } from '../hooks/usePosFocus';
import { findProductByBarcode, MOCK_PRODUCTS } from '../api/mockProducts';
import { findCatalogProductByBarcode, searchCatalogProducts, seedCatalogFromMocksIfEmpty } from '../offline/catalog';
import { getPrecioPorBarcode } from '../services/api/products';

import styles from './PosTerminal.module.css';

export function PosTerminal() {
    const scannerRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [searchVisible, setSearchVisible] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const {
        cart,
        isPaymentModalOpen,
        isPriceCheckModalOpen,
        isDiscountModalOpen,
        addItem,
        clearCart,
        openPaymentModal,
        closePaymentModal,
        openPriceCheckModal,
        closePriceCheckModal,
        openDiscountModal,
        closeDiscountModal,
        openItemDiscountModal,
        moveSelectionUp,
        moveSelectionDown,
        removeSelectedItem,
        selectedRowIndex,
        updateQuantity,
    } = useSaleStore();

    const setCajero = useSaleStore((s) => s.setCajero);
    const { user } = useAuthStore();
    const { sesionId, restaurar } = useCajaStore();

    // Al montar, sincronizar sesión de caja con el backend (limpia localStorage obsoleto)
    useEffect(() => {
        restaurar().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mostrar modal de apertura de caja si no hay sesión activa
    const [cajaModalOpen, setCajaModalOpen] = useState(false);
    useEffect(() => {
        if (!sesionId) setCajaModalOpen(true);
    }, [sesionId]);

    // Seed catálogo desde API (o mocks como fallback)
    useEffect(() => {
        seedCatalogFromMocksIfEmpty().catch(console.warn);
    }, []);

    // Sync the cashier name from the auth store into the sale store
    useEffect(() => {
        if (user?.nombre) setCajero(user.nombre);
    }, [user?.nombre, setCajero]);

    const anyModalOpen = isPaymentModalOpen || isPriceCheckModalOpen || isDiscountModalOpen || historyOpen;

    // Sticky focus: auto-return to scanner after 2s inactivity
    usePosFocus(scannerRef, anyModalOpen);

    // ── Añadir producto por código de barras o nombre ─────────────────
    const handleAddProduct = useCallback(
        async (value: string): Promise<boolean> => {
            const trimmed = value.trim();
            if (!trimmed) return false;

            // 1️⃣ Intentar por API real (solo si hay backend configurado y online)
            if (import.meta.env.VITE_API_URL && navigator.onLine) {
                try {
                    const apiProduct = await getPrecioPorBarcode(trimmed);
                    // getPrecioPorBarcode lanza error si no encuentra → catch abajo
                    // Si llega aquí, hay un producto válido. Buscar en catálogo local para obtener el id.
                    const local = await findCatalogProductByBarcode(trimmed);
                    if (local) {
                        addItem({ id: local.id, nombre: apiProduct.nombre, precio: apiProduct.precio_venta, codigoBarras: trimmed });
                        return true;
                    }
                } catch {
                    // No encontrado en API → continuar con fallbacks locales
                }
            }

            // 2️⃣ Intentar por código de barras exacto en IndexedDB
            const product = await findCatalogProductByBarcode(trimmed);
            if (product) {
                addItem({ id: product.id, nombre: product.nombre, precio: product.precio, codigoBarras: product.codigoBarras });
                return true;
            }

            // 3️⃣ Fallback: mock lookup por barcode (por si el seed aún no terminó)
            const productMock = findProductByBarcode(trimmed);
            if (productMock) {
                addItem({ id: productMock.id, nombre: productMock.nombre, precio: productMock.precio, codigoBarras: productMock.codigoBarras });
                return true;
            }

            // 4️⃣ Fallback: buscar por nombre parcial en IndexedDB
            const results = await searchCatalogProducts(trimmed, 1);
            const match = results[0];
            if (match) {
                addItem({ id: match.id, nombre: match.nombre, precio: match.precio, codigoBarras: match.codigoBarras });
                return true;
            }

            // 5️⃣ Fallback: mock búsqueda por nombre (por si el seed aún no terminó)
            const matchMock = MOCK_PRODUCTS.find((p) =>
                p.nombre.toLowerCase().includes(trimmed.toLowerCase())
            );
            if (matchMock) {
                addItem({ id: matchMock.id, nombre: matchMock.nombre, precio: matchMock.precio, codigoBarras: matchMock.codigoBarras });
                return true;
            }

            // Producto no encontrado: notificación de error
            notifications.show({
                title: 'Producto no encontrado',
                message: `No se encontró ningún producto para: "${trimmed}"`,
                color: 'red',
                icon: <AlertCircle size={16} />,
                autoClose: 3000,
            });
            return false;
        },
        [addItem]
    );

    // ── Scanner input handler ─────────────────────────────────────────
    const handleScannerKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            // Dejar que el listener global en window maneje los hotkeys F, Escape y +/-
            if (e.key.startsWith('F') || e.key === 'Escape') return;

            // Flechas: navegar tabla sin mover el cursor del input
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                return; // el window listener lo maneja
            }

            // +/- quantity hotkeys: only if nothing typed yet in the scanner field
            if ((e.key === '+' || e.key === '-' || e.key === 'Add' || e.key === 'Subtract') &&
                (e.currentTarget.value === '' || e.key === 'Add' || e.key === 'Subtract')) {
                return; // el window listener lo maneja
            }

            if (e.key !== 'Enter') return;
            const input = e.currentTarget;
            handleAddProduct(input.value).then((added) => {
                if (added) input.value = '';
            });
        },
        [handleAddProduct]
    );

    const openSearch = useCallback(() => {
        setSearchVisible(true);
    }, []);

    const closeSearch = useCallback(() => {
        setSearchVisible(false);
        setTimeout(() => scannerRef.current?.focus(), 50);
    }, []);

    // ── Global hotkeys (window-level — funciona aunque el foco esté en el input) ──
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'F2':
                    e.preventDefault();
                    if (!anyModalOpen) openSearch();
                    break;

                case 'F3':
                    e.preventDefault();
                    if (!anyModalOpen && cart.length > 0) {
                        const safeIndex = selectedRowIndex >= 0 && selectedRowIndex < cart.length ? selectedRowIndex : 0;
                        const item = cart[safeIndex];
                        if (item) openItemDiscountModal(item.id);
                    }
                    break;

                case 'F5':
                    e.preventDefault();
                    if (!anyModalOpen) openPriceCheckModal();
                    break;

                case 'F7':
                    e.preventDefault();
                    if (!anyModalOpen) setHistoryOpen(true);
                    break;

                case 'F8':
                    e.preventDefault();
                    if (!anyModalOpen && cart.length > 0) openDiscountModal();
                    break;

                case 'F10':
                    e.preventDefault();
                    if (!anyModalOpen && cart.length > 0) openPaymentModal();
                    break;

                case 'Escape':
                    e.preventDefault();
                    if (isPaymentModalOpen)       closePaymentModal();
                    else if (isPriceCheckModalOpen) closePriceCheckModal();
                    else if (isDiscountModalOpen)  closeDiscountModal();
                    else if (historyOpen)          setHistoryOpen(false);
                    else if (searchVisible)        closeSearch();
                    else if (cart.length > 0)      clearCart();
                    break;

                case 'ArrowUp':
                    if (anyModalOpen || searchVisible) break;
                    e.preventDefault();
                    moveSelectionUp();
                    break;

                case 'ArrowDown':
                    if (anyModalOpen || searchVisible) break;
                    e.preventDefault();
                    moveSelectionDown();
                    break;

                case 'Delete':
                    if (anyModalOpen || searchVisible) break;
                    e.preventDefault();
                    if (cart.length > 0) removeSelectedItem();
                    break;

                case '+':
                case 'Add':
                    if (anyModalOpen || searchVisible) break;
                    if (selectedRowIndex >= 0 && selectedRowIndex < cart.length) {
                        e.preventDefault();
                        const itemP = cart[selectedRowIndex];
                        updateQuantity(itemP.id, itemP.cantidad + 1);
                    }
                    break;

                case '-':
                case 'Subtract':
                    if (anyModalOpen || searchVisible) break;
                    if (selectedRowIndex >= 0 && selectedRowIndex < cart.length) {
                        e.preventDefault();
                        const itemM = cart[selectedRowIndex];
                        if (itemM.cantidad > 1) updateQuantity(itemM.id, itemM.cantidad - 1);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [
        anyModalOpen, searchVisible,
        cart,
        isPaymentModalOpen, isPriceCheckModalOpen, isDiscountModalOpen, historyOpen,
        openSearch, closeSearch,
        openPaymentModal, closePaymentModal,
        openPriceCheckModal, closePriceCheckModal,
        openDiscountModal, closeDiscountModal,
        openItemDiscountModal,
        clearCart, removeSelectedItem,
        moveSelectionUp, moveSelectionDown,
        selectedRowIndex, updateQuantity,
    ]);

    return (
        <div className={styles.posLayout}>
            {/* ── Header ─────────────────────────────────────────── */}
            <PosHeader />

            {/* ── Main Content ───────────────────────────────────── */}
            <main className={styles.mainContent}>
                {/* Columna izquierda: Scanner + Tabla de Ventas (70%) */}
                <section className={styles.salesSection}>
                    <TextInput
                        ref={scannerRef}
                        placeholder="Escanee código de barras o escriba nombre del producto..."
                        leftSection={<ScanLine size={18} />}
                        size="md"
                        className={styles.scannerInput}
                        classNames={{ input: styles.scannerInputField }}
                        onKeyDown={handleScannerKeyDown}
                        autoFocus
                    />

                    <div className={styles.tableArea}>
                        <SalesTable />
                    </div>
                </section>

                {/* Columna derecha: Panel de Total (30%) */}
                <TotalPanel />
            </main>

            {/* ── Footer ─────────────────────────────────────────── */}
            <HotkeysFooter />

            {/* ── Modales ────────────────────────────────────────── */}
            <PaymentModal />
            <PriceCheckModal />
            <DiscountModal />
            <SaleHistoryModal opened={historyOpen} onClose={() => setHistoryOpen(false)} />

            {/* ── Modal apertura de caja ─────────────────────────── */}
            <AbrirCajaModal
                opened={cajaModalOpen}
                onSuccess={() => setCajaModalOpen(false)}
            />

            {/* ── Búsqueda flotante (F2) ──────────────────────────── */}
            {searchVisible && (
                <ProductSearch onClose={closeSearch} inputRef={searchRef} />
            )}
        </div>
    );
}
