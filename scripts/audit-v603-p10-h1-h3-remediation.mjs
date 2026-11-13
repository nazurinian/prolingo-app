import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearAudioStagingForMode,
  clearAudioStagingRuntimeCacheForMode,
  getAudioStagingBlob,
  getAudioStagingObjectUrl,
  listAudioStagingMetadata,
  putAudioStagingBlob
} from '../src/services/persistence/audioStagingIndexedDbService.js';
import {
  putTextAudioStagingBlob,
  reconcileTextAudioStagingRuntimeBindings
} from '../src/services/persistence/textAudioStagingService.js';
import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../src/constants/textDatabaseConstants.js';
import {
  openTextLibraryDatabase,
  readTextLibrarySnapshot
} from '../src/services/persistence/textLibraryIndexedDbService.js';
import { buildTextStructuredAudioContentFingerprint } from '../src/domain/text/textStructuredAudioIdentityDomain.js';
import {
  buildTextStructuredAudioRenderDescriptor,
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata,
  getTextStructuredFullAudioArtifacts
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES
} from '../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import {
  buildCanonicalTextFullArtifactFilename,
  buildCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  buildProLingoTextAudioManifest,
  TEXT_AUDIO_MANIFEST_FILENAME
} from '../src/domain/text/textAudioManifestDomain.js';
import { buildStoredZipBlob } from '../src/services/audio/browserZipService.js';
import { executeTextStructuredAudioZipImport } from '../src/services/audio/textStructuredAudioZipImportService.js';
import {
  executeBrowserTtsPlaybackService,
  isBrowserTtsSpeechSupported
} from '../src/services/audio/audioPlaybackSideEffectService.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import {
  TEXT_STRUCTURED_PLAYBACK_SCOPES,
  resolveStructuredTextPlaybackOrder,
  resolveStructuredTextSmartNavPlan,
  resolveStructuredTextSmartNavigationContext
} from '../src/domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES
} from '../src/domain/text/textStructuredPlaybackPreferenceDomain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

const runCheck = async (wave, id, title, fn) => {
  try {
    await fn();
    results.push({ wave, id, title, ok: true });
    console.log(`PASS [${wave}][${id}] ${title}`);
  } catch (error) {
    results.push({ wave, id, title, ok: false, error: error?.stack || error?.message || String(error) });
    console.error(`FAIL [${wave}][${id}] ${title}\n   -> ${error?.message || error}`);
  }
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const makeMinimalDoc = () => ({
  id: 'TXTDOC_H1',
  editorModel: 'structured-v1',
  title: 'H1 Doc',
  documentType: 'paragraph',
  textLanguage: 'en-US',
  meaningLanguage: 'id-ID',
  blocks: [
    {
      id: 'TEXT_000001',
      blockType: 'paragraph',
      title: 'Card 1',
      segments: [
        { id: 'SEGMENT_000001', text: 'First sentence.', meaning: 'Kalimat satu.' },
        { id: 'SEGMENT_000002', text: 'Second sentence.', meaning: 'Kalimat dua.' }
      ],
      metadata: {}
    }
  ]
});

const createPlaybackHarness = () => {
  const playbackSessionRef = { current: 0 };
  const playbackContextRef = { current: null };
  const pauseStateRef = { current: false };
  const stopSignalRef = { current: false };
  const silentAudioRef = { current: { play: async () => {}, pause: () => {}, currentTime: 0 } };
  const state = { isPlaying: false, isPaused: false, playingIndex: null, currentIndex: null };
  const forceStopAll = () => {
    playbackSessionRef.current += 1;
    stopSignalRef.current = true;
    pauseStateRef.current = false;
    state.isPlaying = false;
    state.isPaused = false;
    state.playingIndex = null;
  };
  const safePlayTransition = async cb => {
    forceStopAll();
    const session = playbackSessionRef.current;
    await sleep(10);
    if (session !== playbackSessionRef.current) return false;
    stopSignalRef.current = false;
    pauseStateRef.current = false;
    await cb();
    return true;
  };
  return {
    playbackSessionRef,
    playbackContextRef,
    pauseStateRef,
    stopSignalRef,
    silentAudioRef,
    state,
    forceStopAll,
    safePlayTransition,
    waitWhilePaused: async () => {},
    setIsPlaying: v => { state.isPlaying = v; },
    setIsPaused: v => { state.isPaused = v; },
    setPlayingContext: () => {},
    setPlayingIndex: v => { state.playingIndex = v; },
    setCurrentIndex: v => { state.currentIndex = v; },
    setSpeakingPart: () => {},
    addLog: () => {}
  };
};

// Minimal generic in-memory IndexedDB mock that learns stores/indexes from onupgradeneeded
const createMemoryIndexedDb = () => {
  const dbs = new Map();
  const extractKeyValue = (row, keyPath) => {
    if (!keyPath) return undefined;
    if (Array.isArray(keyPath)) return keyPath.map(part => row?.[part]);
    return row?.[keyPath];
  };
  const keyMatches = (actual, target) => {
    if (Array.isArray(target) && Array.isArray(actual)) {
      return target.length === actual.length && target.every((v, i) => v === actual[i]);
    }
    return actual === target;
  };
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
        executor(req);
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
      } finally {
        if (txState) {
          txState.pending = Math.max(0, txState.pending - 1);
          txState.scheduleCommit();
        }
      }
    });
    return req;
  };
  const ensureDbState = name => {
    if (!dbs.has(name)) {
      dbs.set(name, { stores: new Map() });
    }
    return dbs.get(name);
  };
  return {
    open(name) {
      return makeRequest(req => {
        const dbState = ensureDbState(name);
        const makeStoreApi = (storeMeta, txState = null) => ({
          keyPath: storeMeta.keyPath,
          createIndex(indexName, keyPath) {
            storeMeta.indexes.set(indexName, keyPath);
            return {};
          },
          put(value) {
            const key = storeMeta.keyPath ? value?.[storeMeta.keyPath] : undefined;
            storeMeta.rows.set(key, value);
            return makeRequest(r => { r.result = key; r.onsuccess?.({ target: r }); }, txState);
          },
          get(key) {
            return makeRequest(r => { r.result = storeMeta.rows.get(key) ?? undefined; r.onsuccess?.({ target: r }); }, txState);
          },
          getAll() {
            return makeRequest(r => { r.result = [...storeMeta.rows.values()]; r.onsuccess?.({ target: r }); }, txState);
          },
          delete(key) {
            storeMeta.rows.delete(key);
            return makeRequest(r => { r.result = undefined; r.onsuccess?.({ target: r }); }, txState);
          },
          clear() {
            storeMeta.rows.clear();
            return makeRequest(r => { r.result = undefined; r.onsuccess?.({ target: r }); }, txState);
          },
          index(indexName) {
            const keyPath = storeMeta.indexes.get(indexName);
            return {
              getAll(matchValue) {
                return makeRequest(r => {
                  const all = [...storeMeta.rows.values()];
                  r.result = keyPath
                    ? all.filter(row => keyMatches(extractKeyValue(row, keyPath), matchValue))
                    : all;
                  r.onsuccess?.({ target: r });
                }, txState);
              }
            };
          }
        });
        const db = {
          objectStoreNames: { contains: storeName => dbState.stores.has(storeName) },
          createObjectStore(storeName, opts = {}) {
            if (!dbState.stores.has(storeName)) {
              dbState.stores.set(storeName, { keyPath: opts.keyPath || null, rows: new Map(), indexes: new Map() });
            }
            return makeStoreApi(dbState.stores.get(storeName));
          },
          transaction(storeNames) {
            const list = Array.isArray(storeNames) ? storeNames : [storeNames];
            const snapshots = new Map();
            list.forEach(storeName => {
              const meta = dbState.stores.get(storeName);
              if (meta) snapshots.set(storeName, new Map(meta.rows));
            });
            const tx = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              abort() {
                if (txState.committed || txState.aborted) return;
                txState.aborted = true;
                if (txState.commitTimer) {
                  clearTimeout(txState.commitTimer);
                  txState.commitTimer = null;
                }
                snapshots.forEach((prevRows, storeName) => {
                  const meta = dbState.stores.get(storeName);
                  if (meta) meta.rows = new Map(prevRows);
                });
                queueMicrotask(() => tx.onabort?.({ target: tx }));
              }
            };
            const txState = {
              pending: 0,
              committed: false,
              aborted: false,
              commitTimer: null,
              scheduleCommit() {
                if (this.committed || this.aborted || this.pending > 0) return;
                if (this.commitTimer) clearTimeout(this.commitTimer);
                this.commitTimer = setTimeout(() => {
                  this.commitTimer = null;
                  if (this.committed || this.aborted || this.pending > 0) return;
                  this.committed = true;
                  tx.oncomplete?.({ target: tx });
                }, 0);
              }
            };
            tx.objectStore = storeName => {
              const meta = dbState.stores.get(storeName);
              if (!meta) throw new Error(`Missing object store ${storeName}`);
              return makeStoreApi(meta, txState);
            };
            txState.scheduleCommit();
            return tx;
          },
          close() {}
        };
        req.result = db;
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
    }
  };
};

// ============================================================================
// WAVE H1: P10-G001, P10-G005, P10-G008
// ============================================================================

await runCheck('H1', 'P10-G001', 'Loop playback throttles instant-settling steps/passes, stops promptly, and adds 0 backoff on normal >=60ms passes', async () => {
  // 1) Fast-settling spin protection + stop responsiveness
  const hFast = createPlaybackHarness();
  let fastCalls = 0;
  executeStructuredTextPlaybackSessionService({
    documentTree: makeMinimalDoc(),
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
    channelDelayMs: 0,
    segmentDelayMs: 0,
    ...hFast,
    playStructuredChannel: async () => {
      fastCalls += 1;
    }
  });
  await sleep(240);
  const callsBeforeStop = fastCalls;
  assert.ok(callsBeforeStop >= 2, `Expected at least one loop pass before stop, got ${callsBeforeStop}`);
  assert.ok(callsBeforeStop <= 20, `Expected bounded throttled loop iterations under 240ms, got ${callsBeforeStop}`);
  hFast.forceStopAll();
  await sleep(60);
  assert.equal(fastCalls, callsBeforeStop, 'Loop must remain stopped immediately after forceStopAll');
  assert.equal(hFast.state.isPlaying, false);

  // 2) Normal >=60ms pass adds zero backoff delay between passes
  const hNormal = createPlaybackHarness();
  const timestamps = [];
  let passCount = 0;
  executeStructuredTextPlaybackSessionService({
    documentTree: makeMinimalDoc(),
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
    channelDelayMs: 0,
    segmentDelayMs: 0,
    ...hNormal,
    playStructuredChannel: async (_content, item) => {
      timestamps.push({ id: item.id, startAt: Date.now() });
      if (timestamps.length >= 3) {
        passCount = 2;
        hNormal.forceStopAll();
        return;
      }
      await sleep(40); // 2 steps * 40ms = ~80ms pass (>= 60ms threshold)
      timestamps[timestamps.length - 1].endAt = Date.now();
    }
  });
  await sleep(260);
  hNormal.forceStopAll();
  assert.equal(passCount, 2, 'Expected normal loop to enter pass 2');
  const pass1End = timestamps[1]?.endAt;
  const pass2Start = timestamps[2]?.startAt;
  assert.ok(pass1End && pass2Start, 'Expected recorded pass 1 end and pass 2 start timestamps');
  const interPassGapMs = pass2Start - pass1End;
  assert.ok(interPassGapMs < 35, `Expected no loop backoff delay after >=60ms normal pass, observed ${interPassGapMs}ms gap`);
});

await runCheck('H1', 'P10-G005', 'Browser TTS support guard & native OS system default playback when named voice is unavailable', async () => {
  class MockUtterance {
    constructor(text) {
      this.text = text;
      this.voice = undefined;
      this.rate = 1;
      this.pitch = 1;
    }
  }
  assert.equal(isBrowserTtsSpeechSupported({ synth: null, Utterance: MockUtterance }), false);
  assert.equal(isBrowserTtsSpeechSupported({ synth: { speak: () => {} }, Utterance: null }), false);
  assert.equal(isBrowserTtsSpeechSupported({ synth: { speak: () => {} }, Utterance: MockUtterance }), true);

  const prevUtterance = globalThis.SpeechSynthesisUtterance;
  try {
    // Missing SpeechSynthesisUtterance fails gracefully without throwing or spinning
    globalThis.SpeechSynthesisUtterance = undefined;
    const silentSynth = { speak: () => { throw new Error('Should not speak without Utterance'); } };
    const noUtteranceRes = await executeBrowserTtsPlaybackService({
      textToRead: 'No utterance',
      overrideVoice: null,
      selectedVoiceRef: { current: null },
      stopSignalRef: { current: false },
      pauseStateRef: { current: false },
      synth: silentSynth,
      currentUtteranceRef: { current: null },
      ttsReplayRef: { current: null },
      playbackResolveRef: { current: null },
      rate: 1,
      pitch: 1
    });
    assert.notEqual(noUtteranceRes?.status, 'completed');

    // Valid synth without cancel/resume + null overrideVoice/selectedVoice invokes native default speech
    globalThis.SpeechSynthesisUtterance = MockUtterance;
    const spoken = [];
    const minimalSynth = {
      speaking: false,
      paused: false,
      speak(utterance) {
        spoken.push(utterance);
        queueMicrotask(() => utterance.onend?.());
      }
    };
    const nativeRes = await executeBrowserTtsPlaybackService({
      textToRead: 'Native default check',
      overrideVoice: null,
      selectedVoiceRef: { current: null },
      stopSignalRef: { current: false },
      pauseStateRef: { current: false },
      synth: minimalSynth,
      currentUtteranceRef: { current: null },
      ttsReplayRef: { current: null },
      playbackResolveRef: { current: null },
      rate: 1.05,
      pitch: 1
    });
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].text, 'Native default check');
    assert.equal(spoken[0].voice ?? null, null, 'Expected native OS default utterance to leave voice unset/null');
    assert.equal(nativeRes?.status ?? 'settled', 'settled');

    const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
    assert.equal(appSource.includes('speakStructuredTextBrowserTts'), true);
    assert.equal(appSource.includes('isBrowserTtsSpeechSupported'), true);
  } finally {
    globalThis.SpeechSynthesisUtterance = prevUtterance;
  }
});

await runCheck('H1', 'P10-G008', 'Table runtime cache clear & mode staging clear only revoke table ObjectURLs and preserve text staging cache', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  const prevCreateUrl = globalThis.URL.createObjectURL;
  const prevRevokeUrl = globalThis.URL.revokeObjectURL;
  let seq = 0;
  const revokedUrls = [];
  const createdUrls = [];

  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    globalThis.URL.createObjectURL = () => {
      seq += 1;
      const url = `blob:h1-mock-${seq}`;
      createdUrls.push(url);
      return url;
    };
    globalThis.URL.revokeObjectURL = url => {
      revokedUrls.push(url);
    };

    const tableRec = await putAudioStagingBlob({
      mode: 'table',
      mapKey: 'vocab-001',
      part: 'word',
      engine: 'edge',
      voiceId: 'en-US-JennyNeural',
      filename: 'vocab-001.mp3',
      mimeType: 'audio/mpeg',
      blob: new Blob(['table-audio'], { type: 'audio/mpeg' })
    });
    const textRec = await putAudioStagingBlob({
      mode: 'text',
      mapKey: `rf-sha256-${'a'.repeat(64)}`,
      part: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      filename: 'text-001.mp3',
      mimeType: 'audio/mpeg',
      blob: new Blob(['text-audio'], { type: 'audio/mpeg' })
    });

    const tableUrl = await getAudioStagingObjectUrl(tableRec);
    const textUrl = await getAudioStagingObjectUrl(textRec);
    assert.ok(tableUrl && textUrl && tableUrl !== textUrl);

    // 1) Clearing Table RAM cache revokes ONLY table URL
    clearAudioStagingRuntimeCacheForMode('table');
    assert.deepEqual(revokedUrls, [tableUrl]);
    assert.equal(revokedUrls.includes(textUrl), false, 'Text ObjectURL must NOT be revoked when Table cache clears');

    // Text URL stays hot in cache (no new createObjectURL call)
    const countBeforeHit = createdUrls.length;
    const textCacheHit = await getAudioStagingObjectUrl(textRec);
    assert.equal(textCacheHit, textUrl);
    assert.equal(createdUrls.length, countBeforeHit, 'Text URL should remain a warm cache hit');

    // 2) Re-hydrate Table URL, then clear Table IDB staging completely -> still preserves Text URL + Text metadata
    const tableUrl2 = await getAudioStagingObjectUrl(tableRec);
    assert.notEqual(tableUrl2, tableUrl);
    await clearAudioStagingForMode('table', { clearHistory: true });
    assert.equal(revokedUrls.includes(tableUrl2), true);
    assert.equal(revokedUrls.includes(textUrl), false, 'clearAudioStagingForMode("table") must NOT revoke Text ObjectURL');

    const remainingTable = await listAudioStagingMetadata({ mode: 'table', includeReleased: true });
    const remainingText = await listAudioStagingMetadata({ mode: 'text', includeReleased: true });
    assert.equal(remainingTable.length, 0);
    assert.equal(remainingText.length, 1);
    assert.equal(await getAudioStagingObjectUrl(textRec), textUrl);
  } finally {
    clearAudioStagingRuntimeCacheForMode('table');
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
    globalThis.URL.createObjectURL = prevCreateUrl;
    globalThis.URL.revokeObjectURL = prevRevokeUrl;
  }
});

// ============================================================================
// WAVE H2: P10-G006, P10-G007
// ============================================================================

const seedTextLibraryDb = async ({ collections = [], documents = [], blocks = [], segments = [], audioVariants = [], counters = {} } = {}) => {
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
      tx.onerror = () => reject(tx.error || new Error('seed tx error'));
      tx.onabort = () => reject(tx.error || new Error('seed tx aborted'));
    });
    const metaStore = tx.objectStore(TEXT_LIBRARY_STORES.META);
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: TEXT_LIBRARY_SCHEMA_VERSION, updatedAt: 1 });
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.INITIALIZED, value: true, updatedAt: 1 });
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: documents[0]?.id || null, updatedAt: 1 });
    metaStore.put({ key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: counters, updatedAt: 1 });
    collections.forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.COLLECTIONS).put(item));
    documents.forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.DOCUMENTS).put(item));
    blocks.forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.BLOCKS).put(item));
    segments.forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.SEGMENTS).put(item));
    audioVariants.forEach(item => tx.objectStore(TEXT_LIBRARY_STORES.AUDIO_VARIANTS).put(item));
    await done;
  } finally {
    db.close();
  }
};

await runCheck('H2', 'P10-G006', 'DB restore & Pack Sync reconcile Staging runtime bindings, resolve immediate playback URLs, handle ID collisions, and guard stale async races', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  const prevCreateUrl = globalThis.URL.createObjectURL;
  const prevRevokeUrl = globalThis.URL.revokeObjectURL;
  let seq = 0;

  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    globalThis.URL.createObjectURL = () => `blob:h2-g006-${++seq}`;
    globalThis.URL.revokeObjectURL = () => {};

    const restoredText = 'Restored database sentence.';
    const splitRender = buildTextStructuredAudioRenderFingerprint({
      channel: 'text',
      content: restoredText,
      language: 'en-GB',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      rate: 0,
      pitch: 0
    });
    const fullArtifact = buildTextStructuredFullArtifactRecord({
      block: {
        id: 'TEXT_000010',
        documentId: 'TXTDOC_000010',
        blockType: 'paragraph',
        segments: [{ id: 'SEGMENT_000010', text: restoredText }]
      },
      channel: 'text',
      language: 'en-GB',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      rate: 0,
      pitch: 0,
      filename: 'restored-full.mp3',
      mimeType: 'audio/mpeg'
    });

    // Seed Audio Staging IDB with pre-existing blobs matching the newly restored DB
    const stagedSplit = await putTextAudioStagingBlob({
      audioVariantId: 'TXTAUDIO_000001',
      renderFingerprint: splitRender.renderFingerprint,
      documentId: 'TXTDOC_000010',
      segmentId: 'SEGMENT_000010',
      channel: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      filename: 'restored-split.mp3',
      mimeType: 'audio/mpeg',
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' })
    });
    const stagedFull = await putAudioStagingBlob({
      mode: 'text',
      mapKey: fullArtifact.fullArtifactFingerprint,
      part: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      filename: 'restored-full.mp3',
      mimeType: 'audio/mpeg',
      blob: new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'audio/mpeg' }),
      stableId: 'TEXT_000010',
      bookId: 'TXTDOC_000010',
      metadata: { representation: 'full', fullArtifactFingerprint: fullArtifact.fullArtifactFingerprint }
    });

    // Previous DB had colliding ID TXTAUDIO_000001 pointing at a DIFFERENT staging entry & cached blob URL
    const restoredSnapshot = {
      blocks: [
        {
          id: 'TEXT_000010',
          documentId: 'TXTDOC_000010',
          metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArtifact })
        }
      ],
      audioVariants: [
        {
          id: 'TXTAUDIO_000001',
          segmentId: 'SEGMENT_000010',
          channel: 'text',
          source: 'generated',
          engine: 'edge',
          voiceId: 'en-GB-SoniaNeural',
          metadata: {
            audioRenderFingerprintV1: splitRender.renderFingerprint,
            contentFingerprint: splitRender.descriptor.contentFingerprint
          }
        }
      ]
    };

    const activeRows = await listAudioStagingMetadata({ mode: 'text', includeReleased: false });
    const plan = reconcileTextAudioStagingRuntimeBindings({
      snapshot: restoredSnapshot,
      activeRecords: activeRows,
      prevRuntimeAudioUrls: {
        TXTAUDIO_000001: {
          url: 'blob:stale-old-db-url',
          stagingBacked: true,
          stagingId: 'text|TXTDOC_000001|rf-sha256-old',
          renderFingerprint: 'rf-sha256-old'
        }
      },
      prevRuntimeFullAudioUrls: {
        'full-sha256-old': { url: 'blob:stale-old-full-url', stagingBacked: true, stagingId: 'text|old-full' }
      },
      resetExisting: true
    });

    assert.equal(plan.runtimeAudioUrls.TXTAUDIO_000001?.stagingId, stagedSplit.id, 'Colliding variant ID must rebind cleanly to restored DB Staging record');
    assert.equal(plan.runtimeAudioUrls.TXTAUDIO_000001?.url, undefined, 'Stale cached ObjectURL from replaced DB must be stripped');
    assert.equal(plan.revokedUrls.includes('blob:stale-old-db-url'), true);
    assert.equal(plan.revokedUrls.includes('blob:stale-old-full-url'), true);
    assert.equal(plan.runtimeFullAudioUrls[fullArtifact.fullArtifactFingerprint]?.stagingId, stagedFull.id);
    assert.equal(plan.stagingSummary.count, 2);

    // Immediate playback resolution from rebound stagingId works with no refresh
    const playableUrl = await getAudioStagingObjectUrl(plan.runtimeAudioUrls.TXTAUDIO_000001.stagingId);
    assert.ok(playableUrl && playableUrl.startsWith('blob:h2-g006-'));

    // Incremental Pack Sync reconciles newly added variants while preserving unrelated zipFallback/valid bindings
    const syncPlan = reconcileTextAudioStagingRuntimeBindings({
      snapshot: restoredSnapshot,
      activeRecords: activeRows,
      prevRuntimeAudioUrls: {
        TXTAUDIO_000001: { ...plan.runtimeAudioUrls.TXTAUDIO_000001, zipFallback: { zipBacked: true, entry: 'fallback.mp3' } }
      },
      prevRuntimeFullAudioUrls: plan.runtimeFullAudioUrls,
      resetExisting: false
    });
    assert.equal(syncPlan.runtimeAudioUrls.TXTAUDIO_000001?.zipFallback?.entry, 'fallback.mp3');

    // Verify App.jsx wires reset + explicit rehydrate + stale-async token across Restore & Sync paths
    const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
    assert.equal(appSource.includes('structuredTextAudioStagingHydrationTokenRef'), true);
    const restoreSlice = appSource.slice(
      appSource.indexOf('const handleTextDatabaseBackupRestore ='),
      appSource.indexOf('const handleStructuredTextRuntimeHardeningAudit =')
    );
    const packSyncSlice = appSource.slice(
      appSource.indexOf('const handleTextPackAttachOrSync ='),
      appSource.indexOf('const handleTextPackImportCopy =')
    );
    assert.match(restoreSlice, /rehydrateStructuredTextAudioStagingRuntime\(result\.snapshot,\s*\{\s*resetExisting:\s*true\s*\}\)/);
    assert.match(packSyncSlice, /rehydrateStructuredTextAudioStagingRuntime\(result\.snapshot,\s*\{\s*resetExisting:\s*false\s*\}\)/);
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
    globalThis.URL.createObjectURL = prevCreateUrl;
    globalThis.URL.revokeObjectURL = prevRevokeUrl;
  }
});

await runCheck('H2', 'P10-G007', 'Portable ZIP import extracts/validates first, stages second, commits Text DB in 1 TX, preserves existing blobs, and rolls back on failure/abort', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();

    const doc = {
      id: 'TXTDOC_000001',
      collectionId: 'TXTCOL_000001',
      editorModel: TEXT_STRUCTURED_EDITOR_MODEL,
      title: 'Atomic ZIP Doc',
      documentType: 'paragraph',
      textLanguage: 'en-GB',
      meaningLanguage: 'id-ID',
      order: 1
    };
    const seg1 = { id: 'SEGMENT_000001', documentId: doc.id, blockId: 'TEXT_000001', order: 1, text: 'Alpha sentence.', meaning: 'Satu.' };
    const seg2 = { id: 'SEGMENT_000002', documentId: doc.id, blockId: 'TEXT_000001', order: 2, text: 'Beta sentence.', meaning: 'Dua.' };
    const block1 = { id: 'TEXT_000001', documentId: doc.id, blockType: 'paragraph', order: 1, title: 'Card 1', metadata: {} };
    const existingVariantRf = buildTextStructuredAudioRenderFingerprint({
      channel: 'text', content: seg1.text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0
    });
    const existingVariant = {
      id: 'TXTAUDIO_000001',
      segmentId: seg1.id,
      channel: 'text',
      source: 'generated',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      language: 'en-GB',
      metadata: {
        audioRenderFingerprintV1: existingVariantRf.renderFingerprint,
        contentFingerprint: existingVariantRf.descriptor.contentFingerprint,
        audioRenderDescriptorV1: existingVariantRf.descriptor
      }
    };
    const missingRender = buildTextStructuredAudioRenderFingerprint({
      channel: 'text', content: seg2.text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0
    });
    const baseFullArtifact = buildTextStructuredFullArtifactRecord({
      block: { ...block1, segments: [seg1, seg2] },
      channel: 'text',
      language: 'en-GB',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      rate: 0,
      pitch: 0,
      mimeType: 'audio/mpeg'
    });
    const fFull = buildCanonicalTextFullArtifactFilename({
      fullArtifactFingerprint: baseFullArtifact.fullArtifactFingerprint,
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural'
    });
    const fullArtifact = { ...baseFullArtifact, filename: fFull };

    await seedTextLibraryDb({
      collections: [{ id: 'TXTCOL_000001', name: 'Default', order: 1 }],
      documents: [doc],
      blocks: [block1],
      segments: [seg1, seg2],
      audioVariants: [existingVariant],
      counters: { collection: 1, document: 1, block: 1, segment: 2, audioVariant: 1 }
    });

    // Seed pre-existing valid Staging blob for seg1 RF (must be preserved intact on any rollback!)
    const preExistingStaging = await putTextAudioStagingBlob({
      audioVariantId: existingVariant.id,
      renderFingerprint: existingVariantRf.renderFingerprint,
      documentId: doc.id,
      segmentId: seg1.id,
      channel: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      filename: 'existing-alpha.mp3',
      mimeType: 'audio/mpeg',
      blob: new Blob(['PRE_EXISTING_VALID_BYTES'], { type: 'audio/mpeg' })
    });

    const f1 = buildCanonicalTextRenderAudioFilename({
      renderFingerprint: existingVariantRf.renderFingerprint,
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural'
    });
    const f2 = buildCanonicalTextRenderAudioFilename({
      renderFingerprint: missingRender.renderFingerprint,
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural'
    });
    const blob1 = new Blob(['ZIP_ALPHA_NEW'], { type: 'audio/mpeg' });
    const blob2 = new Blob(['ZIP_BETA_NEW'], { type: 'audio/mpeg' });
    const blobFull = new Blob(['ZIP_FULL_NEW'], { type: 'audio/mpeg' });

    const manifest = buildProLingoTextAudioManifest({
      entries: [
        {
          representation: 'split',
          rf: existingVariantRf.renderFingerprint,
          filename: f1,
          mimeType: 'audio/mpeg',
          size: blob1.size,
          render: existingVariantRf.descriptor,
          references: [{ segmentId: seg1.id, channel: 'text' }]
        },
        {
          representation: 'split',
          rf: missingRender.renderFingerprint,
          filename: f2,
          mimeType: 'audio/mpeg',
          size: blob2.size,
          render: missingRender.descriptor,
          references: [{ segmentId: seg2.id, channel: 'text' }]
        },
        {
          representation: 'full',
          fullArtifactFingerprint: fullArtifact.fullArtifactFingerprint,
          filename: fFull,
          mimeType: 'audio/mpeg',
          size: blobFull.size,
          render: fullArtifact.descriptor,
          references: [{ blockId: block1.id, channel: 'text' }]
        }
      ]
    });

    const validZipBlob = await buildStoredZipBlob([
      { filename: f1, blob: blob1 },
      { filename: f2, blob: blob2 },
      { filename: fFull, blob: blobFull },
      { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }
    ]);
    const validZipFile = Object.assign(validZipBlob, { name: 'atomic-test.zip', lastModified: Date.now() });
    const preferences = { generateText: true, generateMeaning: false, edgeTextVoiceId: 'en-GB-SoniaNeural', edgeRate: 0, edgePitch: 0 };

    const assertCleanDbBaseline = async label => {
      const snap = await readTextLibrarySnapshot();
      assert.equal(snap.audioVariants.length, 1, `${label}: expected only original 1 AudioVariant`);
      assert.equal(snap.counters.audioVariant, 1, `${label}: expected audioVariant counter unchanged`);
      assert.deepEqual(snap.blocks[0].metadata, {}, `${label}: expected block metadata without dangling Full artifacts`);
      const stageRows = await listAudioStagingMetadata({ mode: 'text', includeReleased: true });
      assert.equal(stageRows.length, 1, `${label}: expected zero orphan staging rows`);
      assert.equal(stageRows[0].id, preExistingStaging.id);
      const preservedBlob = await getAudioStagingBlob(preExistingStaging.id);
      assert.equal(await preservedBlob.text(), 'PRE_EXISTING_VALID_BYTES', `${label}: pre-existing Staging blob must remain intact`);
    };

    // (A) Corrupt/decompression failure in Phase 1 before any DB writes
    const initialSnapshot = await readTextLibrarySnapshot();
    let extractCount = 0;
    await assert.rejects(
      () => executeTextStructuredAudioZipImport({
        files: [validZipFile],
        snapshot: initialSnapshot,
        preferences,
        readZipEntryBlob: async runtime => {
          extractCount += 1;
          if (extractCount === 2) throw new Error('Corrupt deflated MP3 entry mid-archive');
          return runtime.entry ? new Blob(['OK'], { type: 'audio/mpeg' }) : null;
        }
      }),
      /Corrupt deflated MP3 entry/
    );
    await assertCleanDbBaseline('Phase 1 corrupt ZIP');

    // (B) Mid-Staging failure in Phase 2 after overwriting pre-existing Staging record
    let stageWriteCount = 0;
    await assert.rejects(
      () => executeTextStructuredAudioZipImport({
        files: [validZipFile],
        snapshot: initialSnapshot,
        preferences,
        putSplitStaging: async args => {
          stageWriteCount += 1;
          if (stageWriteCount === 2) throw new Error('Simulated IDB QuotaExceededError during Staging');
          return putTextAudioStagingBlob(args);
        }
      }),
      /QuotaExceededError/
    );
    await assertCleanDbBaseline('Phase 2 Staging failure');

    // (C) Text DB failure in Phase 3 rolls back ALL Phase 2 Staging writes & preserves existing blob
    await assert.rejects(
      () => executeTextStructuredAudioZipImport({
        files: [validZipFile],
        snapshot: initialSnapshot,
        preferences,
        commitMetadata: async () => {
          throw new Error('Simulated Text DB constraint failure');
        }
      }),
      /Simulated Text DB constraint failure/
    );
    await assertCleanDbBaseline('Phase 3 Text DB failure');

    // (D) Cancellation (AbortController) after Phase 3 commit rolls back BOTH Text DB & Staging DB
    const abortCtrl = new AbortController();
    const { executeTextZipImportMetadataCommit } = await import('../src/services/persistence/textLibraryCommandService.js');
    await assert.rejects(
      () => executeTextStructuredAudioZipImport({
        files: [validZipFile],
        snapshot: initialSnapshot,
        preferences,
        signal: abortCtrl.signal,
        commitMetadata: async args => {
          const res = await executeTextZipImportMetadataCommit(args);
          abortCtrl.abort();
          return res;
        }
      }),
      /cancelled/
    );
    await assertCleanDbBaseline('Post-commit Abort cancellation');

    // (E) Happy path commits Split + Full Staging & Split + Full Text DB metadata cleanly
    const okRes = await executeTextStructuredAudioZipImport({
      files: [validZipFile],
      snapshot: initialSnapshot,
      preferences
    });
    assert.equal(okRes.status, 'added');
    assert.equal(okRes.stagedSplitByRf.size, 2);
    assert.equal(okRes.stagedFullByFingerprint.size, 1);

    const finalSnap = await readTextLibrarySnapshot();
    assert.equal(finalSnap.audioVariants.length, 2);
    const committedFull = getTextStructuredFullAudioArtifacts(finalSnap.blocks[0]);
    assert.equal(committedFull.length, 1);
    assert.equal(committedFull[0].fullArtifactFingerprint, fullArtifact.fullArtifactFingerprint);
    const finalStaging = await listAudioStagingMetadata({ mode: 'text', includeReleased: false });
    assert.equal(finalStaging.length, 3);
    assert.equal(await (await getAudioStagingBlob(preExistingStaging.id)).text(), 'ZIP_ALPHA_NEW');
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

// ============================================================================
// Wave H3: P10-G002, P10-G003, P10-G004
// ============================================================================

await runCheck('H3', 'P10-G002', 'FROM_HERE mid-card Full playback slices to remaining segments and preserves Card 2 FULL_LOCAL', async () => {
  globalThis.navigator ||= {};
  const card1Base = {
    id: 'CARD_1',
    blockType: 'paragraph',
    title: 'Card 1',
    segments: [
      { id: 'SEG_1', text: 'Sentence one.', meaning: 'Arti satu.' },
      { id: 'SEG_2', text: 'Sentence two.', meaning: 'Arti dua.' },
      { id: 'SEG_3', text: 'Sentence three.', meaning: 'Arti tiga.' }
    ],
    metadata: {}
  };
  const card2Base = {
    id: 'CARD_2',
    blockType: 'paragraph',
    title: 'Card 2',
    segments: [
      { id: 'SEG_4', text: 'Sentence four.', meaning: 'Arti empat.' },
      { id: 'SEG_5', text: 'Sentence five.', meaning: 'Arti lima.' }
    ],
    metadata: {}
  };

  const fullArt1 = buildTextStructuredFullArtifactRecord({
    block: card1Base,
    channel: 'text',
    language: 'en-US',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    filename: 'card1-full.mp3',
    mimeType: 'audio/mpeg'
  });
  const fullArt2 = buildTextStructuredFullArtifactRecord({
    block: card2Base,
    channel: 'text',
    language: 'en-US',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    filename: 'card2-full.mp3',
    mimeType: 'audio/mpeg'
  });

  const card1 = {
    ...card1Base,
    metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArt1 })
  };
  const card2 = {
    ...card2Base,
    metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: fullArt2 })
  };
  const docTree = {
    id: 'TXTDOC_H3_G002',
    editorModel: 'structured-v1',
    title: 'H3 Mid-Card Doc',
    documentType: 'paragraph',
    textLanguage: 'en-US',
    meaningLanguage: 'id-ID',
    blocks: [card1, card2]
  };
  const runtimeFullAudio = {
    [fullArt1.fullArtifactFingerprint]: { url: 'blob:full-card1', stagingBacked: true },
    [fullArt2.fullArtifactFingerprint]: { url: 'blob:full-card2', stagingBacked: true }
  };

  // (1) Domain plan: partial slice with no Split audio falls back to FULL_TTS of remaining segments ONLY
  const ttsFallbackPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: docTree,
    block: card1,
    channel: 'text',
    segmentIds: ['SEG_2', 'SEG_3'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    runtimeFullAudio,
    fallbackVoiceId: 'en-GB-SoniaNeural',
    language: 'en-US',
    allowFullArtifact: false
  });
  assert.equal(ttsFallbackPlan.route, 'full-tts-fallback');
  assert.equal(ttsFallbackPlan.steps.length, 1);
  assert.equal(ttsFallbackPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_TTS);
  assert.equal(ttsFallbackPlan.steps[0].content, 'Sentence two. Sentence three.');
  assert.ok(!ttsFallbackPlan.steps[0].content.includes('Sentence one.'));

  // (2) Domain plan: partial slice with globalTtsOnly speaks remaining segments ONLY
  const ttsOnlyPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: docTree,
    block: card1,
    channel: 'text',
    segmentIds: ['SEG_2', 'SEG_3'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    runtimeFullAudio,
    fallbackVoiceId: 'en-GB-SoniaNeural',
    language: 'en-US',
    globalTtsOnly: true,
    allowFullArtifact: true
  });
  assert.equal(ttsOnlyPlan.route, 'full-tts-only');
  assert.equal(ttsOnlyPlan.steps[0].content, 'Sentence two. Sentence three.');

  // (3) Domain plan: partial slice with Split local audio on SEG_2 plays split-fallback (SEG_2, SEG_3), never SEG_1 or FULL_LOCAL
  const seg2Content = 'Sentence two.';
  const seg2Variant = {
    id: 'TXTAUDIO_SEG2',
    segmentId: 'SEG_2',
    channel: 'text',
    source: 'generated',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    metadata: {
      contentFingerprint: buildTextStructuredAudioContentFingerprint({ channel: 'text', content: seg2Content })
    }
  };
  const splitFallbackPlan = buildTextStructuredBlockRuntimePlaybackPlan({
    documentTree: docTree,
    block: card1,
    channel: 'text',
    segmentIds: ['SEG_2', 'SEG_3'],
    representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    audioVariants: [seg2Variant],
    runtimeAudioUrls: { TXTAUDIO_SEG2: { url: 'blob:split-seg2', stagingBacked: true } },
    runtimeFullAudio,
    fallbackVoiceId: 'en-GB-SoniaNeural',
    language: 'en-US',
    allowFullArtifact: true
  });
  assert.equal(splitFallbackPlan.route, 'split-fallback');
  assert.deepEqual(splitFallbackPlan.steps.map(s => s.segmentId), ['SEG_2', 'SEG_3']);
  assert.equal(splitFallbackPlan.steps[0].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_LOCAL);
  assert.equal(splitFallbackPlan.steps[1].type, TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.SPLIT_TTS);

  // (4) End-to-end playback session: FROM_HERE starting at SEG_2 plays remaining SEG_2..SEG_3 on Card 1 & whole FULL_LOCAL on Card 2
  const events = [];
  const harness = createPlaybackHarness();
  let resolveDone;
  const g002Done = new Promise(resolve => { resolveDone = resolve; });
  const started = executeStructuredTextPlaybackSessionService({
    documentTree: docTree,
    startSegmentId: 'SEG_2',
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE,
    ...harness,
    onPlaybackCompleted: () => resolveDone(),
    resolveBlockChannelPlaybackPlan: ({ block, fullBlock, channel, allowFullArtifact, segmentIds }) =>
      buildTextStructuredBlockRuntimePlaybackPlan({
        documentTree: docTree,
        block: fullBlock || block,
        channel,
        segmentIds,
        representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
        audioVariants: [seg2Variant],
        runtimeAudioUrls: { TXTAUDIO_SEG2: { url: 'blob:split-seg2', stagingBacked: true } },
        runtimeFullAudio,
        fallbackVoiceId: 'en-GB-SoniaNeural',
        language: 'en-US',
        allowFullArtifact
      }),
    playStructuredFullStep: async (step, block) => {
      events.push(`full:${block.id}:${step.type}:${step.content}`);
    },
    playStructuredChannel: async (content, item, _ch, meta) => {
      events.push(`split:${item.blockId}:${item.id}:${meta?.step?.type}:${content}`);
    }
  });
  assert.equal(started, true);
  await Promise.race([g002Done, sleep(2000)]);
  assert.deepEqual(events, [
    'split:CARD_1:SEG_2:split-local:Sentence two.',
    'split:CARD_1:SEG_3:split-tts:Sentence three.',
    'full:CARD_2:full-local:Sentence four. Sentence five.'
  ]);
  assert.ok(!events.some(entry => entry.includes('SEG_1') || entry.includes('Sentence one.')));
});

await runCheck('H3', 'P10-G003', 'Manual Segment/Card Loop+Split+Meaning overrides never leak into Global Next/Prev navigation', async () => {
  const items = [
    { id: 'A1', segmentId: 'A1', blockId: 'A', text: 'A1', meaning: 'MA1' },
    { id: 'A2', segmentId: 'A2', blockId: 'A', text: 'A2', meaning: 'MA2' },
    { id: 'B1', segmentId: 'B1', blockId: 'B', text: 'B1', meaning: 'MB1' },
    { id: 'B2', segmentId: 'B2', blockId: 'B', text: 'B2', meaning: 'MB2' },
    { id: 'C1', segmentId: 'C1', blockId: 'C', text: 'C1', meaning: 'MC1' },
    { id: 'C2', segmentId: 'C2', blockId: 'C', text: 'C2', meaning: 'MC2' }
  ];

  // (1) Manual SEGMENT loop in Split + Meaning-Only must NOT leak into Global Next under Full + Text-Only + Once
  const navPlanFromManual = resolveStructuredTextSmartNavPlan({
    completeList: items,
    activeDocumentId: 'DOC_G003',
    session: {
      documentId: 'DOC_G003',
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT,
      cursorSegmentId: 'A2',
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.LOOP,
      repeatCount: 4,
      orderedList: [items[1]]
    },
    savedResume: { documentId: 'DOC_G003', segmentId: 'A2', orderedList: null },
    preferences: {
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE
    },
    direction: 'next'
  });
  assert.equal(navPlanFromManual.representationMode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL);
  assert.equal(navPlanFromManual.playbackChannelMode, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY);
  assert.equal(navPlanFromManual.repeatMode, TEXT_STRUCTURED_REPEAT_MODES.ONCE);
  assert.equal(navPlanFromManual.repeatCount, null);
  assert.equal(navPlanFromManual.target.id, 'B1');

  // (2) Changed global preference (Full -> Split) takes effect even if active global session still carries old Full/Twice settings
  const navPlanUpdatedPref = resolveStructuredTextSmartNavPlan({
    completeList: items,
    activeDocumentId: 'DOC_G003',
    session: {
      documentId: 'DOC_G003',
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
      cursorSegmentId: 'A1',
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.TWICE,
      repeatCount: 2,
      orderedList: items
    },
    savedResume: { documentId: 'DOC_G003', segmentId: 'A1', orderedList: null },
    preferences: {
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE
    },
    direction: 'next'
  });
  assert.equal(navPlanUpdatedPref.representationMode, TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT);
  assert.equal(navPlanUpdatedPref.playbackChannelMode, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING);
  assert.equal(navPlanUpdatedPref.repeatMode, TEXT_STRUCTURED_REPEAT_MODES.ONCE);
  assert.equal(navPlanUpdatedPref.target.id, 'A2');

  // (3) App.jsx wires handlePlayerSmartNav via resolveStructuredTextSmartNavigationContext (not session.repeatMode / session.playbackChannelMode)
  const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  assert.match(appSource, /resolveStructuredTextSmartNavigationContext\(/);
  assert.doesNotMatch(appSource, /playbackChannelMode:\s*session\?\.playbackChannelMode/);
  assert.doesNotMatch(appSource, /repeatMode:\s*session\?\.repeatMode/);
});

await runCheck('H3', 'P10-G004', 'Switching Shuffle -> Sequential ignores stale orderedListOverride while keeping deterministic Shuffle when active', async () => {
  globalThis.navigator ||= {};
  const docTree = {
    id: 'TXTDOC_H3_G004',
    editorModel: 'structured-v1',
    title: 'H3 Order Doc',
    documentType: 'paragraph',
    textLanguage: 'en-US',
    meaningLanguage: 'id-ID',
    blocks: ['A', 'B', 'C'].map(letter => ({
      id: letter,
      blockType: 'paragraph',
      title: `Card ${letter}`,
      segments: [
        { id: `${letter}1`, text: `${letter} one.`, meaning: `${letter}1` },
        { id: `${letter}2`, text: `${letter} two.`, meaning: `${letter}2` }
      ],
      metadata: {}
    }))
  };
  const authoredItems = docTree.blocks.flatMap(b => b.segments.map(s => ({ ...s, blockId: b.id })));
  const shuffledOrder = resolveStructuredTextPlaybackOrder({
    list: authoredItems,
    orderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
    random: () => 0.99
  });
  // Rotate/reverse cards so shuffledOrder is strictly different from sequential authored order
  const reversedByCard = [
    ...authoredItems.filter(i => i.blockId === 'C'),
    ...authoredItems.filter(i => i.blockId === 'B'),
    ...authoredItems.filter(i => i.blockId === 'A')
  ];
  assert.equal(shuffledOrder.length, reversedByCard.length);

  // (1) Playback session under SEQUENTIAL ignores stale Shuffle orderedListOverride & clears cursor orderedList
  const seqPlayed = [];
  const seqCursors = [];
  const h1 = createPlaybackHarness();
  let resolveSeq;
  const seqDone = new Promise(resolve => { resolveSeq = resolve; });
  executeStructuredTextPlaybackSessionService({
    documentTree: docTree,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE,
    orderedListOverride: reversedByCard,
    onPlaybackCursor: cursor => seqCursors.push(cursor),
    onPlaybackCompleted: () => resolveSeq(),
    ...h1,
    playStructuredChannel: async (_content, item) => {
      seqPlayed.push(item.id);
    }
  });
  await Promise.race([seqDone, sleep(2000)]);
  assert.deepEqual(seqPlayed, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.ok(seqCursors.length > 0 && seqCursors.every(c => c.orderedList === null));

  // (2) Playback session under SHUFFLE honours explicit frozen orderedListOverride
  const shufPlayed = [];
  const shufCursors = [];
  const h2 = createPlaybackHarness();
  let resolveShuf;
  const shufDone = new Promise(resolve => { resolveShuf = resolve; });
  executeStructuredTextPlaybackSessionService({
    documentTree: docTree,
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
    playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
    playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT,
    repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE,
    orderedListOverride: reversedByCard,
    onPlaybackCursor: cursor => shufCursors.push(cursor),
    onPlaybackCompleted: () => resolveShuf(),
    ...h2,
    playStructuredChannel: async (_content, item) => {
      shufPlayed.push(item.id);
    }
  });
  await Promise.race([shufDone, sleep(2000)]);
  assert.deepEqual(shufPlayed, ['C1', 'C2', 'B1', 'B2', 'A1', 'A2']);
  assert.ok(shufCursors.length > 0 && shufCursors.every(c => Array.isArray(c.orderedList)));

  // (3) Smart Nav under SEQUENTIAL discards stale Shuffle session/saved lists and advances sequentially
  const navSeq = resolveStructuredTextSmartNavPlan({
    completeList: authoredItems,
    activeDocumentId: docTree.id,
    session: { documentId: docTree.id, scope: 'document', cursorSegmentId: 'A1', playbackOrderMode: 'shuffle', orderedList: reversedByCard },
    savedResume: { documentId: docTree.id, segmentId: 'A1', orderedList: reversedByCard },
    preferences: {
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE
    },
    direction: 'next'
  });
  assert.equal(navSeq.orderedListOverride, null);
  assert.equal(navSeq.persistedOrderedList, null);
  assert.equal(navSeq.target.id, 'B1');

  // (4) Smart Nav under SHUFFLE preserves frozen Shuffle order
  const navShuf = resolveStructuredTextSmartNavPlan({
    completeList: authoredItems,
    activeDocumentId: docTree.id,
    savedResume: { documentId: docTree.id, segmentId: 'C1', orderedList: reversedByCard },
    preferences: {
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      playbackOrderMode: TEXT_STRUCTURED_ORDER_MODES.SHUFFLE,
      playbackChannelMode: TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
      repeatMode: TEXT_STRUCTURED_REPEAT_MODES.ONCE
    },
    direction: 'next'
  });
  assert.deepEqual(navShuf.orderedListOverride.map(i => i.id), reversedByCard.map(i => i.id));
  assert.equal(navShuf.target.id, 'B1');

  // (5) Check App.jsx clears resume orderedList on order change & gates handlePlayerGlobalPlay
  const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  assert.match(appSource, /hasOwnProperty\.call\(patch,\s*'playbackOrderMode'\)/);
  assert.match(appSource, /textStructuredPreferences\.playbackOrderMode === TEXT_STRUCTURED_ORDER_MODES\.SHUFFLE\s*&&\s*Array\.isArray\(saved\.orderedList\)/);
});

const failed = results.filter(r => !r.ok);
console.log(`\nP10 H1-H3 REMEDIATION CHECKS: ${results.length - failed.length} PASS, ${failed.length} FAIL (${results.length} total)`);
if (failed.length > 0) process.exitCode = 1;
