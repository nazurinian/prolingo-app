import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';

export const TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY = 'speakerIdentityV1';
export const TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY = 'speakerVoiceProfileV2';

const clean = value => String(value ?? '').trim();
const hash = value => {
  let h = 2166136261;
  for (const ch of String(value || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
};

export const getTextStructuredSegmentSpeakerId = segment => clean(segment?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]) || null;
export const buildTextStructuredSegmentSpeakerIdentityMetadata = (metadata, speakerId) => ({ ...(metadata || {}), [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: clean(speakerId) });
export const deriveTextStructuredSpeakerId = ({ documentId, speaker }) => `SPK_${hash(`${clean(documentId)}::${normalizeTextStructuredSpeakerKey(speaker)}`)}`;

export const collectTextStructuredConversationSpeakerIdentities = documentTree => {
  const byId = new Map();
  (documentTree?.blocks || []).forEach(block => {
    if (block?.blockType !== 'conversation') return;
    (block?.segments || []).forEach(segment => {
      const label = clean(segment?.speaker);
      if (!label) return;
      const speakerId = getTextStructuredSegmentSpeakerId(segment) || deriveTextStructuredSpeakerId({ documentId: documentTree?.id, speaker: label });
      const current = byId.get(speakerId) || { id: speakerId, key: speakerId, label, segmentIds: [], persisted: Boolean(getTextStructuredSegmentSpeakerId(segment)) };
      current.segmentIds.push(segment.id);
      if (!current.label) current.label = label;
      current.persisted = current.persisted || Boolean(getTextStructuredSegmentSpeakerId(segment));
      byId.set(speakerId, current);
    });
  });
  return [...byId.values()];
};

const normalizeChannelMap = candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)
  ? Object.fromEntries(Object.entries(candidate).map(([id, voice]) => [clean(id), clean(voice)]).filter(([id, voice]) => id && voice))
  : {};
export const getTextStructuredSpeakerVoiceProfileV2 = documentLike => {
  const source = documentLike?.metadata?.[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY] || {};
  return { text: normalizeChannelMap(source.text), meaning: normalizeChannelMap(source.meaning) };
};
export const buildTextStructuredSpeakerVoiceProfileV2Metadata = ({ metadata, speakerId, channel = 'text', voiceName = null }) => {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const current = getTextStructuredSpeakerVoiceProfileV2({ metadata: base });
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const nextChannel = { ...current[normalizedChannel] };
  const id = clean(speakerId); const voice = clean(voiceName);
  if (!id) throw new Error('Speaker identity is required');
  if (voice) nextChannel[id] = voice; else delete nextChannel[id];
  const next = { ...current, [normalizedChannel]: nextChannel };
  const result = { ...base };
  if (Object.keys(next.text).length || Object.keys(next.meaning).length) result[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY] = next;
  else delete result[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY];
  return result;
};
