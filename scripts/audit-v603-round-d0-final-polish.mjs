import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  applyEdgeVoiceCompatibilityResult,
  DEPRECATED_EDGE_VOICE_IDS,
  filterAvailableEdgeVoices,
  getEdgeVoiceDiagnostic,
  initialEdgeVoices,
  isEdgeVoiceUnavailable,
  UNSUPPORTED_EDGE_VOICE_IDS
} from '../src/constants/voiceConstants.js';
import {
  formatEdgeVoiceLabel,
  getEnglishRegionCountryName,
  groupEdgeVoicesByRegion,
  NAMED_ENGLISH_REGION_GROUPS,
  VOICE_REGION_GROUP_LABELS
} from '../src/domain/audio/voicePresentationDomain.js';
import {
  formatBrowserTtsVoiceLabel,
  groupBrowserTtsVoicesByRegion
} from '../src/domain/audio/browserTtsVoicePresentationDomain.js';
import {
  resolveBrowserTtsVoiceState,
  resolveDefaultIndonesianBrowserVoice
} from '../src/domain/audio/browserTtsVoiceDecisionDomain.js';
import { formatVoiceLabel, groupVoicesByRegion } from '../src/utils/audioUtils.js';
import { resolveTextStructuredBrowserVoiceState } from '../src/domain/text/textStructuredVoiceDomain.js';
import { resolveTextStructuredBrowserVoiceResolution } from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import {
  buildTextStructuredAudioDownloadProfileMetadata,
  resolveTextStructuredEffectiveDownloadVoice
} from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import {
  resolveTextStructuredEdgeVoiceForProfile,
  resolveTextStructuredGenerationVoiceState
} from '../src/domain/text/textStructuredAudioGenerationDomain.js';
import {
  buildTextStructuredBulkGenerationPlan,
  validateTextStructuredBulkVoiceDraft
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  publishTextStructuredBatchTelemetryThrottled,
  resetTextStructuredBatchTelemetry
} from '../src/services/audio/textStructuredBatchTelemetryService.js';
import { classifyEdgeTtsError } from '../server/edgeTtsService.js';

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
const telemetryService = await import('../src/services/audio/textStructuredBatchTelemetryService.js');
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
    if (resolved === path.join(root, 'src/services/audio/textStructuredBatchTelemetryService.js')) {
      return telemetryService;
    }
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

let passCount = 0;
const test = async (name, fn) => {
  await fn();
  passCount += 1;
  console.log(`PASS ${String(passCount).padStart(2, '0')} — ${name}`);
};

const EXPECTED_ENGLISH_GROUP_ORDER = [
  'UK (United Kingdom)',
  'US (United States)',
  'AU (Australia)',
  'NZ (New Zealand)',
  'SG (Singapore)',
  'CA (Canada)',
  'IE (Ireland)',
  'Other English'
];

await test('01 — Shared region order, alphabetical sorting, and Other English country-then-voice sorting (Browser TTS & Edge TTS)', () => {
  assert.deepEqual(NAMED_ENGLISH_REGION_GROUPS.map(([, label]) => label), EXPECTED_ENGLISH_GROUP_ORDER.slice(0, 7));
  assert.equal(getEnglishRegionCountryName('IN'), 'India');
  assert.equal(getEnglishRegionCountryName('ZA'), 'South Africa');
  assert.equal(getEnglishRegionCountryName('HK'), 'Hong Kong');

  const shuffledBrowser = [
    { name: 'Google Bahasa Indonesia', lang: 'id-ID' },
    { name: 'Microsoft Elimuan - English (Tanzania)', lang: 'en-TZ' },
    { name: 'Microsoft Prabhat Online (Natural) - English (India)', lang: 'en-IN' },
    { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' },
    { name: 'Microsoft Sam Online (Natural) - English (Hong Kong)', lang: 'en-HK' },
    { name: 'Microsoft Connor Online (Natural) - English (Ireland)', lang: 'en-IE' },
    { name: 'Microsoft Liam Online (Natural) - English (Canada)', lang: 'en-CA' },
    { name: 'Microsoft Wayne Online (Natural) - English (Singapore)', lang: 'en-SG' },
    { name: 'Microsoft Molly Online (Natural) - English (New Zealand)', lang: 'en-NZ' },
    { name: 'Microsoft William Online (Natural) - English (Australia)', lang: 'en-AU' },
    { name: 'Microsoft Natasha Online (Natural) - English (Australia)', lang: 'en-AU' },
    { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Thomas Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Dimas Online (Natural) - Javanese (Indonesia)', lang: 'jv-ID' }
  ];

  const browserGroups = groupBrowserTtsVoicesByRegion(shuffledBrowser);
  assert.deepEqual(Object.keys(browserGroups), [...EXPECTED_ENGLISH_GROUP_ORDER, 'Indonesia & Regional (ID/JV/SU)']);
  assert.deepEqual(
    browserGroups[VOICE_REGION_GROUP_LABELS.UK].map(v => formatBrowserTtsVoiceLabel(v)),
    ['Libby · Natural · UK', 'Thomas · Natural · UK']
  );
  assert.deepEqual(
    browserGroups[VOICE_REGION_GROUP_LABELS.US].map(v => formatBrowserTtsVoiceLabel(v)),
    ['Aria · Natural · US', 'Jenny · Natural · US']
  );
  assert.deepEqual(
    browserGroups[VOICE_REGION_GROUP_LABELS.AU].map(v => formatBrowserTtsVoiceLabel(v)),
    ['Natasha · Natural · AU', 'William · Natural · AU']
  );
  // Other English: Hong Kong -> India (Neerja before Prabhat) -> Tanzania, with full country names
  assert.deepEqual(
    browserGroups[VOICE_REGION_GROUP_LABELS.OTHER_EN].map(v => formatBrowserTtsVoiceLabel(v)),
    [
      'Sam · Natural · Hong Kong',
      'Neerja · Natural · India',
      'Prabhat · Natural · India',
      'Elimuan · Tanzania'
    ]
  );

  // Reverse input order for Edge TTS and verify identical region order + sorting + full country names
  const reversedEdge = [...initialEdgeVoices].reverse();
  const edgeGroupsMain = groupEdgeVoicesByRegion(reversedEdge, 'main');
  assert.deepEqual(Object.keys(edgeGroupsMain), EXPECTED_ENGLISH_GROUP_ORDER);
  assert.deepEqual(
    edgeGroupsMain[VOICE_REGION_GROUP_LABELS.UK].map(v => formatEdgeVoiceLabel(v)),
    [
      'Alfie (UK) · Unavailable',
      'Libby (UK)',
      'Maisie (UK - Child)',
      'Ryan (UK)',
      'Sonia (UK)',
      'Thomas (UK)'
    ]
  );
  assert.deepEqual(
    edgeGroupsMain[VOICE_REGION_GROUP_LABELS.OTHER_EN].map(v => formatEdgeVoiceLabel(v)),
    [
      'Sam (Hong Kong)',
      'Yan (Hong Kong)',
      'Neerja (India)',
      'Prabhat (India)',
      'Asilia (Kenya)',
      'Chilemba (Kenya)',
      'Abeo (Nigeria)',
      'Ezinne (Nigeria)',
      'James (Philippines)',
      'Rosa (Philippines)',
      'Leah (South Africa)',
      'Luke (South Africa)',
      'Elimu (Tanzania)',
      'Imani (Tanzania)'
    ]
  );

  const edgeGroupsAll = groupEdgeVoicesByRegion(reversedEdge, 'all');
  assert.deepEqual(Object.keys(edgeGroupsAll), [...EXPECTED_ENGLISH_GROUP_ORDER, VOICE_REGION_GROUP_LABELS.ID_GENERAL]);
  assert.deepEqual(
    edgeGroupsAll[VOICE_REGION_GROUP_LABELS.ID_GENERAL].map(v => v.id),
    [
      'id-ID-ArdiNeural',
      'id-ID-GadisNeural',
      'jv-ID-DimasNeural',
      'jv-ID-SitiNeural',
      'su-ID-JajangNeural',
      'su-ID-TutiNeural'
    ]
  );

  const edgeGroupsMeaning = groupEdgeVoicesByRegion(reversedEdge, 'meaning');
  assert.deepEqual(Object.keys(edgeGroupsMeaning), [
    VOICE_REGION_GROUP_LABELS.ID,
    VOICE_REGION_GROUP_LABELS.JV,
    VOICE_REGION_GROUP_LABELS.SU,
    VOICE_REGION_GROUP_LABELS.ID_OTHER
  ]);
  assert.deepEqual(edgeGroupsMeaning[VOICE_REGION_GROUP_LABELS.ID_OTHER], []);

  // Shared audioUtils entrypoints route Edge & Browser cleanly
  assert.equal(formatVoiceLabel(initialEdgeVoices.find(v => v.id === 'en-IN-NeerjaNeural')), 'Neerja (India)');
  assert.equal(formatVoiceLabel(initialEdgeVoices.find(v => v.id === 'en-GB-AlfieNeural')), 'Alfie (UK) · Unavailable');
  assert.deepEqual(Object.keys(groupVoicesByRegion(initialEdgeVoices, 'main')), EXPECTED_ENGLISH_GROUP_ORDER);
});

await test('02 — Edge TTS native <optgroup> presentation in GroupedVoiceSelect, Sidebar/Card/Global selectors, & region dividers in TextBatchPopup', () => {
  const { GroupedVoiceSelect, EdgeVoiceOptgroups } = loadModule(path.join(root, 'src/components/common/GroupedVoiceSelect.jsx'));
  const TextStructuredAudioControls = loadModule(path.join(root, 'src/components/text/TextStructuredAudioControls.jsx')).default;
  const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));
  resetHooks();

  const tableEdgeSelectTree = renderTree(GroupedVoiceSelect({
    voices: initialEdgeVoices,
    selectedValue: 'en-GB-AlfieNeural',
    onChange: () => {},
    context: 'main'
  }));
  const optgroups = collectNodes(tableEdgeSelectTree, n => n.type === 'optgroup');
  assert.deepEqual(optgroups.map(g => g.props.label), EXPECTED_ENGLISH_GROUP_ORDER);
  const alfieOption = collectNodes(tableEdgeSelectTree, n => n.type === 'option' && n.props?.value === 'en-GB-AlfieNeural')[0];
  assert.ok(alfieOption);
  assert.equal(alfieOption.props.disabled, true);
  assert.equal(collectText(alfieOption), 'Alfie (UK) · Unavailable');
  const libbyOption = collectNodes(tableEdgeSelectTree, n => n.type === 'option' && n.props?.value === 'en-GB-LibbyNeural')[0];
  assert.equal(libbyOption.props.disabled, false);
  assert.equal(collectText(libbyOption), 'Libby (UK)');
  const neeriaOption = collectNodes(tableEdgeSelectTree, n => n.type === 'option' && n.props?.value === 'en-IN-NeerjaNeural')[0];
  assert.equal(collectText(neeriaOption), 'Neerja (India)');

  const sidebarProps = {
    documentTree: { id: 'doc-1', editorModel: 'structured-v1', documentType: 'paragraph', metadata: {}, title: 'Workspace 1', blocks: [], speakers: [{ id: 'spk-1', displayName: 'Alice' }] },
    preferences: { audioSourceMode: 'local-first' },
    englishVoices: [{ name: 'Google UK English Female', lang: 'en-GB' }],
    indonesianVoices: [{ name: 'Google Bahasa Indonesia', lang: 'id-ID' }],
    generationPreferences: {
      edgeTextVoiceId: 'en-GB-LibbyNeural',
      edgeMeaningVoiceId: 'id-ID-GadisNeural',
      edgeRate: 0,
      edgePitch: 0
    },
    edgeGenerationVoices: initialEdgeVoices
  };
  const initialControlsTree = renderTree(TextStructuredAudioControls(sidebarProps));
  const downloadTabBtn = collectNodes(initialControlsTree, n => n.type === 'button' && n.props?.['data-text-audio-tab'] === 'download')[0];
  assert.ok(downloadTabBtn, 'Generate Audio tab button exists');
  downloadTabBtn.props.onClick();
  rerenderHooks();
  const textControlsTree = renderTree(TextStructuredAudioControls(sidebarProps));
  const sidebarSelects = collectNodes(textControlsTree, n => n.type === 'select');
  assert.ok(sidebarSelects.length >= 2, 'Global and Workspace Edge selects render');
  assert.ok(collectNodes([sidebarSelects[0]], n => n.type === 'optgroup').some(g => g.props.label === 'Other English'));

  // TextBatchPopup preserves scrollable max-h-40 / max-h-32 containers, region dividers inside them, Single/Multiple toggles, and Export EdgeVoiceOptgroups
  resetHooks();
  const batchTree = renderTree(TextBatchPopup({
    inline: true,
    structuredTextBatch: {
      voices: initialEdgeVoices,
      preferences: {
        bulkTextVoiceIds: ['en-GB-AlfieNeural'],
        bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
        edgeTextVoiceId: 'en-GB-LibbyNeural',
        edgeMeaningVoiceId: 'id-ID-GadisNeural'
      },
      generationCoverage: { total: 4, needGenerateMissing: 4, needGenerateWithStale: 4 },
      running: false
    }
  }));
  const enScroll = collectNodes(batchTree, n => n.props?.['data-text-bulk-en-voices'] === 'true')[0];
  const idScroll = collectNodes(batchTree, n => n.props?.['data-text-bulk-id-voices'] === 'true')[0];
  assert.ok(enScroll.props.className.includes('max-h-40'));
  assert.ok(idScroll.props.className.includes('max-h-32'));
  assert.equal(collectNodes([enScroll], n => n.props?.['data-text-bulk-region-group']).length, EXPECTED_ENGLISH_GROUP_ORDER.length);
  assert.ok(collectNodes(batchTree, n => n.props?.['data-text-bulk-en-voice-mode'] === 'true').length === 1);
  assert.ok(collectNodes(batchTree, n => n.type === 'optgroup').length >= EXPECTED_ENGLISH_GROUP_ORDER.length);
  assert.ok(typeof EdgeVoiceOptgroups === 'function');
});

await test('03 — Unavailable Edge voices stay visible/disabled, preserve saved legacy AlfiesNeural, allow clean Remove, & block generation', () => {
  assert.equal(initialEdgeVoices.length, 57);
  assert.equal(filterAvailableEdgeVoices(initialEdgeVoices).length, 44);
  assert.deepEqual(DEPRECATED_EDGE_VOICE_IDS, ['en-GB-AlfiesNeural']);
  assert.equal(UNSUPPORTED_EDGE_VOICE_IDS.length, 14);
  assert.equal(isEdgeVoiceUnavailable('en-GB-AlfieNeural', initialEdgeVoices), true);
  assert.equal(isEdgeVoiceUnavailable('en-GB-AlfiesNeural', initialEdgeVoices), true);
  assert.equal(initialEdgeVoices.filter(v => /Alfie/i.test(v.id)).map(v => v.id).join(','), 'en-GB-AlfieNeural');

  // FOLLOW_PLAYER download resolution skips unavailable Edge voices when mapping Browser TTS to Edge
  const mappedToEdge = resolveTextStructuredEffectiveDownloadVoice({
    documentTree: { id: 'doc-1', metadata: {} },
    block: { id: 'blk-1', metadata: {} },
    segment: { id: 'seg-1', text: 'Hi', meaning: 'Hai' },
    channel: 'text',
    preferences: {
      downloadMode: 'follow-player',
      edgeTextVoiceId: 'en-GB-LibbyNeural',
      playbackTextVoiceName: 'Microsoft Alfie Online (Natural) - English (United Kingdom)',
      edgeVoices: initialEdgeVoices
    }
  });
  assert.equal(isEdgeVoiceUnavailable(mappedToEdge.voiceId, initialEdgeVoices), false);

  // Saved unavailable voice is preserved without silent substitution and flagged unavailable
  const preservedElsie = resolveTextStructuredGenerationVoiceState({
    channel: 'text',
    requestedDownloadVoiceId: 'en-AU-ElsieNeural',
    preferences: { edgeTextVoiceId: 'en-GB-LibbyNeural' },
    edgeVoices: initialEdgeVoices
  });
  assert.equal(preservedElsie.engineVoiceId, 'en-AU-ElsieNeural');
  assert.equal(preservedElsie.unavailable, true);
  assert.match(preservedElsie.diagnostic, /Retired|not supported/i);

  const preservedTypo = resolveTextStructuredGenerationVoiceState({
    channel: 'text',
    requestedDownloadVoiceId: 'en-GB-AlfiesNeural',
    preferences: { edgeTextVoiceId: 'en-GB-LibbyNeural' },
    edgeVoices: initialEdgeVoices
  });
  assert.equal(preservedTypo.engineVoiceId, 'en-GB-AlfiesNeural');
  assert.equal(preservedTypo.unavailable, true);
  assert.match(preservedTypo.diagnostic, /misspelled legacy/i);

  const activeResolution = resolveTextStructuredEdgeVoiceForProfile({
    profileId: 'en-AU-ElsieNeural',
    channel: 'text',
    edgeVoices: initialEdgeVoices
  });
  assert.equal(activeResolution.matchedProfile, false);
  assert.equal(activeResolution.voiceId, 'en-GB-SoniaNeural');

  // Bulk validation + planning block unavailable voices cleanly until removed
  const invalidDraft = validateTextStructuredBulkVoiceDraft({
    includeText: true,
    includeMeaning: true,
    textVoiceIds: ['en-GB-AlfieNeural', 'en-AU-ElsieNeural'],
    meaningVoiceIds: ['id-ID-GadisNeural'],
    edgeVoices: initialEdgeVoices
  });
  assert.equal(invalidDraft.hasUnavailableVoice, true);
  assert.equal(invalidDraft.canGenerate, false);
  assert.deepEqual(invalidDraft.unavailableTextVoices, ['en-GB-AlfieNeural', 'en-AU-ElsieNeural']);

  const blockDoc = {
    id: 'doc-1',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: {},
    blocks: [{
      id: 'blk-1',
      blockType: 'paragraph',
      metadata: {},
      segments: [{ id: 'seg-1', text: 'Hello.', meaning: 'Halo.', joinAfter: 'space' }]
    }]
  };
  const blockedPlan = buildTextStructuredBulkGenerationPlan({
    documentTrees: [blockDoc],
    selection: { documents: [{ id: 'doc-1', scope: { blockIds: ['blk-1'] } }] },
    preferences: {
      bulkIncludeText: true,
      bulkIncludeMeaning: false,
      bulkIncludeSplit: true,
      bulkIncludeFull: false,
      bulkTextVoiceIds: ['en-AU-ElsieNeural'],
      bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
      edgeVoices: initialEdgeVoices
    }
  });
  assert.equal(blockedPlan.voiceValidation.hasUnavailableVoice, true);
  assert.equal(blockedPlan.voiceValidation.canGenerate, false);

  // TextBatchPopup renders unchecked unavailable voices disabled, renders explicit Remove button for saved unavailable voice, and invokes onPreferencesChange without that ID
  const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));
  resetHooks();
  const prefUpdates = [];
  const batchTree = renderTree(TextBatchPopup({
    inline: true,
    structuredTextBatch: {
      voices: initialEdgeVoices,
      preferences: {
        bulkTextVoiceIds: ['en-GB-AlfieNeural', 'en-GB-LibbyNeural'],
        bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
        edgeTextVoiceId: 'en-GB-LibbyNeural',
        edgeMeaningVoiceId: 'id-ID-GadisNeural'
      },
      generationCoverage: { total: 4, needGenerateMissing: 4, needGenerateWithStale: 4 },
      running: false,
      onPreferencesChange: patch => prefUpdates.push(patch)
    }
  }));
  const uncheckedElsieToggle = collectNodes(batchTree, n => n.props?.['data-text-bulk-voice-option'] === 'text:en-AU-ElsieNeural')[0];
  assert.equal(uncheckedElsieToggle.props.disabled, true);
  const checkedAlfieRemove = collectNodes(batchTree, n => n.type === 'button' && n.props?.['data-text-bulk-remove-unavailable'] === 'text:en-GB-AlfieNeural')[0];
  assert.ok(checkedAlfieRemove, 'Explicit Remove button renders as sibling next to saved unavailable voice');
  const blockedReason = collectNodes(batchTree, n => n.props?.['data-text-bulk-generate-blocked-reason'] === 'true')[0];
  assert.ok(blockedReason);
  const generateMissingBtn = collectNodes(batchTree, n => n.props?.['data-text-bulk-generate-missing'] === 'true')[0];
  assert.equal(generateMissingBtn.props.disabled, true);

  checkedAlfieRemove.props.onClick();
  assert.deepEqual(prefUpdates, [{ bulkTextVoiceIds: ['en-GB-LibbyNeural'] }]);

  // Table BatchPopup disables DOWNLOAD MISSING & REDOWNLOAD SELECTED when unavailable Edge voice is selected
  const { BatchPopup } = loadModule(path.join(root, 'src/components/table/BatchPopup.jsx'));
  resetHooks();
  const tableBatchTree = renderTree(BatchPopup({
    inline: true,
    mode: 'table',
    generatorEngine: 'edge',
    edgeVoice: 'en-GB-AlfieNeural',
    edgeIndonesianVoice: 'id-ID-GadisNeural',
    edgeVoices: initialEdgeVoices,
    advancedDatasetStats: { hasAdvanced: false },
    batchConfig: { doWord: true, doSentence: true, doWordTranslation: true, doMeaning: true, start: 1, end: 10 },
    tableCoverage: { total: 10, needDownload: 5 },
    DownloadCloudIcon: () => null
  }));
  assert.ok(collectNodes(tableBatchTree, n => n.props?.['data-table-batch-unavailable-warning'] === 'true').length === 1);
  const tableDownloadBtn = collectNodes(tableBatchTree, n => n.type === 'button' && collectText(n).includes('DOWNLOAD MISSING'))[0];
  const tableRedownloadBtn = collectNodes(tableBatchTree, n => n.type === 'button' && collectText(n).includes('REDOWNLOAD SELECTED'))[0];
  assert.equal(tableDownloadBtn.props.disabled, true);
  assert.equal(tableRedownloadBtn.props.disabled, true);
});

await test('04 — TextStructuredCardAudioPanel warns & disables unavailable Edge generation while leaving Ready Full MP3 export enabled', () => {
  const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
  resetHooks();

  const block = {
    id: 'blk-1',
    blockType: 'paragraph',
    metadata: buildTextStructuredAudioDownloadProfileMetadata({
      metadata: {},
      channel: 'text',
      mode: 'custom',
      voiceId: 'en-GB-AlfieNeural'
    }),
    segments: [{ id: 'seg-1', text: 'Test line.', meaning: 'Baris uji.', joinAfter: 'space' }]
  };
  const enRecord = buildTextStructuredFullArtifactRecord({
    block,
    channel: 'text',
    engine: 'edge',
    voiceId: 'en-GB-AlfieNeural',
    rate: 0,
    pitch: 0,
    language: 'en'
  });
  const doc = {
    id: 'doc-1',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: {},
    blocks: [{ ...block, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: block.metadata, artifact: enRecord }) }]
  };
  const readyBlock = doc.blocks[0];
  const panelTree = renderTree(TextStructuredCardAudioPanel({
    documentTree: doc,
    block: readyBlock,
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: initialEdgeVoices,
    cardCoverage: { total: 2, covered: 0, needDownload: 2 },
    runtimeFullAudio: { [enRecord.fullArtifactFingerprint]: { stagingBacked: true, ready: true } },
    initialSurface: 'download'
  }));

  const fullExportBtn = collectNodes(panelTree, n => n.type === 'button' && n.props?.['data-text-card-full-export'] === 'text')[0];
  assert.equal(fullExportBtn.props.disabled, false, 'Ready Full MP3 export remains available even if voice is now unavailable');
  const enSplitReadinessBox = collectNodes(panelTree, n => n.props?.['data-text-card-split-readiness'] === 'text')[0];
  const enSplitGenBtn = collectNodes([enSplitReadinessBox], n => n.type === 'button')[0];
  assert.equal(enSplitGenBtn.props.disabled, true, 'EN Split generation blocked for unavailable Edge voice');
  const genMissingBtn = collectNodes(panelTree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true')[0];
  assert.equal(genMissingBtn.props.disabled, true, 'Card footer GENERATE MISSING blocked when target slot resolves to unavailable Edge voice');
  assert.ok(collectText(panelTree).includes('Alfie (UK) · Unavailable'));
});

await test('05 — Reversible Edge voice compatibility & server 422 vs transient 500 boundary', async () => {
  // Reversible state transitions
  const recoveredCatalog = applyEdgeVoiceCompatibilityResult(initialEdgeVoices, 'en-GB-AlfieNeural', { available: true });
  assert.equal(isEdgeVoiceUnavailable('en-GB-AlfieNeural', recoveredCatalog), false);
  assert.equal(getEdgeVoiceDiagnostic('en-GB-AlfieNeural', recoveredCatalog), '');

  const degradedCatalog = applyEdgeVoiceCompatibilityResult(recoveredCatalog, 'en-GB-LibbyNeural', {
    available: false,
    diagnostic: 'Temporary test unavailability'
  });
  assert.equal(isEdgeVoiceUnavailable('en-GB-LibbyNeural', degradedCatalog), true);
  assert.equal(getEdgeVoiceDiagnostic('en-GB-LibbyNeural', degradedCatalog), 'Temporary test unavailability');

  const restoredCatalog = applyEdgeVoiceCompatibilityResult(degradedCatalog, 'en-GB-LibbyNeural', { available: true });
  assert.equal(isEdgeVoiceUnavailable('en-GB-LibbyNeural', restoredCatalog), false);

  // Server classification: known blocklist -> 422 non-retryable; absent from getVoices() transient stream close -> 500 retryable
  const alfie422 = await classifyEdgeTtsError({
    error: new Error('Stream closed before synthesis completed'),
    voice: 'en-GB-AlfieNeural',
    hadAudioBytes: false
  });
  assert.equal(alfie422.statusCode, 422);
  assert.equal(alfie422.code, 'EDGE_VOICE_UNSUPPORTED');
  assert.equal(alfie422.retryable, false);

  const alfies422 = await classifyEdgeTtsError({
    error: new Error('Stream closed'),
    voice: 'en-GB-AlfiesNeural',
    hadAudioBytes: false
  });
  assert.equal(alfies422.statusCode, 422);
  assert.equal(alfies422.code, 'EDGE_VOICE_UNSUPPORTED');

  const william500 = await classifyEdgeTtsError({
    error: new Error('Stream closed before synthesis completed (no turn.end received).'),
    voice: 'en-AU-WilliamNeural',
    hadAudioBytes: false,
    fetchUpstreamVoices: async () => new Set(['en-GB-LibbyNeural'])
  });
  assert.equal(william500.statusCode, 500);
  assert.equal(william500.retryable, true);
});

await test('06 — Stop button telemetry counter synchronises with TextBatchLiveTelemetry across running/cancelling/completed states without parent re-renders', () => {
  const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));
  const popupSource = read('src/components/text/TextBatchPopup.jsx');
  assert.ok(popupSource.includes('const TextBatchStopButtonContent = memoComponent'));
  assert.ok(popupSource.includes('const TextBatchLiveTelemetry = memoComponent'));
  assert.ok(!popupSource.split('export const TextBatchPopup')[1].includes('useSyncExternalStore'));

  try {
    resetTextStructuredBatchTelemetry({
      sessionId: 'batch-sync-1',
      status: 'running',
      total: 10,
      processed: 3,
      remaining: 7
    });
    resetHooks();
    const runningTree = renderTree(TextBatchPopup({
      inline: true,
      structuredTextBatch: {
        voices: initialEdgeVoices,
        preferences: {
          bulkTextVoiceIds: ['en-GB-LibbyNeural'],
          bulkMeaningVoiceIds: ['id-ID-GadisNeural']
        },
        generationCoverage: { total: 10 },
        running: true,
        cancelling: false,
        statusText: 'stale-prop-ignored'
      }
    }));
    const stopBtnRunning = collectNodes(runningTree, n => n.type === 'button' && collectText(n).includes('STOP'))[0];
    const telemetryRunning = collectNodes(runningTree, n => n.props?.['data-live-batch-telemetry'] === 'text')[0];
    assert.ok(collectText(stopBtnRunning).includes('STOP 3/10'), `Expected STOP 3/10, got "${collectText(stopBtnRunning)}"`);
    assert.ok(collectText(telemetryRunning).includes('3/10'));

    publishTextStructuredBatchTelemetryThrottled({ processed: 7, remaining: 3, status: 'cancelling' }, { force: true });
    resetHooks();
    const cancellingTree = renderTree(TextBatchPopup({
      inline: true,
      structuredTextBatch: {
        voices: initialEdgeVoices,
        preferences: { bulkTextVoiceIds: ['en-GB-LibbyNeural'], bulkMeaningVoiceIds: ['id-ID-GadisNeural'] },
        generationCoverage: { total: 10 },
        running: true,
        cancelling: true
      }
    }));
    const stopBtnCancelling = collectNodes(cancellingTree, n => n.type === 'button' && collectText(n).includes('Stopping'))[0];
    assert.ok(collectText(stopBtnCancelling).includes('Stopping… 7/10'), `Got "${collectText(stopBtnCancelling)}"`);

    publishTextStructuredBatchTelemetryThrottled({ processed: 10, remaining: 0, status: 'completed-with-errors', failed: 1 }, { force: true });
    resetHooks();
    const completedTree = renderTree(TextBatchPopup({
      inline: true,
      structuredTextBatch: {
        voices: initialEdgeVoices,
        preferences: { bulkTextVoiceIds: ['en-GB-LibbyNeural'], bulkMeaningVoiceIds: ['id-ID-GadisNeural'] },
        generationCoverage: { total: 10 },
        running: true
      }
    }));
    const stopBtnCompleted = collectNodes(completedTree, n => n.type === 'button' && collectText(n).includes('Completing'))[0];
    const telemetryCompleted = collectNodes(completedTree, n => n.props?.['data-live-batch-telemetry'] === 'text')[0];
    assert.ok(collectText(stopBtnCompleted).includes('Completing 10/10'));
    assert.ok(collectText(telemetryCompleted).includes('10/10'));
  } finally {
    resetTextStructuredBatchTelemetry();
  }
});

await test('07 — Chrome Indonesian Browser TTS defaults to Google Bahasa Indonesia over Andika & upgrades cleanly on async voiceschanged without overriding explicit selection', () => {
  const { executeBrowserTtsVoiceLifecycleEffect } = loadModule(path.join(root, 'src/services/audio/audioRuntimeLifecycleService.js'));
  const andika = { name: 'Microsoft Andika - Indonesian (Indonesia)', lang: 'id-ID' };
  const googleIndo = { name: 'Google Bahasa Indonesia', lang: 'id-ID' };
  const gadis = { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' };
  const ardi = { name: 'Microsoft Ardi Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' };

  // Chrome: Google Bahasa Indonesia beats Microsoft Andika & Ardi across Table, Legacy, and Structured Text
  assert.equal(resolveDefaultIndonesianBrowserVoice([andika, googleIndo])?.name, 'Google Bahasa Indonesia');
  assert.equal(resolveDefaultIndonesianBrowserVoice([ardi, andika])?.name, ardi.name);
  assert.equal(resolveDefaultIndonesianBrowserVoice([andika])?.name, andika.name);
  // Edge: Gadis remains #1
  assert.equal(resolveDefaultIndonesianBrowserVoice([andika, googleIndo, gadis])?.name, gadis.name);

  const chromeEnglishVoices = [{ name: 'Google UK English Female', lang: 'en-GB' }];
  assert.equal(resolveBrowserTtsVoiceState([...chromeEnglishVoices, andika, googleIndo]).defaultId?.name, 'Google Bahasa Indonesia');
  assert.equal(
    resolveTextStructuredBrowserVoiceState({ englishVoices: chromeEnglishVoices, indonesianVoices: [andika, googleIndo] }).meaningVoice?.name,
    'Google Bahasa Indonesia'
  );
  const channelUnset = resolveTextStructuredBrowserVoiceResolution({
    documentTree: { id: 'doc-1', metadata: { audioVoiceOverrideV1: { channels: { meaning: 'Microsoft Missing Old Voice' } } } },
    channel: 'meaning',
    availableBrowserVoices: [andika, googleIndo]
  });
  assert.equal(channelUnset.effectiveVoiceName, 'Google Bahasa Indonesia');
  assert.equal(channelUnset.effectiveSource, 'browser-fallback');

  // Edge fixture preserves Gadis
  assert.equal(resolveBrowserTtsVoiceState([gadis, andika, googleIndo]).defaultId?.name, gadis.name);

  // Async onvoiceschanged: starts with Andika only -> auto-upgrades to Google Bahasa Indonesia once Chrome finishes populating voices
  let currentVoices = [andika];
  let selectedVoice = null;
  let selectedIndonesianVoice = null;
  const selectedVoiceRef = { current: null };
  const selectedIndonesianVoiceRef = { current: null };
  const selectedVoiceExplicitRef = { current: false };
  const selectedIndonesianVoiceExplicitRef = { current: false };
  const mockSynth = {
    getVoices: () => currentVoices,
    onvoiceschanged: null
  };
  const cleanup = executeBrowserTtsVoiceLifecycleEffect({
    synth: mockSynth,
    selectedVoiceRef,
    selectedIndonesianVoiceRef,
    selectedVoiceExplicitRef,
    selectedIndonesianVoiceExplicitRef,
    setVoices: () => {},
    setSelectedVoice: v => { selectedVoice = v; selectedVoiceRef.current = v; },
    setIndonesianVoices: () => {},
    setSelectedIndonesianVoice: v => { selectedIndonesianVoice = v; selectedIndonesianVoiceRef.current = v; }
  });
  try {
    assert.equal(selectedIndonesianVoice?.name, andika.name);
    assert.equal(selectedVoice, null);
    currentVoices = [{ name: 'Google UK English Female', lang: 'en-GB' }, andika, googleIndo];
    mockSynth.onvoiceschanged();
    assert.equal(selectedIndonesianVoice?.name, 'Google Bahasa Indonesia', 'Auto-upgrades Andika to Google Bahasa Indonesia on async voiceschanged');
    assert.equal(selectedVoice?.name, 'Google UK English Female');

    // Explicit user choice of Andika is NOT overwritten by later voiceschanged
    selectedIndonesianVoiceExplicitRef.current = true;
    selectedIndonesianVoice = andika;
    selectedIndonesianVoiceRef.current = andika;
    mockSynth.onvoiceschanged();
    assert.equal(selectedIndonesianVoice?.name, andika.name, 'Explicit user choice is preserved');
  } finally {
    cleanup?.();
  }
});

await test('08 — App.jsx & audioTtsSideEffectService wiring preserves handleStructuredTextBulkExport/HealthCheck ordering & blocks unavailable Edge generation', () => {
  const appSource = read('src/App.jsx');
  const exportIdx = appSource.indexOf('const handleStructuredTextBulkExport =');
  const healthIdx = appSource.indexOf('const handleStructuredTextEdgeHealthCheck =');
  assert.ok(exportIdx > 0 && healthIdx > exportIdx, 'handleStructuredTextEdgeHealthCheck stays immediately after handleStructuredTextBulkExport');
  assert.doesNotMatch(appSource.slice(exportIdx + 40, healthIdx), /const\s+[a-zA-Z0-9_]+\s*=\s*useCallback/, 'No new useCallback inserted between BulkExport and EdgeHealthCheck');

  assert.match(appSource, /selectedVoiceExplicitRef\s*=\s*useRef\(false\)/);
  assert.match(appSource, /selectedIndonesianVoiceExplicitRef\s*=\s*useRef\(false\)/);
  assert.match(appSource, /applyEdgeVoiceCompatibilityResult/);
  assert.match(appSource, /status:\s*'unavailable-voice'/);
  assert.match(appSource, /generationVoiceStateBase\.engine === 'edge' && generationVoiceStateBase\.unavailable/);
  assert.equal((appSource.match(/initialEdgeVoices/g) || []).length, 0, 'App.jsx uses stateful edgeVoices instead of static initialEdgeVoices');

  const sideEffectSource = read('src/services/audio/audioTtsSideEffectService.js');
  assert.match(sideEffectSource, /error\.status = response\.status/);
  assert.match(sideEffectSource, /EDGE_VOICE_UNSUPPORTED/);
});

console.log(`\nROUND D0 FINAL POLISH AUDIT COMPLETE — ${passCount} PASS, 0 FAIL`);
