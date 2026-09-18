import {
  isTextStructuredAudioVariantContentCompatible,
  resolveTextStructuredAudioVariant,
  resolveTextStructuredSpeakerVoice
} from './textStructuredAudioIdentityDomain.js';
import { resolveTextStructuredEffectiveVoiceProfile } from './textStructuredVoiceAssignmentDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';

const clean = value => String(value ?? '').trim();

const filterContentCompatibleVariants = ({ audioVariants, channel, content }) =>
  (Array.isArray(audioVariants) ? audioVariants : []).filter(variant =>
    isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible
  );


const resolveGeneratedVariantByVoice = ({
  audioVariants,
  segmentId,
  channel,
  voiceId,
  preferredGeneratedEngine = null,
  content = ''
}) => {
  const requested = clean(voiceId);
  if (!requested) return null;
  const engine = clean(preferredGeneratedEngine).toLowerCase();
  return filterContentCompatibleVariants({ audioVariants, channel, content })
    .filter(item => String(item?.segmentId || '').toUpperCase() === String(segmentId || '').toUpperCase())
    .filter(item => String(item?.channel || '').toLowerCase() === String(channel || '').toLowerCase())
    .filter(item => String(item?.source || '').toLowerCase() === 'generated')
    .filter(item => !engine || String(item?.engine || '').toLowerCase() === engine)
    .filter(item => clean(item?.voiceId).toLowerCase() === requested.toLowerCase())
    .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))[0] || null;
};

const resolveGeneratedMetadataByVoice = ({ audioVariants, segmentId, channel, voiceId, preferredGeneratedEngine = 'edge' }) => {
  const requested = clean(voiceId);
  if (!requested) return null;
  const engine = clean(preferredGeneratedEngine).toLowerCase();
  return (Array.isArray(audioVariants) ? audioVariants : [])
    .filter(item => String(item?.segmentId || '').toUpperCase() === String(segmentId || '').toUpperCase())
    .filter(item => String(item?.channel || '').toLowerCase() === String(channel || '').toLowerCase())
    .filter(item => String(item?.source || '').toLowerCase() === 'generated')
    .filter(item => !engine || String(item?.engine || '').toLowerCase() === engine)
    .filter(item => clean(item?.voiceId).toLowerCase() === requested.toLowerCase())
    .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))[0] || null;
};
const resolveProfileBoundGeneratedVariant = ({
  audioVariants,
  segmentId,
  channel,
  requestedVoiceId,
  preferredGeneratedEngine = null,
  content = ''
}) => {
  const requested = clean(requestedVoiceId);
  if (!requested) return null;
  const wantedEngine = clean(preferredGeneratedEngine).toLowerCase();
  return filterContentCompatibleVariants({ audioVariants, channel, content })
    .filter(item => String(item?.segmentId || '').toUpperCase() === String(segmentId || '').toUpperCase())
    .filter(item => String(item?.channel || '').toLowerCase() === String(channel || '').toLowerCase())
    .filter(item => String(item?.source || '').toLowerCase() === 'generated')
    .filter(item => clean(item?.metadata?.playbackProfileVoiceId).toLowerCase() === requested.toLowerCase())
    .filter(item => !wantedEngine || String(item?.engine || '').toLowerCase() === wantedEngine)
    .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))[0] || null;
};

const resolveMetadataVariantIgnoringContent = ({
  audioVariants,
  segmentId,
  channel,
  requestedVoiceId,
  preferredGeneratedEngine = null
}) => {
  const requested = clean(requestedVoiceId) || null;
  const exact = requested
    ? resolveTextStructuredAudioVariant({ audioVariants, segmentId, channel, preferredVoiceId: requested })
    : null;
  if (exact) return exact;
  if (!requested) return null;
  const wantedEngine = clean(preferredGeneratedEngine).toLowerCase();
  return (Array.isArray(audioVariants) ? audioVariants : [])
    .filter(item => String(item?.segmentId || '').toUpperCase() === String(segmentId || '').toUpperCase())
    .filter(item => String(item?.channel || '').toLowerCase() === String(channel || '').toLowerCase())
    .filter(item => String(item?.source || '').toLowerCase() === 'generated')
    .filter(item => clean(item?.metadata?.playbackProfileVoiceId).toLowerCase() === requested.toLowerCase())
    .filter(item => !wantedEngine || String(item?.engine || '').toLowerCase() === wantedEngine)
    .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))[0] || null;
};

export const buildTextStructuredRuntimeAudioKey = (segmentId, channel) => `${String(segmentId || '').toUpperCase()}::${String(channel || '').toLowerCase()}`;

export const resolveTextStructuredRuntimeAudio = ({
  audioVariants,
  runtimeAudioUrls,
  segmentId,
  channel,
  requestedVoiceId,
  preferredGeneratedVoiceId = null,
  preferredGeneratedEngine = null,
  allowAnyGenerated = false,
  content = ''
}) => {
  const urls = runtimeAudioUrls && typeof runtimeAudioUrls === 'object' ? runtimeAudioUrls : {};
  const runtimeVariants = filterContentCompatibleVariants({
    audioVariants: (Array.isArray(audioVariants) ? audioVariants : []).filter(variant => Boolean(urls?.[variant.id]?.url || urls?.[variant.id]?.stagingBacked || urls?.[variant.id]?.folderBacked || urls?.[variant.id]?.zipBacked)),
    channel,
    content
  });
  const requested = clean(requestedVoiceId) || null;
  // C3.4: Browser TTS voice and generated Edge Download voice are independent.
  // Manual local files may still bind to the playback voice, while generated
  // files are resolved by their canonical provider/download voice identity.
  let variant = requested ? resolveTextStructuredAudioVariant({
    audioVariants: runtimeVariants,
    segmentId,
    channel,
    preferredSource: 'file',
    preferredVoiceId: requested
  }) : null;

  if (!variant && clean(preferredGeneratedVoiceId)) {
    variant = resolveGeneratedVariantByVoice({
      audioVariants: runtimeVariants,
      segmentId,
      channel,
      voiceId: preferredGeneratedVoiceId,
      preferredGeneratedEngine,
      content
    });
  }

  // Historical A12 generated metadata remains playable as a compatibility
  // fallback until it is regenerated under the C3.4 Download Profile model.
  if (!variant && requested) {
    variant = resolveProfileBoundGeneratedVariant({
      audioVariants: runtimeVariants,
      segmentId,
      channel,
      requestedVoiceId: requested,
      preferredGeneratedEngine,
      content
    });
  }
  if (!variant && allowAnyGenerated) {
    const wantedEngine = clean(preferredGeneratedEngine).toLowerCase();
    variant = runtimeVariants
      .filter(item => String(item?.segmentId || '').toUpperCase() === String(segmentId || '').toUpperCase())
      .filter(item => String(item?.channel || '').toLowerCase() === String(channel || '').toLowerCase())
      .filter(item => String(item?.source || '').toLowerCase() === 'generated' || String(item?.source || '').toLowerCase() === 'file')
      .filter(item => !wantedEngine || String(item?.source || '').toLowerCase() === 'file' || String(item?.engine || '').toLowerCase() === wantedEngine)
      .sort((a, b) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))[0] || null;
  }
  if (!variant) return null;
  const runtime = urls[variant.id];
  if (!runtime?.url && !runtime?.stagingBacked && !runtime?.folderBacked && !runtime?.zipBacked) return null;
  const compatibility = isTextStructuredAudioVariantContentCompatible({ variant, channel, content });
  return {
    variant,
    url: runtime.url || null,
    runtime,
    filename: runtime.filename || variant.filename || null,
    mimeType: runtime.mimeType || variant.mimeType || null,
    contentVerified: compatibility.verified
  };
};

export const buildTextStructuredRuntimeAudioStatusMap = ({
  documentTree,
  audioVariants,
  runtimeAudioUrls,
  textVoiceId,
  meaningVoiceId,
  speakerVoiceMap = {},
  includeDocumentSpeakerProfile = true,
  simpleCardSpeakerMode = false,
  preferredGeneratedEngine = 'edge',
  downloadPreferences = null
}) => {
  const map = {};
  const blocks = Array.isArray(documentTree?.blocks) ? documentTree.blocks : [];
  blocks.forEach(block => {
    (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        const defaultVoiceId = channel === 'meaning' ? meaningVoiceId : textVoiceId;
        const effective = resolveTextStructuredEffectiveVoiceProfile({
          documentTree,
          block,
          segment,
          channel,
          defaultVoiceName: defaultVoiceId,
          includeDocumentSpeakerProfile,
          simpleCardSpeakerMode
        });
        // Compatibility bridge for A11 callers/tests that still pass an explicit
        // speakerVoiceMap outside Document metadata.
        const requestedVoiceId = effective.source === 'global' && includeDocumentSpeakerProfile && !simpleCardSpeakerMode
          ? resolveTextStructuredSpeakerVoice({
              speaker: segment?.speaker,
              channel,
              speakerVoiceMap,
              defaultVoiceId: effective.voiceName || defaultVoiceId
            })
          : effective.voiceName;
        const content = channel === 'meaning' ? segment?.meaning : segment?.text;
        const downloadVoice = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel, preferences: downloadPreferences });
        const metadataVariant = resolveGeneratedMetadataByVoice({
          audioVariants,
          segmentId: segment.id,
          channel,
          voiceId: downloadVoice.voiceId,
          preferredGeneratedEngine
        }) || (requestedVoiceId ? resolveMetadataVariantIgnoringContent({
          audioVariants,
          segmentId: segment.id,
          channel,
          requestedVoiceId,
          preferredGeneratedEngine
        }) : null);
        const resolved = resolveTextStructuredRuntimeAudio({
          audioVariants,
          runtimeAudioUrls,
          segmentId: segment.id,
          channel,
          requestedVoiceId,
          preferredGeneratedVoiceId: downloadVoice.voiceId,
          preferredGeneratedEngine,
          content
        });
        const compatibility = metadataVariant
          ? isTextStructuredAudioVariantContentCompatible({ variant: metadataVariant, channel, content })
          : null;
        map[buildTextStructuredRuntimeAudioKey(segment.id, channel)] = resolved
          ? {
              available: true,
              metadataExists: true,
              stale: false,
              contentVerified: resolved.contentVerified,
              assignmentSource: effective.source,
              requestedVoiceId,
              downloadVoiceId: downloadVoice.voiceId,
              downloadVoiceSource: downloadVoice.source,
              variantId: resolved.variant.id,
              voiceId: resolved.variant.voiceId,
              engine: resolved.variant.engine,
              source: resolved.variant.source,
              filename: resolved.filename
            }
          : metadataVariant
            ? {
                available: false,
                metadataExists: true,
                stale: Boolean(compatibility && !compatibility.compatible),
                contentVerified: Boolean(compatibility?.verified),
                assignmentSource: effective.source,
                requestedVoiceId,
                downloadVoiceId: downloadVoice.voiceId,
                downloadVoiceSource: downloadVoice.source,
                variantId: metadataVariant.id,
                voiceId: metadataVariant.voiceId,
                engine: metadataVariant.engine,
                source: metadataVariant.source,
                filename: metadataVariant.filename || null
              }
            : {
                available: false,
                metadataExists: false,
                stale: false,
                contentVerified: false,
                assignmentSource: effective.source,
                downloadVoiceId: downloadVoice.voiceId,
                downloadVoiceSource: downloadVoice.source,
                variantId: null,
                voiceId: requestedVoiceId || null,
                requestedVoiceId
              };
      });
    });
  });
  return map;
};
