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

export const useMasteryProgressState = () => {
  const [masteryByVocabId, setMasteryByVocabId] = useState(loadInitialMasteryState);

  useEffect(() => {
    const storage = resolveBrowserLocalStorage();
    if (!storage) return;
    saveMasteryStateToStorage({ storage, masteryByVocabId });
  }, [masteryByVocabId]);

  return { masteryByVocabId, setMasteryByVocabId };
};
