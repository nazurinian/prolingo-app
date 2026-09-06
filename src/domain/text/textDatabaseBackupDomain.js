import {
  TEXT_LIBRARY_DB_NAME,
  TEXT_LIBRARY_DB_VERSION,
  TEXT_LIBRARY_META_KEYS,
  TEXT_LIBRARY_SCHEMA_VERSION,
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import {
  getTextLibraryIdSequence,
  normalizeTextIdCounters,
  normalizeTextLibraryRuntimeSnapshot
} from './textLibraryDomain.js';
import { getTextIdSequence } from './textIdentityDomain.js';

export const PROLINGO_TEXT_DB_BACKUP_TYPE = 'prolingo-text-database-backup';
export const PROLINGO_TEXT_DB_BACKUP_VERSION = 1;
export const PROLINGO_TEXT_DB_RESTORE_POLICY = 'replace';

const cloneRecord = record => ({ ...record, metadata: record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? { ...record.metadata } : {} });
const cloneMetaRecord = record => ({ key: String(record?.key || ''), value: record?.value, updatedAt: record?.updatedAt ?? null });

const getMetaValue = (metaRecords, key) => metaRecords.find(record => record.key === key)?.value;

const assertArray = (value, label) => {
  if (!Array.isArray(value)) throw new Error(`Text Database Backup ${label} must be an array`);
  return value;
};

const assertUniqueMetaKeys = metaRecords => {
  const keys = metaRecords.map(record => record.key);
  if (keys.some(key => !key)) throw new Error('Text Database Backup contains an empty meta key');
  if (new Set(keys).size !== keys.length) throw new Error('Text Database Backup contains duplicate meta keys');
};

const computeCounterFloor = snapshot => ({
  collection: snapshot.collections.reduce((max, record) => Math.max(max, getTextLibraryIdSequence('COLLECTION', record.id)), 0),
  document: snapshot.documents.reduce((max, record) => Math.max(max, getTextLibraryIdSequence('DOCUMENT', record.id)), 0),
  text: snapshot.blocks.reduce((max, record) => Math.max(max, getTextIdSequence(record.id)), 0),
  segment: snapshot.segments.reduce((max, record) => Math.max(max, getTextLibraryIdSequence('SEGMENT', record.id)), 0),
  audioVariant: snapshot.audioVariants.reduce((max, record) => Math.max(max, getTextLibraryIdSequence('AUDIO_VARIANT', record.id)), 0)
});

const migrateSnapshotCounters = snapshot => {
  const current = normalizeTextIdCounters(snapshot.counters);
  const floor = computeCounterFloor(snapshot);
  const counters = {
    collection: Math.max(current.collection, floor.collection),
    document: Math.max(current.document, floor.document),
    text: Math.max(current.text, floor.text),
    segment: Math.max(current.segment, floor.segment),
    audioVariant: Math.max(current.audioVariant, floor.audioVariant)
  };
  const changed = Object.keys(counters).some(key => counters[key] !== current[key]);
  return { counters, floor, changed };
};

const normalizeBackupPayload = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Text Database Backup must be a JSON object');
  if (candidate.backupType !== PROLINGO_TEXT_DB_BACKUP_TYPE) throw new Error('This is not a ProLingo Text Database Backup');
  if (candidate.backupVersion !== PROLINGO_TEXT_DB_BACKUP_VERSION) throw new Error(`Unsupported Text Database Backup version: ${candidate.backupVersion}`);
  if (candidate.restorePolicy !== PROLINGO_TEXT_DB_RESTORE_POLICY) throw new Error('Text Database Backup restore policy must be replace');
  if (candidate.audioBinaryIncluded !== false) throw new Error('Text Database Backup must not embed binary audio');

  const database = candidate.database || {};
  if (database.name !== TEXT_LIBRARY_DB_NAME) throw new Error(`Text Database Backup targets unexpected database: ${database.name || 'unknown'}`);
  const dbVersion = Number.parseInt(database.dbVersion, 10);
  const schemaVersion = Number.parseInt(database.schemaVersion, 10);
  if (!Number.isFinite(dbVersion) || dbVersion < 1) throw new Error('Text Database Backup has an invalid IndexedDB version');
  if (dbVersion > TEXT_LIBRARY_DB_VERSION) throw new Error(`Text Database Backup requires newer IndexedDB version ${dbVersion}`);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) throw new Error('Text Database Backup has an invalid Text schema version');
  if (schemaVersion > TEXT_LIBRARY_SCHEMA_VERSION) throw new Error(`Text Database Backup requires newer Text schema version ${schemaVersion}`);

  const metaRecords = assertArray(candidate.metaRecords, 'metaRecords').map(cloneMetaRecord);
  assertUniqueMetaKeys(metaRecords);
  const stores = candidate.stores || {};
  const collections = assertArray(stores.collections, 'collections').map(cloneRecord);
  const documents = assertArray(stores.documents, 'documents').map(cloneRecord);
  const blocks = assertArray(stores.blocks, 'blocks').map(cloneRecord);
  const segments = assertArray(stores.segments, 'segments').map(cloneRecord);
  const audioVariants = assertArray(stores.audioVariants, 'audioVariants').map(cloneRecord);

  collections.forEach(record => {
    if (!getTextLibraryIdSequence('COLLECTION', record.id)) throw new Error(`Text Database Backup has invalid COLLECTION_ID: ${record.id}`);
  });
  documents.forEach(record => {
    if (!getTextLibraryIdSequence('DOCUMENT', record.id)) throw new Error(`Text Database Backup has invalid DOC_ID: ${record.id}`);
    if (![TEXT_LEGACY_EDITOR_MODEL, TEXT_STRUCTURED_EDITOR_MODEL].includes(record.editorModel)) throw new Error(`Text Database Backup has unsupported editor model: ${record.editorModel}`);
  });
  blocks.forEach(record => {
    if (!getTextIdSequence(record.id)) throw new Error(`Text Database Backup has invalid TEXT_ID: ${record.id}`);
  });
  segments.forEach(record => {
    if (!getTextLibraryIdSequence('SEGMENT', record.id)) throw new Error(`Text Database Backup has invalid SEGMENT_ID: ${record.id}`);
    if (!String(record.text || '').trim()) throw new Error(`Text Database Backup Segment ${record.id} has empty text`);
  });
  audioVariants.forEach(record => {
    if (!getTextLibraryIdSequence('AUDIO_VARIANT', record.id)) throw new Error(`Text Database Backup has invalid TXTAUDIO_ID: ${record.id}`);
  });

  const initialized = Boolean(getMetaValue(metaRecords, TEXT_LIBRARY_META_KEYS.INITIALIZED));
  if (!initialized) throw new Error('Text Database Backup is not an initialized Text Library snapshot');
  const activeDocumentId = getMetaValue(metaRecords, TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID) || null;
  const countersCandidate = getMetaValue(metaRecords, TEXT_LIBRARY_META_KEYS.ID_COUNTERS) || {};
  const metaSchemaVersion = Number.parseInt(getMetaValue(metaRecords, TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION), 10) || schemaVersion;
  if (metaSchemaVersion > TEXT_LIBRARY_SCHEMA_VERSION) throw new Error(`Text Database Backup meta requires newer Text schema version ${metaSchemaVersion}`);

  let snapshot = normalizeTextLibraryRuntimeSnapshot({
    schemaVersion: Math.min(metaSchemaVersion, TEXT_LIBRARY_SCHEMA_VERSION),
    initialized: true,
    activeDocumentId,
    counters: countersCandidate,
    collections,
    documents,
    blocks,
    segments,
    audioVariants
  });
  if (snapshot.documents.length && !snapshot.activeDocumentId) throw new Error('Text Database Backup has Documents but no active Document');

  const migration = migrateSnapshotCounters(snapshot);
  snapshot = normalizeTextLibraryRuntimeSnapshot({ ...snapshot, counters: migration.counters, schemaVersion: TEXT_LIBRARY_SCHEMA_VERSION });

  const canonicalMetaRecords = metaRecords
    .filter(record => ![
      TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION,
      TEXT_LIBRARY_META_KEYS.INITIALIZED,
      TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID,
      TEXT_LIBRARY_META_KEYS.ID_COUNTERS
    ].includes(record.key))
    .concat([
      { key: TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, value: TEXT_LIBRARY_SCHEMA_VERSION, updatedAt: null },
      { key: TEXT_LIBRARY_META_KEYS.INITIALIZED, value: true, updatedAt: null },
      { key: TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, value: snapshot.activeDocumentId, updatedAt: null },
      { key: TEXT_LIBRARY_META_KEYS.ID_COUNTERS, value: snapshot.counters, updatedAt: null }
    ]);

  return {
    backup: {
      ...candidate,
      backupType: PROLINGO_TEXT_DB_BACKUP_TYPE,
      backupVersion: PROLINGO_TEXT_DB_BACKUP_VERSION,
      restorePolicy: PROLINGO_TEXT_DB_RESTORE_POLICY,
      audioBinaryIncluded: false,
      database: {
        name: TEXT_LIBRARY_DB_NAME,
        dbVersion: TEXT_LIBRARY_DB_VERSION,
        schemaVersion: TEXT_LIBRARY_SCHEMA_VERSION
      },
      metaRecords: canonicalMetaRecords,
      stores: {
        collections: snapshot.collections.map(cloneRecord),
        documents: snapshot.documents.map(cloneRecord),
        blocks: snapshot.blocks.map(cloneRecord),
        segments: snapshot.segments.map(cloneRecord),
        audioVariants: snapshot.audioVariants.map(cloneRecord)
      }
    },
    snapshot,
    migration: {
      fromDbVersion: dbVersion,
      toDbVersion: TEXT_LIBRARY_DB_VERSION,
      fromSchemaVersion: schemaVersion,
      toSchemaVersion: TEXT_LIBRARY_SCHEMA_VERSION,
      countersRaisedToIdentityFloor: migration.changed,
      identityFloor: migration.floor
    }
  };
};

export const createProLingoTextDatabaseBackup = ({ metaRecords = [], stores = {}, source = {}, now = Date.now() }) => {
  const createdAt = new Date(now).toISOString();
  const backup = {
    backupType: PROLINGO_TEXT_DB_BACKUP_TYPE,
    backupVersion: PROLINGO_TEXT_DB_BACKUP_VERSION,
    createdAt,
    restorePolicy: PROLINGO_TEXT_DB_RESTORE_POLICY,
    audioBinaryIncluded: false,
    source: {
      appVersion: source.appVersion || null,
      checkpoint: source.checkpoint || null,
      engineeringLine: source.engineeringLine || null
    },
    database: {
      name: TEXT_LIBRARY_DB_NAME,
      dbVersion: TEXT_LIBRARY_DB_VERSION,
      schemaVersion: TEXT_LIBRARY_SCHEMA_VERSION
    },
    metaRecords: metaRecords.map(cloneMetaRecord),
    stores: {
      collections: (stores.collections || []).map(cloneRecord),
      documents: (stores.documents || []).map(cloneRecord),
      blocks: (stores.blocks || []).map(cloneRecord),
      segments: (stores.segments || []).map(cloneRecord),
      audioVariants: (stores.audioVariants || []).map(cloneRecord)
    }
  };
  return normalizeBackupPayload(backup).backup;
};

export const validateProLingoTextDatabaseBackup = candidate => normalizeBackupPayload(candidate);

export const resolveProLingoTextDatabaseBackupDiagnostics = candidate => {
  const { backup, snapshot, migration } = normalizeBackupPayload(candidate);
  return {
    createdAt: backup.createdAt || null,
    source: backup.source || {},
    database: backup.database,
    activeDocumentId: snapshot.activeDocumentId,
    counts: {
      collections: snapshot.collections.length,
      documents: snapshot.documents.length,
      blocks: snapshot.blocks.length,
      segments: snapshot.segments.length,
      audioVariants: snapshot.audioVariants.length,
      metaRecords: backup.metaRecords.length
    },
    migration,
    restorePolicy: PROLINGO_TEXT_DB_RESTORE_POLICY,
    audioBinaryIncluded: false
  };
};
