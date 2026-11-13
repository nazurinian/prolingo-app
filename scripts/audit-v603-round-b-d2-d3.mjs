import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  getTextSystemBoundarySummary,
  isTableGeneratorSystemSupported,
  isTableStorageSystemSupported
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

const createSystemProps = (overrides = {}) => ({
  generatorEngine: 'edge',
  setGeneratorEngine: () => {},
  isSystemBusy: false,
  aiVoiceName: 'Kore',
  setAiVoiceName: () => {},
  aiVoices: [{ id: 'Kore', label: 'Gemini Kore' }],
  edgeVoices: [{ ShortName: 'en-US-AriaNeural', LocalName: 'Aria' }],
  edgeVoice: 'en-US-AriaNeural',
  setEdgeVoice: () => {},
  edgeIndonesianVoice: 'id-ID-GadisNeural',
  setEdgeIndonesianVoice: () => {},
  edgeRate: 0,
  setEdgeRate: () => {},
  edgePitch: 0,
  setEdgePitch: () => {},
  edgeHealth: { status: 'online', message: 'Connected to /api/tts' },
  testEdgeBackend: () => {},
  userApiKey: '',
  onUserApiKeyChange: () => {},
  geminiOwnerConfigured: true,
  geminiOwnerUnlocked: false,
  onGeminiOwnerUnlock: () => {},
  onGeminiOwnerLock: () => {},
  geminiByokAvailable: true,
  geminiByokRegistered: false,
  onGeminiByokRegister: () => {},
  onGeminiByokClear: () => {},
  folderInputRef: {
    current: { click: () => {} },
    openAudioFolder: () => {},
    refreshAudioFolder: () => {},
    openAudioZip: () => {},
    clearAudioZip: () => {},
    detachAudioFolder: () => {},
    clearGeneratedAudioRam: () => {},
    resetAudioCoverageMemory: () => {},
    tableAudioFolderSummary: { active: false, matchedCount: 0 },
    tableAudioZipSummary: { archiveCount: 0, matchedCount: 0 },
    tableAudioBatchHistoryCount: 1
  },
  currentMapCount: 0,
  legacyTextAudioCount: 0,
  mode: 'table',
  activeTextEditorModel: null,
  batchButtonRef: { current: null },
  batchSessions: [{ id: 'b1' }],
  isBatchDownloading: false,
  setIsBatchOpen: () => {},
  isBatchOpen: false,
  debugButtonRef: { current: null },
  setShowLogs: () => {},
  showLogs: true,
  logContainerRef: { current: null },
  systemLogs: [{ time: '10:00', type: 'System', message: 'Ready log line' }],
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

const FORBIDDEN_TEXT_SYSTEM_TERMS = [
  /Generator Engine/i,
  /Save My API Key/i,
  /Remove My API Key/i,
  /Owner Unlock/i,
  /Owner Lock/i,
  /Your Gemini API Key/i,
  /Owner Key Active/i,
  /Your API key is registered/i,
  /BYOK/i,
  /Main Voice \(English\)/i,
  /Meaning Voice \(Indonesian\)/i,
  /Local Backend \(\/api\/tts\)/i,
  /Rate \([+-]?\d+%\)/i,
  /Pitch \([+-]?\d+Hz\)/i,
  /Dataset cache/i,
  /Study tracking/i,
  /Mastery/i,
  /Progress Backup/i,
  /Detach Audio Folder/i,
  /Audio ZIP Archive/i,
  /Reset Audio Coverage Memory/i,
  /Clear RAM/i,
  /\d+\s*(MB|KB|GB|Bytes)\b/i
];

// Check 1: Pure D2/D3 domain helpers
await check('D2/D3 domain predicates & Text System summary align strictly with Table vs Text boundaries', () => {
  assert.equal(isTableGeneratorSystemSupported({ mode: 'table' }), true);
  assert.equal(isTableGeneratorSystemSupported({ mode: 'text' }), false);
  assert.equal(isTableGeneratorSystemSupported({}), false);

  assert.equal(isTableStorageSystemSupported({ mode: 'table' }), true);
  assert.equal(isTableStorageSystemSupported({ mode: 'text' }), false);
  assert.equal(isTableStorageSystemSupported({}), false);

  assert.equal(getTextSystemBoundarySummary({ mode: 'table' }), null);

  const structured = getTextSystemBoundarySummary({ mode: 'text', activeTextEditorModel: 'structured-v1' });
  assert.equal(structured.variant, 'structured');
  assert.match(structured.audioSummary, /Edge-only/i);
  assert.match(structured.audioDetail, /Text → Audio → Generate Audio/);
  assert.match(structured.storageDetail, /Text → Data/);

  const legacy = getTextSystemBoundarySummary({ mode: 'text', activeTextEditorModel: 'legacy-line-v1' });
  assert.equal(legacy.variant, 'legacy');
  assert.match(legacy.audioSummary, /legacy-line-v1/);
  assert.match(legacy.audioSummary, /Legacy Audio Folder/);
  assert.match(legacy.storageDetail, /Text → Data/);

  const pending = getTextSystemBoundarySummary({ mode: 'text', activeTextEditorModel: null });
  assert.equal(pending.variant, 'pending');
  assert.match(pending.storageDetail, /Text → Data/);
});

// Check 2: Desktop Table System preserves ALL D2 & D3 controls (Edge + Gemini + StorageManagerPanel)
await check('DesktopSystemControls in Table mode preserves Generator Engine, Gemini credentials, Edge settings, StorageManagerPanel, and Logs', () => {
  for (const generatorEngine of ['edge', 'gemini']) {
    resetHooks();
    const nodes = renderTree(DesktopSystemControls(createSystemProps({ mode: 'table', generatorEngine })));
    const text = collectText(nodes);
    assert.match(text, /Generator Engine/);
    assert.match(text, /Save My API Key/);
    assert.match(text, /Owner Unlock/);
    assert.match(text, /Batch/);
    assert.match(text, /Load Audio Folder/);
    assert.match(text, /Audio ZIP Archive/);
    assert.match(text, /Reset Audio Coverage Memory/);
    assert.match(text, /Clear RAM/);
    assert.match(text, /Logs/);
    assert.match(text, /Ready log line/);
    assert.equal(nodes.some(n => n.type === 'stub:StorageManagerPanel'), true);

    if (generatorEngine === 'edge') {
      assert.match(text, /Main Voice \(English\)/);
      assert.match(text, /Meaning Voice \(Indonesian\)/);
      assert.match(text, /Local Backend \(\/api\/tts\)/);
      assert.equal(nodes.filter(n => n.type === 'stub:GroupedVoiceSelect').length, 2);
    } else {
      assert.match(text, /Gemini Kore/);
      assert.match(text, /LOCKED • API key required/);
    }
  }
});

// Check 3: Desktop Text System hides all Table D2 & D3 controls across structured-v1, legacy-line-v1, and null
await check('DesktopSystemControls in Text mode hides Table generator/credentials/voices and StorageManagerPanel while preserving Legacy Folder & Logs', () => {
  for (const activeTextEditorModel of ['structured-v1', 'legacy-line-v1', null]) {
    for (const generatorEngine of ['edge', 'gemini']) {
      resetHooks();
      const nodes = renderTree(DesktopSystemControls(createSystemProps({
        mode: 'text',
        activeTextEditorModel,
        generatorEngine,
        legacyTextAudioCount: activeTextEditorModel === 'legacy-line-v1' ? 2 : 0
      })));
      const text = collectText(nodes);

      // Must NOT render Table components or Table inputs
      assert.equal(nodes.some(n => n.type === 'stub:StorageManagerPanel'), false);
      assert.equal(nodes.some(n => n.type === 'stub:GroupedVoiceSelect'), false);
      assert.equal(nodes.some(n => n.type === 'input' && n.props?.type === 'password'), false);
      assert.equal(nodes.some(n => n.props?.['data-text-system-audio-card']), true);
      assert.equal(nodes.some(n => n.props?.['data-text-system-storage-card']), true);

      // Must NOT leak Table copy or invented storage metrics
      for (const forbidden of FORBIDDEN_TEXT_SYSTEM_TERMS) {
        assert.doesNotMatch(text, forbidden);
      }

      // Shared Logs remain available
      assert.match(text, /Logs/);
      assert.match(text, /Ready log line/);

      // D3 note always directs to Text -> Data
      assert.match(text, /Text Data & Storage/);
      assert.match(text, /Text → Data/);

      // Legacy Audio Folder boundaries from Round A stay intact
      if (activeTextEditorModel === 'legacy-line-v1') {
        assert.match(text, /Refresh Audio/);
        assert.match(text, /Change Folder/);
        assert.match(text, /legacy-line-v1/);
      } else if (activeTextEditorModel === 'structured-v1') {
        assert.doesNotMatch(text, /Load Audio Folder/);
        assert.doesNotMatch(text, /Refresh Audio/);
        assert.match(text, /Text → Audio → Generate Audio/);
      } else {
        assert.doesNotMatch(text, /Load Audio Folder/);
        assert.doesNotMatch(text, /Refresh Audio/);
        assert.match(text, /Audio Folder is available for Table and Legacy Text documents/);
      }
    }
  }
});

// Check 4: Mobile Table System preserves ALL D2 & D3 controls
await check('MobileSystemControls in Table mode preserves System & TTS, Gemini credentials, Edge voices, StorageManagerPanel, and Logs', () => {
  for (const generatorEngine of ['edge', 'gemini']) {
    resetHooks();
    const nodes = renderTree(MobileSystemControls(createSystemProps({ mode: 'table', generatorEngine })));
    const text = collectText(nodes);
    assert.match(text, /System & TTS/);
    assert.match(text, /Batch/);
    assert.match(text, /Load Audio Folder/);
    assert.match(text, /Audio ZIP/);
    assert.match(text, /Coverage/);
    assert.match(text, /RAM/);
    assert.match(text, /Logs/);
    assert.match(text, /Ready log line/);
    assert.equal(nodes.some(n => n.type === 'stub:StorageManagerPanel'), true);

    if (generatorEngine === 'edge') {
      assert.match(text, /Backend:\s+ONLINE\s+•\s+Test/);
      assert.equal(nodes.filter(n => n.type === 'stub:GroupedVoiceSelect').length, 2);
    } else {
      assert.match(text, /Gemini Kore/);
      assert.match(text, /Save My API Key/);
      assert.match(text, /Owner Unlock/);
    }
  }
});

// Check 5: Mobile Text System hides Table D2 & D3 controls across structured-v1, legacy-line-v1, and null
await check('MobileSystemControls in Text mode hides Table generator/credentials/voices and StorageManagerPanel while preserving Legacy Folder & Logs', () => {
  for (const activeTextEditorModel of ['structured-v1', 'legacy-line-v1', null]) {
    for (const generatorEngine of ['edge', 'gemini']) {
      resetHooks();
      const nodes = renderTree(MobileSystemControls(createSystemProps({
        mode: 'text',
        activeTextEditorModel,
        generatorEngine,
        legacyTextAudioCount: activeTextEditorModel === 'legacy-line-v1' ? 0 : 9
      })));
      const text = collectText(nodes);

      assert.match(text, /Text System/);
      assert.doesNotMatch(text, /System & TTS/);
      assert.equal(nodes.some(n => n.type === 'stub:StorageManagerPanel'), false);
      assert.equal(nodes.some(n => n.type === 'stub:GroupedVoiceSelect'), false);
      assert.equal(nodes.some(n => n.type === 'input' && n.props?.type === 'password'), false);
      assert.equal(nodes.some(n => n.props?.['data-text-system-audio-card']), true);
      assert.equal(nodes.some(n => n.props?.['data-text-system-storage-card']), true);

      for (const forbidden of FORBIDDEN_TEXT_SYSTEM_TERMS) {
        assert.doesNotMatch(text, forbidden);
      }
      assert.doesNotMatch(text, /Backend:\s+ONLINE\s+•\s+Test/);

      // Shared Logs remain available
      assert.match(text, /Logs/);
      assert.match(text, /Ready log line/);

      // D3 note always directs to Text -> Data
      assert.match(text, /Text Data & Storage/);
      assert.match(text, /Text → Data/);

      if (activeTextEditorModel === 'legacy-line-v1') {
        assert.match(text, /Load Audio Folder/);
      } else {
        assert.doesNotMatch(text, /Load Audio Folder/);
      }
    }
  }
});

// Check 6: Components & boundaries integrity (no deletions, no leaked UI in storage panels)
await check('StorageManagerPanel & ProgressBackupRestorePanel remain intact and connected exclusively under Table gating', () => {
  const storagePanelSource = read('src/components/progress/StorageManagerPanel.jsx');
  const backupPanelSource = read('src/components/progress/ProgressBackupRestorePanel.jsx');
  const desktopSysSource = read('src/components/controls/DesktopSystemControls.jsx');
  const mobileSysSource = read('src/components/controls/MobileSystemControls.jsx');

  assert.match(storagePanelSource, /export default function StorageManagerPanel/);
  assert.match(storagePanelSource, /<ProgressBackupRestorePanel/);
  assert.match(backupPanelSource, /export default function ProgressBackupRestorePanel/);

  assert.match(desktopSysSource, /isTableGeneratorSystemSupported/);
  assert.match(desktopSysSource, /isTableStorageSystemSupported/);
  assert.match(mobileSysSource, /isTableGeneratorSystemSupported/);
  assert.match(mobileSysSource, /isTableStorageSystemSupported/);
});

console.log(`ALL ${passed} ROUND-B (D2/D3) CHECKS PASSED`);
