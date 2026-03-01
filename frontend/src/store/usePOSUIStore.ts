import { create } from 'zustand';

// ── State interface ───────────────────────────────────────────────────────────

interface POSUIState {
    isPaymentModalOpen: boolean;
    isComprobanteModalOpen: boolean;
    isPriceCheckModalOpen: boolean;
    isDiscountModalOpen: boolean;
    discountTargetItemId: string | null;
    tipoComprobante: 'ticket' | 'factura_b' | 'factura_a';

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
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePOSUIStore = create<POSUIState>()((set) => ({
    isPaymentModalOpen: false,
    isComprobanteModalOpen: false,
    isPriceCheckModalOpen: false,
    isDiscountModalOpen: false,
    discountTargetItemId: null,
    tipoComprobante: 'ticket' as const,

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
}));
