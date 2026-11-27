export const executeSettlePlaybackPromise = ({ playbackResolveRef }) => {
      const resolver = playbackResolveRef.current;
      playbackResolveRef.current = null;
      if (resolver) resolver();
};

export const executeWaitWhilePaused = async ({ pauseStateRef, stopSignalRef, playbackSessionRef }) => {
      const session = playbackSessionRef?.current;
      while (pauseStateRef.current && !stopSignalRef.current && playbackSessionRef?.current === session) {
          await new Promise(resolve => setTimeout(resolve, 100));
      }
};

export const executeWaitPlaybackDelay = async ({
  durationMs, sessionId, playbackSessionRef, waitWhilePaused, stopSignalRef, pauseStateRef
}) => {
      let remaining = Math.max(0, Number(durationMs) || 0);
      while (remaining > 0) {
          await waitWhilePaused();
          if (stopSignalRef.current || sessionId !== playbackSessionRef.current) return false;
          const slice = Math.min(100, remaining);
          await new Promise(resolve => setTimeout(resolve, slice));
          if (!pauseStateRef.current) remaining -= slice;
      }
      return !stopSignalRef.current && sessionId === playbackSessionRef.current;
};

export const executePausePlayback = ({
  isPlaying, isMobile = false, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog,
  ttsReplayRef, pauseSource = 'ui'
}) => {
      // Realtime playback control must use the ref as source-of-truth. React state
      // can lag by one render during rapid Pause -> Resume input.
      if (!isPlaying || pauseStateRef.current) return;
      pauseStateRef.current = true;

      const activeLocalAudio = currentAudioObjRef.current;
      if (activeLocalAudio && !activeLocalAudio.paused) activeLocalAudio.pause();

      // Desktop Browser TTS keeps the native pause/resume behavior that is already
      // runtime-stable. On Android/mobile Chromium, however, BOTH notification Pause
      // and the in-app Pause button can destroy/drop the active SpeechSynthesis
      // utterance. A later synth.resume() may then resume only the silent media host,
      // leaving ProLingo in a playing-but-silent state. Reuse the proven C7 logical
      // replay fallback for every mobile Browser TTS Pause: keep the playback promise
      // pending, cancel the native utterance, and restart the SAME part on Resume.
      // Local/generated HTMLAudioElement playback remains true pause/resume.
      const replayState = ttsReplayRef?.current;
      const shouldSuspendTtsForReplay =
        !activeLocalAudio && replayState && (pauseSource === 'mediaSession' || isMobile);

      if (shouldSuspendTtsForReplay) {
          replayState.suspended = true;
          synth.cancel();
      } else {
          // Do not gate pause on synth.speaking/synth.paused: Chromium can update
          // those flags after the utterance has already started producing audio.
          synth.pause();
      }

      // Pause the media host so Android changes the notification icon to Resume.
      if (silentAudioRef.current) silentAudioRef.current.pause();

      setIsPaused(true);
      addLog("Playback", shouldSuspendTtsForReplay
        ? "Paused. Mobile Browser TTS part armed for restart on Resume."
        : "Paused.");
};

export const executeResumePlayback = ({
  isPlaying, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog, ttsReplayRef
}) => {
      if (!isPlaying || !pauseStateRef.current) return;
      pauseStateRef.current = false;

      const activeLocalAudio = currentAudioObjRef.current;
      if (activeLocalAudio?.paused) activeLocalAudio.play().catch(() => {});

      let restartedTtsPart = false;
      const replayState = ttsReplayRef?.current;
      if (!activeLocalAudio && replayState?.suspended && typeof replayState.restart === 'function') {
          restartedTtsPart = replayState.restart() !== false;
      } else if (!activeLocalAudio) {
          synth.resume();
      } else if (synth.paused || synth.speaking) {
          synth.resume();
      }

      if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
      setIsPaused(false);
      addLog("Playback", restartedTtsPart
        ? "Resumed. Browser TTS restarted current part."
        : "Resumed.");
};

export const executeSafePlayTransition = async ({
  forceStopAll, playbackSessionRef, playbackContextRef, stopSignalRef, pauseStateRef, actionCallback, pendingSession, onPending, onStarted, onError
}) => {
    forceStopAll();
    const transitionSession = playbackSessionRef.current;
    // Transport can navigate the validated queue during the handoff delay.
    // A pending session has no audible evidence yet.
    if (playbackContextRef && pendingSession) {
      playbackContextRef.current = { ...pendingSession, pending: true, sessionId: transitionSession };
      onPending?.();
    }
    await new Promise(r => setTimeout(r, 120));

    // A Stop or newer Play/Next/Prev transition increments the playback session.
    // Never let this older pending transition clear that newer stop and restart audio.
    if (transitionSession !== playbackSessionRef.current) return false;

    stopSignalRef.current = false;
    pauseStateRef.current = false;
    try {
      const execution = actionCallback();
      if (transitionSession === playbackSessionRef.current) onStarted?.();
      await execution;
      return true;
    } catch (error) {
      if (transitionSession === playbackSessionRef.current) {
        forceStopAll();
        onError?.(error);
      }
      return false;
    }
};

export const readOwnedPlaybackSession = ({ playbackSessionRef, playbackContextRef, stopSignalRef }) => {
  const session = playbackContextRef?.current;
  return session?.sessionId === playbackSessionRef.current && (session.pending || !stopSignalRef.current)
    ? session : null;
};

export const navigateOwnedPlayback = (session, direction) => {
  if (!session) return false;
  const { orderedList, nowPlayingCardOrder, cursorSegmentId, blockId, queueIndex, restart } = session;
  const queue = nowPlayingCardOrder ?? orderedList;
  if (!restart || !queue?.length || !['prev', 'next'].includes(direction)) return false;
  if (session.headingIntro) {
    const target = direction === 'next' ? queue[0] : queue.at(-1);
    restart(nowPlayingCardOrder ? orderedList.find(item => item.blockId === target) : target);
    return true;
  }
  const current = nowPlayingCardOrder ? queue.indexOf(blockId)
    : cursorSegmentId != null ? queue.findIndex(item => item.id === cursorSegmentId) : queueIndex;
  if (!Number.isInteger(current) || current < 0 || current >= queue.length) return false;
  // Manual transport wraps within the owned queue. Natural completion is handled by the executor.
  const index = (current + queue.length + (direction === 'next' ? 1 : -1)) % queue.length;
  if (index !== current) restart(nowPlayingCardOrder ? orderedList.find(item => item.blockId === queue[index]) : queue[index], index);
  return true;
};
