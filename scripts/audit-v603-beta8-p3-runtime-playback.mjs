import assert from 'node:assert/strict';
import {
  buildTextStructuredAudioPlaybackOrderMetadata
} from '../src/domain/text/textStructuredAudioPlaybackOrderDomain.js';
import {
  buildTextStructuredAudioContentFingerprint
} from '../src/domain/text/textStructuredAudioIdentityDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES
} from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  normalizeTextStructuredPreferences,
  resolveStructuredTextPlaybackChannelOrder
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';

Object.defineProperty(globalThis, 'navigator', {
  value: { mediaSession: { playbackState: 'none' } },
  configurable: true
});

let pass = 0;
const check = async (name, fn) => {
  await fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`);
};

const libby = 'en-GB-LibbyNeural';
const maisie = 'en-GB-MaisieNeural';
const docMetadata = buildTextStructuredAudioPlaybackOrderMetadata({
  metadata: {},
  channel: 'text',
  profiles: [
    { engine: 'edge', voiceId: libby, rate: 0, pitch: 0 },
    { engine: 'edge', voiceId: maisie, rate: 0, pitch: 0 }
  ]
});
const segments = [
  { id: 'SEGMENT_000001', order: 1, text: 'First sentence.', meaning: 'Kalimat pertama.', joinAfter: 'space' },
  { id: 'SEGMENT_000002', order: 2, text: 'Second sentence.', meaning: 'Kalimat kedua.', joinAfter: 'space' },
  { id: 'SEGMENT_000003', order: 3, text: 'Third sentence.', meaning: 'Kalimat ketiga.', joinAfter: 'space' }
];
const bareBlock = { id: 'TEXT_000001', blockType: 'paragraph', order: 1, metadata: {}, segments };
const fullLibby = buildTextStructuredFullArtifactRecord({
  block: bareBlock, channel: 'text', language: 'en-GB', voiceId: libby, engine: 'edge', rate: 0, pitch: 0,
  filename: 'full-libby.mp3', mimeType: 'audio/mpeg'
});
const fullMaisie = buildTextStructuredFullArtifactRecord({
  block: bareBlock, channel: 'text', language: 'en-GB', voiceId: maisie, engine: 'edge', rate: 0, pitch: 0,
  filename: 'full-maisie.mp3', mimeType: 'audio/mpeg'
});
let fullMeta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullLibby });
fullMeta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: fullMeta, artifact: fullMaisie });
const block = { ...bareBlock, metadata: fullMeta };
const documentTree = {
  id: 'DOC_000001',
  title: 'P3 Runtime Test',
  documentType: 'paragraph',
  editorModel: 'structured-v1',
  textLanguage: 'en-GB',
  meaningLanguage: 'id-ID',
  metadata: docMetadata,
  blocks: [block]
};

const makeVariant = ({ id, segmentId, voiceId }) => {
  const segment = segments.find(item => item.id === segmentId);
  return {
    id, segmentId, channel: 'text', source: 'generated', engine: 'edge', voiceId,
    createdAt: 1000, updatedAt: 1000,
    metadata: {
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: segment.text }),
      audioRenderDescriptorV1: { engine: 'edge', voiceId, rate: 0, pitch: 0 }
    }
  };
};
const v1 = makeVariant({ id: 'TXTAUDIO_000001', segmentId: segments[0].id, voiceId: libby });
const v2 = makeVariant({ id: 'TXTAUDIO_000002', segmentId: segments[1].id, voiceId: libby });
const v3Maisie = makeVariant({ id: 'TXTAUDIO_000003', segmentId: segments[2].id, voiceId: maisie });
const audioVariants = [v1, v2, v3Maisie];

const basePlanArgs = {
  documentTree,
  block,
  channel: 'text',
  audioVariants,
  fallbackVoiceId: libby,
  fallbackEngine: 'edge',
  fallbackRate: 0,
  fallbackPitch: 0,
  language: 'en-GB'
};

await check('Split is the default playback representation mode', () => {
  assert.equal(DEFAULT_TEXT_STRUCTURED_PREFERENCES.playbackRepresentationMode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT);
  assert.equal(normalizeTextStructuredPreferences({}).playbackRepresentationMode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT);
});

await check('Full representation preference persists through normalization', () => {
  assert.equal(normalizeTextStructuredPreferences({ playbackRepresentationMode: 'full' }).playbackRepresentationMode, 'full');
});

await check('Channel order remains deterministic for EN/ID combined playback', () => {
  assert.deepEqual(resolveStructuredTextPlaybackChannelOrder(TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING), ['text', 'meaning']);
  assert.deepEqual(resolveStructuredTextPlaybackChannelOrder(TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_THEN_TEXT), ['meaning', 'text']);
});

await check('Split plan supports local / TTS / next-profile local per Segment', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'split',
    runtimeAudioUrls: {
      [v1.id]: { stagingBacked: true, stagingId: 'S1' },
      [v3Maisie.id]: { stagingBacked: true, stagingId: 'S3' }
    },
    runtimeFullAudio: {}
  });
  assert.equal(plan.route, 'split');
  assert.deepEqual(plan.steps.map(step => step.type), [
    TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL,
    TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS,
    TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL
  ]);
  assert.equal(plan.steps[0].voiceId, libby);
  assert.equal(plan.steps[2].voiceId, maisie);
  assert.equal(plan.steps.every(step => step.highlight), true);
});

await check('Split TTS Only bypasses all local variants without deleting metadata', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'split',
    runtimeAudioUrls: { [v1.id]: { stagingBacked: true }, [v2.id]: { stagingBacked: true } },
    globalTtsOnly: true
  });
  assert.equal(plan.localCount, 0);
  assert.equal(plan.ttsCount, 3);
  assert.equal(plan.steps.every(step => step.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS), true);
});

await check('Full Mode uses exact preferred Full Artifact when physically ready', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: {},
    runtimeFullAudio: { [fullLibby.fullArtifactFingerprint]: { stagingBacked: true, stagingId: 'FULL_LIBBY' } }
  });
  assert.equal(plan.route, 'full-local');
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);
  assert.equal(plan.steps[0].voiceId, libby);
  assert.equal(plan.steps[0].highlight, false);
});

await check('Full Mode promotes the second ordered Full profile when first is unavailable', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: {},
    runtimeFullAudio: { [fullMaisie.fullArtifactFingerprint]: { zipBacked: true } }
  });
  assert.equal(plan.route, 'full-local');
  assert.equal(plan.steps[0].voiceId, maisie);
  assert.equal(plan.steps[0].profileRank, 2);
});

await check('Full missing + partial Split becomes no-highlight hybrid Split fallback', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: { [v1.id]: { stagingBacked: true }, [v3Maisie.id]: { stagingBacked: true } },
    runtimeFullAudio: {}
  });
  assert.equal(plan.route, 'split-fallback');
  assert.deepEqual(plan.steps.map(step => step.type), [
    TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL,
    TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS,
    TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL
  ]);
  assert.equal(plan.steps.every(step => step.highlight === false), true);
});

await check('Full missing + zero local Split becomes one uninterrupted Full TTS fallback', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: {},
    runtimeFullAudio: {}
  });
  assert.equal(plan.route, 'full-tts-fallback');
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(plan.steps[0].content, 'First sentence. Second sentence. Third sentence.');
});

await check('Full TTS Only ignores a READY Full binary', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: {},
    runtimeFullAudio: { [fullLibby.fullArtifactFingerprint]: { stagingBacked: true } },
    globalTtsOnly: true
  });
  assert.equal(plan.route, 'full-tts-only');
  assert.equal(plan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
});

await check('Full READY stays independent when one Split binary is missing', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: { [v1.id]: { stagingBacked: true } },
    runtimeFullAudio: { [fullLibby.fullArtifactFingerprint]: { stagingBacked: true } }
  });
  assert.equal(plan.route, 'full-local');
  assert.equal(plan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);
});

const runSession = async ({ representationMode, planResolver, fullPlayer, splitPlayer }) => {
  const playbackSessionRef = { current: 77 };
  const playbackContextRef = { current: null };
  const stopSignalRef = { current: false };
  const pauseStateRef = { current: false };
  const highlights = [];
  const speaking = [];
  let pending = null;
  const started = executeStructuredTextPlaybackSessionService({
    documentTree,
    blockId: block.id,
    scope: 'card',
    playbackChannelMode: 'text-only',
    playbackOrderMode: 'sequential',
    playbackRepresentationMode: representationMode,
    repeatMode: 'once',
    channelDelayMs: 0,
    segmentDelayMs: 0,
    safePlayTransition: fn => { pending = Promise.resolve().then(fn); },
    playbackSessionRef,
    playbackContextRef,
    setIsPlaying: () => {},
    setIsPaused: () => {},
    pauseStateRef,
    stopSignalRef,
    silentAudioRef: { current: null },
    waitWhilePaused: async () => {},
    setPlayingContext: () => {},
    setPlayingIndex: value => highlights.push(value),
    setCurrentIndex: () => {},
    setSpeakingPart: value => speaking.push(value),
    playStructuredChannel: splitPlayer,
    resolveBlockChannelPlaybackPlan: planResolver,
    playStructuredFullStep: fullPlayer,
    forceStopAll: () => {},
    addLog: () => {}
  });
  assert.equal(started, true);
  await pending;
  return { highlights, speaking, playbackContext: playbackContextRef.current };
};

await check('Runtime session Full-local path calls Full player and suppresses Segment highlight', async () => {
  let fullCalls = 0;
  let splitCalls = 0;
  const fullPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs, representationMode: 'full', runtimeAudioUrls: {},
    runtimeFullAudio: { [fullLibby.fullArtifactFingerprint]: { stagingBacked: true } }
  });
  const result = await runSession({
    representationMode: 'full',
    planResolver: () => fullPlan,
    fullPlayer: async () => { fullCalls += 1; },
    splitPlayer: async () => { splitCalls += 1; }
  });
  assert.equal(fullCalls, 1);
  assert.equal(splitCalls, 0);
  assert.equal(result.highlights.some(Boolean), false);
  assert.equal(result.playbackContext.playbackRepresentationMode, 'full');
});

await check('Runtime Full fallback plays each Split step but still suppresses highlight', async () => {
  let fullCalls = 0;
  let splitCalls = 0;
  const fallbackPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs, representationMode: 'full',
    runtimeAudioUrls: { [v1.id]: { stagingBacked: true }, [v3Maisie.id]: { stagingBacked: true } }, runtimeFullAudio: {}
  });
  const result = await runSession({
    representationMode: 'full',
    planResolver: () => fallbackPlan,
    fullPlayer: async () => { fullCalls += 1; },
    splitPlayer: async () => { splitCalls += 1; }
  });
  assert.equal(fullCalls, 0);
  assert.equal(splitCalls, 3);
  assert.equal(result.highlights.some(Boolean), false);
});

await check('Runtime Split session preserves Segment highlighting', async () => {
  let splitCalls = 0;
  const result = await runSession({
    representationMode: 'split',
    planResolver: () => null,
    fullPlayer: async () => {},
    splitPlayer: async () => { splitCalls += 1; }
  });
  assert.equal(splitCalls, 3);
  assert.ok(result.highlights.includes('SEGMENT_000001'));
  assert.ok(result.highlights.includes('SEGMENT_000002'));
  assert.ok(result.highlights.includes('SEGMENT_000003'));
});

await check('Full mode can be forced to Split fallback for partial scopes by disabling Full Artifact', () => {
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    ...basePlanArgs,
    representationMode: 'full',
    runtimeAudioUrls: { [v1.id]: { stagingBacked: true } },
    runtimeFullAudio: { [fullLibby.fullArtifactFingerprint]: { stagingBacked: true } },
    allowFullArtifact: false
  });
  assert.equal(plan.route, 'split-fallback');
  assert.equal(plan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
});

console.log(`\nP3 AUDIT COMPLETE — ${pass} PASS`);
