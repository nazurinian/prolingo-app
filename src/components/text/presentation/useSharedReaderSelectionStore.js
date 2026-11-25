import { useCallback, useMemo, useState } from 'react';

export const EMPTY_CARD_SELECTION_STATE = Object.freeze({
  manualAnchor: null,
  byUnitViewKey: Object.freeze({}),
  dismissedFocusNonce: null
});

const createWorkspaceSelection = (workspaceKey, generation = 0) => ({
  workspaceKey,
  generation,
  byCardId: {},
  manualBrowseSessionId: null,
  activeContextualTarget: null,
  dismissedContextualFocusNonce: null
});

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
  const [store, setStore] = useState(() => createWorkspaceSelection(normalizedKey));
  if (store.workspaceKey !== normalizedKey) {
    // React retries this render before committing handlers for the new Workspace.
    setStore(createWorkspaceSelection(normalizedKey, store.generation + 1));
  }

  const {
    generation,
    byCardId,
    manualBrowseSessionId,
    activeContextualTarget,
    dismissedContextualFocusNonce
  } = store;
  const updateCurrentWorkspace = useCallback(update => {
    setStore(previous => (
      previous.workspaceKey === normalizedKey && previous.generation === generation
        ? update(previous)
        : previous
    ));
  }, [normalizedKey, generation]);

  const getCardSelectionState = useCallback(cardId => (
    (cardId && byCardId[cardId]) || EMPTY_CARD_SELECTION_STATE
  ), [byCardId]);

  const updateCardSelection = useCallback((applySelection, payload, options = null) => {
    const { card, activePlaybackSessionId, focusTarget = null, workspaceId = null } = payload;
    const cardId = card?.id;
    if (!cardId) return;
    updateCurrentWorkspace(previous => {
      const currentCardState = previous.byCardId[cardId] || EMPTY_CARD_SELECTION_STATE;
      const nextCardState = applySelection({
        ...payload,
        cardState: currentCardState,
        workspaceKey: normalizedKey
      });
      const shouldUpdateContextual = Boolean(options?.updateContextual && nextCardState?.manualAnchor?.segmentId);
      const nextContextualTarget = shouldUpdateContextual
        ? {
            workspaceKey: normalizedKey,
            cardId,
            unitViewKey: nextCardState.manualAnchor.unitViewKey,
            segmentId: nextCardState.manualAnchor.segmentId,
            pinnedManual: true
          }
        : previous.activeContextualTarget;
      const contextualChanged = shouldUpdateContextual && (
        previous.activeContextualTarget?.cardId !== nextContextualTarget?.cardId
        || previous.activeContextualTarget?.unitViewKey !== nextContextualTarget?.unitViewKey
        || previous.activeContextualTarget?.segmentId !== nextContextualTarget?.segmentId
      );
      const shouldDismissContextualFocus = Boolean(
        shouldUpdateContextual
        && focusTarget
        && workspaceId
        && focusTarget.documentId === workspaceId
        && focusTarget.nonce !== undefined
      );
      const nextDismissedContextualFocusNonce = shouldDismissContextualFocus
        ? focusTarget.nonce
        : previous.dismissedContextualFocusNonce;

      if (
        nextCardState === currentCardState
        && !contextualChanged
        && nextDismissedContextualFocusNonce === previous.dismissedContextualFocusNonce
      ) {
        return previous;
      }
      return {
        ...previous,
        byCardId: nextCardState === currentCardState
          ? previous.byCardId
          : { ...previous.byCardId, [cardId]: nextCardState },
        manualBrowseSessionId: activePlaybackSessionId ?? previous.manualBrowseSessionId,
        activeContextualTarget: nextContextualTarget,
        dismissedContextualFocusNonce: nextDismissedContextualFocusNonce
      };
    });
  }, [normalizedKey, updateCurrentWorkspace]);

  const selectCardUnit = useCallback(payload => {
    if (payload.unitViewKey) updateCardSelection(applyUnitSelectionToCardState, payload);
  }, [updateCardSelection]);

  const selectCardSegment = useCallback(payload => {
    if (payload.segmentId) updateCardSelection(applySegmentSelectionToCardState, payload, { updateContextual: true });
  }, [updateCardSelection]);

  const clearCardManualSelection = useCallback(cardId => {
    if (!cardId) return;
    updateCurrentWorkspace(previous => {
      const currentCardState = previous.byCardId[cardId];
      const clearContextual = previous.activeContextualTarget?.cardId === cardId;
      if (!currentCardState?.manualAnchor && !clearContextual) return previous;
      return {
        ...previous,
        byCardId: currentCardState?.manualAnchor
          ? { ...previous.byCardId, [cardId]: clearCardManualSelectionState(currentCardState) }
          : previous.byCardId,
        activeContextualTarget: clearContextual ? null : previous.activeContextualTarget
      };
    });
  }, [updateCurrentWorkspace]);

  const clearContextualSelection = useCallback(() => {
    updateCurrentWorkspace(previous => (
      previous.activeContextualTarget === null
        ? previous
        : { ...previous, activeContextualTarget: null }
    ));
  }, [updateCurrentWorkspace]);

  const clearAllManualSelections = useCallback(() => {
    updateCurrentWorkspace(previous => {
      const nextByCardId = {};
      let changed = previous.activeContextualTarget !== null;
      for (const [cardId, cardState] of Object.entries(previous.byCardId)) {
        const cleared = clearCardManualSelectionState(cardState);
        if (cleared !== cardState) changed = true;
        nextByCardId[cardId] = cleared;
      }
      return changed
        ? { ...previous, byCardId: nextByCardId, activeContextualTarget: null }
        : previous;
    });
  }, [updateCurrentWorkspace]);

  const resumeViewportFollow = useCallback(() => {
    updateCurrentWorkspace(previous => (
      previous.manualBrowseSessionId === null ? previous : { ...previous, manualBrowseSessionId: null }
    ));
  }, [updateCurrentWorkspace]);

  const hasManualSelection = useCallback(cardId => Boolean(
    cardId && byCardId[cardId]?.manualAnchor
  ), [byCardId]);

  return useMemo(() => ({
    workspaceKey: normalizedKey,
    byCardId,
    manualBrowseSessionId,
    activeContextualTarget,
    dismissedContextualFocusNonce,
    getCardSelectionState,
    selectCardUnit,
    selectCardSegment,
    clearCardManualSelection,
    clearContextualSelection,
    clearAllManualSelections,
    resumeViewportFollow,
    hasManualSelection
  }), [
    normalizedKey,
    byCardId,
    manualBrowseSessionId,
    activeContextualTarget,
    dismissedContextualFocusNonce,
    getCardSelectionState,
    selectCardUnit,
    selectCardSegment,
    clearCardManualSelection,
    clearContextualSelection,
    clearAllManualSelections,
    resumeViewportFollow,
    hasManualSelection
  ]);
};

export default useSharedReaderSelectionStore;
