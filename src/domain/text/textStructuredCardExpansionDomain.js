// HF4-A: view-only expansion policy for Structured Text cards.
// Audio sessions, Text DB identities and stored binary artifacts do not depend on this state.
export const TEXT_CARD_EXPANSION_MODES = Object.freeze({
  FOLLOW: 'follow',
  ALL: 'all',
  CUSTOM: 'custom'
});

const validModes = new Set(Object.values(TEXT_CARD_EXPANSION_MODES));
export const normalizeTextCardExpansionMode = mode => validModes.has(mode)
  ? mode
  : TEXT_CARD_EXPANSION_MODES.FOLLOW;

export const resolveActiveTextCardId = ({
  blocks = [], playingIndex = null, activeCursorSegmentId = null,
  playbackRepresentationMode = 'split', isSessionActive = false
} = {}) => {
  if (!isSessionActive) return null;
  // Full playback deliberately clears playingIndex to suppress sentence highlighting.
  // currentIndex still tracks the current Segment (including Full local/TTS steps).
  const segmentId = playbackRepresentationMode === 'full'
    ? (activeCursorSegmentId || playingIndex)
    : playingIndex;
  if (!segmentId) return null;
  return (blocks || []).find(block => (block?.segments || []).some(segment => segment.id === segmentId))?.id || null;
};

export const resolveExpandedTextCardIds = ({
  mode = TEXT_CARD_EXPANSION_MODES.FOLLOW,
  blocks = [], activeBlockId = null, lastActiveBlockId = null,
  customExpandedIds = new Set()
} = {}) => {
  const normalized = normalizeTextCardExpansionMode(mode);
  if (normalized === TEXT_CARD_EXPANSION_MODES.ALL) return new Set((blocks || []).map(block => block.id));
  if (normalized === TEXT_CARD_EXPANSION_MODES.CUSTOM) return new Set(customExpandedIds);
  const currentOrLast = activeBlockId || lastActiveBlockId;
  return new Set(currentOrLast ? [currentOrLast] : []);
};

export const toggleTextCardExpandedId = (expandedIds, blockId) => {
  const next = new Set(expandedIds);
  if (next.has(blockId)) next.delete(blockId);
  else next.add(blockId);
  return next;
};

export const TEXT_CARD_EXPANSION_OPTIONS = Object.freeze([
  Object.freeze({
    id: TEXT_CARD_EXPANSION_MODES.FOLLOW,
    label: 'Follow Playback',
    description: 'Automatically keep the active playing card open while keeping browsing independent'
  }),
  Object.freeze({
    id: TEXT_CARD_EXPANSION_MODES.ALL,
    label: 'Expand All',
    description: 'Keep every card expanded in authored order'
  }),
  Object.freeze({
    id: TEXT_CARD_EXPANSION_MODES.CUSTOM,
    label: 'Custom',
    description: 'Manually expand or collapse any combination of cards without affecting audio'
  })
]);

export const resolveActiveCardIdFromCursor = ({ cards = [], playbackCursor = null } = {}) => {
  if (!playbackCursor || (playbackCursor.state !== 'playing' && playbackCursor.state !== 'paused')) {
    return null;
  }
  const cardId = playbackCursor.cardId || null;
  if (!cardId) return null;
  return (cards || []).some(card => card?.id === cardId) ? cardId : null;
};

/**
 * View-only Card Visibility resolution for Shared Reader Card Mode.
 * Supports Follow Playback, Expand All, and Custom (multiple open Cards allowed)
 * without mutating playback sessions or active audio cursors.
 */
export const resolveSharedReaderExpandedCardIds = ({
  mode = TEXT_CARD_EXPANSION_MODES.ALL,
  cards = [],
  activeCardId = null,
  lastActiveCardId = null,
  customExpandedIds = new Set(),
  fallbackFirstWhenIdle = true
} = {}) => {
  const normalized = normalizeTextCardExpansionMode(mode);
  const validIds = (cards || []).map(card => card?.id).filter(Boolean);
  const validSet = new Set(validIds);

  if (normalized === TEXT_CARD_EXPANSION_MODES.ALL) {
    return new Set(validIds);
  }
  if (normalized === TEXT_CARD_EXPANSION_MODES.CUSTOM) {
    return new Set([...(customExpandedIds || [])].filter(id => validSet.has(id)));
  }

  const target = (activeCardId && validSet.has(activeCardId))
    ? activeCardId
    : (lastActiveCardId && validSet.has(lastActiveCardId))
      ? lastActiveCardId
      : (fallbackFirstWhenIdle && validIds[0] ? validIds[0] : null);
  return new Set(target ? [target] : []);
};
