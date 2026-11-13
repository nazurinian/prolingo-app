import { encodeWAV } from '../../utils/audioUtils';
import { resolveBrowserTtsVoiceState } from '../../domain/audio/browserTtsVoiceDecisionDomain';

export const executeSilentAudioAnchorEffect = ({ silentWavUrlRef, silentAudioRef }) => {
      // Create 30 seconds of silence WAV
      const silentWavBlob = new Blob([encodeWAV(new Int16Array(48000 * 30))], { type: 'audio/wav' });
      const url = URL.createObjectURL(silentWavBlob);
      silentWavUrlRef.current = url;

      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.01; // Tiny volume to ensure system treats as active audio
      silentAudioRef.current = audio;
      
      return () => {
          if (silentAudioRef.current) {
              silentAudioRef.current.pause();
              silentAudioRef.current = null;
          }
          if (silentWavUrlRef.current) {
              URL.revokeObjectURL(silentWavUrlRef.current);
          }
      };
};

export const executeBrowserTtsVoiceLifecycleEffect = ({
  synth,
  selectedVoiceRef,
  selectedIndonesianVoiceRef,
  selectedVoiceExplicitRef = null,
  selectedIndonesianVoiceExplicitRef = null,
  setVoices,
  setSelectedVoice,
  setIndonesianVoices,
  setSelectedIndonesianVoice
}) => {
    // Some browsers expose no speechSynthesis API at all. Leave the voice
    // lists empty and let the playback service exit safely in that case.
    if (!synth || typeof synth.getVoices !== 'function') {
      setVoices([]);
      setIndonesianVoices([]);
      return () => {};
    }
    let autoSelectedEngName = '';
    let autoSelectedIdName = '';
    const loadVoices = () => {
      const allVoices = synth.getVoices();
      const voiceState = resolveBrowserTtsVoiceState(allVoices);
      if (!voiceState) return;

      setVoices(voiceState.engVoices);
      const currentEngName = String(selectedVoiceRef.current?.name || '').trim();
      const canAutoUpdateEng = !currentEngName || (
        !selectedVoiceExplicitRef?.current
        && Boolean(autoSelectedEngName)
        && currentEngName === autoSelectedEngName
      );
      if (canAutoUpdateEng && voiceState.defaultEng && voiceState.defaultEng.name !== currentEngName) {
        autoSelectedEngName = String(voiceState.defaultEng.name || '').trim();
        setSelectedVoice(voiceState.defaultEng);
      }

      setIndonesianVoices(voiceState.idVoices);
      const currentIdName = String(selectedIndonesianVoiceRef.current?.name || '').trim();
      const canAutoUpdateId = !currentIdName || (
        !selectedIndonesianVoiceExplicitRef?.current
        && Boolean(autoSelectedIdName)
        && currentIdName === autoSelectedIdName
      );
      if (canAutoUpdateId && voiceState.defaultId && voiceState.defaultId.name !== currentIdName) {
        autoSelectedIdName = String(voiceState.defaultId.name || '').trim();
        setSelectedIndonesianVoice(voiceState.defaultId);
      }
    };
    
    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

    const pollInterval = setInterval(() => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
            loadVoices();
            if (voices.length > 5) clearInterval(pollInterval); 
        }
    }, 500);

    const timeoutId = setTimeout(() => clearInterval(pollInterval), 5000);

    return () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
    };
};
