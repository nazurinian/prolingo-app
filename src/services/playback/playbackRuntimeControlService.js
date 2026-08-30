export const executeSettlePlaybackPromise = ({ playbackResolveRef }) => {
      const resolver = playbackResolveRef.current;
      playbackResolveRef.current = null;
      if (resolver) resolver();
};

export const executeWaitWhilePaused = async ({ pauseStateRef, stopSignalRef }) => {
      while (pauseStateRef.current && !stopSignalRef.current) {
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
  isPlaying, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog,
  ttsReplayRef, pauseSource = 'ui'
}) => {
      // Realtime playback control must use the ref as source-of-truth. React state
      // can lag by one render during rapid Pause -> Resume input.
      if (!isPlaying || pauseStateRef.current) return;
      pauseStateRef.current = true;

      const activeLocalAudio = currentAudioObjRef.current;
      if (activeLocalAudio && !activeLocalAudio.paused) activeLocalAudio.pause();

      // Foreground Browser TTS keeps the native pause/resume behavior that already
      // works on supported voices. Android MediaSession is different: testing shows
      // the browser may destroy the utterance on background Pause, so synth.resume()
      // later only restarts the silent media host. In that one path, deliberately
      // cancel the native utterance while keeping its logical playback promise alive;
      // Resume will recreate the SAME part from the beginning.
      const replayState = ttsReplayRef?.current;
      const shouldSuspendTtsForMediaSession =
        pauseSource === 'mediaSession' && !activeLocalAudio && replayState;

      if (shouldSuspendTtsForMediaSession) {
          replayState.suspended = true;
          synth.cancel();
      } else {
          // Do not gate pause on synth.speaking/synth.paused: Chromium can update
          // those flags after the utterance has already started producing audio.
          synth.pause();
      }

      // Pause the media host so Android changes the notification icon to Resume.
      if (silentAudioRef.current) silentAudioRef.current.pause();

      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
      setIsPaused(true);
      addLog("Playback", shouldSuspendTtsForMediaSession
        ? "Paused. Browser TTS part armed for restart on Resume."
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
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      setIsPaused(false);
      addLog("Playback", restartedTtsPart
        ? "Resumed. Browser TTS restarted current part."
        : "Resumed.");
};

export const executeSafePlayTransition = async ({
  forceStopAll, playbackSessionRef, stopSignalRef, pauseStateRef, actionCallback
}) => {
    forceStopAll();
    const transitionSession = playbackSessionRef.current;
    await new Promise(r => setTimeout(r, 120));

    // A Stop or newer Play/Next/Prev transition increments the playback session.
    // Never let this older pending transition clear that newer stop and restart audio.
    if (transitionSession !== playbackSessionRef.current) return false;

    stopSignalRef.current = false;
    pauseStateRef.current = false;
    await actionCallback();
    return true;
};
