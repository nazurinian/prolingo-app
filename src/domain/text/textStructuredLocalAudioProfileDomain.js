import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import { getTextStructuredSegmentSpeakerId } from './textStructuredSpeakerIdentityDomain.js';

export const TEXT_STRUCTURED_LOCAL_AUDIO_PROFILE_KEY = 'localAudioPlaybackProfileV1';

const clean = value => String(value ?? '').trim();
const normalizeChannelMap = candidate => ({ text: clean(candidate?.text) || null, meaning: clean(candidate?.meaning) || null });
const normalizeIdMap = candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)
  ? Object.fromEntries(Object.entries(candidate).map(([id, voice]) => [clean(id), clean(voice)]).filter(([id, voice]) => id && voice)) : {};
const normalizeSpeakerMap = candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)
  ? Object.fromEntries(Object.entries(candidate).map(([key, voice]) => [normalizeTextStructuredSpeakerKey(key), clean(voice)]).filter(([key, voice]) => key && voice)) : {};

export const getTextStructuredLocalAudioProfile = recordLike => {
  const source = recordLike?.metadata?.[TEXT_STRUCTURED_LOCAL_AUDIO_PROFILE_KEY] || {};
  return {
    channels: normalizeChannelMap(source.channels),
    speakerIds: { text: normalizeIdMap(source?.speakerIds?.text), meaning: normalizeIdMap(source?.speakerIds?.meaning) },
    speakers: { text: normalizeSpeakerMap(source?.speakers?.text), meaning: normalizeSpeakerMap(source?.speakers?.meaning) }
  };
};

export const buildTextStructuredLocalAudioProfileMetadata = ({ metadata, channel = 'text', voiceId = null, speakerId = null, speaker = null }) => {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const current = getTextStructuredLocalAudioProfile({ metadata: base });
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const value = clean(voiceId) || null;
  const stableId = clean(speakerId);
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);
  const next = {
    channels: { ...current.channels },
    speakerIds: { text: { ...current.speakerIds.text }, meaning: { ...current.speakerIds.meaning } },
    speakers: { text: { ...current.speakers.text }, meaning: { ...current.speakers.meaning } }
  };
  if (stableId) {
    if (value) next.speakerIds[normalizedChannel][stableId] = value; else delete next.speakerIds[normalizedChannel][stableId];
  } else if (speakerKey) {
    if (value) next.speakers[normalizedChannel][speakerKey] = value; else delete next.speakers[normalizedChannel][speakerKey];
  } else next.channels[normalizedChannel] = value;
  const has = Boolean(next.channels.text || next.channels.meaning || Object.keys(next.speakerIds.text).length || Object.keys(next.speakerIds.meaning).length || Object.keys(next.speakers.text).length || Object.keys(next.speakers.meaning).length);
  const result = { ...base };
  if (has) result[TEXT_STRUCTURED_LOCAL_AUDIO_PROFILE_KEY] = next; else delete result[TEXT_STRUCTURED_LOCAL_AUDIO_PROFILE_KEY];
  return result;
};

export const resolveTextStructuredCustomLocalAudioVoice = ({ documentTree, block = null, segment = null, channel = 'text' }) => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const speakerId = getTextStructuredSegmentSpeakerId(segment);
  const speakerKey = normalizeTextStructuredSpeakerKey(segment?.speaker);
  const blockProfile = getTextStructuredLocalAudioProfile(block);
  const documentProfile = getTextStructuredLocalAudioProfile(documentTree);
  return clean(
    (speakerId ? blockProfile.speakerIds[normalizedChannel]?.[speakerId] : null)
    || (speakerKey ? blockProfile.speakers[normalizedChannel]?.[speakerKey] : null)
    || blockProfile.channels[normalizedChannel]
    || (speakerId ? documentProfile.speakerIds[normalizedChannel]?.[speakerId] : null)
    || (speakerKey ? documentProfile.speakers[normalizedChannel]?.[speakerKey] : null)
    || documentProfile.channels[normalizedChannel]
  ) || null;
};

export const collectTextStructuredAvailableLocalVoices = ({ documentTree, audioVariants = [], runtimeAudioUrls = {} }) => {
  const result = { channels: { text: new Set(), meaning: new Set() }, speakerIds: {} };
  const segmentMap = new Map();
  (documentTree?.blocks || []).forEach(block => (block?.segments || []).forEach(segment => segmentMap.set(segment.id, { block, segment })));
  for (const variant of Array.isArray(audioVariants) ? audioVariants : []) {
    const info = segmentMap.get(variant?.segmentId);
    if (!info) continue;
    const runtime = runtimeAudioUrls?.[variant.id];
    if (!runtime?.url && !runtime?.folderBacked && !runtime?.zipBacked && !runtime?.stagingBacked) continue;
    const channel = variant?.channel === 'meaning' ? 'meaning' : 'text';
    const voiceId = clean(variant?.voiceId);
    if (!voiceId) continue;
    result.channels[channel].add(voiceId);
    const speakerId = getTextStructuredSegmentSpeakerId(info.segment);
    if (speakerId) {
      result.speakerIds[speakerId] ||= { text: new Set(), meaning: new Set() };
      result.speakerIds[speakerId][channel].add(voiceId);
    }
  }
  return {
    channels: { text: [...result.channels.text].sort(), meaning: [...result.channels.meaning].sort() },
    speakerIds: Object.fromEntries(Object.entries(result.speakerIds).map(([id, channels]) => [id, { text: [...channels.text].sort(), meaning: [...channels.meaning].sort() }]))
  };
};
