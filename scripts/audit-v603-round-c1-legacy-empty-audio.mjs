import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../src/constants/textDatabaseConstants.js';
import {
  buildLegacyTextAudioDatasetSignature,
  hasActiveLegacyAudioFolder,
  shouldClearLegacyTextAudioOnDocumentState
} from '../src/domain/view/dataSystemBoundaryDomain.js';

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
    return [hookValues[at], value => {
      hookValues[at] = typeof value === 'function' ? value(hookValues[at]) : value;
    }];
  },
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useRef: initial => {
    const at = hookSlot++;
    if (!(at in hookValues)) hookValues[at] = { current: initial };
    return hookValues[at];
  },
  useEffect: () => {},
  memo: fn => fn
};

const fakeIcons = new Proxy({}, {
  get: (_, key) => (typeof key === 'string' ? function Icon() { return null; } : null)
});

const StubComponent = name => function Stub(props) {
  return { type: `stub:${name}`, props };
};

const transpile = (source, absPath) => esbuild.transformSync(source, {
  loader: absPath.endsWith('.jsx') ? 'jsx' : 'js',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform'
}).code;

const createModuleLoader = (customStubs = {}) => {
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
      if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency: ${specifier}`);
      const resolved = path.resolve(path.dirname(resolvedAbs), specifier);
      const basename = path.basename(resolved).replace(/\.(js|jsx)$/, '');
      if (customStubs[basename]) return customStubs[basename];
      if (['StorageManagerPanel', 'GroupedVoiceSelect', 'ConfirmDialog'].includes(basename)) {
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
  return loadModule;
};

const loadModule = createModuleLoader();

const { resolveLocalAudioUrl } = loadModule(path.join(root, 'src/domain/audio/audioSourceRoutingDomain.js'));
const { reconcileTextIdentityState, resolveTextPlaylist } = loadModule(path.join(root, 'src/domain/text/textIdentityDomain.js'));
const { executePlaylistContentSyncEffect } = loadModule(path.join(root, 'src/services/app/mainAppStateLifecycleService.js'));
const {
  executeAudioFolderSelectService,
  executeRememberedAudioFolderRestoreService
} = loadModule(path.join(root, 'src/services/audio/audioFolderLifecycleService.js'));
const { getStableAudioIdentity } = loadModule(path.join(root, 'src/utils/audioUtils.js'));

const renderTree = (node, depth = 0) => {
  if (depth > 120) throw new Error('Excessive component nesting');
  if (Array.isArray(node)) return node.flatMap(child => renderTree(child, depth + 1));
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node !== 'object' || !('type' in node)) return [node];
  if (typeof node.type === 'function') return renderTree(node.type(node.props), depth + 1);
  const children = renderTree(node.props?.children, depth + 1);
  return [{ ...node, children }, ...children];
};

const collectText = nodes => nodes
  .filter(node => typeof node === 'string' || typeof node === 'number')
  .map(String);

const findElements = (nodes, predicate) => nodes.filter(
  node => node && typeof node === 'object' && 'type' in node && predicate(node)
);

const results = [];
const runTest = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`[PASS] ${name}`);
};

// Test 1: Pure domain checks for empty vs non-empty Legacy signatures & state cleanup
await runTest('Task 1 Domain: buildLegacyTextAudioDatasetSignature & shouldClearLegacyTextAudioOnDocumentState handle empty, unsynced, and valid Legacy docs', async () => {
  const nonEmptyIdentity = {
    items: [
      { id: 'TEXT_000001', text: 'Hello' },
      { id: 'TEXT_000002', text: 'World' }
    ]
  };
  const emptyIdentity = { items: [] };
  const nonEmptyPlaylist = resolveTextPlaylist(nonEmptyIdentity);

  // Valid synced non-empty Legacy workspace
  assert.equal(buildLegacyTextAudioDatasetSignature({
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    activeTextDocumentId: 'DOC_A',
    textDatabaseStatus: 'ready',
    textIdentityState: nonEmptyIdentity,
    playlist: nonEmptyPlaylist
  }), 'DOC_A:TEXT_000001|TEXT_000002');

  // Empty Legacy workspace (0 text lines) -> empty signature
  assert.equal(buildLegacyTextAudioDatasetSignature({
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    activeTextDocumentId: 'DOC_B',
    textDatabaseStatus: 'ready',
    textIdentityState: emptyIdentity,
    playlist: []
  }), '');

  // Transient unsynced Frame-1 (DOC_B active with 0 items, playlist still holding DOC_A items) -> empty signature (never phantom DOC_B:TEXT_000001)
  assert.equal(buildLegacyTextAudioDatasetSignature({
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    activeTextDocumentId: 'DOC_B',
    textDatabaseStatus: 'ready',
    textIdentityState: emptyIdentity,
    playlist: nonEmptyPlaylist
  }), '');

  // Pre-hydration, Table, Structured -> empty Legacy signature
  assert.equal(buildLegacyTextAudioDatasetSignature({
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    activeTextDocumentId: 'DOC_A',
    textDatabaseStatus: 'booting',
    textIdentityState: nonEmptyIdentity,
    playlist: nonEmptyPlaylist
  }), '');
  assert.equal(buildLegacyTextAudioDatasetSignature({
    mode: 'text',
    activeTextEditorModel: TEXT_STRUCTURED_EDITOR_MODEL,
    activeTextDocumentId: 'DOC_S',
    textDatabaseStatus: 'ready',
    textIdentityState: nonEmptyIdentity,
    playlist: nonEmptyPlaylist
  }), '');

  // Transition triggers
  assert.deepEqual(shouldClearLegacyTextAudioOnDocumentState({
    previousDocumentId: 'DOC_A',
    activeTextDocumentId: 'DOC_B',
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    textDatabaseStatus: 'ready',
    textIdentityState: emptyIdentity
  }), { shouldClear: true, reason: 'document-changed' });

  assert.deepEqual(shouldClearLegacyTextAudioOnDocumentState({
    previousDocumentId: 'DOC_A',
    activeTextDocumentId: 'DOC_A',
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    textDatabaseStatus: 'ready',
    textIdentityState: emptyIdentity
  }), { shouldClear: true, reason: 'empty-legacy-workspace' });

  // Staying on same non-empty Legacy workspace (including Table <-> Text toggle) must NOT clear
  assert.deepEqual(shouldClearLegacyTextAudioOnDocumentState({
    previousDocumentId: 'DOC_A',
    activeTextDocumentId: 'DOC_A',
    mode: 'table',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    textDatabaseStatus: 'ready',
    textIdentityState: nonEmptyIdentity
  }), { shouldClear: false, reason: 'none' });
  assert.deepEqual(shouldClearLegacyTextAudioOnDocumentState({
    previousDocumentId: 'DOC_A',
    activeTextDocumentId: 'DOC_A',
    mode: 'text',
    activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
    textDatabaseStatus: 'ready',
    textIdentityState: nonEmptyIdentity
  }), { shouldClear: false, reason: 'none' });
});

// Test 2: Full lifecycle simulation (DOC_A [loaded] -> Empty DOC_B [0 lines] -> back to DOC_A [non-empty], plus in-place delete-all & non-empty DOC_C without folder match)
await runTest('Task 1 Lifecycle: Switching Legacy DOC_A -> Empty DOC_B clears stale audio without deleting remembered handle or breaking DOC_A auto-restore', async () => {
  const DesktopSystemControls = loadModule(path.join(root, 'src/components/controls/DesktopSystemControls.jsx')).default;
  const MobileSystemControls = loadModule(path.join(root, 'src/components/controls/MobileSystemControls.jsx')).default;

  const docA = {
    id: 'DOC_A',
    collectionId: null,
    order: 1,
    title: 'Legacy Non-Empty A',
    editorModel: TEXT_LEGACY_EDITOR_MODEL,
    documentType: 'mixed',
    blocks: [
      { id: 'TEXT_000001', order: 1, segments: [{ id: 'SEGMENT_1', order: 1, text: 'First line' }] },
      { id: 'TEXT_000002', order: 2, segments: [{ id: 'SEGMENT_2', order: 1, text: 'Second line' }] }
    ]
  };
  const docBEmpty = {
    id: 'DOC_B',
    collectionId: null,
    order: 2,
    title: 'Legacy Empty B',
    editorModel: TEXT_LEGACY_EDITOR_MODEL,
    documentType: 'mixed',
    blocks: []
  };
  const docCNonEmpty = {
    id: 'DOC_C',
    collectionId: null,
    order: 3,
    title: 'Legacy Other C',
    editorModel: TEXT_LEGACY_EDITOR_MODEL,
    documentType: 'mixed',
    blocks: [
      { id: 'TEXT_000010', order: 1, segments: [{ id: 'SEGMENT_10', order: 1, text: 'Unmatched line' }] }
    ]
  };

  const docs = new Map([
    ['DOC_A', docA],
    ['DOC_B', docBEmpty],
    ['DOC_C', docCNonEmpty]
  ]);

  const toIdentityState = doc => ({
    schemaVersion: 1,
    highWater: 10,
    rawContent: (doc.blocks || []).map(b => b.segments[0].text).join('\n'),
    items: (doc.blocks || []).map(b => ({ id: b.id, text: b.segments[0].text }))
  });

  const makeSnapshot = activeId => ({
    schemaVersion: 1,
    activeDocumentId: activeId,
    counters: { collection: 0, document: 3, text: 10, segment: 10, audioVariant: 0 },
    documents: [docA, docBEmpty, docCNonEmpty].map(({ blocks, ...meta }) => ({ ...meta })),
    collections: [],
    blocks: [docA, docBEmpty, docCNonEmpty].flatMap(d => d.blocks.map(b => ({ ...b, documentId: d.id, blockType: 'paragraph' }))),
    segments: [docA, docBEmpty, docCNonEmpty].flatMap(d => d.blocks.flatMap(b => b.segments.map(s => ({ ...s, documentId: d.id, blockId: b.id })))),
    audioVariants: []
  });

  const revokedUrls = [];
  let blobSeq = 0;
  const prevURL = globalThis.URL;
  const prevWindow = globalThis.window;
  const prevIndexedDB = globalThis.indexedDB;

  const rememberedHandles = new Map();
  let deletedHandleKeys = 0;
  const originalAudioFiles = [
    new File(['a1'], 'TEXT_000001_en.mp3', { type: 'audio/mpeg' }),
    new File(['a2'], 'TEXT_000002_en.mp3', { type: 'audio/mpeg' })
  ];
  const fakeDirHandle = {
    name: 'LegacyFolder',
    queryPermission: async () => 'granted',
    async *values() {
      for (const file of originalAudioFiles) {
        yield { kind: 'file', getFile: async () => file };
      }
    }
  };
  rememberedHandles.set('audio-folder-text', fakeDirHandle);

  globalThis.URL = {
    createObjectURL: file => `blob:test/${++blobSeq}/${file?.name || 'file'}`,
    revokeObjectURL: url => { revokedUrls.push(url); }
  };
  globalThis.window = {
    showDirectoryPicker: async () => fakeDirHandle
  };
  globalThis.indexedDB = {
    open: () => {
      const req = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => ({}),
          close: () => {},
          transaction: () => {
            const tx = { oncomplete: null, onerror: null, onabort: null };
            return Object.assign(tx, {
              objectStore: () => ({
                get: key => {
                  const getReq = {};
                  queueMicrotask(() => {
                    getReq.result = rememberedHandles.get(key) || null;
                    getReq.onsuccess?.();
                  });
                  return getReq;
                },
                delete: () => {
                  deletedHandleKeys += 1;
                  queueMicrotask(() => tx.oncomplete?.());
                },
                put: (value, key) => {
                  rememberedHandles.set(key, value);
                  queueMicrotask(() => tx.oncomplete?.());
                }
              })
            });
          }
        };
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    }
  };

  try {
    // Harness state mirroring App.jsx Legacy Text lifecycle
    const state = {
      mode: 'text',
      activeTextDocumentId: 'DOC_A',
      activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
      textDatabaseStatus: 'ready',
      textIdentityState: toIdentityState(docA),
      playlist: resolveTextPlaylist(toIdentityState(docA)),
      localAudioMapText: {},
      audioStatusText: 'idle',
      generatedAudioMeta: {}
    };
    const restoreState = { signatures: {}, generations: {} };
    let previousDocumentId = 'DOC_A';

    const getLegacyTextAudioCount = () => Object.keys(state.localAudioMapText).length;
    const renderSystemControls = () => {
      const common = {
        mode: state.mode,
        activeTextEditorModel: state.activeTextEditorModel,
        isSystemBusy: false,
        generatorEngine: 'edge',
        edgeVoice: 'en-US-AriaNeural',
        edgeIndonesianVoice: 'id-ID-GadisNeural',
        edgeVoices: [],
        aiVoices: [],
        edgeHealth: { status: 'ok' },
        folderInputRef: { current: null },
        currentMapCount: getLegacyTextAudioCount(),
        legacyTextAudioCount: getLegacyTextAudioCount(),
        batchSessions: [],
        systemLogs: [],
        logContainerRef: { current: null }
      };
      resetHooks();
      const desktop = collectText(renderTree(mockReact.createElement(DesktopSystemControls, common))).join(' | ');
      resetHooks();
      const mobile = collectText(renderTree(mockReact.createElement(MobileSystemControls, common))).join(' | ');
      return { desktop, mobile };
    };

    const runSyncAndAudioEffects = async () => {
      // 1) App.jsx:1348 playlist content sync effect
      executePlaylistContentSyncEffect({
        mode: state.mode,
        textIdentityState: state.textIdentityState,
        textDatabaseStatus: state.textDatabaseStatus,
        setTextDatabaseStatus: next => { state.textDatabaseStatus = next; },
        setPlaylist: next => { state.playlist = next; },
        setBatchConfig: () => {},
        tableContent: '',
        sequenceHighWater: 0,
        setSequenceHighWater: () => {},
        setManualIdHighWater: () => {},
        addLog: () => {}
      });

      // 2) App.jsx clear-legacy effect
      const prevId = previousDocumentId;
      previousDocumentId = state.activeTextDocumentId;
      const { shouldClear, reason } = shouldClearLegacyTextAudioOnDocumentState({
        previousDocumentId: prevId,
        activeTextDocumentId: state.activeTextDocumentId,
        mode: state.mode,
        activeTextEditorModel: state.activeTextEditorModel,
        textDatabaseStatus: state.textDatabaseStatus,
        textIdentityState: state.textIdentityState
      });
      if (shouldClear) {
        const urls = Object.values(state.localAudioMapText);
        const hasMeta = Object.keys(state.generatedAudioMeta).some(k => k.startsWith('text:'));
        const hasStale = urls.length > 0 || Boolean(restoreState.signatures.text) || hasMeta;
        if (!(reason === 'empty-legacy-workspace' && !hasStale)) {
          urls.forEach(u => globalThis.URL.revokeObjectURL(u));
          restoreState.signatures.text = '';
          restoreState.generations.text = (restoreState.generations.text || 0) + 1;
          if (urls.length > 0) state.localAudioMapText = {};
          state.audioStatusText = 'idle';
          if (hasMeta) state.generatedAudioMeta = {};
        }
      }

      // 3) App.jsx auto-restore effect
      const sig = buildLegacyTextAudioDatasetSignature({
        mode: state.mode,
        activeTextEditorModel: state.activeTextEditorModel,
        activeTextDocumentId: state.activeTextDocumentId,
        textDatabaseStatus: state.textDatabaseStatus,
        textIdentityState: state.textIdentityState,
        playlist: state.playlist
      });
      if (state.playlist.length && sig && restoreState.signatures.text !== sig) {
        restoreState.signatures.text = sig;
        const generation = (restoreState.generations.text || 0) + 1;
        restoreState.generations.text = generation;
        const expectedDocId = state.activeTextDocumentId;
        await executeRememberedAudioFolderRestoreService({
          mode: 'text',
          activeTextEditorModel: state.activeTextEditorModel,
          shouldContinue: () => restoreState.generations.text === generation && state.activeTextDocumentId === expectedDocId,
          onFiles: files => executeAudioFolderSelectService({
            e: { target: { files, value: '' } },
            mode: 'text',
            activeTextEditorModel: state.activeTextEditorModel,
            localAudioMapTable: {},
            localAudioMapText: state.localAudioMapText,
            playlist: state.playlist,
            getRecordAudioNo: () => null,
            getVocabIdentity: () => null,
            getStableAudioIdentity,
            setLocalAudioMapTable: () => {},
            setAudioStatusTable: () => {},
            setLocalAudioMapText: next => { state.localAudioMapText = next; },
            setAudioStatusText: next => { state.audioStatusText = next; },
            silent: true,
            onMatchedAudio: () => {},
            edgeVoices: []
          }),
          addLog: () => {}
        });
      }
    };

    const serviceLoader = createModuleLoader({
      textLibraryCommandService: {
        executeTextLibraryCommand: async ({ payload }) => ({
          id: payload.id,
          librarySnapshot: makeSnapshot(payload.id)
        }),
        executeTextAudioVariantUpsert: async () => null
      },
      textLibraryIndexedDbService: {
        syncLegacyTextProjectionToDatabase: async () => null
      }
    });
    const { executeTextLibrarySelectDocument } = serviceLoader(path.join(root, 'src/services/persistence/textLibraryWorkspaceService.js'));

    const switchDoc = async targetId => {
      await executeTextLibrarySelectDocument({
        documentId: targetId,
        activeTextDocumentId: state.activeTextDocumentId,
        activeTextEditorModel: state.activeTextEditorModel,
        textIdentityState: state.textIdentityState,
        setTextLibrarySnapshot: () => {},
        setActiveTextDocumentId: next => { state.activeTextDocumentId = next; },
        setTextIdentityState: next => { state.textIdentityState = next; },
        setTextContent: () => {},
        addLog: () => {}
      });
      await runSyncAndAudioEffects();
    };

    // Phase 1: DOC_A auto-restores 2 local audio files cleanly
    await runSyncAndAudioEffects();
    assert.equal(state.playlist.length, 2);
    assert.equal(getLegacyTextAudioCount(), 2);
    assert.equal(state.audioStatusText, 'success');
    assert.ok(resolveLocalAudioUrl({ mode: 'text', item: state.playlist[0], part: 'full', localAudioMapTable: {}, localAudioMapText: state.localAudioMapText }));
    const controlsA = renderSystemControls();
    assert.ok(controlsA.desktop.includes('Refresh') && controlsA.mobile.includes('Refresh'));

    // Phase 2: Switch DOC_A -> Empty DOC_B (0 text lines)
    await switchDoc('DOC_B');
    assert.equal(state.activeTextDocumentId, 'DOC_B');
    assert.equal(state.playlist.length, 0);
    assert.deepEqual(state.localAudioMapText, {});
    assert.equal(state.audioStatusText, 'idle');
    assert.equal(getLegacyTextAudioCount(), 0);
    assert.equal(revokedUrls.length, 2, 'Stale DOC_A blob URLs must be revoked');
    assert.equal(resolveLocalAudioUrl({ mode: 'text', item: docA.blocks[0], part: 'full', localAudioMapTable: {}, localAudioMapText: state.localAudioMapText }), undefined);
    assert.equal(hasActiveLegacyAudioFolder({
      mode: 'text',
      activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
      legacyTextAudioCount: getLegacyTextAudioCount()
    }), false);
    const controlsB = renderSystemControls();
    assert.ok(controlsB.desktop.includes('Load Audio Folder') && !controlsB.desktop.includes('Refresh'));
    assert.ok(controlsB.mobile.includes('Load Audio Folder') && !controlsB.mobile.includes('Refresh'));
    // Remembered folder handle & original files must remain intact
    assert.equal(rememberedHandles.get('audio-folder-text'), fakeDirHandle);
    assert.equal(deletedHandleKeys, 0);
    assert.equal(originalAudioFiles.length, 2);

    // Phase 3: Switch Empty DOC_B -> Normal Non-Empty DOC_A -> valid auto-restore must succeed
    await switchDoc('DOC_A');
    assert.equal(state.activeTextDocumentId, 'DOC_A');
    assert.equal(state.playlist.length, 2);
    assert.equal(getLegacyTextAudioCount(), 2);
    assert.equal(state.audioStatusText, 'success');
    assert.ok(resolveLocalAudioUrl({ mode: 'text', item: state.playlist[1], part: 'full', localAudioMapTable: {}, localAudioMapText: state.localAudioMapText }));

    // Phase 4: Switch DOC_A -> Non-Empty DOC_C (unmatched IDs TEXT_000010) -> must clear A's audio and report 0 for C
    await switchDoc('DOC_C');
    assert.equal(state.activeTextDocumentId, 'DOC_C');
    assert.equal(state.playlist.length, 1);
    assert.deepEqual(state.localAudioMapText, {});
    assert.equal(state.audioStatusText, 'empty');
    assert.equal(getLegacyTextAudioCount(), 0);
    assert.equal(resolveLocalAudioUrl({ mode: 'text', item: docA.blocks[0], part: 'full', localAudioMapTable: {}, localAudioMapText: state.localAudioMapText }), undefined);

    // Phase 5: In-place delete all lines in DOC_A
    await switchDoc('DOC_A');
    assert.equal(getLegacyTextAudioCount(), 2);
    state.textIdentityState = reconcileTextIdentityState(state.textIdentityState, '');
    await runSyncAndAudioEffects();
    assert.equal(state.playlist.length, 0);
    assert.deepEqual(state.localAudioMapText, {});
    assert.equal(state.audioStatusText, 'idle');
    assert.equal(restoreState.signatures.text, '');
    assert.equal(rememberedHandles.get('audio-folder-text'), fakeDirHandle);
  } finally {
    globalThis.URL = prevURL;
    globalThis.window = prevWindow;
    globalThis.indexedDB = prevIndexedDB;
  }
});

// Test 3: Source wiring check in App.jsx
await runTest('Task 1 App.jsx Wiring: uses buildLegacyTextAudioDatasetSignature and shouldClearLegacyTextAudioOnDocumentState without modifying Table or Structured Text', async () => {
  const appSource = read('src/App.jsx');
  assert.match(appSource, /buildLegacyTextAudioDatasetSignature\(\{/);
  assert.match(appSource, /shouldClearLegacyTextAudioOnDocumentState\(\{/);
  assert.match(appSource, /localAudioMapTextRef\.current/);
  assert.match(appSource, /previousLegacyAudioDocumentIdRef\.current/);
});

// Test 4: Task 2 UI Label Correction ("New Text Workspace")
await runTest('Task 2 UI Label: Create Workspace heading reads "New Text Workspace" while keeping Legacy & Structured creation intact', async () => {
  const { TextLibraryShell } = loadModule(path.join(root, 'src/components/text/TextLibraryShell.jsx'));

  let createdPayload = null;
  const props = {
    catalog: { collections: [], rootDocuments: [] },
    activeDocument: null,
    activeDocumentTree: null,
    activeDocumentId: null,
    isBusy: false,
    error: null,
    onSelectDocument: () => {},
    onCreateDocument: async payload => {
      createdPayload = payload;
      return { id: 'DOC_NEW' };
    }
  };

  const renderShell = () => renderTree(mockReact.createElement(TextLibraryShell, props));
  resetHooks();
  let nodes = renderShell();

  const clickButton = matcher => {
    const btn = findElements(
      nodes,
      el => el.type === 'button' && el.props?.onClick && matcher(collectText(el.children).join('').replace(/\s+/g, ' ').trim())
    )[0];
    assert.ok(btn, 'Expected button not found');
    btn.props.onClick();
    rerenderHooks();
    nodes = renderShell();
  };

  clickButton(text => text === 'Create');
  clickButton(text => text.startsWith('Create Workspace'));

  const allText = collectText(nodes).join(' | ');
  assert.ok(allText.includes('New Text Workspace'), `Expected heading "New Text Workspace". Got: ${allText}`);
  assert.ok(!allText.includes('New Structured Workspace'), `Misleading heading "New Structured Workspace" must not appear. Got: ${allText}`);

  for (const opt of ['Legacy', 'Paragraph', 'Conversation', 'Mixed']) {
    assert.ok(
      findElements(nodes, el => el.type === 'button' && collectText(el.children).join('').trim() === opt).length >= 1,
      `Missing workspace option "${opt}"`
    );
  }

  // Verify Legacy creation option inside [data-text-create-mode-tabs] remains untouched
  const modeTabsGroup = findElements(nodes, el => el.props?.['data-text-create-mode-tabs'] === 'true')[0];
  assert.ok(modeTabsGroup, 'Create workspace mode tabs group missing');
  const legacyOptionBtn = findElements(
    modeTabsGroup.children ? renderTree(modeTabsGroup.children) : [],
    el => el.type === 'button' && collectText(el.children).join('').trim() === 'Legacy'
  )[0];
  assert.ok(legacyOptionBtn, 'Legacy option button missing inside create mode tabs');
  legacyOptionBtn.props.onClick();
  rerenderHooks();
  nodes = renderShell();
  const titleInput = findElements(nodes, el => el.type === 'input' && el.props?.placeholder === 'Workspace title')[0];
  assert.ok(titleInput, 'Workspace title input missing');
  titleInput.props.onChange({ target: { value: 'My Legacy Workspace' } });
  rerenderHooks();
  nodes = renderShell();
  clickButton(text => text === 'Create & Open');
  await Promise.resolve();

  assert.deepEqual(createdPayload, {
    title: 'My Legacy Workspace',
    documentType: 'mixed',
    editorModel: 'legacy-line-v1',
    collectionId: null
  });
});

console.log(`\nRound C.1 Final Boundary Polish Audit complete: ${results.length} PASS`);
