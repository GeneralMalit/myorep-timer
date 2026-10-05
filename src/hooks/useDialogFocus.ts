import { useEffect, useLayoutEffect, useRef } from 'react';

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const modalLayer = (element: Element): number => {
    let layer = 0;
    for (let current: Element | null = element; current; current = current.parentElement) {
        layer = Math.max(layer, Number.parseInt(getComputedStyle(current).zIndex, 10) || 0);
    }
    return layer;
};

/** Trap focus in the topmost modal and return it to its opener on dismissal. */
export const useDialogFocus = (open: boolean, onClose: () => void) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
    // Restore after commit: React otherwise refocuses controls in still-mounted closed drawers.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!open || !dialog) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
            .filter((element) => element.tabIndex >= 0 && !element.closest('[inert], [aria-hidden="true"], [hidden]')
                && (element.checkVisibility ? element.checkVisibility({ visibilityProperty: true }) : getComputedStyle(element).display !== 'none'));
        if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
            let top: Element | null = null;
            let topLayer = -1;
            for (const candidate of dialogs) {
                const layer = modalLayer(candidate);
                if (layer >= topLayer) {
                    top = candidate;
                    topLayer = layer;
                }
            }
            if (top !== dialog) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeRef.current();
            } else if (event.key === 'Tab') {
                const elements = focusable();
                const first = elements[0];
                const last = elements[elements.length - 1];
                if (!first) {
                    event.preventDefault();
                    dialog.focus();
                } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (previous?.isConnected && (dialog.contains(document.activeElement) || document.activeElement === document.body)) previous.focus();
        };
    }, [open]);
    return dialogRef;
};
