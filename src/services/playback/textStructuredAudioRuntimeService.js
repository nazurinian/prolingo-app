export const executeStructuredTextRuntimeAudioPlaybackService = ({
  url,
  currentAudioObjRef,
  playbackResolveRef,
  stopSignalRef,
  playbackRate = 1,
  onNowPlaying = null,
  sourceEvidence = null,
  addLog,
  label = 'Structured Text audio'
}) => new Promise(resolve => {
  if (stopSignalRef.current || !url) {
    resolve({ status: 'stopped' });
    return;
  }

  const audio = new Audio(url);
  currentAudioObjRef.current = audio;
  audio.playbackRate = Number(playbackRate) || 1;
  let settled = false;

  const cleanup = () => {
    if (currentAudioObjRef.current === audio) currentAudioObjRef.current = null;
    audio.onended = null;
    audio.onerror = null;
    if (onNowPlaying) {
      audio.onplaying = null;
      onNowPlaying(null);
    }
    if (playbackResolveRef.current === settleFromExternal) playbackResolveRef.current = null;
  };

  const finish = status => {
    if (settled) return;
    settled = true;
    cleanup();
    resolve({ status });
  };

  const settleFromExternal = () => finish('stopped');
  playbackResolveRef.current = settleFromExternal;
  if (onNowPlaying) audio.onplaying = () => {
    if (!settled) onNowPlaying({ ...sourceEvidence, media: audio });
  };
  audio.onended = () => finish('played');
  audio.onerror = () => {
    addLog?.('Warn', `${label} failed. Falling back to Browser TTS.`);
    finish('error');
  };
  audio.play().catch(() => {
    addLog?.('Warn', `${label} could not start. Falling back to Browser TTS.`);
    finish('error');
  });
});
