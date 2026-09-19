import { isTextStructuredAudioVariantContentCompatible } from './textStructuredAudioIdentityDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredRuntimeAudioKey } from './textStructuredAudioRuntimeDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from './textStructuredAudioRenderFingerprintDomain.js';

export const TEXT_AUDIO_COVERAGE_STATUS = Object.freeze({
  READY: 'ready',
  DOWNLOADED: 'downloaded', // v1 compatibility label; history is never exact readiness
  METADATA_ONLY: 'metadata-only',
  LEGACY_UNVERIFIED: 'legacy-unverified',
  OTHER_VOICE: 'other-voice',
  OTHER_PROFILE: 'other-profile',
  STALE: 'stale',
  MISSING: 'missing'
});

const clean = value => String(value ?? '').trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

const variantsForSlot = ({ audioVariants, segmentId, channel }) => (Array.isArray(audioVariants) ? audioVariants : [])
  .filter(variant => String(variant?.segmentId || '').toUpperCase() === String(segmentId || '').toUpperCase())
  .filter(variant => String(variant?.channel || '').toLowerCase() === String(channel || '').toLowerCase())
  .filter(variant => String(variant?.source || '').toLowerCase() === 'generated')
  .filter(variant => String(variant?.engine || '').toLowerCase() === 'edge')
  .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0));

const hasRuntimeBinary = runtime => Boolean(runtime?.url || runtime?.folderBacked || runtime?.zipBacked || runtime?.stagingBacked);
const runtimeSource = runtime => runtime?.stagingBacked ? 'staging' : runtime?.zipBacked ? 'zip' : runtime?.folderBacked ? 'folder' : runtime?.url ? 'runtime' : null;

export const resolveTextStructuredAudioCoverageSlot = ({
  audioVariants,
  runtimeAudioUrls,
  segmentId,
  channel,
  content,
  requiredVoiceId,
  requiredVoiceSource = 'global-download',
  expectedRenderFingerprint = null
}) => {
  const variants = variantsForSlot({ audioVariants, segmentId, channel });
  const exactVoice = variants.filter(variant => same(variant?.voiceId, requiredVoiceId));
  const expectedRf = clean(expectedRenderFingerprint).toLowerCase();

  if (expectedRf) {
    const exactRf = exactVoice.find(variant => clean(variant?.metadata?.audioRenderFingerprintV1).toLowerCase() === expectedRf) || null;
    if (exactRf) {
      const runtime = runtimeAudioUrls?.[exactRf.id];
      if (hasRuntimeBinary(runtime)) {
        return { status: TEXT_AUDIO_COVERAGE_STATUS.READY, requiredVoiceId, requiredVoiceSource, expectedRenderFingerprint: expectedRf, variantId: exactRf.id, filename: runtime?.filename || exactRf.filename || null, verified: true, deliveryStatus: runtimeSource(runtime), sourceType: runtimeSource(runtime) };
      }
      return { status: TEXT_AUDIO_COVERAGE_STATUS.METADATA_ONLY, requiredVoiceId, requiredVoiceSource, expectedRenderFingerprint: expectedRf, variantId: exactRf.id, filename: exactRf.filename || null, verified: false };
    }

    const exactVoiceWithRf = exactVoice.find(variant => clean(variant?.metadata?.audioRenderFingerprintV1)) || null;
    if (exactVoiceWithRf) return { status: TEXT_AUDIO_COVERAGE_STATUS.STALE, requiredVoiceId, requiredVoiceSource, expectedRenderFingerprint: expectedRf, variantId: exactVoiceWithRf.id, filename: exactVoiceWithRf.filename || null, verified: false };

    const legacyExact = exactVoice.find(variant => isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
    if (legacyExact) {
      const runtime = runtimeAudioUrls?.[legacyExact.id];
      return { status: TEXT_AUDIO_COVERAGE_STATUS.LEGACY_UNVERIFIED, requiredVoiceId, requiredVoiceSource, expectedRenderFingerprint: expectedRf, variantId: legacyExact.id, filename: runtime?.filename || legacyExact.filename || null, verified: false, locallyUsable: hasRuntimeBinary(runtime) };
    }

    const otherProfile = variants.find(variant => clean(variant?.metadata?.audioRenderFingerprintV1)) || null;
    if (otherProfile) return { status: TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE, requiredVoiceId, requiredVoiceSource, expectedRenderFingerprint: expectedRf, variantId: otherProfile.id, voiceId: otherProfile.voiceId, filename: otherProfile.filename || null, verified: false };
  }

  // v1 fallback for records created before RF existed.
  const exactCompatible = exactVoice.find(variant => isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
  if (exactCompatible) {
    const runtime = runtimeAudioUrls?.[exactCompatible.id];
    if (hasRuntimeBinary(runtime)) return { status: TEXT_AUDIO_COVERAGE_STATUS.LEGACY_UNVERIFIED, requiredVoiceId, requiredVoiceSource, variantId: exactCompatible.id, filename: runtime?.filename || exactCompatible.filename || null, verified: false, locallyUsable: true };
    return { status: TEXT_AUDIO_COVERAGE_STATUS.METADATA_ONLY, requiredVoiceId, requiredVoiceSource, variantId: exactCompatible.id, filename: exactCompatible.filename || null, verified: false };
  }

  const exactStale = exactVoice.find(variant => !isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
  if (exactStale) return { status: TEXT_AUDIO_COVERAGE_STATUS.STALE, requiredVoiceId, requiredVoiceSource, variantId: exactStale.id, filename: exactStale.filename || null, verified: false };

  const otherCompatible = variants.find(variant => isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
  if (otherCompatible) return { status: TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE, requiredVoiceId, requiredVoiceSource, variantId: otherCompatible.id, voiceId: otherCompatible.voiceId, filename: otherCompatible.filename || null, verified: false };

  return { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING, requiredVoiceId, requiredVoiceSource, expectedRenderFingerprint: expectedRf || null, variantId: null, filename: null, verified: false };
};

export const buildTextStructuredAudioCoverageMap = ({ documentTree, audioVariants, runtimeAudioUrls, preferences }) => {
  const map = {};
  (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).forEach(block => {
    (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
        if (!content) return;
        const downloadVoice = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel, preferences });
        let expectedRenderFingerprint = null;
        if (downloadVoice?.voiceId) {
          expectedRenderFingerprint = buildTextStructuredAudioRenderFingerprint({
            channel,
            content,
            language: channel === 'meaning' ? (documentTree?.meaningLanguage || 'id') : (documentTree?.textLanguage || 'en'),
            engine: 'edge',
            voiceId: downloadVoice.voiceId,
            rate: preferences?.edgeRate ?? 0,
            pitch: preferences?.edgePitch ?? 0
          }).renderFingerprint;
        }
        map[buildTextStructuredRuntimeAudioKey(segment.id, channel)] = resolveTextStructuredAudioCoverageSlot({
          audioVariants,
          runtimeAudioUrls,
          segmentId: segment.id,
          channel,
          content,
          requiredVoiceId: downloadVoice.voiceId,
          requiredVoiceSource: downloadVoice.source,
          expectedRenderFingerprint
        });
      });
    });
  });
  return map;
};

export const summarizeTextStructuredAudioCoverage = ({ documentTree, coverageMap, blockId = null, channels = null }) => {
  const requestedChannels = Array.isArray(channels) && channels.length ? new Set(channels.map(value => value === 'meaning' ? 'meaning' : 'text')) : null;
  const counts = { total: 0, ready: 0, downloaded: 0, metadataOnly: 0, legacyUnverified: 0, otherVoice: 0, otherProfile: 0, stale: 0, missing: 0, needDownload: 0 };
  (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).forEach(block => {
    if (blockId && block.id !== blockId) return;
    (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        if (requestedChannels && !requestedChannels.has(channel)) return;
        const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
        if (!content) return;
        const slot = coverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, channel)] || { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING };
        counts.total += 1;
        if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.READY) counts.ready += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.METADATA_ONLY) counts.metadataOnly += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.LEGACY_UNVERIFIED) counts.legacyUnverified += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE) counts.otherVoice += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE) counts.otherProfile += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.STALE) counts.stale += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED) counts.downloaded += 1;
        else counts.missing += 1;
      });
    });
  });
  counts.needDownload = counts.metadataOnly + counts.legacyUnverified + counts.downloaded + counts.otherVoice + counts.otherProfile + counts.stale + counts.missing;
  counts.covered = counts.ready;
  return counts;
};

export const shouldDownloadTextStructuredCoverageSlot = slot => !slot || slot.status !== TEXT_AUDIO_COVERAGE_STATUS.READY;
