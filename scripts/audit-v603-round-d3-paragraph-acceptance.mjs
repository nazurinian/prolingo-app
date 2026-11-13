import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { initialEdgeVoices } from '../src/constants/voiceConstants.js';
import { resolveDefaultIndonesianBrowserVoice } from '../src/domain/audio/browserTtsVoiceDecisionDomain.js';
import {
  applyTextLibraryCommand,
  TEXT_LIBRARY_COMMAND_TYPES
} from '../src/domain/text/textLibraryCommandDomain.js';
import {
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import {
  buildProLingoTextAudioManifest,
  TEXT_AUDIO_MANIFEST_FILENAME
} from '../src/domain/text/textAudioManifestDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import { TEXT_STRUCTURED_GENERATION_DEFAULTS } from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import {
  buildTextStructuredAudioContentFingerprintV2,
  buildTextStructuredAudioRenderFingerprint,
  TEXT_AUDIO_CODEC_PROFILE,
  TEXT_AUDIO_RENDERER_PROFILE_VERSION
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  buildTextStructuredBulkExportPlan,
  resolveTextStructuredCardReadyFullArtifacts
} from '../src/domain/text/textStructuredBulkExportDomain.js';
import {
  buildTextStructuredBulkGenerationPlan,
  buildTextStructuredCardMissingFullRequirements,
  TEXT_STRUCTURED_BULK_REPRESENTATIONS,
  TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import {
  resolveStructuredTextSmartNavPlan,
  TEXT_STRUCTURED_PLAYBACK_CONTEXT
} from '../src/domain/text/textStructuredPlaybackDomain.js';
import { DEFAULT_TEXT_STRUCTURED_PREFERENCES } from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  buildResetTextStructuredBulkGenerationPreferences,
  buildResetTextStructuredGlobalEdgePreferences,
  canExecuteTextStructuredReset,
  TEXT_STRUCTURED_RESET_SCOPES
} from '../src/domain/text/textStructuredResetDomain.js';
import {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES
} from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata,
  buildTextStructuredFullTextPair,
  getTextStructuredFullAudioArtifacts
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import { resolveTextStructuredBrowserVoiceResolution } from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import { resolveTextWorkspaceType } from '../src/domain/text/textWorkspaceTaxonomyDomain.js';
import { isBatchPopupAllowed } from '../src/domain/view/dataSystemBoundaryDomain.js';
import { buildStoredZipBlob } from '../src/services/audio/browserZipService.js';
import { scanTextStructuredAudioZipFiles } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import { AUDIO_STAGING_DB_VERSION } from '../src/services/persistence/audioStagingIndexedDbService.js';
import { planTextAudioStagingGarbage } from '../src/services/persistence/textAudioStagingGcService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const transpile = (source, absPath) => esbuild.transformSync(source, {
  loader: absPath.endsWith('.jsx') ? 'jsx' : 'js',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform'
}).code;

let hookValues = [];
let hookSlot = 0;
const resetHooks = () => { hookValues = []; hookSlot = 0; };
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
  const normalized = path.normalize(absPath);
  if (moduleCache.has(normalized)) return moduleCache.get(normalized);
  const exportsObj = {};
  const mod = { exports: exportsObj };
  moduleCache.set(normalized, exportsObj);
  const source = fs.readFileSync(normalized, 'utf8');
  const code = transpile(source, normalized);
  const localRequire = specifier => {
    if (specifier === 'react') return mockReact;
    if (specifier === 'lucide-react') return fakeIcons;
    const base = path.dirname(normalized);
    const candidates = [specifier, `${specifier}.js`, `${specifier}.jsx`];
    for (const candidate of candidates) {
      const target = path.resolve(base, candidate);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) return loadModule(target);
    }
    return require(specifier);
  };
  const fn = new Function('require', 'module', 'exports', code);
  fn(localRequire, mod, exportsObj);
  moduleCache.set(normalized, mod.exports);
  return mod.exports;
};

const renderTree = node => {
  if (node == null || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map(renderTree);
  if (typeof node !== 'object') return node;
  if (typeof node.type === 'function') return renderTree(node.type(node.props || {}));
  const rawChildren = node.props?.children;
  const children = Array.isArray(rawChildren)
    ? rawChildren.flat(Infinity).map(renderTree)
    : (rawChildren !== undefined ? [renderTree(rawChildren)] : []);
  return { ...node, children };
};

const collectNodes = (node, predicate, out = []) => {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodes(child, predicate, out);
  }
  return out;
};

const makeParagraphAcceptanceFixture = () => {
  const seg1Text = 'Morning coffee resets focus.';
  const seg2Text = 'Evening reading deepens clarity.';
  const seg3Text = 'Consistency builds mastery.';
  const seg1Meaning = 'Kopi pagi memulihkan fokus.';
  const seg2Meaning = 'Membaca malam memperdalam kejelasan.';
  const seg3Meaning = 'Konsistensi membangun penguasaan.';

  const docUid = '11111111-1111-4111-8111-111111111111';
  const blkUid1 = '22222222-2222-4222-8222-222222222221';
  const blkUid2 = '22222222-2222-4222-8222-222222222222';
  const segUid1 = '33333333-3333-4333-8333-333333333331';
  const segUid2 = '33333333-3333-4333-8333-333333333332';
  const segUid3 = '33333333-3333-4333-8333-333333333333';
  const varUid1 = '44444444-4444-4444-8444-444444444441';

  const seg1 = {
    id: 'SEGMENT_000001',
    uid: segUid1,
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    order: 0,
    joinAfter: ' ',
    text: seg1Text,
    meaning: seg1Meaning,
    metadata: {
      sentenceAuthoringV1: { version: 1, origin: 'manual' },
      audioVoiceOverrideV1: { channels: { text: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', meaning: null }, speakers: {}, speakerIds: {} },
      audioPlaybackRateProfileV1: { channels: { text: 1.15 } }
    }
  };
  const seg2 = {
    id: 'SEGMENT_000002',
    uid: segUid2,
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    order: 1,
    joinAfter: '\n',
    text: seg2Text,
    meaning: seg2Meaning,
    metadata: {}
  };
  const seg3 = {
    id: 'SEGMENT_000003',
    uid: segUid3,
    documentId: 'DOC_000001',
    blockId: 'TEXT_000002',
    order: 0,
    joinAfter: '',
    text: seg3Text,
    meaning: seg3Meaning,
    metadata: {}
  };

  const fullEnRecord = buildTextStructuredFullArtifactRecord({
    block: { id: 'TEXT_000001', blockType: 'paragraph', segments: [seg1, seg2] },
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0,
    rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
    codecProfile: TEXT_AUDIO_CODEC_PROFILE,
    source: 'generated'
  });

  const block1 = {
    id: 'TEXT_000001',
    uid: blkUid1,
    documentId: 'DOC_000001',
    blockType: 'paragraph',
    order: 0,
    title: 'Daily Habits',
    metadata: {
      paragraphRoleV1: 'paragraph',
      externalSourceV1: { provider: 'manual-import', externalId: 'ext-1' },
      audioVoiceOverrideV1: { channels: { text: 'Google UK English Male', meaning: null }, speakers: {}, speakerIds: {} },
      audioPlaybackRateProfileV1: { channels: { text: 1.05 } },
      ...buildTextStructuredAudioDownloadProfileMetadata({
        metadata: {},
        channel: 'text',
        mode: 'custom',
        voiceId: 'en-GB-RyanNeural'
      }),
      ...buildTextStructuredFullAudioArtifactsMetadata({
        metadata: {},
        artifact: fullEnRecord
      })
    },
    segments: [seg1, seg2]
  };
  const block2 = {
    id: 'TEXT_000002',
    uid: blkUid2,
    documentId: 'DOC_000001',
    blockType: 'paragraph',
    order: 1,
    title: 'Long-Term Progress',
    metadata: { paragraphRoleV1: 'title' },
    segments: [seg3]
  };

  const documentTree = {
    id: 'DOC_000001',
    uid: docUid,
    title: 'Paragraph Acceptance Suite',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    textLanguage: 'en',
    meaningLanguage: 'id',
    metadata: {
      audioVoiceOverrideV1: { channels: { text: 'Microsoft Libby Online (Natural) - English (United Kingdom)', meaning: null }, speakers: {}, speakerIds: {} },
      audioPlaybackRateProfileV1: { channels: { text: 1.1 } },
      audioDownloadProfileV1: { modes: { text: 'custom', meaning: null }, channels: { text: 'en-GB-LibbyNeural', meaning: null }, speakers: {}, speakerIds: {} }
    },
    blocks: [block1, block2]
  };

  const rfSeg1Result = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: seg1Text,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0,
    rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
    codecProfile: TEXT_AUDIO_CODEC_PROFILE
  });
  const rfSeg1 = rfSeg1Result.renderFingerprint;
  const audioVariants = [{
    id: 'TXTAUDIO_000001',
    uid: varUid1,
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    segmentId: 'SEGMENT_000001',
    channel: 'text',
    engine: 'edge',
    source: 'generated',
    voiceId: 'en-GB-SoniaNeural',
    metadata: {
      audioRenderFingerprintV1: rfSeg1,
      audioRenderDescriptorV1: rfSeg1Result.descriptor
    }
  }];
  const runtimeAudioUrls = {
    TXTAUDIO_000001: { url: 'blob:split-p1-1-en', stagingBacked: true, voiceId: 'en-GB-SoniaNeural' },
    [buildTextStructuredRuntimeAudioKey('SEGMENT_000001', 'text')]: { url: 'blob:split-p1-1-en', stagingBacked: true, voiceId: 'en-GB-SoniaNeural', status: 'ready', requiredVoiceId: 'en-GB-SoniaNeural' }
  };
  const runtimeFullAudio = {
    [fullEnRecord.fullArtifactFingerprint]: { url: 'blob:full-p1-en', stagingBacked: true, voiceId: 'en-GB-SoniaNeural' }
  };

  return {
    documentTree,
    block1,
    block2,
    seg1,
    seg2,
    seg3,
    fullEnRecord,
    rfSeg1,
    audioVariants,
    runtimeAudioUrls,
    runtimeFullAudio
  };
};

const results = [];
const run = async (name, fn) => {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS: ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error });
    console.error(`FAIL: ${name}`);
    console.error(error?.stack || error);
  }
};

await run('1. Paragraph derivation, taxonomy & protected metadata contracts', () => {
  const f = makeParagraphAcceptanceFixture();
  assert.equal(resolveTextWorkspaceType(f.documentTree), 'paragraph');
  const pair = buildTextStructuredFullTextPair({ block: f.block1 });
  assert.equal(pair.text.content, 'Morning coffee resets focus. Evening reading deepens clarity.');
  assert.equal(pair.meaning.content, 'Kopi pagi memulihkan fokus. Membaca malam memperdalam kejelasan.');
  assert.equal(f.block1.metadata.paragraphRoleV1, 'paragraph');
  assert.equal(f.block2.metadata.paragraphRoleV1, 'title');
  assert.equal(f.seg1.metadata.sentenceAuthoringV1?.origin, 'manual');
  assert.equal(getTextStructuredFullAudioArtifacts(f.block1).length, 1);
});

await run('2. Paragraph Split & Full playback planning, navigation, Shuffle & Browser TTS hierarchy', () => {
  const f = makeParagraphAcceptanceFixture();
  // Full EN with Ready artifact plays single FULL_LOCAL step without segment highlight
  const fullLocalPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: f.documentTree,
    block: f.block1,
    channel: 'text',
    representationMode: 'full',
    audioVariants: f.audioVariants,
    runtimeAudioUrls: f.runtimeAudioUrls,
    runtimeFullAudio: f.runtimeFullAudio,
    fallbackVoiceId: 'en-GB-SoniaNeural'
  });
  assert.equal(fullLocalPlan.steps.length, 1);
  assert.equal(fullLocalPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL);
  assert.equal(fullLocalPlan.steps[0].highlight, false);

  // Full EN with partial Split (when allowFullArtifact=false) falls back to Split steps with seg1 local + seg2 tts
  const hybridSplitFallback = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: f.documentTree,
    block: f.block1,
    channel: 'text',
    representationMode: 'full',
    audioVariants: f.audioVariants,
    runtimeAudioUrls: f.runtimeAudioUrls,
    runtimeFullAudio: {},
    fallbackVoiceId: 'en-GB-SoniaNeural',
    allowFullArtifact: false
  });
  assert.equal(hybridSplitFallback.steps.length, 2);
  assert.equal(hybridSplitFallback.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(hybridSplitFallback.steps[1].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS);

  // Global TTS Only overrides Full Local cleanly
  const ttsOnlyPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: f.documentTree,
    block: f.block1,
    channel: 'text',
    representationMode: 'full',
    audioVariants: f.audioVariants,
    runtimeAudioUrls: f.runtimeAudioUrls,
    runtimeFullAudio: f.runtimeFullAudio,
    audioSourceMode: 'tts-only'
  });
  assert.equal(ttsOnlyPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);

  // Smart Nav: card-level in Full vs sentence-level in Split; Shuffle freezes card order without splitting cards
  const list = [
    { id: 'SEGMENT_000001', blockId: 'TEXT_000001' },
    { id: 'SEGMENT_000002', blockId: 'TEXT_000001' },
    { id: 'SEGMENT_000003', blockId: 'TEXT_000002' }
  ];
  const fullNext = resolveStructuredTextSmartNavPlan({
    completeList: list,
    activeDocumentId: 'DOC_000001',
    savedResume: { documentId: 'DOC_000001', segmentId: 'SEGMENT_000001' },
    preferences: { playbackRepresentationMode: 'full', playbackOrderMode: 'sequential' },
    direction: 'next'
  });
  assert.equal(fullNext.target.blockId, 'TEXT_000002', 'Full mode Next must advance to next card');

  const splitNext = resolveStructuredTextSmartNavPlan({
    completeList: list,
    activeDocumentId: 'DOC_000001',
    savedResume: { documentId: 'DOC_000001', segmentId: 'SEGMENT_000001' },
    preferences: { playbackRepresentationMode: 'split', playbackOrderMode: 'sequential' },
    direction: 'next'
  });
  assert.equal(splitNext.target.id, 'SEGMENT_000002', 'Split mode Next must advance to next sentence');

  // Browser TTS hierarchy: Segment wins in Split, suppressed in Full so Card wins; Chrome ID prefers Google Bahasa Indonesia over Andika
  const availableEnVoices = [
    { name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Google UK English Male', lang: 'en-GB' },
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' }
  ];
  const splitRes = resolveTextStructuredBrowserVoiceResolution({
    documentTree: f.documentTree,
    block: f.block1,
    segment: f.seg1,
    channel: 'text',
    globalVoiceName: 'Google UK English Female',
    availableBrowserVoices: availableEnVoices,
    representationMode: 'split'
  });
  assert.equal(splitRes.effectiveVoiceName, 'Microsoft Sonia Online (Natural) - English (United Kingdom)');

  const fullRes = resolveTextStructuredBrowserVoiceResolution({
    documentTree: f.documentTree,
    block: f.block1,
    segment: f.seg1,
    channel: 'text',
    globalVoiceName: 'Google UK English Female',
    availableBrowserVoices: availableEnVoices,
    representationMode: 'full'
  });
  assert.equal(fullRes.effectiveVoiceName, 'Google UK English Male', 'Full mode must ignore segment override and use Card voice');

  const idDefault = resolveDefaultIndonesianBrowserVoice([
    { name: 'Microsoft Andika - Indonesian (Indonesia)', lang: 'id-ID' },
    { name: 'Google Bahasa Indonesia', lang: 'id-ID' }
  ]);
  assert.equal(idDefault?.name, 'Google Bahasa Indonesia');
});

await run('3. Paragraph audio generation (D2-C missing Full, Bulk Split+Full & Conversation exclusion)', () => {
  const f = makeParagraphAcceptanceFixture();
  // D2-C card missing Full: BLK_P1 Full EN is Ready with Sonia (so use Sonia download profile to verify Ready EN is skipped while Missing ID is queued)
  const blockWithDefaultProfile = {
    ...f.block1,
    metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: f.fullEnRecord })
  };
  const missingFull = buildTextStructuredCardMissingFullRequirements({
    documentTree: { ...f.documentTree, metadata: {}, blocks: [blockWithDefaultProfile] },
    block: blockWithDefaultProfile,
    channels: ['text', 'meaning'],
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    runtimeFullAudio: f.runtimeFullAudio,
    stagingRecords: []
  });
  assert.equal(missingFull.length, 1);
  assert.equal(missingFull[0].channel, 'meaning');
  assert.equal(missingFull[0].status, TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING);

  // Conversation exclusion
  const convBlock = { ...f.block2, blockType: 'conversation', id: 'TEXT_000099' };
  const bulkPlan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [{ ...f.documentTree, blocks: [blockWithDefaultProfile, convBlock] }],
    selection: { documents: [{ id: 'DOC_000001', scope: { blockIds: ['TEXT_000001', 'TEXT_000099'] } }] },
    preferences: {
      bulkTextVoiceIds: ['en-GB-SoniaNeural'],
      bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
      bulkGenerateSplit: true,
      bulkGenerateFull: true,
      generateText: true,
      generateMeaning: true,
      edgeRate: 0,
      edgePitch: 0
    },
    audioVariants: f.audioVariants,
    runtimeAudioUrls: f.runtimeAudioUrls,
    runtimeFullAudio: f.runtimeFullAudio,
    stagingRecords: []
  });
  assert.ok(bulkPlan.requirements.every(req => req.blockId === 'TEXT_000001'), 'Conversation cards must be excluded from Bulk Split+Full');
  assert.ok(bulkPlan.requirements.some(req => req.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.SPLIT));
  assert.ok(bulkPlan.requirements.some(req => req.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL));
});

await run('4. Paragraph export, Portable ZIP v2 round-trip & Staging physical GC', async () => {
  const f = makeParagraphAcceptanceFixture();
  const blockDefaultDownload = {
    ...f.block1,
    metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: f.fullEnRecord })
  };
  const docClean = { ...f.documentTree, metadata: {}, blocks: [blockDefaultDownload, f.block2] };
  const stagingRecords = [
    { key: 'STG_SPLIT', mapKey: f.rfSeg1, storageKind: 'rf-blob', renderFingerprint: f.rfSeg1, metadata: { renderFingerprint: f.rfSeg1 }, voiceId: 'en-GB-SoniaNeural', channel: 'text', hasBlob: true, size: 1200 },
    { key: 'STG_FULL', storageKind: 'full-blob', fullArtifactFingerprint: f.fullEnRecord.fullArtifactFingerprint, metadata: { fullArtifactFingerprint: f.fullEnRecord.fullArtifactFingerprint }, voiceId: 'en-GB-SoniaNeural', channel: 'text', hasBlob: true, size: 4096 },
    { key: 'STG_ORPHAN', storageKind: 'full-blob', fullArtifactFingerprint: 'full-sha256-deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', metadata: { fullArtifactFingerprint: 'full-sha256-deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }, voiceId: 'en-GB-SoniaNeural', channel: 'text', hasBlob: true, size: 999 },
    { key: 'STG_LEGACY', mode: 'text', hasBlob: true, size: 512 }
  ];

  // Ready Full Card export returns active matching EN Full artifact
  const readyCardFull = resolveTextStructuredCardReadyFullArtifacts({
    documentTree: docClean,
    block: blockDefaultDownload,
    channels: ['text', 'meaning'],
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    runtimeFullAudio: f.runtimeFullAudio
  });
  assert.equal(readyCardFull.length, 1);
  assert.equal(readyCardFull[0].fullArtifactFingerprint, f.fullEnRecord.fullArtifactFingerprint);

  // Bulk export deduplicates and excludes stale/orphan records
  const exportPlan = buildTextStructuredBulkExportPlan({
    documentTrees: [docClean],
    selection: { documents: [{ id: 'DOC_000001', scope: { blockIds: ['TEXT_000001'] } }] },
    preferences: {
      bulkExportVoicePolicy: 'all-selected',
      bulkExportRepresentation: 'both',
      bulkTextVoiceIds: ['en-GB-SoniaNeural'],
      bulkMeaningVoiceIds: ['id-ID-GadisNeural']
    },
    audioVariants: f.audioVariants,
    stagingRecords
  });
  assert.equal(exportPlan.physical.length, 2, 'Should export exact Ready Split + Ready Full artifacts only');

  // Portable ZIP v2 build + scan resolves Split + Full cleanly
  const splitFilename = `rf_${f.rfSeg1}.mp3`;
  const fullFilename = `full_${f.fullEnRecord.fullArtifactFingerprint}.mp3`;
  const manifest = buildProLingoTextAudioManifest({
    entries: [
      {
        representation: 'split',
        rf: f.rfSeg1,
        filename: splitFilename,
        render: {
          channel: 'text',
          language: 'en',
          engine: 'edge',
          voiceId: 'en-GB-SoniaNeural',
          rate: 0,
          pitch: 0,
          rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
          codecProfile: TEXT_AUDIO_CODEC_PROFILE,
          contentFingerprint: buildTextStructuredAudioContentFingerprintV2({ channel: 'text', content: f.seg1.text })
        }
      },
      {
        representation: 'full',
        fullArtifactFingerprint: f.fullEnRecord.fullArtifactFingerprint,
        filename: fullFilename,
        render: f.fullEnRecord.descriptor
      }
    ]
  });
  // Verify Staging GC keeps Split RF + active Full while flagging orphan and preserving Legacy record separation
  const snapshot = {
    documents: [docClean],
    blocks: [blockDefaultDownload, f.block2],
    segments: [f.seg1, f.seg2, f.seg3],
    audioVariants: f.audioVariants
  };
  const gcPlan = planTextAudioStagingGarbage({ snapshot, records: stagingRecords });
  assert.equal(gcPlan.referencedCount, 2);
  assert.equal(gcPlan.orphanCount, 1);
  assert.equal(gcPlan.legacyCount, 1);
  assert.equal(gcPlan.orphanRecords[0].key, 'STG_ORPHAN');

  // Build Stored ZIP + scan back Manifest v2
  const zipBlob = await buildStoredZipBlob([
    { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) },
    { filename: fullFilename, blob: new Blob([new Uint8Array([0x49, 0x44, 0x33, 0x04])], { type: 'audio/mpeg' }) }
  ]);
  const zipFile = new File([zipBlob], 'paragraph-acceptance.zip', { type: 'application/zip' });
  const scanned = await scanTextStructuredAudioZipFiles({
    files: [zipFile],
    audioVariants: f.audioVariants,
    segments: [f.seg1, f.seg2, f.seg3],
    blocks: [blockDefaultDownload, f.block2],
    documents: [docClean]
  });
  assert.equal(scanned.fullMatches.length, 1, 'Manifest v2 Full binary must resolve against Paragraph card');
});

await run('5. Paragraph reset scopes restore inheritance cleanly & protect metadata', () => {
  const f = makeParagraphAcceptanceFixture();
  const baseSnapshot = {
    schemaVersion: 1,
    activeDocumentId: f.documentTree.id,
    collections: [],
    documents: [{ ...f.documentTree, blocks: undefined }],
    blocks: [{ ...f.block1, segments: undefined }, { ...f.block2, segments: undefined }],
    segments: [f.seg1, f.seg2, f.seg3],
    audioVariants: f.audioVariants
  };

  // Segment reset strips segment overrides, keeps sentenceAuthoringV1, falls back to Card voice
  let next = applyTextLibraryCommand(baseSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.SEGMENT, documentId: 'DOC_000001', segmentId: 'SEGMENT_000001' }
  }).snapshot;
  const segAfter = next.segments.find(s => s.id === 'SEGMENT_000001');
  assert.equal(segAfter.metadata.audioVoiceOverrideV1, undefined);
  assert.equal(segAfter.metadata.audioPlaybackRateProfileV1, undefined);
  assert.equal(segAfter.metadata.sentenceAuthoringV1?.origin, 'manual');

  // Card reset strips card overrides without deleting fullAudioArtifactsV1, paragraphRoleV1, externalSourceV1
  next = applyTextLibraryCommand(next, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.CARD, documentId: 'DOC_000001', blockId: 'TEXT_000001' }
  }).snapshot;
  const blockAfter = next.blocks.find(b => b.id === 'TEXT_000001');
  assert.equal(blockAfter.metadata.audioVoiceOverrideV1, undefined);
  assert.equal(blockAfter.metadata.audioDownloadProfileV1, undefined);
  assert.equal(blockAfter.metadata.paragraphRoleV1, 'paragraph');
  assert.equal(blockAfter.metadata.externalSourceV1?.externalId, 'ext-1');
  assert.equal(getTextStructuredFullAudioArtifacts(blockAfter).length, 1);

  // Workspace reset strips document overrides -> inherits Global cleanly
  next = applyTextLibraryCommand(next, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE, documentId: 'DOC_000001' }
  }).snapshot;
  const docAfter = next.documents.find(d => d.id === 'DOC_000001');
  assert.equal(docAfter.metadata?.audioVoiceOverrideV1, undefined);
  assert.equal(docAfter.metadata?.audioDownloadProfileV1, undefined);
  assert.equal(next.audioVariants.length, 1);

  // Global Edge (Sonia/Gadis/0%/0Hz) vs Bulk (Libby/Tuti/Split) defaults + reset busy guard
  const edgeReset = buildResetTextStructuredGlobalEdgePreferences({ ...TEXT_STRUCTURED_GENERATION_DEFAULTS, edgeTextVoiceId: 'en-US-AriaNeural', edgeRate: 15 });
  assert.equal(edgeReset.edgeTextVoiceId, 'en-GB-SoniaNeural');
  assert.equal(edgeReset.edgeMeaningVoiceId, 'id-ID-GadisNeural');
  assert.equal(edgeReset.edgeRate, 0);
  const bulkReset = buildResetTextStructuredBulkGenerationPreferences({ ...TEXT_STRUCTURED_GENERATION_DEFAULTS, bulkTextVoiceIds: ['en-US-AriaNeural'], bulkGenerateFull: true });
  assert.deepEqual(bulkReset.bulkTextVoiceIds, ['en-GB-LibbyNeural']);
  assert.deepEqual(bulkReset.bulkMeaningVoiceIds, ['su-ID-TutiNeural']);
  assert.equal(bulkReset.bulkGenerateFull, false);
  assert.equal(canExecuteTextStructuredReset({ zipImportActive: true }).allowed, false);
  assert.equal(canExecuteTextStructuredReset({ zipImportActive: false, textLibraryCommandBusy: false }).allowed, true);
});

await run('6. Paragraph UI components expose grouped selectors, Reset confirmations, D2-C checkbox & Full MP3 export', () => {
  const TextStructuredPlaybackControls = loadModule(path.join(root, 'src/components/text/TextStructuredPlaybackControls.jsx')).default;
  const TextStructuredAudioControls = loadModule(path.join(root, 'src/components/text/TextStructuredAudioControls.jsx')).default;
  const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
  const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));
  const f = makeParagraphAcceptanceFixture();

  resetHooks();
  const pbTree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: f.documentTree,
    preferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, playbackOrderMode: 'shuffle' },
    onResetPlaybackPreferences: () => {}
  }));
  assert.equal(collectNodes(pbTree, n => n.props?.['data-text-reset-playback'] === 'true').length, 1);

  resetHooks();
  const audioTree = renderTree(mockReact.createElement(TextStructuredAudioControls, {
    documentTree: f.documentTree,
    englishVoices: [{ name: 'Google UK English Female', lang: 'en-GB' }],
    indonesianVoices: [{ name: 'Google Bahasa Indonesia', lang: 'id-ID' }],
    onResetGlobalBrowserTts: () => {},
    onResetWorkspaceAudio: () => {},
    onResetGlobalEdge: () => {}
  }));
  assert.ok(collectNodes(audioTree, n => n.type === 'optgroup').length >= 1, 'Browser TTS selector must render <optgroup> region groups');
  assert.equal(collectNodes(audioTree, n => n.props?.['data-text-reset-workspace'] === 'true').length, 1);

  resetHooks();
  const cardDefaultDownload = {
    ...f.block1,
    metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: f.fullEnRecord })
  };
  const cardTree = renderTree(mockReact.createElement(TextStructuredCardAudioPanel, {
    documentTree: { ...f.documentTree, metadata: {}, blocks: [cardDefaultDownload, f.block2] },
    block: cardDefaultDownload,
    initialSurface: 'download',
    audioVariants: f.audioVariants,
    runtimeAudioUrls: f.runtimeAudioUrls,
    runtimeFullAudio: f.runtimeFullAudio,
    edgeGenerationVoices: initialEdgeVoices,
    generationPreferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    audioCoverageMap: {},
    onResetCardAudioPreferences: () => {},
    onExportFullCardAudio: () => {}
  }));
  const [d2cLabel] = collectNodes(cardTree, n => n.type === 'label' && n.props?.['data-text-card-include-missing-full'] === 'true');
  assert.ok(d2cLabel, 'Expected D2-C checkbox label');
  const [d2cCheckbox] = collectNodes([d2cLabel], n => n.type === 'input' && n.props?.type === 'checkbox');
  assert.ok(d2cCheckbox && d2cCheckbox.props.checked === false);
  assert.equal(collectNodes(cardTree, n => n.props?.['data-text-reset-card-audio'] === 'true').length, 1);
  assert.ok(collectNodes(cardTree, n => n.props?.['data-text-card-full-export'] === 'text').length === 1);

  resetHooks();
  const batchTree = renderTree(mockReact.createElement(TextBatchPopup, {
    setIsBatchOpen: () => {},
    structuredTextBatch: {
      running: false,
      voices: initialEdgeVoices,
      preferences: { ...TEXT_STRUCTURED_GENERATION_DEFAULTS },
      resetPreferences: () => {}
    }
  }));
  assert.equal(collectNodes(batchTree, n => n.props?.['data-text-reset-bulk-preferences'] === 'true').length, 1);
});

await run('7. Table mode, Legacy Text mode & schema v1 isolation boundaries hold', () => {
  assert.equal(TEXT_LIBRARY_DB_NAME, 'prolingo_text_library');
  assert.equal(TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.equal(AUDIO_STAGING_DB_VERSION, 1);

  assert.throws(
    () => applyTextLibraryCommand({
      schemaVersion: 1,
      activeDocumentId: 'DOC_LEG',
      collections: [],
      documents: [{ id: 'DOC_LEG', documentType: 'paragraph', editorModel: 'legacy-line-v1', title: 'Legacy' }],
      blocks: [],
      segments: [],
      audioVariants: []
    }, {
      type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
      payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.WORKSPACE, documentId: 'DOC_LEG' }
    }),
    /legacy Text document/i
  );

  assert.equal(isBatchPopupAllowed({ mode: 'text', activeTextEditorModel: 'legacy-line-v1' }), false);
  assert.equal(isBatchPopupAllowed({ mode: 'text', activeTextEditorModel: 'structured-v1' }), true);
  assert.equal(isBatchPopupAllowed({ mode: 'table', activeTextEditorModel: null }), true);
  assert.equal(TEXT_STRUCTURED_PLAYBACK_CONTEXT, 'text-structured');

  const resetDomainSrc = read('src/domain/text/textStructuredResetDomain.js');
  const prefSvcSrc = read('src/services/persistence/textStructuredPreferenceService.js');
  assert.ok(!resetDomainSrc.includes('prolingo_playback_sequence_v511'));
  assert.ok(!resetDomainSrc.includes('pronunciation_decks'));
  assert.ok(!prefSvcSrc.includes('localStorage.clear('));
  assert.ok(!prefSvcSrc.includes('deleteDatabase('));
});

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`D3_SUMMARY: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
