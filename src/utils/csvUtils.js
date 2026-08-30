// --- CSV PARSING, SERIALIZATION, VALIDATION & DIFFING UTILITIES ---
import { V58_CANONICAL_HEADERS } from '../constants/datasetConstants';
import { getRecordAudioNo, getVocabIdentity } from './audioUtils';

export const normalizeHeaderKey = (value = '') =>
  String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const detectDelimiter = (input = '') => {
  const firstLine = String(input).split(/\r?\n/).find(line => line.trim()) || '';
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && Object.prototype.hasOwnProperty.call(counts, ch)) {
      counts[ch]++;
    }
  }
  if (counts['\t'] > 0) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
};

export const parseDelimitedText = (input = '') => {
  const source = String(input || '');
  if (!source.trim()) return [];
  const delimiter = detectDelimiter(source);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (inQuotes && source[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) { pushField(); continue; }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      pushRow();
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
};

export const csvEscape = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

export const normalizeVocabId = (value, fallbackNo) => {
  const raw = String(value || '').trim();
  if (raw) return raw.replace(/\s+/g, '_').toUpperCase();
  return `LEGACY_${String(fallbackNo || 1).padStart(4, '0')}`;
};

export const parseTableRecords = (input = '') => {
  const rows = parseDelimitedText(input);
  if (!rows.length) return [];

  const headerKeys = rows[0].map(normalizeHeaderKey);
  const knownHeaders = new Set([
    'VOCABID', 'ID', 'NO', 'NUMBER', 'WORDS', 'WORD', 'PARTOFSPEECH', 'POS',
    'MEANING', 'INFO', 'EN', 'ENGLISH', 'IDN', 'INDONESIAN', 'SENTENCE',
    'TRANSLATION', 'EXP1EN', 'EXP1IDN', 'EXP2EN', 'EXP2IDN', 'EXP3EN', 'EXP3IDN',
    'EXP4EN', 'EXP4IDN', 'EXP5EN', 'EXP5IDN'
  ]);
  const headerScore = headerKeys.filter(h => knownHeaders.has(h)).length;
  const hasHeader = headerScore >= 2 ||
    (headerKeys.length > 0 && ['NO', 'NUMBER', 'ID', 'VOCABID', 'WORD', 'WORDS'].includes(headerKeys[0]));

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const findHeader = (...aliases) => {
    for (const alias of aliases) {
      const idx = headerKeys.indexOf(normalizeHeaderKey(alias));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const getCell = (row, idx) => idx >= 0 ? String(row[idx] ?? '').trim() : '';

  return dataRows.map((rawRow, index) => {
    const row = rawRow.map(cell => String(cell ?? '').trim());
    if (!row.some(Boolean)) return null;

    let vocabId = '';
    let no = index + 1;
    let word = '';
    let partOfSpeech = '';
    let meaningWord = '';
    let info = '';
    let sentence = '';
    let meaning = '';
    let exp1En = '', exp1Idn = '', exp2En = '', exp2Idn = '', exp3En = '', exp3Idn = '';
    let exp4En = '', exp4Idn = '', exp5En = '', exp5Idn = '';

    if (hasHeader) {
      const vocabIdx = findHeader('VOCAB_ID', 'VOCABID');
      const idIdx = findHeader('ID');
      const noIdx = findHeader('NO', 'NUMBER');
      const wordIdx = findHeader('WORDS', 'WORD');
      const posIdx = findHeader('PART OF SPEECH', 'POS');
      const infoIdx = findHeader('INFO');
      const enIdx = findHeader('EN', 'ENGLISH');
      const idnIdx = findHeader('IDN', 'INDONESIAN');
      const sentenceIdx = findHeader('SENTENCE');
      const translationIdx = findHeader('TRANSLATION');
      const meaningIdx = findHeader('MEANING');
      const meaningIndices = headerKeys.reduce((acc, key, idx) => { if (key === 'MEANING') acc.push(idx); return acc; }, []);

      const noRaw = getCell(row, noIdx);
      const parsedNo = Number.parseInt(noRaw, 10);
      no = Number.isFinite(parsedNo) ? parsedNo : index + 1;

      vocabId = getCell(row, vocabIdx);
      if (!vocabId && idIdx >= 0) {
        const candidateId = getCell(row, idIdx);
        if (candidateId && !/^\d+$/.test(candidateId)) vocabId = candidateId;
      }

      word = getCell(row, wordIdx);
      partOfSpeech = getCell(row, posIdx);
      info = getCell(row, infoIdx);

      const hasAdvancedPair = enIdx >= 0 || idnIdx >= 0;
      if (hasAdvancedPair) {
        meaningWord = getCell(row, meaningIdx);
        sentence = getCell(row, enIdx);
        meaning = getCell(row, idnIdx);
      } else {
        sentence = getCell(row, sentenceIdx);
        if (sentenceIdx >= 0 && meaningIndices.length >= 2) {
          meaningWord = getCell(row, meaningIndices[0]);
          meaning = getCell(row, meaningIndices[meaningIndices.length - 1]);
        } else {
          meaning = getCell(row, translationIdx >= 0 ? translationIdx : meaningIdx);
        }
      }

      exp1En = getCell(row, findHeader('EXP1_EN')); exp1Idn = getCell(row, findHeader('EXP1_IDN'));
      exp2En = getCell(row, findHeader('EXP2_EN')); exp2Idn = getCell(row, findHeader('EXP2_IDN'));
      exp3En = getCell(row, findHeader('EXP3_EN')); exp3Idn = getCell(row, findHeader('EXP3_IDN'));
      exp4En = getCell(row, findHeader('EXP4_EN')); exp4Idn = getCell(row, findHeader('EXP4_IDN'));
      exp5En = getCell(row, findHeader('EXP5_EN')); exp5Idn = getCell(row, findHeader('EXP5_IDN'));
    } else {
      if (row.length >= 8 && !/^\d+$/.test(row[0] || '')) {
        vocabId = row[0] || '';
        const parsedNo = Number.parseInt(row[1], 10);
        no = Number.isFinite(parsedNo) ? parsedNo : index + 1;
        word = row[2] || '';
        partOfSpeech = row[3] || '';
        meaningWord = row[4] || '';
        info = row[5] || '';
        sentence = row[6] || '';
        meaning = row[7] || '';
      } else if (row.length >= 6) {
        const parsedNo = Number.parseInt(row[0], 10);
        no = Number.isFinite(parsedNo) ? parsedNo : index + 1;
        word = row[1] || '';
        partOfSpeech = row[2] || '';
        meaningWord = row[3] || '';
        sentence = row[4] || '';
        meaning = row[5] || '';
      } else if (/^\d+$/.test(row[0] || '')) {
        no = Number.parseInt(row[0], 10) || index + 1;
        word = row[1] || '';
        sentence = row[2] || '';
        meaning = row[3] || '';
      } else {
        word = row[0] || '';
        sentence = row[1] || '';
        meaning = row[2] || '';
      }
    }

    if (!word.trim()) return null;
    vocabId = normalizeVocabId(vocabId, no);

    return {
      id: vocabId, vocabId, no, displayId: no,
      word, partOfSpeech, meaningWord, info, sentence, meaning,
      exp1En, exp1Idn, exp2En, exp2Idn, exp3En, exp3Idn, exp4En, exp4Idn, exp5En, exp5Idn,
      fullText: `${word}. ${sentence}`.trim(), isStructured: true
    };
  }).filter(Boolean);
};

export const serializeTableRecords = (records = []) => {
  const lines = [V58_CANONICAL_HEADERS.map(csvEscape).join(',')];
  records.forEach((item, idx) => {
    const no = Number.isFinite(Number(item.no ?? item.displayId)) ? Number(item.no ?? item.displayId) : idx + 1;
    const values = [
      item.vocabId || item.id || normalizeVocabId('', no), no, item.word || '', item.partOfSpeech || '',
      item.meaningWord || '', item.info || '', item.sentence || '', item.meaning || '',
      item.exp1En || '', item.exp1Idn || '', item.exp2En || '', item.exp2Idn || '',
      item.exp3En || '', item.exp3Idn || '', item.exp4En || '', item.exp4Idn || '', item.exp5En || '', item.exp5Idn || ''
    ];
    lines.push(values.map(csvEscape).join(','));
  });
  return lines.join('\n');
};

export const createEmptyManualForm = () => ({
  vocabId: '', no: '', word: '', partOfSpeech: '', meaningWord: '', info: '', sentence: '', meaning: '',
  exp1En: '', exp1Idn: '', exp2En: '', exp2Idn: '', exp3En: '', exp3Idn: '', exp4En: '', exp4Idn: '', exp5En: '', exp5Idn: ''
});

export const getRecordSignature = (item = {}) => JSON.stringify([
  String(item.vocabId || item.id || '').trim().toUpperCase(),
  Number(item.no ?? item.displayId) || 0,
  item.word || '', item.partOfSpeech || '', item.meaningWord || '', item.info || '',
  item.sentence || '', item.meaning || '',
  item.exp1En || '', item.exp1Idn || '', item.exp2En || '', item.exp2Idn || '',
  item.exp3En || '', item.exp3Idn || '', item.exp4En || '', item.exp4Idn || '', item.exp5En || '', item.exp5Idn || ''
]);

export const canonicalizeTableContent = (content = '') => {
  const records = parseTableRecords(content)
    .sort((a, b) => (Number(a.no ?? a.displayId) || 0) - (Number(b.no ?? b.displayId) || 0));
  return records.length ? serializeTableRecords(records) : '';
};

export const getTableChangeSummary = (baselineContent = '', currentContent = '') => {
  const baselineRecords = parseTableRecords(baselineContent);
  const currentRecords = parseTableRecords(currentContent);
  const before = new Map(baselineRecords.map(item => [String(item.id), item]));
  const after = new Map(currentRecords.map(item => [String(item.id), item]));
  const byId = {};
  const addedItems = [];
  const modifiedItems = [];
  const deletedItems = [];
  let added = 0;
  let modified = 0;
  let deleted = 0;

  after.forEach((item, id) => {
    if (!before.has(id)) {
      added += 1;
      byId[id] = 'added';
      addedItems.push(item);
      return;
    }
    if (getRecordSignature(before.get(id)) !== getRecordSignature(item)) {
      modified += 1;
      byId[id] = 'modified';
      modifiedItems.push({ before: before.get(id), after: item });
    }
  });
  before.forEach((item, id) => {
    if (!after.has(id)) {
      deleted += 1;
      deletedItems.push(item);
    }
  });

  const sortByNo = (a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0);
  addedItems.sort(sortByNo);
  deletedItems.sort(sortByNo);
  modifiedItems.sort((a, b) => sortByNo(a.after, b.after));

  const total = added + modified + deleted;
  return { added, modified, deleted, total, isDirty: total > 0, byId, addedItems, modifiedItems, deletedItems };
};

export const getMaxManualIdFromRecords = (records = []) => {
  let max = 0;
  records.forEach(item => {
    const match = String(item.vocabId || item.id || '').match(/^USR_(\d+)$/i);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10) || 0);
  });
  return max;
};

export const getNextManualVocabId = (records = [], floor = 0) => {
  const max = Math.max(Number(floor) || 0, getMaxManualIdFromRecords(records));
  return `USR_${String(max + 1).padStart(6, '0')}`;
};

export const getMaxAssignedNoFromRecords = (records = []) =>
  records.reduce((max, item) => Math.max(max, getRecordAudioNo(item) || 0), 0);

export const validateTableRecords = (records = []) => {
  const errors = [];
  const ids = new Map();
  const audioNos = new Map();

  records.forEach((item, index) => {
    const rowLabel = `Row ${index + 1}`;
    const vocabId = String(item?.vocabId || item?.id || '').trim().toUpperCase();
    const audioNo = getRecordAudioNo(item);
    const word = String(item?.word || '').trim();

    if (!word) errors.push(`${rowLabel}: WORDS kosong.`);
    if (!vocabId) {
      errors.push(`${rowLabel}: VOCAB_ID kosong.`);
    } else if (ids.has(vocabId)) {
      errors.push(`${rowLabel}: VOCAB_ID ${vocabId} duplikat dengan row ${ids.get(vocabId)}.`);
    } else {
      ids.set(vocabId, index + 1);
    }

    if (!audioNo) {
      errors.push(`${rowLabel}: NO/AUDIO SLOT tidak valid.`);
    } else if (audioNos.has(audioNo)) {
      errors.push(`${rowLabel}: NO/AUDIO SLOT #${audioNo} duplikat dengan row ${audioNos.get(audioNo)}.`);
    } else {
      audioNos.set(audioNo, index + 1);
    }
  });

  return { isValid: errors.length === 0, errors };
};
