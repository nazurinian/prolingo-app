export const TEXT_STRUCTURED_DISPLAY_MODES = Object.freeze({
  TEXT_ONLY: 'text-only',
  MEANING_ONLY: 'meaning-only',
  TEXT_ACTIVE_MEANING: 'text-active-meaning',
  TEXT_MEANING: 'text-meaning'
});

export const TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES = Object.freeze({
  TEXT_ONLY: 'text-only',
  MEANING_ONLY: 'meaning-only',
  TEXT_THEN_MEANING: 'text-meaning',
  MEANING_THEN_TEXT: 'meaning-text'
});

export const TEXT_STRUCTURED_AUDIO_SOURCE_MODES = Object.freeze({
  LOCAL_FIRST: 'local-first',
  TTS_ONLY: 'tts-only'
});

export const DEFAULT_TEXT_STRUCTURED_PREFERENCES = Object.freeze({
  // Preserve the accepted A6 visual baseline by default: both channels visible,
  // but only Text is spoken until the user explicitly changes the Play contract.
  displayMode: TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING,
  playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
  browserTextVoiceName: null,
  browserMeaningVoiceName: null,
  browserTtsRate: 1,
  audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST
});

const displayModes = new Set(Object.values(TEXT_STRUCTURED_DISPLAY_MODES));
const playbackModes = new Set(Object.values(TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES));
const normalizeText = value => String(value ?? '').trim();
const normalizeVoiceName = value => normalizeText(value) || null;
const normalizeRate = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserTtsRate;
  return Math.min(2, Math.max(0.5, Math.round(numeric * 10) / 10));
};

export const normalizeTextStructuredPreferences = candidate => ({
  displayMode: displayModes.has(candidate?.displayMode)
    ? candidate.displayMode
    : DEFAULT_TEXT_STRUCTURED_PREFERENCES.displayMode,
  playbackChannelMode: playbackModes.has(candidate?.playbackChannelMode)
    ? candidate.playbackChannelMode
    : DEFAULT_TEXT_STRUCTURED_PREFERENCES.playbackChannelMode,
  browserTextVoiceName: normalizeVoiceName(candidate?.browserTextVoiceName),
  browserMeaningVoiceName: normalizeVoiceName(candidate?.browserMeaningVoiceName),
  browserTtsRate: normalizeRate(candidate?.browserTtsRate),
  audioSourceMode: candidate?.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY
    ? TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY
    : TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST
});

export const resolveStructuredTextDisplayState = ({ displayMode, isActive = false }) => {
  const normalized = normalizeTextStructuredPreferences({ displayMode }).displayMode;
  return {
    showText: normalized !== TEXT_STRUCTURED_DISPLAY_MODES.MEANING_ONLY,
    showMeaning:
      normalized === TEXT_STRUCTURED_DISPLAY_MODES.MEANING_ONLY
      || normalized === TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING
      || (normalized === TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING && isActive),
    meaningIsActiveOnly: normalized === TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING
  };
};

export const resolveStructuredTextPlaybackChannelSteps = (item, playbackChannelMode) => {
  const mode = normalizeTextStructuredPreferences({ playbackChannelMode }).playbackChannelMode;
  const text = normalizeText(item?.text);
  const meaning = normalizeText(item?.meaning);
  const textStep = text ? { channel: 'text', content: text } : null;
  const meaningStep = meaning ? { channel: 'meaning', content: meaning } : null;

  if (mode === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY) {
    return meaningStep ? [meaningStep] : [];
  }
  if (mode === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING) {
    return [textStep, meaningStep].filter(Boolean);
  }
  if (mode === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_THEN_TEXT) {
    return [meaningStep, textStep].filter(Boolean);
  }
  return textStep ? [textStep] : [];
};

export const hasStructuredTextPlayableChannel = (item, playbackChannelMode) =>
  resolveStructuredTextPlaybackChannelSteps(item, playbackChannelMode).length > 0;

export const getStructuredTextDisplayModeLabel = mode => ({
  [TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ONLY]: 'EN only',
  [TEXT_STRUCTURED_DISPLAY_MODES.MEANING_ONLY]: 'ID only',
  [TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING]: 'EN + active ID',
  [TEXT_STRUCTURED_DISPLAY_MODES.TEXT_MEANING]: 'EN + ID'
}[mode] || 'EN + ID');

export const getStructuredTextPlaybackModeLabel = mode => ({
  [TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY]: 'EN',
  [TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY]: 'ID',
  [TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING]: 'EN → ID',
  [TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_THEN_TEXT]: 'ID → EN'
}[mode] || 'EN');
