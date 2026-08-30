// ProLingo v5.12.4B — Automatic Study Tracking pure domain.
// Compact cumulative activity only: no event-history array, React, browser storage, playback, or mastery side effects.

import { normalizeMasteryVocabId } from './masteryStateDomain.js';

export const STUDY_TRACKING_SCHEMA_VERSION = 1;

export const createEmptyStudyActivityMap = () => ({});

const normalizePositiveInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const normalizeStudyTimestamp = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
};

export const normalizeStudyActivityEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const studyCount = normalizePositiveInteger(entry.studyCount, 0);
  if (!studyCount) return null;

  const firstRaw = normalizeStudyTimestamp(entry.firstStudiedAt);
  const lastRaw = normalizeStudyTimestamp(entry.lastStudiedAt);
  if (!firstRaw && !lastRaw) return null;

  const firstStudiedAt = firstRaw && lastRaw ? Math.min(firstRaw, lastRaw) : (firstRaw || lastRaw);
  const lastStudiedAt = firstRaw && lastRaw ? Math.max(firstRaw, lastRaw) : (lastRaw || firstRaw);

  return { studyCount, firstStudiedAt, lastStudiedAt };
};

const mergeStudyActivityEntries = (left, right) => {
  if (!left) return right;
  if (!right) return left;
  return {
    studyCount: left.studyCount + right.studyCount,
    firstStudiedAt: Math.min(left.firstStudiedAt, right.firstStudiedAt),
    lastStudiedAt: Math.max(left.lastStudiedAt, right.lastStudiedAt)
  };
};

export const normalizeStudyActivityMap = (activityByVocabId) => {
  if (!activityByVocabId || typeof activityByVocabId !== 'object' || Array.isArray(activityByVocabId)) {
    return createEmptyStudyActivityMap();
  }

  const normalized = {};
  Object.entries(activityByVocabId).forEach(([rawVocabId, rawEntry]) => {
    const vocabId = normalizeMasteryVocabId(rawVocabId);
    const entry = normalizeStudyActivityEntry(rawEntry);
    if (!vocabId || !entry) return;
    normalized[vocabId] = mergeStudyActivityEntries(normalized[vocabId], entry);
  });
  return normalized;
};

export const resolveStudyActivityEntry = (activityByVocabId, vocabId) => {
  const normalizedVocabId = normalizeMasteryVocabId(vocabId);
  if (!normalizedVocabId || !activityByVocabId || typeof activityByVocabId !== 'object') return null;
  return normalizeStudyActivityEntry(activityByVocabId[normalizedVocabId]);
};

export const resolveStudyActivityUpdate = ({
  activityByVocabId = {},
  vocabId,
  studiedAt
} = {}) => {
  const normalizedVocabId = normalizeMasteryVocabId(vocabId);
  const timestamp = normalizeStudyTimestamp(studiedAt);

  if (!normalizedVocabId) {
    return { status: 'invalid_vocab_id', changed: false, vocabId: '', activityByVocabId };
  }
  if (!timestamp) {
    return { status: 'invalid_timestamp', changed: false, vocabId: normalizedVocabId, activityByVocabId };
  }

  const sourceMap = activityByVocabId && typeof activityByVocabId === 'object' && !Array.isArray(activityByVocabId)
    ? activityByVocabId
    : {};
  const previous = resolveStudyActivityEntry(sourceMap, normalizedVocabId);
  const nextEntry = previous
    ? {
        studyCount: previous.studyCount + 1,
        firstStudiedAt: Math.min(previous.firstStudiedAt, timestamp),
        lastStudiedAt: Math.max(previous.lastStudiedAt, timestamp)
      }
    : { studyCount: 1, firstStudiedAt: timestamp, lastStudiedAt: timestamp };

  return {
    status: 'ok',
    changed: true,
    vocabId: normalizedVocabId,
    previousEntry: previous,
    nextEntry,
    activityByVocabId: { ...sourceMap, [normalizedVocabId]: nextEntry }
  };
};

const roundPercentage = (numerator, denominator) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
};

export const resolveStudyActivityStatistics = ({
  items = [],
  activityByVocabId = {}
} = {}) => {
  const seen = new Set();
  let trackable = 0;
  let studied = 0;
  let totalStudyEvents = 0;
  let lastStudiedAt = null;

  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.isStructured) continue;
    const vocabId = normalizeMasteryVocabId(item?.vocabId);
    if (!vocabId || seen.has(vocabId)) continue;
    seen.add(vocabId);
    trackable += 1;

    const entry = resolveStudyActivityEntry(activityByVocabId, vocabId);
    if (!entry) continue;
    studied += 1;
    totalStudyEvents += entry.studyCount;
    lastStudiedAt = lastStudiedAt === null ? entry.lastStudiedAt : Math.max(lastStudiedAt, entry.lastStudiedAt);
  }

  return {
    trackable,
    studied,
    unstudied: Math.max(0, trackable - studied),
    totalStudyEvents,
    studiedPercentage: roundPercentage(studied, trackable),
    lastStudiedAt
  };
};
