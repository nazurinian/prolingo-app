import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as constants from '../src/constants/textDatabaseConstants.js';
import * as globalIdentity from '../src/domain/text/textGlobalIdentityDomain.js';
import * as libraryDomain from '../src/domain/text/textLibraryDomain.js';
import * as commandDomain from '../src/domain/text/textLibraryCommandDomain.js';
import * as contentUnitDomain from '../src/domain/text/textContentUnitDomain.js';
import * as backupDomain from '../src/domain/text/textDatabaseBackupDomain.js';
import * as packDomain from '../src/domain/text/textPackJsonDomain.js';
import * as attachmentDomain from '../src/domain/text/textSourceAttachmentDomain.js';
import * as externalDomain from '../src/domain/text/textExternalJsonDomain.js';
import * as reconcileDomain from '../src/domain/text/textExternalReconciliationDomain.js';
import * as persistenceService from '../src/services/persistence/textContentUnitPersistenceService.js';
import {
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildTextStructuredFullArtifactIdentity,
  buildTextStructuredFullArtifactRecord,
  buildTextStructuredFullAudioArtifactsMetadata
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  TEXT_AUDIO_COVERAGE_STATUS,
  buildTextStructuredAudioCoverageMap
} from '../src/domain/text/textStructuredAudioCoverageDomain.js';
import {
  buildTextStructuredRuntimeAudioKey
} from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  TEXT_PARAGRAPH_ROLE_METADATA_KEY
} from '../src/domain/text/textParagraphRoleDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY,
  TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY,
  TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';
import {
  buildCanonicalTextRenderAudioFilename
} from '../src/domain/text/textFilenameDomain.js';
import {
  TEXT_AUDIO_MANIFEST_FILENAME,
  buildProLingoTextAudioManifest
} from '../src/domain/text/textAudioManifestDomain.js';
import {
  buildStoredZipBlob
} from '../src/services/audio/browserZipService.js';
import {
  scanTextStructuredAudioZipFiles
} from '../src/services/audio/textStructuredAudioZipArchiveService.js';
import {
  planTextAudioStagingGarbage
} from '../src/services/persistence/textAudioStagingGcService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

const test = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(`  ${error?.stack || error?.message || String(error)}`);
  }
};

/**
 * Isolated in-memory transactional IndexedDB harness for disposable QA tests.
 */
const createMemoryIndexedDb = () => {
  const dbs = new Map();
  const txHistory = [];

  const restoreStoreShadows = (db, shadowRowsByStore) => {
    if (!shadowRowsByStore) return;
    for (const [storeName, snapshotRows] of shadowRowsByStore.entries()) {
      const store = db.stores.get(storeName);
      if (store) {
        store.rows = new Map([...snapshotRows.entries()].map(([k, v]) => [k, structuredClone(v)]));
      }
    }
  };

  const makeRequest = (executor, txState = null) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    if (txState) txState.pending += 1;
    queueMicrotask(() => {
      try {
        if (txState?.aborted) {
          req.error = txState.error || new Error('Transaction aborted');
          req.onerror?.({ target: req });
          return;
        }
        req.result = executor();
        req.onsuccess?.({ target: req });
      } catch (error) {
        req.error = error;
        if (txState) {
          txState.error = txState.error || error;
          if (!txState.aborted) {
            txState.aborted = true;
            restoreStoreShadows(txState.db, txState.shadowRowsByStore);
            if (txState.historyEntry) txState.historyEntry.aborted = true;
          }
        }
        req.onerror?.({ target: req });
      } finally {
        if (txState) {
          txState.pending -= 1;
          if (txState.pending === 0 && !txState.finished) {
            queueMicrotask(() => {
              if (txState.pending === 0 && !txState.finished) {
                txState.finished = true;
                if (txState.aborted) txState.onabort?.({ target: txState });
                else if (txState.error) txState.onerror?.({ target: txState });
                else txState.oncomplete?.({ target: txState });
              }
            });
          }
        }
      }
    });
    return req;
  };

  const buildStoreHandle = (store, txState) => ({
    get indexNames() {
      const names = [...store.indexes.keys()];
      return {
        contains: idxName => store.indexes.has(idxName),
        [Symbol.iterator]: () => names[Symbol.iterator]()
      };
    },
    createIndex: (idxName, idxKeyPath, opts = {}) => {
      store.indexes.set(idxName, { keyPath: idxKeyPath, unique: Boolean(opts?.unique) });
      return store.indexes.get(idxName);
    },
    get: key => makeRequest(() => structuredClone(store.rows.get(key)), txState),
    getAll: () => makeRequest(() => [...store.rows.values()].map(row => structuredClone(row)), txState),
    count: () => makeRequest(() => store.rows.size, txState),
    put: row => makeRequest(() => {
      if (txState?.mode === 'readonly') throw new Error(`ReadOnlyError on ${store.name}`);
      const key = row?.[store.keyPath];
      store.rows.set(key, structuredClone(row));
      return key;
    }, txState),
    delete: key => makeRequest(() => {
      if (txState?.mode === 'readonly') throw new Error(`ReadOnlyError on ${store.name}`);
      store.rows.delete(key);
    }, txState),
    clear: () => makeRequest(() => {
      if (txState?.mode === 'readonly') throw new Error(`ReadOnlyError on ${store.name}`);
      store.rows.clear();
    }, txState)
  });

  const buildTransaction = (db, storeNames, mode = 'readonly') => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const shadowRowsByStore = mode === 'readwrite'
      ? new Map(names.map(n => [
          n,
          new Map([...(db.stores.get(n)?.rows.entries() || [])].map(([k, v]) => [k, structuredClone(v)]))
        ]))
      : null;
    const historyEntry = { dbName: db.name, storeNames: [...names], mode, aborted: false };
    txHistory.push(historyEntry);
    const txState = {
      db,
      mode,
      shadowRowsByStore,
      historyEntry,
      pending: 0,
      finished: false,
      aborted: false,
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      abort: () => {
        if (txState.finished || txState.aborted) return;
        txState.aborted = true;
        txState.error = txState.error || new Error('Transaction aborted');
        historyEntry.aborted = true;
        restoreStoreShadows(db, shadowRowsByStore);
        queueMicrotask(() => {
          if (!txState.finished) {
            txState.finished = true;
            txState.onabort?.({ target: txState });
          }
        });
      },
      objectStore: storeName => {
        assert.ok(names.includes(storeName), `Store ${storeName} not in tx scope`);
        const store = db.stores.get(storeName);
        assert.ok(store, `Missing store ${storeName}`);
        return buildStoreHandle(store, txState);
      }
    };
    return txState;
  };

  return {
    _dbs: dbs,
    _txHistory: txHistory,
    open: (name, version = 1) => {
      const existingDb = dbs.get(name) || null;
      const oldVersion = existingDb ? existingDb.version : 0;
      const upgradeNeeded = !existingDb || existingDb.version < version;
      const db = existingDb || { name, version, stores: new Map(), close() {} };
      if (!existingDb) dbs.set(name, db);
      db.objectStoreNames = { contains: s => db.stores.has(s) };
      db.createObjectStore = (s, { keyPath = 'id' } = {}) => {
        const store = { name: s, keyPath, rows: new Map(), indexes: new Map() };
        db.stores.set(s, store);
        return buildStoreHandle(store, null);
      };
      db.transaction = (s, mode = 'readonly') => buildTransaction(db, s, mode);
      const openReq = { result: db, transaction: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        if (upgradeNeeded) {
          db.version = version;
          openReq.transaction = {
            objectStore: s => buildStoreHandle(db.stores.get(s), null)
          };
          openReq.onupgradeneeded?.({ target: openReq, oldVersion, newVersion: version });
          openReq.transaction = null;
        }
        openReq.onsuccess?.({ target: openReq });
      });
      return openReq;
    },
    deleteDatabase: name => {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        dbs.delete(name);
        req.onsuccess?.({ target: req });
      });
      return req;
    }
  };
};

const createMultiWorkspaceDataset = () => {
  const spkAmeliaId = 'SPK_amelia_01';
  const spkBenId = 'SPK_ben_02';
  const spkAmeliaUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SPEAKER);
  const spkBenUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SPEAKER);
  const spkMixedAmeliaUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SPEAKER);

  const coll = libraryDomain.createTextCollectionRecord({
    id: 'COLL_000001',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.COLLECTION),
    title: 'D3-C Multi-Workspace Collection',
    order: 1,
    createdAt: 1000,
    updatedAt: 1000
  });

  const docPara = libraryDomain.createTextDocumentRecord({
    id: 'DOC_000001',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: null,
    title: 'Standalone Paragraph Doc',
    order: 1,
    documentType: 'paragraph',
    editorModel: constants.TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000
  });

  const docConv = libraryDomain.createTextDocumentRecord({
    id: 'DOC_000002',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: coll.id,
    title: 'Collection Conversation Doc',
    order: 1,
    documentType: 'conversation',
    editorModel: constants.TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000,
    metadata: {
      [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: [
        { id: spkAmeliaId, uid: spkAmeliaUid, label: 'Amelia' },
        { id: spkBenId, uid: spkBenUid, label: 'Ben' }
      ],
      [TEXT_STRUCTURED_SPEAKER_VOICE_PROFILE_V2_KEY]: {
        text: {
          [spkAmeliaId]: 'en-US-JennyNeural',
          [spkBenId]: 'en-US-GuyNeural'
        },
        meaning: {}
      },
      audioDownloadProfileV1: {
        modes: { text: 'custom' },
        speakerIds: {
          text: {
            [spkAmeliaId]: 'en-US-JennyNeural',
            [spkBenId]: 'en-US-GuyNeural'
          }
        }
      }
    }
  });

  const docMixed = libraryDomain.createTextDocumentRecord({
    id: 'DOC_000003',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: coll.id,
    title: 'Collection Mixed Doc',
    order: 2,
    documentType: 'mixed',
    editorModel: constants.TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000,
    metadata: {
      [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: [
        { id: spkAmeliaId, uid: spkMixedAmeliaUid, label: 'Amelia' }
      ]
    }
  });

  const docLegacy = libraryDomain.createTextDocumentRecord({
    id: 'DOC_000004',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: null,
    title: 'Standalone Legacy Doc',
    order: 2,
    documentType: 'mixed',
    editorModel: constants.TEXT_LEGACY_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000,
    metadata: { migratedFrom: 'prolingo_text_identity_v1' }
  });

  const segParaTitle = libraryDomain.createTextSegmentRecord({
    id: 'SEGMENT_000001',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    order: 1,
    text: 'Arrival in Jakarta',
    meaning: 'Kedatangan di Jakarta',
    createdAt: 1000,
    updatedAt: 1000
  });

  const segParaBody1 = libraryDomain.createTextSegmentRecord({
    id: 'SEGMENT_000002',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: 'DOC_000001',
    blockId: 'TEXT_000002',
    order: 1,
    text: 'The train arrived on time.',
    meaning: 'Kereta tiba tepat waktu.',
    joinAfter: 'space',
    createdAt: 1000,
    updatedAt: 1000
  });

  const segParaBody2 = libraryDomain.createTextSegmentRecord({
    id: 'SEGMENT_000003',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: 'DOC_000001',
    blockId: 'TEXT_000002',
    order: 2,
    text: 'Passengers stepped onto the platform.',
    meaning: 'Para penumpang turun ke peron.',
    joinAfter: 'space',
    createdAt: 1000,
    updatedAt: 1000
  });

  const blockParaBodyBase = libraryDomain.createTextBlockRecord({
    id: 'TEXT_000002',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
    documentId: 'DOC_000001',
    order: 2,
    blockType: 'paragraph',
    title: 'Station Scene',
    createdAt: 1000,
    updatedAt: 1000
  });

  const fullArtifactRecord = buildTextStructuredFullArtifactRecord({
    block: { ...blockParaBodyBase, segments: [segParaBody1, segParaBody2] },
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0,
    filename: 'station_full.mp3',
    mimeType: 'audio/mpeg',
    createdAt: 1000,
    updatedAt: 1000
  });

  const rfPara1 = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: segParaBody1.text,
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });

  const rfConvAmelia = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: 'Good morning everyone.',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-JennyNeural',
    rate: 0,
    pitch: 0
  });

  const blocks = [
    libraryDomain.createTextBlockRecord({
      id: 'TEXT_000001',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: 'DOC_000001',
      order: 1,
      blockType: 'paragraph',
      title: 'Title Card',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: 'title' }
    }),
    {
      ...blockParaBodyBase,
      metadata: buildTextStructuredFullAudioArtifactsMetadata({
        metadata: blockParaBodyBase.metadata,
        artifact: fullArtifactRecord
      })
    },
    libraryDomain.createTextBlockRecord({
      id: 'TEXT_000003',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: 'DOC_000001',
      order: 3,
      blockType: 'paragraph',
      title: 'Empty Paragraph Card',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: 'TEXT_000004',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: 'DOC_000002',
      order: 1,
      blockType: 'conversation',
      title: 'Morning Briefing',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: 'TEXT_000005',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: 'DOC_000003',
      order: 1,
      blockType: 'paragraph',
      title: 'Mixed Intro',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: 'TEXT_000006',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: 'DOC_000003',
      order: 2,
      blockType: 'conversation',
      title: 'Mixed Dialogue',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: 'TEXT_000007',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: 'DOC_000004',
      order: 1,
      blockType: 'paragraph',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { migratedFromLegacyLine: true }
    })
  ];

  const segments = [
    segParaTitle,
    segParaBody1,
    segParaBody2,
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000004',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000002',
      blockId: 'TEXT_000004',
      order: 1,
      text: 'Good morning everyone.',
      meaning: 'Selamat pagi semuanya.',
      speaker: 'Amelia',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: spkAmeliaId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000005',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000002',
      blockId: 'TEXT_000004',
      order: 2,
      text: 'Let us begin the review.',
      meaning: 'Mari kita mulai tinjauan.',
      speaker: 'Amelia',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: spkAmeliaId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000006',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000002',
      blockId: 'TEXT_000004',
      order: 3,
      text: 'Sounds good to me.',
      meaning: 'Kedengarannya bagus.',
      speaker: 'Ben',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: spkBenId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000007',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000002',
      blockId: 'TEXT_000004',
      order: 4,
      text: 'Unregistered observer note.',
      meaning: 'Catatan pengamat.',
      speaker: 'Observer',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000008',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000003',
      blockId: 'TEXT_000005',
      order: 1,
      text: 'Context before dialogue.',
      meaning: 'Konteks sebelum dialog.',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000009',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000003',
      blockId: 'TEXT_000006',
      order: 1,
      text: 'Mixed mode turn.',
      meaning: 'Giliran mode campuran.',
      speaker: 'Amelia',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: spkAmeliaId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000010',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: 'DOC_000004',
      blockId: 'TEXT_000007',
      order: 1,
      text: 'Legacy line one',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { migratedFromLegacyLine: true }
    })
  ];

  const audioVariants = [
    libraryDomain.createTextAudioVariantRecord({
      id: 'TXTAUDIO_000001',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT),
      segmentId: 'SEGMENT_000002',
      channel: 'text',
      engine: 'edge',
      source: 'generated',
      voiceId: 'en-US-AriaNeural',
      language: 'en',
      filename: 'seg2.mp3',
      mimeType: 'audio/mpeg',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: {
        audioRenderFingerprintV1: rfPara1.renderFingerprint,
        audioContentFingerprintV2: rfPara1.contentFingerprintV2,
        audioRenderDescriptorV1: rfPara1.descriptor
      }
    }),
    libraryDomain.createTextAudioVariantRecord({
      id: 'TXTAUDIO_000002',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT),
      segmentId: 'SEGMENT_000004',
      channel: 'text',
      engine: 'edge',
      source: 'generated',
      voiceId: 'en-US-JennyNeural',
      language: 'en',
      filename: 'seg4.mp3',
      mimeType: 'audio/mpeg',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: {
        audioRenderFingerprintV1: rfConvAmelia.renderFingerprint,
        audioContentFingerprintV2: rfConvAmelia.contentFingerprintV2,
        audioRenderDescriptorV1: rfConvAmelia.descriptor
      }
    })
  ];

  const v1Snapshot = libraryDomain.normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1,
    activeDocumentId: 'DOC_000001',
    initialized: true,
    counters: {
      collection: 1,
      document: 4,
      text: 7,
      segment: 10,
      audioVariant: 2
    },
    collections: [coll],
    documents: [docPara, docConv, docMixed, docLegacy],
    blocks,
    segments,
    audioVariants
  });

  // Build rich v2 dataset with multi-paragraph Card, intentionally empty 0-Unit Card, and multi-segment Turn
  let v2Snapshot = contentUnitDomain.backfillTextContentUnits(v1Snapshot, { now: 2000 }).snapshot;

  // Delete Empty Paragraph Card TEXT_000003's initial empty Unit so it is an intentionally 0-Unit v2 Card
  const emptyCardUnit = v2Snapshot.contentUnits.find(u => u.blockId === 'TEXT_000003');
  v2Snapshot = commandDomain.applyTextLibraryCommand(v2Snapshot, {
    type: 'contentUnit.delete',
    payload: { id: emptyCardUnit.id }
  }, 2100).snapshot;

  // Merge Amelia's two adjacent Turns on TEXT_000004 into a 2-segment Turn
  const ameliaTurns = v2Snapshot.contentUnits
    .filter(u => u.blockId === 'TEXT_000004' && u.speaker === 'Amelia')
    .sort((a, b) => a.order - b.order);
  v2Snapshot = commandDomain.applyTextLibraryCommand(v2Snapshot, {
    type: 'contentUnit.merge',
    payload: { ids: [ameliaTurns[0].id, ameliaTurns[1].id] }
  }, 2200).snapshot;

  return {
    v1Snapshot,
    v2Snapshot,
    rfPara1,
    rfConvAmelia,
    fullArtifactRecord,
    spkAmeliaId,
    spkBenId
  };
};

// ---------------------------------------------------------------------------
// D3C-01: Database Backup & Restore (v1 Compat, v2 Lossless Round-Trip, Corruption Rejection)
// ---------------------------------------------------------------------------
await test('D3C-01: Database Backup & Restore supports v1 backward compatibility, v2 lossless round-trip, and rejects malformed backups', async () => {
  const { v1Snapshot, v2Snapshot } = createMultiWorkspaceDataset();

  // 1. v1 Backup remains wire-compatible without contentUnits
  const v1Meta = [
    { key: constants.TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: 1 },
    { key: constants.TEXT_LIBRARY_META_KEYS.INITIALIZED, value: true },
    { key: constants.TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: v1Snapshot.activeDocumentId },
    { key: constants.TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: v1Snapshot.counters }
  ];
  const v1Backup = backupDomain.createProLingoTextDatabaseBackup({
    metaRecords: v1Meta,
    stores: {
      collections: v1Snapshot.collections,
      documents: v1Snapshot.documents,
      blocks: v1Snapshot.blocks,
      segments: v1Snapshot.segments,
      audioVariants: v1Snapshot.audioVariants
    },
    now: 3000
  });
  assert.equal(v1Backup.database.dbVersion, 1);
  assert.equal(v1Backup.database.schemaVersion, 1);
  assert.equal('contentUnits' in v1Backup.stores, false);
  const v1Validated = backupDomain.validateProLingoTextDatabaseBackup(v1Backup);
  assert.equal(v1Validated.snapshot.schemaVersion, 1);
  assert.equal('contentUnits' in v1Validated.snapshot, false);
  // Minor Check: absent counters.contentUnit in v1 never introduces NaN or false counter floor bump
  assert.equal(v1Validated.snapshot.counters.contentUnit, undefined);
  assert.equal('contentUnit' in v1Validated.migration.identityFloor, false);
  assert.equal(v1Validated.migration.countersRaisedToIdentityFloor, false);
  assert.equal(
    Object.values(v1Validated.snapshot.counters).every(value => Number.isInteger(value) && !Number.isNaN(value)),
    true
  );

  // 2. v1 Backup upgraded to v2 on restore preserves all IDs/UIDs and backfills Content Units
  const v1Upgraded = backupDomain.validateProLingoTextDatabaseBackup(v1Backup, { upgradeToV2: true, now: 3100 });
  assert.equal(v1Upgraded.snapshot.schemaVersion, 2);
  assert.equal(Array.isArray(v1Upgraded.snapshot.contentUnits), true);
  assert.equal(Number.isInteger(v1Upgraded.snapshot.counters.contentUnit), true);
  assert.equal(Number.isInteger(v1Upgraded.migration.identityFloor.contentUnit), true);
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(v1Upgraded.snapshot, { idbVersion: 2 }).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2
  );

  // 3. v2 Backup creation & lossless export -> disposable DB restore -> export round-trip
  const prevIndexedDb = globalThis.indexedDB;
  const mockIdb = createMemoryIndexedDb();
  globalThis.indexedDB = mockIdb;

  const readRawMetaMap = async dbName => {
    const db = await persistenceService.openDisposableTextLibraryV2Database({ dbName });
    try {
      const tx = db.transaction(constants.TEXT_LIBRARY_STORES.META, 'readonly');
      const rows = await new Promise((resolve, reject) => {
        const req = tx.objectStore(constants.TEXT_LIBRARY_STORES.META).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error || new Error('Meta read failed'));
      });
      return new Map(rows.map(r => [r.key, r]));
    } finally {
      db.close();
    }
  };

  try {
    const qaDbName = 'prolingo_text_library_d3b_qa_backup_rt';
    await persistenceService.writeTextLibrarySnapshotToDisposableDb({
      dbName: qaDbName,
      snapshot: v2Snapshot,
      version: 2,
      now: 3200
    });

    const exportedV2Backup1 = await persistenceService.exportDisposableTextLibraryV2Backup({
      dbName: qaDbName,
      source: { appVersion: '6.0.3-d3c', checkpoint: 'd3c-test' },
      now: 3300
    });
    assert.equal(exportedV2Backup1.database.dbVersion, 2);
    assert.equal(exportedV2Backup1.database.schemaVersion, 2);
    assert.equal(exportedV2Backup1.stores.contentUnits.length, v2Snapshot.contentUnits.length);

    const qaRestoreDbName = 'prolingo_text_library_d3b_qa_backup_restored';
    const restoreRes = await persistenceService.restoreDisposableTextLibraryV2Backup({
      dbName: qaRestoreDbName,
      backup: exportedV2Backup1,
      now: 3400
    });
    assert.deepEqual(restoreRes.snapshot, v2Snapshot);
    // Intentionally empty 0-Unit Card TEXT_000003 stayed 0-Unit after restore!
    assert.equal(restoreRes.snapshot.contentUnits.filter(u => u.blockId === 'TEXT_000003').length, 0);
    // Multi-segment Turn on TEXT_000004 stayed merged after restore!
    const restoredConvUnits = restoreRes.snapshot.contentUnits.filter(u => u.blockId === 'TEXT_000004');
    assert.equal(restoredConvUnits.length, 3);

    const exportedV2Backup2 = await persistenceService.exportDisposableTextLibraryV2Backup({
      dbName: qaRestoreDbName,
      source: { appVersion: '6.0.3-d3c', checkpoint: 'd3c-test' },
      now: 3300
    });
    assert.deepEqual(exportedV2Backup2, exportedV2Backup1);

    // 3b. Finding A: True replace-policy restoration of ALL validated metadata records (sourceAttachments,
    // externalSourceImports, legacyMigration, additional supported meta records) + stale metadata clearing + abort rollback
    const preservedAttachment = {
      version: 1,
      attachmentId: 'TXTSOURCE_KEEP01',
      packageId: 'PTP_document_DOC_000001_ABCDEF01',
      scopeType: 'document',
      sourceRootId: 'DOC_000001',
      fileName: 'attached.json',
      attachedAt: '2026-11-16T00:00:00.000Z',
      lastSyncedAt: '2026-11-16T00:00:00.000Z',
      status: 'attached',
      idMap: { collections: {}, documents: { DOC_000001: 'DOC_000001' }, blocks: {}, contentUnits: {}, segments: {}, audioVariants: {} },
      baseline: { collections: {}, documents: {}, blocks: {}, contentUnits: {}, segments: {}, audioVariants: {} },
      counts: { documents: 1 }
    };
    const preservedExternalImport = {
      externalSourceKey: 'ext-kept-source',
      workspaceKey: 'main',
      documentId: 'DOC_000002',
      revision: 3,
      importedAt: 2800,
      lastImportedAt: 2900
    };
    const preservedLegacyMigration = {
      migratedAt: 1500,
      sourceKey: 'prolingo_text_v1',
      itemCount: 4
    };
    const preservedCustomMeta = {
      key: 'customBackupAuditMetaV1',
      value: { note: 'must survive replace restore', tags: ['alpha', 'beta'] },
      updatedAt: 2999
    };

    const richMetaV2Backup = backupDomain.createProLingoTextDatabaseBackup({
      metaRecords: [
        ...exportedV2Backup1.metaRecords,
        { key: constants.TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, value: [preservedAttachment], updatedAt: 2950 },
        { key: constants.TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS, value: [preservedExternalImport], updatedAt: 2960 },
        { key: constants.TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION, value: preservedLegacyMigration, updatedAt: 2970 },
        preservedCustomMeta
      ],
      stores: exportedV2Backup1.stores,
      source: { appVersion: '6.0.3-d3c-h1', checkpoint: 'finding-a' },
      now: 3450
    });

    // Seed destination DB with stale data + stale metadata (including stale attachment, external import, legacyMigration, and extra key)
    const qaStaleDbName = 'prolingo_text_library_d3b_qa_stale_meta';
    await persistenceService.writeTextLibrarySnapshotToDisposableDb({
      dbName: qaStaleDbName,
      snapshot: v2Snapshot,
      version: 2,
      now: 3460
    });
    {
      const db = await persistenceService.openDisposableTextLibraryV2Database({ dbName: qaStaleDbName });
      try {
        const tx = db.transaction(constants.TEXT_LIBRARY_STORES.META, 'readwrite');
        const metaStore = tx.objectStore(constants.TEXT_LIBRARY_STORES.META);
        metaStore.put({ key: constants.TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, value: [{ attachmentId: 'STALE_ATT' }], updatedAt: 111 });
        metaStore.put({ key: constants.TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS, value: [{ externalSourceKey: 'stale-ext' }], updatedAt: 112 });
        metaStore.put({ key: constants.TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION, value: { staleLegacy: true }, updatedAt: 113 });
        metaStore.put({ key: 'staleOrphanMetaKey', value: { shouldBeCleared: true }, updatedAt: 114 });
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }

    // Attempt an aborted restore over qaStaleDbName: BOTH stale meta & stale data must remain untouched!
    await assert.rejects(() => persistenceService.restoreDisposableTextLibraryV2Backup({
      dbName: qaStaleDbName,
      backup: richMetaV2Backup,
      now: 3470,
      onBeforeCommit: ({ tx }) => {
        tx.abort();
        throw new Error('Injected abort on rich meta restore');
      }
    }), /abort/i);
    const rawMetaAfterAbort = await readRawMetaMap(qaStaleDbName);
    assert.deepEqual(rawMetaAfterAbort.get('staleOrphanMetaKey')?.value, { shouldBeCleared: true });
    assert.deepEqual(rawMetaAfterAbort.get(constants.TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS)?.value, [{ attachmentId: 'STALE_ATT' }]);
    assert.deepEqual(rawMetaAfterAbort.get(constants.TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS)?.value, [{ externalSourceKey: 'stale-ext' }]);
    assert.deepEqual(rawMetaAfterAbort.get(constants.TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION)?.value, { staleLegacy: true });
    assert.equal(rawMetaAfterAbort.has('customBackupAuditMetaV1'), false);

    // Execute successful atomic replace restore over qaStaleDbName
    await persistenceService.restoreDisposableTextLibraryV2Backup({
      dbName: qaStaleDbName,
      backup: richMetaV2Backup,
      now: 3480
    });
    const rawMetaAfterRestore = await readRawMetaMap(qaStaleDbName);
    assert.equal(rawMetaAfterRestore.has('staleOrphanMetaKey'), false, 'Stale metadata key must be cleared by replace restore');
    assert.deepEqual(rawMetaAfterRestore.get(constants.TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS)?.value, [preservedAttachment]);
    assert.deepEqual(rawMetaAfterRestore.get(constants.TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS)?.value, [preservedExternalImport]);
    assert.deepEqual(rawMetaAfterRestore.get(constants.TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION)?.value, preservedLegacyMigration);
    assert.deepEqual(rawMetaAfterRestore.get('customBackupAuditMetaV1')?.value, preservedCustomMeta.value);
    assert.equal(rawMetaAfterRestore.get('customBackupAuditMetaV1')?.updatedAt, 2999);

    const reExportRichV2 = await persistenceService.exportDisposableTextLibraryV2Backup({
      dbName: qaStaleDbName,
      source: { appVersion: '6.0.3-d3c-h1', checkpoint: 'finding-a' },
      now: 3450
    });
    assert.deepEqual(reExportRichV2, richMetaV2Backup);

    // Also test v1 backup with full metadata upgraded to v2 via replace restore over existing metadata
    const richV1Backup = backupDomain.createProLingoTextDatabaseBackup({
      metaRecords: [
        ...v1Meta,
        { key: constants.TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS, value: [preservedAttachment], updatedAt: 2100 },
        { key: constants.TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS, value: [preservedExternalImport], updatedAt: 2101 },
        { key: constants.TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION, value: preservedLegacyMigration, updatedAt: 2102 },
        preservedCustomMeta
      ],
      stores: v1Backup.stores,
      now: 3490
    });
    await persistenceService.restoreDisposableTextLibraryV2Backup({
      dbName: qaStaleDbName,
      backup: richV1Backup,
      upgradeV1Backup: true,
      now: 3495
    });
    const rawMetaAfterV1UpgradeRestore = await readRawMetaMap(qaStaleDbName);
    assert.equal(rawMetaAfterV1UpgradeRestore.get(constants.TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION)?.value, 2);
    assert.deepEqual(rawMetaAfterV1UpgradeRestore.get(constants.TEXT_LIBRARY_META_KEYS.SOURCE_ATTACHMENTS)?.value, [preservedAttachment]);
    assert.deepEqual(rawMetaAfterV1UpgradeRestore.get(constants.TEXT_LIBRARY_META_KEYS.EXTERNAL_SOURCE_IMPORTS)?.value, [preservedExternalImport]);
    assert.deepEqual(rawMetaAfterV1UpgradeRestore.get(constants.TEXT_LIBRARY_META_KEYS.LEGACY_MIGRATION)?.value, preservedLegacyMigration);
    assert.deepEqual(rawMetaAfterV1UpgradeRestore.get('customBackupAuditMetaV1')?.value, preservedCustomMeta.value);

    // 4. Negative corruption guards on v2 backups
    // Missing stores.contentUnits on v2 backup
    assert.throws(() => backupDomain.validateProLingoTextDatabaseBackup({
      ...exportedV2Backup1,
      stores: { ...exportedV2Backup1.stores, contentUnits: undefined }
    }), /contentUnits/i);

    // Dangling segment.unitId
    assert.throws(() => backupDomain.validateProLingoTextDatabaseBackup({
      ...exportedV2Backup1,
      stores: {
        ...exportedV2Backup1.stores,
        segments: exportedV2Backup1.stores.segments.map((s, i) => i === 0 ? { ...s, unitId: 'UNIT_999999' } : s)
      }
    }), /missing Content Unit|UNIT_999999/i);

    // Duplicate UNITUID
    assert.throws(() => backupDomain.validateProLingoTextDatabaseBackup({
      ...exportedV2Backup1,
      stores: {
        ...exportedV2Backup1.stores,
        contentUnits: exportedV2Backup1.stores.contentUnits.map((u, i) => (
          i === 1 ? { ...u, uid: exportedV2Backup1.stores.contentUnits[0].uid } : u
        ))
      }
    }), /UID|duplicate/i);

    // Failed/aborted restore rolls back disposable QA DB completely
    await assert.rejects(() => persistenceService.restoreDisposableTextLibraryV2Backup({
      dbName: qaRestoreDbName,
      backup: v1Backup,
      now: 3500,
      onBeforeCommit: ({ tx }) => {
        tx.abort();
        throw new Error('Injected abort during backup restore');
      }
    }), /abort/i);
    const dbAfterAbort = await persistenceService.openDisposableTextLibraryV2Database({ dbName: qaRestoreDbName });
    const snapAfterAbort = await persistenceService.readTextLibraryV2SnapshotFromDb(dbAfterAbort);
    dbAfterAbort.close();
    assert.deepEqual(snapAfterAbort.contentUnits.map(u => u.id), v2Snapshot.contentUnits.map(u => u.id));
  } finally {
    globalThis.indexedDB = prevIndexedDb;
  }
});

// ---------------------------------------------------------------------------
// D3C-02: Text Pack Import/Export (v1 & v2, Copy UID Remapping, Preserve-UID, Dangling FK Guards)
// ---------------------------------------------------------------------------
await test('D3C-02: Text Pack supports v2 Content Units, Copy UID remapping, Preserve-UID, v1 pack import into v2, and FK guards', async () => {
  const { v1Snapshot, v2Snapshot } = createMultiWorkspaceDataset();

  // 1. Export v2 Document Text Pack (DOC_000001 has Title Card, Body Card, and intentionally 0-Unit Card TEXT_000003)
  const docPackV2 = packDomain.createProLingoTextPack({
    snapshot: v2Snapshot,
    scopeType: 'document',
    rootId: 'DOC_000001',
    now: 4000
  });
  assert.equal(docPackV2.textSchemaVersion, 2);
  assert.equal(Array.isArray(docPackV2.contentUnits), true);
  assert.equal(docPackV2.contentUnits.length, 2); // Title Unit + Body Unit; TEXT_000003 has 0 Units

  // 2. Export v2 Collection Text Pack (COLL_000001 has DOC_000002 Conversation with 2-seg Turn + DOC_000003 Mixed)
  const collPackV2 = packDomain.createProLingoTextPack({
    snapshot: v2Snapshot,
    scopeType: 'collection',
    rootId: 'COLL_000001',
    now: 4000
  });
  assert.equal(collPackV2.textSchemaVersion, 2);
  assert.equal(collPackV2.contentUnits.length, 5); // 3 Turns in DOC_000002 + 1 Para + 1 Turn in DOC_000003

  // 3. Import-as-Copy into populated v2Snapshot: must generate new UNIT_* and UNITUID_* and remap segment.unitId
  const copyMerged = packDomain.mergeProLingoTextPack({
    localSnapshot: v2Snapshot,
    pack: collPackV2,
    now: 4100,
    uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_NEW_COPY
  });
  assert.equal(contentUnitDomain.validateTextContentUnitsState(copyMerged.snapshot, { checkCounterFloor: true }).valid, true);
  assert.equal(globalIdentity.collectTextGlobalUidDiagnostics(copyMerged.snapshot).valid, true);
  assert.equal(copyMerged.imported.contentUnitIds.length, 5);

  const originalUnitUids = new Set(v2Snapshot.contentUnits.map(u => u.uid));
  for (const newUnitId of copyMerged.imported.contentUnitIds) {
    const newUnit = copyMerged.snapshot.contentUnits.find(u => u.id === newUnitId);
    assert.ok(newUnit);
    assert.equal(originalUnitUids.has(newUnit.uid), false, 'Copy mode must assign new UNITUID_*');
  }

  // Verify multi-segment Turn boundary survived Import-as-Copy!
  const copiedConvUnitId = copyMerged.idMap.contentUnits[
    collPackV2.contentUnits.find(u => u.blockId === 'TEXT_000004' && u.speaker === 'Amelia').id
  ];
  const copiedTurnSegs = copyMerged.snapshot.segments.filter(s => s.unitId === copiedConvUnitId);
  assert.equal(copiedTurnSegs.length, 2, 'Multi-segment Turn must retain 2 child segments after Text Pack Copy');

  // Verify intentionally empty 0-Unit Card TEXT_000003 survives Document Pack Copy as 0-Unit Card!
  const docCopyMerged = packDomain.mergeProLingoTextPack({
    localSnapshot: v2Snapshot,
    pack: docPackV2,
    now: 4150,
    uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_NEW_COPY
  });
  const mappedEmptyCardId = docCopyMerged.idMap.blocks.TEXT_000003;
  assert.ok(mappedEmptyCardId);
  assert.equal(
    docCopyMerged.snapshot.contentUnits.filter(u => u.blockId === mappedEmptyCardId).length,
    0,
    'Intentionally empty 0-Unit Card must not resurrect a Unit on Text Pack Copy'
  );
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(docCopyMerged.snapshot, { idbVersion: 2 }).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2
  );

  // 4. Preserve-UID mode into empty v2 snapshot retains exact UNITUID_*
  const emptyV2 = contentUnitDomain.backfillTextContentUnits(
    libraryDomain.normalizeTextLibraryRuntimeSnapshot({
      schemaVersion: 1,
      initialized: true,
      activeDocumentId: null,
      counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
      collections: [],
      documents: [],
      blocks: [],
      segments: [],
      audioVariants: []
    }),
    { now: 4000 }
  ).snapshot;

  const preserveMerged = packDomain.mergeProLingoTextPack({
    localSnapshot: emptyV2,
    pack: collPackV2,
    now: 4200,
    uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_PRESERVE
  });
  assert.deepEqual(
    preserveMerged.snapshot.contentUnits.map(u => u.uid).sort(),
    collPackV2.contentUnits.map(u => u.uid).sort()
  );

  // 5. Backward-compatible v1 Text Pack imported into v2 snapshot materializes Content Units cleanly
  const v1Pack = packDomain.createProLingoTextPack({
    snapshot: v1Snapshot,
    scopeType: 'document',
    rootId: 'DOC_000001',
    now: 4250
  });
  assert.equal(v1Pack.textSchemaVersion, 1);
  assert.equal('contentUnits' in v1Pack, false);

  const v1IntoV2 = packDomain.mergeProLingoTextPack({
    localSnapshot: v2Snapshot,
    pack: v1Pack,
    now: 4300,
    uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_NEW_COPY
  });
  assert.equal(contentUnitDomain.validateTextContentUnitsState(v1IntoV2.snapshot).valid, true);
  assert.equal(v1IntoV2.imported.contentUnitIds.length, 3); // v1 empty card TEXT_000003 gets 1 initial empty unit

  // 6. Negative guards: dangling unitId in pack & importing v2 pack into v1 snapshot
  assert.throws(() => packDomain.validateProLingoTextPack({
    ...docPackV2,
    segments: docPackV2.segments.map((s, idx) => idx === 0 ? { ...s, unitId: 'UNIT_999999' } : s)
  }), /missing Content Unit|UNIT_999999/i);

  assert.throws(() => packDomain.mergeProLingoTextPack({
    localSnapshot: v1Snapshot,
    pack: docPackV2,
    now: 4350
  }), /schema 2|Content-Unit|v2/i);
});

// ---------------------------------------------------------------------------
// D3C-03: Source Attachment & Sync/Detach (v2 Packs + v1 Pack Across v1->v2 Migration)
// ---------------------------------------------------------------------------
await test('D3C-03: Source Attachment & Sync preserves v2 ContentUnit IDs/UIDs, detects local unit/segment edits, and supports v1 attachments migrated to v2', async () => {
  const { v1Snapshot, v2Snapshot } = createMultiWorkspaceDataset();

  const emptyV2 = contentUnitDomain.backfillTextContentUnits(
    libraryDomain.normalizeTextLibraryRuntimeSnapshot({
      schemaVersion: 1,
      initialized: true,
      activeDocumentId: null,
      counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
      collections: [],
      documents: [],
      blocks: [],
      segments: [],
      audioVariants: []
    }),
    { now: 5000 }
  ).snapshot;

  // 1. Attach v2 Collection Pack into emptyV2
  const sourcePackV2 = packDomain.createProLingoTextPack({
    snapshot: v2Snapshot,
    scopeType: 'collection',
    rootId: 'COLL_000001',
    now: 5000
  });
  const mergedAttach = packDomain.mergeProLingoTextPack({
    localSnapshot: emptyV2,
    pack: sourcePackV2,
    now: 5010,
    uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_PRESERVE
  });
  const attached = attachmentDomain.createTextSourceAttachmentFromMerge({
    pack: sourcePackV2,
    merged: mergedAttach,
    fileName: 'coll-v2.json',
    now: 5010
  });
  assert.ok(attached.attachment.idMap.contentUnits);
  assert.equal(Object.keys(attached.attachment.idMap.contentUnits).length, 5);

  // 2. Upstream source pack updates segment text & adds a new Turn Unit; local has a preserved local-only edit on another segment
  const localEditedSnap = commandDomain.applyTextLibraryCommand(attached.snapshot, {
    type: 'segment.update',
    payload: {
      id: attached.idMap.segments.SEGMENT_000008,
      text: 'Locally customized context.'
    }
  }, 5050).snapshot;

  let upstreamSnap = commandDomain.applyTextLibraryCommand(v2Snapshot, {
    type: 'segment.update',
    payload: {
      id: 'SEGMENT_000006',
      text: 'Updated by upstream author.'
    }
  }, 5060).snapshot;
  upstreamSnap = commandDomain.applyTextLibraryCommand(upstreamSnap, {
    type: 'contentUnit.create',
    payload: {
      blockId: 'TEXT_000004',
      speaker: 'Ben',
      text: 'Upstream added follow-up Turn.'
    }
  }, 5070).snapshot;

  const updatedPackV2 = packDomain.createProLingoTextPack({
    snapshot: upstreamSnap,
    scopeType: 'collection',
    rootId: 'COLL_000001',
    packageId: sourcePackV2.packageId,
    now: 5080
  });

  const syncPlan = attachmentDomain.planTextSourceSync({
    localSnapshot: localEditedSnap,
    pack: updatedPackV2,
    attachment: attached.attachment,
    fileName: 'coll-v2-rev2.json',
    now: 5100
  });
  assert.equal(syncPlan.ok, true);
  assert.equal(contentUnitDomain.validateTextContentUnitsState(syncPlan.snapshot).valid, true);
  // Local edit preserved
  assert.equal(
    syncPlan.snapshot.segments.find(s => s.id === attached.idMap.segments.SEGMENT_000008).text,
    'Locally customized context.'
  );
  // Upstream edit applied
  assert.equal(
    syncPlan.snapshot.segments.find(s => s.id === attached.idMap.segments.SEGMENT_000006).text,
    'Updated by upstream author.'
  );
  // Existing ContentUnit UIDs preserved
  for (const [srcUnitId, localUnitId] of Object.entries(attached.idMap.contentUnits)) {
    const srcUnit = sourcePackV2.contentUnits.find(u => u.id === srcUnitId);
    const syncedUnit = syncPlan.snapshot.contentUnits.find(u => u.id === localUnitId);
    assert.equal(syncedUnit?.uid, srcUnit?.uid);
  }

  // 3. Foreign local-only Segment added inside a source Unit that upstream deletes -> MUST block Sync with conflict
  const benTurnSourceId = updatedPackV2.contentUnits.find(u => u.blockId === 'TEXT_000004' && u.order === 4).id;
  const benTurnLocalId = syncPlan.attachment.idMap.contentUnits[benTurnSourceId];
  const withForeignChildInTurn = commandDomain.applyTextLibraryCommand(syncPlan.snapshot, {
    type: 'segment.create',
    payload: {
      blockId: syncPlan.attachment.idMap.blocks.TEXT_000004,
      unitId: benTurnLocalId,
      speaker: 'Ben',
      text: 'Local-only second sentence inside upstream Turn.'
    }
  }, 5150).snapshot;

  // Upstream deletes that Turn
  const upstreamDeletedTurnSnap = commandDomain.applyTextLibraryCommand(upstreamSnap, {
    type: 'contentUnit.delete',
    payload: { id: benTurnSourceId }
  }, 5160).snapshot;
  const packWithDeletedTurn = packDomain.createProLingoTextPack({
    snapshot: upstreamDeletedTurnSnap,
    scopeType: 'collection',
    rootId: 'COLL_000001',
    packageId: sourcePackV2.packageId,
    now: 5170
  });
  const conflictSync = attachmentDomain.planTextSourceSync({
    localSnapshot: withForeignChildInTurn,
    pack: packWithDeletedTurn,
    attachment: syncPlan.attachment,
    now: 5180
  });
  assert.equal(conflictSync.ok, false);
  assert.equal(conflictSync.conflict, true);
  assert.equal(conflictSync.conflicts.some(c => /local-only Segment/i.test(c)), true);

  // 4. v1 Text Pack attached in v1 -> snapshot migrated to v2 -> Sync with updated v1 Pack must NOT false-conflict on unitId!
  const v1Pack = packDomain.createProLingoTextPack({
    snapshot: v1Snapshot,
    scopeType: 'document',
    rootId: 'DOC_000001',
    now: 5200
  });
  const emptyV1 = libraryDomain.normalizeTextLibraryRuntimeSnapshot({
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
  const v1Merged = packDomain.mergeProLingoTextPack({
    localSnapshot: emptyV1,
    pack: v1Pack,
    now: 5210,
    uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_PRESERVE
  });
  const v1Attached = attachmentDomain.createTextSourceAttachmentFromMerge({
    pack: v1Pack,
    merged: v1Merged,
    fileName: 'doc-v1.json',
    now: 5210
  });

  // Migrate the v1 snapshot with active attachment to v2
  const migratedAttachedSnap = contentUnitDomain.backfillTextContentUnits(v1Attached.snapshot, { now: 5250 }).snapshot;

  // Update v1 pack upstream and sync into migrated v2 snapshot
  const v1UpstreamUpdated = commandDomain.applyTextLibraryCommand(v1Snapshot, {
    type: 'segment.update',
    payload: { id: 'SEGMENT_000002', text: 'The express train arrived early.' }
  }, 5260).snapshot;
  const v1PackRev2 = packDomain.createProLingoTextPack({
    snapshot: v1UpstreamUpdated,
    scopeType: 'document',
    rootId: 'DOC_000001',
    packageId: v1Pack.packageId,
    now: 5270
  });

  const v1IntoV2Sync = attachmentDomain.planTextSourceSync({
    localSnapshot: migratedAttachedSnap,
    pack: v1PackRev2,
    attachment: v1Attached.attachment,
    now: 5280
  });
  assert.equal(v1IntoV2Sync.ok, true, `Expected v1 pack sync into migrated v2 snapshot to succeed, got conflicts: ${(v1IntoV2Sync.conflicts || []).join('; ')}`);
  assert.equal(contentUnitDomain.validateTextContentUnitsState(v1IntoV2Sync.snapshot).valid, true);
  assert.equal(
    v1IntoV2Sync.snapshot.segments.find(s => s.id === v1Attached.idMap.segments.SEGMENT_000002).text,
    'The express train arrived early.'
  );

  // 5. Clean control after v1->v2 migration: upstream removes unmodified empty v1 Card TEXT_000003, and clean Detach(removeData:true) succeeds
  const v1UpstreamTrimEmptyCard = {
    ...v1PackRev2,
    blocks: v1PackRev2.blocks.filter(b => b.id !== 'TEXT_000003')
  };
  const v1TrimEmptySync = attachmentDomain.planTextSourceSync({
    localSnapshot: v1IntoV2Sync.snapshot,
    pack: v1UpstreamTrimEmptyCard,
    attachment: v1IntoV2Sync.attachment,
    now: 5285
  });
  assert.equal(v1TrimEmptySync.ok, true, `Clean empty v1 Card removal after v2 migration should succeed, got: ${(v1TrimEmptySync.conflicts || []).join('; ')}`);
  assert.equal(v1TrimEmptySync.snapshot.blocks.some(b => b.id === 'TEXT_000003'), false);

  const cleanDetachMigratedV1 = attachmentDomain.planTextSourceDetach({
    localSnapshot: v1TrimEmptySync.snapshot,
    attachment: v1TrimEmptySync.attachment,
    removeData: true,
    now: 5288
  });
  assert.equal(cleanDetachMigratedV1.ok, true);
  assert.equal(cleanDetachMigratedV1.snapshot.blocks.length, 0);
  assert.equal(cleanDetachMigratedV1.snapshot.contentUnits.length, 0);

  // 6. Finding B: v1 attachment migrated to v2 + intentionally empty local Content Unit inside an attached Card
  //    MUST protect the local-only empty Content Unit when upstream removes the Card OR on detach(removeData=true)
  // Test both Conversation attached Card (DOC_000002) and Paragraph attached Card (DOC_000001):
  for (const [docId, cardToRemoveId] of [['DOC_000002', 'TEXT_000004'], ['DOC_000001', 'TEXT_000002']]) {
    const v1DocPack = packDomain.createProLingoTextPack({
      snapshot: v1Snapshot,
      scopeType: 'document',
      rootId: docId,
      now: 5300
    });
    const docMergedV1 = packDomain.mergeProLingoTextPack({
      localSnapshot: emptyV1,
      pack: v1DocPack,
      now: 5310,
      uidMode: packDomain.PROLINGO_TEXT_PACK_UID_MODE_PRESERVE
    });
    const docAttachedV1 = attachmentDomain.createTextSourceAttachmentFromMerge({
      pack: v1DocPack,
      merged: docMergedV1,
      fileName: `${docId}-v1.json`,
      now: 5310
    });
    // Step 2: migrate local v1 snapshot to v2
    const docMigratedV2 = contentUnitDomain.backfillTextContentUnits(docAttachedV1.snapshot, { now: 5320 }).snapshot;

    // Step 3: create intentionally empty local Content Unit inside attached Card (keep Card/Segments otherwise untouched!)
    const localCardId = docAttachedV1.idMap.blocks[cardToRemoveId];
    const localCard = docMigratedV2.blocks.find(b => b.id === localCardId);
    const withEmptyLocalUnitRes = commandDomain.applyTextLibraryCommand(docMigratedV2, {
      type: 'contentUnit.create',
      payload: {
        blockId: localCardId,
        ...(localCard.blockType === 'conversation' ? { speaker: 'Amelia' } : {})
      }
    }, 5330);
    const snapWithEmptyLocalUnit = withEmptyLocalUnitRes.snapshot;
    const emptyLocalUnitId = withEmptyLocalUnitRes.result.id;

    // Step 4: remove that Card from upstream v1 Pack
    const upstreamWithoutCardSnap = {
      ...v1Snapshot,
      blocks: v1Snapshot.blocks.filter(b => b.id !== cardToRemoveId),
      segments: v1Snapshot.segments.filter(s => s.blockId !== cardToRemoveId),
      audioVariants: []
    };
    const upstreamV1WithoutCard = packDomain.createProLingoTextPack({
      snapshot: upstreamWithoutCardSnap,
      scopeType: 'document',
      rootId: docId,
      packageId: v1DocPack.packageId,
      now: 5340
    });

    // Step 5: execute Sync -> must block with explicit conflict rather than silently destroying empty local Unit!
    const syncConflict = attachmentDomain.planTextSourceSync({
      localSnapshot: snapWithEmptyLocalUnit,
      pack: upstreamV1WithoutCard,
      attachment: docAttachedV1.attachment,
      now: 5350
    });
    assert.equal(syncConflict.ok, false, `Expected Sync to block removal of Card ${cardToRemoveId} holding empty local Content Unit`);
    assert.equal(syncConflict.conflict, true);
    assert.equal(syncConflict.conflicts.some(c => /local-only Content Unit/i.test(c)), true);
    assert.equal(snapWithEmptyLocalUnit.contentUnits.some(u => u.id === emptyLocalUnitId), true);

    // Step 6: execute planTextSourceDetach({ removeData: true }) -> must ALSO block with explicit conflict!
    const detachConflict = attachmentDomain.planTextSourceDetach({
      localSnapshot: snapWithEmptyLocalUnit,
      attachment: docAttachedV1.attachment,
      removeData: true,
      now: 5360
    });
    assert.equal(detachConflict.ok, false, `Expected detach(removeData=true) to block removal of Card ${cardToRemoveId} holding empty local Content Unit`);
    assert.equal(detachConflict.conflict, true);
    assert.equal(detachConflict.conflicts.some(c => /local-only Content Unit/i.test(c)), true);
  }
});

// ---------------------------------------------------------------------------
// D3C-04: External JSON v1 Initial Import & Reconciliation on v2 Snapshots
// ---------------------------------------------------------------------------
await test('D3C-04: External JSON v1 initial import and reconciliation preserve v2 ContentUnits, speaker mappings, empty Units, and Legacy isolation', async () => {
  const fixtureDir = path.join(__dirname, 'fixtures', 'p12a');
  const rev1Raw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'P12_Conversation_Only_Additional_Test_v1.json'), 'utf8'));
  const rev2SpeakerRenameRaw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'P12A_Reimport_Preserve_And_Rename_v2.json'), 'utf8'));
  const rev2ReassignRaw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'P12A_Speaker_Conflict_Incoming_v2.json'), 'utf8'));

  const emptyV2 = contentUnitDomain.backfillTextContentUnits(
    libraryDomain.normalizeTextLibraryRuntimeSnapshot({
      schemaVersion: 1,
      initialized: true,
      activeDocumentId: null,
      counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
      collections: [],
      documents: [],
      blocks: [],
      segments: [],
      audioVariants: []
    }),
    { now: 6000 }
  ).snapshot;

  // 1. Initial External JSON import into a v2 snapshot creates persistent Turn ContentUnits
  const initialPlan = externalDomain.planProLingoTextExternalInitialImport({
    localSnapshot: emptyV2,
    package: rev1Raw,
    existingImports: [],
    fileName: 'p12a-rev1-initial.json',
    now: 6100
  });
  let state = initialPlan.snapshot;
  assert.equal(contentUnitDomain.validateTextContentUnitsState(state, { checkCounterFloor: true }).valid, true);
  assert.equal(state.contentUnits.length, state.segments.length);
  const initialUnitIdBySegId = new Map(state.segments.map(s => [s.id, s.unitId]));
  const initialUnitUidByUnitId = new Map(state.contentUnits.map(u => [u.id, u.uid]));

  // Add a local-only empty Paragraph Card (and delete its Unit to make it an intentionally 0-Unit Card)
  // plus a local-only Conversation Card with an intentionally empty Turn Unit!
  // Wait: doc is conversation-only; let's add a local-only Conversation Card with 1 empty Turn Unit and 1 populated Turn Unit!
  const localBlockRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'block.create',
    payload: { documentId: initialPlan.importRecord.documentId, blockType: 'conversation', title: 'Local Notes Card' }
  }, 6120);
  state = localBlockRes.snapshot;
  const emptyLocalTurnRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.create',
    payload: { blockId: localBlockRes.result.id, speaker: 'Amelia' }
  }, 6130);
  state = emptyLocalTurnRes.snapshot;
  const populatedLocalTurnRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.create',
    payload: { blockId: localBlockRes.result.id, speaker: 'Amelia', text: 'Local-only surviving remark.' }
  }, 6140);
  state = populatedLocalTurnRes.snapshot;

  // 2. Reconcile with rev2-speaker-rename: must preserve all existing UNIT_* / UNITUID_* and sync speaker rename onto Turn Units & Segments!
  const renameReconcile = reconcileDomain.planTextExternalUpdateExisting({
    localSnapshot: state,
    package: rev2SpeakerRenameRaw,
    existingImport: initialPlan.importRecord,
    conflictPolicy: 'keep-local',
    fileName: 'p12a-rev2-speaker-rename.json',
    now: 6200
  });
  state = renameReconcile.snapshot;
  assert.equal(contentUnitDomain.validateTextContentUnitsState(state, { checkCounterFloor: true }).valid, true);

  // Every retained external segment kept its exact UNIT_* and UNITUID_*
  for (const [segId, origUnitId] of initialUnitIdBySegId.entries()) {
    const segAfter = state.segments.find(s => s.id === segId);
    assert.ok(segAfter);
    assert.equal(segAfter.unitId, origUnitId, `Segment ${segId} must retain its ContentUnit ${origUnitId} across reconcile`);
    const unitAfter = state.contentUnits.find(u => u.id === origUnitId);
    assert.equal(unitAfter?.uid, initialUnitUidByUnitId.get(origUnitId), `ContentUnit ${origUnitId} must retain its UNITUID`);
  }
  // Intentionally empty local Turn Unit survived reconciliation!
  assert.equal(state.contentUnits.some(u => u.id === emptyLocalTurnRes.result.id), true);
  assert.equal(state.contentUnits.some(u => u.id === populatedLocalTurnRes.result.id), true);

  // 3. Reconcile with rev2-speaker-reassignment (use-incoming): updates reassigned Turn's speakerId & speaker
  const reassignReconcile = reconcileDomain.planTextExternalUpdateExisting({
    localSnapshot: state,
    package: rev2ReassignRaw,
    existingImport: renameReconcile.importRecord,
    conflictPolicy: 'use-incoming',
    fileName: 'p12a-rev2-speaker-reassignment.json',
    now: 6300
  });
  state = reassignReconcile.snapshot;
  assert.equal(contentUnitDomain.validateTextContentUnitsState(state, { checkCounterFloor: true }).valid, true);

  // 4. Legacy external JSON package imported & reconciled in v2 snapshot stays 100% isolated (0 ContentUnits)
  const legacyPkg = {
    packageType: 'prolingo-text-external',
    packageVersion: 1,
    externalSourceKey: 'ext-legacy-d3c-01',
    source: { sourceKind: 'manual', title: 'Legacy Source' },
    workspace: {
      workspaceKey: 'main',
      workspaceType: 'legacy',
      title: 'External Legacy Doc',
      textLanguage: 'en',
      meaningLanguage: 'id',
      entries: [
        { entryKey: 'e1', order: 1, text: 'Legacy external line 1', meaning: 'Baris 1' },
        { entryKey: 'e2', order: 2, text: 'Legacy external line 2', meaning: 'Baris 2' }
      ]
    }
  };
  const legacyInitial = externalDomain.planProLingoTextExternalInitialImport({
    localSnapshot: state,
    package: legacyPkg,
    existingImports: [reassignReconcile.importRecord],
    now: 6400
  });
  assert.equal(
    legacyInitial.snapshot.contentUnits.filter(u => u.documentId === legacyInitial.importRecord.documentId).length,
    0,
    'Legacy external import must allocate 0 ContentUnits'
  );
  assert.equal(contentUnitDomain.validateTextContentUnitsState(legacyInitial.snapshot).valid, true);

  // 5. Finding B External JSON review: removing an external Card that holds an intentionally empty local Content Unit
  //    MUST preserve & detach the parent Card and keep the empty local Unit (and rescue its speaker if removed externally).
  const extEmptyTestInit = externalDomain.planProLingoTextExternalInitialImport({
    localSnapshot: emptyV2,
    package: rev1Raw,
    existingImports: [],
    now: 6500
  });
  let extEmptyState = extEmptyTestInit.snapshot;
  const extDocId = extEmptyTestInit.importRecord.documentId;
  const closingBlock = extEmptyState.blocks.find(b => b.documentId === extDocId && b.metadata?.externalEntityV1?.cardKey === 'closing');
  assert.ok(closingBlock);

  // Add an intentionally empty local Turn Unit inside unmodified external Card "closing" for speaker Farah
  const emptyLocalTurnInClosing = commandDomain.applyTextLibraryCommand(extEmptyState, {
    type: 'contentUnit.create',
    payload: { blockId: closingBlock.id, speaker: 'Farah' }
  }, 6510);
  extEmptyState = emptyLocalTurnInClosing.snapshot;
  const emptyTurnInClosingId = emptyLocalTurnInClosing.result.id;

  // Incoming package deletes Card "closing" AND deletes external speaker "farah"
  const rev2ClosingRemoved = structuredClone(rev1Raw);
  rev2ClosingRemoved.workspace.cards = rev2ClosingRemoved.workspace.cards
    .filter(c => c.cardKey !== 'closing')
    .map(c => ({
      ...c,
      segments: c.segments.map(seg => seg.speakerKey === 'farah' ? { ...seg, speakerKey: 'amelia' } : seg)
    }));
  rev2ClosingRemoved.workspace.speakers = rev2ClosingRemoved.workspace.speakers.filter(s => s.speakerKey !== 'farah');

  const extEmptyReconcile = reconcileDomain.planTextExternalUpdateExisting({
    localSnapshot: extEmptyState,
    package: rev2ClosingRemoved,
    existingImport: extEmptyTestInit.importRecord,
    conflictPolicy: 'use-incoming',
    now: 6520
  });
  const preservedClosingBlock = extEmptyReconcile.snapshot.blocks.find(b => b.id === closingBlock.id);
  assert.ok(preservedClosingBlock, 'Parent external Card holding an intentionally empty local Content Unit must be preserved when removed externally');
  assert.equal(preservedClosingBlock.metadata?.externalEntityV1, undefined, 'Preserved parent Card must be detached from removed external source');

  const preservedEmptyUnit = extEmptyReconcile.snapshot.contentUnits.find(u => u.id === emptyTurnInClosingId);
  assert.ok(preservedEmptyUnit, 'Intentionally empty local Content Unit must survive external parent Card removal');
  assert.equal(preservedEmptyUnit.order, 1);
  assert.equal(preservedEmptyUnit.speaker, 'Farah');
  assert.equal(extEmptyReconcile.snapshot.segments.filter(s => s.blockId === closingBlock.id).length, 0);

  // Rescued speaker Farah must still exist cleanly in speakerRegistryV1 (detached from externalKey)
  const docAfterExtEmpty = extEmptyReconcile.snapshot.documents.find(d => d.id === extDocId);
  const farahAfter = docAfterExtEmpty.metadata?.speakerRegistryV1?.find(s => s.label === 'Farah');
  assert.ok(farahAfter, 'Externally removed speaker referenced by surviving empty Turn Unit must be rescued');
  assert.equal(farahAfter.externalKey, undefined);
  assert.equal(contentUnitDomain.validateTextContentUnitsState(extEmptyReconcile.snapshot, { checkCounterFloor: true }).valid, true);
});

// ---------------------------------------------------------------------------
// D3C-05: Audio Integrity (Readiness Across segment.move, METADATA_ONLY vs READY, ZIP v2, & Staging GC)
// ---------------------------------------------------------------------------
await test('D3C-05: Audio integrity across segment.move speaker change, METADATA_ONLY vs physical READY, Portable ZIP v2, and Staging GC', async () => {
  const { v2Snapshot, rfPara1, rfConvAmelia, fullArtifactRecord } = createMultiWorkspaceDataset();

  const preferences = {
    edgeRate: 0,
    edgePitch: 0
  };

  // 1. Metadata reference without runtime binary is METADATA_ONLY, never READY
  const convTreeInitial = libraryDomain.resolveTextLibraryDocumentTree(v2Snapshot, 'DOC_000002');
  const covWithoutBinary = buildTextStructuredAudioCoverageMap({
    documentTree: convTreeInitial,
    audioVariants: v2Snapshot.audioVariants,
    runtimeAudioUrls: {},
    preferences
  });
  const seg4Key = buildTextStructuredRuntimeAudioKey('SEGMENT_000004', 'text');
  assert.equal(covWithoutBinary[seg4Key].status, TEXT_AUDIO_COVERAGE_STATUS.METADATA_ONLY);

  // 2. With physical binary in Staging/runtime, SEGMENT_000004 (Amelia, Jenny voice) is READY
  const runtimeAudioUrls = {
    TXTAUDIO_000001: { url: 'blob:seg2', stagingBacked: true, filename: 'seg2.mp3' },
    TXTAUDIO_000002: { url: 'blob:seg4', stagingBacked: true, filename: 'seg4.mp3' }
  };
  const covWithBinary = buildTextStructuredAudioCoverageMap({
    documentTree: convTreeInitial,
    audioVariants: v2Snapshot.audioVariants,
    runtimeAudioUrls,
    preferences
  });
  assert.equal(covWithBinary[seg4Key].status, TEXT_AUDIO_COVERAGE_STATUS.READY);

  // 3. Move SEGMENT_000004 from Amelia's Turn to Ben's Turn (Guy voice) via segment.move:
  //    - Physical audioVariant TXTAUDIO_000002 is preserved (NOT deleted)
  //    - Staging GC still sees rfConvAmelia as referenced (NOT orphaned)
  //    - Playback coverage transitions READY -> OTHER_PROFILE because expected voice is now Guy!
  const benTurn = v2Snapshot.contentUnits.find(u => u.blockId === 'TEXT_000004' && u.speaker === 'Ben');
  const ameliaTurn = v2Snapshot.contentUnits.find(u => u.blockId === 'TEXT_000004' && u.speaker === 'Amelia');
  const movedToBenSnap = commandDomain.applyTextLibraryCommand(v2Snapshot, {
    type: 'segment.move',
    payload: { segmentId: 'SEGMENT_000004', targetUnitId: benTurn.id }
  }, 7000).snapshot;

  const convTreeMoved = libraryDomain.resolveTextLibraryDocumentTree(movedToBenSnap, 'DOC_000002');
  const covAfterMoveToBen = buildTextStructuredAudioCoverageMap({
    documentTree: convTreeMoved,
    audioVariants: movedToBenSnap.audioVariants,
    runtimeAudioUrls,
    preferences
  });
  assert.equal(
    covAfterMoveToBen[seg4Key].status,
    TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE,
    'Moving segment to different-speaker Turn must change readiness to OTHER_PROFILE while retaining audio variant'
  );

  // Moving SEGMENT_000004 back to Amelia's Turn restores READY without regenerating audio!
  const movedBackSnap = commandDomain.applyTextLibraryCommand(movedToBenSnap, {
    type: 'segment.move',
    payload: { segmentId: 'SEGMENT_000004', targetUnitId: ameliaTurn.id, beforeSegmentId: 'SEGMENT_000005' }
  }, 7100).snapshot;
  const convTreeMovedBack = libraryDomain.resolveTextLibraryDocumentTree(movedBackSnap, 'DOC_000002');
  const covAfterMoveBack = buildTextStructuredAudioCoverageMap({
    documentTree: convTreeMovedBack,
    audioVariants: movedBackSnap.audioVariants,
    runtimeAudioUrls,
    preferences
  });
  assert.equal(covAfterMoveBack[seg4Key].status, TEXT_AUDIO_COVERAGE_STATUS.READY);

  // 4. Portable Audio ZIP v2 manifest scan works across v2 Content Units
  const zipFilename = buildCanonicalTextRenderAudioFilename({
    renderFingerprint: rfConvAmelia.renderFingerprint,
    engine: 'edge',
    voiceId: 'en-US-JennyNeural',
    extension: 'mp3'
  });
  const mp3Blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' });
  const manifest = buildProLingoTextAudioManifest({
    entries: [{
      rf: rfConvAmelia.renderFingerprint,
      filename: zipFilename,
      mimeType: 'audio/mpeg',
      size: mp3Blob.size,
      render: rfConvAmelia.descriptor
    }]
  });
  const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const zipBlob = await buildStoredZipBlob([
    { filename: zipFilename, blob: mp3Blob },
    { filename: TEXT_AUDIO_MANIFEST_FILENAME, blob: manifestBlob }
  ]);
  Object.defineProperty(zipBlob, 'name', { value: 'd3c-portable-audio.zip' });
  Object.defineProperty(zipBlob, 'lastModified', { value: 7200 });

  const zipScan = await scanTextStructuredAudioZipFiles({
    files: [zipBlob],
    audioVariants: v2Snapshot.audioVariants,
    segments: v2Snapshot.segments,
    requirements: [{
      segmentId: 'SEGMENT_000004',
      channel: 'text',
      engine: 'edge',
      voiceId: 'en-US-JennyNeural',
      content: 'Good morning everyone.',
      renderFingerprint: rfConvAmelia.renderFingerprint,
      contentFingerprintV2: rfConvAmelia.contentFingerprintV2,
      renderDescriptor: rfConvAmelia.descriptor
    }]
  });
  assert.equal(zipScan.matches.length, 1);
  assert.equal(zipScan.orphanCount, 0);

  // 5. Audio Staging GC:
  //    - Before deletion: both rfPara1, rfConvAmelia, and fullArtifactRecord are referenced
  //    - Split Paragraph Unit on TEXT_000002 & reorder the two Paragraph Units:
  //      Full artifact becomes STALE (unreferenced for active Full), while Split rfPara1 stays referenced!
  //    - Delete Amelia's Turn: rfConvAmelia becomes an orphan in GC plan!
  const stagingRecords = [
    { id: 'STG_1', hasBlob: true, mapKey: rfPara1.renderFingerprint, size: 100 },
    { id: 'STG_2', hasBlob: true, mapKey: rfConvAmelia.renderFingerprint, size: 200 },
    {
      id: 'STG_FULL',
      hasBlob: true,
      mapKey: fullArtifactRecord.fullArtifactFingerprint,
      metadata: { fullArtifactFingerprint: fullArtifactRecord.fullArtifactFingerprint },
      size: 500
    }
  ];
  const gcBefore = planTextAudioStagingGarbage({ snapshot: v2Snapshot, records: stagingRecords });
  assert.equal(gcBefore.referencedCount, 3);
  assert.equal(gcBefore.orphanCount, 0);

  const paraUnit = v2Snapshot.contentUnits.find(u => u.blockId === 'TEXT_000002');
  const splitParaRes = commandDomain.applyTextLibraryCommand(v2Snapshot, {
    type: 'contentUnit.split',
    payload: { id: paraUnit.id, beforeSegmentId: 'SEGMENT_000003' }
  }, 7300);
  // Splitting a Paragraph Unit without changing segment order keeps Full artifact contentFingerprint intact!
  const gcAfterSplit = planTextAudioStagingGarbage({ snapshot: splitParaRes.snapshot, records: stagingRecords });
  assert.equal(gcAfterSplit.referencedFingerprints.has(fullArtifactRecord.fullArtifactFingerprint), true);

  // Reordering the two Paragraph Units changes Card segment order -> Full artifact becomes stale, Split RF stays referenced!
  const reorderedParaSnap = commandDomain.applyTextLibraryCommand(splitParaRes.snapshot, {
    type: 'contentUnit.reorder',
    payload: { blockId: 'TEXT_000002', orderedIds: [splitParaRes.result.createdId, paraUnit.id] }
  }, 7400).snapshot;
  const gcAfterReorder = planTextAudioStagingGarbage({ snapshot: reorderedParaSnap, records: stagingRecords });
  assert.equal(gcAfterReorder.referencedFingerprints.has(fullArtifactRecord.fullArtifactFingerprint), false);
  assert.equal(gcAfterReorder.referencedFingerprints.has(rfPara1.renderFingerprint), true);

  // Deleting Amelia's Turn removes SEGMENT_000004 and TXTAUDIO_000002 -> rfConvAmelia becomes an orphan in GC
  const deletedTurnSnap = commandDomain.applyTextLibraryCommand(reorderedParaSnap, {
    type: 'contentUnit.delete',
    payload: { id: ameliaTurn.id }
  }, 7500).snapshot;
  const gcAfterDelete = planTextAudioStagingGarbage({ snapshot: deletedTurnSnap, records: stagingRecords });
  assert.equal(gcAfterDelete.referencedFingerprints.has(rfConvAmelia.renderFingerprint), false);
  assert.equal(gcAfterDelete.orphanCount, 2);
});

console.log(`P12D_D3C_AUDIT_SUMMARY: PASS: ${passed}, FAIL: ${failed} (Total: ${passed + failed})`);
if (failed > 0) process.exitCode = 1;
