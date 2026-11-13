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

const INDO_LANG_RANK = Object.freeze({ id: 0, jv: 1, su: 2 });

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
    const countryDiff = countryA.localeCompare(countryB, 'en', { sensitivity: 'base' });
    if (countryDiff !== 0) return countryDiff;
  }
  const nameA = clean(getName?.(a));
  const nameB = clean(getName?.(b));
  const nameDiff = nameA.localeCompare(nameB, 'en', { sensitivity: 'base', numeric: true });
  if (nameDiff !== 0) return nameDiff;
  const labelDiff = clean(getLabel?.(a)).localeCompare(clean(getLabel?.(b)), 'en', { sensitivity: 'base', numeric: true });
  if (labelDiff !== 0) return labelDiff;
  return clean(a?.id || a?.name).localeCompare(clean(b?.id || b?.name), 'en', { sensitivity: 'base' });
};

export const groupEdgeVoicesByRegion = (voiceList, context = 'general') => {
  const groups = {};
  if (context === 'meaning') {
    groups[VOICE_REGION_GROUP_LABELS.ID] = [];
    groups[VOICE_REGION_GROUP_LABELS.JV] = [];
    groups[VOICE_REGION_GROUP_LABELS.SU] = [];
    groups[VOICE_REGION_GROUP_LABELS.ID_OTHER] = [];
  } else {
    NAMED_ENGLISH_REGION_GROUPS.forEach(([, label]) => {
      groups[label] = [];
    });
    groups[VOICE_REGION_GROUP_LABELS.OTHER_EN] = [];
    if (context !== 'main') {
      groups[VOICE_REGION_GROUP_LABELS.ID_GENERAL] = [];
    }
  }

  (Array.isArray(voiceList) ? voiceList : []).forEach(voice => {
    if (!voice) return;
    const { language, regionCode, isEnglish, isIndoRegion } = extractEdgeVoiceLocaleInfo(voice);
    if (context === 'main') {
      if (isIndoRegion || !isEnglish) return;
      const matched = NAMED_ENGLISH_REGION_GROUPS.find(([code]) => code === regionCode);
      if (matched) groups[matched[1]].push(voice);
      else groups[VOICE_REGION_GROUP_LABELS.OTHER_EN].push(voice);
      return;
    }
    if (context === 'meaning') {
      if (!isIndoRegion) return;
      if (language === 'id') groups[VOICE_REGION_GROUP_LABELS.ID].push(voice);
      else if (language === 'jv') groups[VOICE_REGION_GROUP_LABELS.JV].push(voice);
      else if (language === 'su') groups[VOICE_REGION_GROUP_LABELS.SU].push(voice);
      else groups[VOICE_REGION_GROUP_LABELS.ID_OTHER].push(voice);
      return;
    }
    if (isIndoRegion) {
      groups[VOICE_REGION_GROUP_LABELS.ID_GENERAL].push(voice);
      return;
    }
    if (isEnglish) {
      const matched = NAMED_ENGLISH_REGION_GROUPS.find(([code]) => code === regionCode);
      if (matched) groups[matched[1]].push(voice);
      else groups[VOICE_REGION_GROUP_LABELS.OTHER_EN].push(voice);
    }
  });

  Object.entries(groups).forEach(([groupLabel, items]) => {
    const isOtherEnglish = groupLabel === VOICE_REGION_GROUP_LABELS.OTHER_EN;
    const isGeneralIndo = groupLabel === VOICE_REGION_GROUP_LABELS.ID_GENERAL;
    items.sort((a, b) => compareVoicesWithinGroup({
      a,
      b,
      isOtherEnglish,
      isGeneralIndo,
      getName: extractEdgeVoiceShortName,
      getRegionCode: item => extractEdgeVoiceLocaleInfo(item).regionCode,
      getLanguage: item => extractEdgeVoiceLocaleInfo(item).language,
      getLabel: item => clean(item?.label || item?.id)
    }));
  });

  return groups;
};
