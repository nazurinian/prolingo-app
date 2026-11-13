import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clearAudioStagingRuntimeCacheForMode,
  getAudioStagingBlob,
  listAudioStagingMetadata
} from '../src/services/persistence/audioStagingIndexedDbService.js';
import {
  putTextAudioStagingBlob,
  putTextFullAudioStagingBlob,
  rollbackTextAudioStagingBatch
} from '../src/services/persistence/textAudioStagingService.js';
import {
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LIBRARY_STORES,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../src/constants/textDatabaseConstants.js';
import {
  executeTextAudioImportRollback,
  executeTextZipImportMetadataCommit
} from '../src/services/persistence/textLibraryCommandService.js';
import {
  openTextLibraryDatabase,
  readTextLibrarySnapshot
} from '../src/services/persistence/textLibraryIndexedDbService.js';
import { buildTextStructuredAudioRenderFingerprint } from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  buildCanonicalTextFullArtifactFilename,
  buildCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  buildProLingoTextAudioManifest,
  parseProLingoTextAudioManifestJson,
  TEXT_AUDIO_MANIFEST_FILENAME
} from '../src/domain/text/textAudioManifestDomain.js';
import { TEXT_AUDIO_INDEX_FILENAME } from '../src/domain/text/textAudioIndexDomain.js';
import { buildTextStructuredBatchWorkspaceSelection } from '../src/domain/text/textStructuredBatchDomain.js';
import { buildTextStructuredAudioCoverageMap } from '../src/domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import { buildStoredZipBlob } from '../src/services/audio/browserZipService.js';
import { scanTextStructuredAudioZipFiles } from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import {
  executeStructuredTextBatchConsolidatedZipExport,
  executeStructuredTextBatchReadyMp3Export,
  executeStructuredTextCardZipExport,
  executeStructuredTextFullCardAudioExport,
  TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS
} from '../src/services/audio/textStructuredCardExportService.js';
import {
  createTextStructuredAudioZipImportCoordinator,
  executeTextStructuredAudioZipImport,
  rollbackCompletedTextStructuredAudioZipImport
} from '../src/services/audio/textStructuredAudioZipImportService.js';

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
    if (!dbs.has(name)) dbs.set(name, { stores: new Map() });
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

const makeExportFixtureWorld = () => {
  const preferences = {
    edgeTextVoiceId: 'en-GB-SoniaNeural',
    edgeMeaningVoiceId: 'id-ID-GadisNeural',
    edgeRate: 0,
    edgePitch: 0,
    generateText: true,
    generateMeaning: false
  };
  const seg1 = { id: 'SEGMENT_000001', uid: 'seg-uid-1', documentId: 'TXTDOC_000001', blockId: 'TEXT_000001', order: 1, text: 'Hello morning.', meaning: '', joinAfter: 'space' };
  const seg2 = { id: 'SEGMENT_000002', uid: 'seg-uid-2', documentId: 'TXTDOC_000001', blockId: 'TEXT_000001', order: 2, text: 'Blue sky.', meaning: '', joinAfter: 'space' };
  const seg3 = { id: 'SEGMENT_000003', uid: 'seg-uid-3', documentId: 'TXTDOC_000001', blockId: 'TEXT_000002', order: 1, text: 'Hello morning.', meaning: '', joinAfter: 'space' };
  const seg4 = { id: 'SEGMENT_000004', uid: 'seg-uid-4', documentId: 'TXTDOC_000001', blockId: 'TEXT_000002', order: 2, text: 'Blue sky.', meaning: '', joinAfter: 'space' };
  const convSeg = { id: 'SEGMENT_000005', uid: 'seg-uid-5', documentId: 'TXTDOC_000001', blockId: 'TEXT_000003', order: 1, speaker: 'Alice', text: 'Conversation line.', meaning: 'Percakapan.' };

  const rf1 = buildTextStructuredAudioRenderFingerprint({ channel: 'text', content: seg1.text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const rf2 = buildTextStructuredAudioRenderFingerprint({ channel: 'text', content: seg2.text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });

  const block1Base = { id: 'TEXT_000001', uid: 'blk-uid-1', documentId: 'TXTDOC_000001', blockType: 'paragraph', order: 1, title: 'Paragraph 1', segments: [seg1, seg2], metadata: {} };
  const block2Base = { id: 'TEXT_000002', uid: 'blk-uid-2', documentId: 'TXTDOC_000001', blockType: 'paragraph', order: 2, title: 'Paragraph 2 (Identical)', segments: [seg3, seg4], metadata: {} };
  const convBlock = { id: 'TEXT_000003', uid: 'blk-uid-3', documentId: 'TXTDOC_000001', blockType: 'conversation', order: 3, title: 'Conversation 3', segments: [convSeg], metadata: {} };

  const readyFull = buildTextStructuredFullArtifactRecord({
    block: block1Base,
    channel: 'text',
    language: 'en-GB',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0,
    filename: buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: buildTextStructuredFullArtifactRecord({ block: block1Base, channel: 'text', language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 }).fullArtifactFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' }),
    mimeType: 'audio/mpeg'
  });
  const staleFull = buildTextStructuredFullArtifactRecord({
    block: { ...block1Base, segments: [{ ...seg1, text: 'Outdated text before edit.' }, seg2] },
    channel: 'text',
    language: 'en-GB',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0,
    filename: 'stale-full.mp3',
    mimeType: 'audio/mpeg'
  });
  const wrongVoiceFull = buildTextStructuredFullArtifactRecord({
    block: block1Base,
    channel: 'text',
    language: 'en-GB',
    engine: 'edge',
    voiceId: 'en-GB-RyanNeural',
    rate: 0,
    pitch: 0,
    filename: 'wrong-voice-full.mp3',
    mimeType: 'audio/mpeg'
  });

  // Note: Card 1 gets Ready Full + Stale Full + Mismatched Voice Full + Metadata-Only Full
  // (we omit metadata-only from runtimeFullAudio; Card 2 gets identical Ready Full metadata!)
  const wrongRateFull = buildTextStructuredFullArtifactRecord({
    block: block1Base,
    channel: 'text',
    language: 'en-GB',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 15,
    pitch: 0,
    filename: 'metadata-only-rate15.mp3',
    mimeType: 'audio/mpeg'
  });

  let b1Meta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: staleFull });
  b1Meta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: b1Meta, artifact: wrongVoiceFull });
  b1Meta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: b1Meta, artifact: wrongRateFull });
  b1Meta = buildTextStructuredFullAudioArtifactsMetadata({ metadata: b1Meta, artifact: readyFull });

  const block1 = { ...block1Base, metadata: b1Meta };
  const block2 = { ...block2Base, metadata: buildTextStructuredFullAudioArtifactsMetadata({ metadata: {}, artifact: readyFull }) };

  const variants = [
    { id: 'TXTAUDIO_000001', segmentId: seg1.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', filename: buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf1.renderFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' }), metadata: { audioRenderFingerprintV1: rf1.renderFingerprint, contentFingerprint: rf1.descriptor.contentFingerprint, audioRenderDescriptorV1: rf1.descriptor } },
    { id: 'TXTAUDIO_000002', segmentId: seg2.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', filename: buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf2.renderFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' }), metadata: { audioRenderFingerprintV1: rf2.renderFingerprint, contentFingerprint: rf2.descriptor.contentFingerprint, audioRenderDescriptorV1: rf2.descriptor } },
    { id: 'TXTAUDIO_000003', segmentId: seg3.id, channel: 'text', source: 'generated', engine: 'edge', voiceId: 'en-GB-SoniaNeural', filename: buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf1.renderFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' }), metadata: { audioRenderFingerprintV1: rf1.renderFingerprint, contentFingerprint: rf1.descriptor.contentFingerprint, audioRenderDescriptorV1: rf1.descriptor } }
  ];
  const documentTree = {
    id: 'TXTDOC_000001',
    uid: 'doc-uid-1',
    title: 'Export Fixture Doc',
    editorModel: 'structured-v1',
    documentType: 'mixed',
    textLanguage: 'en-GB',
    meaningLanguage: 'id-ID',
    blocks: [block1, block2, convBlock]
  };

  const blobByStagingId = new Map([
    ['stage-split-1', new Blob([new Uint8Array([0xff, 0xfb, 1, 1, 1])], { type: 'audio/mpeg' })],
    ['stage-split-2', new Blob([new Uint8Array([0xff, 0xfb, 2, 2, 2, 2])], { type: 'audio/mpeg' })],
    ['stage-full-ready', new Blob([new Uint8Array([0xff, 0xfb, 9, 9, 9, 9, 9, 9])], { type: 'audio/mpeg' })],
    ['stage-full-stale', new Blob([new Uint8Array([0xff, 0xfb, 7, 7])], { type: 'audio/mpeg' })],
    ['stage-full-ryan', new Blob([new Uint8Array([0xff, 0xfb, 8, 8])], { type: 'audio/mpeg' })]
  ]);
  const runtimeAudioUrls = {
    TXTAUDIO_000001: { stagingBacked: true, stagingId: 'stage-split-1', filename: variants[0].filename, mimeType: 'audio/mpeg', renderFingerprint: rf1.renderFingerprint },
    TXTAUDIO_000002: { stagingBacked: true, stagingId: 'stage-split-2', filename: variants[1].filename, mimeType: 'audio/mpeg', renderFingerprint: rf2.renderFingerprint },
    TXTAUDIO_000003: { stagingBacked: true, stagingId: 'stage-split-1', filename: variants[0].filename, mimeType: 'audio/mpeg', renderFingerprint: rf1.renderFingerprint }
  };
  const runtimeFullAudio = {
    [readyFull.fullArtifactFingerprint]: { stagingBacked: true, stagingId: 'stage-full-ready', filename: readyFull.filename, mimeType: 'audio/mpeg' },
    [staleFull.fullArtifactFingerprint]: { stagingBacked: true, stagingId: 'stage-full-stale', filename: staleFull.filename, mimeType: 'audio/mpeg' },
    [wrongVoiceFull.fullArtifactFingerprint]: { stagingBacked: true, stagingId: 'stage-full-ryan', filename: wrongVoiceFull.filename, mimeType: 'audio/mpeg' }
    // wrongRateFull intentionally omitted -> metadata-only!
  };

  return {
    documentTree,
    preferences,
    variants,
    readyFull,
    staleFull,
    wrongVoiceFull,
    wrongRateFull,
    runtimeAudioUrls,
    runtimeFullAudio,
    blobByStagingId,
    readBlob: async runtime => blobByStagingId.get(runtime?.stagingId) || null
  };
};

// ============================================================================
// H5-A: P10-G014 Card & Legacy Batch Ready Edge Full Export
// ============================================================================
await runCheck('H5-A', 'P10-G014-CardZip', 'Card ZIP packages Ready Split + active Ready Edge Full MP3 + v2 manifest while excluding stale/mismatched/metadata-only Full artifacts', async () => {
  const w = makeExportFixtureWorld();
  const covMap = buildTextStructuredAudioCoverageMap({
    documentTree: w.documentTree,
    audioVariants: w.variants,
    runtimeAudioUrls: w.runtimeAudioUrls,
    preferences: w.preferences
  });
  const resolveManualReadySlot = (segmentId, channel = 'text') => {
    const key = buildTextStructuredRuntimeAudioKey(segmentId, channel);
    const coverage = covMap[key];
    if (!coverage || coverage.status !== 'ready') return null;
    const variant = w.variants.find(v => v.id === coverage.variantId);
    const runtime = w.runtimeAudioUrls[variant.id];
    return { key, coverage, variant, runtime };
  };

  const exportedStagingCalls = [];
  let builtZipBlob = null;
  let capturedEntries = [];
  const res = await executeStructuredTextCardZipExport({
    documentTree: w.documentTree,
    blockId: 'TEXT_000001',
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveManualReadySlot,
    readBlob: w.readBlob,
    markStagingExported: async (ids, meta) => { exportedStagingCalls.push({ ids, meta }); },
    triggerZipDownload: async ({ entries, filename }) => {
      capturedEntries = entries;
      builtZipBlob = await buildStoredZipBlob(entries);
      return { status: 'download-triggered', filename, fileCount: entries.length, size: builtZipBlob.size };
    }
  });

  assert.equal(res.status, 'completed');
  assert.equal(res.splitPhysical, 2);
  assert.equal(res.fullPhysical, 1);
  assert.equal(res.physical, 3);
  assert.ok(builtZipBlob instanceof Blob && builtZipBlob.size > 0);
  const entryNames = capturedEntries.map(e => e.filename);
  assert.equal(entryNames.includes(w.readyFull.filename), true);
  assert.equal(entryNames.includes(w.staleFull.filename), false);
  assert.equal(entryNames.includes(w.wrongVoiceFull.filename), false);
  assert.equal(entryNames.includes(w.wrongRateFull.filename), false);
  assert.equal(entryNames.includes(TEXT_AUDIO_MANIFEST_FILENAME), true);
  assert.equal(entryNames.includes(TEXT_AUDIO_INDEX_FILENAME), true);

  const manifestEntry = capturedEntries.find(e => e.filename === TEXT_AUDIO_MANIFEST_FILENAME);
  const parsedManifest = parseProLingoTextAudioManifestJson(await manifestEntry.blob.text());
  assert.equal(parsedManifest.entries.length, 3);
  const fullManifestEntry = parsedManifest.entries.find(e => e.representation === 'full');
  assert.equal(fullManifestEntry.fullArtifactFingerprint, w.readyFull.fullArtifactFingerprint);
  assert.equal(fullManifestEntry.rf, null);

  // Round-trip inspect the generated real ZIP bytes using Production ZIP scanner!
  const zipFile = Object.assign(builtZipBlob, { name: res.filename, lastModified: Date.now() });
  const roundtripScan = await scanTextStructuredAudioZipFiles({
    files: [zipFile],
    audioVariants: w.variants,
    segments: w.documentTree.blocks.flatMap(b => b.segments),
    blocks: w.documentTree.blocks,
    documents: [w.documentTree]
  });
  assert.equal(roundtripScan.fullMatchedCount, 2); // 1 deduplicated Full MP3 resolves both identical Card 1 and Card 2!
  assert.equal(roundtripScan.fullMatches.every(m => m.fullArtifactFingerprint === w.readyFull.fullArtifactFingerprint), true);
  assert.equal(roundtripScan.orphanCount, 0);
  assert.equal(exportedStagingCalls.length, 1);
  assert.deepEqual(new Set(exportedStagingCalls[0].ids), new Set(['stage-split-1', 'stage-split-2', 'stage-full-ready']));

  // Full-only card (0 Split ready on Card 2, only seg3 ready on seg1 missing on seg4) -> when no Split is ready
  const fullOnlyRes = await executeStructuredTextCardZipExport({
    documentTree: w.documentTree,
    blockId: 'TEXT_000002',
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveManualReadySlot: () => null,
    readBlob: w.readBlob,
    markStagingExported: async () => {},
    triggerZipDownload: async ({ entries, filename }) => ({ status: 'download-triggered', filename, entries })
  });
  assert.equal(fullOnlyRes.status, 'completed');
  assert.equal(fullOnlyRes.splitPhysical, 0);
  assert.equal(fullOnlyRes.fullPhysical, 1);

  // Bilingual card with ungenerated meaning channel still blocks strict ZIP while partial option packages Ready Split + Ready Full
  const bilingualTree = {
    ...w.documentTree,
    blocks: [{ ...w.documentTree.blocks[0], segments: w.documentTree.blocks[0].segments.map(s => ({ ...s, meaning: 'Arti.' })) }]
  };
  const blockedRes = await executeStructuredTextCardZipExport({
    documentTree: bilingualTree,
    blockId: 'TEXT_000001',
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveManualReadySlot,
    readBlob: w.readBlob,
    markStagingExported: async () => {},
    triggerZipDownload: async ({ entries, filename }) => ({ status: 'download-triggered', filename, entries })
  });
  assert.equal(blockedRes.status, 'incomplete');
  assert.equal(blockedRes.missing, 2);

  const partialRes = await executeStructuredTextCardZipExport({
    documentTree: bilingualTree,
    blockId: 'TEXT_000001',
    options: { partial: true },
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveManualReadySlot,
    readBlob: w.readBlob,
    markStagingExported: async () => {},
    triggerZipDownload: async ({ entries, filename }) => ({ status: 'download-triggered', filename, entries })
  });
  assert.equal(partialRes.status, 'completed');
  assert.equal(partialRes.splitPhysical, 2);
  assert.equal(partialRes.fullPhysical, 1);
});

await runCheck('H5-A', 'P10-G014-FullCard', 'Full Card Audio Export prefers matching Ready Edge Full MP3 and falls back to derived WAV only when absent/stale/mismatched', async () => {
  const w = makeExportFixtureWorld();
  const covMap = buildTextStructuredAudioCoverageMap({
    documentTree: w.documentTree,
    audioVariants: w.variants,
    runtimeAudioUrls: w.runtimeAudioUrls,
    preferences: w.preferences
  });
  const resolveManualReadySlot = (segmentId, channel = 'text') => {
    const key = buildTextStructuredRuntimeAudioKey(segmentId, channel);
    const coverage = covMap[key];
    if (!coverage || coverage.status !== 'ready') return null;
    const variant = w.variants.find(v => v.id === coverage.variantId);
    return { key, coverage, variant, runtime: w.runtimeAudioUrls[variant.id] };
  };

  let derivedCalls = 0;
  const downloads = [];
  const stagingMarks = [];
  const resFull = await executeStructuredTextFullCardAudioExport({
    documentTree: w.documentTree,
    blockId: 'TEXT_000001',
    channel: 'text',
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveManualReadySlot,
    readBlob: w.readBlob,
    buildDerivedWav: async () => { derivedCalls += 1; return { blob: new Blob(['WAV']), segmentCount: 2 }; },
    triggerFileDownload: (blob, filename) => downloads.push({ blob, filename }),
    markStagingExported: async (id, meta) => stagingMarks.push({ id, meta })
  });
  assert.equal(resFull.status, 'download-triggered');
  assert.equal(resFull.source, 'ready-full-edge');
  assert.equal(derivedCalls, 0);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, w.readyFull.filename);
  assert.deepEqual(new Uint8Array(await downloads[0].blob.arrayBuffer()), new Uint8Array([0xff, 0xfb, 9, 9, 9, 9, 9, 9]));
  assert.equal(stagingMarks[0].id, 'stage-full-ready');

  // Remove ONLY the Ready Full runtime (leaving staleFull and wrongVoiceFull in metadata + runtimeFullAudio!) -> must NOT use stale/wrongVoiceFull, must fall back to derived WAV!
  const staleOnlyRuntime = {
    [w.staleFull.fullArtifactFingerprint]: w.runtimeFullAudio[w.staleFull.fullArtifactFingerprint],
    [w.wrongVoiceFull.fullArtifactFingerprint]: w.runtimeFullAudio[w.wrongVoiceFull.fullArtifactFingerprint]
  };
  const fallbackRes = await executeStructuredTextFullCardAudioExport({
    documentTree: w.documentTree,
    blockId: 'TEXT_000001',
    channel: 'text',
    preferences: w.preferences,
    runtimeFullAudio: staleOnlyRuntime,
    resolveManualReadySlot,
    readBlob: w.readBlob,
    buildDerivedWav: async ({ blobs }) => {
      derivedCalls += 1;
      assert.equal(blobs.length, 2);
      return { blob: new Blob(['DERIVED_WAV']), segmentCount: blobs.length };
    },
    triggerFileDownload: (blob, filename) => downloads.push({ blob, filename })
  });
  assert.equal(fallbackRes.status, 'download-triggered');
  assert.equal(fallbackRes.source, 'derived-split-wav');
  assert.equal(derivedCalls, 1);
  assert.match(downloads[1].filename, /__FULL_EN__DERIVED\.wav$/);
});

await runCheck('H5-A', 'P10-G014-Batch', 'Legacy Batch Ready MP3 & Consolidated ZIP include deduplicated Ready Edge Full artifacts and exclude stale/mismatched artifacts', async () => {
  const w = makeExportFixtureWorld();
  const covMap = buildTextStructuredAudioCoverageMap({
    documentTree: w.documentTree,
    audioVariants: w.variants,
    runtimeAudioUrls: w.runtimeAudioUrls,
    preferences: w.preferences
  });
  const batchSelection = buildTextStructuredBatchWorkspaceSelection({
    documentTrees: [w.documentTree],
    preferences: w.preferences,
    coverageMapsByDocument: { [w.documentTree.id]: covMap },
    activeDocumentId: w.documentTree.id
  });
  const resolveBatchReadySlot = slot => {
    const coverage = slot?.coverage;
    if (!coverage || coverage.status !== 'ready') return null;
    const variant = w.variants.find(v => v.id === coverage.variantId);
    return { key: slot.key, coverage, variant, runtime: w.runtimeAudioUrls[variant.id] };
  };

  // 1) Batch Ready MP3: Card 1 and Card 2 share the SAME Ready Full fingerprint -> must download Full MP3 ONCE!
  const downloadedFiles = [];
  const mp3Res = await executeStructuredTextBatchReadyMp3Export({
    batchSelection,
    targetTrees: [w.documentTree],
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveBatchReadySlot,
    readBlob: w.readBlob,
    triggerFileDownload: (blob, filename) => downloadedFiles.push({ filename, size: blob.size }),
    markStagingExported: async () => {}
  });
  assert.equal(mp3Res.splitPhysical, 2);
  assert.equal(mp3Res.fullPhysical, 1);
  assert.equal(downloadedFiles.length, 3);
  assert.equal(downloadedFiles.filter(f => f.filename === w.readyFull.filename).length, 1);

  // 2) Batch Consolidated Partial ZIP -> real ZIP blob & manifest contains deduplicated Full with 2 card references
  let zipPayloadEntries = [];
  let zipBlob = null;
  const zipRes = await executeStructuredTextBatchConsolidatedZipExport({
    partial: true,
    batchSelection,
    targetTrees: [w.documentTree],
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    resolveBatchReadySlot,
    readBlob: w.readBlob,
    markStagingExported: async () => {},
    triggerZipDownload: async ({ entries, filename }) => {
      zipPayloadEntries = entries;
      zipBlob = await buildStoredZipBlob(entries);
      return { status: 'download-triggered', filename, size: zipBlob.size };
    }
  });
  assert.equal(zipRes.status, 'completed');
  assert.equal(zipRes.chunks.length, 1);
  assert.equal(zipRes.chunks[0].splitPhysical, 2);
  assert.equal(zipRes.chunks[0].fullPhysical, 1);
  const audioNames = zipPayloadEntries.filter(e => e.filename.endsWith('.mp3')).map(e => e.filename);
  assert.equal(audioNames.length, 3);
  assert.equal(audioNames.includes(w.staleFull.filename), false);
  assert.equal(audioNames.includes(w.wrongVoiceFull.filename), false);

  const manifest = parseProLingoTextAudioManifestJson(await zipPayloadEntries.find(e => e.filename === TEXT_AUDIO_MANIFEST_FILENAME).blob.text());
  const fullEntry = manifest.entries.find(e => e.representation === 'full');
  assert.equal(fullEntry.references.length, 2);
  assert.deepEqual(fullEntry.references.map(r => r.cardId).sort(), ['TEXT_000001', 'TEXT_000002']);

  const csvText = await zipPayloadEntries.find(e => e.filename === TEXT_AUDIO_INDEX_FILENAME).blob.text();
  assert.match(csvText, /,full,/);
});

// ============================================================================
// H5-B: P10-G016 Multi-Part ZIP Pacing & Deterministic Chunk Integrity
// ============================================================================
await runCheck('H5-B', 'P10-G016', 'Multi-part ZIP export emits sequential PART_01..PART_0N in order with wave delay strictly between parts and 0 delay for single-part ZIP', async () => {
  const w = makeExportFixtureWorld();
  const covMap = buildTextStructuredAudioCoverageMap({
    documentTree: w.documentTree,
    audioVariants: w.variants,
    runtimeAudioUrls: w.runtimeAudioUrls,
    preferences: w.preferences
  });
  const batchSelection = buildTextStructuredBatchWorkspaceSelection({
    documentTrees: [w.documentTree],
    preferences: w.preferences,
    coverageMapsByDocument: { [w.documentTree.id]: covMap },
    activeDocumentId: w.documentTree.id
  });
  const resolveBatchReadySlot = slot => {
    const coverage = slot?.coverage;
    if (!coverage || coverage.status !== 'ready') return null;
    const variant = w.variants.find(v => v.id === coverage.variantId);
    return { key: slot.key, coverage, variant, runtime: w.runtimeAudioUrls[variant.id] };
  };

  // Single-part -> zero waits
  const singleWaits = [];
  await executeStructuredTextBatchConsolidatedZipExport({
    partial: true,
    batchSelection,
    targetTrees: [w.documentTree],
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    maxBytes: 64 * 1024 * 1024,
    resolveBatchReadySlot,
    readBlob: w.readBlob,
    wait: async ms => singleWaits.push(ms),
    markStagingExported: async () => {},
    triggerZipDownload: async ({ entries, filename }) => ({ filename, fileCount: entries.length })
  });
  assert.equal(singleWaits.length, 0);

  // Multi-part (maxBytes = 7 splits 3 files [5, 6, 8 bytes] into 3 parts!) -> strictly 2 waits of 350ms
  const multiWaits = [];
  const multiTriggers = [];
  const multiRes = await executeStructuredTextBatchConsolidatedZipExport({
    partial: true,
    batchSelection,
    targetTrees: [w.documentTree],
    preferences: w.preferences,
    runtimeFullAudio: w.runtimeFullAudio,
    maxBytes: 7,
    resolveBatchReadySlot,
    readBlob: w.readBlob,
    wait: async ms => multiWaits.push(ms),
    markStagingExported: async () => {},
    triggerZipDownload: async ({ entries, filename }) => {
      multiTriggers.push({ filename, audio: entries.filter(e => e.filename.endsWith('.mp3')).map(e => e.filename) });
      return { filename };
    }
  });
  assert.equal(multiRes.chunks.length, 3);
  assert.deepEqual(multiWaits, [TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS, TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS]);
  assert.match(multiTriggers[0].filename, /PART_01\.zip$/);
  assert.match(multiTriggers[1].filename, /PART_02\.zip$/);
  assert.match(multiTriggers[2].filename, /PART_03\.zip$/);
  const allPackaged = multiTriggers.flatMap(t => t.audio);
  assert.equal(new Set(allPackaged).size, 3);
  assert.equal(allPackaged.length, 3);

  // Verify App.jsx handleStructuredTextBulkExport also guards multi-part loops (AUDIO_ONLY_ZIP & PORTABLE_ZIP)
  const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  const bulkFn = appSource.slice(appSource.indexOf('const handleStructuredTextBulkExport ='), appSource.indexOf('const handleStructuredTextEdgeHealthCheck ='));
  assert.match(bulkFn, /if\s*\(\s*chunkIndex\s*>\s*0\s*\)\s*await new Promise\(resolve => setTimeout\(resolve,\s*TEXT_MULTI_PART_ZIP_WAVE_DELAY_MS\)\)/);
});

// ============================================================================
// H5-C: H2 Rollback Safety Follow-Up (All 6 Failure & Concurrency Scenarios)
// ============================================================================
const buildImportTestEnv = async () => {
  const doc1 = {
    id: 'TXTDOC_000001',
    collectionId: 'TXTCOL_000001',
    editorModel: TEXT_STRUCTURED_EDITOR_MODEL,
    title: 'Doc 1',
    documentType: 'paragraph',
    textLanguage: 'en-GB',
    meaningLanguage: 'id-ID',
    order: 1
  };
  const seg1 = { id: 'SEGMENT_000001', documentId: doc1.id, blockId: 'TEXT_000001', order: 1, text: 'Alpha one.', meaning: 'Satu.' };
  const seg2 = { id: 'SEGMENT_000002', documentId: doc1.id, blockId: 'TEXT_000001', order: 2, text: 'Beta two.', meaning: 'Dua.' };
  const block1 = { id: 'TEXT_000001', documentId: doc1.id, blockType: 'paragraph', order: 1, title: 'Card 1', metadata: {} };
  const preferences = { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0, generateText: true, generateMeaning: false };

  const rf1 = buildTextStructuredAudioRenderFingerprint({ channel: 'text', content: seg1.text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const rf2 = buildTextStructuredAudioRenderFingerprint({ channel: 'text', content: seg2.text, language: 'en-GB', engine: 'edge', voiceId: 'en-GB-SoniaNeural', rate: 0, pitch: 0 });
  const existingVariant = {
    id: 'TXTAUDIO_000001',
    segmentId: seg1.id,
    channel: 'text',
    source: 'generated',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    language: 'en-GB',
    metadata: { audioRenderFingerprintV1: rf1.renderFingerprint, contentFingerprint: rf1.descriptor.contentFingerprint, audioRenderDescriptorV1: rf1.descriptor }
  };
  const fullArt = buildTextStructuredFullArtifactRecord({
    block: { ...block1, segments: [seg1, seg2] },
    channel: 'text',
    language: 'en-GB',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    rate: 0,
    pitch: 0,
    mimeType: 'audio/mpeg'
  });
  const f1 = buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf1.renderFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' });
  const f2 = buildCanonicalTextRenderAudioFilename({ renderFingerprint: rf2.renderFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' });
  const fFull = buildCanonicalTextFullArtifactFilename({ fullArtifactFingerprint: fullArt.fullArtifactFingerprint, engine: 'edge', voiceId: 'en-GB-SoniaNeural' });

  await seedTextLibraryDb({
    collections: [{ id: 'TXTCOL_000001', name: 'Default', order: 1 }],
    documents: [doc1],
    blocks: [block1],
    segments: [seg1, seg2],
    audioVariants: [existingVariant],
    counters: { collection: 1, document: 1, block: 1, segment: 2, audioVariant: 1 }
  });
  const preExistingStaging = await putTextAudioStagingBlob({
    audioVariantId: existingVariant.id,
    renderFingerprint: rf1.renderFingerprint,
    documentId: doc1.id,
    segmentId: seg1.id,
    channel: 'text',
    engine: 'edge',
    voiceId: 'en-GB-SoniaNeural',
    filename: f1,
    mimeType: 'audio/mpeg',
    blob: new Blob(['PRE_EXISTING_ALPHA'], { type: 'audio/mpeg' })
  });

  const manifest = buildProLingoTextAudioManifest({
    entries: [
      { representation: 'split', rf: rf1.renderFingerprint, filename: f1, mimeType: 'audio/mpeg', size: 15, render: rf1.descriptor, references: [{ segmentId: seg1.id, channel: 'text' }] },
      { representation: 'split', rf: rf2.renderFingerprint, filename: f2, mimeType: 'audio/mpeg', size: 12, render: rf2.descriptor, references: [{ segmentId: seg2.id, channel: 'text' }] },
      { representation: 'full', fullArtifactFingerprint: fullArt.fullArtifactFingerprint, filename: fFull, mimeType: 'audio/mpeg', size: 13, render: fullArt.descriptor, references: [{ blockId: block1.id, channel: 'text' }] }
    ],
    source: { kind: 'h5-test-archive' }
  });
  const zipBlob = await buildStoredZipBlob([
    { filename: f1, blob: new Blob(['NEW_ALPHA_BYTES'], { type: 'audio/mpeg' }) },
    { filename: f2, blob: new Blob(['NEW_BETA_TWO'], { type: 'audio/mpeg' }) },
    { filename: fFull, blob: new Blob(['NEW_FULL_CARD'], { type: 'audio/mpeg' }) },
    { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }
  ]);
  const zipFile = Object.assign(zipBlob, { name: 'h5-test.zip', lastModified: Date.now() });

  return { doc1, seg1, seg2, block1, preferences, rf1, rf2, existingVariant, fullArt, f1, f2, fFull, preExistingStaging, zipFile };
};

await runCheck('H5-C', 'Scenario-1', 'Metadata rollback failure still rolls back Staging IDB, marks cleanRollback=false & residualRisk=true, and App never claims clean rollback', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    const env = await buildImportTestEnv();
    const snapshot = await readTextLibrarySnapshot();
    const controller = new AbortController();

    let caught = null;
    try {
      await executeTextStructuredAudioZipImport({
        files: [env.zipFile],
        snapshot,
        preferences: env.preferences,
        signal: controller.signal,
        commitMetadata: async payloads => {
          const committed = await executeTextZipImportMetadataCommit(payloads);
          controller.abort(new Error('Simulated abort after commit'));
          return committed;
        },
        rollbackMetadata: async () => {
          throw new Error('Metadata rollback I/O error');
        }
      });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught);
    assert.equal(caught.zipImportRecovery.aborted, true);
    assert.equal(caught.zipImportRecovery.metadataCommitAttempted, true);
    assert.equal(caught.zipImportRecovery.metadataRollback, 'failed');
    assert.match(caught.zipImportRecovery.metadataRollbackError, /Metadata rollback I\/O error/);
    assert.equal(caught.zipImportRecovery.stagingRollback, 'rolled-back');
    assert.equal(caught.zipImportRecovery.cleanRollback, false);
    assert.equal(caught.zipImportRecovery.residualRisk, true);

    // Pre-existing staging blob was preserved cleanly!
    const stagingAfter = await listAudioStagingMetadata({ mode: 'text', includeReleased: true });
    assert.equal(stagingAfter.length, 1);
    assert.equal(await (await getAudioStagingBlob(env.preExistingStaging.id)).text(), 'PRE_EXISTING_ALPHA');

    // App.jsx explicitly branches on recovery.cleanRollback === false before logging 'rolled back cleanly'
    const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
    const zipHandler = appSource.slice(appSource.indexOf('const handleStructuredTextAddAudioZipFiles ='), appSource.indexOf('const reconcileStructuredTextExternalAudioSources ='));
    assert.match(zipHandler, /recovery\?\.cleanRollback === false/);
    assert.match(zipHandler, /failed with incomplete rollback/);
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

await runCheck('H5-C', 'Scenario-2', 'Staging rollback failure (including partial batch delete/restore fault) reports cleanRollback=false & residualRisk=true without dropping second cleanup phase', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    const env = await buildImportTestEnv();
    const snapshot = await readTextLibrarySnapshot();

    // First verify executeTextStructuredAudioZipImport surfaces stagingRollback='failed'
    let caught = null;
    try {
      await executeTextStructuredAudioZipImport({
        files: [env.zipFile],
        snapshot,
        preferences: env.preferences,
        commitMetadata: async () => {
          throw new Error('Metadata commit failed');
        },
        rollbackStaging: async () => {
          throw new Error('Staging rollback disk full');
        }
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.equal(caught.zipImportRecovery.metadataRollback, 'not-needed');
    assert.equal(caught.zipImportRecovery.stagingRollback, 'failed');
    assert.match(caught.zipImportRecovery.stagingRollbackError, /Staging rollback disk full/);
    assert.equal(caught.zipImportRecovery.cleanRollback, false);
    assert.equal(caught.zipImportRecovery.residualRisk, true);

    // Also verify real rollbackTextAudioStagingBatch still deletes created IDs even if restore throws
    const newRec = await putTextFullAudioStagingBlob({
      fullArtifactFingerprint: env.fullArt.fullArtifactFingerprint,
      documentId: env.doc1.id,
      blockId: env.block1.id,
      channel: 'text',
      engine: 'edge',
      voiceId: 'en-GB-SoniaNeural',
      filename: env.fFull,
      mimeType: 'audio/mpeg',
      blob: new Blob(['TEMP_FULL'])
    });
    await assert.rejects(
      () => rollbackTextAudioStagingBatch({
        createdIds: [newRec.id],
        previousSnapshots: [null, { id: 'corrupt-missing-meta', get meta() { throw new Error('bad snapshot'); } }]
      }),
      /Staging rollback incomplete/
    );
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

await runCheck('H5-C', 'Scenario-3', 'Two overlapping ZIP imports serialize without interleaving writes/rollbacks and propagate fresh post-A snapshot to B', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    const env = await buildImportTestEnv();
    // Create a second small ZIP with only the Full artifact while first ZIP imports only Split seg2
    const splitOnlyManifest = buildProLingoTextAudioManifest({
      entries: [{ representation: 'split', rf: env.rf2.renderFingerprint, filename: env.f2, mimeType: 'audio/mpeg', size: 13, render: env.rf2.descriptor, references: [{ segmentId: env.seg2.id, channel: 'text' }] }]
    });
    const zipA = Object.assign(await buildStoredZipBlob([
      { filename: env.f2, blob: new Blob(['OVERLAP_ZIP_A']) },
      { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(splitOnlyManifest)], { type: 'application/json' }) }
    ]), { name: 'zip-a.zip', lastModified: 1 });

    const fullOnlyManifest = buildProLingoTextAudioManifest({
      entries: [{ representation: 'full', fullArtifactFingerprint: env.fullArt.fullArtifactFingerprint, filename: env.fFull, mimeType: 'audio/mpeg', size: 13, render: env.fullArt.descriptor, references: [{ blockId: env.block1.id, channel: 'text' }] }]
    });
    const zipB = Object.assign(await buildStoredZipBlob([
      { filename: env.fFull, blob: new Blob(['OVERLAP_ZIP_B']) },
      { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: new Blob([JSON.stringify(fullOnlyManifest)], { type: 'application/json' }) }
    ]), { name: 'zip-b.zip', lastModified: 2 });

    const coordinator = createTextStructuredAudioZipImportCoordinator();
    let liveSnapshot = await readTextLibrarySnapshot();
    const timeline = [];

    const pA = coordinator.runExclusive({
      run: async ({ signal }) => {
        timeline.push('A:start');
        const res = await executeTextStructuredAudioZipImport({
          files: [zipA],
          snapshot: liveSnapshot,
          preferences: env.preferences,
          signal,
          readZipEntryBlob: async args => {
            await new Promise(resolve => setTimeout(resolve, 40));
            const { readTextStructuredAudioZipRuntimeBlob } = await import('../src/services/audio/textStructuredAudioZipArchiveService.js');
            return readTextStructuredAudioZipRuntimeBlob(args);
          }
        });
        liveSnapshot = await readTextLibrarySnapshot();
        timeline.push('A:end');
        return res;
      }
    });

    const pB = coordinator.runExclusive({
      run: async ({ signal }) => {
        timeline.push('B:start');
        assert.equal(liveSnapshot.audioVariants.length, 2, 'Import B must observe Import A committed variant');
        const res = await executeTextStructuredAudioZipImport({
          files: [zipB],
          snapshot: liveSnapshot,
          preferences: env.preferences,
          signal
        });
        liveSnapshot = await readTextLibrarySnapshot();
        timeline.push('B:end');
        return res;
      }
    });

    const [resA, resB] = await Promise.all([pA, pB]);
    assert.deepEqual(timeline, ['A:start', 'A:end', 'B:start', 'B:end']);
    assert.equal(resA.boundMatches.length, 1);
    assert.equal(resB.fullLogical.length, 1);
    const finalSnap = await readTextLibrarySnapshot();
    assert.equal(finalSnap.audioVariants.length, 2);
    assert.equal(finalSnap.blocks[0].metadata.fullAudioArtifactsV1.artifacts.length, 1);
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

await runCheck('H5-C', 'Scenario-4', 'Workspace switch mid-import aborts in-flight import, cancels queued import, rolls back DBs cleanly, and blocks stale UI commit', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    const env = await buildImportTestEnv();
    const coordinator = createTextStructuredAudioZipImportCoordinator();
    const snapshot = await readTextLibrarySnapshot();
    let activeWorkspace = env.doc1.id;
    let staleUiApplied = false;

    const pActive = coordinator.runExclusive({
      getContextVersion: () => activeWorkspace,
      run: async ({ signal, isStaleContext }) => {
        const res = await executeTextStructuredAudioZipImport({
          files: [env.zipFile],
          snapshot,
          preferences: env.preferences,
          signal,
          putFullStaging: async payload => {
            // Simulate user switching workspace while staging blobs are writing!
            activeWorkspace = 'TXTDOC_000002';
            coordinator.cancelActive('Workspace switched');
            return putTextFullAudioStagingBlob(payload);
          }
        });
        if (isStaleContext()) {
          await rollbackCompletedTextStructuredAudioZipImport(res);
          throw new Error('Aborted stale');
        }
        staleUiApplied = true;
        return res;
      }
    });

    const pQueued = coordinator.runExclusive({
      getContextVersion: () => activeWorkspace,
      run: async () => {
        throw new Error('Queued import for switched-away workspace must never start');
      }
    });

    await assert.rejects(() => pActive, err => err?.name === 'AbortError' && err.zipImportRecovery?.cleanRollback === true);
    await assert.rejects(() => pQueued, err => err?.name === 'AbortError' && err.zipImportRecovery?.cleanRollback === true);
    assert.equal(staleUiApplied, false);

    // Pre-existing DB & Staging state intact
    const snapAfter = await readTextLibrarySnapshot();
    assert.equal(snapAfter.audioVariants.length, 1);
    assert.equal((await listAudioStagingMetadata({ mode: 'text', includeReleased: true })).length, 1);
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

await runCheck('H5-C', 'Scenario-5', 'Cancel/abort immediately after Text DB commit triggers compensating rollback of both Text Library IDB and Audio Staging IDB', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    const env = await buildImportTestEnv();
    const snapshot = await readTextLibrarySnapshot();
    const controller = new AbortController();

    let caught = null;
    try {
      await executeTextStructuredAudioZipImport({
        files: [env.zipFile],
        snapshot,
        preferences: env.preferences,
        signal: controller.signal,
        commitMetadata: async payloads => {
          const committed = await executeTextZipImportMetadataCommit(payloads);
          // Text Library DB commit already succeeded on disk; user clicks cancel/switch right now!
          const midCheck = await readTextLibrarySnapshot();
          assert.equal(midCheck.audioVariants.length, 2);
          controller.abort(new Error('Cancelled right after Text DB commit'));
          return committed;
        }
      });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught);
    assert.equal(caught.name, 'AbortError');
    assert.equal(caught.zipImportRecovery.aborted, true);
    assert.equal(caught.zipImportRecovery.metadataRollback, 'rolled-back');
    assert.equal(caught.zipImportRecovery.stagingRollback, 'rolled-back');
    assert.equal(caught.zipImportRecovery.cleanRollback, true);

    // Both DBs match exact pre-import baseline!
    const snapAfter = await readTextLibrarySnapshot();
    assert.equal(snapAfter.audioVariants.length, 1);
    assert.equal(snapAfter.counters.audioVariant, 1);
    assert.deepEqual(snapAfter.blocks[0].metadata, {});
    const stagingAfter = await listAudioStagingMetadata({ mode: 'text', includeReleased: true });
    assert.equal(stagingAfter.length, 1);
    assert.equal(await (await getAudioStagingBlob(env.preExistingStaging.id)).text(), 'PRE_EXISTING_ALPHA');
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

await runCheck('H5-C', 'Scenario-6', 'Partial rollback failure leaves coordinator unlocked and subsequent retry converges idempotently without duplicate IDs or corrupt counters', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = createMemoryIndexedDb();
    const env = await buildImportTestEnv();
    const coordinator = createTextStructuredAudioZipImportCoordinator();
    const initialSnapshot = await readTextLibrarySnapshot();
    const controller = new AbortController();

    // Attempt 1: commitMetadata commits TXTAUDIO_000002 + Full Artifact, abort fires, AND rollbackMetadata throws -> partial dirty state left in IDB!
    let firstErr = null;
    try {
      await coordinator.runExclusive({
        run: async () => executeTextStructuredAudioZipImport({
          files: [env.zipFile],
          snapshot: initialSnapshot,
          preferences: env.preferences,
          signal: controller.signal,
          commitMetadata: async payloads => {
            const committed = await executeTextZipImportMetadataCommit(payloads);
            controller.abort(new Error('Abort during partial rollback test'));
            return committed;
          },
          rollbackMetadata: async () => {
            throw new Error('Transient Text DB lock on rollback');
          }
        })
      });
    } catch (err) {
      firstErr = err;
    }
    assert.ok(firstErr);
    assert.equal(firstErr.zipImportRecovery.cleanRollback, false);
    assert.equal(firstErr.zipImportRecovery.residualRisk, true);
    assert.equal(coordinator.isActive(), false, 'Coordinator must unlock in finally even after partial rollback failure');

    // Attempt 2: Retry same ZIP immediately against real IDB (even using stale pre-failure React snapshot!)
    const retryRes = await coordinator.runExclusive({
      run: async ({ signal }) => executeTextStructuredAudioZipImport({
        files: [env.zipFile],
        snapshot: initialSnapshot,
        preferences: env.preferences,
        signal
      })
    });
    assert.equal(retryRes.status, 'added');

    const finalSnap = await readTextLibrarySnapshot();
    assert.equal(finalSnap.audioVariants.length, 2, 'Idempotent retry must not create duplicate AudioVariant rows');
    assert.equal(finalSnap.counters.audioVariant, 2);
    assert.equal(finalSnap.blocks[0].metadata.fullAudioArtifactsV1.artifacts.length, 1);

    const stagingFinal = await listAudioStagingMetadata({ mode: 'text', includeReleased: true });
    assert.equal(stagingFinal.length, 3);
    assert.equal(await (await getAudioStagingBlob(retryRes.stagedSplitByRf.get(env.rf1.renderFingerprint).id)).text(), 'NEW_ALPHA_BYTES');
    assert.equal(await (await getAudioStagingBlob(retryRes.stagedSplitByRf.get(env.rf2.renderFingerprint).id)).text(), 'NEW_BETA_TWO');
    assert.equal(await (await getAudioStagingBlob(retryRes.stagedFullByFingerprint.get(env.fullArt.fullArtifactFingerprint).id)).text(), 'NEW_FULL_CARD');
  } finally {
    clearAudioStagingRuntimeCacheForMode('text');
    globalThis.indexedDB = prevIndexedDb;
  }
});

const passCount = results.filter(r => r.ok).length;
const failCount = results.filter(r => !r.ok).length;
console.log(`\nP10 H5 EXPORT & ZIP REMEDIATION SUMMARY: ${passCount} PASS, ${failCount} FAIL (${results.length} total)`);
if (failCount > 0) process.exitCode = 1;
