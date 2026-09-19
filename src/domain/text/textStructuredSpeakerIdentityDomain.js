import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';

export const TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY = 'speakerIdentityV1';
export const TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY = 'speakerVoiceProfileV2';
export const TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY = 'speakerRegistryV1';

const clean = value => String(value ?? '').trim();
const hash = value => {
  let h = 2166136261;
  for (const ch of String(value || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
};
const normalizeMetadataObject = metadata => metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

export const getTextStructuredSegmentSpeakerId = segment => clean(segment?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]) || null;
export const buildTextStructuredSegmentSpeakerIdentityMetadata = (metadata, speakerId) => ({ ...normalizeMetadataObject(metadata), [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: clean(speakerId) });
export const deriveTextStructuredSpeakerId = ({ documentId, speaker }) => `SPK_${hash(`${clean(documentId)}::${normalizeTextStructuredSpeakerKey(speaker)}`)}`;

const normalizeRegistryEntry = candidate => {
  const id = clean(candidate?.id);
  const label = clean(candidate?.label);
  if (!id || !label) return null;
  return { id, label };
};

export const getTextStructuredSpeakerRegistry = documentLike => {
  const source = documentLike?.metadata?.[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY];
  const entries = Array.isArray(source) ? source : Array.isArray(source?.speakers) ? source.speakers : [];
  const byId = new Map();
  entries.forEach(candidate => {
    const entry = normalizeRegistryEntry(candidate);
    if (!entry || byId.has(entry.id)) return;
    byId.set(entry.id, entry);
  });
  return [...byId.values()];
};

export const buildTextStructuredSpeakerRegistryMetadata = ({ metadata, speakers = [] }) => {
  const base = normalizeMetadataObject(metadata);
  const normalized = [];
  const seenIds = new Set();
  const seenLabels = new Set();
  speakers.forEach(candidate => {
    const entry = normalizeRegistryEntry(candidate);
    if (!entry) return;
    const labelKey = normalizeTextStructuredSpeakerKey(entry.label);
    if (!labelKey || seenIds.has(entry.id) || seenLabels.has(labelKey)) return;
    seenIds.add(entry.id);
    seenLabels.add(labelKey);
    normalized.push(entry);
  });
  const next = { ...base };
  if (normalized.length) next[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY] = normalized;
  else delete next[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY];
  return next;
};

export const buildTextStructuredUpsertSpeakerRegistryMetadata = ({
  metadata,
  documentId,
  speakerId = null,
  label
}) => {
  const cleanLabel = clean(label);
  if (!cleanLabel) throw new Error('Speaker registry requires a non-empty label');
  const current = getTextStructuredSpeakerRegistry({ metadata });
  const normalizedLabel = normalizeTextStructuredSpeakerKey(cleanLabel);
  const existingByLabel = current.find(entry => normalizeTextStructuredSpeakerKey(entry.label) === normalizedLabel) || null;
  const id = clean(speakerId) || existingByLabel?.id || deriveTextStructuredSpeakerId({ documentId, speaker: cleanLabel });
  const labelCollision = current.find(entry => entry.id !== id && normalizeTextStructuredSpeakerKey(entry.label) === normalizedLabel);
  if (labelCollision) throw new Error(`Speaker label “${cleanLabel}” is already registered`);
  const next = current.some(entry => entry.id === id)
    ? current.map(entry => entry.id === id ? { id, label: cleanLabel } : entry)
    : [...current, { id, label: cleanLabel }];
  return buildTextStructuredSpeakerRegistryMetadata({ metadata, speakers: next });
};

export const buildTextStructuredRemoveSpeakerRegistryMetadata = ({ metadata, speakerId }) => {
  const id = clean(speakerId);
  if (!id) return normalizeMetadataObject(metadata);
  return buildTextStructuredSpeakerRegistryMetadata({
    metadata,
    speakers: getTextStructuredSpeakerRegistry({ metadata }).filter(entry => entry.id !== id)
  });
};

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

export const collectTextStructuredWorkspaceSpeakerRegistry = documentTree => {
  const saved = getTextStructuredSpeakerRegistry(documentTree);
  const used = collectTextStructuredConversationSpeakerIdentities(documentTree);
  const usedById = new Map(used.map(entry => [entry.id, entry]));
  const result = saved.map(entry => {
    const usage = usedById.get(entry.id) || null;
    if (usage) usedById.delete(entry.id);
    return {
      ...entry,
      key: entry.id,
      segmentIds: usage?.segmentIds || [],
      persisted: usage?.persisted || false,
      registered: true,
      used: Boolean(usage?.segmentIds?.length)
    };
  });
  usedById.forEach(entry => result.push({ ...entry, registered: false, used: Boolean(entry.segmentIds?.length) }));
  return result;
};

const normalizeChannelMap = candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)
  ? Object.fromEntries(Object.entries(candidate).map(([id, voice]) => [clean(id), clean(voice)]).filter(([id, voice]) => id && voice))
  : {};
export const getTextStructuredSpeakerVoiceProfileV2 = documentLike => {
  const source = documentLike?.metadata?.[TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY] || {};
  return { text: normalizeChannelMap(source.text), meaning: normalizeChannelMap(source.meaning) };
};
export const buildTextStructuredSpeakerVoiceProfileV2Metadata = ({ metadata, speakerId, channel = 'text', voiceName = null }) => {
  const base = normalizeMetadataObject(metadata);
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
