import { V510_SOURCE_KEYS } from '../../constants/datasetConstants';
import { getAdvancedExpressionPairs } from '../../utils/audioUtils';
import { parseTableRecords } from '../../utils/csvUtils';
import { getSourceChangeSummary } from '../../utils/multiSourceUtils';
import { getPlaybackListSignature, reorderPlaybackListByIds } from '../../utils/playbackSequenceUtils';

export const resolveSourceChangeSummaries = ({ sourcePack, tableContent }) => {
      const currentRecords = parseTableRecords(tableContent);
      const summaries = {};
      V510_SOURCE_KEYS.forEach(key => {
          summaries[key] = sourcePack[key]?.baselineContent
              ? getSourceChangeSummary(key, sourcePack[key].baselineContent, currentRecords, sourcePack)
              : { added: 0, modified: 0, deleted: 0, total: 0, isDirty: false };
      });
      return summaries;
};

export const resolveAdvancedDatasetStats = ({ playlist }) => {
      const structured = playlist.filter(item => item.isStructured);
      const expCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let withInfo = 0;
      structured.forEach(item => {
          if (String(item.info || '').trim()) withInfo++;
          getAdvancedExpressionPairs(item).forEach(pair => {
              if (pair.en.trim() || pair.idn.trim()) expCounts[pair.number]++;
          });
      });
      return {
          withInfo,
          expCounts,
          totalExpressions: Object.values(expCounts).reduce((sum, count) => sum + count, 0),
          hasAdvanced: withInfo > 0 || Object.values(expCounts).some(Boolean)
      };
};

export const resolveMasterFilteredPlaylist = ({ playlist, masterFilter, csvChangeSummary, masterSearch }) => {
      let items = playlist.filter(item => item.isStructured);
      if (masterFilter === 'csv') items = items.filter(item => !String(item.vocabId || item.id || '').toUpperCase().startsWith('USR_'));
      else if (masterFilter === 'manual') items = items.filter(item => String(item.vocabId || item.id || '').toUpperCase().startsWith('USR_'));
      else if (masterFilter === 'added') items = items.filter(item => csvChangeSummary.byId[item.id] === 'added');
      else if (masterFilter === 'modified') items = items.filter(item => csvChangeSummary.byId[item.id] === 'modified');

      const query = masterSearch.trim().toLowerCase();
      if (!query) return items;
      return items.filter(item => [
          item.displayId, item.no, item.vocabId, item.id, item.word, item.partOfSpeech,
          item.meaningWord, item.meaning, item.info, item.sentence,
          item.exp1En, item.exp1Idn, item.exp2En, item.exp2Idn, item.exp3En, item.exp3Idn,
          item.exp4En, item.exp4Idn, item.exp5En, item.exp5Idn
      ].some(value => String(value ?? '').toLowerCase().includes(query)));
};

export const resolveCurrentPlayerList = ({ mode, playlist, tableViewMode, studyQueueSet, masterFilteredPlaylist }) => {
      if (mode === 'text') return playlist;
      if (mode === 'table') {
         if (tableViewMode === 'study') return playlist.filter(item => studyQueueSet.has(item.id));
         return masterFilteredPlaylist;
      }
      return playlist;
};

export const resolveActivePlaybackList = ({ playingContext, playlist, studyQueueSet, masterFilteredPlaylist, vocabularyPlayOrder, activeVocabularyOrder }) => {
      if (!playingContext) return [];
      const baseList = playingContext === 'text'
        ? playlist
        : (playingContext === 'study' ? playlist.filter(item => studyQueueSet.has(item.id)) : masterFilteredPlaylist);
      if (vocabularyPlayOrder !== 'shuffle') return baseList;
      const signature = getPlaybackListSignature(baseList);
      if (activeVocabularyOrder.context !== playingContext || activeVocabularyOrder.signature !== signature) return baseList;
      return reorderPlaybackListByIds(baseList, activeVocabularyOrder.ids);
};
