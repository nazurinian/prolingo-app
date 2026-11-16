import {
  buildTextStructuredFullArtifactRecord,
  TEXT_STRUCTURED_ARTIFACT_READINESS
} from '../../../domain/text/textStructuredSplitFullDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import {
  buildDerivedTextConversationFullAudioWav,
  buildDerivedTextFullAudioFilename
} from '../../../services/audio/textStructuredFullAudioExportService.js';
import { TEXT_STRUCTURED_AUDIO_SOURCE_MODES } from '../../../domain/text/textStructuredPlaybackPreferenceDomain.js';

const clean = value => String(value ?? '').trim();

export const CONVERSATION_ENTRY_STATUS_META = Object.freeze({
  ready: Object.freeze({
    status: 'ready',
    label: 'READY',
    detail: 'Verified local audio matches exact RF and profile.',
    tone: 'emerald'
  }),
  'metadata-only': Object.freeze({
    status: 'metadata-only',
    label: 'META-ONLY',
    detail: 'Exact RF metadata exists, but verified local binary is unavailable.',
    tone: 'amber'
  }),
  stale: Object.freeze({
    status: 'stale',
    label: 'STALE',
    detail: 'Stored audio metadata does not match current content or render config.',
    tone: 'rose'
  }),
  'other-profile': Object.freeze({
    status: 'other-profile',
    label: 'OTHER VOICE',
    detail: 'Audio exists for a different voice/profile than configured.',
    tone: 'violet'
  }),
  'legacy-unverified': Object.freeze({
    status: 'legacy-unverified',
    label: 'UNVERIFIED',
    detail: 'Legacy audio record lacks exact render fingerprint.',
    tone: 'amber'
  }),
  missing: Object.freeze({
    status: 'missing',
    label: 'MISSING',
    detail: 'No stored audio variant for this Sentence channel.',
    tone: 'slate'
  }),
  'unavailable-binary': Object.freeze({
    status: 'unavailable-binary',
    label: 'UNAVAILABLE BINARY',
    detail: 'Runtime binary failed to load or decode; fell back cleanly.',
    tone: 'rose'
  })
});

export const CONVERSATION_COMPOSITION_BLOCK_REASONS = Object.freeze({
  'inputs-not-ready': 'Full WAV assembly requires all primary configured Sentence binaries to be verified Ready.',
  'partial-scope': 'Partial Sentence scope cannot assemble a whole-Scene Full WAV artifact.',
  'rate-aware-assembly-required': 'Per-Sentence playback remains active at non-unit speed, but combined Full WAV file export is unavailable (unit 1.0x rate required).'
});

export const compactConversationVoiceName = value => {
  const name = clean(value);
  if (!name) return 'System Default';
  const microsoft = name.match(/^Microsoft\s+(.+?)\s+Online/i);
  if (microsoft?.[1]) return microsoft[1];
  const neural = name.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  if (neural?.[1]) return neural[1];
  return name.length > 26 ? `${name.slice(0, 25)}...` : name;
};

/**
 * Formats a Sentence entry status combining plan readiness and runtime load/decode failure telemetry.
 */
export const getConversationEntryUiStatus = (entry, failedVariantIds = null) => {
  if (!entry) return CONVERSATION_ENTRY_STATUS_META.missing;
  const runtimeVariantId = entry.runtimeAudio?.variant?.id;
  if (runtimeVariantId && failedVariantIds && failedVariantIds[runtimeVariantId]) {
    return CONVERSATION_ENTRY_STATUS_META['unavailable-binary'];
  }
  return CONVERSATION_ENTRY_STATUS_META[entry.status] || CONVERSATION_ENTRY_STATUS_META.missing;
};

/**
 * Computes human-readable Full WAV assembly availability and block guidance.
 */
export const getConversationFullCompositionStatus = (plan, { channel = 'text', playbackRate = 1 } = {}) => {
  if (!plan || !plan.entries?.length) {
    return {
      readyToCompose: false,
      route: plan?.route || 'empty',
      fullStatus: plan?.fullReadiness?.status || TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING,
      reason: 'empty',
      reasonMessage: 'No audible Sentences in this channel.'
    };
  }
  if (plan.readyToCompose === true) {
    return {
      readyToCompose: true,
      route: plan.route,
      fullStatus: plan.fullReadiness?.status || TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING,
      reason: null,
      reasonMessage: `All ${plan.entries.length} ${channel === 'meaning' ? 'Meaning' : 'Text'} input(s) verified Ready at 1.0x for 48 kHz Full WAV assembly.`
    };
  }
  const reason = plan.compositionBlockReason || 'inputs-not-ready';
  let reasonMessage = CONVERSATION_COMPOSITION_BLOCK_REASONS[reason] || 'Full WAV assembly unavailable.';
  if (reason === 'rate-aware-assembly-required') {
    const rateDisplay = Number(playbackRate || 1).toFixed(1);
    reasonMessage = `Playback at non-unit rate (${rateDisplay}x) remains available per Sentence, but combined Full WAV export is disabled because the WAV assembler requires 1.0x unit rate.`;
  } else if (reason === 'inputs-not-ready') {
    const readyCount = plan.entries.filter(e => e.runtimeAudio && e.renderFingerprint === e.expectedRenderFingerprint).length;
    reasonMessage = `Full WAV assembly disabled: ${readyCount}/${plan.entries.length} primary Sentence inputs verified Ready (${plan.compositionInputsReady ? 'secondary fallback active' : 'missing/metadata-only/stale'}).`;
  }
  return {
    readyToCompose: false,
    route: plan.route,
    fullStatus: plan.fullReadiness?.status || TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING,
    reason,
    reasonMessage
  };
};

/**
 * Safely computes read-only D5 Conversation playback plans per hydrated Scene across both channels.
 */
export const buildConversationSceneAudioPlansMap = ({
  documentTree,
  audioVariants = [],
  runtimeAudioUrls = {},
  runtimeFullAudio = {},
  audioConfig = {}
}) => {
  const bySceneId = {};
  const bySegmentChannel = {};
  const workspaceTotals = {
    entries: 0,
    ready: 0,
    metadataOnly: 0,
    stale: 0,
    otherProfile: 0,
    missing: 0
  };
  let planError = null;

  if (!documentTree || !Array.isArray(documentTree.blocks)) {
    return { bySceneId, bySegmentChannel, workspaceTotals, planError };
  }

  const representationMode = audioConfig.playbackRepresentationMode === 'full' ? 'full' : 'split';
  const audioSourceMode = audioConfig.audioSourceMode || TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST;
  const globalTtsOnly = audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY;
  const globalPlaybackRate = Number(audioConfig.globalPlaybackRate) || 1;
  const preferences = audioConfig.preferences || null;
  const globalPlaybackOrder = audioConfig.globalPlaybackOrder || null;
  const customLocalVoiceId = audioConfig.customLocalVoiceId || null;

  for (const block of documentTree.blocks) {
    if (!block || block.blockType !== 'conversation') continue;
    try {
      const textPlan = buildTextStructuredBlockRuntimePlaybackPlan({
        documentTree,
        block,
        channel: 'text',
        representationMode,
        audioVariants,
        runtimeAudioUrls,
        runtimeFullAudio,
        preferences,
        globalPlaybackRate,
        globalPlaybackOrder,
        audioSourceMode,
        customLocalVoiceId,
        globalTtsOnly,
        allowFullArtifact: true
      });
      const meaningPlan = buildTextStructuredBlockRuntimePlaybackPlan({
        documentTree,
        block,
        channel: 'meaning',
        representationMode,
        audioVariants,
        runtimeAudioUrls,
        runtimeFullAudio,
        preferences,
        globalPlaybackRate,
        globalPlaybackOrder,
        audioSourceMode,
        customLocalVoiceId,
        globalTtsOnly,
        allowFullArtifact: true
      });
      bySceneId[block.id] = { text: textPlan, meaning: meaningPlan };

      for (const [channelKey, channelPlan] of [['text', textPlan], ['meaning', meaningPlan]]) {
        for (const entry of channelPlan?.entries || []) {
          bySegmentChannel[`${entry.segmentId}::${channelKey}`] = entry;
          workspaceTotals.entries += 1;
          if (entry.status === 'ready') workspaceTotals.ready += 1;
          else if (entry.status === 'metadata-only' || entry.status === 'legacy-unverified') workspaceTotals.metadataOnly += 1;
          else if (entry.status === 'stale') workspaceTotals.stale += 1;
          else if (entry.status === 'other-profile') workspaceTotals.otherProfile += 1;
          else workspaceTotals.missing += 1;
        }
      }
    } catch (error) {
      planError = error?.message || 'Unable to compute Scene audio plan.';
      bySceneId[block.id] = { error: planError };
    }
  }

  return { bySceneId, bySegmentChannel, workspaceTotals, planError };
};

const readEntryBlob = async ({ entry, runtimeAudioUrls }) => {
  const variantId = entry?.runtimeAudio?.variant?.id;
  const runtime = variantId ? runtimeAudioUrls?.[variantId] : null;
  if (typeof Blob !== 'undefined' && runtime?.blob instanceof Blob && runtime.blob.size > 0) {
    return runtime.blob;
  }
  const url = entry?.runtimeAudio?.url || runtime?.url || null;
  if (url && typeof fetch === 'function' && url.startsWith('blob:')) {
    const response = await fetch(url);
    const fetched = await response.blob();
    if (fetched instanceof Blob && fetched.size > 0) return fetched;
  }
  throw new Error(`Readable binary Blob unavailable for Sentence ${entry?.segmentId || 'unknown'}.`);
};

/**
 * Composes a verified derived 48 kHz Full WAV preview in memory only when plan.readyToCompose === true.
 */
export const assembleConversationSceneFullWavPreview = async ({
  documentTitle = 'Conversation',
  block,
  plan,
  runtimeAudioUrls = {}
}) => {
  if (!plan?.readyToCompose) {
    const reason = plan?.compositionBlockReason || 'inputs-not-ready';
    throw new Error(CONVERSATION_COMPOSITION_BLOCK_REASONS[reason] || 'Full WAV composition is disabled for this Scene.');
  }
  const blobs = [];
  for (const entry of plan.entries) {
    blobs.push(await readEntryBlob({ entry, runtimeAudioUrls }));
  }
  const composed = await buildDerivedTextConversationFullAudioWav({ plan, blobs });
  const filename = buildDerivedTextFullAudioFilename({
    documentTitle,
    blockId: block?.id || 'SCENE',
    channel: plan.channel
  });
  const artifact = buildTextStructuredFullArtifactRecord({
    block,
    channel: plan.channel,
    composition: plan.composition,
    source: 'derived',
    mimeType: 'audio/wav',
    filename
  });
  return { composed, artifact, filename };
};
