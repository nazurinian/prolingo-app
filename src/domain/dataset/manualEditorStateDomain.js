import { createEmptyManualForm, getMaxAssignedNoFromRecords, getNextManualVocabId } from '../../utils/csvUtils';

export const resolveManualAddNextNo = (records, sequenceHighWater) =>
  Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)) + 1;

export const resolveManualAddForm = (records, manualIdHighWater, nextNo) => ({
  ...createEmptyManualForm(),
  vocabId: getNextManualVocabId(records, manualIdHighWater),
  no: nextNo
});

export const resolveManualEditAdvancedOpen = (item) => Boolean(
  item.exp1En || item.exp1Idn || item.exp2En || item.exp2Idn || item.exp3En || item.exp3Idn ||
  item.exp4En || item.exp4Idn || item.exp5En || item.exp5Idn
);

export const resolveManualEditForm = (item) => ({
  ...createEmptyManualForm(),
  vocabId: item.vocabId || item.id || '',
  no: item.no ?? item.displayId ?? '',
  word: item.word || '',
  partOfSpeech: item.partOfSpeech || '',
  meaningWord: item.meaningWord || '',
  info: item.info || '',
  sentence: item.sentence || '',
  meaning: item.meaning || '',
  exp1En: item.exp1En || '', exp1Idn: item.exp1Idn || '',
  exp2En: item.exp2En || '', exp2Idn: item.exp2Idn || '',
  exp3En: item.exp3En || '', exp3Idn: item.exp3Idn || '',
  exp4En: item.exp4En || '', exp4Idn: item.exp4Idn || '',
  exp5En: item.exp5En || '', exp5Idn: item.exp5Idn || ''
});
