import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  normalizeTextStructuredPreferences
} from './textStructuredPlaybackPreferenceDomain.js';
import {
  TEXT_STRUCTURED_GENERATION_DEFAULTS,
  normalizeTextStructuredAudioGenerationPreferences
} from './textStructuredAudioGenerationDomain.js';
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import {
  TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY,
  getTextStructuredVoiceOverrideProfile
} from './textStructuredVoiceAssignmentDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY,
  getTextStructuredAudioDownloadProfile
} from './textStructuredAudioDownloadProfileDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY,
  TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_VERSION
} from './textStructuredAudioPlaybackOrderDomain.js';
import {
  TEXT_STRUCTURED_LOCAL_AUDIO_PROFILE_KEY,
  getTextStructuredLocalAudioProfile
} from './textStructuredLocalAudioProfileDomain.js';
import {
  TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY,
  getTextStructuredPlaybackRateProfile
} from './textStructuredPlaybackRateProfileDomain.js';
import { TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY } from './textStructuredAudioSyncProfileDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY,
  getTextStructuredSpeakerVoiceMap
} from './textStructuredSpeakerVoiceProfileDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY,
  getTextStructuredSpeakerVoiceProfileV2
} from './textStructuredSpeakerIdentityDomain.js';

export const TEXT_STRUCTURED_RESET_SCOPES = Object.freeze({
  GLOBAL_BROWSER_TTS: 'global-browser-tts',
  GLOBAL_PLAYBACK: 'global-playback',
  GLOBAL_BROWSER_TTS_AND_PLAYBACK: 'global-browser-tts-and-playback',
  GLOBAL_EDGE: 'global-edge',
  GLOBAL_BULK: 'global-bulk',
  GLOBAL_EDGE_AND_BULK: 'global-edge-and-bulk',
  WORKSPACE: 'workspace',
  WORKSPACE_BROWSER_TTS: 'workspace-browser-tts',
  WORKSPACE_EDGE_PRESET: 'workspace-edge-preset',
  SPEAKERS: 'speakers',
  CARD: 'card',
  SEGMENT: 'segment'
});

export const TEXT_STRUCTURED_PROTECTED_METADATA_KEYS = Object.freeze([
  'speakerRegistryV1',
  'speakerIdentityV1',
  'paragraphRoleV1',
  'sentenceAuthoringV1',
  'fullAudioArtifactsV1',
  'contentInvalidatedV1',
  'externalSourceV1',
  'externalEntityV1',
  'externalCollectionHintV1'
]);

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

const cloneMetadataObject = metadata => (
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {}
);

const createDefaultGlobalPlaybackOrder = () => ({
  version: TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_VERSION,
  channels: { text: [], meaning: [] },
  ttsOnly: null
});

const PROFILE_DEFS = Object.freeze([
  {
    key: TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY,
    getProfile: getTextStructuredVoiceOverrideProfile,
    hasModes: false
  },
  {
    key: TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY,
    getProfile: getTextStructuredAudioDownloadProfile,
    hasModes: true
  },
  {
    key: TEXT_STRUCTURED_LOCAL_AUDIO_PROFILE_KEY,
    getProfile: getTextStructuredLocalAudioProfile,
    hasModes: false
  },
  {
    key: TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY,
    getProfile: getTextStructuredPlaybackRateProfile,
    hasModes: false
  }
]);

const hasProfileEntries = (profile, hasModes = false) => Boolean(
  (hasModes && (profile?.modes?.text || profile?.modes?.meaning))
  || profile?.channels?.text
  || profile?.channels?.meaning
  || Object.keys(profile?.speakerIds?.text || {}).length
  || Object.keys(profile?.speakerIds?.meaning || {}).length
  || Object.keys(profile?.speakers?.text || {}).length
  || Object.keys(profile?.speakers?.meaning || {}).length
);

const omitSpeakerKeyFromChannelMap = (channelMap, predicate) => {
  const next = {};
  Object.entries(channelMap || {}).forEach(([entryKey, voiceValue]) => {
    if (!predicate(entryKey)) next[entryKey] = voiceValue;
  });
  return next;
};

const stripStructuredProfileMetadata = ({
  metadata,
  target = 'all',
  speakerId = null,
  speaker = null,
  profileKeys = null
}) => {
  const result = cloneMetadataObject(metadata);
  const targetSpeakerId = lower(speakerId);
  const targetSpeakerKey = normalizeTextStructuredSpeakerKey(speaker);
  const specificSpeaker = Boolean(targetSpeakerId || targetSpeakerKey);

  PROFILE_DEFS.forEach(({ key, getProfile, hasModes }) => {
    if (profileKeys && !profileKeys.includes(key)) return;
    if (!Object.prototype.hasOwnProperty.call(result, key)) return;
    if (target === 'all') {
      delete result[key];
      return;
    }

    const current = getProfile({ metadata: result });
    const next = {
      ...(hasModes ? { modes: { ...current.modes } } : {}),
      channels: { ...current.channels },
      speakers: {
        text: { ...current.speakers.text },
        meaning: { ...current.speakers.meaning }
      },
      speakerIds: {
        text: { ...current.speakerIds.text },
        meaning: { ...current.speakerIds.meaning }
      }
    };

    if (target === 'channels') {
      if (hasModes) next.modes = { text: null, meaning: null };
      next.channels = { text: null, meaning: null };
    } else if (target === 'speakers') {
      if (!specificSpeaker) {
        next.speakers = { text: {}, meaning: {} };
        next.speakerIds = { text: {}, meaning: {} };
      } else {
        ['text', 'meaning'].forEach(channel => {
          if (targetSpeakerId) {
            next.speakerIds[channel] = omitSpeakerKeyFromChannelMap(
              next.speakerIds[channel],
              entryId => lower(entryId) === targetSpeakerId
            );
          }
          if (targetSpeakerKey) {
            next.speakers[channel] = omitSpeakerKeyFromChannelMap(
              next.speakers[channel],
              entryKey => normalizeTextStructuredSpeakerKey(entryKey) === targetSpeakerKey
            );
          }
        });
      }
    }

    if (hasProfileEntries(next, hasModes)) result[key] = next;
    else delete result[key];
  });

  return result;
};

const stripDocumentSpeakerMaps = ({ metadata, speakerId = null, speaker = null }) => {
  const result = cloneMetadataObject(metadata);
  const targetSpeakerId = lower(speakerId);
  const targetSpeakerKey = normalizeTextStructuredSpeakerKey(speaker);
  const specificSpeaker = Boolean(targetSpeakerId || targetSpeakerKey);

  if (!specificSpeaker) {
    delete result[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY];
    delete result[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY];
    return result;
  }

  if (targetSpeakerId && Object.prototype.hasOwnProperty.call(result, TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY)) {
    const currentV2 = getTextStructuredSpeakerVoiceProfileV2({ metadata: result });
    const nextV2 = {
      text: omitSpeakerKeyFromChannelMap(currentV2.text, entryId => lower(entryId) === targetSpeakerId),
      meaning: omitSpeakerKeyFromChannelMap(currentV2.meaning, entryId => lower(entryId) === targetSpeakerId)
    };
    if (Object.keys(nextV2.text).length || Object.keys(nextV2.meaning).length) {
      result[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY] = nextV2;
    } else {
      delete result[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY];
    }
  }

  if (targetSpeakerKey && Object.prototype.hasOwnProperty.call(result, TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY)) {
    const currentV1 = getTextStructuredSpeakerVoiceMap({ metadata: result });
    const nextV1 = {
      text: omitSpeakerKeyFromChannelMap(currentV1.text, entryKey => normalizeTextStructuredSpeakerKey(entryKey) === targetSpeakerKey),
      meaning: omitSpeakerKeyFromChannelMap(currentV1.meaning, entryKey => normalizeTextStructuredSpeakerKey(entryKey) === targetSpeakerKey)
    };
    if (Object.keys(nextV1.text).length || Object.keys(nextV1.meaning).length) {
      result[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY] = nextV1;
    } else {
      delete result[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY];
    }
  }

  return result;
};

/**
 * Resets global Structured Text Browser TTS voices and rates while preserving other playback settings.
 */
export const buildResetTextStructuredGlobalBrowserTtsPreferences = (currentPreferences = {}) => {
  const normalized = normalizeTextStructuredPreferences(currentPreferences || {});
  return normalizeTextStructuredPreferences({
    ...normalized,
    browserTextVoiceName: DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserTextVoiceName,
    browserMeaningVoiceName: DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserMeaningVoiceName,
    browserTextRate: DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserTextRate,
    browserMeaningRate: DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserMeaningRate,
    browserRatesLinked: DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserRatesLinked,
    browserTtsRate: DEFAULT_TEXT_STRUCTURED_PREFERENCES.browserTtsRate
  });
};

/**
 * Resets global Structured Text playback preferences (representation, channels, source mode,
 * Shuffle/repeat/delays/resume, manual playback defaults, and global local priority).
 */
export const buildResetTextStructuredGlobalPlaybackPreferences = (
  currentPreferences = {},
  { includeBrowserTts = true } = {}
) => {
  const normalizedCurrent = normalizeTextStructuredPreferences(currentPreferences || {});
  const baseline = normalizeTextStructuredPreferences({
    ...DEFAULT_TEXT_STRUCTURED_PREFERENCES,
    globalAudioPlaybackOrderV1: createDefaultGlobalPlaybackOrder()
  });
  if (includeBrowserTts) return baseline;
  return normalizeTextStructuredPreferences({
    ...baseline,
    browserTextVoiceName: normalizedCurrent.browserTextVoiceName,
    browserMeaningVoiceName: normalizedCurrent.browserMeaningVoiceName,
    browserTextRate: normalizedCurrent.browserTextRate,
    browserMeaningRate: normalizedCurrent.browserMeaningRate,
    browserRatesLinked: normalizedCurrent.browserRatesLinked,
    browserTtsRate: normalizedCurrent.browserTtsRate
  });
};

/**
 * Resets single/global Edge generation preferences while keeping independent Bulk selections intact.
 */
export const buildResetTextStructuredGlobalEdgePreferences = (currentPreferences = {}) => {
  const normalized = normalizeTextStructuredAudioGenerationPreferences(currentPreferences || {});
  return normalizeTextStructuredAudioGenerationPreferences({
    ...normalized,
    engine: TEXT_STRUCTURED_GENERATION_DEFAULTS.engine,
    edgeTextVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeTextVoiceId,
    edgeMeaningVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeMeaningVoiceId,
    geminiVoiceName: TEXT_STRUCTURED_GENERATION_DEFAULTS.geminiVoiceName,
    edgeRate: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeRate,
    edgePitch: TEXT_STRUCTURED_GENERATION_DEFAULTS.edgePitch,
    generateText: TEXT_STRUCTURED_GENERATION_DEFAULTS.generateText,
    generateMeaning: TEXT_STRUCTURED_GENERATION_DEFAULTS.generateMeaning
  });
};

/**
 * Resets Bulk multi-voice and export preferences while keeping single/global Edge defaults intact.
 */
export const buildResetTextStructuredBulkGenerationPreferences = (currentPreferences = {}) => {
  const normalized = normalizeTextStructuredAudioGenerationPreferences(currentPreferences || {});
  return normalizeTextStructuredAudioGenerationPreferences({
    ...normalized,
    bulkTextVoiceIds: [...TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkTextVoiceIds],
    bulkMeaningVoiceIds: [...TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkMeaningVoiceIds],
    bulkGenerateSplit: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkGenerateSplit,
    bulkGenerateFull: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkGenerateFull,
    bulkAutoExport: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkAutoExport,
    bulkExportFormat: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportFormat,
    bulkExportVoicePolicy: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportVoicePolicy,
    bulkExportTextVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportTextVoiceId,
    bulkExportMeaningVoiceId: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportMeaningVoiceId,
    bulkExportRepresentation: TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkExportRepresentation
  });
};

/**
 * Resets both Global Edge and Bulk generation defaults (preserving Sonia/Gadis vs Libby/Tuti split).
 */
export const buildResetTextStructuredGlobalEdgeAndBulkPreferences = () =>
  normalizeTextStructuredAudioGenerationPreferences({
    ...TEXT_STRUCTURED_GENERATION_DEFAULTS,
    bulkTextVoiceIds: [...TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkTextVoiceIds],
    bulkMeaningVoiceIds: [...TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkMeaningVoiceIds]
  });

/**
 * Clears workspace-level audio preferences from Document metadata without removing protected identities.
 */
export const buildResetTextWorkspaceAudioMetadata = (metadata, { includeSpeakers = true } = {}) => {
  let result = stripStructuredProfileMetadata({
    metadata,
    target: includeSpeakers ? 'all' : 'channels'
  });
  delete result[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY];
  if (includeSpeakers) {
    delete result[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY];
    result = stripDocumentSpeakerMaps({ metadata: result });
  }
  return result;
};

/**
 * A Workspace Browser TTS reset is the equivalent of selecting Inherit on
 * both narrator-voice and playback-rate controls. Local MP3, speaker,
 * playback-order, and download profiles are not part of this selection.
 */
export const buildResetTextWorkspaceBrowserTtsMetadata = metadata =>
  stripStructuredProfileMetadata({
    metadata,
    target: 'channels',
    profileKeys: [
      TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY,
      TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY
    ]
  });

/**
 * Restore Workspace EN/ID Edge Download presets to DEFAULT/Global.
 * Keep narrator, speaker, local-player, and all stored audio untouched.
 */
export const buildResetTextWorkspaceEdgePresetMetadata = metadata =>
  stripStructuredProfileMetadata({
    metadata,
    target: 'channels',
    profileKeys: [TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY]
  });

/**
 * Clears speaker-level audio overrides across Document or Card metadata while preserving speaker registries.
 */
export const buildResetTextSpeakerAudioMetadata = (
  metadata,
  { speakerId = null, speaker = null, includeSync = true, isDocument = true } = {}
) => {
  let result = stripStructuredProfileMetadata({
    metadata,
    target: 'speakers',
    speakerId,
    speaker
  });
  const specificSpeaker = Boolean(clean(speakerId) || normalizeTextStructuredSpeakerKey(speaker));
  if (includeSync && !specificSpeaker) {
    delete result[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY];
  }
  if (isDocument) {
    result = stripDocumentSpeakerMaps({ metadata: result, speakerId, speaker });
  }
  return result;
};

/**
 * Clears Card (Block) audio override metadata while preserving paragraphRoleV1, fullAudioArtifactsV1,
 * and externalEntityV1.
 */
export const buildResetTextBlockAudioMetadata = (metadata, { includeSpeakers = true } = {}) => {
  const result = stripStructuredProfileMetadata({
    metadata,
    target: includeSpeakers ? 'all' : 'channels'
  });
  delete result[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY];
  if (includeSpeakers) {
    delete result[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY];
  }
  return result;
};

/**
 * Clears Segment audio override metadata while preserving speakerIdentityV1, sentenceAuthoringV1,
 * contentInvalidatedV1, and externalEntityV1.
 */
export const buildResetTextSegmentAudioMetadata = (metadata) => {
  const result = stripStructuredProfileMetadata({ metadata, target: 'all' });
  delete result[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY];
  delete result[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY];
  return result;
};

/**
 * Evaluates whether a Text settings reset may safely proceed given active ZIP imports,
 * IndexedDB transactions, or system locks.
 */
export const canExecuteTextStructuredReset = ({
  zipImportActive = false,
  textLibraryCommandBusy = false,
  isSystemBusy = false,
  generationRunning = false,
  requireGenerationIdle = false
} = {}) => {
  if (zipImportActive) {
    return {
      allowed: false,
      blockedBy: 'zip-import',
      reason: 'Wait for or cancel the active Portable Audio ZIP import before resetting audio settings.'
    };
  }
  if (textLibraryCommandBusy) {
    return {
      allowed: false,
      blockedBy: 'database-transaction',
      reason: 'Wait for the current Text Library database transaction to finish before resetting audio settings.'
    };
  }
  if (isSystemBusy) {
    return {
      allowed: false,
      blockedBy: 'system-busy',
      reason: 'Wait for the active system operation to finish before resetting audio settings.'
    };
  }
  if (requireGenerationIdle && generationRunning) {
    return {
      allowed: false,
      blockedBy: 'generation-running',
      reason: 'Audio generation is currently running; wait for cancellation to finish before resetting metadata.'
    };
  }
  return { allowed: true, blockedBy: null, reason: null };
};
