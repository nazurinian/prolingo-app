import { useEffect, useState } from 'react';
import { createEmptyMasteryStateMap } from '../domain/progress/masteryStateDomain.js';
import {
  loadMasteryStateFromStorage,
  saveMasteryStateToStorage
} from '../services/progress/masteryPersistenceService.js';

const resolveBrowserLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const loadInitialMasteryState = () => {
  const storage = resolveBrowserLocalStorage();
  if (!storage) return createEmptyMasteryStateMap();
  return loadMasteryStateFromStorage({ storage }).masteryByVocabId;
};

export const useMasteryProgressState = ({ sessionOnly = false } = {}) => {
  const [masteryByVocabId, setMasteryByVocabId] = useState(() => sessionOnly ? {} : loadInitialMasteryState());

  useEffect(() => {
    if (sessionOnly) return;
    const storage = resolveBrowserLocalStorage();
    if (!storage) return;
    saveMasteryStateToStorage({ storage, masteryByVocabId });
  }, [masteryByVocabId, sessionOnly]);

  return { masteryByVocabId, setMasteryByVocabId };
};
