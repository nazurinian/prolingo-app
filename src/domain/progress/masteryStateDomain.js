// ProLingo v5.12.1B — Mastery State Pure Domain
// Pure mastery rules only: no React, storage, timers, dataset mutation, playback, or UI side effects.

export const MASTERY_STATES = Object.freeze({
  NEW: 'NEW',
  LEARNING: 'LEARNING',
  FAMILIAR: 'FAMILIAR',
  MASTERED: 'MASTERED'
});

export const MASTERY_STATE_SEQUENCE = Object.freeze([
  MASTERY_STATES.NEW,
  MASTERY_STATES.LEARNING,
  MASTERY_STATES.FAMILIAR,
  MASTERY_STATES.MASTERED
]);

export const DEFAULT_MASTERY_STATE = MASTERY_STATES.NEW;
export const MASTERY_STATE_SCHEMA_VERSION = 1;

const VALID_MASTERY_STATES = new Set(MASTERY_STATE_SEQUENCE);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export const normalizeMasteryVocabId = (value) => {
  const raw = String(value ?? '').trim();
  return raw ? raw.replace(/\s+/g, '_').toUpperCase() : '';
};

export const isValidMasteryState = (value) =>
  VALID_MASTERY_STATES.has(String(value ?? '').trim().toUpperCase());

export const normalizeMasteryState = (value, fallback = DEFAULT_MASTERY_STATE) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (VALID_MASTERY_STATES.has(normalized)) return normalized;

  const normalizedFallback = String(fallback ?? '').trim().toUpperCase();
  return VALID_MASTERY_STATES.has(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_MASTERY_STATE;
};

export const createEmptyMasteryStateMap = () => ({});

// The map is intentionally sparse: absence means NEW. Only non-NEW states are stored.
export const normalizeMasteryStateMap = (masteryByVocabId) => {
  if (!masteryByVocabId || typeof masteryByVocabId !== 'object' || Array.isArray(masteryByVocabId)) {
    return createEmptyMasteryStateMap();
  }

  const normalizedMap = {};

  Object.entries(masteryByVocabId).forEach(([rawVocabId, rawState]) => {
    const vocabId = normalizeMasteryVocabId(rawVocabId);
    if (!vocabId || !isValidMasteryState(rawState)) return;

    const state = normalizeMasteryState(rawState);
    if (state !== DEFAULT_MASTERY_STATE) normalizedMap[vocabId] = state;
  });

  return normalizedMap;
};

export const resolveMasteryState = (masteryByVocabId, vocabId) => {
  const normalizedVocabId = normalizeMasteryVocabId(vocabId);
  if (!normalizedVocabId || !masteryByVocabId || typeof masteryByVocabId !== 'object') {
    return DEFAULT_MASTERY_STATE;
  }

  return normalizeMasteryState(masteryByVocabId[normalizedVocabId], DEFAULT_MASTERY_STATE);
};

export const resolveNextMasteryState = (currentState) => {
  const normalizedState = normalizeMasteryState(currentState);
  const index = MASTERY_STATE_SEQUENCE.indexOf(normalizedState);
  return MASTERY_STATE_SEQUENCE[(index + 1) % MASTERY_STATE_SEQUENCE.length];
};

export const resolvePreviousMasteryState = (currentState) => {
  const normalizedState = normalizeMasteryState(currentState);
  const index = MASTERY_STATE_SEQUENCE.indexOf(normalizedState);
  return MASTERY_STATE_SEQUENCE[(index - 1 + MASTERY_STATE_SEQUENCE.length) % MASTERY_STATE_SEQUENCE.length];
};

export const resolveMasteryStateUpdate = ({
  masteryByVocabId = {},
  vocabId,
  nextState
} = {}) => {
  const normalizedVocabId = normalizeMasteryVocabId(vocabId);

  if (!normalizedVocabId) {
    return {
      status: 'invalid_vocab_id',
      changed: false,
      vocabId: '',
      previousState: DEFAULT_MASTERY_STATE,
      nextState: DEFAULT_MASTERY_STATE,
      masteryByVocabId
    };
  }

  if (!isValidMasteryState(nextState)) {
    return {
      status: 'invalid_state',
      changed: false,
      vocabId: normalizedVocabId,
      previousState: resolveMasteryState(masteryByVocabId, normalizedVocabId),
      nextState: DEFAULT_MASTERY_STATE,
      masteryByVocabId
    };
  }

  const normalizedNextState = normalizeMasteryState(nextState);
  const previousState = resolveMasteryState(masteryByVocabId, normalizedVocabId);
  const sourceMap = masteryByVocabId && typeof masteryByVocabId === 'object' && !Array.isArray(masteryByVocabId)
    ? masteryByVocabId
    : {};
  const hasStoredEntry = hasOwn(sourceMap, normalizedVocabId);
  const storedEntryIsCanonical = hasStoredEntry
    && isValidMasteryState(sourceMap[normalizedVocabId])
    && normalizeMasteryState(sourceMap[normalizedVocabId]) !== DEFAULT_MASTERY_STATE;

  if (normalizedNextState === DEFAULT_MASTERY_STATE) {
    if (!hasStoredEntry) {
      return {
        status: 'ok',
        changed: false,
        vocabId: normalizedVocabId,
        previousState,
        nextState: normalizedNextState,
        masteryByVocabId: sourceMap
      };
    }

    const nextMap = { ...sourceMap };
    delete nextMap[normalizedVocabId];
    return {
      status: 'ok',
      changed: true,
      vocabId: normalizedVocabId,
      previousState,
      nextState: normalizedNextState,
      masteryByVocabId: nextMap
    };
  }

  if (storedEntryIsCanonical && previousState === normalizedNextState) {
    return {
      status: 'ok',
      changed: false,
      vocabId: normalizedVocabId,
      previousState,
      nextState: normalizedNextState,
      masteryByVocabId: sourceMap
    };
  }

  return {
    status: 'ok',
    changed: true,
    vocabId: normalizedVocabId,
    previousState,
    nextState: normalizedNextState,
    masteryByVocabId: {
      ...sourceMap,
      [normalizedVocabId]: normalizedNextState
    }
  };
};
