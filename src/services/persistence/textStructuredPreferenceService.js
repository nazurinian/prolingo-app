import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  normalizeTextStructuredPreferences
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';

export const TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY = 'prolingo_text_structured_preferences_v1';

export const loadTextStructuredPreferences = () => {
  try {
    if (typeof window === 'undefined') return { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES };
    const raw = window.localStorage.getItem(TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY);
    return normalizeTextStructuredPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES };
  }
};

export const executeTextStructuredPreferencePersistenceEffect = preferences => {
  const normalized = normalizeTextStructuredPreferences(preferences);
  try {
    window.localStorage.setItem(TEXT_STRUCTURED_PREFERENCE_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('Unable to persist structured Text player preferences:', error);
  }
  return normalized;
};
