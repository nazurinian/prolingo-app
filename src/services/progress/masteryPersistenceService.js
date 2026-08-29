// ProLingo v5.12.1C — Mastery Progress Persistence Service
// Separate mastery persistence only. It never reads/writes vocabulary CSV data or dataset dirty state.

import {
  MASTERY_STATE_SCHEMA_VERSION,
  createEmptyMasteryStateMap,
  normalizeMasteryStateMap
} from '../../domain/progress/masteryStateDomain.js';

export const MASTERY_STORAGE_KEY = 'prolingo_mastery_state_v1';

export const createMasteryPersistencePayload = (masteryByVocabId = {}) => ({
  schemaVersion: MASTERY_STATE_SCHEMA_VERSION,
  masteryByVocabId: normalizeMasteryStateMap(masteryByVocabId)
});

export const serializeMasteryPersistencePayload = (masteryByVocabId = {}) =>
  JSON.stringify(createMasteryPersistencePayload(masteryByVocabId));

export const parseMasteryPersistencePayload = (rawValue) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return {
      status: 'empty',
      schemaVersion: MASTERY_STATE_SCHEMA_VERSION,
      masteryByVocabId: createEmptyMasteryStateMap()
    };
  }

  let parsed;
  try {
    parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  } catch (error) {
    return {
      status: 'invalid_json',
      schemaVersion: MASTERY_STATE_SCHEMA_VERSION,
      masteryByVocabId: createEmptyMasteryStateMap(),
      error
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'invalid_payload',
      schemaVersion: MASTERY_STATE_SCHEMA_VERSION,
      masteryByVocabId: createEmptyMasteryStateMap()
    };
  }

  const schemaVersion = Number(parsed.schemaVersion);
  if (schemaVersion !== MASTERY_STATE_SCHEMA_VERSION) {
    return {
      status: 'unsupported_schema',
      schemaVersion,
      expectedSchemaVersion: MASTERY_STATE_SCHEMA_VERSION,
      masteryByVocabId: createEmptyMasteryStateMap()
    };
  }

  if (!parsed.masteryByVocabId || typeof parsed.masteryByVocabId !== 'object' || Array.isArray(parsed.masteryByVocabId)) {
    return {
      status: 'invalid_payload',
      schemaVersion,
      masteryByVocabId: createEmptyMasteryStateMap()
    };
  }

  return {
    status: 'ok',
    schemaVersion,
    masteryByVocabId: normalizeMasteryStateMap(parsed.masteryByVocabId)
  };
};

export const loadMasteryStateFromStorage = ({
  storage,
  storageKey = MASTERY_STORAGE_KEY
} = {}) => {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      status: 'storage_unavailable',
      schemaVersion: MASTERY_STATE_SCHEMA_VERSION,
      masteryByVocabId: createEmptyMasteryStateMap()
    };
  }

  try {
    return parseMasteryPersistencePayload(storage.getItem(storageKey));
  } catch (error) {
    return {
      status: 'storage_error',
      schemaVersion: MASTERY_STATE_SCHEMA_VERSION,
      masteryByVocabId: createEmptyMasteryStateMap(),
      error
    };
  }
};

export const saveMasteryStateToStorage = ({
  storage,
  masteryByVocabId = {},
  storageKey = MASTERY_STORAGE_KEY
} = {}) => {
  if (!storage || typeof storage.setItem !== 'function') {
    return {
      status: 'storage_unavailable',
      saved: false,
      masteryByVocabId: normalizeMasteryStateMap(masteryByVocabId)
    };
  }

  const normalizedMap = normalizeMasteryStateMap(masteryByVocabId);
  const serialized = serializeMasteryPersistencePayload(normalizedMap);

  try {
    storage.setItem(storageKey, serialized);
    return {
      status: 'ok',
      saved: true,
      storageKey,
      serialized,
      masteryByVocabId: normalizedMap
    };
  } catch (error) {
    return {
      status: 'storage_error',
      saved: false,
      storageKey,
      masteryByVocabId: normalizedMap,
      error
    };
  }
};

export const clearMasteryStateStorage = ({
  storage,
  storageKey = MASTERY_STORAGE_KEY
} = {}) => {
  if (!storage || typeof storage.removeItem !== 'function') {
    return { status: 'storage_unavailable', cleared: false, storageKey };
  }

  try {
    storage.removeItem(storageKey);
    return { status: 'ok', cleared: true, storageKey };
  } catch (error) {
    return { status: 'storage_error', cleared: false, storageKey, error };
  }
};
