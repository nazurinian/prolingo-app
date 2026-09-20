export const TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY = 'audioPlaybackOrderV1';
export const TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_VERSION = 1;

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const normalizeChannel = channel => lower(channel) === 'meaning' ? 'meaning' : 'text';
const normalizeOptionalNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const buildTextStructuredPlaybackProfileId = profile => {
  const normalized = normalizeTextStructuredPlaybackProfile(profile);
  if (!normalized) return null;
  return [
    normalized.engine || '*',
    normalized.voiceId.toLowerCase(),
    normalized.rate === null ? '*' : normalized.rate,
    normalized.pitch === null ? '*' : normalized.pitch,
    normalized.source || '*'
  ].join('::');
};

export const normalizeTextStructuredPlaybackProfile = candidate => {
  const source = typeof candidate === 'string' ? { voiceId: candidate } : candidate;
  if (!source || typeof source !== 'object') return null;
  const voiceId = clean(source.voiceId || source.voice || source.id);
  if (!voiceId) return null;
  const profile = {
    voiceId,
    engine: lower(source.engine) || 'edge',
    rate: normalizeOptionalNumber(source.rate),
    pitch: normalizeOptionalNumber(source.pitch),
    source: lower(source.source) || null
  };
  return {
    ...profile,
    id: clean(source.profileId) || buildProfileSignature(profile)
  };
};

const buildProfileSignature = profile => [
  lower(profile?.engine) || 'edge',
  lower(profile?.voiceId),
  profile?.rate === null || profile?.rate === undefined ? '*' : Number(profile.rate),
  profile?.pitch === null || profile?.pitch === undefined ? '*' : Number(profile.pitch),
  lower(profile?.source) || '*'
].join('::');

export const normalizeTextStructuredPlaybackProfiles = candidates => {
  const result = [];
  const seen = new Set();
  (Array.isArray(candidates) ? candidates : []).forEach(candidate => {
    const profile = normalizeTextStructuredPlaybackProfile(candidate);
    if (!profile) return;
    const signature = buildProfileSignature(profile);
    if (seen.has(signature)) return;
    seen.add(signature);
    result.push(profile);
  });
  return result;
};

const normalizeSettings = source => ({
  version: TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_VERSION,
  channels: {
    text: normalizeTextStructuredPlaybackProfiles(source?.channels?.text),
    meaning: normalizeTextStructuredPlaybackProfiles(source?.channels?.meaning)
  },
  ttsOnly: typeof source?.ttsOnly === 'boolean' ? source.ttsOnly : null
});

export const getTextStructuredAudioPlaybackOrder = record => {
  const source = record?.metadata?.[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY]
    || record?.[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY]
    || {};
  return normalizeSettings(source);
};

export const buildTextStructuredAudioPlaybackOrderMetadata = ({
  metadata,
  channel = 'text',
  profiles = undefined,
  ttsOnly = undefined
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const current = getTextStructuredAudioPlaybackOrder({ metadata });
  const next = {
    version: TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_VERSION,
    channels: {
      text: [...current.channels.text],
      meaning: [...current.channels.meaning]
    },
    ttsOnly: current.ttsOnly
  };

  if (profiles !== undefined) next.channels[normalizedChannel] = normalizeTextStructuredPlaybackProfiles(profiles);
  if (ttsOnly !== undefined) next.ttsOnly = typeof ttsOnly === 'boolean' ? ttsOnly : null;

  const hasProfiles = next.channels.text.length > 0 || next.channels.meaning.length > 0;
  const hasTtsOnly = typeof next.ttsOnly === 'boolean';
  const result = { ...(metadata || {}) };
  if (hasProfiles || hasTtsOnly) result[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY] = next;
  else delete result[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY];
  return result;
};

export const resolveTextStructuredEffectivePlaybackOrder = ({
  documentTree = null,
  block = null,
  channel = 'text',
  fallbackProfiles = []
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const cardProfiles = getTextStructuredAudioPlaybackOrder(block).channels[normalizedChannel];
  if (cardProfiles.length) {
    return { profiles: cardProfiles, source: 'card-order', explicit: true };
  }
  const documentProfiles = getTextStructuredAudioPlaybackOrder(documentTree).channels[normalizedChannel];
  if (documentProfiles.length) {
    return { profiles: documentProfiles, source: 'document-order', explicit: true };
  }
  return {
    profiles: normalizeTextStructuredPlaybackProfiles(fallbackProfiles),
    source: 'compatibility-fallback',
    explicit: false
  };
};

export const resolveTextStructuredEffectiveTtsOnly = ({
  documentTree = null,
  block = null,
  globalTtsOnly = false
} = {}) => {
  if (globalTtsOnly) return { enabled: true, source: 'global' };
  const card = getTextStructuredAudioPlaybackOrder(block);
  if (typeof card.ttsOnly === 'boolean') return { enabled: card.ttsOnly, source: 'card' };
  const document = getTextStructuredAudioPlaybackOrder(documentTree);
  if (typeof document.ttsOnly === 'boolean') return { enabled: document.ttsOnly, source: 'document' };
  return { enabled: false, source: 'default' };
};

export const doesTextStructuredVariantMatchPlaybackProfile = ({ variant, profile } = {}) => {
  const normalized = normalizeTextStructuredPlaybackProfile(profile);
  if (!variant || !normalized) return false;
  if (lower(variant.voiceId) !== lower(normalized.voiceId)) return false;
  if (normalized.engine && lower(variant.engine) !== normalized.engine) return false;
  if (normalized.source && lower(variant.source) !== normalized.source) return false;

  const descriptor = variant?.metadata?.audioRenderDescriptorV1 || null;
  if (normalized.rate !== null) {
    if (!descriptor || Number(descriptor.rate) !== normalized.rate) return false;
  }
  if (normalized.pitch !== null) {
    if (!descriptor || Number(descriptor.pitch) !== normalized.pitch) return false;
  }
  return true;
};

export const describeTextStructuredPlaybackOrder = order => ({
  source: order?.source || 'compatibility-fallback',
  explicit: Boolean(order?.explicit),
  voices: normalizeTextStructuredPlaybackProfiles(order?.profiles).map(profile => profile.voiceId)
});
