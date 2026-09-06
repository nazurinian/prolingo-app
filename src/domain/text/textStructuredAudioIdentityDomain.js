import { TEXT_AUDIO_CHANNELS } from '../../constants/textDatabaseConstants.js';

export const TEXT_STRUCTURED_AUDIO_IDENTITY_VERSION = 1;

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

const normalizeSegmentId = value => clean(value).toUpperCase();
const normalizeChannel = value => {
  const channel = lower(value);
  if (!TEXT_AUDIO_CHANNELS.includes(channel)) throw new Error(`Invalid structured Text audio channel: ${value}`);
  return channel;
};
const normalizeEngine = value => lower(value) || 'local';

const normalizeFingerprintContent = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();

export const buildTextStructuredAudioContentFingerprint = ({ channel = 'text', content = '' } = {}) => {
  const payload = `${normalizeChannel(channel)}\n${normalizeFingerprintContent(content)}`;
  // FNV-1a 32-bit: deterministic, tiny, and sufficient as a stale-audio guard.
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, '0')}`;
};

export const isTextStructuredAudioVariantContentCompatible = ({ variant, channel = 'text', content = '' } = {}) => {
  const stored = clean(variant?.metadata?.contentFingerprint);
  if (!stored) return { compatible: true, verified: false, currentFingerprint: buildTextStructuredAudioContentFingerprint({ channel, content }) };
  const currentFingerprint = buildTextStructuredAudioContentFingerprint({ channel, content });
  return { compatible: stored === currentFingerprint, verified: true, currentFingerprint };
};
const normalizeSource = value => lower(value) || 'file';
const normalizeVoice = value => lower(value) || 'default';

export const buildTextStructuredAudioVariantKey = ({
  segmentId,
  channel = 'text',
  engine = 'local',
  source = 'file',
  voiceId = null
}) => {
  const normalizedSegmentId = normalizeSegmentId(segmentId);
  if (!/^SEGMENT_\d+$/.test(normalizedSegmentId)) {
    throw new Error(`Invalid structured Text audio SEGMENT_ID: ${segmentId}`);
  }
  return [
    `v${TEXT_STRUCTURED_AUDIO_IDENTITY_VERSION}`,
    normalizedSegmentId,
    normalizeChannel(channel),
    normalizeSource(source),
    normalizeEngine(engine),
    normalizeVoice(voiceId)
  ].join('::');
};

export const getTextStructuredAudioVariantKey = variant => buildTextStructuredAudioVariantKey({
  segmentId: variant?.segmentId,
  channel: variant?.channel,
  engine: variant?.engine,
  source: variant?.source,
  voiceId: variant?.voiceId
});

const safeFilenameToken = (value, fallback) => {
  const token = clean(value)
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return token || fallback;
};

export const buildTextStructuredAudioFilename = ({
  audioVariantId,
  segmentId,
  channel,
  engine,
  voiceId = null,
  extension = 'mp3'
}) => {
  const variantId = safeFilenameToken(String(audioVariantId || '').toUpperCase(), 'TXTAUDIO');
  const segment = safeFilenameToken(normalizeSegmentId(segmentId), 'SEGMENT');
  const channelToken = safeFilenameToken(normalizeChannel(channel).toUpperCase(), 'TEXT');
  const engineToken = safeFilenameToken(normalizeEngine(engine).toUpperCase(), 'LOCAL');
  const voiceToken = safeFilenameToken(voiceId, 'DEFAULT');
  const ext = safeFilenameToken(String(extension || 'mp3').replace(/^\.+/, '').toLowerCase(), 'mp3');
  return `${segment}__${channelToken}__${engineToken}__${voiceToken}__${variantId}.${ext}`;
};

const compareVariantNewestFirst = (a, b) => {
  const updatedDelta = Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0);
  if (updatedDelta) return updatedDelta;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
};

export const resolveTextStructuredAudioVariant = ({
  audioVariants,
  segmentId,
  channel,
  preferredEngine = null,
  preferredSource = null,
  preferredVoiceId = null
}) => {
  const targetSegmentId = normalizeSegmentId(segmentId);
  const targetChannel = normalizeChannel(channel);
  const engine = clean(preferredEngine) ? normalizeEngine(preferredEngine) : null;
  const source = clean(preferredSource) ? normalizeSource(preferredSource) : null;
  const voice = clean(preferredVoiceId) ? normalizeVoice(preferredVoiceId) : null;

  const candidates = (Array.isArray(audioVariants) ? audioVariants : [])
    .filter(variant => normalizeSegmentId(variant?.segmentId) === targetSegmentId)
    .filter(variant => lower(variant?.channel) === targetChannel)
    .filter(variant => !engine || normalizeEngine(variant?.engine) === engine)
    .filter(variant => !source || normalizeSource(variant?.source) === source)
    // When a voice is explicitly requested we fail closed rather than silently
    // substituting another speaker/voice. The caller can then fall back to TTS.
    .filter(variant => !voice || normalizeVoice(variant?.voiceId) === voice)
    .sort(compareVariantNewestFirst);

  return candidates[0] || null;
};

export const normalizeTextStructuredSpeakerKey = speaker => lower(speaker).replace(/\s+/g, ' ');

export const resolveTextStructuredSpeakerVoice = ({
  speaker,
  channel = 'text',
  speakerVoiceMap = {},
  defaultVoiceId = null
}) => {
  const normalizedChannel = normalizeChannel(channel);
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);
  const channelMap = speakerVoiceMap && typeof speakerVoiceMap === 'object'
    ? speakerVoiceMap[normalizedChannel]
    : null;
  const mappedVoice = speakerKey && channelMap && typeof channelMap === 'object'
    ? clean(channelMap[speakerKey])
    : '';
  return mappedVoice || clean(defaultVoiceId) || null;
};
