import { create } from 'zustand';
import type { SaleRecord } from './useSaleStore';

// ── State interface ───────────────────────────────────────────────────────────

interface POSUIState {
    isPaymentModalOpen: boolean;
    isComprobanteModalOpen: boolean;
    isPriceCheckModalOpen: boolean;
    isDiscountModalOpen: boolean;
    discountTargetItemId: string | null;
    tipoComprobante: 'ticket' | 'factura_b' | 'factura_a';

    /** Post-sale modal state */
    isPostSaleModalOpen: boolean;
    lastSaleRecord: SaleRecord | null;

    // Modal actions
    openPaymentModal: () => void;
    closePaymentModal: () => void;
    openComprobanteModal: () => void;
    closeComprobanteModal: () => void;
    setTipoComprobante: (tipo: 'ticket' | 'factura_b' | 'factura_a') => void;
    openPriceCheckModal: () => void;
    closePriceCheckModal: () => void;
    openDiscountModal: () => void;
    closeDiscountModal: () => void;
    /** Opens the per-item discount modal pre-filled for the given item id. */
    openItemDiscountModal: (itemId: string) => void;
    /** Opens the post-sale modal showing print/email confirmation */
    openPostSaleModal: (record: SaleRecord) => void;
    closePostSaleModal: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePOSUIStore = create<POSUIState>()((set) => ({
    isPaymentModalOpen: false,
    isComprobanteModalOpen: false,
    isPriceCheckModalOpen: false,
    isDiscountModalOpen: false,
    discountTargetItemId: null,
    tipoComprobante: 'ticket' as const,
    isPostSaleModalOpen: false,
    lastSaleRecord: null,

    openPaymentModal: () => set({ isPaymentModalOpen: true }),
    closePaymentModal: () => set({ isPaymentModalOpen: false }),
    openComprobanteModal: () => set({ isComprobanteModalOpen: true }),
    closeComprobanteModal: () => set({ isComprobanteModalOpen: false }),
    setTipoComprobante: (tipo) => set({ tipoComprobante: tipo }),
    openPriceCheckModal: () => set({ isPriceCheckModalOpen: true }),
    closePriceCheckModal: () => set({ isPriceCheckModalOpen: false }),
    openDiscountModal: () => set({ isDiscountModalOpen: true, discountTargetItemId: null }),
    closeDiscountModal: () => set({ isDiscountModalOpen: false, discountTargetItemId: null }),
    openItemDiscountModal: (itemId) => set({ isDiscountModalOpen: true, discountTargetItemId: itemId }),
    openPostSaleModal: (record) => set({ isPostSaleModalOpen: true, lastSaleRecord: record }),
    closePostSaleModal: () => set({ isPostSaleModalOpen: false, lastSaleRecord: null }),
}));
