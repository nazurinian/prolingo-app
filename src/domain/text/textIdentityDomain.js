export const TEXT_IDENTITY_SCHEMA_VERSION = 1;
export const TEXT_ID_PREFIX = 'TEXT_';
export const DEFAULT_TEXT_CONTENT = 'Hello world.\nThis is line number two.\nEach line is treated as an item.';

const normalizeLine = (value) => String(value ?? '').trim();

export const parseTextContentLines = (rawContent = '') =>
  String(rawContent ?? '')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);

export const formatTextId = (sequence) => {
  const safe = Math.max(1, Number.parseInt(sequence, 10) || 1);
  return `${TEXT_ID_PREFIX}${String(safe).padStart(6, '0')}`;
};

export const getTextIdSequence = (id) => {
  const match = String(id || '').toUpperCase().match(/^TEXT_(\d+)$/);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const createEmptyTextIdentityState = () => ({
  schemaVersion: TEXT_IDENTITY_SCHEMA_VERSION,
  highWater: 0,
  rawContent: '',
  items: []
});

export const createTextIdentityStateFromContent = (
  rawContent = DEFAULT_TEXT_CONTENT,
  startingHighWater = 0
) => {
  const lines = parseTextContentLines(rawContent);
  let highWater = Math.max(0, Number.parseInt(startingHighWater, 10) || 0);
  const items = lines.map(text => {
    highWater += 1;
    return { id: formatTextId(highWater), text };
  });
  return {
    schemaVersion: TEXT_IDENTITY_SCHEMA_VERSION,
    highWater,
    rawContent: String(rawContent ?? ''),
    items
  };
};

export const normalizeTextIdentityState = (candidate, fallbackContent = DEFAULT_TEXT_CONTENT) => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return createTextIdentityStateFromContent(fallbackContent);
  }

  const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
  const seen = new Set();
  const items = [];
  let maxSequence = Math.max(0, Number.parseInt(candidate.highWater, 10) || 0);

  for (const rawItem of rawItems) {
    const id = String(rawItem?.id || '').toUpperCase();
    const sequence = getTextIdSequence(id);
    const text = normalizeLine(rawItem?.text);
    if (!sequence || !text || seen.has(id)) continue;
    seen.add(id);
    maxSequence = Math.max(maxSequence, sequence);
    items.push({ id, text });
  }

  const rawContent = typeof candidate.rawContent === 'string'
    ? candidate.rawContent
    : items.map(item => item.text).join('\n');
  const contentLines = parseTextContentLines(rawContent);

  // A malformed/mismatched persisted record must never guess IDs for different text.
  if (items.length !== contentLines.length || items.some((item, index) => item.text !== contentLines[index])) {
    return createTextIdentityStateFromContent(rawContent || fallbackContent, maxSequence);
  }

  return {
    schemaVersion: TEXT_IDENTITY_SCHEMA_VERSION,
    highWater: maxSequence,
    rawContent,
    items
  };
};

// F: reconcile editor text to stable TEXT_IDs.
// - Exact text matches keep their IDs even after reorder.
// - If line count is unchanged, remaining rows keep positional IDs so normal typing/editing
//   does not churn identity on every keystroke.
// - If line count changes, unmatched new rows receive NEW IDs; deleted IDs are never reused.
export const reconcileTextIdentityState = (previousState, rawContent = '') => {
  const previous = normalizeTextIdentityState(previousState, '');
  const nextRaw = String(rawContent ?? '');
  if (previous.rawContent === nextRaw) return previous;

  const nextLines = parseTextContentLines(nextRaw);
  if (!nextLines.length) {
    return {
      schemaVersion: TEXT_IDENTITY_SCHEMA_VERSION,
      highWater: previous.highWater,
      rawContent: nextRaw,
      items: []
    };
  }

  const oldItems = previous.items;
  const usedOld = new Set();
  const nextItems = new Array(nextLines.length).fill(null);

  // First preserve exact text identities across insert/delete/reorder.
  const oldByText = new Map();
  oldItems.forEach((item, index) => {
    const queue = oldByText.get(item.text) || [];
    queue.push(index);
    oldByText.set(item.text, queue);
  });
  nextLines.forEach((text, nextIndex) => {
    const queue = oldByText.get(text);
    while (queue?.length && usedOld.has(queue[0])) queue.shift();
    if (!queue?.length) return;
    const oldIndex = queue.shift();
    usedOld.add(oldIndex);
    nextItems[nextIndex] = { id: oldItems[oldIndex].id, text };
  });

  // With an unchanged row count, unmatched rows are in-place edits and keep identity.
  if (oldItems.length === nextLines.length) {
    nextLines.forEach((text, index) => {
      if (nextItems[index] || usedOld.has(index) || !oldItems[index]) return;
      usedOld.add(index);
      nextItems[index] = { id: oldItems[index].id, text };
    });
  }

  let highWater = previous.highWater;
  nextLines.forEach((text, index) => {
    if (nextItems[index]) return;
    highWater += 1;
    nextItems[index] = { id: formatTextId(highWater), text };
  });

  return {
    schemaVersion: TEXT_IDENTITY_SCHEMA_VERSION,
    highWater,
    rawContent: nextRaw,
    items: nextItems
  };
};

export const resolveTextPlaylist = (textIdentityState) => {
  const state = normalizeTextIdentityState(textIdentityState, '');
  return state.items.map((item, index) => ({
    id: item.id,
    textId: item.id,
    vocabId: null,
    displayId: index + 1,
    text: item.text,
    isStructured: false
  }));
};
