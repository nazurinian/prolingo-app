// --- MULTI-SOURCE DATASET & JOIN ENGINE UTILITIES ---
import { V510_SOURCE_KEYS, V510_SOURCE_LABELS } from '../constants/datasetConstants';
import { 
  parseDelimitedText, 
  parseTableRecords, 
  normalizeHeaderKey, 
  normalizeVocabId, 
  csvEscape,
  canonicalizeTableContent,
  serializeTableRecords,
  getMaxAssignedNoFromRecords,
  getMaxManualIdFromRecords
} from './csvUtils';
import { getVocabIdentity, getRecordAudioNo } from './audioUtils';

export const detectV510SourceKey = (filename = '', content = '') => {
  const name = String(filename || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  for (let n = 1; n <= 5; n++) {
    if (new RegExp(`(^|_)EXP${n}($|_)`).test(name)) return `exp${n}`;
  }
  if (/(^|_)SENTENCE($|_)/.test(name) || /(^|_)SENT($|_)/.test(name)) return 'sentence';
  if (/(^|_)MAIN($|_)/.test(name) || /(^|_)CORE($|_)/.test(name)) return 'main';

  const rows = parseDelimitedText(content);
  if (!rows.length) return null;
  const headers = new Set(rows[0].map(normalizeHeaderKey));
  if ((headers.has('WORDS') || headers.has('WORD')) && headers.has('MEANING') && (headers.has('VOCABID') || headers.has('NO'))) return 'main';
  for (let n = 1; n <= 5; n++) {
    if (headers.has(`EXP${n}EN`) || headers.has(`EXP${n}IDN`)) return `exp${n}`;
  }
  if (headers.has('VOCABID') && (headers.has('SENTENCE') || headers.has('SENTENCEEN'))) return 'sentence';
  return null;
};

export const readV510FileText = (file) => {
  if (file?.text) return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(String(e.target?.result || ''));
    reader.onerror = () => reject(reader.error || new Error(`Cannot read ${file?.name || 'file'}`));
    reader.readAsText(file);
  });
};

export const createEmptySourcePack = () => Object.fromEntries(V510_SOURCE_KEYS.map(key => [key, null]));

export const parseLayerSourceRecords = (content = '', sourceKey = 'sentence') => {
  if (sourceKey === 'main') return parseTableRecords(content);
  const rows = parseDelimitedText(content);
  if (!rows.length) return [];
  const headerKeys = rows[0].map(normalizeHeaderKey);
  const vocabAliases = ['VOCABID', 'ID'];
  const sourceNum = String(sourceKey).match(/^exp([1-5])$/i)?.[1] || '';
  const enAliases = sourceKey === 'sentence'
    ? ['EN', 'ENGLISH', 'SENTENCE']
    : ['EN', 'ENGLISH', `EXP${sourceNum}EN`];
  const idnAliases = sourceKey === 'sentence'
    ? ['IDN', 'INDONESIAN', 'TRANSLATION', 'MEANING']
    : ['IDN', 'INDONESIAN', `EXP${sourceNum}IDN`, 'TRANSLATION'];
  const findIdx = (aliases) => aliases.map(normalizeHeaderKey).map(key => headerKeys.indexOf(key)).find(idx => idx >= 0) ?? -1;
  const vocabIdx = findIdx(vocabAliases);
  const enIdx = findIdx(enAliases);
  const idnIdx = findIdx(idnAliases);
  const hasHeader = vocabIdx >= 0 && (enIdx >= 0 || idnIdx >= 0);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((row, index) => {
    const cells = row.map(cell => String(cell ?? '').trim());
    if (!cells.some(Boolean)) return null;
    const vocabId = normalizeVocabId(hasHeader ? cells[vocabIdx] : cells[0], index + 1);
    const en = hasHeader ? (enIdx >= 0 ? cells[enIdx] || '' : '') : (cells[1] || '');
    const idn = hasHeader ? (idnIdx >= 0 ? cells[idnIdx] || '' : '') : (cells[2] || '');
    return { id: vocabId, vocabId, en, idn };
  }).filter(Boolean);
};

export const getDuplicateSourceIds = (records = []) => {
  const seen = new Set();
  const duplicates = new Set();
  records.forEach(item => {
    const id = getVocabIdentity(item);
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  });
  return Array.from(duplicates);
};

export const serializeMainSourceRecords = (records = [], sourcePack = null) => {
  const headers = ['VOCAB_ID', 'NO', 'WORDS', 'PART OF SPEECH', 'MEANING', 'INFO', 'EN', 'IDN'];
  const preserveSentenceFromBaseline = Boolean(sourcePack?.sentence && sourcePack?.main?.baselineContent);
  const baselineMap = preserveSentenceFromBaseline
    ? new Map(parseTableRecords(sourcePack.main.baselineContent).map(item => [getVocabIdentity(item), item]))
    : new Map();
  const lines = [headers.map(csvEscape).join(',')];
  [...records].sort((a,b) => (getRecordAudioNo(a)||0) - (getRecordAudioNo(b)||0)).forEach((item, index) => {
    const no = getRecordAudioNo(item) || index + 1;
    const baselineItem = baselineMap.get(getVocabIdentity(item));
    const en = preserveSentenceFromBaseline ? (baselineItem?.sentence || '') : (item.sentence || '');
    const idn = preserveSentenceFromBaseline ? (baselineItem?.meaning || '') : (item.meaning || '');
    lines.push([item.vocabId || item.id, no, item.word || '', item.partOfSpeech || '', item.meaningWord || '', item.info || '', en, idn].map(csvEscape).join(','));
  });
  return lines.join('\n');
};

export const serializeLayerSourceRecords = (records = [], sourceKey = 'sentence', sourcePack = null) => {
  const lines = [['VOCAB_ID', 'EN', 'IDN'].map(csvEscape).join(',')];
  const expNo = String(sourceKey).match(/^exp([1-5])$/i)?.[1] || '';
  const baselineRecords = sourcePack?.[sourceKey]?.baselineContent
    ? parseLayerSourceRecords(sourcePack[sourceKey].baselineContent, sourceKey)
    : [];
  const baselineIds = new Set(baselineRecords.map(getVocabIdentity));
  const mainBaselineIds = new Set(
    sourcePack?.main?.baselineContent ? parseTableRecords(sourcePack.main.baselineContent).map(getVocabIdentity) : []
  );
  const emitted = new Set();
  [...records].sort((a,b) => (getRecordAudioNo(a)||0) - (getRecordAudioNo(b)||0)).forEach(item => {
    let en = '', idn = '';
    if (sourceKey === 'sentence') { en = item.sentence || ''; idn = item.meaning || ''; }
    else { en = item[`exp${expNo}En`] || ''; idn = item[`exp${expNo}Idn`] || ''; }
    const id = getVocabIdentity(item);
    // Preserve sparse source files: absent + blank rows do not become artificial additions.
    if (!baselineIds.has(id) && !String(en).trim() && !String(idn).trim()) return;
    lines.push([item.vocabId || item.id, en, idn].map(csvEscape).join(','));
    emitted.add(id);
  });
  // Orphans are diagnostic data, not implicit deletions. Preserve them unchanged on save.
  baselineRecords.forEach(item => {
    const id = getVocabIdentity(item);
    if (emitted.has(id) || mainBaselineIds.has(id)) return;
    lines.push([item.vocabId || item.id, item.en || '', item.idn || ''].map(csvEscape).join(','));
  });
  return lines.join('\n');
};

export const serializeSourceFromMerged = (records = [], sourceKey = 'main', sourcePack = null) =>
  sourceKey === 'main' ? serializeMainSourceRecords(records, sourcePack) : serializeLayerSourceRecords(records, sourceKey, sourcePack);

export const mergeSourcePackBaselines = (sourcePack = {}) => {
  const mainEntry = sourcePack?.main;
  if (!mainEntry?.baselineContent) return [];
  let merged = parseTableRecords(mainEntry.baselineContent).map(item => ({ ...item }));
  const byId = new Map(merged.map(item => [getVocabIdentity(item), item]));
  const overlay = (key) => {
    const entry = sourcePack?.[key];
    if (!entry?.baselineContent) return;
    parseLayerSourceRecords(entry.baselineContent, key).forEach(layer => {
      const target = byId.get(getVocabIdentity(layer));
      if (!target) return;
      if (key === 'sentence') { target.sentence = layer.en; target.meaning = layer.idn; }
      else {
        const n = key.replace('exp','');
        target[`exp${n}En`] = layer.en;
        target[`exp${n}Idn`] = layer.idn;
      }
      target.fullText = `${target.word}. ${target.sentence}`.trim();
    });
  };
  ['sentence','exp1','exp2','exp3','exp4','exp5'].forEach(overlay);
  return merged.sort((a,b) => (getRecordAudioNo(a)||0) - (getRecordAudioNo(b)||0));
};

export const getSourceDiagnostics = (sourcePack = {}) => {
  const mainRecords = sourcePack?.main?.baselineContent ? parseTableRecords(sourcePack.main.baselineContent) : [];
  const mainIds = new Set(mainRecords.map(getVocabIdentity));
  const result = {};
  V510_SOURCE_KEYS.forEach(key => {
    const entry = sourcePack?.[key];
    if (!entry?.baselineContent) { result[key] = { loaded: false, rows: 0, matched: 0, missing: mainRecords.length, orphan: 0, duplicates: [] }; return; }
    const records = key === 'main' ? parseTableRecords(entry.baselineContent) : parseLayerSourceRecords(entry.baselineContent, key);
    const duplicates = getDuplicateSourceIds(records);
    if (key === 'main') {
      result[key] = { loaded: true, rows: records.length, matched: records.length, missing: 0, orphan: 0, duplicates };
      return;
    }
    const ids = new Set(records.map(getVocabIdentity));
    const matched = Array.from(ids).filter(id => mainIds.has(id)).length;
    const orphan = Array.from(ids).filter(id => !mainIds.has(id)).length;
    const missing = Array.from(mainIds).filter(id => !ids.has(id)).length;
    result[key] = { loaded: true, rows: records.length, matched, missing, orphan, duplicates };
  });
  return result;
};

export const getSourceChangeSummary = (sourceKey, baselineContent = '', currentRecords = [], sourcePack = null) => {
  if (!baselineContent) return { added: 0, modified: 0, deleted: 0, total: 0, isDirty: false };
  const beforeRecords = sourceKey === 'main' ? parseTableRecords(baselineContent) : parseLayerSourceRecords(baselineContent, sourceKey);
  const before = new Map(beforeRecords.map(item => [getVocabIdentity(item), item]));
  const baselineIds = new Set(beforeRecords.map(getVocabIdentity));
  const mainBaselineIds = new Set(
    sourcePack?.main?.baselineContent ? parseTableRecords(sourcePack.main.baselineContent).map(getVocabIdentity) : []
  );
  const afterRecords = currentRecords.map(item => {
    if (sourceKey === 'main') return item;
    const n = sourceKey.replace('exp','');
    return sourceKey === 'sentence'
      ? { id: item.id, vocabId: item.vocabId, en: item.sentence || '', idn: item.meaning || '' }
      : { id: item.id, vocabId: item.vocabId, en: item[`exp${n}En`] || '', idn: item[`exp${n}Idn`] || '' };
  }).filter(item => sourceKey === 'main' || baselineIds.has(getVocabIdentity(item)) || String(item.en || '').trim() || String(item.idn || '').trim());
  
  if (sourceKey !== 'main') {
    const currentIds = new Set(afterRecords.map(getVocabIdentity));
    beforeRecords.forEach(item => {
      const id = getVocabIdentity(item);
      if (!currentIds.has(id) && !mainBaselineIds.has(id)) afterRecords.push(item);
    });
  }
  const after = new Map(afterRecords.map(item => [getVocabIdentity(item), item]));
  const mainSentenceOwnedElsewhere = sourceKey === 'main' && Boolean(sourcePack?.sentence);
  const sig = (item) => {
    if (!item) return '';
    if (sourceKey === 'main') return JSON.stringify([
      getVocabIdentity(item), getRecordAudioNo(item), item.word || '', item.partOfSpeech || '', item.meaningWord || '', item.info || '',
      mainSentenceOwnedElsewhere ? '' : (item.sentence || ''), mainSentenceOwnedElsewhere ? '' : (item.meaning || '')
    ]);
    return JSON.stringify([getVocabIdentity(item), item.en || '', item.idn || '']);
  };
  let added = 0, modified = 0, deleted = 0;
  after.forEach((item,id) => { if (!before.has(id)) added++; else if (sig(before.get(id)) !== sig(item)) modified++; });
  before.forEach((item,id) => { if (!after.has(id)) deleted++; });
  const total = added + modified + deleted;
  return { added, modified, deleted, total, isDirty: total > 0 };
};

export const normalizeSourcePack = (sources) => {
  const empty = createEmptySourcePack();
  if (!sources || typeof sources !== 'object') return empty;
  V510_SOURCE_KEYS.forEach(key => {
    const entry = sources[key];
    if (entry?.baselineContent) empty[key] = {
      filename: String(entry.filename || `${V510_SOURCE_LABELS[key]}.csv`),
      baselineContent: String(entry.baselineContent),
      loadedAt: Number(entry.loadedAt) || Date.now()
    };
  });
  return empty;
};

export const normalizeDeckEntry = (entry) => {
  if (typeof entry === 'string') {
    const records = parseTableRecords(entry);
    const baselineContent = canonicalizeTableContent(entry);
    return {
      content: entry,
      baselineContent,
      sources: createEmptySourcePack(),
      meta: {
        maxAssignedNo: getMaxAssignedNoFromRecords(records),
        maxManualId: getMaxManualIdFromRecords(records),
        importedRowCount: records.length
      }
    };
  }
  const content = String(entry?.content || '');
  const records = parseTableRecords(content);
  const baselineContent = typeof entry?.baselineContent === 'string'
    ? entry.baselineContent
    : canonicalizeTableContent(content);
  return {
    content,
    baselineContent,
    sources: normalizeSourcePack(entry?.sources),
    meta: {
      maxAssignedNo: Math.max(Number(entry?.meta?.maxAssignedNo) || 0, getMaxAssignedNoFromRecords(records)),
      maxManualId: Math.max(Number(entry?.meta?.maxManualId) || 0, getMaxManualIdFromRecords(records)),
      importedRowCount: Number(entry?.meta?.importedRowCount) || records.length
    }
  };
};
