import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';

export const TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY = 'audioDownloadProfileV1';

const clean = value => String(value ?? '').trim();

const normalizeChannelMap = candidate => ({
  text: clean(candidate?.text) || null,
  meaning: clean(candidate?.meaning) || null
});

const normalizeSpeakerMap = candidate => {
  const result = { text: {}, meaning: {} };
  ['text', 'meaning'].forEach(channel => {
    const source = candidate?.[channel] && typeof candidate[channel] === 'object' ? candidate[channel] : {};
    Object.entries(source).forEach(([speaker, voiceId]) => {
      const key = normalizeTextStructuredSpeakerKey(speaker);
      const value = clean(voiceId);
      if (key && value) result[channel][key] = value;
    });
  });
  return result;
};

export const getTextStructuredAudioDownloadProfile = record => {
  const source = record?.metadata?.[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY] || record?.[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY] || {};
  return {
    channels: normalizeChannelMap(source.channels),
    speakers: normalizeSpeakerMap(source.speakers)
  };
};

export const buildTextStructuredAudioDownloadProfileMetadata = ({
  metadata,
  channel = 'text',
  voiceId = null,
  speaker = null
}) => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const current = getTextStructuredAudioDownloadProfile({ metadata });
  const next = {
    channels: { ...current.channels },
    speakers: {
      text: { ...current.speakers.text },
      meaning: { ...current.speakers.meaning }
    }
  };
  const value = clean(voiceId) || null;
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);
  if (speakerKey) {
    if (value) next.speakers[normalizedChannel][speakerKey] = value;
    else delete next.speakers[normalizedChannel][speakerKey];
  } else {
    next.channels[normalizedChannel] = value;
  }
  const hasChannels = Boolean(next.channels.text || next.channels.meaning);
  const hasSpeakers = Boolean(Object.keys(next.speakers.text).length || Object.keys(next.speakers.meaning).length);
  const result = { ...(metadata || {}) };
  if (hasChannels || hasSpeakers) result[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY] = next;
  else delete result[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY];
  return result;
};

export const resolveTextStructuredEffectiveDownloadVoice = ({
  block,
  segment,
  channel = 'text',
  preferences = null
}) => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const defaultVoiceId = clean(normalizedChannel === 'meaning' ? preferences?.edgeMeaningVoiceId : preferences?.edgeTextVoiceId)
    || (normalizedChannel === 'meaning' ? 'su-ID-TutiNeural' : 'en-GB-LibbyNeural');
  const segmentProfile = getTextStructuredAudioDownloadProfile(segment);
  const segmentVoice = segmentProfile.channels[normalizedChannel];
  if (segmentVoice) return { voiceId: segmentVoice, source: 'segment-download' };

  const blockProfile = getTextStructuredAudioDownloadProfile(block);
  const speakerKey = normalizeTextStructuredSpeakerKey(segment?.speaker);
  const speakerVoice = speakerKey ? blockProfile.speakers[normalizedChannel]?.[speakerKey] : null;
  if (speakerVoice) return { voiceId: speakerVoice, source: 'card-speaker-download' };

  const cardVoice = blockProfile.channels[normalizedChannel];
  if (cardVoice) return { voiceId: cardVoice, source: 'card-download' };

  return { voiceId: defaultVoiceId, source: 'global-download' };
};
