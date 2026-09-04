const FIVE_TRUE = Object.freeze([true, true, true, true, true]);
const FIVE_FALSE = Object.freeze([false, false, false, false, false]);

export const createDefaultMemorySettings = () => ({
  wordEn: true,
  wordIdn: true,
  sentenceEn: true,
  sentenceIdn: true,
  expEn: [...FIVE_TRUE],
  expIdn: [...FIVE_TRUE],
});

export const createAllVisibleMemorySettings = () => ({
  wordEn: false,
  wordIdn: false,
  sentenceEn: false,
  sentenceIdn: false,
  expEn: [...FIVE_FALSE],
  expIdn: [...FIVE_FALSE],
});

export const normalizeMemorySettings = (settings = {}) => {
  if (
    Object.prototype.hasOwnProperty.call(settings, 'wordEn') ||
    Object.prototype.hasOwnProperty.call(settings, 'sentenceEn') ||
    Array.isArray(settings.expEn)
  ) {
    return {
      wordEn: Boolean(settings.wordEn),
      wordIdn: Boolean(settings.wordIdn),
      sentenceEn: Boolean(settings.sentenceEn),
      sentenceIdn: Boolean(settings.sentenceIdn),
      expEn: Array.from({ length: 5 }, (_, index) => Boolean(settings.expEn?.[index])),
      expIdn: Array.from({ length: 5 }, (_, index) => Boolean(settings.expIdn?.[index])),
    };
  }

  // Backward compatibility for the pre-A25 grouped Memory Mode model.
  const oldWord = settings.word ?? true;
  const oldMeaning = settings.meaning ?? true;
  const oldSentence = settings.sentence ?? true;
  const oldExpressions = settings.expressions ?? true;
  return {
    wordEn: Boolean(oldWord),
    wordIdn: Boolean(oldMeaning),
    sentenceEn: Boolean(oldSentence),
    sentenceIdn: Boolean(oldMeaning),
    expEn: Array(5).fill(Boolean(oldExpressions)),
    expIdn: Array(5).fill(Boolean(oldExpressions)),
  };
};

export const setAllMemoryFieldsHidden = (hidden) => (
  hidden ? createDefaultMemorySettings() : createAllVisibleMemorySettings()
);

const EXP_PART_RE = /^exp([1-5])_(en|idn)$/;

export const isMemoryPartHidden = (settings, part) => {
  const normalized = normalizeMemorySettings(settings);
  switch (part) {
    case 'word': return normalized.wordEn;
    case 'word_idn': return normalized.wordIdn;
    case 'sentence': return normalized.sentenceEn;
    case 'meaning': return normalized.sentenceIdn;
    default: {
      const match = String(part || '').match(EXP_PART_RE);
      if (!match) return false;
      const index = Number(match[1]) - 1;
      return match[2] === 'en' ? normalized.expEn[index] : normalized.expIdn[index];
    }
  }
};

export const setMemoryPartHidden = (settings, part, hidden) => {
  const next = normalizeMemorySettings(settings);
  const value = Boolean(hidden);
  switch (part) {
    case 'word': return { ...next, wordEn: value };
    case 'word_idn': return { ...next, wordIdn: value };
    case 'sentence': return { ...next, sentenceEn: value };
    case 'meaning': return { ...next, sentenceIdn: value };
    default: {
      const match = String(part || '').match(EXP_PART_RE);
      if (!match) return next;
      const index = Number(match[1]) - 1;
      const key = match[2] === 'en' ? 'expEn' : 'expIdn';
      const values = [...next[key]];
      values[index] = value;
      return { ...next, [key]: values };
    }
  }
};

export const getMemoryRevealKey = (rowId, part) => `${rowId}-memory-${part}`;
