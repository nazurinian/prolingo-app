import { normalizeTextStructuredPreferences } from './textStructuredPlaybackPreferenceDomain.js';
import { normalizeTextStructuredAudioGenerationPreferences } from './textStructuredAudioGenerationDomain.js';
import {
  buildResetTextStructuredGlobalBrowserTtsPreferences,
  buildResetTextStructuredGlobalEdgePreferences,
  buildResetTextWorkspaceAudioMetadata,
  buildResetTextSpeakerAudioMetadata
} from './textStructuredResetDomain.js';

const BROWSER_KEYS = Object.freeze([
  'browserTextVoiceName',
  'browserMeaningVoiceName',
  'browserTextRate',
  'browserMeaningRate',
  'browserRatesLinked',
  'browserTtsRate'
]);

const EDGE_KEYS = Object.freeze([
  'engine',
  'edgeTextVoiceId',
  'edgeMeaningVoiceId',
  'geminiVoiceName',
  'edgeRate',
  'edgePitch',
  'generateText',
  'generateMeaning'
]);

// Explicitly compare only the fields covered by that Reset operation.
// This is intentionally independent of transient busy/saving states.
export const isTextGlobalBrowserTtsDirty = preferences => {
  const current = normalizeTextStructuredPreferences(preferences || {});
  const reset = buildResetTextStructuredGlobalBrowserTtsPreferences(current);
  return BROWSER_KEYS.some(key => current[key] !== reset[key]);
};

export const isTextGlobalEdgeDirty = preferences => {
  const current = normalizeTextStructuredAudioGenerationPreferences(preferences || {});
  const reset = buildResetTextStructuredGlobalEdgePreferences(current);
  return EDGE_KEYS.some(key => current[key] !== reset[key]);
};

// Metadata comparison is restricted to audio fields which the production Reset
// builder would change, preserving protected metadata, audio binaries, and ZIPs.
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
};
const sameMetadata = (left, right) => JSON.stringify(canonical(left || {})) === JSON.stringify(canonical(right || {}));

export const isTextWorkspaceAudioDirty = documentLike => {
  const metadata = documentLike?.metadata || {};
  return !sameMetadata(
    metadata,
    buildResetTextWorkspaceAudioMetadata(metadata, { includeSpeakers: false })
  );
};

export const isTextSpeakerAudioDirty = (documentLike, {
  speakerId = null,
  speaker = null,
  includeSync = false
} = {}) => {
  const metadata = documentLike?.metadata || {};
  return !sameMetadata(
    metadata,
    buildResetTextSpeakerAudioMetadata(metadata, {
      speakerId,
      speaker,
      includeSync,
      isDocument: true
    })
  );
};
