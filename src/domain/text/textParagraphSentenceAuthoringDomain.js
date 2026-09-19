export const TEXT_PARAGRAPH_SENTENCE_AUTHORING_VERSION = 1;
export const TEXT_PARAGRAPH_SENTENCE_MUTATION_METADATA_KEY = 'sentenceAuthoringV1';
export const TEXT_AUDIO_CONTENT_INVALIDATION_METADATA_KEY = 'contentInvalidatedV1';

const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
const normalizeMetadata = metadata => metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

// Small conservative abbreviation set. The helper is a proposal engine only:
// the future UI must preview the result before a mutation is applied.
const NON_TERMINAL_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'fig', 'no',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
]);
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '}']);

const isLowercaseLetter = character => character && character.toLocaleLowerCase() === character && character.toLocaleUpperCase() !== character;
const isDigit = character => /\d/.test(character || '');

const tokenBeforeDot = (text, dotIndex) => {
  let cursor = dotIndex - 1;
  while (cursor >= 0 && /[A-Za-z]/.test(text[cursor])) cursor -= 1;
  return text.slice(cursor + 1, dotIndex).toLowerCase();
};

const shouldTreatDotAsNonTerminal = (text, index) => {
  if (text[index] !== '.') return false;
  const previous = text[index - 1];
  const next = text[index + 1];
  if (isDigit(previous) && isDigit(next)) return true; // decimal/version number
  const token = tokenBeforeDot(text, index);
  if (NON_TERMINAL_ABBREVIATIONS.has(token)) return true;
  // Initials such as A. Smith or U.S. English should not split. Time
  // abbreviations are different: `a.m. He...` / `p.m. He...` may end a
  // sentence, while the lowercase-next rule still keeps `a.m. today` joined.
  const ending = text.slice(Math.max(0, index - 3), index + 1).toLowerCase();
  if (ending === 'a.m.' || ending === 'p.m.') return false;
  if (token.length === 1 && /[A-Za-z]/.test(token)) return true;
  return false;
};

const pushSentence = (parts, source, start, end) => {
  const sentence = source.slice(start, end).trim();
  if (sentence) parts.push(sentence);
};

export const splitTextParagraphIntoSentenceParts = value => {
  const source = clean(value);
  if (!source) return [];
  const parts = [];
  let start = 0;
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (character === '\n') {
      pushSentence(parts, source, start, index);
      while (index < source.length && source[index] === '\n') index += 1;
      start = index;
      continue;
    }

    if (!['.', '?', '!'].includes(character)) {
      index += 1;
      continue;
    }

    if (character === '.' && shouldTreatDotAsNonTerminal(source, index)) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < source.length && ['.', '?', '!'].includes(source[end])) end += 1;
    while (end < source.length && CLOSERS.has(source[end])) end += 1;

    let next = end;
    while (next < source.length && /[ \t]/.test(source[next])) next += 1;
    if (next < source.length && source[next] !== '\n' && isLowercaseLetter(source[next])) {
      index = end;
      continue;
    }

    if (next >= source.length || next > end || source[next] === '\n') {
      pushSentence(parts, source, start, end);
      while (next < source.length && /\s/.test(source[next])) next += 1;
      start = next;
      index = next;
      continue;
    }

    index = end;
  }

  pushSentence(parts, source, start, source.length);
  return parts.length ? parts : [source];
};

export const buildTextParagraphSentenceSplitProposal = ({ segment } = {}) => {
  const textParts = splitTextParagraphIntoSentenceParts(segment?.text);
  const meaningSource = clean(segment?.meaning);
  const meaningParts = meaningSource ? splitTextParagraphIntoSentenceParts(meaningSource) : [];
  const hasMultipleSentences = textParts.length > 1;
  const meaningAligned = !meaningSource || meaningParts.length === textParts.length;
  const canApply = hasMultipleSentences && meaningAligned;
  const reason = !hasMultipleSentences
    ? 'no-sentence-boundary'
    : (!meaningAligned ? 'meaning-count-mismatch' : null);
  return {
    version: TEXT_PARAGRAPH_SENTENCE_AUTHORING_VERSION,
    canApply,
    reason,
    sourceSegmentId: String(segment?.id || '').toUpperCase() || null,
    textParts,
    meaningParts,
    meaningAlignment: !meaningSource ? 'empty' : (meaningAligned ? 'paired' : 'manual-review-required'),
    parts: textParts.map((text, index) => ({
      text,
      meaning: meaningAligned ? (meaningParts[index] || '') : '',
      joinAfter: index === textParts.length - 1 ? (segment?.joinAfter || 'space') : 'space'
    }))
  };
};

const splitAtOffset = (value, offset) => {
  const source = String(value ?? '');
  const point = Number(offset);
  if (!Number.isInteger(point) || point <= 0 || point >= source.length) return null;
  const left = source.slice(0, point).trim();
  const right = source.slice(point).trim();
  return left && right ? [left, right] : null;
};

export const buildTextParagraphManualSplitProposal = ({ segment, textOffset, meaningOffset = null } = {}) => {
  const textParts = splitAtOffset(segment?.text, textOffset);
  const meaningSource = clean(segment?.meaning);
  const meaningParts = meaningSource ? splitAtOffset(segment?.meaning, meaningOffset) : ['', ''];
  const canApply = Boolean(textParts) && (!meaningSource || Boolean(meaningParts));
  return {
    version: TEXT_PARAGRAPH_SENTENCE_AUTHORING_VERSION,
    canApply,
    reason: !textParts ? 'invalid-text-split' : (meaningSource && !meaningParts ? 'meaning-split-required' : null),
    sourceSegmentId: String(segment?.id || '').toUpperCase() || null,
    parts: canApply ? [
      { text: textParts[0], meaning: meaningParts?.[0] || '', joinAfter: 'space' },
      { text: textParts[1], meaning: meaningParts?.[1] || '', joinAfter: segment?.joinAfter || 'space' }
    ] : []
  };
};

export const normalizeTextParagraphSentenceMutationParts = (parts, finalJoinAfter = 'space') => {
  const source = Array.isArray(parts) ? parts : [];
  const normalized = source.map((part, index) => ({
    text: clean(part?.text),
    meaning: clean(part?.meaning),
    joinAfter: ['space', 'line', 'none'].includes(part?.joinAfter)
      ? part.joinAfter
      : (index === source.length - 1 ? finalJoinAfter : 'space')
  }));
  if (normalized.length < 2 || normalized.some(part => !part.text)) {
    throw new Error('Paragraph sentence split requires at least two non-empty text parts');
  }
  normalized[normalized.length - 1].joinAfter = ['space', 'line', 'none'].includes(finalJoinAfter) ? finalJoinAfter : 'space';
  return normalized;
};

const separatorFor = joinAfter => joinAfter === 'none' ? '' : (joinAfter === 'line' ? '\n' : ' ');

export const joinTextParagraphSentenceSegments = segments => {
  const ordered = Array.isArray(segments) ? segments : [];
  if (ordered.length < 2) throw new Error('Paragraph sentence merge requires at least two Segments');
  const joinField = field => ordered.reduce((output, segment, index) => {
    const value = clean(segment?.[field]);
    if (!value) return output;
    if (!output) return value;
    const previous = ordered[index - 1];
    return `${output}${separatorFor(previous?.joinAfter)}${value}`.trim();
  }, '');
  return {
    text: joinField('text'),
    meaning: joinField('meaning'),
    joinAfter: ordered[ordered.length - 1]?.joinAfter || 'space'
  };
};

export const buildTextParagraphSentenceMutationMetadata = ({ metadata, operation, sourceSegmentIds, at = Date.now() } = {}) => ({
  ...normalizeMetadata(metadata),
  [TEXT_PARAGRAPH_SENTENCE_MUTATION_METADATA_KEY]: {
    version: TEXT_PARAGRAPH_SENTENCE_AUTHORING_VERSION,
    operation: String(operation || 'mutation'),
    sourceSegmentIds: (Array.isArray(sourceSegmentIds) ? sourceSegmentIds : []).map(value => String(value || '').toUpperCase()).filter(Boolean),
    at: Number(at) || Date.now()
  }
});

export const buildTextParagraphSentenceAudioInvalidationMetadata = ({ metadata, reason, at = Date.now() } = {}) => ({
  ...normalizeMetadata(metadata),
  [TEXT_AUDIO_CONTENT_INVALIDATION_METADATA_KEY]: {
    version: TEXT_PARAGRAPH_SENTENCE_AUTHORING_VERSION,
    reason: String(reason || 'paragraph-sentence-mutation'),
    at: Number(at) || Date.now()
  }
});
