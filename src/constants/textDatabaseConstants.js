export const TEXT_LIBRARY_DB_NAME = 'prolingo_text_library';
export const TEXT_LIBRARY_DB_VERSION = 1;
export const TEXT_LIBRARY_SCHEMA_VERSION = 1;

export const TEXT_LIBRARY_STORES = Object.freeze({
  META: 'meta',
  COLLECTIONS: 'collections',
  DOCUMENTS: 'documents',
  BLOCKS: 'blocks',
  SEGMENTS: 'segments',
  AUDIO_VARIANTS: 'audioVariants'
});

export const TEXT_LIBRARY_META_KEYS = Object.freeze({
  SCHEMA_VERSION: 'schemaVersion',
  INITIALIZED: 'initialized',
  ACTIVE_DOCUMENT_ID: 'activeDocumentId',
  ID_COUNTERS: 'idCounters',
  LEGACY_MIGRATION: 'legacyMigration'
});

export const TEXT_ID_PREFIXES = Object.freeze({
  COLLECTION: 'COLL_',
  DOCUMENT: 'DOC_',
  BLOCK: 'TEXT_',
  SEGMENT: 'SEGMENT_',
  AUDIO_VARIANT: 'TXTAUDIO_'
});

export const TEXT_DOCUMENT_TYPES = Object.freeze(['paragraph', 'conversation', 'mixed']);
export const TEXT_BLOCK_TYPES = Object.freeze(['paragraph', 'conversation']);
export const TEXT_AUDIO_CHANNELS = Object.freeze(['text', 'meaning']);

export const TEXT_LEGACY_EDITOR_MODEL = 'legacy-line-v1';
export const TEXT_STRUCTURED_EDITOR_MODEL = 'structured-v1';
export const DEFAULT_TEXT_DOCUMENT_TITLE = 'Text Workspace';
export const DEFAULT_TEXT_LANGUAGE = 'en';
export const DEFAULT_MEANING_LANGUAGE = 'id';
