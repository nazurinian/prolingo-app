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

export const useStudyTrackingState = ({ sessionOnly = false } = {}) => {
  const [activityByVocabId, setActivityByVocabId] = useState(() => sessionOnly ? {} : loadInitialStudyActivity());

  useEffect(() => {
    if (sessionOnly) return;
    const storage = resolveBrowserLocalStorage();
    if (!storage) return;
    saveStudyTrackingToStorage({ storage, activityByVocabId });
  }, [activityByVocabId, sessionOnly]);

  return { activityByVocabId, setActivityByVocabId };
};
