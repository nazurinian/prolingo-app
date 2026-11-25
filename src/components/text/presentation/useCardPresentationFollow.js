import { useCallback, useEffect, useRef } from 'react';
import { useWorkspaceReaderScroll } from './useWorkspaceReaderScroll.js';

const USER_NAVIGATION_GRACE_MS = 1800;
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

const escapeSelectorValue = value => {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
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
 * Single Workspace-level automatic page-scroll owner. Coordinates search reveal
 * and passive playback viewport following without stealing keyboard focus,
 * mutating reading selection, or fighting manual browsing across open Cards.
 *
 * The 1,800 ms grace window regulates viewport scroll motion ONLY, never
 * Unit/Segment selection ownership.
 */
export const useCardPresentationFollow = ({
  rootRef,
  enabled = true,
  workspaceId = null,
  workspaceKey = workspaceId,
  focusTarget = null,
  cursor = null,
  followScrollBlocked = false,
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

  const resetUserNavigationGrace = useCallback(() => {
    internalNavRef.current = 0;
  }, []);

  const handleKeyDownNavigation = useCallback(event => {
    if (NAV_KEYS.has(event?.key)) {
      const now = Date.now();
      internalNavRef.current = now;
      onUserNavigation?.(now);
    }
  }, [onUserNavigation]);

  const scroll = useWorkspaceReaderScroll({
    rootRef,
    workspaceKey,
    enabled,
    onUserNavigation: markUserNavigation
  });
  useEffect(() => {
    internalNavRef.current = 0;
  }, [workspaceKey]);

  useEffect(() => {
    if (!enabled || !rootRef?.current || !workspaceId || focusTarget?.documentId !== workspaceId) return undefined;
    if (!focusTarget?.blockId) {
      const cancelReveal = scroll.reveal({ origin: 'search' });
      const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1000);
      return () => {
        window.clearTimeout(timer);
        cancelReveal?.();
      };
    }

    onEnsureCardExpanded?.(focusTarget.blockId);
    let cancelReveal;
    const frame = window.requestAnimationFrame(() => {
      const cardEl = findCardElement(rootRef.current, focusTarget.blockId);
      const target = focusTarget.segmentId
        ? findSegmentTarget({ rootNode: rootRef.current, cardEl, segmentId: focusTarget.segmentId })
        : cardEl;
      if (!target && !cardEl) return;
      const horizontalTrack = target?.closest('[data-shared-part-track="horizontal"]');
      cancelReveal = scroll.reveal({
        target: horizontalTrack || target || cardEl,
        origin: 'search',
        block: horizontalTrack ? 'nearest' : 'center'
      });
    });
    const timer = window.setTimeout(() => onFocusConsumed?.(focusTarget?.nonce), 1400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      cancelReveal?.();
    };
  }, [
    enabled,
    rootRef,
    scroll,
    workspaceId,
    workspaceKey,
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
    if (!enabled || followScrollBlocked || !rootRef?.current || cursorState !== 'playing' || !cursorCardId) return undefined;
    if (workspaceId && focusTarget?.documentId === workspaceId && focusTarget?.blockId) return undefined;
    const lastNav = Math.max(internalNavRef.current || 0, lastUserNavigationAt || 0);
    if (lastNav && Date.now() - lastNav < USER_NAVIGATION_GRACE_MS) return undefined;

    const cardEl = findCardElement(rootRef.current, cursorCardId);
    if (!cardEl) return undefined;
    let target = cardEl;
    if (cursorPrecision === 'segment' && cursorSegmentId) {
      const segTarget = findSegmentTarget({
        rootNode: rootRef.current,
        cardEl,
        segmentId: cursorSegmentId,
        preferredChannel: cursorChannel
      }) || cardEl.querySelector('[data-text-player-segment-active="true"]');
      target = segTarget?.closest('[data-shared-part-track="horizontal"]') || segTarget || cardEl;
    } else if (cursorPrecision === 'card' && cursorChannel) {
      target = cardEl.querySelector(`[data-shared-card-flow="${escapeSelectorValue(cursorChannel)}"]`) || cardEl;
    }
    return scroll.reveal({ target, origin: 'playback' });
  }, [
    enabled,
    followScrollBlocked,
    rootRef,
    scroll,
    workspaceId,
    workspaceKey,
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
    scroll,
    markUserNavigation,
    resetUserNavigationGrace,
    handleKeyDownNavigation
  };
};

export default useCardPresentationFollow;
