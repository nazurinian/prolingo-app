export const mapPlaybackSequenceKeyToSlideKey = (key) => {
  if (key === 'sentence_en' || key === 'sentence_idn') return 'sentence';
  const match = String(key || '').match(/^exp([1-5])_(?:en|idn)$/i);
  return match ? `exp${match[1]}` : null;
};

export const resolveFirstEnabledTextSlideKey = (playbackSequence = [], slideKeys = []) => {
  const available = new Set(slideKeys);
  for (const entry of Array.isArray(playbackSequence) ? playbackSequence : []) {
    if (!entry?.enabled) continue;
    const slideKey = mapPlaybackSequenceKeyToSlideKey(entry.key);
    if (slideKey && available.has(slideKey)) return slideKey;
  }
  return slideKeys[0] || null;
};

export const resolveSpeakingPartSlideKey = (speakingPart, slideKeys = []) => {
  const available = new Set(slideKeys);
  if ((speakingPart === 'sentence' || speakingPart === 'meaning') && available.has('sentence')) return 'sentence';
  const match = String(speakingPart || '').match(/^exp([1-5])_(?:en|idn)$/i);
  if (!match) return null;
  const slideKey = `exp${match[1]}`;
  return available.has(slideKey) ? slideKey : null;
};
