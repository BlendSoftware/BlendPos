import { useEffect, useCallback, type RefObject } from 'react';

/**
 * usePosFocus — "Focus Magnet" / "Sticky Focus" Hook
 *
 * Ensures the scanner input always reclaims focus after a period of
 * inactivity (default: 2 seconds). This prevents the POS terminal from
 * losing keyboard input when the cashier accidentally clicks on
 * non-interactive areas or after closing modals.
 *
 * HOW IT WORKS:
 * 1. An inactivity timer starts (or resets) every time the user interacts
 *    (keydown, mousedown, or focusin).
 * 2. When the timer fires, it checks if the currently focused element is
 *    a "POS-focusable" element (marked with `data-pos-focusable`). If
 *    it is, we leave it alone — the user is intentionally typing somewhere.
 * 3. Otherwise, focus is forced back to the scanner input ref.
 * 4. When a monitored boolean (e.g. `isPaymentModalOpen`) transitions
 *    from `true` → `false`, focus is immediately restored without waiting
 *    for the inactivity timeout.
 *
 * USAGE:
 *   const scannerRef = useRef<HTMLInputElement>(null);
 *   usePosFocus(scannerRef, isPaymentModalOpen);
 *
 * Mark any input that should NOT be stolen from with:
 *   <TextInput data-pos-focusable ... />
 */

interface UsePosFocusOptions {
    /** Inactivity timeout in ms before focus snaps back (default: 2000) */
    timeout?: number;
    /** If true, the hook is disabled (e.g. while a modal is open) */
    disabled?: boolean;
}

export function usePosFocus(
    scannerRef: RefObject<HTMLInputElement | null>,
    modalOpen: boolean,
    options: UsePosFocusOptions = {}
): void {
    const { timeout = 2000, disabled = false } = options;

    const focusScanner = useCallback(() => {
        const active = document.activeElement as HTMLElement | null;

        // Don't steal focus from intentionally focusable POS inputs
        if (active?.hasAttribute('data-pos-focusable')) {
            return;
        }

        scannerRef.current?.focus({ preventScroll: true });
    }, [scannerRef]);

    // ── Inactivity timer ──────────────────────────────────────────────
    useEffect(() => {
        if (disabled || modalOpen) return;

        let timerId: ReturnType<typeof setTimeout>;

        const resetTimer = () => {
            clearTimeout(timerId);
            timerId = setTimeout(focusScanner, timeout);
        };

        // Start the initial timer
        resetTimer();

        // Reset on any user interaction
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('mousedown', resetTimer);
        window.addEventListener('focusin', resetTimer);

        return () => {
            clearTimeout(timerId);
            window.removeEventListener('keydown', resetTimer);
            window.removeEventListener('mousedown', resetTimer);
            window.removeEventListener('focusin', resetTimer);
        };
    }, [focusScanner, timeout, disabled, modalOpen]);

    // ── Restore focus on modal close ─────────────────────────────────
    useEffect(() => {
        if (!modalOpen) {
            // Small delay to let the modal finish its close animation
            const id = setTimeout(focusScanner, 100);
            return () => clearTimeout(id);
        }
    }, [modalOpen, focusScanner]);
}
