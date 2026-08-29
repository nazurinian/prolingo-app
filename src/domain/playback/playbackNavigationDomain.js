// --- PLAYBACK MANUAL NAVIGATION PLANNING ---
// Phase 2B.4: pure Prev/Next navigation decisions mechanically extracted from App.jsx.
// No React state, refs, timers, audio, MediaSession, storage, or async side effects live here.

export const resolvePlaybackNavigationReferenceState = ({
  playingIndex,
  playingContext,
  mode,
  tableViewMode,
  currentIndex
} = {}) => {
  const hasPlayingReference = playingIndex !== null && playingContext;
  const contextToUse = hasPlayingReference
    ? playingContext
    : (mode === 'table' ? tableViewMode : 'text');
  const refId = hasPlayingReference ? playingIndex : currentIndex;
  return { contextToUse, refId };
};

export const resolvePlaybackNavigationTargetState = ({
  direction,
  refId,
  listToUse,
  contextToUse,
  mode,
  tableViewMode
} = {}) => {
  const activeItem = listToUse.find(p => p.id === refId);
  const currentListIndex = activeItem ? listToUse.indexOf(activeItem) : 0;

  const nextIndex = direction === 'next'
    ? (currentListIndex + 1) % listToUse.length
    : (currentListIndex - 1 + listToUse.length) % listToUse.length;

  const targetItem = listToUse[nextIndex];
  const shouldSetCurrentIndex = contextToUse === (mode === 'table' ? tableViewMode : 'text');

  return {
    activeItem,
    currentListIndex,
    nextIndex,
    targetItem,
    shouldSetCurrentIndex
  };
};
