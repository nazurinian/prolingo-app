import { useCallback, useEffect, useRef } from 'react';
import { isPrefersReducedMotion, resolveSafeScrollContainer } from './sharedCardPresentationUtils.js';

const USER_NAVIGATION_GRACE_MS = 1800;
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

const escapeSelectorValue = value => {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
};

const ensureTargetVisible = (target, rootContainer, { explicit = false } = {}) => {
  if (!target || typeof target.scrollIntoView !== 'function') return;
  const behavior = isPrefersReducedMotion() ? 'auto' : 'smooth';
  if (explicit) {
    target.scrollIntoView({ behavior, block: 'center' });
    return;
  }
  const scrollContainer = resolveSafeScrollContainer(target) || rootContainer;
  const viewport = scrollContainer?.getBoundingClientRect?.();
  const rect = target.getBoundingClientRect?.();
  if (!rect) return;
  const isMobileViewport = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const safeTop = (viewport ? viewport.top : 0) + 16;
  const safeBottom = (viewport ? Math.min(viewport.bottom, winHeight) : winHeight) - (isMobileViewport ? 104 : 24);
  if (rect.top >= safeTop && rect.bottom <= safeBottom) return;
  target.scrollIntoView({ behavior, block: 'nearest' });
};

const findCardElement = (rootNode, cardId) => {
  if (!rootNode || !cardId) return null;
  const escaped = escapeSelectorValue(cardId);
  return (
    rootNode.querySelector(`[data-shared-card-id="${escaped}"]`)
    || rootNode.querySelector(`[data-text-player-card="${escaped}"]`)
  );
};

const findSegmentTarget = ({ rootNode, cardEl, segmentId, preferredChannel = null }) => {
  const scope = cardEl || rootNode;
  if (!scope || !segmentId) return null;
  const escaped = escapeSelectorValue(segmentId);
  if (preferredChannel) {
    const channelSpecific = scope.querySelector(
      `[data-text-player-segment="${escaped}"][data-shared-card-channel="${escapeSelectorValue(preferredChannel)}"]`
    );
    if (channelSpecific) return channelSpecific;
  }
  return scope.querySelector(`[data-text-player-segment="${escaped}"]`);
};

/**
 * Coordinates search reveal and passive playback viewport following without stealing
 * keyboard focus or interrupting manual scroll/navigation within the grace window.
 */
export const useCardPresentationFollow = ({
  rootRef,
  workspaceId = null,
  focusTarget = null,
  cursor = null,
  lastUserNavigationAt = 0,
  onUserNavigation = null,
  onEnsureCardExpanded = null,
  onFocusConsumed = null
}) => {
  const internalNavRef = useRef(0);

  const markUserNavigation = useCallback(() => {
    const now = Date.now();
    internalNavRef.current = now;
    onUserNavigation?.(now);
  }, [onUserNavigation]);

  const handleKeyDownNavigation = useCallback(event => {
    if (NAV_KEYS.has(event?.key)) {
      const now = Date.now();
      internalNavRef.current = now;
      onUserNavigation?.(now);
    }
  }, [onUserNavigation]);

  useEffect(() => {
    if (!rootRef?.current || !workspaceId || focusTarget?.documentId !== workspaceId) return undefined;
    if (!focusTarget?.blockId) {
      const container = resolveSafeScrollContainer(rootRef.current) || rootRef.current;
      container?.scrollTo?.({ top: 0, behavior: isPrefersReducedMotion() ? 'auto' : 'smooth' });
      const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1000);
      return () => window.clearTimeout(timer);
    }

    onEnsureCardExpanded?.(focusTarget.blockId);
    const frame = window.requestAnimationFrame(() => {
      const cardEl = findCardElement(rootRef.current, focusTarget.blockId);
      const target = focusTarget.segmentId
        ? findSegmentTarget({ rootNode: rootRef.current, cardEl, segmentId: focusTarget.segmentId })
        : cardEl;
      ensureTargetVisible(target || cardEl, rootRef.current, { explicit: true });
    });
    const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [
    rootRef,
    workspaceId,
    focusTarget?.documentId,
    focusTarget?.blockId,
    focusTarget?.segmentId,
    focusTarget?.nonce,
    onEnsureCardExpanded,
    onFocusConsumed
  ]);

  const cursorState = cursor?.state || 'idle';
  const cursorCardId = cursor?.cardId || null;
  const cursorSegmentId = cursor?.segmentId || null;
  const cursorChannel = cursor?.channel || null;
  const cursorPrecision = cursor?.precision || 'none';

  useEffect(() => {
    if (!rootRef?.current || cursorState !== 'playing' || !cursorCardId) return undefined;
    if (workspaceId && focusTarget?.documentId === workspaceId && focusTarget?.blockId) return undefined;
    const lastNav = Math.max(internalNavRef.current || 0, lastUserNavigationAt || 0);
    if (lastNav && Date.now() - lastNav < USER_NAVIGATION_GRACE_MS) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const cardEl = findCardElement(rootRef.current, cursorCardId);
      if (!cardEl) return;
      let target = cardEl;
      if (cursorPrecision === 'segment' && cursorSegmentId) {
        target = findSegmentTarget({
          rootNode: rootRef.current,
          cardEl,
          segmentId: cursorSegmentId,
          preferredChannel: cursorChannel
        }) || cardEl.querySelector('[data-text-player-segment-active="true"]') || cardEl;
      } else if (cursorPrecision === 'card' && cursorChannel) {
        target = cardEl.querySelector(`[data-shared-card-flow="${escapeSelectorValue(cursorChannel)}"]`) || cardEl;
      }
      ensureTargetVisible(target, rootRef.current, { explicit: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    rootRef,
    workspaceId,
    focusTarget?.documentId,
    focusTarget?.blockId,
    cursorCardId,
    cursorSegmentId,
    cursorChannel,
    cursorPrecision,
    cursorState,
    lastUserNavigationAt
  ]);

  return {
    markUserNavigation,
    handleKeyDownNavigation
  };
};

export default useCardPresentationFollow;
