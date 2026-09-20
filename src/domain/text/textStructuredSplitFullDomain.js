import { buildCanonicalSha256Fingerprint } from './textCanonicalFingerprintDomain.js';
import {
  TEXT_AUDIO_CODEC_PROFILE,
  TEXT_AUDIO_RENDERER_PROFILE_VERSION,
  buildTextStructuredAudioContentFingerprintV2
} from './textStructuredAudioRenderFingerprintDomain.js';
import { isTextStructuredAudioVariantContentCompatible } from './textStructuredAudioIdentityDomain.js';
import {
  doesTextStructuredVariantMatchPlaybackProfile,
  normalizeTextStructuredPlaybackProfile
} from './textStructuredAudioPlaybackOrderDomain.js';

export const TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY = 'fullAudioArtifactsV1';
export const TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_VERSION = 1;
export const TEXT_STRUCTURED_FULL_ARTIFACT_SCHEMA_VERSION = 1;
export const TEXT_STRUCTURED_FULL_ARTIFACT_DERIVATION_VERSION = 'prolingo-full-v1';

export const TEXT_STRUCTURED_REPRESENTATIONS = Object.freeze({
  SPLIT: 'split',
  FULL: 'full'
});

export const TEXT_STRUCTURED_ARTIFACT_READINESS = Object.freeze({
  READY: 'ready',
  METADATA_ONLY: 'metadata-only',
  STALE: 'stale',
  OTHER_PROFILE: 'other-profile',
  MISSING: 'missing'
});

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const normalizeChannel = value => lower(value) === 'meaning' ? 'meaning' : 'text';
const normalizeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalizeMetadata = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const sortByOrderThenId = values => [...(Array.isArray(values) ? values : [])].sort((a, b) => {
  const orderDelta = Number(a?.order || 0) - Number(b?.order || 0);
  return orderDelta || String(a?.id || '').localeCompare(String(b?.id || ''));
});
const separatorFor = joinAfter => joinAfter === 'none' ? '' : (joinAfter === 'line' ? '\n' : ' ');
const channelContent = (segment, channel) => normalizeChannel(channel) === 'meaning' ? clean(segment?.meaning) : clean(segment?.text);
const runtimeBacked = runtime => Boolean(runtime?.url || runtime?.stagingBacked || runtime?.zipBacked || runtime?.blob || runtime?.binaryReady);

export const resolveTextStructuredOrderedSegments = block => sortByOrderThenId(block?.segments || []);

const joinOrderedSegments = (segments, channel) => {
  const ordered = sortByOrderThenId(segments);
  let output = '';
  let included = 0;
  const segmentIds = [];
  for (const segment of ordered) {
    const content = channelContent(segment, channel);
    if (!content) continue;
    if (included > 0) {
      const previous = ordered.slice(0, ordered.indexOf(segment)).reverse().find(item => channelContent(item, channel));
      output += separatorFor(previous?.joinAfter);
    }
    output += content;
    included += 1;
    segmentIds.push(String(segment?.id || '').toUpperCase());
  }
  return { content: output.trim(), segmentIds, segmentCount: included };
};

export const buildTextStructuredFullRepresentation = ({ block, channel = 'text' } = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const joined = joinOrderedSegments(resolveTextStructuredOrderedSegments(block), normalizedChannel);
  const contentFingerprint = buildTextStructuredAudioContentFingerprintV2({
    channel: normalizedChannel,
    content: joined.content
  });
  return {
    representation: TEXT_STRUCTURED_REPRESENTATIONS.FULL,
    blockId: clean(block?.id).toUpperCase() || null,
    channel: normalizedChannel,
    content: joined.content,
    contentFingerprint,
    segmentIds: joined.segmentIds,
    segmentCount: joined.segmentCount,
    empty: !joined.content
  };
};

export const buildTextStructuredFullTextPair = ({ block } = {}) => ({
  text: buildTextStructuredFullRepresentation({ block, channel: 'text' }),
  meaning: buildTextStructuredFullRepresentation({ block, channel: 'meaning' })
});

export const buildTextStructuredFullArtifactDescriptor = ({
  block,
  channel = 'text',
  language = null,
  engine = 'edge',
  voiceId,
  rate = 0,
  pitch = 0,
  rendererVersion = TEXT_AUDIO_RENDERER_PROFILE_VERSION,
  codecProfile = TEXT_AUDIO_CODEC_PROFILE,
  derivationVersion = TEXT_STRUCTURED_FULL_ARTIFACT_DERIVATION_VERSION
} = {}) => {
  const representation = buildTextStructuredFullRepresentation({ block, channel });
  if (!representation.content) throw new Error('Full Audio Artifact requires non-empty derived Full Text.');
  const resolvedVoiceId = clean(voiceId);
  if (!resolvedVoiceId) throw new Error('Full Audio Artifact requires a resolved voiceId.');
  return {
    schemaVersion: TEXT_STRUCTURED_FULL_ARTIFACT_SCHEMA_VERSION,
    representation: TEXT_STRUCTURED_REPRESENTATIONS.FULL,
    contentFingerprint: representation.contentFingerprint,
    channel: representation.channel,
    language: clean(language) || (representation.channel === 'meaning' ? 'id' : 'en'),
    engine: lower(engine) || 'edge',
    voiceId: resolvedVoiceId,
    rate: normalizeNumber(rate, 0),
    pitch: normalizeNumber(pitch, 0),
    rendererVersion: clean(rendererVersion) || TEXT_AUDIO_RENDERER_PROFILE_VERSION,
    codecProfile: clean(codecProfile) || TEXT_AUDIO_CODEC_PROFILE,
    derivationVersion: clean(derivationVersion) || TEXT_STRUCTURED_FULL_ARTIFACT_DERIVATION_VERSION
  };
};

export const buildTextStructuredFullArtifactIdentity = request => {
  const descriptor = buildTextStructuredFullArtifactDescriptor(request);
  return {
    fullArtifactFingerprint: buildCanonicalSha256Fingerprint(descriptor, 'full-sha256'),
    descriptor,
    fullRepresentation: buildTextStructuredFullRepresentation({ block: request?.block, channel: descriptor.channel })
  };
};

export const buildTextStructuredFullArtifactRecord = ({
  block,
  channel = 'text',
  language = null,
  engine = 'edge',
  voiceId,
  rate = 0,
  pitch = 0,
  rendererVersion,
  codecProfile,
  derivationVersion,
  filename = null,
  mimeType = null,
  source = 'generated',
  createdAt = Date.now(),
  updatedAt = createdAt,
  metadata = {}
} = {}) => {
  const identity = buildTextStructuredFullArtifactIdentity({
    block, channel, language, engine, voiceId, rate, pitch, rendererVersion, codecProfile, derivationVersion
  });
  return {
    id: identity.fullArtifactFingerprint,
    fullArtifactFingerprint: identity.fullArtifactFingerprint,
    descriptor: identity.descriptor,
    segmentCount: identity.fullRepresentation.segmentCount,
    filename: clean(filename) || null,
    mimeType: clean(mimeType) || null,
    source: lower(source) || 'generated',
    createdAt: Number(createdAt) || Date.now(),
    updatedAt: Number(updatedAt) || Number(createdAt) || Date.now(),
    metadata: normalizeMetadata(metadata)
  };
};

export const normalizeTextStructuredFullArtifactRecord = candidate => {
  if (!candidate || typeof candidate !== 'object') return null;
  const fingerprint = clean(candidate.fullArtifactFingerprint || candidate.id);
  const descriptor = candidate.descriptor && typeof candidate.descriptor === 'object' ? candidate.descriptor : null;
  if (!fingerprint.startsWith('full-sha256-') || !descriptor) return null;
  if (descriptor.representation !== TEXT_STRUCTURED_REPRESENTATIONS.FULL) return null;
  if (!clean(descriptor.contentFingerprint) || !clean(descriptor.voiceId)) return null;
  const normalizedDescriptor = {
    schemaVersion: Number(descriptor.schemaVersion) || TEXT_STRUCTURED_FULL_ARTIFACT_SCHEMA_VERSION,
    representation: TEXT_STRUCTURED_REPRESENTATIONS.FULL,
    contentFingerprint: clean(descriptor.contentFingerprint),
    channel: normalizeChannel(descriptor.channel),
    language: clean(descriptor.language) || (normalizeChannel(descriptor.channel) === 'meaning' ? 'id' : 'en'),
    engine: lower(descriptor.engine) || 'edge',
    voiceId: clean(descriptor.voiceId),
    rate: normalizeNumber(descriptor.rate, 0),
    pitch: normalizeNumber(descriptor.pitch, 0),
    rendererVersion: clean(descriptor.rendererVersion) || TEXT_AUDIO_RENDERER_PROFILE_VERSION,
    codecProfile: clean(descriptor.codecProfile) || TEXT_AUDIO_CODEC_PROFILE,
    derivationVersion: clean(descriptor.derivationVersion) || TEXT_STRUCTURED_FULL_ARTIFACT_DERIVATION_VERSION
  };
  if (buildCanonicalSha256Fingerprint(normalizedDescriptor, 'full-sha256') !== fingerprint) return null;
  return {
    id: fingerprint,
    fullArtifactFingerprint: fingerprint,
    descriptor: normalizedDescriptor,
    segmentCount: Math.max(0, Number(candidate.segmentCount) || 0),
    filename: clean(candidate.filename) || null,
    mimeType: clean(candidate.mimeType) || null,
    source: lower(candidate.source) || 'generated',
    createdAt: Number(candidate.createdAt) || 0,
    updatedAt: Number(candidate.updatedAt) || Number(candidate.createdAt) || 0,
    metadata: normalizeMetadata(candidate.metadata)
  };
};

export const getTextStructuredFullAudioArtifacts = block => {
  const source = block?.metadata?.[TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY];
  return (Array.isArray(source?.artifacts) ? source.artifacts : [])
    .map(normalizeTextStructuredFullArtifactRecord)
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
};

export const buildTextStructuredFullAudioArtifactsMetadata = ({ metadata, artifact = null, removeFingerprint = null } = {}) => {
  const result = { ...normalizeMetadata(metadata) };
  const current = getTextStructuredFullAudioArtifacts({ metadata: result });
  let artifacts = [...current];
  const remove = clean(removeFingerprint);
  if (remove) artifacts = artifacts.filter(item => item.fullArtifactFingerprint !== remove);
  if (artifact) {
    const normalized = normalizeTextStructuredFullArtifactRecord(artifact);
    if (!normalized) throw new Error('Invalid Full Audio Artifact metadata record.');
    artifacts = artifacts.filter(item => item.fullArtifactFingerprint !== normalized.fullArtifactFingerprint);
    artifacts.push(normalized);
  }
  artifacts.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  if (artifacts.length) {
    result[TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY] = {
      version: TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_VERSION,
      artifacts
    };
  } else {
    delete result[TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY];
  }
  return result;
};

const artifactMatchesProfile = (artifact, profile) => {
  const normalized = normalizeTextStructuredPlaybackProfile(profile);
  if (!artifact || !normalized) return false;
  const descriptor = artifact.descriptor || {};
  if (lower(descriptor.voiceId) !== lower(normalized.voiceId)) return false;
  if (normalized.engine && lower(descriptor.engine) !== normalized.engine) return false;
  if (normalized.rate !== null && Number(descriptor.rate) !== normalized.rate) return false;
  if (normalized.pitch !== null && Number(descriptor.pitch) !== normalized.pitch) return false;
  return true;
};

export const resolveTextStructuredFullArtifactReadiness = ({
  block,
  channel = 'text',
  profile,
  language = null,
  runtimeFullAudio = {}
} = {}) => {
  const representation = buildTextStructuredFullRepresentation({ block, channel });
  if (!representation.content) {
    return { status: TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING, ready: false, representation, artifact: null, expected: null };
  }
  const normalizedProfile = normalizeTextStructuredPlaybackProfile(profile);
  if (!normalizedProfile) {
    return { status: TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING, ready: false, representation, artifact: null, expected: null };
  }
  const expected = buildTextStructuredFullArtifactIdentity({
    block,
    channel: representation.channel,
    language,
    engine: normalizedProfile.engine,
    voiceId: normalizedProfile.voiceId,
    rate: normalizedProfile.rate ?? 0,
    pitch: normalizedProfile.pitch ?? 0
  });
  const artifacts = getTextStructuredFullAudioArtifacts(block);
  const exact = artifacts.find(item => item.fullArtifactFingerprint === expected.fullArtifactFingerprint) || null;
  if (exact) {
    const runtime = runtimeFullAudio?.[exact.fullArtifactFingerprint] || runtimeFullAudio?.[exact.id] || null;
    return {
      status: runtimeBacked(runtime) ? TEXT_STRUCTURED_ARTIFACT_READINESS.READY : TEXT_STRUCTURED_ARTIFACT_READINESS.METADATA_ONLY,
      ready: runtimeBacked(runtime),
      representation,
      artifact: exact,
      runtime,
      expected
    };
  }
  const sameProfile = artifacts.find(item => item.descriptor?.channel === representation.channel && artifactMatchesProfile(item, normalizedProfile)) || null;
  if (sameProfile) {
    return {
      status: TEXT_STRUCTURED_ARTIFACT_READINESS.STALE,
      ready: false,
      representation,
      artifact: sameProfile,
      expected
    };
  }
  const currentContentOtherProfile = artifacts.find(item =>
    item.descriptor?.channel === representation.channel
    && item.descriptor?.contentFingerprint === representation.contentFingerprint
  ) || null;
  return {
    status: currentContentOtherProfile ? TEXT_STRUCTURED_ARTIFACT_READINESS.OTHER_PROFILE : TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING,
    ready: false,
    representation,
    artifact: currentContentOtherProfile,
    expected
  };
};

export const summarizeTextStructuredSplitProfileReadiness = ({
  block,
  channel = 'text',
  profile,
  runtimeAudioUrls = {}
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const normalizedProfile = normalizeTextStructuredPlaybackProfile(profile);
  const items = [];
  const counts = { total: 0, ready: 0, metadataOnly: 0, stale: 0, missing: 0 };
  for (const segment of resolveTextStructuredOrderedSegments(block)) {
    const content = channelContent(segment, normalizedChannel);
    if (!content) continue;
    counts.total += 1;
    const candidates = (Array.isArray(segment?.audioVariants) ? segment.audioVariants : [])
      .filter(variant => lower(variant?.channel) === normalizedChannel)
      .filter(variant => !normalizedProfile || doesTextStructuredVariantMatchPlaybackProfile({ variant, profile: normalizedProfile }));
    const compatible = candidates.filter(variant => isTextStructuredAudioVariantContentCompatible({ variant, channel: normalizedChannel, content }).compatible);
    const readyVariant = compatible.find(variant => runtimeBacked(runtimeAudioUrls?.[variant.id])) || null;
    let status = TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING;
    let variant = null;
    if (readyVariant) {
      status = TEXT_STRUCTURED_ARTIFACT_READINESS.READY;
      variant = readyVariant;
      counts.ready += 1;
    } else if (compatible.length) {
      status = TEXT_STRUCTURED_ARTIFACT_READINESS.METADATA_ONLY;
      variant = compatible[0];
      counts.metadataOnly += 1;
    } else if (candidates.length) {
      status = TEXT_STRUCTURED_ARTIFACT_READINESS.STALE;
      variant = candidates[0];
      counts.stale += 1;
    } else {
      counts.missing += 1;
    }
    items.push({
      segmentId: segment.id,
      channel: normalizedChannel,
      status,
      ready: status === TEXT_STRUCTURED_ARTIFACT_READINESS.READY,
      variant
    });
  }
  return {
    representation: TEXT_STRUCTURED_REPRESENTATIONS.SPLIT,
    channel: normalizedChannel,
    profile: normalizedProfile,
    ...counts,
    complete: counts.total > 0 && counts.ready === counts.total,
    partial: counts.ready > 0 && counts.ready < counts.total,
    needAudio: counts.metadataOnly + counts.stale + counts.missing,
    items
  };
};

export const resolveTextStructuredSplitFullReadiness = ({
  block,
  channel = 'text',
  profile,
  language = null,
  runtimeAudioUrls = {},
  runtimeFullAudio = {}
} = {}) => ({
  split: summarizeTextStructuredSplitProfileReadiness({ block, channel, profile, runtimeAudioUrls }),
  full: resolveTextStructuredFullArtifactReadiness({ block, channel, profile, language, runtimeFullAudio })
});
