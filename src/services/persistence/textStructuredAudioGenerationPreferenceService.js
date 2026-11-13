import {
  TEXT_STRUCTURED_GENERATION_DEFAULTS,
  TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION,
  normalizeTextStructuredAudioGenerationPreferences
} from '../../domain/text/textStructuredAudioGenerationDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES,
  buildResetTextStructuredBulkGenerationPreferences,
  buildResetTextStructuredGlobalEdgeAndBulkPreferences,
  buildResetTextStructuredGlobalEdgePreferences
} from '../../domain/text/textStructuredResetDomain.js';

export const TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY = 'prolingo_text_structured_audio_generation_preferences_v1';

export const loadTextStructuredAudioGenerationPreferences = () => {
  try {
    if (typeof window === 'undefined') return { ...TEXT_STRUCTURED_GENERATION_DEFAULTS };
    const raw = window.localStorage.getItem(TEXT_STRUCTURED_AUDIO_GENERATION_PREFERENCE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // HF2 one-time defaults migration: older beta.8 checkpoints used Libby as the
    // normal/manual EN Edge default. The frozen contract requires Sonia while
    // Bulk/Export keep Libby. Preserve every explicit bulk field independently.
    if (parsed && Number(parsed.defaultsVersion || 0) < TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION) {
      if (!parsed.edgeTextVoiceId || parsed.edgeTextVoiceId === 'en-GB-LibbyNeural') parsed.edgeTextVoiceId = 'en-GB-SoniaNeural';
      if (!Array.isArray(parsed.bulkTextVoiceIds) || !parsed.bulkTextVoiceIds.length) parsed.bulkTextVoiceIds = ['en-GB-LibbyNeural'];
      if (!parsed.bulkExportTextVoiceId) parsed.bulkExportTextVoiceId = 'en-GB-LibbyNeural';
    }
    return normalizeTextStructuredAudioGenerationPreferences(parsed);
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

/**
 * Resets Global Edge and/or Bulk Structured Text audio generation preferences while keeping
 * independent Sonia/Gadis vs Libby/Tuti defaults intact.
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
