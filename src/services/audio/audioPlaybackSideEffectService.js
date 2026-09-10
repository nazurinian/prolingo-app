export const executeBrowserTtsPlaybackService = ({
  textToRead,
  overrideVoice = null,
  selectedVoiceRef,
  stopSignalRef,
  pauseStateRef,
  synth,
  currentUtteranceRef,
  ttsReplayRef,
  playbackResolveRef,
  rateRef,
  rate,
  pitch
}) => {
    return new Promise((resolve) => {
      const targetVoice = overrideVoice || selectedVoiceRef.current;
      if (stopSignalRef.current || !targetVoice || !String(textToRead || '').trim()) {
          resolve();
          return;
      }

      synth.cancel();
      let settled = false;

      const finish = () => {
          if (settled) return;
          settled = true;
          if (playbackResolveRef.current === finish) playbackResolveRef.current = null;
          currentUtteranceRef.current = null;
          if (ttsReplayRef?.current?.finish === finish) ttsReplayRef.current = null;
          resolve();
      };

      const handleUtteranceDone = () => {
          const replayState = ttsReplayRef?.current;
          // Android background MediaSession Pause may terminate the native
          // utterance. That termination is not the logical end of this ProLingo
          // part; keep the promise pending so Resume can recreate the same part.
          if (replayState?.finish === finish && replayState.suspended) {
              currentUtteranceRef.current = null;
              return;
          }
          finish();
      };

      const speakFreshUtterance = () => {
          if (settled || stopSignalRef.current) {
              finish();
              return false;
          }

          const utterance = new SpeechSynthesisUtterance(textToRead);
          currentUtteranceRef.current = utterance;
          utterance.voice = targetVoice;
          utterance.rate = Number(rateRef?.current ?? rate) || 1;
          utterance.pitch = Number(pitch) || 1;
          utterance.onend = handleUtteranceDone;
          utterance.onerror = handleUtteranceDone;

          if (synth.paused) synth.resume();
          synth.speak(utterance);
          return true;
      };

      playbackResolveRef.current = finish;
      if (ttsReplayRef) {
          ttsReplayRef.current = {
              finish,
              suspended: false,
              restart: () => {
                  const replayState = ttsReplayRef.current;
                  if (settled || stopSignalRef.current || replayState?.finish !== finish) {
                      finish();
                      return false;
                  }
                  replayState.suspended = false;
                  // Pause already cancelled the old Android utterance. Give the
                  // engine one task turn before queueing the replacement so the
                  // cancellation cannot consume the new utterance as well.
                  setTimeout(() => {
                      if (!settled && !stopSignalRef.current && !pauseStateRef?.current) {
                          speakFreshUtterance();
                      }
                  }, 25);
                  return true;
              }
          };
      }

      const startSpeechWhenActive = async () => {
          // Keep the short startup deferral from the frozen baseline, but do not
          // let a pending utterance start after the user has already pressed Pause.
          await new Promise(resolveStart => setTimeout(resolveStart, 10));
          while (pauseStateRef?.current && !stopSignalRef.current) {
              await new Promise(resolvePause => setTimeout(resolvePause, 50));
          }
          if (stopSignalRef.current) {
              finish();
              return;
          }
          speakFreshUtterance();
      };

      startSpeechWhenActive();
    });
};

export const executeAudioSourcePlaybackService = ({
  textToRead,
  item,
  part,
  stopSignalRef,
  preferLocalAudio,
  getLocalAudioUrl,
  currentAudioObjRef,
  rateRef,
  rate,
  playbackResolveRef,
  shouldIgnoreLocalAudioFailure,
  shouldResolveLocalAudioFailure,
  resolveAudioFallbackVoice,
  selectedIndonesianVoiceRef,
  playTTS,
  addLog
}) => {
    const fallbackToBrowserTts = () => {
      if (stopSignalRef.current) return Promise.resolve();
      const fallbackVoice = resolveAudioFallbackVoice(part, selectedIndonesianVoiceRef.current);
      return playTTS(textToRead, fallbackVoice);
    };

    if (stopSignalRef.current || !String(textToRead || '').trim()) return Promise.resolve();

    // C3.4.1: a local source can now be a lazy ZIP entry. Folder URLs remain
    // synchronous, while ZIP URLs resolve only when the requested audio is played.
    const localSource = preferLocalAudio ? getLocalAudioUrl(item, part) : null;
    return Promise.resolve(localSource)
      .catch(error => {
        addLog?.('Warn', `Audio source resolve fail ${item?.vocabId || item?.displayId}/${part}: ${error?.message || error}. Fallback TTS.`);
        return null;
      })
      .then(audioUrl => {
        if (stopSignalRef.current) return undefined;
        if (!audioUrl) return fallbackToBrowserTts();

        return new Promise((resolve) => {
          const audio = new Audio(audioUrl);
          currentAudioObjRef.current = audio;
          audio.playbackRate = Number(rateRef?.current ?? rate) || 1;
          let settled = false;

          const cleanupAudio = () => {
              if (currentAudioObjRef.current === audio) currentAudioObjRef.current = null;
              audio.onended = null;
              audio.onerror = null;
              if (playbackResolveRef.current === finish) playbackResolveRef.current = null;
          };

          const finish = () => {
              if (settled) return;
              settled = true;
              cleanupAudio();
              resolve();
          };

          const fallbackFromLocalFailure = () => {
              if (shouldIgnoreLocalAudioFailure(settled)) return;
              settled = true;
              cleanupAudio();
              if (shouldResolveLocalAudioFailure(stopSignalRef.current)) {
                  resolve();
                  return;
              }
              fallbackToBrowserTts().then(resolve);
          };

          playbackResolveRef.current = finish;
          audio.onended = finish;
          audio.onerror = () => {
            addLog("Warn", `Audio fail ${item.vocabId || item.displayId}/${part}. Fallback TTS.`);
            fallbackFromLocalFailure();
          };

          audio.play().catch(() => fallbackFromLocalFailure());
        });
      });
};
