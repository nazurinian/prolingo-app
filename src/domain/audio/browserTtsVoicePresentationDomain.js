import {
  comparePrecomputedVoiceEntries,
  createVoiceGroupCache,
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

const ENGLISH_REGION_LABEL_BY_CODE = new Map(ENGLISH_REGION_GROUPS);
const BROWSER_VOICE_META_WEAK_CACHE = new WeakMap();
const BROWSER_DEDUPE_WEAK_CACHE = new WeakMap();

const getBrowserVoiceSnapshotToken = voice => {
  if (!voice || typeof voice !== 'object') return clean(voice);
  return [
    clean(voice.name || voice.voiceURI || voice.label || voice.id),
    clean(voice.lang),
    voice.natural === true ? '1' : '0',
    voice.standard === true ? '1' : '0',
    voice.child === true || voice.isChild === true ? '1' : '0',
    lower(voice.age)
  ].join('\u0001');
};

const lookupBrowserGroupCache = createVoiceGroupCache({
  maxEntries: 24,
  getToken: getBrowserVoiceSnapshotToken
});

const getBrowserVoiceSortLanguage = regionCode => {
  if (regionCode === 'ID') return 'id';
  if (regionCode === 'JV') return 'jv';
  if (regionCode === 'SU') return 'su';
  return '';
};

const resolveBrowserVoiceMeta = voiceLike => {
  const isObject = Boolean(voiceLike && typeof voiceLike === 'object');
  const token = isObject ? getBrowserVoiceSnapshotToken(voiceLike) : '';
  if (isObject) {
    const cached = BROWSER_VOICE_META_WEAK_CACHE.get(voiceLike);
    if (cached && cached.token === token) return cached.meta;
  }

  const rawName = isObject
    ? clean(voiceLike.name || voiceLike.voiceURI || voiceLike.label || voiceLike.id)
    : clean(voiceLike);
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
  const baseLabel = rawName
    ? [
        compactName || rawName,
        variant,
        regionDisplay,
        child ? 'Child' : null
      ].filter(Boolean).join(' · ')
    : '';

  const meta = {
    rawName,
    langLike,
    compactName: compactName || rawName,
    regionInfo,
    language: getBrowserVoiceSortLanguage(regionInfo.code),
    countryName: regionInfo.code
      ? (getEnglishRegionCountryName(regionInfo.code) || regionInfo.code.toUpperCase())
      : '\uffff',
    baseLabel,
    idOrName: clean(voiceLike?.id || voiceLike?.name)
  };
  if (isObject) {
    BROWSER_VOICE_META_WEAK_CACHE.set(voiceLike, { token, meta });
  }
  return meta;
};

export const dedupeBrowserTtsVoices = voices => {
  const list = Array.isArray(voices) ? voices : [];
  if (Array.isArray(voices)) {
    const cached = BROWSER_DEDUPE_WEAK_CACHE.get(voices);
    if (cached && cached.refs.length === list.length) {
      let matches = true;
      for (let i = 0; i < list.length; i += 1) {
        if (list[i] !== cached.refs[i] || getBrowserVoiceSnapshotToken(list[i]) !== cached.tokens[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return cached.result;
    }
  }

  const seen = new Set();
  const result = [];
  const refs = Array.isArray(voices) ? new Array(list.length) : null;
  const tokens = Array.isArray(voices) ? new Array(list.length) : null;
  for (let i = 0; i < list.length; i += 1) {
    const voice = list[i];
    if (refs) {
      refs[i] = voice;
      tokens[i] = getBrowserVoiceSnapshotToken(voice);
    }
    const isObject = Boolean(voice && typeof voice === 'object');
    const name = isObject ? clean(voice.name || voice.voiceURI || voice.id || voice.label) : clean(voice);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(isObject ? voice : { name, lang: '' });
  }
  if (Array.isArray(voices)) {
    BROWSER_DEDUPE_WEAK_CACHE.set(voices, { refs, tokens, result });
  }
  return result;
};

// Display-only Browser TTS voice label formatter. Keep raw voice.name / voiceURI in stored values and IDs.
export const formatBrowserTtsVoiceLabel = (voiceLike, { fallbackLabel = 'Browser system default', includeEngineHint = false } = {}) => {
  const meta = resolveBrowserVoiceMeta(voiceLike);
  if (!meta.rawName) return fallbackLabel;
  return includeEngineHint ? `${meta.baseLabel} · Browser TTS` : meta.baseLabel;
};

export const groupBrowserTtsVoicesByRegion = (voiceList, context = 'general') => {
  const normalizedContext = context || 'general';
  const cacheSlot = lookupBrowserGroupCache(voiceList, normalizedContext);
  if (cacheSlot.groups) return cacheSlot.groups;
  const { list, store } = cacheSlot;

  const decoratedGroups = {};
  if (normalizedContext === 'meaning') {
    decoratedGroups[BROWSER_TTS_GROUP_LABELS.ID] = [];
    decoratedGroups[BROWSER_TTS_GROUP_LABELS.JV] = [];
    decoratedGroups[BROWSER_TTS_GROUP_LABELS.SU] = [];
    decoratedGroups[BROWSER_TTS_GROUP_LABELS.ID_OTHER] = [];
  } else {
    ENGLISH_REGION_GROUPS.forEach(([, label]) => {
      decoratedGroups[label] = [];
    });
    decoratedGroups[BROWSER_TTS_GROUP_LABELS.OTHER_EN] = [];
    if (normalizedContext !== 'main') {
      decoratedGroups[BROWSER_TTS_GROUP_LABELS.ID_GENERAL] = [];
    }
  }

  for (let i = 0; i < list.length; i += 1) {
    const voice = list[i];
    if (!voice) continue;
    const meta = resolveBrowserVoiceMeta(voice);
    const { regionInfo, langLike } = meta;
    let targetGroup = null;

    if (normalizedContext === 'main') {
      if (regionInfo.isIndoRegion || regionInfo.explicitForeign) continue;
      targetGroup = ENGLISH_REGION_LABEL_BY_CODE.get(regionInfo.code) || BROWSER_TTS_GROUP_LABELS.OTHER_EN;
    } else if (normalizedContext === 'meaning') {
      if (regionInfo.isEnglish || (regionInfo.explicitForeign && !regionInfo.isIndoRegion)) continue;
      if (regionInfo.code === 'ID') targetGroup = BROWSER_TTS_GROUP_LABELS.ID;
      else if (regionInfo.code === 'JV') targetGroup = BROWSER_TTS_GROUP_LABELS.JV;
      else if (regionInfo.code === 'SU') targetGroup = BROWSER_TTS_GROUP_LABELS.SU;
      else if (regionInfo.isIndoRegion || (!regionInfo.isEnglish && !langLike)) {
        targetGroup = BROWSER_TTS_GROUP_LABELS.ID_OTHER;
      }
    } else if (regionInfo.isIndoRegion) {
      targetGroup = BROWSER_TTS_GROUP_LABELS.ID_GENERAL;
    } else if (regionInfo.isEnglish || !langLike) {
      targetGroup = ENGLISH_REGION_LABEL_BY_CODE.get(regionInfo.code) || BROWSER_TTS_GROUP_LABELS.OTHER_EN;
    }
    if (!targetGroup) continue;

    decoratedGroups[targetGroup].push({
      voice,
      language: meta.language,
      countryName: meta.countryName,
      name: meta.compactName,
      label: meta.baseLabel || meta.rawName,
      idOrName: meta.idOrName
    });
  }

  const groups = {};
  Object.entries(decoratedGroups).forEach(([groupLabel, entries]) => {
    const isOtherEnglish = groupLabel === BROWSER_TTS_GROUP_LABELS.OTHER_EN;
    const isGeneralIndo = groupLabel === BROWSER_TTS_GROUP_LABELS.ID_GENERAL;
    if (entries.length > 1) {
      entries.sort((entryA, entryB) => comparePrecomputedVoiceEntries(entryA, entryB, { isOtherEnglish, isGeneralIndo }));
    }
    groups[groupLabel] = entries.map(entry => entry.voice);
  });

  return store(groups);
};
