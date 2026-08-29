// --- VOCABULARY PLAYBACK ORDER RESOLUTION ---
// Phase 2B.2: pure shuffle-round resolver mechanically extracted from App.jsx.
// No React state, refs, timers, audio, storage, or side effects live here.

import {
  createEmptyVocabularyOrder,
  getPlaybackItemId,
  getPlaybackListSignature,
  reorderPlaybackListByIds,
  shuffleVocabularyItems
} from '../../utils/playbackSequenceUtils';

export const resolveVocabularyPlaybackOrderState = (
  baseList,
  context,
  playOrder,
  existingOrder,
  options = {}
) => {
  if (playOrder !== 'shuffle') {
    return { list: baseList, nextOrder: existingOrder, changed: false };
  }

  const signature = getPlaybackListSignature(baseList);
  const existing = existingOrder || createEmptyVocabularyOrder();
  const sameOrder = (
    !options.forceReshuffle &&
    existing.context === context &&
    existing.signature === signature &&
    existing.ids.length === baseList.length
  );

  if (sameOrder) {
    const ordered = reorderPlaybackListByIds(baseList, existing.ids);
    if (ordered.length === baseList.length) {
      return { list: ordered, nextOrder: existing, changed: false };
    }
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

  return { list: shuffled, nextOrder, changed: true };
};
