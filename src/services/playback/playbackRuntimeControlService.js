import { shouldPausePlayback, shouldResumePlayback } from '../../domain/playback/playbackControlDomain';

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
  isPlaying, isPaused, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog
}) => {
      if (!shouldPausePlayback({ isPlaying, isPaused })) return;
      pauseStateRef.current = true;
      if (currentAudioObjRef.current && !currentAudioObjRef.current.paused) currentAudioObjRef.current.pause();
      if (synth.speaking && !synth.paused) synth.pause();
      if (silentAudioRef.current) silentAudioRef.current.pause();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
      setIsPaused(true);
      addLog("Playback", "Paused.");
};

export const executeResumePlayback = ({
  isPlaying, isPaused, pauseStateRef, currentAudioObjRef, synth, silentAudioRef, setIsPaused, addLog
}) => {
      if (!shouldResumePlayback({ isPlaying, isPaused })) return;
      pauseStateRef.current = false;
      if (currentAudioObjRef.current?.paused) currentAudioObjRef.current.play().catch(() => {});
      if (synth.paused) synth.resume();
      if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      setIsPaused(false);
      addLog("Playback", "Resumed.");
};

export const executeSafePlayTransition = async ({ forceStopAll, stopSignalRef, pauseStateRef, actionCallback }) => {
    forceStopAll();
    await new Promise(r => setTimeout(r, 120));
    stopSignalRef.current = false;
    pauseStateRef.current = false;
    await actionCallback();
};
