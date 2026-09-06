import {
  normalizeTextStructuredSpeakerKey,
  resolveTextStructuredSpeakerVoice
} from './textStructuredAudioIdentityDomain.js';

export const TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY = 'speakerVoiceMapV1';

const clean = value => String(value ?? '').trim();

const normalizeChannelMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([speaker, voiceName]) => [normalizeTextStructuredSpeakerKey(speaker), clean(voiceName)])
      .filter(([speaker, voiceName]) => Boolean(speaker && voiceName))
  );
};

export const normalizeTextStructuredSpeakerVoiceMap = candidate => ({
  text: normalizeChannelMap(candidate?.text),
  meaning: normalizeChannelMap(candidate?.meaning)
});

export const getTextStructuredSpeakerVoiceMap = documentLike =>
  normalizeTextStructuredSpeakerVoiceMap(documentLike?.metadata?.[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY]);

export const collectTextStructuredConversationSpeakers = documentTree => {
  const seen = new Set();
  const speakers = [];
  (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).forEach(block => {
    if (block?.blockType !== 'conversation') return;
    (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
      const label = clean(segment?.speaker);
      const key = normalizeTextStructuredSpeakerKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      speakers.push({ key, label });
    });
  });
  return speakers;
};

export const patchTextStructuredSpeakerVoiceMap = ({
  speakerVoiceMap,
  speaker,
  channel = 'text',
  voiceName = null
}) => {
  const normalized = normalizeTextStructuredSpeakerVoiceMap(speakerVoiceMap);
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);
  if (!speakerKey) throw new Error('Speaker voice profile requires a non-empty speaker label');
  if (!['text', 'meaning'].includes(channel)) throw new Error(`Unsupported speaker voice profile channel: ${channel}`);
  const nextChannel = { ...normalized[channel] };
  const voice = clean(voiceName);
  if (voice) nextChannel[speakerKey] = voice;
  else delete nextChannel[speakerKey];
  return { ...normalized, [channel]: nextChannel };
};

export const buildTextStructuredSpeakerVoiceMetadata = ({
  metadata,
  speaker,
  channel = 'text',
  voiceName = null
}) => {
  const baseMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const nextMap = patchTextStructuredSpeakerVoiceMap({
    speakerVoiceMap: baseMetadata[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY],
    speaker,
    channel,
    voiceName
  });
  const hasAssignments = Object.keys(nextMap.text).length > 0 || Object.keys(nextMap.meaning).length > 0;
  const nextMetadata = { ...baseMetadata };
  if (hasAssignments) nextMetadata[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY] = nextMap;
  else delete nextMetadata[TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY];
  return nextMetadata;
};

export const resolveTextStructuredRequestedSpeakerVoiceName = ({
  documentTree,
  speaker,
  channel = 'text',
  defaultVoiceName = null
}) => resolveTextStructuredSpeakerVoice({
  speaker,
  channel,
  speakerVoiceMap: getTextStructuredSpeakerVoiceMap(documentTree),
  defaultVoiceId: defaultVoiceName
});

export const getTextStructuredSpeakerAssignedVoiceName = ({
  documentTree,
  speaker,
  channel = 'text'
}) => {
  const map = getTextStructuredSpeakerVoiceMap(documentTree);
  const key = normalizeTextStructuredSpeakerKey(speaker);
  return clean(map?.[channel]?.[key]) || null;
};
