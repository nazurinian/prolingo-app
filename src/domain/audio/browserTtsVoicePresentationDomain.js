import {
  compareVoicesWithinGroup,
  getEnglishRegionCountryName,
  NAMED_ENGLISH_REGION_CODES
} from './voicePresentationDomain.js';

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

export const BROWSER_TTS_GROUP_LABELS = Object.freeze({
  UK: 'UK (United Kingdom)',
  US: 'US (United States)',
  AU: 'AU (Australia)',
  NZ: 'NZ (New Zealand)',
  SG: 'SG (Singapore)',
  CA: 'CA (Canada)',
  IE: 'IE (Ireland)',
  OTHER_EN: 'Other English',
  ID_GENERAL: 'Indonesia & Regional (ID/JV/SU)',
  ID: 'Indonesian (ID)',
  JV: 'Javanese (JV)',
  SU: 'Sundanese (SU)',
  ID_OTHER: 'Other Indonesian & Regional'
});

const ENGLISH_REGION_GROUPS = Object.freeze([
  ['UK', BROWSER_TTS_GROUP_LABELS.UK],
  ['US', BROWSER_TTS_GROUP_LABELS.US],
  ['AU', BROWSER_TTS_GROUP_LABELS.AU],
  ['NZ', BROWSER_TTS_GROUP_LABELS.NZ],
  ['SG', BROWSER_TTS_GROUP_LABELS.SG],
  ['CA', BROWSER_TTS_GROUP_LABELS.CA],
  ['IE', BROWSER_TTS_GROUP_LABELS.IE]
]);

// Explicitly known child voice identities for browsers whose SpeechSynthesisVoice.name
// omits an explicit "(Child)" marker (for example Windows/Edge Maisie and Ana).
const KNOWN_CHILD_VOICES = Object.freeze({
  maisie: new Set(['UK', '']),
  ana: new Set(['US', ''])
});

const extractLanguageSubtags = langLike => {
  const normalized = clean(langLike).replace(/_/g, '-');
  if (!normalized) return { language: '', region: '' };
  const parts = normalized.split('-').filter(Boolean);
  const language = lower(parts[0]);
  const region = parts.slice(1).find(part => /^[A-Za-z]{2,3}$/.test(part)) || '';
  return { language, region: region.toUpperCase() };
};

const inferRegionCode = (voiceLike, rawName, langLike) => {
  const { language, region } = extractLanguageSubtags(langLike);

  if (language === 'jv' || /\bjavanese\b/i.test(rawName)) {
    return { code: 'JV', isEnglish: false, isIndoRegion: true, explicitForeign: false };
  }
  if (language === 'su' || /\bsundanese\b/i.test(rawName)) {
    return { code: 'SU', isEnglish: false, isIndoRegion: true, explicitForeign: false };
  }
  if (
    language === 'id'
    || language === 'in'
    || language === 'indones'
    || region === 'ID'
    || /\bindones(?:ian|ia)\b/i.test(rawName)
  ) {
    return { code: 'ID', isEnglish: false, isIndoRegion: true, explicitForeign: false };
  }

  if (language === 'en' || (!language && /\benglish\b|\b(?:uk|us)\s+english\b/i.test(rawName))) {
    const resolvedRegion = region === 'GB' || region === 'UK'
      ? 'UK'
      : region === 'US'
        ? 'US'
        : region === 'AU'
          ? 'AU'
          : region === 'NZ'
            ? 'NZ'
            : region === 'SG'
              ? 'SG'
              : region === 'CA'
                ? 'CA'
                : region === 'IE'
                  ? 'IE'
                  : /United Kingdom|\bUK\b/i.test(rawName)
                    ? 'UK'
                    : /United States|\bUS\b/i.test(rawName)
                      ? 'US'
                      : /Australia/i.test(rawName)
                        ? 'AU'
                        : /New Zealand/i.test(rawName)
                          ? 'NZ'
                          : /Singapore/i.test(rawName)
                            ? 'SG'
                            : /Canada/i.test(rawName)
                              ? 'CA'
                              : /Ireland/i.test(rawName)
                                ? 'IE'
                                : /India/i.test(rawName)
                                  ? 'IN'
                                  : /Hong Kong/i.test(rawName)
                                    ? 'HK'
                                    : /South Africa/i.test(rawName)
                                      ? 'ZA'
                                      : /Philippines/i.test(rawName)
                                        ? 'PH'
                                        : /Kenya/i.test(rawName)
                                          ? 'KE'
                                          : /Nigeria/i.test(rawName)
                                            ? 'NG'
                                            : /Tanzania/i.test(rawName)
                                              ? 'TZ'
                                              : (region && region !== 'EN' ? region : '');
    return { code: resolvedRegion, isEnglish: true, isIndoRegion: false, explicitForeign: false };
  }

  if (language) {
    return { code: region || language.toUpperCase(), isEnglish: false, isIndoRegion: false, explicitForeign: true };
  }

  return { code: '', isEnglish: false, isIndoRegion: false, explicitForeign: false };
};

const extractCompactVoiceName = rawName => {
  const trimmed = clean(rawName);
  if (!trimmed) return '';
  if (/^Microsoft /i.test(trimmed)) {
    return trimmed
      .replace(/^Microsoft /i, '')
      .replace(/ Online.*$/i, '')
      .replace(/ Desktop.*$/i, '')
      .replace(/ Mobile.*$/i, '')
      .replace(/ - .+$/i, '')
      .trim() || trimmed;
  }
  return trimmed
    .replace(/ - (?:English|Indonesian|Javanese|Sundanese) \([^)]+\)$/i, '')
    .trim() || trimmed;
};

const isNaturalVoice = (voiceLike, rawName) => {
  if (voiceLike && typeof voiceLike === 'object' && voiceLike.natural === true) return true;
  return /\(\s*Natural\s*\)|\bNatural\b/i.test(rawName);
};

const isStandardVoice = (voiceLike, rawName, natural) => {
  if (natural) return false;
  if (voiceLike && typeof voiceLike === 'object' && voiceLike.standard === true) return true;
  return /\(\s*Standard\s*\)|\bDesktop\b/i.test(rawName);
};

const isChildVoice = (voiceLike, rawName, compactName, regionCode) => {
  if (voiceLike && typeof voiceLike === 'object') {
    if (voiceLike.child === true || voiceLike.isChild === true) return true;
    if (lower(voiceLike.age) === 'child') return true;
  }
  if (/\(\s*Child\s*\)|\bChild\b/i.test(rawName)) return true;
  const knownRegions = KNOWN_CHILD_VOICES[lower(compactName)];
  if (!knownRegions) return false;
  return knownRegions.has(regionCode) || (!regionCode && /\bMicrosoft\b/i.test(rawName));
};

export const getBrowserTtsVoiceValue = voiceLike => {
  if (voiceLike && typeof voiceLike === 'object') {
    return clean(voiceLike.id || voiceLike.name || voiceLike.voiceURI || voiceLike.label);
  }
  return clean(voiceLike);
};

export const dedupeBrowserTtsVoices = voices => {
  const seen = new Set();
  const result = [];
  (Array.isArray(voices) ? voices : []).forEach(voice => {
    const isObject = Boolean(voice && typeof voice === 'object');
    const name = isObject ? clean(voice.name || voice.voiceURI || voice.id || voice.label) : clean(voice);
    if (!name || seen.has(name)) return;
    seen.add(name);
    result.push(isObject ? voice : { name, lang: '' });
  });
  return result;
};

// Display-only Browser TTS voice label formatter. Keep raw voice.name / voiceURI in stored values and IDs.
export const formatBrowserTtsVoiceLabel = (voiceLike, { fallbackLabel = 'Browser system default', includeEngineHint = false } = {}) => {
  const isObject = Boolean(voiceLike && typeof voiceLike === 'object');
  const rawName = isObject
    ? clean(voiceLike.name || voiceLike.voiceURI || voiceLike.label || voiceLike.id)
    : clean(voiceLike);
  if (!rawName) return fallbackLabel;

  const langLike = isObject ? clean(voiceLike.lang) : '';
  const compactName = extractCompactVoiceName(rawName);
  const regionInfo = inferRegionCode(voiceLike, rawName, langLike);
  const regionDisplay = regionInfo.code
    ? (regionInfo.isEnglish && !NAMED_ENGLISH_REGION_CODES.has(regionInfo.code)
      ? (getEnglishRegionCountryName(regionInfo.code) || regionInfo.code)
      : regionInfo.code)
    : null;
  const natural = isNaturalVoice(voiceLike, rawName);
  const standard = isStandardVoice(voiceLike, rawName, natural);
  const child = isChildVoice(voiceLike, rawName, compactName, regionInfo.code);
  const variant = natural ? 'Natural' : standard ? 'Standard' : null;

  return [
    compactName || rawName,
    variant,
    regionDisplay,
    child ? 'Child' : null,
    includeEngineHint ? 'Browser TTS' : null
  ].filter(Boolean).join(' · ');
};

const getBrowserVoiceSortLanguage = regionCode => {
  if (regionCode === 'ID') return 'id';
  if (regionCode === 'JV') return 'jv';
  if (regionCode === 'SU') return 'su';
  return '';
};

export const groupBrowserTtsVoicesByRegion = (voiceList, context = 'general') => {
  const groups = {};
  if (context === 'meaning') {
    groups[BROWSER_TTS_GROUP_LABELS.ID] = [];
    groups[BROWSER_TTS_GROUP_LABELS.JV] = [];
    groups[BROWSER_TTS_GROUP_LABELS.SU] = [];
    groups[BROWSER_TTS_GROUP_LABELS.ID_OTHER] = [];
  } else {
    ENGLISH_REGION_GROUPS.forEach(([, label]) => {
      groups[label] = [];
    });
    groups[BROWSER_TTS_GROUP_LABELS.OTHER_EN] = [];
    if (context !== 'main') {
      groups[BROWSER_TTS_GROUP_LABELS.ID_GENERAL] = [];
    }
  }

  (Array.isArray(voiceList) ? voiceList : []).forEach(voice => {
    if (!voice) return;
    const isObject = typeof voice === 'object';
    const rawName = isObject ? clean(voice.name || voice.voiceURI || voice.label || voice.id) : clean(voice);
    const langLike = isObject ? clean(voice.lang) : '';
    const regionInfo = inferRegionCode(voice, rawName, langLike);

    if (context === 'main') {
      if (regionInfo.isIndoRegion || regionInfo.explicitForeign) return;
      const matched = ENGLISH_REGION_GROUPS.find(([code]) => code === regionInfo.code);
      if (matched) groups[matched[1]].push(voice);
      else groups[BROWSER_TTS_GROUP_LABELS.OTHER_EN].push(voice);
      return;
    }

    if (context === 'meaning') {
      if (regionInfo.isEnglish || (regionInfo.explicitForeign && !regionInfo.isIndoRegion)) return;
      if (regionInfo.code === 'ID') groups[BROWSER_TTS_GROUP_LABELS.ID].push(voice);
      else if (regionInfo.code === 'JV') groups[BROWSER_TTS_GROUP_LABELS.JV].push(voice);
      else if (regionInfo.code === 'SU') groups[BROWSER_TTS_GROUP_LABELS.SU].push(voice);
      else if (regionInfo.isIndoRegion || (!regionInfo.isEnglish && !langLike)) {
        groups[BROWSER_TTS_GROUP_LABELS.ID_OTHER].push(voice);
      }
      return;
    }

    if (regionInfo.isIndoRegion) {
      groups[BROWSER_TTS_GROUP_LABELS.ID_GENERAL].push(voice);
      return;
    }

    if (regionInfo.isEnglish || !langLike) {
      const matched = ENGLISH_REGION_GROUPS.find(([code]) => code === regionInfo.code);
      if (matched) groups[matched[1]].push(voice);
      else groups[BROWSER_TTS_GROUP_LABELS.OTHER_EN].push(voice);
    }
  });

  const getVoiceMeta = item => {
    const isObject = Boolean(item && typeof item === 'object');
    const rawName = isObject ? clean(item.name || item.voiceURI || item.label || item.id) : clean(item);
    const langLike = isObject ? clean(item.lang) : '';
    const regionInfo = inferRegionCode(item, rawName, langLike);
    return {
      compactName: extractCompactVoiceName(rawName) || rawName,
      regionCode: regionInfo.code,
      language: getBrowserVoiceSortLanguage(regionInfo.code),
      label: formatBrowserTtsVoiceLabel(item, { fallbackLabel: rawName })
    };
  };

  Object.entries(groups).forEach(([groupLabel, items]) => {
    const isOtherEnglish = groupLabel === BROWSER_TTS_GROUP_LABELS.OTHER_EN;
    const isGeneralIndo = groupLabel === BROWSER_TTS_GROUP_LABELS.ID_GENERAL;
    items.sort((a, b) => {
      const metaA = getVoiceMeta(a);
      const metaB = getVoiceMeta(b);
      return compareVoicesWithinGroup({
        a,
        b,
        isOtherEnglish,
        isGeneralIndo,
        getName: item => (item === a ? metaA.compactName : metaB.compactName),
        getRegionCode: item => (item === a ? metaA.regionCode : metaB.regionCode),
        getLanguage: item => (item === a ? metaA.language : metaB.language),
        getLabel: item => (item === a ? metaA.label : metaB.label)
      });
    });
  });

  return groups;
};
