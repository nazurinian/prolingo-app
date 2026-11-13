import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  BROWSER_TTS_GROUP_LABELS,
  dedupeBrowserTtsVoices,
  formatBrowserTtsVoiceLabel,
  groupBrowserTtsVoicesByRegion
} from '../src/domain/audio/browserTtsVoicePresentationDomain.js';
import { formatVoiceLabel, groupVoicesByRegion } from '../src/utils/audioUtils.js';
import { formatTextStructuredBrowserVoiceLabel } from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import { resolveBrowserTtsVoiceState } from '../src/domain/audio/browserTtsVoiceDecisionDomain.js';
import { initialEdgeVoices, UNSUPPORTED_EDGE_VOICE_IDS } from '../src/constants/voiceConstants.js';
import { classifyEdgeTtsError } from '../server/edgeTtsService.js';
import { executeTextStructuredEdgeAudioRequest } from '../src/services/audio/textStructuredEdgeAudioDownloadService.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  getTextStructuredBatchTelemetrySnapshot,
  publishTextStructuredBatchTelemetryThrottled,
  resetTextStructuredBatchTelemetry,
  subscribeTextStructuredBatchTelemetry
} from '../src/services/audio/textStructuredBatchTelemetryService.js';

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
      return {
        getTextStructuredBatchTelemetrySnapshot,
        publishTextStructuredBatchTelemetryThrottled,
        resetTextStructuredBatchTelemetry,
        subscribeTextStructuredBatchTelemetry
      };
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

const sampleBrowserVoices = [
  { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
  { name: 'Microsoft Maisie Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
  { name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
  { name: 'Google UK English Female', lang: 'en-GB' },
  { name: 'Microsoft Ana Online (Natural) - English (United States)', lang: 'en-US' },
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Natasha Online (Natural) - English (Australia)', lang: 'en-AU' },
  { name: 'Microsoft Mitchell Online (Natural) - English (New Zealand)', lang: 'en-NZ' },
  { name: 'Microsoft Luna Online (Natural) - English (Singapore)', lang: 'en-SG' },
  { name: 'Microsoft Clara Online (Natural) - English (Canada)', lang: 'en-CA' },
  { name: 'Microsoft Connor Online (Natural) - English (Ireland)', lang: 'en-IE' },
  { name: 'Microsoft Neerja Online (Natural) - English (India)', lang: 'en-IN' },
  { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' },
  { name: 'Siti', lang: 'jv-ID' },
  { name: 'Jajang', lang: 'su-ID' },
  { name: 'Google français', lang: 'fr-FR' }
];

await test('F1-A: Shared compact labels cover Natural/Standard/Region/Child without inventing Natural or Child', () => {
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' }), 'Libby · Natural · UK');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft Maisie Online (Natural) - English (United Kingdom)', lang: 'en-GB' }), 'Maisie · Natural · UK · Child');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB' }), 'Sonia · Natural · UK');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft Ana Online (Natural) - English (United States)', lang: 'en-US' }), 'Ana · Natural · US · Child');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' }), 'Gadis · Natural · ID');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Siti', lang: 'jv-ID' }), 'Siti · JV');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Jajang', lang: 'su-ID' }), 'Jajang · SU');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Google UK English Female', lang: 'en-GB' }), 'Google UK English Female · UK');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft David - English (United States)', lang: 'en-US' }), 'David · US');
  assert.equal(formatBrowserTtsVoiceLabel({ name: 'Microsoft David Desktop - English (United States)', lang: 'en-US' }), 'David · Standard · US');

  // Legacy wrappers delegate to the single source of truth
  assert.equal(formatVoiceLabel({ name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' }), 'Libby · Natural · UK');
  assert.equal(formatTextStructuredBrowserVoiceLabel({ name: 'Microsoft Maisie Online (Natural) - English (United Kingdom)', lang: 'en-GB' }), 'Maisie · Natural · UK · Child');
});

await test('F1-A: Shared region <optgroup> ordering matches UK -> US -> AU -> NZ -> SG -> CA -> IE -> Other English -> ID/JV/SU', () => {
  const enGroups = groupBrowserTtsVoicesByRegion(sampleBrowserVoices, 'main');
  assert.deepEqual(Object.keys(enGroups), [
    BROWSER_TTS_GROUP_LABELS.UK,
    BROWSER_TTS_GROUP_LABELS.US,
    BROWSER_TTS_GROUP_LABELS.AU,
    BROWSER_TTS_GROUP_LABELS.NZ,
    BROWSER_TTS_GROUP_LABELS.SG,
    BROWSER_TTS_GROUP_LABELS.CA,
    BROWSER_TTS_GROUP_LABELS.IE,
    BROWSER_TTS_GROUP_LABELS.OTHER_EN
  ]);
  assert.equal(enGroups[BROWSER_TTS_GROUP_LABELS.UK].length, 4);
  assert.equal(enGroups[BROWSER_TTS_GROUP_LABELS.NZ][0].name.includes('Mitchell'), true);
  assert.equal(enGroups[BROWSER_TTS_GROUP_LABELS.CA][0].name.includes('Clara'), true);
  assert.equal(enGroups[BROWSER_TTS_GROUP_LABELS.IE][0].name.includes('Connor'), true);
  assert.equal(enGroups[BROWSER_TTS_GROUP_LABELS.OTHER_EN][0].name.includes('Neerja'), true);

  const idGroups = groupBrowserTtsVoicesByRegion(sampleBrowserVoices, 'meaning');
  assert.deepEqual(Object.keys(idGroups), [
    BROWSER_TTS_GROUP_LABELS.ID,
    BROWSER_TTS_GROUP_LABELS.JV,
    BROWSER_TTS_GROUP_LABELS.SU,
    BROWSER_TTS_GROUP_LABELS.ID_OTHER
  ]);
  assert.equal(idGroups[BROWSER_TTS_GROUP_LABELS.ID].length, 1);
  assert.equal(idGroups[BROWSER_TTS_GROUP_LABELS.JV][0].name, 'Siti');
  assert.equal(idGroups[BROWSER_TTS_GROUP_LABELS.SU][0].name, 'Jajang');

  const generalGroups = groupVoicesByRegion(sampleBrowserVoices, 'general');
  assert.equal(Object.keys(generalGroups).at(-1), BROWSER_TTS_GROUP_LABELS.ID_GENERAL);
  assert.equal(generalGroups[BROWSER_TTS_GROUP_LABELS.ID_GENERAL].length, 3);

  // Dedupe keeps unique names while preserving voice objects & .lang
  const duped = dedupeBrowserTtsVoices([sampleBrowserVoices[0], { ...sampleBrowserVoices[0] }]);
  assert.equal(duped.length, 1);
  assert.equal(duped[0].lang, 'en-GB');
});

await test('F1-A: GroupedVoiceSelect renders grouped Browser TTS labels, preserves raw names, and retains unavailable saved value', () => {
  const { GroupedVoiceSelect } = loadModule(path.join(root, 'src/components/common/GroupedVoiceSelect.jsx'));
  resetHooks();
  const enTree = renderTree(GroupedVoiceSelect({
    voices: sampleBrowserVoices,
    selectedValue: 'Missing Saved Browser Voice',
    onChange: () => {},
    context: 'main'
  }));
  const optgroups = collectNodes(enTree, n => n.type === 'optgroup');
  const options = collectNodes(enTree, n => n.type === 'option');
  assert.deepEqual(
    optgroups.map(g => g.props.label),
    [
      'UK (United Kingdom)',
      'US (United States)',
      'AU (Australia)',
      'NZ (New Zealand)',
      'SG (Singapore)',
      'CA (Canada)',
      'IE (Ireland)',
      'Other English'
    ]
  );
  assert.ok(options.some(o => o.props.value === 'Missing Saved Browser Voice' && collectText(o).includes('Unavailable in browser')));
  assert.ok(options.some(o => o.props.value === 'Microsoft Libby Online (Natural) - English (United Kingdom)' && collectText(o).trim() === 'Libby · Natural · UK'));
  assert.ok(options.some(o => o.props.value === 'Microsoft Maisie Online (Natural) - English (United Kingdom)' && collectText(o).trim() === 'Maisie · Natural · UK · Child'));
});

await test('F1-A + F1-B UI: TextStructuredAudioControls groups Browser TTS voices, shows .lang-accurate Effective label, and never injects static Edge voices', () => {
  const TextStructuredAudioControls = loadModule(path.join(root, 'src/components/text/TextStructuredAudioControls.jsx')).default;
  const englishBrowser = sampleBrowserVoices.filter(v => String(v.lang).startsWith('en-'));
  const indoBrowser = sampleBrowserVoices.filter(v => ['id-ID', 'jv-ID', 'su-ID'].includes(v.lang));
  resetHooks();
  const doc = {
    id: 'doc-1',
    editorModel: 'structured-v1',
    documentType: 'mixed',
    metadata: {},
    blocks: [
      { id: 'b1', blockType: 'paragraph', segments: [{ id: 's1', text: 'Hello.', meaning: 'Halo.' }] },
      {
        id: 'b2',
        blockType: 'conversation',
        segments: [
          { id: 's2', speaker: 'Anna', text: 'Hi!', meaning: 'Hai!', metadata: { speakerIdentityV1: 'spk_anna' } }
        ]
      }
    ]
  };
  const tree = renderTree(TextStructuredAudioControls({
    documentTree: doc,
    preferences: {
      audioSourceMode: 'local-first',
      browserTextVoiceName: null,
      browserMeaningVoiceName: null
    },
    englishVoices: englishBrowser,
    indonesianVoices: indoBrowser,
    defaultTextVoiceName: 'Google UK English Female',
    defaultMeaningVoiceName: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)',
    generationPreferences: {
      edgeTextVoiceId: 'en-AU-ElsieNeural',
      edgeMeaningVoiceId: 'id-ID-GadisNeural',
      edgeRate: 0,
      edgePitch: 0
    },
    edgeGenerationVoices: initialEdgeVoices
  }));

  const globalEnSelect = collectNodes(tree, n => n.type === 'select' && n.props?.['data-text-global-voice-select'] === 'text')[0];
  assert.ok(globalEnSelect, 'Global EN selector rendered');
  const enGroups = collectNodes([globalEnSelect], n => n.type === 'optgroup').map(g => g.props.label);
  assert.ok(enGroups.includes('UK (United Kingdom)') && enGroups.includes('NZ (New Zealand)') && enGroups.includes('CA (Canada)') && enGroups.includes('IE (Ireland)'));
  const enOptions = collectNodes([globalEnSelect], n => n.type === 'option');
  assert.ok(enOptions.some(o => o.props.value === 'Microsoft Maisie Online (Natural) - English (United Kingdom)' && collectText(o).trim() === 'Maisie · Natural · UK · Child'));
  assert.ok(!enOptions.some(o => o.props.value === 'en-GB-LibbyNeural'), 'Static Edge voice never injected into Browser TTS selector');

  const globalEnEffective = collectNodes(tree, n => n.props?.['data-text-global-voice-effective'] === 'text')[0];
  assert.ok(collectText(globalEnEffective).includes('Google UK English Female · UK'));

  const idSection = collectNodes(tree, n => n.props?.['data-text-workspace-narrator-channel'] === 'meaning')[0];
  const idGroups = collectNodes([idSection], n => n.type === 'optgroup').map(g => g.props.label);
  assert.deepEqual(idGroups, ['Indonesian (ID)', 'Javanese (JV)', 'Sundanese (SU)']);

  // Switch tab to Generate Audio ("download") and re-render to inspect Edge Global selector
  const downloadTabBtn = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-audio-tab'] === 'download')[0];
  assert.ok(downloadTabBtn, 'Generate Audio tab button exists');
  downloadTabBtn.props.onClick();
  rerenderHooks();
  const downloadTabTree = renderTree(TextStructuredAudioControls({
    documentTree: doc,
    preferences: {
      audioSourceMode: 'local-first',
      browserTextVoiceName: null,
      browserMeaningVoiceName: null
    },
    englishVoices: englishBrowser,
    indonesianVoices: indoBrowser,
    defaultTextVoiceName: 'Google UK English Female',
    defaultMeaningVoiceName: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)',
    generationPreferences: {
      edgeTextVoiceId: 'en-AU-ElsieNeural',
      edgeMeaningVoiceId: 'id-ID-GadisNeural',
      edgeRate: 0,
      edgePitch: 0
    },
    edgeGenerationVoices: initialEdgeVoices
  }));

  // Retired saved Edge voice stays visible as disabled Unavailable without silent substitution
  const edgeSelectOptions = collectNodes(downloadTabTree, n => n.type === 'option' && n.props?.value === 'en-AU-ElsieNeural');
  assert.ok(edgeSelectOptions.some(o => o.props?.disabled === true && collectText(o).includes('Elsie (AU) · Unavailable')));
});

await test('F1-A: TextStructuredCardAudioPanel Player surface groups Browser TTS voices and formats labels consistently', () => {
  const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
  const englishBrowser = sampleBrowserVoices.filter(v => String(v.lang).startsWith('en-'));
  const indoBrowser = sampleBrowserVoices.filter(v => ['id-ID', 'jv-ID', 'su-ID'].includes(v.lang));
  resetHooks();
  const block = {
    id: 'blk-card-1',
    blockType: 'paragraph',
    metadata: {
      audioVoiceOverrideV1: {
        channels: { text: 'Missing Saved Card Voice', meaning: null }
      }
    },
    segments: [{ id: 'seg-card-1', text: 'Sample text.', meaning: 'Contoh teks.' }]
  };
  const doc = { id: 'doc-1', editorModel: 'structured-v1', documentType: 'paragraph', metadata: {}, blocks: [block] };
  const playerTree = renderTree(TextStructuredCardAudioPanel({
    documentTree: doc,
    block,
    englishVoices: englishBrowser,
    indonesianVoices: indoBrowser,
    defaultTextVoiceName: 'Microsoft Libby Online (Natural) - English (United Kingdom)',
    defaultMeaningVoiceName: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)',
    initialSurface: 'player'
  }));
  const cardEnSelect = collectNodes(playerTree, n => n.type === 'select' && n.props?.['data-text-voice-override-select'] === 'blk-card-1:text')[0];
  assert.ok(cardEnSelect, 'Card EN Browser TTS select rendered');
  assert.ok(collectNodes([cardEnSelect], n => n.type === 'optgroup').some(g => g.props.label === 'NZ (New Zealand)'));
  const cardEnOptions = collectNodes([cardEnSelect], n => n.type === 'option');
  assert.ok(cardEnOptions.some(o => o.props.value === 'Missing Saved Card Voice' && collectText(o).includes('Unavailable in browser')));
  assert.ok(cardEnOptions.some(o => o.props.value === 'Microsoft Ana Online (Natural) - English (United States)' && collectText(o).trim() === 'Ana · Natural · US · Child'));
  assert.ok(cardEnOptions.some(o => o.props.value === '' && collectText(o).includes('Libby · Natural · UK')));
});

await test('F1-A: resolveBrowserTtsVoiceState keeps Sonia/Gadis + Chrome UK Female default policy unchanged', () => {
  const chromeRes = resolveBrowserTtsVoiceState([
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' }
  ]);
  assert.equal(chromeRes.defaultEng?.name, 'Google UK English Female');
  assert.equal(chromeRes.defaultId?.name, 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)');

  const soniaRes = resolveBrowserTtsVoiceState([
    { name: 'Microsoft Libby Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Gadis Online (Natural) - Indonesian (Indonesia)', lang: 'id-ID' }
  ]);
  assert.equal(soniaRes.defaultEng?.name, 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
});

await test('F1-B: initialEdgeVoices keeps 44 active + 13 visible unavailable voices without duplicating deprecated en-GB-AlfiesNeural', () => {
  const { filterAvailableEdgeVoices, isEdgeVoiceUnavailable } = loadModule(path.join(root, 'src/constants/voiceConstants.js'));
  const ids = new Set(initialEdgeVoices.map(v => v.id));
  assert.equal(initialEdgeVoices.length, 57);
  const activeVoices = filterAvailableEdgeVoices(initialEdgeVoices);
  assert.equal(activeVoices.length, 44);
  assert.equal(ids.has('en-GB-AlfieNeural'), true);
  assert.equal(isEdgeVoiceUnavailable('en-GB-AlfieNeural', initialEdgeVoices), true);
  assert.equal(ids.has('en-AU-ElsieNeural'), true);
  assert.equal(isEdgeVoiceUnavailable('en-AU-ElsieNeural', initialEdgeVoices), true);
  assert.equal(ids.has('en-GB-AlfiesNeural'), false);
  assert.equal(isEdgeVoiceUnavailable('en-GB-AlfiesNeural', initialEdgeVoices), true);
  assert.equal(isEdgeVoiceUnavailable('en-AU-NatashaNeural', initialEdgeVoices), false);
  assert.equal(isEdgeVoiceUnavailable('en-AU-WilliamNeural', initialEdgeVoices), false);
  assert.equal(isEdgeVoiceUnavailable('en-GB-SoniaNeural', initialEdgeVoices), false);
  assert.equal(isEdgeVoiceUnavailable('id-ID-GadisNeural', initialEdgeVoices), false);
});

await test('F1-B: classifyEdgeTtsError returns HTTP 422 non-retryable for unsupported voices and preserves 500 retryable for transient/getVoices-absent voices', async () => {
  const elsieErr = await classifyEdgeTtsError({
    error: new Error('Stream closed before the synthesis completed (no turn.end received). The audio is likely truncated.'),
    voice: 'en-AU-ElsieNeural',
    hadAudioBytes: false,
    fetchUpstreamVoices: async () => new Set(['en-GB-SoniaNeural', 'en-GB-LibbyNeural'])
  });
  assert.equal(elsieErr.statusCode, 422);
  assert.equal(elsieErr.code, 'EDGE_VOICE_UNSUPPORTED');
  assert.equal(elsieErr.retryable, false);
  assert.match(elsieErr.details, /en-AU-ElsieNeural/);

  const explicitUpstreamErr = await classifyEdgeTtsError({
    error: new Error('Invalid voice parameter for synthesis'),
    voice: 'en-XX-RetiredNeural',
    hadAudioBytes: false,
    fetchUpstreamVoices: async () => new Set(['en-GB-LibbyNeural'])
  });
  assert.equal(explicitUpstreamErr.statusCode, 422);
  assert.equal(explicitUpstreamErr.code, 'EDGE_VOICE_UNSUPPORTED');

  const transientOmittedFromList = await classifyEdgeTtsError({
    error: new Error('Stream closed before the synthesis completed (no turn.end received).'),
    voice: 'en-AU-WilliamNeural',
    hadAudioBytes: false,
    fetchUpstreamVoices: async () => new Set(['en-GB-LibbyNeural'])
  });
  assert.equal(transientOmittedFromList.statusCode, 500);
  assert.equal(transientOmittedFromList.retryable, true);

  const transientSupported = await classifyEdgeTtsError({
    error: new Error('Stream closed before the synthesis completed'),
    voice: 'en-GB-LibbyNeural',
    hadAudioBytes: false,
    fetchUpstreamVoices: async () => new Set(['en-GB-LibbyNeural'])
  });
  assert.equal(transientSupported.statusCode, 500);
  assert.equal(transientSupported.retryable, true);

  const lookupUnavailable = await classifyEdgeTtsError({
    error: new Error('Socket hang up'),
    voice: 'en-IE-EmilyNeural',
    hadAudioBytes: false,
    fetchUpstreamVoices: async () => null
  });
  assert.equal(lookupUnavailable.statusCode, 500);
  assert.equal(lookupUnavailable.retryable, true);
});

await test('F1-B: executeTextStructuredEdgeAudioRequest stops after 1 attempt on HTTP 422 (no silent substitution) and retries on 500', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let attempts422 = 0;
    let sentVoice = null;
    globalThis.fetch = async (_url, init) => {
      attempts422 += 1;
      sentVoice = JSON.parse(init.body).voice;
      return new Response(JSON.stringify({
        error: 'Unsupported Edge TTS voice',
        code: 'EDGE_VOICE_UNSUPPORTED',
        voice: 'en-AU-ElsieNeural',
        details: 'Edge TTS voice "en-AU-ElsieNeural" is not supported or has been retired by Microsoft Edge TTS.'
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    };
    let caught = null;
    try {
      await executeTextStructuredEdgeAudioRequest({
        text: 'Hello',
        voiceId: 'en-AU-ElsieNeural',
        maxAttempts: 3
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'Throws error on 422');
    assert.equal(attempts422, 1, 'Does not retry HTTP 422');
    assert.equal(sentVoice, 'en-AU-ElsieNeural', 'Sends requested voice without silent substitution');
    assert.equal(caught.status, 422);
    assert.equal(caught.code, 'EDGE_VOICE_UNSUPPORTED');
    assert.equal(caught.retryable, false);
    assert.match(caught.message, /en-AU-ElsieNeural/);

    let attempts500 = 0;
    globalThis.fetch = async () => {
      attempts500 += 1;
      if (attempts500 === 1) {
        return new Response('Transient error', { status: 500 });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    };
    const recovered = await executeTextStructuredEdgeAudioRequest({
      text: 'Hello',
      voiceId: 'en-GB-LibbyNeural',
      maxAttempts: 2
    });
    assert.equal(attempts500, 2, 'Retries transient HTTP 500 cleanly');
    assert.equal(recovered.engineVoiceId, 'en-GB-LibbyNeural');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('F1-B + F2 UI: TextBatchPopup preserves unavailable Edge saved preferences cleanly & isolates live telemetry subscription', () => {
  const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));
  resetHooks();
  resetTextStructuredBatchTelemetry({
    sessionId: 'batch-1',
    status: 'running',
    total: 6,
    processed: 2,
    generatedPhysical: 1,
    reusedPhysical: 1,
    remaining: 4
  });

  const tree = renderTree(TextBatchPopup({
    inline: true,
    structuredTextBatch: {
      voices: initialEdgeVoices,
      preferences: {
        bulkTextVoiceIds: ['en-AU-ElsieNeural'],
        bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
        edgeTextVoiceId: 'en-AU-ElsieNeural',
        edgeMeaningVoiceId: 'id-ID-GadisNeural'
      },
      generationCoverage: { total: 6 },
      running: true
    }
  }));
  const unavailableOptions = collectNodes(tree, n => (
    (n.type === 'button' && n.props?.['data-text-bulk-voice-option'] === 'text:en-AU-ElsieNeural')
    || (n.type === 'option' && n.props?.value === 'en-AU-ElsieNeural')
  ));
  assert.ok(unavailableOptions.length >= 2, 'Saved retired Edge voice remains selectable/removable without silent swap');
  assert.ok(collectText(tree).includes('Elsie (AU) · Unavailable'));

  const telemetryNode = collectNodes(tree, n => n.props?.['data-live-batch-telemetry'] === 'text')[0];
  assert.ok(telemetryNode, 'Isolated TextBatchLiveTelemetry renders cleanly');
  assert.ok(collectText(telemetryNode).includes('2/6 (33%)'));
  resetTextStructuredBatchTelemetry();
});

await test('F1-C: TextStructuredCardAudioPanel exposes EN Full MP3 / ID Full MP3 buttons matching Bulk Full artifacts & calling onExportFullCardAudio without regeneration', () => {
  const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
  resetHooks();

  const segments = [{ id: 'seg-1', text: 'First sentence.', meaning: 'Kalimat pertama.', joinAfter: 'space' }];
  const block = {
    id: 'blk-1',
    blockType: 'paragraph',
    metadata: {},
    segments
  };
  const enRecord = buildTextStructuredFullArtifactRecord({
    block,
    channel: 'text',
    engine: 'edge',
    voiceId: 'en-GB-LibbyNeural',
    rate: 0,
    pitch: 0,
    language: 'en'
  });
  const idRecord = buildTextStructuredFullArtifactRecord({
    block,
    channel: 'meaning',
    engine: 'edge',
    voiceId: 'id-ID-GadisNeural',
    rate: 0,
    pitch: 0,
    language: 'id'
  });
  const metaWithEn = buildTextStructuredFullAudioArtifactsMetadata({ metadata: block.metadata, artifact: enRecord });
  const metaWithBoth = buildTextStructuredFullAudioArtifactsMetadata({ metadata: metaWithEn, artifact: idRecord });
  const readyBlock = {
    ...block,
    metadata: metaWithBoth
  };
  const runtimeFullAudio = {
    [enRecord.fullArtifactFingerprint]: { stagingBacked: true, ready: true },
    [idRecord.fullArtifactFingerprint]: { stagingBacked: true, ready: true }
  };

  const exportsCalled = [];
  const generateCalled = [];
  // Intentionally omit documentTree.textLanguage / meaningLanguage to verify 'en'/'id' default alignment
  const doc = { id: 'doc-1', editorModel: 'structured-v1', documentType: 'paragraph', metadata: {}, blocks: [readyBlock] };

  const treeReady = renderTree(TextStructuredCardAudioPanel({
    documentTree: doc,
    block: readyBlock,
    englishVoices: sampleBrowserVoices.filter(v => v.lang.startsWith('en-')),
    indonesianVoices: sampleBrowserVoices.filter(v => ['id-ID', 'jv-ID', 'su-ID'].includes(v.lang)),
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: initialEdgeVoices,
    runtimeFullAudio,
    initialSurface: 'download',
    onExportFullCardAudio: (blockId, channel) => exportsCalled.push({ blockId, channel }),
    onGenerateCardAudio: (...args) => generateCalled.push(args)
  }));

  const enExportBtn = collectNodes(treeReady, n => n.type === 'button' && n.props?.['data-text-card-full-export'] === 'text')[0];
  const idExportBtn = collectNodes(treeReady, n => n.type === 'button' && n.props?.['data-text-card-full-export'] === 'meaning')[0];
  assert.ok(enExportBtn && idExportBtn, 'Both Full MP3 export buttons render in Download surface');
  assert.equal(enExportBtn.props.disabled, false, 'EN Full MP3 enabled when EN Full is Ready');
  assert.equal(idExportBtn.props.disabled, false, 'ID Full MP3 enabled when ID Full is Ready');
  assert.ok(collectText(enExportBtn).includes('EN Full MP3'));
  assert.ok(collectText(idExportBtn).includes('ID Full MP3'));

  enExportBtn.props.onClick();
  idExportBtn.props.onClick();
  assert.deepEqual(exportsCalled, [
    { blockId: 'blk-1', channel: 'text' },
    { blockId: 'blk-1', channel: 'meaning' }
  ]);
  assert.equal(generateCalled.length, 0, 'Exporting Full Card MP3 never triggers regeneration');

  // Verify selective gating: EN Ready, ID missing (runtimeFullAudio lacks ID)
  resetHooks();
  const treePartial = renderTree(TextStructuredCardAudioPanel({
    documentTree: doc,
    block: readyBlock,
    englishVoices: [],
    indonesianVoices: [],
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: initialEdgeVoices,
    runtimeFullAudio: { [enRecord.fullArtifactFingerprint]: { stagingBacked: true, ready: true } },
    initialSurface: 'download'
  }));
  const partialEnBtn = collectNodes(treePartial, n => n.type === 'button' && n.props?.['data-text-card-full-export'] === 'text')[0];
  const partialIdBtn = collectNodes(treePartial, n => n.type === 'button' && n.props?.['data-text-card-full-export'] === 'meaning')[0];
  assert.equal(partialEnBtn.props.disabled, false);
  assert.equal(partialIdBtn.props.disabled, true);
  assert.ok(collectText(collectNodes(treePartial, n => n.props?.['data-text-card-full-channel-readiness'] === 'meaning')[0]).includes('FULL MISSING'));

  // Verify Conversation cards keep Full MP3 export disabled
  resetHooks();
  const convoTree = renderTree(TextStructuredCardAudioPanel({
    documentTree: { ...doc, documentType: 'conversation' },
    block: { ...readyBlock, blockType: 'conversation' },
    englishVoices: [],
    indonesianVoices: [],
    generationPreferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: initialEdgeVoices,
    runtimeFullAudio,
    initialSurface: 'download'
  }));
  const convoEnBtn = collectNodes(convoTree, n => n.type === 'button' && n.props?.['data-text-card-full-export'] === 'text')[0];
  assert.equal(convoEnBtn.props.disabled, true);
});

await test('F2: Throttled live telemetry updates first item immediately for <10 runs, throttles bursts, flushes errors/completion, and App preserves 10/256 cadence', async () => {
  resetTextStructuredBatchTelemetry({ sessionId: 's-1', status: 'running', total: 4, processed: 0 });
  let notifications = 0;
  const unsub = subscribeTextStructuredBatchTelemetry(() => { notifications += 1; });
  try {
    // Immediate first job (simulating 1/4 for small batch < 10)
    publishTextStructuredBatchTelemetryThrottled({ processed: 1, generatedPhysical: 1, remaining: 3 }, { minIntervalMs: 80, force: true });
    assert.equal(notifications, 1);
    assert.equal(getTextStructuredBatchTelemetrySnapshot().processed, 1);

    // Rapid second job inside 80ms: updates snapshot, skips noisy listener emit
    publishTextStructuredBatchTelemetryThrottled({ processed: 2, reusedPhysical: 1, remaining: 2 }, { minIntervalMs: 80, force: false });
    assert.equal(notifications, 1);
    assert.equal(getTextStructuredBatchTelemetrySnapshot().processed, 2);

    // Error increment bypasses throttle immediately
    publishTextStructuredBatchTelemetryThrottled({ processed: 3, failed: 1, remaining: 1 }, { minIntervalMs: 80, force: false });
    assert.equal(notifications, 2);
    assert.equal(getTextStructuredBatchTelemetrySnapshot().failed, 1);

    // Waiting >= 80ms allows per-job notification smoothly
    await new Promise(resolve => setTimeout(resolve, 95));
    publishTextStructuredBatchTelemetryThrottled({ processed: 4, remaining: 0, status: 'completed-with-errors' }, { minIntervalMs: 80, force: false });
    assert.equal(notifications, 3);
    assert.equal(getTextStructuredBatchTelemetrySnapshot().processed, 4);
  } finally {
    unsub();
    resetTextStructuredBatchTelemetry();
  }

  const appSource = read('src/App.jsx');
  const popupSource = read('src/components/text/TextBatchPopup.jsx');
  assert.match(appSource, /const TEXT_BATCH_STATUS_RENDER_INTERVAL = 10;/);
  assert.match(appSource, /const TEXT_BATCH_RUNTIME_FLUSH_INTERVAL = 256;/);
  assert.match(appSource, /publishTextStructuredBatchTelemetryThrottled\(telemetryPatch/);
  assert.match(appSource, /onExportFullCardAudio=\{handleStructuredTextExportFullCardAudio\}/);
  assert.ok(!popupSource.split('export const TextBatchPopup')[1].includes('useSyncExternalStore'), 'TextBatchPopup parent no longer subscribes to telemetry directly');
  assert.ok(popupSource.includes('const TextBatchLiveTelemetry = memoComponent'), 'Leaf telemetry component isolates re-renders');
});

console.log(`\nROUND D0-F1/F2 PATCH AUDIT COMPLETE — ${passCount} PASS, 0 FAIL`);
