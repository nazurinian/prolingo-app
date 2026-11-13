import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  getTextSystemBoundarySummary,
  isMatchingAudioFolderScope
} from '../src/domain/view/dataSystemBoundaryDomain.js';
import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../src/constants/textDatabaseConstants.js';
import {
  TEXT_LIBRARY_FILTER_OPTIONS,
  TEXT_WORKSPACE_CREATE_OPTIONS,
  TEXT_WORKSPACE_TYPES,
  getTextWorkspaceBadge,
  getTextWorkspaceDisplay,
  getTextWorkspaceFilterEmptyLabel,
  getTextWorkspaceLabel,
  resolveTextWorkspaceType
} from '../src/domain/text/textWorkspaceTaxonomyDomain.js';
import { executeRememberedAudioFolderOpenService } from '../src/services/audio/audioFolderLifecycleService.js';

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
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  memo: fn => fn
};

const fakeIcons = new Proxy({}, {
  get: (_, key) => (typeof key === 'string' ? function Icon() { return null; } : null)
});

const StubComponent = name => function Stub(props) {
  return { type: `stub:${name}`, props };
};

const STUBBED_UI_MODULES = new Set([
  'StorageManagerPanel',
  'GroupedVoiceSelect',
  'ConfirmDialog',
  'BottomPlayerBar',
  'SidebarShell',
  'SidebarTopControls',
  'PlayerAudioSourceControls',
  'PlayerBrowserTtsControls',
  'TextStructuredAudioControls',
  'DesktopLearnControls',
  'DesktopDataActions',
  'DesktopSystemControls',
  'ChangeReviewModal',
  'ManualEditorModal',
  'MobileTools',
  'WorkspaceTabs',
  'MasterDataToolbar',
  'BatchPopup',
  'TextStructuredCardAudioPanel',
  'TextStructuredPlaybackControls',
  'TextParagraphUnifiedReading',
  'TextStructuredSpeakerRegistry',
  'TextParagraphSentenceAuthoring'
]);

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
      if (STUBBED_UI_MODULES.has(basename)) {
        const stub = StubComponent(basename);
        return {
          __esModule: true,
          default: stub,
          [basename]: stub,
          GroupedVoiceSelect: stub,
          SafetyConfirmDialog: stub,
          RevertAllConfirmModal: stub,
          DeleteVocabularyModal: stub,
          ClearViewModal: stub,
          DeleteDeckModal: stub,
          TextStructuredCardAudioPanel: stub,
          TextStructuredSpeakerRegistry: stub,
          TextParagraphSentenceAuthoring: stub
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

const assertNoStaleWorkspaceTerms = (text, contextLabel) => {
  for (const forbidden of ['Conversation MIX', 'Mixed compatibility', 'Conversation • MIX', '• STRUCTURED']) {
    assert.ok(!text.includes(forbidden), `${contextLabel} must not display "${forbidden}". Got: ${text}`);
  }
  assert.ok(!/\bCONV\b/.test(text), `${contextLabel} must not display abbreviated "CONV". Got: ${text}`);
  assert.ok(!/\bPARA\b/.test(text), `${contextLabel} must not display abbreviated "PARA". Got: ${text}`);
};

const results = [];
const runTest = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`[PASS] ${name}`);
};

// Stage 0 Item 1: Text Storage summary distinction
await runTest('Stage 0 Item 1: Text System storage summary accurately distinguishes Text Library DB vs Shared Audio Staging DB', async () => {
  assert.equal(getTextSystemBoundarySummary({ mode: 'table', activeTextEditorModel: null }), null);
  for (const editorModel of [TEXT_STRUCTURED_EDITOR_MODEL, TEXT_LEGACY_EDITOR_MODEL, null]) {
    const summary = getTextSystemBoundarySummary({ mode: 'text', activeTextEditorModel: editorModel });
    const combined = `${summary.storageTitle} | ${summary.storageSummary} | ${summary.storageDetail}`;
    assert.match(combined, /Text Library IndexedDB/i);
    assert.match(combined, /documents,\s*cards,\s*segments,\s*and\s*metadata/i);
    assert.match(combined, /Shared Audio Staging IndexedDB/i);
    assert.match(combined, /separated by Table and Text mode/i);
    assert.ok(!/prolingo_app_storage|localStorage backup/i.test(combined));
  }
});

// Stage 0 Item 2: Legacy Audio Folder document-switch scope guard & async race protection
await runTest('Stage 0 Item 2: isMatchingAudioFolderScope rejects Legacy docA -> docB switch and preserves Table', async () => {
  assert.equal(isMatchingAudioFolderScope({ mode: 'table', activeTextEditorModel: null, activeTextDocumentId: null }, 'table', null, null), true);
  assert.equal(isMatchingAudioFolderScope({ mode: 'table', activeTextEditorModel: null, activeTextDocumentId: 'TEXTDOC_1' }, 'table', null, null), true);

  assert.equal(isMatchingAudioFolderScope(
    { mode: 'text', activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL, activeTextDocumentId: 'TEXTDOC_A' },
    'text',
    TEXT_LEGACY_EDITOR_MODEL,
    'TEXTDOC_A'
  ), true);

  assert.equal(isMatchingAudioFolderScope(
    { mode: 'text', activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL, activeTextDocumentId: 'TEXTDOC_B' },
    'text',
    TEXT_LEGACY_EDITOR_MODEL,
    'TEXTDOC_A'
  ), false);

  assert.equal(isMatchingAudioFolderScope(
    { mode: 'text', activeTextEditorModel: TEXT_STRUCTURED_EDITOR_MODEL, activeTextDocumentId: 'TEXTDOC_A' },
    'text',
    TEXT_LEGACY_EDITOR_MODEL,
    'TEXTDOC_A'
  ), false);

  const appSource = read('src/App.jsx');
  assert.match(appSource, /isMatchingAudioFolderScope\(latestAudioFolderScopeRef\.current,\s*expectedMode,\s*expectedEditorModel,\s*expectedDocumentId\)/);
  assert.match(appSource, /const expectedDocumentId = expectedMode === 'text' \? (?:liveScope\.activeTextDocumentId|activeTextDocumentId) : null;/);
  assert.match(appSource, /return `\$\{activeTextDocumentId \|\| ''\}:/);
});

await runTest('Stage 0 Item 2: Pending Legacy folder picker & remembered-handle permission reject stale docA -> docB switch without mutating state or IndexedDB', async () => {
  const prevWindow = globalThis.window;
  const prevIndexedDB = globalThis.indexedDB;

  try {
    let activeDocId = 'TEXTDOC_A';
    let onFilesCalls = 0;
    const handleWrites = [];
    const logs = [];
    let rememberedHandleRecord = null;

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
                  get: () => {
                    const getReq = {};
                    queueMicrotask(() => {
                      getReq.result = rememberedHandleRecord;
                      getReq.onsuccess?.();
                    });
                    return getReq;
                  },
                  put: (value, key) => {
                    handleWrites.push({ key, name: value?.name });
                    rememberedHandleRecord = value;
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

    const fakeFile = new File(['abc'], 'TEXT_000001_en_test.mp3', { type: 'audio/mpeg' });
    const createFakeDirHandle = name => ({
      name,
      queryPermission: async () => {
        await Promise.resolve();
        // Simulate docA -> docB switch while awaiting permission query
        if (name === 'FolderDocA_SwitchPermission') activeDocId = 'TEXTDOC_B';
        return 'granted';
      },
      async *values() {
        yield { kind: 'file', getFile: async () => fakeFile };
      }
    });

    globalThis.window = {
      showDirectoryPicker: async () => {
        await Promise.resolve();
        // Simulate switching from Legacy docA -> Legacy docB while OS folder picker is open
        activeDocId = 'TEXTDOC_B';
        return createFakeDirHandle('FolderPickedLate');
      }
    };

    // Case A: Folder picker resolves after Legacy docA -> docB switch
    const pickerRes = await executeRememberedAudioFolderOpenService({
      mode: 'text',
      activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
      forcePicker: true,
      shouldContinue: () => activeDocId === 'TEXTDOC_A',
      onFiles: async () => { onFilesCalls += 1; },
      addLog: (src, msg) => logs.push([src, msg])
    });
    assert.equal(pickerRes.status, 'stale');
    assert.equal(onFilesCalls, 0);
    assert.equal(handleWrites.length, 0);

    // Case B: Auto-restore / refresh queryPermission resolves after Legacy docA -> docB switch
    activeDocId = 'TEXTDOC_A';
    rememberedHandleRecord = createFakeDirHandle('FolderDocA_SwitchPermission');
    const restoreRes = await executeRememberedAudioFolderOpenService({
      mode: 'text',
      activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
      forcePicker: false,
      shouldContinue: () => activeDocId === 'TEXTDOC_A',
      onFiles: async () => { onFilesCalls += 1; },
      addLog: (src, msg) => logs.push([src, msg])
    });
    assert.equal(restoreRes.status, 'stale');
    assert.equal(onFilesCalls, 0);
    assert.equal(handleWrites.length, 0);

    // Case C: Matching docA completes normally
    activeDocId = 'TEXTDOC_A';
    rememberedHandleRecord = createFakeDirHandle('FolderDocA_SameDoc');
    const okRes = await executeRememberedAudioFolderOpenService({
      mode: 'text',
      activeTextEditorModel: TEXT_LEGACY_EDITOR_MODEL,
      forcePicker: false,
      shouldContinue: () => activeDocId === 'TEXTDOC_A',
      onFiles: async files => {
        onFilesCalls += 1;
        assert.equal(files.length, 1);
      },
      addLog: (src, msg) => logs.push([src, msg])
    });
    assert.equal(okRes.status, 'reconnected');
    assert.equal(onFilesCalls, 1);
  } finally {
    globalThis.window = prevWindow;
    globalThis.indexedDB = prevIndexedDB;
  }
});

// Stage 1 Round C: Taxonomy domain helper tests
await runTest('Round C Domain: resolveTextWorkspaceType & labels enforce Legacy precedence and separate Mixed from Conversation', async () => {
  assert.deepEqual(
    TEXT_LIBRARY_FILTER_OPTIONS.map(item => item.key),
    ['all', 'legacy', 'paragraph', 'conversation', 'mixed']
  );
  assert.deepEqual(
    TEXT_WORKSPACE_CREATE_OPTIONS.map(item => [item.key, item.label]),
    [
      ['legacy', 'Legacy'],
      ['paragraph', 'Paragraph'],
      ['conversation', 'Conversation'],
      ['mixed', 'Mixed']
    ]
  );

  // Legacy takes precedence even if stored documentType is mixed/conversation/paragraph
  for (const docType of ['mixed', 'conversation', 'paragraph', undefined]) {
    const legacyDoc = { id: 'TEXTDOC_L', editorModel: TEXT_LEGACY_EDITOR_MODEL, documentType: docType };
    assert.equal(resolveTextWorkspaceType(legacyDoc), TEXT_WORKSPACE_TYPES.LEGACY);
    assert.equal(getTextWorkspaceLabel(legacyDoc), 'Legacy');
    assert.equal(getTextWorkspaceBadge(legacyDoc), 'LEGACY');
  }

  const paraDoc = { id: 'TEXTDOC_P', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'paragraph' };
  const convDoc = { id: 'TEXTDOC_C', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'conversation' };
  const mixedDoc = { id: 'TEXTDOC_M', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'mixed' };

  assert.equal(resolveTextWorkspaceType(paraDoc), 'paragraph');
  assert.equal(getTextWorkspaceLabel(paraDoc), 'Paragraph');
  assert.equal(getTextWorkspaceBadge(paraDoc), 'PARAGRAPH');

  assert.equal(resolveTextWorkspaceType(convDoc), 'conversation');
  assert.equal(getTextWorkspaceLabel(convDoc), 'Conversation');
  assert.equal(getTextWorkspaceBadge(convDoc), 'CONVERSATION');

  assert.equal(resolveTextWorkspaceType(mixedDoc), 'mixed');
  assert.notEqual(resolveTextWorkspaceType(mixedDoc), 'conversation');
  assert.equal(getTextWorkspaceLabel(mixedDoc), 'Mixed');
  assert.equal(getTextWorkspaceBadge(mixedDoc), 'MIXED');

  // Batch option fallback with stripped editorModel
  assert.equal(resolveTextWorkspaceType({ documentType: 'mixed' }, TEXT_STRUCTURED_EDITOR_MODEL), 'mixed');
  assert.equal(getTextWorkspaceLabel({ documentType: 'mixed' }, TEXT_STRUCTURED_EDITOR_MODEL), 'Mixed');
  assert.deepEqual(getTextWorkspaceDisplay(null, null), { key: null, label: 'Text', badge: 'TEXT' });
  assert.equal(getTextWorkspaceFilterEmptyLabel('mixed'), 'Mixed');
});

// Stage 1 Round C: TextLibraryShell 5-tab filter & classification UI
await runTest('Round C TextLibraryShell: exposes All/Legacy/Paragraph/Conversation/Mixed filters and never classifies Mixed as Conversation', async () => {
  const { TextLibraryShell } = loadModule(path.join(root, 'src/components/text/TextLibraryShell.jsx'));

  const legacyDoc = { id: 'DOC_L', title: 'WS Legacy', editorModel: TEXT_LEGACY_EDITOR_MODEL, documentType: 'mixed', updatedAt: 100 };
  const paraDoc = { id: 'DOC_P', title: 'WS Paragraph', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'paragraph', updatedAt: 200 };
  const convDoc = { id: 'DOC_C', title: 'WS Conversation', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'conversation', updatedAt: 300 };
  const mixedDoc = { id: 'DOC_M', title: 'WS Mixed', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'mixed', updatedAt: 400 };

  const catalog = {
    collections: [
      { id: 'COL_1', title: 'Book One', documents: [paraDoc, mixedDoc] }
    ],
    rootDocuments: [legacyDoc, convDoc]
  };

  const baseProps = {
    catalog,
    activeDocument: mixedDoc,
    activeDocumentTree: { ...mixedDoc, blocks: [] },
    activeDocumentId: 'DOC_M',
    isBusy: false,
    error: null,
    onSelectDocument: () => {},
    onCreateDocument: async () => null,
    onCreateCollection: async () => null,
    onRenameDocument: async () => null,
    onMoveDocument: async () => null,
    onDeleteDocument: async () => null,
    onRenameCollection: async () => null,
    onDeleteCollection: async () => null,
    onStructuredCommand: async () => null
  };

  const renderShell = () => renderTree(mockReact.createElement(TextLibraryShell, baseProps));
  resetHooks();
  let nodes = renderShell();
  let allText = collectText(nodes).join(' | ');
  assertNoStaleWorkspaceTerms(allText, 'TextLibraryShell All');

  for (const label of ['All', 'Legacy', 'Paragraph', 'Conversation', 'Mixed']) {
    const filterBtn = findElements(
      nodes,
      el => el.type === 'button' && collectText(el.children).join('').trim() === label
    );
    assert.ok(filterBtn.length >= 1, `Missing TextLibraryShell filter button "${label}"`);
  }

  const clickFilter = label => {
    const btn = findElements(
      nodes,
      el => el.type === 'button' && el.props?.onClick && collectText(el.children).join('').trim() === label
    )[0];
    assert.ok(btn, `Clickable filter button "${label}" not found`);
    btn.props.onClick();
    rerenderHooks();
    nodes = renderShell();
    return collectText(nodes).join(' | ');
  };

  // Click Mixed: only WS Mixed in filtered list rows; WS Conversation/WS Legacy/WS Paragraph must not appear in list rows
  const isWorkspaceRowButton = el => (
    el.type === 'button'
    && el.props?.onClick
    && ['WS Legacy', 'WS Paragraph', 'WS Conversation', 'WS Mixed'].some(title => collectText(el.children).join(' ').includes(title))
  );

  const visibleTitles = () => findElements(nodes, isWorkspaceRowButton)
    .map(el => collectText(el.children).join(' | '));

  clickFilter('Mixed');
  const mixedRows = visibleTitles();
  assert.equal(mixedRows.length, 1);
  assert.ok(mixedRows[0].includes('WS Mixed') && mixedRows[0].includes('Mixed'));
  assertNoStaleWorkspaceTerms(collectText(nodes).join(' | '), 'TextLibraryShell Mixed filter');

  clickFilter('Conversation');
  const convRows = visibleTitles();
  assert.equal(convRows.length, 1);
  assert.ok(convRows[0].includes('WS Conversation') && !convRows[0].includes('WS Mixed'));

  clickFilter('Paragraph');
  const paraRows = visibleTitles();
  assert.equal(paraRows.length, 1);
  assert.ok(paraRows[0].includes('WS Paragraph'));

  clickFilter('Legacy');
  const legacyRows = visibleTitles();
  assert.equal(legacyRows.length, 1);
  assert.ok(legacyRows[0].includes('WS Legacy') && legacyRows[0].includes('Legacy'));

  clickFilter('All');
  const allRows = visibleTitles();
  assert.equal(allRows.length, 4);
});

await runTest('Round C TextLibraryShell: displays accurate empty-filter message when Mixed filter has 0 matches', async () => {
  const { TextLibraryShell } = loadModule(path.join(root, 'src/components/text/TextLibraryShell.jsx'));
  const legacyDoc = { id: 'DOC_L', title: 'Only Legacy', editorModel: TEXT_LEGACY_EDITOR_MODEL, documentType: 'mixed', updatedAt: 100 };
  const props = {
    catalog: { collections: [], rootDocuments: [legacyDoc] },
    activeDocument: legacyDoc,
    activeDocumentTree: { ...legacyDoc, blocks: [] },
    activeDocumentId: 'DOC_L',
    isBusy: false,
    error: null,
    onSelectDocument: () => {}
  };

  resetHooks();
  let nodes = renderTree(mockReact.createElement(TextLibraryShell, props));
  const mixedBtn = findElements(nodes, el => el.type === 'button' && collectText(el.children).join('').trim() === 'Mixed')[0];
  mixedBtn.props.onClick();
  rerenderHooks();
  nodes = renderTree(mockReact.createElement(TextLibraryShell, props));
  const txt = collectText(nodes).join(' ').replace(/\s+/g, ' ');
  assert.match(txt, /No Mixed workspaces/);

  // Click Create section tab and verify all 4 canonical Workspace Type buttons
  const createBtn = findElements(nodes, el => el.type === 'button' && collectText(el.children).join('').trim() === 'Create')[0];
  assert.ok(createBtn, 'Create section button should exist');
  createBtn.props.onClick();
  rerenderHooks();
  nodes = renderTree(mockReact.createElement(TextLibraryShell, props));
  const createTxt = collectText(nodes).join(' ').replace(/\s+/g, ' ');
  assert.match(createTxt, /Legacy, Paragraph, Conversation, or Mixed/);
  for (const label of ['Legacy', 'Paragraph', 'Conversation', 'Mixed']) {
    const createTypeBtn = findElements(nodes, el => el.type === 'button' && collectText(el.children).join(' ').includes(label));
    assert.ok(createTypeBtn.length >= 1, `Missing Create type option "${label}"`);
  }
  assertNoStaleWorkspaceTerms(createTxt, 'TextLibraryShell Create');
});

// Stage 1 Round C: Desktop & Mobile surface taxonomy consistency + Table preserved
await runTest('Round C Surfaces: Header, DesktopDataWorkspace, MobileDataControls, MainAppShellView match taxonomy across all 4 types and keep Table unchanged', async () => {
  const Header = loadModule(path.join(root, 'src/components/layout/Header.jsx')).default;
  const DesktopDataWorkspace = loadModule(path.join(root, 'src/components/controls/DesktopDataWorkspace.jsx')).default;
  const MobileDataControls = loadModule(path.join(root, 'src/components/controls/MobileDataControls.jsx')).default;
  const { renderMainAppShellView } = loadModule(path.join(root, 'src/components/layout/MainAppShellView.jsx'));

  const docs = [
    { id: 'DOC_L', title: 'Legacy Title', editorModel: TEXT_LEGACY_EDITOR_MODEL, documentType: 'mixed', expectedLabel: 'Legacy', expectedBadge: 'LEGACY' },
    { id: 'DOC_P', title: 'Paragraph Title', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'paragraph', expectedLabel: 'Paragraph', expectedBadge: 'PARAGRAPH' },
    { id: 'DOC_C', title: 'Conversation Title', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'conversation', expectedLabel: 'Conversation', expectedBadge: 'CONVERSATION' },
    { id: 'DOC_M', title: 'Mixed Title', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'mixed', expectedLabel: 'Mixed', expectedBadge: 'MIXED' }
  ];

  for (const doc of docs) {
    resetHooks();
    const headerText = collectText(renderTree(mockReact.createElement(Header, {
      isMobile: false,
      showAppBar: true,
      isSidebarOpen: true,
      setIsSidebarOpen: () => {},
      goHome: () => {},
      isSystemBusy: false,
      savedDecks: [],
      selectedDeckId: '',
      handleLoadDeck: () => {},
      handleDeleteDeckInit: () => {},
      currentDeckName: '',
      setCurrentDeckName: () => {},
      handleSaveDeck: () => {},
      mode: 'text',
      isCsvDirty: false,
      csvChangeSummary: null,
      saveUpdatedCSV: () => {},
      theme: 'light',
      setTheme: () => {},
      playlist: [],
      isBatchDownloading: false,
      isBatchOpen: false,
      setIsBatchOpen: () => {},
      batchButtonRef: { current: null },
      showLogs: false,
      setShowLogs: () => {},
      debugButtonRef: { current: null },
      activeTextDocument: doc,
      activeTextDocumentTree: { ...doc, blocks: [] },
      activeTextEditorModel: doc.editorModel,
      onOpenTextWorkspace: () => {},
      onOpenTextPlayer: () => {},
      isTableDataMode: false
    }))).join(' | ');
    assert.ok(headerText.includes(doc.expectedBadge), `Header badge for ${doc.id} should contain ${doc.expectedBadge}. Got: ${headerText}`);
    assertNoStaleWorkspaceTerms(headerText, `Header(${doc.id})`);

    resetHooks();
    const desktopText = collectText(renderTree(mockReact.createElement(DesktopDataWorkspace, {
      mode: 'text',
      textareaRef: { current: null },
      isSystemBusy: false,
      isLocked: false,
      textContent: '',
      handleInputContentChange: () => {},
      handleInsertTab: () => {},
      setLockedStates: () => {},
      isMultiSourceMode: false,
      dirtySourceKeys: new Set(),
      isCsvDirty: false,
      openFullPackPicker: () => {},
      sourceDiagnostics: [],
      sourceChangeSummaries: {},
      sourcePack: {},
      openSourcePicker: () => {},
      removeSourceLayer: () => {},
      saveUpdatedSource: () => {},
      exportMergedDataset: () => {},
      csvChangeSummary: null,
      setIsChangeReviewOpen: () => {},
      undoStack: [],
      undoLastDataChange: () => {},
      lastDraftAutoSaveAt: null,
      textLibraryCatalog: { rootDocuments: docs, collections: [] },
      activeTextDocument: doc,
      activeTextDocumentTree: { ...doc, blocks: [] },
      activeTextDocumentId: doc.id,
      activeTextEditorModel: doc.editorModel
    }))).join(' | ');
    assert.ok(desktopText.includes(doc.expectedLabel), `DesktopDataWorkspace missing label ${doc.expectedLabel}`);
    assert.ok(desktopText.includes(doc.expectedBadge), `DesktopDataWorkspace missing badge ${doc.expectedBadge}`);
    assertNoStaleWorkspaceTerms(desktopText, `DesktopDataWorkspace(${doc.id})`);

    resetHooks();
    const mobileText = collectText(renderTree(mockReact.createElement(MobileDataControls, {
      mode: 'text',
      isMultiSourceMode: false,
      dirtySourceKeys: new Set(),
      isSystemBusy: false,
      isCsvDirty: false,
      playlist: [],
      textLibraryCatalog: { rootDocuments: docs, collections: [] },
      activeTextDocument: doc,
      activeTextDocumentTree: { ...doc, blocks: [] },
      activeTextDocumentId: doc.id,
      activeTextEditorModel: doc.editorModel,
      isBatchOpen: false,
      setIsBatchOpen: () => {}
    }))).join(' | ');
    assert.ok(mobileText.includes(doc.expectedLabel), `MobileDataControls missing label ${doc.expectedLabel}`);
    assert.ok(mobileText.includes(doc.expectedBadge), `MobileDataControls missing badge ${doc.expectedBadge}`);
    assertNoStaleWorkspaceTerms(mobileText, `MobileDataControls(${doc.id})`);
  }

  // Mobile quick switcher strip inside renderMainAppShellView
  resetHooks();
  const shellNodes = renderTree(renderMainAppShellView({
    isMobile: true,
    showAppBar: true,
    isSidebarOpen: false,
    setIsSidebarOpen: () => {},
    mode: 'text',
    mobileTab: 'player',
    renderWorkspaceTabs: () => null,
    renderControlSectionTabs: () => null,
    renderStatusBadge: () => null,
    renderPlaybackSequenceBuilder: () => null,
    renderMobileTools: () => null,
    renderPlaylist: () => null,
    renderBatchPopup: () => null,
    textLibraryCatalog: { rootDocuments: docs, collections: [] },
    activeTextDocument: docs[3],
    activeTextDocumentId: 'DOC_M',
    activeTextEditorModel: TEXT_STRUCTURED_EDITOR_MODEL,
    systemLogs: [],
    undoStack: [],
    dirtySourceKeys: new Set(),
    sourceDiagnostics: [],
    sourceChangeSummaries: {},
    sourcePack: {},
    pendingDeleteItem: null
  }));
  const strip = findElements(shellNodes, el => el.props?.['data-mobile-text-document-strip'] === 'true')[0];
  assert.ok(strip, 'MainAppShellView mobile text document strip must render');
  const stripText = collectText(strip.children ? renderTree(strip.children) : []).join(' | ');
  for (const badge of ['LEGACY', 'PARAGRAPH', 'CONVERSATION', 'MIXED']) {
    assert.ok(stripText.includes(badge), `Mobile quick strip missing badge ${badge}. Got: ${stripText}`);
  }
  assertNoStaleWorkspaceTerms(stripText, 'MainAppShellView mobile strip');

  // Table mode unchanged spot check
  resetHooks();
  const tableHeaderText = collectText(renderTree(mockReact.createElement(Header, {
    isMobile: false,
    showAppBar: true,
    isSidebarOpen: true,
    setIsSidebarOpen: () => {},
    goHome: () => {},
    isSystemBusy: false,
    savedDecks: [],
    selectedDeckId: '',
    handleLoadDeck: () => {},
    handleDeleteDeckInit: () => {},
    currentDeckName: '',
    setCurrentDeckName: () => {},
    handleSaveDeck: () => {},
    mode: 'table',
    isCsvDirty: false,
    csvChangeSummary: null,
    saveUpdatedCSV: () => {},
    theme: 'light',
    setTheme: () => {},
    playlist: [{ id: 'V1' }],
    isBatchDownloading: false,
    isBatchOpen: false,
    setIsBatchOpen: () => {},
    batchButtonRef: { current: null },
    showLogs: false,
    setShowLogs: () => {},
    debugButtonRef: { current: null },
    activeTextDocument: docs[3],
    isTableDataMode: true
  }))).join(' | ');
  assert.ok(!tableHeaderText.includes('MIXED'), 'Header in table mode must not display text workspace badge');
});

await runTest('Round C Roles vs Types: Paragraph Card roles (Title & Paragraph) remain separate from Workspace types (Mixed & Paragraph)', async () => {
  const { TextStructuredEditor } = loadModule(path.join(root, 'src/components/text/TextStructuredEditor.jsx'));
  const { TextStructuredPlayer } = loadModule(path.join(root, 'src/components/text/TextStructuredPlayer.jsx'));

  const mixedTreeWithParagraphTitle = {
    id: 'DOC_MIXED_1',
    title: 'Mixed Lesson',
    editorModel: TEXT_STRUCTURED_EDITOR_MODEL,
    documentType: 'mixed',
    metadata: {},
    blocks: [
      {
        id: 'BLK_1',
        blockType: 'paragraph',
        title: 'Opening Header',
        metadata: { paragraphRoleV1: 'title' },
        segments: [{ id: 'SEG_1', text: 'Unit One', meaning: 'Bab Satu', metadata: {} }]
      },
      {
        id: 'BLK_2',
        blockType: 'paragraph',
        title: 'Body Story',
        metadata: { paragraphRoleV1: 'paragraph' },
        segments: [{ id: 'SEG_2', text: 'Welcome home.', meaning: 'Selamat datang.', metadata: {} }]
      },
      {
        id: 'BLK_3',
        blockType: 'conversation',
        title: 'Dialogue',
        metadata: {},
        segments: [{ id: 'SEG_3', speaker: 'Anna', text: 'Hello!', meaning: 'Halo!', metadata: { speakerId: 'SPK_ANNA' } }]
      }
    ]
  };

  resetHooks();
  const editorText = collectText(renderTree(mockReact.createElement(TextStructuredEditor, {
    documentTree: mixedTreeWithParagraphTitle,
    isBusy: false,
    error: null,
    onCommand: async () => null
  }))).join(' | ');
  assert.ok(editorText.includes('Mixed • Paragraph narrator + actual Card speakers'));
  assert.ok(editorText.includes('Title') && editorText.includes('Paragraph'));
  assertNoStaleWorkspaceTerms(editorText, 'TextStructuredEditor(mixed)');

  resetHooks();
  const playerText = collectText(renderTree(mockReact.createElement(TextStructuredPlayer, {
    documentTree: mixedTreeWithParagraphTitle,
    isPlaying: false,
    isPaused: false,
    speakingPart: null,
    playingContext: null,
    playingScope: null,
    playingIndex: -1,
    displayMode: 'both',
    playbackChannelMode: 'text-and-meaning',
    playbackRepresentationMode: 'split',
    playbackPreferences: {}
  }))).join(' | ');
  assert.ok(playerText.includes('Mixed'), 'TextStructuredPlayer heading should show Mixed workspace type');
  assert.ok(playerText.includes('TITLE') && playerText.includes('PARAGRAPH'), 'Paragraph Card roles Title & Paragraph must stay visible and separate inside Mixed workspaces');
  assertNoStaleWorkspaceTerms(playerText, 'TextStructuredPlayer(mixed)');
});

await runTest('Round C Batch & Creation Service: TextBatchPopup workspace selector & executeTextLibraryCreateDocument logs use canonical taxonomy labels', async () => {
  const batchLoader = createModuleLoader({
    textStructuredBatchTelemetryService: {
      getTextStructuredBatchTelemetrySnapshot: () => ({}),
      subscribeTextStructuredBatchTelemetry: () => () => {}
    }
  });
  const { TextBatchPopup } = batchLoader(path.join(root, 'src/components/text/TextBatchPopup.jsx'));

  resetHooks();
  const batchText = collectText(renderTree(mockReact.createElement(TextBatchPopup, {
    batchPanelRef: { current: null },
    setIsBatchOpen: () => {},
    inline: true,
    structuredTextBatch: {
      workspaceOptions: [
        { id: 'DOC_P', title: 'Alpha', collectionTitle: 'Book A', documentType: 'paragraph' },
        { id: 'DOC_C', title: 'Beta', collectionTitle: 'Book A', documentType: 'conversation' },
        { id: 'DOC_M', title: 'Gamma', collectionTitle: 'Book A', documentType: 'mixed' }
      ],
      selectedWorkspaceIds: ['DOC_M'],
      scope: { scopeMode: 'selected', cardId: null },
      preferences: {},
      running: false
    }
  }))).join(' ').replace(/\s+/g, ' ');
  assert.ok(batchText.includes('Gamma • Book A • Mixed'));
  assert.ok(batchText.includes('Beta • Book A • Conversation'));
  assert.ok(batchText.includes('Alpha • Book A • Paragraph'));
  assertNoStaleWorkspaceTerms(batchText, 'TextBatchPopup(selected)');

  const logs = [];
  const docBySpec = {
    legacy: { id: 'TEXTDOC_1', editorModel: TEXT_LEGACY_EDITOR_MODEL, documentType: 'mixed', title: 'L1' },
    paragraph: { id: 'TEXTDOC_2', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'paragraph', title: 'P1' },
    conversation: { id: 'TEXTDOC_3', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'conversation', title: 'C1' },
    mixed: { id: 'TEXTDOC_4', editorModel: TEXT_STRUCTURED_EDITOR_MODEL, documentType: 'mixed', title: 'M1' }
  };
  const serviceLoader = createModuleLoader({
    textLibraryCommandService: {
      executeTextLibraryCommand: async ({ payload }) => {
        const key = payload?.editorModel === TEXT_LEGACY_EDITOR_MODEL ? 'legacy' : payload?.documentType;
        const doc = docBySpec[key];
        return {
          id: doc.id,
          librarySnapshot: { activeDocumentId: doc.id, documents: [doc], blocks: [], segments: [], collections: [] }
        };
      },
      executeTextAudioVariantUpsert: async () => null
    },
    textLibraryIndexedDbService: {
      syncLegacyTextProjectionToDatabase: async () => {}
    }
  });
  const { executeTextLibraryCreateDocument } = serviceLoader(path.join(root, 'src/services/persistence/textLibraryWorkspaceService.js'));

  for (const [key, expected] of [
    ['legacy', 'Created Legacy Document'],
    ['paragraph', 'Created Paragraph Document'],
    ['conversation', 'Created Conversation Document'],
    ['mixed', 'Created Mixed Document']
  ]) {
    const doc = docBySpec[key];
    await executeTextLibraryCreateDocument({
      payload: {
        title: doc.title,
        editorModel: doc.editorModel,
        documentType: doc.documentType
      },
      setTextLibrarySnapshot: () => {},
      setActiveTextDocumentId: () => {},
      setTextIdentityState: () => {},
      setTextContent: () => {},
      addLog: (_src, msg) => logs.push(msg)
    });
    assert.ok(logs.some(line => line.includes(expected)), `Expected creation log "${expected}"`);
  }
  assertNoStaleWorkspaceTerms(logs.join(' | '), 'textLibraryWorkspaceService logs');
});

await runTest('Boundary Check: Round C preserved Table, Paragraph role domain, Audio Sidebar, and Text DB constants', async () => {
  const sidebarSource = read('src/components/text/TextStructuredAudioControls.jsx');
  assert.ok(sidebarSource.length > 0);
  const constantsSource = read('src/constants/textDatabaseConstants.js');
  assert.match(constantsSource, /TEXT_LEGACY_EDITOR_MODEL = 'legacy-line-v1'/);
  assert.match(constantsSource, /TEXT_STRUCTURED_EDITOR_MODEL = 'structured-v1'/);
  assert.match(constantsSource, /TEXT_DOCUMENT_TYPES = Object\.freeze\(\['paragraph', 'conversation', 'mixed'\]\)/);
  assert.match(constantsSource, /TEXT_USER_MODES = Object\.freeze\(\['legacy', 'paragraph', 'conversation'\]\)/);
  assert.match(constantsSource, /COLLECTION: 'COLL_'[\s\S]*DOCUMENT: 'DOC_'[\s\S]*BLOCK: 'TEXT_'[\s\S]*SEGMENT: 'SEGMENT_'[\s\S]*AUDIO_VARIANT: 'TXTAUDIO_'/);
});

console.log(`\nRound C Taxonomy & Stage 0 Audit complete: ${results.length} PASS`);
