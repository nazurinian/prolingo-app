// ProLingo v5.12.4A — Storage Safety pure domain.
// Computes storage usage/categories only. No browser side effects live here.

export const LOCAL_STORAGE_SAFETY_REFERENCE_BYTES = 5 * 1024 * 1024;
export const DECK_CACHE_STORAGE_KEY = 'pronunciation_decks';
export const CSV_METADATA_STORAGE_PREFIX = 'prolingo_csv_meta:';
export const MASTERY_STORAGE_KEY_REFERENCE = 'prolingo_mastery_state_v1';
export const STUDY_TRACKING_STORAGE_KEY_REFERENCE = 'prolingo_study_activity_v1';
export const TEXT_IDENTITY_STORAGE_KEY_REFERENCE = 'prolingo_text_identity_v1';

export const PREFERENCE_STORAGE_KEYS = Object.freeze([
  'theme',
  'gemini_api_key', // legacy; startup removes this security-sensitive key
  'prolingo_gemini_byok_key_v1', // legacy plaintext BYOK; startup removes it
  'prolingo_playback_sequence_v511',
  'prolingo_playback_delays_v511',
  'prolingo_vocabulary_play_order_v511',
  'prolingo_control_section_v5116'
]);

const preferenceKeySet = new Set(PREFERENCE_STORAGE_KEYS);

export const estimateUtf8Bytes = (value = '') => {
  const text = String(value ?? '');
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
};

export const estimateStorageEntryBytes = (key, value) =>
  estimateUtf8Bytes(key) + estimateUtf8Bytes(value);

export const classifyProLingoStorageKey = (key = '') => {
  const normalizedKey = String(key || '');
  if (normalizedKey === DECK_CACHE_STORAGE_KEY) return 'datasetCache';
  if (normalizedKey.startsWith(CSV_METADATA_STORAGE_PREFIX)) return 'csvMetadata';
  if (normalizedKey === MASTERY_STORAGE_KEY_REFERENCE) return 'mastery';
  if (normalizedKey === STUDY_TRACKING_STORAGE_KEY_REFERENCE) return 'studyTracking';
  if (normalizedKey === TEXT_IDENTITY_STORAGE_KEY_REFERENCE) return 'otherProLingo';
  if (preferenceKeySet.has(normalizedKey)) return 'preferences';
  if (normalizedKey.startsWith('prolingo_')) return 'otherProLingo';
  return 'otherOrigin';
};

export const resolveStorageSafetyStatus = (
  totalBytes = 0,
  referenceBytes = LOCAL_STORAGE_SAFETY_REFERENCE_BYTES
) => {
  const safeTotal = Math.max(0, Number(totalBytes) || 0);
  const safeReference = Math.max(1, Number(referenceBytes) || LOCAL_STORAGE_SAFETY_REFERENCE_BYTES);
  const ratio = safeTotal / safeReference;
  if (ratio >= 0.95) return { key: 'critical', label: 'CRITICAL', ratio };
  if (ratio >= 0.8) return { key: 'high', label: 'HIGH', ratio };
  if (ratio >= 0.6) return { key: 'watch', label: 'WATCH', ratio };
  return { key: 'safe', label: 'SAFE', ratio };
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const resolveDeckCount = (rawValue) => {
  const parsed = safeJsonParse(rawValue);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.keys(parsed).length
    : 0;
};

const resolveMasteryEntryCount = (rawValue) => {
  const parsed = safeJsonParse(rawValue);
  const map = parsed?.masteryByVocabId;
  return map && typeof map === 'object' && !Array.isArray(map)
    ? Object.keys(map).length
    : 0;
};

const resolveStudyTrackingSummary = (rawValue) => {
  const parsed = safeJsonParse(rawValue);
  const map = parsed?.activityByVocabId;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { entryCount: 0, eventCount: 0 };
  let eventCount = 0;
  Object.values(map).forEach(entry => {
    const count = Number.parseInt(entry?.studyCount, 10);
    if (Number.isFinite(count) && count > 0) eventCount += count;
  });
  return { entryCount: Object.keys(map).length, eventCount };
};

export const createEmptyStorageUsageCategories = () => ({
  datasetCache: { bytes: 0, keyCount: 0 },
  csvMetadata: { bytes: 0, keyCount: 0 },
  mastery: { bytes: 0, keyCount: 0 },
  studyTracking: { bytes: 0, keyCount: 0 },
  preferences: { bytes: 0, keyCount: 0 },
  otherProLingo: { bytes: 0, keyCount: 0 },
  otherOrigin: { bytes: 0, keyCount: 0 }
});

export const resolveLocalStorageSnapshot = ({
  entries = [],
  referenceBytes = LOCAL_STORAGE_SAFETY_REFERENCE_BYTES
} = {}) => {
  const categories = createEmptyStorageUsageCategories();
  let totalBytes = 0;
  let proLingoBytes = 0;
  let deckCount = 0;
  let masteryEntryCount = 0;
  let studyTrackingEntryCount = 0;
  let studyTrackingEventCount = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = String(entry?.key ?? '');
    const value = String(entry?.value ?? '');
    const bytes = estimateStorageEntryBytes(key, value);
    const category = classifyProLingoStorageKey(key);

    categories[category].bytes += bytes;
    categories[category].keyCount += 1;
    totalBytes += bytes;
    if (category !== 'otherOrigin') proLingoBytes += bytes;
    if (key === DECK_CACHE_STORAGE_KEY) deckCount = resolveDeckCount(value);
    if (key === MASTERY_STORAGE_KEY_REFERENCE) masteryEntryCount = resolveMasteryEntryCount(value);
    if (key === STUDY_TRACKING_STORAGE_KEY_REFERENCE) {
      const trackingSummary = resolveStudyTrackingSummary(value);
      studyTrackingEntryCount = trackingSummary.entryCount;
      studyTrackingEventCount = trackingSummary.eventCount;
    }
  }

  const safety = resolveStorageSafetyStatus(proLingoBytes, referenceBytes);
  return {
    totalBytes,
    proLingoBytes,
    referenceBytes,
    referenceRatio: safety.ratio,
    safety,
    categories,
    deckCount,
    masteryEntryCount,
    studyTrackingEntryCount,
    studyTrackingEventCount,
    csvMetadataCount: categories.csvMetadata.keyCount,
    totalKeyCount: Object.values(categories).reduce((sum, item) => sum + item.keyCount, 0)
  };
};

export const formatStorageBytes = (bytes = 0) => {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  if (safeBytes < 1024) return `${safeBytes} B`;
  const kib = safeBytes / 1024;
  if (kib < 1024) return `${kib < 10 ? kib.toFixed(1) : kib.toFixed(0)} KB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib < 10 ? 2 : 1)} MB`;
};
