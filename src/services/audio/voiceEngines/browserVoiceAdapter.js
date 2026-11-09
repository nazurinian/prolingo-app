// Thin bridge to ProLingo's existing Browser TTS playback.
// The existing P9 playback, pause/resume, stop, replay and MediaSession handlers
// remain authoritative. This adapter must not create a second SpeechSynthesis queue.
import { VOICE_OUTPUT } from './voiceEngineRegistry.js';

export const createLegacyBrowserVoiceAdapter = ({
  playTTS,
  getVoices = () => [],
  isSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window
} = {}) => {
  if (typeof playTTS !== 'function') {
    throw new TypeError('createLegacyBrowserVoiceAdapter requires the existing playTTS function.');
  }

  return {
    id: 'browser',
    label: 'Browser TTS',
    output: VOICE_OUTPUT.DIRECT,
    capabilities: Object.freeze({
      offline: 'voice-dependent',
      rawAudio: false,
      streamingChunks: false,
      voiceSelection: true,
      rate: true,
      pitch: true,
      transport: 'existing-prolingo-player'
    }),
    isAvailable: () => Boolean(isSupported()),
    getVoices: () => getVoices(),
    // voice is the native SpeechSynthesisVoice object used by ProLingo today.
    // A missing/empty text request is a no-op. The legacy player owns cancellation.
    play: ({ text, voice = null } = {}) => {
      if (!String(text ?? '').trim()) return Promise.resolve();
      return Promise.resolve().then(() => playTTS(String(text), voice));
    }
  };
};
