// ProLingo v5.12.5A — Progress Backup/Restore pure domain.
// Backup data contains progress only: mastery + compact study tracking keyed by VOCAB_ID.
// It never contains or mutates dataset CSV, NO/audio slots, deck cache, preferences, or high-water metadata.

import {
  MASTERY_STATE_SCHEMA_VERSION,
  MASTERY_STATE_SEQUENCE,
  normalizeMasteryStateMap,
  normalizeMasteryVocabId
} from './masteryStateDomain.js';
import {
  STUDY_TRACKING_SCHEMA_VERSION,
  normalizeStudyActivityEntry,
  normalizeStudyActivityMap
} from './studyTrackingDomain.js';

export const PROGRESS_BACKUP_FORMAT = 'prolingo-progress-backup';
export const PROGRESS_BACKUP_SCHEMA_VERSION = 1;

export const PROGRESS_RESTORE_MODES = Object.freeze({
  MERGE: 'merge',
  REPLACE: 'replace'
});

const masteryRank = new Map(MASTERY_STATE_SEQUENCE.map((state, index) => [state, index]));

const normalizeRestoreMode = (value) =>
  value === PROGRESS_RESTORE_MODES.REPLACE
    ? PROGRESS_RESTORE_MODES.REPLACE
    : PROGRESS_RESTORE_MODES.MERGE;

const normalizeExportedAt = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

export const createProgressBackupPayload = ({
  masteryByVocabId = {},
  activityByVocabId = {},
  exportedAt = new Date().toISOString(),
  appVersion = ''
} = {}) => ({
  format: PROGRESS_BACKUP_FORMAT,
  schemaVersion: PROGRESS_BACKUP_SCHEMA_VERSION,
  exportedAt: normalizeExportedAt(exportedAt) || new Date().toISOString(),
  appVersion: String(appVersion || '').trim() || null,
  masterySchemaVersion: MASTERY_STATE_SCHEMA_VERSION,
  studyTrackingSchemaVersion: STUDY_TRACKING_SCHEMA_VERSION,
  masteryByVocabId: normalizeMasteryStateMap(masteryByVocabId),
  activityByVocabId: normalizeStudyActivityMap(activityByVocabId)
});

export const serializeProgressBackupPayload = (input = {}) =>
  JSON.stringify(createProgressBackupPayload(input), null, 2);

export const parseProgressBackupPayload = (rawValue) => {
  let parsed;
  try {
    parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  } catch (error) {
    return { status: 'invalid_json', error, backup: null };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'invalid_payload', backup: null };
  }

  if (parsed.format !== PROGRESS_BACKUP_FORMAT) {
    return { status: 'invalid_format', backup: null, format: parsed.format ?? null };
  }

  const schemaVersion = Number(parsed.schemaVersion);
  if (schemaVersion !== PROGRESS_BACKUP_SCHEMA_VERSION) {
    return {
      status: 'unsupported_schema',
      backup: null,
      schemaVersion,
      expectedSchemaVersion: PROGRESS_BACKUP_SCHEMA_VERSION
    };
  }

  if (Number(parsed.masterySchemaVersion) !== MASTERY_STATE_SCHEMA_VERSION) {
    return {
      status: 'unsupported_mastery_schema',
      backup: null,
      schemaVersion: Number(parsed.masterySchemaVersion),
      expectedSchemaVersion: MASTERY_STATE_SCHEMA_VERSION
    };
  }

  if (Number(parsed.studyTrackingSchemaVersion) !== STUDY_TRACKING_SCHEMA_VERSION) {
    return {
      status: 'unsupported_tracking_schema',
      backup: null,
      schemaVersion: Number(parsed.studyTrackingSchemaVersion),
      expectedSchemaVersion: STUDY_TRACKING_SCHEMA_VERSION
    };
  }

  if (!parsed.masteryByVocabId || typeof parsed.masteryByVocabId !== 'object' || Array.isArray(parsed.masteryByVocabId)) {
    return { status: 'invalid_mastery_payload', backup: null };
  }
  if (!parsed.activityByVocabId || typeof parsed.activityByVocabId !== 'object' || Array.isArray(parsed.activityByVocabId)) {
    return { status: 'invalid_tracking_payload', backup: null };
  }

  const backup = createProgressBackupPayload({
    masteryByVocabId: parsed.masteryByVocabId,
    activityByVocabId: parsed.activityByVocabId,
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion
  });

  return {
    status: 'ok',
    backup,
    rawMasteryEntryCount: Object.keys(parsed.masteryByVocabId).length,
    normalizedMasteryEntryCount: Object.keys(backup.masteryByVocabId).length,
    rawTrackingEntryCount: Object.keys(parsed.activityByVocabId).length,
    normalizedTrackingEntryCount: Object.keys(backup.activityByVocabId).length
  };
};

const mergeMasteryStateMaps = (currentMap = {}, incomingMap = {}) => {
  const current = normalizeMasteryStateMap(currentMap);
  const incoming = normalizeMasteryStateMap(incomingMap);
  const merged = { ...current };

  Object.entries(incoming).forEach(([vocabId, incomingState]) => {
    const currentState = current[vocabId];
    if (!currentState || (masteryRank.get(incomingState) ?? 0) > (masteryRank.get(currentState) ?? 0)) {
      merged[vocabId] = incomingState;
    }
  });

  return merged;
};

const mergeStudyEntriesIdempotent = (currentEntry, incomingEntry) => {
  const current = normalizeStudyActivityEntry(currentEntry);
  const incoming = normalizeStudyActivityEntry(incomingEntry);
  if (!current) return incoming;
  if (!incoming) return current;
  return {
    studyCount: Math.max(current.studyCount, incoming.studyCount),
    firstStudiedAt: Math.min(current.firstStudiedAt, incoming.firstStudiedAt),
    lastStudiedAt: Math.max(current.lastStudiedAt, incoming.lastStudiedAt)
  };
};

const mergeStudyActivityMaps = (currentMap = {}, incomingMap = {}) => {
  const current = normalizeStudyActivityMap(currentMap);
  const incoming = normalizeStudyActivityMap(incomingMap);
  const merged = { ...current };

  Object.entries(incoming).forEach(([vocabId, incomingEntry]) => {
    merged[vocabId] = mergeStudyEntriesIdempotent(current[vocabId], incomingEntry);
  });

  return normalizeStudyActivityMap(merged);
};

export const resolveProgressBackupDiagnostics = ({
  backup,
  currentVocabIds = []
} = {}) => {
  const normalizedCurrentIds = new Set(
    (Array.isArray(currentVocabIds) ? currentVocabIds : [])
      .map(normalizeMasteryVocabId)
      .filter(Boolean)
  );

  const masteryMap = normalizeMasteryStateMap(backup?.masteryByVocabId);
  const activityMap = normalizeStudyActivityMap(backup?.activityByVocabId);
  const backupIds = new Set([...Object.keys(masteryMap), ...Object.keys(activityMap)]);

  let matchedCurrentDataset = 0;
  const notInCurrentDataset = [];
  backupIds.forEach(vocabId => {
    if (normalizedCurrentIds.has(vocabId)) matchedCurrentDataset += 1;
    else notInCurrentDataset.push(vocabId);
  });

  return {
    masteryEntryCount: Object.keys(masteryMap).length,
    studyTrackingEntryCount: Object.keys(activityMap).length,
    uniqueVocabIdCount: backupIds.size,
    currentDatasetVocabIdCount: normalizedCurrentIds.size,
    matchedCurrentDataset,
    notInCurrentDatasetCount: notInCurrentDataset.length,
    notInCurrentDatasetSample: notInCurrentDataset.slice(0, 8)
  };
};


const masteryMapsEqual = (left, right) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => right[key] === left[key]);
};

const activityMapsEqual = (left, right) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(key => {
    const a = left[key];
    const b = right[key];
    return Boolean(b)
      && a.studyCount === b.studyCount
      && a.firstStudiedAt === b.firstStudiedAt
      && a.lastStudiedAt === b.lastStudiedAt;
  });
};

export const resolveProgressRestore = ({
  currentMasteryByVocabId = {},
  currentActivityByVocabId = {},
  backup,
  mode = PROGRESS_RESTORE_MODES.MERGE,
  currentVocabIds = []
} = {}) => {
  if (!backup || typeof backup !== 'object') {
    return { status: 'invalid_backup', changed: false };
  }

  const restoreMode = normalizeRestoreMode(mode);
  const incomingMastery = normalizeMasteryStateMap(backup.masteryByVocabId);
  const incomingActivity = normalizeStudyActivityMap(backup.activityByVocabId);

  const masteryByVocabId = restoreMode === PROGRESS_RESTORE_MODES.REPLACE
    ? incomingMastery
    : mergeMasteryStateMaps(currentMasteryByVocabId, incomingMastery);
  const activityByVocabId = restoreMode === PROGRESS_RESTORE_MODES.REPLACE
    ? incomingActivity
    : mergeStudyActivityMaps(currentActivityByVocabId, incomingActivity);

  const previousMastery = normalizeMasteryStateMap(currentMasteryByVocabId);
  const previousActivity = normalizeStudyActivityMap(currentActivityByVocabId);
  const changed = !masteryMapsEqual(previousMastery, masteryByVocabId)
    || !activityMapsEqual(previousActivity, activityByVocabId);

  return {
    status: 'ok',
    changed,
    mode: restoreMode,
    masteryByVocabId,
    activityByVocabId,
    diagnostics: resolveProgressBackupDiagnostics({ backup, currentVocabIds })
  };
};
