import { getRecordAudioNo } from '../../utils/audioUtils';
import {
  getMaxAssignedNoFromRecords,
  getNextManualVocabId,
  normalizeVocabId,
} from '../../utils/csvUtils';

export const resolveManualVocabularySaveState = ({
  manualForm,
  manualEditingId,
  currentRecords,
  sequenceHighWater,
  manualIdHighWater,
}) => {
  const editingRecord = manualEditingId ? currentRecords.find(item => item.id === manualEditingId) : null;
  // Audio/sequence number is immutable on edit and monotonic on add. Deleted numbers are never reused.
  const normalizedNo = editingRecord
    ? (getRecordAudioNo(editingRecord) || 1)
    : Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(currentRecords)) + 1;
  const vocabId = normalizeVocabId(
    manualForm.vocabId || (manualEditingId ? manualEditingId : getNextManualVocabId(currentRecords, manualIdHighWater)),
    normalizedNo
  );

  const record = {
    id: vocabId,
    vocabId,
    no: normalizedNo,
    displayId: normalizedNo,
    word: manualForm.word.trim(),
    partOfSpeech: manualForm.partOfSpeech.trim(),
    meaningWord: manualForm.meaningWord.trim(),
    info: manualForm.info.trim(),
    sentence: manualForm.sentence.trim(),
    meaning: manualForm.meaning.trim(),
    exp1En: manualForm.exp1En.trim(), exp1Idn: manualForm.exp1Idn.trim(),
    exp2En: manualForm.exp2En.trim(), exp2Idn: manualForm.exp2Idn.trim(),
    exp3En: manualForm.exp3En.trim(), exp3Idn: manualForm.exp3Idn.trim(),
    exp4En: manualForm.exp4En.trim(), exp4Idn: manualForm.exp4Idn.trim(),
    exp5En: manualForm.exp5En.trim(), exp5Idn: manualForm.exp5Idn.trim(),
    isStructured: true
  };

  let nextRecords;
  if (manualEditingId) {
    if (manualEditingId !== vocabId && currentRecords.some(item => item.id === vocabId)) {
      return { status: 'duplicate', vocabId, normalizedNo, record, nextRecords: null };
    }
    nextRecords = currentRecords.map(item => item.id === manualEditingId ? record : item);
  } else {
    if (currentRecords.some(item => item.id === vocabId)) {
      return { status: 'duplicate', vocabId, normalizedNo, record, nextRecords: null };
    }
    nextRecords = [...currentRecords, record];
  }

  nextRecords = nextRecords
    .map((item, idx) => ({ ...item, no: Number(item.no || item.displayId) || idx + 1 }))
    .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));

  return { status: 'ok', vocabId, normalizedNo, record, nextRecords };
};
