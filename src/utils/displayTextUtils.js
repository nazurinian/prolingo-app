/**
 * Display-only text helpers.
 * Never use these helpers for CSV serialization, audio identity, VOCAB_ID, or source matching.
 */
export const capitalizeDisplayText = (value) => {
  const text = String(value ?? '');
  if (!text) return '';

  // Capitalize the first Unicode letter while preserving leading punctuation/spacing.
  return text.replace(/\p{L}/u, (letter) => letter.toUpperCase());
};
