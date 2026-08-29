// --- PLAYBACK SEQUENCE, PRESETS & VOCABULARY ORDER UTILITIES ---
import { V511_PLAYBACK_PARTS, V511_DEFAULT_DELAYS } from '../constants/playbackConstants';

export const createDefaultPlaybackSequence = () => 
  V511_PLAYBACK_PARTS.map(part => ({ key: part.key, enabled: part.defaultEnabled, repeat: 1 }));

export const normalizePlaybackSequence = (input) => {
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

export const createPlaybackPresetSequence = (preset) => {
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

export const normalizePlaybackDelays = (input) => {
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

export const playbackConfigSignature = (sequence, delays) => JSON.stringify({
  sequence: normalizePlaybackSequence(sequence).map(({ key, enabled, repeat }) => ({ key, enabled, repeat })),
  delays: normalizePlaybackDelays(delays)
});

export const formatPlaybackDelay = (ms) => {
  const value = Number(ms) || 0;
  if (value === 0) return '0s';
  if (value < 1000) return `${value}ms`;
  return `${Number((value / 1000).toFixed(2))}s`;
};

export const createEmptyVocabularyOrder = () => ({ context: null, signature: '', ids: [], cycle: 0 });

export const getPlaybackItemId = (item) => String(item?.id ?? item?.vocabId ?? item?.displayId ?? '');

export const getPlaybackListSignature = (items = []) =>
  items.map(getPlaybackItemId).join('\u001f');

export const reorderPlaybackListByIds = (baseList = [], orderedIds = []) => {
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

export const shuffleVocabularyItems = (baseList = [], { anchorId = null, avoidFirstId = null } = {}) => {
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
