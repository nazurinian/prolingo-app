import { useLayoutEffect, useRef, useState } from 'react';

const readViewport = () => {
  if (typeof window === 'undefined') return null;
  const visual = window.visualViewport;
  return {
    width: Math.round(visual?.width || window.innerWidth || 0),
    height: Math.round(visual?.height || window.innerHeight || 0),
  };
};

/**
 * Freeze an overlay to the visual viewport size it opened with.
 * Mobile browser chrome frequently expands/collapses while scrolling; allowing
 * 100dvh to follow every height change makes modal/sheet geometry visibly jump.
 *
 * We still allow the frozen viewport to SHRINK when necessary so controls are
 * never pushed below newly-visible browser chrome. Height-only expansion is
 * intentionally deferred until the overlay is closed/reopened.
 */
export const useStableOverlayViewport = (open) => {
  const [viewport, setViewport] = useState(null);
  const baselineRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      baselineRef.current = null;
      setViewport(null);
      return undefined;
    }

    const capture = readViewport();
    baselineRef.current = capture;
    setViewport(capture);

    const visual = window.visualViewport;
    const handleResize = () => {
      const next = readViewport();
      const baseline = baselineRef.current;
      if (!next || !baseline) return;

      const widthChanged = Math.abs(next.width - baseline.width) > 24;
      const needsShrink = next.height < baseline.height - 12;
      if (widthChanged || needsShrink) {
        baselineRef.current = next;
        setViewport(next);
      }
    };

    visual?.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      visual?.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [open]);

  return viewport
    ? {
        height: `${viewport.height}px`,
        width: `${viewport.width}px`,
        '--prolingo-overlay-height': `${viewport.height}px`,
      }
    : {
        height: '100dvh',
        width: '100%',
        '--prolingo-overlay-height': '100dvh',
      };
};

/**
 * Live visual-viewport binding for mobile bottom sheets that should remain
 * attached to the currently visible browser viewport while browser chrome
 * expands/collapses. Geometry updates are written directly to the overlay DOM
 * node in requestAnimationFrame, avoiding React rerenders during the browser's
 * own viewport animation.
 */
export const useLiveOverlayViewportRef = (open) => {
  const overlayRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;

    const visual = window.visualViewport;
    let frame = 0;

    const applyViewport = () => {
      frame = 0;
      const node = overlayRef.current;
      if (!node) return;

      const width = Math.round(visual?.width || window.innerWidth || 0);
      const height = Math.round(visual?.height || window.innerHeight || 0);
      const offsetLeft = Math.round(visual?.offsetLeft || 0);
      const offsetTop = Math.round(visual?.offsetTop || 0);

      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      node.style.transform = `translate3d(${offsetLeft}px, ${offsetTop}px, 0)`;
      node.style.setProperty('--prolingo-overlay-width', `${width}px`);
      node.style.setProperty('--prolingo-overlay-height', `${height}px`);
    };

    const scheduleViewport = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyViewport);
    };

    scheduleViewport();
    visual?.addEventListener('resize', scheduleViewport, { passive: true });
    visual?.addEventListener('scroll', scheduleViewport, { passive: true });
    window.addEventListener('resize', scheduleViewport, { passive: true });
    window.addEventListener('orientationchange', scheduleViewport);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', scheduleViewport);
      visual?.removeEventListener('scroll', scheduleViewport);
      window.removeEventListener('resize', scheduleViewport);
      window.removeEventListener('orientationchange', scheduleViewport);
    };
  }, [open]);

  return overlayRef;
};
