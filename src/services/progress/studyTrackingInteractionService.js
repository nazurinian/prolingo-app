import { normalizeMasteryVocabId } from '../../domain/progress/masteryStateDomain.js';
import { resolveStudyActivityUpdate } from '../../domain/progress/studyTrackingDomain.js';

export const executeRecordStudyActivity = ({
  item,
  setActivityByVocabId,
  studiedAt = Date.now()
} = {}) => {
  if (!item?.isStructured || typeof setActivityByVocabId !== 'function') return false;
  const vocabId = normalizeMasteryVocabId(item?.vocabId);
  if (!vocabId) return false;

  setActivityByVocabId((currentMap) =>
    resolveStudyActivityUpdate({ activityByVocabId: currentMap, vocabId, studiedAt }).activityByVocabId
  );
  return true;
};
