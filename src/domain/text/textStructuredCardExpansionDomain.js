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
