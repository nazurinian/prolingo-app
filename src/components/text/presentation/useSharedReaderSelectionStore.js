import { useCallback, useMemo, useState } from 'react';

export const EMPTY_CARD_SELECTION_STATE = Object.freeze({
  manualAnchor: null,
  byUnitViewKey: Object.freeze({}),
  dismissedFocusNonce: null
});

const EMPTY_BY_CARD_ID = Object.freeze({});

export const normalizeReaderSelectionWorkspaceKey = workspaceKey => {
  if (workspaceKey === null || workspaceKey === undefined) return 'default';
  const normalized = String(workspaceKey).trim();
  return normalized || 'default';
};

export const applyUnitSelectionToCardState = ({
  cardState = EMPTY_CARD_SELECTION_STATE,
  workspaceKey,
  card,
  lookup,
  unitViewKey,
  focusTarget = null,
  workspaceId = null
}) => {
  const normalizedWorkspaceKey = normalizeReaderSelectionWorkspaceKey(workspaceKey);
  const unit = lookup?.unitByViewKey?.get(unitViewKey);
  if (!unit) return cardState || EMPTY_CARD_SELECTION_STATE;

  const base = cardState || EMPTY_CARD_SELECTION_STATE;
  const byUnitViewKey = base.byUnitViewKey || EMPTY_CARD_SELECTION_STATE.byUnitViewKey;
  const unitSegments = Array.isArray(unit.segments) ? unit.segments : [];
  const rememberedId = byUnitViewKey[unitViewKey] || null;
  const validRememberedId = rememberedId && unitSegments.some(segment => segment.id === rememberedId)
    ? rememberedId
    : null;
  const restoredSegmentId = unitSegments.length > 0
    ? (validRememberedId || unitSegments[0]?.id || null)
    : null;

  const shouldDismissFocus = Boolean(
    focusTarget
    && workspaceId
    && focusTarget.documentId === workspaceId
    && focusTarget.blockId === card?.id
    && focusTarget.nonce !== undefined
  );

  return {
    manualAnchor: {
      workspaceKey: normalizedWorkspaceKey,
      cardId: card?.id || null,
      unitViewKey,
      segmentId: restoredSegmentId,
      pinnedManual: true
    },
    byUnitViewKey,
    dismissedFocusNonce: shouldDismissFocus ? focusTarget.nonce : (base.dismissedFocusNonce ?? null)
  };
};

export const applySegmentSelectionToCardState = ({
  cardState = EMPTY_CARD_SELECTION_STATE,
  workspaceKey,
  card,
  lookup,
  segmentId,
  focusTarget = null,
  workspaceId = null
}) => {
  const normalizedWorkspaceKey = normalizeReaderSelectionWorkspaceKey(workspaceKey);
  const entry = lookup?.entryBySegmentId?.get(segmentId);
  if (!entry) return cardState || EMPTY_CARD_SELECTION_STATE;

  const base = cardState || EMPTY_CARD_SELECTION_STATE;
  const shouldDismissFocus = Boolean(
    focusTarget
    && workspaceId
    && focusTarget.documentId === workspaceId
    && focusTarget.blockId === card?.id
    && focusTarget.nonce !== undefined
  );

  return {
    manualAnchor: {
      workspaceKey: normalizedWorkspaceKey,
      cardId: card?.id || null,
      unitViewKey: entry.unitViewKey,
      segmentId,
      pinnedManual: true
    },
    byUnitViewKey: {
      ...(base.byUnitViewKey || {}),
      [entry.unitViewKey]: segmentId
    },
    dismissedFocusNonce: shouldDismissFocus ? focusTarget.nonce : (base.dismissedFocusNonce ?? null)
  };
};

export const clearCardManualSelectionState = (cardState = EMPTY_CARD_SELECTION_STATE) => {
  const base = cardState || EMPTY_CARD_SELECTION_STATE;
  if (!base.manualAnchor) return base;
  return {
    ...base,
    manualAnchor: null
  };
};

/**
 * Transient in-memory Workspace Reader selection store shared across both
 * SharedParagraphWorkspaceReader (Isolated UAT / Unified host) and TextStructuredPlayer
 * (Main App host). Preserves per-Card Unit selection, per-Unit Segment memory, and
 * explicit manual-follow pinning across mode switches, Card collapse/reopen,
 * bilingual layout changes, Card Visibility changes, and Workspace Style changes.
 *
 * Scoped strictly to `workspaceKey` with zero IndexedDB / localStorage persistence.
 */
export const useSharedReaderSelectionStore = workspaceKey => {
  const normalizedKey = normalizeReaderSelectionWorkspaceKey(workspaceKey);
  const [store, setStore] = useState(() => ({
    workspaceKey: normalizedKey,
    byCardId: {},
    manualBrowseSessionId: null
  }));

  const activeByCardId = store.workspaceKey === normalizedKey ? store.byCardId : EMPTY_BY_CARD_ID;
  const activeManualBrowseSessionId = store.workspaceKey === normalizedKey
    ? store.manualBrowseSessionId
    : null;

  const getCardSelectionState = useCallback(cardId => (
    (cardId && activeByCardId[cardId]) || EMPTY_CARD_SELECTION_STATE
  ), [activeByCardId]);

  const selectCardUnit = useCallback(({
    card,
    lookup,
    unitViewKey,
    focusTarget = null,
    workspaceId = null,
    activePlaybackSessionId = null
  }) => {
    const cardId = card?.id;
    if (!cardId || !unitViewKey) return;
    setStore(previous => {
      const baseByCardId = previous.workspaceKey === normalizedKey ? previous.byCardId : {};
      const currentCardState = baseByCardId[cardId] || EMPTY_CARD_SELECTION_STATE;
      const nextCardState = applyUnitSelectionToCardState({
        cardState: currentCardState,
        workspaceKey: normalizedKey,
        card,
        lookup,
        unitViewKey,
        focusTarget,
        workspaceId
      });
      if (nextCardState === currentCardState && previous.workspaceKey === normalizedKey) {
        return previous;
      }
      return {
        workspaceKey: normalizedKey,
        byCardId: {
          ...baseByCardId,
          [cardId]: nextCardState
        },
        manualBrowseSessionId: activePlaybackSessionId ?? previous.manualBrowseSessionId
      };
    });
  }, [normalizedKey]);

  const selectCardSegment = useCallback(({
    card,
    lookup,
    segmentId,
    focusTarget = null,
    workspaceId = null,
    activePlaybackSessionId = null
  }) => {
    const cardId = card?.id;
    if (!cardId || !segmentId) return;
    setStore(previous => {
      const baseByCardId = previous.workspaceKey === normalizedKey ? previous.byCardId : {};
      const currentCardState = baseByCardId[cardId] || EMPTY_CARD_SELECTION_STATE;
      const nextCardState = applySegmentSelectionToCardState({
        cardState: currentCardState,
        workspaceKey: normalizedKey,
        card,
        lookup,
        segmentId,
        focusTarget,
        workspaceId
      });
      if (nextCardState === currentCardState && previous.workspaceKey === normalizedKey) {
        return previous;
      }
      return {
        workspaceKey: normalizedKey,
        byCardId: {
          ...baseByCardId,
          [cardId]: nextCardState
        },
        manualBrowseSessionId: activePlaybackSessionId ?? previous.manualBrowseSessionId
      };
    });
  }, [normalizedKey]);

  const clearCardManualSelection = useCallback(cardId => {
    if (!cardId) return;
    setStore(previous => {
      const baseByCardId = previous.workspaceKey === normalizedKey ? previous.byCardId : {};
      const currentCardState = baseByCardId[cardId];
      if (!currentCardState?.manualAnchor && previous.manualBrowseSessionId === null) {
        return previous;
      }
      const nextCardState = currentCardState
        ? clearCardManualSelectionState(currentCardState)
        : EMPTY_CARD_SELECTION_STATE;
      return {
        workspaceKey: normalizedKey,
        byCardId: currentCardState
          ? { ...baseByCardId, [cardId]: nextCardState }
          : baseByCardId,
        manualBrowseSessionId: null
      };
    });
  }, [normalizedKey]);

  const clearAllManualSelections = useCallback(() => {
    setStore(previous => {
      const baseByCardId = previous.workspaceKey === normalizedKey ? previous.byCardId : {};
      const nextByCardId = {};
      let changed = previous.manualBrowseSessionId !== null || previous.workspaceKey !== normalizedKey;
      for (const [cardId, cardState] of Object.entries(baseByCardId)) {
        const cleared = clearCardManualSelectionState(cardState);
        if (cleared !== cardState) changed = true;
        nextByCardId[cardId] = cleared;
      }
      if (!changed) return previous;
      return {
        workspaceKey: normalizedKey,
        byCardId: nextByCardId,
        manualBrowseSessionId: null
      };
    });
  }, [normalizedKey]);

  const hasManualSelection = useCallback(cardId => Boolean(
    cardId && activeByCardId[cardId]?.manualAnchor
  ), [activeByCardId]);

  return useMemo(() => ({
    workspaceKey: normalizedKey,
    byCardId: activeByCardId,
    manualBrowseSessionId: activeManualBrowseSessionId,
    getCardSelectionState,
    selectCardUnit,
    selectCardSegment,
    clearCardManualSelection,
    clearAllManualSelections,
    hasManualSelection
  }), [
    normalizedKey,
    activeByCardId,
    activeManualBrowseSessionId,
    getCardSelectionState,
    selectCardUnit,
    selectCardSegment,
    clearCardManualSelection,
    clearAllManualSelections,
    hasManualSelection
  ]);
};

export default useSharedReaderSelectionStore;
