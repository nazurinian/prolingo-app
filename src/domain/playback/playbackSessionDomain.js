// --- PLAYBACK SESSION START & ITEM ADVANCEMENT ---
// Phase 2B.3: pure session/order planning mechanically extracted from App.jsx.
// No React state, refs, timers, audio, MediaSession, storage, or async side effects live here.

export const resolvePlaybackSessionContextState = ({
  forcedContext = null,
  playingContext = null,
  playingIndex = null,
  isPlaying = false,
  mode = 'table',
  tableViewMode = 'master'
} = {}) => {
  let sessionMode = forcedContext || playingContext;
  let shouldSetPlayingContext = false;
  let nextPlayingContext = null;

  if (!sessionMode || (playingIndex === null && !isPlaying)) {
    sessionMode = mode === 'table' ? tableViewMode : 'text';
    shouldSetPlayingContext = true;
    nextPlayingContext = sessionMode;
  } else if (forcedContext) {
    shouldSetPlayingContext = true;
    nextPlayingContext = forcedContext;
  }

  return { sessionMode, shouldSetPlayingContext, nextPlayingContext };
};

export const resolvePlaybackRequestedId = (startItemId = null) =>
  startItemId == null ? null : String(startItemId);

export const resolvePlaybackStartIndex = (listToPlay, requestedId) => {
  let startIndex = requestedId === null
    ? 0
    : listToPlay.findIndex(item => String(item.id) === requestedId);
  if (startIndex < 0 || startIndex >= listToPlay.length) startIndex = 0;
  return startIndex;
};

export const resolvePlaybackAdvanceState = ({
  liveMode,
  vocabularyPlayOrder,
  index,
  listLength
} = {}) => {
  if (liveMode === 'once') {
    return { shouldBreak: true, nextIndex: index, shouldReshuffle: false };
  }

  if (liveMode === 'random') {
    if (vocabularyPlayOrder === 'shuffle') {
      const nextIndex = index + 1;
      if (nextIndex >= listLength) {
        return { shouldBreak: false, nextIndex: 0, shouldReshuffle: true };
      }
      return { shouldBreak: false, nextIndex, shouldReshuffle: false };
    }

    if (listLength <= 1) {
      return { shouldBreak: false, nextIndex: 0, shouldReshuffle: false };
    }

    let nextRandom = index;
    while (nextRandom === index) nextRandom = Math.floor(Math.random() * listLength);
    return { shouldBreak: false, nextIndex: nextRandom, shouldReshuffle: false };
  }

  if (liveMode === 'loop_one') {
    return { shouldBreak: false, nextIndex: index, shouldReshuffle: false };
  }

  const nextIndex = index + 1;
  if (nextIndex >= listLength) {
    if (vocabularyPlayOrder === 'shuffle') {
      return { shouldBreak: false, nextIndex: 0, shouldReshuffle: true };
    }
    return { shouldBreak: false, nextIndex: 0, shouldReshuffle: false };
  }

  return { shouldBreak: false, nextIndex, shouldReshuffle: false };
};
