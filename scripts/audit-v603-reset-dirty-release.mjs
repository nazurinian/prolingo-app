import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { initialEdgeVoices } from '../src/constants/voiceConstants.js';
import {
  getTextResetButtonState,
  isTextBulkGenerationDirty,
  isTextCardAudioDirty,
  isTextGlobalBrowserTtsDirty,
  isTextGlobalEdgeDirty,
  isTextGlobalPlaybackDirty,
  isTextSegmentAudioDirty,
  isTextSpeakerAudioDirty,
  isTextWorkspaceBrowserTtsDirty,
  isTextWorkspaceEdgePresetDirty,
  sameStructuredResetMetadata
} from '../src/domain/text/textStructuredResetPresentationDomain.js';

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
let pendingEffects = [];
const resetHooks = () => {
  hookValues = [];
  hookSlot = 0;
  pendingEffects = [];
};

const mockWindowListeners = new Map();
const mockWindow = {
  addEventListener: (event, fn) => {
    if (!mockWindowListeners.has(event)) mockWindowListeners.set(event, new Set());
    mockWindowListeners.get(event).add(fn);
  },
  removeEventListener: (event, fn) => {
    mockWindowListeners.get(event)?.delete(fn);
  },
  dispatch: (event, payload = {}) => {
    for (const fn of [...(mockWindowListeners.get(event) || [])]) fn(payload);
  }
};

const flushEffects = () => {
  const queue = pendingEffects.splice(0, pendingEffects.length);
  for (const runEffect of queue) {
    runEffect();
  }
};

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
  useRef: initial => {
    const at = hookSlot++;
    if (!(at in hookValues)) hookValues[at] = { current: initial };
    return hookValues[at];
  },
  useEffect: (fn, deps) => {
    const at = hookSlot++;
    const prev = hookValues[at];
    const changed = !prev || !Array.isArray(deps) || deps.some((d, idx) => !Object.is(d, prev.deps?.[idx]));
    if (changed) {
      pendingEffects.push(() => {
        prev?.cleanup?.();
        const cleanup = fn();
        hookValues[at] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
      });
    }
  },
  memo: fn => fn
};

if (typeof globalThis.document === 'undefined') globalThis.document = { body: {} };
globalThis.window = mockWindow;

const fakeIcons = new Proxy({}, { get: (_, key) => (typeof key === 'string' ? function Icon() { return null; } : null) });
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

const renderTree = (node, onVisitElement = null) => {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(item => renderTree(item, onVisitElement));
  if (typeof node === 'string' || typeof node === 'number') return [node];
  if (typeof node === 'object' && typeof node.type === 'function') {
    onVisitElement?.(node);
    return renderTree(node.type(node.props || {}), onVisitElement);
  }
  if (typeof node === 'object' && node.type) {
    onVisitElement?.(node);
    const children = renderTree(node.props?.children, onVisitElement);
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

const tests = [];
const run = (name, fn) => tests.push({ name, fn });

run('1. Domain dirty evaluators cleanly separate all 9 reset scopes and protect untouched payloads via Object.is', () => {
  const docWithLargeProtectedPayload = {
    id: 'DOC_1',
    title: 'Demo • Paragraph',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    metadata: {
      speakerRegistryV1: { SPK_1: { id: 'SPK_1', key: 'alice', label: 'Alice' } },
      fullAudioArtifactsV1: new Proxy({}, {
        get() { throw new Error('Should not traverse identical fullAudioArtifactsV1 reference'); }
      })
    },
    blocks: [{
      id: 'BLK_1',
      documentId: 'DOC_1',
      blockType: 'paragraph',
      metadata: {},
      segments: [{ id: 'SEG_1', speaker: 'Alice', metadata: { speakerIdentityV1: 'SPK_1' }, text: 'Hello.', meaning: 'Halo.' }]
    }]
  };

  assert.equal(isTextGlobalBrowserTtsDirty({}), false);
  assert.equal(isTextGlobalPlaybackDirty({}), false);
  assert.equal(isTextGlobalEdgeDirty({}), false);
  assert.equal(isTextBulkGenerationDirty({}), false);
  assert.equal(isTextWorkspaceBrowserTtsDirty(docWithLargeProtectedPayload), false);
  assert.equal(isTextWorkspaceEdgePresetDirty(docWithLargeProtectedPayload), false);
  assert.equal(isTextSpeakerAudioDirty(docWithLargeProtectedPayload, { includeSync: true }), false);
  assert.equal(isTextCardAudioDirty(docWithLargeProtectedPayload.blocks[0]), false);
  assert.equal(isTextSegmentAudioDirty(docWithLargeProtectedPayload.blocks[0].segments[0]), false);

  // sameStructuredResetMetadata short-circuits identical object references
  assert.equal(
    sameStructuredResetMetadata(docWithLargeProtectedPayload.metadata, { ...docWithLargeProtectedPayload.metadata }),
    true
  );

  // Global Browser TTS vs Playback isolation
  assert.equal(isTextGlobalBrowserTtsDirty({ browserTextRate: 1.4 }), true);
  assert.equal(isTextGlobalPlaybackDirty({ browserTextRate: 1.4 }), false);
  assert.equal(isTextGlobalPlaybackDirty({ displayMode: 'text-only' }), true);
  assert.equal(isTextGlobalBrowserTtsDirty({ displayMode: 'text-only' }), false);
  assert.equal(isTextGlobalPlaybackDirty({ globalAudioPlaybackOrderV1: { version: 1, channels: { text: [], meaning: [] }, ttsOnly: null } }), false);
  assert.equal(isTextGlobalPlaybackDirty({ globalAudioPlaybackOrderV1: { version: 1, channels: { text: ['voice-1'], meaning: [] }, ttsOnly: false } }), true);

  // Global Edge vs Bulk isolation
  assert.equal(isTextGlobalEdgeDirty({ edgeRate: 15 }), true);
  assert.equal(isTextBulkGenerationDirty({ edgeRate: 15 }), false);
  assert.equal(isTextBulkGenerationDirty({ bulkGenerateFull: true }), true);
  assert.equal(isTextGlobalEdgeDirty({ bulkGenerateFull: true }), false);

  // Workspace Edge preset never dirties Workspace Browser TTS or Global Browser TTS
  const docWithEdgePreset = {
    ...docWithLargeProtectedPayload,
    metadata: {
      ...docWithLargeProtectedPayload.metadata,
      audioDownloadProfileV1: { modes: { text: 'custom-voice', meaning: null }, channels: { text: 'en-US-AriaNeural', meaning: null }, speakerIds: { text: {}, meaning: {} }, speakers: { text: {}, meaning: {} } }
    }
  };
  assert.equal(isTextWorkspaceEdgePresetDirty(docWithEdgePreset), true);
  assert.equal(isTextWorkspaceBrowserTtsDirty(docWithEdgePreset), false);

  // Speaker & Card/Segment dirty propagation
  const docWithCardAndSegment = {
    ...docWithLargeProtectedPayload,
    blocks: [{
      ...docWithLargeProtectedPayload.blocks[0],
      segments: [{
        ...docWithLargeProtectedPayload.blocks[0].segments[0],
        metadata: { speakerIdentityV1: 'SPK_1', audioVoiceOverrideV1: { channels: { text: 'Voice A', meaning: null } } }
      }]
    }]
  };
  assert.equal(isTextSegmentAudioDirty(docWithCardAndSegment.blocks[0].segments[0]), true);
  assert.equal(isTextCardAudioDirty(docWithCardAndSegment.blocks[0]), true);

  const docWithSpeakerOverride = {
    ...docWithLargeProtectedPayload,
    metadata: {
      ...docWithLargeProtectedPayload.metadata,
      speakerVoiceProfileV2: { text: { SPK_1: 'Voice S' }, meaning: {} }
    }
  };
  assert.equal(isTextSpeakerAudioDirty(docWithSpeakerOverride, { speakerId: 'SPK_1', speaker: 'Alice', includeSync: false }), true);
  assert.equal(isTextSpeakerAudioDirty(docWithSpeakerOverride, { speakerId: 'SPK_OTHER', speaker: 'Other', includeSync: false }), false);
  assert.equal(isTextSpeakerAudioDirty(docWithSpeakerOverride, { includeSync: true }), true);

  assert.deepEqual(getTextResetButtonState({ dirty: false, busyBlocked: false }), {
    dirty: false, busyBlocked: false, disabled: true, opacityClass: 'opacity-40', interactionClass: 'cursor-not-allowed'
  });
  assert.deepEqual(getTextResetButtonState({ dirty: false, busyBlocked: true }), {
    dirty: false, busyBlocked: true, disabled: true, opacityClass: 'opacity-40', interactionClass: 'cursor-not-allowed'
  });
  assert.deepEqual(getTextResetButtonState({ dirty: true, busyBlocked: false }), {
    dirty: true, busyBlocked: false, disabled: false, opacityClass: 'opacity-100', interactionClass: 'cursor-pointer'
  });
  assert.deepEqual(getTextResetButtonState({ dirty: true, busyBlocked: true }), {
    dirty: true, busyBlocked: true, disabled: true, opacityClass: 'opacity-100', interactionClass: 'cursor-wait'
  });
});

run('2. CommitOnReleaseRange previews live during drag/keys and commits once on pointer/global/key/blur release', async () => {
  const { default: CommitOnReleaseRange } = loadModule(path.join(root, 'src/components/common/CommitOnReleaseRange.jsx'));
  const previews = [];
  const commits = [];
  resetHooks();
  mockWindowListeners.clear();

  const renderRange = (extraProps = {}) => {
    hookSlot = 0;
    const tree = renderTree(mockReact.createElement(CommitOnReleaseRange, {
      min: 0.5,
      max: 2.0,
      step: 0.1,
      value: 1.0,
      onPreview: v => previews.push(v),
      onCommit: v => { commits.push(v); },
      ...extraProps
    }));
    flushEffects();
    return collectNodes(tree, n => n.type === 'input' && n.props?.type === 'range')[0];
  };

  // Drag + release on input
  let input = renderRange();
  assert.equal(input.props.value, 1.0);
  input.props.onPointerDown();
  input.props.onChange({ target: { value: '1.3' } });
  input = renderRange();
  assert.equal(input.props.value, 1.3);
  input.props.onChange({ target: { value: '1.6' } });
  input = renderRange();
  assert.equal(input.props.value, 1.6);
  assert.deepEqual(commits, [], 'Slider drag must NOT commit while dragging');
  assert.deepEqual(previews, [1.3, 1.6]);

  input.props.onPointerUp();
  assert.deepEqual(commits, [1.6], 'Pointer release commits once with final dragged value');

  // Global window pointerup fallback when pointer leaves slider bounds
  input = renderRange({ value: 1.6 });
  input.props.onPointerDown();
  input.props.onChange({ target: { value: '1.9' } });
  input = renderRange({ value: 1.6 });
  assert.equal(commits.length, 1);
  mockWindow.dispatch('pointerup');
  assert.deepEqual(commits, [1.6, 1.9], 'Window pointerup fallback commits when released outside slider');

  // Keyboard ArrowRight hold commits once on ArrowRight keyup
  input = renderRange({ value: 1.9 });
  input.props.onKeyDown({ key: 'ArrowRight' });
  input.props.onChange({ target: { value: '2.0' } });
  assert.equal(commits.length, 2, 'Keyboard arrow hold previews before keyup');
  input.props.onKeyUp({ key: 'ArrowRight' });
  assert.deepEqual(commits, [1.6, 1.9, 2.0], 'Keyboard keyup commits once');

  // No-op drag back to saved value skips commit
  input = renderRange({ value: 1.4 });
  input.props.onPointerDown();
  input.props.onChange({ target: { value: '1.8' } });
  input.props.onChange({ target: { value: '1.4' } });
  input.props.onPointerUp();
  assert.equal(commits.length, 3, 'No-op release back to saved value must not emit redundant commit');
});

run('3. TextStructuredAudioControls uses EN/ID Playback Speed labels, permanent null-reset icon (no 1.0x button), and Global Edge Rate/Pitch', () => {
  const { default: TextStructuredAudioControls } = loadModule(path.join(root, 'src/components/text/TextStructuredAudioControls.jsx'));
  const doc = {
    id: 'DOC_R',
    title: 'Speed Label Doc',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    textLanguage: 'en',
    meaningLanguage: 'id',
    metadata: { audioPlaybackRateProfileV1: { channels: { text: 1.7, meaning: null }, speakerIds: { text: {}, meaning: {} }, speakers: { text: {}, meaning: {} } } },
    blocks: [{ id: 'B1', blockType: 'paragraph', metadata: {}, segments: [{ id: 'S1', text: 'Hi.', meaning: 'Hai.', metadata: {} }] }]
  };
  const rateChanges = [];
  resetHooks();
  let tree = renderTree(mockReact.createElement(TextStructuredAudioControls, {
    documentTree: doc,
    preferences: { browserTextRate: 1.4, browserMeaningRate: 1.2 },
    globalTextRate: 1.4,
    globalMeaningRate: 1.2,
    generationPreferences: { edgeRate: 10 },
    edgeGenerationVoices: initialEdgeVoices,
    onDocumentRateChange: (val, ch) => rateChanges.push([val, ch])
  }));
  const allText = textOf(tree);
  assert.ok(allText.includes('EN Playback Speed'), 'Workspace EN slider must be labeled EN Playback Speed');
  assert.ok(allText.includes('ID Playback Speed'), 'Workspace ID slider must be labeled ID Playback Speed');
  assert.ok(!allText.includes('EN (Text) Playback Speed'), 'Legacy label EN (Text) Playback Speed must be removed');
  assert.ok(!allText.includes('ID (Meaning) Playback Speed'), 'Legacy label ID (Meaning) Playback Speed must be removed');

  const buttons = collectNodes(tree, n => n.type === 'button');
  assert.equal(buttons.filter(b => textOf(b).trim() === '1.0×').length, 0, 'Conditional 1.0x button must be removed');

  const [enResetIcon] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-reset-rate-override'] === 'workspace:text');
  const [idResetIcon] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-reset-rate-override'] === 'workspace:meaning');
  assert.ok(enResetIcon && idResetIcon, 'Both EN and ID Reset icons must always be mounted to preserve layout');
  assert.ok(String(enResetIcon.props.className).includes('h-6 w-6'), 'Rate reset icon must reserve fixed h-6 w-6 space');
  assert.equal(enResetIcon.props.disabled, false);
  assert.ok(String(enResetIcon.props.className).includes('opacity-100'));
  assert.equal(idResetIcon.props.disabled, true);
  assert.ok(String(idResetIcon.props.className).includes('opacity-40'));

  const [idReadout] = collectNodes(tree, n => n.props?.['data-text-rate-readout'] === 'workspace:meaning');
  assert.equal(textOf(idReadout).trim(), '1.2×', 'Inherited Workspace channel must display Global rate 1.2x instead of hardcoded 1.0x');

  enResetIcon.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
  assert.deepEqual(rateChanges, [[null, 'text']], 'Clicking small EN Reset icon must clear override with null (Inherit Global), NOT 1.0');

  // Generate Audio tab preserves Rate & Pitch labels
  const [downloadTab] = collectNodes(tree, n => n.type === 'button' && n.props?.['data-text-audio-tab'] === 'download');
  downloadTab.props.onClick();
  hookSlot = 0;
  tree = renderTree(mockReact.createElement(TextStructuredAudioControls, {
    documentTree: doc,
    preferences: { browserTextRate: 1.4, browserMeaningRate: 1.2 },
    globalTextRate: 1.4,
    globalMeaningRate: 1.2,
    generationPreferences: { edgeRate: 10, edgePitch: -5 },
    edgeGenerationVoices: initialEdgeVoices
  }));
  const downloadRanges = collectNodes(tree, n => n.type === 'input' && n.props?.type === 'range');
  assert.ok(downloadRanges.some(r => r.props?.['aria-label'] === 'Rate'), 'Global Edge Rate slider aria-label preserved');
  assert.ok(downloadRanges.some(r => r.props?.['aria-label'] === 'Pitch'), 'Global Edge Pitch slider aria-label preserved');
  const downloadText = textOf(tree);
  assert.ok(downloadText.includes('Rate') && downloadText.includes('+10%'), 'Global Edge Rate label preserved');
  assert.ok(downloadText.includes('Pitch') && downloadText.includes('-5Hz'), 'Global Edge Pitch label preserved');
});

run('4. Header, MainAppShellView, PlayerBrowserTtsControls & Reset buttons keep clean opacity and non-blocking select contracts', () => {
  const headerSource = read('src/components/layout/Header.jsx');
  assert.ok(!headerSource.includes('disabled={textLibraryCommandBusy}'), 'Header Workspace select must never disable natively on textLibraryCommandBusy');
  assert.ok(headerSource.includes('disabled={!activeTextDocumentId}'), 'Header Workspace select disables only when no workspace exists');
  assert.ok(headerSource.includes('aria-busy={textLibraryCommandBusy || undefined}'), 'Header Workspace select exposes aria-busy during DB transactions');

  const shellSource = read('src/components/layout/MainAppShellView.jsx');
  assert.ok(!shellSource.includes('disabled={textLibraryCommandBusy}'), 'Mobile document strip buttons must not flicker native :disabled on textLibraryCommandBusy');

  for (const rel of [
    'src/components/text/TextStructuredAudioControls.jsx',
    'src/components/text/TextStructuredPlaybackControls.jsx',
    'src/components/text/TextBatchPopup.jsx',
    'src/components/text/TextStructuredCardAudioPanel.jsx'
  ]) {
    const content = read(rel);
    const resetMatches = content.match(/data-text-(?:reset|global-edge-restore|card-player-reset)[\s\S]{0,450}?disabled:opacity-/g) || [];
    assert.equal(resetMatches.length, 0, `${rel} Reset buttons must drive opacity strictly from dirty state (no disabled:opacity-*)`);
  }

  const { default: TextStructuredPlaybackControls } = loadModule(path.join(root, 'src/components/text/TextStructuredPlaybackControls.jsx'));
  resetHooks();
  hookSlot = 0;
  const cleanPlaybackTree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: { id: 'DOC_1', editorModel: 'structured-v1' },
    preferences: {},
    playbackOrder: { version: 1, channels: { text: [], meaning: [] }, ttsOnly: false },
    onResetPlaybackPreferences: () => {}
  }));
  const [cleanPlaybackReset] = collectNodes(cleanPlaybackTree, n => n.type === 'button' && n.props?.['data-text-reset-playback'] === 'true');
  assert.ok(cleanPlaybackReset, 'TextStructuredPlaybackControls renders Reset Defaults button');
  assert.equal(cleanPlaybackReset.props.disabled, true, 'Clean playbackOrder with runtime ttsOnly:false stays disabled');
  assert.ok(cleanPlaybackReset.props.className.includes('opacity-40'), 'Clean playbackOrder with runtime ttsOnly:false stays opacity-40');

  resetHooks();
  hookSlot = 0;
  const dirtyPlaybackTree = renderTree(mockReact.createElement(TextStructuredPlaybackControls, {
    documentTree: { id: 'DOC_1', editorModel: 'structured-v1' },
    preferences: {},
    playbackOrder: { version: 1, channels: { text: ['voice-1'], meaning: [] }, ttsOnly: false },
    onResetPlaybackPreferences: () => {}
  }));
  const [dirtyPlaybackReset] = collectNodes(dirtyPlaybackTree, n => n.type === 'button' && n.props?.['data-text-reset-playback'] === 'true');
  assert.equal(dirtyPlaybackReset.props.disabled, false, 'Custom priority channel enables Reset Defaults');
  assert.ok(dirtyPlaybackReset.props.className.includes('opacity-100'), 'Custom priority channel renders opacity-100');

  const { default: PlayerBrowserTtsControls } = loadModule(path.join(root, 'src/components/controls/PlayerBrowserTtsControls.jsx'));
  const committedRates = [];
  resetHooks();
  const renderPlayer = () => {
    hookSlot = 0;
    const tree = renderTree(mockReact.createElement(PlayerBrowserTtsControls, {
      voices: [],
      selectedVoice: null,
      setSelectedVoice: () => {},
      isSystemBusy: false,
      mode: 'text',
      indonesianVoices: [],
      selectedIndonesianVoice: null,
      setSelectedIndonesianVoice: () => {},
      structuredTextModeActive: true,
      rate: 1.0,
      setRate: v => committedRates.push(v),
      meaningRate: 1.0,
      setMeaningRate: () => {},
      ratesLinked: true,
      setRatesLinked: () => {}
    }));
    flushEffects();
    return tree;
  };
  let playerTree = renderPlayer();
  const [enRange] = collectNodes(playerTree, n => n.type === 'input' && n.props?.type === 'range');
  assert.ok(enRange);
  enRange.props.onPointerDown();
  enRange.props.onChange({ target: { value: '1.5' } });
  playerTree = renderPlayer();
  assert.ok(textOf(playerTree).includes('1.5×'), 'Player slider previews 1.5x before commit');
  assert.deepEqual(committedRates, [], 'Player slider does not call setRate during drag');
  collectNodes(playerTree, n => n.type === 'input' && n.props?.type === 'range')[0].props.onPointerUp();
  assert.deepEqual(committedRates, ['1.5'], 'Player slider commits once on release');
});

run('5. emitTargetChange propagates async results and null rejections so failed slider commits restore persisted values', async () => {
  const { default: TextStructuredAudioControls } = loadModule(path.join(root, 'src/components/text/TextStructuredAudioControls.jsx'));
  const { default: CommitOnReleaseRange } = loadModule(path.join(root, 'src/components/common/CommitOnReleaseRange.jsx'));
  const flushAsyncTicks = async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  // Part A: Paragraph Workspace slider & voice callbacks (2-arg signature: nextValue, channel)
  let workspaceDoc = {
    id: 'DOC_PROP',
    title: 'Workspace Async Prop Doc',
    editorModel: 'structured-v1',
    documentType: 'paragraph',
    textLanguage: 'en',
    meaningLanguage: 'id',
    metadata: { audioPlaybackRateProfileV1: { channels: { text: 1.7, meaning: null }, speakerIds: { text: {}, meaning: {} }, speakers: { text: {}, meaning: {} } } },
    blocks: [{ id: 'B1', blockType: 'paragraph', metadata: {}, segments: [{ id: 'S1', text: 'Hi.', meaning: 'Hai.', metadata: {} }] }]
  };
  let docRateHandler = async (val, ch) => ({ scope: 'workspace', val, ch });
  let docVoiceHandler = async (val, ch) => ({ scope: 'workspace-voice', val, ch });
  const docRateCalls = [];
  const docVoiceCalls = [];

  resetHooks();
  mockWindowListeners.clear();
  const renderWorkspace = () => {
    const rangeNodes = [];
    hookSlot = 0;
    const tree = renderTree(mockReact.createElement(TextStructuredAudioControls, {
      documentTree: workspaceDoc,
      preferences: { browserTextRate: 1.4, browserMeaningRate: 1.2 },
      globalTextRate: 1.4,
      globalMeaningRate: 1.2,
      generationPreferences: {},
      edgeGenerationVoices: initialEdgeVoices,
      onDocumentRateChange: (...args) => {
        docRateCalls.push(args);
        return docRateHandler(...args);
      },
      onDocumentVoiceChange: (...args) => {
        docVoiceCalls.push(args);
        return docVoiceHandler(...args);
      }
    }), el => {
      if (el.type === CommitOnReleaseRange) rangeNodes.push(el.props);
    });
    flushEffects();
    return { tree, rangeNodes };
  };

  let ws = renderWorkspace();
  const wsEnRangeProps = ws.rangeNodes.find(p => p['aria-label'] === 'EN Playback Speed');
  assert.ok(wsEnRangeProps, 'Workspace EN Playback Speed CommitOnReleaseRange mounted');

  // Direct return propagation check for Workspace rate & voice callbacks
  const okWsResult = await wsEnRangeProps.onCommit(1.8);
  assert.deepEqual(okWsResult, { scope: 'workspace', val: 1.8, ch: 'text' }, 'Workspace successful async commit propagates returned value');
  assert.deepEqual(docRateCalls.at(-1), [1.8, 'text'], 'Workspace rate callback keeps (value, channel) signature');

  const [wsEnChannel] = collectNodes(ws.tree, n => n.props?.['data-text-workspace-narrator-channel'] === 'text');
  const [wsEnSelect] = collectNodes([wsEnChannel], n => n.type === 'select');
  assert.ok(wsEnSelect, 'Workspace EN VoiceSelect select rendered');
  const okWsVoice = await wsEnSelect.props.onChange({ target: { value: 'Voice W' } });
  assert.deepEqual(okWsVoice, { scope: 'workspace-voice', val: 'Voice W', ch: 'text' }, 'Workspace voice callback propagates async result');
  assert.deepEqual(docVoiceCalls.at(-1), ['Voice W', 'text'], 'Workspace voice callback keeps (value, channel) signature');

  docRateHandler = async () => null;
  docVoiceHandler = async () => null;
  assert.equal(await wsEnRangeProps.onCommit(1.9), null, 'Rejected Workspace async commit propagates null');
  assert.equal(await wsEnSelect.props.onChange({ target: { value: 'Voice W2' } }), null, 'Rejected Workspace voice commit propagates null');

  docRateHandler = () => null;
  assert.equal(wsEnRangeProps.onCommit(1.6), null, 'Synchronous null Workspace commit propagates null immediately');

  // Integrated slider drag -> rejected async save (null) restores persisted 1.7x
  docRateHandler = async () => null;
  ws = renderWorkspace();
  let wsEnInput = collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0];
  wsEnInput.props.onPointerDown();
  wsEnInput.props.onChange({ target: { value: '1.9' } });
  ws = renderWorkspace();
  assert.equal(
    textOf(collectNodes(ws.tree, n => n.props?.['data-text-rate-readout'] === 'workspace:text')[0]).trim(),
    '1.9×',
    'Workspace readout previews 1.9x while dragging'
  );
  wsEnInput = collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0];
  assert.equal(wsEnInput.props.value, 1.9);
  wsEnInput.props.onPointerUp();
  await flushAsyncTicks();
  ws = renderWorkspace();
  assert.equal(
    textOf(collectNodes(ws.tree, n => n.props?.['data-text-rate-readout'] === 'workspace:text')[0]).trim(),
    '1.7×',
    'Rejected Workspace async save returning null must restore persisted 1.7x readout'
  );
  assert.equal(
    collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0].props.value,
    1.7,
    'Rejected Workspace async save returning null must restore persisted 1.7 slider value'
  );

  // Integrated slider drag -> thrown/rejected Promise restores persisted 1.7x
  docRateHandler = async () => { throw new Error('IndexedDB write failed'); };
  ws = renderWorkspace();
  wsEnInput = collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0];
  wsEnInput.props.onPointerDown();
  wsEnInput.props.onChange({ target: { value: '1.3' } });
  ws = renderWorkspace();
  collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0].props.onPointerUp();
  await flushAsyncTicks();
  ws = renderWorkspace();
  assert.equal(
    textOf(collectNodes(ws.tree, n => n.props?.['data-text-rate-readout'] === 'workspace:text')[0]).trim(),
    '1.7×',
    'Failed Workspace async promise rejection must restore persisted 1.7x readout'
  );
  assert.equal(
    collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0].props.value,
    1.7,
    'Failed Workspace async promise rejection must restore persisted 1.7 slider value'
  );

  // Successful Workspace save updates persisted metadata and keeps new rate
  docRateHandler = async (val, ch) => {
    workspaceDoc = {
      ...workspaceDoc,
      metadata: {
        ...workspaceDoc.metadata,
        audioPlaybackRateProfileV1: { ...workspaceDoc.metadata.audioPlaybackRateProfileV1, channels: { text: val, meaning: null } }
      }
    };
    return { id: workspaceDoc.id, channel: ch, rate: val };
  };
  ws = renderWorkspace();
  wsEnInput = collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0];
  wsEnInput.props.onPointerDown();
  wsEnInput.props.onChange({ target: { value: '1.9' } });
  ws = renderWorkspace();
  collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0].props.onPointerUp();
  await flushAsyncTicks();
  ws = renderWorkspace();
  assert.equal(textOf(collectNodes(ws.tree, n => n.props?.['data-text-rate-readout'] === 'workspace:text')[0]).trim(), '1.9×');
  assert.equal(collectNodes(ws.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Playback Speed')[0].props.value, 1.9);

  // Part B: Conversation Speaker slider & voice callbacks (3-arg signature: speakerTarget, nextValue, channel)
  const speakerDoc = {
    id: 'DOC_SPK_PROP',
    title: 'Speaker Async Prop Doc',
    editorModel: 'structured-v1',
    documentType: 'conversation',
    textLanguage: 'en',
    meaningLanguage: 'id',
    metadata: {
      speakerRegistryV1: { SPK_1: { id: 'SPK_1', key: 'alice', label: 'Alice' } },
      audioPlaybackRateProfileV1: { channels: { text: null, meaning: null }, speakerIds: { text: { SPK_1: 1.2 }, meaning: {} }, speakers: { text: {}, meaning: {} } }
    },
    blocks: [{
      id: 'BLK_1',
      blockType: 'conversation',
      metadata: {},
      segments: [{ id: 'SEG_1', speaker: 'Alice', metadata: { speakerIdentityV1: 'SPK_1' }, text: 'Hello.', meaning: 'Halo.' }]
    }]
  };
  let speakerRateHandler = async (target, val, ch) => ({ scope: 'speaker', id: target?.id, label: target?.label, val, ch });
  let speakerVoiceHandler = async (target, val, ch) => ({ scope: 'speaker-voice', id: target?.id, label: target?.label, val, ch });
  const speakerRateCalls = [];
  const speakerVoiceCalls = [];

  resetHooks();
  mockWindowListeners.clear();
  const renderSpeaker = () => {
    const rangeNodes = [];
    hookSlot = 0;
    const tree = renderTree(mockReact.createElement(TextStructuredAudioControls, {
      documentTree: speakerDoc,
      preferences: { browserTextRate: 1.0, browserMeaningRate: 1.0 },
      globalTextRate: 1.0,
      globalMeaningRate: 1.0,
      generationPreferences: {},
      edgeGenerationVoices: initialEdgeVoices,
      onSpeakerRateChange: (...args) => {
        speakerRateCalls.push(args);
        return speakerRateHandler(...args);
      },
      onSpeakerVoiceChange: (...args) => {
        speakerVoiceCalls.push(args);
        return speakerVoiceHandler(...args);
      }
    }), el => {
      if (el.type === CommitOnReleaseRange) rangeNodes.push(el.props);
    });
    flushEffects();
    return { tree, rangeNodes };
  };

  let spk = renderSpeaker();
  const spkEnRangeProps = spk.rangeNodes.find(p => p['aria-label'] === 'EN Speed');
  assert.ok(spkEnRangeProps, 'Speaker EN Speed CommitOnReleaseRange mounted');

  const okSpkResult = await spkEnRangeProps.onCommit(1.5);
  assert.deepEqual(
    okSpkResult,
    { scope: 'speaker', id: 'SPK_1', label: 'Alice', val: 1.5, ch: 'text' },
    'Speaker successful async commit propagates returned value'
  );
  assert.deepEqual(
    speakerRateCalls.at(-1),
    [{ id: 'SPK_1', key: 'SPK_1', label: 'Alice', segmentIds: ['SEG_1'], persisted: true }, 1.5, 'text'],
    'Speaker rate callback keeps (speakerTarget, value, channel) 3-arg signature'
  );

  const [spkCard] = collectNodes(spk.tree, n => n.props?.['data-text-audio-speaker'] === 'SPK_1');
  const [spkEnSelect] = collectNodes([spkCard], n => n.type === 'select');
  assert.ok(spkEnSelect, 'Speaker EN VoiceSelect select rendered');
  const okSpkVoice = await spkEnSelect.props.onChange({ target: { value: 'Voice S' } });
  assert.deepEqual(
    okSpkVoice,
    { scope: 'speaker-voice', id: 'SPK_1', label: 'Alice', val: 'Voice S', ch: 'text' },
    'Speaker voice callback propagates async result'
  );
  assert.deepEqual(
    speakerVoiceCalls.at(-1),
    [{ id: 'SPK_1', key: 'SPK_1', label: 'Alice', segmentIds: ['SEG_1'], persisted: true }, 'Voice S', 'text'],
    'Speaker voice callback keeps (speakerTarget, value, channel) 3-arg signature'
  );

  speakerRateHandler = async () => null;
  speakerVoiceHandler = async () => null;
  assert.equal(await spkEnRangeProps.onCommit(1.6), null, 'Rejected Speaker rate commit propagates null');
  assert.equal(await spkEnSelect.props.onChange({ target: { value: 'Voice S2' } }), null, 'Rejected Speaker voice commit propagates null');

  // Integrated Speaker slider drag -> rejected async save (null) restores persisted 1.2x
  spk = renderSpeaker();
  let spkEnInput = collectNodes(spk.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Speed')[0];
  spkEnInput.props.onPointerDown();
  spkEnInput.props.onChange({ target: { value: '1.8' } });
  spk = renderSpeaker();
  assert.equal(textOf(collectNodes(spk.tree, n => n.props?.['data-text-rate-readout'] === 'speaker:SPK_1:text')[0]).trim(), '1.8×');
  collectNodes(spk.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Speed')[0].props.onPointerUp();
  await flushAsyncTicks();
  spk = renderSpeaker();
  assert.equal(
    textOf(collectNodes(spk.tree, n => n.props?.['data-text-rate-readout'] === 'speaker:SPK_1:text')[0]).trim(),
    '1.2×',
    'Rejected Speaker async save returning null must restore persisted 1.2x readout'
  );
  assert.equal(
    collectNodes(spk.tree, n => n.type === 'input' && n.props?.['aria-label'] === 'EN Speed')[0].props.value,
    1.2,
    'Rejected Speaker async save returning null must restore persisted 1.2 slider value'
  );
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
console.log(`RESET_DIRTY_RELEASE_SUMMARY: ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);
