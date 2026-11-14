import { normalizeTextStructuredPreferences } from './textStructuredPlaybackPreferenceDomain.js';
import { normalizeTextStructuredAudioGenerationPreferences } from './textStructuredAudioGenerationDomain.js';
import {
  buildResetTextBlockAudioMetadata,
  buildResetTextSegmentAudioMetadata,
  buildResetTextSpeakerAudioMetadata,
  buildResetTextStructuredBulkGenerationPreferences,
  buildResetTextStructuredGlobalBrowserTtsPreferences,
  buildResetTextStructuredGlobalEdgePreferences,
  buildResetTextStructuredGlobalPlaybackPreferences,
  buildResetTextWorkspaceBrowserTtsMetadata,
  buildResetTextWorkspaceEdgePresetMetadata
} from './textStructuredResetDomain.js';

const sameStructuredValue = (left, right) => {
  if (Object.is(left, right)) return true;
  if (left == null || right == null) return left === right;
  if (typeof left !== typeof right) return false;
  if (typeof left !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (!sameStructuredValue(left[i], right[i])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!sameStructuredValue(left[key], right[key])) return false;
  }
  return true;
};

/**
 * Compares two metadata or preference records using reference-equality fast-paths
 * so untouched large payloads (e.g. fullAudioArtifactsV1) are never traversed.
 */
export const sameStructuredResetMetadata = (left, right) => {
  const current = left || {};
  const reset = right || {};
  if (Object.is(current, reset)) return true;
  const keys = new Set([...Object.keys(current), ...Object.keys(reset)]);
  for (const key of keys) {
    if (Object.is(current[key], reset[key])) continue;
    if (!sameStructuredValue(current[key], reset[key])) return false;
  }
  return true;
};

/**
 * Evaluates whether Global Browser TTS preferences differ from canonical defaults.
 */
export const isTextGlobalBrowserTtsDirty = preferences => {
  const current = normalizeTextStructuredPreferences(preferences || {});
  const reset = buildResetTextStructuredGlobalBrowserTtsPreferences(current);
  return !sameStructuredResetMetadata(current, reset);
};

/**
 * Evaluates whether Global Playback preferences (excluding Browser TTS voices/rates)
 * differ from canonical defaults.
 */
export const isTextGlobalPlaybackDirty = preferences => {
  const current = normalizeTextStructuredPreferences(preferences || {});
  const reset = buildResetTextStructuredGlobalPlaybackPreferences(current, { includeBrowserTts: false });
  return !sameStructuredResetMetadata(current, reset);
};

/**
 * Evaluates whether Global Edge generation preferences differ from canonical defaults
 * (Sonia EN / Gadis ID / 0% rate / 0Hz pitch / etc.), independent of Staging Stale coverage.
 */
export const isTextGlobalEdgeDirty = generationPreferences => {
  const current = normalizeTextStructuredAudioGenerationPreferences(generationPreferences || {});
  const reset = buildResetTextStructuredGlobalEdgePreferences(current);
  return !sameStructuredResetMetadata(current, reset);
};

/**
 * Evaluates whether Bulk Edge generation and export preferences differ from canonical defaults.
 */
export const isTextBulkGenerationDirty = generationPreferences => {
  const current = normalizeTextStructuredAudioGenerationPreferences(generationPreferences || {});
  const reset = buildResetTextStructuredBulkGenerationPreferences(current);
  return !sameStructuredResetMetadata(current, reset);
};

/**
 * Evaluates whether Workspace Browser TTS channel voice or speed overrides exist.
 */
export const isTextWorkspaceBrowserTtsDirty = documentTree => {
  const metadata = documentTree?.metadata || {};
  return !sameStructuredResetMetadata(metadata, buildResetTextWorkspaceBrowserTtsMetadata(metadata));
};

/**
 * Evaluates whether Workspace Edge MP3 presets (downloadProfileV1) differ from DEFAULT/Global.
 */
export const isTextWorkspaceEdgePresetDirty = documentTree => {
  const metadata = documentTree?.metadata || {};
  return !sameStructuredResetMetadata(metadata, buildResetTextWorkspaceEdgePresetMetadata(metadata));
};

/**
 * Evaluates whether speaker-level audio overrides exist across Document or Card metadata.
 */
export const isTextSpeakerAudioDirty = (documentTree, {
  speakerId = null,
  speaker = null,
  includeSync = false
} = {}) => {
  const metadata = documentTree?.metadata || {};
  if (!sameStructuredResetMetadata(
    metadata,
    buildResetTextSpeakerAudioMetadata(metadata, {
      speakerId,
      speaker,
      includeSync,
      isDocument: true
    })
  )) {
    return true;
  }
  return (documentTree?.blocks || []).some(block => {
    const blockMetadata = block?.metadata || {};
    return !sameStructuredResetMetadata(
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

/**
 * Evaluates whether a Card (block) or any of its segments have saved audio overrides.
 */
export const isTextCardAudioDirty = block => {
  if (!block) return false;
  const blockMetadata = block?.metadata || {};
  if (!sameStructuredResetMetadata(
    blockMetadata,
    buildResetTextBlockAudioMetadata(blockMetadata, { includeSpeakers: true })
  )) {
    return true;
  }
  return (block?.segments || []).some(segment => isTextSegmentAudioDirty(segment));
};

/**
 * Evaluates whether a Segment has saved audio overrides.
 */
export const isTextSegmentAudioDirty = segment => {
  if (!segment) return false;
  const segmentMetadata = segment?.metadata || {};
  return !sameStructuredResetMetadata(
    segmentMetadata,
    buildResetTextSegmentAudioMetadata(segmentMetadata)
  );
};

/**
 * Separates Reset visual dirty state (100% vs 40% opacity) from transient busy blocking,
 * so temporary transactions never flash Reset button opacity.
 */
export const getTextResetButtonState = ({ dirty = false, busyBlocked = false } = {}) => ({
  dirty: Boolean(dirty),
  busyBlocked: Boolean(busyBlocked),
  disabled: !dirty || Boolean(busyBlocked),
  opacityClass: dirty ? 'opacity-100' : 'opacity-40',
  interactionClass: dirty ? (busyBlocked ? 'cursor-wait' : 'cursor-pointer') : 'cursor-not-allowed'
});
