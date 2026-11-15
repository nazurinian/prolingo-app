import assert from 'node:assert/strict';

import * as constants from '../src/constants/textDatabaseConstants.js';
import * as globalIdentity from '../src/domain/text/textGlobalIdentityDomain.js';
import * as libraryDomain from '../src/domain/text/textLibraryDomain.js';
import * as commandDomain from '../src/domain/text/textLibraryCommandDomain.js';
import * as indexedDbService from '../src/services/persistence/textLibraryIndexedDbService.js';
import {
  projectTextDocumentToVirtualContentUnits
} from '../src/domain/text/textContentUnitAdapterDomain.js';
import {
  buildTextStructuredAudioRenderFingerprint
} from '../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import {
  buildTextStructuredFullArtifactIdentity,
  buildTextStructuredFullRepresentation
} from '../src/domain/text/textStructuredSplitFullDomain.js';
import {
  TEXT_PARAGRAPH_ROLE_METADATA_KEY
} from '../src/domain/text/textParagraphRoleDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY as TEXT_SPEAKER_IDENTITY_METADATA_KEY,
  TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY as TEXT_SPEAKER_REGISTRY_METADATA_KEY
} from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';

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
 * Isolated in-memory IndexedDB harness supporting v1 -> v2 onupgradeneeded,
 * transaction.objectStore during upgrades, index creation/inspection, and deleteDatabase.
 */
const createMemoryIndexedDb = () => {
  const dbs = new Map();

  const extractKeyValue = (row, keyPath) => (
    Array.isArray(keyPath)
      ? keyPath.map(key => row?.[key])
      : row?.[keyPath]
  );

  const keyMatches = (candidate, query) => {
    if (Array.isArray(candidate) && Array.isArray(query)) {
      return candidate.length === query.length && candidate.every((item, idx) => item === query[idx]);
    }
    return candidate === query;
  };

  const makeRequest = (executor, txState = null) => {
    const req = { result: undefined, error: null, onsuccess: null, onerror: null };
    if (txState) txState.pending += 1;
    queueMicrotask(() => {
      try {
        req.result = executor();
        req.onsuccess?.({ target: req });
      } catch (error) {
        req.error = error;
        if (txState) txState.error = error;
        req.onerror?.({ target: req });
      } finally {
        if (txState) {
          txState.pending -= 1;
          if (txState.pending === 0 && !txState.finished) {
            queueMicrotask(() => {
              if (txState.pending === 0 && !txState.finished) {
                txState.finished = true;
                if (txState.error) txState.onerror?.({ target: txState });
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
    indexNames: {
      contains: idxName => store.indexes.has(idxName)
    },
    createIndex: (idxName, idxKeyPath, opts = {}) => {
      store.indexes.set(idxName, { keyPath: idxKeyPath, unique: Boolean(opts?.unique) });
      return store.indexes.get(idxName);
    },
    index: idxName => {
      const idx = store.indexes.get(idxName);
      assert.ok(idx, `Missing index ${idxName} on store ${store.name}`);
      return {
        getAll: key => makeRequest(
          () => [...store.rows.values()].filter(row => keyMatches(extractKeyValue(row, idx.keyPath), key)),
          txState
        ),
        getAllKeys: key => makeRequest(
          () => [...store.rows.entries()]
            .filter(([, row]) => keyMatches(extractKeyValue(row, idx.keyPath), key))
            .map(([keyValue]) => keyValue),
          txState
        )
      };
    },
    get: key => makeRequest(() => structuredClone(store.rows.get(key)), txState),
    getAll: () => makeRequest(() => [...store.rows.values()].map(row => structuredClone(row)), txState),
    count: () => makeRequest(() => store.rows.size, txState),
    put: row => makeRequest(() => {
      const key = row?.[store.keyPath];
      store.rows.set(key, structuredClone(row));
      return key;
    }, txState),
    delete: key => makeRequest(() => { store.rows.delete(key); }, txState),
    clear: () => makeRequest(() => { store.rows.clear(); }, txState)
  });

  const buildTransaction = (db, storeNames) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const txState = {
      pending: 0,
      finished: false,
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore: storeName => {
        assert.ok(names.includes(storeName), `Store ${storeName} not in transaction scope`);
        const store = db.stores.get(storeName);
        assert.ok(store, `Object store ${storeName} does not exist`);
        return buildStoreHandle(store, txState);
      }
    };
    return txState;
  };

  return {
    _dbs: dbs,
    open: (name, version = 1) => {
      const existingDb = dbs.get(name) || null;
      const oldVersion = existingDb ? existingDb.version : 0;
      const upgradeNeeded = !existingDb || existingDb.version < version;
      const db = existingDb || { name, version, stores: new Map(), close() {} };
      if (!existingDb) dbs.set(name, db);

      db.objectStoreNames = { contains: storeName => db.stores.has(storeName) };
      db.createObjectStore = (storeName, { keyPath = 'id' } = {}) => {
        const store = {
          name: storeName,
          keyPath,
          rows: new Map(),
          indexes: new Map()
        };
        db.stores.set(storeName, store);
        return buildStoreHandle(store, null);
      };
      db.transaction = storeNames => buildTransaction(db, storeNames);

      const openReq = {
        result: db,
        transaction: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null
      };

      queueMicrotask(() => {
        if (upgradeNeeded) {
          db.version = version;
          openReq.transaction = {
            objectStore: storeName => {
              const store = db.stores.get(storeName);
              assert.ok(store, `Upgrade objectStore ${storeName} not found`);
              return buildStoreHandle(store, null);
            }
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

const createRealisticV1Snapshot = () => {
  const docParaId = 'DOC_000001';
  const docConvId = 'DOC_000002';
  const docMixedId = 'DOC_000003';
  const docLegacyId = 'DOC_000004';

  const blockParaTitleId = 'TEXT_000001';
  const blockParaBodyId = 'TEXT_000002';
  const blockParaEmptyId = 'TEXT_000003';
  const blockConvMainId = 'TEXT_000004';
  const blockConvEmptyId = 'TEXT_000005';
  const blockMixedParaId = 'TEXT_000006';
  const blockMixedConvId = 'TEXT_000007';
  const blockLegacy1Id = 'TEXT_000008';
  const blockLegacy2Id = 'TEXT_000009';

  const spkAmeliaId = 'SPK_amelia_01';
  const spkBenId = 'SPK_ben_02';
  const spkAmeliaUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SPEAKER);
  const spkBenUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SPEAKER);

  const coll = libraryDomain.createTextCollectionRecord({
    id: 'COLL_000001',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.COLLECTION),
    title: 'D3-B Regression Pack',
    order: 1,
    createdAt: 1000,
    updatedAt: 1000
  });

  const docPara = libraryDomain.createTextDocumentRecord({
    id: docParaId,
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: coll.id,
    title: 'Paragraph Workspace',
    order: 1,
    documentType: 'paragraph',
    editorModel: constants.TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000
  });

  const docConv = libraryDomain.createTextDocumentRecord({
    id: docConvId,
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: coll.id,
    title: 'Conversation Workspace',
    order: 2,
    documentType: 'conversation',
    editorModel: constants.TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000,
    metadata: {
      [TEXT_SPEAKER_REGISTRY_METADATA_KEY]: [
        { id: spkAmeliaId, uid: spkAmeliaUid, label: 'Amelia' },
        { id: spkBenId, uid: spkBenUid, label: 'Ben' }
      ]
    }
  });

  const docMixed = libraryDomain.createTextDocumentRecord({
    id: docMixedId,
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: coll.id,
    title: 'Mixed Workspace',
    order: 3,
    documentType: 'mixed',
    editorModel: constants.TEXT_STRUCTURED_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000,
    metadata: {
      [TEXT_SPEAKER_REGISTRY_METADATA_KEY]: [
        { id: spkAmeliaId, uid: spkAmeliaUid, label: 'Amelia' }
      ]
    }
  });

  const docLegacy = libraryDomain.createTextDocumentRecord({
    id: docLegacyId,
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    collectionId: null,
    title: 'Legacy Workspace',
    order: 1,
    documentType: 'mixed',
    editorModel: constants.TEXT_LEGACY_EDITOR_MODEL,
    createdAt: 1000,
    updatedAt: 1000,
    metadata: { migratedFrom: 'prolingo_text_identity_v1' }
  });

  const splitRf = buildTextStructuredAudioRenderFingerprint({
    channel: 'text',
    content: 'First paragraph sentence.',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });

  const segParaTitle = libraryDomain.createTextSegmentRecord({
    id: 'SEGMENT_000001',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: docParaId,
    blockId: blockParaTitleId,
    order: 1,
    text: 'Chapter One',
    meaning: 'Bab Satu',
    createdAt: 1000,
    updatedAt: 1000
  });

  const segParaBody1 = libraryDomain.createTextSegmentRecord({
    id: 'SEGMENT_000002',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: docParaId,
    blockId: blockParaBodyId,
    order: 1,
    text: 'First paragraph sentence.',
    meaning: 'Kalimat paragraf pertama.',
    joinAfter: 'space',
    createdAt: 1000,
    updatedAt: 1000
  });

  const segParaBody2 = libraryDomain.createTextSegmentRecord({
    id: 'SEGMENT_000003',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
    documentId: docParaId,
    blockId: blockParaBodyId,
    order: 2,
    text: 'Second paragraph sentence.',
    meaning: 'Kalimat paragraf kedua.',
    joinAfter: 'space',
    createdAt: 1000,
    updatedAt: 1000
  });

  const blockParaBodyRaw = libraryDomain.createTextBlockRecord({
    id: blockParaBodyId,
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
    documentId: docParaId,
    order: 2,
    blockType: 'paragraph',
    title: 'Body Card',
    createdAt: 1000,
    updatedAt: 1000
  });

  const fullIdentityBefore = buildTextStructuredFullArtifactIdentity({
    block: { ...blockParaBodyRaw, segments: [segParaBody1, segParaBody2] },
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });

  const blocks = [
    libraryDomain.createTextBlockRecord({
      id: blockParaTitleId,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docParaId,
      order: 1,
      blockType: 'paragraph',
      title: 'Title Card',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: 'title' }
    }),
    {
      ...blockParaBodyRaw,
      metadata: {
        prolingoTextPackSource: { sourceKey: 'pack-para-body', contentHash: 'abc123' },
        fullAudioArtifactsV1: {
          schemaVersion: 1,
          entries: [{
            channel: 'text',
            voiceId: 'en-US-AriaNeural',
            rate: 0,
            pitch: 0,
            engine: 'edge',
            language: 'en',
            fullArtifactFingerprint: fullIdentityBefore.fullArtifactFingerprint,
            contentFingerprint: fullIdentityBefore.fullRepresentation.contentFingerprint
          }]
        }
      }
    },
    libraryDomain.createTextBlockRecord({
      id: blockParaEmptyId,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docParaId,
      order: 3,
      blockType: 'paragraph',
      title: 'Empty Paragraph Card',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: blockConvMainId,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docConvId,
      order: 1,
      blockType: 'conversation',
      title: 'Dialogue Card',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: blockConvEmptyId,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docConvId,
      order: 2,
      blockType: 'conversation',
      title: 'Empty Conversation Card',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: blockMixedParaId,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docMixedId,
      order: 1,
      blockType: 'paragraph',
      title: 'Mixed Para Card',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: blockMixedConvId,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docMixedId,
      order: 2,
      blockType: 'conversation',
      title: 'Mixed Conv Card',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextBlockRecord({
      id: blockLegacy1Id,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docLegacyId,
      order: 1,
      blockType: 'paragraph',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { migratedFromLegacyLine: true }
    }),
    libraryDomain.createTextBlockRecord({
      id: blockLegacy2Id,
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CARD),
      documentId: docLegacyId,
      order: 2,
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
    // Two adjacent same-speaker segments (MUST stay 2 separate Turns per R6!)
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000004',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docConvId,
      blockId: blockConvMainId,
      order: 1,
      text: 'Hello there.',
      meaning: 'Halo.',
      speaker: 'Amelia',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_SPEAKER_IDENTITY_METADATA_KEY]: spkAmeliaId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000005',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docConvId,
      blockId: blockConvMainId,
      order: 2,
      text: 'Welcome inside.',
      meaning: 'Silakan masuk.',
      speaker: 'Amelia',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_SPEAKER_IDENTITY_METADATA_KEY]: spkAmeliaId }
    }),
    // Speakerless / missing speakerIdentityV1 Turn (MUST keep speakerId: null + label 'Guest' per R6!)
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000006',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docConvId,
      blockId: blockConvMainId,
      order: 3,
      text: 'Thank you kindly.',
      meaning: 'Terima kasih.',
      speaker: 'Guest',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000007',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docConvId,
      blockId: blockConvMainId,
      order: 4,
      text: 'Great to see you.',
      meaning: 'Senang bertemu.',
      speaker: 'Ben',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_SPEAKER_IDENTITY_METADATA_KEY]: spkBenId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000008',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docMixedId,
      blockId: blockMixedParaId,
      order: 1,
      text: 'Mixed intro.',
      createdAt: 1000,
      updatedAt: 1000
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000009',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docMixedId,
      blockId: blockMixedConvId,
      order: 1,
      text: 'Mixed line one.',
      speaker: 'Amelia',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { [TEXT_SPEAKER_IDENTITY_METADATA_KEY]: spkAmeliaId }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000010',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docLegacyId,
      blockId: blockLegacy1Id,
      order: 1,
      text: 'Legacy line 1',
      createdAt: 1000,
      updatedAt: 1000,
      metadata: { migratedFromLegacyLine: true }
    }),
    libraryDomain.createTextSegmentRecord({
      id: 'SEGMENT_000011',
      uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.SEGMENT),
      documentId: docLegacyId,
      blockId: blockLegacy2Id,
      order: 1,
      text: 'Legacy line 2',
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
        audioRenderFingerprintV1: splitRf.renderFingerprint,
        audioContentFingerprintV2: splitRf.contentFingerprintV2,
        audioRenderDescriptorV1: splitRf.descriptor
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
      updatedAt: 1000
    })
  ];

  const snapshot = libraryDomain.normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: 1,
    activeDocumentId: docParaId,
    initialized: true,
    counters: {
      collection: 1,
      document: 4,
      text: 9,
      segment: 11,
      audioVariant: 2
    },
    collections: [coll],
    documents: [docPara, docConv, docMixed, docLegacy],
    blocks,
    segments,
    audioVariants
  });

  return {
    snapshot,
    ids: {
      docParaId,
      docConvId,
      docMixedId,
      docLegacyId,
      blockParaTitleId,
      blockParaBodyId,
      blockParaEmptyId,
      blockConvMainId,
      blockConvEmptyId,
      blockMixedParaId,
      blockMixedConvId,
      blockLegacy1Id,
      blockLegacy2Id,
      spkAmeliaId,
      spkBenId
    },
    fullIdentityBefore
  };
};

// ---------------------------------------------------------------------------
// D3B-01: Active v1 Non-Activating Runtime & Dormant v2 Constants
// ---------------------------------------------------------------------------
await test('D3B-01a: Active IndexedDB & schema constants remain v1 with exact 6 v1 stores', async () => {
  assert.equal(constants.TEXT_LIBRARY_DB_NAME, 'prolingo_text_library');
  assert.equal(constants.TEXT_LIBRARY_DB_VERSION, 1);
  assert.equal(constants.TEXT_LIBRARY_SCHEMA_VERSION, 1);
  assert.deepEqual(Object.values(constants.TEXT_LIBRARY_STORES), [
    'meta',
    'collections',
    'documents',
    'blocks',
    'segments',
    'audioVariants'
  ]);

  assert.equal(constants.TEXT_LIBRARY_V2_DB_VERSION, 2);
  assert.equal(constants.TEXT_LIBRARY_V2_SCHEMA_VERSION, 2);
  assert.equal(constants.TEXT_LIBRARY_CONTENT_UNIT_STORE, 'contentUnits');
  assert.equal(constants.TEXT_LIBRARY_V2_STORES.CONTENT_UNITS, 'contentUnits');
  assert.equal(constants.TEXT_LIBRARY_V2_META_KEYS.CONTENT_UNIT_MIGRATION, 'contentUnitMigration');
  assert.equal(constants.TEXT_ID_PREFIXES.CONTENT_UNIT, 'UNIT_');
  assert.deepEqual(constants.TEXT_CONTENT_UNIT_KINDS, ['paragraph', 'turn']);
  assert.equal(globalIdentity.TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT, 'CONTENT_UNIT');
  assert.equal(globalIdentity.TEXT_GLOBAL_UID_PREFIXES.CONTENT_UNIT, 'UNITUID_');
});

await test('D3B-01b: Active openTextLibraryDatabase & readTextLibraryDiagnostics remain v1 without contentUnits store', async () => {
  const prevIndexedDb = globalThis.indexedDB;
  const mockIdb = createMemoryIndexedDb();
  globalThis.indexedDB = mockIdb;
  try {
    const db = await indexedDbService.openTextLibraryDatabase();
    assert.equal(db.name, constants.TEXT_LIBRARY_DB_NAME);
    assert.equal(db.version, 1);
    assert.equal(db.objectStoreNames.contains('contentUnits'), false);
    assert.equal(mockIdb._dbs.get(constants.TEXT_LIBRARY_DB_NAME).stores.size, 6);
    db.close();

    const diagnostics = await indexedDbService.readTextLibraryDiagnostics();
    assert.ok(diagnostics && typeof diagnostics === 'object');
    assert.equal(diagnostics.schemaVersion == null || diagnostics.schemaVersion === 1, true);
    assert.equal(JSON.stringify(diagnostics).includes('contentUnits'), false);
  } finally {
    globalThis.indexedDB = prevIndexedDb;
  }
});

// ---------------------------------------------------------------------------
// D3B-02: Domain Factory, UID Allocation, Validation & Counter Floor
// ---------------------------------------------------------------------------
await test('D3B-02: Normalized ContentUnit factories, UIDs, counters, and corruption guards', async () => {
  const contentUnitDomain = await import('../src/domain/text/textContentUnitDomain.js');

  assert.equal(libraryDomain.formatTextLibraryId('CONTENT_UNIT', 7), 'UNIT_000007');
  assert.equal(libraryDomain.getTextLibraryIdSequence('CONTENT_UNIT', 'UNIT_000007'), 7);
  assert.equal(libraryDomain.normalizeTextIdCounters({}).contentUnit, undefined);
  assert.equal(libraryDomain.normalizeTextIdCounters({}, { includeContentUnit: true }).contentUnit, 0);
  assert.equal(libraryDomain.normalizeTextIdCounters({ contentUnit: 4 }).contentUnit, 4);

  const unitUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT);
  assert.match(unitUid, /^UNITUID_/);

  const validUnit = contentUnitDomain.createTextContentUnitRecord({
    id: 'UNIT_000001',
    uid: unitUid,
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    kind: 'turn',
    order: 1,
    speakerId: 'SPK_amelia',
    speaker: 'Amelia',
    createdAt: 1000,
    updatedAt: 1000
  });
  assert.equal(validUnit.id, 'UNIT_000001');
  assert.equal(validUnit.uid, unitUid);
  assert.equal(validUnit.kind, 'turn');
  assert.equal('segmentIds' in validUnit, false, 'R4: never persist segmentIds array on ContentUnit');

  assert.throws(() => contentUnitDomain.createTextContentUnitRecord({
    id: 'UNIT_000001',
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    kind: 'paragraph',
    speakerId: 'SPK_1',
    order: 1
  }), /speaker/i);

  assert.throws(() => contentUnitDomain.createTextContentUnitRecord({
    id: 'UNIT_000001',
    documentId: 'DOC_000001',
    blockId: 'TEXT_000001',
    kind: 'mixed',
    order: 1
  }), /kind/i);

  const { snapshot: v1Snap, ids } = createRealisticV1Snapshot();
  // v1 backfillTextGlobalUids must preserve exact v1 shape without contentUnits key
  const v1UidResult = globalIdentity.backfillTextGlobalUids(v1Snap);
  assert.equal('contentUnits' in v1UidResult.snapshot, false);

  const migrated = contentUnitDomain.backfillTextContentUnits(v1Snap, { now: 5000 }).snapshot;

  // Duplicate UNIT_ID
  const dupIdSnap = {
    ...migrated,
    contentUnits: [...migrated.contentUnits, { ...migrated.contentUnits[0] }]
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(dupIdSnap).valid, false);

  // Duplicate / cross-entity colliding UNITUID
  const dupUidSnap = {
    ...migrated,
    contentUnits: migrated.contentUnits.map((unit, idx) => (
      idx === 1 ? { ...unit, uid: migrated.documents[0].uid } : unit
    ))
  };
  const uidDiag = globalIdentity.collectTextGlobalUidDiagnostics(dupUidSnap);
  assert.equal(uidDiag.valid, false);

  // Underflowed counter floor
  const lowCounterSnap = {
    ...migrated,
    counters: { ...migrated.counters, contentUnit: 1 }
  };
  assert.equal(
    contentUnitDomain.validateTextContentUnitsState(lowCounterSnap, { checkCounterFloor: true }).valid,
    false
  );

  // Cross-card segment.unitId
  const foreignUnit = migrated.contentUnits.find(u => u.blockId === ids.blockParaBodyId);
  const crossBlockSegSnap = {
    ...migrated,
    segments: migrated.segments.map(s => (
      s.blockId === ids.blockParaTitleId ? { ...s, unitId: foreignUnit.id } : s
    ))
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(crossBlockSegSnap).valid, false);

  // Legacy doc owning a ContentUnit
  const legacyUnit = contentUnitDomain.createTextContentUnitRecord({
    id: 'UNIT_000099',
    uid: globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT),
    documentId: ids.docLegacyId,
    blockId: ids.blockLegacy1Id,
    kind: 'paragraph',
    order: 1,
    createdAt: 5000,
    updatedAt: 5000
  });
  const legacyOwnedSnap = {
    ...migrated,
    counters: { ...migrated.counters, contentUnit: 99 },
    contentUnits: [...migrated.contentUnits, legacyUnit]
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(legacyOwnedSnap).valid, false);

  // Wrong unit.kind on Paragraph Card (R10 homogeneity)
  const badKindSnap = {
    ...migrated,
    contentUnits: migrated.contentUnits.map(u => (
      u.blockId === ids.blockParaBodyId ? { ...u, kind: 'turn' } : u
    ))
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(badKindSnap).valid, false);

  // Broken Card-monotonic ordering: Unit order 2 segment ordered before Unit order 1 segment
  const convUnits = migrated.contentUnits.filter(u => u.blockId === ids.blockConvMainId).sort((a, b) => a.order - b.order);
  const segForUnit1 = migrated.segments.find(s => s.unitId === convUnits[0].id);
  const segForUnit2 = migrated.segments.find(s => s.unitId === convUnits[1].id);
  const invertedOrderSnap = {
    ...migrated,
    segments: migrated.segments.map(s => {
      if (s.id === segForUnit1.id) return { ...s, order: segForUnit2.order };
      if (s.id === segForUnit2.id) return { ...s, order: segForUnit1.order };
      return s;
    })
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(invertedOrderSnap).valid, false);

  // Turn speakerId / segment mismatch (R6)
  const speakerMismatchSnap = {
    ...migrated,
    contentUnits: migrated.contentUnits.map(u => (
      u.id === convUnits[0].id ? { ...u, speakerId: ids.spkBenId, speaker: 'Ben' } : u
    ))
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(speakerMismatchSnap).valid, false);

  // Structured segment missing unitId in migrated snapshot
  const unlinkedSegSnap = {
    ...migrated,
    segments: migrated.segments.map((s, idx) => idx === 0 ? { ...s, unitId: null } : s)
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(unlinkedSegSnap).valid, false);

  // Persisted segmentIds array forbidden (R4)
  const cachedSegIdsSnap = {
    ...migrated,
    contentUnits: migrated.contentUnits.map((u, idx) => idx === 0 ? { ...u, segmentIds: ['SEGMENT_000001'] } : u)
  };
  assert.equal(contentUnitDomain.validateTextContentUnitsState(cachedSegIdsSnap).valid, false);
});

// ---------------------------------------------------------------------------
// D3B-03: Deterministic & Idempotent Backfill + R3/R6/R10 Semantics
// ---------------------------------------------------------------------------
await test('D3B-03: Backfill Paragraph, Conversation, Mixed, Legacy, R3 Empty Cards, and double-run idempotence', async () => {
  const contentUnitDomain = await import('../src/domain/text/textContentUnitDomain.js');
  const { snapshot: v1Snap, ids, fullIdentityBefore } = createRealisticV1Snapshot();

  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(v1Snap).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.UNMIGRATED_V1
  );

  const run1 = contentUnitDomain.backfillTextContentUnits(v1Snap, { now: 5000 });
  assert.equal(run1.changed, true);
  assert.equal(run1.snapshot.schemaVersion, 2);
  assert.equal(run1.snapshot.contentUnitMigration.phase, 'complete');

  const s1 = run1.snapshot;
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(s1).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2
  );
  assert.equal(contentUnitDomain.validateTextContentUnitsState(s1).valid, true);
  assert.equal(libraryDomain.validateTextLibrarySnapshot(s1).valid, true);

  // Paragraph Title Card -> 1 paragraph Unit, title role preserved on block
  const titleBlock = s1.blocks.find(b => b.id === ids.blockParaTitleId);
  assert.equal(titleBlock.metadata[TEXT_PARAGRAPH_ROLE_METADATA_KEY], 'title');
  const titleUnits = s1.contentUnits.filter(u => u.blockId === ids.blockParaTitleId);
  assert.equal(titleUnits.length, 1);
  assert.equal(titleUnits[0].kind, 'paragraph');

  // Paragraph Body Card -> 1 paragraph Unit holding both segments, RF + Full fingerprint preserved
  const bodyUnits = s1.contentUnits.filter(u => u.blockId === ids.blockParaBodyId);
  assert.equal(bodyUnits.length, 1);
  const bodySegs = s1.segments.filter(s => s.blockId === ids.blockParaBodyId).sort((a, b) => a.order - b.order);
  assert.deepEqual(bodySegs.map(s => s.unitId), [bodyUnits[0].id, bodyUnits[0].id]);
  const fullIdentityAfter = buildTextStructuredFullArtifactIdentity({
    block: { ...s1.blocks.find(b => b.id === ids.blockParaBodyId), segments: bodySegs },
    channel: 'text',
    language: 'en',
    engine: 'edge',
    voiceId: 'en-US-AriaNeural',
    rate: 0,
    pitch: 0
  });
  assert.equal(fullIdentityAfter.fullArtifactFingerprint, fullIdentityBefore.fullArtifactFingerprint);
  assert.equal(
    buildTextStructuredFullRepresentation({ block: { ...titleBlock, segments: bodySegs }, channel: 'text' }).contentFingerprint,
    fullIdentityBefore.fullRepresentation.contentFingerprint
  );

  // Never write backfill flags into untouched block.metadata (Text Pack hash stability)
  const untouchedV1ParaMeta = v1Snap.blocks.find(b => b.id === ids.blockParaBodyId).metadata;
  const postBackfillParaMeta = s1.blocks.find(b => b.id === ids.blockParaBodyId).metadata;
  assert.deepEqual(postBackfillParaMeta, untouchedV1ParaMeta);

  // Empty Paragraph Card -> 1 empty paragraph Unit
  const emptyParaUnits = s1.contentUnits.filter(u => u.blockId === ids.blockParaEmptyId);
  assert.equal(emptyParaUnits.length, 1);
  assert.equal(emptyParaUnits[0].kind, 'paragraph');

  // Conversation Card -> 4 Turn Units (Amelia -> Amelia NOT merged, Guest stays speakerId: null)
  const convUnits = s1.contentUnits.filter(u => u.blockId === ids.blockConvMainId).sort((a, b) => a.order - b.order);
  assert.equal(convUnits.length, 4);
  assert.equal(convUnits[0].kind, 'turn');
  assert.equal(convUnits[0].speakerId, ids.spkAmeliaId);
  assert.equal(convUnits[1].speakerId, ids.spkAmeliaId);
  assert.notEqual(convUnits[0].id, convUnits[1].id, 'R6: adjacent same-speaker segments must NEVER be merged');
  assert.equal(convUnits[2].speakerId, null, 'R6: missing speakerIdentityV1 must remain null');
  assert.equal(convUnits[2].speaker, 'Guest', 'R6: old label must be preserved when speakerId is null');
  assert.equal(convUnits[3].speakerId, ids.spkBenId);
  // Speaker registry untouched (Guest was NOT speculatively registered)
  assert.deepEqual(
    s1.documents.find(d => d.id === ids.docConvId).metadata[TEXT_SPEAKER_REGISTRY_METADATA_KEY],
    v1Snap.documents.find(d => d.id === ids.docConvId).metadata[TEXT_SPEAKER_REGISTRY_METADATA_KEY]
  );

  // Empty Conversation Card -> 0 Turn Units
  assert.equal(s1.contentUnits.filter(u => u.blockId === ids.blockConvEmptyId).length, 0);

  // Mixed Workspace -> Paragraph Card has 'paragraph', Conversation Card has 'turn'
  assert.deepEqual(s1.contentUnits.filter(u => u.blockId === ids.blockMixedParaId).map(u => u.kind), ['paragraph']);
  assert.deepEqual(s1.contentUnits.filter(u => u.blockId === ids.blockMixedConvId).map(u => u.kind), ['turn']);

  // Legacy Workspace excluded (0 Units, segments remain unitId absent/null, legacy projection parity preserved)
  assert.equal(s1.contentUnits.filter(u => u.documentId === ids.docLegacyId).length, 0);
  const legacySegments = s1.segments.filter(s => s.documentId === ids.docLegacyId);
  assert.equal(legacySegments.every(s => s.unitId == null), true);
  assert.deepEqual(
    libraryDomain.resolveLegacyTextIdentityProjection({
      document: s1.documents.find(d => d.id === ids.docLegacyId),
      blocks: s1.blocks,
      segments: s1.segments
    }),
    libraryDomain.resolveLegacyTextIdentityProjection({
      document: v1Snap.documents.find(d => d.id === ids.docLegacyId),
      blocks: v1Snap.blocks,
      segments: v1Snap.segments
    })
  );

  // Old segment IDs, UIDs, text, meanings, audioVariant IDs 100% preserved
  const origSegMap = new Map(v1Snap.segments.map(s => [s.id, s]));
  s1.segments.forEach(s => {
    const orig = origSegMap.get(s.id);
    assert.ok(orig);
    assert.equal(s.uid, orig.uid);
    assert.equal(s.text, orig.text);
    assert.equal(s.meaning, orig.meaning);
    assert.equal(s.order, orig.order);
    assert.deepEqual(s.metadata, orig.metadata);
  });

  // Double-run backfill idempotence
  const run2 = contentUnitDomain.backfillTextContentUnits(s1, { now: 9000 });
  assert.equal(run2.changed, false);
  assert.deepEqual(run2.snapshot, s1);

  // R3: Intentionally delete the only Unit of Empty Paragraph Card, verify re-backfill does NOT resurrect it
  const afterDeleteEmptyUnit = commandDomain.applyTextLibraryCommand(s1, {
    type: 'contentUnit.delete',
    payload: { id: emptyParaUnits[0].id }
  }, 6000).snapshot;

  assert.equal(afterDeleteEmptyUnit.contentUnits.filter(u => u.blockId === ids.blockParaEmptyId).length, 0);
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(afterDeleteEmptyUnit).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2
  );
  const run3 = contentUnitDomain.backfillTextContentUnits(afterDeleteEmptyUnit, { now: 9500 });
  assert.equal(run3.changed, false);
  assert.equal(run3.snapshot.contentUnits.filter(u => u.blockId === ids.blockParaEmptyId).length, 0);
});

// ---------------------------------------------------------------------------
// D3B-04: R1 Two-Phase Migration Partial-Upgrade & Crash Recovery Detection
// ---------------------------------------------------------------------------
await test('D3B-04: Detects partial-upgrade after Phase 1 schema bump or incomplete backfill and recovers cleanly', async () => {
  const contentUnitDomain = await import('../src/domain/text/textContentUnitDomain.js');
  const { snapshot: v1Snap, ids } = createRealisticV1Snapshot();

  // Case A: IDB upgraded to v2, crash before backfill ran
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(v1Snap, { idbVersion: 2 }).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.PARTIAL_UPGRADE
  );

  // Case B: Mid-migration crash where only Title Card got UNIT_000001 and phase is still 'schema-upgraded'
  const preservedUnitUid = globalIdentity.createTextGlobalUid(globalIdentity.TEXT_GLOBAL_UID_KINDS.CONTENT_UNIT);
  const partialSnap = {
    ...v1Snap,
    counters: { ...v1Snap.counters, contentUnit: 1 },
    contentUnits: [
      contentUnitDomain.createTextContentUnitRecord({
        id: 'UNIT_000001',
        uid: preservedUnitUid,
        documentId: ids.docParaId,
        blockId: ids.blockParaTitleId,
        kind: 'paragraph',
        order: 1,
        createdAt: 4000,
        updatedAt: 4000
      })
    ],
    segments: v1Snap.segments.map(s => (
      s.blockId === ids.blockParaTitleId ? { ...s, unitId: 'UNIT_000001' } : s
    )),
    contentUnitMigration: {
      version: 1,
      phase: 'schema-upgraded',
      materializedBlockIds: [ids.blockParaTitleId],
      completedAt: null
    }
  };

  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(partialSnap, { idbVersion: 2 }).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.PARTIAL_UPGRADE
  );

  const recovered = contentUnitDomain.backfillTextContentUnits(partialSnap, { now: 7000 });
  assert.equal(recovered.changed, true);
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(recovered.snapshot, { idbVersion: 2 }).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2
  );
  // Existing UNIT_000001 identity was preserved across crash recovery!
  const recoveredTitleUnit = recovered.snapshot.contentUnits.find(u => u.blockId === ids.blockParaTitleId);
  assert.equal(recoveredTitleUnit.id, 'UNIT_000001');
  assert.equal(recoveredTitleUnit.uid, preservedUnitUid);
  // No collisions with newly allocated Units
  assert.equal(new Set(recovered.snapshot.contentUnits.map(u => u.id)).size, recovered.snapshot.contentUnits.length);

  // Corrupted state detection
  const corruptedSnap = {
    ...recovered.snapshot,
    contentUnits: [
      ...recovered.snapshot.contentUnits,
      { ...recoveredTitleUnit, id: 'UNIT_000099', documentId: 'DOC_999999' }
    ]
  };
  assert.equal(
    contentUnitDomain.inspectTextContentUnitMigrationState(corruptedSnap, { idbVersion: 2 }).status,
    contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.CORRUPTED
  );
});

// ---------------------------------------------------------------------------
// D3B-05: Pure Commands (v1 Isolation + ContentUnit CRUD + segment.move + R7 Guards)
// ---------------------------------------------------------------------------
await test('D3B-05a: Pure v1 runtime commands produce zero Content Units and refuse v2-only commands on v1 snapshots', async () => {
  const { snapshot: v1Snap, ids } = createRealisticV1Snapshot();

  const res = commandDomain.applyTextLibraryCommand(v1Snap, {
    type: 'segment.create',
    payload: { blockId: ids.blockParaBodyId, text: 'Third sentence.' }
  }, 3000);

  assert.equal(res.snapshot.schemaVersion, 1);
  assert.equal('contentUnits' in res.snapshot, false);
  assert.equal(res.snapshot.counters.contentUnit, undefined);
  assert.equal(res.snapshot.segments.some(s => s.unitId != null), false);

  assert.throws(() => commandDomain.applyTextLibraryCommand(v1Snap, {
    type: 'contentUnit.create',
    payload: { blockId: ids.blockParaBodyId }
  }, 3000), /Content-Unit|schema v2|contentUnits/i);

  assert.throws(() => commandDomain.applyTextLibraryCommand(v1Snap, {
    type: 'segment.move',
    payload: { segmentId: 'SEGMENT_000002', targetUnitId: 'UNIT_000001' }
  }, 3000), /Content-Unit|schema v2|contentUnits/i);
});

await test('D3B-05b: ContentUnit create, update, split, merge, reorder, delete, segment.move, and backward-compatible commands', async () => {
  const contentUnitDomain = await import('../src/domain/text/textContentUnitDomain.js');
  const { snapshot: v1Snap, ids } = createRealisticV1Snapshot();
  let state = contentUnitDomain.backfillTextContentUnits(v1Snap, { now: 5000 }).snapshot;

  // 1. contentUnit.create on Paragraph Card with initial text + empty second Turn on Conversation Card
  const paraBodyUnitsBefore = state.contentUnits.filter(u => u.blockId === ids.blockParaBodyId);
  assert.equal(paraBodyUnitsBefore.length, 1);
  const paraUnit1Id = paraBodyUnitsBefore[0].id;

  const createParaRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.create',
    payload: {
      blockId: ids.blockParaBodyId,
      text: 'Second paragraph opening sentence.'
    }
  }, 5100);
  state = createParaRes.snapshot;
  const paraUnit2Id = createParaRes.result.id;
  assert.equal(state.contentUnits.filter(u => u.blockId === ids.blockParaBodyId).length, 2);

  // Reject speaker on Paragraph Unit creation
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.create',
    payload: { blockId: ids.blockParaBodyId, speaker: 'Amelia' }
  }, 5105), /speaker/i);

  // Create Turn on Conversation Card after Turn 1 (Amelia)
  const convUnitsBefore = state.contentUnits.filter(u => u.blockId === ids.blockConvMainId).sort((a, b) => a.order - b.order);
  const createTurnRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.create',
    payload: {
      blockId: ids.blockConvMainId,
      afterUnitId: convUnitsBefore[0].id,
      speaker: 'Amelia',
      text: 'Inserted Amelia follow-up.'
    }
  }, 5200);
  state = createTurnRes.snapshot;
  const insertedTurnId = createTurnRes.result.id;

  // Assert Card-monotonic segment order across all Conversation segments
  assert.equal(contentUnitDomain.validateTextContentUnitsState(state).valid, true);
  const convOrdersAfterInsert = state.contentUnits
    .filter(u => u.blockId === ids.blockConvMainId)
    .sort((a, b) => a.order - b.order);
  assert.equal(convOrdersAfterInsert[1].id, insertedTurnId);

  // 2. segment.move (same-Card): move SEGMENT_000003 from paraUnit1 -> paraUnit2
  const seg3Before = state.segments.find(s => s.id === 'SEGMENT_000003');
  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.move',
    payload: { segmentId: 'SEGMENT_000003', targetUnitId: paraUnit2Id }
  }, 5300).snapshot;
  const seg3After = state.segments.find(s => s.id === 'SEGMENT_000003');
  assert.equal(seg3After.unitId, paraUnit2Id);
  assert.equal(seg3After.uid, seg3Before.uid);
  assert.equal(seg3After.text, seg3Before.text);
  assert.equal(contentUnitDomain.validateTextContentUnitsState(state).valid, true);

  // Reject cross-Card segment.move per R7
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.move',
    payload: { segmentId: 'SEGMENT_000003', targetUnitId: state.contentUnits.find(u => u.blockId === ids.blockParaTitleId).id }
  }, 5350), /cross-card|same Card|deferred/i);

  // 3. contentUnit.reorder on Paragraph Card: swap [paraUnit2Id, paraUnit1Id] -> segment.order flips monotonically!
  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.reorder',
    payload: { blockId: ids.blockParaBodyId, orderedIds: [paraUnit2Id, paraUnit1Id] }
  }, 5400).snapshot;
  const bodySegsReordered = state.segments.filter(s => s.blockId === ids.blockParaBodyId).sort((a, b) => a.order - b.order);
  assert.equal(bodySegsReordered[0].unitId, paraUnit2Id);
  assert.equal(bodySegsReordered[1].unitId, paraUnit2Id);
  assert.equal(bodySegsReordered[2].id, 'SEGMENT_000002');
  assert.equal(bodySegsReordered[2].unitId, paraUnit1Id);

  // 4. contentUnit.split on paraUnit2Id (has 2 segments) -> splits into two Paragraph Units without mutating Segment IDs
  const splitUnitRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.split',
    payload: { id: paraUnit2Id, beforeSegmentId: 'SEGMENT_000003' }
  }, 5500);
  state = splitUnitRes.snapshot;
  const splitCreatedUnitId = splitUnitRes.result.createdId;
  assert.equal(state.segments.find(s => s.id === 'SEGMENT_000003').unitId, splitCreatedUnitId);
  assert.equal(contentUnitDomain.validateTextContentUnitsState(state).valid, true);

  // 5. contentUnit.merge on Paragraph Units (merge paraUnit2Id + splitCreatedUnitId)
  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.merge',
    payload: { ids: [paraUnit2Id, splitCreatedUnitId] }
  }, 5600).snapshot;
  assert.equal(state.segments.find(s => s.id === 'SEGMENT_000003').unitId, paraUnit2Id);

  // 6. R7 Turn merge guard: same speaker (convUnitsBefore[0] & insertedTurnId are both Amelia) succeeds; different speaker fails!
  const turnMergedRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.merge',
    payload: { ids: [convUnitsBefore[0].id, insertedTurnId] }
  }, 5700);
  state = turnMergedRes.snapshot;
  assert.equal(state.contentUnits.some(u => u.id === insertedTurnId), false);
  // Resulting multi-segment Turn retains both segments with intact IDs
  const multiSegTurnSegments = state.segments.filter(s => s.unitId === convUnitsBefore[0].id);
  assert.equal(multiSegTurnSegments.length, 2);

  // R7 mismatch check: adjacent Amelia + Guest (or Ben) MUST reject
  const convOrderedNow = state.contentUnits.filter(u => u.blockId === ids.blockConvMainId).sort((a, b) => a.order - b.order);
  const ameliaIdx = convOrderedNow.findIndex(u => u.speaker === 'Amelia' && convOrderedNow[convOrderedNow.indexOf(u) + 1]?.speaker !== 'Amelia');
  assert.ok(ameliaIdx >= 0);
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.merge',
    payload: { ids: [convOrderedNow[ameliaIdx].id, convOrderedNow[ameliaIdx + 1].id] }
  }, 5750), /speaker/i);

  // 7. contentUnit.update Turn speaker -> syncs all child segments & speakerIdentityV1 without dropping physical audioVariants
  const audioBeforeUpdate = state.audioVariants.find(a => a.id === 'TXTAUDIO_000002');
  assert.ok(audioBeforeUpdate);
  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'contentUnit.update',
    payload: { id: convUnitsBefore[0].id, speaker: 'Ben' }
  }, 5800).snapshot;
  const updatedMultiTurn = state.contentUnits.find(u => u.id === convUnitsBefore[0].id);
  assert.equal(updatedMultiTurn.speaker, 'Ben');
  assert.equal(updatedMultiTurn.speakerId, ids.spkBenId);
  assert.equal(
    state.segments.filter(s => s.unitId === updatedMultiTurn.id).every(s => (
      s.speaker === 'Ben' && s.metadata?.[TEXT_SPEAKER_IDENTITY_METADATA_KEY] === ids.spkBenId
    )),
    true
  );
  assert.equal(state.audioVariants.some(a => a.id === 'TXTAUDIO_000002'), true);

  // Reject single-segment updateSegment speaker change on multi-segment Turn (must use contentUnit.update or segment.move)
  const multiSegChild = state.segments.find(s => s.unitId === updatedMultiTurn.id);
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.update',
    payload: { id: multiSegChild.id, speaker: 'Amelia' }
  }, 5850), /multi-segment|contentUnit\.update|segment\.move/i);

  // 8. Backward-compatible segment reorder interleaving guard & split/merge paragraph segment preservation
  const lastInParaUnit2 = state.segments.filter(s => s.unitId === paraUnit2Id).sort((a, b) => a.order - b.order).at(-1);
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'paragraphSegments.merge',
    payload: { ids: [lastInParaUnit2.id, 'SEGMENT_000002'] }
  }, 5900), /Content Unit boundary|Content Unit boundaries|contentUnit\.merge/i);

  // Interleaving a multi-segment Turn's child segment with another Turn in reorderSegments MUST throw
  const convSegIds = state.segments.filter(s => s.blockId === ids.blockConvMainId).sort((a, b) => a.order - b.order).map(s => s.id);
  const interleaved = [convSegIds[0], convSegIds[convSegIds.length - 1], ...convSegIds.slice(1, convSegIds.length - 1)];
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.reorder',
    payload: { blockId: ids.blockConvMainId, orderedIds: interleaved }
  }, 5950), /contiguity|Content Unit|segment\.move/i);

  // splitParagraphSegment & mergeParagraphSegments keep unitId consistent inside same Paragraph Unit
  const splitParaSeg = commandDomain.applyTextLibraryCommand(state, {
    type: 'paragraphSegment.split',
    payload: {
      id: 'SEGMENT_000002',
      parts: [{ text: 'First half.' }, { text: 'Second half.' }]
    }
  }, 6000);
  state = splitParaSeg.snapshot;
  assert.equal(
    state.segments.find(s => s.id === splitParaSeg.result.createdIds[0]).unitId,
    state.segments.find(s => s.id === 'SEGMENT_000002').unitId
  );

  // Backward-compatible block.create + segment.create + segment.delete + speaker.rename + speaker.remove in v2 mode
  const newParaBlockRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'block.create',
    payload: { documentId: ids.docParaId, blockType: 'paragraph', title: 'New V2 Card' }
  }, 6050);
  state = newParaBlockRes.snapshot;
  assert.equal(state.contentUnits.filter(u => u.blockId === newParaBlockRes.result.id).length, 1);

  const newParaSegRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.create',
    payload: { blockId: newParaBlockRes.result.id, text: 'Temporary sentence.' }
  }, 6060);
  state = newParaSegRes.snapshot;
  const attachedParaUnitId = state.segments.find(s => s.id === newParaSegRes.result.id).unitId;
  assert.ok(attachedParaUnitId);

  // Deleting the only segment of a Paragraph Unit keeps the empty Paragraph Unit
  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.delete',
    payload: { id: newParaSegRes.result.id }
  }, 6070).snapshot;
  assert.equal(state.contentUnits.some(u => u.id === attachedParaUnitId), true);

  // Creating a Turn via Conversation segment.create, then deleting that segment removes the empty Turn
  const newConvSegRes = commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.create',
    payload: { blockId: ids.blockConvEmptyId, speaker: 'Clara', text: 'Hi Clara here.' }
  }, 6080);
  state = newConvSegRes.snapshot;
  const claraUnit = state.contentUnits.find(u => u.id === newConvSegRes.result.unitId);
  assert.equal(claraUnit?.kind, 'turn');
  assert.equal(claraUnit?.speaker, 'Clara');

  // Rename Clara -> Dr. Clara updates Turn label too
  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'speaker.rename',
    payload: { documentId: ids.docConvId, speakerId: claraUnit.speakerId, label: 'Dr. Clara' }
  }, 6090).snapshot;
  assert.equal(state.contentUnits.find(u => u.id === claraUnit.id).speaker, 'Dr. Clara');

  // Cannot remove speaker while Turn references it; allowed after segment/Turn deletion
  assert.throws(() => commandDomain.applyTextLibraryCommand(state, {
    type: 'speaker.remove',
    payload: { documentId: ids.docConvId, speakerId: claraUnit.speakerId }
  }, 6095), /in use/i);

  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'segment.delete',
    payload: { id: newConvSegRes.result.id }
  }, 6100).snapshot;
  assert.equal(state.contentUnits.some(u => u.id === claraUnit.id), false);

  state = commandDomain.applyTextLibraryCommand(state, {
    type: 'speaker.remove',
    payload: { documentId: ids.docConvId, speakerId: claraUnit.speakerId }
  }, 6110).snapshot;

  // Tree hydration includes ordered units in v2 mode
  const docTree = libraryDomain.resolveTextLibraryDocumentTree(state, ids.docParaId);
  const bodyBlockNode = docTree.blocks.find(b => b.id === ids.blockParaBodyId);
  assert.equal(Array.isArray(bodyBlockNode.units), true);
  assert.equal(bodyBlockNode.units.length, 2);
});

// ---------------------------------------------------------------------------
// D3B-06: Isolated Disposable QA IndexedDB Two-Phase Upgrade & Crash Recovery
// ---------------------------------------------------------------------------
await test('D3B-06: Disposable QA IndexedDB executes v1->v2 upgrade, crash recovery, atomic commands, and blocks canonical DB', async () => {
  const persistenceService = await import('../src/services/persistence/textContentUnitPersistenceService.js');
  const contentUnitDomain = await import('../src/domain/text/textContentUnitDomain.js');

  const prevIndexedDb = globalThis.indexedDB;
  const mockIdb = createMemoryIndexedDb();
  globalThis.indexedDB = mockIdb;

  try {
    // Safety guard: canonical 'prolingo_text_library' MUST be rejected
    await assert.rejects(() => persistenceService.openDisposableTextLibraryV2Database({
      dbName: constants.TEXT_LIBRARY_DB_NAME
    }), /dormant|disposable|canonical/i);

    await assert.rejects(() => persistenceService.runDisposableContentUnitMigration({
      dbName: constants.TEXT_LIBRARY_DB_NAME
    }), /dormant|disposable|canonical/i);

    // Seed v1 snapshot into disposable DB
    const { snapshot: v1Snap, ids } = createRealisticV1Snapshot();
    await persistenceService.writeTextLibrarySnapshotToDisposableDb({
      dbName: constants.TEXT_DISPOSABLE_QA_DB_NAME,
      snapshot: v1Snap,
      version: 1
    });

    // Simulate Phase 1 IDB schema upgrade to v2 (crash before Phase 2 backfill runs)
    const phase1Db = await persistenceService.openDisposableTextLibraryV2Database({
      dbName: constants.TEXT_DISPOSABLE_QA_DB_NAME,
      version: constants.TEXT_LIBRARY_V2_DB_VERSION
    });
    assert.equal(phase1Db.version, 2);
    assert.equal(phase1Db.objectStoreNames.contains('contentUnits'), true);
    const crashedSnapshot = await persistenceService.readTextLibraryV2SnapshotFromDb(phase1Db);
    phase1Db.close();

    assert.equal(
      contentUnitDomain.inspectTextContentUnitMigrationState(crashedSnapshot, { idbVersion: 2 }).status,
      contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.PARTIAL_UPGRADE
    );

    // Phase 2 recovery migration
    const migrationRes = await persistenceService.runDisposableContentUnitMigration({
      dbName: constants.TEXT_DISPOSABLE_QA_DB_NAME,
      now: 8000
    });
    assert.equal(migrationRes.changed, true);
    assert.equal(migrationRes.statusAfter, contentUnitDomain.TEXT_CONTENT_UNIT_MIGRATION_STATUS.MIGRATED_V2);

    // Idempotent second run
    const repeatMigration = await persistenceService.runDisposableContentUnitMigration({
      dbName: constants.TEXT_DISPOSABLE_QA_DB_NAME,
      now: 8500
    });
    assert.equal(repeatMigration.changed, false);

    // Atomic v2 command execution in single IDB readwrite tx
    const cmdRes = await persistenceService.executeDisposableTextLibraryV2Command({
      dbName: constants.TEXT_DISPOSABLE_QA_DB_NAME,
      command: {
        type: 'contentUnit.create',
        payload: {
          blockId: ids.blockConvMainId,
          speaker: 'Ben',
          text: 'Persisted in disposable v2 store.'
        }
      },
      now: 8600
    });
    assert.equal(cmdRes.result.entity, 'contentUnit');
    assert.equal(cmdRes.snapshot.contentUnits.some(u => u.id === cmdRes.result.id), true);

    // Verify D2 adapter projection still accepts hydrated tree from migrated snapshot
    const hydratedParaTree = libraryDomain.resolveTextLibraryDocumentTree(cmdRes.snapshot, ids.docParaId);
    const d2Projection = projectTextDocumentToVirtualContentUnits(hydratedParaTree);
    assert.equal(d2Projection.status, 'projected');

    // Clean up disposable DB & confirm canonical DB was never created in mock IDB
    await persistenceService.deleteDisposableTextLibraryDatabase({
      dbName: constants.TEXT_DISPOSABLE_QA_DB_NAME
    });
    assert.equal(mockIdb._dbs.has(constants.TEXT_DISPOSABLE_QA_DB_NAME), false);
    assert.equal(mockIdb._dbs.has(constants.TEXT_LIBRARY_DB_NAME), false);
  } finally {
    globalThis.indexedDB = prevIndexedDb;
  }
});

console.log(`P12D_D3B_AUDIT_SUMMARY: PASS: ${passed}, FAIL: ${failed} (Total: ${passed + failed})`);
if (failed > 0) process.exitCode = 1;
