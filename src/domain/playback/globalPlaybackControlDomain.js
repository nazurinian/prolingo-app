// --- GLOBAL PLAY BUTTON PLANNING ---
// Phase 2B.5: pure global Play/Pause/Resume/start decisions mechanically extracted from App.jsx.
// No React state, refs, timers, audio, MediaSession, storage, or async side effects live here.

export const resolveGlobalPlayControlAction = ({ isPlaying, isPaused } = {}) => {
  if (isPlaying) return isPaused ? 'resume' : 'pause';
  return 'start';
};

export const shouldAttemptGlobalPlayResume = ({ playingIndex, playingContext } = {}) =>
  playingIndex !== null && playingContext;

export const resolveGlobalPlayResumeItem = (baseList, playingIndex) =>
  baseList.find(p => p.id === playingIndex);

export const resolveGlobalPlayTargetContext = ({ mode, tableViewMode } = {}) =>
  mode === 'table' ? tableViewMode : 'text';

export const resolveGlobalPlayFreshStartState = ({ baseList, currentIndex } = {}) => {
  const activeItem = baseList.find(p => p.id === currentIndex) || baseList[0];
  return {
    activeItem,
    startItemId: activeItem?.id ?? null,
    anchorShuffle: Boolean(activeItem)
  };
};
