import { getRecordAudioNo } from '../../utils/audioUtils';

export const resolveSingleChangeRevertState = ({
  baselineRecords = [],
  currentRecords = [],
  id,
  type
} = {}) => {
  const baselineItem = baselineRecords.find(item => item.id === id);
  let nextRecords = [...currentRecords];
  let shouldRemoveFromStudyQueue = false;

  if (type === 'added') {
    nextRecords = nextRecords.filter(item => item.id !== id);
    shouldRemoveFromStudyQueue = true;
  } else if (type === 'modified' && baselineItem) {
    nextRecords = nextRecords.map(item => item.id === id ? baselineItem : item);
  } else if (type === 'deleted' && baselineItem) {
    const hasConflict = nextRecords.some(item =>
      getRecordAudioNo(item) === getRecordAudioNo(baselineItem) || item.id === baselineItem.id
    );
    if (hasConflict) {
      return {
        status: 'conflict',
        baselineItem,
        nextRecords,
        shouldRemoveFromStudyQueue
      };
    }
    nextRecords.push(baselineItem);
  }

  nextRecords.sort((a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0));

  return {
    status: 'ok',
    baselineItem,
    nextRecords,
    shouldRemoveFromStudyQueue
  };
};
