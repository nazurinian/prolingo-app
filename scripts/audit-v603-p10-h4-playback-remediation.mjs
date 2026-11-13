import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  resolveScopedStructuredTextPlaybackSourceStatus,
  resolveStructuredTextPlaybackList,
  resolveStructuredTextPlayerTitle
} from '../src/domain/text/textStructuredPlaybackDomain.js';
import { TEXT_STRUCTURED_AUDIO_SOURCE_MODES, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES } from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES
} from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildTextStructuredLocalAudioProfileMetadata,
  resolveTextStructuredEffectiveCustomLocalVoice
} from '../src/domain/text/textStructuredLocalAudioProfileDomain.js';
import {
  buildTextStructuredSpeakerVoiceProfileV2Metadata,
  buildTextStructuredUpsertSpeakerRegistryMetadata
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import {
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredAudioContentFingerprint } from '../src/domain/text/textStructuredAudioIdentityDomain.js';
import {
  buildTextStructuredVoiceOverrideMetadata,
  resolveTextStructuredBrowserVoiceResolution,
  resolveTextStructuredEffectiveVoiceProfile
} from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import { executeMediaSessionLifecycleService } from '../src/services/playback/mediaSessionLifecycleService.js';
import { buildTextStructuredAudioSyncProfileMetadata } from '../src/domain/text/textStructuredAudioSyncProfileDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = createRequire(import.meta.url);
const esbuild = load('esbuild');

const loadExtensionlessServiceModule = relPath => {
  const cache = new Map();
  const loadAbs = absPath => {
    const resolvedAbs = path.resolve(absPath);
    if (cache.has(resolvedAbs)) return cache.get(resolvedAbs).exports;
    const source = fs.readFileSync(resolvedAbs, 'utf8');
    const mod = { exports: {} };
    cache.set(resolvedAbs, mod);
    const req = specifier => {
      if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
      const candidateBase = path.resolve(path.dirname(resolvedAbs), specifier);
      for (const candidate of [candidateBase, `${candidateBase}.js`, `${candidateBase}.jsx`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return loadAbs(candidate);
      }
      throw new Error(`Missing module ${specifier} from ${resolvedAbs}`);
    };
    const transformed = esbuild.transformSync(source, { loader: 'js', format: 'cjs', target: 'node20' });
    new Function('exports', 'require', 'module', transformed.code)(mod.exports, req, mod);
    return mod.exports;
  };
  return loadAbs(path.join(root, relPath));
};

const { executePausePlayback, executeResumePlayback } = loadExtensionlessServiceModule('src/services/playback/playbackRuntimeControlService.js');
const { executeForceStopPlaybackService } = loadExtensionlessServiceModule('src/services/playback/playbackInteractionService.js');
const results = [];

const runCheck = async (area, id, title, fn) => {
  try {
    await fn();
    results.push({ area, id, title, ok: true });
    console.log(`PASS [${area}][${id}] ${title}`);
  } catch (error) {
    results.push({ area, id, title, ok: false, error: error?.stack || error?.message || String(error) });
    console.error(`FAIL [${area}][${id}] ${title}\n   -> ${error?.message || error}`);
  }
};

const readRepoText = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

const buildParagraphDocument = ({
  docId = 'DOC_H4_01',
  title = 'H4 Sample Doc',
  docMetadata = {},
  block1Metadata = {},
  seg1Metadata = {},
  seg2Metadata = {}
} = {}) => ({
  id: docId,
  title,
  editorModel: 'structured-v1',
  documentType: 'paragraph',
  textLanguage: 'en',
  meaningLanguage: 'id',
  metadata: docMetadata,
  blocks: [
    {
      id: 'TEXT_000001',
      documentId: docId,
      order: 1,
      title: 'Paragraph Card 1',
      blockType: 'paragraph',
      metadata: block1Metadata,
      segments: [
        {
          id: 'SEGMENT_000001',
          blockId: 'TEXT_000001',
          order: 1,
          text: 'Hello world.',
          meaning: 'Halo dunia.',
          metadata: seg1Metadata
        },
        {
          id: 'SEGMENT_000002',
          blockId: 'TEXT_000001',
          order: 2,
          text: 'Second sentence.',
          meaning: 'Kalimat kedua.',
          metadata: seg2Metadata
        }
      ]
    },
    {
      id: 'TEXT_000002',
      documentId: docId,
      order: 2,
      title: 'Paragraph Card 2',
      blockType: 'paragraph',
      metadata: {},
      segments: [
        {
          id: 'SEGMENT_000003',
          blockId: 'TEXT_000002',
          order: 1,
          text: 'Another paragraph.',
          meaning: 'Paragraf lain.',
          metadata: {}
        }
      ]
    }
  ]
});

const installMockNavigatorMediaSession = () => {
  const prevNavigator = globalThis.navigator;
  const prevMediaMetadata = globalThis.MediaMetadata;
  const positionCalls = [];
  const handlers = {};
  const mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler(name, fn) { handlers[name] = fn; },
    setPositionState(state) { positionCalls.push(state); }
  };
  globalThis.MediaMetadata = class MediaMetadataMock {
    constructor(init) { Object.assign(this, init); }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaSession }
  });
  return {
    mediaSession,
    positionCalls,
    handlers,
    restore() {
      if (prevNavigator === undefined) delete globalThis.navigator;
      else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prevNavigator });
      if (prevMediaMetadata === undefined) delete globalThis.MediaMetadata;
      else globalThis.MediaMetadata = prevMediaMetadata;
    }
  };
};

// ============================================================================
// H4-A (P10-G009): MediaSession in Structured Text Full Mode
// ============================================================================
await runCheck('H4-A', 'G009-1', 'Full mode with playingIndex=null populates card-level MediaSession metadata for active & paused states and registers working hardware handlers', () => {
  const mock = installMockNavigatorMediaSession();
  try {
    const doc = buildParagraphDocument();
    const list = resolveStructuredTextPlaybackList(doc);
    const mediaIntervalRef = { current: null };
    const ctxRef = {
      current: {
        context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
        documentId: doc.id,
        orderedList: list,
        cursorSegmentId: 'SEGMENT_000001',
        playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
      }
    };
    const calls = [];
    const navRef = { current: dir => calls.push(`nav:${dir}`) };
    const pausePlaybackRef = { current: opts => calls.push(`pause:${opts?.source || ''}`) };
    const resumePlaybackRef = { current: () => calls.push('resume') };
    const playRef = { current: () => calls.push('play') };
    const stopRef = { current: () => calls.push('stop') };
    const pauseStateRef = { current: false };

    // Active session lifecycle mirrors executeStructuredTextPlaybackSessionService + Pause/Resume controls
    mock.mediaSession.playbackState = 'playing';
    const cleanupPlaying = executeMediaSessionLifecycleService({
      isPlaying: true,
      isPaused: false,
      playingIndex: null,
      currentIndex: 'SEGMENT_000001',
      speakingPart: 'text',
      currentPlayerList: list,
      mode: 'text',
      currentAudioObjRef: { current: null },
      mediaIntervalRef,
      playbackContextRef: ctxRef,
      pauseStateRef,
      playRef,
      pausePlaybackRef,
      resumePlaybackRef,
      navRef,
      stopRef
    });

    assert.equal(mock.mediaSession.playbackState, 'playing');
    assert.ok(mock.mediaSession.metadata, 'Expected MediaMetadata in Full mode with playingIndex=null');
    assert.equal(mock.mediaSession.metadata.title, 'H4 Sample Doc');
    assert.match(mock.mediaSession.metadata.artist, /Paragraph Card 1 • Card 1 • Full/);
    assert.equal(mock.mediaSession.metadata.album, 'ProLingo Text Library');
    assert.equal(typeof mock.handlers.pause, 'function');
    assert.equal(typeof mock.handlers.play, 'function');
    assert.equal(typeof mock.handlers.nexttrack, 'function');
    assert.equal(typeof mock.handlers.previoustrack, 'function');
    assert.equal(typeof mock.handlers.stop, 'function');
    mock.handlers.pause();
    mock.handlers.nexttrack();
    mock.handlers.previoustrack();
    mock.handlers.stop();
    cleanupPlaying();

    // Pause control transitions playbackState cleanly and Resume/pause preserves Full meaning metadata
    let pausedFlag = false;
    const synthMock = { cancel() {}, pause() {}, resume() {} };
    executePausePlayback({
      isPlaying: true,
      isMobile: false,
      pauseStateRef,
      currentAudioObjRef: { current: null },
      synth: synthMock,
      silentAudioRef: { current: null },
      setIsPaused: value => { pausedFlag = value; },
      addLog: () => {},
      ttsReplayRef: { current: null },
      pauseSource: 'button'
    });
    assert.equal(pausedFlag, true);
    assert.equal(pauseStateRef.current, true);
    assert.equal(mock.mediaSession.playbackState, 'paused');

    const cleanupPaused = executeMediaSessionLifecycleService({
      isPlaying: true,
      isPaused: true,
      playingIndex: null,
      currentIndex: 'SEGMENT_000001',
      speakingPart: 'meaning',
      currentPlayerList: list,
      mode: 'text',
      currentAudioObjRef: { current: null },
      mediaIntervalRef,
      playbackContextRef: ctxRef,
      pauseStateRef,
      playRef,
      pausePlaybackRef,
      resumePlaybackRef,
      navRef,
      stopRef
    });
    assert.equal(mock.mediaSession.playbackState, 'paused');
    assert.match(mock.mediaSession.metadata.artist, /Card 1 • Full • Meaning/);
    mock.handlers.play();
    executeResumePlayback({
      isPlaying: true,
      pauseStateRef,
      currentAudioObjRef: { current: null },
      synth: synthMock,
      silentAudioRef: { current: null },
      setIsPaused: value => { pausedFlag = value; },
      addLog: () => {},
      ttsReplayRef: { current: null }
    });
    assert.equal(pausedFlag, false);
    assert.equal(mock.mediaSession.playbackState, 'playing');
    assert.deepEqual(calls, ['pause:mediaSession', 'nav:next', 'nav:prev', 'stop', 'resume']);
    cleanupPaused();

    executeForceStopPlaybackService({
      playbackSessionRef: { current: 1 },
      stopSignalRef: { current: false },
      pauseStateRef,
      currentAudioObjRef: { current: null },
      synth: synthMock,
      settlePlaybackPromise: () => {},
      currentUtteranceRef: { current: null },
      silentAudioRef: { current: null },
      setIsPlaying: () => {},
      setIsPaused: () => {},
      setSpeakingPart: () => {},
      setIndependentPlayingId: () => {},
      playbackContextRef: ctxRef
    });
    assert.equal(mock.mediaSession.playbackState, 'none');
  } finally {
    mock.restore();
  }
});

await runCheck('H4-A', 'G009-2', 'Stop and workspace switch clear stale Structured Text MediaSession metadata while preserving Split and Table modes', () => {
  const mock = installMockNavigatorMediaSession();
  try {
    const doc = buildParagraphDocument();
    const list = resolveStructuredTextPlaybackList(doc);
    const mediaIntervalRef = { current: null };
    const sharedRefs = {
      currentAudioObjRef: { current: null },
      mediaIntervalRef,
      pauseStateRef: { current: false },
      playRef: { current: () => {} },
      pausePlaybackRef: { current: () => {} },
      resumePlaybackRef: { current: () => {} },
      navRef: { current: () => {} },
      stopRef: { current: () => {} }
    };

    // Active Full state first
    executeMediaSessionLifecycleService({
      isPlaying: true,
      isPaused: false,
      playingIndex: null,
      currentIndex: 'SEGMENT_000001',
      speakingPart: 'text',
      currentPlayerList: list,
      mode: 'text',
      playbackContextRef: {
        current: {
          context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
          documentId: doc.id,
          orderedList: list,
          cursorSegmentId: 'SEGMENT_000001',
          playbackRepresentationMode: 'full'
        }
      },
      ...sharedRefs
    })();
    assert.ok(mock.mediaSession.metadata);

    // After Stop / workspace switch (isPlaying=false, isPaused=false, playbackContextRef=null, playingIndex=null)
    executeMediaSessionLifecycleService({
      isPlaying: false,
      isPaused: false,
      playingIndex: null,
      currentIndex: 'SEGMENT_000001',
      speakingPart: 'text',
      currentPlayerList: list,
      mode: 'text',
      playbackContextRef: { current: null },
      ...sharedRefs
    });
    assert.equal(mock.mediaSession.metadata, null);
    assert.equal(mock.mediaSession.playbackState, 'none');

    // Split mode keeps segment-level formatting
    const splitTitle = resolveStructuredTextPlayerTitle(list[0]);
    assert.match(splitTitle.artist, /Segment 1/);
    executeMediaSessionLifecycleService({
      isPlaying: true,
      isPaused: false,
      playingIndex: 'SEGMENT_000001',
      currentIndex: 'SEGMENT_000001',
      speakingPart: 'text',
      currentPlayerList: list,
      mode: 'text',
      playbackContextRef: {
        current: {
          context: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
          documentId: doc.id,
          orderedList: list,
          playbackRepresentationMode: 'split'
        }
      },
      ...sharedRefs
    })();
    assert.match(mock.mediaSession.metadata.artist, /Segment 1/);

    // Table mode remains untouched
    const tableList = [{ id: 'VOCAB_1', word: 'apple', meaning: 'apel', example: 'An apple a day' }];
    executeMediaSessionLifecycleService({
      isPlaying: true,
      isPaused: false,
      playingIndex: 'VOCAB_1',
      currentIndex: 'VOCAB_1',
      speakingPart: 'meaning',
      currentPlayerList: tableList,
      mode: 'table',
      playbackContextRef: { current: null },
      ...sharedRefs
    })();
    assert.equal(mock.mediaSession.metadata.title, 'Terjemahan kalimat: apel');
  } finally {
    mock.restore();
  }
});

// ============================================================================
// H4-B (P10-G010): CUSTOM_LOCAL Pin Strictness in Full & Split Mode
// ============================================================================
await runCheck('H4-B', 'G010-1', 'Full CUSTOM_LOCAL strictly verifies matching pinned voice artifact and rejects mismatched Full Edge artifacts without falling back to AUTO priority', () => {
  const doc = buildParagraphDocument();
  const block = doc.blocks[0];
  const fullJenny = buildTextStructuredFullArtifactRecord({
    block,
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-JennyNeural',
    rate: 0,
    pitch: 0,
    filename: 'card1_jenny_full.mp3'
  });
  const fullGuy = buildTextStructuredFullArtifactRecord({
    block,
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-GuyNeural',
    rate: 0,
    pitch: 0,
    filename: 'card1_guy_full.mp3'
  });
  let block1Meta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullJenny });
  block1Meta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: block1Meta, artifact: fullGuy });
  const blockWithFullArtifacts = {
    ...block,
    metadata: block1Meta
  };
  const runtimeFullAudio = {
    [fullJenny.fullArtifactFingerprint]: { url: 'blob:jenny-full', artifact: fullJenny, filename: fullJenny.filename },
    [fullGuy.fullArtifactFingerprint]: { url: 'blob:guy-full', artifact: fullGuy, filename: fullGuy.filename }
  };

  // Case 1: Card pinned to Jenny -> chooses Jenny Full artifact cleanly
  const matchingPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: { ...doc, blocks: [blockWithFullArtifacts] },
    block: blockWithFullArtifacts,
    channel: 'text',
    segmentIds: ['SEGMENT_000001', 'SEGMENT_000002'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    runtimeFullAudio,
    fallbackVoiceId: 'en-US-GuyNeural',
    language: 'en',
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL,
    customLocalVoiceId: 'en-US-JennyNeural',
    allowFullArtifact: true
  });
  assert.equal(matchingPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);
  assert.equal(matchingPlan.steps[0].voiceId, 'en-US-JennyNeural');

  // Case 2: Card pinned to Aria (no Full Aria artifact exists, only Jenny & Guy exist) -> MUST NOT play Jenny or Guy Full artifact! Falls back cleanly to FULL_TTS
  const mismatchedPinPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: { ...doc, blocks: [blockWithFullArtifacts] },
    block: blockWithFullArtifacts,
    channel: 'text',
    segmentIds: ['SEGMENT_000001', 'SEGMENT_000002'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    runtimeFullAudio,
    fallbackVoiceId: 'en-US-JennyNeural',
    language: 'en',
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL,
    customLocalVoiceId: 'en-US-AriaNeural',
    allowFullArtifact: true
  });
  assert.equal(mismatchedPinPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(mismatchedPinPlan.steps[0].ignoreSegmentVoiceOverride, true);

  // Case 3: Missing Full Aria artifact, BUT Aria Split variants exist for all segments -> falls back to matching Aria Split (never Jenny Split), preserving pinned voice strictness
  const makeSplitVariant = (segment, idx, voiceId, prefix) => {
    const rfRes = buildTextStructuredAudioRenderFingerprint({ channel: 'text', content: segment.text, language: 'en', engine: 'edge', voiceId });
    const cf = buildTextStructuredAudioContentFingerprint({ channel: 'text', content: segment.text });
    return {
      id: `TXTAUDIO_${prefix}_${idx}`,
      blockId: block.id,
      segmentId: segment.id,
      channel: 'text',
      source: 'generated',
      engine: 'edge',
      voiceId,
      filename: `${prefix}_${idx}.mp3`,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        contentFingerprint: cf,
        audioContentFingerprintV1: cf,
        audioRenderFingerprintV1: rfRes.renderFingerprint,
        audioRenderDescriptorV1: rfRes.descriptor
      }
    };
  };
  const splitJennyVariants = blockWithFullArtifacts.segments.map((segment, idx) => makeSplitVariant(segment, idx, 'en-US-JennyNeural', 'JENNY'));
  const splitAriaVariants = blockWithFullArtifacts.segments.map((segment, idx) => makeSplitVariant(segment, idx, 'en-US-AriaNeural', 'ARIA'));
  const splitVariants = [...splitJennyVariants, ...splitAriaVariants];
  const runtimeAudioUrls = Object.fromEntries(splitVariants.map(v => [v.id, { url: `blob:${v.id}` }]));
  const splitFallbackPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: { ...doc, blocks: [blockWithFullArtifacts] },
    block: blockWithFullArtifacts,
    channel: 'text',
    segmentIds: ['SEGMENT_000001', 'SEGMENT_000002'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    audioVariants: splitVariants,
    runtimeAudioUrls,
    runtimeFullAudio,
    fallbackVoiceId: 'en-US-JennyNeural',
    language: 'en',
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL,
    customLocalVoiceId: 'en-US-AriaNeural',
    allowFullArtifact: true
  });
  assert.equal(splitFallbackPlan.mode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL);
  assert.equal(splitFallbackPlan.route, 'split-fallback');
  assert.ok(splitFallbackPlan.steps.every(step => step.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL && step.voiceId === 'en-US-AriaNeural'));

  // Case 4: AUTO mode & TTS_ONLY mode remain completely intact
  const autoPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: { ...doc, blocks: [blockWithFullArtifacts] },
    block: blockWithFullArtifacts,
    channel: 'text',
    segmentIds: ['SEGMENT_000001', 'SEGMENT_000002'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    runtimeFullAudio,
    fallbackVoiceId: 'en-US-JennyNeural',
    language: 'en',
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.AUTO,
    allowFullArtifact: true
  });
  assert.equal(autoPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);

  const ttsOnlyPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: { ...doc, blocks: [blockWithFullArtifacts] },
    block: blockWithFullArtifacts,
    channel: 'text',
    segmentIds: ['SEGMENT_000001', 'SEGMENT_000002'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    runtimeFullAudio,
    fallbackVoiceId: 'en-US-JennyNeural',
    language: 'en',
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY,
    customLocalVoiceId: 'en-US-JennyNeural',
    allowFullArtifact: true
  });
  assert.equal(ttsOnlyPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(ttsOnlyPlan.steps[0].ignoreSegmentVoiceOverride, true);

  // Case 5: Split mode CUSTOM_LOCAL selects ONLY the pinned voice and falls back to SPLIT_TTS if a segment lacks that pinned voice
  const partialSplitVariants = [splitJennyVariants[0], splitJennyVariants[1], splitAriaVariants[0]];
  const partialSplitUrls = Object.fromEntries(partialSplitVariants.map(v => [v.id, { url: `blob:${v.id}` }]));
  const splitCustomPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: { ...doc, blocks: [blockWithFullArtifacts] },
    block: blockWithFullArtifacts,
    channel: 'text',
    segmentIds: ['SEGMENT_000001', 'SEGMENT_000002'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    audioVariants: partialSplitVariants,
    runtimeAudioUrls: partialSplitUrls,
    fallbackVoiceId: 'en-US-JennyNeural',
    language: 'en',
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL,
    customLocalVoiceId: 'en-US-AriaNeural'
  });
  assert.equal(splitCustomPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(splitCustomPlan.steps[0].voiceId, 'en-US-AriaNeural');
  assert.equal(splitCustomPlan.steps[1].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS);
});

await runCheck('H4-B', 'G010-2', 'resolveTextStructuredEffectiveCustomLocalVoice honors Card > Doc Speaker hierarchy and Conversation Speaker-1 sync, and App.jsx wires CUSTOM_LOCAL cleanly', () => {
  const speakers = [
    { id: 'SPK_1', speakerId: 'SPK_1', key: 'SPK_1', label: 'Alice' },
    { id: 'SPK_2', speakerId: 'SPK_2', key: 'SPK_2', label: 'Bob' }
  ];
  const docBaseMetadata = buildTextStructuredLocalAudioProfileMetadata({ metadata: {}, channel: 'text', voiceId: 'en-US-DocPin' });
  const docWithSpeakerPinsMetadata = buildTextStructuredLocalAudioProfileMetadata({
    metadata: buildTextStructuredLocalAudioProfileMetadata({ metadata: docBaseMetadata, speakerId: 'SPK_1', channel: 'text', voiceId: 'en-US-AlicePin' }),
    speakerId: 'SPK_2',
    channel: 'text',
    voiceId: 'en-US-BobPin'
  });
  const doc = {
    id: 'DOC_CONV_H4B',
    documentType: 'conversation',
    metadata: docWithSpeakerPinsMetadata,
    blocks: [
      {
        id: 'TEXT_000001',
        blockType: 'conversation',
        metadata: buildTextStructuredLocalAudioProfileMetadata({ metadata: {}, channel: 'text', voiceId: 'en-US-CardPin' }),
        segments: [
          { id: 'SEGMENT_000001', speaker: 'Alice', metadata: { speakerIdentityV1: 'SPK_1' }, text: 'Hi Bob' },
          { id: 'SEGMENT_000002', speaker: 'Bob', metadata: { speakerIdentityV1: 'SPK_2' }, text: 'Hi Alice' }
        ]
      }
    ]
  };
  // Without Speaker-1 sync: Card > Doc Speaker pins (Segment 1 & 2 both inherit CardPin over Doc Speaker pins)
  const resSeg1 = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: doc, block: doc.blocks[0], segment: doc.blocks[0].segments[0], channel: 'text', conversationSpeakers: speakers });
  const resSeg2 = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: doc, block: doc.blocks[0], segment: doc.blocks[0].segments[1], channel: 'text', conversationSpeakers: speakers });
  assert.equal(resSeg1, 'en-US-CardPin');
  assert.equal(resSeg2, 'en-US-CardPin');

  // With Conversation Speaker-1 sync enabled: BOTH speakers resolve to Speaker 1's pin
  const syncedDoc = {
    ...doc,
    metadata: buildTextStructuredAudioSyncProfileMetadata({
      metadata: doc.metadata,
      target: 'voice',
      channel: 'text',
      enabled: true
    })
  };
  assert.equal(
    resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: syncedDoc, block: syncedDoc.blocks[0], segment: syncedDoc.blocks[0].segments[0], channel: 'text', conversationSpeakers: speakers }),
    'en-US-AlicePin'
  );
  assert.equal(
    resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: syncedDoc, block: syncedDoc.blocks[0], segment: syncedDoc.blocks[0].segments[1], channel: 'text', conversationSpeakers: speakers }),
    'en-US-AlicePin'
  );

  const appSource = readRepoText('src/App.jsx');
  const start = appSource.indexOf('const resolveStructuredTextBlockChannelPlaybackPlan =');
  const end = appSource.indexOf('const speakStructuredTextBrowserTts =', start);
  const helper = appSource.slice(start, end);
  assert.match(helper, /CUSTOM_LOCAL/);
  assert.match(helper, /resolveTextStructuredEffectiveCustomLocalVoice/);
});

// ============================================================================
// H4-C (P10-G011): Browser TTS Speaker & Inheritance Fallback Chain
// ============================================================================
await runCheck('H4-C', 'G011-1', 'Browser TTS walks full hierarchy (Segment > Card Speaker > Doc Speaker > Card > Doc > Global) including legacy speakerVoiceMap fallback and Full segment suppression', () => {
  const speakerMetaDoc = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'DocVoice' }),
    documentId: 'DOC_H4_01',
    speakerId: 'SPK_ALICE',
    label: 'Alice'
  });
  const docWithSpeakerProfileV2 = {
    ...buildParagraphDocument({
      docMetadata: buildTextStructuredSpeakerVoiceProfileV2Metadata({
        metadata: speakerMetaDoc,
        speakerId: 'SPK_ALICE',
        channel: 'text',
        voiceName: 'DocSpeakerAliceVoice'
      }),
      block1Metadata: buildTextStructuredVoiceOverrideMetadata({
        metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'CardVoice' }),
        speakerId: 'SPK_ALICE',
        channel: 'text',
        voiceName: 'CardSpeakerAliceVoice'
      }),
      seg1Metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'SegVoice' })
    })
  };
  docWithSpeakerProfileV2.blocks[0].segments[0].speaker = 'Alice';
  docWithSpeakerProfileV2.blocks[0].segments[0].metadata = {
    ...docWithSpeakerProfileV2.blocks[0].segments[0].metadata,
    speakerIdentityV1: 'SPK_ALICE'
  };

  const block = docWithSpeakerProfileV2.blocks[0];
  const seg = block.segments[0];

  // 1. Requested hierarchy keeps Segment > Card Speaker > Doc Speaker > Card > Doc > Global
  const effSplit = resolveTextStructuredEffectiveVoiceProfile({ documentTree: docWithSpeakerProfileV2, block, segment: seg, channel: 'text', globalVoiceName: 'GlobalVoice' });
  assert.equal(effSplit.voiceName, 'SegVoice');
  assert.equal(effSplit.source, 'segment');

  // 2. When SegVoice is missing -> MUST fall back to CardSpeakerAliceVoice (NOT skip straight to DocVoice/native OS default)
  const rCardSpeaker = resolveTextStructuredBrowserVoiceResolution({
    documentTree: docWithSpeakerProfileV2,
    block,
    segment: seg,
    channel: 'text',
    globalVoiceName: 'GlobalVoice',
    availableBrowserVoices: ['CardSpeakerAliceVoice', 'DocSpeakerAliceVoice', 'CardVoice', 'DocVoice', 'GlobalVoice']
  });
  assert.equal(rCardSpeaker.effectiveVoiceName, 'CardSpeakerAliceVoice');
  assert.equal(rCardSpeaker.effectiveSource, 'card-speaker');

  // 3. When SegVoice & CardSpeakerAliceVoice are missing -> falls back to DocSpeakerAliceVoice before Card/Doc/Global!
  const rDocSpeaker = resolveTextStructuredBrowserVoiceResolution({
    documentTree: docWithSpeakerProfileV2,
    block,
    segment: seg,
    channel: 'text',
    globalVoiceName: 'GlobalVoice',
    availableBrowserVoices: ['DocSpeakerAliceVoice', 'CardVoice', 'DocVoice', 'GlobalVoice']
  });
  assert.equal(rDocSpeaker.effectiveVoiceName, 'DocSpeakerAliceVoice');
  assert.equal(rDocSpeaker.effectiveSource, 'document-speaker');

  // 4. When DocSpeakerAliceVoice is also unavailable -> falls back to CardVoice before DocVoice/GlobalVoice!
  const rCard = resolveTextStructuredBrowserVoiceResolution({
    documentTree: docWithSpeakerProfileV2,
    block,
    segment: seg,
    channel: 'text',
    globalVoiceName: 'GlobalVoice',
    availableBrowserVoices: ['CardVoice', 'DocVoice', 'GlobalVoice']
  });
  assert.equal(rCard.effectiveVoiceName, 'CardVoice');
  assert.equal(rCard.effectiveSource, 'card');

  // 5. Full mode suppresses segment override while preserving Card Speaker / Doc Speaker / Card fallback!
  const rFull = resolveTextStructuredBrowserVoiceResolution({
    documentTree: docWithSpeakerProfileV2,
    block,
    segment: seg,
    channel: 'text',
    ignoreSegmentOverride: true,
    globalVoiceName: 'GlobalVoice',
    availableBrowserVoices: ['SegVoice', 'CardSpeakerAliceVoice', 'CardVoice', 'DocSpeakerAliceVoice', 'GlobalVoice']
  });
  assert.equal(rFull.requestedVoiceName, 'CardSpeakerAliceVoice');
  assert.equal(rFull.effectiveVoiceName, 'CardSpeakerAliceVoice');

  // 6. Legacy speakerVoiceMapV1 fallback compatibility when speakerVoiceProfileV2 is absent
  const legacyDoc = buildParagraphDocument({
    docMetadata: { speakerVoiceMapV1: { text: { alice: 'LegacyAliceVoice' }, meaning: {} } }
  });
  legacyDoc.blocks[0].segments[0].speaker = 'Alice';
  const rLegacy = resolveTextStructuredBrowserVoiceResolution({
    documentTree: legacyDoc,
    block: legacyDoc.blocks[0],
    segment: legacyDoc.blocks[0].segments[0],
    channel: 'text',
    globalVoiceName: 'GlobalVoice',
    availableBrowserVoices: ['LegacyAliceVoice', 'GlobalVoice']
  });
  assert.equal(rLegacy.effectiveVoiceName, 'LegacyAliceVoice');
  assert.equal(rLegacy.effectiveSource, 'document-speaker-legacy');

  // 7. Native browser default only when ZERO matching voices exist across hierarchy, defaultVoiceName, and pool
  const rNone = resolveTextStructuredBrowserVoiceResolution({
    documentTree: docWithSpeakerProfileV2,
    block,
    segment: seg,
    channel: 'text',
    globalVoiceName: 'GlobalVoice',
    defaultVoiceName: 'FallbackDefaultVoice',
    availableBrowserVoices: []
  });
  assert.equal(rNone.effectiveVoiceName, null);
  assert.equal(rNone.effectiveSource, 'system-default');
});

await runCheck('H4-C', 'G011-2', 'App.jsx resolveStructuredTextChannelVoiceState delegates to resolveTextStructuredBrowserVoiceResolution', () => {
  const appSource = readRepoText('src/App.jsx');
  const start = appSource.indexOf('const resolveStructuredTextChannelVoiceState =');
  const end = appSource.indexOf('const resolveStructuredTextBlockChannelPlaybackPlan =', start);
  const fnBody = appSource.slice(start, end);
  assert.match(fnBody, /resolveTextStructuredBrowserVoiceResolution/);
  assert.match(fnBody, /availableBrowserVoices/);
});

// ============================================================================
// H4-D (P10-G012): Scoped Playback Source Status Lifecycle
// ============================================================================
await runCheck('H4-D', 'G012-1', 'resolveScopedStructuredTextPlaybackSourceStatus rejects stale document, mode, editorModel, and superseded sessionId', () => {
  const sampleStatus = {
    documentId: 'DOC_A',
    sessionId: 7,
    source: 'local',
    voiceId: 'en-US-JennyNeural',
    effectiveSourceLabel: 'Local MP3 (Card)'
  };
  assert.deepEqual(
    resolveScopedStructuredTextPlaybackSourceStatus({ status: sampleStatus, mode: 'text', activeEditorModel: 'structured-v1', activeDocumentId: 'DOC_A', activeSessionId: 7 }),
    sampleStatus
  );
  assert.equal(
    resolveScopedStructuredTextPlaybackSourceStatus({ status: sampleStatus, mode: 'table', activeEditorModel: 'structured-v1', activeDocumentId: 'DOC_A', activeSessionId: 7 }),
    null
  );
  assert.equal(
    resolveScopedStructuredTextPlaybackSourceStatus({ status: sampleStatus, mode: 'text', activeEditorModel: 'legacy-v1', activeDocumentId: 'DOC_A', activeSessionId: 7 }),
    null
  );
  assert.equal(
    resolveScopedStructuredTextPlaybackSourceStatus({ status: sampleStatus, mode: 'text', activeEditorModel: 'structured-v1', activeDocumentId: 'DOC_B', activeSessionId: 7 }),
    null
  );
  assert.equal(
    resolveScopedStructuredTextPlaybackSourceStatus({ status: sampleStatus, mode: 'text', activeEditorModel: 'structured-v1', activeDocumentId: 'DOC_A', activeSessionId: 8 }),
    null
  );
});

await runCheck('H4-D', 'G012-2', 'App.jsx clears playbackSourceStatus on Stop, Doc switch, Mode switch, Restart, and stamps documentId/sessionId + stale guard', () => {
  const appSource = readRepoText('src/App.jsx');
  assert.match(appSource, /useEffect\(\(\)\s*=>\s*\{\s*setStructuredTextPlaybackSourceStatus\(null\);\s*\},\s*\[activeTextDocumentTree\?\.id,\s*mode,\s*activeTextEditorModel\]\)/);
  assert.match(appSource, /const forceStopAll[\s\S]{0,600}setStructuredTextPlaybackSourceStatus\(null\)/);
  assert.match(appSource, /const handleTextLibrarySelectDocument[\s\S]{0,600}setStructuredTextPlaybackSourceStatus\(null\)/);
  assert.match(appSource, /const startStructuredTextPlayback[\s\S]{0,700}setStructuredTextPlaybackSourceStatus\(null\)/);
  assert.match(appSource, /const speakStructuredTextBrowserTts[\s\S]{0,700}playbackSessionRef\.current\s*!==\s*playbackSessionId/);
  assert.match(appSource, /const scopedStructuredTextPlaybackSourceStatus = resolveScopedStructuredTextPlaybackSourceStatus/);
});

const failed = results.filter(r => !r.ok);
console.log(`\n=== H4 REMEDIATION GATE SUMMARY: ${results.length - failed.length}/${results.length} PASS ===`);
if (failed.length) {
  process.exitCode = 1;
}
