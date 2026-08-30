// ProLingo v5.12.5A — Progress backup/restore browser-file boundary.
// Handles JSON files only. Dataset CSV/cache/high-water metadata are deliberately outside this service.

import {
  createProgressBackupPayload,
  parseProgressBackupPayload,
  resolveProgressRestore,
  serializeProgressBackupPayload
} from '../../domain/progress/progressBackupDomain.js';
import {
  MASTERY_STORAGE_KEY,
  saveMasteryStateToStorage
} from './masteryPersistenceService.js';
import {
  STUDY_TRACKING_STORAGE_KEY,
  saveStudyTrackingToStorage
} from './studyTrackingPersistenceService.js';

export const createProgressBackupFile = ({
  masteryByVocabId = {},
  activityByVocabId = {},
  appVersion = '',
  now = new Date()
} = {}) => {
  const exportedAt = now instanceof Date && Number.isFinite(now.getTime())
    ? now.toISOString()
    : new Date().toISOString();
  const payload = createProgressBackupPayload({ masteryByVocabId, activityByVocabId, appVersion, exportedAt });
  const stamp = exportedAt.replace(/[:.]/g, '-');
  return {
    status: 'ok',
    filename: `ProLingo_Progress_Backup_${stamp}.json`,
    payload,
    content: serializeProgressBackupPayload(payload)
  };
};

export const triggerProgressBackupDownload = ({ documentObject, urlObject, content, filename } = {}) => {
  if (!documentObject || typeof documentObject.createElement !== 'function' || !urlObject?.createObjectURL) {
    return { status: 'browser_unavailable', downloaded: false };
  }

  try {
    const blob = new Blob([String(content ?? '')], { type: 'application/json;charset=utf-8' });
    const url = urlObject.createObjectURL(blob);
    const anchor = documentObject.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'ProLingo_Progress_Backup.json';
    anchor.style.display = 'none';
    documentObject.body?.appendChild?.(anchor);
    anchor.click();
    anchor.remove?.();
    urlObject.revokeObjectURL?.(url);
    return { status: 'ok', downloaded: true, filename: anchor.download };
  } catch (error) {
    return { status: 'download_error', downloaded: false, error };
  }
};

export const readProgressBackupFile = async (file) => {
  if (!file || typeof file.text !== 'function') return { status: 'invalid_file', backup: null };
  try {
    const text = await file.text();
    return { ...parseProgressBackupPayload(text), fileName: file.name || '' };
  } catch (error) {
    return { status: 'read_error', backup: null, error, fileName: file?.name || '' };
  }
};

export const prepareProgressRestore = ({
  parsedBackupResult,
  currentMasteryByVocabId = {},
  currentActivityByVocabId = {},
  currentVocabIds = [],
  mode = 'merge'
} = {}) => {
  if (parsedBackupResult?.status !== 'ok' || !parsedBackupResult.backup) {
    return { status: parsedBackupResult?.status || 'invalid_backup', changed: false };
  }
  return resolveProgressRestore({
    currentMasteryByVocabId,
    currentActivityByVocabId,
    backup: parsedBackupResult.backup,
    currentVocabIds,
    mode
  });
};


const restoreRawStorageValue = (storage, key, previousValue) => {
  if (previousValue === null || previousValue === undefined) storage.removeItem(key);
  else storage.setItem(key, previousValue);
};

export const persistPreparedProgressRestore = ({
  storage,
  masteryByVocabId = {},
  activityByVocabId = {}
} = {}) => {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    return { status: 'storage_unavailable', saved: false, rolledBack: false };
  }

  let previousMasteryRaw;
  let previousTrackingRaw;
  try {
    previousMasteryRaw = storage.getItem(MASTERY_STORAGE_KEY);
    previousTrackingRaw = storage.getItem(STUDY_TRACKING_STORAGE_KEY);
  } catch (error) {
    return { status: 'storage_error', saved: false, rolledBack: false, error };
  }

  const masteryResult = saveMasteryStateToStorage({ storage, masteryByVocabId });
  if (!masteryResult.saved) {
    return { status: masteryResult.status, saved: false, rolledBack: false, error: masteryResult.error };
  }

  const trackingResult = saveStudyTrackingToStorage({ storage, activityByVocabId });
  if (trackingResult.saved) {
    return { status: 'ok', saved: true, rolledBack: false };
  }

  try {
    restoreRawStorageValue(storage, MASTERY_STORAGE_KEY, previousMasteryRaw);
    restoreRawStorageValue(storage, STUDY_TRACKING_STORAGE_KEY, previousTrackingRaw);
    return { status: trackingResult.status, saved: false, rolledBack: true, error: trackingResult.error };
  } catch (rollbackError) {
    return {
      status: 'rollback_error',
      saved: false,
      rolledBack: false,
      error: trackingResult.error,
      rollbackError
    };
  }
};
