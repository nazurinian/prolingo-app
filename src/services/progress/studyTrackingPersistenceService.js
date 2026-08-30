// ProLingo v5.12.4B — Study Tracking Persistence Service.
// Separate compact cumulative activity. Never reads/writes CSV, deck cache, mastery state, or dataset dirty state.

import {
  STUDY_TRACKING_SCHEMA_VERSION,
  createEmptyStudyActivityMap,
  normalizeStudyActivityMap
} from '../../domain/progress/studyTrackingDomain.js';

export const STUDY_TRACKING_STORAGE_KEY = 'prolingo_study_activity_v1';

export const createStudyTrackingPersistencePayload = (activityByVocabId = {}) => ({
  schemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
  activityByVocabId: normalizeStudyActivityMap(activityByVocabId)
});

export const serializeStudyTrackingPersistencePayload = (activityByVocabId = {}) =>
  JSON.stringify(createStudyTrackingPersistencePayload(activityByVocabId));

export const parseStudyTrackingPersistencePayload = (rawValue) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return {
      status: 'empty',
      schemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
      activityByVocabId: createEmptyStudyActivityMap()
    };
  }

  let parsed;
  try {
    parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  } catch (error) {
    return {
      status: 'invalid_json',
      schemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
      activityByVocabId: createEmptyStudyActivityMap(),
      error
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'invalid_payload',
      schemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
      activityByVocabId: createEmptyStudyActivityMap()
    };
  }

  const schemaVersion = Number(parsed.schemaVersion);
  if (schemaVersion !== STUDY_TRACKING_SCHEMA_VERSION) {
    return {
      status: 'unsupported_schema',
      schemaVersion,
      expectedSchemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
      activityByVocabId: createEmptyStudyActivityMap()
    };
  }

  if (!parsed.activityByVocabId || typeof parsed.activityByVocabId !== 'object' || Array.isArray(parsed.activityByVocabId)) {
    return {
      status: 'invalid_payload',
      schemaVersion,
      activityByVocabId: createEmptyStudyActivityMap()
    };
  }

  return {
    status: 'ok',
    schemaVersion,
    activityByVocabId: normalizeStudyActivityMap(parsed.activityByVocabId)
  };
};

export const loadStudyTrackingFromStorage = ({
  storage,
  storageKey = STUDY_TRACKING_STORAGE_KEY
} = {}) => {
  if (!storage || typeof storage.getItem !== 'function') {
    return {
      status: 'storage_unavailable',
      schemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
      activityByVocabId: createEmptyStudyActivityMap()
    };
  }
  try {
    return parseStudyTrackingPersistencePayload(storage.getItem(storageKey));
  } catch (error) {
    return {
      status: 'storage_error',
      schemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
      activityByVocabId: createEmptyStudyActivityMap(),
      error
    };
  }
};

export const saveStudyTrackingToStorage = ({
  storage,
  activityByVocabId = {},
  storageKey = STUDY_TRACKING_STORAGE_KEY
} = {}) => {
  const normalizedMap = normalizeStudyActivityMap(activityByVocabId);
  if (!storage || typeof storage.setItem !== 'function') {
    return { status: 'storage_unavailable', saved: false, activityByVocabId: normalizedMap };
  }

  const serialized = serializeStudyTrackingPersistencePayload(normalizedMap);
  try {
    storage.setItem(storageKey, serialized);
    return { status: 'ok', saved: true, storageKey, serialized, activityByVocabId: normalizedMap };
  } catch (error) {
    return { status: 'storage_error', saved: false, storageKey, activityByVocabId: normalizedMap, error };
  }
};

export const clearStudyTrackingStorage = ({
  storage,
  storageKey = STUDY_TRACKING_STORAGE_KEY
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
