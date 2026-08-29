export const executeBrowserTtsPlaybackService = ({
  textToRead,
  overrideVoice = null,
  selectedVoiceRef,
  stopSignalRef,
  synth,
  currentUtteranceRef,
  playbackResolveRef,
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
      const utterance = new SpeechSynthesisUtterance(textToRead);
      currentUtteranceRef.current = utterance;
      let settled = false;

      const finish = () => {
          if (settled) return;
          settled = true;
          if (playbackResolveRef.current === finish) playbackResolveRef.current = null;
          currentUtteranceRef.current = null;
          resolve();
      };

      playbackResolveRef.current = finish;
      utterance.voice = targetVoice;
      utterance.rate = Number(rate) || 1;
      utterance.pitch = Number(pitch) || 1;
      utterance.onend = finish;
      utterance.onerror = finish;

      setTimeout(() => {
          if (stopSignalRef.current) finish();
          else synth.speak(utterance);
      }, 10);
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
  rate,
  playbackResolveRef,
  shouldIgnoreLocalAudioFailure,
  shouldResolveLocalAudioFailure,
  resolveAudioFallbackVoice,
  selectedIndonesianVoiceRef,
  playTTS,
  addLog
}) => {
    return new Promise((resolve) => {
      if (stopSignalRef.current || !String(textToRead || '').trim()) {
          resolve();
          return;
      }

      const audioUrl = preferLocalAudio ? getLocalAudioUrl(item, part) : null;
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        currentAudioObjRef.current = audio;
        audio.playbackRate = Number(rate) || 1;
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

        const fallbackToTTS = () => {
            if (shouldIgnoreLocalAudioFailure(settled)) return;
            settled = true;
            cleanupAudio();
            if (shouldResolveLocalAudioFailure(stopSignalRef.current)) {
                resolve();
                return;
            }
            const fallbackVoice = resolveAudioFallbackVoice(part, selectedIndonesianVoiceRef.current);
            playTTS(textToRead, fallbackVoice).then(resolve);
        };

        playbackResolveRef.current = finish;
        audio.onended = finish;
        audio.onerror = () => {
          addLog("Warn", `Audio fail ${item.vocabId || item.displayId}/${part}. Fallback TTS.`);
          fallbackToTTS();
        };

        audio.play().catch(() => fallbackToTTS());
        return;
      }

      const fallbackVoice = resolveAudioFallbackVoice(part, selectedIndonesianVoiceRef.current);
      playTTS(textToRead, fallbackVoice).then(resolve);
    });
};
