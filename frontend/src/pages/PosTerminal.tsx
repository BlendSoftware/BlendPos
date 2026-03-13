import { useRef, useCallback, useState, useEffect } from 'react';
import { TextInput, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ScanLine, AlertCircle } from 'lucide-react';

import { PosHeader } from '../components/pos/PosHeader';
import { SalesTable } from '../components/pos/SalesTable';
import { TotalPanel } from '../components/pos/TotalPanel';
import { HotkeysFooter } from '../components/pos/HotkeysFooter';
import { PaymentModal } from '../components/pos/PaymentModal';
// ComprobanteModal ya no es necesario - se selecciona el tipo dentro de PaymentModal
// import { ComprobanteModal } from '../components/pos/ComprobanteModal';
import { ProductSearch } from '../components/pos/ProductSearch';
import { PriceCheckModal } from '../components/pos/PriceCheckModal';
import { DiscountModal } from '../components/pos/DiscountModal';
import { SaleHistoryModal } from '../components/pos/SaleHistoryModal';
import { PostSaleModal } from '../components/pos/PostSaleModal';
import { AbrirCajaModal } from '../components/pos/AbrirCajaModal';

import { useCartStore } from '../store/useCartStore';
import { usePOSUIStore } from '../store/usePOSUIStore';
import { useSaleStore } from '../store/useSaleStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCajaStore } from '../store/useCajaStore';
import { usePromocionesStore } from '../store/usePromocionesStore';
import { usePosFocus } from '../hooks/usePosFocus';
import { findCatalogProductByBarcode, searchCatalogProducts, seedCatalogFromMocksIfEmpty, forceRefreshCatalog } from '../offline/catalog';
import { getPrecioPorBarcode } from '../services/api/products';

import styles from './PosTerminal.module.css';

export function PosTerminal() {
    const scannerRef = useRef<HTMLInputElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [scannerValue, setScannerValue] = useState('');
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchInitialQuery, setSearchInitialQuery] = useState('');
    const [historyOpen, setHistoryOpen] = useState(false);

    const {
        cart,
        addItem,
        clearCart,
        moveSelectionUp,
        moveSelectionDown,
        removeSelectedItem,
        selectedRowIndex,
        updateQuantity,
        setPromoDiscounts,
    } = useCartStore();

    const {
        isPaymentModalOpen,
        isPriceCheckModalOpen,
        isDiscountModalOpen,
        // isComprobanteModalOpen, // Ya no se usa
        openPaymentModal,
        closePaymentModal,
        // openComprobanteModal, // Ya no se usa
        // closeComprobanteModal, // Ya no se usa
        openPriceCheckModal,
        closePriceCheckModal,
        openDiscountModal,
        closeDiscountModal,
        openItemDiscountModal,
    } = usePOSUIStore();

    const setCajero = useSaleStore((s) => s.setCajero);
    const syncTicketCounter = useSaleStore((s) => s.syncTicketCounter);
    const { user } = useAuthStore();
    const { sesionId, restaurar } = useCajaStore();
    const { fetchActivePromociones, promociones, computePromoDescuentos } = usePromocionesStore();
    const [isInitializing, setIsInitializing] = useState(true);

    // Al montar, sincronizar sesión de caja con el backend (limpia localStorage obsoleto)
    useEffect(() => {
        restaurar()
            .catch((err) => {
                console.warn('Error al restaurar sesión de caja:', err);
            })
            .finally(() => setIsInitializing(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sincronizar el contador de tickets con el backend al iniciar
    useEffect(() => {
        syncTicketCounter().catch(console.warn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mostrar modal de apertura de caja si no hay sesión activa.
    // SOLO se evalúa cuando isInitializing es false (después de consultar el backend).
    const [cajaModalOpen, setCajaModalOpen] = useState(false);
    useEffect(() => {
        if (isInitializing) return;
        // Pequeño delay para evitar condición de carrera
        const timer = setTimeout(() => {
            const shouldOpen = !sesionId;
            setCajaModalOpen(shouldOpen);
        }, 100);
        return () => clearTimeout(timer);
    }, [sesionId, isInitializing]);

    // Sincronizar catálogo desde el backend en cada apertura del POS.
    // Usa forceRefreshCatalog para garantizar que nuevos productos del admin
    // sean siempre visibles sin importar el estado del IndexedDB local.
    // También precargamos las promociones activas para aplicarlas al agregar productos.
    useEffect(() => {
        forceRefreshCatalog().catch(() => seedCatalogFromMocksIfEmpty().catch(console.warn));
        fetchActivePromociones();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync the cashier name from the auth store into the sale store
    useEffect(() => {
        if (user?.nombre) setCajero(user.nombre);
    }, [user?.nombre, setCajero]);

    // ── Combo / quantity promotion detection ────────────────────────────
    // Re-runs when the cart's product composition or quantities change, or when
    // the promotions list is refreshed (e.g. on POS mount).
    const cartKey = cart.map((c) => `${c.id}:${c.cantidad}`).sort().join(',');
    useEffect(() => {
        const cartProductIds = cart.map((c) => c.id);
        const priceMap: Record<string, number> = {};
        const quantityMap: Record<string, number> = {};
        cart.forEach((c) => { priceMap[c.id] = c.precio; quantityMap[c.id] = c.cantidad; });
        const { descuentos, promoNombres } = computePromoDescuentos(cartProductIds, priceMap, quantityMap);
        setPromoDiscounts(descuentos, promoNombres);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cartKey, promociones]);

    const anyModalOpen = isPaymentModalOpen || isPriceCheckModalOpen || isDiscountModalOpen || historyOpen;

    // Sticky focus: auto-return to scanner after 2s inactivity
    usePosFocus(scannerRef, anyModalOpen);

    // ── Añadir producto por código de barras o nombre ─────────────────
    const handleAddProduct = useCallback(
        async (value: string): Promise<boolean> => {
            const trimmed = value.trim();
            if (!trimmed) return false;

            // 1️⃣ Precio en tiempo real desde el backend (con datos frescos)
            if (import.meta.env.VITE_API_BASE && navigator.onLine) {
                try {
                    const apiProduct = await getPrecioPorBarcode(trimmed);
                    // Check stock before adding
                    if (apiProduct.stock_disponible <= 0) {
                        notifications.show({
                            title: 'Sin stock',
                            message: `"${apiProduct.nombre}" no tiene stock disponible`,
                            color: 'orange',
                            icon: <AlertCircle size={16} />,
                            autoClose: 3000,
                        });
                        return false;
                    }
                    const local = await findCatalogProductByBarcode(trimmed);
                    if (local) {
                        addItem({ id: local.id, nombre: apiProduct.nombre, precio: apiProduct.precio_venta, codigoBarras: trimmed });
                        return true;
                    }
                } catch {
                    // No encontrado por barcode exacto → continuar
                }
            }

            // 2️⃣ Catálogo local (IndexedDB sincronizado desde backend) — por barcode
            // findCatalogProductByBarcode ya filtra stock > 0
            const product = await findCatalogProductByBarcode(trimmed);
            if (product) {
                addItem({ id: product.id, nombre: product.nombre, precio: product.precio, codigoBarras: product.codigoBarras });
                return true;
            }

            // 3️⃣ Catálogo local — búsqueda por nombre parcial
            // searchCatalogProducts ya filtra stock > 0
            const results = await searchCatalogProducts(trimmed, 1);
            const match = results[0];
            if (match) {
                addItem({ id: match.id, nombre: match.nombre, precio: match.precio, codigoBarras: match.codigoBarras });
                return true;
            }

            // Producto no encontrado
            notifications.show({
                title: 'Producto no encontrado',
                message: `No se encontró ningún producto con stock para: "${trimmed}"`,
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
                (scannerValue === '' || e.key === 'Add' || e.key === 'Subtract')) {
                return; // el window listener lo maneja
            }

            if (e.key !== 'Enter') return;
            handleAddProduct(scannerValue).then((added) => {
                if (added) setScannerValue('');
            });
        },
        [handleAddProduct, scannerValue]
    );

    const openSearch = useCallback((initialQuery = '') => {
        setSearchInitialQuery(initialQuery);
        setSearchVisible(true);
    }, []);

    const closeSearch = useCallback(() => {
        setSearchVisible(false);
        setSearchInitialQuery('');
        // Clear the scanner input via state (controlled component)
        setScannerValue('');
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
                    if (isPaymentModalOpen) closePaymentModal();
                    else if (isPriceCheckModalOpen) closePriceCheckModal();
                    else if (isDiscountModalOpen) closeDiscountModal();
                    else if (historyOpen) setHistoryOpen(false);
                    else if (searchVisible) closeSearch();
                    // Clear scanner input via state to prevent "null" text
                    setScannerValue('');
                    // NOTE: No clearCart() on bare Escape to prevent accidental cart deletion
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

    // ── EARLY RETURN: Mientras se verifica la sesión de caja, NO renderizar el POS.
    // Esto evita el deadlock donde el modal de apertura se renderiza antes
    // de que restaurar() termine de consultar el backend.
    if (isInitializing) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                width: '100vw',
                background: 'var(--mantine-color-body)',
            }}>
                <Loader size="xl" color="blue" type="dots" />
            </div>
        );
    }

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
                        value={scannerValue}
                        placeholder="Escanee código de barras o escriba nombre del producto..."
                        leftSection={<ScanLine size={18} />}
                        size="md"
                        className={styles.scannerInput}
                        classNames={{ input: styles.scannerInputField }}
                        onKeyDown={handleScannerKeyDown}
                        onChange={(e) => {
                            const val = e.currentTarget.value;
                            setScannerValue(val);
                            // Si el valor contiene letras, abrir búsqueda automáticamente
                            if (val && /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(val) && !searchVisible && !anyModalOpen) {
                                openSearch(val);
                            }
                        }}
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
            {/* ComprobanteModal removido - se selecciona tipo dentro de PaymentModal */}
            <PaymentModal />
            <PriceCheckModal />
            <DiscountModal />
            <SaleHistoryModal opened={historyOpen} onClose={() => setHistoryOpen(false)} />
            <PostSaleModal />

            {/* ── Modal apertura de caja ─────────────────────────── */}
            <AbrirCajaModal
                opened={cajaModalOpen}
                onSuccess={() => setCajaModalOpen(false)}
            />

            {/* ── Búsqueda flotante (F2) ──────────────────────────── */}
            {searchVisible && (
                <ProductSearch onClose={closeSearch} inputRef={searchRef} initialQuery={searchInitialQuery} />
            )}
        </div>
    );
}
