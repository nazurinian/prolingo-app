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
const sameMetadata = (left, right) => {
  const current = left || {};
  const reset = right || {};
  const keys = new Set([...Object.keys(current), ...Object.keys(reset)]);
  for (const key of keys) {
    // Protected large metadata (including Full audio artifacts) is passed
    // through by reference; never traverse it when only audio overrides change.
    if (Object.is(current[key], reset[key])) continue;
    if (JSON.stringify(canonical(current[key])) !== JSON.stringify(canonical(reset[key]))) return false;
  }
  return true;
};

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
  if (!sameMetadata(
    metadata,
    buildResetTextSpeakerAudioMetadata(metadata, {
      speakerId,
      speaker,
      includeSync,
      isDocument: true
    })
  )) return true;

  // The production speaker-reset command also updates speaker overrides
  // in every Card/Block. Check those as well, or a Card-only override would
  // leave its Speaker Reset icon incorrectly disabled.
  return (documentLike?.blocks || []).some(block => {
    const blockMetadata = block?.metadata || {};
    return !sameMetadata(
      blockMetadata,
      buildResetTextSpeakerAudioMetadata(blockMetadata, {
        speakerId,
        speaker,
        includeSync: false,
        isDocument: false
      })
    );
  });
};
