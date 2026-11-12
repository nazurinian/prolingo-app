import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  buildTextStructuredVoiceOverrideMetadata,
  formatTextStructuredBrowserVoiceLabel,
  getTextStructuredVoiceSourceDisplayLabel,
  resolveTextStructuredBrowserVoiceResolution,
  resolveTextStructuredEffectiveVoiceForItem,
  resolveTextStructuredEffectiveVoiceProfile,
  resolveTextStructuredFullCardVoiceProfile
} from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES,
  TEXT_STRUCTURED_TTS_FALLBACK_POLICIES
} from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import {
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  applyTextStructuredBulkVoiceSelectionChange,
  buildTextStructuredBulkGenerationPlan,
  TEXT_STRUCTURED_BULK_REPRESENTATIONS,
  TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES,
  validateTextStructuredBulkVoiceDraft
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredBatchWorkspaceSelection } from '../src/domain/text/textStructuredBatchDomain.js';
import { buildTextStructuredAudioCoverageMap } from '../src/domain/text/textStructuredAudioCoverageDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');
const load = createRequire(import.meta.url);
const esbuild = load('esbuild');

const transpile = (source, absPath) => esbuild.transformSync(source, {
  loader: absPath.endsWith('.jsx') ? 'jsx' : 'js',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform'
}).code;

let hookValues = [];
let hookSlot = 0;
const resetHooks = () => { hookValues = []; hookSlot = 0; };
const rerenderHooks = () => { hookSlot = 0; };
const mockReact = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : children }
  }),
  useState: initial => {
    const at = hookSlot++;
    if (!(at in hookValues)) hookValues[at] = typeof initial === 'function' ? initial() : initial;
    return [hookValues[at], value => { hookValues[at] = typeof value === 'function' ? value(hookValues[at]) : value; }];
  },
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  memo: fn => fn
};
const fakeIcons = new Proxy({}, { get: (_, key) => typeof key === 'string' ? function Icon() { return null; } : null });
const moduleCache = new Map();
const loadModule = absPath => {
  const resolvedAbs = path.resolve(absPath);
  if (moduleCache.has(resolvedAbs)) return moduleCache.get(resolvedAbs).exports;
  const source = fs.readFileSync(resolvedAbs, 'utf8');
  const outputText = transpile(source, resolvedAbs);
  const mod = { exports: {} };
  moduleCache.set(resolvedAbs, mod);
  const req = specifier => {
    if (specifier === 'react') return { ...mockReact, default: mockReact, __esModule: true };
    if (specifier === 'lucide-react') return fakeIcons;
    if (specifier === 'react-dom') return { createPortal: children => children };
    if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency: ${specifier}`);
    const resolved = path.resolve(path.dirname(resolvedAbs), specifier);
    for (const candidate of [resolved, `${resolved}.jsx`, `${resolved}.js`]) {
      if (fs.existsSync(candidate)) return loadModule(candidate);
    }
    throw new Error(`Missing module ${specifier} from ${resolvedAbs}`);
  };
  new Function('require', 'module', 'exports', outputText)(req, mod, mod.exports);
  return mod.exports;
};

const renderTree = (node, depth = 0) => {
  if (depth > 100) throw new Error('Excessive component nesting');
  if (Array.isArray(node)) return node.flatMap(child => renderTree(child, depth + 1));
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node !== 'object' || !('type' in node)) return [node];
  if (typeof node.type === 'function') return renderTree(node.type(node.props), depth + 1);
  const children = renderTree(node.props?.children, depth + 1);
  return [{ ...node, children }, ...children];
};

const collectText = nodes => nodes
  .filter(node => typeof node === 'string' || typeof node === 'number')
  .map(String)
  .join(' ');

let passed = 0;
const check = async (label, fn) => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed}: ${label}`);
};

const createSampleParagraphDoc = () => {
  let docMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'Workspace Narrator EN' });
  docMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: docMeta, channel: 'meaning', voiceName: 'Workspace Narrator ID' });
  const blk1Meta = buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'Card EN Voice' });
  let seg1Meta = buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'Segment 1 Override EN' });
  seg1Meta = buildTextStructuredVoiceOverrideMetadata({ metadata: seg1Meta, channel: 'meaning', voiceName: 'Segment 1 Override ID' });
  const seg3Meta = buildTextStructuredVoiceOverrideMetadata({ metadata: {}, channel: 'text', voiceName: 'Segment 3 Override EN' });

  return {
    id: 'DOC_HF5_1',
    title: 'HF5 Paragraph Test',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: docMeta,
    blocks: [
      {
        id: 'BLK_1',
        blockType: 'paragraph',
        metadata: blk1Meta,
        segments: [
          {
            id: 'SEG_1',
            text: 'First sentence of card one.',
            meaning: 'Kalimat pertama kartu satu.',
            metadata: seg1Meta
          },
          {
            id: 'SEG_2',
            text: 'Second sentence of card one.',
            meaning: 'Kalimat kedua kartu satu.',
            metadata: {}
          }
        ]
      },
      {
        id: 'BLK_2',
        blockType: 'paragraph',
        metadata: {},
        segments: [
          {
            id: 'SEG_3',
            text: 'First sentence of card two.',
            meaning: 'Kalimat pertama kartu dua.',
            metadata: seg3Meta
          }
        ]
      }
    ]
  };
};

// ============================================================================
// TEST CASE 1: Full TTS Card override with Segment 1 set to another voice
// ============================================================================
await check('Test Case 1: Full TTS uses Card -> Workspace -> Global and ignores Segment 1 override while preserving Conversation speaker semantics', () => {
  const doc = createSampleParagraphDoc();
  const block1 = doc.blocks[0];
  const seg1 = block1.segments[0];
  const item1 = { ...seg1, blockId: block1.id, segmentId: seg1.id, blockType: block1.blockType };

  const fullTextVoice = resolveTextStructuredEffectiveVoiceForItem({
    documentTree: doc,
    item: item1,
    channel: 'text',
    defaultVoiceName: 'Global Browser EN',
    representationMode: 'full',
    ignoreSegmentOverride: true
  });
  assert.equal(fullTextVoice.voiceName, 'Card EN Voice');
  assert.equal(fullTextVoice.source, 'card');

  const fullMeaningVoice = resolveTextStructuredEffectiveVoiceForItem({
    documentTree: doc,
    item: item1,
    channel: 'meaning',
    defaultVoiceName: 'Global Browser ID',
    representationMode: 'full',
    ignoreSegmentOverride: true
  });
  assert.equal(fullMeaningVoice.voiceName, 'Workspace Narrator ID');
  assert.equal(fullMeaningVoice.source, 'document');

  const fullCardHelper = resolveTextStructuredFullCardVoiceProfile({
    documentTree: doc,
    block: block1,
    channel: 'text',
    defaultVoiceName: 'Global Browser EN'
  });
  assert.equal(fullCardHelper.voiceName, 'Card EN Voice');
  assert.equal(fullCardHelper.source, 'card');

  // Conversation speaker semantics remain intact even when ignoreSegmentOverride is true
  const convBlockMeta = buildTextStructuredVoiceOverrideMetadata({
    metadata: {},
    channel: 'text',
    speakerId: 'SPK_A',
    voiceName: 'Speaker A Card Voice'
  });
  const convSegMeta = buildTextStructuredVoiceOverrideMetadata({
    metadata: { speakerIdentityV1: 'SPK_A' },
    channel: 'text',
    voiceName: 'Segment Override Should Be Ignored In Full'
  });
  const convDoc = {
    id: 'DOC_CONV',
    editorModel: 'structured-v1',
    documentType: 'conversation',
    metadata: {
      speakerVoiceProfileV2: {
        speakers: {
          text: { SPK_A: 'Speaker A Doc Voice' }
        }
      }
    },
    blocks: [
      {
        id: 'BLK_CONV_1',
        blockType: 'conversation',
        metadata: convBlockMeta,
        segments: [
          {
            id: 'SEG_CONV_1',
            speaker: 'Alice',
            text: 'Hello there.',
            meaning: 'Halo di sana.',
            metadata: convSegMeta
          }
        ]
      }
    ]
  };
  const convFullProfile = resolveTextStructuredEffectiveVoiceProfile({
    documentTree: convDoc,
    block: convDoc.blocks[0],
    segment: convDoc.blocks[0].segments[0],
    speaker: 'Alice',
    speakerId: 'SPK_A',
    channel: 'text',
    defaultVoiceName: 'Global Browser EN',
    representationMode: 'full'
  });
  assert.equal(convFullProfile.voiceName, 'Speaker A Card Voice');
  assert.equal(convFullProfile.source, 'card-speaker');
});

// ============================================================================
// TEST CASE 2: Split TTS Segment override still working
// ============================================================================
await check('Test Case 2: Split TTS honors Segment override -> Card override -> Workspace Narrator -> Global Browser TTS', () => {
  const doc = createSampleParagraphDoc();
  const block1 = doc.blocks[0];
  const seg1 = block1.segments[0];
  const seg2 = block1.segments[1];

  const splitSeg1 = resolveTextStructuredEffectiveVoiceForItem({
    documentTree: doc,
    item: { ...seg1, blockId: block1.id, segmentId: seg1.id },
    channel: 'text',
    defaultVoiceName: 'Global Browser EN',
    representationMode: 'split'
  });
  assert.equal(splitSeg1.voiceName, 'Segment 1 Override EN');
  assert.equal(splitSeg1.source, 'segment');

  const splitSeg2 = resolveTextStructuredEffectiveVoiceForItem({
    documentTree: doc,
    item: { ...seg2, blockId: block1.id, segmentId: seg2.id },
    channel: 'text',
    defaultVoiceName: 'Global Browser EN',
    representationMode: 'split'
  });
  assert.equal(splitSeg2.voiceName, 'Card EN Voice');
  assert.equal(splitSeg2.source, 'card');

  const splitSeg2Meaning = resolveTextStructuredEffectiveVoiceForItem({
    documentTree: doc,
    item: { ...seg2, blockId: block1.id, segmentId: seg2.id },
    channel: 'meaning',
    defaultVoiceName: 'Global Browser ID',
    representationMode: 'split'
  });
  assert.equal(splitSeg2Meaning.voiceName, 'Workspace Narrator ID');
  assert.equal(splitSeg2Meaning.source, 'document');
});

// ============================================================================
// TEST CASE 3: TTS Only and Local First fallback to Browser TTS
// ============================================================================
await check('Test Case 3: TTS Only and Local First fallback to Browser TTS annotate explicit Full-card vs Split-segment TTS fallback policy', () => {
  const doc = createSampleParagraphDoc();
  const block1 = doc.blocks[0];

  const ttsOnlyFullPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc,
    block: block1,
    channel: 'text',
    representationMode: 'full',
    globalTtsOnly: true
  });
  assert.equal(ttsOnlyFullPlan.route, 'full-tts-only');
  assert.equal(ttsOnlyFullPlan.ttsFallbackPolicy, TEXT_STRUCTURED_TTS_FALLBACK_POLICIES.FULL_CARD);
  assert.equal(ttsOnlyFullPlan.steps.length, 1);
  assert.equal(ttsOnlyFullPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(ttsOnlyFullPlan.steps[0].ignoreSegmentVoiceOverride, true);
  assert.equal(ttsOnlyFullPlan.steps[0].ttsVoicePolicy, TEXT_STRUCTURED_TTS_FALLBACK_POLICIES.FULL_CARD);

  const localFirstMissingPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc,
    block: block1,
    channel: 'text',
    representationMode: 'full',
    globalTtsOnly: false,
    fallbackVoiceId: 'en-US-AriaNeural',
    runtimeFullAudio: {},
    audioVariants: [],
    runtimeAudioUrls: {}
  });
  assert.equal(localFirstMissingPlan.route, 'full-tts-fallback');
  assert.equal(localFirstMissingPlan.ttsFallbackPolicy, TEXT_STRUCTURED_TTS_FALLBACK_POLICIES.FULL_CARD);
  assert.equal(localFirstMissingPlan.steps[0].ignoreSegmentVoiceOverride, true);

  const splitPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc,
    block: block1,
    channel: 'text',
    representationMode: 'split',
    globalTtsOnly: true
  });
  assert.equal(splitPlan.route, 'split');
  assert.equal(splitPlan.ttsFallbackPolicy, TEXT_STRUCTURED_TTS_FALLBACK_POLICIES.SPLIT_SEGMENT);
  assert.equal(splitPlan.steps[0].ignoreSegmentVoiceOverride, false);
});

// ============================================================================
// TEST CASE 4: Global/Card/EN-only/ID-only/Segment playback
// ============================================================================
await check('Test Case 4: Global Play, Card Play, EN-only, ID-only, and Segment Play preserve navigation and voice policies', async () => {
  globalThis.navigator ||= {};
  const doc = createSampleParagraphDoc();

  const runSession = async ({ scope, representation, channelMode, blockId = null, segmentId = null, cursorSegmentId = null }) => {
    const events = [];
    const sessionRef = { current: 0 };
    const contextRef = { current: null };
    const stopRef = { current: false };
    const pauseRef = { current: false };
    const tasks = [];

    const started = executeStructuredTextPlaybackSessionService({
      documentTree: doc,
      scope,
      blockId,
      startSegmentId: segmentId,
      cursorSegmentId,
      playbackChannelMode: channelMode,
      playbackRepresentationMode: representation,
      playbackOrderMode: 'sequential',
      repeatMode: 'once',
      playbackSessionRef: sessionRef,
      playbackContextRef: contextRef,
      stopSignalRef: stopRef,
      pauseStateRef: pauseRef,
      silentAudioRef: { current: null },
      waitWhilePaused: async () => {},
      safePlayTransition: fn => {
        sessionRef.current += 1;
        stopRef.current = false;
        tasks.push(Promise.resolve().then(fn));
      },
      setIsPlaying: () => {},
      setIsPaused: () => {},
      setPlayingContext: () => {},
      setPlayingIndex: () => {},
      setCurrentIndex: () => {},
      setSpeakingPart: () => {},
      resolveBlockChannelPlaybackPlan: ({ block, channel, allowFullArtifact }) => buildTextStructuredBlockRuntimePlaybackPlan({
        documentTree: doc,
        block,
        channel,
        representationMode: representation,
        allowFullArtifact,
        globalTtsOnly: true
      }),
      playStructuredFullStep: async (step, block, item) => {
        const resolved = resolveTextStructuredEffectiveVoiceForItem({
          documentTree: doc,
          item,
          channel: step.channel,
          defaultVoiceName: step.channel === 'meaning' ? 'Global ID' : 'Global EN',
          representationMode: 'full',
          ignoreSegmentOverride: true
        });
        events.push({ mode: 'full', blockId: block.id, channel: step.channel, voice: resolved.voiceName, source: resolved.source });
      },
      playStructuredChannel: async (content, item, channel, options = {}) => {
        const resolved = resolveTextStructuredEffectiveVoiceForItem({
          documentTree: doc,
          item,
          channel,
          defaultVoiceName: channel === 'meaning' ? 'Global ID' : 'Global EN',
          representationMode: options.representationMode || 'split',
          ignoreSegmentOverride: Boolean(options.ignoreSegmentOverride)
        });
        events.push({ mode: 'split', segmentId: item.segmentId || item.id, channel, voice: resolved.voiceName, source: resolved.source });
      },
      forceStopAll: () => { stopRef.current = true; sessionRef.current += 1; },
      addLog: () => {}
    });
    assert.equal(started, true);
    await Promise.all(tasks);
    return events;
  };

  // 4a: Full Card Play on BLK_1 ignores Segment 1 override and uses Card EN Voice
  const fullCardEvents = await runSession({
    scope: 'card',
    blockId: 'BLK_1',
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    channelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING
  });
  assert.deepEqual(fullCardEvents, [
    { mode: 'full', blockId: 'BLK_1', channel: 'text', voice: 'Card EN Voice', source: 'card' },
    { mode: 'full', blockId: 'BLK_1', channel: 'meaning', voice: 'Workspace Narrator ID', source: 'document' }
  ]);

  // 4b: EN-only Card Play
  const enOnlyEvents = await runSession({
    scope: 'card',
    blockId: 'BLK_1',
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    channelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY
  });
  assert.deepEqual(enOnlyEvents, [
    { mode: 'full', blockId: 'BLK_1', channel: 'text', voice: 'Card EN Voice', source: 'card' }
  ]);

  // 4c: ID-only Card Play
  const idOnlyEvents = await runSession({
    scope: 'card',
    blockId: 'BLK_1',
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    channelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY
  });
  assert.deepEqual(idOnlyEvents, [
    { mode: 'full', blockId: 'BLK_1', channel: 'meaning', voice: 'Workspace Narrator ID', source: 'document' }
  ]);

  // 4d: Segment Play uses Split segment override
  const segEvents = await runSession({
    scope: 'segment',
    segmentId: 'SEG_1',
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    channelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY
  });
  assert.deepEqual(segEvents, [
    { mode: 'split', segmentId: 'SEG_1', channel: 'text', voice: 'Segment 1 Override EN', source: 'segment' }
  ]);

  // 4e: Global Full Play starting from Card 2 (SEG_3) ignores Segment 3 override and uses Workspace Narrator EN
  const globalFromCard2 = await runSession({
    scope: 'document',
    cursorSegmentId: 'SEG_3',
    representation: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    channelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY
  });
  assert.deepEqual(globalFromCard2, [
    { mode: 'full', blockId: 'BLK_2', channel: 'text', voice: 'Workspace Narrator EN', source: 'document' }
  ]);
});

// ============================================================================
// TEST CASE 5: Full MP3 present and absent
// ============================================================================
await check('Test Case 5: Full MP3 present uses FULL_LOCAL; Full MP3 absent without Split local files uses FULL_TTS with Full Card voice policy', () => {
  const doc = createSampleParagraphDoc();
  const baseBlock = doc.blocks[0];
  const fullRecord = buildTextStructuredFullArtifactRecord({
    block: baseBlock,
    channel: 'text',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0,
    filename: 'full_card_1.mp3'
  });
  const nextMetadata = buildTextStructuredFullAudioArtifactsMetadata({
    metadata: baseBlock.metadata,
    artifact: fullRecord
  });
  const blockWithFullArtifact = { ...baseBlock, metadata: nextMetadata };
  const fp = fullRecord.fullArtifactFingerprint;

  const presentPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc,
    block: blockWithFullArtifact,
    channel: 'text',
    representationMode: 'full',
    globalTtsOnly: false,
    fallbackVoiceId: 'en-US-AriaNeural',
    runtimeFullAudio: {
      [fp]: { stagingBacked: true, stagingId: 'STG_FULL_1', filename: 'full_card_1.mp3' }
    }
  });
  assert.equal(presentPlan.route, 'full-local');
  assert.equal(presentPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);
  assert.equal(presentPlan.steps[0].ignoreSegmentVoiceOverride, true);

  const absentPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc,
    block: blockWithFullArtifact,
    channel: 'text',
    representationMode: 'full',
    globalTtsOnly: false,
    fallbackVoiceId: 'en-US-AriaNeural',
    runtimeFullAudio: {}
  });
  assert.equal(absentPlan.route, 'full-tts-fallback');
  assert.equal(absentPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(absentPlan.steps[0].ignoreSegmentVoiceOverride, true);
});

// ============================================================================
// TEST CASE 6: Split fallback with partially available local MP3
// ============================================================================
await check('Test Case 6: Full representation falling back to Split audio preserves partial local MP3 selection while enforcing Full-card TTS policy on missing segments', async () => {
  globalThis.navigator ||= {};
  const doc = createSampleParagraphDoc();
  const block1 = doc.blocks[0];

  // Segment 2 has a local MP3, Segment 1 does NOT (and Segment 1 has a segment TTS override)
  const audioVariants = [
    {
      id: 'VAR_SEG2_EN',
      segmentId: 'SEG_2',
      channel: 'text',
      source: 'generated',
      engine: 'edge',
      voiceId: 'en-US-AriaNeural',
      metadata: {
        engineVoiceId: 'en-US-AriaNeural',
        deliveryStatus: 'staged-ready'
      }
    }
  ];
  const runtimeAudioUrls = {
    VAR_SEG2_EN: {
      url: 'blob:seg2-local',
      stagingBacked: true,
      stagingId: 'STG_SEG2',
      filename: 'seg2.mp3'
    }
  };

  const plan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: doc,
    block: block1,
    channel: 'text',
    representationMode: 'full',
    globalTtsOnly: false,
    fallbackVoiceId: 'en-US-AriaNeural',
    runtimeFullAudio: {},
    audioVariants,
    runtimeAudioUrls
  });

  assert.equal(plan.route, 'split-fallback');
  assert.equal(plan.ttsFallbackPolicy, TEXT_STRUCTURED_TTS_FALLBACK_POLICIES.FULL_CARD);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS);
  assert.equal(plan.steps[0].ignoreSegmentVoiceOverride, true);
  assert.equal(plan.steps[1].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(plan.steps[1].ignoreSegmentVoiceOverride, true);

  // Verify session execution forwards ignoreSegmentOverride=true to playStructuredChannel
  const channelCalls = [];
  const sessionRef = { current: 0 };
  const stopRef = { current: false };
  const tasks = [];
  executeStructuredTextPlaybackSessionService({
    documentTree: doc,
    scope: 'card',
    blockId: 'BLK_1',
    playbackChannelMode: 'text',
    playbackRepresentationMode: 'full',
    playbackOrderMode: 'sequential',
    repeatMode: 'once',
    playbackSessionRef: sessionRef,
    playbackContextRef: { current: null },
    stopSignalRef: stopRef,
    pauseStateRef: { current: false },
    silentAudioRef: { current: null },
    waitWhilePaused: async () => {},
    safePlayTransition: fn => { sessionRef.current += 1; tasks.push(Promise.resolve().then(fn)); },
    setIsPlaying: () => {},
    setIsPaused: () => {},
    setPlayingContext: () => {},
    setPlayingIndex: () => {},
    setCurrentIndex: () => {},
    setSpeakingPart: () => {},
    resolveBlockChannelPlaybackPlan: () => plan,
    playStructuredFullStep: async () => { throw new Error('Should not call full step on split-fallback route'); },
    playStructuredChannel: async (content, item, channel, options = {}) => {
      const resolved = resolveTextStructuredEffectiveVoiceForItem({
        documentTree: doc,
        item,
        channel,
        defaultVoiceName: 'Global EN',
        representationMode: options.representationMode,
        ignoreSegmentOverride: options.ignoreSegmentOverride
      });
      channelCalls.push({
        segmentId: item.segmentId,
        ignoreSegmentOverride: options.ignoreSegmentOverride,
        resolvedTtsVoice: resolved.voiceName,
        resolvedSource: resolved.source
      });
    },
    forceStopAll: () => {},
    addLog: () => {}
  });
  await Promise.all(tasks);
  assert.equal(channelCalls.length, 2);
  // Even though SEG_1 has 'Segment 1 Override EN', split-fallback inside a Full session uses 'Card EN Voice'!
  assert.equal(channelCalls[0].segmentId, 'SEG_1');
  assert.equal(channelCalls[0].ignoreSegmentOverride, true);
  assert.equal(channelCalls[0].resolvedTtsVoice, 'Card EN Voice');
  assert.equal(channelCalls[0].resolvedSource, 'card');
});

// ============================================================================
// TEST CASE 7: Bulk Single Voice replacement
// ============================================================================
await check('Test Case 7: Bulk Single Voice mode directly replaces the active voice without multi-select accumulation', () => {
  const singleRes = applyTextStructuredBulkVoiceSelectionChange({
    mode: TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE,
    currentVoiceIds: ['en-US-AriaNeural', 'en-US-GuyNeural'],
    targetVoiceId: 'en-GB-SoniaNeural'
  });
  assert.deepEqual(singleRes, ['en-GB-SoniaNeural']);
});

// ============================================================================
// TEST CASE 8: Bulk Multi-Voice zero-selection validation
// ============================================================================
await check('Test Case 8: Bulk Multiple Voices supports empty draft, prevents Generate, never substitutes default voice, and keeps disabled channels distinct', () => {
  const emptyRes = applyTextStructuredBulkVoiceSelectionChange({
    mode: TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE,
    currentVoiceIds: ['en-US-AriaNeural'],
    targetVoiceId: 'en-US-AriaNeural'
  });
  assert.deepEqual(emptyRes, []);

  // Validation when text channel is enabled with 0 voices, meaning channel is disabled
  const validation = validateTextStructuredBulkVoiceDraft({
    includeText: true,
    includeMeaning: false,
    textVoiceIds: [],
    meaningVoiceIds: []
  });
  assert.equal(validation.canGenerate, false);
  assert.equal(validation.textChannelEnabled, true);
  assert.equal(validation.meaningChannelEnabled, false);
  assert.equal(validation.meaningEmptyWarning, null, 'Disabled channel must remain distinct from enabled channel with 0 voices');
  assert.match(validation.textEmptyWarning, /EN \(Text\) channel is enabled with 0 voices selected/);

  // Plan with allowEmptyVoiceSelection=true produces 0 requirements for the empty channel (no silent substitution)
  const doc = createSampleParagraphDoc();
  const coverageMap = buildTextStructuredAudioCoverageMap({
    documentTree: doc,
    audioVariants: [],
    runtimeAudioUrls: {},
    preferences: {}
  });
  const selection = buildTextStructuredBatchWorkspaceSelection({
    documentTrees: [doc],
    preferences: {},
    coverageMapsByDocument: { [doc.id]: coverageMap },
    activeDocumentId: doc.id
  });
  const emptyPlan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [doc],
    selection,
    preferences: {
      bulkGenerateSplit: true,
      bulkGenerateFull: false,
      generateText: true,
      generateMeaning: false,
      bulkTextVoiceIds: [],
      bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
      edgeTextVoiceId: 'en-US-AriaNeural',
      edgeMeaningVoiceId: 'id-ID-GadisNeural'
    },
    allowEmptyVoiceSelection: true
  });
  assert.deepEqual(emptyPlan.selectedVoices.text, []);
  assert.equal(emptyPlan.requirements.length, 0);
  assert.equal(emptyPlan.voiceValidation.canGenerate, false);
});

// ============================================================================
// TEST CASE 9: Card Player Reset/Apply persistence
// ============================================================================
await check('Test Case 9: Card Audio separates Player and Download tabs, and Player supports Draft Reset/Apply with Apply disabled until genuine changes exist', () => {
  resetHooks();
  const CardAudioPanel = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx')).default;
  const doc = createSampleParagraphDoc();
  const block1 = doc.blocks[0];
  const appliedPayloads = [];

  const baseProps = {
    documentTree: doc,
    block: block1,
    cardLabel: 'Card 1',
    defaultExpanded: true,
    englishVoices: [
      { name: 'Global Browser EN', lang: 'en-US' },
      { name: 'Workspace Narrator EN', lang: 'en-US' },
      { name: 'Card EN Voice', lang: 'en-US' },
      { name: 'New Card Voice EN', lang: 'en-US' }
    ],
    indonesianVoices: [
      { name: 'Global Browser ID', lang: 'id-ID' },
      { name: 'Workspace Narrator ID', lang: 'id-ID' }
    ],
    defaultTextVoiceName: 'Global Browser EN',
    defaultMeaningVoiceName: 'Global Browser ID',
    playbackOrder: { channels: { text: [], meaning: [] }, ttsOnly: false },
    availableLocalVoices: { text: [], meaning: [] },
    generationPreferences: {
      edgeTextVoice: 'en-US-AriaNeural',
      edgeMeaningVoice: 'id-ID-GadisNeural',
      edgeRate: 0,
      edgePitch: 0
    },
    edgeGenerationVoices: [
      { id: 'en-US-AriaNeural', name: 'Aria Neural', lang: 'en-US' },
      { id: 'id-ID-GadisNeural', name: 'Gadis Neural', lang: 'id-ID' }
    ],
    onApplyCardPlayerChanges: (blockId, payload) => appliedPayloads.push({ blockId, payload })
  };

  let nodes = renderTree(CardAudioPanel(baseProps));
  assert.ok(nodes.some(n => n?.props?.['data-text-card-audio-tab'] === 'player'));
  assert.ok(nodes.some(n => n?.props?.['data-text-card-audio-tab'] === 'download'));
  assert.ok(nodes.some(n => n?.props?.['data-text-card-audio-player-surface'] === 'true'));

  // Initially Apply and Reset are disabled because no draft edits have been made
  const applyBtnInitial = nodes.find(n => n?.props?.['data-text-card-player-apply'] === 'true');
  const resetBtnInitial = nodes.find(n => n?.props?.['data-text-card-player-reset'] === 'true');
  assert.ok(applyBtnInitial);
  assert.ok(resetBtnInitial);
  assert.equal(applyBtnInitial.props.disabled, true);
  assert.equal(resetBtnInitial.props.disabled, true);

  // Edit Card Browser TTS Override for Text/EN in draft
  const cardVoiceSelect = nodes.find(n => n?.props?.['data-text-voice-override-select'] === 'BLK_1:text');
  assert.ok(cardVoiceSelect);
  cardVoiceSelect.props.onChange({ target: { value: 'New Card Voice EN' } });
  rerenderHooks();
  nodes = renderTree(CardAudioPanel(baseProps));

  const applyBtnDirty = nodes.find(n => n?.props?.['data-text-card-player-apply'] === 'true');
  const resetBtnDirty = nodes.find(n => n?.props?.['data-text-card-player-reset'] === 'true');
  assert.equal(applyBtnDirty.props.disabled, false);
  assert.equal(resetBtnDirty.props.disabled, false);
  assert.equal(appliedPayloads.length, 0, 'Changes must stay drafted until Apply is clicked');

  // Reset reverts unsaved draft back to committed state
  resetBtnDirty.props.onClick();
  rerenderHooks();
  nodes = renderTree(CardAudioPanel(baseProps));
  assert.equal(nodes.find(n => n?.props?.['data-text-card-player-apply'] === 'true').props.disabled, true);
  assert.equal(nodes.find(n => n?.props?.['data-text-voice-override-select'] === 'BLK_1:text').props.value, 'Card EN Voice');

  // Change again and click Apply
  nodes.find(n => n?.props?.['data-text-voice-override-select'] === 'BLK_1:text').props.onChange({ target: { value: 'New Card Voice EN' } });
  rerenderHooks();
  nodes = renderTree(CardAudioPanel(baseProps));
  nodes.find(n => n?.props?.['data-text-card-player-apply'] === 'true').props.onClick();
  assert.equal(appliedPayloads.length, 1);
  assert.equal(appliedPayloads[0].blockId, 'BLK_1');
  assert.equal(appliedPayloads[0].payload.cardChannels.text, 'New Card Voice EN');

  // Switch to Download tab and verify Split readiness is separate from Full readiness (no fake Full readiness)
  const downloadTabBtn = nodes.find(n => n?.props?.['data-text-card-audio-tab'] === 'download');
  downloadTabBtn.props.onClick();
  rerenderHooks();
  nodes = renderTree(CardAudioPanel({
    ...baseProps,
    cardCoverage: { covered: 4, total: 4, needDownload: 0 },
    runtimeFullAudio: {}
  }));
  assert.ok(nodes.some(n => n?.props?.['data-text-card-audio-download-surface'] === 'true'));
  assert.ok(nodes.some(n => n?.props?.['data-text-card-split-readiness'] === 'text'));
  assert.ok(nodes.some(n => n?.props?.['data-text-card-full-readiness'] === 'true'));
  const fullReadinessNode = nodes.find(n => n?.props?.['data-text-card-full-readiness'] === 'true');
  const fullReadinessText = collectText(renderTree(fullReadinessNode));
  assert.match(fullReadinessText, /FULL MISSING/);
  assert.match(fullReadinessText, /Independent from Split/);
});

// ============================================================================
// TEST CASE 10: Mobile Audio Library layout & Effective Voice Reporting (Parts C, D, F)
// ============================================================================
await check('Test Case 10: Audio Library multi-row layout, Effective Voice fallback reporting, and Bulk clarity labels', () => {
  // Part C: No misleading Sidebar EN TTS / Sidebar ID TTS labels anywhere in text components
  const cardPanelSrc = read('src/components/text/TextStructuredCardAudioPanel.jsx');
  const sidebarSrc = read('src/components/text/TextStructuredAudioControls.jsx');
  assert.doesNotMatch(cardPanelSrc, /Sidebar EN TTS|Sidebar ID TTS/);
  assert.doesNotMatch(sidebarSrc, /Sidebar EN TTS|Sidebar ID TTS/);

  // Part C: Browser voice with "Microsoft" in its name is labeled as Browser TTS, never Edge Neural download
  const msBrowserLabel = formatTextStructuredBrowserVoiceLabel({ name: 'Microsoft David - English (United States)', lang: 'en-US' });
  assert.match(msBrowserLabel, /Browser TTS/);
  assert.doesNotMatch(msBrowserLabel, /Edge Neural/i);

  // Part C: Unavailable requested browser voice reports real fallback and reason
  const unavailableResolution = resolveTextStructuredBrowserVoiceResolution({
    requestedVoiceName: 'Missing Browser Voice EN',
    requestedSource: 'card',
    defaultVoiceName: 'Global Browser EN',
    availableBrowserVoices: [{ name: 'Global Browser EN', lang: 'en-US' }],
    channel: 'text'
  });
  assert.equal(unavailableResolution.requestedVoiceAvailable, false);
  assert.equal(unavailableResolution.fallbackUsed, true);
  assert.equal(unavailableResolution.effectiveVoiceName, 'Global Browser EN');
  assert.equal(unavailableResolution.effectiveSourceLabel, getTextStructuredVoiceSourceDisplayLabel('global'));
  assert.match(unavailableResolution.fallbackReason, /unavailable in this browser; falling back to Global Browser EN \(Global Browser TTS\)/);

  // Part D: Audio Library renders separated title, metadata, and action rows with confirmation guard on Clear Staging
  resetHooks();
  const AudioDataPanel = loadModule(path.join(root, 'src/components/text/TextAudioDataPanel.jsx')).default;
  let clearStagingCount = 0;
  let refreshCacheCount = 0;
  const prevWindow = globalThis.window;
  globalThis.window = { confirm: () => false };
  try {
    const libNodes = renderTree(AudioDataPanel({
      audioLibrary: {
        coverage: { ready: 3, missing: 1, stale: 0, total: 4 },
        inventory: { ready: 3, voices: [{ id: 'en-US-AriaNeural', count: 3 }] },
        zipState: { archives: [], splitMatchedCount: 0, fullMatchedCount: 0, orphanCount: 0 },
        staging: { count: 2, bytes: 2048 },
        onClearStaging: () => { clearStagingCount += 1; },
        onClearRuntimeCache: () => { refreshCacheCount += 1; }
      }
    }));
    assert.ok(libNodes.some(n => n?.props?.['data-text-audio-library-indicators'] === 'true'));
    assert.ok(libNodes.some(n => n?.props?.['data-text-audio-library-voices'] === 'true'));
    assert.ok(libNodes.some(n => n?.props?.['data-text-audio-library-zip'] === 'true'));
    assert.ok(libNodes.some(n => n?.props?.['data-text-audio-staging'] === 'true'));
    assert.ok(libNodes.some(n => n?.props?.['data-text-library-row'] === 'title'));
    assert.ok(libNodes.some(n => n?.props?.['data-text-library-row'] === 'metadata'));
    assert.ok(libNodes.some(n => n?.props?.['data-text-library-row'] === 'actions'));

    const refreshBtn = libNodes.find(n => n?.props?.['data-text-audio-refresh-cache'] === 'true');
    assert.ok(refreshBtn);
    refreshBtn.props.onClick();
    assert.equal(refreshCacheCount, 1);

    const clearBtn = libNodes.find(n => n?.props?.['data-text-audio-clear-staging'] === 'true');
    assert.ok(clearBtn);
    clearBtn.props.onClick();
    assert.equal(clearStagingCount, 0, 'Declining confirmation must prevent Clear Staging');
    globalThis.window.confirm = () => true;
    clearBtn.props.onClick();
    assert.equal(clearStagingCount, 1, 'Confirming dialog executes Clear Staging');
  } finally {
    globalThis.window = prevWindow;
  }

  // Part E & F: TextBatchPopup renders Single/Multiple voice mode, Global Edge Generation Defaults (Shared with Sidebar), and clarified Generation Coverage
  resetHooks();
  const TextBatchPopup = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx')).default;
  const doc = createSampleParagraphDoc();
  const batchNodes = renderTree(TextBatchPopup({
    structuredTextBatch: {
      scope: { scopeMode: 'workspace' },
      cardCount: 2,
      workspaceTitle: doc.title,
      activeWorkspaceId: doc.id,
      cardOptions: [{ id: 'BLK_1', label: 'Card 1' }],
      workspaceOptions: [{ id: doc.id, title: doc.title }],
      collectionOptions: [],
      workspacesResolved: [{ id: doc.id, title: doc.title, cardCount: 2, segmentCount: 3 }],
      preferences: {
        bulkGenerateSplit: true,
        bulkGenerateFull: false,
        generateText: true,
        generateMeaning: true,
        bulkTextVoiceIds: ['en-US-AriaNeural'],
        bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
        edgeTextVoiceId: 'en-US-AriaNeural',
        edgeMeaningVoiceId: 'id-ID-GadisNeural',
        edgeRate: 0,
        edgePitch: 0
      },
      edgeVoices: [
        { id: 'en-US-AriaNeural', name: 'Aria Neural', lang: 'en-US' },
        { id: 'en-US-GuyNeural', name: 'Guy Neural', lang: 'en-US' },
        { id: 'id-ID-GadisNeural', name: 'Gadis Neural', lang: 'id-ID' }
      ],
      coverage: { total: 6, covered: 2, missing: 4, stale: 0 },
      bulkPlan: {
        requirements: [],
        coverage: {
          total: 6,
          covered: 2,
          ready: 2,
          reusable: 1,
          stale: 0,
          missing: 3,
          logicalRequirements: 6,
          uniquePhysicalRequirements: 5,
          splitLogical: 6,
          fullLogical: 0
        }
      },
      bulkExportPlan: { counts: { readyLogical: 2, missingLogical: 4, staleLogical: 0, uniqueReadyPhysical: 2 } }
    }
  }));
  const batchText = collectText(batchNodes);
  assert.match(batchText, /Global Edge Generation Defaults \(Shared with Sidebar\)/);
  assert.doesNotMatch(batchText, /Manual \/ Single-Card Fallback Voice/);
  assert.match(batchText, /Reusable physical/);
  assert.ok(batchNodes.some(n => n?.props?.['data-text-bulk-en-mode-btn'] === 'single'));
  assert.ok(batchNodes.some(n => n?.props?.['data-text-bulk-en-mode-btn'] === 'multiple'));
});

console.log(`HF5 Voice Consistency & Audio UX audit complete: ${passed}/${passed} PASS`);
