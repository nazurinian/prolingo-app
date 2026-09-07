import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import { getTextStructuredSpeakerVoiceMap } from './textStructuredSpeakerVoiceProfileDomain.js';

export const TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY = 'audioVoiceOverrideV1';

const clean = value => String(value ?? '').trim();
const CHANNELS = ['text', 'meaning'];

const normalizeChannel = channel => channel === 'meaning' ? 'meaning' : 'text';

const normalizeChannelOverrides = candidate => ({
  text: clean(candidate?.text) || null,
  meaning: clean(candidate?.meaning) || null
});

const normalizeSpeakerChannelMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([speaker, voiceName]) => [normalizeTextStructuredSpeakerKey(speaker), clean(voiceName)])
      .filter(([speaker, voiceName]) => Boolean(speaker && voiceName))
  );
};

export const normalizeTextStructuredVoiceOverrideProfile = candidate => ({
  channels: normalizeChannelOverrides(candidate?.channels),
  speakers: {
    text: normalizeSpeakerChannelMap(candidate?.speakers?.text),
    meaning: normalizeSpeakerChannelMap(candidate?.speakers?.meaning)
  }
});

export const getTextStructuredVoiceOverrideProfile = recordLike =>
  normalizeTextStructuredVoiceOverrideProfile(recordLike?.metadata?.[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]);

const profileHasAssignments = profile => Boolean(
  profile?.channels?.text
  || profile?.channels?.meaning
  || Object.keys(profile?.speakers?.text || {}).length
  || Object.keys(profile?.speakers?.meaning || {}).length
);

export const buildTextStructuredVoiceOverrideMetadata = ({
  metadata,
  channel = 'text',
  voiceName = null,
  speaker = null
}) => {
  const normalizedChannel = normalizeChannel(channel);
  const baseMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const profile = getTextStructuredVoiceOverrideProfile({ metadata: baseMetadata });
  const voice = clean(voiceName) || null;
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);

  let nextProfile = profile;
  if (speakerKey) {
    const nextMap = { ...(profile.speakers?.[normalizedChannel] || {}) };
    if (voice) nextMap[speakerKey] = voice;
    else delete nextMap[speakerKey];
    nextProfile = {
      ...profile,
      speakers: {
        ...profile.speakers,
        [normalizedChannel]: nextMap
      }
    };
  } else {
    nextProfile = {
      ...profile,
      channels: {
        ...profile.channels,
        [normalizedChannel]: voice
      }
    };
  }

  const nextMetadata = { ...baseMetadata };
  if (profileHasAssignments(nextProfile)) nextMetadata[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY] = nextProfile;
  else delete nextMetadata[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY];
  return nextMetadata;
};

export const collectTextStructuredCardSpeakers = block => {
  const seen = new Set();
  const result = [];
  if (block?.blockType !== 'conversation') return result;
  (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
    const label = clean(segment?.speaker);
    const key = normalizeTextStructuredSpeakerKey(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({ key, label });
  });
  return result;
};

export const resolveTextStructuredEffectiveVoiceProfile = ({
  documentTree,
  block,
  segment,
  channel = 'text',
  defaultVoiceName = null,
  includeDocumentSpeakerProfile = true,
  simpleCardSpeakerMode = false
}) => {
  const normalizedChannel = normalizeChannel(channel);
  const speakerKey = normalizeTextStructuredSpeakerKey(segment?.speaker);
  const segmentProfile = getTextStructuredVoiceOverrideProfile(segment);
  const blockProfile = getTextStructuredVoiceOverrideProfile(block);
  const documentSpeakerMap = getTextStructuredSpeakerVoiceMap(documentTree);

  const isConversation = block?.blockType === 'conversation';
  const candidates = simpleCardSpeakerMode
    ? [
        { source: 'segment', voiceName: segmentProfile.channels?.[normalizedChannel] },
        { source: 'card-speaker', voiceName: isConversation && speakerKey ? blockProfile.speakers?.[normalizedChannel]?.[speakerKey] : null },
        { source: 'card', voiceName: !isConversation ? blockProfile.channels?.[normalizedChannel] : null },
        { source: 'global', voiceName: defaultVoiceName }
      ]
    : [
        { source: 'segment', voiceName: segmentProfile.channels?.[normalizedChannel] },
        { source: 'card-speaker', voiceName: speakerKey ? blockProfile.speakers?.[normalizedChannel]?.[speakerKey] : null },
        { source: 'document-speaker', voiceName: includeDocumentSpeakerProfile && speakerKey ? documentSpeakerMap?.[normalizedChannel]?.[speakerKey] : null },
        { source: 'card', voiceName: blockProfile.channels?.[normalizedChannel] },
        { source: 'global', voiceName: defaultVoiceName }
      ];
  const selected = candidates.find(candidate => clean(candidate.voiceName)) || { source: 'none', voiceName: null };
  return {
    channel: normalizedChannel,
    voiceName: clean(selected.voiceName) || null,
    source: selected.source,
    inherited: selected.source === 'global' || selected.source === 'document-speaker'
  };
};

export const resolveTextStructuredEffectiveVoiceForItem = ({
  documentTree,
  item,
  channel = 'text',
  defaultVoiceName = null,
  includeDocumentSpeakerProfile = true,
  simpleCardSpeakerMode = false
}) => {
  const blockId = item?.blockId || item?.textId;
  const segmentId = item?.segmentId || item?.id;
  const block = (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).find(candidate => candidate?.id === blockId) || null;
  const segment = (Array.isArray(block?.segments) ? block.segments : []).find(candidate => candidate?.id === segmentId) || null;
  return resolveTextStructuredEffectiveVoiceProfile({ documentTree, block, segment, channel, defaultVoiceName, includeDocumentSpeakerProfile, simpleCardSpeakerMode });
};

export const getTextStructuredVoiceOverrideLabel = source => ({
  segment: 'Segment override',
  'card-speaker': 'Card speaker override',
  'document-speaker': 'Document speaker profile',
  card: 'Card override',
  global: 'Global default',
  none: 'No voice'
}[source] || 'Voice');

export const TEXT_STRUCTURED_VOICE_OVERRIDE_CHANNELS = Object.freeze([...CHANNELS]);
