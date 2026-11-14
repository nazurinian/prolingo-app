import { initialEdgeVoices, isEdgeVoiceUnavailable } from '../../constants/voiceConstants.js';

const clean = value => String(value ?? '').trim();
const upper = value => clean(value).toUpperCase();
const lower = value => clean(value).toLowerCase();

export const VOICE_REGION_GROUP_LABELS = Object.freeze({
  UK: 'UK (United Kingdom)',
  US: 'US (United States)',
  AU: 'AU (Australia)',
  NZ: 'NZ (New Zealand)',
  SG: 'SG (Singapore)',
  CA: 'CA (Canada)',
  IE: 'IE (Ireland)',
  OTHER_EN: 'Other English',
  ID: 'Indonesian (id-ID)',
  JV: 'Javanese (jv-ID)',
  SU: 'Sundanese (su-ID)',
  ID_OTHER: 'Other Regional / Indonesian',
  ID_GENERAL: 'Indonesia / Regional (ID, JV, SU)'
});

export const NAMED_ENGLISH_REGION_GROUPS = Object.freeze([
  ['UK', VOICE_REGION_GROUP_LABELS.UK],
  ['US', VOICE_REGION_GROUP_LABELS.US],
  ['AU', VOICE_REGION_GROUP_LABELS.AU],
  ['NZ', VOICE_REGION_GROUP_LABELS.NZ],
  ['SG', VOICE_REGION_GROUP_LABELS.SG],
  ['CA', VOICE_REGION_GROUP_LABELS.CA],
  ['IE', VOICE_REGION_GROUP_LABELS.IE]
]);

export const NAMED_ENGLISH_REGION_CODES = new Set(NAMED_ENGLISH_REGION_GROUPS.map(([code]) => code));

export const ENGLISH_COUNTRY_NAME_BY_CODE = Object.freeze({
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  US: 'United States',
  AU: 'Australia',
  NZ: 'New Zealand',
  SG: 'Singapore',
  CA: 'Canada',
  IE: 'Ireland',
  HK: 'Hong Kong',
  IN: 'India',
  KE: 'Kenya',
  MY: 'Malaysia',
  NG: 'Nigeria',
  PH: 'Philippines',
  PK: 'Pakistan',
  TZ: 'Tanzania',
  ZA: 'South Africa',
  BW: 'Botswana',
  CM: 'Cameroon',
  GH: 'Ghana',
  JM: 'Jamaica',
  MT: 'Malta',
  NA: 'Namibia',
  UG: 'Uganda',
  ZW: 'Zimbabwe'
});

const INDO_REGION_LABEL_BY_LANGUAGE = Object.freeze({
  id: 'Indonesia',
  jv: 'Javanese',
  su: 'Sundanese'
});

let cachedRegionDisplayNames = null;
const getIntlRegionName = regionCode => {
  if (!/^[A-Z]{2}$/.test(regionCode)) return '';
  try {
    if (!cachedRegionDisplayNames && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      cachedRegionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    }
    const resolved = cachedRegionDisplayNames?.of(regionCode);
    return resolved && resolved !== regionCode ? resolved : '';
  } catch {
    return '';
  }
};

export const getEnglishRegionCountryName = regionCode => {
  const normalized = upper(regionCode);
  if (!normalized || normalized === 'EN') return '';
  if (ENGLISH_COUNTRY_NAME_BY_CODE[normalized]) return ENGLISH_COUNTRY_NAME_BY_CODE[normalized];
  return getIntlRegionName(normalized) || normalized;
};

export const isEdgeVoiceEntry = voiceLike => {
  if (!voiceLike || typeof voiceLike !== 'object') return false;
  if (voiceLike.voiceURI) return false;
  const id = clean(voiceLike.id);
  if (!id) return false;
  return /^[a-z]{2,3}-[a-z]{2,3}-/i.test(id) || Boolean(voiceLike.available !== undefined || voiceLike.unavailable !== undefined || voiceLike.diagnostic);
};

export const extractEdgeVoiceLocaleInfo = voiceLike => {
  const id = typeof voiceLike === 'object' ? clean(voiceLike?.id) : clean(voiceLike);
  const lang = typeof voiceLike === 'object' ? clean(voiceLike?.lang) : '';
  const source = lang || id;
  const match = source.match(/^([a-z]{2,3})(?:[-_]([a-z]{2}))?(?:[-_]|$)/i);
  const language = lower(match?.[1]);
  let regionCode = upper(match?.[2]);
  if (regionCode === 'GB') regionCode = 'UK';
  const isEnglish = language === 'en' || (!language && !regionCode);
  const isIndoRegion = language === 'id' || language === 'jv' || language === 'su' || regionCode === 'ID';
  return {
    language,
    regionCode,
    isEnglish,
    isIndoRegion,
    isChild: Boolean(
      (typeof voiceLike === 'object' && (voiceLike?.child === true || voiceLike?.isChild === true))
      || /\bchild\b/i.test(clean(voiceLike?.label))
    )
  };
};

export const extractEdgeVoiceShortName = voiceLike => {
  const isObject = Boolean(voiceLike && typeof voiceLike === 'object');
  const rawLabel = isObject ? clean(voiceLike.label) : clean(voiceLike);
  const rawId = isObject ? clean(voiceLike.id) : clean(voiceLike);
  if (rawLabel) {
    const stripped = rawLabel
      .replace(/\s*·\s*Unavailable.*$/i, '')
      .replace(/\s*\([^)]*\)\s*$/i, '')
      .trim();
    if (stripped) return stripped;
  }
  const tail = rawId.split('-').pop() || rawId;
  return tail.replace(/Neural$/i, '').replace(/Multilingual$/i, '').trim() || rawId;
};

export const formatEdgeVoiceLabel = (
  voiceLike,
  { edgeVoices = initialEdgeVoices, includeUnavailable = true } = {}
) => {
  const isObject = Boolean(voiceLike && typeof voiceLike === 'object');
  const id = isObject ? clean(voiceLike.id) : clean(voiceLike);
  const catalogEntry = !isObject || (!voiceLike.label && !voiceLike.lang)
    ? (Array.isArray(edgeVoices) ? edgeVoices : initialEdgeVoices).find(item => lower(item?.id) === lower(id)) || null
    : null;
  const resolved = catalogEntry || voiceLike;
  const name = extractEdgeVoiceShortName(resolved);
  const { language, regionCode, isEnglish, isIndoRegion, isChild } = extractEdgeVoiceLocaleInfo(resolved);

  let regionSuffix = '';
  if (isIndoRegion) {
    regionSuffix = INDO_REGION_LABEL_BY_LANGUAGE[language] || 'Indonesia';
  } else if (isEnglish) {
    if (NAMED_ENGLISH_REGION_CODES.has(regionCode)) {
      regionSuffix = regionCode;
    } else if (regionCode) {
      regionSuffix = getEnglishRegionCountryName(regionCode) || regionCode;
    }
  } else if (regionCode) {
    regionSuffix = getEnglishRegionCountryName(regionCode) || regionCode;
  }

  let base = clean(typeof resolved === 'object' ? resolved?.label : '');
  if (!base && name) {
    if (regionSuffix && isChild) base = `${name} (${regionSuffix} - Child)`;
    else if (regionSuffix) base = `${name} (${regionSuffix})`;
    else if (isChild) base = `${name} (Child)`;
    else base = name;
  } else if (base) {
    base = base.replace(/\s*·\s*Unavailable.*$/i, '').trim();
  }

  if (!base) base = id || '—';
  const unavailable = includeUnavailable && isEdgeVoiceUnavailable(resolved, edgeVoices);
  return unavailable ? `${base} · Unavailable` : base;
};

export const INDO_LANG_RANK = Object.freeze({ id: 0, jv: 1, su: 2 });
export const VOICE_COLLATORS = Object.freeze({
  name: new Intl.Collator('en', { sensitivity: 'base', numeric: true }),
  alpha: new Intl.Collator('en', { sensitivity: 'base' })
});
const NAMED_ENGLISH_LABEL_BY_CODE = new Map(NAMED_ENGLISH_REGION_GROUPS);

/** Bounded WeakMap + snapshot-signature cache that invalidates on element or flag mutation. */
export const createVoiceGroupCache = ({ maxEntries = 24, getToken }) => {
  const weakCache = new WeakMap();
  const signatureCache = new Map();

  const attachWeak = (voiceList, context, entry) => {
    if (!Array.isArray(voiceList)) return;
    let byContext = weakCache.get(voiceList);
    if (!byContext) {
      byContext = new Map();
      weakCache.set(voiceList, byContext);
    }
    byContext.set(context, entry);
  };

  return (voiceList, context) => {
    const normalizedContext = context || 'general';
    const list = Array.isArray(voiceList) ? voiceList : [];
    if (Array.isArray(voiceList)) {
      const cached = weakCache.get(voiceList)?.get(normalizedContext);
      if (cached && cached.refs.length === list.length) {
        let matches = true;
        for (let i = 0; i < list.length; i += 1) {
          if (list[i] !== cached.refs[i] || getToken(list[i]) !== cached.tokens[i]) {
            matches = false;
            break;
          }
        }
        if (matches) return { list, groups: cached.groups, store: null };
      }
    }

    const refs = new Array(list.length);
    const tokens = new Array(list.length);
    for (let i = 0; i < list.length; i += 1) {
      refs[i] = list[i];
      tokens[i] = getToken(list[i]);
    }
    const signature = `${normalizedContext}\u0002${tokens.join('\u0003')}`;
    const signatureHit = signatureCache.get(signature);
    if (signatureHit && signatureHit.refs.length === refs.length) {
      let matches = true;
      for (let i = 0; i < refs.length; i += 1) {
        if (signatureHit.refs[i] !== refs[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        attachWeak(voiceList, normalizedContext, { refs, tokens, groups: signatureHit.groups });
        return { list, groups: signatureHit.groups, store: null };
      }
    }

    return {
      list,
      groups: null,
      store: groups => {
        if (signatureCache.size >= maxEntries) {
          const oldestKey = signatureCache.keys().next().value;
          if (oldestKey !== undefined) signatureCache.delete(oldestKey);
        }
        signatureCache.set(signature, { refs, groups });
        attachWeak(voiceList, normalizedContext, { refs, tokens, groups });
        return groups;
      }
    };
  };
};

const getEdgeVoiceSnapshotToken = voice => {
  if (!voice || typeof voice !== 'object') return clean(voice);
  return [
    clean(voice.id),
    clean(voice.label),
    clean(voice.lang),
    voice.available === true ? '1' : voice.available === false ? '0' : '',
    voice.unavailable === true ? '1' : voice.unavailable === false ? '0' : '',
    voice.child === true || voice.isChild === true ? '1' : '0'
  ].join('\u0001');
};

const lookupEdgeGroupCache = createVoiceGroupCache({
  maxEntries: 24,
  getToken: getEdgeVoiceSnapshotToken
});

/** Compare Schwartzian-precomputed voice sort entries within a region optgroup. */
export const comparePrecomputedVoiceEntries = (entryA, entryB, { isOtherEnglish = false, isGeneralIndo = false } = {}) => {
  if (isGeneralIndo) {
    const langDiff = (INDO_LANG_RANK[entryA.language] ?? 9) - (INDO_LANG_RANK[entryB.language] ?? 9);
    if (langDiff !== 0) return langDiff;
  }
  if (isOtherEnglish) {
    const countryDiff = VOICE_COLLATORS.alpha.compare(entryA.countryName, entryB.countryName);
    if (countryDiff !== 0) return countryDiff;
  }
  const nameDiff = VOICE_COLLATORS.name.compare(entryA.name, entryB.name);
  if (nameDiff !== 0) return nameDiff;
  const labelDiff = VOICE_COLLATORS.name.compare(entryA.label, entryB.label);
  if (labelDiff !== 0) return labelDiff;
  return VOICE_COLLATORS.alpha.compare(entryA.idOrName, entryB.idOrName);
};

export const compareVoicesWithinGroup = ({
  a,
  b,
  isOtherEnglish = false,
  isGeneralIndo = false,
  getName,
  getRegionCode,
  getLanguage,
  getLabel
}) => {
  if (isGeneralIndo) {
    const langDiff = (INDO_LANG_RANK[lower(getLanguage?.(a))] ?? 9) - (INDO_LANG_RANK[lower(getLanguage?.(b))] ?? 9);
    if (langDiff !== 0) return langDiff;
  }
  if (isOtherEnglish) {
    const countryA = getEnglishRegionCountryName(getRegionCode?.(a)) || upper(getRegionCode?.(a)) || '\uffff';
    const countryB = getEnglishRegionCountryName(getRegionCode?.(b)) || upper(getRegionCode?.(b)) || '\uffff';
    const countryDiff = VOICE_COLLATORS.alpha.compare(countryA, countryB);
    if (countryDiff !== 0) return countryDiff;
  }
  const nameA = clean(getName?.(a));
  const nameB = clean(getName?.(b));
  const nameDiff = VOICE_COLLATORS.name.compare(nameA, nameB);
  if (nameDiff !== 0) return nameDiff;
  const labelDiff = VOICE_COLLATORS.name.compare(clean(getLabel?.(a)), clean(getLabel?.(b)));
  if (labelDiff !== 0) return labelDiff;
  return VOICE_COLLATORS.alpha.compare(clean(a?.id || a?.name), clean(b?.id || b?.name));
};

export const groupEdgeVoicesByRegion = (voiceList, context = 'general') => {
  const normalizedContext = context || 'general';
  const cacheSlot = lookupEdgeGroupCache(voiceList, normalizedContext);
  if (cacheSlot.groups) return cacheSlot.groups;
  const { list, store } = cacheSlot;

  const decoratedGroups = {};
  if (normalizedContext === 'meaning') {
    decoratedGroups[VOICE_REGION_GROUP_LABELS.ID] = [];
    decoratedGroups[VOICE_REGION_GROUP_LABELS.JV] = [];
    decoratedGroups[VOICE_REGION_GROUP_LABELS.SU] = [];
    decoratedGroups[VOICE_REGION_GROUP_LABELS.ID_OTHER] = [];
  } else {
    NAMED_ENGLISH_REGION_GROUPS.forEach(([, label]) => {
      decoratedGroups[label] = [];
    });
    decoratedGroups[VOICE_REGION_GROUP_LABELS.OTHER_EN] = [];
    if (normalizedContext !== 'main') {
      decoratedGroups[VOICE_REGION_GROUP_LABELS.ID_GENERAL] = [];
    }
  }

  for (let i = 0; i < list.length; i += 1) {
    const voice = list[i];
    if (!voice) continue;
    const { language, regionCode, isEnglish, isIndoRegion } = extractEdgeVoiceLocaleInfo(voice);
    let targetGroup = null;
    if (normalizedContext === 'main') {
      if (isIndoRegion || !isEnglish) continue;
      targetGroup = NAMED_ENGLISH_LABEL_BY_CODE.get(regionCode) || VOICE_REGION_GROUP_LABELS.OTHER_EN;
    } else if (normalizedContext === 'meaning') {
      if (!isIndoRegion) continue;
      if (language === 'id') targetGroup = VOICE_REGION_GROUP_LABELS.ID;
      else if (language === 'jv') targetGroup = VOICE_REGION_GROUP_LABELS.JV;
      else if (language === 'su') targetGroup = VOICE_REGION_GROUP_LABELS.SU;
      else targetGroup = VOICE_REGION_GROUP_LABELS.ID_OTHER;
    } else if (isIndoRegion) {
      targetGroup = VOICE_REGION_GROUP_LABELS.ID_GENERAL;
    } else if (isEnglish) {
      targetGroup = NAMED_ENGLISH_LABEL_BY_CODE.get(regionCode) || VOICE_REGION_GROUP_LABELS.OTHER_EN;
    }
    if (!targetGroup) continue;

    decoratedGroups[targetGroup].push({
      voice,
      language,
      countryName: getEnglishRegionCountryName(regionCode) || upper(regionCode) || '\uffff',
      name: clean(extractEdgeVoiceShortName(voice)),
      label: clean(voice?.label || voice?.id),
      idOrName: clean(voice?.id || voice?.name)
    });
  }

  const groups = {};
  Object.entries(decoratedGroups).forEach(([groupLabel, entries]) => {
    const isOtherEnglish = groupLabel === VOICE_REGION_GROUP_LABELS.OTHER_EN;
    const isGeneralIndo = groupLabel === VOICE_REGION_GROUP_LABELS.ID_GENERAL;
    if (entries.length > 1) {
      entries.sort((entryA, entryB) => comparePrecomputedVoiceEntries(entryA, entryB, { isOtherEnglish, isGeneralIndo }));
    }
    groups[groupLabel] = entries.map(entry => entry.voice);
  });

  return store(groups);
};
