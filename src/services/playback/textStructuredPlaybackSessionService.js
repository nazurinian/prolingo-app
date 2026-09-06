import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackScopeList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  hasStructuredTextPlayableChannel,
  resolveStructuredTextPlaybackChannelSteps
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';

export const executeStructuredTextPlaybackSessionService = ({
  documentTree,
  startSegmentId = null,
  blockId = null,
  scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
  playbackChannelMode,
  safePlayTransition,
  playbackSessionRef,
  playbackContextRef,
  setIsPlaying,
  setIsPaused,
  pauseStateRef,
  stopSignalRef,
  silentAudioRef,
  waitWhilePaused,
  setPlayingContext,
  setPlayingIndex,
  setCurrentIndex,
  setSpeakingPart,
  playStructuredChannel,
  forceStopAll,
  addLog
}) => {
  const resolved = resolveStructuredTextPlaybackScopeList({
    documentTree,
    startSegmentId,
    blockId,
    scope
  });
  const scopedList = resolved.playbackList;
  const listToPlay = scopedList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode));
  if (!listToPlay.length) {
    addLog?.('Text Player', 'Playback not started: no Segment in this scope has content for the selected Text Play mode.');
    return false;
  }

  safePlayTransition(async () => {
    const playbackSession = playbackSessionRef.current;
    if (playbackContextRef) {
      playbackContextRef.current = {
        sessionId: playbackSession,
        context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
        kind: 'text-structured',
        documentId: documentTree.id,
        documentTitle: documentTree.title,
        scope,
        playbackChannelMode,
        baseList: [...resolved.fullList],
        orderedList: [...listToPlay]
      };
    }

    setPlayingContext(TEXT_STRUCTURED_PLAYBACK_CONTEXT);
    setIsPlaying(true);
    setIsPaused(false);
    pauseStateRef.current = false;
    addLog?.('Text Player', `${documentTree.title || documentTree.id} • ${scope} • ${listToPlay.length} segment${listToPlay.length === 1 ? '' : 's'} • ${playbackChannelMode}.`);

    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(() => {});
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    for (const item of listToPlay) {
      if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
      await waitWhilePaused();
      if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

      if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

      setPlayingIndex(item.id);
      setCurrentIndex(item.id);
      const channelSteps = resolveStructuredTextPlaybackChannelSteps(item, playbackChannelMode);

      for (const step of channelSteps) {
        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
        await waitWhilePaused();
        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

        setSpeakingPart(step.channel);
        await playStructuredChannel(step.content, item, step.channel);
      }

      if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
    }

    if (playbackSession !== playbackSessionRef.current) return;
    setSpeakingPart(null);
    if (!stopSignalRef.current) {
      addLog?.('Text Player', 'Structured Text playback finished.');
      forceStopAll();
    }
  });

  return true;
};
