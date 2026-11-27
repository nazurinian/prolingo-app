const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const voiceLabel = voice => `${clean(voice?.name)} ${clean(voice?.voiceURI)}`;
const browserFamily = (browser = globalThis.navigator) => {
  const brands = (browser?.userAgentData?.brands ?? []).map(entry => entry.brand);
  const agent = browser?.userAgent ?? '';
  if (brands.includes('Microsoft Edge') || /\b(?:Edg|EdgA|EdgiOS|Edge)\//u.test(agent)) return 'edge';
  if (brands.includes('Google Chrome') || /\b(?:Chrome|CriOS)\//u.test(agent)) return 'chrome';
  return null;
};

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

const orderedEnglishVoices = voices => voices.filter(isEnglish).sort((a, b) =>
  englishVoicePriority(a) - englishVoicePriority(b) || clean(a.name).localeCompare(clean(b.name)));

export const resolveDefaultEnglishBrowserVoice = (voices, browser) => {
  const eligible = orderedEnglishVoices(Array.isArray(voices) ? voices : []);
  const sonia = browserFamily(browser) !== 'chrome'
    ? eligible.find(voice => isUkEnglish(voice) && /\bsonia\b/iu.test(voiceLabel(voice))) : null;
  return sonia || eligible[0] || null;
};

const isStandardIndonesianVoice = voice => {
  const lang = lower(voice?.lang).replace(/_/g, '-');
  const name = lower(voice?.name);
  if (lang.startsWith('jv') || lang.startsWith('su') || name.includes('javanese') || name.includes('sundanese')) {
    return false;
  }
  return (
    lang === 'id'
    || lang === 'in'
    || lang.startsWith('id-')
    || lang.startsWith('in-')
    || lang.includes('indones')
    || name.includes('indones')
  );
};

const isIndonesianRegionVoice = voice => isStandardIndonesianVoice(voice)
  || /^(?:jv|su)[-_]id(?:$|[-_])/iu.test(clean(voice?.lang));

export const resolveDefaultIndonesianBrowserVoice = (voices, browser) => {
  const idVoices = Array.isArray(voices) ? voices.filter(isIndonesianRegionVoice) : [];
  if (!idVoices.length) return null;

  const isNatural = voice => /\bnatural\b|\bonline\b/i.test(clean(voice?.name));
  const gadisMatches = idVoices.filter(v => isStandardIndonesianVoice(v) && /\bgadis\b/iu.test(voiceLabel(v)));
  if (browserFamily(browser) !== 'chrome' && gadisMatches.length) {
    return gadisMatches.find(isNatural) || gadisMatches[0];
  }

  const standardIdVoices = idVoices.filter(isStandardIndonesianVoice);
  const searchPool = standardIdVoices.length ? standardIdVoices : idVoices;

  const exactGoogleBahasa = searchPool.find(v => /\bgoogle\s+bahasa\s+indonesia\b/i.test(clean(v?.name)));
  if (exactGoogleBahasa) return exactGoogleBahasa;

  const anyGoogleId = searchPool.find(v => /\bgoogle\b/i.test(clean(v?.name)));
  if (anyGoogleId) return anyGoogleId;

  const bahasaIndonesia = searchPool.find(v => /\bbahasa\s+indonesia\b/i.test(clean(v?.name)));
  if (bahasaIndonesia) return bahasaIndonesia;

  const nonAndikaId = searchPool.find(v => !/\bandika\b/i.test(clean(v?.name)));
  if (nonAndikaId) return nonAndikaId;

  return searchPool[0] || idVoices[0] || null;
};

export const resolveBrowserTtsVoiceState = (allVoices, browser) => {
  const source = Array.isArray(allVoices) ? allVoices : [];
  if (source.length === 0) return null;

  const engVoices = orderedEnglishVoices(source);
  const idVoices = source.filter(isIndonesianRegionVoice);
  const defaultEng = resolveDefaultEnglishBrowserVoice(engVoices, browser);
  const defaultId = resolveDefaultIndonesianBrowserVoice(idVoices, browser);

  return { engVoices, defaultEng, idVoices, defaultId };
};
