import { isTextStructuredAudioVariantContentCompatible } from './textStructuredAudioIdentityDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredRuntimeAudioKey } from './textStructuredAudioRuntimeDomain.js';

export const TEXT_AUDIO_COVERAGE_STATUS = Object.freeze({
  READY: 'ready',
  DOWNLOADED: 'downloaded',
  OTHER_VOICE: 'other-voice',
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

export const resolveTextStructuredAudioCoverageSlot = ({
  audioVariants,
  runtimeAudioUrls,
  segmentId,
  channel,
  content,
  requiredVoiceId,
  requiredVoiceSource = 'global-download'
}) => {
  const variants = variantsForSlot({ audioVariants, segmentId, channel });
  const exact = variants.filter(variant => same(variant?.voiceId, requiredVoiceId));
  const exactCompatible = exact.find(variant => isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
  if (exactCompatible) {
    const runtime = runtimeAudioUrls?.[exactCompatible.id];
    const deliveryStatus = exactCompatible?.metadata?.deliveryStatus || 'metadata-history';
    if ((runtime?.url && (runtime?.folderBacked || deliveryStatus === 'folder-written')) || runtime?.zipBacked) {
      return {
        status: TEXT_AUDIO_COVERAGE_STATUS.READY,
        requiredVoiceId,
        requiredVoiceSource,
        variantId: exactCompatible.id,
        filename: runtime.filename || exactCompatible.filename || null,
        verified: true,
        deliveryStatus: runtime?.zipBacked ? 'zip-indexed' : deliveryStatus,
        sourceType: runtime?.zipBacked ? 'zip' : (runtime?.folderBacked ? 'folder' : 'runtime')
      };
    }
    if (deliveryStatus === 'pending-package') {
      return { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING, requiredVoiceId, requiredVoiceSource, variantId: exactCompatible.id, filename: exactCompatible.filename || null, verified: false, deliveryStatus };
    }
    return { status: TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED, requiredVoiceId, requiredVoiceSource, variantId: exactCompatible.id, filename: runtime?.filename || exactCompatible.filename || null, verified: false, deliveryStatus };
  }

  const exactStale = exact.find(variant => !isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
  if (exactStale) return { status: TEXT_AUDIO_COVERAGE_STATUS.STALE, requiredVoiceId, requiredVoiceSource, variantId: exactStale.id, filename: exactStale.filename || null, verified: false };

  const otherCompatible = variants.find(variant => isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) || null;
  if (otherCompatible) return { status: TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE, requiredVoiceId, requiredVoiceSource, variantId: otherCompatible.id, voiceId: otherCompatible.voiceId, filename: otherCompatible.filename || null, verified: Boolean(runtimeAudioUrls?.[otherCompatible.id]?.url) };

  return { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING, requiredVoiceId, requiredVoiceSource, variantId: null, filename: null, verified: false };
};

export const buildTextStructuredAudioCoverageMap = ({
  documentTree,
  audioVariants,
  runtimeAudioUrls,
  preferences
}) => {
  const map = {};
  (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).forEach(block => {
    (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
        if (!content) return;
        const downloadVoice = resolveTextStructuredEffectiveDownloadVoice({ block, segment, channel, preferences });
        map[buildTextStructuredRuntimeAudioKey(segment.id, channel)] = resolveTextStructuredAudioCoverageSlot({
          audioVariants,
          runtimeAudioUrls,
          segmentId: segment.id,
          channel,
          content,
          requiredVoiceId: downloadVoice.voiceId,
          requiredVoiceSource: downloadVoice.source
        });
      });
    });
  });
  return map;
};

export const summarizeTextStructuredAudioCoverage = ({ documentTree, coverageMap, blockId = null, channels = null }) => {
  const requestedChannels = Array.isArray(channels) && channels.length ? new Set(channels.map(value => value === 'meaning' ? 'meaning' : 'text')) : null;
  const counts = { total: 0, ready: 0, downloaded: 0, otherVoice: 0, stale: 0, missing: 0, needDownload: 0 };
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
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED) counts.downloaded += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE) counts.otherVoice += 1;
        else if (slot.status === TEXT_AUDIO_COVERAGE_STATUS.STALE) counts.stale += 1;
        else counts.missing += 1;
      });
    });
  });
  counts.needDownload = counts.otherVoice + counts.stale + counts.missing;
  counts.covered = counts.ready + counts.downloaded;
  return counts;
};

export const shouldDownloadTextStructuredCoverageSlot = slot => !slot || ![TEXT_AUDIO_COVERAGE_STATUS.READY, TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED].includes(slot.status);
