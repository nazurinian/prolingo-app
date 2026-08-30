import { useState } from 'react';
import { DEFAULT_MASTERY_FILTER } from '../domain/progress/masteryFilterDomain.js';

export const useMasteryFilterState = () => {
  const [masteryFilter, setMasteryFilter] = useState(DEFAULT_MASTERY_FILTER);
  return { masteryFilter, setMasteryFilter };
};
