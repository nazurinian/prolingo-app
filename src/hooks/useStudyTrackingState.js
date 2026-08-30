import { useEffect, useState } from 'react';
import { createEmptyStudyActivityMap } from '../domain/progress/studyTrackingDomain.js';
import {
  loadStudyTrackingFromStorage,
  saveStudyTrackingToStorage
} from '../services/progress/studyTrackingPersistenceService.js';

const resolveBrowserLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
};

const loadInitialStudyActivity = () => {
  const storage = resolveBrowserLocalStorage();
  if (!storage) return createEmptyStudyActivityMap();
  return loadStudyTrackingFromStorage({ storage }).activityByVocabId;
};

export const useStudyTrackingState = () => {
  const [activityByVocabId, setActivityByVocabId] = useState(loadInitialStudyActivity);

  useEffect(() => {
    const storage = resolveBrowserLocalStorage();
    if (!storage) return;
    saveStudyTrackingToStorage({ storage, activityByVocabId });
  }, [activityByVocabId]);

  return { activityByVocabId, setActivityByVocabId };
};
