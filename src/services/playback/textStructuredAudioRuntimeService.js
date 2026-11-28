export const executeStructuredTextRuntimeAudioPlaybackService = async ({
  url,
  currentAudioObjRef,
  playbackResolveRef,
  stopSignalRef,
  playbackSessionRef,
  waitWhilePaused,
  playbackRate = 1,
  onNowPlaying = null,
  continuous = false,
  canStart = null,
  sourceEvidence = null,
  addLog,
  label = 'Structured Text audio'
}) => {
  const session = playbackSessionRef?.current;
  const isCurrent = () => !stopSignalRef.current && playbackSessionRef?.current === session;
  if (isCurrent() && url && waitWhilePaused) await waitWhilePaused();
  if (!isCurrent() || !url) return { status: 'stopped' };
  if (canStart && !canStart()) return { status: 'stale' };

  return new Promise(resolve => {
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
        audio.onwaiting = null;
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
      if (!settled && isCurrent()) onNowPlaying({ ...sourceEvidence, media: audio });
    };
    if (continuous && onNowPlaying) audio.onwaiting = () => {
      if (!settled && isCurrent()) onNowPlaying(null);
    };
    audio.onended = () => finish(isCurrent() ? 'played' : 'stopped');
    audio.onerror = () => {
      if (settled || !isCurrent()) { finish('stopped'); return; }
      addLog?.('Warn', `${label} failed. Falling back to Browser TTS.`);
      finish('error');
    };
    audio.play().catch(() => {
      if (settled || !isCurrent()) { finish('stopped'); return; }
      addLog?.('Warn', `${label} could not start. Falling back to Browser TTS.`);
      finish('error');
    });
  });
};
