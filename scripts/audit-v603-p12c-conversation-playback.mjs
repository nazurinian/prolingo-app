import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearAudioStagingRuntimeCacheForMode,
  getAudioStagingBlob,
  listAudioStagingMetadata
} from '../src/services/persistence/audioStagingIndexedDbService.js';
import { putTextAudioStagingBlob } from '../src/services/persistence/textAudioStagingService.js';
import {
  openTextLibraryDatabase,
  readTextLibrarySnapshot
} from '../src/services/persistence/textLibraryIndexedDbService.js';
import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES
} from '../src/constants/textDatabaseConstants.js';
import {
  planProLingoTextExternalInitialImport
} from '../src/domain/text/textExternalJsonDomain.js';
import {
  TEXT_LIBRARY_COMMAND_TYPES,
  applyTextLibraryCommand
} from '../src/domain/text/textLibraryCommandDomain.js';
import {
  normalizeTextLibraryRuntimeSnapshot,
  resolveTextLibraryDocumentTree
} from '../src/domain/text/textLibraryDomain.js';
import {
  buildTextStructuredAudioSyncProfileMetadata,
  getTextStructuredAudioSyncProfile
} from '../src/domain/text/textStructuredAudioSyncProfileDomain.js';
import {
  getTextStructuredSpeakerAssignedVoiceName
} from '../src/domain/text/textStructuredSpeakerVoiceProfileDomain.js';
import {
  collectTextStructuredConversationSpeakerIdentities,
  buildTextStructuredSpeakerVoiceProfileV2Metadata,
  buildTextStructuredUpsertSpeakerRegistryMetadata,
  getTextStructuredSpeakerRegistry,
  getTextStructuredSpeakerVoiceProfileV2
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import {
  TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY,
  buildTextStructuredVoiceOverrideMetadata,
  resolveTextStructuredBrowserVoiceResolution,
  resolveTextStructuredEffectiveVoiceProfile
} from '../src/domain/text/textStructuredVoiceAssignmentDomain.js';
import {
  buildTextStructuredPlaybackRateProfileMetadata,
  getTextStructuredPlaybackRateProfile,
  resolveTextStructuredEffectivePlaybackRate
} from '../src/domain/text/textStructuredPlaybackRateProfileDomain.js';
import {
  buildTextStructuredLocalAudioProfileMetadata,
  getTextStructuredLocalAudioProfile,
  resolveTextStructuredEffectiveCustomLocalVoice
} from '../src/domain/text/textStructuredLocalAudioProfileDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES,
  buildTextStructuredAudioDownloadProfileMetadata,
  resolveTextStructuredEffectiveDownloadVoice
} from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';
import {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES,
  TEXT_STRUCTURED_RESUME_MODES,
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  DEFAULT_TEXT_STRUCTURED_PREFERENCES,
  resolveTextStructuredPlaybackRate
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextNavigationTarget,
  resolveStructuredTextPlaybackList,
  resolveStructuredTextPlaybackOrder,
  resolveStructuredTextSmartNavPlan,
  resolveStructuredTextSmartNavigationContext
} from '../src/domain/text/textStructuredPlaybackDomain.js';
import { resolveActiveTextCardId } from '../src/domain/text/textStructuredCardExpansionDomain.js';
import {
  executePausePlayback,
  executeResumePlayback,
  executeSafePlayTransition,
  executeSettlePlaybackPromise,
  executeWaitWhilePaused
} from '../src/services/playback/playbackRuntimeControlService.js';
import {
  buildTextStructuredAudioPlaybackOrderMetadata,
  resolveTextStructuredEffectivePlaybackOrder,
  resolveTextStructuredEffectiveTtsOnly
} from '../src/domain/text/textStructuredAudioPlaybackOrderDomain.js';
import {
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES,
  buildTextStructuredBlockRuntimePlaybackPlan,
  buildTextStructuredSplitRuntimePlan
} from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import {
  TEXT_AUDIO_COVERAGE_STATUS,
  buildTextStructuredAudioCoverageMap,
  summarizeTextStructuredAudioCoverage
} from '../src/domain/text/textStructuredAudioCoverageDomain.js';
import {
  buildTextStructuredAudioContentFingerprint,
  normalizeTextStructuredSpeakerKey
} from '../src/domain/text/textStructuredAudioIdentityDomain.js';
import {
  buildTextStructuredAudioContentFingerprintV2,
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildTextStructuredRuntimeAudioKey,
  resolveTextStructuredRuntimeAudio
} from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  buildTextStructuredBulkGenerationPlan
} from '../src/domain/text/textStructuredBulkGenerationDomain.js';
import {
  buildTextStructuredBulkExportPlan
} from '../src/domain/text/textStructuredBulkExportDomain.js';
import {
  executeStructuredTextBatchConsolidatedZipExport,
  executeStructuredTextBatchReadyMp3Export,
  executeStructuredTextCardZipExport,
  executeStructuredTextFullCardAudioExport
} from '../src/services/audio/textStructuredCardExportService.js';
import { scanTextStructuredAudioZipFiles } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import {
  executeTextStructuredAudioZipImport
} from '../src/services/audio/textStructuredAudioZipImportService.js';
import { initialEdgeVoices } from '../src/constants/voiceConstants.js';
import { resolveDefaultIndonesianBrowserVoice } from '../src/domain/audio/browserTtsVoiceDecisionDomain.js';
import { buildTextStructuredFullRepresentation } from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import { parseProLingoTextAudioManifestJson, TEXT_AUDIO_MANIFEST_FILENAME } from '../src/domain/text/textAudioManifestDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = createRequire(import.meta.url);
const esbuild = load('esbuild');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');
const fixtureP12 = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/p12a/P12_Conversation_Only_Additional_Test_v1.json'), 'utf8'));

const results = [];
const runCheck = async (group, id, title, fn) => {
  try {
    await fn();
    results.push({ group, id, title, ok: true });
    console.log(`PASS [${group}][${id}] ${title}`);
  } catch (error) {
    results.push({ group, id, title, ok: false, error: error?.stack || error?.message || String(error) });
    console.error(`FAIL [${group}][${id}] ${title}\n   -> ${error?.message || error}`);
  }
};

// ============================================================================
// React UI & Component Module Loader + Helpers
// ============================================================================
const createReactHarness = () => {
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
    memo: fn => fn
  };
  const fakeIcons = new Proxy({}, {
    get: (_, key) => (typeof key === 'string' ? function Icon() { return null; } : null)
  });
  const cache = new Map();
  const loadModule = relPath => {
    const resolvedAbs = path.resolve(root, relPath);
    if (cache.has(resolvedAbs)) return cache.get(resolvedAbs).exports;
    const source = fs.readFileSync(resolvedAbs, 'utf8');
    const mod = { exports: {} };
    cache.set(resolvedAbs, mod);
    const req = specifier => {
      if (specifier === 'react') return { ...mockReact, default: mockReact, __esModule: true };
      if (specifier === 'lucide-react') return fakeIcons;
      if (specifier === 'react-dom') return { createPortal: children => children };
      if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency: ${specifier}`);
      const candidateBase = path.resolve(path.dirname(resolvedAbs), specifier);
      for (const candidate of [candidateBase, `${candidateBase}.jsx`, `${candidateBase}.js`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadModule(path.relative(root, candidate));
        }
      }
      throw new Error(`Missing module ${specifier} from ${resolvedAbs}`);
    };
    const transformed = esbuild.transformSync(source, {
      loader: resolvedAbs.endsWith('.jsx') ? 'jsx' : 'js',
      format: 'cjs',
      target: 'es2022',
      jsx: 'transform'
    }).code;
    new Function('require', 'module', 'exports', transformed)(req, mod, mod.exports);
    return mod.exports;
  };
  const collectNodes = (node, out = []) => {
    if (node == null || typeof node === 'boolean') return out;
    if (Array.isArray(node)) {
      node.forEach(item => collectNodes(item, out));
      return out;
    }
    if (typeof node === 'object') {
      if (typeof node.type === 'function') {
        try {
          collectNodes(node.type(node.props || {}), out);
        } catch {
          out.push(node);
        }
      } else {
        out.push(node);
      }
      collectNodes(node.props?.children, out);
    }
    return out;
  };
  const collectText = node => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(collectText).join(' ');
    if (typeof node === 'object') {
      if (typeof node.type === 'function') {
        try {
          return collectText(node.type(node.props || {}));
        } catch {
          return '';
        }
      }
      return collectText(node.props?.children);
    }
    return '';
  };
  return { resetHooks, loadModule, collectNodes, collectText };
};

// ============================================================================
// Live App.jsx Resolver Harness (runs actual App.jsx resolver source code)
// ============================================================================
const createAppVoiceRateHarness = ({
  activeTextDocumentTree,
  structuredTextAudioSyncProfile = getTextStructuredAudioSyncProfile(activeTextDocumentTree),
  structuredTextConversationSpeakers = collectTextStructuredConversationSpeakerIdentities(activeTextDocumentTree),
  voices = [],
  indonesianVoices = [],
  selectedTextBrowserVoice = null,
  selectedTextIndonesianVoice = null,
  textStructuredPreferences = {}
} = {}) => {
  const appSource = read('src/App.jsx');
  const voiceStart = appSource.indexOf('const resolveStructuredTextChannelVoiceState =');
  const endMarker = 'textStructuredPreferences]);';
  const endMarkerAt = appSource.indexOf(endMarker, voiceStart);
  const voiceEnd = endMarkerAt > voiceStart ? endMarkerAt + endMarker.length : -1;
  assert.ok(voiceStart > 0 && voiceEnd > voiceStart, 'App.jsx channel voice & rate resolver slice missing');
  const slice = appSource.slice(voiceStart, voiceEnd);
  const transformed = esbuild.transformSync(slice, { loader: 'js', format: 'cjs', target: 'es2022' }).code;
  const wrapped = `
    const useCallback = fn => fn;
    const useMemo = fn => fn();
    ${transformed}
    return { resolveStructuredTextChannelVoiceState, resolveStructuredTextItemPlaybackRate };
  `;
  const factory = new Function(
    'activeTextDocumentTree',
    'structuredTextAudioSyncProfile',
    'structuredTextConversationSpeakers',
    'voices',
    'indonesianVoices',
    'selectedTextBrowserVoice',
    'selectedTextIndonesianVoice',
    'textStructuredPreferences',
    'resolveDefaultIndonesianBrowserVoice',
    'getTextStructuredSpeakerAssignedVoiceName',
    'resolveTextStructuredBrowserVoiceResolution',
    'resolveTextStructuredEffectiveVoiceProfile',
    'getTextStructuredPlaybackRateProfile',
    'resolveTextStructuredEffectivePlaybackRate',
    'resolveTextStructuredPlaybackRate',
    'DEFAULT_TEXT_STRUCTURED_PREFERENCES',
    'TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES',
    wrapped
  );
  return factory(
    activeTextDocumentTree,
    structuredTextAudioSyncProfile,
    structuredTextConversationSpeakers,
    voices,
    indonesianVoices,
    selectedTextBrowserVoice,
    selectedTextIndonesianVoice,
    textStructuredPreferences,
    resolveDefaultIndonesianBrowserVoice,
    getTextStructuredSpeakerAssignedVoiceName,
    resolveTextStructuredBrowserVoiceResolution,
    resolveTextStructuredEffectiveVoiceProfile,
    getTextStructuredPlaybackRateProfile,
    resolveTextStructuredEffectivePlaybackRate,
    resolveTextStructuredPlaybackRate,
    DEFAULT_TEXT_STRUCTURED_PREFERENCES,
    TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES
  );
};

// ============================================================================
// Memory IndexedDB + Download Mock (adapted cleanly for Conversation C3 tests)
// ============================================================================
const createMemoryIndexedDb = () => {
  const dbs = new Map();
  const extractKeyValue = (row, keyPath) => (Array.isArray(keyPath) ? keyPath.map(part => row?.[part]) : row?.[keyPath]);
  const keyMatches = (actual, target) => (
    Array.isArray(target) && Array.isArray(actual)
      ? target.length === actual.length && target.every((v, i) => v === actual[i])
      : actual === target
  );
  const makeRequest = (executor, txState = null) => {
    const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    if (txState) {
      txState.pending += 1;
      if (txState.commitTimer) {
        clearTimeout(txState.commitTimer);
        txState.commitTimer = null;
      }
    }
    queueMicrotask(() => {
      try {
        req.result = executor(req);
        req.onsuccess?.({ target: req });
      } catch (error) {
        req.error = error;
        req.onerror?.({ target: req });
        if (txState && !txState.finished) {
          txState.finished = true;
          txState.error = error;
          txState.onabort?.({ target: txState });
        }
      } finally {
        if (txState && !txState.finished) {
          txState.pending -= 1;
          if (txState.pending <= 0) {
            txState.commitTimer = setTimeout(() => {
              if (!txState.finished) {
                txState.finished = true;
                txState.oncomplete?.({ target: txState });
              }
            }, 0);
          }
        }
      }
    });
    return req;
  };
  return {
    open(name, version = 1) {
      let db = dbs.get(name);
      const isNew = !db || db.version < version;
      if (!db) {
        db = { name, version, stores: new Map(), close() {} };
        dbs.set(name, db);
      }
      db.objectStoreNames = { contains: storeName => db.stores.has(storeName) };
      db.createObjectStore = (storeName, { keyPath = 'id' } = {}) => {
        const store = { name: storeName, keyPath, rows: new Map(), indexes: new Map(), createIndex(idxName, idxKeyPath) { this.indexes.set(idxName, { keyPath: idxKeyPath }); } };
        db.stores.set(storeName, store);
        return store;
      };
      db.transaction = (storeNames) => {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const txState = { pending: 0, finished: false, error: null, commitTimer: null, oncomplete: null, onerror: null, onabort: null };
        txState.objectStore = storeName => {
          assert.ok(names.includes(storeName));
          const store = db.stores.get(storeName);
          const wrapIndex = idx => ({
            getAll: key => makeRequest(() => [...store.rows.values()].filter(row => keyMatches(extractKeyValue(row, idx.keyPath), key)), txState),
            getAllKeys: key => makeRequest(() => [...store.rows.entries()].filter(([, row]) => keyMatches(extractKeyValue(row, idx.keyPath), key)).map(([k]) => k), txState)
          });
          return {
            index: idxName => wrapIndex(store.indexes.get(idxName)),
            get: key => makeRequest(() => store.rows.get(key), txState),
            getAll: () => makeRequest(() => [...store.rows.values()], txState),
            put: row => makeRequest(() => {
              const key = row?.[store.keyPath];
              store.rows.set(key, row);
              return key;
            }, txState),
            delete: key => makeRequest(() => { store.rows.delete(key); }, txState),
            clear: () => makeRequest(() => { store.rows.clear(); }, txState)
          };
        };
        return txState;
      };
      const openReq = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        if (isNew) {
          db.version = version;
          openReq.onupgradeneeded?.({ target: openReq });
        }
        openReq.onsuccess?.({ target: openReq });
      });
      return openReq;
    }
  };
};

const writeTextLibrarySnapshot = async snapshot => {
  const db = await openTextLibraryDatabase();
  try {
    const tx = db.transaction([
      TEXT_LIBRARY_STORES.META,
      TEXT_LIBRARY_STORES.COLLECTIONS,
      TEXT_LIBRARY_STORES.DOCUMENTS,
      TEXT_LIBRARY_STORES.BLOCKS,
      TEXT_LIBRARY_STORES.SEGMENTS,
      TEXT_LIBRARY_STORES.AUDIO_VARIANTS
    ], 'readwrite');
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('writeTextLibrarySnapshot tx error'));
      tx.onabort = () => reject(tx.error || new Error('writeTextLibrarySnapshot tx aborted'));
    });
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: TEXT_LIBRARY_SCHEMA_VERSION, updatedAt: 1 });
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.INITIALIZED, value: true, updatedAt: 1 });
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: snapshot?.activeDocumentId || snapshot?.documents?.[0]?.id || null, updatedAt: 1 });
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: snapshot?.counters || {}, updatedAt: 1 });
    (snapshot?.collections || []).forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).put(item));
    (snapshot?.documents || []).forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).put(item));
    (snapshot?.blocks || []).forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).put(item));
    (snapshot?.segments || []).forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).put(item));
    (snapshot?.audioVariants || []).forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).put(item));
    await done;
  } finally {
    db.close?.();
  }
};

// ============================================================================
// Fixture Builders
// ============================================================================
const emptySnapshot = () => normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: 1,
  initialized: true,
  activeDocumentId: null,
  counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
  collections: [],
  documents: [],
  blocks: [],
  segments: [],
  audioVariants: []
});

const buildP12ConversationState = () => {
  const init = planProLingoTextExternalInitialImport({
    localSnapshot: emptySnapshot(),
    package: fixtureP12,
    fileName: 'P12_Conversation_Only_Additional_Test_v1.json',
    now: 1000
  });
  const docId = init.importRecord.documentId;
  const documentTree = resolveTextLibraryDocumentTree(init.snapshot, docId);
  return { snapshot: init.snapshot, docId, documentTree };
};

const buildNative3SpeakerConversationState = () => {
  let state = emptySnapshot();
  const docRes = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_DOCUMENT,
    payload: { title: 'Native 3-Speaker Demo', documentType: 'conversation', textLanguage: 'en', meaningLanguage: 'id' }
  }, 2000);
  state = docRes.snapshot;
  const docId = docRes.result.id;
  for (const label of ['Host', 'Guest A', 'Guest B']) {
    const regMeta = buildTextStructuredUpsertSpeakerRegistryMetadata({
      metadata: state.documents.find(d => d.id === docId).metadata,
      documentId: docId,
      label
    });
    state = applyTextLibraryCommand(state, {
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: docId, metadata: regMeta }
    }, 2010).snapshot;
  }
  const c1 = applyTextLibraryCommand(state, {
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
    payload: { documentId: docId, blockType: 'conversation', title: 'Panel Intro' }
  }, 2020);
  state = c1.snapshot;
  const lines = [
    ['Host', 'Welcome everyone to our roundtable.', 'Selamat datang di diskusi kita.'],
    ['Guest A', 'Thanks for having us today.', 'Terima kasih telah mengundang kami.'],
    ['Guest B', 'Glad to join the conversation.', 'Senang bisa ikut berdiskusi.']
  ];
  for (const [speaker, text, meaning] of lines) {
    state = applyTextLibraryCommand(state, {
      type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
      payload: { blockId: c1.result.id, speaker, text, meaning }
    }, 2030).snapshot;
  }
  return { snapshot: state, docId, documentTree: resolveTextLibraryDocumentTree(state, docId) };
};

const withDocMeta = (tree, metadata) => ({
  ...tree,
  metadata,
  blocks: (tree.blocks || []).map(b => ({ ...b }))
});

const findSpeakerSegment = (block, speakerIdentity) => (block?.segments || []).find(
  s => s?.metadata?.speakerIdentityV1?.speakerId === speakerIdentity?.id
    || normalizeTextStructuredSpeakerKey(s?.speaker) === normalizeTextStructuredSpeakerKey(speakerIdentity?.label)
) || null;

// ============================================================================
// PART C1 — Conversation Effective Voice / Rate, Sync, CUSTOM_LOCAL & FOLLOW_PLAYER
// ============================================================================
await runCheck('C1', 'C1.1', 'Sync ON/OFF is non-destructive and EN/ID Voice & Rate channels remain strictly independent across P12 & native 3-speaker docs', () => {
  for (const tree of [buildP12ConversationState().documentTree, buildNative3SpeakerConversationState().documentTree]) {
    const speakers = collectTextStructuredConversationSpeakerIdentities(tree);
    assert.equal(speakers.length, 3);
    const [sp1, sp2, sp3] = speakers;

    let docMeta = { ...(tree.metadata || {}) };
    docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, channel: 'text', speakerId: sp1.id, speaker: sp1.label, voiceName: 'Microsoft Sonia' });
    docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, channel: 'text', speakerId: sp2.id, speaker: sp2.label, voiceName: 'Microsoft Ryan' });
    docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, channel: 'text', speakerId: sp3.id, speaker: sp3.label, voiceName: 'Microsoft Libby' });
    docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, channel: 'meaning', speakerId: sp1.id, speaker: sp1.label, voiceName: 'Microsoft Gadis' });
    docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, channel: 'meaning', speakerId: sp2.id, speaker: sp2.label, voiceName: 'Microsoft Ardi' });

    docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'text', speakerId: sp1.id, speaker: sp1.label, rate: 0.8 });
    docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'text', speakerId: sp2.id, speaker: sp2.label, rate: 1.2 });
    docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'meaning', speakerId: sp1.id, speaker: sp1.label, rate: 0.9 });
    docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'meaning', speakerId: sp2.id, speaker: sp2.label, rate: 1.4 });

    // Turn EN Voice Sync ON + ID Rate Sync ON (opposite channels!)
    docMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'voice', channel: 'text', enabled: true });
    docMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'rate', channel: 'meaning', enabled: true });

    const syncedTree = withDocMeta(tree, docMeta);
  const block1 = syncedTree.blocks[0];
    const seg2 = (block1.segments || []).find(s => s?.metadata?.speakerIdentityV1?.speakerId === sp2.id || normalizeTextStructuredSpeakerKey(s.speaker) === normalizeTextStructuredSpeakerKey(sp2.label)) || block1.segments[1];
    assert.ok(seg2);

    const browserPoolEn = ['Microsoft Sonia', 'Microsoft Ryan', 'Microsoft Libby'];
    const browserPoolId = ['Microsoft Gadis', 'Microsoft Ardi'];
    const hSynced = createAppVoiceRateHarness({
      activeTextDocumentTree: syncedTree,
      voices: browserPoolEn.map(name => ({ name, lang: 'en-GB' })),
      indonesianVoices: browserPoolId.map(name => ({ name, lang: 'id-ID' })),
      textStructuredPreferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, browserTextVoiceName: 'Microsoft Sonia', browserMeaningVoiceName: 'Microsoft Gadis', playbackRate: 1 }
    });

    // EN Voice Sync ON -> Seg 2 uses Sp1 EN voice; ID Voice Sync OFF -> Seg 2 keeps Sp2 ID voice
    const seg2Item = { blockId: block1.id, blockType: block1.blockType, id: seg2.id, segmentId: seg2.id, speaker: seg2.speaker, metadata: seg2.metadata };
    const enState = hSynced.resolveStructuredTextChannelVoiceState(seg2Item, 'text', { block: block1, segment: seg2 });
    const idState = hSynced.resolveStructuredTextChannelVoiceState(seg2Item, 'meaning', { block: block1, segment: seg2 });
    assert.equal(enState.effectiveVoiceName, 'Microsoft Sonia');
    assert.equal(enState.syncedToFirstSpeaker, true);
    assert.equal(idState.effectiveVoiceName, 'Microsoft Ardi');
    assert.equal(idState.syncedToFirstSpeaker, false);

    // EN Rate Sync OFF -> Seg 2 keeps 1.2; ID Rate Sync ON -> Seg 2 uses Sp1 ID rate 0.9
    const enRate = hSynced.resolveStructuredTextItemPlaybackRate(seg2Item, 'text');
    const idRate = hSynced.resolveStructuredTextItemPlaybackRate(seg2Item, 'meaning');
    assert.equal(enRate, 1.2);
    assert.equal(idRate, 0.9);

    // Toggle both Sync flags OFF -> exact saved overrides are intact & restored without touching speaker metadata
    let restoredMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'voice', channel: 'text', enabled: false });
    restoredMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: restoredMeta, kind: 'rate', channel: 'meaning', enabled: false });
    const restoredTree = withDocMeta(tree, restoredMeta);
    const v2Profile = getTextStructuredSpeakerVoiceProfileV2(restoredTree);
    assert.equal(v2Profile.text[sp2.id], 'Microsoft Ryan');
    assert.equal(v2Profile.text[sp3.id], 'Microsoft Libby');
    assert.equal(v2Profile.meaning[sp2.id], 'Microsoft Ardi');
    assert.equal(getTextStructuredPlaybackRateProfile(restoredTree).speakerIds.text[sp2.id], 1.2);

    const hRestored = createAppVoiceRateHarness({
      activeTextDocumentTree: restoredTree,
      voices: browserPoolEn.map(name => ({ name, lang: 'en-GB' })),
      indonesianVoices: browserPoolId.map(name => ({ name, lang: 'id-ID' })),
      textStructuredPreferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, browserTextVoiceName: 'Microsoft Sonia', browserMeaningVoiceName: 'Microsoft Gadis', playbackRate: 1 }
    });
    assert.equal(hRestored.resolveStructuredTextChannelVoiceState(seg2Item, 'text', { block: block1, segment: seg2 }).effectiveVoiceName, 'Microsoft Ryan');
    assert.equal(hRestored.resolveStructuredTextItemPlaybackRate(seg2Item, 'meaning'), 1.4);
  }
});

await runCheck('C1', 'C1.2-DEFECT', 'Voice Sync & Rate Sync follow Speaker 1 effective Workspace/Global/Card-1 voice/rate even when Speaker 1 has NO explicit speaker entry while Followers have overrides', () => {
  const base = buildP12ConversationState().documentTree;
  const [amelia, ben] = collectTextStructuredConversationSpeakerIdentities(base);

  // Case A: Amelia has NO explicit speaker override; Workspace Narrator = Microsoft George; Ben has Card-Speaker override = Microsoft Ryan
  let docMeta = buildTextStructuredVoiceOverrideMetadata({ metadata: base.metadata, scope: 'document', channel: 'text', voiceName: 'Microsoft George' });
  docMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'voice', channel: 'text', enabled: true });
  docMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'rate', channel: 'text', enabled: true });
  // Ben also has a Doc-Speaker rate 1.35 while Amelia has NO explicit speaker rate and Workspace rate = 0.8
  docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'text', voiceName: undefined });
  docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'text', rate: 0.8 });
  docMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMeta, scope: 'document', channel: 'text', speakerId: ben.id, speaker: ben.label, rate: 1.35 });

  const treeA = withDocMeta(base, docMeta);
  const block1 = {
    ...treeA.blocks[0],
    metadata: buildTextStructuredVoiceOverrideMetadata({
      metadata: treeA.blocks[0].metadata,
      scope: 'card',
      channel: 'text',
      speakerId: ben.id,
      speaker: ben.label,
      voiceName: 'Microsoft Ryan'
    })
  };
  treeA.blocks[0] = block1;
  const segBen = block1.segments.find(s => s.speaker === ben.label || s?.metadata?.speakerIdentityV1?.speakerId === ben.id);
  assert.ok(segBen);

  const poolEn = ['Microsoft George', 'Microsoft Ryan', 'Microsoft Sonia', 'Microsoft Libby'].map(name => ({ name, lang: 'en-GB' }));
  const hA = createAppVoiceRateHarness({
    activeTextDocumentTree: treeA,
    voices: poolEn,
    textStructuredPreferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, browserTextVoiceName: 'Microsoft Sonia', playbackRate: 1 }
  });

  const segBenItemA = { blockId: block1.id, blockType: block1.blockType, id: segBen.id, segmentId: segBen.id, speaker: segBen.speaker, metadata: segBen.metadata };
  const benVoiceA = hA.resolveStructuredTextChannelVoiceState(segBenItemA, 'text', { block: block1, segment: segBen });
  assert.equal(benVoiceA.effectiveVoiceName, 'Microsoft George', `Sync ON must follow Amelia's Workspace Narrator voice (Microsoft George), not Follower Ben's card override (${benVoiceA.effectiveVoiceName})`);
  assert.equal(benVoiceA.effectiveSource, 'sync-speaker-1');

  const benRateA = hA.resolveStructuredTextItemPlaybackRate(segBenItemA, 'text');
  assert.equal(benRateA, 0.8, `Rate Sync ON must follow Amelia's Workspace rate (0.8), not Follower Ben's speaker rate (${benRateA})`);

  // Case B: Neither Amelia nor Workspace Narrator is set -> inherits Global Browser TTS & Global Rate, while Ben has Card override
  let docMetaB = buildTextStructuredAudioSyncProfileMetadata({ metadata: base.metadata, kind: 'voice', channel: 'text', enabled: true });
  docMetaB = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMetaB, kind: 'rate', channel: 'text', enabled: true });
  docMetaB = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMetaB, channel: 'text', speakerId: ben.id, speaker: ben.label, voiceName: 'Microsoft Ryan' });
  docMetaB = buildTextStructuredPlaybackRateProfileMetadata({ metadata: docMetaB, scope: 'document', channel: 'text', speakerId: ben.id, speaker: ben.label, rate: 1.4 });
  const treeB = withDocMeta(base, docMetaB);
  const segBenB = findSpeakerSegment(treeB.blocks[0], ben);
  const segBenItemB = { blockId: treeB.blocks[0].id, blockType: treeB.blocks[0].blockType, id: segBenB.id, segmentId: segBenB.id, speaker: segBenB.speaker, metadata: segBenB.metadata };
  const hB = createAppVoiceRateHarness({
    activeTextDocumentTree: treeB,
    voices: poolEn,
    textStructuredPreferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, browserTextVoiceName: 'Microsoft Sonia', browserTextRate: 0.9, playbackRate: 1 }
  });
  const benVoiceB = hB.resolveStructuredTextChannelVoiceState(segBenItemB, 'text', { block: treeB.blocks[0], segment: segBenB });
  assert.equal(benVoiceB.effectiveVoiceName, 'Microsoft Sonia', `Sync ON must follow Amelia's Global fallback (Microsoft Sonia), not Follower Ben's override (${benVoiceB.effectiveVoiceName})`);
  const benRateB = hB.resolveStructuredTextItemPlaybackRate(segBenItemB, 'text');
  assert.equal(benRateB, 0.9, `Rate Sync ON must follow Amelia's Global EN rate (0.9), not Follower Ben's rate (${benRateB})`);

  // Case C: Card-1 Speaker-1 voice unavailable in browser + Card-1 Speaker-1 rate 1.7 while Ben has available override in poolEn -> fallback walks Speaker 1 chain (Workspace George), never Follower Ben
  let docMetaC = buildTextStructuredVoiceOverrideMetadata({ metadata: base.metadata, scope: 'document', channel: 'text', voiceName: 'Microsoft George' });
  docMetaC = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMetaC, kind: 'voice', channel: 'text', enabled: true });
  docMetaC = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMetaC, kind: 'rate', channel: 'text', enabled: true });
  const treeC = withDocMeta(base, docMetaC);
  let blkC = {
    ...treeC.blocks[0],
    metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: treeC.blocks[0].metadata, scope: 'card', channel: 'text', speakerId: amelia.id, speaker: amelia.label, voiceName: 'Microsoft Missing' })
  };
  blkC = {
    ...blkC,
    metadata: buildTextStructuredVoiceOverrideMetadata({ metadata: blkC.metadata, scope: 'card', channel: 'text', speakerId: ben.id, speaker: ben.label, voiceName: 'Microsoft Ryan' })
  };
  blkC = {
    ...blkC,
    metadata: buildTextStructuredPlaybackRateProfileMetadata({ metadata: blkC.metadata, scope: 'card', channel: 'text', speakerId: amelia.id, speaker: amelia.label, rate: 1.7 })
  };
  blkC = {
    ...blkC,
    metadata: buildTextStructuredPlaybackRateProfileMetadata({ metadata: blkC.metadata, scope: 'card', channel: 'text', speakerId: ben.id, speaker: ben.label, rate: 1.2 })
  };
  treeC.blocks[0] = blkC;
  const segBenC = findSpeakerSegment(blkC, ben);
  const segBenItemC = { blockId: blkC.id, blockType: blkC.blockType, id: segBenC.id, segmentId: segBenC.id, speaker: segBenC.speaker, metadata: segBenC.metadata };
  const hC = createAppVoiceRateHarness({
    activeTextDocumentTree: treeC,
    voices: poolEn,
    textStructuredPreferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, browserTextVoiceName: 'Microsoft Sonia', playbackRate: 1 }
  });
  const benVoiceC = hC.resolveStructuredTextChannelVoiceState(segBenItemC, 'text', { block: blkC, segment: segBenC });
  assert.equal(benVoiceC.fallbackUsed, true);
  assert.equal(benVoiceC.effectiveVoiceName, 'Microsoft George', `Unavailable Speaker 1 voice under Sync must fall back down Speaker 1 chain to Workspace George, never Follower Ben (${benVoiceC.effectiveVoiceName})`);
  assert.equal(hC.resolveStructuredTextItemPlaybackRate(segBenItemC, 'text'), 1.7, 'Rate Sync ON must honor Card-1 Speaker-1 rate 1.7');
});

await runCheck('C1', 'C1.3-DEFECT', 'Edge Download FOLLOW_PLAYER under Conversation Sync follows Speaker 1 effective voice (Card-1 -> Workspace -> Global) and never leaks Follower voice when defaultPlaybackVoiceName is omitted', () => {
  const base = buildP12ConversationState().documentTree;
  const [amelia, ben] = collectTextStructuredConversationSpeakerIdentities(base);

  // 1) Sync OFF: per-speaker Browser TTS maps independently
  let metaOff = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: base.metadata, channel: 'text', speakerId: amelia.id, speaker: amelia.label, voiceName: 'Microsoft Sonia Online (Natural)' });
  metaOff = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: metaOff, channel: 'text', speakerId: ben.id, speaker: ben.label, voiceName: 'Microsoft Ryan Online (Natural)' });
  metaOff = buildTextStructuredAudioDownloadProfileMetadata({ metadata: metaOff, scope: 'document', channel: 'text', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER });
  const treeOff = withDocMeta(base, metaOff);
  const block1Off = treeOff.blocks[0];
  const segAmelia = findSpeakerSegment(block1Off, amelia);
  const segBen = findSpeakerSegment(block1Off, ben);
  assert.equal(resolveTextStructuredEffectiveDownloadVoice({ documentTree: treeOff, block: block1Off, segment: segAmelia, channel: 'text', preferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', playbackTextVoiceName: 'Microsoft Sonia Online (Natural)' } }).voiceId, 'en-GB-SoniaNeural');
  assert.equal(resolveTextStructuredEffectiveDownloadVoice({ documentTree: treeOff, block: block1Off, segment: segBen, channel: 'text', preferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', playbackTextVoiceName: 'Microsoft Sonia Online (Natural)' } }).voiceId, 'en-GB-RyanNeural');

  // 2) Sync ON where Amelia has NO speaker voice entry -> Workspace Narrator = Microsoft Thomas Online (Natural) (en-GB-ThomasNeural), Global = Microsoft Sonia Online (Natural), Follower Ben = Microsoft Libby Online (Natural)
  let metaSync = buildTextStructuredVoiceOverrideMetadata({ metadata: base.metadata, scope: 'document', channel: 'text', voiceName: 'Microsoft Thomas Online (Natural)' });
  metaSync = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: metaSync, channel: 'text', speakerId: ben.id, speaker: ben.label, voiceName: 'Microsoft Libby Online (Natural)' });
  metaSync = buildTextStructuredAudioDownloadProfileMetadata({ metadata: metaSync, scope: 'document', channel: 'text', mode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER });
  metaSync = buildTextStructuredAudioSyncProfileMetadata({ metadata: metaSync, kind: 'voice', channel: 'text', enabled: true });
  const treeSync = withDocMeta(base, metaSync);
  const block1Sync = treeSync.blocks[0];
  const segBenSync = findSpeakerSegment(block1Sync, ben);

  const followWithGlobalPref = resolveTextStructuredEffectiveDownloadVoice({
    documentTree: treeSync,
    block: block1Sync,
    segment: segBenSync,
    channel: 'text',
    preferences: { edgeTextVoiceId: 'en-GB-MaisieNeural', playbackTextVoiceName: 'Microsoft Sonia Online (Natural)' }
  });
  assert.equal(followWithGlobalPref.voiceId, 'en-GB-ThomasNeural', `FOLLOW_PLAYER under Sync must respect Amelia's Workspace Narrator Microsoft Thomas -> en-GB-ThomasNeural, got ${followWithGlobalPref.voiceId} (${followWithGlobalPref.playbackVoiceName})`);

  // Same call signature as TextStructuredCardAudioPanel.jsx (no playbackTextVoiceName in preferences): must NEVER leak Follower Ben's Microsoft Libby!
  const followNoDefault = resolveTextStructuredEffectiveDownloadVoice({
    documentTree: treeSync,
    block: block1Sync,
    segment: segBenSync,
    channel: 'text',
    preferences: { edgeTextVoiceId: 'en-GB-MaisieNeural' }
  });
  assert.equal(followNoDefault.voiceId, 'en-GB-ThomasNeural', `FOLLOW_PLAYER under Sync without defaultPlaybackVoiceName leaked Ben's voice (${followNoDefault.voiceId} / ${followNoDefault.playbackVoiceName})`);
});

await runCheck('C1', 'C1.4-DEFECT', 'CUSTOM_LOCAL honors Card/Doc Speaker hierarchy, EN/ID independence, and Sync ON/OFF even when Speaker 1 inherits Workspace/Global Local Voice', () => {
  const base = buildP12ConversationState().documentTree;
  const [amelia, ben] = collectTextStructuredConversationSpeakerIdentities(base);

  // Case A: Explicit Speaker 1 local pin vs Ben local pin -> Sync EN ON/OFF
  let meta = buildTextStructuredLocalAudioProfileMetadata({ metadata: base.metadata, scope: 'document', channel: 'text', speakerId: amelia.id, speaker: amelia.label, voiceId: 'en-GB-SoniaNeural' });
  meta = buildTextStructuredLocalAudioProfileMetadata({ metadata: meta, scope: 'document', channel: 'text', speakerId: ben.id, speaker: ben.label, voiceId: 'en-US-GuyNeural' });
  meta = buildTextStructuredLocalAudioProfileMetadata({ metadata: meta, scope: 'document', channel: 'meaning', speakerId: amelia.id, speaker: amelia.label, voiceId: 'id-ID-GadisNeural' });
  meta = buildTextStructuredLocalAudioProfileMetadata({ metadata: meta, scope: 'document', channel: 'meaning', speakerId: ben.id, speaker: ben.label, voiceId: 'id-ID-ArdiNeural' });
  meta = buildTextStructuredAudioSyncProfileMetadata({ metadata: meta, kind: 'voice', channel: 'text', enabled: true });

  const tree1 = withDocMeta(base, meta);
  const segBen1 = findSpeakerSegment(tree1.blocks[0], ben);
  const enLocalSynced = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: tree1, block: tree1.blocks[0], segment: segBen1, channel: 'text' });
  const idLocalUnsynced = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: tree1, block: tree1.blocks[0], segment: segBen1, channel: 'meaning' });
  assert.equal(enLocalSynced, 'en-GB-SoniaNeural');
  assert.equal(idLocalUnsynced, 'id-ID-ArdiNeural');

  // Case B: Speaker 1 has NO explicit speaker local pin -> inherits Workspace Local 'en-GB-RyanNeural', while Follower Ben has explicit pin 'en-US-GuyNeural'
  let meta2 = buildTextStructuredLocalAudioProfileMetadata({ metadata: base.metadata, channel: 'text', voiceId: 'en-GB-RyanNeural' });
  meta2 = buildTextStructuredLocalAudioProfileMetadata({ metadata: meta2, channel: 'text', speakerId: ben.id, speaker: ben.label, voiceId: 'en-US-GuyNeural' });
  meta2 = buildTextStructuredAudioSyncProfileMetadata({ metadata: meta2, kind: 'voice', channel: 'text', enabled: true });
  const tree2 = withDocMeta(base, meta2);
  const segBen2 = findSpeakerSegment(tree2.blocks[0], ben);
  const enLocalInherit = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: tree2, block: tree2.blocks[0], segment: segBen2, channel: 'text' });
  assert.equal(enLocalInherit, 'en-GB-RyanNeural', `CUSTOM_LOCAL Sync ON must resolve Speaker 1 Workspace local voice (en-GB-RyanNeural), not Ben's pin (${enLocalInherit})`);

  // Case C: Speaker 1 has Card-1 local pin 'en-GB-MaisieNeural' -> Sync ON on Card 1 uses Card-1 Speaker 1 pin over Workspace 'en-GB-RyanNeural'
  const card1PinnedMeta = buildTextStructuredLocalAudioProfileMetadata({
    metadata: tree2.blocks[0].metadata,
    channel: 'text',
    speakerId: amelia.id,
    speaker: amelia.label,
    voiceId: 'en-GB-MaisieNeural'
  });
  const card1Pinned = { ...tree2.blocks[0], metadata: card1PinnedMeta };
  const enLocalCard1Pin = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: tree2, block: card1Pinned, segment: segBen2, channel: 'text' });
  assert.equal(enLocalCard1Pin, 'en-GB-MaisieNeural', `CUSTOM_LOCAL Sync ON must honor Speaker 1 Card-1 local pin ('en-GB-MaisieNeural'), got ${enLocalCard1Pin}`);
});

await runCheck('C1', 'C1.5-DEFECT', 'UI Sync Parity: TextStructuredPlayer speaker voice pill reflects Sync ON and TextStructuredAudioControls reflects Sync Rate vs Sync Voice independently', () => {
  const h = createReactHarness();
  const { TextStructuredPlayer } = h.loadModule('src/components/text/TextStructuredPlayer.jsx');
  const TextStructuredAudioControls = h.loadModule('src/components/text/TextStructuredAudioControls.jsx').default;

  const base = buildP12ConversationState().documentTree;
  const [amelia, ben] = collectTextStructuredConversationSpeakerIdentities(base);

  let docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: base.metadata, channel: 'text', speakerId: amelia.id, speaker: amelia.label, voiceName: 'Microsoft Sonia' });
  docMeta = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata: docMeta, channel: 'text', speakerId: ben.id, speaker: ben.label, voiceName: 'Microsoft Ryan' });
  docMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: docMeta, kind: 'voice', channel: 'text', enabled: true });
  // Intentionally set sync.rate.text = FALSE while sync.voice.text = TRUE (and another doc with ONLY sync.rate.text = TRUE)
  const syncedVoiceTree = withDocMeta(base, docMeta);

  h.resetHooks();
  const playerTree = TextStructuredPlayer({
    documentTree: syncedVoiceTree,
    isPlaying: false,
    isPaused: false,
    speakingPart: null,
    playingContext: null,
    playingScope: null,
    playingIndex: null,
    displayMode: 'both',
    playbackChannelMode: 'text-only',
    playbackRepresentationMode: 'split',
    playbackPreferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES, cardExpansionMode: 'all' },
    defaultTextVoiceName: 'Microsoft Sonia',
    defaultMeaningVoiceName: 'Microsoft Gadis',
    audioRuntimeStatusMap: {},
    audioCoverageMap: {},
    englishVoices: [{ name: 'Microsoft Sonia', lang: 'en-GB' }, { name: 'Microsoft Ryan', lang: 'en-GB' }],
    indonesianVoices: []
  });
  const benBadges = h.collectNodes(playerTree).filter(n => n?.props?.['data-text-speaker-voice'] === ben.label);
  assert.ok(benBadges.length > 0, 'Expected expanded Card 1 segment badge for Ben');
  const benBadgeText = h.collectText(benBadges[0]);
  assert.ok(!/Ryan/i.test(benBadgeText) && /Sonia/i.test(benBadgeText), `Expected Ben badge under EN Sync ON to display Speaker 1's voice (Sonia), got "${benBadgeText}"`);

  // Check TextStructuredAudioControls when ONLY Rate Sync EN = true and Voice Sync EN = false
  let rateOnlyMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: base.metadata, scope: 'document', channel: 'text', speakerId: amelia.id, speaker: amelia.label, rate: 0.8 });
  rateOnlyMeta = buildTextStructuredPlaybackRateProfileMetadata({ metadata: rateOnlyMeta, scope: 'document', channel: 'text', speakerId: ben.id, speaker: ben.label, rate: 1.3 });
  rateOnlyMeta = buildTextStructuredAudioSyncProfileMetadata({ metadata: rateOnlyMeta, kind: 'rate', channel: 'text', enabled: true });
  const rateOnlyTree = withDocMeta(base, rateOnlyMeta);
  h.resetHooks();
  const controlsTree = TextStructuredAudioControls({
    documentTree: rateOnlyTree,
    preferences: { ...DEFAULT_TEXT_STRUCTURED_PREFERENCES },
    englishVoices: [{ name: 'Microsoft Sonia', lang: 'en-GB' }, { name: 'Microsoft Ryan', lang: 'en-GB' }],
    indonesianVoices: [],
    defaultTextVoiceName: 'Microsoft Sonia',
    defaultMeaningVoiceName: 'Microsoft Gadis',
    generationPreferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    edgeGenerationVoices: initialEdgeVoices
  });
  const allControlsText = h.collectText(controlsTree);
  assert.ok(/0\.8\s*[×x]/i.test(allControlsText), `Rate sync ON must show 0.8× speed in controls, got snippet: ${allControlsText.slice(0, 300)}`);
  const benCard = h.collectNodes(controlsTree).find(n => n?.props?.['data-text-audio-speaker'] === ben.id);
  assert.ok(benCard, 'Expected Ben speaker card in TextStructuredAudioControls');
  const benSyncNotesNode = h.collectNodes(benCard).find(n => n?.props?.['data-text-audio-sync-notes'] === ben.id);
  const benCardTextRateOnly = h.collectText(benSyncNotesNode || benCard);
  assert.ok(/0\.8|Speed.*Amelia|Following.*0\.8|Following Amelia.*rate/i.test(benCardTextRateOnly), `When ONLY Rate Sync EN is ON, Ben's speaker card should indicate synced EN speed (0.8×), got: "${benCardTextRateOnly}"`);
  assert.ok(!/EN voice follows/i.test(benCardTextRateOnly), `Voice Sync is OFF so Ben sync notes must not claim EN voice follows: "${benCardTextRateOnly}"`);
  assert.ok(/0\.8\s*[×x]/i.test(h.collectText(benCard)), `Expected Ben's speed control to display synced 0.8× rate, got: "${h.collectText(benCard).slice(0, 300)}"`);
});

await runCheck('C1', 'C1.6', 'Conversation Sync Master speakers[0] matches UI segment-appearance order even when speakerRegistryV1 order differs or unused speaker is registered first', () => {
  let state = buildP12ConversationState().snapshot;
  const docId = state.documents[0].id;
  let docMeta = buildTextStructuredUpsertSpeakerRegistryMetadata({
    metadata: state.documents[0].metadata,
    documentId: docId,
    label: 'Zara'
  });
  const reg = Array.isArray(docMeta.speakerRegistryV1) ? docMeta.speakerRegistryV1 : [];
  const zara = reg.find(s => s.label === 'Zara');
  const others = reg.filter(s => s.label !== 'Zara');
  assert.ok(zara, 'Expected Zara in speakerRegistryV1');
  docMeta = { ...docMeta, speakerRegistryV1: [zara, ...others] };
  const tree = resolveTextLibraryDocumentTree({
    ...state,
    documents: [{ ...state.documents[0], metadata: docMeta }]
  }, docId);
  const activeSpeakers = collectTextStructuredConversationSpeakerIdentities(tree);
  assert.equal(activeSpeakers[0].label, 'Amelia', 'Sync Master must remain first speaking character in Conversation cards (Amelia), never an unused or reordered registry row');
});

// ============================================================================
// PART C2 — Conversation Split/Full Playback, Navigation, Repeat, Shuffle & Audio Order
// ============================================================================
const createPlaybackRuntimeHarness = () => {
  const playbackSessionRef = { current: 1 };
  const playbackContextRef = { current: null };
  const pauseStateRef = { current: false };
  const stopSignalRef = { current: false };
  const currentAudioObjRef = { current: null };
  const currentUtteranceRef = { current: null };
  const ttsReplayRef = { current: null };
  const playbackResolveRef = { current: null };
  const silentAudioRef = { current: { paused: true, currentTime: 0, play: () => Promise.resolve(), pause: () => {} } };
  const logs = [];
  const state = { isPlaying: false, isPaused: false, playingContext: null, playingIndex: null, currentIndex: null, speakingPart: null };
  const synth = { paused: false, speaking: false, cancel: () => {}, pause: () => { synth.paused = true; }, resume: () => { synth.paused = false; }, speak: () => {} };
  const settlePlaybackPromise = () => executeSettlePlaybackPromise({ playbackResolveRef });
  const waitWhilePaused = () => executeWaitWhilePaused({ pauseStateRef, stopSignalRef });
  const forceStopAll = () => { stopSignalRef.current = true; state.isPlaying = false; state.isPaused = false; playbackSessionRef.current += 1; };
  const safePlayTransition = cb => executeSafePlayTransition({
    forceStopAll,
    playbackSessionRef,
    stopSignalRef,
    pauseStateRef,
    actionCallback: cb
  });
  return {
    playbackSessionRef, playbackContextRef, pauseStateRef, stopSignalRef,
    currentAudioObjRef, currentUtteranceRef, ttsReplayRef, playbackResolveRef,
    silentAudioRef, logs, state, synth, settlePlaybackPromise, waitWhilePaused,
    safePlayTransition,
    forceStopAll,
    addLog: (type, message) => logs.push({ type, message }),
    setIsPlaying: v => { state.isPlaying = v; },
    setIsPaused: v => { state.isPaused = v; },
    setPlayingContext: v => { state.playingContext = v; },
    setPlayingIndex: v => { state.playingIndex = v; },
    setCurrentIndex: v => { state.currentIndex = v; },
    setSpeakingPart: v => { state.speakingPart = v; }
  };
};

const flushPlaybackAsync = async (cycles = 10) => {
  for (let i = 0; i < cycles; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 15));
  }
};

await runCheck('C2', 'C2.1', 'Playback list & scopes (document, card, segment, from-here) + channel modes on P12 3-card 13-segment fixture', async () => {
  const { documentTree } = buildP12ConversationState();
  const fullList = resolveStructuredTextPlaybackList(documentTree, { playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING });
  assert.equal(fullList.length, 13);

  // Card scope plays only Card 2 (5 segments)
  const hCard = createPlaybackRuntimeHarness();
  const cardPlayed = [];
  executeStructuredTextPlaybackSessionService({
    documentTree,
    blockId: documentTree.blocks[1].id,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    ...hCard,
    playStructuredChannel: async (_content, item) => { cardPlayed.push(item.id); }
  });
  await flushPlaybackAsync(14);
  assert.deepEqual(cardPlayed, documentTree.blocks[1].segments.map(s => s.id));

  // Segment scope plays single manual segment only
  const hSeg = createPlaybackRuntimeHarness();
  const segPlayed = [];
  executeStructuredTextPlaybackSessionService({
    documentTree,
    startSegmentId: documentTree.blocks[1].segments[2].id,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    ...hSeg,
    playStructuredChannel: async (_content, item) => { segPlayed.push(item.id); }
  });
  await flushPlaybackAsync(10);
  assert.deepEqual(segPlayed, [documentTree.blocks[1].segments[2].id]);

  // FROM_HERE starting at clarify-03 plays clarify-03..close-04 (7 remaining segments across Card 2 & Card 3)
  const hFromHere = createPlaybackRuntimeHarness();
  const fromHerePlayed = [];
  executeStructuredTextPlaybackSessionService({
    documentTree,
    startSegmentId: documentTree.blocks[1].segments[2].id,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    ...hFromHere,
    playStructuredChannel: async (_content, item) => { fromHerePlayed.push(item.id); }
  });
  await flushPlaybackAsync(20);
  assert.equal(fromHerePlayed.length, 7);
  assert.equal(fromHerePlayed[0], documentTree.blocks[1].segments[2].id);
  assert.equal(fromHerePlayed.at(-1), documentTree.blocks[2].segments[3].id);
});

await runCheck('C2', 'C2.2', 'Conversation Full Mode Policy (POL-02): full-tts-fallback when 0 local (single first-segment FULL_TTS), split-fallback when Split local exists (highlight=false, ignoreSegmentVoiceOverride=true, CUSTOM_LOCAL respected), and FROM_HERE slicing', () => {
  const { documentTree } = buildP12ConversationState();
  const card1 = documentTree.blocks[0];
  const card2 = documentTree.blocks[1];
  const seg1 = card1.segments[0];
  const seg2 = card1.segments[1];

  // A) 0 local files -> full-tts-fallback concatenating Conversation card segments into 1 FULL_TTS step
  const noLocalPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree,
    block: card1,
    channel: 'text',
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    audioVariants: [],
    runtimeAudioUrls: {},
    fallbackVoiceId: 'en-GB-SoniaNeural',
    fallbackEngine: 'edge',
    fallbackRate: 0,
    fallbackPitch: 0
  });
  assert.equal(noLocalPlan.route, 'full-tts-fallback');
  assert.equal(noLocalPlan.steps.length, 1);
  assert.equal(noLocalPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(noLocalPlan.steps[0].highlight, false);
  assert.equal(noLocalPlan.steps[0].ignoreSegmentVoiceOverride, true);
  assert.equal(noLocalPlan.steps[0].content, buildTextStructuredFullRepresentation({ block: card1, channel: 'text' }).content);

  // B) Split Ready MP3s present on Seg 1 (Amelia) and Seg 2 (Ben) -> Conversation Full uses split-fallback with highlight=false & per-speaker local files
  const v1 = {
    id: 'VA_C2_1', segmentId: seg1.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', createdAt: 1, updatedAt: 1,
    metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg1.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } }
  };
  const v2 = {
    id: 'VA_C2_2', segmentId: seg2.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-RyanNeural', createdAt: 1, updatedAt: 1,
    metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg2.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-RyanNeural', rate: 0, pitch: 0 } }
  };
  const splitFallbackPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree,
    block: card1,
    channel: 'text',
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    audioVariants: [v1, v2],
    runtimeAudioUrls: { VA_C2_1: { url: 'blob:va1' }, VA_C2_2: { url: 'blob:va2' } },
    fallbackVoiceId: 'en-GB-SoniaNeural',
    fallbackEngine: 'edge',
    fallbackRate: 0,
    fallbackPitch: 0
  });
  assert.equal(splitFallbackPlan.route, 'split-fallback');
  assert.equal(splitFallbackPlan.steps.length, card1.segments.length);
  assert.equal(splitFallbackPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(splitFallbackPlan.steps[1].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(splitFallbackPlan.steps[2].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS);
  assert.equal(splitFallbackPlan.steps.every(s => s.highlight === false && s.ignoreSegmentVoiceOverride === true), true);

  // C) FROM_HERE starting at segment index 2 of Card 2 in Full mode slices remaining segments only
  const remainingCard2Ids = card2.segments.slice(2).map(s => s.id);
  const splitFromHerePlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree,
    block: card2,
    channel: 'text',
    segmentIds: remainingCard2Ids,
    audioVariants: [],
    runtimeAudioUrls: {},
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
  });
  assert.equal(splitFromHerePlan.route, 'full-tts-fallback');
  assert.equal(splitFromHerePlan.steps[0].content, card2.segments.slice(2).map(s => s.text).join(' '));
  const splitFromHereRaw = buildTextStructuredSplitRuntimePlan({
    documentTree,
    block: card2,
    channel: 'text',
    segmentIds: remainingCard2Ids,
    audioVariants: [],
    runtimeAudioUrls: {},
    fallbackVoiceId: 'en-GB-SoniaNeural',
    highlight: false
  });
  assert.equal(splitFromHereRaw.steps.length, card2.segments.length - 2);
  assert.equal(splitFromHereRaw.steps[0].segmentId, card2.segments[2].id);
});

await runCheck('C2', 'C2.3', 'Conversation runtime session loop: Split highlights segment, Full & split-fallback clear playingIndex while keeping active card via activeCursorSegmentId, Repeat/Shuffle/SmartNav behave cleanly', async () => {
  const { documentTree } = buildP12ConversationState();
  const baseList = resolveStructuredTextPlaybackList(documentTree, { playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY });

  // 1) Navigation: Split wraps sentence-by-sentence; Full jumps card-by-card
  assert.equal(resolveStructuredTextNavigationTarget({ list: baseList, currentId: documentTree.blocks[0].segments[3].id, direction: 'next', representationMode: 'split' }).id, documentTree.blocks[1].segments[0].id);
  assert.equal(resolveStructuredTextNavigationTarget({ list: baseList, currentId: documentTree.blocks[0].segments[1].id, direction: 'next', representationMode: 'full' }).id, documentTree.blocks[1].segments[0].id);
  assert.equal(resolveStructuredTextNavigationTarget({ list: baseList, currentId: documentTree.blocks[0].segments[1].id, direction: 'prev', representationMode: 'full' }).id, documentTree.blocks[2].segments[0].id);

  // 2) Card-level Shuffle preserves sentence order within each Conversation Card
  let seed = 0.75;
  const random = () => { seed = (seed + 0.37) % 1; return seed; };
  const shuffled = resolveStructuredTextPlaybackOrder({
    list: baseList,
    orderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
    anchorId: baseList[0].id,
    random
  });
  assert.equal(shuffled.length, 13);
  const byCard = new Map();
  for (const item of shuffled) {
    if (!byCard.has(item.blockId)) byCard.set(item.blockId, []);
    byCard.get(item.blockId).push(item.id);
  }
  for (const card of documentTree.blocks) {
    assert.deepEqual(byCard.get(card.id), card.segments.map(s => s.id), `Card ${card.id} internal segment order must remain intact during shuffle`);
  }

  // 3) SmartNav with Manual Segment overrides stays decoupled from Global list & clears stale shuffle when sequential
  const smartNav = resolveStructuredTextSmartNavPlan({
    completeList: baseList,
    activeDocumentId: documentTree.id,
    savedResume: { documentId: documentTree.id, segmentId: baseList[0].id },
    preferences: { playbackRepresentationMode: 'split', playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL },
    direction: 'next'
  });
  assert.equal(smartNav.target.id, baseList[1].id);
  const smartCtx = resolveStructuredTextSmartNavigationContext({
    completeList: baseList,
    activeDocumentId: documentTree.id,
    session: {
      documentId: documentTree.id,
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT,
      cursorSegmentId: baseList[0].id,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
      orderedList: [...baseList].reverse()
    },
    preferences: {
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE
    }
  });
  assert.equal(smartCtx.orderedListOverride, null, 'Switching back to SEQUENTIAL must ignore stale shuffled override');
  assert.equal(smartCtx.playbackChannelMode, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING);

  // 4) Runtime session execution: Split highlights segment; Full split-fallback clears playingIndex (no segment highlight) and keeps active card via activeCursorSegmentId
  const card1 = documentTree.blocks[0];
  const seg0 = card1.segments[0];
  const v0 = {
    id: 'VA_C2_S0', segmentId: seg0.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', createdAt: 1, updatedAt: 1,
    metadata: { contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg0.text }), audioRenderDescriptorV1: { engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 } }
  };
  const hFull = createPlaybackRuntimeHarness();
  const playingIndicesSeen = [];
  const cursorIdsSeen = [];
  const origSetPlaying = hFull.setPlayingIndex;
  const origSetCurrent = hFull.setCurrentIndex;
  hFull.setPlayingIndex = v => { playingIndicesSeen.push(v); origSetPlaying(v); };
  hFull.setCurrentIndex = v => { cursorIdsSeen.push(v); origSetCurrent(v); };
  const playedSteps = [];
  executeStructuredTextPlaybackSessionService({
    documentTree,
    blockId: card1.id,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE,
    ...hFull,
    resolveBlockChannelPlaybackPlan: ({ block, channel, representationMode, allowFullArtifact }) => buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree,
      block,
      channel,
      representationMode,
      audioVariants: [v0],
      runtimeAudioUrls: { VA_C2_S0: { url: 'blob:v0' } },
      fallbackVoiceId: 'en-GB-SoniaNeural',
      fallbackEngine: 'edge',
      fallbackRate: 0,
      fallbackPitch: 0,
      allowFullArtifact
    }),
    playStructuredFullStep: async step => { playedSteps.push(step.type); return true; },
    playStructuredChannel: async (_c, _i, _ch, opt) => { playedSteps.push(opt?.step?.type || 'split'); return true; }
  });
  await flushPlaybackAsync(14);
  assert.ok(playingIndicesSeen.every(v => v === null), `Full split-fallback must keep playingIndex null (got ${JSON.stringify(playingIndicesSeen)})`);
  assert.equal(playedSteps[0], TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(playedSteps[1], TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS);
  assert.equal(
    resolveActiveTextCardId({ blocks: documentTree.blocks, playingIndex: null, activeCursorSegmentId: cursorIdsSeen[0], playbackRepresentationMode: 'full', isSessionActive: true }),
    card1.id
  );
});

await runCheck('C2', 'C2.4', 'Conversation Audio Ordering respects card-order > global-order > document-order-legacy > compatibility-fallback and strict CUSTOM_LOCAL', () => {
  const { documentTree } = buildP12ConversationState();
  const [amelia] = collectTextStructuredConversationSpeakerIdentities(documentTree);
  const seg = documentTree.blocks[0].segments[0];
  const fp = buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg.text });
  const makeVar = (id, voiceId, createdAt) => ({
    id, segmentId: seg.id, channel: 'text', source: 'generated', engine: 'edge', voiceId, createdAt, updatedAt: createdAt,
    metadata: { contentFingerprint: fp, audioRenderDescriptorV1: { engine: 'edge', voiceId, rate: 0, pitch: 0 } }
  });
  const variants = [
    makeVar('V_SONIA', 'en-GB-SoniaNeural', 100),
    makeVar('V_RYAN', 'en-GB-RyanNeural', 200),
    makeVar('V_LIBBY', 'en-GB-LibbyNeural', 300)
  ];
  const runtime = {
    V_SONIA: { url: 'blob:sonia' },
    V_RYAN: { url: 'blob:ryan' },
    V_LIBBY: { url: 'blob:libby' }
  };

  // Global puts Ryan first, Card puts Libby first -> Card wins!
  const cardWithOrder = {
    ...documentTree.blocks[0],
    metadata: buildTextStructuredAudioPlaybackOrderMetadata({ metadata: documentTree.blocks[0].metadata, channel: 'text', profiles: [{ engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0 }] })
  };
  const globalProfiles = [{ engine: 'edge', voiceId: 'en-GB-RyanNeural', rate: 0, pitch: 0 }];
  const resolvedOrder = resolveTextStructuredEffectivePlaybackOrder({ block: cardWithOrder, documentTree, channel: 'text', globalProfiles });
  assert.equal(resolvedOrder.source, 'card-order');
  const picked = resolveTextStructuredRuntimeAudio({
    audioVariants: variants, runtimeAudioUrls: runtime, segmentId: seg.id, channel: 'text', content: seg.text, preferredGeneratedProfiles: resolvedOrder.profiles, strictProfileOrder: true
  });
  assert.equal(picked.variant.voiceId, 'en-GB-LibbyNeural');

  // Global-order wins over document-order-legacy
  const docLegacyOrder = withDocMeta(documentTree, buildTextStructuredAudioPlaybackOrderMetadata({ metadata: documentTree.metadata, channel: 'text', profiles: [{ engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 }] }));
  const globalOrderRes = resolveTextStructuredEffectivePlaybackOrder({ block: docLegacyOrder.blocks[0], documentTree: docLegacyOrder, channel: 'text', globalProfiles });
  assert.equal(globalOrderRes.source, 'global-order');
  const legacyOrderRes = resolveTextStructuredEffectivePlaybackOrder({ block: docLegacyOrder.blocks[0], documentTree: docLegacyOrder, channel: 'text', globalProfiles: [] });
  assert.equal(legacyOrderRes.source, 'document-order-legacy');

  // Strict CUSTOM_LOCAL for Amelia pinned to en-GB-SoniaNeural picks Sonia even when Libby is newer
  const docCustom = withDocMeta(documentTree, buildTextStructuredLocalAudioProfileMetadata({
    metadata: documentTree.metadata, scope: 'document', channel: 'text', speakerId: amelia.id, speaker: amelia.label, voiceId: 'en-GB-SoniaNeural'
  }));
  const customPicked = resolveTextStructuredEffectiveCustomLocalVoice({
    documentTree: docCustom, block: docCustom.blocks[0], segment: seg, channel: 'text'
  });
  assert.equal(customPicked, 'en-GB-SoniaNeural');
  const customPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: docCustom,
    block: docCustom.blocks[0],
    channel: 'text',
    audioVariants: variants,
    runtimeAudioUrls: runtime,
    audioSourceMode: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL,
    customLocalVoiceId: customPicked
  });
  assert.equal(customPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(customPlan.steps[0].runtimeAudio.variant.voiceId, 'en-GB-SoniaNeural');
  assert.equal(resolveTextStructuredEffectiveTtsOnly({ globalTtsOnly: true }).enabled, true);
});

// ============================================================================
// PART C3 — Conversation Coverage, Repeated Lines, Paragraph Boundaries, Exports & Portable ZIP
// ============================================================================
await runCheck('C3', 'C3.1', 'Repeated identical line (plan-03 & clarify-05 by Amelia) deduplicates RF cleanly when voice matches, diverges on Card 2 override, and isolates STALE invalidation', () => {
  const { snapshot, docId, documentTree } = buildP12ConversationState();
  const [amelia] = collectTextStructuredConversationSpeakerIdentities(documentTree);
  const plan03 = documentTree.blocks[0].segments[2];
  const clarify05 = documentTree.blocks[1].segments[4];
  assert.equal(plan03.text, 'Could you say that again, please?');
  assert.equal(clarify05.text, 'Could you say that again, please?');

  const textLang = documentTree.textLanguage || 'en';
  const rf1 = buildTextStructuredAudioRenderFingerprint({ channel: 'text', language: textLang, content: plan03.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const rf2 = buildTextStructuredAudioRenderFingerprint({ channel: 'text', language: textLang, content: clarify05.text, engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  assert.equal(rf1.renderFingerprint, rf2.renderFingerprint, 'Identical line + same resolved voice must share physical renderFingerprint');

  // Override Amelia on Card 2 download profile -> RF must diverge cleanly
  const card2Override = {
    ...documentTree.blocks[1],
    metadata: buildTextStructuredAudioDownloadProfileMetadata({
      metadata: documentTree.blocks[1].metadata,
      scope: 'card',
      channel: 'text',
      speakerId: amelia.id,
      speaker: amelia.label,
      voiceId: 'en-GB-LibbyNeural'
    })
  };
  const targetCard2 = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block: card2Override, segment: clarify05, channel: 'text', preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural' } });
  assert.equal(targetCard2.voiceId, 'en-GB-LibbyNeural');
  const rf2Libby = buildTextStructuredAudioRenderFingerprint({
    channel: 'text', language: textLang, content: clarify05.text, engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 0, pitch: 0
  });
  assert.notEqual(rf1.renderFingerprint, rf2Libby.renderFingerprint);

  // Variant readiness + edit plan-03 makes only plan-03 STALE while clarify-05 stays READY
  const vPlan03 = {
    id: 'VAR_P03', segmentId: plan03.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', createdAt: 10, updatedAt: 10,
    metadata: {
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: plan03.text }),
      audioRenderFingerprintV1: rf1.renderFingerprint,
      audioRenderDescriptorV1: rf1.descriptor
    }
  };
  const vClarify05 = {
    id: 'VAR_C05', segmentId: clarify05.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', createdAt: 10, updatedAt: 10,
    metadata: {
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: clarify05.text }),
      audioRenderFingerprintV1: rf2.renderFingerprint,
      audioRenderDescriptorV1: rf2.descriptor
    }
  };
  const updatedSnap = applyTextLibraryCommand(snapshot, {
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_SEGMENT,
    payload: { id: plan03.id, text: 'Could you repeat that last point?' }
  }, 5000).snapshot;
  const updatedTree = resolveTextLibraryDocumentTree(updatedSnap, docId);
  const coverage = buildTextStructuredAudioCoverageMap({
    documentTree: updatedTree,
    audioVariants: [vPlan03, vClarify05],
    runtimeAudioUrls: {
      VAR_P03: { url: 'blob:shared', renderFingerprint: rf1.renderFingerprint },
      VAR_C05: { url: 'blob:shared', renderFingerprint: rf2.renderFingerprint }
    },
    preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 }
  });
  assert.equal(coverage[buildTextStructuredRuntimeAudioKey(plan03.id, 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.STALE);
  assert.equal(coverage[buildTextStructuredRuntimeAudioKey(clarify05.id, 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.READY);
});

await runCheck('C3', 'C3.2', 'Paragraph-only Bulk P5 & Full Card MP3 boundaries hold on Conversation-only workspace, and UI messaging explains skip/disable clearly without false readiness', () => {
  const { documentTree } = buildP12ConversationState();
  const h = createReactHarness();
  const TextBatchPopup = h.loadModule('src/components/text/TextBatchPopup.jsx').default;
  const TextStructuredCardAudioPanel = h.loadModule('src/components/text/TextStructuredCardAudioPanel.jsx').default;

  const selection = {
    documentCount: 1,
    documents: [{ id: documentTree.id, title: documentTree.title, scope: { blockIds: documentTree.blocks.map(b => b.id) } }]
  };
  const prefs = {
    generateText: true, generateMeaning: true, bulkGenerateSplit: true, bulkGenerateFull: true,
    bulkTextVoiceIds: ['en-GB-SoniaNeural'], bulkMeaningVoiceIds: ['id-ID-GadisNeural'],
    edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural',
    bulkExportFormat: 'portable-zip', bulkExportVoicePolicy: 'all-selected', bulkExportRepresentation: 'both'
  };
  const bulkGenPlan = buildTextStructuredBulkGenerationPlan({ documentTrees: [documentTree], selection, preferences: prefs });
  const bulkExportPlan = buildTextStructuredBulkExportPlan({ documentTrees: [documentTree], selection, preferences: prefs });
  assert.equal(bulkGenPlan.coverage.eligibleBlockCount, 0);
  assert.equal(bulkGenPlan.coverage.skippedConversationBlockCount, 3);
  assert.equal(bulkGenPlan.requirements.length, 0);
  assert.equal(bulkExportPlan.coverage.uniquePhysicalReady, 0);
  assert.equal(bulkExportPlan.physical.length, 0);

  h.resetHooks();
  const batchTree = TextBatchPopup({
    mode: 'text',
    activeTextEditorModel: 'structured-v1',
    inline: true,
    showClose: false,
    structuredTextBatch: {
      preferences: prefs,
      voices: initialEdgeVoices,
      generationCoverage: bulkGenPlan.coverage,
      exportCoverage: bulkExportPlan.coverage,
      operationVoiceValidation: bulkGenPlan.operationVoiceValidation,
      bulkTextVoicesResolved: ['en-GB-SoniaNeural'],
      bulkMeaningVoicesResolved: ['id-ID-GadisNeural'],
      scope: { scopeMode: 'workspace' },
      workspaceTitle: documentTree.title,
      activeWorkspaceId: documentTree.id,
      activeDocumentId: documentTree.id,
      workspaceOptions: [{ id: documentTree.id, title: documentTree.title, documentType: 'conversation' }],
      documentOptions: [{ id: documentTree.id, title: documentTree.title, documentType: 'conversation' }],
      collectionOptions: [],
      cardOptions: documentTree.blocks.map((b, i) => ({ id: b.id, index: i + 1, title: b.title, blockType: b.blockType })),
      workspacesResolved: [{ id: documentTree.id, title: documentTree.title, jobCount: 0 }],
      documentsResolved: [{ id: documentTree.id, title: documentTree.title, jobCount: 0 }]
    }
  });
  const batchText = h.collectText(batchTree);
  assert.match(batchText, /Conversation skipped:\s*3\s*\(use Card Audio\)/i);
  const genBtn = h.collectNodes(batchTree).find(n => n?.props?.['data-text-bulk-generate-missing'] === 'true');
  assert.equal(genBtn.props.disabled, true);

  h.resetHooks();
  const cardPanelTree = TextStructuredCardAudioPanel({
    block: documentTree.blocks[0],
    documentTree,
    initialSurface: 'download',
    preferences: DEFAULT_TEXT_STRUCTURED_PREFERENCES,
    generationPreferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 },
    audioCoverageMap: {},
    runtimeFullAudio: {},
    englishVoices: [{ name: 'Microsoft Sonia', lang: 'en-GB' }],
    indonesianVoices: [{ name: 'Microsoft Gadis', lang: 'id-ID' }],
    edgeGenerationVoices: initialEdgeVoices,
    defaultTextVoiceName: 'Microsoft Sonia',
    defaultMeaningVoiceName: 'Microsoft Gadis',
    onClose: () => {}
  });
  const panelText = h.collectText(cardPanelTree);
  const fullBtns = h.collectNodes(cardPanelTree).filter(n => ['text', 'meaning'].includes(n?.props?.['data-text-card-full-export']));
  assert.equal(fullBtns.length, 2);
  assert.equal(fullBtns.every(btn => btn.props.disabled === true && /Paragraph cards/i.test(btn.props.title || '')), true);
  assert.equal(h.collectNodes(cardPanelTree).some(n => n?.props?.['data-text-card-include-missing-full'] === 'true'), false, 'Conversation card must NOT show Paragraph Full generation checkbox');
  assert.match(panelText, /Paragraph Full MP3 option applies to Paragraph cards/i);
  assert.equal(/FULL READY/.test(panelText), false, 'Conversation card must never display FULL READY');
});

await runCheck('C3', 'C3.3', 'Conversation Card ZIP, Consolidated Batch ZIP/MP3, Derived Full WAV & Portable ZIP v2 round-trip across Memory IndexedDB with shared RF deduplication & cancellation/isolation', async () => {
  const prevIdb = globalThis.indexedDB;
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevUrl = globalThis.URL;
  const prevAudioCtx = globalThis.AudioContext;
  const prevWebkitAudioCtx = globalThis.webkitAudioContext;
  const downloads = [];
  const fakeWindow = {
    setTimeout: (fn) => { try { fn(); } catch {} return 1; },
    clearTimeout: () => {}
  };
  globalThis.indexedDB = createMemoryIndexedDb();
  globalThis.window = fakeWindow;
  globalThis.document = {
    createElement: () => ({ click: () => {}, setAttribute: () => {}, remove: () => {}, style: {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  };
  globalThis.URL = {
    createObjectURL: () => `blob:mem/${downloads.length + 1}`,
    revokeObjectURL: () => {}
  };

  try {
    await openTextLibraryDatabase();
    clearAudioStagingRuntimeCacheForMode('text');
    const { snapshot, docId, documentTree } = buildP12ConversationState();
    const [amelia, ben, farah] = collectTextStructuredConversationSpeakerIdentities(documentTree);

    // Assign distinct Edge Download voices per speaker on the Conversation doc
    let dlMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: documentTree.metadata, scope: 'document', channel: 'text', speakerId: amelia.id, speaker: amelia.label, voiceId: 'en-GB-SoniaNeural' });
    dlMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: dlMeta, scope: 'document', channel: 'text', speakerId: ben.id, speaker: ben.label, voiceId: 'en-GB-RyanNeural' });
    dlMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: dlMeta, scope: 'document', channel: 'text', speakerId: farah.id, speaker: farah.label, voiceId: 'en-GB-LibbyNeural' });
    let snap = applyTextLibraryCommand(snapshot, {
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: docId, metadata: dlMeta }
    }, 6000).snapshot;

    const tree = resolveTextLibraryDocumentTree(snap, docId);
    const prefs = { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 };

    // Stage all EN segments across Cards 1 & 2 (plan-03 & clarify-05 share identical RF!)
    const runtimeUrls = {};
    const sharedStagingByRf = new Map();
    const card1And2Segments = [...tree.blocks[0].segments, ...tree.blocks[1].segments];
    let counter = 0;
    for (const seg of card1And2Segments) {
      counter += 1;
      const block = tree.blocks.find(b => b.id === seg.blockId);
      const target = resolveTextStructuredEffectiveDownloadVoice({ documentTree: tree, block, segment: seg, channel: 'text', preferences: prefs });
      const rfInfo = buildTextStructuredAudioRenderFingerprint({ channel: 'text', language: tree.textLanguage || 'en', content: seg.text, engine: 'edge', voiceId: target.voiceId, rate: 0, pitch: 0 });
      const filename = buildCanonicalTextRenderAudioFilename({ segment: seg, channel: 'text', renderFingerprint: rfInfo.renderFingerprint, voiceId: target.voiceId });

      let staging = sharedStagingByRf.get(rfInfo.renderFingerprint);
      if (!staging) {
        const bytes = new Uint8Array([0x49, 0x44, 0x33, counter & 0xff, counter + 10]); // synthetic MP3 payload
        staging = await putTextAudioStagingBlob({
          documentId: docId,
          blockId: block.id,
          segmentId: seg.id,
          channel: 'text',
          voiceId: target.voiceId,
          renderFingerprint: rfInfo.renderFingerprint,
          filename,
          blob: new Blob([bytes], { type: 'audio/mpeg' })
        });
        sharedStagingByRf.set(rfInfo.renderFingerprint, staging);
      }

      const up = applyTextLibraryCommand(snap, {
        type: TEXT_LIBRARY_COMMAND_TYPES.UPSERT_AUDIO_VARIANT,
        payload: {
          segmentId: seg.id,
          channel: 'text',
          engine: 'edge',
          source: 'generated',
          voiceId: target.voiceId,
          language: 'en',
          filename,
          mimeType: 'audio/mpeg',
          metadata: {
            contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg.text }),
            contentFingerprintV2: rfInfo.contentFingerprintV2,
            audioRenderFingerprintV1: rfInfo.renderFingerprint,
            audioRenderDescriptorV1: rfInfo.descriptor
          }
        }
      }, 6100 + counter);
      snap = up.snapshot;
      runtimeUrls[String(up.result.id).toUpperCase()] = {
        stagingBacked: true,
        stagingId: staging.id,
        url: `blob:staged/${staging.id}`,
        filename,
        renderFingerprint: rfInfo.renderFingerprint
      };
    }
    await writeTextLibrarySnapshot(snap);

    const populatedTree = resolveTextLibraryDocumentTree(snap, docId);
    const coverageMap = buildTextStructuredAudioCoverageMap({
      documentTree: populatedTree,
      audioVariants: snap.audioVariants,
      runtimeAudioUrls: runtimeUrls,
      preferences: prefs
    });
    const plan03 = populatedTree.blocks[0].segments[2];
    const clarify05 = populatedTree.blocks[1].segments[4];
    assert.equal(coverageMap[buildTextStructuredRuntimeAudioKey(plan03.id, 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.READY);
    assert.equal(coverageMap[buildTextStructuredRuntimeAudioKey(clarify05.id, 'text')].status, TEXT_AUDIO_COVERAGE_STATUS.READY);
    assert.equal(sharedStagingByRf.size, 8, '9 EN segments with 1 repeated line (plan-03 & clarify-05) must store only 8 physical MP3 blobs');

    // Capture ZIP blobs produced by Card ZIP & Batch Consolidated ZIP instead of clicking real anchor downloads
    const resolveManualSlot = (segId, channel) => {
      const cov = coverageMap[buildTextStructuredRuntimeAudioKey(segId, channel)];
      if (!cov || cov.status !== 'ready' || !cov.variantId) return null;
      const variant = snap.audioVariants.find(v => String(v.id).toUpperCase() === String(cov.variantId).toUpperCase());
      const runtime = runtimeUrls[String(cov.variantId).toUpperCase()];
      return variant && runtime ? { key: `${segId}:${channel}`, coverage: cov, variant, runtime } : null;
    };
    const readBlob = async runtime => getAudioStagingBlob(runtime.stagingId);

    // Intercept Blob construction or capture from executeStructuredTextCardZipExport?
    // Notice triggerBrowserDownload runs in browserUtils! Wait: let's spy on URL.createObjectURL receiving the Blob!
    let capturedBlobs = [];
    globalThis.URL.createObjectURL = blob => {
      capturedBlobs.push(blob);
      return `blob:mem/${capturedBlobs.length}`;
    };

    // A) Card ZIP export on Card 1 (4 EN ready, 0 ID ready -> non-partial fails closed 'incomplete'; partial exports 4 files + manifest)
    const card1BlockedZip = await executeStructuredTextCardZipExport({
      documentTree: populatedTree,
      blockId: populatedTree.blocks[0].id,
      preferences: prefs,
      runtimeFullAudio: {},
      resolveManualReadySlot: resolveManualSlot,
      readBlob,
      addLog: () => {}
    });
    assert.equal(card1BlockedZip.status, 'incomplete');
    const card1ZipRes = await executeStructuredTextCardZipExport({
      documentTree: populatedTree,
      blockId: populatedTree.blocks[0].id,
      options: { partial: true },
      preferences: prefs,
      runtimeFullAudio: {},
      resolveManualReadySlot: resolveManualSlot,
      readBlob,
      addLog: () => {}
    });
    assert.equal(card1ZipRes.status, 'completed');
    assert.equal(card1ZipRes.logical, 4);
    assert.equal(card1ZipRes.physical, 4);
    assert.ok(card1ZipRes.manifest?.entries?.length > 0, 'Card ZIP must include v2 audio manifest');
    const card1ZipBlob = capturedBlobs.at(-1);
    const scannedCard1 = await scanTextStructuredAudioZipFiles({
      files: [new File([card1ZipBlob], 'card1.zip', { type: 'application/zip' })],
      audioVariants: snap.audioVariants,
      segments: snap.segments,
      blocks: snap.blocks,
      documents: snap.documents
    });
    assert.ok(scannedCard1.archives?.[0]?.manifestPresent, 'Scanned Card ZIP archive must include v2 manifest');

    // B) Consolidated Batch ZIP across Conversation Cards 1-3 (9 Ready slots deduplicated -> 8 unique physical MP3s!)
    const selection = {
      documentCount: 1,
      documents: [{ id: docId, title: populatedTree.title, scope: { blockIds: populatedTree.blocks.map(b => b.id) } }],
      slots: card1And2Segments.map(seg => ({
        documentId: docId,
        documentTitle: populatedTree.title,
        blockId: seg.blockId,
        segmentId: seg.id,
        segmentUid: seg.uid || null,
        segment: seg,
        channel: 'text'
      }))
    };
    const batchZipRes = await executeStructuredTextBatchConsolidatedZipExport({
      partial: true,
      batchSelection: selection,
      targetTrees: [populatedTree],
      preferences: prefs,
      runtimeFullAudio: {},
      resolveBatchReadySlot: slot => resolveManualSlot(slot.segmentId, slot.channel),
      readBlob,
      addLog: () => {}
    });
    assert.equal(batchZipRes.status, 'completed');
    assert.equal(batchZipRes.ready, 9);
    assert.equal(batchZipRes.physical, 8, `Consolidated Batch ZIP must deduplicate plan-03 & clarify-05 (8 unique physical MP3s for 9 ready slots), got ${batchZipRes.physical}`);
    const batchZipBlob = capturedBlobs.at(-1);
    assert.ok(batchZipBlob);

    // C) Batch Ready MP3 direct wave export
    const batchMp3Res = await executeStructuredTextBatchReadyMp3Export({
      batchSelection: selection,
      targetTrees: [populatedTree],
      preferences: prefs,
      runtimeFullAudio: {},
      resolveBatchReadySlot: slot => resolveManualSlot(slot.segmentId, slot.channel),
      readBlob,
      addLog: () => {}
    });
    assert.equal(batchMp3Res.status, 'completed');
    assert.equal(batchMp3Res.exported, 8);
    assert.equal(batchMp3Res.logicalReady, 9);

    // D) Derived Full WAV export on Conversation Card 1 (when AudioContext available -> derived-split-wav; when Card 3 missing -> fails closed)
    const missingWavRes = await executeStructuredTextFullCardAudioExport({
      documentTree: populatedTree,
      blockId: populatedTree.blocks[2].id,
      channel: 'text',
      preferences: prefs,
      runtimeFullAudio: {},
      resolveManualReadySlot: resolveManualSlot,
      readBlob,
      addLog: () => {}
    });
    assert.notEqual(missingWavRes.status, 'download-triggered');

    class FakeAudioContext {
      constructor() { this.sampleRate = 24000; }
      async decodeAudioData() {
        return {
          sampleRate: 24000,
          numberOfChannels: 1,
          length: 120,
          getChannelData: () => new Float32Array(120).fill(0.1)
        };
      }
      close() { return Promise.resolve(); }
    }
    globalThis.AudioContext = FakeAudioContext;
    const derivedWavRes = await executeStructuredTextFullCardAudioExport({
      documentTree: populatedTree,
      blockId: populatedTree.blocks[0].id,
      channel: 'text',
      preferences: prefs,
      runtimeFullAudio: {},
      resolveManualReadySlot: resolveManualSlot,
      readBlob,
      addLog: () => {}
    });
    assert.equal(derivedWavRes.status, 'download-triggered');
    assert.equal(derivedWavRes.source, 'derived-split-wav');

    // E) Portable ZIP import round-trip into a fresh Conversation DB (cloned segments before audioVariants) + Cancellation & Workspace Isolation
    const freshImport = planProLingoTextExternalInitialImport({
      localSnapshot: emptySnapshot(),
      package: fixtureP12,
      fileName: 'P12_Conversation_Only_Additional_Test_v1.json',
      now: 1000
    });
    let freshSnap = applyTextLibraryCommand(freshImport.snapshot, {
      type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
      payload: { id: freshImport.importRecord.documentId, metadata: dlMeta }
    }, 7000).snapshot;
    // Also add an isolated unrelated Conversation workspace in freshSnap
    const isoDoc = applyTextLibraryCommand(freshSnap, {
      type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_DOCUMENT,
      payload: { title: 'Isolated Workspace', documentType: 'conversation', textLanguage: 'en', meaningLanguage: 'id' }
    }, 7100);
    freshSnap = isoDoc.snapshot;
    const isoBlk = applyTextLibraryCommand(freshSnap, {
      type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_BLOCK,
      payload: { documentId: isoDoc.result.id, blockType: 'conversation', title: 'Iso Card' }
    }, 7110);
    freshSnap = isoBlk.snapshot;
    freshSnap = applyTextLibraryCommand(freshSnap, {
      type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_SEGMENT,
      payload: { blockId: isoBlk.result.id, speaker: 'Host', text: 'Completely different line.', meaning: 'Baris lain.' }
    }, 7120).snapshot;

    globalThis.indexedDB = createMemoryIndexedDb();
    await openTextLibraryDatabase();
    clearAudioStagingRuntimeCacheForMode('text');
    await writeTextLibrarySnapshot(freshSnap);

    // Aborted import must roll back cleanly without mutating DBs
    const abortCtrl = new AbortController();
    abortCtrl.abort(new Error('User cancelled'));
    await assert.rejects(() => executeTextStructuredAudioZipImport({
      files: [new File([batchZipBlob], 'P12_Batch_Consolidated.zip', { type: 'application/zip' })],
      snapshot: freshSnap,
      preferences: prefs,
      signal: abortCtrl.signal
    }), /Abort|cancel/i);
    assert.equal((await listAudioStagingMetadata()).length, 0, 'Aborted ZIP import must leave 0 Staging blobs');
    assert.equal((await readTextLibrarySnapshot()).audioVariants.length, 0, 'Aborted ZIP import must leave 0 audioVariants');

    // Full import of Batch Consolidated ZIP into fresh cloned P12 workspace -> fan-out restores BOTH plan-03 & clarify-05 + isolates Iso Workspace
    const imported = await executeTextStructuredAudioZipImport({
      files: [new File([batchZipBlob], 'P12_Batch_Consolidated.zip', { type: 'application/zip' })],
      snapshot: freshSnap,
      preferences: prefs
    });
    assert.equal(imported.status, 'added');
    assert.equal(imported.boundMatches.length, 9, 'All 9 logical EN slots (including repeated plan-03 & clarify-05) must re-bind on Portable ZIP import');
    assert.equal((await listAudioStagingMetadata()).length, 8, 'Staging stores deduplicated 8 physical blobs');
    const postDb = await readTextLibrarySnapshot();
    const isoSeg = postDb.segments.find(s => s.documentId === isoDoc.result.id);
    assert.equal(postDb.audioVariants.some(v => v.segmentId === isoSeg.id), false, 'Other Conversation workspace must never receive leaked audioVariants');
  } finally {
    if (prevIdb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = prevIdb;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevUrl === undefined) delete globalThis.URL; else globalThis.URL = prevUrl;
    if (prevAudioCtx === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = prevAudioCtx;
    if (prevWebkitAudioCtx === undefined) delete globalThis.webkitAudioContext; else globalThis.webkitAudioContext = prevWebkitAudioCtx;
    clearAudioStagingRuntimeCacheForMode('text');
  }
});

const failed = results.filter(r => !r.ok);
console.log(`\nP12-C CONVERSATION PLAYBACK AUDIT SUMMARY: ${results.length - failed.length} passed, ${failed.length} failed (${results.length} total)`);
if (failed.length) process.exitCode = 1;
