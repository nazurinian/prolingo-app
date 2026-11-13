import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { applyEdgeVoiceCompatibilityResult, initialEdgeVoices } from '../src/constants/voiceConstants.js';
import {
  buildTextStructuredCardMissingFullRequirements,
  TEXT_STRUCTURED_BULK_REPRESENTATIONS,
  TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildResetTextStructuredBulkGenerationPreferences,
  canExecuteTextStructuredReset
} from '../src/domain/text/textStructuredResetDomain.js';

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
  if (resolvedAbs.endsWith('useStableOverlayViewport.js')) {
    const stub = { useLiveOverlayViewportRef: () => ({ current: null }) };
    moduleCache.set(resolvedAbs, { exports: stub });
    return stub;
  }
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
  for (const node of (Array.isArray(nodes) ? nodes : [])) {
    if (!node || typeof node !== 'object') continue;
    if (predicate(node)) acc.push(node);
    collectNodes(node.children, predicate, acc);
  }
  return acc;
};

const textOf = node => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (Array.isArray(node.children) ? node.children : [node.props?.children]).map(textOf).join('');
};

const findConfirmButtons = tree => {
  const dialogs = collectNodes(tree, node => node.type === 'div' && node.props?.role === 'dialog' && node.props?.['aria-modal'] === 'true');
  const confirmDialogs = dialogs.filter(d => {
    const buttons = collectNodes(d.children, n => n.type === 'button');
    return buttons.some(b => textOf(b).trim() === 'Cancel');
  });
  const activeDialog = confirmDialogs[confirmDialogs.length - 1] || null;
  if (!activeDialog) return { dialog: null, cancelButton: null, confirmButton: null };
  const buttons = collectNodes(activeDialog.children, n => n.type === 'button');
  return {
    dialog: activeDialog,
    cancelButton: buttons.find(b => textOf(b).trim() === 'Cancel') || null,
    confirmButton: buttons.find(b => textOf(b).trim() !== 'Cancel') || null
  };
};

const makeParagraphDocument = () => ({
  id: 'DOC_D2_PARA',
  title: 'Paragraph D2 Workspace',
  editorModel: 'structured-v1',
  documentType: 'paragraph',
  textLanguage: 'en',
  meaningLanguage: 'id',
  metadata: {},
  blocks: [{
    id: 'BLK_D2_1',
    documentId: 'DOC_D2_PARA',
    title: 'Paragraph Card 1',
    blockType: 'paragraph',
    metadata: {},
    segments: [
      { id: 'SEG_D2_1', documentId: 'DOC_D2_PARA', blockId: 'BLK_D2_1', text: 'First sentence.', meaning: 'Kalimat pertama.', metadata: {} },
      { id: 'SEG_D2_2', documentId: 'DOC_D2_PARA', blockId: 'BLK_D2_1', text: 'Second sentence.', meaning: 'Kalimat kedua.', metadata: {} }
    ]
  }]
});

const makeConversationDocument = () => ({
  id: 'DOC_D2_CONV',
  title: 'Conversation D2 Workspace',
  editorModel: 'structured-v1',
  documentType: 'conversation',
  textLanguage: 'en',
  meaningLanguage: 'id',
  metadata: {
    speakerRegistryV1: {
      SPK_ALICE: { id: 'SPK_ALICE', key: 'alice', label: 'Alice' },
      SPK_BOB: { id: 'SPK_BOB', key: 'bob', label: 'Bob' }
    }
  },
  blocks: [{
    id: 'BLK_D2_CONV_1',
    documentId: 'DOC_D2_CONV',
    title: 'Dialogue 1',
    blockType: 'conversation',
    metadata: {},
    segments: [
      { id: 'SEG_C_1', documentId: 'DOC_D2_CONV', blockId: 'BLK_D2_CONV_1', speaker: 'Alice', text: 'Hello.', meaning: 'Halo.', metadata: { speakerIdentityV1: 'SPK_ALICE' } },
      { id: 'SEG_C_2', documentId: 'DOC_D2_CONV', blockId: 'BLK_D2_CONV_1', speaker: 'Bob', text: 'Hi there.', meaning: 'Hai.', metadata: { speakerIdentityV1: 'SPK_BOB' } }
    ]
  }]
});

const tests = [];
const run = (name, fn) => tests.push({ name, fn });

run('1. TextStructuredPlaybackControls renders Reset Defaults with SafetyConfirmDialog gate and obeys resetDisabled', () => {
  const { default: TextStructuredPlaybackControls } = loadModule(path.join(root, 'src/components/text/TextStructuredPlaybackControls.jsx'));
  const doc = makeParagraphDocument();
  let resetCalls = 0;

  resetHooks();
  let tree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: doc,
    preferences: {},
    disabled: true, // Active playback locks other settings while Reset stays clickable
    resetDisabled: false,
    onResetPlaybackPreferences: () => { resetCalls += 1; }
  }));
  const [resetBtn] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-reset-playback'] === 'true');
  assert.ok(resetBtn, 'Playback reset button must render');
  assert.equal(resetBtn.props.disabled, false, 'Reset Defaults remains clickable when playback is active so Reset can stop playback');

  resetBtn.props.onClick();
  assert.equal(resetCalls, 0, 'Reset must NOT execute without confirmation');

  hookSlot = 0;
  tree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: doc,
    preferences: {},
    disabled: true,
    resetDisabled: false,
    onResetPlaybackPreferences: () => { resetCalls += 1; }
  }));
  const { dialog, cancelButton } = findConfirmButtons(tree);
  assert.ok(dialog && cancelButton, 'SafetyConfirmDialog must open when Reset Defaults is clicked');
  cancelButton.props.onClick();
  assert.equal(resetCalls, 0, 'Cancelling confirmation dialog must not reset preferences');

  resetBtn.props.onClick();
  hookSlot = 0;
  tree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: doc,
    preferences: {},
    disabled: true,
    resetDisabled: false,
    onResetPlaybackPreferences: () => { resetCalls += 1; }
  }));
  const { confirmButton } = findConfirmButtons(tree);
  assert.ok(confirmButton);
  confirmButton.props.onClick();
  assert.equal(resetCalls, 1, 'Confirming SafetyConfirmDialog must invoke onResetPlaybackPreferences');

  resetHooks();
  const lockedTree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: doc,
    preferences: {},
    resetDisabled: true,
    onResetPlaybackPreferences: () => {}
  }));
  const [lockedBtn] = collectNodes(lockedTree, n => n.type === 'button' && n.props?.['data-text-reset-playback'] === 'true');
  assert.equal(lockedBtn.props.disabled, true, 'resetDisabled locks Playback Reset during ZIP import / DB TX');
});

run('2. TextStructuredAudioControls resets Global Browser TTS, Workspace, Speakers (individual/all), and Global Edge via SafetyConfirmDialog', () => {
  const { default: TextStructuredAudioControls } = loadModule(path.join(root, 'src/components/text/TextStructuredAudioControls.jsx'));
  const mixedDoc = {
    ...makeParagraphDocument(),
    documentType: 'mixed',
    metadata: makeConversationDocument().metadata,
    blocks: [...makeParagraphDocument().blocks, ...makeConversationDocument().blocks]
  };
  const called = [];
  const props = {
    documentTree: mixedDoc,
    preferences: { audioSourceMode: 'local-first' },
    generationPreferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 20, edgePitch: -10 },
    edgeGenerationVoices: initialEdgeVoices,
    onResetGlobalBrowserTts: () => called.push('global-browser-tts'),
    onResetGlobalEdge: () => called.push('global-edge'),
    onResetWorkspaceAudio: () => called.push('workspace'),
    onResetSpeakersAudio: opts => called.push(['speakers', opts])
  };

  resetHooks();
  let tree = renderTree(mockReact.createElement(TextStructuredAudioControls, props));
  const clickAndConfirm = (selectorPredicate, expectedLabel) => {
    const [btn] = collectNodes(tree, selectorPredicate);
    assert.ok(btn, `Expected reset button for ${expectedLabel}`);
    assert.equal(btn.props.disabled, false, `${expectedLabel} button should be enabled`);
    btn.props.onClick();
    assert.equal(called.length, 0, `${expectedLabel} must wait for confirmation`);
    hookSlot = 0;
    tree = renderTree(mockReact.createElement(TextStructuredAudioControls, props));
    const { confirmButton } = findConfirmButtons(tree);
    assert.ok(confirmButton, `Confirmation dialog must appear for ${expectedLabel}`);
    confirmButton.props.onClick();
    hookSlot = 0;
    tree = renderTree(mockReact.createElement(TextStructuredAudioControls, props));
  };

  clickAndConfirm(n => n.type === 'button' && n.props?.['data-text-reset-global-browser-tts'] === 'true', 'Global Browser TTS');
  assert.deepEqual(called.pop(), 'global-browser-tts');

  clickAndConfirm(n => n.type === 'button' && n.props?.['data-text-reset-workspace'] === 'true', 'Workspace');
  assert.deepEqual(called.pop(), 'workspace');

  clickAndConfirm(n => n.type === 'button' && n.props?.['data-text-reset-all-speakers'] === 'true', 'All Speakers');
  assert.deepEqual(called.pop(), ['speakers', { includeSync: true }]);

  clickAndConfirm(n => n.type === 'button' && n.props?.['data-text-reset-speaker'] === 'SPK_ALICE', 'Single Speaker Alice');
  assert.deepEqual(called.pop(), ['speakers', { speakerId: 'SPK_ALICE', speaker: 'Alice', includeSync: false }]);

  // Switch to Generate Audio tab ('download') before checking Global Edge Restore button
  const [downloadTab] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-audio-tab'] === 'download');
  assert.ok(downloadTab, 'Expected Generate Audio tab');
  downloadTab.props.onClick();
  hookSlot = 0;
  tree = renderTree(mockReact.createElement(TextStructuredAudioControls, props));

  // Global Edge Restore button must be enabled when edgeRate/edgePitch are non-zero even if voices are Sonia/Gadis!
  clickAndConfirm(n => n.type === 'button' && n.props?.['data-text-global-edge-restore-default'] === 'true', 'Global Edge non-zero rate/pitch');
  assert.deepEqual(called.pop(), 'global-edge');
});

run('3. TextBatchPopup renders Reset Bulk with confirmation gate and respects resetDisabled', () => {
  const { TextBatchPopup } = loadModule(path.join(root, 'src/components/text/TextBatchPopup.jsx'));
  let bulkResetCount = 0;
  const batchProps = {
    setIsBatchOpen: () => {},
    structuredTextBatch: {
      running: false,
      resetDisabled: false,
      voices: initialEdgeVoices,
      preferences: {
        bulkTextVoiceIds: ['en-US-AriaNeural', 'en-GB-RyanNeural'],
        bulkMeaningVoiceIds: [],
        bulkGenerateSplit: false,
        bulkGenerateFull: true
      },
      resetPreferences: () => { bulkResetCount += 1; }
    }
  };
  resetHooks();
  let tree = renderTree(mockReact.createElement(TextBatchPopup, batchProps));
  const [btn] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-reset-bulk-preferences'] === 'true');
  assert.ok(btn);
  btn.props.onClick();
  assert.equal(bulkResetCount, 0);
  hookSlot = 0;
  tree = renderTree(mockReact.createElement(TextBatchPopup, batchProps));
  const { confirmButton } = findConfirmButtons(tree);
  assert.ok(confirmButton);
  confirmButton.props.onClick();
  assert.equal(bulkResetCount, 1);

  resetHooks();
  const lockedTree = renderTree(mockReact.createElement(TextBatchPopup, {
    setIsBatchOpen: () => {},
    structuredTextBatch: { ...batchProps.structuredTextBatch, resetDisabled: true }
  }));
  const [lockedBtn] = collectNodes(lockedTree, n => n.type === 'button' && n.props?.['data-text-reset-bulk-preferences'] === 'true');
  assert.equal(lockedBtn.props.disabled, true);
});

run('4. D2-C Domain: buildTextStructuredCardMissingFullRequirements skips Ready, Stale, and Conversation cards', () => {
  const doc = makeParagraphDocument();
  const block = doc.blocks[0];
  const prefs = {
    edgeTextVoiceId: 'en-GB-SoniaNeural',
    edgeMeaningVoiceId: 'id-ID-GadisNeural',
    edgeRate: 0,
    edgePitch: 0
  };

  // Case A: Both Full EN and ID are missing -> returns both
  const missingBoth = buildTextStructuredCardMissingFullRequirements({ documentTree: doc, block, preferences: prefs });
  assert.equal(missingBoth.length, 2);
  assert.equal(missingBoth[0].representation, TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL);
  assert.equal(missingBoth[0].status, TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING);
  assert.equal(missingBoth[0].voiceId, 'en-GB-SoniaNeural');
  assert.equal(missingBoth[1].voiceId, 'id-ID-GadisNeural');

  // Case B: EN Full is Ready, ID Full is Missing -> returns ID Full only
  const enReadyRecord = buildTextStructuredFullArtifactRecord({
    block,
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0
  });
  const blockWithEnReady = {
    ...block,
    metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: block.metadata, artifact: enReadyRecord })
  };
  const missingIdOnly = buildTextStructuredCardMissingFullRequirements({
    documentTree: doc,
    block: blockWithEnReady,
    preferences: prefs,
    runtimeFullAudio: {
      [enReadyRecord.fullArtifactFingerprint]: { stagingBacked: true, url: 'blob:en-full' }
    }
  });
  assert.equal(missingIdOnly.length, 1);
  assert.equal(missingIdOnly[0].channel, 'meaning');

  // Case C: EN Full is Stale (same voice generated for old text), ID Full is Missing -> skips Stale EN Full!
  const staleBlock = {
    ...blockWithEnReady,
    segments: [
      { ...block.segments[0], text: 'Edited first sentence.' },
      block.segments[1]
    ]
  };
  const afterStale = buildTextStructuredCardMissingFullRequirements({
    documentTree: doc,
    block: staleBlock,
    preferences: prefs,
    runtimeFullAudio: {}
  });
  assert.equal(afterStale.length, 1, 'Stale EN Full must be skipped by Card Missing Full convenience');
  assert.equal(afterStale[0].channel, 'meaning');

  // Case D: Conversation Card -> returns []
  const convDoc = makeConversationDocument();
  const convFull = buildTextStructuredCardMissingFullRequirements({
    documentTree: convDoc,
    block: convDoc.blocks[0],
    preferences: prefs
  });
  assert.deepEqual(convFull, []);
});

run('5. D2-C & Reset UI in TextStructuredCardAudioPanel: checkbox defaults OFF, enables Ready-Split+Missing-Full card, Conversation hidden, Card/Segment Reset gated', () => {
  const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
  const doc = makeParagraphDocument();
  const block = doc.blocks[0];
  const allSplitReadyCoverage = {
    [buildTextStructuredRuntimeAudioKey('SEG_D2_1', 'text')]: { status: 'ready', requiredVoiceId: 'en-GB-SoniaNeural' },
    [buildTextStructuredRuntimeAudioKey('SEG_D2_2', 'text')]: { status: 'ready', requiredVoiceId: 'en-GB-SoniaNeural' },
    [buildTextStructuredRuntimeAudioKey('SEG_D2_1', 'meaning')]: { status: 'ready', requiredVoiceId: 'id-ID-GadisNeural' },
    [buildTextStructuredRuntimeAudioKey('SEG_D2_2', 'meaning')]: { status: 'ready', requiredVoiceId: 'id-ID-GadisNeural' }
  };
  const bulkPrefsBefore = {
    edgeTextVoiceId: 'en-GB-SoniaNeural',
    edgeMeaningVoiceId: 'id-ID-GadisNeural',
    bulkGenerateSplit: true,
    bulkGenerateFull: false,
    bulkTextVoiceIds: ['en-US-JennyNeural']
  };
  const bulkSnapshot = JSON.stringify(bulkPrefsBefore);
  const generatedCalls = [];
  const resetCalls = [];

  const renderPanel = (extraProps = {}) => renderTree(mockReact.createElement(TextStructuredCardAudioPanel, {
    documentTree: doc,
    block,
    initialSurface: 'download',
    generationPreferences: bulkPrefsBefore,
    edgeGenerationVoices: initialEdgeVoices,
    cardCoverage: { total: 4, covered: 4, ready: 4, needDownload: 0, missing: 0, stale: 0 },
    audioCoverageMap: allSplitReadyCoverage,
    onGenerateCardAudio: (bId, ch, opts) => generatedCalls.push({ bId, ch, opts }),
    onResetCardAudioPreferences: bId => resetCalls.push(['card', bId]),
    onResetSegmentAudioPreferences: sId => resetCalls.push(['segment', sId]),
    ...extraProps
  }));

  resetHooks();
  let tree = renderPanel();
  const [checkboxWrapper] = collectNodes(tree, n => n.type === 'label' && n.props?.['data-text-card-include-missing-full'] === 'true');
  assert.ok(checkboxWrapper, 'Paragraph card must show "Also generate missing Full audio" control');
  const [checkboxInput] = collectNodes([checkboxWrapper], n => n.type === 'input' && n.props?.type === 'checkbox');
  assert.equal(checkboxInput.props.checked, false, 'D2-C checkbox must be OFF by default');
  const [genBtnOff] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true');
  assert.equal(genBtnOff.props.disabled, true, 'GENERATE MISSING stays disabled when Split is Ready and D2-C checkbox is OFF');

  // Verify outdated help text was updated cleanly
  const fullBoxText = textOf(collectNodes(tree, n => n.props?.['data-text-card-full-readiness'] === 'true'));
  assert.ok(!fullBoxText.includes('(Full option)'), 'Outdated "Generated via Bulk Audio (Full option)" text should be updated');

  // Toggle checkbox ON
  checkboxInput.props.onChange({ target: { checked: true } });
  hookSlot = 0;
  tree = renderPanel();
  const [genBtnOn] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true');
  assert.equal(genBtnOn.props.disabled, false, 'GENERATE MISSING must enable when Split is Ready, Full is Missing, and D2-C checkbox is ON');
  genBtnOn.props.onClick();
  assert.equal(generatedCalls.length, 1);
  assert.deepEqual(generatedCalls[0], {
    bId: 'BLK_D2_1',
    ch: ['text', 'meaning'],
    opts: { missingOnly: true, includeMissingFull: true }
  });
  assert.equal(JSON.stringify(bulkPrefsBefore), bulkSnapshot, 'Bulk preferences must remain untouched');

  // Card Reset gate
  const [cardResetBtn] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-reset-card-audio'] === 'true');
  assert.ok(cardResetBtn);
  cardResetBtn.props.onClick();
  assert.equal(resetCalls.length, 0);
  hookSlot = 0;
  tree = renderPanel();
  findConfirmButtons(tree).confirmButton.props.onClick();
  assert.deepEqual(resetCalls.pop(), ['card', 'BLK_D2_1']);

  // Expand Segment overrides + verify Segment Reset gate
  hookSlot = 0;
  tree = renderPanel();
  const [segSection] = collectNodes(tree, n => n.props?.['data-text-segment-voice-overrides'] === 'true');
  const [segToggleBtn] = collectNodes([segSection], n => n.type === 'button');
  segToggleBtn.props.onClick();
  hookSlot = 0;
  tree = renderPanel();
  const [segResetBtn] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-reset-segment-audio'] === 'SEG_D2_1');
  assert.ok(segResetBtn, 'Segment Reset button must appear in Segment overrides');
  segResetBtn.props.onClick();
  assert.equal(resetCalls.length, 0);
  hookSlot = 0;
  tree = renderPanel();
  findConfirmButtons(tree).confirmButton.props.onClick();
  assert.deepEqual(resetCalls.pop(), ['segment', 'SEG_D2_1']);

  // Conversation card must NOT render Full convenience checkbox
  const convDoc = makeConversationDocument();
  resetHooks();
  const convTree = renderTree(mockReact.createElement(TextStructuredCardAudioPanel, {
    documentTree: convDoc,
    block: convDoc.blocks[0],
    initialSurface: 'download',
    generationPreferences: bulkPrefsBefore,
    edgeGenerationVoices: initialEdgeVoices,
    cardCoverage: { total: 4, covered: 4, ready: 4, needDownload: 0, missing: 0, stale: 0 },
    audioCoverageMap: {}
  }));
  const convCheckboxes = collectNodes(convTree, n => n.props?.['data-text-card-include-missing-full'] === 'true');
  assert.equal(convCheckboxes.length, 0, 'Conversation cards must not expose Paragraph Full checkbox');
});

run('6. Unavailable Edge Voice in Card Missing Full blocks cleanly only when D2-C checkbox is ON', () => {
  const { TextStructuredCardAudioPanel } = loadModule(path.join(root, 'src/components/text/TextStructuredCardAudioPanel.jsx'));
  const customVoiceList = applyEdgeVoiceCompatibilityResult(
    initialEdgeVoices,
    'en-GB-RyanNeural',
    { available: false, diagnostic: 'Mock unavailable' }
  );
  const baseDoc = makeParagraphDocument();
  const blockWithUnavailableFullCustom = {
    ...baseDoc.blocks[0],
    metadata: buildTextStructuredAudioDownloadProfileMetadata({
      metadata: {},
      channel: 'text',
      mode: 'custom',
      voiceId: 'en-GB-RyanNeural'
    })
  };
  const doc = { ...baseDoc, blocks: [blockWithUnavailableFullCustom] };
  // Split EN ready with Sonia already, only Full EN wants unavailable Ryan
  const coverage = {
    [buildTextStructuredRuntimeAudioKey('SEG_D2_1', 'text')]: { status: 'ready', requiredVoiceId: 'en-GB-SoniaNeural' },
    [buildTextStructuredRuntimeAudioKey('SEG_D2_2', 'text')]: { status: 'ready', requiredVoiceId: 'en-GB-SoniaNeural' },
    [buildTextStructuredRuntimeAudioKey('SEG_D2_1', 'meaning')]: { status: 'ready', requiredVoiceId: 'id-ID-GadisNeural' },
    [buildTextStructuredRuntimeAudioKey('SEG_D2_2', 'meaning')]: { status: 'ready', requiredVoiceId: 'id-ID-GadisNeural' }
  };
  resetHooks();
  let tree = renderTree(mockReact.createElement(TextStructuredCardAudioPanel, {
    documentTree: doc,
    block: blockWithUnavailableFullCustom,
    initialSurface: 'download',
    generationPreferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural' },
    edgeGenerationVoices: customVoiceList,
    cardCoverage: { total: 4, covered: 4, ready: 4, needDownload: 0, missing: 0, stale: 0 },
    audioCoverageMap: coverage
  }));
  // OFF -> no footer unavailable alert for Full-only missing voice
  assert.equal(collectNodes(tree, n => n.props?.['data-text-card-footer-unavailable-warning'] === 'true').length, 0);

  // Toggle ON -> footer unavailable alert triggers cleanly and button stays disabled
  const [checkboxInput] = collectNodes(tree, n => n.type === 'input' && n.props?.type === 'checkbox');
  checkboxInput.props.onChange({ target: { checked: true } });
  hookSlot = 0;
  tree = renderTree(mockReact.createElement(TextStructuredCardAudioPanel, {
    documentTree: doc,
    block: blockWithUnavailableFullCustom,
    initialSurface: 'download',
    generationPreferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural' },
    edgeGenerationVoices: customVoiceList,
    cardCoverage: { total: 4, covered: 4, ready: 4, needDownload: 0, missing: 0, stale: 0 },
    audioCoverageMap: coverage
  }));
  const [genBtn] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-card-generate-missing'] === 'true');
  assert.equal(genBtn.props.disabled, true);
  assert.equal(collectNodes(tree, n => n.props?.['data-text-card-footer-unavailable-warning'] === 'true').length, 1);
});

run('7. canExecuteTextStructuredReset + App.jsx synchronisation, safety & Table/Legacy isolation contracts', () => {
  assert.equal(canExecuteTextStructuredReset({ zipImportActive: true }).blockedBy, 'zip-import');
  assert.equal(canExecuteTextStructuredReset({ textLibraryCommandBusy: true }).blockedBy, 'database-transaction');
  assert.equal(canExecuteTextStructuredReset({ isSystemBusy: true }).blockedBy, 'system-busy');
  assert.equal(canExecuteTextStructuredReset({ generationRunning: true, requireGenerationIdle: true }).blockedBy, 'generation-running');
  assert.equal(canExecuteTextStructuredReset({ generationRunning: true, requireGenerationIdle: false }).allowed, true);

  // Verify Bulk Sonia/Gadis vs Libby/Tuti split stays untouched in domain helper
  const bulkReset = buildResetTextStructuredBulkGenerationPreferences({
    edgeTextVoiceId: 'en-US-GuyNeural',
    edgeMeaningVoiceId: 'id-ID-ArdiNeural',
    bulkGenerateSplit: false,
    bulkGenerateFull: true
  });
  assert.equal(bulkReset.edgeTextVoiceId, 'en-US-GuyNeural');
  assert.deepEqual(bulkReset.bulkTextVoiceIds, ['en-GB-LibbyNeural']);
  assert.deepEqual(bulkReset.bulkMeaningVoiceIds, ['su-ID-TutiNeural']);

  const appSource = read('src/App.jsx');
  assert.ok(appSource.includes('clearStructuredTextResetRuntimePlaybackState'));
  assert.ok(appSource.includes('orderedListOverride: null'));
  assert.ok(appSource.includes('setStructuredTextPlaybackSourceStatus(null)'));
  assert.ok(appSource.includes('handleStructuredTextResetGlobalPlaybackPreferences'));
  assert.ok(appSource.includes('handleStructuredTextResetGlobalGenerationPreferences'));
  assert.ok(appSource.includes('handleStructuredTextResetWorkspaceAudioPreferences'));
  assert.ok(appSource.includes('handleStructuredTextResetSpeakerAudioPreferences'));
  assert.ok(appSource.includes('handleStructuredTextResetCardAudioPreferences'));
  assert.ok(appSource.includes('handleStructuredTextResetSegmentAudioPreferences'));
  assert.ok(appSource.includes('buildTextStructuredCardMissingFullRequirements'));
  assert.ok(appSource.includes('setStructuredTextZipImportBusy'));

  // Never use destructive browser reset primitives in new D1/D2 files
  for (const rel of [
    'src/domain/text/textStructuredResetDomain.js',
    'src/components/text/TextStructuredPlaybackControls.jsx',
    'src/components/text/TextStructuredAudioControls.jsx',
    'src/components/text/TextBatchPopup.jsx',
    'src/components/text/TextStructuredCardAudioPanel.jsx'
  ]) {
    const content = read(rel);
    assert.ok(!content.includes('localStorage.clear'), `${rel} must not call localStorage.clear()`);
    assert.ok(!content.includes('deleteDatabase'), `${rel} must not delete IndexedDB`);
    assert.ok(!content.includes('window.confirm'), `${rel} must use SafetyConfirmDialog instead of window.confirm`);
  }
});

let passed = 0;
let failed = 0;
for (const entry of tests) {
  try {
    await entry.fn();
    console.log(`PASS: ${entry.name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL: ${entry.name}`);
    console.error(error?.stack || error);
    failed += 1;
  }
}
console.log(`D2_SUMMARY: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
