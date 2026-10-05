import { useState } from 'react';
import { createPortal } from 'react-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogFocus } from '@/hooks/useDialogFocus';

const LayeredDialogs = () => {
    const [baseOpen, setBaseOpen] = useState(false);
    const [higherOpen, setHigherOpen] = useState(false);
    const baseRef = useDialogFocus(baseOpen, () => setBaseOpen(false));
    const higherRef = useDialogFocus(higherOpen, () => setHigherOpen(false));

    return (
        <>
            <button onClick={() => setBaseOpen(true)}>Open settings</button>
            {higherOpen && (
                <div ref={higherRef} role="dialog" aria-modal="true" aria-label="Account prompt" tabIndex={-1} style={{ position: 'fixed', zIndex: 120 }}>
                    <button onClick={() => setHigherOpen(false)}>Close prompt</button>
                </div>
            )}
            {baseOpen && createPortal(
                <div style={{ position: 'fixed', zIndex: 100 }}>
                    <div ref={baseRef} role="dialog" aria-modal="true" aria-label="Settings" tabIndex={-1}>
                        <button onClick={() => setHigherOpen(true)}>Open account prompt</button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

const KeyboardDialog = () => {
    const [open, setOpen] = useState(true);
    const ref = useDialogFocus(open, () => setOpen(false));
    return open ? (
        <div ref={ref} role="dialog" aria-modal="true">
            <button>Tab stop</button>
            <button tabIndex={-1}>Programmatic control</button>
        </div>
    ) : null;
};

describe('useDialogFocus', () => {
    it('dismisses the higher layer before a later body portal and restores each opener', () => {
        render(<LayeredDialogs />);
        const opener = screen.getByRole('button', { name: 'Open settings' });
        opener.focus();
        fireEvent.click(opener);
        const nestedOpener = screen.getByRole('button', { name: 'Open account prompt' });
        fireEvent.click(nestedOpener);
        expect(screen.getByRole('button', { name: 'Close prompt' })).toHaveFocus();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Account prompt' })).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
        expect(nestedOpener).toHaveFocus();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it('wraps keyboard focus without visiting deliberately non-tabbable controls', () => {
        render(<KeyboardDialog />);
        const tabStop = screen.getByRole('button', { name: 'Tab stop' });
        expect(tabStop).toHaveFocus();
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(tabStop).toHaveFocus();
        expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(false);
        expect(tabStop).toHaveFocus();
    });
});
