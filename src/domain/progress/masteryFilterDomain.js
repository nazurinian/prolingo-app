// ProLingo v5.12.2A — Mastery Progress Filter Domain
// Pure filter rules only: no React, storage, playback side effects, or dataset mutation.

import {
  DEFAULT_MASTERY_STATE,
  MASTERY_STATES,
  normalizeMasteryVocabId,
  resolveMasteryState
} from './masteryStateDomain.js';

export const MASTERY_FILTERS = Object.freeze({
  ALL: 'all',
  NEW: 'new',
  LEARNING: 'learning',
  FAMILIAR: 'familiar',
  MASTERED: 'mastered'
});

export const DEFAULT_MASTERY_FILTER = MASTERY_FILTERS.ALL;

const VALID_MASTERY_FILTERS = new Set(Object.values(MASTERY_FILTERS));

export const normalizeMasteryFilter = (value, fallback = DEFAULT_MASTERY_FILTER) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (VALID_MASTERY_FILTERS.has(normalized)) return normalized;

  const normalizedFallback = String(fallback ?? '').trim().toLowerCase();
  return VALID_MASTERY_FILTERS.has(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_MASTERY_FILTER;
};

export const resolveMasteryFilterTargetState = (masteryFilter) => {
  const normalizedFilter = normalizeMasteryFilter(masteryFilter);
  if (normalizedFilter === MASTERY_FILTERS.NEW) return MASTERY_STATES.NEW;
  if (normalizedFilter === MASTERY_FILTERS.LEARNING) return MASTERY_STATES.LEARNING;
  if (normalizedFilter === MASTERY_FILTERS.FAMILIAR) return MASTERY_STATES.FAMILIAR;
  if (normalizedFilter === MASTERY_FILTERS.MASTERED) return MASTERY_STATES.MASTERED;
  return null;
};

export const isMasteryTrackableItem = (item) =>
  Boolean(normalizeMasteryVocabId(item?.vocabId));

export const doesItemMatchMasteryFilter = ({
  item,
  masteryByVocabId = {},
  masteryFilter = DEFAULT_MASTERY_FILTER
} = {}) => {
  const normalizedFilter = normalizeMasteryFilter(masteryFilter);
  if (normalizedFilter === MASTERY_FILTERS.ALL) return true;

  const vocabId = normalizeMasteryVocabId(item?.vocabId);
  if (!vocabId) return false;

  const targetState = resolveMasteryFilterTargetState(normalizedFilter);
  const currentState = resolveMasteryState(masteryByVocabId, vocabId);
  return currentState === (targetState || DEFAULT_MASTERY_STATE);
};

export const resolveMasteryFilteredItems = ({
  items = [],
  masteryByVocabId = {},
  masteryFilter = DEFAULT_MASTERY_FILTER
} = {}) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const normalizedFilter = normalizeMasteryFilter(masteryFilter);

  if (normalizedFilter === MASTERY_FILTERS.ALL) return sourceItems;

  return sourceItems.filter((item) =>
    doesItemMatchMasteryFilter({
      item,
      masteryByVocabId,
      masteryFilter: normalizedFilter
    })
  );
};

export const resolveMasteryFilterCounts = ({
  items = [],
  masteryByVocabId = {}
} = {}) => {
  const sourceItems = Array.isArray(items) ? items : [];
  const counts = {
    all: sourceItems.length,
    trackable: 0,
    untrackable: 0,
    new: 0,
    learning: 0,
    familiar: 0,
    mastered: 0
  };

  sourceItems.forEach((item) => {
    const vocabId = normalizeMasteryVocabId(item?.vocabId);
    if (!vocabId) {
      counts.untrackable += 1;
      return;
    }

    counts.trackable += 1;
    const state = resolveMasteryState(masteryByVocabId, vocabId);
    if (state === MASTERY_STATES.LEARNING) counts.learning += 1;
    else if (state === MASTERY_STATES.FAMILIAR) counts.familiar += 1;
    else if (state === MASTERY_STATES.MASTERED) counts.mastered += 1;
    else counts.new += 1;
  });

  return counts;
};
