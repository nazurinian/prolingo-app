import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackOrder,
  resolveStructuredTextPlaybackScopeList
} from '../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  hasStructuredTextPlayableChannel,
  resolveStructuredTextPlaybackChannelSteps
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';

const waitPlaybackFeelDelay = async ({ durationMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession }) => {
  let remaining = Math.max(0, Number(durationMs) || 0);
  while (remaining > 0) {
    if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) return false;
    await waitWhilePaused();
    if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) return false;
    const slice = Math.min(100, remaining);
    await new Promise(resolve => setTimeout(resolve, slice));
    remaining -= slice;
  }
  return !(stopSignalRef.current || playbackSession !== playbackSessionRef.current);
};

export const executeStructuredTextPlaybackSessionService = ({
  documentTree,
  startSegmentId = null,
  blockId = null,
  scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
  playbackChannelMode,
  playbackOrderMode = TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
  repeatMode = TEXT_STRUCTURED_REPEAT_MODES.ONCE,
  channelDelayMs = 0,
  segmentDelayMs = 0,
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
  addLog,
  random = Math.random
}) => {
  const resolved = resolveStructuredTextPlaybackScopeList({
    documentTree,
    startSegmentId,
    blockId,
    scope
  });
  const scopedList = resolved.playbackList.filter(item => hasStructuredTextPlayableChannel(item, playbackChannelMode));
  if (!scopedList.length) {
    addLog?.('Text Player', 'Playback not started: no Segment in this scope has content for the selected Text Play mode.');
    return false;
  }

  safePlayTransition(async () => {
    const playbackSession = playbackSessionRef.current;
    const repeatLimit = repeatMode === TEXT_STRUCTURED_REPEAT_MODES.LOOP
      ? Number.POSITIVE_INFINITY
      : repeatMode === TEXT_STRUCTURED_REPEAT_MODES.TWICE ? 2 : 1;

    setPlayingContext(TEXT_STRUCTURED_PLAYBACK_CONTEXT);
    setIsPlaying(true);
    setIsPaused(false);
    pauseStateRef.current = false;
    addLog?.('Text Player', `${documentTree.title || documentTree.id} • ${scope} • ${scopedList.length} segment${scopedList.length === 1 ? '' : 's'} • ${playbackChannelMode} • ${playbackOrderMode} • ${repeatMode}.`);

    if (silentAudioRef.current) silentAudioRef.current.play().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    let pass = 0;
    while (pass < repeatLimit && !stopSignalRef.current && playbackSession === playbackSessionRef.current) {
      const orderedList = resolveStructuredTextPlaybackOrder({
        list: scopedList,
        orderMode: playbackOrderMode,
        anchorId: pass === 0 ? startSegmentId : null,
        random
      });
      if (playbackContextRef) {
        playbackContextRef.current = {
          sessionId: playbackSession,
          context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
          kind: 'text-structured',
          documentId: documentTree.id,
          documentTitle: documentTree.title,
          scope,
          playbackChannelMode,
          playbackOrderMode,
          repeatMode,
          channelDelayMs,
          segmentDelayMs,
          repeatPass: pass + 1,
          baseList: [...resolved.fullList],
          orderedList: [...orderedList]
        };
      }

      for (let itemIndex = 0; itemIndex < orderedList.length; itemIndex += 1) {
        const item = orderedList[itemIndex];
        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
        await waitWhilePaused();
        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

        if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

        setPlayingIndex(item.id);
        setCurrentIndex(item.id);
        const channelSteps = resolveStructuredTextPlaybackChannelSteps(item, playbackChannelMode);

        for (let stepIndex = 0; stepIndex < channelSteps.length; stepIndex += 1) {
          const step = channelSteps[stepIndex];
          if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
          await waitWhilePaused();
          if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

          setSpeakingPart(step.channel);
          await playStructuredChannel(step.content, item, step.channel);

          const hasNextChannel = stepIndex < channelSteps.length - 1;
          if (hasNextChannel && channelDelayMs > 0) {
            const keepGoing = await waitPlaybackFeelDelay({ durationMs: channelDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
            if (!keepGoing) break;
          }
        }

        if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
        const hasNextSegment = itemIndex < orderedList.length - 1;
        if (hasNextSegment && segmentDelayMs > 0) {
          const keepGoing = await waitPlaybackFeelDelay({ durationMs: segmentDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
          if (!keepGoing) break;
        }
      }

      if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
      pass += 1;
      if (pass < repeatLimit && segmentDelayMs > 0) {
        const keepGoing = await waitPlaybackFeelDelay({ durationMs: segmentDelayMs, waitWhilePaused, stopSignalRef, playbackSessionRef, playbackSession });
        if (!keepGoing) break;
      }
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
