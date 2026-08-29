// --- PLAYBACK CONTROL DECISIONS ---
// Phase 2B.6: pure control guards mechanically extracted from App.jsx.
// No React state, refs, timers, Audio, speechSynthesis, MediaSession, storage, or async side effects live here.

export const shouldPausePlayback = ({ isPlaying, isPaused } = {}) =>
  !(!isPlaying || isPaused);

export const shouldResumePlayback = ({ isPlaying, isPaused } = {}) =>
  !(!isPlaying || !isPaused);

export const resolveIndependentPlaybackControlAction = ({ independentPlayingId, uiId } = {}) =>
  independentPlayingId === uiId ? 'stop' : 'start';

export const resolveIndependentPlaybackContext = ({ mode, tableViewMode } = {}) =>
  mode === 'table' ? tableViewMode : 'text';

export const resolveNextPlaybackMode = (playbackMode) => {
  const modes = ['once', 'sequence', 'repeat_2x', 'loop_one', 'random'];
  const currentIdx = modes.indexOf(playbackMode);
  const nextIdx = (currentIdx + 1) % modes.length;
  return modes[nextIdx];
};
