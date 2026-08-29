/* ProLingo v5.11.6 - UI Navigation Shell */
/* eslint-disable no-control-regex */
// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useRef, memo, useMemo, useCallback, useLayoutEffect } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, Settings, Trash2, List, Mic, Globe, 
  CheckCircle, Save, Upload, Table, SkipBack, SkipForward, X, 
  Wand2, Download, Loader2, FolderOpen, Database, Shuffle, Repeat, Repeat1, FileText,
  ToggleLeft, ToggleRight, AlertCircle, PanelLeftClose, PanelLeftOpen, Lock, Unlock,
  Hash, Music, Bot, AlertTriangle, Terminal, XCircle, ChevronDown, Layers, Smartphone,
  Monitor, Cpu, CheckSquare, Square, ChevronRight, MoreHorizontal, ArrowRightToLine,
  Languages, Eye, EyeOff, Brain, BookOpen, Plus, Send, ListPlus, MinusCircle, Eraser,
  ChevronsUp, MoreVertical, LayoutTemplate, Moon, Sun, Laptop, ArrowRight, Server, CloudLightning,
  Edit3, FileDown, Search, History
} from 'lucide-react';

// --- SYSTEM ENVIRONMENT VAR ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 

// --- VIRTUALIZATION CONSTANTS ---
const DEFAULT_ROW_HEIGHT_PC = 160; 
const DEFAULT_ROW_HEIGHT_MOBILE = 205; 
const OVERSCAN = 20;

// --- UTILITIES ---
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const encodeWAV = (samples, sampleRate = 24000) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  const length = samples.length;
  for (let i = 0; i < length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }
  return view;
};

const base64ToInt16Array = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Int16Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
  }
  return bytes;
};

const sanitizeFilename = (name) => {
  if (!name) return 'audio';
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
};

const triggerBrowserDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- v5.8 DATA FOUNDATION UTILITIES ---
const V58_CANONICAL_HEADERS = [
  'VOCAB_ID', 'NO', 'WORDS', 'PART OF SPEECH', 'MEANING', 'INFO', 'EN', 'IDN',
  'EXP1_EN', 'EXP1_IDN', 'EXP2_EN', 'EXP2_IDN', 'EXP3_EN', 'EXP3_IDN',
  'EXP4_EN', 'EXP4_IDN', 'EXP5_EN', 'EXP5_IDN'
];

// --- v5.11.6 LEARNING PLAYBACK SEQUENCE + PER-PART REPEAT ---
const V511_PLAYBACK_PARTS = [
  { key: 'word_en', label: 'Word EN', shortLabel: 'WORD EN', language: 'EN', defaultEnabled: true },
  { key: 'word_idn', label: 'Word IDN', shortLabel: 'WORD IDN', language: 'IDN', defaultEnabled: false },
  { key: 'sentence_en', label: 'Sentence EN', shortLabel: 'SENT EN', language: 'EN', defaultEnabled: true },
  { key: 'sentence_idn', label: 'Sentence IDN', shortLabel: 'SENT IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp1_en', label: 'EXP1 EN', shortLabel: 'E1 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp1_idn', label: 'EXP1 IDN', shortLabel: 'E1 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp2_en', label: 'EXP2 EN', shortLabel: 'E2 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp2_idn', label: 'EXP2 IDN', shortLabel: 'E2 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp3_en', label: 'EXP3 EN', shortLabel: 'E3 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp3_idn', label: 'EXP3 IDN', shortLabel: 'E3 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp4_en', label: 'EXP4 EN', shortLabel: 'E4 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp4_idn', label: 'EXP4 IDN', shortLabel: 'E4 IDN', language: 'IDN', defaultEnabled: false },
  { key: 'exp5_en', label: 'EXP5 EN', shortLabel: 'E5 EN', language: 'EN', defaultEnabled: false },
  { key: 'exp5_idn', label: 'EXP5 IDN', shortLabel: 'E5 IDN', language: 'IDN', defaultEnabled: false }
];

const createDefaultPlaybackSequence = () => V511_PLAYBACK_PARTS.map(part => ({ key: part.key, enabled: part.defaultEnabled, repeat: 1 }));

const normalizePlaybackSequence = (input) => {
  const defaults = createDefaultPlaybackSequence();
  if (!Array.isArray(input)) return defaults;
  const validKeys = new Set(V511_PLAYBACK_PARTS.map(part => part.key));
  const seen = new Set();
  const normalized = [];
  input.forEach(entry => {
    const key = String(entry?.key || '');
    if (!validKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    const repeat = Math.min(5, Math.max(1, Number.parseInt(entry?.repeat, 10) || 1));
    normalized.push({ key, enabled: Boolean(entry?.enabled), repeat });
  });
  defaults.forEach(entry => {
    if (!seen.has(entry.key)) normalized.push(entry);
  });
  return normalized;
};

const V511_DELAY_OPTIONS = [0, 150, 300, 500, 750, 1000, 1500, 2000, 3000];
const V511_DEFAULT_DELAYS = { partDelayMs: 300, repeatDelayMs: 300 };

// --- v5.11.6 BUILT-IN PLAYBACK PRESETS ---
// Presets only reconfigure the existing sequence/repeat/delay engine. They never alter dataset rows or audio identity.
const V511_PLAYBACK_PRESETS = {
  vocabulary: {
    label: 'Vocabulary',
    shortLabel: 'VOCAB',
    description: 'Word EN 2x → Word IDN',
    order: ['word_en', 'word_idn'],
    repeats: { word_en: 2, word_idn: 1 },
    delays: { partDelayMs: 500, repeatDelayMs: 300 }
  },
  sentence: {
    label: 'Sentence',
    shortLabel: 'SENT',
    description: 'Sentence EN 2x → Sentence IDN',
    order: ['sentence_en', 'sentence_idn'],
    repeats: { sentence_en: 2, sentence_idn: 1 },
    delays: { partDelayMs: 500, repeatDelayMs: 300 }
  },
  expression: {
    label: 'Expression',
    shortLabel: 'EXP',
    description: 'EXP1–EXP5 EN → IDN',
    order: [
      'exp1_en', 'exp1_idn', 'exp2_en', 'exp2_idn', 'exp3_en', 'exp3_idn',
      'exp4_en', 'exp4_idn', 'exp5_en', 'exp5_idn'
    ],
    repeats: {},
    delays: { partDelayMs: 500, repeatDelayMs: 300 }
  },
  listening: {
    label: 'Listening',
    shortLabel: 'LISTEN',
    description: 'EN only • Word 2x + Sentence/EXP',
    order: ['word_en', 'sentence_en', 'exp1_en', 'exp2_en', 'exp3_en', 'exp4_en', 'exp5_en'],
    repeats: { word_en: 2 },
    delays: { partDelayMs: 750, repeatDelayMs: 300 }
  }
};

const createPlaybackPresetSequence = (preset) => {
  const config = preset && typeof preset === 'object' ? preset : {};
  const selected = Array.isArray(config.order) ? config.order.filter(Boolean) : [];
  const validKeys = new Set(V511_PLAYBACK_PARTS.map(part => part.key));
  const orderedSelected = [];
  const seen = new Set();
  selected.forEach(key => {
    if (validKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      orderedSelected.push(key);
    }
  });
  const remaining = V511_PLAYBACK_PARTS.map(part => part.key).filter(key => !seen.has(key));
  return [...orderedSelected, ...remaining].map(key => ({
    key,
    enabled: seen.has(key),
    repeat: seen.has(key) ? Math.min(5, Math.max(1, Number.parseInt(config.repeats?.[key], 10) || 1)) : 1
  }));
};

const playbackConfigSignature = (sequence, delays) => JSON.stringify({
  sequence: normalizePlaybackSequence(sequence).map(({ key, enabled, repeat }) => ({ key, enabled, repeat })),
  delays: normalizePlaybackDelays(delays)
});

const normalizePlaybackDelays = (input) => {
  const source = input && typeof input === 'object' ? input : {};
  const normalizeDelay = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(5000, Math.max(0, parsed));
  };
  return {
    partDelayMs: normalizeDelay(source.partDelayMs, V511_DEFAULT_DELAYS.partDelayMs),
    repeatDelayMs: normalizeDelay(source.repeatDelayMs, V511_DEFAULT_DELAYS.repeatDelayMs)
  };
};

const formatPlaybackDelay = (ms) => {
  const value = Number(ms) || 0;
  if (value === 0) return '0s';
  if (value < 1000) return `${value}ms`;
  return `${Number((value / 1000).toFixed(2))}s`;
};

// --- v5.11.6 EXTENSIBLE UI SHELL ---
const V5116_CONTROL_SECTIONS = [
  { key: 'player', label: 'Player', shortLabel: 'PLAYER' },
  { key: 'learn', label: 'Learn', shortLabel: 'LEARN' },
  { key: 'data', label: 'Data', shortLabel: 'DATA' },
  { key: 'system', label: 'System', shortLabel: 'SYSTEM' }
];

const V5116_CONTROL_SECTION_KEYS = new Set(V5116_CONTROL_SECTIONS.map(section => section.key));

// --- v5.11.6 VOCABULARY PLAY ORDER ---
const createEmptyVocabularyOrder = () => ({ context: null, signature: '', ids: [], cycle: 0 });

const getPlaybackItemId = (item) => String(item?.id ?? item?.vocabId ?? item?.displayId ?? '');

const getPlaybackListSignature = (items = []) =>
  items.map(getPlaybackItemId).join('\u001f');

const reorderPlaybackListByIds = (baseList = [], orderedIds = []) => {
  if (!Array.isArray(baseList) || !baseList.length || !Array.isArray(orderedIds) || !orderedIds.length) return baseList;
  const byId = new Map(baseList.map(item => [getPlaybackItemId(item), item]));
  const ordered = [];
  const used = new Set();
  orderedIds.forEach(id => {
    const key = String(id);
    const item = byId.get(key);
    if (item && !used.has(key)) {
      ordered.push(item);
      used.add(key);
    }
  });
  baseList.forEach(item => {
    const key = getPlaybackItemId(item);
    if (!used.has(key)) ordered.push(item);
  });
  return ordered;
};

const shuffleVocabularyItems = (baseList = [], { anchorId = null, avoidFirstId = null } = {}) => {
  const items = [...baseList];
  if (items.length <= 1) return items;

  const anchorKey = anchorId == null ? null : String(anchorId);
  let anchorItem = null;
  let pool = items;
  if (anchorKey !== null) {
    const anchorIndex = items.findIndex(item => getPlaybackItemId(item) === anchorKey);
    if (anchorIndex >= 0) {
      anchorItem = items[anchorIndex];
      pool = items.filter((_, index) => index !== anchorIndex);
    }
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const shuffled = anchorItem ? [anchorItem, ...pool] : pool;
  const avoidKey = avoidFirstId == null ? null : String(avoidFirstId);
  if (!anchorItem && avoidKey !== null && shuffled.length > 1 && getPlaybackItemId(shuffled[0]) === avoidKey) {
    const swapIndex = shuffled.findIndex((item, index) => index > 0 && getPlaybackItemId(item) !== avoidKey);
    if (swapIndex > 0) [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  }
  return shuffled;
};

const normalizeHeaderKey = (value = '') =>
  String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const detectDelimiter = (input = '') => {
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

const parseDelimitedText = (input = '') => {
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

const csvEscape = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const normalizeVocabId = (value, fallbackNo) => {
  const raw = String(value || '').trim();
  if (raw) return raw.replace(/\s+/g, '_').toUpperCase();
  return `LEGACY_${String(fallbackNo || 1).padStart(6, '0')}`;
};

const parseTableRecords = (input = '') => {
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

const serializeTableRecords = (records = []) => {
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

const createEmptyManualForm = () => ({
  vocabId: '', no: '', word: '', partOfSpeech: '', meaningWord: '', info: '', sentence: '', meaning: '',
  exp1En: '', exp1Idn: '', exp2En: '', exp2Idn: '', exp3En: '', exp3Idn: '', exp4En: '', exp4Idn: '', exp5En: '', exp5Idn: ''
});

const getRecordSignature = (item = {}) => JSON.stringify([
  String(item.vocabId || item.id || '').trim().toUpperCase(),
  Number(item.no ?? item.displayId) || 0,
  item.word || '', item.partOfSpeech || '', item.meaningWord || '', item.info || '',
  item.sentence || '', item.meaning || '',
  item.exp1En || '', item.exp1Idn || '', item.exp2En || '', item.exp2Idn || '',
  item.exp3En || '', item.exp3Idn || '', item.exp4En || '', item.exp4Idn || '', item.exp5En || '', item.exp5Idn || ''
]);

const canonicalizeTableContent = (content = '') => {
  const records = parseTableRecords(content)
    .sort((a, b) => (Number(a.no ?? a.displayId) || 0) - (Number(b.no ?? b.displayId) || 0));
  return records.length ? serializeTableRecords(records) : '';
};

const getTableChangeSummary = (baselineContent = '', currentContent = '') => {
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

const getMaxManualIdFromRecords = (records = []) => {
  let max = 0;
  records.forEach(item => {
    const match = String(item.vocabId || item.id || '').match(/^USR_(\d+)$/i);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10) || 0);
  });
  return max;
};

const getNextManualVocabId = (records = [], floor = 0) => {
  const max = Math.max(Number(floor) || 0, getMaxManualIdFromRecords(records));
  return `USR_${String(max + 1).padStart(6, '0')}`;
};

const getRecordAudioNo = (item) => {
  const raw = Number(item?.no ?? item?.displayId);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
};

const getMaxAssignedNoFromRecords = (records = []) =>
  records.reduce((max, item) => Math.max(max, getRecordAudioNo(item) || 0), 0);

const validateTableRecords = (records = []) => {
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

const getVocabIdentity = (item) =>
  String(item?.vocabId || item?.id || '').trim().toUpperCase();

// Internal audio map key is sequence-based so legacy numbered audio never shifts to another row.
const getStableAudioIdentity = (item) => {
  if (!item) return 'UNKNOWN';
  if (item.isStructured) {
    const no = getRecordAudioNo(item);
    return no ? `NO_${String(no).padStart(6, '0')}` : `ID_${getVocabIdentity(item) || 'UNKNOWN'}`;
  }
  return `TEXT_${String(item.displayId || 1).padStart(6, '0')}`;
};

// Download filename keeps BOTH sequence and VOCAB_ID for human/debug safety.
const getAudioFilenameIdentity = (item) => {
  if (!item?.isStructured) return getStableAudioIdentity(item);
  const no = getRecordAudioNo(item) || 1;
  const vocab = getVocabIdentity(item) || `LEGACY_${String(no).padStart(6, '0')}`;
  return `${String(no).padStart(6, '0')}_${vocab}`;
};

// --- v5.9 ADVANCED LEARNING HELPERS ---
const getAdvancedExpressionPairs = (item = {}) => [1, 2, 3, 4, 5].map(n => ({
  number: n,
  en: String(item[`exp${n}En`] || ''),
  idn: String(item[`exp${n}Idn`] || '')
}));

const getAdvancedContentCount = (item = {}) =>
  getAdvancedExpressionPairs(item).filter(pair => pair.en.trim() || pair.idn.trim()).length;

const hasAdvancedContent = (item = {}) =>
  Boolean(String(item.info || '').trim() || getAdvancedContentCount(item) > 0);

const isIndonesianAudioPart = (part = '') =>
  part === 'meaning' || part === 'word_idn' || /_idn$/i.test(String(part));

const getItemPartText = (item = {}, part = 'full') => {
  if (part === 'word') return item.word || '';
  if (part === 'word_idn') return item.meaningWord || '';
  if (part === 'sentence') return item.sentence || '';
  if (part === 'meaning') return item.meaning || '';
  const expMatch = String(part).match(/^exp([1-5])_(en|idn)$/i);
  if (expMatch) {
    const n = expMatch[1];
    return item[`exp${n}${expMatch[2].toLowerCase() === 'en' ? 'En' : 'Idn'}`] || '';
  }
  return item.text || '';
};


// --- v5.10 MULTI-SOURCE DATASET & JOIN ENGINE ---
const V510_SOURCE_KEYS = ['main', 'sentence', 'exp1', 'exp2', 'exp3', 'exp4', 'exp5'];
const V510_SOURCE_LABELS = {
  main: 'MAIN', sentence: 'SENTENCE', exp1: 'EXP1', exp2: 'EXP2', exp3: 'EXP3', exp4: 'EXP4', exp5: 'EXP5'
};

// v5.10.1: detect a source from filename first, then validate/assist with headers.
const detectV510SourceKey = (filename = '', content = '') => {
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

const readV510FileText = (file) => {
  if (file?.text) return file.text();
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(String(e.target?.result || ''));
      reader.onerror = () => reject(reader.error || new Error(`Cannot read ${file?.name || 'file'}`));
      reader.readAsText(file);
  });
};

const createEmptySourcePack = () => Object.fromEntries(V510_SOURCE_KEYS.map(key => [key, null]));

const parseLayerSourceRecords = (content = '', sourceKey = 'sentence') => {
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

const getDuplicateSourceIds = (records = []) => {
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

const serializeMainSourceRecords = (records = [], sourcePack = null) => {
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

const serializeLayerSourceRecords = (records = [], sourceKey = 'sentence', sourcePack = null) => {
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

const serializeSourceFromMerged = (records = [], sourceKey = 'main', sourcePack = null) =>
  sourceKey === 'main' ? serializeMainSourceRecords(records, sourcePack) : serializeLayerSourceRecords(records, sourceKey, sourcePack);

const mergeSourcePackBaselines = (sourcePack = {}) => {
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

const getSourceDiagnostics = (sourcePack = {}) => {
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

const getSourceChangeSummary = (sourceKey, baselineContent = '', currentRecords = [], sourcePack = null) => {
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
  // Preserve baseline-only orphan records in the comparison. They remain diagnostics until explicitly fixed/replaced.
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

const normalizeSourcePack = (sources) => {
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

const normalizeDeckEntry = (entry) => {
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

const downloadTextFile = (content, filename, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const formatVoiceLabel = (voice) => {
  let name = voice.name || voice.label || "";
  name = name.replace(/^Microsoft /i, '').replace(/^Google /i, '').replace(/^Android /i, '');
  name = name.replace(/Online \(Natural\) - /i, '');
  name = name.replace(/ - English \(.+\)/i, '').replace(/ English \(.+\)/i, '');
  name = name.replace(/ - Indonesian \(.+\)/i, '').replace(/ Indonesian \(.+\)/i, '');
  return name; 
};

// --- HELPER: Highlight Word in Text ---
const HighlightedText = ({ text, highlight, className = "" }) => {
  if (!highlight || !text) return <span className={className}>{text}</span>;
  
  const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const parts = text.split(new RegExp(`(${safeHighlight})`, 'gi'));
  return (
    <span className={className}>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <strong key={i} className="font-extrabold text-current underline decoration-dotted decoration-2 underline-offset-2">{part}</strong>
        ) : (
          part
        )
      )}
    </span>
  );
};

// --- DATA: EDGE TTS VOICES (COMPREHENSIVE v5.5 LIST) ---
const initialEdgeVoices = [
    // --- UK (GB) ---
    { id: "en-GB-SoniaNeural", label: "Sonia (UK)", lang: "en-GB" },
    { id: "en-GB-RyanNeural", label: "Ryan (UK)", lang: "en-GB" },
    { id: "en-GB-LibbyNeural", label: "Libby (UK)", lang: "en-GB" },
    { id: "en-GB-MaisieNeural", label: "Maisie (UK - Child)", lang: "en-GB" },
    { id: "en-GB-ThomasNeural", label: "Thomas (UK)", lang: "en-GB" },
    { id: "en-GB-AlfiesNeural", label: "Alfie (UK)", lang: "en-GB" },

    // --- US ---
    { id: "en-US-AriaNeural", label: "Aria (US)", lang: "en-US" },
    { id: "en-US-GuyNeural", label: "Guy (US)", lang: "en-US" },
    { id: "en-US-JennyNeural", label: "Jenny (US)", lang: "en-US" },
    { id: "en-US-ChristopherNeural", label: "Christopher (US)", lang: "en-US" },
    { id: "en-US-EricNeural", label: "Eric (US)", lang: "en-US" },
    { id: "en-US-MichelleNeural", label: "Michelle (US)", lang: "en-US" },
    { id: "en-US-AnaNeural", label: "Ana (US - Child)", lang: "en-US" },
    { id: "en-US-SteffanNeural", label: "Steffan (US)", lang: "en-US" },
    { id: "en-US-RogerNeural", label: "Roger (US)", lang: "en-US" },

    // --- AU (Australia) ---
    { id: "en-AU-NatashaNeural", label: "Natasha (AU)", lang: "en-AU" },
    { id: "en-AU-WilliamNeural", label: "William (AU)", lang: "en-AU" },
    { id: "en-AU-AnnetteNeural", label: "Annette (AU)", lang: "en-AU" },
    { id: "en-AU-CarlyNeural", label: "Carly (AU)", lang: "en-AU" },
    { id: "en-AU-DarrenNeural", label: "Darren (AU)", lang: "en-AU" },
    { id: "en-AU-DuncanNeural", label: "Duncan (AU)", lang: "en-AU" },
    { id: "en-AU-ElsieNeural", label: "Elsie (AU)", lang: "en-AU" },
    { id: "en-AU-FreyaNeural", label: "Freya (AU)", lang: "en-AU" },
    { id: "en-AU-JoanneNeural", label: "Joanne (AU)", lang: "en-AU" },
    { id: "en-AU-KenNeural", label: "Ken (AU)", lang: "en-AU" },
    { id: "en-AU-KimNeural", label: "Kim (AU)", lang: "en-AU" },
    { id: "en-AU-NeilNeural", label: "Neil (AU)", lang: "en-AU" },
    { id: "en-AU-TimNeural", label: "Tim (AU)", lang: "en-AU" },
    { id: "en-AU-TinaNeural", label: "Tina (AU)", lang: "en-AU" },

    // --- SG (Singapore) ---
    { id: "en-SG-LunaNeural", label: "Luna (SG)", lang: "en-SG" },
    { id: "en-SG-WayneNeural", label: "Wayne (SG)", lang: "en-SG" },

    // --- OTHER ENGLISH ---
    { id: "en-CA-ClaraNeural", label: "Clara (Canada)", lang: "en-CA" },
    { id: "en-CA-LiamNeural", label: "Liam (Canada)", lang: "en-CA" },
    { id: "en-HK-SamNeural", label: "Sam (Hong Kong)", lang: "en-HK" },
    { id: "en-HK-YanNeural", label: "Yan (Hong Kong)", lang: "en-HK" },
    { id: "en-IE-ConnorNeural", label: "Connor (Ireland)", lang: "en-IE" },
    { id: "en-IE-EmilyNeural", label: "Emily (Ireland)", lang: "en-IE" },
    { id: "en-IN-NeerjaNeural", label: "Neerja (India)", lang: "en-IN" },
    { id: "en-IN-PrabhatNeural", label: "Prabhat (India)", lang: "en-IN" },
    { id: "en-KE-AsiliaNeural", label: "Asilia (Kenya)", lang: "en-KE" },
    { id: "en-KE-ChilembaNeural", label: "Chilemba (Kenya)", lang: "en-KE" },
    { id: "en-NG-AbeoNeural", label: "Abeo (Nigeria)", lang: "en-NG" },
    { id: "en-NG-EzinneNeural", label: "Ezinne (Nigeria)", lang: "en-NG" },
    { id: "en-NZ-MitchellNeural", label: "Mitchell (New Zealand)", lang: "en-NZ" },
    { id: "en-NZ-MollyNeural", label: "Molly (New Zealand)", lang: "en-NZ" },
    { id: "en-PH-JamesNeural", label: "James (Philippines)", lang: "en-PH" },
    { id: "en-PH-RosaNeural", label: "Rosa (Philippines)", lang: "en-PH" },
    { id: "en-TZ-ElimuNeural", label: "Elimu (Tanzania)", lang: "en-TZ" },
    { id: "en-TZ-ImaniNeural", label: "Imani (Tanzania)", lang: "en-TZ" },
    { id: "en-ZA-LeahNeural", label: "Leah (South Africa)", lang: "en-ZA" },
    { id: "en-ZA-LukeNeural", label: "Luke (South Africa)", lang: "en-ZA" },

    // --- INDONESIAN REGION (ID, JV, SU) ---
    { id: "id-ID-GadisNeural", label: "Gadis (Indonesia)", lang: "id-ID" },
    { id: "id-ID-ArdiNeural", label: "Ardi (Indonesia)", lang: "id-ID" },
    { id: "jv-ID-DimasNeural", label: "Dimas (Javanese)", lang: "jv-ID" },
    { id: "jv-ID-SitiNeural", label: "Siti (Javanese)", lang: "jv-ID" },
    { id: "su-ID-JajangNeural", label: "Jajang (Sundanese)", lang: "su-ID" }
];

const groupVoicesByRegion = (voiceList, context = 'general') => {
    const groups = {
        "UK (United Kingdom)": [],
        "US (United States)": [],
        "AU (Australia)": [],
        "SG (Singapore)": [],
        "Other English": [],
        "Indonesia & Regional (ID/JV/SU)": [] 
    };

    voiceList.forEach(v => {
        const lang = (v.lang || "").replace('_', '-'); 
        const isEnglish = lang.startsWith("en");
        const isIndoRegion = lang.includes("ID") || lang === 'id' || lang === 'jv' || lang === 'su' || lang.includes("indones");

        if (context === 'main') {
            if (!isEnglish) return; 
        } else if (context === 'meaning') {
            if (isIndoRegion) {
                groups["Indonesia & Regional (ID/JV/SU)"].push(v);
                return;
            }
            return; 
        } else {
            if (isIndoRegion) {
                groups["Indonesia & Regional (ID/JV/SU)"].push(v);
                return; 
            }
        }
        
        if (isEnglish) {
            if (lang.includes("GB") || lang.includes("UK")) groups["UK (United Kingdom)"].push(v);
            else if (lang.includes("US")) groups["US (United States)"].push(v);
            else if (lang.includes("AU")) groups["AU (Australia)"].push(v);
            else if (lang.includes("SG")) groups["SG (Singapore)"].push(v);
            else groups["Other English"].push(v);
        }
    });

    return groups;
};

const GroupedVoiceSelect = ({ voices, selectedValue, onChange, className, context = 'general', disabled }) => {
    const grouped = groupVoicesByRegion(voices, context);
    const hasOptions = Object.values(grouped).some(g => g.length > 0);

    if (!hasOptions) {
        return (
             <div className={`${className} opacity-50 text-slate-500 italic flex items-center px-2`}>
                No voices available
             </div>
        );
    }
    
    return (
        <select 
            className={className} 
            onChange={onChange} 
            value={selectedValue}
            disabled={disabled}
        >
            {Object.keys(grouped).map(groupName => (
                grouped[groupName].length > 0 && (
                    <optgroup key={groupName} label={groupName}>
                        {grouped[groupName].map(v => (
                            <option key={v.id || v.name} value={v.id || v.name}>
                                {v.label || formatVoiceLabel(v)}
                            </option>
                        ))}
                    </optgroup>
                )
            ))}
        </select>
    );
};

// --- COMPONENT: LANDING PAGE ---
const LandingPage = ({ onStart, theme, setTheme }) => {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center transition-colors duration-500">
            <div className="max-w-3xl w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
                <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-8 rotate-3 hover:rotate-6 transition-transform">
                    <Mic className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-4xl md:text-6xl font-black text-slate-800 dark:text-white mb-4 tracking-tight">
                    ProLingo <span className="text-indigo-500">v5.11.6</span>
                </h1>
                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-xl leading-relaxed">
                    Professional Pronunciation & Memory Training Platform.
                    <br/><span className="text-sm opacity-70">Structured Data • Manual Builder • Playback Refactor</span>
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12 w-full max-w-2xl">
                    {[
                        { icon: Database, text: "Custom Decks", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
                        { icon: Server, text: "Edge TTS Node", color: "text-teal-500", bg: "bg-teal-50 dark:bg-teal-900/20" },
                        { icon: CloudLightning, text: "Gemini AI", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
                        { icon: Brain, text: "Memory Drill", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" }
                    ].map((feat, idx) => (
                        <div key={idx} className={`${feat.bg} p-3 rounded-xl flex items-center justify-center gap-2 border border-transparent dark:border-white/5`}>
                            <feat.icon className={`w-4 h-4 ${feat.color}`} />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{feat.text}</span>
                        </div>
                    ))}
                </div>
                <button 
                    onClick={onStart}
                    className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-indigo-500/50 transition-all w-full md:w-auto flex items-center justify-center gap-3 overflow-hidden"
                >
                    <span className="relative z-10 flex items-center gap-2">Mulai Latihan <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform"/></span>
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                </button>
                <div className="mt-16 p-1.5 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 flex items-center shadow-sm relative">
                    <div className={`absolute top-1.5 bottom-1.5 w-8 rounded-full bg-indigo-100 dark:bg-slate-800 transition-all duration-300 ease-out ${
                        theme === 'light' ? 'left-1.5' : theme === 'system' ? 'left-[calc(50%-16px)]' : 'left-[calc(100%-38px)]'
                    }`}></div>
                    
                    <button onClick={() => setTheme('light')} className={`relative z-10 p-2 rounded-full transition-all ${theme === 'light' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                        <Sun className="w-4 h-4" />
                    </button>
                    <button onClick={() => setTheme('system')} className={`relative z-10 p-2 rounded-full transition-all ${theme === 'system' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                        <Laptop className="w-4 h-4" />
                    </button>
                    <button onClick={() => setTheme('dark')} className={`relative z-10 p-2 rounded-full transition-all ${theme === 'dark' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
                        <Moon className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                    {theme === 'system' ? 'Mengikuti tema perangkat' : theme === 'dark' ? 'Mode Gelap Aktif' : 'Mode Terang Aktif'}
                </p>
            </div>
        </div>
    );
};

// --- OPTIMIZED ROW COMPONENT (TABLE) ---
const MemoizedRow = memo(({ 
    item, 
    isActive, 
    isSystemBusy, 
    toggleStudyItem, 
    isInQueue, 
    handleIndependentPlay, 
    handleRowClick, 
    independentPlayingId, 
    speakingPart, 
    isMemoryMode, 
    memorySettings, 
    revealedCells, 
    toggleCellReveal, 
    localWordUrl,
    localWordIdnUrl,
    localSentUrl, 
    localMeaningUrl,    
    preferLocalAudio, 
    generateAIAudio, 
    aiLoadingId,
    rowId,
    idx,
    style,
    activeMenuId,      
    onMenuToggle,
    changeType,
    generatorEngine,
    onEditItem,
    onDeleteItem,
    advancedExpanded,
    onToggleAdvanced
}) => {
    const isMenuOpen = activeMenuId === rowId;
    const isWordUsingLocal = localWordUrl && preferLocalAudio;
    const isWordActive = isActive && speakingPart === 'word';
    const isWordIdnActive = isActive && speakingPart === 'word_idn';
    const isSentActive = isActive && speakingPart === 'sentence';
    const isMeaningActive = isActive && speakingPart === 'meaning';
    const advancedPairs = getAdvancedExpressionPairs(item);
    const advancedCount = getAdvancedContentCount(item);
    const hasAdvanced = hasAdvancedContent(item);

    const blurClass = "filter blur-sm bg-slate-100 dark:bg-slate-800 select-none cursor-pointer transition-all duration-300";
    const revealedClass = "filter-none bg-yellow-50 dark:bg-yellow-900/30 cursor-pointer transition-all duration-300";
    const isWordHidden = isMemoryMode && memorySettings.word;
    const isSentHidden = isMemoryMode && memorySettings.sentence;
    const isMeaningHidden = isMemoryMode && memorySettings.meaning;
    const isExpressionsHidden = isMemoryMode && memorySettings.expressions;
    const wordRevealed = revealedCells[`${rowId}-word`];
    const sentRevealed = revealedCells[`${rowId}-sent`];
    const meaningRevealed = revealedCells[`${rowId}-meaning`];

    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50';

    const miniPlayClass = (active) => `w-5 h-5 flex items-center justify-center rounded-full border transition-colors ${active ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:text-indigo-600')}`;

    return (
        <div style={style} className="absolute left-0 right-0 px-2 py-2 z-0">
            <div 
                id={rowId} 
                onClick={(e) => { e.stopPropagation(); handleRowClick(item, idx); }} 
                className={`h-full rounded-xl border p-3 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer relative ${isActive ? 'bg-blue-600 border-blue-700 dark:border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
            >
                <div className="md:hidden absolute top-2 right-2 z-20">
                    <button onClick={(e) => { e.stopPropagation(); onMenuToggle(rowId); }} className={`p-1.5 rounded-full transition-colors ${isActive ? 'text-white hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        <MoreVertical className="w-5 h-5" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute top-8 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg p-1 flex flex-col gap-1 w-36 z-30 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                            <button onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded text-[10px] font-bold border ${isInQueue ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700'}`}>
                                {isInQueue ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{isInQueue ? 'Added' : 'Queue'}
                            </button>
                            {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); onMenuToggle(null); }} className="w-full px-2 py-1.5 flex items-center gap-2 rounded text-[10px] font-bold border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20"><Layers className="w-3 h-3"/>{advancedExpanded ? 'Basic View' : `Advanced (${advancedCount})`}</button>}
                            <div className="grid grid-cols-2 gap-1">
                                <button onClick={(e) => { e.stopPropagation(); onEditItem(item); onMenuToggle(null); }} className="px-2 py-1.5 flex items-center justify-center gap-1 rounded text-[10px] font-bold border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"><Edit3 className="w-3 h-3"/> Edit</button>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteItem(item); onMenuToggle(null); }} className="px-2 py-1.5 flex items-center justify-center gap-1 rounded text-[10px] font-bold border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"><Trash2 className="w-3 h-3"/> Del</button>
                            </div>
                            <div className="h-[1px] bg-slate-100 dark:bg-slate-700 w-full my-0.5"/>
                            {localWordUrl ? <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="w-3 h-3"/> <span className="text-[10px] font-bold">Word OK</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[10px] font-bold">Word</span></button>}
                            {generatorEngine === 'edge' && item.meaningWord && (localWordIdnUrl ? <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="w-3 h-3"/> <span className="text-[10px] font-bold">Word IDN OK</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word_idn'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word_idn` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[10px] font-bold">Word IDN</span></button>)}
                            {localSentUrl ? <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2"><CheckCircle className="w-3 h-3"/> <span className="text-[10px] font-bold">Sent OK</span></button> : <button disabled={isSystemBusy || !item.sentence} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border ${genColorClass} ${(isSystemBusy || !item.sentence) ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[10px] font-bold">Sent</span></button>}
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start gap-2 h-full">
                    <div className="flex-1 w-full min-w-0 overflow-hidden flex flex-col gap-1 h-full">
                        <div className="flex items-start md:items-center gap-3 flex-shrink-0 mb-1 pr-8 md:pr-0">
                            <div className="w-12 flex flex-col items-center mt-1 md:mt-0 gap-0.5">
                                <span className={`text-xs font-mono font-bold ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                                {changeType && <span className={`text-[8px] leading-none px-1 py-0.5 rounded font-black tracking-wide ${changeType === 'added' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{changeType === 'added' ? 'NEW' : 'EDITED'}</span>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word', `${rowId}-word`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 md:mt-0 ${independentPlayingId === `${rowId}-word` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>
                                {independentPlayingId === `${rowId}-word` ? <X className="w-3 h-3"/> : <Play className="w-3 h-3 fill-current"/>}
                            </button>
                            <div className={`flex-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0 ${isWordHidden ? (wordRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isWordHidden && toggleCellReveal(e, `${rowId}-word`)}>
                                <h3 className={`text-lg leading-snug line-clamp-2 md:line-clamp-1 ${isWordActive ? 'font-bold text-white' : (isActive ? 'text-blue-100' : 'text-slate-800 dark:text-slate-100')}`}>{item.word}</h3>
                                <div className="flex items-center gap-1 min-w-0 overflow-hidden max-w-full">
                                    {item.partOfSpeech && <span className={`text-[10px] italic border px-1 rounded flex-shrink-0 ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.partOfSpeech}</span>}
                                    {item.meaningWord && <div className={`text-[10px] border pl-1 pr-1.5 py-0.5 rounded flex items-center gap-1 min-w-0 ${isWordIdnActive ? 'font-bold text-white bg-blue-500/30 border-blue-300' : (isActive ? 'text-blue-200 border-blue-400 bg-blue-500' : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800')}`}><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word_idn', `${rowId}-word-idn`); }} className={miniPlayClass(independentPlayingId === `${rowId}-word-idn`)} title="Play word translation">{independentPlayingId === `${rowId}-word-idn` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}</button><span className="truncate">{item.meaningWord}</span></div>}
                                    {item.vocabId && <span className={`hidden lg:inline text-[9px] font-mono border px-1 rounded ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>{item.vocabId}</span>}
                                </div>
                            </div>
                            {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); }} className={`hidden md:flex items-center gap-1 px-1.5 py-1 rounded border text-[9px] font-black flex-shrink-0 ${advancedExpanded ? 'bg-violet-600 text-white border-violet-500' : (isActive ? 'bg-blue-700 text-violet-100 border-blue-400' : 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-800')}`} title="Toggle INFO + EXP1–EXP5"><Layers className="w-3 h-3"/>ADV {advancedCount}</button>}
                            {isWordUsingLocal ? <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold hidden md:flex"><Hash className="w-3 h-3"/> OK</span> : <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold hidden md:flex ${isActive ? 'bg-blue-700 text-blue-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>TTS</span>}
                        </div>

                        <div className="flex flex-col gap-2 pl-0 md:pl-11 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                            {!advancedExpanded ? (
                                <>
                                    {item.sentence && <div className="flex gap-2 items-start">
                                        <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'sentence', `${rowId}-sent`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 ${independentPlayingId === `${rowId}-sent` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>{independentPlayingId === `${rowId}-sent` ? <X className="w-3 h-3"/> : <Play className="w-3 h-3 fill-current"/>}</button>
                                        <div className={`flex-1 ${isSentHidden ? (sentRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isSentHidden && toggleCellReveal(e, `${rowId}-sent`)}><p className={`text-sm leading-relaxed line-clamp-4 md:line-clamp-2 ${isSentActive ? 'font-bold text-white' : (isActive ? 'text-blue-50 font-medium' : 'text-slate-600 dark:text-slate-300')}`}>&ldquo;<HighlightedText text={item.sentence} highlight={item.word} />&rdquo;</p></div>
                                    </div>}
                                    {item.meaning && <div className="flex gap-2 items-start md:ml-6">
                                        <div className="w-6 flex justify-center flex-shrink-0 mt-0.5"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'meaning', `${rowId}-meaning`); }} className={`w-4 h-4 flex items-center justify-center rounded-full border ${independentPlayingId === `${rowId}-meaning` ? 'bg-red-50 dark:bg-red-900/30 text-red-500' : (isActive ? 'bg-blue-500/50 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-indigo-600')}`}>{independentPlayingId === `${rowId}-meaning` ? <X className="w-2 h-2"/> : <Play className="w-2 h-2 fill-current"/>}</button></div>
                                        <div className={`flex-1 ${isMeaningHidden ? (meaningRevealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isMeaningHidden && toggleCellReveal(e, `${rowId}-meaning`)}><p className={`text-xs italic line-clamp-3 md:line-clamp-2 ${isMeaningActive ? 'font-bold text-white bg-blue-500/20 px-1 rounded' : (isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500')}`}><HighlightedText text={item.meaning} highlight={item.meaningWord || item.word}/><Globe className="w-3 h-3 inline-block ml-1 opacity-50"/></p></div>
                                    </div>}
                                    {hasAdvanced && <button onClick={(e) => { e.stopPropagation(); onToggleAdvanced(); }} className={`md:hidden self-start flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold ${isActive ? 'border-blue-400 text-blue-100 bg-blue-700/60' : 'border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20'}`}><Layers className="w-3 h-3"/> INFO + EXP1–EXP5 ({advancedCount})</button>}
                                </>
                            ) : (
                                <div className="space-y-2 pb-1" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between gap-2 sticky top-0 z-10 bg-white/95 dark:bg-slate-800/95 rounded py-1">
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? 'text-violet-100' : 'text-violet-600 dark:text-violet-300'}`}>Advanced Spoken Expressions</span>
                                        <button onClick={onToggleAdvanced} className={`px-2 py-0.5 rounded text-[9px] font-bold border ${isActive ? 'border-blue-400 text-blue-100' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>Basic</button>
                                    </div>
                                    {item.info && <div className={`rounded-lg border px-2 py-1.5 ${isActive ? 'border-blue-400 bg-blue-700/30' : 'border-amber-100 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-900/10'}`}><span className={`text-[9px] font-black uppercase mr-2 ${isActive ? 'text-amber-200' : 'text-amber-600 dark:text-amber-400'}`}>INFO</span><span className={`text-[11px] ${isActive ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'}`}>{item.info}</span></div>}
                                    {advancedPairs.filter(pair => pair.en.trim() || pair.idn.trim()).map(pair => {
                                        const expKey = `${rowId}-exp${pair.number}`;
                                        const revealed = revealedCells[expKey];
                                        return <div key={pair.number} className={`rounded-lg border px-2 py-1.5 ${isActive ? 'border-blue-400/70 bg-blue-700/20' : 'border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30'}`}>
                                            <div className="flex items-start gap-2">
                                                <span className={`text-[9px] font-black w-9 flex-shrink-0 pt-0.5 ${isActive ? 'text-violet-100' : 'text-violet-600 dark:text-violet-400'}`}>EXP{pair.number}</span>
                                                <div className={`flex-1 min-w-0 space-y-1 ${isExpressionsHidden ? (revealed ? revealedClass : blurClass) : ''}`} onClick={(e) => isExpressionsHidden && toggleCellReveal(e, expKey)}>
                                                    {pair.en && <div className="flex items-start gap-1.5"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, `exp${pair.number}_en`, `${rowId}-exp${pair.number}-en`); }} className={miniPlayClass(independentPlayingId === `${rowId}-exp${pair.number}-en`)}>{independentPlayingId === `${rowId}-exp${pair.number}-en` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}</button><p className={`text-[11px] leading-relaxed ${speakingPart === `exp${pair.number}_en` && isActive ? 'font-bold text-white' : (isActive ? 'text-blue-50' : 'text-slate-700 dark:text-slate-200')}`}>{pair.en}</p></div>}
                                                    {pair.idn && <div className="flex items-start gap-1.5"><button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, `exp${pair.number}_idn`, `${rowId}-exp${pair.number}-idn`); }} className={miniPlayClass(independentPlayingId === `${rowId}-exp${pair.number}-idn`)}>{independentPlayingId === `${rowId}-exp${pair.number}-idn` ? <X className="w-2.5 h-2.5"/> : <Play className="w-2.5 h-2.5 fill-current"/>}</button><p className={`text-[10px] italic leading-relaxed ${speakingPart === `exp${pair.number}_idn` && isActive ? 'font-bold text-white' : (isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500')}`}>{pair.idn}</p></div>}
                                                </div>
                                            </div>
                                        </div>;
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`hidden md:flex md:flex-col md:ml-2 justify-center items-end w-auto gap-1 flex-shrink-0 md:border-l md:pl-2 ${isActive ? 'border-blue-500' : 'border-slate-100 dark:border-slate-700'}`}>
                        <button onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); }} className={`md:w-[55px] md:h-[22px] flex items-center justify-center gap-1 rounded border text-[9px] font-bold ${isInQueue ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>{isInQueue ? <CheckCircle className="w-3 h-3"/> : <Plus className="w-3 h-3"/>}<span>{isInQueue ? 'Added' : 'Add'}</span></button>
                        <div className="flex gap-1"><button onClick={(e) => { e.stopPropagation(); onEditItem(item); }} className="w-[27px] h-[20px] flex items-center justify-center rounded border border-blue-100 dark:border-blue-900 text-blue-500" title="Edit vocabulary"><Edit3 className="w-3 h-3"/></button><button onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }} className="w-[27px] h-[20px] flex items-center justify-center rounded border border-red-100 dark:border-red-900 text-red-500" title="Delete vocabulary"><Trash2 className="w-3 h-3"/></button></div>
                        <div className="flex flex-col gap-1 items-end">
                            {localWordUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">Word</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">Word</span></button>}
                            {generatorEngine === 'edge' && item.meaningWord && (localWordIdnUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">W-ID</span></button> : <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word_idn'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${isSystemBusy ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-word_idn` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">W-ID</span></button>)}
                            {localSentUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">Sent</span></button> : <button disabled={isSystemBusy || !item.sentence} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border ${genColorClass} ${(isSystemBusy || !item.sentence) ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">Sent</span></button>}
                            {generatorEngine === 'edge' && (localMeaningUrl ? <button disabled className="w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3"/><span className="text-[9px] font-bold">Mean</span></button> : <button disabled={isSystemBusy || !item.meaning} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'meaning'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${(isSystemBusy || !item.meaning) ? 'opacity-50' : ''}`}>{aiLoadingId === `${item.id}-meaning` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>}<span className="text-[9px] font-bold">Mean</span></button>)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => (
    prev.item === next.item &&
    prev.isActive === next.isActive &&
    prev.isSystemBusy === next.isSystemBusy &&
    prev.isInQueue === next.isInQueue &&
    prev.independentPlayingId === next.independentPlayingId &&
    prev.speakingPart === next.speakingPart &&
    prev.isMemoryMode === next.isMemoryMode &&
    prev.memorySettings === next.memorySettings &&
    prev.revealedCells === next.revealedCells &&
    prev.preferLocalAudio === next.preferLocalAudio &&
    prev.localWordUrl === next.localWordUrl &&
    prev.localWordIdnUrl === next.localWordIdnUrl &&
    prev.localSentUrl === next.localSentUrl && 
    prev.localMeaningUrl === next.localMeaningUrl && 
    prev.aiLoadingId === next.aiLoadingId &&
    prev.style.top === next.style.top &&
    prev.activeMenuId === next.activeMenuId &&
    prev.changeType === next.changeType &&
    prev.generatorEngine === next.generatorEngine &&
    prev.advancedExpanded === next.advancedExpanded
));


// --- OPTIMIZED ROW COMPONENT (TEXT MODE) - NEW COMPONENT FIX ---
const MemoizedTextRow = memo(({ 
    item, 
    style, 
    isActive, 
    isTextActive, 
    handleManualRowClick, 
    handleDeleteTextItem, 
    localTextUrl, 
    // eslint-disable-next-line no-unused-vars
    textFilename, 
    isSystemBusy, 
    generateAIAudio, 
    aiLoadingId,
    preferLocalAudio,
    generatorEngine
}) => {
    
    // Dynamic Icon & Style
    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/30';

    return (
        <div 
            style={style} 
            className="absolute left-0 right-0 w-full px-2 py-1"
        >
            <div 
                id={`row-${item.id}`} 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    handleManualRowClick(item, item.virtualIdx); 
                }} 
                className={`h-full rounded-lg px-3 py-2 transition-all hover:shadow-sm flex items-start gap-3 cursor-pointer overflow-hidden ${isActive ? 'bg-blue-600 border border-blue-700 dark:border-blue-500' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
            >
                <div className="flex flex-col items-center gap-1 mt-0.5 flex-shrink-0">
                    <span className={`text-xs font-mono w-6 text-center ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                    {localTextUrl && preferLocalAudio ? <Hash className="w-3 h-3 text-green-500"/> : <FileText className={`w-3 h-3 ${isActive ? 'text-blue-300' : 'text-slate-300 dark:text-slate-600'}`} />}
                </div>
                <p className={`text-sm flex-1 leading-relaxed whitespace-pre-line overflow-hidden text-ellipsis line-clamp-3 md:line-clamp-2 ${isTextActive ? 'font-bold text-white' : (isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300')}`}>{item.text}</p>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTextItem(item.virtualIdx); }} className={`p-1.5 rounded-md border transition-colors mr-1 ${isActive ? 'bg-blue-500 text-blue-200 border-blue-400 hover:bg-red-500 hover:text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200'}`}><Trash2 className="w-3.5 h-3.5"/></button>
                    {localTextUrl ? (
                         <button disabled className={`flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs font-bold border border-green-200 dark:border-green-800 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> OK</button>
                    ) : (
                        <button disabled={isSystemBusy} onClick={() => generateAIAudio(item, 'full')} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold transition-all ${genColorClass} ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}>
                            {aiLoadingId === `${item.id}-full` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>} Gen
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.item === next.item &&
        prev.style.top === next.style.top && 
        prev.isActive === next.isActive &&
        prev.isTextActive === next.isTextActive &&
        prev.isSystemBusy === next.isSystemBusy &&
        prev.localTextUrl === next.localTextUrl &&
        prev.aiLoadingId === next.aiLoadingId &&
        prev.preferLocalAudio === next.preferLocalAudio &&
        prev.generatorEngine === next.generatorEngine
    );
});


// --- MAIN COMPONENT ---
const MainApp = ({ goHome, theme, setTheme }) => {
  const [mode, setMode] = useState('table'); 
  const [tableViewMode, setTableViewMode] = useState('master'); 
  const [studyQueue, setStudyQueue] = useState([]); 
  const [rangeInput, setRangeInput] = useState("");

  const [tableContent, setTableContent] = useState("");
  const [textContent, setTextContent] = useState("");
  const [playlist, setPlaylist] = useState([]); 
  const [newTextItem, setNewTextItem] = useState("");
  // v5.8.3: last CSV snapshot that has been imported or explicitly saved to disk.
  const [csvBaselineContent, setCsvBaselineContent] = useState("");
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [masterSearch, setMasterSearch] = useState("");
  const [masterFilter, setMasterFilter] = useState('all');
  const [isChangeReviewOpen, setIsChangeReviewOpen] = useState(false);
  const [isRevertAllConfirmOpen, setIsRevertAllConfirmOpen] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [lastDraftAutoSaveAt, setLastDraftAutoSaveAt] = useState(null);
  // v5.10: relational source baselines. Working data stays unified in tableContent.
  const [sourcePack, setSourcePack] = useState(createEmptySourcePack);
  const [sourceUploadKey, setSourceUploadKey] = useState('main');

  // v5.8 Manual Vocabulary Manager
  const [isManualEditorOpen, setIsManualEditorOpen] = useState(false);
  const [manualEditingId, setManualEditingId] = useState(null);
  const [manualForm, setManualForm] = useState(createEmptyManualForm);
  const [manualAdvancedOpen, setManualAdvancedOpen] = useState(false);
  
  const [currentIndex, setCurrentIndex] = useState(null);
  const [savedIndices, setSavedIndices] = useState({ table: null, text: null });
  
  // -- NEW: SCROLL POSITION PERSISTENCE --
  const viewScrollPosRef = useRef({ master: 0, study: 0, text: 0 });
  // -- NEW: Pending Scroll Restoration Ref --
  const pendingScrollRestoration = useRef(null);

  const [masterIndex, setMasterIndex] = useState(null);
  const [studyIndex, setStudyIndex] = useState(null);
  
  const [playingIndex, setPlayingIndex] = useState(null);
  const [playingContext, setPlayingContext] = useState(null);

  const tableViewModeRef = useRef(tableViewMode);
  const justSwitchedTab = useRef(false);
  const prevCurrentIndex = useRef(currentIndex);

  const [savedDecks, setSavedDecks] = useState({});
  const [selectedDeckId, setSelectedDeckId] = useState(""); 
  const [currentDeckName, setCurrentDeckName] = useState("Untitled Sheet");
  // v5.8.1: sequence/audio slot high-water mark. NEVER auto-decreases on row deletion.
  const [sequenceHighWater, setSequenceHighWater] = useState(0);
  const [manualIdHighWater, setManualIdHighWater] = useState(0);
  const [importedRowCount, setImportedRowCount] = useState(0);

  const [voices, setVoices] = useState([]); 
  const [indonesianVoices, setIndonesianVoices] = useState([]); 
  const [selectedVoice, setSelectedVoice] = useState(null); 
  const [selectedIndonesianVoice, setSelectedIndonesianVoice] = useState(null); 
  
  const selectedVoiceRef = useRef(null);
  const selectedIndonesianVoiceRef = useRef(null);

  const [rate, setRate] = useState(1);
  // eslint-disable-next-line no-unused-vars
  const [pitch, setPitch] = useState(1); 
  
  // v5.11.6: one ordered list controls part order, enabled state, and per-part repeat count.
  const [playbackSequence, setPlaybackSequence] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('prolingo_playback_sequence_v511') : null;
      return normalizePlaybackSequence(saved ? JSON.parse(saved) : null);
    } catch {
      return createDefaultPlaybackSequence();
    }
  });
  // v5.11.6: configurable delay between sequence parts and between repeats.
  // Defaults preserve v5.11.2 behaviour (300 ms transition gap).
  const [playbackDelays, setPlaybackDelays] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('prolingo_playback_delays_v511') : null;
      return normalizePlaybackDelays(saved ? JSON.parse(saved) : null);
    } catch {
      return { ...V511_DEFAULT_DELAYS };
    }
  });
  // v5.11.6: item order is independent from the per-item playback sequence.
  const [vocabularyPlayOrder, setVocabularyPlayOrder] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('prolingo_vocabulary_play_order_v511') === 'shuffle'
        ? 'shuffle'
        : 'sequential';
    } catch {
      return 'sequential';
    }
  });
  const [activeVocabularyOrder, setActiveVocabularyOrder] = useState(createEmptyVocabularyOrder);
  const [expandedAdvancedId, setExpandedAdvancedId] = useState(null);
  
  const [preferLocalAudio, setPreferLocalAudio] = useState(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speakingPart, setSpeakingPart] = useState(null); 
  const [playbackMode, setPlaybackMode] = useState('once'); 
  const [independentPlayingId, setIndependentPlayingId] = useState(null); 

  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [lockedStates, setLockedStates] = useState({ table: false, text: true });
  
  // FIX: Initialize sidebar state based on window width to prevent glitch/flash on mobile load
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true); 
  // v5.11.6: one shared control category for desktop sidebar + mobile Tools.
  const [sidebarSection, setSidebarSection] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('prolingo_control_section_v5116') : null;
      return V5116_CONTROL_SECTION_KEYS.has(saved) ? saved : 'player';
    } catch {
      return 'player';
    }
  });
  const [showLogs, setShowLogs] = useState(false); 
  
  const [mobileTab, setMobileTab] = useState('player'); 
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  // NEW: Batch Config includes doMeaning
  const [batchConfig, setBatchConfig] = useState({ start: 1, end: 10, doWord: true, doWordTranslation: false, doSentence: true, doMeaning: false, doExpressions: false, doExpressionTranslations: false });
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState(""); 
  const [isBatchStopping, setIsBatchStopping] = useState(false); 

  const [isMemoryMode, setIsMemoryMode] = useState(false);
  const [revealedCells, setRevealedCells] = useState({}); 
  const [memorySettings, setMemorySettings] = useState({ word: true, sentence: true, meaning: true, expressions: true }); 
  
  const [activeMenuId, setActiveMenuId] = useState(null);

  const isLocked = lockedStates[mode];

  const [userApiKey, setUserApiKey] = useState("");
  const [aiVoiceName, setAiVoiceName] = useState("Kore");
  const [aiLoadingId, setAiLoadingId] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]); 

  // --- NEW: GENERATOR ENGINE STATES ---
  const [generatorEngine, setGeneratorEngine] = useState('gemini'); // 'gemini' | 'edge'
  
  // EDGE VOICE STATES (Expanded)
  // eslint-disable-next-line no-unused-vars
  const [edgeVoices, setEdgeVoices] = useState(initialEdgeVoices); 
  const [edgeVoice, setEdgeVoice] = useState("en-GB-SoniaNeural"); // Default to UK
  const [edgeIndonesianVoice, setEdgeIndonesianVoice] = useState("id-ID-GadisNeural"); // New: Indo Voice for Edge

  const [edgeRate, setEdgeRate] = useState(0); // -50 to +50 (Percent)
  const [edgePitch, setEdgePitch] = useState(0); // -20 to +20 (Hz)
  const [edgeHealth, setEdgeHealth] = useState({ status: 'idle', message: 'Belum dites' });

  const [localAudioMapTable, setLocalAudioMapTable] = useState({}); 
  const [localAudioMapText, setLocalAudioMapText] = useState({});
  const [audioStatusTable, setAudioStatusTable] = useState('idle');
  const [audioStatusText, setAudioStatusText] = useState('idle');

  const listContainerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); 

  const [rowHeights, setRowHeights] = useState({ 
      table: DEFAULT_ROW_HEIGHT_PC, 
      text: 70 
  });

  const [isMobile, setIsMobile] = useState(false);
  const [showAppBar, setShowAppBar] = useState(true);
  const lastScrollY = useRef(0);
  
  // FIX: Ref to track when we are performing a programmatic auto-scroll
  const isAutoScrolling = useRef(false);

  const isSystemBusy = isBatchDownloading || aiLoadingId !== null;

  // FIX: Silent Audio Ref (Anchor) - NEW GENERATION STRATEGY
  const silentAudioRef = useRef(null);
  const silentWavUrlRef = useRef(null);

  // FIX 1: Lock Body Scroll when Sidebar is Open (Prevent background scrolling)
  useEffect(() => {
      if (isMobile && isSidebarOpen) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => { document.body.style.overflow = ''; };
  }, [isMobile, isSidebarOpen]);

  // --- FORCE HEADER SHOW WHEN SIDEBAR OPEN (MOBILE) ---
  useEffect(() => {
      if (isMobile) {
          if (isSidebarOpen) {
              setShowAppBar(true);
          } else if (isPlaying) {
              // FIX: When closing sidebar while playing, hide header to restore focus
              // ONLY if we are in player tab
              if(mobileTab === 'player') setShowAppBar(false);
          }
      }
  }, [isSidebarOpen, isMobile, isPlaying, mobileTab]);

  const stopSignalRef = useRef(false);
  const pauseStateRef = useRef(false);
  const playbackSessionRef = useRef(0);
  const playbackResolveRef = useRef(null);
  const batchStopSignalRef = useRef(false); 
  const currentAudioObjRef = useRef(null);
  const generationAbortControllerRef = useRef(null);
  const edgeTestAbortControllerRef = useRef(null);
  const playbackModeRef = useRef(playbackMode); 
  const playbackSequenceRef = useRef(playbackSequence);
  const playbackDelaysRef = useRef(playbackDelays);
  const vocabularyPlayOrderRef = useRef(vocabularyPlayOrder);
  const activeVocabularyOrderRef = useRef(activeVocabularyOrder);
  
  // FIX: REFERENCE FOR CURRENT UTTERANCE TO PREVENT GARBAGE COLLECTION
  const currentUtteranceRef = useRef(null);

  const synth = window.speechSynthesis;
  const folderInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const sourceInputRef = useRef(null);
  const fullPackInputRef = useRef(null);
  const sourceUploadKeyRef = useRef('main');
  const logContainerRef = useRef(null);
  const debugButtonRef = useRef(null);
  const debugPanelRef = useRef(null);
  const batchPanelRef = useRef(null);
  const batchButtonRef = useRef(null);
  const textareaRef = useRef(null); 
  const newItemTextareaRef = useRef(null); 

  const studyQueueSet = useMemo(() => new Set(studyQueue), [studyQueue]);

  const csvChangeSummary = useMemo(
      () => getTableChangeSummary(csvBaselineContent, tableContent),
      [csvBaselineContent, tableContent]
  );
  const isCsvDirty = csvChangeSummary.isDirty;
  const isMultiSourceMode = Boolean(sourcePack.main?.baselineContent);
  const sourceDiagnostics = useMemo(() => getSourceDiagnostics(sourcePack), [sourcePack]);
  const sourceChangeSummaries = useMemo(() => {
      const currentRecords = parseTableRecords(tableContent);
      const summaries = {};
      V510_SOURCE_KEYS.forEach(key => {
          summaries[key] = sourcePack[key]?.baselineContent
              ? getSourceChangeSummary(key, sourcePack[key].baselineContent, currentRecords, sourcePack)
              : { added: 0, modified: 0, deleted: 0, total: 0, isDirty: false };
      });
      return summaries;
  }, [sourcePack, tableContent]);
  const dirtySourceKeys = useMemo(() => V510_SOURCE_KEYS.filter(key => sourceChangeSummaries[key]?.isDirty), [sourceChangeSummaries]);

  const advancedDatasetStats = useMemo(() => {
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
  }, [playlist]);

  const masterFilteredPlaylist = useMemo(() => {
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
  }, [playlist, masterFilter, masterSearch, csvChangeSummary.byId]);

  const currentPlayerList = useMemo(() => {
      if (mode === 'text') return playlist;
      if (mode === 'table') {
         if (tableViewMode === 'study') return playlist.filter(item => studyQueueSet.has(item.id));
         return masterFilteredPlaylist;
      }
      return playlist;
  }, [playlist, mode, tableViewMode, studyQueueSet, masterFilteredPlaylist]);

  const activePlaybackList = useMemo(() => {
      if (!playingContext) return [];
      const baseList = playingContext === 'text'
        ? playlist
        : (playingContext === 'study' ? playlist.filter(item => studyQueueSet.has(item.id)) : masterFilteredPlaylist);
      if (vocabularyPlayOrder !== 'shuffle') return baseList;
      const signature = getPlaybackListSignature(baseList);
      if (activeVocabularyOrder.context !== playingContext || activeVocabularyOrder.signature !== signature) return baseList;
      return reorderPlaybackListByIds(baseList, activeVocabularyOrder.ids);
  }, [playingContext, playlist, studyQueueSet, masterFilteredPlaylist, vocabularyPlayOrder, activeVocabularyOrder]);


  useEffect(() => {
      if (!isCsvDirty) return undefined;
      const handleBeforeUnload = (event) => {
          event.preventDefault();
          event.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCsvDirty]);

  // v5.8.3: debounce-save the WORKING COPY to ProLingo cache. This never marks the CSV clean.
  useEffect(() => {
      if (!isCsvDirty || mode !== 'table' || !currentDeckName.trim()) return undefined;
      const timer = window.setTimeout(() => {
          const records = parseTableRecords(tableContent);
          const entry = {
              content: tableContent,
              baselineContent: csvBaselineContent,
              sources: sourcePack,
              meta: {
                  maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
                  maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
                  importedRowCount: importedRowCount || records.filter(item => !String(item.vocabId || '').startsWith('USR_')).length
              }
          };
          setSavedDecks(prev => {
              const next = { ...prev, [currentDeckName]: entry };
              try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
              catch (err) { console.warn('Draft cache quota exceeded:', err); addLog('Warn', 'Autosave draft could not persist because browser cache is full.'); }
              return next;
          });
          setSelectedDeckId(currentDeckName);
          setLastDraftAutoSaveAt(Date.now());
      }, 700);
      return () => window.clearTimeout(timer);
  }, [isCsvDirty, mode, currentDeckName, tableContent, csvBaselineContent, sourcePack, sequenceHighWater, manualIdHighWater, importedRowCount]);

  const aiVoices = [
    { id: "Kore", label: "Kore (F)", gender: "Female" },
    { id: "Zephyr", label: "Zephyr (F)", gender: "Female" },
    { id: "Puck", label: "Puck (M)", gender: "Male" },
    { id: "Fenrir", label: "Fenrir (M)", gender: "Male" },
    { id: "Charon", label: "Charon (M)", gender: "Male" }
  ];

  // --- NEW: SYNC BODY BACKGROUND WITH THEME (Fixes Mobile Bounce "White Layer" issue) ---
  useEffect(() => {
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      // Colors match bg-slate-50 and bg-slate-900
      document.body.style.backgroundColor = isDark ? '#0f172a' : '#f8fafc';
  }, [theme]);

  // --- INITIALIZE SILENT AUDIO (ROBUST WAV) ---
  useEffect(() => {
      // Create 30 seconds of silence WAV
      const silentWavBlob = new Blob([encodeWAV(new Int16Array(48000 * 30))], { type: 'audio/wav' });
      const url = URL.createObjectURL(silentWavBlob);
      silentWavUrlRef.current = url;

      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.01; // Tiny volume to ensure system treats as active audio
      silentAudioRef.current = audio;
      
      return () => {
          if (silentAudioRef.current) {
              silentAudioRef.current.pause();
              silentAudioRef.current = null;
          }
          if (silentWavUrlRef.current) {
              URL.revokeObjectURL(silentWavUrlRef.current);
          }
      };
  }, []);

  // --- SCROLL AUTO-HIDE LOGIC (UPDATED WITH FLAG & TAB CHECK) ---
  useEffect(() => {
      const handleScroll = () => {
          if (!isMobile) return; 
          
          const currentScrollY = window.scrollY;

          // FIX: If we are in the middle of an auto-scroll, IGNORE scroll events to prevent glitch
          // This is SPECIFIC to the HEADER VISIBILITY LOGIC
          if (isAutoScrolling.current) {
              lastScrollY.current = currentScrollY; // FIX: Keep updating so we don't have a jump
              return;
          }

          // FIX 2: If we are NOT in player tab (e.g. tools/logs), ALWAYS show header
          if (mobileTab !== 'player') {
              setShowAppBar(true);
              lastScrollY.current = currentScrollY; // Keep updating for smooth return
              return;
          }
          
          const diff = currentScrollY - lastScrollY.current;

          // Logic Lebih Strict:
          // Hide jika scroll ke bawah dan bukan di paling atas
          if (diff > 10 && currentScrollY > 50) {
              setShowAppBar(false);
          } 
          // Show HANYA jika scroll ke atas signifikan ATAU di paling atas
          else if (diff < -10 || currentScrollY < 50) {
              setShowAppBar(true);
          }
          // Jika diff kecil (diam/jitter), jangan ubah status header
          
          lastScrollY.current = currentScrollY;
      };
      
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, mobileTab]);

  // --- NEW: USELAYOUTEFFECT FOR INSTANT SCROLL RESTORATION ---
  useLayoutEffect(() => {
      // If we have a pending scroll restoration from handleTabSwitch
      if (pendingScrollRestoration.current !== null) {
          const target = pendingScrollRestoration.current;
          
          // 1. Force isAutoScrolling to true (blocks header hiding)
          isAutoScrolling.current = true;
          
          // 2. Perform the DOM Scroll
          const restoreScroll = () => {
               if (isMobile) {
                  window.scrollTo({ top: target, behavior: 'auto' });
               } else if (listContainerRef.current) {
                  listContainerRef.current.scrollTop = target;
               }
          };

          restoreScroll();

          // FIX: Force a double check for "white screen" issues on mode switch
          // Sometimes Virtual List needs a second tick to realize heights changed
          requestAnimationFrame(() => {
              restoreScroll();
          });
          
          // 3. Clear the pending ref
          pendingScrollRestoration.current = null;
          
          // 4. Reset lock after a short delay (once scroll event storm settles)
          setTimeout(() => {
              isAutoScrolling.current = false;
          }, 150);
      }
  }, [tableViewMode, mode, mobileTab, isMobile]); // Trigger immediately after mode changes trigger a re-render

  useEffect(() => {
      const handleResize = () => {
          const width = window.innerWidth;
          const mobile = width < 768;
          setIsMobile(mobile);
          setIsSidebarOpen(!mobile);

          if (!mobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
          
          if (mobile) {
              setRowHeights({ table: DEFAULT_ROW_HEIGHT_MOBILE, text: 100 });
              setContainerHeight(window.innerHeight); 
          } else {
              setRowHeights({ table: DEFAULT_ROW_HEIGHT_PC, text: 70 });
          }
      };
      
      handleResize();
      window.addEventListener('resize', handleResize);
      setTimeout(() => {
          if (!isMobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
      }, 500);

      const handleGlobalClick = () => setActiveMenuId(null);
      window.addEventListener('click', handleGlobalClick);

      return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('click', handleGlobalClick);
      };
  }, [isMobile, mobileTab]);
  
  useEffect(() => {
    tableViewModeRef.current = tableViewMode;
  }, [tableViewMode]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);
  
  useEffect(() => {
    playbackSequenceRef.current = playbackSequence;
    try {
      window.localStorage.setItem('prolingo_playback_sequence_v511', JSON.stringify(playbackSequence));
    } catch (error) {
      console.warn('Unable to persist playback sequence:', error);
    }
  }, [playbackSequence]);

  useEffect(() => {
    playbackDelaysRef.current = normalizePlaybackDelays(playbackDelays);
    try {
      window.localStorage.setItem('prolingo_playback_delays_v511', JSON.stringify(playbackDelaysRef.current));
    } catch (error) {
      console.warn('Unable to persist playback delays:', error);
    }
  }, [playbackDelays]);

  useEffect(() => {
    vocabularyPlayOrderRef.current = vocabularyPlayOrder;
    try {
      window.localStorage.setItem('prolingo_vocabulary_play_order_v511', vocabularyPlayOrder);
    } catch (error) {
      console.warn('Unable to persist vocabulary play order:', error);
    }
    if (vocabularyPlayOrder === 'sequential') {
      const emptyOrder = createEmptyVocabularyOrder();
      activeVocabularyOrderRef.current = emptyOrder;
      setActiveVocabularyOrder(emptyOrder);
    }
  }, [vocabularyPlayOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem('prolingo_control_section_v5116', sidebarSection);
    } catch (error) {
      console.warn('Unable to persist control section:', error);
    }
  }, [sidebarSection]);

  useEffect(() => {
    activeVocabularyOrderRef.current = activeVocabularyOrder;
  }, [activeVocabularyOrder]);

  useEffect(() => {
      selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);
  
  useEffect(() => {
      selectedIndonesianVoiceRef.current = selectedIndonesianVoice;
  }, [selectedIndonesianVoice]);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setUserApiKey(savedKey);

    const saved = localStorage.getItem('pronunciation_decks');
    if (saved) {
        setSavedDecks(JSON.parse(saved));
    }

    const demoData = `No\tWord\tSentence\tMeaning\n1\tabandon\tThe captain gave the order to abandon ship.\tKapten memberi perintah untuk meninggalkan kapal\n2\tability\tHe has the ability to learn fast.\tDia memiliki kemampuan untuk belajar dengan cepat`;
    setTableContent(demoData);
    setCsvBaselineContent(canonicalizeTableContent(demoData));
    setSequenceHighWater(2);
    setManualIdHighWater(0);
    setImportedRowCount(2);
    setTextContent("Hello world.\nThis is line number two.\nEach line is treated as an item.");
    
    if (demoData.trim().length > 0) {
      setLockedStates(prev => ({ ...prev, table: true }));
    }

    addLog("System", "Ready. ProLingo v5.11.6 (UI Navigation Shell).");

    return () => forceStopAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- VOICE PERSISTENCE (Browser TTS) ---
  useEffect(() => {
    const loadVoices = () => {
      const allVoices = synth.getVoices();
      
      if (allVoices.length === 0) return;

      // Filter and Sort English Voices: UK > US > AU > SG > Others
      let engVoices = allVoices.filter(v => v.lang.startsWith('en'));
      engVoices.sort((a, b) => {
          const getPriority = (lang) => {
              if (lang.includes('GB') || lang.includes('UK')) return 1;
              if (lang.includes('US')) return 2;
              if (lang.includes('AU')) return 3;
              if (lang.includes('SG')) return 4;
              return 5;
          };
          return getPriority(a.lang) - getPriority(b.lang);
      });
      setVoices(engVoices);
      
      // Default English Voice Logic
      const defaultEng = engVoices[0]; // First item (UK preferred)
      if (!selectedVoiceRef.current && defaultEng) setSelectedVoice(defaultEng);

      // Filter and Sort Indonesian Voices
      let idVoices = allVoices.filter(v => v.lang.includes('ID') || v.lang.includes('id') || v.lang.toLowerCase().includes('indones'));
      setIndonesianVoices(idVoices);
      const defaultId = idVoices.find(v => v.name.includes('Google') || v.name.includes('Indonesia')) || idVoices[0];
      
      if (!selectedIndonesianVoiceRef.current && defaultId) setSelectedIndonesianVoice(defaultId);
    };
    
    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

    const pollInterval = setInterval(() => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
            loadVoices();
            if (voices.length > 5) clearInterval(pollInterval); 
        }
    }, 500);

    const timeoutId = setTimeout(() => clearInterval(pollInterval), 5000);

    return () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
      if (currentIndex !== null) {
          const scrollAction = () => {
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              const isBackgroundPlayback = (isPlaying || independentPlayingId) && (playingContext && playingContext !== (mode === 'table' ? tableViewMode : 'text'));
              const indexChanged = prevCurrentIndex.current !== currentIndex;
              
              const shouldScroll = justSwitchedTab.current || (indexChanged && !isBackgroundPlayback && isPlaying);

              if (activeItem && shouldScroll) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  
                  if (isMobile) {
                      isAutoScrolling.current = true;
                      
                      if (!isSidebarOpen && mobileTab === 'player') {
                          setShowAppBar(false); 
                      } else {
                          setShowAppBar(true); 
                      }
                      
                      const targetIdx = Math.max(0, idx - 1);
                      const containerPadding = mode === 'table' ? 160 : 120;
                      const targetScrollY = containerPadding + (targetIdx * rowH);
                      
                      window.scrollTo({
                          top: targetScrollY,
                          behavior: 'smooth'
                      });

                      let lastPos = window.scrollY;
                      let samePosCount = 0;

                      const checkScrollComplete = () => {
                          const currentPos = window.scrollY;
                          if (Math.abs(currentPos - lastPos) < 1) {
                              samePosCount++;
                              if (samePosCount > 3) {
                                  setTimeout(() => {
                                      isAutoScrolling.current = false; 
                                  }, 500);
                                  return; 
                              }
                          } else {
                              samePosCount = 0;
                              lastPos = currentPos;
                          }
                          requestAnimationFrame(checkScrollComplete);
                      };
                      setTimeout(() => requestAnimationFrame(checkScrollComplete), 50);

                  } else {
                      const targetTop = idx * rowH;
                      if (listContainerRef.current) {
                          listContainerRef.current.scrollTo({
                              top: targetTop,
                              behavior: 'smooth'
                          });
                      }
                  }
                  
                  justSwitchedTab.current = false;
                  prevCurrentIndex.current = currentIndex; 
              } else if (!indexChanged) {
                  prevCurrentIndex.current = currentIndex;
              }
          };

          const timer = setTimeout(scrollAction, 100);
          return () => clearTimeout(timer);
      }
  }, [currentIndex, mode, currentPlayerList, isPlaying, playingContext, tableViewMode, independentPlayingId, rowHeights, isMobile, showAppBar, isSidebarOpen, mobileTab]); 

  // --- MODIFIED SCROLL LISTENER FOR MOBILE (BLOCKER ADDED) ---
  useEffect(() => {
      const handleWindowScroll = () => {
          if (isMobile) {
              setScrollTop(window.scrollY);
              setContainerHeight(window.innerHeight); 
          }
      };

      if (isMobile) {
          window.addEventListener('scroll', handleWindowScroll);
          handleWindowScroll(); 
      } else {
          window.removeEventListener('scroll', handleWindowScroll);
      }

      return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [isMobile]);

  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [systemLogs, showLogs, mobileTab]);

  const addLog = (type, message) => {
      const timestamp = new Date().toLocaleTimeString();
      setSystemLogs(prev => {
          const next = [...prev, { time: timestamp, type, message }];
          // LIMIT UPDATED: 50 -> 20
          if (next.length > 20) return next.slice(next.length - 20); 
          return next;
      });
  };

  useEffect(() => {
    try {
        if (mode === 'text') {
            const safeText = typeof textContent === 'string' ? textContent : String(textContent || "");
            const lines = safeText.split('\n').filter(l => l.trim());
            const newPlaylist = lines.map((line, idx) => ({
                id: `TEXT_${String(idx + 1).padStart(6, '0')}`,
                vocabId: null,
                displayId: idx + 1,
                text: line.trim(),
                isStructured: false
            }));
            setPlaylist(newPlaylist);
            setBatchConfig(prev => ({ ...prev, end: Math.max(1, newPlaylist.length) }));
            return;
        }

        const parsed = parseTableRecords(tableContent)
          .sort((a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0));
        const currentMaxNo = getMaxAssignedNoFromRecords(parsed);
        setPlaylist(parsed);
        // Raw/manual edits may introduce a higher NO, but deletion must never lower the counter.
        setSequenceHighWater(prev => Math.max(prev, currentMaxNo));
        setManualIdHighWater(prev => Math.max(prev, getMaxManualIdFromRecords(parsed)));
        setBatchConfig(prev => ({ ...prev, end: Math.max(1, sequenceHighWater, currentMaxNo) }));
    } catch (error) {
        console.error("Error parsing content:", error);
        addLog("Error", `Gagal memproses data: ${error.message}`);
    }
  }, [tableContent, textContent, mode, sequenceHighWater]); 

  const resetFullState = () => {
    [...Object.values(localAudioMapTable), ...Object.values(localAudioMapText)].forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) { console.warn("Failed to revoke audio URL", e); }
    });
    setLocalAudioMapTable({});
    setLocalAudioMapText({});
    setAudioStatusTable('idle');
    setAudioStatusText('idle');
    setCurrentIndex(null); 
    setMasterIndex(null);
    setStudyIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    setStudyQueue([]); 
    setTableViewMode('master');
    forceStopAll(); 
    addLog("System", "State fully reset.");
  };

  const pushUndoSnapshot = useCallback((label, snapshot = tableContent) => {
      setUndoStack(prev => [...prev.slice(-19), { label, content: snapshot, at: Date.now() }]);
  }, [tableContent]);

  const undoLastDataChange = () => {
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      const restoredRecords = parseTableRecords(last.content);
      const validIds = new Set(restoredRecords.map(item => item.id));
      forceStopAll();
      setTableContent(last.content);
      setStudyQueue(prev => prev.filter(id => validIds.has(id)));
      setUndoStack(prev => prev.slice(0, -1));
      addLog('Data', `Undo: ${last.label}.`);
  };

  const applyChangeRevert = (id, type) => {
      const baselineRecords = parseTableRecords(csvBaselineContent);
      const currentRecords = parseTableRecords(tableContent);
      const baselineItem = baselineRecords.find(item => item.id === id);
      let nextRecords = [...currentRecords];

      pushUndoSnapshot(`revert ${type} ${id}`);
      forceStopAll();
      if (type === 'added') {
          nextRecords = nextRecords.filter(item => item.id !== id);
          setStudyQueue(prev => prev.filter(queueId => queueId !== id));
      } else if (type === 'modified' && baselineItem) {
          nextRecords = nextRecords.map(item => item.id === id ? baselineItem : item);
      } else if (type === 'deleted' && baselineItem) {
          if (nextRecords.some(item => getRecordAudioNo(item) === getRecordAudioNo(baselineItem) || item.id === baselineItem.id)) {
              alert(`Tidak bisa restore ${id}: VOCAB_ID atau audio slot sudah dipakai.`);
              setUndoStack(prev => prev.slice(0, -1));
              return;
          }
          nextRecords.push(baselineItem);
      }

      nextRecords.sort((a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0));
      setTableContent(serializeTableRecords(nextRecords));
      addLog('Data', `Reverted ${type}: ${id}.`);
  };

  const revertAllChanges = () => {
      pushUndoSnapshot('revert all CSV changes');
      const baselineRecords = parseTableRecords(csvBaselineContent);
      const validIds = new Set(baselineRecords.map(item => item.id));
      forceStopAll();
      setTableContent(csvBaselineContent);
      setStudyQueue(prev => prev.filter(id => validIds.has(id)));
      setIsRevertAllConfirmOpen(false);
      setIsChangeReviewOpen(false);
      addLog('Data', 'All unsaved CSV changes reverted to last saved snapshot.');
  };

  const openManualAdd = () => {
      const records = parseTableRecords(tableContent);
      const nextNo = Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)) + 1;
      setManualEditingId(null);
      setManualAdvancedOpen(false);
      setManualForm({ ...createEmptyManualForm(), vocabId: getNextManualVocabId(records, manualIdHighWater), no: nextNo });
      setIsManualEditorOpen(true);
  };

  const openManualEdit = (item) => {
      if (!item?.isStructured) return;
      setManualEditingId(item.id);
      setManualAdvancedOpen(Boolean(
          item.exp1En || item.exp1Idn || item.exp2En || item.exp2Idn || item.exp3En || item.exp3Idn ||
          item.exp4En || item.exp4Idn || item.exp5En || item.exp5Idn
      ));
      setManualForm({
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
      setIsManualEditorOpen(true);
  };

  const closeManualEditor = () => {
      setIsManualEditorOpen(false);
      setManualEditingId(null);
      setManualAdvancedOpen(false);
      setManualForm(createEmptyManualForm());
  };

  const saveManualVocabulary = () => {
      if (!manualForm.word.trim()) {
          alert("WORDS wajib diisi.");
          return;
      }

      const currentRecords = parseTableRecords(tableContent);
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
              alert(`VOCAB_ID ${vocabId} sudah ada.`);
              return;
          }
          nextRecords = currentRecords.map(item => item.id === manualEditingId ? record : item);
      } else {
          if (currentRecords.some(item => item.id === vocabId)) {
              alert(`VOCAB_ID ${vocabId} sudah ada.`);
              return;
          }
          nextRecords = [...currentRecords, record];
      }

      nextRecords = nextRecords
          .map((item, idx) => ({ ...item, no: Number(item.no || item.displayId) || idx + 1 }))
          .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));

      const validation = validateTableRecords(nextRecords);
      if (!validation.isValid) {
          alert(`Data belum valid:

${validation.errors.slice(0, 8).join('\n')}`);
          return;
      }

      pushUndoSnapshot(`${manualEditingId ? 'edit' : 'add'} ${vocabId}`);
      setTableContent(serializeTableRecords(nextRecords));
      if (!manualEditingId) {
          setSequenceHighWater(prev => Math.max(prev, normalizedNo));
          const manualMatch = vocabId.match(/^USR_(\d+)$/i);
          if (manualMatch) setManualIdHighWater(prev => Math.max(prev, Number.parseInt(manualMatch[1], 10) || 0));
      }
      setLockedStates(prev => ({ ...prev, table: true }));
      if (mode !== 'table') handleModeSwitch('table');
      addLog("Data", `${manualEditingId ? 'Updated' : 'Added'} ${vocabId} (${record.word}).`);
      closeManualEditor();
  };

  const deleteStructuredItem = (item) => {
      if (!item?.isStructured) return;
      setPendingDeleteItem(item);
  };

  const confirmDeleteStructuredItem = () => {
      const item = pendingDeleteItem;
      if (!item?.isStructured) {
          setPendingDeleteItem(null);
          return;
      }

      pushUndoSnapshot(`delete ${item.vocabId || item.id}`);
      forceStopAll();
      const records = parseTableRecords(tableContent).filter(row => row.id !== item.id);
      setTableContent(serializeTableRecords(records));
      setStudyQueue(prev => prev.filter(id => id !== item.id));
      if (currentIndex === item.id) setCurrentIndex(null);
      if (playingIndex === item.id) setPlayingIndex(null);
      if (expandedAdvancedId === item.id) setExpandedAdvancedId(null);

      // Keep loaded audio resident during this session so Undo/Restore can reconnect instantly.
      // With no matching row it is effectively detached; a future folder scan reports disk-only files as orphan.
      setPendingDeleteItem(null);
      addLog("Data", `Deleted ${item.vocabId || item.id} (${item.word}). CSV now has unsaved changes.`);
  };

  const exportTableCSV = (scope = 'master') => {
      const records = scope === 'study'
          ? playlist.filter(item => item.isStructured && studyQueueSet.has(item.id))
          : playlist.filter(item => item.isStructured);

      if (!records.length) {
          alert(scope === 'study' ? "Study Queue kosong." : "Tidak ada data untuk diekspor.");
          return;
      }

      const suffix = scope === 'study' ? 'study_queue' : 'master';
      const filename = `${sanitizeFilename(currentDeckName || 'ProLingo')}_${suffix}_v5.11.6.csv`;
      const exportBaseName = filename.replace(/\.csv$/i, '');
      // Keep sequence history locally without polluting the CSV schema. Re-importing this exact export
      // in the same browser restores deleted-tail/high-water information.
      localStorage.setItem(`prolingo_csv_meta:${exportBaseName}`, JSON.stringify({
          maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(playlist)),
          maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(playlist)),
          importedRowCount
      }));
      downloadTextFile(serializeTableRecords(records), filename);
      addLog("Export", `${records.length} items exported: ${filename}`);
  };


  const saveUpdatedCSV = async () => {
      if (isMultiSourceMode) {
          exportMergedDataset();
          return;
      }
      const records = parseTableRecords(tableContent)
          .sort((a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0));
      if (!records.length) {
          alert('Tidak ada data CSV untuk disimpan.');
          return;
      }
      const validation = validateTableRecords(records);
      if (!validation.isValid) {
          alert(`CSV belum bisa disimpan karena ada masalah:

${validation.errors.slice(0, 10).join('\n')}`);
          return;
      }
      const canonicalContent = serializeTableRecords(records);
      const filename = `${sanitizeFilename(currentDeckName || 'ProLingo')}.csv`;
      let fileSaved = false;

      try {
          if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
              const handle = await window.showSaveFilePicker({
                  suggestedName: filename,
                  types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }]
              });
              const writable = await handle.createWritable();
              await writable.write(canonicalContent);
              await writable.close();
              fileSaved = true;
          } else {
              downloadTextFile(canonicalContent, filename);
              fileSaved = true;
          }
      } catch (err) {
          if (err?.name === 'AbortError') {
              addLog('Data', 'Save Updated CSV cancelled.');
              return;
          }
          console.error(err);
          alert(`Gagal menyimpan CSV: ${err.message || err}`);
          return;
      }

      if (!fileSaved) return;

      const meta = {
          maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
          maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
          importedRowCount: importedRowCount || records.filter(item => !String(item.vocabId || '').startsWith('USR_')).length
      };
      const entry = { content: canonicalContent, baselineContent: canonicalContent, sources: createEmptySourcePack(), meta };
      const newDecks = { ...savedDecks, [currentDeckName]: entry };
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      localStorage.setItem(`prolingo_csv_meta:${currentDeckName}`, JSON.stringify(meta));
      setSelectedDeckId(currentDeckName);
      setTableContent(canonicalContent);
      setCsvBaselineContent(canonicalContent);
      setUndoStack([]);
      setIsChangeReviewOpen(false);
      setIsRevertAllConfirmOpen(false);
      addLog('Success', `Updated CSV saved: ${filename}. Change markers reset.`);
  };

  const handleBatchRangeBlur = (field) => {
      let val = parseInt(batchConfig[field]);
      const max = mode === 'table'
          ? Math.max(1, sequenceHighWater, getMaxAssignedNoFromRecords(playlist))
          : (playlist.length || 1);
      
      if (isNaN(val)) val = 1;

      if (field === 'start') {
          if (val < 1) val = 1;
          if (val > max) val = max;
          if (val > parseInt(batchConfig.end)) val = parseInt(batchConfig.end);
      } else if (field === 'end') {
          if (val < 1) val = 1;
          if (val > max) val = max;
          if (val < parseInt(batchConfig.start)) val = parseInt(batchConfig.start);
      }

      setBatchConfig(prev => ({ ...prev, [field]: val }));
  };

  const handleInsertTab = () => {
    if (mode === 'table') {
        setTableContent(prev => prev + "\t");
    } else {
        setTextContent(prev => prev + "\t");
    }
    if(textareaRef.current) {
        textareaRef.current.focus();
    }
  };
  
  const handleAddTextItem = () => {
      if (!newTextItem.trim()) return;
      const newContent = textContent ? textContent + "\n" + newTextItem : newTextItem;
      setTextContent(newContent);
      setNewTextItem("");
      if (newItemTextareaRef.current) {
          newItemTextareaRef.current.style.height = 'auto'; 
      }
      addLog("Action", "Text added.");
  };

  const handleDeleteTextItem = (indexToDelete) => {
      const targetItem = playlist[indexToDelete];
      const newLines = playlist
          .filter((_, idx) => idx !== indexToDelete)
          .map(item => item.text);
      
      setTextContent(newLines.join('\n'));
      addLog("Action", `Item #${indexToDelete + 1} deleted.`);
      if (targetItem && currentIndex === targetItem.id) forceStopAll();
  };

  const toggleStudyItem = (id) => {
      setStudyQueue(prev => {
          if (prev.includes(id)) {
              return prev.filter(x => x !== id);
          } else {
              return [...prev, id];
          }
      });
  };

  const handleRangeAdd = () => {
      if (!rangeInput) return;
      const parts = rangeInput.split(/[,+\s]+/);
      const newIds = new Set();

      parts.forEach(part => {
          if (part.includes('-')) {
              const [start, end] = part.split('-').map(Number);
              if (!isNaN(start) && !isNaN(end)) {
                  const min = Math.min(start, end);
                  const max = Math.max(start, end);
                  for (let i = min; i <= max; i++) {
                      const item = playlist.find(p => p.displayId === i);
                      if (item) newIds.add(item.id);
                  }
              }
          } else {
              const num = parseInt(part);
              if (!isNaN(num)) {
                  const item = playlist.find(p => p.displayId === num);
                  if (item) newIds.add(item.id);
              }
          }
      });

      setStudyQueue(prev => {
          const combined = new Set([...prev, ...newIds]);
          return Array.from(combined);
      });
      setRangeInput("");
      addLog("Study", `Added ${newIds.size} items to Queue.`);
  };

  const clearStudyQueue = () => {
      setStudyQueue([]);
      addLog("Study", "Queue cleared.");
  };

  const toggleCellReveal = (e, cellKey) => {
      if (!isMemoryMode) return;
      e.stopPropagation(); 

      if (revealedCells[cellKey]) {
          clearTimeout(revealedCells[cellKey]);
          setRevealedCells(prev => {
              const next = { ...prev };
              delete next[cellKey];
              return next;
          });
      } else {
          const timerId = setTimeout(() => {
              setRevealedCells(prev => {
                  const next = { ...prev };
                  delete next[cellKey];
                  return next;
              });
          }, 4000); 

          setRevealedCells(prev => ({ ...prev, [cellKey]: timerId }));
      }
  };

  const handleMenuToggle = (rowId) => {
      setActiveMenuId(prev => prev === rowId ? null : rowId);
  };

  // --- AUDIO ENGINE v5.8 ---
  const getLocalAudioUrl = (item, part) => {
    if (mode === 'table') {
      const key = `${getStableAudioIdentity(item)}_${part}`;
      return localAudioMapTable[key];
    }
    return localAudioMapText[getStableAudioIdentity(item)];
  };

  const settlePlaybackPromise = () => {
      const resolver = playbackResolveRef.current;
      playbackResolveRef.current = null;
      if (resolver) resolver();
  };

  const waitWhilePaused = async () => {
      while (pauseStateRef.current && !stopSignalRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
      }
  };

  // Delay that remains responsive to Pause / Stop / playback-session changes.
  // Paused time does not consume the configured learning gap.
  const waitPlaybackDelay = async (durationMs, sessionId = playbackSessionRef.current) => {
      let remaining = Math.max(0, Number(durationMs) || 0);
      while (remaining > 0) {
          await waitWhilePaused();
          if (stopSignalRef.current || sessionId !== playbackSessionRef.current) return false;
          const slice = Math.min(100, remaining);
          await new Promise(resolve => setTimeout(resolve, slice));
          if (!pauseStateRef.current) remaining -= slice;
      }
      return !stopSignalRef.current && sessionId === playbackSessionRef.current;
  };

  const playTTS = (textToRead, overrideVoice = null) => {
    return new Promise((resolve) => {
      const targetVoice = overrideVoice || selectedVoiceRef.current;
      if (stopSignalRef.current || !targetVoice || !String(textToRead || '').trim()) {
          resolve();
          return;
      }

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(textToRead);
      currentUtteranceRef.current = utterance;
      let settled = false;

      const finish = () => {
          if (settled) return;
          settled = true;
          if (playbackResolveRef.current === finish) playbackResolveRef.current = null;
          currentUtteranceRef.current = null;
          resolve();
      };

      playbackResolveRef.current = finish;
      utterance.voice = targetVoice;
      utterance.rate = Number(rate) || 1;
      utterance.pitch = Number(pitch) || 1;
      utterance.onend = finish;
      utterance.onerror = finish;

      setTimeout(() => {
          if (stopSignalRef.current) finish();
          else synth.speak(utterance);
      }, 10);
    });
  };

  const playSource = (textToRead, item, part) => {
    return new Promise((resolve) => {
      if (stopSignalRef.current || !String(textToRead || '').trim()) {
          resolve();
          return;
      }

      const audioUrl = preferLocalAudio ? getLocalAudioUrl(item, part) : null;
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        currentAudioObjRef.current = audio;
        audio.playbackRate = Number(rate) || 1;
        let settled = false;

        const cleanupAudio = () => {
            if (currentAudioObjRef.current === audio) currentAudioObjRef.current = null;
            audio.onended = null;
            audio.onerror = null;
            if (playbackResolveRef.current === finish) playbackResolveRef.current = null;
        };

        const finish = () => {
            if (settled) return;
            settled = true;
            cleanupAudio();
            resolve();
        };

        const fallbackToTTS = () => {
            if (settled) return;
            settled = true;
            cleanupAudio();
            if (stopSignalRef.current) {
                resolve();
                return;
            }
            const fallbackVoice = isIndonesianAudioPart(part) ? selectedIndonesianVoiceRef.current : null;
            playTTS(textToRead, fallbackVoice).then(resolve);
        };

        playbackResolveRef.current = finish;
        audio.onended = finish;
        audio.onerror = () => {
          addLog("Warn", `Audio fail ${item.vocabId || item.displayId}/${part}. Fallback TTS.`);
          fallbackToTTS();
        };

        audio.play().catch(() => fallbackToTTS());
        return;
      }

      const fallbackVoice = isIndonesianAudioPart(part) ? selectedIndonesianVoiceRef.current : null;
      playTTS(textToRead, fallbackVoice).then(resolve);
    });
  };

  const pausePlayback = () => {
      if (!isPlaying || isPaused) return;
      pauseStateRef.current = true;
      if (currentAudioObjRef.current && !currentAudioObjRef.current.paused) currentAudioObjRef.current.pause();
      if (synth.speaking && !synth.paused) synth.pause();
      if (silentAudioRef.current) silentAudioRef.current.pause();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
      setIsPaused(true);
      addLog("Playback", "Paused.");
  };

  const resumePlayback = () => {
      if (!isPlaying || !isPaused) return;
      pauseStateRef.current = false;
      if (currentAudioObjRef.current?.paused) currentAudioObjRef.current.play().catch(() => {});
      if (synth.paused) synth.resume();
      if (silentAudioRef.current?.paused) silentAudioRef.current.play().catch(() => {});
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      setIsPaused(false);
      addLog("Playback", "Resumed.");
  };

  const safePlayTransition = async (actionCallback) => {
    forceStopAll();
    await new Promise(r => setTimeout(r, 120));
    stopSignalRef.current = false;
    pauseStateRef.current = false;
    await actionCallback();
  };

  const handleIndependentPlay = (item, part, uiId) => {
    setActiveMenuId(null);
    if (independentPlayingId === uiId) {
        forceStopAll();
        return;
    }

    safePlayTransition(async () => {
      const playbackSession = playbackSessionRef.current;
      setIndependentPlayingId(uiId);
      setPlayingContext(mode === 'table' ? tableViewMode : 'text');
      setPlayingIndex(item.id);
      setCurrentIndex(item.id);
      
      const textToPlay = getItemPartText(item, part);
      if (!String(textToPlay || '').trim()) {
          setIndependentPlayingId(null);
          setSpeakingPart(null);
          return;
      }

      setSpeakingPart(part); 
      await playSource(textToPlay, item, part);
      if (playbackSession !== playbackSessionRef.current) return;
      setIndependentPlayingId(null);
      setSpeakingPart(null); 
    });
  };

  // --- HELPER FOR SCROLL PERSISTENCE ---
  const getScrollPos = () => isMobile ? window.scrollY : (listContainerRef.current?.scrollTop || 0);
  
  const _setScrollPos = (val) => {
      if (isMobile) window.scrollTo({ top: val, behavior: 'auto' });
      else if (listContainerRef.current) listContainerRef.current.scrollTop = val;
  };

  const handleTabSwitch = (targetTab) => {
      if (targetTab === tableViewMode) return;
      
      // 1. Save current position
      const currentPos = getScrollPos();
      viewScrollPosRef.current[tableViewMode] = currentPos;

      const isSwitchingToPlayingContext = isPlaying && playingContext === targetTab;

      // FIX: Smart Header Visibility on Tab Switch
      if (isMobile) {
          if (isSwitchingToPlayingContext) {
              setShowAppBar(false); 
          } else {
              setShowAppBar(true);
          }
      }

      if (tableViewMode === 'master') setMasterIndex(currentIndex);
      else setStudyIndex(currentIndex);

      // --- LOGIC BARU: INSTANT JUMP JIKA PLAYING (Meniru handleMobileTabSwitch) ---
      let nextPos = 0;
      
      if (isSwitchingToPlayingContext && playingIndex !== null) {
          // Jika playing & switch ke context yang sama, HITUNG POSISI target
          const _activeItem = playlist.find(p => p.id === playingIndex); // Note: playlist used directly might need filtering context logic if complex
          
          // Filter playlist based on target tab to get correct index
          const targetList = targetTab === 'study' ? playlist.filter(item => studyQueueSet.has(item.id)) : playlist;
          const targetItem = targetList.find(p => p.id === playingIndex);

          if (targetItem) {
              const idx = targetList.indexOf(targetItem);
              const rowH = rowHeights[mode];
              
              // Hitung posisi (Mobile vs Desktop logic)
              if (isMobile) {
                  const containerPadding = mode === 'table' ? 160 : 120;
                  const targetIdx = Math.max(0, idx - 1);
                  nextPos = containerPadding + (targetIdx * rowH);
                  setShowAppBar(false); // Force hide header
              } else {
                  nextPos = idx * rowH;
              }
              
              // Non-aktifkan auto scroll useEffect karena kita sudah manual set
              justSwitchedTab.current = false; 
          } else {
              // Fallback ke posisi tersimpan
              nextPos = viewScrollPosRef.current[targetTab] || 0;
          }
      } else {
          // Jika tidak playing, restore posisi biasa
          nextPos = viewScrollPosRef.current[targetTab] || 0;
          justSwitchedTab.current = false;
      }

      // 3. SET PENDING SCROLL RESTORATION & BLOCK HEADER HIDING
      pendingScrollRestoration.current = nextPos;
      isAutoScrolling.current = true; 

      // 4. UPDATE STATE
      setScrollTop(nextPos); 
      setTableViewMode(targetTab);
      
      if (playingContext === targetTab && playingIndex !== null) {
          setCurrentIndex(playingIndex);
      } else {
          const restoredIndex = targetTab === 'master' ? masterIndex : studyIndex;
          setCurrentIndex(restoredIndex);
      }
      
      addLog("System", `View Switched to ${targetTab}.`);
  };

  const handleMobileTabSwitch = (targetMobileTab) => {
      if (targetMobileTab === mobileTab) return;

      // If leaving Player tab, save scroll
      if (mobileTab === 'player') {
          if (mode === 'table') viewScrollPosRef.current[tableViewMode] = window.scrollY;
          else viewScrollPosRef.current['text'] = window.scrollY;
      }

      // If entering Player tab, restore scroll
      if (targetMobileTab === 'player') {
          let targetPos = 0;
          
          if (isPlaying && currentIndex !== null) {
              // LOGIC BARU: Jika playing, hitung posisi item aktif agar INSTANT (tanpa animasi smooth)
              // Copy logic kalkulasi dari renderPlaylist
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              if (activeItem) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  const containerPadding = mode === 'table' ? 160 : 120;
                  const targetIdx = Math.max(0, idx - 1);
                  targetPos = containerPadding + (targetIdx * rowH);
                  
                  // Hide header explicitly saat kembali ke player yang sedang jalan
                  setShowAppBar(false); 
              } else {
                  // Fallback ke posisi manual jika item tidak ketemu
                  if (mode === 'table') targetPos = viewScrollPosRef.current[tableViewMode];
                  else targetPos = viewScrollPosRef.current['text'];
              }
          } else {
              // Restore Manual Position jika tidak playing
              if (mode === 'table') targetPos = viewScrollPosRef.current[tableViewMode];
              else targetPos = viewScrollPosRef.current['text'];
          }

          // Apply Instant Scroll via pending ref (picked up by useLayoutEffect)
          // Ini mencegah glitch karena dilakukan sebelum paint
          setScrollTop(targetPos);
          pendingScrollRestoration.current = targetPos;
          isAutoScrolling.current = true;
      }

      setMobileTab(targetMobileTab);
  };

  const getBasePlaybackListForContext = (context) => {
    if (context === 'study') return playlist.filter(item => studyQueueSet.has(item.id));
    if (context === 'master') return masterFilteredPlaylist;
    return playlist;
  };

  const resolveVocabularyPlaybackList = (baseList, context, options = {}) => {
    if (vocabularyPlayOrderRef.current !== 'shuffle') return baseList;
    const signature = getPlaybackListSignature(baseList);
    const existing = activeVocabularyOrderRef.current || createEmptyVocabularyOrder();
    const sameOrder = (
      !options.forceReshuffle &&
      existing.context === context &&
      existing.signature === signature &&
      existing.ids.length === baseList.length
    );

    if (sameOrder) {
      const ordered = reorderPlaybackListByIds(baseList, existing.ids);
      if (ordered.length === baseList.length) return ordered;
    }

    const shuffled = shuffleVocabularyItems(baseList, {
      anchorId: options.anchorId ?? null,
      avoidFirstId: options.avoidFirstId ?? null
    });
    const nextOrder = {
      context,
      signature,
      ids: shuffled.map(getPlaybackItemId),
      cycle: existing.context === context && existing.signature === signature ? (existing.cycle || 0) + 1 : 1
    };
    activeVocabularyOrderRef.current = nextOrder;
    setActiveVocabularyOrder(nextOrder);
    return shuffled;
  };

  const handleGlobalPlay = () => {
    setActiveMenuId(null);

    if (isPlaying) {
      if (isPaused) resumePlayback();
      else pausePlayback();
      return;
    }

    justSwitchedTab.current = true;
    if (playingIndex !== null && playingContext) {
        const baseList = getBasePlaybackListForContext(playingContext);
        const item = baseList.find(p => p.id === playingIndex);
        if (item) {
            startGlobalPlayback(item.id, playingContext);
            return;
        }
    }

    const targetContext = mode === 'table' ? tableViewMode : 'text';
    const baseList = getBasePlaybackListForContext(targetContext);
    const activeItem = baseList.find(p => p.id === currentIndex) || baseList[0];
    startGlobalPlayback(activeItem?.id ?? null, targetContext, {
      anchorShuffle: Boolean(activeItem)
    });
  };

  const handleManualRowClick = (item) => {
      setActiveMenuId(null);
      setIndependentPlayingId(null);

      const targetContext = mode === 'table' ? tableViewMode : 'text';
      setCurrentIndex(item.id);
      setPlayingIndex(item.id);
      setPlayingContext(targetContext);
      startGlobalPlayback(item.id, targetContext, {
        anchorShuffle: true,
        forceReshuffle: vocabularyPlayOrderRef.current === 'shuffle'
      });
  };

  const startGlobalPlayback = (startItemId = null, forcedContext = null, options = {}) => {
    let sessionMode = forcedContext || playingContext;
    if (!sessionMode || (playingIndex === null && !isPlaying)) {
        sessionMode = mode === 'table' ? tableViewMode : 'text';
        setPlayingContext(sessionMode);
    } else if (forcedContext) {
        setPlayingContext(forcedContext);
    }

    const baseList = getBasePlaybackListForContext(sessionMode);
    if (!baseList.length) return;

    const requestedId = startItemId == null ? null : String(startItemId);
    let listToPlay = resolveVocabularyPlaybackList(baseList, sessionMode, {
      forceReshuffle: Boolean(options.forceReshuffle),
      anchorId: options.anchorShuffle ? requestedId : null
    });

    let startIndex = requestedId === null
      ? 0
      : listToPlay.findIndex(item => String(item.id) === requestedId);
    if (startIndex < 0 || startIndex >= listToPlay.length) startIndex = 0;

    safePlayTransition(async () => {
      const playbackSession = playbackSessionRef.current;
      setIsPlaying(true);
      setIsPaused(false);
      pauseStateRef.current = false;
      let index = startIndex;
      addLog("Info", `Global Play (${sessionMode}) start • ${vocabularyPlayOrderRef.current === 'shuffle' ? 'Shuffle' : 'Sequential'} order.`);

      // --- FIX: START SILENT ANCHOR (AGGRESSIVE) ---
      if (silentAudioRef.current) {
          silentAudioRef.current.play().catch(e => console.warn("Silent Play Failed", e));
      }
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      // ---------------------------------

      while (index >= 0 && index < listToPlay.length && !stopSignalRef.current && playbackSession === playbackSessionRef.current) {
        await waitWhilePaused();
        if (stopSignalRef.current) break;
        // --- HEARTBEAT CHECK ---
        if (silentAudioRef.current && silentAudioRef.current.paused) {
             silentAudioRef.current.play().catch(() => {});
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        // -----------------------

        const item = listToPlay[index];
        setPlayingIndex(item.id); 

        if (sessionMode === 'master') setMasterIndex(item.id);
        else if (sessionMode === 'study') setStudyIndex(item.id);
        else setSavedIndices(prev => ({...prev, text: item.id}));

        if ((mode === 'table' && tableViewModeRef.current === sessionMode) || (mode === 'text' && sessionMode === 'text')) {
             setCurrentIndex(item.id);
        }

        const currentMode = playbackModeRef.current;
        const loops = (currentMode === 'repeat_2x') ? 2 : 1;

        for (let l = 0; l < loops; l++) {
          if (stopSignalRef.current) break;
          if (playbackModeRef.current !== currentMode && currentMode === 'repeat_2x' && l > 0) break;

          if (item.isStructured) {
            const expressionPairs = getAdvancedExpressionPairs(item);
            const activeSequence = playbackSequenceRef.current.filter(entry => entry.enabled);

            for (let sequenceIndex = 0; sequenceIndex < activeSequence.length; sequenceIndex++) {
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
              await waitWhilePaused();
              if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

              const sequencePart = activeSequence[sequenceIndex].key;
              let textToPlay = '';
              let sourcePart = sequencePart;

              if (sequencePart === 'word_en') {
                textToPlay = item.word || '';
                sourcePart = 'word';
              } else if (sequencePart === 'word_idn') {
                textToPlay = item.meaningWord || '';
                sourcePart = 'word_idn';
              } else if (sequencePart === 'sentence_en') {
                textToPlay = item.sentence || '';
                sourcePart = 'sentence';
              } else if (sequencePart === 'sentence_idn') {
                // v5.11.6: read the sentence translation directly with no spoken prefix.
                textToPlay = item.meaning || '';
                sourcePart = 'meaning';
              } else {
                const expMatch = sequencePart.match(/^exp([1-5])_(en|idn)$/);
                if (expMatch) {
                  const expNo = Number(expMatch[1]);
                  const language = expMatch[2];
                  const pair = expressionPairs[expNo - 1];
                  textToPlay = language === 'idn' ? (pair?.idn || '') : (pair?.en || '');
                  sourcePart = `exp${expNo}_${language}`;
                }
              }

              if (!String(textToPlay || '').trim()) continue;

              const repeatCount = Math.min(5, Math.max(1, Number.parseInt(activeSequence[sequenceIndex]?.repeat, 10) || 1));
              setSpeakingPart(sourcePart);

              for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;
                await waitWhilePaused();
                if (stopSignalRef.current || playbackSession !== playbackSessionRef.current) break;

                // v5.11.6: repeat-gap and part-gap are independently configurable.
                const delayMs = repeatIndex > 0
                  ? playbackDelaysRef.current.repeatDelayMs
                  : (sequenceIndex > 0 ? playbackDelaysRef.current.partDelayMs : 0);
                if (delayMs > 0) {
                  const delayCompleted = await waitPlaybackDelay(delayMs, playbackSession);
                  if (!delayCompleted) break;
                }

                await playSource(textToPlay, item, sourcePart);
              }
            }
          } else {
            setSpeakingPart('full');
            await playSource(item.text, item, 'full');
          }
          if (l < loops - 1) {
              await new Promise(r => setTimeout(r, 500));
              await waitWhilePaused();
          }
        }

        if (stopSignalRef.current) break;
        await new Promise(r => setTimeout(r, 800));
        await waitWhilePaused();

        const liveMode = playbackModeRef.current;
        if (liveMode === 'once') break;
        else if (liveMode === 'random') {
            // Legacy Random mode remains available. If Shuffle Vocabulary is active,
            // it follows the current no-repeat shuffle round instead of random hopping.
            if (vocabularyPlayOrderRef.current === 'shuffle') {
                index++;
                if (index >= listToPlay.length) {
                    listToPlay = resolveVocabularyPlaybackList(baseList, sessionMode, {
                      forceReshuffle: true,
                      avoidFirstId: getPlaybackItemId(item)
                    });
                    index = 0;
                }
            } else if (listToPlay.length <= 1) index = 0;
            else {
                let nextRandom = index;
                while (nextRandom === index) nextRandom = Math.floor(Math.random() * listToPlay.length);
                index = nextRandom;
            }
        }
        else if (liveMode === 'loop_one') {
          // Do nothing, keep same index
        }
        else { 
            index++; 
            if (index >= listToPlay.length) {
              if (vocabularyPlayOrderRef.current === 'shuffle') {
                // One full shuffle round is completed before a fresh order is generated.
                listToPlay = resolveVocabularyPlaybackList(baseList, sessionMode, {
                  forceReshuffle: true,
                  avoidFirstId: getPlaybackItemId(item)
                });
                index = 0;
              } else {
                index = 0;
              }
            }
        }
      }
      if (playbackSession !== playbackSessionRef.current) return;
      setIsPlaying(false);
      setIsPaused(false);
      pauseStateRef.current = false;
      setSpeakingPart(null);
      // forceStopAll akan dipanggil manual oleh user atau cleanup, tapi jika loop habis:
      if (!stopSignalRef.current) {
          // Playlist selesai secara alami
          addLog("Info", "Playback Finished.");
          forceStopAll(); // Matikan silent audio juga
      }
    });
  };

  const forceStopAll = () => {
    playbackSessionRef.current += 1;
    stopSignalRef.current = true;
    pauseStateRef.current = false;

    const activeAudio = currentAudioObjRef.current;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.onended = null;
      activeAudio.onerror = null;
    }
    synth.cancel();
    settlePlaybackPromise();
    currentAudioObjRef.current = null;
    currentUtteranceRef.current = null;

    if (silentAudioRef.current) {
        silentAudioRef.current.pause();
        silentAudioRef.current.currentTime = 0;
    }

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "none";

    setIsPlaying(false);
    setIsPaused(false);
    setSpeakingPart(null);
    setIndependentPlayingId(null);
  };

  const handleSmartNav = (direction) => {
    setActiveMenuId(null);
    justSwitchedTab.current = true;

    let contextToUse = (playingIndex !== null && playingContext)
      ? playingContext
      : (mode === 'table' ? tableViewMode : 'text');
    const baseList = getBasePlaybackListForContext(contextToUse);
    if (!baseList.length) return;

    const refId = (playingIndex !== null && playingContext) ? playingIndex : currentIndex;
    let listToUse = vocabularyPlayOrderRef.current === 'shuffle'
      ? resolveVocabularyPlaybackList(baseList, contextToUse, {
          anchorId: activeVocabularyOrderRef.current?.signature === getPlaybackListSignature(baseList) ? null : refId
        })
      : baseList;

    const activeItem = listToUse.find(p => p.id === refId);
    const currentListIndex = activeItem ? listToUse.indexOf(activeItem) : 0;

    const nextIndex = direction === 'next'
        ? (currentListIndex + 1) % listToUse.length
        : (currentListIndex - 1 + listToUse.length) % listToUse.length;

    const targetItem = listToUse[nextIndex];
    if (contextToUse === (mode === 'table' ? tableViewMode : 'text')) {
       setCurrentIndex(targetItem.id);
    }
    setPlayingContext(contextToUse);
    startGlobalPlayback(targetItem.id, contextToUse);
  };
  
    // --- NEW: MEDIA SESSION API INTEGRATION (ANDROID WIDGET) ---// --- MEDIA SESSION API (STABLE, NO WIDGET FLICKER) ---
    const playRef = useRef(handleGlobalPlay);
    const pausePlaybackRef = useRef(pausePlayback);
    const resumePlaybackRef = useRef(resumePlayback);
    const navRef = useRef(handleSmartNav);
    const stopRef = useRef(forceStopAll);
    const mediaIntervalRef = useRef(null); // --- ADD: Ref untuk Teks Berjalan ---

    // Always update ref values to latest functions
    playRef.current = handleGlobalPlay;
    pausePlaybackRef.current = pausePlayback;
    resumePlaybackRef.current = resumePlayback;
    navRef.current = handleSmartNav;
    stopRef.current = forceStopAll;

    useEffect(() => {
        if (!('mediaSession' in navigator)) return;

        // 1. Tentukan Item yang sedang aktif
        const activeItem = currentPlayerList.find(p => p.id === playingIndex);
        if (!activeItem) return;

        // 2. Tentukan Metadata Awal
        let title = activeItem.word || activeItem.text || "Unknown Item";
        let artist = "ProLingo Audio";

        // Jika mode Table
        if (activeItem.isStructured) {
            artist = activeItem.sentence || "Sentence Practice";
        }

        // Jika sedang memutar bagian Meaning
        if (speakingPart === 'word_idn') {
            title = `Arti kata: ${activeItem.meaningWord}`;
            artist = activeItem.word || 'Word Translation';
        }
        if (speakingPart === "meaning") {
            title = `Terjemahan kalimat: ${activeItem.meaning}`;
        }
        const activeExpMatch = String(speakingPart || '').match(/^exp([1-5])_(en|idn)$/i);
        if (activeExpMatch) {
            const expNo = activeExpMatch[1];
            const lang = activeExpMatch[2].toLowerCase();
            const expText = getItemPartText(activeItem, `exp${expNo}_${lang}`);
            title = `EXP${expNo}${lang === 'idn' ? ' IDN' : ''}: ${expText}`;
            artist = `${activeItem.word || activeItem.vocabId || 'ProLingo'} • Advanced Practice`;
        }

        // --- FUNGSI UPDATE METADATA (Helper) ---
        const updateMetadata = (t, a) => {
             navigator.mediaSession.metadata = new MediaMetadata({
                title: t,
                artist: a,
                album: currentDeckName || "ProLingo Deck",
                artwork: [
                    { 
                        src: "https://cdn-icons-png.flaticon.com/512/2995/2995101.png",
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            });
        };

        // Set Awal (Static)
        updateMetadata(title, artist);

        // --- NEW: LOGIKA TEKS BERJALAN (MARQUEE) ---
        // Bersihkan interval sebelumnya jika ada
        if (mediaIntervalRef.current) {
            clearInterval(mediaIntervalRef.current);
            mediaIntervalRef.current = null;
        }

        // Hanya jalankan scroll jika sedang PLAYING dan teksnya PANJANG
        if (isPlaying) {
             const needScrollTitle = title.length > 25;
             const needScrollArtist = artist.length > 35; // Biasanya kalimat panjang disini

             if (needScrollTitle || needScrollArtist) {
                 // Tambah padding spasi di akhir supaya muternya enak dilihat
                 const combinedTitle = title + "     "; 
                 const combinedArtist = artist + "     ";
                 
                 let tCount = 0;
                 let aCount = 0;

                 // MODIFIED: Speed to 200ms for smoother scroll
                 mediaIntervalRef.current = setInterval(() => {
                     let displayTitle = title;
                     let displayArtist = artist;

                     // Logika Geser Title
                     if (needScrollTitle) {
                         const offset = tCount % combinedTitle.length;
                         displayTitle = combinedTitle.slice(offset) + combinedTitle.slice(0, offset);
                         tCount++;
                     }

                     // Logika Geser Artist
                     if (needScrollArtist) {
                         const offset = aCount % combinedArtist.length;
                         displayArtist = combinedArtist.slice(offset) + combinedArtist.slice(0, offset);
                         aCount++;
                     }
                     
                     // Update Tampilan Widget
                     updateMetadata(displayTitle, displayArtist);
                 }, 200); // REVISED: 1000ms -> 200ms
             }
        }

        // 4. Set Action Handlers (STABLE with refs)
        navigator.mediaSession.setActionHandler("play", () => {
            if (isPaused) resumePlaybackRef.current();
            else if (!isPlaying) playRef.current();
        });
        navigator.mediaSession.setActionHandler("pause", () => pausePlaybackRef.current());
        navigator.mediaSession.setActionHandler("previoustrack", () => navRef.current("prev"));
        navigator.mediaSession.setActionHandler("nexttrack", () => navRef.current("next"));
        navigator.mediaSession.setActionHandler("stop", () => stopRef.current());

        // Cleanup saat unmount atau track berubah
        return () => {
            if (mediaIntervalRef.current) {
                clearInterval(mediaIntervalRef.current);
            }
        };

    }, [
        playingIndex,
        speakingPart,
        currentPlayerList,
        currentDeckName,
        isPlaying,
        isPaused
    ]);

  const cyclePlaybackMode = () => {
      const modes = ['once', 'sequence', 'repeat_2x', 'loop_one', 'random'];
      const currentIdx = modes.indexOf(playbackMode);
      const nextIdx = (currentIdx + 1) % modes.length;
      setPlaybackMode(modes[nextIdx]);
  };

  const handleModeSwitch = (targetMode) => {
      if (targetMode === mode) return;
      if (isSystemBusy) return; 

      forceStopAll();
      setPlayingIndex(null);
      setPlayingContext(null);
      setIndependentPlayingId(null); 

      // SAVE Scroll Position
      if (mode === 'table') viewScrollPosRef.current[tableViewMode] = getScrollPos();
      else viewScrollPosRef.current['text'] = getScrollPos();

      const currentIdx = currentIndex;
      setSavedIndices(prev => ({
          ...prev,
          [mode]: currentIdx
      }));

      // PREPARE RESTORE SCROLL
      let saved = 0;
      if (targetMode === 'table') saved = viewScrollPosRef.current[tableViewMode];
      else saved = viewScrollPosRef.current['text'];
      
      // CRITICAL FIX: Set scrollTop STATE instantly to avoid virtual list flicker
      setScrollTop(saved);
      // Also set ref for physical scroll via useLayoutEffect
      pendingScrollRestoration.current = saved;
      isAutoScrolling.current = true;

      setMode(targetMode);
      const targetIndex = savedIndices[targetMode];
      setCurrentIndex(targetIndex);

      addLog("System", `Switched to ${targetMode}.`);
  };

  const openFullPackPicker = () => {
      if (isSystemBusy) return;
      if (isCsvDirty) {
          alert('Simpan atau Revert perubahan working copy dulu sebelum Load Full Pack.');
          return;
      }
      fullPackInputRef.current?.click();
  };

  const handleFullPackUpload = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      e.target.value = '';
      if (isCsvDirty) {
          alert('Load Full Pack dibatalkan karena masih ada perubahan yang belum disimpan/revert.');
          return;
      }

      try {
          const staged = {};
          const unknown = [];
          const duplicateSourceFiles = [];
          for (const file of files) {
              const content = await readV510FileText(file);
              const key = detectV510SourceKey(file.name, content);
              if (!key) { unknown.push(file.name); continue; }
              if (staged[key]) { duplicateSourceFiles.push(`${V510_SOURCE_LABELS[key]}: ${staged[key].filename} + ${file.name}`); continue; }
              const parsed = key === 'main' ? parseTableRecords(content) : parseLayerSourceRecords(content, key);
              if (!parsed.length) throw new Error(`${V510_SOURCE_LABELS[key]} (${file.name}) tidak memiliki record yang bisa dibaca.`);
              const duplicateIds = getDuplicateSourceIds(parsed);
              if (duplicateIds.length) throw new Error(`${V510_SOURCE_LABELS[key]} memiliki duplicate VOCAB_ID: ${duplicateIds.slice(0,10).join(', ')}`);
              if (key === 'main') {
                  const validation = validateTableRecords(parsed);
                  if (!validation.isValid) throw new Error(`MAIN tidak valid: ${validation.errors.slice(0,10).join(' | ')}`);
              }
              staged[key] = { filename: file.name, baselineContent: content, loadedAt: Date.now() };
          }
          if (duplicateSourceFiles.length) throw new Error(`Ada lebih dari satu file untuk source yang sama:\n${duplicateSourceFiles.join('\n')}`);
          if (!staged.main) throw new Error('MAIN tidak ditemukan. Sertakan file MAIN/CORE yang berisi VOCAB_ID, NO, WORDS dan MEANING.');

          const nextPack = createEmptySourcePack();
          V510_SOURCE_KEYS.forEach(key => { if (staged[key]) nextPack[key] = staged[key]; });
          const mergedRecords = mergeSourcePackBaselines(nextPack);
          if (!mergedRecords.length) throw new Error('Full Pack gagal menghasilkan merged dataset.');
          const mergedContent = serializeTableRecords(mergedRecords);
          const maxNo = getMaxAssignedNoFromRecords(mergedRecords);
          const manualMax = getMaxManualIdFromRecords(mergedRecords);
          const deckName = staged.main.filename.replace(/\.(csv|tsv|txt)$/i, '').replace(/(?:[_-]?MAIN|[_-]?CORE)$/i, '') || staged.main.filename.replace(/\.(csv|tsv|txt)$/i, '');

          setSourcePack(nextPack);
          setTableContent(mergedContent);
          setCsvBaselineContent(mergedContent);
          setSequenceHighWater(maxNo);
          setManualIdHighWater(manualMax);
          setImportedRowCount(mergedRecords.length);
          setUndoStack([]);
          setMasterSearch('');
          setMasterFilter('all');
          setExpandedAdvancedId(null);
          setCurrentDeckName(deckName);
          setSelectedDeckId(deckName);
          setLockedStates(prev => ({ ...prev, table: true }));
          handleModeSwitch('table');

          const meta = { maxAssignedNo: maxNo, maxManualId: manualMax, importedRowCount: mergedRecords.length };
          setSavedDecks(prev => {
              const next = { ...prev, [deckName]: { content: mergedContent, baselineContent: mergedContent, sources: nextPack, meta } };
              try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
              catch (err) { console.warn('Full Pack cache quota exceeded:', err); addLog('Warn', 'Full Pack loaded, tetapi cache browser penuh.'); }
              return next;
          });

          const diagnostics = getSourceDiagnostics(nextPack);
          const loaded = V510_SOURCE_KEYS.filter(key => diagnostics[key].loaded);
          const missing = V510_SOURCE_KEYS.filter(key => !diagnostics[key].loaded);
          const issues = loaded.reduce((sum, key) => sum + diagnostics[key].orphan + diagnostics[key].duplicates.length, 0);
          const report = [
              `FULL PACK LOADED • ${mergedRecords.length} vocabulary`,
              ...loaded.map(key => `${V510_SOURCE_LABELS[key]}: ${diagnostics[key].rows} rows${key === 'main' ? '' : ` • ${diagnostics[key].matched} matched • ${diagnostics[key].missing} missing • ${diagnostics[key].orphan} orphan`}`),
              missing.length ? `Not found: ${missing.map(key => V510_SOURCE_LABELS[key]).join(', ')}` : 'All 7 sources found.',
              unknown.length ? `Skipped unknown: ${unknown.join(', ')}` : '',
              `Issues: ${issues}`
          ].filter(Boolean).join('\n');
          addLog('Source', report.replace(/\n/g, ' | '));
          alert(report);
      } catch (err) {
          console.error(err);
          addLog('Error', `Full Pack: ${err.message || err}`);
          alert(`Load Full Pack gagal:\n${err.message || err}`);
      }
  };

  const openSourcePicker = (key) => {
      if (isSystemBusy) return;
      if (isCsvDirty) {
          alert('Simpan atau Revert perubahan working copy dulu sebelum mengganti source file. Ini mencegah perubahan tercampur dengan baseline baru.');
          return;
      }
      if (key !== 'main' && !sourcePack.main?.baselineContent) {
          alert('Load MAIN terlebih dahulu. MAIN adalah pemilik VOCAB_ID, NO dan urutan audio.');
          return;
      }
      setSourceUploadKey(key);
      sourceUploadKeyRef.current = key;
      sourceInputRef.current?.click();
  };

  const handleSourceUpload = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const key = sourceUploadKeyRef.current || sourceUploadKey;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const content = String(evt.target?.result || '');
          const parsed = key === 'main' ? parseTableRecords(content) : parseLayerSourceRecords(content, key);
          if (!parsed.length) {
              alert(`${V510_SOURCE_LABELS[key]} tidak berisi record yang bisa dibaca.`);
              return;
          }
          const duplicates = getDuplicateSourceIds(parsed);
          if (duplicates.length) {
              alert(`${V510_SOURCE_LABELS[key]} memiliki duplicate VOCAB_ID:\n${duplicates.slice(0,10).join('\n')}`);
              return;
          }
          if (key === 'main') {
              const validation = validateTableRecords(parsed);
              if (!validation.isValid) {
                  alert(`MAIN tidak valid:\n${validation.errors.slice(0,10).join('\n')}`);
                  return;
              }
          }
          const nextPack = { ...sourcePack, [key]: { filename: file.name, baselineContent: content, loadedAt: Date.now() } };
          const mergedRecords = mergeSourcePackBaselines(nextPack);
          if (!mergedRecords.length) {
              alert('MAIN belum tersedia atau gagal dibaca.');
              return;
          }
          const mergedContent = serializeTableRecords(mergedRecords);
          const maxNo = getMaxAssignedNoFromRecords(mergedRecords);
          const manualMax = getMaxManualIdFromRecords(mergedRecords);
          const deckName = key === 'main' ? file.name.replace(/\.(csv|tsv|txt)$/i, '') : currentDeckName;
          setSourcePack(nextPack);
          setTableContent(mergedContent);
          setCsvBaselineContent(mergedContent);
          setSequenceHighWater(prev => key === 'main' ? maxNo : Math.max(prev, maxNo));
          setManualIdHighWater(prev => key === 'main' ? manualMax : Math.max(prev, manualMax));
          setImportedRowCount(mergedRecords.length);
          setUndoStack([]);
          setMasterSearch('');
          setMasterFilter('all');
          setExpandedAdvancedId(null);
          if (key === 'main') {
              setCurrentDeckName(deckName);
              setLockedStates(prev => ({ ...prev, table: true }));
              handleModeSwitch('table');
          }
          const meta = { maxAssignedNo: maxNo, maxManualId: manualMax, importedRowCount: mergedRecords.length };
          setSavedDecks(prev => {
              const next = { ...prev, [deckName]: { content: mergedContent, baselineContent: mergedContent, sources: nextPack, meta } };
              try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
              catch (err) { console.warn('Source pack cache quota exceeded:', err); addLog('Warn', 'Source pack loaded, but browser cache quota was exceeded. Use Save Draft after reducing cached decks.'); }
              return next;
          });
          setSelectedDeckId(deckName);
          addLog('Source', `${V510_SOURCE_LABELS[key]} loaded: ${parsed.length} rows. Joined by VOCAB_ID.`);
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const removeSourceLayer = (key) => {
      if (key === 'main') {
          alert('MAIN tidak bisa dilepas sendiri karena menjadi root dataset. Gunakan Import CSV Flat atau load MAIN baru.');
          return;
      }
      if (isCsvDirty) {
          alert('Simpan/Revert perubahan dulu sebelum melepas source.');
          return;
      }
      const nextPack = { ...sourcePack, [key]: null };
      const mergedRecords = mergeSourcePackBaselines(nextPack);
      const mergedContent = serializeTableRecords(mergedRecords);
      setSourcePack(nextPack);
      setTableContent(mergedContent);
      setCsvBaselineContent(mergedContent);
      setUndoStack([]);
      const records = parseTableRecords(mergedContent);
      const meta = { maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)), maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)), importedRowCount };
      setSavedDecks(prev => {
          const next = { ...prev, [currentDeckName]: { content: mergedContent, baselineContent: mergedContent, sources: nextPack, meta } };
          try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); } catch (err) { console.warn('Deck cache quota:', err); }
          return next;
      });
      addLog('Source', `${V510_SOURCE_LABELS[key]} detached.`);
  };

  const saveUpdatedSource = async (key) => {
      const entry = sourcePack[key];
      if (!entry?.baselineContent) return;
      const records = parseTableRecords(tableContent).sort((a,b) => (getRecordAudioNo(a)||0) - (getRecordAudioNo(b)||0));
      if (key === 'main') {
          const validation = validateTableRecords(records);
          if (!validation.isValid) {
              alert(`MAIN belum bisa disimpan:\n${validation.errors.slice(0,10).join('\n')}`);
              return;
          }
      }
      const content = serializeSourceFromMerged(records, key, sourcePack);
      const suggestedName = entry.filename || `${sanitizeFilename(currentDeckName || 'ProLingo')}_${V510_SOURCE_LABELS[key]}.csv`;
      try {
          if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
              const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }] });
              const writable = await handle.createWritable();
              await writable.write(content);
              await writable.close();
          } else {
              downloadTextFile(content, suggestedName);
          }
      } catch (err) {
          if (err?.name === 'AbortError') return;
          alert(`Gagal menyimpan ${V510_SOURCE_LABELS[key]}: ${err.message || err}`);
          return;
      }
      const nextPack = { ...sourcePack, [key]: { ...entry, baselineContent: content, filename: suggestedName, loadedAt: Date.now() } };
      const mergedBaselineRecords = mergeSourcePackBaselines(nextPack);
      const mergedBaselineContent = serializeTableRecords(mergedBaselineRecords);
      setSourcePack(nextPack);
      setCsvBaselineContent(mergedBaselineContent);
      const meta = {
          maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
          maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
          importedRowCount: importedRowCount || records.length
      };
      const deckEntry = { content: tableContent, baselineContent: mergedBaselineContent, sources: nextPack, meta };
      setSavedDecks(prev => {
          const next = { ...prev, [currentDeckName]: deckEntry };
          try { localStorage.setItem('pronunciation_decks', JSON.stringify(next)); }
          catch (err) { console.warn('Source save cache quota exceeded:', err); addLog('Warn', 'Source file saved, but the full source pack could not be cached locally.'); }
          return next;
      });
      setSelectedDeckId(currentDeckName);
      addLog('Success', `${V510_SOURCE_LABELS[key]} saved. Only this source baseline was updated.`);
  };

  const exportMergedDataset = () => {
      const records = parseTableRecords(tableContent);
      if (!records.length) return;
      const filename = `${sanitizeFilename(currentDeckName || 'ProLingo')}_MERGED_v5.11.6.csv`;
      downloadTextFile(serializeTableRecords(records), filename);
      addLog('Export', `Merged dataset exported: ${filename}. Source baselines unchanged.`);
  };

  const handleInputContentChange = (val) => {
    if (mode === 'table') setTableContent(val);
    else setTextContent(val);
  };

  const handleSaveDeck = () => {
      if(!currentDeckName) return;
      const records = parseTableRecords(tableContent);
      const entry = {
          content: tableContent,
          baselineContent: csvBaselineContent,
          sources: sourcePack,
          meta: {
              maxAssignedNo: Math.max(sequenceHighWater, getMaxAssignedNoFromRecords(records)),
              maxManualId: Math.max(manualIdHighWater, getMaxManualIdFromRecords(records)),
              importedRowCount: importedRowCount || records.filter(item => !String(item.vocabId || '').startsWith('USR_')).length
          }
      };
      const newDecks = {...savedDecks, [currentDeckName]: entry};
      setSavedDecks(newDecks);
      try {
          localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
          addLog("Success", `Draft "${currentDeckName}" saved to cache. CSV status: ${csvChangeSummary.isDirty ? 'UNSAVED CHANGES' : 'SYNCED'}.`);
      } catch (err) {
          console.warn('Draft cache quota exceeded:', err);
          addLog('Warn', 'Draft remains in this session, but browser cache is full. Delete unused cached decks or export source files.');
          alert('Browser cache penuh. Draft masih aman untuk sesi ini, tetapi belum tersimpan permanen di cache.');
      }
      setSelectedDeckId(currentDeckName);
  };

  const handleLoadDeck = (e) => {
      const deckName = e.target.value;
      if (!deckName) return;
      if (savedDecks[deckName]) {
          const entry = normalizeDeckEntry(savedDecks[deckName]);
          setSequenceHighWater(entry.meta.maxAssignedNo);
          setManualIdHighWater(entry.meta.maxManualId || 0);
          setImportedRowCount(entry.meta.importedRowCount);
          setSourcePack(normalizeSourcePack(entry.sources));
          setCsvBaselineContent(entry.baselineContent || canonicalizeTableContent(entry.content));
          setTableContent(entry.content);
          setUndoStack([]);
          setMasterSearch('');
          setMasterFilter('all');
          setExpandedAdvancedId(null);
          setCurrentDeckName(deckName);
          setSelectedDeckId(deckName);
          setLockedStates(prev => ({ ...prev, table: true }));
          
          forceStopAll();
          setPlayingIndex(null);
          setPlayingContext(null);

          setMode('table'); 
          setCurrentIndex(null);
          setMasterIndex(null);
          setStudyIndex(null);
          addLog("Success", `Deck "${deckName}" loaded.`);
      }
  };

  const handleDeleteDeckInit = () => {
      if (!selectedDeckId) return;
      setIsDeleteDialogOpen(true);
  };

  const confirmDeleteDeck = () => {
      if (!selectedDeckId) return;
      const newDecks = { ...savedDecks };
      delete newDecks[selectedDeckId];
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId("");
      setCurrentDeckName("Untitled Sheet");
      setTableContent("");
      setCsvBaselineContent("");
      setSourcePack(createEmptySourcePack());
      setSequenceHighWater(0);
      setManualIdHighWater(0);
      setImportedRowCount(0);
      resetFullState();
      setIsDeleteDialogOpen(false);
      addLog("Info", "Deck deleted & state reset.");
  };

  const testEdgeBackend = async () => {
    if (edgeHealth.status === 'testing') {
        edgeTestAbortControllerRef.current?.abort();
        return;
    }

    const controller = new AbortController();
    edgeTestAbortControllerRef.current = controller;
    setEdgeHealth({ status: 'testing', message: 'Testing /api/tts...' });
    let timeoutId = null;

    try {
        timeoutId = setTimeout(() => controller.abort(), 12000);
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                text: 'Edge TTS health check.',
                voice: edgeVoice,
                rate: '+0%',
                pitch: '+0Hz'
            })
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json') || contentType.includes('text/')) {
            const detail = await response.text();
            throw new Error(`Unexpected response: ${detail.slice(0, 180)}`);
        }

        const blob = await response.blob();
        if (!blob.size) throw new Error('Backend returned empty audio.');

        setEdgeHealth({ status: 'online', message: `OK • ${Math.round(blob.size / 1024)} KB` });
        addLog("Edge", `Health check OK (${Math.round(blob.size / 1024)} KB).`);
    } catch (error) {
        const msg = error.name === 'AbortError' ? 'Request dibatalkan / timeout.' : error.message;
        setEdgeHealth({ status: 'error', message: msg });
        addLog("Error", `Edge health: ${msg}`);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        edgeTestAbortControllerRef.current = null;
    }
  };

  const generateAIAudio = async (item, part = 'full') => {
    const uniqueLoadingId = `${item.id}-${part}`;
    setAiLoadingId(uniqueLoadingId);

    let textToSpeak = "";
    const voiceLabel = generatorEngine === 'edge'
        ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
        : aiVoiceName;
    const safeVoice = sanitizeFilename(voiceLabel || 'Voice');
    const stableId = getStableAudioIdentity(item);
    const filenameIdentity = getAudioFilenameIdentity(item);
    let filename = "";

    if (mode === 'table') {
        const safeWord = sanitizeFilename(item.word);
        textToSpeak = getItemPartText(item, part);
        filename = `${filenameIdentity}_${safeWord}_${safeVoice}_${sanitizeFilename(part)}.wav`;
    } else {
        textToSpeak = item.text;
        filename = `${stableId}_${safeVoice}_text.wav`;
    }

    if (!String(textToSpeak || '').trim()) {
        setAiLoadingId(null);
        addLog("Warn", `Skip ${stableId}/${part}: empty text.`);
        return;
    }

    addLog("Info", `Gen (${generatorEngine}) ${stableId}/${part}...`);
    const controller = new AbortController();
    generationAbortControllerRef.current = controller;

    try {
        let blob = null;

        if (generatorEngine === 'edge') {
             const rateStr = edgeRate >= 0 ? `+${edgeRate}%` : `${edgeRate}%`;
             const pitchStr = edgePitch >= 0 ? `+${edgePitch}Hz` : `${edgePitch}Hz`;
             const activeVoiceId = isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice;

             const response = await fetch('/api/tts', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 signal: controller.signal,
                 body: JSON.stringify({
                     text: textToSpeak,
                     voice: activeVoiceId,
                     rate: rateStr,
                     pitch: pitchStr
                 })
             });

             if (!response.ok) {
                 const errText = await response.text();
                 throw new Error(`Edge ${response.status}: ${errText || response.statusText}`);
             }

             const contentType = response.headers.get('content-type') || '';
             if (contentType.includes('application/json') || contentType.includes('text/')) {
                 const errText = await response.text();
                 throw new Error(`Edge returned non-audio response: ${errText.slice(0, 220)}`);
             }

             blob = await response.blob();
             if (!blob.size) throw new Error('Edge backend returned empty audio.');
             setEdgeHealth({ status: 'online', message: `Last request OK • ${Math.round(blob.size / 1024)} KB` });
        } else {
            const keyToUse = apiKey || userApiKey;
            if (!keyToUse) {
                alert("API Key Kosong! Masukkan key di menu Tools.");
                return;
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${keyToUse}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: textToSpeak }] }],
                    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: aiVoiceName } } } }
                })
            });

            if (!response.ok) throw new Error(`Gemini API Error ${response.status}`);
            const data = await response.json();

            if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                const base64Audio = data.candidates[0].content.parts[0].inlineData.data;
                blob = new Blob([encodeWAV(base64ToInt16Array(base64Audio))], { type: 'audio/wav' });
            } else {
                throw new Error('Gemini tidak mengembalikan audio (Safety/Model Issue).');
            }
        }

        if (blob) {
            const url = URL.createObjectURL(blob);
            if (mode === 'table') {
                setLocalAudioMapTable(prev => {
                    const key = `${stableId}_${part}`;
                    if (prev[key]) URL.revokeObjectURL(prev[key]);
                    return { ...prev, [key]: url };
                });
            } else {
                setLocalAudioMapText(prev => {
                    const key = stableId;
                    if (prev[key]) URL.revokeObjectURL(prev[key]);
                    return { ...prev, [key]: url };
                });
            }

            if (generatorEngine === 'edge') {
                const mime = String(blob.type || '').toLowerCase();
                if (mime.includes('mpeg') || mime.includes('mp3')) filename = filename.replace(/\.wav$/i, '.mp3');
                else if (mime.includes('ogg')) filename = filename.replace(/\.wav$/i, '.ogg');
                else if (mime.includes('webm')) filename = filename.replace(/\.wav$/i, '.webm');
            }
            triggerBrowserDownload(url, filename);
            addLog("Success", `Saved: ${filename}`);
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            addLog("Info", `Generation cancelled: ${stableId}/${part}`);
        } else {
            console.error(e);
            if (generatorEngine === 'edge') setEdgeHealth({ status: 'error', message: e.message });
            addLog("Error", `Gen Failed: ${e.message}`);
            alert(`Gagal: ${e.message}`);
        }
    } finally {
        if (generationAbortControllerRef.current === controller) generationAbortControllerRef.current = null;
        setAiLoadingId(null);
    }
  };

  const runBatchDownload = async () => {
    if (isBatchDownloading) {
        batchStopSignalRef.current = true;
        generationAbortControllerRef.current?.abort();
        setIsBatchStopping(true); 
        setBatchStatusText("Stopping...");
        addLog("Batch", "Stopping batch download...");
        return;
    }
    
    batchStopSignalRef.current = false;
    setIsBatchStopping(false);

    const startIdx = parseInt(batchConfig.start);
    const endIdx = parseInt(batchConfig.end);
    
    const maxRangeNo = mode === 'table'
        ? Math.max(1, sequenceHighWater, getMaxAssignedNoFromRecords(playlist))
        : Math.max(1, playlist.length);
    if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 1 || endIdx > maxRangeNo || startIdx > endIdx) {
        alert(`Range tidak valid. Maksimum saat ini: ${maxRangeNo}.`);
        return;
    }

    const targets = mode === 'table'
        ? playlist.filter(p => p.displayId >= startIdx && p.displayId <= endIdx)
        : playlist.filter((_, idx) => (idx + 1) >= startIdx && (idx + 1) <= endIdx);
    
    if (targets.length === 0) {
        alert("Tidak ada item dalam range tersebut.");
        return;
    }

    setIsBatchDownloading(true);
    addLog("Info", `Starting BATCH DL (${targets.length} items) via ${generatorEngine.toUpperCase()}...`);

    for (const item of targets) {
        if (batchStopSignalRef.current) {
            addLog("Batch", "Batch Stopped by User.");
            break;
        }
        
        if (mode === 'table') {
            if (batchConfig.doWord) { 
                setBatchStatusText(`${item.displayId} Word`); 
                await generateAIAudio(item, 'word'); // Uses the smart wrapper
                await new Promise(r => setTimeout(r, 1000)); 
            }
            if (batchStopSignalRef.current) break;
            if (batchConfig.doWordTranslation && generatorEngine === 'edge' && item.meaningWord) {
                setBatchStatusText(`${item.displayId} Word IDN`);
                await generateAIAudio(item, 'word_idn');
                await new Promise(r => setTimeout(r, 800));
            }
            if (batchStopSignalRef.current) break; 
            if (batchConfig.doSentence) { 
                setBatchStatusText(`${item.displayId} Sent`); 
                await generateAIAudio(item, 'sentence'); // Uses the smart wrapper
                await new Promise(r => setTimeout(r, 1000)); 
            }
            if (batchStopSignalRef.current) break;
            
            // New Meaning Logic
            if (batchConfig.doMeaning && generatorEngine === 'edge') { 
                 setBatchStatusText(`${item.displayId} Meaning`); 
                 await generateAIAudio(item, 'meaning'); 
                 await new Promise(r => setTimeout(r, 1000)); 
            }
            if (batchStopSignalRef.current) break;
            if (batchConfig.doExpressions) {
                 for (const pair of getAdvancedExpressionPairs(item)) {
                     if (batchStopSignalRef.current) break;
                     if (pair.en) {
                         setBatchStatusText(`${item.displayId} EXP${pair.number} EN`);
                         await generateAIAudio(item, `exp${pair.number}_en`);
                         await new Promise(r => setTimeout(r, 800));
                     }
                     if (batchConfig.doExpressionTranslations && generatorEngine === 'edge' && pair.idn) {
                         if (batchStopSignalRef.current) break;
                         setBatchStatusText(`${item.displayId} EXP${pair.number} IDN`);
                         await generateAIAudio(item, `exp${pair.number}_idn`);
                         await new Promise(r => setTimeout(r, 800));
                     }
                 }
            }
        } else {
             setBatchStatusText(`${item.displayId} Full`); 
             await generateAIAudio(item, 'full'); // Uses the smart wrapper
             await new Promise(r => setTimeout(r, 1000));
        }
    }

    setIsBatchDownloading(false);
    setBatchStatusText(""); 
    setIsBatchStopping(false);
    batchStopSignalRef.current = false;
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const fileName = file.name.replace(/\.(csv|tsv|txt)$/i, '');
      const importedRecords = parseTableRecords(content);
      const previousEntry = savedDecks[fileName] ? normalizeDeckEntry(savedDecks[fileName]) : null;
      let localExportMeta = null;
      try {
          localExportMeta = JSON.parse(localStorage.getItem(`prolingo_csv_meta:${fileName}`) || 'null');
      } catch (err) {
          console.warn('Invalid ProLingo CSV meta cache:', err);
      }
      const initialMaxNo = Math.max(
          importedRecords.length,
          getMaxAssignedNoFromRecords(importedRecords),
          Number(previousEntry?.meta?.maxAssignedNo) || 0,
          Number(localExportMeta?.maxAssignedNo) || 0
      );
      const initialManualMax = Math.max(
          getMaxManualIdFromRecords(importedRecords),
          Number(previousEntry?.meta?.maxManualId) || 0,
          Number(localExportMeta?.maxManualId) || 0
      );
      const restoredImportedCount = Math.max(
          importedRecords.length,
          Number(previousEntry?.meta?.importedRowCount) || 0,
          Number(localExportMeta?.importedRowCount) || 0
      );
      const importedBaseline = canonicalizeTableContent(content);
      setSequenceHighWater(initialMaxNo);
      setManualIdHighWater(initialManualMax);
      setImportedRowCount(restoredImportedCount);
      setSourcePack(createEmptySourcePack());
      setCsvBaselineContent(importedBaseline);
      setTableContent(content);
      setUndoStack([]);
      setMasterSearch('');
      setMasterFilter('all');
      setExpandedAdvancedId(null);
      handleModeSwitch('table');
      setCurrentDeckName(fileName);
      setLockedStates(prev => ({ ...prev, table: true }));
      const newDecks = {
          ...savedDecks,
          [fileName]: { content, baselineContent: importedBaseline, sources: createEmptySourcePack(), meta: { maxAssignedNo: initialMaxNo, maxManualId: initialManualMax, importedRowCount: restoredImportedCount } }
      };
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId(fileName);
      resetFullState(); 
      addLog("Info", `CSV Imported: ${fileName}.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFolderSelect = (e) => {
    const files = e.target.files;
    if (!files) return;
    let count = 0;

    if (mode === 'table') {
        Object.values(localAudioMapTable).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        let orphanCount = 0;
        let audioFileCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;
            audioFileCount++;

            let type = null;
            const expTypeMatch = lowerName.match(/(?:_|-)(exp[1-5]_(?:en|idn))\.(wav|mp3|ogg|webm)$/i);
            if (expTypeMatch) type = expTypeMatch[1].toLowerCase();
            else if (/(?:_|-)(word_idn|word-?idn|word_meaning|arti_kata)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'word_idn';
            else if (/(?:_|-)(word|kata)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'word';
            else if (/(?:_|-)(sentence|sent|kalimat)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'sentence';
            else if (/(?:_|-)(meaning|mean|arti)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'meaning';
            else if (lowerName.includes('_word_idn.') || lowerName.includes('_arti_kata.')) type = 'word_idn';
            else if (lowerName.includes('_word.') || lowerName.includes('_kata.')) type = 'word';
            else if (lowerName.includes('_sentence.') || lowerName.includes('_kalimat.')) type = 'sentence';
            else if (lowerName.includes('_meaning.') || lowerName.includes('_arti.')) type = 'meaning';
            if (!type) continue;

            const stableMatch = file.name.match(/^([A-Za-z][A-Za-z0-9-]*_\d+)_/);
            const numericMatch = file.name.match(/^(\d+)_/);
            let matchedItem = null;

            // Preferred/legacy path: numeric prefix is the permanent audio slot.
            if (numericMatch) {
                const audioNo = Number.parseInt(numericMatch[1], 10);
                matchedItem = playlist.find(item => item.isStructured && getRecordAudioNo(item) === audioNo) || null;
            }
            // Compatibility with v5.8 ID-first filenames (BODY_0001_..., USR_000001_...).
            if (!matchedItem && stableMatch) {
                const oldVocabId = stableMatch[1].toUpperCase();
                matchedItem = playlist.find(item => item.isStructured && getVocabIdentity(item) === oldVocabId) || null;
            }

            if (matchedItem) {
                const identity = getStableAudioIdentity(matchedItem);
                newMap[`${identity}_${type}`] = URL.createObjectURL(file);
                count++;
            } else {
                orphanCount++;
            }
        }

        setLocalAudioMapTable(newMap);
        setAudioStatusTable(count > 0 ? 'success' : 'empty');
        alert(`[Table] Audio scan: ${audioFileCount} file. Matched: ${count}. Orphan/unmatched: ${orphanCount}.\nNO audio tidak pernah dialihkan ke vocab lain.`);
    } else {
        Object.values(localAudioMapText).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;

            const textMatch = file.name.match(/^(TEXT_\d+)_/i);
            const numericMatch = file.name.match(/^(\d+)_/);
            let identity = textMatch ? textMatch[1].toUpperCase() : null;
            if (!identity && numericMatch) identity = `TEXT_${String(Number.parseInt(numericMatch[1], 10)).padStart(6, '0')}`;

            if (identity) {
                newMap[identity] = URL.createObjectURL(file);
                count++;
            }
        }
        setLocalAudioMapText(newMap);
        setAudioStatusText(count > 0 ? 'success' : 'empty');
        alert(`[Text] Loaded ${count} files. Old files cleared.`);
    }

    e.target.value = '';
  };

  const currentAudioStatus = mode === 'table' ? audioStatusTable : audioStatusText;
  const currentMapCount = mode === 'table' ? Object.keys(localAudioMapTable).length : Object.keys(localAudioMapText).length;

  const renderStatusBadge = () => {
      if (currentAudioStatus === 'idle' && currentMapCount === 0) return <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">Belum Load</span>;
      if (currentMapCount > 0) return <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {currentMapCount} File Aktif</span>;
      return <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> 0 File</span>;
  };

  const handleScroll = (e) => {
     // FIX CRITICAL: Removed "if (isAutoScrolling.current) return;" blocker.
     // This allows state synchronization even if the browser clamps the scroll position.
     const currentScroll = e.currentTarget.scrollTop;
     setScrollTop(currentScroll);
  };

  const renderBatchPopup = () => (
     <div 
        ref={batchPanelRef} 
        className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
     >
        <div className="bg-slate-800 text-white p-2 text-xs font-bold flex justify-between">
            <span>Batch Download ({mode})</span>
            <button onClick={() => setIsBatchOpen(false)}><X className="w-3 h-3"/></button>
        </div>
        <div className="p-3 space-y-3">
             {mode === 'table' ? (
                 <div className="flex flex-col gap-2 text-xs">
                     <div className="flex gap-2">
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`${batchConfig.doWord ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className="dark:text-slate-300">Words</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doWordTranslation: !p.doWordTranslation}))} className={`${batchConfig.doWordTranslation ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doWordTranslation ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className={`dark:text-slate-300 ${generatorEngine !== 'edge' ? 'line-through opacity-50' : ''}`}>Word IDN</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`${batchConfig.doSentence ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className="dark:text-slate-300">Sentences</span>
                         </div>
                     </div>
                     {/* Meaning Checkbox (Edge Only) */}
                     <div className="flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-2">
                          <button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doMeaning: !p.doMeaning}))} className={`${batchConfig.doMeaning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                             {batchConfig.doMeaning ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                         </button>
                         <span className={`dark:text-slate-300 ${generatorEngine !== 'edge' ? 'line-through opacity-50' : ''}`}>Meaning (Indonesian)</span>
                     </div>
                     {advancedDatasetStats.hasAdvanced && <div className="border-t border-violet-100 dark:border-violet-900 pt-2 space-y-1.5">
                         <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doExpressions: !p.doExpressions}))} className={`flex items-center gap-1 ${batchConfig.doExpressions ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50' : ''}`}>{batchConfig.doExpressions ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}<span>EXP1–EXP5 EN</span></button>
                         <button disabled={isBatchDownloading || generatorEngine !== 'edge' || !batchConfig.doExpressions} onClick={() => setBatchConfig(p=>({...p, doExpressionTranslations: !p.doExpressionTranslations}))} className={`flex items-center gap-1 ${batchConfig.doExpressionTranslations ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge' || !batchConfig.doExpressions) ? 'opacity-40' : ''}`}>{batchConfig.doExpressionTranslations ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}<span>EXP IDN (Edge)</span></button>
                     </div>}
                 </div>
             ) : (
                 <div className="text-xs text-slate-400 italic">Batch download for full text.</div>
             )}
             
             <div className="flex gap-2 items-center text-xs">
                 <span className="text-slate-500">Range:</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                    value={batchConfig.start} 
                    onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))}
                    onBlur={() => handleBatchRangeBlur('start')} 
                    disabled={isBatchDownloading}
                 />
                 <span className="dark:text-slate-400">-</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                    value={batchConfig.end} 
                    onChange={e=>setBatchConfig(p=>({...p, end:e.target.value}))} 
                    onBlur={() => handleBatchRangeBlur('end')} 
                    disabled={isBatchDownloading}
                 />
             </div>
             
             <button 
                onClick={runBatchDownload} 
                className={`w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-2 text-white transition-all
                   ${isBatchStopping ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : ''}
                   ${isBatchDownloading && !isBatchStopping ? 'bg-red-500 hover:bg-red-600' : ''}
                   ${!isBatchDownloading && !isBatchStopping ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                `}
             >
                 {isBatchDownloading ? (
                     <>
                        {isBatchStopping ? <XCircle className="w-3 h-3"/> : <Loader2 className="w-3 h-3 animate-spin"/>}
                        {isBatchStopping ? "Stopping..." : (batchStatusText || "STOP BATCH")}
                     </>
                 ) : (
                     <>
                        <DownloadCloudIcon className="w-3 h-3"/>
                        START BATCH
                     </>
                 )}
             </button>
             <div className="text-[10px] text-center italic text-slate-400 mt-1">Using: {generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini AI'}</div>
        </div>
     </div>
  );

  const DownloadCloudIcon = ({className}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M12 12v9"></path><path d="m8 17 4 4 4-4"></path></svg>;

  const togglePlaybackSequencePart = (key) => {
    setPlaybackSequence(prev => normalizePlaybackSequence(prev).map(entry => entry.key === key ? { ...entry, enabled: !entry.enabled } : entry));
  };

  const setPlaybackSequencePartRepeat = (key, repeat) => {
    const safeRepeat = Math.min(5, Math.max(1, Number.parseInt(repeat, 10) || 1));
    setPlaybackSequence(prev => normalizePlaybackSequence(prev).map(entry => entry.key === key ? { ...entry, repeat: safeRepeat } : entry));
  };

  const setPlaybackDelay = (field, value) => {
    setPlaybackDelays(prev => normalizePlaybackDelays({ ...prev, [field]: value }));
  };

  const resetPlaybackDelays = () => setPlaybackDelays({ ...V511_DEFAULT_DELAYS });

  const changeVocabularyPlayOrder = (nextMode) => {
    const safeMode = nextMode === 'shuffle' ? 'shuffle' : 'sequential';
    if (safeMode === vocabularyPlayOrder) return;
    if (isPlaying) forceStopAll();
    const emptyOrder = createEmptyVocabularyOrder();
    activeVocabularyOrderRef.current = emptyOrder;
    setActiveVocabularyOrder(emptyOrder);
    setVocabularyPlayOrder(safeMode);
    addLog('Playback', `Vocabulary order: ${safeMode === 'shuffle' ? 'Shuffle (no-repeat round)' : 'Sequential'}.`);
  };

  const reshuffleVocabularyPlayback = () => {
    if (isPlaying || vocabularyPlayOrderRef.current !== 'shuffle') return;
    const context = playingContext || (mode === 'table' ? tableViewMode : 'text');
    const baseList = getBasePlaybackListForContext(context);
    if (!baseList.length) return;
    const avoidId = playingIndex ?? currentIndex ?? null;
    resolveVocabularyPlaybackList(baseList, context, {
      forceReshuffle: true,
      avoidFirstId: avoidId
    });
    addLog('Playback', `Vocabulary order reshuffled for ${baseList.length} item(s).`);
  };

  const movePlaybackSequencePart = (key, direction) => {
    setPlaybackSequence(prev => {
      const next = normalizePlaybackSequence(prev);
      const index = next.findIndex(entry => entry.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return next;
      const copy = [...next];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const shufflePlaybackSequence = () => {
    setPlaybackSequence(prev => {
      const next = [...normalizePlaybackSequence(prev)];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  };

  const resetPlaybackSequence = () => setPlaybackSequence(createDefaultPlaybackSequence());

  const applyPlaybackPreset = (presetKey) => {
    const preset = V511_PLAYBACK_PRESETS[presetKey];
    if (!preset) return;
    setPlaybackSequence(createPlaybackPresetSequence(preset));
    setPlaybackDelays(normalizePlaybackDelays(preset.delays));
    addLog('Playback', `Preset applied: ${preset.label}.`);
  };

  const activePlaybackPreset = useMemo(() => {
    const currentSignature = playbackConfigSignature(playbackSequence, playbackDelays);
    const match = Object.entries(V511_PLAYBACK_PRESETS).find(([, preset]) =>
      playbackConfigSignature(createPlaybackPresetSequence(preset), preset.delays) === currentSignature
    );
    return match?.[0] || 'custom';
  }, [playbackSequence, playbackDelays]);

  const isPlaybackSequencePartAvailable = (key) => {
    const expMatch = key.match(/^exp([1-5])_/);
    if (!expMatch) return true;
    return Boolean(advancedDatasetStats.expCounts[Number(expMatch[1])]);
  };

  const renderPlaybackSequenceBuilder = (compact = false) => {
    const enabledCount = playbackSequence.filter(entry => entry.enabled).length;
    const enabledPlayCount = playbackSequence.reduce((total, entry) => {
      if (!entry.enabled || !isPlaybackSequencePartAvailable(entry.key)) return total;
      return total + Math.min(5, Math.max(1, Number.parseInt(entry.repeat, 10) || 1));
    }, 0);
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-emerald-700 dark:text-emerald-400">Vocabulary Play Order</p>
              <p className="text-[8px] text-slate-400">Controls item order only. NO / AUDIO SLOT never changes.</p>
            </div>
            <span className={`text-[8px] font-black px-2 py-1 rounded-full ${vocabularyPlayOrder === 'shuffle' ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              {vocabularyPlayOrder === 'shuffle' ? `SHUFFLE${activeVocabularyOrder.cycle ? ` • C${activeVocabularyOrder.cycle}` : ''}` : 'SEQUENTIAL'}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
            <button
              type="button"
              onClick={() => changeVocabularyPlayOrder('sequential')}
              className={`rounded-md border px-2 py-1.5 text-[9px] font-black transition ${vocabularyPlayOrder === 'sequential' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              Sequential
            </button>
            <button
              type="button"
              onClick={() => changeVocabularyPlayOrder('shuffle')}
              className={`rounded-md border px-2 py-1.5 text-[9px] font-black transition flex items-center justify-center gap-1 ${vocabularyPlayOrder === 'shuffle' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
              <Shuffle className="w-3 h-3"/> Shuffle
            </button>
            <button
              type="button"
              disabled={vocabularyPlayOrder !== 'shuffle' || isPlaying}
              onClick={reshuffleVocabularyPlayback}
              title="Create a fresh no-repeat vocabulary order"
              className="rounded-md border border-emerald-200 dark:border-emerald-800 px-2 py-1.5 text-emerald-700 dark:text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5"/>
            </button>
          </div>
          <p className="text-[8px] leading-relaxed text-slate-400">
            Shuffle uses every vocabulary once per round before creating a new order. Previous / Next follow the active shuffled order.
          </p>
        </div>

        <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-indigo-700 dark:text-indigo-400">Playback Presets</p>
              <p className="text-[8px] text-slate-400">Preset = sequence + repeat + delay. Manual edits become Custom.</p>
            </div>
            <span className={`text-[8px] font-black px-2 py-1 rounded-full ${activePlaybackPreset === 'custom' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-indigo-600 text-white'}`}>
              {activePlaybackPreset === 'custom' ? 'CUSTOM' : V511_PLAYBACK_PRESETS[activePlaybackPreset]?.shortLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(V511_PLAYBACK_PRESETS).map(([key, preset]) => {
              const active = activePlaybackPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPlaybackPreset(key)}
                  className={`text-left rounded-md border px-2 py-1.5 transition ${active ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400'}`}
                  title={preset.description}
                >
                  <span className="block text-[9px] font-black">{preset.label}</span>
                  <span className={`block text-[7px] leading-tight mt-0.5 ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{preset.description}</span>
                </button>
              );
            })}
          </div>
          {activePlaybackPreset === 'custom' && <p className="text-[8px] text-slate-400">Custom uses your current manual order/repeat/delay and is already persisted automatically.</p>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-400">Playback Sequence</p>
            <p className="text-[9px] text-slate-400">Top → bottom = order • {enabledCount} enabled • {enabledPlayCount} plays/item</p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={shufflePlaybackSequence} title="Shuffle part order" className="p-1.5 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-violet-600 dark:text-slate-400"><Shuffle className="w-3.5 h-3.5"/></button>
            <button type="button" onClick={resetPlaybackSequence} title="Reset to Word EN → Sentence EN" className="p-1.5 rounded border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-violet-600 dark:text-slate-400"><RotateCcw className="w-3.5 h-3.5"/></button>
          </div>
        </div>

        <div className={`${compact ? 'max-h-72' : 'max-h-80'} overflow-y-auto pr-1 space-y-1`}>
          {playbackSequence.map((entry, index) => {
            const meta = V511_PLAYBACK_PARTS.find(part => part.key === entry.key);
            if (!meta) return null;
            const available = isPlaybackSequencePartAvailable(entry.key);
            const active = entry.enabled && available;
            return (
              <div key={entry.key} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${active ? 'border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/15' : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60'} ${available ? '' : 'opacity-40'}`}>
                <span className="w-5 text-[9px] text-center font-mono text-slate-400">{index + 1}</span>
                <button type="button" disabled={!available} onClick={() => togglePlaybackSequencePart(entry.key)} className={`${active ? (meta.language === 'IDN' ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400') : 'text-slate-400'} disabled:cursor-not-allowed`}>{active ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}</button>
                <button type="button" disabled={!available} onClick={() => togglePlaybackSequencePart(entry.key)} className={`flex-1 text-left ${compact ? 'text-[10px]' : 'text-xs'} font-bold ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'} disabled:cursor-not-allowed`}>{meta.label}</button>
                <span className={`text-[8px] font-black px-1 rounded ${meta.language === 'IDN' ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'}`}>{meta.language}</span>
                <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden" title="Repeat this part per item (1–5x)">
                  <button type="button" disabled={!available || (entry.repeat || 1) <= 1} onClick={() => setPlaybackSequencePartRepeat(entry.key, (entry.repeat || 1) - 1)} className="w-5 h-6 text-[11px] font-black text-slate-500 disabled:opacity-20">−</button>
                  <span className="min-w-[28px] text-center text-[9px] font-black text-violet-600 dark:text-violet-400 border-x border-slate-200 dark:border-slate-600">{entry.repeat || 1}x</span>
                  <button type="button" disabled={!available || (entry.repeat || 1) >= 5} onClick={() => setPlaybackSequencePartRepeat(entry.key, (entry.repeat || 1) + 1)} className="w-5 h-6 text-[11px] font-black text-slate-500 disabled:opacity-20">+</button>
                </div>
                <button type="button" disabled={index === 0} onClick={() => movePlaybackSequencePart(entry.key, -1)} className="w-6 h-6 rounded border border-slate-200 dark:border-slate-600 text-[11px] font-black text-slate-500 disabled:opacity-20">↑</button>
                <button type="button" disabled={index === playbackSequence.length - 1} onClick={() => movePlaybackSequencePart(entry.key, 1)} className="w-6 h-6 rounded border border-slate-200 dark:border-slate-600 text-[11px] font-black text-slate-500 disabled:opacity-20">↓</button>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase text-sky-700 dark:text-sky-400">Delay Control</p>
              <p className="text-[8px] text-slate-400">Learning gap only — audio speed is unchanged.</p>
            </div>
            <button type="button" onClick={resetPlaybackDelays} className="px-2 py-1 rounded border border-sky-200 dark:border-sky-800 text-[8px] font-black text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30">RESET 300ms</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-[8px] font-bold text-slate-500 dark:text-slate-400">Between parts</span>
              <select value={playbackDelays.partDelayMs} onChange={e => setPlaybackDelay('partDelayMs', e.target.value)} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] font-bold text-slate-700 dark:text-slate-200 outline-none">
                {V511_DELAY_OPTIONS.map(ms => <option key={`part-${ms}`} value={ms}>{formatPlaybackDelay(ms)}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[8px] font-bold text-slate-500 dark:text-slate-400">Between repeats</span>
              <select value={playbackDelays.repeatDelayMs} onChange={e => setPlaybackDelay('repeatDelayMs', e.target.value)} className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-[9px] font-bold text-slate-700 dark:text-slate-200 outline-none">
                {V511_DELAY_OPTIONS.map(ms => <option key={`repeat-${ms}`} value={ms}>{formatPlaybackDelay(ms)}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[8px] text-slate-400">Parts: Word → Meaning → Sentence → EXP. Repeats: repeated play of the same part.</p>
        </div>

        {enabledCount === 0 && <div className="text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">No playback parts enabled. Turn on at least one item.</div>}
        <p className="text-[8px] leading-relaxed text-slate-400">Repeat is per part (1–5x). Delay is independent for part transitions and repeats. Playback mode “Item 2x” still repeats the whole sequence twice.</p>
      </div>
    );
  };

  const renderControlSectionTabs = (compact = false) => {
    const iconFor = (key) => {
      if (key === 'player') return <Volume2 className="w-3.5 h-3.5"/>;
      if (key === 'learn') return <BookOpen className="w-3.5 h-3.5"/>;
      if (key === 'data') return <Database className="w-3.5 h-3.5"/>;
      return <Settings className="w-3.5 h-3.5"/>;
    };
    return (
      <div className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 ${compact ? 'p-1.5' : 'p-2'}`}>
        <div className="grid grid-cols-4 gap-1">
          {V5116_CONTROL_SECTIONS.map(section => {
            const active = sidebarSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setSidebarSection(section.key)}
                className={`min-w-0 rounded-lg border transition-all duration-150 flex flex-col items-center justify-center gap-1 ${compact ? 'px-1 py-2' : 'px-1.5 py-2'} ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                title={`${section.label} controls`}
              >
                {iconFor(section.key)}
                <span className="text-[8px] font-black tracking-wide truncate w-full text-center">{section.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMobileTools = () => (
      <div className="p-4 space-y-4">
          <div className="sticky top-0 z-20 -mx-1 pt-1 pb-2 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <div className="flex items-center justify-between px-1 mb-2">
                  <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Control Center</p>
                      <p className="text-[9px] text-slate-400">Same sections as desktop sidebar.</p>
                  </div>
                  <span className="text-[8px] font-black px-2 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">{sidebarSection.toUpperCase()}</span>
              </div>
              {renderControlSectionTabs(true)}
          </div>

          {sidebarSection === 'player' && <>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/> Player</h3>
                  <div className={`p-3 rounded-lg border mb-3 ${currentMapCount > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600'}`}>
                      <div className="flex justify-between items-center mb-1"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Audio Source ({mode})</p>{renderStatusBadge()}</div>
                      <button onClick={() => currentMapCount > 0 && setPreferLocalAudio(!preferLocalAudio)} disabled={currentMapCount === 0 || isSystemBusy} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${currentMapCount === 0 || isSystemBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm'}`}>
                          <span className={preferLocalAudio ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}>{preferLocalAudio ? "Source: Local/Generated" : "Source: Browser TTS"}</span>
                          {preferLocalAudio ? <ToggleRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                      </button>
                  </div>
                  <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS</p>
                      <GroupedVoiceSelect voices={voices} selectedValue={selectedVoice?.name || ''} onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))} disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} context="main"/>
                      {mode === 'table' && (indonesianVoices.length > 0 ? <GroupedVoiceSelect voices={indonesianVoices} selectedValue={selectedIndonesianVoice?.name || ''} onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))} disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} context="meaning"/> : <div className="text-[10px] text-red-400 italic border p-2 rounded bg-red-50 dark:bg-red-900/20">Browser tidak menyediakan suara Indonesia.</div>)}
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded border border-slate-100 dark:border-slate-600"><span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-8 text-center">{rate}x</span><input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="flex-1 h-1 bg-slate-200 dark:bg-slate-600 rounded-lg cursor-pointer accent-indigo-600" /></div>
                  </div>
              </div>
          </>}

          {sidebarSection === 'learn' && <>
              {mode === 'table' ? <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400"/> Learning Playback</h3>
                  {renderPlaybackSequenceBuilder(true)}
                  <div className="mt-3 border-t border-dashed border-slate-200 dark:border-slate-700 pt-3">
                      <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600'}`}><span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>{isMemoryMode ? <ToggleRight className="w-5 h-5"/> : <ToggleLeft className="w-5 h-5"/>}</button>
                      {isMemoryMode && <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] text-slate-600 dark:text-slate-300">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.word} onChange={e => setMemorySettings(prev => ({...prev, word:e.target.checked}))} className="accent-yellow-600"/>Hide Word</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.meaning} onChange={e => setMemorySettings(prev => ({...prev, meaning:e.target.checked}))} className="accent-yellow-600"/>Hide Meaning</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.sentence} onChange={e => setMemorySettings(prev => ({...prev, sentence:e.target.checked}))} className="accent-yellow-600"/>Hide Sentence</label>
                          {advancedDatasetStats.hasAdvanced && <label className="flex items-center gap-2"><input type="checkbox" checked={memorySettings.expressions} onChange={e => setMemorySettings(prev => ({...prev, expressions:e.target.checked}))} className="accent-yellow-600"/>Hide EXP</label>}
                      </div>}
                  </div>
              </div> : <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-xs text-slate-400">Learning Sequence controls are available in Table mode.</div>}
          </>}

          {sidebarSection === 'data' && <>
              {mode === 'table' && <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-violet-200 dark:border-violet-900 shadow-sm">
                  <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2"><Layers className="w-4 h-4 text-violet-600"/> Source Manager</h3><span className={`text-[9px] font-black px-2 py-1 rounded ${isMultiSourceMode ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>{isMultiSourceMode ? `MULTI-SOURCE${dirtySourceKeys.length ? ` • ${dirtySourceKeys.length} DIRTY` : ''}` : 'FLAT'}</span></div>
                  <p className="text-[10px] text-slate-400 mb-3">MAIN owns VOCAB_ID + NO. Other files join by VOCAB_ID.</p>
                  <button disabled={isSystemBusy || isCsvDirty} onClick={openFullPackPicker} className="w-full mb-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-40"><Upload className="w-3.5 h-3.5 inline mr-1"/>Load Full Pack (Auto)</button>
                  <div className="space-y-2">{V510_SOURCE_KEYS.map(key => { const d = sourceDiagnostics[key]; const dirty = sourceChangeSummaries[key]; return <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2"><div className="flex items-center gap-2"><span className="w-16 text-[10px] font-black text-violet-600 dark:text-violet-400">{V510_SOURCE_LABELS[key]}</span><span className="flex-1 text-[9px] text-slate-400 truncate">{sourcePack[key]?.filename || 'Not loaded'}</span><button disabled={isSystemBusy} onClick={() => openSourcePicker(key)} className="px-2 py-1 text-[9px] font-bold border rounded dark:border-slate-600">{d.loaded ? 'Replace' : 'Load'}</button>{key !== 'main' && d.loaded && <button disabled={isSystemBusy || isCsvDirty} onClick={() => removeSourceLayer(key)} className="p-1 text-red-500"><X className="w-3 h-3"/></button>}</div>{d.loaded && <div className="mt-1 flex flex-wrap gap-1 text-[8px]"><span className="text-emerald-600">{d.rows} rows</span>{key !== 'main' && <><span className="text-slate-400">• {d.matched} matched</span>{d.missing > 0 && <span className="text-amber-600">• {d.missing} missing</span>}{d.orphan > 0 && <span className="text-red-500">• {d.orphan} orphan</span>}</>}{d.duplicates.length > 0 && <span className="text-red-500">• {d.duplicates.length} duplicate</span>}{dirty.isDirty && <button onClick={() => saveUpdatedSource(key)} className="ml-auto text-amber-700 dark:text-amber-300 font-bold">Save +{dirty.added} ~{dirty.modified} -{dirty.deleted}</button>}</div>}</div>; })}</div>
                  {isMultiSourceMode && <button onClick={exportMergedDataset} className="w-full mt-3 py-2 rounded border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-xs font-bold"><FileDown className="w-3.5 h-3.5 inline mr-1"/>Export Merged CSV</button>}
              </div>}

              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Database className="w-4 h-4"/> Deck & Data</h3>
                  <select disabled={isSystemBusy} className={`w-full text-xs p-2 border border-slate-200 dark:border-slate-600 rounded mb-2 bg-slate-50 dark:bg-slate-700 dark:text-white ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}><option value="" disabled>Load Saved...</option>{Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}</select>
                  <div className="flex gap-2"><input disabled={isSystemBusy} className={`flex-1 border border-slate-200 dark:border-slate-600 rounded px-2 text-xs dark:bg-slate-700 dark:text-white ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="Deck Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} /><button disabled={isSystemBusy} onClick={handleSaveDeck} title="Save Draft to Cache" className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded disabled:opacity-50"><Save className="w-4 h-4"/></button>{selectedDeckId && <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded disabled:opacity-50"><Trash2 className="w-4 h-4"/></button>}</div>
                  {mode === 'table' && <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2"><button disabled={isSystemBusy} onClick={() => csvInputRef.current?.click()} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50"><Upload className="w-3.5 h-3.5"/> Import CSV</button><button disabled={isSystemBusy} onClick={openManualAdd} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold bg-indigo-600 text-white disabled:opacity-50"><Plus className="w-3.5 h-3.5"/> Add Manual</button></div>
                      <div className="grid grid-cols-2 gap-2"><button disabled={isSystemBusy || playlist.filter(i => i.isStructured).length === 0} onClick={() => exportTableCSV(tableViewMode === 'study' ? 'study' : 'master')} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50"><FileDown className="w-3.5 h-3.5"/> Export Copy</button><button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className="flex items-center justify-center gap-1 px-3 py-2 rounded text-xs font-bold border border-red-100 dark:border-red-900/50 text-red-500 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5"/> Clear View</button></div>
                      <div className={`px-3 py-2 rounded-lg border text-[10px] font-bold ${isCsvDirty ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'}`}>{isCsvDirty ? `Unsaved CSV • +${csvChangeSummary.added} new • ~${csvChangeSummary.modified} edited • -${csvChangeSummary.deleted} deleted` : 'CSV synced with last saved snapshot'}</div>
                      <div className="grid grid-cols-2 gap-2"><button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="px-3 py-2 rounded text-xs font-bold border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 disabled:opacity-50">Review</button><button disabled={!undoStack.length} onClick={undoLastDataChange} className="px-3 py-2 rounded text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-50">Undo</button></div>
                      <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`w-full px-3 py-2 rounded text-xs font-bold ${isCsvDirty ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'} disabled:opacity-60`}>{isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
                  </div>}
              </div>

              {mode === 'table' && <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors"><h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><ListPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/> Add to Queue (Range)</h3><div className="flex gap-2"><input className="flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded px-3 py-2 focus:outline-indigo-500 dark:bg-slate-700 dark:text-white" placeholder="Ex: 1-10, 15" value={rangeInput} onChange={(e) => setRangeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRangeAdd()} disabled={isSystemBusy}/><button onClick={handleRangeAdd} disabled={!rangeInput.trim() || isSystemBusy} className={`px-4 py-2 rounded text-xs font-bold ${!rangeInput.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : 'bg-indigo-600 text-white'}`}>Apply</button></div></div>}
          </>}

          {sidebarSection === 'system' && <>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> System & TTS</h3>
                  <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg mb-3"><button disabled={isSystemBusy} onClick={() => setGeneratorEngine('gemini')} className={`px-2 py-1.5 rounded text-xs font-bold ${generatorEngine === 'gemini' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}>Gemini</button><button disabled={isSystemBusy} onClick={() => setGeneratorEngine('edge')} className={`px-2 py-1.5 rounded text-xs font-bold ${generatorEngine === 'edge' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Edge</button></div>
                  {generatorEngine === 'gemini' ? <div className="space-y-2"><select disabled={isSystemBusy} className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>{aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><input type="password" placeholder={apiKey ? "System Key Active" : "Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-3 py-2 w-full dark:bg-slate-700 dark:text-white ${apiKey ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={apiKey ? "" : userApiKey} disabled={!!apiKey} onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} /></div> : <div className="space-y-2"><GroupedVoiceSelect voices={edgeVoices} selectedValue={edgeVoice} onChange={e => setEdgeVoice(e.target.value)} disabled={isSystemBusy} className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" context="main"/><GroupedVoiceSelect voices={edgeVoices} selectedValue={edgeIndonesianVoice} onChange={e => setEdgeIndonesianVoice(e.target.value)} disabled={isSystemBusy} className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white" context="meaning"/><div className="grid grid-cols-2 gap-2"><label className="text-[9px] text-slate-500">Rate ({edgeRate > 0 ? '+' : ''}{edgeRate}%)<input disabled={isSystemBusy} type="range" min="-50" max="50" step="10" value={edgeRate} onChange={e => setEdgeRate(parseInt(e.target.value))} className="w-full accent-teal-600"/></label><label className="text-[9px] text-slate-500">Pitch ({edgePitch > 0 ? '+' : ''}{edgePitch}Hz)<input disabled={isSystemBusy} type="range" min="-20" max="20" step="5" value={edgePitch} onChange={e => setEdgePitch(parseInt(e.target.value))} className="w-full accent-teal-600"/></label></div><button onClick={testEdgeBackend} className="w-full py-2 rounded border border-teal-200 dark:border-teal-800 text-xs font-bold text-teal-700 dark:text-teal-300">Backend: {edgeHealth.status.toUpperCase()} • Test</button></div>}
                  <button disabled={isSystemBusy} onClick={() => folderInputRef.current?.click()} className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition border ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600'} disabled:opacity-50`}><FolderOpen className="w-3.5 h-3.5"/> Load Audio Folder</button>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-purple-600 dark:text-purple-400"/> Batch Download</h3>
                  <div className="space-y-3">
                      {mode === 'table' ? <><div className="flex flex-wrap gap-3"><button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`flex items-center gap-1 text-xs ${batchConfig.doWord ? 'text-indigo-600' : 'text-slate-400'}`}>{batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Word</button><button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doWordTranslation: !p.doWordTranslation}))} className={`flex items-center gap-1 text-xs ${batchConfig.doWordTranslation ? 'text-amber-600' : 'text-slate-400'} disabled:opacity-40`}>{batchConfig.doWordTranslation ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Word IDN</button><button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`flex items-center gap-1 text-xs ${batchConfig.doSentence ? 'text-indigo-600' : 'text-slate-400'}`}>{batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Sentence</button></div>{advancedDatasetStats.hasAdvanced && <div className="flex flex-wrap gap-3"><button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doExpressions: !p.doExpressions}))} className={`flex items-center gap-1 text-xs ${batchConfig.doExpressions ? 'text-violet-600' : 'text-slate-400'}`}>{batchConfig.doExpressions ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} EXP EN</button><button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doExpressionTranslations: !p.doExpressionTranslations}))} className={`flex items-center gap-1 text-xs ${batchConfig.doExpressionTranslations ? 'text-amber-600' : 'text-slate-400'} disabled:opacity-40`}>{batchConfig.doExpressionTranslations ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} EXP IDN</button></div>}</> : <div className="text-xs text-slate-400 italic">Batch download for full text.</div>}
                      <div className="flex items-center gap-2 text-xs"><span className="dark:text-slate-400">Range:</span><input disabled={isBatchDownloading} type="number" className="w-16 border border-slate-200 dark:border-slate-600 rounded p-1 dark:bg-slate-700 dark:text-white" value={batchConfig.start} onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))}/><span>to</span><input disabled={isBatchDownloading} type="number" className="w-16 border border-slate-200 dark:border-slate-600 rounded p-1 dark:bg-slate-700 dark:text-white" value={batchConfig.end} onChange={e=>setBatchConfig(p=>({...p, end:e.target.value}))}/></div>
                      <button onClick={runBatchDownload} disabled={isSystemBusy && !isBatchDownloading} className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${(isSystemBusy && !isBatchDownloading) ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed' : (isBatchDownloading ? 'bg-slate-100 text-slate-400' : 'bg-purple-600 text-white hover:bg-purple-700')}`}>{isBatchDownloading ? <Loader2 className="w-3 h-3 animate-spin"/> : <DownloadCloudIcon className="w-3 h-3"/>}{isBatchDownloading ? "Downloading..." : "Start Batch Download"}</button>
                  </div>
              </div>
          </>}
      </div>
  );

  const renderWorkspaceTabs = (mobileContext = false) => (
    <div className={`flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 relative ${mobileContext ? '' : 'sticky top-[43px] md:static z-30'}`} data-prolingo-workspace-shell="true">
      <button onClick={() => handleTabSwitch('master')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors duration-150 ${tableViewMode === 'master' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Database className="w-4 h-4"/> MASTER DATA</button>
      <button onClick={() => handleTabSwitch('study')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors duration-150 ${tableViewMode === 'study' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
        <ListPlus className="w-4 h-4"/> STUDY QUEUE
        {studyQueue.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{studyQueue.length}</span>}
      </button>
      {tableViewMode === 'study' && studyQueue.length > 0 && <button onClick={clearStudyQueue} className="absolute right-2 top-2 p-1.5 bg-red-50 dark:bg-red-900/50 text-red-500 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors" title="Clear Queue"><Eraser className="w-4 h-4"/></button>}
    </div>
  );

  const renderMasterDataToolbar = (extraClass = '') => {
      if (mode !== 'table' || tableViewMode !== 'master') return null;
      const totalStructured = playlist.filter(item => item.isStructured).length;
      return (
          <div className={`${extraClass} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-2 space-y-2`}>
              <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-1 relative">
                      <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input
                          value={masterSearch}
                          onChange={e => setMasterSearch(e.target.value)}
                          placeholder="Search NO, VOCAB_ID, word, meaning, sentence..."
                          className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:outline-indigo-500"
                      />
                      {masterSearch && <button onClick={() => setMasterSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-3.5 h-3.5"/></button>}
                  </div>
                  <select value={masterFilter} onChange={e => setMasterFilter(e.target.value)} className="px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                      <option value="all">All Data</option>
                      <option value="csv">CSV / Imported</option>
                      <option value="manual">Manual</option>
                      <option value="added">New</option>
                      <option value="modified">Edited</option>
                  </select>
                  <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${isCsvDirty ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600 cursor-not-allowed'}`}>
                      <History className="w-3.5 h-3.5"/> Review {isCsvDirty ? `(${csvChangeSummary.total})` : ''}
                  </button>
                  <button disabled={!undoStack.length} onClick={undoLastDataChange} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border ${undoStack.length ? 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-600 text-slate-400 cursor-not-allowed'}`} title={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label}` : 'Nothing to undo'}>
                      <RotateCcw className="w-3.5 h-3.5"/> Undo
                  </button>
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span>Showing {masterFilteredPlaylist.length} / {totalStructured} • {isCsvDirty ? `+${csvChangeSummary.added} new • ~${csvChangeSummary.modified} edited • -${csvChangeSummary.deleted} deleted` : 'CSV synced'}</span>
                  <div className="flex gap-2 items-center">
                      {lastDraftAutoSaveAt && isCsvDirty && <span>Draft autosaved {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</span>}
                      <div className="hidden md:flex items-center gap-1">
                          <span>Queue range:</span>
                          <input value={rangeInput} onChange={e => setRangeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRangeAdd()} placeholder="1-10, 15" className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                          <button disabled={!rangeInput.trim()} onClick={handleRangeAdd} className="px-2 py-1 rounded bg-indigo-600 text-white disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700">Add</button>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const renderPlaylist = () => {
    const rowHeight = rowHeights[mode];
    const totalCount = currentPlayerList.length;
    
    // --- EMPTY STATE HANDLING (CENTERED & NO SCROLL) ---
    if (totalCount === 0) {
        let emptyContent = null;
        if (mode === 'table' && tableViewMode === 'study') {
            emptyContent = (
             <div className="text-center text-slate-400">
                 <ListPlus className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Study Queue Kosong</p>
                 <button onClick={() => setTableViewMode('master')} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
                     Go to Master Data
                 </button>
             </div>
            );
        } else if (mode === 'table' && tableViewMode === 'master') {
             const hasUnderlyingData = playlist.some(item => item.isStructured);
             emptyContent = (
             <div className="text-center text-slate-400">
                 <Table className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">{hasUnderlyingData ? 'Tidak ada hasil yang cocok' : 'Belum ada data'}</p>
                 <p className="text-xs mt-2 opacity-70">{hasUnderlyingData ? 'Ubah search/filter untuk menampilkan data.' : 'Import CSV atau gunakan Add Manual.'}</p>
             </div>
            );
        } else if (mode === 'text') {
             emptyContent = (
             <div className="text-center text-slate-400">
                 <FileText className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Text Editor Kosong</p>
                 <p className="text-xs mt-2 opacity-70">Ketik teks di atas atau paste di kolom input kiri</p>
             </div>
            );
        }

        return (
            <div className="w-full h-full flex flex-col items-center p-4 min-h-[50vh]">
                 {/* Text Mode Input - Keep visible at top */}
                 {mode === 'text' && (
                     <div className="w-full mb-8 z-10">
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-start">
                             <textarea
                                 ref={newItemTextareaRef}
                                 disabled={isSystemBusy}
                                 className={`flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-y-auto min-h-[42px] max-h-[100px] ${isSystemBusy ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 dark:text-white'}`}
                                 placeholder="Ketik atau paste teks baru..."
                                 value={newTextItem}
                                 onChange={(e) => setNewTextItem(e.target.value)}
                                 onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextItem(); }}}
                                 rows={1}
                             />
                             <button 
                                 disabled={isSystemBusy || !newTextItem.trim()}
                                 onClick={handleAddTextItem} 
                                 className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-shrink-0 ${!newTextItem.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                             >
                                 <Send className="w-4 h-4"/> Add
                             </button>
                        </div>
                     </div>
                 )}
                 
                 {mode === 'table' && tableViewMode === 'master' && (
                     <div className="w-full mb-6 z-10">{renderMasterDataToolbar()}</div>
                 )}

                 <div className="flex-1 flex items-center justify-center w-full">
                    {emptyContent}
                 </div>
            </div>
        );
    }

    const totalHeight = totalCount * rowHeight;
    
    // --- FIX MOBILE SCROLL & ADDRESS BAR HIDING ---
    let mobileSpacerHeight = 0;
    if (isMobile) {
        const headerOffset = mode === 'table' ? 160 : 115; 
        const currentContentHeight = totalHeight + headerOffset;
        const minScrollableHeight = window.innerHeight + 150; 
        
        if (currentContentHeight < minScrollableHeight) {
             mobileSpacerHeight = minScrollableHeight - currentContentHeight;
        }
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const endIndex = Math.min(
        totalCount - 1,
        Math.floor((scrollTop + containerHeight) / rowHeight) + OVERSCAN
    );

    const virtualItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
        virtualItems.push({
            ...currentPlayerList[i],
            virtualIdx: i, 
            offsetTop: i * rowHeight
        });
    }

    return (
      <div 
         ref={listContainerRef} 
         onScroll={handleScroll} 
         // MODIFIED PADDING: pb-20 (Requested by user)
         className={`${isMobile ? 'overflow-visible pb-20' : 'h-full overflow-y-auto pb-0 custom-scrollbar'} relative w-full touch-pan-y`}
      >
        {mode === 'text' && (
             <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-2 px-1">
                 <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-start">
                     <textarea
                         ref={newItemTextareaRef}
                         disabled={isSystemBusy}
                         className={`flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-y-auto min-h-[42px] max-h-[100px] ${isSystemBusy ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 dark:text-white'}`}
                         placeholder="Ketik atau paste teks baru..."
                         value={newTextItem}
                         onChange={(e) => setNewTextItem(e.target.value)}
                         onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextItem(); }}}
                         rows={1}
                     />
                     <button 
                         disabled={isSystemBusy || !newTextItem.trim()}
                         onClick={handleAddTextItem} 
                         className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-shrink-0 ${!newTextItem.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                     >
                         <Send className="w-4 h-4"/> Add
                     </button>
                 </div>
             </div>
        )}

        {mode === 'table' && tableViewMode === 'master' && (
             <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-2 px-1">
                 {renderMasterDataToolbar()}
             </div>
        )}

        
        {/* FIX: Container Height = Total Konten + Spacer Mobile. Removed Subtraction logic that cut off last items. */}
        <div style={{ height: totalHeight + mobileSpacerHeight, position: 'relative' }} className="w-full">
            {virtualItems.map((item) => {
               if (mode === 'table' && item.isStructured) {
                   const isActive = (item.id === playingIndex) && (isPlaying || independentPlayingId !== null) && (playingContext === tableViewMode);
                   const rowId = `row-${item.id}`; 
                   const isInQueue = studyQueueSet.has(item.id);
                   const audioIdentity = getStableAudioIdentity(item);
                   const localWordUrl = localAudioMapTable[`${audioIdentity}_word`] || null;
                   const localWordIdnUrl = localAudioMapTable[`${audioIdentity}_word_idn`] || null;
                   const localSentUrl = localAudioMapTable[`${audioIdentity}_sentence`] || null;
                   const localMeaningUrl = localAudioMapTable[`${audioIdentity}_meaning`] || null;

                   return (
                       <MemoizedRow 
                           key={`${mode}-${tableViewMode}-${item.id}`} 
                           item={item}
                           isActive={isActive}
                           isSystemBusy={isSystemBusy}
                           toggleStudyItem={toggleStudyItem}
                           isInQueue={isInQueue}
                           handleIndependentPlay={handleIndependentPlay}
                           handleRowClick={handleManualRowClick} 
                           independentPlayingId={independentPlayingId}
                           speakingPart={speakingPart}
                           isMemoryMode={isMemoryMode}
                           memorySettings={memorySettings}
                           revealedCells={revealedCells}
                           toggleCellReveal={toggleCellReveal}
                           localWordUrl={localWordUrl}
                           localWordIdnUrl={localWordIdnUrl}
                           localSentUrl={localSentUrl}
                           localMeaningUrl={localMeaningUrl}
                           preferLocalAudio={preferLocalAudio}
                           generateAIAudio={generateAIAudio}
                           aiLoadingId={aiLoadingId}
                           rowId={rowId}
                           idx={item.virtualIdx}
                           style={{ 
                               height: rowHeight, 
                               top: item.offsetTop 
                           }}
                           activeMenuId={activeMenuId}
                           onMenuToggle={handleMenuToggle}
                           changeType={csvChangeSummary.byId[item.id] || null}
                           generatorEngine={generatorEngine}
                           onEditItem={openManualEdit}
                           onDeleteItem={deleteStructuredItem}
                           advancedExpanded={expandedAdvancedId === item.id}
                           onToggleAdvanced={() => setExpandedAdvancedId(prev => prev === item.id ? null : item.id)}
                       />
                   );
               } 
               else {
                   const textIdentity = getStableAudioIdentity(item);
                   const localTextUrl = localAudioMapText[textIdentity];
                   const textFilename = `${textIdentity}_text.wav`;
                   
                   const isActive = (item.id === playingIndex) && (isPlaying || independentPlayingId !== null) && (playingContext === 'text');
                   const isTextActive = isActive && speakingPart === 'full';

                   return (
                      <MemoizedTextRow
                        key={item.id}
                        item={item}
                        style={{ height: rowHeight, top: item.offsetTop }} 
                        isActive={isActive}
                        isTextActive={isTextActive}
                        handleManualRowClick={handleManualRowClick}
                        handleDeleteTextItem={handleDeleteTextItem}
                        localTextUrl={localTextUrl}
                        textFilename={textFilename}
                        isSystemBusy={isSystemBusy}
                        generateAIAudio={generateAIAudio}
                        aiLoadingId={aiLoadingId}
                        preferLocalAudio={preferLocalAudio}
                        generatorEngine={generatorEngine}
                      />
                   );
               }
             })}
             
             {/* RENDER MOBILE SPACER IF NEEDED (Allows Address Bar Hiding) */}
             {isMobile && mobileSpacerHeight > 0 && (
                 <div 
                    style={{ 
                        position: 'absolute', 
                        top: totalHeight, 
                        height: mobileSpacerHeight, 
                        width: '100%' 
                    }} 
                    className="flex flex-col items-center justify-start pt-10 text-slate-300 pointer-events-none"
                 >
                    <div className="flex flex-col items-center gap-2 opacity-30">
                        <ChevronsUp className="w-4 h-4 animate-bounce" />
                        <span className="text-[10px] font-medium">Scroll untuk Layar Penuh</span>
                    </div>
                 </div>
             )}
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans flex flex-col relative transition-colors ${isMobile ? 'min-h-[100dvh] overflow-x-hidden' : 'h-screen overflow-hidden'}`}>
      
      {/* --- UNIFIED MOBILE HEADER GROUP --- */}
      <div className={`z-50 bg-white dark:bg-slate-800 transition-transform duration-300 shadow-md ${isMobile ? 'fixed top-0 left-0 right-0 w-full' : 'sticky top-0 border-b border-slate-200 dark:border-slate-700'} ${isMobile && !showAppBar ? '-translate-y-full' : 'translate-y-0'}`}>
        
        {/* 1. HEADER UTAMA */}
        <div className={`p-3 flex gap-4 justify-between items-center ${!isMobile ? 'border-none shadow-none' : ''} h-16`}>
            <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300">
                {isSidebarOpen ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5"/>}
            </button>
            <div className="flex items-center gap-2 whitespace-nowrap cursor-pointer" onClick={goHome} title="Back to Landing Page">
                <div className="bg-indigo-600 text-white p-2 rounded-lg"><Mic className="w-5 h-5" /></div>
                <div><h1 className="font-bold text-slate-800 dark:text-white leading-tight">ProLingo <span className="text-indigo-500">v5.11.6</span></h1></div>
            </div>
            </div>
            
            {/* Desktop Header Tools */}
            <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
                 <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600 flex-shrink min-w-0 max-w-full overflow-hidden">
                  <Database className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-1 flex-shrink-0" />
                  <div className="flex items-center flex-shrink min-w-0">
                    <select disabled={isSystemBusy} className={`bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none w-16 lg:w-28 cursor-pointer flex-shrink min-w-0 dark:bg-slate-700 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}>
                        <option value="" disabled>Load Saved...</option>
                        {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                    {selectedDeckId && (
                        <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded transition flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Hapus Deck Ini"><Trash2 className="w-3.5 h-3.5"/></button>
                    )}
                  </div>
                  <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-500 mx-1 flex-shrink-0"></div>
                  <input disabled={isSystemBusy} className="bg-transparent text-sm w-16 lg:w-24 outline-none disabled:opacity-50 flex-shrink min-w-0 dark:text-white" placeholder="Sheet Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
                  <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-1 hover:bg-white dark:hover:bg-slate-600 text-green-600 dark:text-green-400 rounded flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Save Draft to Cache"><Save className="w-4 h-4"/></button>
                </div>
                {mode === 'table' && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`hidden lg:inline-flex px-2 py-1 rounded text-[9px] font-bold whitespace-nowrap ${isCsvDirty ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                            {isCsvDirty ? `CSV +${csvChangeSummary.added} ~${csvChangeSummary.modified} -${csvChangeSummary.deleted}` : 'CSV SAVED'}
                        </span>
                        <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`p-1.5 rounded border flex-shrink-0 ${isCsvDirty ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/20' : 'border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600'} ${(isSystemBusy || !isCsvDirty) ? 'cursor-not-allowed opacity-60' : ''}`} title="Save Updated CSV"><FileDown className="w-4 h-4"/></button>
                    </div>
                )}
            </div>

            {/* v5.11.6: technical controls moved to SYSTEM. Keep file pickers mounted for all layouts. */}
            <div className="hidden">
                <input type="file" ref={folderInputRef} webkitdirectory="" directory="" multiple onChange={handleFolderSelect} />
                <input type="file" ref={sourceInputRef} accept=".csv,.tsv,.txt" onChange={handleSourceUpload} />
                <input type="file" ref={fullPackInputRef} accept=".csv,.tsv,.txt" multiple onChange={handleFullPackUpload} />
            </div>

            <div className="md:hidden ml-auto">
                {/* REMOVED DUPLICATE ERASER BUTTON AS REQUESTED */}
            </div>
        </div>

        {/* 2. MOBILE TAB BAR */}
        <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex text-xs font-bold text-slate-500 z-10 relative">
            <button onClick={() => handleMobileTabSwitch('terminal')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'terminal' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Terminal className="w-4 h-4"/> Logs</button>
            <button onClick={() => handleMobileTabSwitch('player')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'player' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Play className="w-4 h-4"/> Player</button>
            <button onClick={() => handleMobileTabSwitch('tools')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'tools' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Settings className="w-4 h-4"/> Controls</button>
        </div>

        {/* 3. TABLE WORKSPACE TABS (Mobile) */}
        {isMobile && mode === 'table' && mobileTab === 'player' && renderWorkspaceTabs(true)}
      </div>

      <div className="flex-1 flex overflow-hidden relative z-0">
        
        {/* --- BACKDROP FOR MOBILE SIDEBAR --- */}
        {isMobile && isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-[40] backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* --- SIDEBAR --- */}
        <div className={`
             border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-lg transition-transform duration-300 ease-in-out bg-white dark:bg-slate-800 overflow-hidden
             ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
             ${isMobile 
                ? `fixed inset-y-0 left-0 w-72 z-[45] pb-20 ${mode === 'table' && mobileTab === 'player' ? 'pt-[160px]' : 'pt-[112px]'}` 
                : 'relative w-72 h-full z-40'}
             ${!isSidebarOpen && !isMobile ? 'md:w-0 md:border-none' : ''}
        `}>
          <div className="flex flex-col h-full overflow-y-auto w-72 overscroll-contain"> 
             <div className="p-4 border-b border-slate-100 dark:border-slate-700 space-y-4 flex-shrink-0">
              
              {/* THEME SELECTOR IN SIDEBAR */}
              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Theme</span>
                  <div className="flex gap-1">
                      <button onClick={() => setTheme('light')} className={`p-1.5 rounded transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Light Mode"><Sun className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setTheme('system')} className={`p-1.5 rounded transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="System Mode"><Laptop className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setTheme('dark')} className={`p-1.5 rounded transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Dark Mode"><Moon className="w-3.5 h-3.5" /></button>
                  </div>
              </div>

              <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                <button disabled={isSystemBusy} onClick={() => handleModeSwitch('table')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'table' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Table</button>
                <button disabled={isSystemBusy} onClick={() => handleModeSwitch('text')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'text' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Text</button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Control Center</p>
                    <p className="text-[8px] text-slate-400">Extensible shell for Player / Learn / Data / System.</p>
                  </div>
                  <span className="text-[8px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{sidebarSection.toUpperCase()}</span>
                </div>
                {renderControlSectionTabs(true)}
              </div>

              {sidebarSection === 'player' && <>
              <div className={`p-3 rounded-lg border ${currentMapCount > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600'}`}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Audio Source ({mode})</p>
                  {renderStatusBadge()}
                </div>
                <button onClick={() => currentMapCount > 0 && setPreferLocalAudio(!preferLocalAudio)} disabled={currentMapCount === 0 || isSystemBusy} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${currentMapCount === 0 || isSystemBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm'}`}>
                  <span className={preferLocalAudio ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}>{preferLocalAudio ? "Source: Local/Generated" : "Source: Browser TTS"}</span>
                  {preferLocalAudio ? <ToggleRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                </button>
              </div>

              </>}

              {sidebarSection === 'system' && <>
              {/* --- NEW: GENERATOR ENGINE SWITCHER --- */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                <div className="flex items-center justify-between">
                     <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                         {generatorEngine === 'gemini' ? <CloudLightning className="w-3 h-3 text-purple-500"/> : <Server className="w-3 h-3 text-teal-500"/>}
                         Generator Engine
                     </p>
                     <div className="flex bg-slate-200 dark:bg-slate-800 rounded p-0.5">
                         <button disabled={isSystemBusy} onClick={() => setGeneratorEngine('gemini')} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${generatorEngine === 'gemini' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}>Gemini</button>
                         <button disabled={isSystemBusy} onClick={() => setGeneratorEngine('edge')} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${generatorEngine === 'edge' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Edge</button>
                     </div>
                </div>

                {generatorEngine === 'gemini' ? (
                    // GEMINI CONTROLS
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <select disabled={isSystemBusy} className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-purple-100 dark:border-slate-600 text-purple-700 dark:text-purple-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>
                            {aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                        <p className="text-[9px] text-slate-400 text-right">Requires API Key</p>
                    </div>
                ) : (
                    // EDGE TTS CONTROLS (Grouped)
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <label className="text-[9px] text-slate-500 font-bold block mb-1">Main Voice (English)</label>
                        <GroupedVoiceSelect 
                            voices={edgeVoices} 
                            selectedValue={edgeVoice} 
                            onChange={e => setEdgeVoice(e.target.value)}
                            disabled={isSystemBusy}
                            className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                            context="main" // HANYA ENGLISH
                        />
                        
                        <label className="text-[9px] text-slate-500 font-bold block mb-1 mt-2">Meaning Voice (Indonesian)</label>
                        <GroupedVoiceSelect 
                            voices={edgeVoices} 
                            selectedValue={edgeIndonesianVoice} 
                            onChange={e => setEdgeIndonesianVoice(e.target.value)}
                            disabled={isSystemBusy}
                            className={`w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                            context="meaning" // KHUSUS INDO/REGIONAL
                        />

                        <div className="grid grid-cols-2 gap-2 mt-2">
                             <div>
                                 <label className="text-[9px] text-slate-500 font-bold block mb-1">Rate ({edgeRate > 0 ? '+' : ''}{edgeRate}%)</label>
                                 <input disabled={isSystemBusy} type="range" min="-50" max="50" step="10" value={edgeRate} onChange={e => setEdgeRate(parseInt(e.target.value))} className={`w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg cursor-pointer accent-teal-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} />
                             </div>
                             <div>
                                 <label className="text-[9px] text-slate-500 font-bold block mb-1">Pitch ({edgePitch > 0 ? '+' : ''}{edgePitch}Hz)</label>
                                 <input disabled={isSystemBusy} type="range" min="-20" max="20" step="5" value={edgePitch} onChange={e => setEdgePitch(parseInt(e.target.value))} className={`w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg cursor-pointer accent-teal-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} />
                             </div>
                        </div>
                        <div className={`rounded border px-2 py-2 text-[10px] ${edgeHealth.status === 'online' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : edgeHealth.status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-bold">Backend: {edgeHealth.status === 'online' ? 'ONLINE' : edgeHealth.status === 'error' ? 'ERROR' : edgeHealth.status === 'testing' ? 'TESTING' : 'UNKNOWN'}</span>
                                <button onClick={testEdgeBackend} disabled={isSystemBusy && edgeHealth.status !== 'testing'} className="px-2 py-1 rounded border border-current font-bold disabled:opacity-50">{edgeHealth.status === 'testing' ? 'Cancel' : 'Test'}</button>
                            </div>
                            <p className="mt-1 break-words opacity-80">{edgeHealth.message}</p>
                        </div>
                        <p className="text-[9px] text-slate-400 text-right">Local Backend (/api/tts)</p>
                    </div>
                )}
              </div>

              <div className="space-y-2 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                <p className="text-[10px] font-bold text-slate-400 uppercase">System Utilities</p>
                <input type="password" placeholder={apiKey ? "System Key Active" : "Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-2 w-full dark:bg-slate-800 dark:text-white ${apiKey ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={apiKey ? "" : userApiKey} disabled={!!apiKey} onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} />
                <button disabled={isSystemBusy} onClick={() => folderInputRef.current?.click()} className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 dark:bg-slate-900 text-white border-slate-900 dark:border-slate-600'} disabled:opacity-50`}><FolderOpen className="w-3.5 h-3.5"/> Load Audio Folder</button>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <button ref={batchButtonRef} disabled={isSystemBusy && !isBatchDownloading} onClick={() => setIsBatchOpen(!isBatchOpen)} className="w-full px-2 py-2 rounded border border-purple-200 dark:border-purple-800 text-[10px] font-bold text-purple-700 dark:text-purple-300 disabled:opacity-50"><Layers className="w-3 h-3 inline mr-1"/>Batch</button>
                    {isBatchOpen && renderBatchPopup()}
                  </div>
                  <button ref={debugButtonRef} onClick={() => setShowLogs(!showLogs)} className="px-2 py-2 rounded border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300"><Terminal className="w-3 h-3 inline mr-1"/>Logs</button>
                </div>
                {showLogs && <div ref={logContainerRef} className="max-h-36 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[8px] text-slate-300 space-y-1">{systemLogs.length ? systemLogs.slice(-12).map((log, i) => <div key={`${log.time}-${i}`}><span className="text-slate-500">[{log.time}]</span> <span className={log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}>{log.type}</span>: {log.message}</div>) : <div className="text-slate-500 italic">No logs available.</div>}</div>}
              </div>

              </>}

              {sidebarSection === 'player' && <>
              <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS (Playback)</p>
                {/* Browser Voice Grouped Select */}
                <GroupedVoiceSelect 
                    voices={voices}
                    selectedValue={selectedVoice?.name || ''}
                    onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
                    disabled={isSystemBusy}
                    className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                    context="main"
                />
                
                {mode === 'table' && (
                  <div className="mt-2">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Indonesian Voice (Meaning)</p>
                       {indonesianVoices.length > 0 ? (
                           <GroupedVoiceSelect
                                voices={indonesianVoices}
                                selectedValue={selectedIndonesianVoice?.name || ''}
                                onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))}
                                disabled={isSystemBusy}
                                className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                                context="meaning"
                           />
                       ) : (
                           <div className="text-[10px] text-red-400 italic border p-1 rounded bg-red-50 dark:bg-red-900/20">Browser Anda tidak mendukung suara Indonesia.</div>
                       )}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded border border-slate-100 dark:border-slate-600 mt-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-8 text-center">{rate}x</span>
                    <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="flex-1 h-1 bg-slate-200 dark:bg-slate-600 rounded-lg cursor-pointer accent-indigo-600" />
                </div>
              </div>

              </>}

              {sidebarSection === 'learn' && mode === 'table' && (
                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                     <p className="text-[10px] font-bold text-slate-400 uppercase">Learning Playback</p>
                     <div className="flex flex-col gap-2">
                        {renderPlaybackSequenceBuilder(false)}
                        
                        <div className="mt-2 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2">
                            <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600'}`}>
                                 <span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>
                                 {isMemoryMode ? <ToggleRight className="w-5 h-5 text-yellow-600 dark:text-yellow-500"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                            </button>
                            
                            {isMemoryMode && (
                                <div className="mt-2 pl-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-word" checked={memorySettings.word} onChange={(e) => setMemorySettings(prev => ({ ...prev, word: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-word" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Word</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-sentence" checked={memorySettings.sentence} onChange={(e) => setMemorySettings(prev => ({ ...prev, sentence: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-sentence" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Sentence</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-meaning" checked={memorySettings.meaning} onChange={(e) => setMemorySettings(prev => ({ ...prev, meaning: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-meaning" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Meaning</label>
                                    </div>
                                    {advancedDatasetStats.hasAdvanced && <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-expressions" checked={memorySettings.expressions} onChange={(e) => setMemorySettings(prev => ({ ...prev, expressions: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-expressions" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide EXP1–EXP5</label>
                                    </div>}
                                    <p className="text-[9px] text-yellow-600 dark:text-yellow-500 mt-1 italic leading-tight pt-1 border-t border-yellow-100 dark:border-yellow-900/50">Klik teks untuk intip (4 detik).</p>
                                </div>
                            )}
                        </div>
                     </div>
                  </div>
              )}
              {sidebarSection === 'learn' && mode !== 'table' && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-3 text-[10px] text-slate-400">Learning Sequence controls are available in Table mode.</div>
              )}

              {sidebarSection === 'data' && <>
              <div className="grid grid-cols-2 gap-2">
                {mode === 'table' ? (
                  <>
                    <button disabled={isSystemBusy} onClick={() => csvInputRef.current.click()} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs dark:text-slate-300 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Upload className="w-3 h-3"/> Import CSV</button>
                    <input type="file" ref={csvInputRef} accept=".csv,.tsv,.txt" className="hidden" onChange={handleCSVUpload} />
                    <button disabled={isSystemBusy} onClick={openManualAdd} className={`flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Plus className="w-3 h-3"/> Add Manual</button>
                    <button disabled={isSystemBusy || playlist.filter(i => i.isStructured).length === 0} onClick={() => exportTableCSV(tableViewMode === 'study' ? 'study' : 'master')} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><FileDown className="w-3 h-3"/> Export Copy</button>
                    <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                    <div className={`col-span-2 px-2 py-1.5 rounded border text-[10px] font-bold text-center ${isCsvDirty ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'}`}>
                        {isCsvDirty ? `Unsaved CSV: +${csvChangeSummary.added} new / ~${csvChangeSummary.modified} edited / -${csvChangeSummary.deleted} deleted` : 'CSV saved / no pending changes'}
                    </div>
                    <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="flex items-center justify-center gap-1 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 p-2 rounded text-xs disabled:opacity-50"><History className="w-3 h-3"/> Review Changes</button>
                    <button disabled={!undoStack.length} onClick={undoLastDataChange} className="flex items-center justify-center gap-1 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 p-2 rounded text-xs disabled:opacity-50"><RotateCcw className="w-3 h-3"/> Undo</button>
                    <button disabled={isSystemBusy || !isCsvDirty} onClick={saveUpdatedCSV} className={`col-span-2 flex items-center justify-center gap-1 p-2 rounded text-xs font-bold ${isCsvDirty ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'} ${(isSystemBusy || !isCsvDirty) ? 'cursor-not-allowed opacity-70' : ''}`}><FileDown className="w-3 h-3"/> {isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
                  </>
                ) : (
                   <>
                       <div className="col-span-2 mb-1">
                          <p className="text-[10px] text-slate-400 italic text-center border dark:border-slate-700 p-1 rounded bg-slate-50 dark:bg-slate-800">Gunakan kotak input di atas daftar untuk menambah item.</p>
                       </div>
                       <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`col-span-2 flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                   </>
                )}
              </div>
              </>}
            </div>
            
            {sidebarSection === 'data' && (mode === 'text' ? (
              <div className="flex-1 p-2 relative flex flex-col min-h-[300px] bg-white dark:bg-slate-800">
                <textarea ref={textareaRef} disabled={isSystemBusy} readOnly={isLocked || isSystemBusy} className={`w-full flex-1 text-xs font-mono p-2 border rounded resize-none focus:outline-indigo-500 transition-colors shadow-inner ${isLocked || isSystemBusy ? 'bg-slate-100 dark:bg-slate-900 text-slate-500' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white'} dark:border-slate-600`} placeholder="Paste text..." value={textContent} onChange={(e) => handleInputContentChange(e.target.value)} />
                <div className="flex justify-end items-center mt-2 px-1 flex-shrink-0 gap-2">
                   <button disabled={isLocked || isSystemBusy} onClick={handleInsertTab} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded border transition ${isLocked || isSystemBusy ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-700 text-slate-400' : 'bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 text-slate-600 dark:text-white border-slate-200 dark:border-slate-500'}`} title="Insert Tab Character (Separator)"><ArrowRightToLine className="w-3 h-3" /> Add Tab</button>
                   <button disabled={isSystemBusy} onClick={() => setLockedStates(prev => ({ ...prev, [mode]: !prev[mode] }))} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed text-slate-400' : (isLocked ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700')}`}>{isLocked ? <><Lock className="w-3 h-3"/> Locked</> : <><Unlock className="w-3 h-3"/> Unlocked</>}</button>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-3 min-h-[220px] bg-white dark:bg-slate-800 flex flex-col gap-3">
                  <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 p-3">
                      <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><Layers className="w-4 h-4 text-violet-600"/><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Source Manager</span></div><span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${isMultiSourceMode ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{isMultiSourceMode ? `MULTI${dirtySourceKeys.length ? ` • ${dirtySourceKeys.length}` : ''}` : 'FLAT'}</span></div>
                      <p className="text-[9px] text-slate-400 mb-2">Load MAIN first, then SENTENCE / EXP1–EXP5.</p>
                      <button disabled={isSystemBusy || isCsvDirty} onClick={openFullPackPicker} className="w-full mb-2 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[9px] font-bold disabled:opacity-40"><Upload className="w-3 h-3 inline mr-1"/>Load Full Pack (Auto)</button>
                      <div className="space-y-1.5">
                        {V510_SOURCE_KEYS.map(key => { const d = sourceDiagnostics[key]; const dirty = sourceChangeSummaries[key]; return <div key={key} className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5">
                          <div className="flex items-center gap-1"><span className="w-14 text-[9px] font-black text-violet-600 dark:text-violet-400">{V510_SOURCE_LABELS[key]}</span><span className="flex-1 truncate text-[8px] text-slate-400">{sourcePack[key]?.filename || 'Not loaded'}</span><button disabled={isSystemBusy} onClick={() => openSourcePicker(key)} className="px-1.5 py-0.5 rounded border dark:border-slate-600 text-[8px] font-bold">{d.loaded ? 'Replace' : 'Load'}</button>{key !== 'main' && d.loaded && <button disabled={isSystemBusy || isCsvDirty} onClick={() => removeSourceLayer(key)} className="p-0.5 text-red-500"><X className="w-3 h-3"/></button>}</div>
                          {d.loaded && <div className="mt-1 flex flex-wrap gap-x-1 text-[7px]"><span className="text-emerald-600">{d.rows} rows</span>{key !== 'main' && <><span className="text-slate-400">{d.matched} match</span>{d.missing > 0 && <span className="text-amber-600">{d.missing} missing</span>}{d.orphan > 0 && <span className="text-red-500">{d.orphan} orphan</span>}</>}{dirty.isDirty && <button onClick={() => saveUpdatedSource(key)} className="ml-auto text-amber-700 dark:text-amber-300 font-black">SAVE +{dirty.added} ~{dirty.modified} -{dirty.deleted}</button>}</div>}
                        </div>; })}
                      </div>
                      {isMultiSourceMode && <button onClick={exportMergedDataset} className="w-full mt-2 py-1.5 rounded border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-[9px] font-bold"><FileDown className="w-3 h-3 inline mr-1"/>Export Merged CSV</button>}
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                      <div className="flex items-center gap-2 mb-2"><History className="w-4 h-4 text-indigo-500"/><span className="text-xs font-bold text-slate-700 dark:text-slate-200">Data Manager</span></div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">v5.11.6 UI Shell: controls are separated into Player / Learn / Data / System; learning engine remains unchanged.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-2"><div className="text-lg font-black text-emerald-600">+{csvChangeSummary.added}</div><div className="text-[9px] text-slate-400">NEW</div></div>
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-2"><div className="text-lg font-black text-amber-600">~{csvChangeSummary.modified}</div><div className="text-[9px] text-slate-400">EDITED</div></div>
                      <div className="rounded-lg border border-red-200 dark:border-red-800 p-2"><div className="text-lg font-black text-red-500">-{csvChangeSummary.deleted}</div><div className="text-[9px] text-slate-400">DELETED</div></div>
                  </div>
                  <button disabled={!isCsvDirty} onClick={() => setIsChangeReviewOpen(true)} className="w-full py-2 rounded-lg text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-40"><History className="w-3.5 h-3.5 inline mr-1"/>Open Change Review</button>
                  <button disabled={!undoStack.length} onClick={undoLastDataChange} className="w-full py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 inline mr-1"/>Undo Last Change</button>
                  {lastDraftAutoSaveAt && isCsvDirty && <p className="text-[9px] text-center text-slate-400">Working draft autosaved at {new Date(lastDraftAutoSaveAt).toLocaleTimeString()}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* MAIN BODY AREA */}
        <div className={`flex-1 bg-slate-50 dark:bg-slate-900 ${isMobile ? '' : 'overflow-hidden relative flex flex-col'}`}>
            
            {/* 4. TABLE WORKSPACE SHELL (Desktop) */}
            {!isMobile && mode === 'table' && renderWorkspaceTabs(false)}

            <div className={`absolute inset-0 bg-slate-900 p-4 overflow-auto z-30 pt-28 pb-20 ${mobileTab === 'terminal' ? 'block md:hidden' : 'hidden'}`}>
                {systemLogs.map((log, i) => (
                    <div key={i} className="leading-tight border-b border-slate-800 pb-1 mb-1 font-mono text-[10px]">
                        <span className="text-slate-500 mr-2">[{log.time}]</span> 
                        <span className={`font-bold ${log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}`}>{log.type}:</span> 
                        <span className="text-slate-300 ml-1">{log.message}</span>
                    </div>
                ))}
            </div>

            <div className={`absolute inset-0 bg-slate-50 dark:bg-slate-900 z-30 overflow-y-auto pt-28 pb-20 ${mobileTab === 'tools' ? 'block md:hidden' : 'hidden'}`}>
                {renderMobileTools()}
            </div>

            <div className={`${mobileTab === 'player' ? 'block' : 'hidden'} md:block ${isMobile ? '' : 'flex-1 overflow-hidden p-0'}`}>
                 {/* 5. SPACER OTOMATIS */}
                 <div className={`max-w-4xl mx-auto px-2 md:px-4 ${isMobile ? 'h-auto' : 'h-full pt-2 md:pt-4'}`}
                      style={{ 
                          // FIX 1: Increased top padding for Table mode (150px -> 160px) to prevent first item being hidden behind header
                          paddingTop: isMobile ? (mode === 'table' ? '160px' : '120px') : '0' 
                      }}
                 >
                    {renderPlaylist()}
                 </div>
            </div>

        </div>
      </div>

      {/* BOTTOM BAR - FIXED BOTTOM */}
      <div className={`bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-2 md:p-4 shadow-2xl z-50 flex-shrink-0 ${isMobile ? 'fixed bottom-0 w-full' : ''}`}>
        <div className="max-w-4xl mx-auto">
           <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:hidden">
               <div className="flex flex-col min-w-0 pr-2">
                 <p className="text-[10px] font-bold text-slate-400 tracking-wider">{isPaused ? 'PAUSED' : 'NOW PLAYING'}</p>
                 <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-200">
                   {playingIndex !== null 
                     ? (() => {
                         const item = activePlaybackList.find(p => p.id === playingIndex);
                         const seqIdx = activePlaybackList.indexOf(item);
                         if (!item) return "Ready";
                         return `${seqIdx + 1}. ${item.word} (${seqIdx + 1}/${activePlaybackList.length})`;
                       })()
                     : "Ready"}
                 </p>
               </div>
               <div className="flex items-center gap-2">
                  <button onClick={() => handleSmartNav('prev')} className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full active:scale-95 transition-colors"><SkipBack className="w-5 h-5 fill-current"/></button>
                  <button onClick={handleGlobalPlay} className={`p-3 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${isPlaying && !isPaused ? 'bg-red-50 dark:bg-red-900 text-red-500 border-2 border-red-100 dark:border-red-800' : 'bg-indigo-600 text-white'}`}>
                    {isPlaying && !isPaused ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>
                  <button onClick={() => handleSmartNav('next')} className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full active:scale-95 transition-colors"><SkipForward className="w-5 h-5 fill-current"/></button>
                  <button onClick={forceStopAll} className="p-2 text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-700 rounded-full active:scale-95 transition-colors" title="Stop"><XCircle className="w-4 h-4"/></button>
               </div>
               <div className="flex justify-end gap-2">
                  <button onClick={cyclePlaybackMode} className="flex flex-col items-center justify-center gap-1 min-w-[50px] p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700">
                      {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-500 rounded px-1 text-slate-600 dark:text-slate-400">1</span>}
                      {playbackMode === 'sequence' && <List className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>}
                      {playbackMode === 'repeat_2x' && <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2x</span>}
                      {playbackMode === 'loop_one' && <Repeat1 className="w-5 h-5 text-orange-500"/>}
                      {playbackMode === 'random' && <Shuffle className="w-5 h-5 text-blue-500"/>}
                      <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-full">{playbackMode === 'once' ? 'Once' : playbackMode === 'sequence' ? 'Next' : playbackMode === 'repeat_2x' ? '2x' : playbackMode === 'loop_one' ? 'Loop' : 'Rand'}</span>
                  </button>
                  
                  {/* NEW SIDEBAR TOGGLE BUTTON - FIXED TOGGLE & PRESS STATE */}
                  <button 
                      onClick={() => {
                          if (isSidebarOpen) {
                              setIsSidebarOpen(false);
                          } else {
                              setShowAppBar(true); 
                              setTimeout(() => setIsSidebarOpen(true), 10);
                          }
                      }} 
                      className={`flex flex-col items-center justify-center gap-1 min-w-[40px] p-1 rounded transition-all active:scale-95 ${isSidebarOpen ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100'}`}
                  >
                      {isSidebarOpen ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>}
                      <span className="text-[9px] font-bold uppercase">{isSidebarOpen ? "Close" : "Menu"}</span>
                  </button>
               </div>
           </div>

           <div className="hidden md:flex items-center justify-between gap-4">
               <div className="w-64 flex flex-col">
                 <div className="flex items-center gap-2 mb-1">
                   <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                   <p className="text-[10px] font-bold text-slate-400 tracking-wider">GLOBAL PLAYER ({isPaused ? 'PAUSED' : (playingContext ? playingContext.toUpperCase() : 'IDLE')})</p>
                 </div>
                 <p className="text-sm font-semibold truncate text-slate-800 dark:text-white">
                   {playingIndex !== null 
                     ? (() => {
                         const item = activePlaybackList.find(p => p.id === playingIndex);
                         const seqIdx = activePlaybackList.indexOf(item);
                         if (!item) return "Ready";
                         return `${seqIdx + 1}. ${item.word || (item.text ? item.text.substring(0, 15)+'...' : 'Item')} (${seqIdx + 1}/${activePlaybackList.length} Items)`;
                       })()
                     : "Ready"}
                 </p>
               </div>

               <div className="flex items-center gap-4">
                    <button onClick={() => handleSmartNav('prev')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full transition active:scale-95"><SkipBack className="w-6 h-6 fill-current"/></button>
                    <button onClick={handleGlobalPlay} className={`p-4 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${isPlaying && !isPaused ? 'bg-red-50 dark:bg-red-900 text-red-500 border-2 border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                      {isPlaying && !isPaused ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                    </button>
                    <button onClick={() => handleSmartNav('next')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full transition active:scale-95"><SkipForward className="w-6 h-6 fill-current"/></button>
                    <button onClick={forceStopAll} className="p-3 text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-700 rounded-full transition active:scale-95" title="Stop"><XCircle className="w-5 h-5"/></button>
               </div>

               <div className="w-64 flex flex-col items-end gap-1">
                 <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                    <select className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none p-1 cursor-pointer dark:bg-slate-700" value={playbackMode} onChange={(e) => setPlaybackMode(e.target.value)}>
                      <option value="once">Putar Sekali</option>
                      <option value="sequence">Lanjut Otomatis</option>
                      <option value="repeat_2x">Ulangi Item 2x & Lanjut</option>
                      <option value="loop_one">Loop 1 Item</option>
                      <option value="random">Acak</option>
                    </select>
                    <div className="px-2 text-slate-400">
                      {playbackMode === 'sequence' && <List className="w-4 h-4"/>}
                      {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-400 rounded px-1">1</span>}
                      {playbackMode === 'repeat_2x' && <span className="text-xs font-bold">2x</span>}
                      {playbackMode === 'loop_one' && <Repeat1 className="w-4 h-4"/>}
                      {playbackMode === 'random' && <Shuffle className="w-4 h-4"/>}
                    </div>
                 </div>
               </div>
           </div>
        </div>
      </div>
      {isChangeReviewOpen && (
        <div className="fixed inset-0 bg-black/50 z-[140] flex items-center justify-center p-3 backdrop-blur-sm" onClick={() => setIsChangeReviewOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2"><History className="w-4 h-4 text-indigo-500"/>Change Review</h3>
                <p className="text-[10px] text-slate-400 mt-1">Compared with the last saved/imported CSV snapshot.</p>
              </div>
              <button onClick={() => setIsChangeReviewOpen(false)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4 text-slate-500"/></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {!isCsvDirty ? (
                <div className="text-center py-10 text-emerald-600 dark:text-emerald-400"><CheckCircle className="w-10 h-10 mx-auto mb-2"/><p className="font-bold">CSV is synced</p></div>
              ) : (
                <>
                  {csvChangeSummary.addedItems.length > 0 && <div>
                    <h4 className="text-xs font-black text-emerald-600 mb-2">NEW ({csvChangeSummary.addedItems.length})</h4>
                    <div className="space-y-1">{csvChangeSummary.addedItems.map(item => <div key={`add-${item.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/10"><span className="text-[10px] font-mono text-slate-400 w-12">#{item.displayId}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.word}</p><p className="text-[9px] font-mono text-slate-400 truncate">{item.vocabId || item.id}</p></div><button onClick={() => applyChangeRevert(item.id, 'added')} className="px-2 py-1 text-[10px] rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Remove</button></div>)}</div>
                  </div>}
                  {csvChangeSummary.modifiedItems.length > 0 && <div>
                    <h4 className="text-xs font-black text-amber-600 mb-2">EDITED ({csvChangeSummary.modifiedItems.length})</h4>
                    <div className="space-y-1">{csvChangeSummary.modifiedItems.map(change => <div key={`mod-${change.after.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-amber-100 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-900/10"><span className="text-[10px] font-mono text-slate-400 w-12">#{change.after.displayId}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{change.after.word}</p><p className="text-[9px] text-slate-400 truncate">from “{change.before.word}” • {change.after.vocabId || change.after.id}</p></div><button onClick={() => applyChangeRevert(change.after.id, 'modified')} className="px-2 py-1 text-[10px] rounded border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Revert</button></div>)}</div>
                  </div>}
                  {csvChangeSummary.deletedItems.length > 0 && <div>
                    <h4 className="text-xs font-black text-red-500 mb-2">DELETED ({csvChangeSummary.deletedItems.length})</h4>
                    <div className="space-y-1">{csvChangeSummary.deletedItems.map(item => <div key={`del-${item.id}`} className="flex items-center gap-2 p-2 rounded-lg border border-red-100 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10"><span className="text-[10px] font-mono text-slate-400 w-12">#{item.displayId}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.word}</p><p className="text-[9px] font-mono text-slate-400 truncate">{item.vocabId || item.id}</p></div><button onClick={() => applyChangeRevert(item.id, 'deleted')} className="px-2 py-1 text-[10px] rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">Restore</button></div>)}</div>
                  </div>}
                </>
              )}
            </div>
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-2 justify-between">
              <button disabled={!undoStack.length} onClick={undoLastDataChange} className="px-3 py-2 rounded text-xs font-bold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 disabled:opacity-40"><RotateCcw className="w-3.5 h-3.5 inline mr-1"/>Undo Last</button>
              <div className="flex gap-2">
                <button disabled={!isCsvDirty} onClick={() => setIsRevertAllConfirmOpen(true)} className="px-3 py-2 rounded text-xs font-bold border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 disabled:opacity-40">Revert All</button>
                <button disabled={!isCsvDirty} onClick={saveUpdatedCSV} className="px-3 py-2 rounded text-xs font-bold bg-amber-600 text-white disabled:opacity-40"><FileDown className="w-3.5 h-3.5 inline mr-1"/>{isMultiSourceMode ? 'Export Merged CSV' : 'Save Updated CSV'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRevertAllConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-[160] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-700">
            <h3 className="font-bold text-slate-800 dark:text-white text-center">Revert all unsaved CSV changes?</h3>
            <p className="text-xs text-slate-400 text-center mt-2">This restores the last saved/imported CSV snapshot. You can still use Undo immediately afterwards.</p>
            <div className="flex gap-2 mt-5"><button onClick={() => setIsRevertAllConfirmOpen(false)} className="flex-1 py-2 rounded border border-slate-200 dark:border-slate-600 text-sm dark:text-slate-300">Cancel</button><button onClick={revertAllChanges} className="flex-1 py-2 rounded bg-red-600 text-white text-sm font-bold">Revert All</button></div>
          </div>
        </div>
      )}

      {isManualEditorOpen && (
        <div className="fixed inset-0 bg-black/55 z-[120] flex items-center justify-center p-3 md:p-6 backdrop-blur-sm" onClick={closeManualEditor}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">{manualEditingId ? 'Edit Vocabulary' : 'Add Manual Vocabulary'}</h3>
                <p className="text-[10px] text-slate-400">v5.11.6 • UI Shell + Learning Engine • Imported baseline: {importedRowCount} • Max audio NO: #{sequenceHighWater} • Next: #{sequenceHighWater + 1}</p>
              </div>
              <button onClick={closeManualEditor} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700"><X className="w-4 h-4"/></button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase">VOCAB_ID
                  <input value={manualForm.vocabId} readOnly disabled className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-100 font-mono"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">NO / AUDIO SLOT
                  <input type="number" min="1" value={manualForm.no} readOnly disabled className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 font-mono disabled:opacity-100"/>
                  <span className="block mt-1 normal-case font-normal text-[9px] text-slate-400">Auto • nomor yang pernah dipakai tidak digunakan ulang</span>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase md:col-span-2">WORDS *
                  <input autoFocus value={manualForm.word} onChange={e => setManualForm(p => ({...p, word: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-indigo-200 dark:border-indigo-800 dark:bg-slate-700 dark:text-white"/>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Part of Speech
                  <input value={manualForm.partOfSpeech} onChange={e => setManualForm(p => ({...p, partOfSpeech: e.target.value}))} placeholder="noun / verb / adjective..." className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Meaning
                  <input value={manualForm.meaningWord} onChange={e => setManualForm(p => ({...p, meaningWord: e.target.value}))} placeholder="Arti kata" className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Info
                  <input value={manualForm.info} onChange={e => setManualForm(p => ({...p, info: e.target.value}))} placeholder="Register/context (optional)" className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"/>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase">EN / Sentence
                  <textarea rows="3" value={manualForm.sentence} onChange={e => setManualForm(p => ({...p, sentence: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                </label>
                <label className="text-[10px] font-bold text-slate-500 uppercase">IDN / Translation
                  <textarea rows="3" value={manualForm.meaning} onChange={e => setManualForm(p => ({...p, meaning: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                </label>
              </div>

              <button onClick={() => setManualAdvancedOpen(v => !v)} className="w-full flex items-center justify-between p-2 rounded border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span>Advanced Expressions EXP1–EXP5</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${manualAdvancedOpen ? 'rotate-180' : ''}`}/>
              </button>

              {manualAdvancedOpen && (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(n => (
                    <div key={n} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">EXP{n} EN
                        <textarea rows="2" value={manualForm[`exp${n}En`]} onChange={e => setManualForm(p => ({...p, [`exp${n}En`]: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                      </label>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">EXP{n} IDN
                        <textarea rows="2" value={manualForm[`exp${n}Idn`]} onChange={e => setManualForm(p => ({...p, [`exp${n}Idn`]: e.target.value}))} className="mt-1 w-full p-2 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white resize-y"/>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
              <button onClick={closeManualEditor} className="px-4 py-2 rounded border border-slate-200 dark:border-slate-600 text-sm dark:text-slate-300">Cancel</button>
              <button onClick={saveManualVocabulary} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-2"><Save className="w-4 h-4"/>{manualEditingId ? 'Save Changes' : 'Add Vocabulary'}</button>
            </div>
          </div>
        </div>
      )}

      {isClearDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center mb-4">Bersihkan Tampilan?</h3>
            <div className="flex gap-3 w-full">
                <button onClick={() => setIsClearDialogOpen(false)} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Batal</button>
                <button onClick={() => { if(mode === 'table') {setTableContent(''); setCsvBaselineContent(''); setSourcePack(createEmptySourcePack()); setSequenceHighWater(0); setManualIdHighWater(0); setImportedRowCount(0); setUndoStack([]); setMasterSearch(''); setMasterFilter('all'); setLocalAudioMapTable({}); setAudioStatusTable('idle');} else {setTextContent(''); setLocalAudioMapText({}); setAudioStatusText('idle');} setLockedStates(p => ({...p, [mode]: false})); setIsClearDialogOpen(false); resetFullState(); }} className="flex-1 py-2 rounded bg-indigo-600 text-white">Ya</button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteItem && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center"><Trash2 className="w-5 h-5"/></div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center">Delete Vocabulary?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">#{pendingDeleteItem.displayId} • {pendingDeleteItem.vocabId || pendingDeleteItem.id}<br/><span className="font-semibold">{pendingDeleteItem.word}</span></p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center mt-3">Audio slot #{pendingDeleteItem.displayId} will not be reused. Existing disk audio becomes orphan until removed manually.</p>
            <div className="flex gap-3 w-full mt-5">
                <button onClick={() => setPendingDeleteItem(null)} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Cancel</button>
                <button onClick={confirmDeleteStructuredItem} className="flex-1 py-2 rounded bg-red-500 hover:bg-red-600 text-white font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center mb-4">Hapus Deck?</h3>
            <div className="flex gap-3 w-full">
                <button onClick={() => setIsDeleteDialogOpen(false)} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Batal</button>
                <button onClick={confirmDeleteDeck} className="flex-1 py-2 rounded bg-red-500 text-white">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP WRAPPER (Theme & View Logic) ---
const App = () => {
    // State Views: 'landing' | 'app'
    const [view, setView] = useState('landing'); 
    
    // Theme State: 'light' | 'dark' | 'system'
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'system';
        }
        return 'system';
    });

    // --- REVISED THEME LOGIC: Handles Real-time System Changes ---
    useEffect(() => {
        const root = window.document.documentElement;
        
        // Function to apply the correct class
        const applyTheme = (targetTheme) => {
            root.classList.remove('light', 'dark');
            if (targetTheme === 'system') {
                const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                root.classList.add(systemIsDark ? 'dark' : 'light');
            } else {
                root.classList.add(targetTheme);
            }
        };

        // 1. Apply immediately
        applyTheme(theme);
        
        // 2. Save preference
        localStorage.setItem('theme', theme);

        // 3. Listen for system changes IF theme is 'system'
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            const handleSystemChange = (e) => {
                root.classList.remove('light', 'dark');
                root.classList.add(e.matches ? 'dark' : 'light');
            };

            // Modern event listener
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleSystemChange);
            } else {
                // Deprecated fallback
                mediaQuery.addListener(handleSystemChange);
            }

            // Cleanup listener
            return () => {
                if (mediaQuery.removeEventListener) {
                    mediaQuery.removeEventListener('change', handleSystemChange);
                } else {
                    mediaQuery.removeListener(handleSystemChange);
                }
            };
        }
    }, [theme]);

    return (
        <div className="antialiased transition-colors duration-300">
            {view === 'landing' ? (
                <LandingPage 
                    onStart={() => setView('app')} 
                    theme={theme}
                    setTheme={setTheme}
                />
            ) : (
                <MainApp goHome={() => setView('landing')} theme={theme} setTheme={setTheme} />
            )}
        </div>
    );
};

export default App;