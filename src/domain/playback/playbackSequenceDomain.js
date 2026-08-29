// --- PLAYBACK SEQUENCE STATE TRANSFORMATIONS ---
// Phase 2B.1: pure transformations mechanically extracted from App.jsx.
// No React state, refs, timers, audio, storage, or side effects live here.

import { normalizePlaybackDelays, normalizePlaybackSequence } from '../../utils/playbackSequenceUtils';

export const togglePlaybackSequencePartState = (previous, key) =>
  normalizePlaybackSequence(previous).map(entry =>
    entry.key === key ? { ...entry, enabled: !entry.enabled } : entry
  );

export const setPlaybackSequencePartRepeatState = (previous, key, repeat) => {
  const safeRepeat = Math.min(5, Math.max(1, Number.parseInt(repeat, 10) || 1));
  return normalizePlaybackSequence(previous).map(entry =>
    entry.key === key ? { ...entry, repeat: safeRepeat } : entry
  );
};

export const setPlaybackDelayState = (previous, field, value) =>
  normalizePlaybackDelays({ ...previous, [field]: value });

export const movePlaybackSequencePartState = (previous, key, direction) => {
  const next = normalizePlaybackSequence(previous);
  const index = next.findIndex(entry => entry.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  const copy = [...next];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
};

export const shufflePlaybackSequenceState = (previous) => {
  const next = [...normalizePlaybackSequence(previous)];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};
