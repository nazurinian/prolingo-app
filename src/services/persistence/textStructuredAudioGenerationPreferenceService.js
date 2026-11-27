import { normalizeTextStructuredAudioGenerationPreferences } from '../../domain/text/textStructuredAudioGenerationDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextStructuredBulkGenerationPreferences,
  buildResetTextStructuredGlobalEdgeAndBulkPreferences,
  buildResetTextStructuredGlobalEdgePreferences
} from '../../domain/text/textStructuredResetDomain.js';

export const TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY = 'prolingo_text_structured_audio_generation_preferences_v1';

export const loadTextStructuredAudioGenerationPreferences = () => {
  try {
    if (typeof window === 'undefined') return normalizeTextStructuredAudioGenerationPreferences();
    const raw = window.localStorage.getItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY);
    // Older records have no saved-choice provenance. Honor every stored voice.
    return normalizeTextStructuredAudioGenerationPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTextStructuredAudioGenerationPreferences();
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

/**
 * Resets the requested Global Edge and/or Bulk generation preference scope.
 */
export const resetTextStructuredAudioGenerationPreferences = (
  currentPreferences = {},
  { scope = TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_EDGE_AND_BULK } = {}
) => {
  const next = scope === TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_EDGE
    ? buildResetTextStructuredGlobalEdgePreferences(currentPreferences)
    : scope === TEXT_STRUCTURED_RESET_SCOPES.GLOBAL_BULK
      ? buildResetTextStructuredBulkGenerationPreferences(currentPreferences)
      : buildResetTextStructuredGlobalEdgeAndBulkPreferences();
  return executeTextStructuredAudioGenerationPreferencePersistenceEffect(next);
};
