// ProLingo v5.12.3A — Mastery Progress Statistics Domain
// Pure derived statistics only: no React state, storage writes, dataset mutation, playback, or UI side effects.

import { resolveMasteryFilterCounts } from './masteryFilterDomain.js';

const roundPercentage = (numerator, denominator) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
};

export const resolveMasteryProgressStatistics = ({
  items = [],
  masteryByVocabId = {}
} = {}) => {
  const counts = resolveMasteryFilterCounts({ items, masteryByVocabId });
  const started = counts.learning + counts.familiar + counts.mastered;

  return {
    total: counts.trackable,
    totalStructured: counts.all,
    trackable: counts.trackable,
    untrackable: counts.untrackable,
    new: counts.new,
    learning: counts.learning,
    familiar: counts.familiar,
    mastered: counts.mastered,
    started,
    startedPercentage: roundPercentage(started, counts.trackable),
    masteredPercentage: roundPercentage(counts.mastered, counts.trackable)
  };
};
