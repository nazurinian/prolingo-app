// --- AUDIO, WAV ENCODING & IDENTITY UTILITIES ---

export const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

export const encodeWAV = (samples, sampleRate = 24000) => {
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

export const base64ToInt16Array = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Int16Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
  }
  return bytes;
};

export const sanitizeFilename = (name) => {
  if (!name) return 'audio';
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
};

export const triggerBrowserDownload = (url, filename) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const downloadTextFile = (content, filename, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const formatVoiceLabel = (voice) => {
  let name = voice.name || voice.label || "";
  name = name.replace(/^Microsoft /i, '').replace(/^Google /i, '').replace(/^Android /i, '');
  name = name.replace(/Online \(Natural\) - /i, '');
  name = name.replace(/ - English \(.+\)/i, '').replace(/ English \(.+\)/i, '');
  name = name.replace(/ - Indonesian \(.+\)/i, '').replace(/ Indonesian \(.+\)/i, '');
  return name; 
};

export const groupVoicesByRegion = (voiceList, context = 'general') => {
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

export const getVocabIdentity = (item) =>
  String(item?.vocabId || item?.id || '').trim().toUpperCase();

export const getRecordAudioNo = (item) => {
  const raw = Number(item?.no ?? item?.displayId);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null;
};

// Internal audio map key is sequence-based so legacy numbered audio never shifts to another row.
export const getStableAudioIdentity = (item) => {
  if (!item) return 'UNKNOWN';
  // P4-A6: structured Text playback is segment-addressed. TEXT_ID identifies
  // the card, while SEGMENT_ID is the permanent playable/audio identity.
  const structuredTextSegmentIdentity = String(item.segmentId || (item.isTextStructuredSegment ? item.id : '') || '').trim().toUpperCase();
  if (/^SEGMENT_\d+$/.test(structuredTextSegmentIdentity)) return structuredTextSegmentIdentity;
  if (item.isStructured) {
    const no = getRecordAudioNo(item);
    return no ? `NO_${String(no).padStart(6, '0')}` : `ID_${getVocabIdentity(item) || 'UNKNOWN'}`;
  }
  const textIdentity = String(item.textId || item.id || '').trim().toUpperCase();
  if (/^TEXT_\d+$/.test(textIdentity)) return textIdentity;
  return `TEXT_${String(item.displayId || 1).padStart(6, '0')}`;
};

// Audio filename identity is VOCAB_ID-based. Numeric suffixes are rendered with a
// minimum of 4 digits for compact human-readable filenames without changing the
// canonical VOCAB_ID stored in the dataset.
export const normalizeAudioVocabIdentity = (identity) => {
  const raw = String(identity || '').trim().toUpperCase();
  if (!raw) return '';
  const match = raw.match(/^(.*_)(\d+)$/);
  if (!match) return sanitizeFilename(raw);
  const numeric = Number.parseInt(match[2], 10);
  if (!Number.isFinite(numeric) || numeric < 0) return sanitizeFilename(raw);
  return `${match[1]}${String(numeric).padStart(4, '0')}`;
};

export const getAudioFilenameIdentity = (item) => {
  if (!item?.isStructured) return getStableAudioIdentity(item);
  const no = getRecordAudioNo(item) || 1;
  const vocab = getVocabIdentity(item) || `LEGACY_${String(no).padStart(4, '0')}`;
  return normalizeAudioVocabIdentity(vocab);
};

export const getAudioVoiceFilenameLabel = (voiceLabel = '') => {
  let value = String(voiceLabel || '').trim();
  if (!value) return 'Voice';
  value = value
    .replace(/^Microsoft\s+/i, '')
    .replace(/^Google\s+/i, '')
    .replace(/^Android\s+/i, '')
    .replace(/^[a-z]{2,3}-[a-z]{2,3}-/i, '')
    .replace(/Neural$/i, '')
    .trim();
  return sanitizeFilename(value || 'Voice').replace(/\s+/g, '_');
};

// --- ADVANCED LEARNING HELPERS ---
export const getAdvancedExpressionPairs = (item = {}) => [1, 2, 3, 4, 5].map(n => ({
  number: n,
  en: String(item[`exp${n}En`] || ''),
  idn: String(item[`exp${n}Idn`] || '')
}));

export const getAdvancedContentCount = (item = {}) =>
  getAdvancedExpressionPairs(item).filter(pair => pair.en.trim() || pair.idn.trim()).length;

export const hasAdvancedContent = (item = {}) =>
  Boolean(String(item.info || '').trim() || getAdvancedContentCount(item) > 0);

export const isIndonesianAudioPart = (part = '') =>
  part === 'meaning' || part === 'word_idn' || /_idn$/i.test(String(part));

export const getItemPartText = (item = {}, part = 'full') => {
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
