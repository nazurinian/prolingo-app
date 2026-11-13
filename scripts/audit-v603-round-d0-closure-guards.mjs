import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { initialEdgeVoices } from '../src/constants/voiceConstants.js';
import {
  resolveTableBatchRequiredChannels,
  resolveTableBatchUnavailableVoices
} from '../src/domain/audio/audioDownloadCoverageDomain.js';
import {
  buildTextStructuredBulkGenerationPlan,
  validateTextStructuredBulkRequirementsVoices
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';

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

const renderTree = node => {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(renderTree);
  if (typeof node === 'string' || typeof node === 'number') return [node];
  if (typeof node === 'object' && typeof node.type === 'function') {
    return renderTree(node.type(node.props || {}));
  }
  if (typeof node === 'object' && node.type) {
    const children = renderTree(node.props?.children);
    return [{ ...node, children }];
  }
  return [];
};

const collectNodes = (nodes, predicate, acc = []) => {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (predicate(node)) acc.push(node);
    if (Array.isArray(node.children)) collectNodes(node.children, predicate, acc);
  }
  return acc;
};

const collectText = nodes => renderTree(nodes).map(item => {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  const rawChildren = Array.isArray(item?.children) ? item.children : [];
  return rawChildren.map(child => (
    typeof child === 'string' || typeof child === 'number'
      ? String(child)
      : ` ${collectText(child)} `
  )).join('');
}).join(' ').replace(/\s+/g, ' ').trim();

let pass = 0;
const test = async (name, fn) => {
  await fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`);
};

const { BatchPopup } = loadModule(path.join(root, 'src/components/table/BatchPopup.jsx'));
const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));

const customVoicesWithUnavailableId = [
  ...initialEdgeVoices,
  { id: 'id-ID-BrokenNeural', label: 'Broken (ID)', lang: 'id-ID', available: false, unavailable: true, diagnostic: 'Retired test voice' }
];

await test('01 — Table resolveTableBatchRequiredChannels & BatchPopup never overblock EN-only, ID-only, Ready-export, or slot-scoped runs', () => {
  assert.deepEqual(
    resolveTableBatchRequiredChannels({ doWord: true, doSentence: false, doWordTranslation: false, doMeaning: false, expEn: [false, false, false, false, false], expIdn: [false, false, false, false, false] }, 'edge'),
    { needsEnglishVoice: true, needsIndonesianVoice: false }
  );
  assert.deepEqual(
    resolveTableBatchRequiredChannels({ doWord: false, doSentence: false, doWordTranslation: false, doMeaning: false, expEn: [true, false, false, false, false], expIdn: [false, false, false, false, false] }, 'edge'),
    { needsEnglishVoice: true, needsIndonesianVoice: false }
  );

  // EN-only Table batch + unavailable ID voice -> NOT blocked
  assert.deepEqual(
    resolveTableBatchUnavailableVoices({
      batchConfig: { doWord: true, doSentence: true, doWordTranslation: false, doMeaning: false, expEn: [false, false, false, false, false], expIdn: [false, false, false, false, false] },
      generatorEngine: 'edge',
      edgeVoice: 'en-GB-LibbyNeural',
      edgeIndonesianVoice: 'id-ID-BrokenNeural',
      edgeVoices: customVoicesWithUnavailableId
    }),
    []
  );

  // ID-only Table batch + unavailable EN voice -> UI buttons & Ready exports remain enabled
  resetHooks();
  const idOnlyTree = renderTree(BatchPopup({
    inline: true,
    mode: 'table',
    generatorEngine: 'edge',
    edgeVoice: 'en-GB-AlfieNeural',
    edgeIndonesianVoice: 'id-ID-GadisNeural',
    edgeVoices: initialEdgeVoices,
    advancedDatasetStats: { hasAdvanced: false },
    batchConfig: { doWord: false, doSentence: false, doWordTranslation: true, doMeaning: true, expEn: [false, false, false, false, false], expIdn: [false, false, false, false, false], start: 1, end: 10 },
    tableCoverage: { counts: { total: 10, ready: 5, needDownload: 5 } },
    onExportCurrentMp3: () => {},
    DownloadCloudIcon: () => null
  }));
  assert.equal(collectNodes(idOnlyTree, n => n.props?.['data-table-batch-unavailable-warning'] === 'true').length, 0);
  assert.equal(collectNodes(idOnlyTree, n => n.type === 'button' && collectText(n).includes('DOWNLOAD MISSING'))[0].props.disabled, false);
  assert.equal(collectNodes(idOnlyTree, n => n.type === 'button' && collectText(n).includes('REDOWNLOAD SELECTED'))[0].props.disabled, false);
  assert.equal(collectNodes(idOnlyTree, n => n.type === 'button' && collectText(n).includes('EXPORT READY MP3'))[0].props.disabled, false);

  // Slot-level scoping: if EN slots are Ready with Alfie and only ID slots are missing with Gadis,
  // DOWNLOAD MISSING is allowed while REDOWNLOAD SELECTED is blocked (and Ready exports stay enabled).
  resetHooks();
  const slotScopedTree = renderTree(BatchPopup({
    inline: true,
    mode: 'table',
    generatorEngine: 'edge',
    edgeVoice: 'en-GB-AlfieNeural',
    edgeIndonesianVoice: 'id-ID-GadisNeural',
    edgeVoices: initialEdgeVoices,
    advancedDatasetStats: { hasAdvanced: false },
    batchConfig: { doWord: true, doWordTranslation: true, start: 1, end: 10 },
    tableCoverage: {
      counts: { total: 2, ready: 1, needDownload: 1 },
      slots: [
        { mapKey: '1_word', status: 'ready', requiredVoiceId: 'en-GB-AlfieNeural' },
        { mapKey: '1_word_idn', status: 'missing', requiredVoiceId: 'id-ID-GadisNeural' }
      ]
    },
    onExportCurrentMp3: () => {},
    DownloadCloudIcon: () => null
  }));
  assert.equal(collectNodes(slotScopedTree, n => n.type === 'button' && collectText(n).includes('DOWNLOAD MISSING'))[0].props.disabled, false);
  assert.equal(collectNodes(slotScopedTree, n => n.type === 'button' && collectText(n).includes('REDOWNLOAD SELECTED'))[0].props.disabled, true);
  assert.equal(collectNodes(slotScopedTree, n => n.type === 'button' && collectText(n).includes('EXPORT READY MP3'))[0].props.disabled, false);
});

await test('02 — TextStructuredCardAudioPanel does not overblock EN generation when unused ID voice is empty/Ready or on other channel', () => {
  // Case A: Card has only EN text (meaning: '') while global ID voice is unavailable -> EN Generate Missing & Regen Split enabled
  const enOnlyBlock = {
    id: 'blk-en-only',
    blockType: 'paragraph',
    metadata: {},
    segments: [{ id: 'seg-en', text: 'Only English text here.', meaning: '', joinAfter: 'space' }]
  };
  const enOnlyDoc = { id: 'doc-1', editorModel: 'structured-v1', documentType: 'paragraph', metadata: {}, blocks: [enOnlyBlock] };
  resetHooks();
  const enOnlyTree = renderTree(TextStructuredCardAudioPanel({
    documentTree: enOnlyDoc,
    block: enOnlyBlock,
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-BrokenNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: customVoicesWithUnavailableId,
    cardCoverage: { total: 1, covered: 0, needDownload: 1 },
    initialSurface: 'download'
  }));
  const footerGenMissingA = collectNodes(enOnlyTree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true')[0];
  assert.equal(footerGenMissingA.props.disabled, false);
  const enSplitGenBtnA = collectNodes(
    [collectNodes(enOnlyTree, n => n.props?.['data-text-card-split-readiness'] === 'text')[0]],
    n => n.type === 'button'
  )[0];
  assert.equal(enSplitGenBtnA.props.disabled, false);

  // Case B: EN is Missing (valid Libby), ID is ALREADY 1/1 Ready (with unavailable broken ID voice) + Ready Full EN MP3 ->
  // Generate Missing EN, footer GENERATE MISSING, and Ready Full EN export must all stay enabled.
  const fullEnRecord = buildTextStructuredFullArtifactRecord({
    block: enOnlyBlock,
    channel: 'text',
    engine: 'edge',
    voiceId: 'en-GB-AlfieNeural',
    rate: 0,
    pitch: 0,
    language: 'en'
  });
  const dualBlock = {
    id: 'blk-dual',
    blockType: 'paragraph',
    metadata: buildTextStructuredFullAudioArtifactsMetadata({
      metadata: buildTextStructuredAudioDownloadProfileMetadata({ metadata: {}, channel: 'text', mode: 'custom', voiceId: 'en-GB-LibbyNeural' }),
      artifact: fullEnRecord
    }),
    segments: [{ id: 'seg-1', text: 'English missing.', meaning: 'Indonesian ready.', joinAfter: 'space' }]
  };
  const coverageMapB = {
    [buildTextStructuredRuntimeAudioKey('seg-1', 'text')]: { status: 'missing', requiredVoiceId: 'en-GB-LibbyNeural' },
    [buildTextStructuredRuntimeAudioKey('seg-1', 'meaning')]: { status: 'ready', requiredVoiceId: 'id-ID-BrokenNeural' }
  };
  resetHooks();
  const readyIdTree = renderTree(TextStructuredCardAudioPanel({
    documentTree: { id: 'doc-1', editorModel: 'structured-v1', documentType: 'paragraph', metadata: {}, blocks: [dualBlock] },
    block: dualBlock,
    audioCoverageMap: coverageMapB,
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-BrokenNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: customVoicesWithUnavailableId,
    cardCoverage: { total: 2, covered: 1, needDownload: 1 },
    initialSurface: 'download'
  }));
  assert.equal(collectNodes(readyIdTree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true')[0].props.disabled, false);
  const enBoxB = collectNodes(readyIdTree, n => n.props?.['data-text-card-split-readiness'] === 'text')[0];
  assert.equal(collectNodes([enBoxB], n => n.type === 'button')[0].props.disabled, false);

  // Case C: Both EN (Libby, missing) & ID (Broken, missing) have missing slots ->
  // per-channel Generate Missing EN stays enabled even though GENERATE MISSING (EN+ID) blocks for missing ID!
  const coverageMapC = {
    [buildTextStructuredRuntimeAudioKey('seg-1', 'text')]: { status: 'missing', requiredVoiceId: 'en-GB-LibbyNeural' },
    [buildTextStructuredRuntimeAudioKey('seg-1', 'meaning')]: { status: 'missing', requiredVoiceId: 'id-ID-BrokenNeural' }
  };
  resetHooks();
  const mixedMissingTree = renderTree(TextStructuredCardAudioPanel({
    documentTree: { id: 'doc-1', editorModel: 'structured-v1', documentType: 'paragraph', metadata: {}, blocks: [dualBlock] },
    block: dualBlock,
    audioCoverageMap: coverageMapC,
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-BrokenNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: customVoicesWithUnavailableId,
    cardCoverage: { total: 2, covered: 0, needDownload: 2 },
    initialSurface: 'download'
  }));
  const enBoxC = collectNodes(mixedMissingTree, n => n.props?.['data-text-card-split-readiness'] === 'text')[0];
  const idBoxC = collectNodes(mixedMissingTree, n => n.props?.['data-text-card-split-readiness'] === 'meaning')[0];
  assert.equal(collectNodes([enBoxC], n => n.type === 'button')[0].props.disabled, false, 'Generate Missing EN stays enabled when ID missing voice is unavailable');
  assert.equal(collectNodes([idBoxC], n => n.type === 'button')[0].props.disabled, true, 'Generate Missing ID blocks on its own unavailable voice');
  assert.equal(collectNodes(mixedMissingTree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true')[0].props.disabled, true);
});

await test('03 — Bulk domain & TextBatchPopup scope unavailable voice blocking to actual required generation work while preserving Ready exports', () => {
  // EN-only Bulk generation with unavailable ID voice saved -> allowed
  const enOnlyDoc = {
    id: 'doc-1',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: {},
    blocks: [{
      id: 'blk-1',
      blockType: 'paragraph',
      metadata: {},
      segments: [{ id: 'seg-1', text: 'English only.', meaning: '', joinAfter: 'space' }]
    }]
  };

  // Case 1: generateText=true, generateMeaning=false + unavailable ID voice saved -> allowed everywhere
  const planChannelDisabled = buildTextStructuredBulkGenerationPlan({
    documentTrees: [enOnlyDoc],
    selection: { documents: [{ id: 'doc-1', scope: { blockIds: ['blk-1'] } }] },
    preferences: {
      generateText: true,
      generateMeaning: false,
      bulkGenerateSplit: true,
      bulkGenerateFull: false,
      bulkTextVoiceIds: ['en-GB-LibbyNeural'],
      bulkMeaningVoiceIds: ['id-ID-BrokenNeural'],
      edgeVoices: customVoicesWithUnavailableId
    }
  });
  assert.equal(planChannelDisabled.voiceValidation.canGenerate, true);
  assert.equal(planChannelDisabled.operationVoiceValidation.missing.hasUnavailableVoice, false);

  // Case 2: Both channels enabled, ID voice unavailable, workspace has NO ID content (empty meaning) ->
  // actual operation requirements only use en-GB-LibbyNeural, so GENERATE MISSING + REGENERATE SELECTED are allowed!
  const planEmptyMeaning = buildTextStructuredBulkGenerationPlan({
    documentTrees: [enOnlyDoc],
    selection: { documents: [{ id: 'doc-1', scope: { blockIds: ['blk-1'] } }] },
    preferences: {
      generateText: true,
      generateMeaning: true,
      bulkGenerateSplit: true,
      bulkGenerateFull: false,
      bulkTextVoiceIds: ['en-GB-LibbyNeural'],
      bulkMeaningVoiceIds: ['id-ID-BrokenNeural'],
      edgeVoices: customVoicesWithUnavailableId
    }
  });
  assert.equal(planEmptyMeaning.operationVoiceValidation.missing.hasUnavailableVoice, false);
  assert.equal(planEmptyMeaning.operationVoiceValidation.all.hasUnavailableVoice, false);

  // Case 3: Both channels have text+meaning, ID requirement is READY (with broken voice) while EN is MISSING (with Libby) ->
  // missing operation uses only Libby (not blocked!), while all/regenerate uses BrokenNeural (blocked!).
  const dualDoc = {
    id: 'doc-2',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: {},
    blocks: [{
      id: 'blk-2',
      blockType: 'paragraph',
      metadata: {},
      segments: [{ id: 'seg-2', text: 'Need EN.', meaning: 'ID sudah ready.', joinAfter: 'space' }]
    }]
  };
  const dualPlanAll = buildTextStructuredBulkGenerationPlan({
    documentTrees: [dualDoc],
    selection: { documents: [{ id: 'doc-2', scope: { blockIds: ['blk-2'] } }] },
    preferences: {
      generateText: true,
      generateMeaning: true,
      bulkGenerateSplit: true,
      bulkGenerateFull: false,
      bulkTextVoiceIds: ['en-GB-LibbyNeural'],
      bulkMeaningVoiceIds: ['id-ID-BrokenNeural'],
      edgeVoices: customVoicesWithUnavailableId
    }
  });
  const readyMeaningReq = dualPlanAll.requirements.find(r => r.channel === 'meaning');
  const planIdReady = buildTextStructuredBulkGenerationPlan({
    documentTrees: [dualDoc],
    selection: { documents: [{ id: 'doc-2', scope: { blockIds: ['blk-2'] } }] },
    audioVariants: [{
      id: 'var-id-1',
      segmentId: 'seg-2',
      channel: 'meaning',
      engine: 'edge',
      voiceId: 'id-ID-BrokenNeural',
      metadata: { audioRenderFingerprintV1: readyMeaningReq.renderFingerprint }
    }],
    runtimeAudioUrls: { 'var-id-1': { stagingBacked: true, url: 'blob:ready' } },
    preferences: {
      generateText: true,
      generateMeaning: true,
      bulkGenerateSplit: true,
      bulkGenerateFull: false,
      bulkTextVoiceIds: ['en-GB-LibbyNeural'],
      bulkMeaningVoiceIds: ['id-ID-BrokenNeural'],
      edgeVoices: customVoicesWithUnavailableId
    }
  });
  assert.equal(planIdReady.operationVoiceValidation.missing.hasUnavailableVoice, false);
  assert.equal(planIdReady.operationVoiceValidation.all.hasUnavailableVoice, true);

  resetHooks();
  const popupTree = renderTree(TextBatchPopup({
    inline: true,
    structuredTextBatch: {
      voices: customVoicesWithUnavailableId,
      preferences: {
        generateText: true,
        generateMeaning: true,
        bulkTextVoiceIds: ['en-GB-LibbyNeural'],
        bulkMeaningVoiceIds: ['id-ID-BrokenNeural'],
        edgeTextVoiceId: 'en-GB-LibbyNeural',
        edgeMeaningVoiceId: 'id-ID-GadisNeural'
      },
      generationCoverage: planIdReady.coverage,
      operationVoiceValidation: planIdReady.operationVoiceValidation,
      exportCoverage: { uniquePhysicalReady: 1, logicalReady: 1, splitPhysical: 1, fullPhysical: 0 },
      running: false
    }
  }));
  assert.equal(collectNodes(popupTree, n => n.props?.['data-text-bulk-generate-missing'] === 'true')[0].props.disabled, false, 'GENERATE MISSING stays enabled when missing slots only need valid EN voice');
  assert.equal(collectNodes(popupTree, n => n.props?.['data-text-bulk-regenerate-selected'] === 'true')[0].props.disabled, true, 'REGENERATE SELECTED remains blocked when full scope still targets unavailable ID voice');
  const exportButtons = collectNodes(popupTree, n => n.type === 'button' && ['DIRECT', 'AUDIO ZIP', 'PORTABLE'].some(lbl => collectText(n).includes(lbl)));
  assert.equal(exportButtons.length, 3);
  assert.ok(exportButtons.every(btn => btn.props.disabled === false), 'Ready bulk export buttons stay enabled');
});

await test('04 — App.jsx wiring validates actual requirements in runStructuredTextAudioGenerationBatch and slot-aware runBatchDownload', () => {
  assert.deepEqual(
    validateTextStructuredBulkRequirementsVoices({
      requirements: [{ channel: 'text', voiceId: 'en-GB-LibbyNeural' }],
      edgeVoices: customVoicesWithUnavailableId
    }),
    {
      unavailableTextVoices: [],
      unavailableMeaningVoices: [],
      unavailableVoiceIds: [],
      hasUnavailableVoice: false
    }
  );
  const appSrc = read('src/App.jsx');
  assert.doesNotMatch(appSrc, /const planValidation = !suppliedRequirements \? structuredTextBulkGenerationPlan\?\.voiceValidation/);
  assert.match(appSrc, /operationVoiceValidation:\s*structuredTextBulkGenerationPlan\?\.operationVoiceValidation \|\| null/);
  assert.match(appSrc, /resolveTableBatchUnavailableVoices\(\{\s*batchConfig,\s*generatorEngine,\s*edgeVoice,\s*edgeIndonesianVoice,\s*edgeVoices,\s*slots:\s*Array\.isArray\(tableAudioBatchCoverage\?\.slots\)/);
});

console.log(`\nROUND D0 CLOSURE GUARDS COMPLETE — ${pass} PASS, 0 FAIL`);
