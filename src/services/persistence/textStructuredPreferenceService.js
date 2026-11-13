import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  normalizeTextStructuredPreferences
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextStructuredGlobalBrowserTtsPreferences,
  buildResetTextStructuredGlobalPlaybackPreferences
} from '../../domain/text/textStructuredResetDomain.js';

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

/**
 * Resets global Structured Text playback and/or Browser TTS preferences cleanly to defaults.
 */
export const resetTextStructuredPreferences = (
  currentPreferences = {},
  { scope = TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS_AND_PLAYBACK, includeBrowserTts = true } = {}
) => {
  const next = scope === TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BROWSER_TTS
    ? buildResetTextStructuredGlobalBrowserTtsPreferences(currentPreferences)
    : buildResetTextStructuredGlobalPlaybackPreferences(currentPreferences, {
        includeBrowserTts: scope === TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_PLAYBACK ? false : includeBrowserTts
      });
  return executeTextStructuredPreferencePersistenceEffect(next);
};
