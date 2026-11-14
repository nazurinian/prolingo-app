import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION
} from '../src/constants/textDatabaseConstants.js';
import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from '../src/domain/text/textGlobalIdentityDomain.js';
import {
  createProLingoTextDatabaseBackup,
  validateProLingoTextDatabaseBackup
} from '../src/domain/text/textDatabaseBackupDomain.js';
import { planProLingoTextExternalInitialImport } from '../src/domain/text/textExternalJsonDomain.js';
import { planTextExternalUpdateExisting } from '../src/domain/text/textExternalReconciliationDomain.js';
import {
  TEXT_LIBRARY_COMMAND_TYPES,
  applyTextLibraryCommand
} from '../src/domain/text/textLibraryCommandDomain.js';
import {
  normalizeTextLibraryRuntimeSnapshot,
  resolveTextLibraryDocumentTree
} from '../src/domain/text/textLibraryDomain.js';
import {
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  resolveTextStructuredPlaybackRate
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  buildTextStructuredSegmentSpeakerIdentityMetadata,
  buildTextStructuredSpeakerVoiceProfileV2Metadata,
  buildTextStructuredUpsertSpeakerRegistryMetadata,
  collectTextStructuredConversationSpeakerIdentities,
  collectTextStructuredWorkspaceSpeakerRegistry,
  getTextStructuredSegmentSpeakerId,
  getTextStructuredSpeakerRegistry,
  getTextStructuredSpeakerVoiceProfileV2
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import {
  buildTextStructuredPlaybackRateProfileMetadata,
  getTextStructuredPlaybackRateProfile
} from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import {
  buildTextStructuredLocalAudioProfileMetadata,
  getTextStructuredLocalAudioProfile
} from '../src/domain/text/textStructuredLocalAudioProfileDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES,
  buildTextStructuredAudioDownloadProfileMetadata,
  getTextStructuredAudioDownloadProfile
} from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import {
  TEXT_STRUCTURED_RESET_SCOPES
} from '../src/domain/text/textStructuredResetDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

const createSpeakerRegistryHarness = () => {
  let hookValues = [];
  let hookSlot = 0;
  let pendingEffects = [];
  const flushEffects = () => {
    const queue = pendingEffects.splice(0, pendingEffects.length);
    for (const runEffect of queue) runEffect();
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
  const fakeIcons = new Proxy({}, { get: (_, key) => typeof key === 'string' ? function Icon() { return null; } : null });
  const moduleCache = new Map();
  const loadModule = absPath => {
    const resolvedAbs = path.resolve(absPath);
    if (moduleCache.has(resolvedAbs)) return moduleCache.get(resolvedAbs).exports;
    const source = fs.readFileSync(resolvedAbs, 'utf8');
    const outputText = esbuild.transformSync(source, {
      loader: resolvedAbs.endsWith('.jsx') ? 'jsx' : 'js',
      format: 'cjs',
      target: 'es2022',
      jsx: 'transform'
    }).code;
    const mod = { exports: {} };
    moduleCache.set(resolvedAbs, mod);
    const req = specifier => {
      if (specifier === 'react') return { ...mockReact, default: mockReact, __esModule: true };
      if (specifier === 'lucide-react') return fakeIcons;
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

  const prevWindow = globalThis.window;
  globalThis.window = { ...(prevWindow || {}), confirm: () => true };

  const { TextStructuredSpeakerRegistry } = loadModule(path.join(root, 'src/components/text/TextStructuredSpeakerRegistry.jsx'));

  const mount = initialProps => {
    let currentProps = initialProps;
    let rendered = [];
    const rerender = (nextProps = currentProps) => {
      currentProps = nextProps;
      hookSlot = 0;
      rendered = renderTree(mockReact.createElement(TextStructuredSpeakerRegistry, currentProps));
      flushEffects();
      // Second render if effect updated hook state
      if (pendingEffects.length === 0) {
        hookSlot = 0;
        rendered = renderTree(mockReact.createElement(TextStructuredSpeakerRegistry, currentProps));
      }
      return rendered;
    };
    rerender(initialProps);
    return {
      rerender,
      getNodes: () => rendered,
      findAll: predicate => collectNodes(rendered, predicate),
      findIn: (rootNode, predicate) => collectNodes([rootNode], predicate),
      findByRole: role => collectNodes(rendered, n => n.props?.role === role),
      textOf
    };
  };

  return {
    mount,
    restoreWindow: () => {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }
  };
};

const extractCallbackBlock = (source, constName) => {
  const marker = `const ${constName} = useCallback(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing callback ${constName} in App.jsx`);
  let index = source.indexOf('useCallback(', start) + 'useCallback('.length;
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  while (index < source.length && depth > 0) {
    const ch = source[index];
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (!inDouble && !inTemplate && ch === "'") {
      inSingle = !inSingle;
    } else if (!inSingle && !inTemplate && ch === '"') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble && ch === '`') {
      inTemplate = !inTemplate;
    } else if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    index += 1;
  }
  const stmtEnd = source.indexOf(';', index);
  return source.slice(start, stmtEnd + 1);
};

const instantiateAppSpeakerHandlers = ({
  initialSnapshot,
  documentId,
  simulateBusyOnReentry = false
}) => {
  const appSource = read('src/App.jsx');
  const snippets = [
    extractCallbackBlock(appSource, 'ensureStructuredTextSpeakerIdentity'),
    extractCallbackBlock(appSource, 'handleStructuredTextSpeakerVoiceChange'),
    extractCallbackBlock(appSource, 'handleStructuredTextSpeakerRateChange'),
    extractCallbackBlock(appSource, 'handleStructuredTextSpeakerLocalAudioVoiceChange'),
    extractCallbackBlock(appSource, 'handleStructuredTextSpeakerDownloadVoiceChange')
  ].join('\n\n');

  let persistedSnapshot = normalizeTextLibraryRuntimeSnapshot(initialSnapshot);
  // React closure holds pre-await tree until explicit rerender, reproducing real React async closure timing.
  let closureTree = resolveTextLibraryDocumentTree(persistedSnapshot, documentId);
  let clock = 5000;
  let busy = false;
  const dispatchedCommands = [];

  const handleTextLibraryStructuredCommand = async command => {
    if (simulateBusyOnReentry && busy) return null;
    busy = true;
    try {
      await Promise.resolve();
      const result = applyTextLibraryCommand(persistedSnapshot, command, ++clock);
      persistedSnapshot = result.snapshot;
      dispatchedCommands.push(command);
      return {
        ...result,
        librarySnapshot: persistedSnapshot
      };
    } finally {
      busy = false;
    }
  };

  const scope = {
    useCallback: fn => fn,
    activeTextDocumentTree: closureTree,
    textStructuredPreferences: DEFAULT_TEXT_STRUCTURED_PREFERENCES,
    resolveTextStructuredPlaybackRate,
    forceStopAll: () => {},
    addLog: () => {},
    handleTextLibraryStructuredCommand,
    TEXT_LIBRARY_COMMAND_TYPES,
    collectTextStructuredConversationSpeakerIdentities,
    collectTextStructuredWorkspaceSpeakerRegistry,
    getTextStructuredSegmentSpeakerId,
    buildTextStructuredSegmentSpeakerIdentityMetadata,
    buildTextStructuredUpsertSpeakerRegistryMetadata,
    buildTextStructuredSpeakerVoiceProfileV2Metadata,
    buildTextStructuredPlaybackRateProfileMetadata,
    getTextStructuredPlaybackRateProfile,
    buildTextStructuredLocalAudioProfileMetadata,
    buildTextStructuredAudioDownloadProfileMetadata,
    TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES,
    TEXT_STRUCTURED_RESET_SCOPES
  };

  const transpiled = esbuild.transformSync(
    `${snippets}\nreturn { ensureStructuredTextSpeakerIdentity, handleStructuredTextSpeakerVoiceChange, handleStructuredTextSpeakerRateChange, handleStructuredTextSpeakerLocalAudioVoiceChange, handleStructuredTextSpeakerDownloadVoiceChange };`,
    { loader: 'js', format: 'cjs', target: 'es2022' }
  ).code;

  const argNames = Object.keys(scope);
  const argValues = Object.values(scope);
  const handlers = new Function(...argNames, transpiled)(...argValues);

  return {
    handlers,
    getSnapshot: () => persistedSnapshot,
    getDocument: () => persistedSnapshot.documents.find(doc => doc.id === documentId),
    getSegments: () => persistedSnapshot.segments.filter(seg => seg.documentId === documentId),
    getCommands: () => dispatchedCommands
  };
};

const createConversationBaselineSnapshot = () => {
  const existingUid = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SPEAKER);
  return normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1,
    initialized: true,
    activeDocumentId: 'DOC_000001',
    counters: { collection: 0, document: 1, text: 2, segment: 4, audioVariant: 0 },
    collections: [],
    documents: [{
      id: 'DOC_000001',
      uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.WORKSPACE),
      order: 1,
      title: 'P12-B Mixed Conversation Doc',
      documentType: 'mixed',
      editorModel: 'structured-v1',
      collectionId: null,
      metadata: buildTextStructuredSpeakerVoiceProfileV2Metadata({
        metadata: {
          externalSourceV1: { packageId: 'ext-1', keep: true },
          speakerRegistryV1: [
            { id: 'SPK_EXISTING', uid: existingUid, label: 'Existing Host', externalKey: 'host' }
          ]
        },
        speakerId: 'SPK_EXISTING',
        channel: 'text',
        voiceName: 'Microsoft Ryan Online (Natural) - English (United Kingdom)'
      })
    }],
    blocks: [
      {
        id: 'TEXT_000001',
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD),
        documentId: 'DOC_000001',
        order: 1,
        blockType: 'conversation',
        title: 'Scene 1',
        metadata: { paragraphRoleV1: 'conversation' }
      },
      {
        id: 'TEXT_000002',
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD),
        documentId: 'DOC_000001',
        order: 2,
        blockType: 'paragraph',
        title: 'Narrator Note',
        metadata: { paragraphRoleV1: 'narration' }
      }
    ],
    segments: [
      {
        id: 'SEGMENT_000001',
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
        documentId: 'DOC_000001',
        blockId: 'TEXT_000001',
        order: 1,
        speaker: 'Existing Host',
        text: 'Welcome back.',
        meaning: 'Selamat datang kembali.',
        metadata: { speakerIdentityV1: 'SPK_EXISTING' }
      },
      {
        id: 'SEGMENT_000002',
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
        documentId: 'DOC_000001',
        blockId: 'TEXT_000001',
        order: 2,
        speaker: 'Nina',
        text: 'Nice to meet you.',
        meaning: 'Senang bertemu denganmu.',
        metadata: { sentenceAuthoringV1: { authored: true } }
      },
      {
        id: 'SEGMENT_000003',
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
        documentId: 'DOC_000001',
        blockId: 'TEXT_000001',
        order: 3,
        speaker: 'Omar',
        text: 'Let us begin.',
        meaning: 'Mari kita mulai.',
        metadata: {}
      },
      {
        id: 'SEGMENT_000004',
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
        documentId: 'DOC_000001',
        blockId: 'TEXT_000002',
        order: 1,
        speaker: 'Nina',
        text: 'Narration line.',
        meaning: 'Baris narasi.',
        metadata: { sentenceAuthoringV1: { paragraphKeep: true } }
      }
    ],
    audioVariants: []
  });
};

let passed = 0;
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------------
// Stage B1 — SPK-01 metadata overwrite prevention
// ---------------------------------------------------------------------------

test('B1.1 SPK-01: Browser TTS voice change for newly detected speaker preserves speakerRegistryV1, segment identity, existing speaker, and unrelated metadata', async () => {
  const harness = instantiateAppSpeakerHandlers({
    initialSnapshot: createConversationBaselineSnapshot(),
    documentId: 'DOC_000001'
  });

  const res = await harness.handlers.handleStructuredTextSpeakerVoiceChange(
    'Nina',
    'Microsoft Sonia Online (Natural) - English (United Kingdom)',
    'text'
  );
  assert.ok(res, 'voice change command should succeed');

  const doc = harness.getDocument();
  const registry = getTextStructuredSpeakerRegistry(doc);
  const nina = registry.find(entry => entry.label === 'Nina');
  assert.ok(nina?.id, 'Nina must remain registered in speakerRegistryV1 after saving Browser TTS voice');
  assert.ok(nina?.uid?.startsWith('SPKUID_'), 'Nina registry entry must retain a speaker UID');

  const existing = registry.find(entry => entry.id === 'SPK_EXISTING');
  assert.equal(existing?.externalKey, 'host', 'existing speaker externalKey must be preserved');

  const voiceMap = getTextStructuredSpeakerVoiceProfileV2(doc);
  assert.equal(voiceMap.text[nina.id], 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
  assert.equal(voiceMap.text.SPK_EXISTING, 'Microsoft Ryan Online (Natural) - English (United Kingdom)');
  assert.deepEqual(doc.metadata.externalSourceV1, { packageId: 'ext-1', keep: true });

  const seg2 = harness.getSegments().find(seg => seg.id === 'SEGMENT_000002');
  assert.equal(getTextStructuredSegmentSpeakerId(seg2), nina.id, 'segment speakerIdentityV1 must match Nina ID');
});

test('B1.2 SPK-01: Playback rate change for newly detected speaker preserves speakerRegistryV1 + prior profiles', async () => {
  const harness = instantiateAppSpeakerHandlers({
    initialSnapshot: createConversationBaselineSnapshot(),
    documentId: 'DOC_000001'
  });

  const res = await harness.handlers.handleStructuredTextSpeakerRateChange('Nina', 1.2, 'text');
  assert.ok(res, 'rate change command should succeed');

  const doc = harness.getDocument();
  const registry = getTextStructuredSpeakerRegistry(doc);
  const nina = registry.find(entry => entry.label === 'Nina');
  assert.ok(nina?.id, 'Nina must remain in speakerRegistryV1 after rate change');

  const rateProfile = getTextStructuredPlaybackRateProfile(doc);
  assert.equal(rateProfile.speakerIds.text[nina.id], 1.2);
  assert.equal(
    getTextStructuredSpeakerVoiceProfileV2(doc).text.SPK_EXISTING,
    'Microsoft Ryan Online (Natural) - English (United Kingdom)'
  );
});

test('B1.3 SPK-01: Custom Local audio voice change for newly detected speaker preserves speakerRegistryV1', async () => {
  const harness = instantiateAppSpeakerHandlers({
    initialSnapshot: createConversationBaselineSnapshot(),
    documentId: 'DOC_000001'
  });

  const res = await harness.handlers.handleStructuredTextSpeakerLocalAudioVoiceChange('Nina', 'en-GB-LibbyNeural', 'text');
  assert.ok(res, 'local audio voice change command should succeed');

  const doc = harness.getDocument();
  const nina = getTextStructuredSpeakerRegistry(doc).find(entry => entry.label === 'Nina');
  assert.ok(nina?.id, 'Nina must remain in speakerRegistryV1 after local audio change');
  const localProfile = getTextStructuredLocalAudioProfile(doc);
  assert.equal(localProfile.speakerIds.text[nina.id], 'en-GB-LibbyNeural');
});

test('B1.4 SPK-01: Edge Download voice change for newly detected speaker preserves speakerRegistryV1', async () => {
  const harness = instantiateAppSpeakerHandlers({
    initialSnapshot: createConversationBaselineSnapshot(),
    documentId: 'DOC_000001'
  });

  const res = await harness.handlers.handleStructuredTextSpeakerDownloadVoiceChange('Nina', 'en-GB-SoniaNeural', 'text');
  assert.ok(res, 'edge download voice change command should succeed');

  const doc = harness.getDocument();
  const nina = getTextStructuredSpeakerRegistry(doc).find(entry => entry.label === 'Nina');
  assert.ok(nina?.id, 'Nina must remain in speakerRegistryV1 after edge download voice change');
  const downloadProfile = getTextStructuredAudioDownloadProfile(doc);
  assert.equal(downloadProfile.speakerIds.text[nina.id], 'en-GB-SoniaNeural');
});

test('B1.5 SPK-01: Repeated speaker preference changes across voice, rate, local, download, and multiple speakers BEFORE React rerender never clobber prior preferences or registry', async () => {
  const harness = instantiateAppSpeakerHandlers({
    initialSnapshot: createConversationBaselineSnapshot(),
    documentId: 'DOC_000001'
  });

  // All calls share the SAME stale pre-await closure activeTextDocumentTree!
  await harness.handlers.handleStructuredTextSpeakerVoiceChange('Nina', 'Microsoft Sonia Online (Natural) - English (United Kingdom)', 'text');
  await harness.handlers.handleStructuredTextSpeakerRateChange('Nina', 1.3, 'text');
  await harness.handlers.handleStructuredTextSpeakerLocalAudioVoiceChange('Nina', 'en-GB-LibbyNeural', 'text');
  await harness.handlers.handleStructuredTextSpeakerDownloadVoiceChange('Nina', 'en-GB-SoniaNeural', 'text');
  await harness.handlers.handleStructuredTextSpeakerVoiceChange('Omar', 'Microsoft Guy Online (Natural) - English (United States)', 'meaning');

  const doc = harness.getDocument();
  const registry = getTextStructuredSpeakerRegistry(doc);
  const nina = registry.find(entry => entry.label === 'Nina');
  const omar = registry.find(entry => entry.label === 'Omar');
  assert.ok(nina?.id && omar?.id, 'Both Nina and Omar must exist in speakerRegistryV1');
  assert.equal(registry.length, 3, 'All 3 speakers (Existing Host, Nina, Omar) must coexist in registry');

  assert.equal(getTextStructuredSpeakerVoiceProfileV2(doc).text[nina.id], 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
  assert.equal(getTextStructuredSpeakerVoiceProfileV2(doc).meaning[omar.id], 'Microsoft Guy Online (Natural) - English (United States)');
  assert.equal(getTextStructuredPlaybackRateProfile(doc).speakerIds.text[nina.id], 1.3);
  assert.equal(getTextStructuredLocalAudioProfile(doc).speakerIds.text[nina.id], 'en-GB-LibbyNeural');
  assert.equal(getTextStructuredAudioDownloadProfile(doc).speakerIds.text[nina.id], 'en-GB-SoniaNeural');
});

test('B1.6 Atomic REGISTER_SPEAKER command registers speaker, binds matching segments, preserves unrelated metadata, and is idempotent', () => {
  assert.ok(TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER, 'TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER must exist');
  const baseline = createConversationBaselineSnapshot();
  const detectedIdentity = collectTextStructuredConversationSpeakerIdentities(
    resolveTextLibraryDocumentTree(baseline, 'DOC_000001')
  ).find(item => item.label === 'Nina');
  assert.ok(detectedIdentity?.id);

  const first = applyTextLibraryCommand(baseline, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
    payload: {
      documentId: 'DOC_000001',
      speakerId: detectedIdentity.id,
      label: detectedIdentity.label,
      segmentIds: detectedIdentity.segmentIds
    }
  }, 9001);

  const doc1 = first.snapshot.documents.find(d => d.id === 'DOC_000001');
  const reg1 = getTextStructuredSpeakerRegistry(doc1);
  const nina1 = reg1.find(s => s.id === detectedIdentity.id);
  assert.equal(nina1?.label, 'Nina');
  assert.equal(
    getTextStructuredSegmentSpeakerId(first.snapshot.segments.find(s => s.id === 'SEGMENT_000002')),
    detectedIdentity.id
  );
  // Paragraph card segment must not be falsely overwritten
  assert.equal(
    first.snapshot.segments.find(s => s.id === 'SEGMENT_000004')?.metadata?.sentenceAuthoringV1?.paragraphKeep,
    true
  );

  // Repeating REGISTER_SPEAKER preserves UID and metadata without duplicate entries
  const second = applyTextLibraryCommand(first.snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
    payload: {
      documentId: 'DOC_000001',
      speakerId: detectedIdentity.id,
      label: 'Nina',
      segmentIds: detectedIdentity.segmentIds
    }
  }, 9002);
  const doc2 = second.snapshot.documents.find(d => d.id === 'DOC_000001');
  assert.equal(getTextStructuredSpeakerRegistry(doc2).find(s => s.id === detectedIdentity.id)?.uid, nina1.uid);
  assert.equal(getTextStructuredSpeakerRegistry(doc2).length, 2);
});

// ---------------------------------------------------------------------------
// Stage B2 — SPK-02 rename, collision handling, and atomicity
// ---------------------------------------------------------------------------

test('B2.1 SPK-02: Renaming Speaker A to existing Speaker B (case/whitespace-insensitive) or DETECTED label surfaces accessible inline error [role="alert"] with no unhandled rejection and zero mutation', async () => {
  const benUid = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SPEAKER);
  let snapshot = createConversationBaselineSnapshot();
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: {
      id: 'DOC_000001',
      metadata: buildTextStructuredUpsertSpeakerRegistryMetadata({
        metadata: snapshot.documents[0].metadata,
        documentId: 'DOC_000001',
        speakerId: 'SPK_BEN',
        label: 'Ben'
      })
    }
  }, 5100).snapshot;
  // Give Ben explicit uid cleanly via normalize snapshot
  snapshot.documents[0].metadata.speakerRegistryV1 = snapshot.documents[0].metadata.speakerRegistryV1.map(entry => (
    entry.id === 'SPK_BEN' ? { ...entry, uid: benUid } : entry
  ));

  const docSnapshotBefore = structuredClone(snapshot);
  const commands = [];
  const harness = createSpeakerRegistryHarness();
  try {
    const view = harness.mount({
      documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'),
      isBusy: false,
      onCommand: async cmd => {
        commands.push(cmd);
        const res = applyTextLibraryCommand(snapshot, cmd, 5200);
        snapshot = res.snapshot;
        return { ...res, librarySnapshot: snapshot };
      }
    });

    // Click Rename on Ben
    const renameButtons = view.findAll(n => n.type === 'button' && n.props?.title === 'Rename speaker');
    assert.equal(renameButtons.length, 4, 'Existing Host, Ben, Nina, Omar should render rename controls');
    // Find Ben's row rename button
    const rowBoxes = view.findAll(n => n.type === 'div' && String(n.props?.className || '').includes('rounded-lg border border-slate-200'));
    const benRow = rowBoxes.find(row => view.textOf(row).includes('Ben'));
    assert.ok(benRow, 'Ben row must exist');
    const benRenameBtn = benRow.children.flatMap(c => (c?.type === 'div' ? c.children : [])).find(n => n?.type === 'button' && n?.props?.title === 'Rename speaker');
    benRenameBtn.props.onClick();
    view.rerender();

    const editInput = view.findAll(n => n.type === 'input' && n.props?.value === 'Ben')[0];
    assert.ok(editInput, 'Rename input should open with Ben');
    editInput.props.onChange({ target: { value: '  existing   host  ' } });
    view.rerender();

    const saveBtn = view.findAll(n => n.type === 'button' && n.props?.title === 'Save speaker name')[0];
    assert.ok(saveBtn, 'Save speaker name button must render');

    // Must settle cleanly (NO unhandled rejection)
    await saveBtn.props.onClick();
    view.rerender({
      documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'),
      isBusy: false,
      onCommand: async cmd => {
        commands.push(cmd);
        const res = applyTextLibraryCommand(snapshot, cmd, 5201);
        snapshot = res.snapshot;
        return { ...res, librarySnapshot: snapshot };
      }
    });

    const alerts = view.findByRole('alert');
    assert.ok(alerts.length >= 1, 'Duplicate rename must surface an accessible role="alert" inline error');
    assert.match(view.textOf(alerts[0]), /already|exists|registered|used/i);
    assert.equal(commands.length, 0, 'Duplicate rename must not mutate registry or dispatch segment writes');
    assert.deepEqual(snapshot, docSnapshotBefore, 'Snapshot must be 100% unchanged after duplicate rename');
    assert.equal(view.findAll(n => n.type === 'button' && n.props?.title === 'Save speaker name').length, 1, 'Edit mode stays open on collision so user can fix input');

    // Also test renaming Existing Host to unregistered DETECTED speaker "  nina "
    const cancelBtn = view.findAll(n => n.type === 'button' && n.props?.title === 'Cancel')[0];
    cancelBtn.props.onClick();
    view.rerender();
    assert.equal(view.findByRole('alert').length, 0, 'Cancel clears inline error');

    const hostRow = view.findAll(n => n.type === 'div' && String(n.props?.className || '').includes('rounded-lg border border-slate-200'))
      .find(row => view.textOf(row).includes('Existing Host'));
    const hostRenameBtn = hostRow.children.flatMap(c => (c?.type === 'div' ? c.children : [])).find(n => n?.type === 'button' && n?.props?.title === 'Rename speaker');
    hostRenameBtn.props.onClick();
    view.rerender();

    const hostInput = view.findAll(n => n.type === 'input' && n.props?.value === 'Existing Host')[0];
    hostInput.props.onChange({ target: { value: '  nina ' } });
    view.rerender();
    const saveHostBtn = view.findAll(n => n.type === 'button' && n.props?.title === 'Save speaker name')[0];
    await saveHostBtn.props.onClick();
    view.rerender();
    const detectedAlerts = view.findByRole('alert');
    assert.ok(detectedAlerts.length >= 1, 'Renaming into a colliding detected speaker name must show role="alert" error');
    assert.deepEqual(snapshot, docSnapshotBefore);
  } finally {
    harness.restoreWindow();
  }
});

test('B2.2 SPK-02: Register/Add duplicate, detected promotion, empty label, remove-unused boundaries, and failed persistence show safe inline error', async () => {
  let snapshot = createConversationBaselineSnapshot();
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: {
      id: 'DOC_000001',
      metadata: buildTextStructuredUpsertSpeakerRegistryMetadata({
        metadata: snapshot.documents[0].metadata,
        documentId: 'DOC_000001',
        speakerId: 'SPK_UNUSED',
        label: 'Unused Guest'
      })
    }
  }, 5300).snapshot;

  let failNextCommand = false;
  const dispatched = [];
  const harness = createSpeakerRegistryHarness();
  try {
    const onCommand = async cmd => {
      dispatched.push(cmd);
      if (failNextCommand) return null;
      const res = applyTextLibraryCommand(snapshot, cmd, 5400);
      snapshot = res.snapshot;
      return { ...res, librarySnapshot: snapshot };
    };
    const view = harness.mount({
      documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'),
      isBusy: false,
      onCommand
    });

    // 1. Add duplicate registered label (case/whitespace-insensitive)
    const addInput = () => view.findAll(n => n.type === 'input' && n.props?.placeholder === 'Add speaker name')[0];
    const addBtn = () => view.findAll(n => n.type === 'button' && view.textOf(n).includes('Register') && !n.props?.className?.includes('border-emerald'))[0];

    addInput().props.onChange({ target: { value: '  existing   host ' } });
    view.rerender();
    await addBtn().props.onClick();
    view.rerender({ documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'), isBusy: false, onCommand });
    assert.ok(view.findByRole('alert').length >= 1, 'Adding duplicate registered speaker label must surface inline role="alert"');
    assert.equal(dispatched.length, 0, 'Duplicate Add must not dispatch command');

    // Typing clears error
    addInput().props.onChange({ target: { value: '  nina ' } });
    view.rerender();
    assert.equal(view.findByRole('alert').length, 0, 'Typing clears stale inline error');

    // 2. Adding a DETECTED speaker name promotes it and binds segment speakerIdentityV1
    await addBtn().props.onClick();
    view.rerender({ documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'), isBusy: false, onCommand });
    const ninaReg = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.label === 'Nina');
    assert.ok(ninaReg, 'Promoting detected Nina via Add input must register Nina');
    assert.equal(getTextStructuredSegmentSpeakerId(snapshot.segments.find(s => s.id === 'SEGMENT_000002')), ninaReg.id, 'Promoting detected Nina via Add input must bind SEGMENT_000002 speakerIdentityV1');

    // 3. Empty label Enter key boundary shows accessible inline error without mutating
    addInput().props.onChange({ target: { value: '   ' } });
    view.rerender();
    await addInput().props.onKeyDown({ key: 'Enter' });
    view.rerender();
    assert.ok(view.findByRole('alert').length >= 1, 'Submitting empty speaker label must show inline role="alert"');

    // 4. Remove-unused boundary: used button is disabled, unused removes cleanly via atomic command
    const removeButtons = view.findAll(n => n.type === 'button' && n.props?.title?.includes('Remove') || n.type === 'button' && n.props?.title?.includes('Used speakers'));
    const hostRemoveBtn = removeButtons[0];
    assert.equal(hostRemoveBtn.props.disabled, true, 'Used speaker remove button must be disabled');

    const unusedRemoveBtn = view.findAll(n => n.type === 'button' && n.props?.title === 'Remove unused speaker')[0];
    assert.ok(unusedRemoveBtn && !unusedRemoveBtn.props.disabled, 'Unused speaker remove button must be enabled');
    await unusedRemoveBtn.props.onClick();
    view.rerender({ documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'), isBusy: false, onCommand });
    assert.equal(
      getTextStructuredSpeakerRegistry(snapshot.documents[0]).some(s => s.id === 'SPK_UNUSED'),
      false,
      'Unused speaker must be removed cleanly'
    );

    // 5. Failed onCommand (returns null) shows accessible inline error without clearing edit state
    failNextCommand = true;
    const omarRow = view.findAll(n => n.type === 'div' && String(n.props?.className || '').includes('rounded-lg border border-slate-200'))
      .find(row => view.textOf(row).includes('Omar'));
    const omarRegisterBtn = view.findIn(omarRow, n => n?.type === 'button' && view.textOf(n).includes('Register'))[0];
    assert.ok(omarRegisterBtn, 'Detected Omar row must render Register button');
    await omarRegisterBtn.props.onClick();
    view.rerender();
    assert.ok(view.findByRole('alert').length >= 1, 'Failed command persistence must show inline role="alert"');

    // 6. Switching active document automatically clears stale inline error & draft inputs without effect loops
    view.rerender({
      documentTree: {
        ...resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'),
        id: 'DOC_000999'
      },
      isBusy: false,
      onCommand
    });
    assert.equal(view.findByRole('alert').length, 0, 'Switching document must clear stale inline error');
  } finally {
    harness.restoreWindow();
  }
});

test('B2.4 SPK-02 UI Rename: TextStructuredSpeakerRegistry dispatches 1 atomic RENAME_SPEAKER command and supports rapid register -> rename -> rename sequence', async () => {
  let snapshot = createConversationBaselineSnapshot();
  const commands = [];
  const harness = createSpeakerRegistryHarness();
  try {
    const onCommand = async cmd => {
      commands.push(cmd);
      const res = applyTextLibraryCommand(snapshot, cmd, 6100 + commands.length);
      snapshot = res.snapshot;
      return { ...res, librarySnapshot: snapshot };
    };
    const refreshProps = () => ({
      documentTree: resolveTextLibraryDocumentTree(snapshot, 'DOC_000001'),
      isBusy: false,
      onCommand
    });
    const view = harness.mount(refreshProps());

    // Register detected Nina
    const ninaRow = view.findAll(n => n.type === 'div' && String(n.props?.className || '').includes('rounded-lg border border-slate-200'))
      .find(row => view.textOf(row).includes('Nina'));
    const ninaRegisterBtn = view.findIn(ninaRow, n => n?.type === 'button' && view.textOf(n).includes('Register'))[0];
    await ninaRegisterBtn.props.onClick();
    view.rerender(refreshProps());
    assert.equal(commands.length, 1);
    assert.equal(commands[0].type, TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER);

    // Rapid rename #1: Nina -> Nadia
    const ninaRowAfter = view.findAll(n => n.type === 'div' && String(n.props?.className || '').includes('rounded-lg border border-slate-200'))
      .find(row => view.textOf(row).includes('Nina'));
    view.findIn(ninaRowAfter, n => n?.type === 'button' && n?.props?.title === 'Rename speaker')[0].props.onClick();
    view.rerender(refreshProps());

    const edit1 = view.findAll(n => n.type === 'input' && n.props?.value === 'Nina')[0];
    edit1.props.onChange({ target: { value: 'Nadia' } });
    view.rerender(refreshProps());
    await view.findAll(n => n.type === 'button' && n.props?.title === 'Save speaker name')[0].props.onClick();
    view.rerender(refreshProps());
    assert.equal(commands.length, 2, 'UI Rename must dispatch 1 atomic RENAME_SPEAKER command (not N+1 updates)');
    assert.equal(commands[1].type, TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER);

    const ninaId = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.label === 'Nadia')?.id;
    assert.ok(ninaId);
    assert.equal(snapshot.segments.find(s => s.id === 'SEGMENT_000002')?.speaker, 'Nadia');
    assert.equal(snapshot.segments.find(s => s.id === 'SEGMENT_000004')?.speaker, 'Nina', 'Paragraph card line must remain untouched');

    // Rapid rename #2: Nadia -> Nadia Putri
    const nadiaRow = view.findAll(n => n.type === 'div' && String(n.props?.className || '').includes('rounded-lg border border-slate-200'))
      .find(row => view.textOf(row).includes('Nadia'));
    view.findIn(nadiaRow, n => n?.type === 'button' && n?.props?.title === 'Rename speaker')[0].props.onClick();
    view.rerender(refreshProps());
    const edit2 = view.findAll(n => n.type === 'input' && n.props?.value === 'Nadia')[0];
    edit2.props.onChange({ target: { value: 'Nadia Putri' } });
    view.rerender(refreshProps());
    await view.findAll(n => n.type === 'input' && n.props?.value === 'Nadia Putri')[0].props.onKeyDown({ key: 'Enter' });
    view.rerender(refreshProps());

    assert.equal(commands.length, 3);
    assert.equal(getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.id === ninaId)?.label, 'Nadia Putri');
    assert.equal(snapshot.segments.find(s => s.id === 'SEGMENT_000002')?.speaker, 'Nadia Putri');
  } finally {
    harness.restoreWindow();
  }
});

// ---------------------------------------------------------------------------
// Stage B3 — Speaker ID & persistence consistency + Reset compatibility
// ---------------------------------------------------------------------------

test('B3.1 SPK_EXT_* and local SPK_* keep stable IDs, UIDs, and externalKey across voice/rate/local/download edits, rename, restart normalization, backup export/restore, and P12-A re-reconciliation', async () => {
  const pkgV1 = JSON.parse(read('scripts/fixtures/p12a/P12A_Speaker_Conflict_Base_v1.json'));
  const pkgV2 = JSON.parse(read('scripts/fixtures/p12a/P12A_Reimport_Preserve_And_Rename_v2.json'));
  const empty = normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: TEXT_LIBRARY_SCHEMA_VERSION,
    initialized: true,
    activeDocumentId: null,
    counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
    collections: [],
    documents: [],
    blocks: [],
    segments: [],
    audioVariants: []
  });

  const imported = planProLingoTextExternalInitialImport({
    localSnapshot: empty,
    package: pkgV1,
    now: 7000,
    fileName: 'p12a-base.json'
  });
  let snapshot = imported.snapshot;
  const docId = imported.importRecord.documentId;
  const externalSpkBefore = getTextStructuredSpeakerRegistry(snapshot.documents.find(d => d.id === docId))[0];
  assert.ok(externalSpkBefore?.id?.startsWith('SPK_EXT_'), 'Imported fixture should have SPK_EXT_* speaker ID');
  assert.ok(externalSpkBefore?.externalKey, 'Imported speaker should carry externalKey');

  // Add a local conversation segment with a brand-new local speaker "Zara"
  const blockId = snapshot.blocks.find(b => b.documentId === docId && b.blockType === 'conversation').id;
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId,
      speaker: 'Zara',
      text: 'Hello from local speaker.',
      meaning: 'Halo dari pembicara lokal.'
    }
  }, 7001).snapshot;

  const docAfterSeg = snapshot.documents.find(d => d.id === docId);
  const localZaraBefore = getTextStructuredSpeakerRegistry(docAfterSeg).find(s => s.label === 'Zara');
  assert.ok(localZaraBefore?.id?.startsWith('SPK_'), 'Local speaker must receive SPK_* ID');
  assert.ok(localZaraBefore?.uid?.startsWith('SPKUID_'));

  // Run real App.jsx preference handlers for BOTH SPK_EXT_* and local SPK_* (without React rerender)
  const appHarness = instantiateAppSpeakerHandlers({ initialSnapshot: snapshot, documentId: docId });
  await appHarness.handlers.handleStructuredTextSpeakerVoiceChange(externalSpkBefore.id, 'Microsoft Sonia Online (Natural) - English (United Kingdom)', 'text');
  await appHarness.handlers.handleStructuredTextSpeakerRateChange(localZaraBefore, 1.2, 'text');
  snapshot = appHarness.getSnapshot();

  // Simulated browser reload/restart normalization
  const reloadedSnapshot = normalizeTextLibraryRuntimeSnapshot(JSON.parse(JSON.stringify(snapshot)));
  const docReloaded = reloadedSnapshot.documents.find(d => d.id === docId);
  const extReloaded = getTextStructuredSpeakerRegistry(docReloaded).find(s => s.id === externalSpkBefore.id);
  const zaraReloaded = getTextStructuredSpeakerRegistry(docReloaded).find(s => s.id === localZaraBefore.id);
  assert.equal(extReloaded?.uid, externalSpkBefore.uid);
  assert.equal(extReloaded?.externalKey, externalSpkBefore.externalKey);
  assert.equal(zaraReloaded?.uid, localZaraBefore.uid);
  assert.equal(getTextStructuredSpeakerVoiceProfileV2(docReloaded).text[externalSpkBefore.id], 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
  assert.equal(getTextStructuredPlaybackRateProfile(docReloaded).speakerIds.text[localZaraBefore.id], 1.2);

  // Rename local speaker Zara -> Zara K, verify database backup + restore preserves all IDs/UIDs/profiles
  const renamedSnapshot = applyTextLibraryCommand(reloadedSnapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER,
    payload: { documentId: docId, speakerId: localZaraBefore.id, label: 'Zara K' }
  }, 7005).snapshot;

  const backup = createProLingoTextDatabaseBackup({
    metaRecords: [
      { key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: TEXT_LIBRARY_SCHEMA_VERSION },
      { key: TEXT_LIBRARY_META_KEYS.INITIALIZED, value: true },
      { key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: docId },
      { key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: renamedSnapshot.counters }
    ],
    stores: {
      collections: renamedSnapshot.collections,
      documents: renamedSnapshot.documents,
      blocks: renamedSnapshot.blocks,
      segments: renamedSnapshot.segments,
      audioVariants: renamedSnapshot.audioVariants
    },
    now: 7006
  });
  const restored = validateProLingoTextDatabaseBackup(backup);
  const restoredDoc = restored.snapshot.documents.find(d => d.id === docId);
  const restoredExt = getTextStructuredSpeakerRegistry(restoredDoc).find(s => s.id === externalSpkBefore.id);
  const restoredZara = getTextStructuredSpeakerRegistry(restoredDoc).find(s => s.id === localZaraBefore.id);
  assert.equal(restoredExt?.id, externalSpkBefore.id);
  assert.equal(restoredExt?.uid, externalSpkBefore.uid);
  assert.equal(restoredExt?.externalKey, externalSpkBefore.externalKey);
  assert.equal(restoredZara?.label, 'Zara K');
  assert.equal(restoredZara?.uid, localZaraBefore.uid);
  assert.equal(getTextStructuredSpeakerVoiceProfileV2(restoredDoc).text[externalSpkBefore.id], 'Microsoft Sonia Online (Natural) - English (United Kingdom)');
  assert.equal(getTextStructuredPlaybackRateProfile(restoredDoc).speakerIds.text[localZaraBefore.id], 1.2);

  // Verify external JSON update-existing reconciliation after P12-B operations still preserves local speaker Zara K!
  const reconciled = planTextExternalUpdateExisting({
    localSnapshot: restored.snapshot,
    package: pkgV2,
    existingImport: imported.importRecord,
    conflictPolicy: 'keep-local',
    now: 7007
  });
  const reconciledDoc = reconciled.snapshot.documents.find(d => d.id === docId);
  const reconciledZara = getTextStructuredSpeakerRegistry(reconciledDoc).find(s => s.id === localZaraBefore.id);
  assert.equal(reconciledZara?.label, 'Zara K', 'External reconciliation must still preserve local renamed speaker');
});

test('B3.2 Reset Audio Preferences (SPEAKERS scope) clears speaker audio overrides while keeping speakerRegistryV1 and segment speakerIdentityV1 intact', () => {
  const baseline = createConversationBaselineSnapshot();
  const docId = 'DOC_000001';
  const withPref = applyTextLibraryCommand(baseline, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
    payload: { documentId: docId, label: 'Nina' }
  }, 8000).snapshot;
  const ninaId = getTextStructuredSpeakerRegistry(withPref.documents[0]).find(s => s.label === 'Nina').id;

  let meta = withPref.documents[0].metadata;
  meta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: meta, speakerId: ninaId, channel: 'text', voiceName: 'Microsoft Sonia Online (Natural) - English (United Kingdom)' });
  meta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: meta, speakerId: ninaId, channel: 'text', rate: 1.4 });
  const beforeReset = applyTextLibraryCommand(withPref, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: docId, metadata: meta }
  }, 8001).snapshot;

  const afterReset = applyTextLibraryCommand(beforeReset, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RESET_AUDIO_PREFERENCES,
    payload: { scope: TEXT_STRUCTURED_RESET_SCOPES.SPEAKERS, documentId: docId }
  }, 8002).snapshot;

  const docAfter = afterReset.documents[0];
  assert.deepEqual(
    getTextStructuredSpeakerRegistry(docAfter),
    getTextStructuredSpeakerRegistry(beforeReset.documents[0]),
    'SPEAKERS reset must preserve speakerRegistryV1 verbatim'
  );
  assert.equal(
    getTextStructuredSegmentSpeakerId(afterReset.segments.find(s => s.id === 'SEGMENT_000002')),
    ninaId,
    'SPEAKERS reset must preserve segment speakerIdentityV1'
  );
  assert.deepEqual(getTextStructuredSpeakerVoiceProfileV2(docAfter), { text: {}, meaning: {} });
  assert.deepEqual(getTextStructuredPlaybackRateProfile(docAfter).speakerIds, { text: {}, meaning: {} });
});

test('B2.3 SPK-02 Atomic RENAME_SPEAKER: updates registry label and all bound Conversation segments in 1 atomic command, preserves UID/externalKey/preferences/audioVariants/Paragraph cards, and supports post-rename segment creation', () => {
  assert.ok(TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER, 'TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER must exist');
  assert.ok(TEXT_LIBRARY_COMMAND_TYPES.REMOVE_SPEAKER, 'TEXT_LIBRARY_COMMAND_TYPES.REMOVE_SPEAKER must exist');

  let snapshot = createConversationBaselineSnapshot();
  // Add all 4 speaker preference profiles + second conversation segment for Existing Host + an audioVariant
  const doc = snapshot.documents[0];
  let docMeta = doc.metadata;
  docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, speakerId: 'SPK_EXISTING', channel: 'text', rate: 1.3 });
  docMeta = buildTextStructuredLocalAudioProfileMetadata({ metadata: docMeta, speakerId: 'SPK_EXISTING', channel: 'text', voiceId: 'en-GB-RyanNeural' });
  docMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: docMeta, speakerId: 'SPK_EXISTING', channel: 'text', voiceId: 'en-GB-RyanNeural' });
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: 'DOC_000001', metadata: docMeta }
  }, 6000).snapshot;

  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: 'DOC_000001',
      blockId: 'TEXT_000001',
      speaker: 'Existing Host',
      text: 'Second line for host.',
      meaning: 'Baris kedua untuk host.',
      metadata: { speakerIdentityV1: 'SPK_EXISTING' }
    }
  }, 6001).snapshot;

  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
    payload: {
      segmentId: 'SEGMENT_000001',
      channel: 'text',
      engine: 'edge',
      source: 'file',
      voiceId: 'en-GB-RyanNeural',
      fileName: 'host_01.mp3'
    }
  }, 6002).snapshot;

  const originalUid = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.id === 'SPK_EXISTING').uid;
  const originalAudioCount = snapshot.audioVariants.length;

  // Atomic rename SPK_EXISTING: Existing Host -> Senior Moderator
  const renamed = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER,
    payload: { documentId: 'DOC_000001', speakerId: 'SPK_EXISTING', label: '  Senior Moderator  ' }
  }, 6003).snapshot;

  const renamedDoc = renamed.documents.find(d => d.id === 'DOC_000001');
  const hostAfter = getTextStructuredSpeakerRegistry(renamedDoc).find(s => s.id === 'SPK_EXISTING');
  assert.equal(hostAfter?.label, 'Senior Moderator');
  assert.equal(hostAfter?.uid, originalUid, 'Speaker UID must remain identical on rename');
  assert.equal(hostAfter?.externalKey, 'host', 'externalKey must remain identical on rename');

  const boundSegs = renamed.segments.filter(s => getTextStructuredSegmentSpeakerId(s) === 'SPK_EXISTING');
  assert.equal(boundSegs.length, 2);
  assert.ok(boundSegs.every(s => s.speaker === 'Senior Moderator'), 'All bound Conversation segments must reflect renamed speaker label');

  // Paragraph card segment must remain 100% untouched
  assert.deepEqual(
    renamed.segments.find(s => s.id === 'SEGMENT_000004'),
    snapshot.segments.find(s => s.id === 'SEGMENT_000004')
  );

  // All 4 speaker preference profiles + audioVariants remain intact
  assert.equal(getTextStructuredSpeakerVoiceProfileV2(renamedDoc).text.SPK_EXISTING, 'Microsoft Ryan Online (Natural) - English (United Kingdom)');
  assert.equal(getTextStructuredPlaybackRateProfile(renamedDoc).speakerIds.text.SPK_EXISTING, 1.3);
  assert.equal(getTextStructuredLocalAudioProfile(renamedDoc).speakerIds.text.SPK_EXISTING, 'en-GB-RyanNeural');
  assert.equal(getTextStructuredAudioDownloadProfile(renamedDoc).speakerIds.text.SPK_EXISTING, 'en-GB-RyanNeural');
  assert.equal(renamed.audioVariants.length, originalAudioCount, 'Existing audioVariants must not be deleted on speaker rename');

  // Creating a new segment with the renamed speaker label binds cleanly to existing SPK_EXISTING without collision error
  const afterNewSeg = applyTextLibraryCommand(renamed, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: 'DOC_000001',
      blockId: 'TEXT_000001',
      speaker: 'senior moderator',
      text: 'Third host line.',
      meaning: 'Baris ketiga.'
    }
  }, 6004).snapshot;
  const createdSeg = afterNewSeg.segments[afterNewSeg.segments.length - 1];
  assert.equal(getTextStructuredSegmentSpeakerId(createdSeg), 'SPK_EXISTING', 'New segment authored for renamed speaker must reuse SPK_EXISTING ID');
  assert.equal(createdSeg.speaker, 'Senior Moderator', 'New segment authored for renamed speaker must store canonical registered label');

  // Cannot remove used speaker via REMOVE_SPEAKER, can remove after unused
  assert.throws(() => applyTextLibraryCommand(afterNewSeg, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REMOVE_SPEAKER,
    payload: { documentId: 'DOC_000001', speakerId: 'SPK_EXISTING' }
  }, 6005));

  // Failed colliding rename leaves snapshot completely unchanged (atomic rollback)
  const withBen = applyTextLibraryCommand(afterNewSeg, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
    payload: { documentId: 'DOC_000001', label: 'Ben' }
  }, 6006).snapshot;
  assert.throws(() => applyTextLibraryCommand(withBen, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER,
    payload: { documentId: 'DOC_000001', speakerId: 'SPK_EXISTING', label: '  ben  ' }
  }, 6007));
  assert.equal(getTextStructuredSpeakerRegistry(withBen.documents[0]).find(s => s.id === 'SPK_EXISTING')?.label, 'Senior Moderator');
});

test('B2.5 Canonical registered speaker label preservation across CREATE_SEGMENT and UPDATE_SEGMENT', () => {
  let snapshot = createConversationBaselineSnapshot();
  const docId = 'DOC_000001';
  const originalReg = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.id === 'SPK_EXISTING');

  // 1) CREATE_SEGMENT with lowercase/whitespace variant and omitted speakerIdentityV1
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId: 'TEXT_000001',
      speaker: '  existing   host  ',
      text: 'Canonical check line 1.',
      meaning: 'Baris cek kanonis 1.'
    }
  }, 9000).snapshot;
  const createdImplicit = snapshot.segments[snapshot.segments.length - 1];
  assert.equal(getTextStructuredSegmentSpeakerId(createdImplicit), 'SPK_EXISTING');
  assert.equal(createdImplicit.speaker, 'Existing Host', 'CREATE_SEGMENT must store canonical registered speaker label');

  // 2) CREATE_SEGMENT with uppercase variant AND explicit matching speakerIdentityV1
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId: 'TEXT_000001',
      speaker: 'EXISTING HOST',
      text: 'Canonical check line 2.',
      meaning: 'Baris cek kanonis 2.',
      metadata: {
        speakerIdentityV1: 'SPK_EXISTING',
        sentenceAuthoringV1: { keepFlag: true }
      }
    }
  }, 9001).snapshot;
  const createdExplicit = snapshot.segments[snapshot.segments.length - 1];
  assert.equal(getTextStructuredSegmentSpeakerId(createdExplicit), 'SPK_EXISTING');
  assert.equal(createdExplicit.speaker, 'Existing Host', 'CREATE_SEGMENT with explicit ID must store canonical registered speaker label');
  assert.deepEqual(createdExplicit.metadata?.sentenceAuthoringV1, { keepFlag: true });

  // 3) UPDATE_SEGMENT with case/whitespace-only speaker changes (both omitted and forwarded metadata)
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: 'SEGMENT_000001',
      speaker: '  existing   host '
    }
  }, 9002).snapshot;
  let updatedSeg1 = snapshot.segments.find(s => s.id === 'SEGMENT_000001');
  assert.equal(getTextStructuredSegmentSpeakerId(updatedSeg1), 'SPK_EXISTING');
  assert.equal(updatedSeg1.speaker, 'Existing Host', 'UPDATE_SEGMENT case/whitespace variant (metadata omitted) must keep canonical label');

  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: 'SEGMENT_000001',
      speaker: 'EXISTING   HOST',
      metadata: updatedSeg1.metadata
    }
  }, 9003).snapshot;
  updatedSeg1 = snapshot.segments.find(s => s.id === 'SEGMENT_000001');
  assert.equal(getTextStructuredSegmentSpeakerId(updatedSeg1), 'SPK_EXISTING');
  assert.equal(updatedSeg1.speaker, 'Existing Host', 'UPDATE_SEGMENT case/whitespace variant (forwarded metadata) must keep canonical label');

  // Registry metadata remains exact
  const regAfter = getTextStructuredSpeakerRegistry(snapshot.documents[0]);
  assert.equal(regAfter.length, 1);
  assert.deepEqual(regAfter[0], originalReg);

  // 4) Paragraph card segment remains untouched by Conversation speaker registry snapping
  const paraUpdated = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: 'SEGMENT_000004',
      speaker: 'existing host'
    }
  }, 9004).snapshot;
  const paraSeg = paraUpdated.segments.find(s => s.id === 'SEGMENT_000004');
  assert.equal(paraSeg.speaker, 'existing host', 'Paragraph segments must remain unaffected by Conversation speaker registry');
  assert.equal(getTextStructuredSegmentSpeakerId(paraSeg), null);

  // 5) RENAME_SPEAKER still intentionally renames registry + bound Conversation segments
  const renamed = applyTextLibraryCommand(paraUpdated, {
    type: TEXT_LIBRARY_COMMAND_TYPES.RENAME_SPEAKER,
    payload: { documentId: docId, speakerId: 'SPK_EXISTING', label: 'Moderator Chief' }
  }, 9005).snapshot;
  assert.equal(getTextStructuredSpeakerRegistry(renamed.documents[0])[0]?.label, 'Moderator Chief');
  assert.equal(renamed.segments.find(s => s.id === 'SEGMENT_000001')?.speaker, 'Moderator Chief');
  assert.equal(renamed.segments.find(s => s.id === createdImplicit.id)?.speaker, 'Moderator Chief');
  assert.equal(renamed.segments.find(s => s.id === createdExplicit.id)?.speaker, 'Moderator Chief');
  assert.equal(renamed.segments.find(s => s.id === 'SEGMENT_000004')?.speaker, 'existing host');
});

test('B2.6 Stale speakerIdentityV1 guard and mismatched explicit ID rejection on UPDATE_SEGMENT / CREATE_SEGMENT', () => {
  let snapshot = createConversationBaselineSnapshot();
  const docId = 'DOC_000001';

  // Register Alice and Bob cleanly
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
    payload: { documentId: docId, label: 'Alice' }
  }, 9100).snapshot;
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.REGISTER_SPEAKER,
    payload: { documentId: docId, label: 'Bob' }
  }, 9101).snapshot;

  const aliceId = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.label === 'Alice').id;
  const bobId = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.label === 'Bob').id;
  const aliceUidBefore = getTextStructuredSpeakerRegistry(snapshot.documents[0]).find(s => s.id === aliceId).uid;

  let metaWithVoice = buildTextStructuredSpeakerVoiceProfileV2Metadata({
    metadata: snapshot.documents[0].metadata,
    speakerId: aliceId,
    channel: 'text',
    voiceName: 'Microsoft Sonia Online (Natural) - English (United Kingdom)'
  });
  metaWithVoice = buildTextStructuredSpeakerVoiceProfileV2Metadata({
    metadata: metaWithVoice,
    speakerId: bobId,
    channel: 'text',
    voiceName: 'Microsoft Libby Online (Natural) - English (United Kingdom)'
  });
  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id: docId, metadata: metaWithVoice }
  }, 9102).snapshot;

  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId: 'TEXT_000001',
      speaker: 'Alice',
      text: 'Alice line 1.',
      meaning: 'Baris Alice 1.',
      metadata: { speakerIdentityV1: aliceId }
    }
  }, 9103).snapshot;
  const segA1Id = snapshot.segments[snapshot.segments.length - 1].id;

  snapshot = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId: 'TEXT_000001',
      speaker: 'Alice',
      text: 'Alice line 2.',
      meaning: 'Baris Alice 2.',
      metadata: { speakerIdentityV1: aliceId }
    }
  }, 9104).snapshot;
  const segA2Id = snapshot.segments[snapshot.segments.length - 1].id;

  // Case 1: Caller updates segA1 speaker to unregistered 'Charlie' while forwarding stale segA1.metadata (speakerIdentityV1 === aliceId)
  const segA1Before = snapshot.segments.find(s => s.id === segA1Id);
  const afterCharlie = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: segA1Id,
      speaker: 'Charlie',
      metadata: { ...segA1Before.metadata, authoredTag: 'keep-me' }
    }
  }, 9105).snapshot;

  const regAfterCharlie = getTextStructuredSpeakerRegistry(afterCharlie.documents[0]);
  const aliceAfterCharlie = regAfterCharlie.find(s => s.id === aliceId);
  assert.equal(aliceAfterCharlie?.label, 'Alice', 'Stale speakerIdentityV1 on UPDATE_SEGMENT must never rename Alice in speakerRegistryV1');
  assert.equal(aliceAfterCharlie?.uid, aliceUidBefore);

  const segA1AfterCharlie = afterCharlie.segments.find(s => s.id === segA1Id);
  const segA2AfterCharlie = afterCharlie.segments.find(s => s.id === segA2Id);
  const charlieId = getTextStructuredSegmentSpeakerId(segA1AfterCharlie);
  assert.ok(charlieId && charlieId !== aliceId, 'segA1 reassigned to Charlie must receive Charlie speaker ID, not stale aliceId');
  assert.equal(segA1AfterCharlie.speaker, 'Charlie');
  assert.equal(segA1AfterCharlie.metadata?.authoredTag, 'keep-me');
  assert.equal(regAfterCharlie.find(s => s.id === charlieId)?.label, 'Charlie');
  assert.equal(segA2AfterCharlie.speaker, 'Alice');
  assert.equal(getTextStructuredSegmentSpeakerId(segA2AfterCharlie), aliceId);

  // Case 2: Caller updates segA2 speaker to registered '  bob  ' while forwarding stale segA2.metadata (speakerIdentityV1 === aliceId)
  const segA2Before = afterCharlie.segments.find(s => s.id === segA2Id);
  const afterBobStale = applyTextLibraryCommand(afterCharlie, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: segA2Id,
      speaker: '  bob  ',
      metadata: { ...segA2Before.metadata }
    }
  }, 9106).snapshot;

  const segA2AfterBob = afterBobStale.segments.find(s => s.id === segA2Id);
  assert.equal(getTextStructuredSegmentSpeakerId(segA2AfterBob), bobId, 'Stale aliceId + target registered bob must bind to SPK_BOB');
  assert.equal(segA2AfterBob.speaker, 'Bob', 'Must store canonical registered Bob label');
  const regAfterBob = getTextStructuredSpeakerRegistry(afterBobStale.documents[0]);
  assert.equal(regAfterBob.find(s => s.id === aliceId)?.label, 'Alice');
  assert.equal(regAfterBob.find(s => s.id === bobId)?.label, 'Bob');
  assert.equal(
    getTextStructuredSpeakerVoiceProfileV2(afterBobStale.documents[0]).text?.[aliceId],
    'Microsoft Sonia Online (Natural) - English (United Kingdom)'
  );
  assert.equal(
    getTextStructuredSpeakerVoiceProfileV2(afterBobStale.documents[0]).text?.[bobId],
    'Microsoft Libby Online (Natural) - English (United Kingdom)'
  );

  // Case 3: Direct mismatched explicit ID belonging to a DIFFERENT registered speaker must throw in CREATE_SEGMENT and UPDATE_SEGMENT
  assert.throws(() => applyTextLibraryCommand(afterBobStale, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId: 'TEXT_000001',
      speaker: 'Diana',
      text: 'Mismatch create.',
      meaning: 'Tidak cocok.',
      metadata: { speakerIdentityV1: aliceId }
    }
  }, 9107), /speaker/i);

  assert.throws(() => applyTextLibraryCommand(afterBobStale, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: segA1Id, // currently Charlie (charlieId)
      speaker: 'Diana',
      metadata: { ...segA1AfterCharlie.metadata, speakerIdentityV1: aliceId }
    }
  }, 9108), /speaker/i);

  // Failed commands must not register Diana or rename Alice
  assert.equal(
    getTextStructuredSpeakerRegistry(afterBobStale.documents[0]).some(s => s.label === 'Diana'),
    false
  );

  // Case 4: Valid explicit reassignments, explicit custom IDs, and text-only edits stay compatible
  const explicitBob = applyTextLibraryCommand(afterBobStale, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: segA1Id,
      speaker: 'Bob',
      metadata: { ...segA1AfterCharlie.metadata, speakerIdentityV1: bobId }
    }
  }, 9109).snapshot;
  assert.equal(getTextStructuredSegmentSpeakerId(explicitBob.segments.find(s => s.id === segA1Id)), bobId);
  assert.equal(explicitBob.segments.find(s => s.id === segA1Id)?.speaker, 'Bob');

  const textOnlyEdit = applyTextLibraryCommand(explicitBob, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: {
      id: segA1Id,
      text: 'Edited text only.'
    }
  }, 9110).snapshot;
  assert.equal(getTextStructuredSegmentSpeakerId(textOnlyEdit.segments.find(s => s.id === segA1Id)), bobId);
  assert.equal(textOnlyEdit.segments.find(s => s.id === segA1Id)?.speaker, 'Bob');

  const customZoe = applyTextLibraryCommand(textOnlyEdit, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
    payload: {
      documentId: docId,
      blockId: 'TEXT_000001',
      speaker: 'Zoe',
      text: 'Guest Zoe.',
      meaning: 'Tamu Zoe.',
      metadata: { speakerIdentityV1: 'SPK_CUSTOM_ZOE' }
    }
  }, 9111).snapshot;
  const zoeSeg = customZoe.segments[customZoe.segments.length - 1];
  assert.equal(getTextStructuredSegmentSpeakerId(zoeSeg), 'SPK_CUSTOM_ZOE');
  assert.equal(zoeSeg.speaker, 'Zoe');
  assert.equal(getTextStructuredSpeakerRegistry(customZoe.documents[0]).find(s => s.id === 'SPK_CUSTOM_ZOE')?.label, 'Zoe');
});

for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error?.stack || error}`);
  }
}

console.log(`\nP12-B Speaker Registry Audit Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
