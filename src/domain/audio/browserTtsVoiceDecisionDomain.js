const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

const isEnglish = voice => lower(voice?.lang).startsWith('en');
const isUkEnglish = voice => {
  const lang = lower(voice?.lang);
  return lang.includes('en-gb') || lang.includes('en_uk') || lang.includes('uk') || lang.includes('gb');
};

// Browser speechSynthesis has no standardized gender field. Use explicit voice
// names first, then known UK-female profile names. This keeps Chrome's
// "Google UK English Female" deterministic while also recognizing Edge/Safari
// style named voices when they are exposed through speechSynthesis.
const KNOWN_UK_FEMALE_TOKENS = Object.freeze([
  'google uk english female',
  'sonia',
  'libby',
  'maisie',
  'susan',
  'hazel',
  'serena'
]);

export const isLikelyUkFemaleBrowserVoice = voice => {
  if (!isUkEnglish(voice)) return false;
  const haystack = `${lower(voice?.name)} ${lower(voice?.voiceURI)}`;
  if (haystack.includes('female')) return true;
  return KNOWN_UK_FEMALE_TOKENS.some(token => haystack.includes(token));
};

const englishVoicePriority = voice => {
  const lang = lower(voice?.lang);
  const name = `${lower(voice?.name)} ${lower(voice?.voiceURI)}`;
  if (isUkEnglish(voice) && name.includes('google uk english female')) return 0;
  if (isLikelyUkFemaleBrowserVoice(voice)) return 1;
  if (isUkEnglish(voice)) return 2;
  if (lang.includes('us')) return 3;
  if (lang.includes('au')) return 4;
  if (lang.includes('sg')) return 5;
  return 6;
};

export const resolveBrowserTtsVoiceState = (allVoices) => {
  const source = Array.isArray(allVoices) ? allVoices : [];
  if (source.length === 0) return null;

  const engVoices = source.filter(isEnglish).sort((a, b) => {
    const priorityDelta = englishVoicePriority(a) - englishVoicePriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    return clean(a?.name).localeCompare(clean(b?.name));
  });

  // Default EN Browser TTS: UK female when the browser exposes one; otherwise
  // any en-GB voice, then the historical regional fallback order above.
  const defaultEng = engVoices[0] || null;

  const idVoices = source.filter(v => {
    const lang = lower(v?.lang);
    return lang.includes('id') || lang.includes('indones');
  });
  const defaultId = idVoices.find(v => lower(v?.name).includes('google') || lower(v?.name).includes('indonesia')) || idVoices[0] || null;

  return { engVoices, defaultEng, idVoices, defaultId };
};
