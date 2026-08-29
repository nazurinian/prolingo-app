import {
  resolveMasteryState,
  resolveMasteryStateUpdate,
  resolveNextMasteryState
} from '../../domain/progress/masteryStateDomain.js';

export const resolveCycledMasteryStateUpdate = ({
  masteryByVocabId = {},
  vocabId
} = {}) => {
  const currentState = resolveMasteryState(masteryByVocabId, vocabId);
  const nextState = resolveNextMasteryState(currentState);
  return resolveMasteryStateUpdate({ masteryByVocabId, vocabId, nextState });
};

export const executeCycleMasteryState = ({
  vocabId,
  setMasteryByVocabId
} = {}) => {
  if (!String(vocabId ?? '').trim() || typeof setMasteryByVocabId !== 'function') return;

  setMasteryByVocabId((currentMap) =>
    resolveCycledMasteryStateUpdate({
      masteryByVocabId: currentMap,
      vocabId
    }).masteryByVocabId
  );
};
