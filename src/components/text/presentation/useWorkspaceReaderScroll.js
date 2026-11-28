import { createContext, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { isPrefersReducedMotion, resolveSafeScrollContainer } from './sharedCardPresentationUtils.js';

export const WorkspaceReaderScrollContext = createContext(null);

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const TOUCH_SLOP = 6;
const POSITION_TOLERANCE = 1;

const readViewport = viewport => {
  const isWindow = viewport === window;
  const element = isWindow ? document.scrollingElement : viewport;
  const rect = isWindow ? null : viewport.getBoundingClientRect();
  const top = rect ? Math.max(0, rect.top + viewport.clientTop) : 0;
  const bottom = rect
    ? Math.min(window.innerHeight, rect.top + viewport.clientTop + viewport.clientHeight)
    : window.innerHeight;
  return {
    top,
    bottom,
    scrollTop: element.scrollTop,
    maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight)
  };
};

const isScrollbarPress = (event, viewport) => {
  if (event.button !== 0 || event.pointerType === 'touch') return false;
  if (viewport === window) {
    return event.clientX >= document.documentElement.clientWidth && event.clientX < window.innerWidth;
  }
  if (event.target !== viewport) return false;
  const rect = viewport.getBoundingClientRect();
  const contentRight = rect.left + viewport.clientLeft + viewport.clientWidth;
  const borderRight = Number.parseFloat(window.getComputedStyle(viewport).borderRightWidth) || 0;
  return event.clientY >= rect.top && event.clientY < rect.bottom
    && event.clientX >= contentRight && event.clientX < rect.right - borderRight;
};

export const useWorkspaceReaderScroll = ({ rootRef, workspaceKey, enabled, onUserNavigation }) => {
  const controllerRef = useRef(null);
  const reveal = useCallback(request => controllerRef.current?.reveal(request), []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || typeof window === 'undefined') return undefined;

    const getViewport = () => resolveSafeScrollContainer(root) || window;
    const isViewportEvent = (event, viewport) => (
      viewport === window ? event.target === document || event.target === window : event.target === viewport
    );
    const isInsideReader = target => target instanceof Node && root.contains(target);
    const isReaderAtFocalBand = () => {
      const rect = root.getBoundingClientRect();
      const focalY = window.innerHeight * 0.42;
      return rect.top <= focalY && rect.bottom >= focalY;
    };
    let motion = null;
    let touch = null;
    let motionFrame = null;

    const finishMotion = (request, interrupt = false) => {
      if (motion !== request) return;
      if (motionFrame !== null) window.cancelAnimationFrame(motionFrame);
      motionFrame = null;
      if (interrupt) {
        const { scrollTop } = readViewport(request.viewport);
        request.viewport.scrollTo({ top: scrollTop, behavior: 'instant' });
      }
      motion = null;
    };

    const beginUserScroll = viewport => {
      if (motion?.viewport === viewport) finishMotion(motion, true);
      onUserNavigation?.();
    };

    const revealTarget = ({ target = null, origin, block = 'nearest' }) => {
      if (target && !isInsideReader(target)) return undefined;
      if (motion) finishMotion(motion, true);
      const viewport = getViewport();
      const position = readViewport(viewport);
      let desiredTop = 0;
      if (target) {
        const rect = target.getBoundingClientRect();
        const safeTop = position.top + 16;
        const safeBottom = Math.max(safeTop + 1, position.bottom - (window.innerWidth <= 767 ? 104 : 24));
        if (origin === 'unit' && rect.top >= safeTop && rect.bottom <= safeBottom) return undefined;
        const tallUnit = origin === 'unit' && rect.height > (position.bottom - position.top) * 0.75;
        if (block === 'center' && !tallUnit) {
          desiredTop = position.scrollTop + (rect.top + rect.bottom - safeTop - safeBottom) / 2;
        } else if (block === 'start' || tallUnit || rect.top < safeTop) {
          desiredTop = position.scrollTop + rect.top - safeTop;
        } else if (rect.bottom > safeBottom && rect.top > safeTop) {
          desiredTop = position.scrollTop + Math.min(rect.bottom - safeBottom, rect.top - safeTop);
        } else {
          return undefined;
        }
      }

      const top = Math.min(position.maxScrollTop, Math.max(0, desiredTop));
      if (Math.abs(top - position.scrollTop) <= POSITION_TOLERANCE) return undefined;
      const request = { viewport, origin, top };
      motion = request;
      viewport.scrollTo({ top, behavior: isPrefersReducedMotion() ? 'instant' : 'smooth' });

      // Native scrollend handles completion. Observe position as a fallback for
      // instantaneous/clamped moves or when scrollend is unavailable.
      let previousTop = position.scrollTop;
      let stillFrames = 0;
      const checkMotion = () => {
        motionFrame = null;
        if (motion !== request) return;
        const nextTop = readViewport(viewport).scrollTop;
        stillFrames = nextTop === previousTop ? stillFrames + 1 : 0;
        previousTop = nextTop;
        if (Math.abs(nextTop - request.top) <= POSITION_TOLERANCE || stillFrames >= 4) {
          finishMotion(request);
        } else {
          motionFrame = window.requestAnimationFrame(checkMotion);
        }
      };
      motionFrame = window.requestAnimationFrame(checkMotion);
      return () => finishMotion(request, true);
    };

    const handleScrollEnd = event => {
      const viewport = getViewport();
      if (!isViewportEvent(event, viewport)) return;
      if (motion?.viewport === viewport
        && Math.abs(readViewport(viewport).scrollTop - motion.top) <= POSITION_TOLERANCE) {
        finishMotion(motion);
      }
    };
    const handleWheel = event => {
      if (event.isTrusted && !event.ctrlKey && Math.abs(event.deltaY) > Math.abs(event.deltaX) && isInsideReader(event.target)) {
        beginUserScroll(getViewport());
      }
    };
    const handleKeyDown = event => {
      if (!event.isTrusted || event.defaultPrevented || !SCROLL_KEYS.has(event.key) || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === ' ' && target?.closest?.('button, a, [role="button"]')) return;
      const viewport = getViewport();
      if (isInsideReader(target) || (viewport === window && target === document.body && isReaderAtFocalBand())) {
        beginUserScroll(viewport);
      }
    };
    const handleTouchStart = event => {
      const point = event.touches[0];
      touch = event.isTrusted && event.touches.length === 1 && point && isInsideReader(event.target)
        ? { id: point.identifier, x: point.clientX, y: point.clientY, viewport: getViewport() }
        : null;
    };
    const handleTouchMove = event => {
      if (!event.isTrusted || !touch || event.touches.length !== 1 || touch.viewport !== getViewport()) return;
      const point = event.touches[0];
      const dy = Math.abs(point.clientY - touch.y);
      if (point.identifier === touch.id && dy >= TOUCH_SLOP && dy > Math.abs(point.clientX - touch.x)) {
        beginUserScroll(touch.viewport);
        touch = null;
      }
    };
    const clearTouch = () => { touch = null; };
    const handlePointerDown = event => {
      const viewport = getViewport();
      if (event.isTrusted && isScrollbarPress(event, viewport) && (viewport !== window || isReaderAtFocalBand())) {
        beginUserScroll(viewport);
      }
    };
    const controller = { reveal: revealTarget };
    controllerRef.current = controller;
    const listeners = [
      ['scrollend', handleScrollEnd, { capture: true, passive: true }],
      ['wheel', handleWheel, { passive: true }],
      ['keydown', handleKeyDown],
      ['touchstart', handleTouchStart, { passive: true }],
      ['touchmove', handleTouchMove, { passive: true }],
      ['touchend', clearTouch, { passive: true }],
      ['touchcancel', clearTouch, { passive: true }],
      ['pointerdown', handlePointerDown, { capture: true, passive: true }]
    ];
    for (const [name, handler, options] of listeners) window.addEventListener(name, handler, options);
    return () => {
      if (controllerRef.current === controller) controllerRef.current = null;
      for (const [name, handler, options] of listeners) window.removeEventListener(name, handler, options);
      if (motion) finishMotion(motion, true);
    };
  }, [rootRef, workspaceKey, enabled, onUserNavigation]);

  return useMemo(() => ({ reveal }), [reveal]);
};
