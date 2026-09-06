import {
  TEXT_STRUCTURED_GENERATION_DEFAULTS,
  normalizeTextStructuredAudioGenerationPreferences
} from '../../domain/text/textStructuredAudioGenerationDomain.js';

export const TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY = 'prolingo_text_structured_audio_generation_preferences_v1';

export const loadTextStructuredAudioGenerationPreferences = () => {
  try {
    if (typeof window === 'undefined') return { ...TEXT_STRUCTURED_GENERATION_DEFAULTS };
    const raw = window.localStorage.getItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY);
    return normalizeTextStructuredAudioGenerationPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...TEXT_STRUCTURED_GENERATION_DEFAULTS };
  }
};

export const executeTextStructuredAudioGenerationPreferencePersistenceEffect = preferences => {
  const normalized = normalizeTextStructuredAudioGenerationPreferences(preferences);
  try {
    window.localStorage.setItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('Unable to persist structured Text audio generation preferences:', error);
  }
  return normalized;
};
