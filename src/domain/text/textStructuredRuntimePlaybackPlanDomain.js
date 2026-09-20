import {
  resolveTextStructuredEffectivePlaybackOrder,
  resolveTextStructuredEffectiveTtsOnly
} from './textStructuredAudioPlaybackOrderDomain.js';
import { resolveTextStructuredRuntimeAudio } from './textStructuredAudioRuntimeDomain.js';
import {
  TEXT_STRUCTURED_ARTIFACT_READINESS,
  buildTextStructuredFullRepresentation,
  resolveTextStructuredFullArtifactReadiness,
  resolveTextStructuredOrderedSegments
} from './textStructuredSplitFullDomain.js';
import { TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES } from './textStructuredPlaybackPreferenceDomain.js';

export const TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES = Object.freeze({
  SPLIT_LOCAL: 'split-local',
  SPLIT_TTS: 'split-tts',
  FULL_LOCAL: 'full-local',
  FULL_TTS: 'full-tts'
});

const clean = value => String(value ?? '').trim();
const normalizeChannel = value => String(value || '').toLowerCase() === 'meaning' ? 'meaning' : 'text';
const runtimeReady = entry => Boolean(entry?.url || entry?.stagingBacked || entry?.zipBacked || entry?.folderBacked || entry?.blob || entry?.binaryReady);
const contentFor = (segment, channel) => normalizeChannel(channel) === 'meaning' ? clean(segment?.meaning) : clean(segment?.text);

const resolveFallbackProfile = ({ fallbackVoiceId, fallbackEngine = 'edge', fallbackRate = 0, fallbackPitch = 0 } = {}) => (
  clean(fallbackVoiceId)
    ? [{ engine: fallbackEngine || 'edge', voiceId: fallbackVoiceId, rate: fallbackRate, pitch: fallbackPitch }]
    : []
);

export const resolveTextStructuredRuntimePlaybackOrder = ({
  documentTree,
  block,
  channel = 'text',
  fallbackVoiceId = null,
  fallbackEngine = 'edge',
  fallbackRate = 0,
  fallbackPitch = 0,
  globalPlaybackOrder = null
} = {}) => resolveTextStructuredEffectivePlaybackOrder({
  documentTree,
  block,
  channel,
  globalProfiles: globalPlaybackOrder?.channels?.[normalizeChannel(channel)] || [],
  fallbackProfiles: resolveFallbackProfile({ fallbackVoiceId, fallbackEngine, fallbackRate, fallbackPitch })
});

export const resolveTextStructuredReadyFullRuntime = ({
  block,
  channel = 'text',
  language = null,
  playbackOrder,
  runtimeFullAudio = {}
} = {}) => {
  const profiles = Array.isArray(playbackOrder?.profiles) ? playbackOrder.profiles : [];
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    const readiness = resolveTextStructuredFullArtifactReadiness({
      block,
      channel,
      profile,
      language,
      runtimeFullAudio
    });
    if (readiness.status === TEXT_STRUCTURED_ARTIFACT_READINESS.READY && readiness.ready && runtimeReady(readiness.runtime)) {
      return {
        ...readiness,
        profile,
        profileRank: index + 1,
        playbackOrderSource: playbackOrder?.source || 'compatibility-fallback'
      };
    }
  }
  return null;
};

export const buildTextStructuredSplitRuntimePlan = ({
  documentTree,
  block,
  channel = 'text',
  audioVariants = [],
  runtimeAudioUrls = {},
  fallbackVoiceId = null,
  fallbackEngine = 'edge',
  fallbackRate = 0,
  fallbackPitch = 0,
  globalPlaybackOrder = null,
  globalTtsOnly = false,
  highlight = true
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const playbackOrder = resolveTextStructuredRuntimePlaybackOrder({
    documentTree,
    block,
    channel: normalizedChannel,
    fallbackVoiceId,
    fallbackEngine,
    fallbackRate,
    fallbackPitch,
    globalPlaybackOrder
  });
  const ttsOnly = resolveTextStructuredEffectiveTtsOnly({ documentTree, block, globalTtsOnly });
  const steps = [];
  let localCount = 0;
  let ttsCount = 0;

  for (const segment of resolveTextStructuredOrderedSegments(block)) {
    const content = contentFor(segment, normalizedChannel);
    if (!content) continue;
    let resolved = null;
    if (!ttsOnly.enabled) {
      resolved = resolveTextStructuredRuntimeAudio({
        audioVariants,
        runtimeAudioUrls,
        segmentId: segment.id,
        channel: normalizedChannel,
        requestedVoiceId: null,
        preferredGeneratedVoiceId: fallbackVoiceId,
        preferredGeneratedEngine: fallbackEngine,
        preferredGeneratedProfiles: playbackOrder.profiles,
        strictProfileOrder: playbackOrder.explicit,
        allowAnyGenerated: !playbackOrder.explicit,
        content
      });
    }
    if (resolved) {
      localCount += 1;
      steps.push({
        type: TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL,
        representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
        channel: normalizedChannel,
        segmentId: segment.id,
        blockId: block?.id || null,
        content,
        highlight: Boolean(highlight),
        runtimeAudio: resolved,
        voiceId: resolved.variant?.voiceId || null,
        profileRank: resolved.playbackProfileRank || null
      });
    } else {
      ttsCount += 1;
      steps.push({
        type: TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS,
        representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
        channel: normalizedChannel,
        segmentId: segment.id,
        blockId: block?.id || null,
        content,
        highlight: Boolean(highlight),
        runtimeAudio: null,
        voiceId: null,
        profileRank: null
      });
    }
  }

  return {
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    channel: normalizedChannel,
    playbackOrder,
    ttsOnly,
    steps,
    total: steps.length,
    localCount,
    ttsCount,
    completeLocal: steps.length > 0 && ttsCount === 0,
    partialLocal: localCount > 0 && ttsCount > 0
  };
};

export const buildTextStructuredBlockRuntimePlaybackPlan = ({
  documentTree,
  block,
  channel = 'text',
  representationMode = TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
  audioVariants = [],
  runtimeAudioUrls = {},
  runtimeFullAudio = {},
  fallbackVoiceId = null,
  fallbackEngine = 'edge',
  fallbackRate = 0,
  fallbackPitch = 0,
  language = null,
  globalPlaybackOrder = null,
  globalTtsOnly = false,
  allowFullArtifact = true
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const normalizedMode = representationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    ? TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    : TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;

  if (normalizedMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT) {
    return {
      mode: normalizedMode,
      route: 'split',
      ...buildTextStructuredSplitRuntimePlan({
        documentTree,
        block,
        channel: normalizedChannel,
        audioVariants,
        runtimeAudioUrls,
        fallbackVoiceId,
        fallbackEngine,
        fallbackRate,
        fallbackPitch,
        globalPlaybackOrder,
        globalTtsOnly,
        highlight: true
      })
    };
  }

  const fullRepresentation = buildTextStructuredFullRepresentation({ block, channel: normalizedChannel });
  const playbackOrder = resolveTextStructuredRuntimePlaybackOrder({
    documentTree,
    block,
    channel: normalizedChannel,
    fallbackVoiceId,
    fallbackEngine,
    fallbackRate,
    fallbackPitch,
    globalPlaybackOrder
  });
  const ttsOnly = resolveTextStructuredEffectiveTtsOnly({ documentTree, block, globalTtsOnly });

  if (!fullRepresentation.content) {
    return {
      mode: normalizedMode,
      route: 'empty',
      representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      channel: normalizedChannel,
      playbackOrder,
      ttsOnly,
      fullRepresentation,
      steps: [],
      total: 0,
      localCount: 0,
      ttsCount: 0
    };
  }

  if (ttsOnly.enabled) {
    return {
      mode: normalizedMode,
      route: 'full-tts-only',
      representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      channel: normalizedChannel,
      playbackOrder,
      ttsOnly,
      fullRepresentation,
      steps: [{
        type: TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS,
        representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
        channel: normalizedChannel,
        blockId: block?.id || null,
        segmentId: null,
        content: fullRepresentation.content,
        highlight: false,
        runtimeFull: null
      }],
      total: 1,
      localCount: 0,
      ttsCount: 1
    };
  }

  const readyFull = allowFullArtifact ? resolveTextStructuredReadyFullRuntime({
    block,
    channel: normalizedChannel,
    language,
    playbackOrder,
    runtimeFullAudio
  }) : null;

  if (readyFull) {
    return {
      mode: normalizedMode,
      route: 'full-local',
      representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      channel: normalizedChannel,
      playbackOrder,
      ttsOnly,
      fullRepresentation,
      steps: [{
        type: TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL,
        representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
        channel: normalizedChannel,
        blockId: block?.id || null,
        segmentId: null,
        content: fullRepresentation.content,
        highlight: false,
        runtimeFull: readyFull,
        voiceId: readyFull.profile?.voiceId || readyFull.artifact?.descriptor?.voiceId || null,
        profileRank: readyFull.profileRank || null
      }],
      total: 1,
      localCount: 1,
      ttsCount: 0
    };
  }

  const splitFallback = buildTextStructuredSplitRuntimePlan({
    documentTree,
    block,
    channel: normalizedChannel,
    audioVariants,
    runtimeAudioUrls,
    fallbackVoiceId,
    fallbackEngine,
    fallbackRate,
    fallbackPitch,
    globalPlaybackOrder,
    globalTtsOnly: false,
    highlight: false
  });

  // If Full is missing and not even one local Split exists, prefer one Full TTS
  // utterance rather than artificially splitting an all-TTS Full-mode playback.
  if (splitFallback.localCount === 0) {
    return {
      mode: normalizedMode,
      route: 'full-tts-fallback',
      representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      channel: normalizedChannel,
      playbackOrder,
      ttsOnly,
      fullRepresentation,
      splitFallback,
      steps: [{
        type: TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS,
        representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
        channel: normalizedChannel,
        blockId: block?.id || null,
        segmentId: null,
        content: fullRepresentation.content,
        highlight: false,
        runtimeFull: null
      }],
      total: 1,
      localCount: 0,
      ttsCount: 1
    };
  }

  return {
    mode: normalizedMode,
    route: 'split-fallback',
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    channel: normalizedChannel,
    playbackOrder,
    ttsOnly,
    fullRepresentation,
    splitFallback,
    steps: splitFallback.steps.map(step => ({ ...step, highlight: false })),
    total: splitFallback.total,
    localCount: splitFallback.localCount,
    ttsCount: splitFallback.ttsCount
  };
};
