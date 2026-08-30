// ProLingo v5.12.4A — Browser storage inspection/reset boundary.
// Granular actions intentionally avoid broad origin-wide reset operations.

import {
  CSV_METADATA_STORAGE_PREFIX,
  DECK_CACHE_STORAGE_KEY,
  resolveLocalStorageSnapshot
} from '../../domain/progress/storageSafetyDomain.js';
import { clearMasteryStateStorage } from '../progress/masteryPersistenceService.js';
import { clearStudyTrackingStorage } from '../progress/studyTrackingPersistenceService.js';

export const readStorageEntries = (storage) => {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') return [];
  const entries = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null || key === undefined) continue;
      entries.push({ key, value: storage.getItem(key) ?? '' });
    }
  } catch {
    return entries;
  }
  return entries;
};

export const inspectProLingoStorage = ({ storage } = {}) => {
  if (!storage) return { status: 'storage_unavailable', snapshot: resolveLocalStorageSnapshot() };
  try {
    return {
      status: 'ok',
      snapshot: resolveLocalStorageSnapshot({ entries: readStorageEntries(storage) })
    };
  } catch (error) {
    return { status: 'storage_error', error, snapshot: resolveLocalStorageSnapshot() };
  }
};

export const estimateBrowserOriginStorage = async ({ navigatorObject } = {}) => {
  const estimate = navigatorObject?.storage?.estimate;
  if (typeof estimate !== 'function') return { status: 'unsupported', usage: null, quota: null };
  try {
    const result = await estimate.call(navigatorObject.storage);
    return {
      status: 'ok',
      usage: Number.isFinite(result?.usage) ? result.usage : null,
      quota: Number.isFinite(result?.quota) ? result.quota : null
    };
  } catch (error) {
    return { status: 'error', error, usage: null, quota: null };
  }
};

export const clearDatasetCacheStorage = ({ storage } = {}) => {
  if (!storage || typeof storage.removeItem !== 'function') {
    return { status: 'storage_unavailable', cleared: false, key: DECK_CACHE_STORAGE_KEY };
  }
  try {
    storage.removeItem(DECK_CACHE_STORAGE_KEY);
    return { status: 'ok', cleared: true, key: DECK_CACHE_STORAGE_KEY };
  } catch (error) {
    return { status: 'storage_error', cleared: false, key: DECK_CACHE_STORAGE_KEY, error };
  }
};

export const clearCsvMetadataStorage = ({ storage } = {}) => {
  if (!storage || typeof storage.removeItem !== 'function') {
    return { status: 'storage_unavailable', cleared: false, removedKeys: [] };
  }
  const keys = readStorageEntries(storage)
    .map(entry => entry.key)
    .filter(key => key.startsWith(CSV_METADATA_STORAGE_PREFIX));
  try {
    keys.forEach(key => storage.removeItem(key));
    return { status: 'ok', cleared: true, removedKeys: keys };
  } catch (error) {
    return { status: 'storage_error', cleared: false, removedKeys: [], error };
  }
};

export const clearMasteryProgressStorage = ({ storage } = {}) =>
  clearMasteryStateStorage({ storage });

export const clearStudyActivityStorage = ({ storage } = {}) =>
  clearStudyTrackingStorage({ storage });
