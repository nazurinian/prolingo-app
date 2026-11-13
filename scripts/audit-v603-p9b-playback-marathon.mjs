import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = createRequire(import.meta.url);
const esbuild = load('esbuild');

const mockReact = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : children }
  }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  memo: fn => fn
};
const fakeIcons = new Proxy({}, {
  get: (_, key) => (typeof key === 'string' ? function Icon() { return null; } : null)
});

const createModuleLoader = () => {
  const cache = new Map();
  const loadModule = absPath => {
    const resolvedAbs = path.resolve(absPath);
    if (cache.has(resolvedAbs)) return cache.get(resolvedAbs).exports;
    const source = fs.readFileSync(resolvedAbs, 'utf8');
    const mod = { exports: {} };
    cache.set(resolvedAbs, mod);
    const req = specifier => {
      if (specifier === 'react') return { ...mockReact, default: mockReact, __esModule: true };
      if (specifier === 'lucide-react') return fakeIcons;
      if (specifier === 'react-dom') return { createPortal: children => children };
      if (!specifier.startsWith('.')) throw new Error(`Unexpected external dependency: ${specifier}`);
      const resolved = path.resolve(path.dirname(resolvedAbs), specifier);
      for (const candidate of [resolved, `${resolved}.jsx`, `${resolved}.js`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return loadModule(candidate);
      }
      throw new Error(`Missing module ${specifier} from ${resolvedAbs}`);
    };
    const transformed = esbuild.transformSync(source, {
      loader: resolvedAbs.endsWith('.jsx') ? 'jsx' : 'js',
      format: 'cjs',
      target: 'es2022',
      jsx: 'transform'
    }).code;
    new Function('require', 'module', 'exports', transformed)(req, mod, mod.exports);
    return mod.exports;
  };
  return loadModule;
};

const loadMod = relPath => createModuleLoader()(path.join(root, relPath));

const {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackList,
  resolveStructuredTextPlaybackOrder,
  resolveStructuredTextNavigationTarget
} = await import('../src/domain/text/textStructuredPlaybackDomain.js');
const {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  normalizeTextStructuredPreferences,
  resolveTextStructuredManualPlaybackProfile
} = await import('../src/domain/text/textStructuredPlaybackPreferenceDomain.js');
const {
  TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY,
  buildTextStructuredVoiceOverrideMetadata,
  resolveTextStructuredBrowserVoiceResolution,
  resolveTextStructuredEffectiveVoiceProfile
} = await import('../src/domain/text/textStructuredVoiceAssignmentDomain.js');
const {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} = await import('../src/domain/text/textStructuredSplitFullDomain.js');
const {
  buildTextStructuredAudioPlaybackOrderMetadata,
  resolveTextStructuredEffectivePlaybackOrder,
  resolveTextStructuredEffectiveTtsOnly
} = await import('../src/domain/text/textStructuredAudioPlaybackOrderDomain.js');
const {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES
} = await import('../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js');
const { resolveTextStructuredRuntimeAudio } = await import('../src/domain/text/textStructuredAudioRuntimeDomain.js');
const { buildTextStructuredAudioContentFingerprint } = await import('../src/domain/text/textStructuredAudioIdentityDomain.js');
const { TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY } = await import('../src/domain/text/textStructuredSpeakerVoiceProfileDomain.js');
const { buildTextStructuredAudioSyncProfileMetadata } = await import('../src/domain/text/textStructuredAudioSyncProfileDomain.js');
const { executeStructuredTextPlaybackSessionService } = await import('../src/services/playback/textStructuredPlaybackSessionService.js');
const { executeStructuredTextRuntimeAudioPlaybackService } = await import('../src/services/playback/textStructuredAudioRuntimeService.js');
const {
  executePausePlayback,
  executeResumePlayback,
  executeSafePlayTransition,
  executeSettlePlaybackPromise,
  executeWaitWhilePaused
} = await import('../src/services/playback/playbackRuntimeControlService.js');
const { executeBrowserTtsPlaybackService } = await import('../src/services/audio/audioPlaybackSideEffectService.js');

const { executeForceStopPlaybackService } = loadMod('src/services/playback/playbackInteractionService.js');
const { executeMediaSessionLifecycleService } = loadMod('src/services/playback/mediaSessionLifecycleService.js');
const { executeModeSwitch } = loadMod('src/services/navigation/viewNavigationService.js');
const BottomPlayerBar = loadMod('src/components/layout/BottomPlayerBar.jsx').default;

// Isolated in-memory browser shims (never touches browser profile or IndexedDB).
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaSession: { playbackState: 'none', metadata: null, setPositionState: () => {}, setActionHandler: () => {} } },
    configurable: true
  });
} else if (!globalThis.navigator.mediaSession) {
  globalThis.navigator.mediaSession = { playbackState: 'none', metadata: null, setPositionState: () => {}, setActionHandler: () => {} };
}

if (!globalThis.MediaMetadata) {
  globalThis.MediaMetadata = class MediaMetadata {
    constructor(init = {}) { Object.assign(this, init); }
  };
}

const readRepoText = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const collectNodes = (node, acc = []) => {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    node.forEach(item => collectNodes(item, acc));
    return acc;
  }
  if ('type' in node) acc.push(node);
  if (node.props?.children !== undefined) collectNodes(node.props.children, acc);
  return acc;
};

const results = [];
const runCheck = async (scenario, kind, name, fn) => {
  try {
    await fn();
    results.push({ scenario, kind, name, status: 'PASS', error: null });
    console.log(`PASS [${scenario}][${kind}] ${name}`);
  } catch (error) {
    results.push({ scenario, kind, name, status: 'FAIL', error: error?.message || String(error) });
    console.log(`FAIL [${scenario}][${kind}] ${name}\n   -> ${error?.message || String(error)}`);
  }
};

const makeDocTree = () => {
  const segs1 = [
    { id: 'SEGMENT_000001', order: 1, text: 'Card one sentence one.', meaning: 'Kartu satu kalimat satu.', joinAfter: 'space', metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'Seg1OverrideVoice' }) },
    { id: 'SEGMENT_000002', order: 2, text: 'Card one sentence two.', meaning: 'Kartu satu kalimat dua.', joinAfter: 'space', metadata: {} },
    { id: 'SEGMENT_000003', order: 3, text: 'Card one sentence three.', meaning: 'Kartu satu kalimat tiga.', joinAfter: 'space', metadata: {} }
  ];
  const segs2 = [
    { id: 'SEGMENT_000004', order: 1, text: 'Card two line one.', meaning: 'Kartu dua baris satu.', speaker: 'Alice', joinAfter: 'space', metadata: {} },
    { id: 'SEGMENT_000005', order: 2, text: 'Card two line two.', meaning: 'Kartu dua baris dua.', speaker: 'Bob', joinAfter: 'space', metadata: {} }
  ];
  const segs3 = [
    { id: 'SEGMENT_000006', order: 1, text: 'Card three line one.', meaning: 'Kartu tiga baris satu.', joinAfter: 'space', metadata: {} }
  ];
  return {
    id: 'DOC_P9B_001',
    title: 'P9-B Marathon Document',
    editorModel: 'structured-v1',
    documentType: 'mixed',
    textLanguage: 'en-GB',
    meaningLanguage: 'id-ID',
    metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'DocNarratorVoice' }),
    blocks: [
      { id: 'TEXT_000001', blockType: 'paragraph', order: 1, title: 'Card 1', metadata: {}, segments: segs1 },
      { id: 'TEXT_000002', blockType: 'conversation', order: 2, title: 'Card 2', metadata: {}, segments: segs2 },
      { id: 'TEXT_000003', blockType: 'paragraph', order: 3, title: 'Card 3', metadata: {}, segments: segs3 }
    ]
  };
};

const createRuntimeHarness = () => {
  const playbackSessionRef = { current: 1 };
  const playbackContextRef = { current: null };
  const pauseStateRef = { current: false };
  const stopSignalRef = { current: false };
  const currentAudioObjRef = { current: null };
  const currentUtteranceRef = { current: null };
  const ttsReplayRef = { current: null };
  const playbackResolveRef = { current: null };
  const silentAudioRef = { current: { paused: true, currentTime: 0, play: () => Promise.resolve(), pause: () => {} } };
  const logs = [];
  const state = { isPlaying: false, isPaused: false, playingContext: null, playingIndex: null, currentIndex: null, speakingPart: null, independentPlayingId: null };

  const synth = {
    paused: false,
    speaking: false,
    cancel: () => {},
    pause: () => { synth.paused = true; },
    resume: () => { synth.paused = false; },
    speak: () => {}
  };

  const settlePlaybackPromise = () => executeSettlePlaybackPromise({ playbackResolveRef });
  const waitWhilePaused = () => executeWaitWhilePaused({ pauseStateRef, stopSignalRef });
  const forceStopAll = () => executeForceStopPlaybackService({
    playbackSessionRef, stopSignalRef, pauseStateRef, currentAudioObjRef, synth,
    settlePlaybackPromise, currentUtteranceRef, silentAudioRef,
    setIsPlaying: v => { state.isPlaying = v; },
    setIsPaused: v => { state.isPaused = v; },
    setSpeakingPart: v => { state.speakingPart = v; },
    setIndependentPlayingId: v => { state.independentPlayingId = v; },
    playbackContextRef
  });
  const safePlayTransition = cb => executeSafePlayTransition({
    forceStopAll, playbackSessionRef, stopSignalRef, pauseStateRef, actionCallback: cb
  });

  return {
    playbackSessionRef, playbackContextRef, pauseStateRef, stopSignalRef,
    currentAudioObjRef, currentUtteranceRef, ttsReplayRef, playbackResolveRef,
    silentAudioRef, logs, state, synth,
    settlePlaybackPromise, waitWhilePaused, forceStopAll, safePlayTransition,
    addLog: (type, message) => logs.push({ type, message }),
    setIsPlaying: v => { state.isPlaying = v; },
    setIsPaused: v => { state.isPaused = v; },
    setPlayingContext: v => { state.playingContext = v; },
    setPlayingIndex: v => { state.playingIndex = v; },
    setCurrentIndex: v => { state.currentIndex = v; },
    setSpeakingPart: v => { state.speakingPart = v; }
  };
};

const flushAsync = async (cycles = 8) => {
  for (let i = 0; i < cycles; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

// ============================================================================
// SCENARIO 1: Split vs Full representation
// ============================================================================
await runCheck('S1', 'CONTRACT', 'Split plays segment-by-segment with highlight index and allows segment override', async () => {
  const doc = makeDocTree();
  const h = createRuntimeHarness();
  const played = [];
  const fullCalls = [];
  executeStructuredTextPlaybackSessionService({
    documentTree: doc,
    blockId: 'TEXT_000001',
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    ...h,
    playStructuredChannel: async (content, item, channel, options = {}) => {
      played.push({ id: item.id, channel, playingIndexDuringStep: h.state.playingIndex, ignoreSeg: Boolean(options.ignoreSegmentOverride) });
    },
    playStructuredFullStep: async step => fullCalls.push(step)
  });
  await flushAsync(10);
  assert.deepEqual(played.map(p => p.id), ['SEGMENT_000001', 'SEGMENT_000002', 'SEGMENT_000003']);
  assert.deepEqual(played.map(p => p.playingIndexDuringStep), ['SEGMENT_000001', 'SEGMENT_000002', 'SEGMENT_000003']);
  assert.equal(played[0].ignoreSeg, false);
  assert.equal(fullCalls.length, 0);
});

await runCheck('S1', 'CONTRACT', 'Full plays single FULL_LOCAL step when ready Full exists, sets playingIndex=null, sets currentIndex to card first segment', async () => {
  const doc = makeDocTree();
  const block1 = doc.blocks[0];
  const fullArtifact = buildTextStructuredFullArtifactRecord({
    block: block1, channel: 'text', language: 'en-GB', voiceId: 'en-GB-SoniaNeural', engine: 'edge', rate: 0, pitch: 0,
    filename: 'c1-full.mp3', mimeType: 'audio/mpeg'
  });
  block1.metadata = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArtifact });
  const runtimeFullAudio = { [fullArtifact.fullArtifactFingerprint]: { url: 'blob:full-1', stagingBacked: true, filename: 'c1-full.mp3' } };

  const h = createRuntimeHarness();
  const fullSteps = [];
  executeStructuredTextPlaybackSessionService({
    documentTree: doc,
    blockId: 'TEXT_000001',
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    ...h,
    resolveBlockChannelPlaybackPlan: ({ block, channel, allowFullArtifact }) => buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree: doc, block, channel, representationMode: 'full',
      runtimeFullAudio, fallbackVoiceId: 'en-GB-SoniaNeural', fallbackEngine: 'edge', fallbackRate: 0, fallbackPitch: 0,
      language: 'en-GB', allowFullArtifact
    }),
    playStructuredChannel: async () => { throw new Error('Should not run Split channel when FULL_LOCAL is ready'); },
    playStructuredFullStep: async (step) => {
      fullSteps.push({ type: step.type, playingIndexDuringStep: h.state.playingIndex, currentIndexDuringStep: h.state.currentIndex });
    }
  });
  await flushAsync(10);
  assert.equal(fullSteps.length, 1);
  assert.equal(fullSteps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);
  assert.equal(fullSteps[0].playingIndexDuringStep, null);
  assert.equal(fullSteps[0].currentIndexDuringStep, 'SEGMENT_000001');
});

await runCheck('S1', 'DEFECT', '[DEFECT S1-A] FROM_HERE starting at Seg 2 in Full mode must NOT replay Seg 1', async () => {
  const doc = makeDocTree();
  const block1 = doc.blocks[0];
  const fullArtifact = buildTextStructuredFullArtifactRecord({
    block: block1, channel: 'text', language: 'en-GB', voiceId: 'en-GB-SoniaNeural', engine: 'edge', rate: 0, pitch: 0,
    filename: 'c1-full.mp3', mimeType: 'audio/mpeg'
  });
  block1.metadata = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArtifact });
  const v2 = {
    id: 'TXTAUDIO_000002', segmentId: 'SEGMENT_000002', channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural',
    createdAt: 1, updatedAt: 1,
    metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: block1.segments[1].text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } }
  };
  const h = createRuntimeHarness();
  const playedSegments = [];
  executeStructuredTextPlaybackSessionService({
    documentTree: doc,
    startSegmentId: 'SEGMENT_000002',
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    ...h,
    resolveBlockChannelPlaybackPlan: ({ block, channel, allowFullArtifact }) => buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree: doc, block, channel, representationMode: 'full',
      audioVariants: [v2], runtimeAudioUrls: { TXTAUDIO_000002: { url: 'blob:seg2' } },
      runtimeFullAudio: { [fullArtifact.fullArtifactFingerprint]: { url: 'blob:full-1', stagingBacked: true } },
      fallbackVoiceId: 'en-GB-SoniaNeural', fallbackEngine: 'edge', fallbackRate: 0, fallbackPitch: 0,
      language: 'en-GB', allowFullArtifact
    }),
    playStructuredChannel: async (content, item, channel, options = {}) => {
      playedSegments.push(options?.step?.segmentId || item?.id);
    },
    playStructuredFullStep: async (step) => {
      playedSegments.push(`FULL:${step.content}`);
    }
  });
  await flushAsync(10);
  assert.equal(playedSegments.includes('SEGMENT_000001'), false, `Seg 1 was replayed unexpectedly in FROM_HERE: ${JSON.stringify(playedSegments)}`);
});

await runCheck('S1', 'DEFECT', '[DEFECT S1-B] MediaSession updates metadata while Structured Text Full mode is actively playing (playingIndex=null)', () => {
  const doc = makeDocTree();
  const list = resolveStructuredTextPlaybackList(doc);
  globalThis.navigator.mediaSession.metadata = null;
  executeMediaSessionLifecycleService({
    currentPlayerList: list,
    playbackContextRef: { current: { context: TEXT_STRUCTURED_PLAYBACK_CONTEXT, orderedList: list, cursorSegmentId: 'SEGMENT_000001', playbackRepresentationMode: 'full' } },
    playingIndex: null,
    speakingPart: 'text',
    currentDeckName: 'Deck',
    isPlaying: true,
    isPaused: false,
    currentAudioObjRef: { current: null },
    mediaIntervalRef: { current: null },
    resumePlaybackRef: { current: () => {} },
    playRef: { current: () => {} },
    pausePlaybackRef: { current: () => {} },
    navRef: { current: () => {} },
    stopRef: { current: () => {} },
    pauseStateRef: { current: false }
  });
  assert.ok(globalThis.navigator.mediaSession.metadata, 'MediaSession metadata stayed null during active Full mode playback because playingIndex is null');
});

// ============================================================================
// SCENARIO 2: Source modes & ordered local playback priority
// ============================================================================
await runCheck('S2', 'CONTRACT', 'Playback order precedence: card-order > global-order > document-order-legacy > compatibility-fallback, and strict fail-closed rejection', () => {
  const sonia = 'en-GB-SoniaNeural';
  const libby = 'en-GB-LibbyNeural';
  const ryan = 'en-GB-RyanNeural';
  const doc = makeDocTree();
  doc.metadata = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: doc.metadata, channel: 'text', profiles: [{ voiceId: ryan, engine: 'edge' }] });
  const globalProfiles = [{ voiceId: libby, engine: 'edge' }];
  const block = { ...doc.blocks[0], metadata: buildTextStructuredAudioPlaybackOrderMetadata({ metadata: {}, channel: 'text', profiles: [{ voiceId: sonia, engine: 'edge' }] }) };

  assert.equal(resolveTextStructuredEffectivePlaybackOrder({ documentTree: doc, block, channel: 'text', globalProfiles }).source, 'card-order');
  assert.equal(resolveTextStructuredEffectivePlaybackOrder({ documentTree: doc, block: doc.blocks[1], channel: 'text', globalProfiles }).source, 'global-order');
  assert.equal(resolveTextStructuredEffectivePlaybackOrder({ documentTree: doc, block: doc.blocks[1], channel: 'text', globalProfiles: [] }).source, 'document-order-legacy');
  assert.equal(resolveTextStructuredEffectivePlaybackOrder({ documentTree: { ...doc, metadata: {} }, block: doc.blocks[1], channel: 'text', globalProfiles: [], fallbackProfiles: [{ voiceId: sonia }] }).source, 'compatibility-fallback');

  const ryanVariant = {
    id: 'TXTAUDIO_000010', segmentId: 'SEGMENT_000002', channel: 'text', source: 'generated', engine: 'edge', voiceId: ryan,
    createdAt: 1, updatedAt: 1,
    metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: block.segments[1].text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: ryan, rate: 0, pitch: 0 } }
  };
  const strictHit = resolveTextStructuredRuntimeAudio({
    audioVariants: [ryanVariant],
    runtimeAudioUrls: { TXTAUDIO_000010: { url: 'blob:ryan' } },
    segmentId: 'SEGMENT_000002', channel: 'text',
    preferredGeneratedProfiles: [{ voiceId: sonia, engine: 'edge' }],
    strictProfileOrder: true, allowAnyGenerated: false, content: block.segments[1].text
  });
  assert.equal(strictHit, null);
});

await runCheck('S2', 'CONTRACT', 'Global TTS Only overrides Card/Doc local preference and forces FULL_TTS / SPLIT_TTS', () => {
  const doc = makeDocTree();
  doc.metadata = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: doc.metadata, channel: 'text', ttsOnly: false });
  const block = { ...doc.blocks[0], metadata: buildTextStructuredAudioPlaybackOrderMetadata({ metadata: {}, channel: 'text', ttsOnly: false }) };
  const effective = resolveTextStructuredEffectiveTtsOnly({ documentTree: doc, block, globalTtsOnly: true });
  assert.equal(effective.enabled, true);
  assert.equal(effective.source, 'global');

  const fullPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc, block, channel: 'text', representationMode: 'full', globalTtsOnly: true
  });
  assert.equal(fullPlan.route, 'full-tts-only');
  assert.equal(fullPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
});

await runCheck('S2', 'DEFECT', '[DEFECT S2-A] Full block playback planner in App.jsx (resolveStructuredTextBlockChannelPlaybackPlan) ignores CUSTOM_LOCAL pin mode', () => {
  const appSource = readRepoText('src/App.jsx');
  const start = appSource.indexOf('const resolveStructuredTextBlockChannelPlaybackPlan =');
  const end = appSource.indexOf('const playStructuredTextFullStep =', start);
  const blockFn = appSource.slice(start, end);
  assert.match(blockFn, /CUSTOM_LOCAL|resolveTextStructuredCustomLocalAudioVoice/, 'resolveStructuredTextBlockChannelPlaybackPlan completely omits CUSTOM_LOCAL / localAudioPlaybackProfileV1 handling');
});

// ============================================================================
// SCENARIO 3: Doc / Card / Speaker / Segment Browser TTS inheritance + Sync
// ============================================================================
await runCheck('S3', 'CONTRACT', 'Browser TTS inheritance in Split respects Segment > Card Speaker > Doc Speaker > Card > Document > Global', () => {
  const doc = {
    id: 'DOC_INH', editorModel: 'structured-v1', documentType: 'conversation',
    metadata: {
      [TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]: { version: 1, channels: { text: 'DocVoice' } },
      [TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY]: { text: { alice: 'DocAliceVoice' } }
    }
  };
  const block = {
    id: 'BLK_1', blockType: 'conversation',
    metadata: {
      [TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]: { version: 1, channels: { text: 'CardVoice' }, speakers: { text: { alice: 'CardAliceVoice' } } }
    }
  };
  const segAliceWithOverride = {
    id: 'SEG_1', speaker: 'Alice',
    metadata: { [TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]: { version: 1, channels: { text: 'SegVoice' } } }
  };
  const segAliceInherit = { id: 'SEG_2', speaker: 'Alice', metadata: {} };
  const segBobInherit = { id: 'SEG_3', speaker: 'Bob', metadata: {} };

  assert.equal(resolveTextStructuredEffectiveVoiceProfile({ documentTree: doc, block, segment: segAliceWithOverride, channel: 'text', defaultVoiceName: 'GlobalVoice' }).source, 'segment');
  assert.equal(resolveTextStructuredEffectiveVoiceProfile({ documentTree: doc, block, segment: segAliceInherit, channel: 'text', defaultVoiceName: 'GlobalVoice' }).voiceName, 'CardAliceVoice');
  assert.equal(resolveTextStructuredEffectiveVoiceProfile({ documentTree: doc, block: { id: 'BLK_1', blockType: 'conversation', metadata: {} }, segment: segAliceInherit, channel: 'text', defaultVoiceName: 'GlobalVoice' }).voiceName, 'DocAliceVoice');
  assert.equal(resolveTextStructuredEffectiveVoiceProfile({ documentTree: doc, block, segment: segBobInherit, channel: 'text', defaultVoiceName: 'GlobalVoice' }).voiceName, 'CardVoice');
  assert.equal(resolveTextStructuredEffectiveVoiceProfile({ documentTree: doc, block: { id: 'BLK_1', blockType: 'paragraph', metadata: {} }, segment: segBobInherit, channel: 'text', defaultVoiceName: 'GlobalVoice' }).voiceName, 'DocVoice');
  assert.equal(resolveTextStructuredEffectiveVoiceProfile({ documentTree: { id: 'D', metadata: {} }, block: { id: 'B', metadata: {} }, segment: segBobInherit, channel: 'text', defaultVoiceName: 'GlobalVoice' }).voiceName, 'GlobalVoice');

  let meta = buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', speaker: 'Bob', voiceName: 'BobSavedVoice' });
  meta = buildTextStructuredAudioSyncProfileMetadata({ metadata: meta, kind: 'voice', channel: 'text', enabled: true });
  meta = buildTextStructuredAudioSyncProfileMetadata({ metadata: meta, kind: 'voice', channel: 'text', enabled: false });
  assert.equal(meta[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY].speakers.text.bob, 'BobSavedVoice');
});

// ============================================================================
// SCENARIO 4: Full mode ignores Segment Browser TTS overrides + fallback chain
// ============================================================================
await runCheck('S4', 'CONTRACT', 'Full representation ignores Segment Browser TTS overrides in domain resolver and split-fallback steps', () => {
  const doc = makeDocTree();
  const block1 = doc.blocks[0];
  const profile = resolveTextStructuredEffectiveVoiceProfile({
    documentTree: doc, block: block1, segment: block1.segments[0], channel: 'text',
    defaultVoiceName: 'GlobalVoice', representationMode: 'full'
  });
  assert.equal(profile.source, 'document');
  assert.equal(profile.voiceName, 'DocNarratorVoice');
  assert.equal(profile.ignoredSegmentOverride, true);

  const v2 = {
    id: 'TXTAUDIO_000002', segmentId: 'SEGMENT_000002', channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural',
    createdAt: 1, updatedAt: 1,
    metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: block1.segments[1].text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } }
  };
  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc, block: block1, channel: 'text', representationMode: 'full',
    audioVariants: [v2], runtimeAudioUrls: { TXTAUDIO_000002: { url: 'blob:v2' } },
    fallbackVoiceId: 'en-GB-SoniaNeural', fallbackEngine: 'edge', fallbackRate: 0, fallbackPitch: 0
  });
  assert.equal(plan.route, 'split-fallback');
  assert.equal(plan.steps.every(s => s.ignoreSegmentVoiceOverride === true && s.highlight === false), true);
});

await runCheck('S4', 'DEFECT', '[DEFECT S4-A] resolveTextStructuredBrowserVoiceResolution skips card-speaker & document-speaker on unavailable segment fallback', () => {
  const doc = {
    id: 'DOC_FB', editorModel: 'structured-v1', documentType: 'conversation',
    metadata: {
      [TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]: { version: 1, channels: { text: 'DocVoice' } },
      [TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY]: { text: { alice: 'SpeakerAliceVoice' } }
    }
  };
  const block = {
    id: 'B1', blockType: 'conversation',
    metadata: {
      [TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]: { version: 1, speakers: { text: { alice: 'CardAliceVoice' } } }
    }
  };
  const seg = { id: 'S1', speaker: 'Alice', metadata: { [TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]: { version: 1, channels: { text: 'UnavailableVoice' } } } };
  const res = resolveTextStructuredBrowserVoiceResolution({
    documentTree: doc, block, segment: seg, channel: 'text',
    globalVoiceName: 'GlobalVoice',
    availableBrowserVoices: ['CardAliceVoice', 'SpeakerAliceVoice', 'DocVoice', 'GlobalVoice']
  });
  assert.equal(res.effectiveVoiceName, 'CardAliceVoice', `Expected fallback to CardAliceVoice / SpeakerAliceVoice before DocVoice, got ${res.effectiveVoiceName} (${res.effectiveSource})`);
});

// ============================================================================
// SCENARIO 5: Full MP3 fallback chain
// ============================================================================
await runCheck('S5', 'CONTRACT', 'Full MP3 fallback chooses full-local -> split-fallback (partial) -> full-tts-fallback (0 local)', () => {
  const doc = makeDocTree();
  const block1 = { ...doc.blocks[0], metadata: {} };
  const fullTtsPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc, block: block1, channel: 'text', representationMode: 'full',
    audioVariants: [], runtimeAudioUrls: {}, runtimeFullAudio: {},
    fallbackVoiceId: 'en-GB-SoniaNeural', fallbackEngine: 'edge', fallbackRate: 0, fallbackPitch: 0
  });
  assert.equal(fullTtsPlan.route, 'full-tts-fallback');
  assert.equal(fullTtsPlan.steps.length, 1);
  assert.equal(fullTtsPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(fullTtsPlan.steps[0].ignoreSegmentVoiceOverride, true);
});

// ============================================================================
// SCENARIO 6: Next / Prev / Stop / Pause / Resume / Cursor / Repeat
// ============================================================================
await runCheck('S6', 'CONTRACT', 'Navigation wraps by sentence in Split and by card in Full', () => {
  const list = resolveStructuredTextPlaybackList(makeDocTree());
  assert.equal(resolveStructuredTextNavigationTarget({ list, currentId: 'SEGMENT_000001', direction: 'next', representationMode: 'split' }).id, 'SEGMENT_000002');
  assert.equal(resolveStructuredTextNavigationTarget({ list, currentId: 'SEGMENT_000001', direction: 'prev', representationMode: 'split' }).id, 'SEGMENT_000006');
  assert.equal(resolveStructuredTextNavigationTarget({ list, currentId: 'SEGMENT_000002', direction: 'next', representationMode: 'full' }).id, 'SEGMENT_000004');
  assert.equal(resolveStructuredTextNavigationTarget({ list, currentId: 'SEGMENT_000002', direction: 'prev', representationMode: 'full' }).id, 'SEGMENT_000006');
});

await runCheck('S6', 'CONTRACT', 'Stop/Play transition race guard cancels superseded 120ms transitions cleanly', async () => {
  const h = createRuntimeHarness();
  let callbackRan = false;
  const p = h.safePlayTransition(async () => { callbackRan = true; });
  h.forceStopAll();
  const ok = await p;
  assert.equal(ok, false);
  assert.equal(callbackRan, false);
});

await runCheck('S6', 'CONTRACT', 'Manual target profile supports custom repeat clamping and documents omitted channel fallback quirk', () => {
  const normalized = normalizeTextStructuredPreferences({ playbackChannelMode: 'text-only' });
  assert.equal(normalized.manualSegmentPlaybackChannelMode, 'text-only');
  assert.equal(resolveTextStructuredManualPlaybackProfile({ playbackChannelMode: 'meaning-only' }, 'segment').playbackChannelMode, 'meaning-only');
  assert.equal(resolveTextStructuredManualPlaybackProfile({ manualSegmentRepeatMode: 'custom', manualSegmentRepeatCount: 99 }, 'segment').repeatCount, 20);
});

await runCheck('S6', 'DEFECT', '[DEFECT S6-A] repeatMode=loop with unavailable TTS voice / missing SpeechSynthesisUtterance causes unthrottled tight spin', async () => {
  const doc = makeDocTree();
  const h = createRuntimeHarness();
  let invocations = 0;
  let resolveSpin;
  const spinDone = new Promise(resolve => { resolveSpin = resolve; });
  executeStructuredTextPlaybackSessionService({
    documentTree: { ...doc, blocks: [doc.blocks[2]] },
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
    channelDelayMs: 0,
    segmentDelayMs: 0,
    ...h,
    playStructuredChannel: async () => {
      invocations += 1;
      if (invocations >= 100) {
        h.forceStopAll();
        resolveSpin();
      }
    }
  });
  await Promise.race([spinDone, flushAsync(12)]);
  h.forceStopAll();
  await flushAsync(2);
  assert.ok(invocations < 25, `Unthrottled tight loop detected: ${invocations} consecutive loop passes ran without any inter-pass yield/throttle when channel resolves immediately`);
});

await runCheck('S6', 'DEFECT', '[DEFECT S6-B] handlePlayerSmartNav inherits temporary Manual Segment/Card settings (e.g., Loop/Split) into Global Document session', () => {
  const appSource = readRepoText('src/App.jsx');
  const start = appSource.indexOf('const handlePlayerSmartNav =');
  const end = appSource.indexOf('const runTextLibraryUiCommand =', start);
  const navFn = appSource.slice(start, end);
  const guardsManualScope = /session\?\.scope\s*===\s*TEXT_STRUCTURED_PLAYBACK_SCOPES\.(DOCUMENT|FROM_HERE)/.test(navFn);
  assert.equal(guardsManualScope, true, 'handlePlayerSmartNav unconditionally inherits session.repeatMode / playbackRepresentationMode / playbackChannelMode even when active session was a manual Segment/Card play');
});

// ============================================================================
// SCENARIO 7: Sequential vs Shuffle display & audio order
// ============================================================================
await runCheck('S7', 'CONTRACT', 'Shuffle reorders cards only, preserves sentence sequence within every card, anchors current card first', () => {
  const doc = makeDocTree();
  const list = resolveStructuredTextPlaybackList(doc);
  let seed = 0.75;
  const random = () => { seed = (seed + 0.37) % 1; return seed; };
  const shuffled = resolveStructuredTextPlaybackOrder({ list, orderMode: 'shuffle', anchorId: 'SEGMENT_000004', random });
  assert.equal(shuffled[0].id, 'SEGMENT_000004');
  assert.equal(shuffled[1].id, 'SEGMENT_000005');
  const card1Items = shuffled.filter(item => item.blockId === 'TEXT_000001').map(i => i.id);
  assert.deepEqual(card1Items, ['SEGMENT_000001', 'SEGMENT_000002', 'SEGMENT_000003']);
});

await runCheck('S7', 'DEFECT', '[DEFECT S7-A] Stale Shuffle orderedListOverride overrides Sequential playbackOrderMode in App.jsx & playback session service', async () => {
  const doc = makeDocTree();
  const list = resolveStructuredTextPlaybackList(doc);
  const reversedByCard = [...list.filter(i => i.blockId === 'TEXT_000003'), ...list.filter(i => i.blockId === 'TEXT_000002'), ...list.filter(i => i.blockId === 'TEXT_000001')];
  const h = createRuntimeHarness();
  const playedIds = [];
  executeStructuredTextPlaybackSessionService({
    documentTree: doc,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    orderedListOverride: reversedByCard,
    ...h,
    playStructuredChannel: async (_content, item) => { playedIds.push(item.id); }
  });
  await flushAsync(10);
  assert.deepEqual(playedIds, list.map(i => i.id), `Sequential mode still used stale orderedListOverride order: ${JSON.stringify(playedIds)}`);
});

// ============================================================================
// SCENARIO 8: Mid-playback workspace switch, Table/Text switch, restart
// ============================================================================
await runCheck('S8', 'CONTRACT', 'Mode switch & mid-playback workspace stop abort active session and suppress completion cursor overwrite', async () => {
  const doc = makeDocTree();
  const h = createRuntimeHarness();
  let completedCalls = 0;
  let stepStarted;
  const gate = new Promise(r => { stepStarted = r; });

  executeStructuredTextPlaybackSessionService({
    documentTree: doc,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    ...h,
    onPlaybackCompleted: () => { completedCalls += 1; },
    playStructuredChannel: async () => {
      stepStarted();
      await new Promise(resolve => { h.playbackResolveRef.current = resolve; });
    }
  });
  await gate;
  let nextMode = 'text';
  let scrollRestored = null;
  executeModeSwitch({
    targetMode: 'table', mode: 'text', isSystemBusy: false,
    forceStopAll: h.forceStopAll, setPlayingIndex: h.setPlayingIndex, setPlayingContext: h.setPlayingContext,
    setIndependentPlayingId: v => { h.state.independentPlayingId = v; },
    viewScrollPosRef: { current: { master: 120, text: 0 } }, tableViewMode: 'master',
    getScrollPos: () => 45, currentIndex: 'SEGMENT_000001',
    setSavedIndices: () => {}, setScrollTop: v => { scrollRestored = v; },
    pendingScrollRestoration: { current: null }, isAutoScrolling: { current: false },
    setMode: m => { nextMode = m; }, savedIndices: { table: 'VOCAB_9', text: null },
    setCurrentIndex: h.setCurrentIndex, addLog: h.addLog
  });
  await flushAsync(4);
  assert.equal(nextMode, 'table');
  assert.equal(scrollRestored, 120);
  assert.equal(h.state.isPlaying, false);
  assert.equal(completedCalls, 0);
});

await runCheck('S8', 'DEFECT', '[DEFECT S8-A] structuredTextPlaybackSourceStatus omits documentId and is not cleared on stop or workspace switch', () => {
  const appSource = readRepoText('src/App.jsx');
  const calls = [...appSource.matchAll(/setStructuredTextPlaybackSourceStatus\(\{[\s\S]*?\}\)/g)];
  assert.ok(calls.length >= 4, 'Expected setStructuredTextPlaybackSourceStatus calls in App.jsx');
  const hasDocId = calls.every(m => m[0].includes('documentId'));
  const selectDocFn = appSource.slice(appSource.indexOf('const handleTextLibrarySelectDocument ='), appSource.indexOf('const handleTextLibrarySearchAction ='));
  assert.equal(hasDocId && selectDocFn.includes('setStructuredTextPlaybackSourceStatus(null)'), true, 'Source status badge omits documentId and survives document switches');
});

// ============================================================================
// SCENARIO 9: Missing audio, unavailable TTS, Pause/Resume replay, stale async
// ============================================================================
await runCheck('S9', 'CONTRACT', 'Missing audio URL, audio play error, mobile TTS suspend/resume replay settle deterministically', async () => {
  const h = createRuntimeHarness();
  const missingRes = await executeStructuredTextRuntimeAudioPlaybackService({
    url: null, currentAudioObjRef: h.currentAudioObjRef, playbackResolveRef: h.playbackResolveRef, stopSignalRef: h.stopSignalRef, addLog: h.addLog
  });
  assert.deepEqual(missingRes, { status: 'stopped' });

  const prevSpeech = globalThis.SpeechSynthesisUtterance;
  try {
    globalThis.SpeechSynthesisUtterance = class MockUtterance {
      constructor(text) { this.text = text; }
    };
    const spoken = [];
    const mobileSynth = {
      paused: false,
      speaking: true,
      cancel: () => {
        const last = spoken.at(-1);
        last?.onerror?.();
      },
      pause: () => {},
      resume: () => {},
      speak: u => { spoken.push(u); }
    };
    const ttsPromise = executeBrowserTtsPlaybackService({
      textToRead: 'Hello mobile', overrideVoice: { name: 'Amy' },
      selectedVoiceRef: { current: null }, stopSignalRef: h.stopSignalRef,
      pauseStateRef: h.pauseStateRef, synth: mobileSynth,
      currentUtteranceRef: h.currentUtteranceRef, ttsReplayRef: h.ttsReplayRef,
      playbackResolveRef: h.playbackResolveRef, rateRef: null, rate: 1, pitch: 1
    });
    await flushAsync(2);
    assert.equal(spoken.length, 1);
    executePausePlayback({
      isPlaying: true, isMobile: true, pauseStateRef: h.pauseStateRef,
      currentAudioObjRef: h.currentAudioObjRef, synth: mobileSynth,
      silentAudioRef: h.silentAudioRef, setIsPaused: h.setIsPaused, addLog: h.addLog,
      ttsReplayRef: h.ttsReplayRef
    });
    assert.equal(h.state.isPaused, true);
    executeResumePlayback({
      isPlaying: true, pauseStateRef: h.pauseStateRef,
      currentAudioObjRef: h.currentAudioObjRef, synth: mobileSynth,
      silentAudioRef: h.silentAudioRef, setIsPaused: h.setIsPaused, addLog: h.addLog,
      ttsReplayRef: h.ttsReplayRef
    });
    await flushAsync(3);
    assert.equal(spoken.length, 2, 'Mobile pause/resume must restart suspended utterance cleanly');
    spoken.at(-1).onend();
    await ttsPromise;
  } finally {
    if (prevSpeech === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = prevSpeech;
  }
});

await runCheck('S9', 'DEFECT', '[DEFECT S9-A] playStructuredTextChannel/FullStep skip Browser TTS completely when voiceState.ttsVoice is null instead of native system default', () => {
  const appSource = readRepoText('src/App.jsx');
  const fnSlice = appSource.slice(appSource.indexOf('const playStructuredTextFullStep ='), appSource.indexOf('const startStructuredTextPlayback ='));
  assert.equal(/if\s*\(!targetVoice\)\s*\{[\s\S]*?return;/.test(fnSlice), false, 'App.jsx returns early skipping Browser TTS when !targetVoice, contradicting executeBrowserTtsPlaybackService native default policy');
});

// ============================================================================
// SCENARIO 10: Desktop vs Mobile playback parity
// ============================================================================
await runCheck('S10', 'CONTRACT', 'Desktop (MainAppShellView) and Mobile (MobileTools) both mount TextStructuredAudioControls & BottomPlayerBar Text controls', () => {
  const desktop = readRepoText('src/components/layout/MainAppShellView.jsx');
  const mobile = readRepoText('src/components/layout/MobileTools.jsx');
  assert.match(desktop, /<TextStructuredAudioControls\s*\{\.\.\.structuredTextAudioSidebarControls\}/);
  assert.match(mobile, /<TextStructuredAudioControls\s*\{\.\.\.structuredTextAudioSidebarControls\}/);
  assert.match(readRepoText('src/components/layout/BottomPlayerBar.jsx'), /onClick=\{onOpenTextPlayer\}/);
});

await runCheck('S10', 'DEFECT', '[DEFECT S10-A] BottomPlayerBar receives textTtsOnly / onTextTtsOnlyChange from MainAppShellView but neither renders nor invokes them', () => {
  let ttsToggleCalls = 0;
  const tree = BottomPlayerBar({
    isMobile: true,
    isPlaying: false,
    isPaused: false,
    speakingPart: null,
    activePlaybackList: [],
    displayPlayingIndex: null,
    handleSmartNav: () => {},
    handleGlobalPlay: () => {},
    forceStopAll: () => {},
    playbackMode: 'once',
    cyclePlaybackMode: () => {},
    setPlaybackMode: () => {},
    mode: 'text',
    structuredTextModeActive: true,
    textPlaybackRepresentationMode: 'split',
    textTtsOnly: true,
    textPlaybackOrder: 'sequential',
    textPlaybackChannelMode: 'text-only',
    onTextPlaybackRepresentationModeChange: () => {},
    onTextTtsOnlyChange: () => { ttsToggleCalls += 1; },
    onOpenTextPlayer: () => {}
  });
  const buttons = collectNodes(tree).filter(n => n.type === 'button');
  buttons.forEach(btn => btn.props?.onClick?.());
  assert.equal(ttsToggleCalls > 0, true, 'Clicking every rendered button on BottomPlayerBar never invoked onTextTtsOnlyChange');
});

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`\nP9-B MARATHON SUMMARY: ${passed} PASS, ${failed} FAIL (${results.length} total)`);
if (failed > 0) process.exitCode = 1;
