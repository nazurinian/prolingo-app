import { buildCanonicalSha256Fingerprint } from './textCanonicalFingerprintDomain.js';

export const TEXT_AUDIO_RENDER_FINGERPRINT_VERSION = 1;
export const TEXT_AUDIO_RENDERER_PROFILE_VERSION = 'prolingo-edge-v1';
export const TEXT_AUDIO_CODEC_PROFILE = 'mp3-default-v1';

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const normalizedContent = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
const normalizeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const buildTextStructuredAudioContentFingerprintV2 = ({ channel = 'text', content = '' } = {}) =>
  buildCanonicalSha256Fingerprint({
    version: 2,
    channel: lower(channel) === 'meaning' ? 'meaning' : 'text',
    content: normalizedContent(content)
  }, 'sha256');

export const buildTextStructuredAudioRenderDescriptor = ({
  channel = 'text',
  content = '',
  language = null,
  engine = 'edge',
  voiceId,
  rate = 0,
  pitch = 0,
  rendererVersion = TEXT_AUDIO_RENDERER_PROFILE_VERSION,
  codecProfile = TEXT_AUDIO_CODEC_PROFILE
} = {}) => {
  const normalizedChannel = lower(channel) === 'meaning' ? 'meaning' : 'text';
  const contentFingerprint = buildTextStructuredAudioContentFingerprintV2({ channel: normalizedChannel, content });
  return {
    schemaVersion: TEXT_AUDIO_RENDER_FINGERPRINT_VERSION,
    contentFingerprint,
    channel: normalizedChannel,
    language: clean(language) || (normalizedChannel === 'meaning' ? 'id' : 'en'),
    engine: lower(engine) || 'edge',
    voiceId: clean(voiceId),
    rate: normalizeNumber(rate, 0),
    pitch: normalizeNumber(pitch, 0),
    rendererVersion: clean(rendererVersion) || TEXT_AUDIO_RENDERER_PROFILE_VERSION,
    codecProfile: clean(codecProfile) || TEXT_AUDIO_CODEC_PROFILE
  };
};

export const buildTextStructuredAudioRenderFingerprint = request => {
  const descriptor = buildTextStructuredAudioRenderDescriptor(request);
  if (!descriptor.voiceId) throw new Error('Render Fingerprint requires a resolved voiceId');
  return {
    renderFingerprint: buildCanonicalSha256Fingerprint(descriptor, 'rf-sha256'),
    contentFingerprintV2: descriptor.contentFingerprint,
    descriptor
  };
};

export const getTextStructuredAudioVariantRenderFingerprint = variant => clean(variant?.metadata?.audioRenderFingerprintV1) || null;
export const getTextStructuredAudioVariantRenderDescriptor = variant => variant?.metadata?.audioRenderDescriptorV1 || null;

export const isTextStructuredAudioVariantRenderCompatible = ({ variant, expectedRenderFingerprint } = {}) => {
  const expected = clean(expectedRenderFingerprint);
  const stored = getTextStructuredAudioVariantRenderFingerprint(variant);
  if (!expected) return { compatible: false, verified: false, reason: 'missing-expected-rf' };
  if (!stored) return { compatible: false, verified: false, reason: 'legacy-unverified-rf' };
  return { compatible: stored === expected, verified: true, reason: stored === expected ? 'rf-match' : 'rf-mismatch' };
};

export const TEXT_AUDIO_READINESS = Object.freeze({
  READY: 'ready',
  MISSING: 'missing',
  STALE: 'stale',
  OTHER_PROFILE: 'other-profile',
  METADATA_ONLY: 'metadata-only',
  LEGACY_UNVERIFIED: 'legacy-unverified',
  EXTERNAL_ORPHAN: 'external-orphan'
});
