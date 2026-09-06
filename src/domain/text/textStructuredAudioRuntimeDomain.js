import {
  isTextStructuredAudioVariantContentCompatible,
  resolveTextStructuredAudioVariant,
  resolveTextStructuredSpeakerVoice
} from './textStructuredAudioIdentityDomain.js';
import { resolveTextStructuredEffectiveVoiceProfile } from './textStructuredVoiceAssignmentDomain.js';

const clean = value => String(value ?? '').trim();

const filterContentCompatibleVariants = ({ audioVariants, channel, content }) =>
  (Array.isArray(audioVariants) ? audioVariants : []).filter(variant =>
    isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible
  );

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
  preferredGeneratedEngine = null,
  content = ''
}) => {
  const urls = runtimeAudioUrls && typeof runtimeAudioUrls === 'object' ? runtimeAudioUrls : {};
  const runtimeVariants = filterContentCompatibleVariants({
    audioVariants: (Array.isArray(audioVariants) ? audioVariants : []).filter(variant => Boolean(urls?.[variant.id]?.url)),
    channel,
    content
  });
  const requested = clean(requestedVoiceId) || null;
  let variant = resolveTextStructuredAudioVariant({
    audioVariants: runtimeVariants,
    segmentId,
    channel,
    preferredVoiceId: requested
  });

  // Generated audio keeps the provider voice in canonical identity while the
  // playback-profile binding remains metadata. Exact manual local audio keeps
  // priority. A profile mismatch or content fingerprint mismatch fails closed.
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
  if (!variant) return null;
  const runtime = urls[variant.id];
  if (!runtime?.url) return null;
  const compatibility = isTextStructuredAudioVariantContentCompatible({ variant, channel, content });
  return {
    variant,
    url: runtime.url,
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
  preferredGeneratedEngine = null
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
          defaultVoiceName: defaultVoiceId
        });
        // Compatibility bridge for A11 callers/tests that still pass an explicit
        // speakerVoiceMap outside Document metadata.
        const requestedVoiceId = effective.source === 'global'
          ? resolveTextStructuredSpeakerVoice({
              speaker: segment?.speaker,
              channel,
              speakerVoiceMap,
              defaultVoiceId: effective.voiceName || defaultVoiceId
            })
          : effective.voiceName;
        const content = channel === 'meaning' ? segment?.meaning : segment?.text;
        const metadataVariant = requestedVoiceId
          ? resolveMetadataVariantIgnoringContent({
              audioVariants,
              segmentId: segment.id,
              channel,
              requestedVoiceId,
              preferredGeneratedEngine
            })
          : null;
        const resolved = requestedVoiceId
          ? resolveTextStructuredRuntimeAudio({
              audioVariants,
              runtimeAudioUrls,
              segmentId: segment.id,
              channel,
              requestedVoiceId,
              preferredGeneratedEngine,
              content
            })
          : null;
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
                variantId: null,
                voiceId: requestedVoiceId || null,
                requestedVoiceId
              };
      });
    });
  });
  return map;
};
