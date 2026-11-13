import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  getBatchScopeKey,
  hasActiveLegacyAudioFolder,
  isBatchPopupAllowed,
  isLegacyAudioFolderSupported,
  isLegacyTextMode,
  isMatchingAudioFolderScope,
  isStructuredTextMode,
  resolveBatchPopupTarget,
  resolveGuardedBatchOpenValue
} from '../src/domain/view/dataSystemBoundaryDomain.js';
import {
  executeAudioFolderSelectService,
  executeRememberedAudioFolderOpenService,
  executeRememberedAudioFolderRestoreService
} from '../src/services/audio/audioFolderLifecycleService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');
const load = createRequire(import.meta.url);
const esbuild = load('esbuild');

let hookValues = [];
let hookSlot = 0;
const resetHooks = () => {
  hookValues = [];
  hookSlot = 0;
};
const rerenderHooks = () => {
  hookSlot = 0;
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
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  memo: fn => fn
};

const fakeIcons = new Proxy({}, { get: (_, key) => (typeof key === 'string' ? function Icon() { return null; } : null) });

const StubComponent = name => function Stub(props) {
  return { type: `stub:${name}`, props };
};

const transpile = (source, absPath) => esbuild.transformSync(source, {
  loader: absPath.endsWith('.jsx') ? 'jsx' : 'js',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform'
}).code;

const moduleCache = new Map();
const loadModule = absPath => {
  const resolvedAbs = path.resolve(absPath);
  if (moduleCache.has(resolvedAbs)) return moduleCache.get(resolvedAbs).exports;
  const source = fs.readFileSync(resolvedAbs, 'utf8');
  const mod = { exports: {} };
  moduleCache.set(resolvedAbs, mod);
  const req = specifier => {
    if (specifier === 'react') return { ...mockReact, default: mockReact, __esModule: true };
    if (specifier === 'lucide-react') return fakeIcons;
    if (specifier === 'react-dom') return { createPortal: children => children };
    if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency: ${specifier}`);
    const resolved = path.resolve(path.dirname(resolvedAbs), specifier);
    const basename = path.basename(resolved).replace(/\.(js|jsx)$/, '');
    if (['StorageManagerPanel', 'GroupedVoiceSelect', 'ConfirmDialog', 'TextLibraryShell', 'TextStructuredEditor', 'BatchPopup', 'TextBatchPopup', 'MobileTools', 'WorkspaceTabs', 'MasterDataToolbar'].includes(basename)) {
      const stub = StubComponent(basename);
      return {
        __esModule: true,
        default: stub,
        [basename]: stub,
        GroupedVoiceSelect: stub,
        SafetyConfirmDialog: stub
      };
    }
    for (const candidate of [resolved, `${resolved}.jsx`, `${resolved}.js`]) {
      if (fs.existsSync(candidate)) return loadModule(candidate);
    }
    throw new Error(`Missing module ${specifier} from ${resolvedAbs}`);
  };
  new Function('require', 'module', 'exports', transpile(source, resolvedAbs))(req, mod, mod.exports);
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
  console.log(`PASS ${String(passed).padStart(2, '0')} — ${label}`);
};

const DesktopSystemControls = loadModule(path.join(root, 'src/components/controls/DesktopSystemControls.jsx')).default;
const MobileSystemControls = loadModule(path.join(root, 'src/components/controls/MobileSystemControls.jsx')).default;
const DesktopDataActions = loadModule(path.join(root, 'src/components/controls/DesktopDataActions.jsx')).default;
const MobileDataControls = loadModule(path.join(root, 'src/components/controls/MobileDataControls.jsx')).default;
const { renderBatchPopupView } = loadModule(path.join(root, 'src/components/layout/MainAppAuxiliaryViews.jsx'));

const createSystemProps = (overrides = {}) => ({
  generatorEngine: 'edge',
  setGeneratorEngine: () => {},
  isSystemBusy: false,
  aiVoiceName: 'Kore',
  setAiVoiceName: () => {},
  aiVoices: [],
  edgeVoices: [{ ShortName: 'en-US-AriaNeural', LocalName: 'Aria' }],
  edgeVoice: 'en-US-AriaNeural',
  setEdgeVoice: () => {},
  edgeIndonesianVoice: 'id-ID-GadisNeural',
  setEdgeIndonesianVoice: () => {},
  edgeRate: 0,
  setEdgeRate: () => {},
  edgePitch: 0,
  setEdgePitch: () => {},
  edgeHealth: { status: 'online' },
  testEdgeBackend: () => {},
  userApiKey: '',
  onUserApiKeyChange: () => {},
  geminiOwnerConfigured: false,
  geminiOwnerUnlocked: false,
  onGeminiOwnerUnlock: () => {},
  onGeminiOwnerLock: () => {},
  geminiByokAvailable: false,
  geminiByokRegistered: false,
  onGeminiByokRegister: () => {},
  onGeminiByokClear: () => {},
  folderInputRef: {
    current: { click: () => {} },
    tableAudioFolderSummary: { active: false, matchedCount: 0 }
  },
  currentMapCount: 0,
  legacyTextAudioCount: null,
  mode: 'table',
  activeTextEditorModel: null,
  batchButtonRef: { current: null },
  isBatchDownloading: false,
  batchSessions: [],
  setIsBatchOpen: () => {},
  isBatchOpen: false,
  debugButtonRef: { current: null },
  setShowLogs: () => {},
  showLogs: false,
  logContainerRef: { current: null },
  systemLogs: [],
  storageRefreshToken: 0,
  onDatasetCacheCleared: () => {},
  onMasteryReset: () => {},
  onStudyTrackingReset: () => {},
  masteryByVocabId: {},
  activityByVocabId: {},
  currentVocabIds: [],
  onProgressRestored: () => {},
  ...overrides
});

// D1 — Pure domain boundaries
await check('D1/D4 domain predicates fail closed across Table, Legacy Text, Structured Text, and unhydrated boot', () => {
  assert.equal(isLegacyTextMode('table', 'legacy-line-v1'), false);
  assert.equal(isLegacyTextMode('text', 'legacy-line-v1'), true);
  assert.equal(isLegacyTextMode('text', 'structured-v1'), false);
  assert.equal(isLegacyTextMode('text', null), false);

  assert.equal(isStructuredTextMode('text', 'structured-v1'), true);
  assert.equal(isStructuredTextMode('text', 'legacy-line-v1'), false);
  assert.equal(isStructuredTextMode('table', 'structured-v1'), false);

  assert.equal(isLegacyAudioFolderSupported({ mode: 'table', activeTextEditorModel: null }), true);
  assert.equal(isLegacyAudioFolderSupported({ mode: 'table', activeTextEditorModel: 'structured-v1' }), true);
  assert.equal(isLegacyAudioFolderSupported({ mode: 'text', activeTextEditorModel: 'legacy-line-v1' }), true);
  assert.equal(isLegacyAudioFolderSupported({ mode: 'text', activeTextEditorModel: 'structured-v1' }), false);
  assert.equal(isLegacyAudioFolderSupported({ mode: 'text', activeTextEditorModel: null }), false);

  // Structured Text Staging/ZIP counts must never masquerade as Legacy Audio Folder active state
  assert.equal(hasActiveLegacyAudioFolder({ mode: 'text', activeTextEditorModel: 'structured-v1', legacyTextAudioCount: 48 }), false);
  assert.equal(hasActiveLegacyAudioFolder({ mode: 'text', activeTextEditorModel: null, legacyTextAudioCount: 48 }), false);
  assert.equal(hasActiveLegacyAudioFolder({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', legacyTextAudioCount: 0 }), false);
  assert.equal(hasActiveLegacyAudioFolder({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', legacyTextAudioCount: 3 }), true);
  assert.equal(hasActiveLegacyAudioFolder({ mode: 'table', tableAudioFolderActive: false, legacyTextAudioCount: 99 }), false);
  assert.equal(hasActiveLegacyAudioFolder({ mode: 'table', tableAudioFolderActive: true, legacyTextAudioCount: 0 }), true);

  assert.equal(resolveBatchPopupTarget({ mode: 'table', activeTextEditorModel: null, hasStructuredTextBatch: false }), 'table');
  assert.equal(resolveBatchPopupTarget({ mode: 'text', activeTextEditorModel: 'structured-v1', hasStructuredTextBatch: true }), 'structured-text');
  assert.equal(resolveBatchPopupTarget({ mode: 'text', activeTextEditorModel: 'structured-v1', hasStructuredTextBatch: false }), 'none');
  assert.equal(resolveBatchPopupTarget({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', hasStructuredTextBatch: false }), 'none');
  assert.equal(resolveBatchPopupTarget({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', hasStructuredTextBatch: true }), 'none');
  assert.equal(resolveBatchPopupTarget({ mode: 'text', activeTextEditorModel: null, hasStructuredTextBatch: false }), 'none');

  assert.equal(isBatchPopupAllowed({ mode: 'table' }), true);
  assert.equal(isBatchPopupAllowed({ mode: 'text', activeTextEditorModel: 'structured-v1' }), true);
  assert.equal(isBatchPopupAllowed({ mode: 'text', activeTextEditorModel: 'legacy-line-v1' }), false);
  assert.equal(isBatchPopupAllowed({ mode: 'text', activeTextEditorModel: null }), false);

  const scopes = new Set([
    getBatchScopeKey({ mode: 'table' }),
    getBatchScopeKey({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', activeTextDocumentId: 'docL' }),
    getBatchScopeKey({ mode: 'text', activeTextEditorModel: 'structured-v1', activeTextDocumentId: 'docS1' }),
    getBatchScopeKey({ mode: 'text', activeTextEditorModel: 'structured-v1', activeTextDocumentId: 'docS2' }),
    getBatchScopeKey({ mode: 'text', activeTextEditorModel: null, activeTextDocumentId: '' })
  ]);
  assert.equal(scopes.size, 5);

  // Stage 0 (#6): resolveGuardedBatchOpenValue handles booleans & functional updaters + fail-closed scopes
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: true, prevOpen: false, mode: 'table' }), true);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: false, prevOpen: true, mode: 'table' }), false);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: prev => !prev, prevOpen: false, mode: 'table' }), true);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: prev => !prev, prevOpen: true, mode: 'table' }), false);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: prev => !prev, prevOpen: false, mode: 'text', activeTextEditorModel: 'structured-v1' }), true);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: true, prevOpen: false, mode: 'text', activeTextEditorModel: 'legacy-line-v1' }), false);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: prev => !prev, prevOpen: false, mode: 'text', activeTextEditorModel: 'legacy-line-v1' }), false);
  assert.equal(resolveGuardedBatchOpenValue({ nextValue: prev => !prev, prevOpen: true, mode: 'text', activeTextEditorModel: null }), false);

  // Stage 0 (#3/#4): live scope matching validates exact scope and legacy folder eligibility
  assert.equal(isMatchingAudioFolderScope({ mode: 'table', activeTextEditorModel: null }, 'table', null), true);
  assert.equal(isMatchingAudioFolderScope({ mode: 'text', activeTextEditorModel: 'legacy-line-v1' }, 'text', 'legacy-line-v1'), true);
  assert.equal(isMatchingAudioFolderScope({ mode: 'text', activeTextEditorModel: 'structured-v1' }, 'text', 'legacy-line-v1'), false);
  assert.equal(isMatchingAudioFolderScope({ mode: 'text', activeTextEditorModel: 'structured-v1' }, 'text', 'structured-v1'), false);
  assert.equal(isMatchingAudioFolderScope({ mode: 'table', activeTextEditorModel: null }, 'text', 'legacy-line-v1'), false);
});

// D1 — Service-level callable handler guards
await check('D1 service handlers block Structured Text and pre-hydration Text without scanning or fallback click', async () => {
  let mapped = false;
  let fallbackCalled = false;
  const fakeEvent = { target: { files: [{ name: 'TEXT_1_test.mp3' }], value: 'C:\\fakepath' } };

  const structuredSelect = executeAudioFolderSelectService({
    e: fakeEvent,
    mode: 'text',
    activeTextEditorModel: 'structured-v1',
    localAudioMapTable: {},
    localAudioMapText: {},
    playlist: [{ id: 1 }],
    setLocalAudioMapText: () => { mapped = true; },
    setAudioStatusText: () => { mapped = true; }
  });
  assert.equal(structuredSelect.blocked, true);
  assert.equal(structuredSelect.reason, 'legacy-audio-folder-unsupported');
  assert.equal(fakeEvent.target.value, '');
  assert.equal(mapped, false);

  const preHydrationSelect = executeAudioFolderSelectService({
    e: { target: { files: [{ name: 'TEXT_1_test.mp3' }], value: 'pending' } },
    mode: 'text',
    activeTextEditorModel: null,
    localAudioMapTable: {},
    localAudioMapText: {},
    playlist: [{ id: 1 }],
    setLocalAudioMapText: () => { mapped = true; }
  });
  assert.equal(preHydrationSelect.blocked, true);
  assert.equal(mapped, false);

  const openStructured = await executeRememberedAudioFolderOpenService({
    mode: 'text',
    activeTextEditorModel: 'structured-v1',
    fallbackOpen: () => { fallbackCalled = true; }
  });
  assert.equal(openStructured.status, 'blocked');
  assert.equal(fallbackCalled, false);

  const restoreStructured = await executeRememberedAudioFolderRestoreService({
    mode: 'text',
    activeTextEditorModel: 'structured-v1'
  });
  assert.equal(restoreStructured.status, 'blocked');

  // Legacy Text compatibility remains preserved when File System Access API is absent in Node
  let legacyFallbackCalled = false;
  const openLegacy = await executeRememberedAudioFolderOpenService({
    mode: 'text',
    activeTextEditorModel: 'legacy-line-v1',
    fallbackOpen: () => { legacyFallbackCalled = true; }
  });
  assert.equal(openLegacy.status, 'legacy-fallback');
  assert.equal(legacyFallbackCalled, true);

  // Stage 0 (#4): Folder picker completed after switching to Structured Text or stale scan must NOT save handle to IndexedDB
  const prevWindow = globalThis.window;
  const prevIndexedDb = globalThis.indexedDB;
  let idbWriteAttempts = 0;
  try {
    let stillInLegacyMode = true;
    const fakeDirHandle = {
      name: 'PickedLegacyFolder',
      async *values() {}
    };
    globalThis.indexedDB = {
      open: () => {
        idbWriteAttempts += 1;
        return {};
      }
    };
    globalThis.window = {
      showDirectoryPicker: async () => {
        stillInLegacyMode = false; // User switched mode while OS folder picker was open
        return fakeDirHandle;
      }
    };
    let onFilesCalledAfterSwitch = false;
    let fallbackAfterSwitch = false;
    const staleAfterPicker = await executeRememberedAudioFolderOpenService({
      mode: 'text',
      activeTextEditorModel: 'legacy-line-v1',
      forcePicker: true,
      shouldContinue: () => stillInLegacyMode,
      onFiles: () => {
        onFilesCalledAfterSwitch = true;
        return { matchedCount: 1 };
      },
      fallbackOpen: () => { fallbackAfterSwitch = true; }
    });
    assert.equal(staleAfterPicker.status, 'stale');
    assert.equal(onFilesCalledAfterSwitch, false);
    assert.equal(fallbackAfterSwitch, false);
    assert.equal(idbWriteAttempts, 0);

    // Even if shouldContinue is true until onFiles, stale scan result must prevent handle save
    globalThis.window.showDirectoryPicker = async () => fakeDirHandle;
    const staleScanResult = await executeRememberedAudioFolderOpenService({
      mode: 'table',
      forcePicker: true,
      shouldContinue: () => true,
      onFiles: () => ({ stale: true })
    });
    assert.equal(staleScanResult.status, 'stale');
    assert.equal(idbWriteAttempts, 0);
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = prevIndexedDb;
  }
});

// D1 — Desktop & Mobile System UI
await check('D1 DesktopSystemControls hides Legacy Audio Folder in Structured Text/unhydrated and preserves Table + Legacy Text', () => {
  resetHooks();
  const tableText = collectText(renderTree(DesktopSystemControls(createSystemProps({ mode: 'table' }))));
  assert.match(tableText, /Load Audio Folder/);

  resetHooks();
  const tableActiveText = collectText(renderTree(DesktopSystemControls(createSystemProps({
    mode: 'table',
    folderInputRef: { current: { click: () => {} }, tableAudioFolderSummary: { active: true, matchedCount: 2 } }
  }))));
  assert.match(tableActiveText, /Refresh Audio/);
  assert.match(tableActiveText, /Change Folder/);
  assert.match(tableActiveText, /Detach Audio Folder/);

  resetHooks();
  const legacyEmptyText = collectText(renderTree(DesktopSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: 'legacy-line-v1',
    currentMapCount: 0,
    legacyTextAudioCount: 0
  }))));
  assert.match(legacyEmptyText, /Load Audio Folder/);

  resetHooks();
  const legacyActiveText = collectText(renderTree(DesktopSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: 'legacy-line-v1',
    currentMapCount: 4,
    legacyTextAudioCount: 4
  }))));
  assert.match(legacyActiveText, /Refresh Audio/);
  assert.match(legacyActiveText, /Change Folder/);

  resetHooks();
  const structuredNodes = renderTree(DesktopSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: 'structured-v1',
    currentMapCount: 99,
    legacyTextAudioCount: 0
  })));
  const structuredText = collectText(structuredNodes);
  assert.doesNotMatch(structuredText, /Load Audio Folder/);
  assert.doesNotMatch(structuredText, /Refresh Audio/);
  assert.doesNotMatch(structuredText, /Change Folder/);
  assert.match(structuredText, /Staging, Audio Library & Portable ZIP/);

  resetHooks();
  const pendingText = collectText(renderTree(DesktopSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: null,
    currentMapCount: 99
  }))));
  assert.doesNotMatch(pendingText, /Load Audio Folder/);
  assert.doesNotMatch(pendingText, /Refresh Audio/);
});

await check('D1 MobileSystemControls matches Desktop boundary across Table, Legacy Text, Structured Text, and unhydrated boot', () => {
  resetHooks();
  assert.match(collectText(renderTree(MobileSystemControls(createSystemProps({ mode: 'table' })))), /Load Audio Folder/);

  resetHooks();
  assert.match(collectText(renderTree(MobileSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: 'legacy-line-v1',
    currentMapCount: 0
  })))), /Load Audio Folder/);

  resetHooks();
  const legacyActive = collectText(renderTree(MobileSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: 'legacy-line-v1',
    currentMapCount: 2,
    legacyTextAudioCount: 2
  }))));
  assert.match(legacyActive, /Refresh/);
  assert.match(legacyActive, /Change/);

  resetHooks();
  const structuredMobile = collectText(renderTree(MobileSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: 'structured-v1',
    currentMapCount: 55
  }))));
  assert.doesNotMatch(structuredMobile, /Load Audio Folder/);
  assert.doesNotMatch(structuredMobile, /Refresh/);
  assert.match(structuredMobile, /Staging, Audio Library & Portable ZIP/);

  resetHooks();
  const pendingMobile = collectText(renderTree(MobileSystemControls(createSystemProps({
    mode: 'text',
    activeTextEditorModel: null,
    currentMapCount: 55
  }))));
  assert.doesNotMatch(pendingMobile, /Load Audio Folder/);
});

// D4 — Desktop & Mobile Data Actions + Batch popup routing
await check('D4 DesktopDataActions and MobileDataControls expose BULK AUDIO only for structured-v1, never Legacy Text', () => {
  const baseDesktopData = {
    mode: 'text',
    isSystemBusy: false,
    csvInputRef: { current: null },
    openManualAdd: () => {},
    playlist: [],
    tableViewMode: 'full',
    exportTableCSV: () => {},
    setIsClearDialogOpen: () => {},
    setIsChangeReviewOpen: () => {},
    undoStack: [],
    undoLastDataChange: () => {},
    saveUpdatedCSV: () => {},
    isMultiSourceMode: false,
    isBatchOpen: false,
    setIsBatchOpen: () => {},
    isBatchDownloading: false
  };

  resetHooks();
  const desktopStructured = collectText(renderTree(DesktopDataActions({ ...baseDesktopData, activeTextEditorModel: 'structured-v1' })));
  assert.match(desktopStructured, /BULK AUDIO/);

  resetHooks();
  const desktopLegacy = collectText(renderTree(DesktopDataActions({ ...baseDesktopData, activeTextEditorModel: 'legacy-line-v1' })));
  assert.doesNotMatch(desktopLegacy, /BULK AUDIO/);
  assert.match(desktopLegacy, /Clear Legacy Text/);
  assert.match(desktopLegacy, /Bulk Audio requires Structured Text/);

  resetHooks();
  const desktopPending = collectText(renderTree(DesktopDataActions({ ...baseDesktopData, activeTextEditorModel: null })));
  assert.doesNotMatch(desktopPending, /BULK AUDIO/);

  const baseMobileData = {
    mode: 'text',
    activeTextDocument: null,
    activeTextEditorModel: null,
    isSystemBusy: false,
    isBatchOpen: false,
    setIsBatchOpen: () => {},
    isBatchDownloading: false
  };

  const renderMobileDataWithWorkspaceOpen = (props) => {
    const prevDoc = globalThis.document;
    globalThis.document = { body: {} };
    try {
      resetHooks();
      const firstPass = renderTree(MobileDataControls(props));
      const openBtn = firstPass.find(n => n?.props?.['data-text-mobile-open-workspace'] === 'true');
      assert.ok(openBtn, 'Expected OPEN DATA WORKSPACE button in MobileDataControls');
      openBtn.props.onClick();
      rerenderHooks();
      return renderTree(MobileDataControls(props));
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  };

  const mobileStructuredNodes = renderMobileDataWithWorkspaceOpen({
    ...baseMobileData,
    activeTextDocument: { id: 'D1', editorModel: 'structured-v1' },
    activeTextEditorModel: 'structured-v1'
  });
  const mobileStructured = collectText(mobileStructuredNodes);
  assert.match(mobileStructured, /BULK AUDIO/);

  const mobileLegacyNodes = renderMobileDataWithWorkspaceOpen({
    ...baseMobileData,
    activeTextDocument: { id: 'D2', editorModel: 'legacy-line-v1' },
    activeTextEditorModel: 'legacy-line-v1'
  });
  const mobileLegacy = collectText(mobileLegacyNodes);
  assert.doesNotMatch(mobileLegacy, /BULK AUDIO/);
  assert.doesNotMatch(mobileLegacy, /DATA = Library • JSON Sources • CRUD • Backup • Bulk Audio/);
  assert.match(mobileLegacy, /Bulk Audio requires Structured Text/);
  assert.ok(mobileLegacyNodes.some(n => n?.props?.['data-legacy-text-bulk-disabled'] === 'mobile'));

  const mobilePendingNodes = renderMobileDataWithWorkspaceOpen(baseMobileData);
  const mobilePending = collectText(mobilePendingNodes);
  assert.doesNotMatch(mobilePending, /BULK AUDIO/);
  assert.match(mobilePending, /Bulk Audio is available in Structured Text/);
});

await check('D4 renderBatchPopupView fails closed for Legacy Text and routes strictly by mode + editorModel', () => {
  const tableEl = renderBatchPopupView({ mode: 'table', activeTextEditorModel: 'legacy-line-v1', structuredTextBatch: null });
  assert.equal(tableEl?.type?.name, 'Stub');
  assert.equal(renderTree(tableEl)[0].type, 'stub:BatchPopup');

  const structuredEl = renderBatchPopupView({ mode: 'text', activeTextEditorModel: 'structured-v1', structuredTextBatch: { docId: 'S1' } });
  assert.equal(renderTree(structuredEl)[0].type, 'stub:TextBatchPopup');

  const legacyNull = renderBatchPopupView({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', structuredTextBatch: null });
  assert.equal(legacyNull, null);

  // Even with stale structuredTextBatch lingering across transition, Legacy fails closed
  const legacyWithStaleBatch = renderBatchPopupView({ mode: 'text', activeTextEditorModel: 'legacy-line-v1', structuredTextBatch: { docId: 'STALE' } });
  assert.equal(legacyWithStaleBatch, null);

  const pendingNull = renderBatchPopupView({ mode: 'text', activeTextEditorModel: null, structuredTextBatch: null });
  assert.equal(pendingNull, null);
});

// Source wiring & scope-protection regression check
await check('App.jsx, MainAppShellView.jsx, and MobileTools.jsx wire D1/D4 guards cleanly without modifying D2/D3', () => {
  const appSource = read('src/App.jsx');
  const shellSource = read('src/components/layout/MainAppShellView.jsx');
  const mobileToolsSource = read('src/components/layout/MobileTools.jsx');
  const desktopSysSource = read('src/components/controls/DesktopSystemControls.jsx');
  const mobileSysSource = read('src/components/controls/MobileSystemControls.jsx');

  // D1 App handlers & effect
  assert.match(appSource, /isLegacyAudioFolderSupported\(\{ mode, activeTextEditorModel \}\)/);
  assert.match(appSource, /useLayoutEffect\(\(\) => \{\s*latestAudioFolderScopeRef\.current = \{/);
  assert.match(appSource, /isMatchingAudioFolderScope\(/);
  assert.match(appSource, /executeRememberedAudioFolderRestoreService\(\{[\s\S]*activeTextEditorModel: expectedEditorModel[\s\S]*shouldContinue/);
  assert.match(appSource, /executeAudioFolderSelectService\(\{[\s\S]*activeTextEditorModel: liveScope\.activeTextEditorModel/);
  assert.match(appSource, /\[mode, activeTextEditorModel, audioDatasetIdentitySignature\]/);

  // D4 App batch guards & transition close
  assert.match(appSource, /const batchScopeKey = getBatchScopeKey\(\{ mode, activeTextEditorModel, activeTextDocumentId \}\)/);
  assert.match(appSource, /const \[openBatchScopeKey, setOpenBatchScopeKey\] = useState\(null\)/);
  assert.match(appSource, /if \(previousBatchScopeKeyRef\.current !== batchScopeKey\)[\s\S]*setIsBatchOpen\(false\)[\s\S]*setOpenBatchScopeKey\(null\)/);
  assert.match(appSource, /const setBatchOpenGuarded = useCallback/);
  assert.match(appSource, /resolveGuardedBatchOpenValue\(/);
  assert.match(appSource, /const effectiveIsBatchOpen = Boolean\(isBatchOpen && canOpenBatchPopup && openBatchScopeKey === batchScopeKey\)/);
  assert.match(appSource, /const runBatchDownload = async \(options = \{\}\) => \{\s*if \(mode !== 'table'\)/);
  assert.match(appSource, /renderBatchPopupView\(\{\s*batchPanelRef, mode, activeTextEditorModel, setIsBatchOpen: setBatchOpenGuarded/);
  assert.match(appSource, /isBatchDownloading, setIsBatchOpen: setBatchOpenGuarded, isBatchOpen: effectiveIsBatchOpen, renderBatchPopup/);

  // Shell & Mobile prop threading + portal null guard
  assert.match(shellSource, /const batchPopupNode = renderBatchPopup\(\{ inline: true, showClose: true \}\);\s*if \(!batchPopupNode\) return null;/);
  assert.match(shellSource, /<DesktopSystemControls[\s\S]*activeTextEditorModel=\{activeTextEditorModel\}[\s\S]*legacyTextAudioCount=\{legacyTextAudioCount\}/);
  assert.match(mobileToolsSource, /<MobileDataControls[\s\S]*activeTextEditorModel=\{activeTextEditorModel\}/);
  assert.match(mobileToolsSource, /<MobileSystemControls[\s\S]*activeTextEditorModel=\{activeTextEditorModel\}[\s\S]*legacyTextAudioCount=\{legacyTextAudioCount\}/);

  // Scope protection: D2 (Generator Engine) & D3 (StorageManagerPanel) remain untouched
  assert.match(desktopSysSource, /GENERATOR ENGINE SWITCHER/);
  assert.match(desktopSysSource, /<StorageManagerPanel/);
  assert.match(mobileSysSource, /<StorageManagerPanel/);
});

console.log(`ALL ${passed} ROUND-A (D1/D4) CHECKS PASSED`);
