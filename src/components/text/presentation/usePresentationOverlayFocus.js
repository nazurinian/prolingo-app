import { useLayoutEffect, useRef } from 'react';

const focusable = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';
const canFocus = element => element?.isConnected && element.getClientRects().length > 0
  && !element.matches(':disabled') && !element.closest('[inert]');
let mostRecentOpening = 0;

export const usePresentationOverlayFocus = ({ open, panelRef, onClose, contain = true, returnFocus }) => {
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  useLayoutEffect(() => {
    closeRef.current = onClose;
    returnFocusRef.current = returnFocus;
  }, [onClose, returnFocus]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return undefined;
    const opening = ++mostRecentOpening;
    const opener = document.activeElement;
    panel.focus({ preventScroll: true });

    const onKeyDown = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeRef.current?.();
      }
      if (!contain || event.key !== 'Tab' || event.defaultPrevented) return;
      const stops = [...panel.querySelectorAll(focusable)].filter(element => element.tabIndex >= 0 && canFocus(element));
      const index = stops.indexOf(document.activeElement);
      if (index < 0 || (event.shiftKey ? index === 0 : index === stops.length - 1)) {
        event.preventDefault();
        (stops[event.shiftKey ? stops.length - 1 : 0] || panel).focus({ preventScroll: true });
      }
    };
    const onFocus = event => {
      if (!panel.contains(event.target)) panel.focus({ preventScroll: true });
    };
    const preventBackgroundScroll = event => {
      if (!panel.contains(event.target)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    if (contain) {
      document.addEventListener('focusin', onFocus);
      window.addEventListener('wheel', preventBackgroundScroll, { passive: false });
      window.addEventListener('touchmove', preventBackgroundScroll, { passive: false });
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('wheel', preventBackgroundScroll);
      window.removeEventListener('touchmove', preventBackgroundScroll);
      requestAnimationFrame(() => {
        if (opening !== mostRecentOpening) return;
        if (document.activeElement !== document.body && !panel.contains(document.activeElement)) return;
        const preferred = returnFocusRef.current?.();
        const target = canFocus(preferred) ? preferred : opener !== document.body ? opener : null;
        if (canFocus(target)) target.focus({ preventScroll: true });
      });
    };
  }, [open, panelRef, contain]);
};
