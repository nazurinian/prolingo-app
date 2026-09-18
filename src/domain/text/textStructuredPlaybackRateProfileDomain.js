import { getTextStructuredSegmentSpeakerId } from './textStructuredSpeakerIdentityDomain.js';
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';

export const TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY = 'audioPlaybackRateProfileV1';

const clean = value => String(value ?? '').trim();
const normalizeRate = value => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(2, Math.max(0.5, Math.round(number * 10) / 10));
};
const normalizeChannels = candidate => ({
  text: normalizeRate(candidate?.text),
  meaning: normalizeRate(candidate?.meaning)
});
const normalizeMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate).map(([key, value]) => [clean(key), normalizeRate(value)]).filter(([key, value]) => key && value));
};
const normalizeSpeakerMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate).map(([key, value]) => [normalizeTextStructuredSpeakerKey(key), normalizeRate(value)]).filter(([key, value]) => key && value));
};

export const getTextStructuredPlaybackRateProfile = recordLike => {
  const source = recordLike?.metadata?.[TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY] || {};
  return {
    channels: normalizeChannels(source.channels),
    speakerIds: { text: normalizeMap(source?.speakerIds?.text), meaning: normalizeMap(source?.speakerIds?.meaning) },
    speakers: { text: normalizeSpeakerMap(source?.speakers?.text), meaning: normalizeSpeakerMap(source?.speakers?.meaning) }
  };
};

export const buildTextStructuredPlaybackRateProfileMetadata = ({ metadata, channel = 'text', rate = null, speakerId = null, speaker = null }) => {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const profile = getTextStructuredPlaybackRateProfile({ metadata: base });
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const value = normalizeRate(rate);
  const stableId = clean(speakerId);
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);
  const next = {
    channels: { ...profile.channels },
    speakerIds: { text: { ...profile.speakerIds.text }, meaning: { ...profile.speakerIds.meaning } },
    speakers: { text: { ...profile.speakers.text }, meaning: { ...profile.speakers.meaning } }
  };
  if (stableId) {
    if (value) next.speakerIds[normalizedChannel][stableId] = value; else delete next.speakerIds[normalizedChannel][stableId];
  } else if (speakerKey) {
    if (value) next.speakers[normalizedChannel][speakerKey] = value; else delete next.speakers[normalizedChannel][speakerKey];
  } else next.channels[normalizedChannel] = value;

  const has = Boolean(next.channels.text || next.channels.meaning || Object.keys(next.speakerIds.text).length || Object.keys(next.speakerIds.meaning).length || Object.keys(next.speakers.text).length || Object.keys(next.speakers.meaning).length);
  const result = { ...base };
  if (has) result[TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY] = next;
  else delete result[TEXT_STRUCTURED_PLAYBACK_RATE_PROFILE_KEY];
  return result;
};

export const resolveTextStructuredEffectivePlaybackRate = ({ documentTree, block = null, segment = null, channel = 'text', globalRate = 1 }) => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const speakerId = getTextStructuredSegmentSpeakerId(segment);
  const speakerKey = normalizeTextStructuredSpeakerKey(segment?.speaker);
  const blockProfile = getTextStructuredPlaybackRateProfile(block);
  const documentProfile = getTextStructuredPlaybackRateProfile(documentTree);
  const candidates = [
    speakerId ? blockProfile.speakerIds[normalizedChannel]?.[speakerId] : null,
    speakerKey ? blockProfile.speakers[normalizedChannel]?.[speakerKey] : null,
    blockProfile.channels[normalizedChannel],
    speakerId ? documentProfile.speakerIds[normalizedChannel]?.[speakerId] : null,
    speakerKey ? documentProfile.speakers[normalizedChannel]?.[speakerKey] : null,
    documentProfile.channels[normalizedChannel],
    normalizeRate(globalRate) || 1
  ];
  return candidates.find(value => Number.isFinite(value)) || 1;
};
