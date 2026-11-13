// --- EDGE TTS VOICES (COMPREHENSIVE VERIFIED CATALOG) ---

export const DEPRECATED_EDGE_VOICE_IDS = Object.freeze([
  'en-GB-AlfiesNeural'
]);

export const UNSUPPORTED_EDGE_VOICE_IDS = Object.freeze([
  'en-GB-AlfieNeural',
  'en-GB-AlfiesNeural',
  'en-AU-AnnetteNeural',
  'en-AU-CarlyNeural',
  'en-AU-DarrenNeural',
  'en-AU-DuncanNeural',
  'en-AU-ElsieNeural',
  'en-AU-FreyaNeural',
  'en-AU-JoanneNeural',
  'en-AU-KenNeural',
  'en-AU-KimNeural',
  'en-AU-NeilNeural',
  'en-AU-TimNeural',
  'en-AU-TinaNeural'
]);

const UNSUPPORTED_EDGE_VOICE_DIAGNOSTICS = Object.freeze({
  'en-GB-AlfieNeural': 'Not supported or retired by Microsoft Edge TTS (live synthesis failed HTTP 422 / absent from upstream Read Aloud voices).',
  'en-GB-AlfiesNeural': 'Deprecated misspelled legacy voice ID; not supported by Microsoft Edge TTS.'
});

const DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC = 'Retired or not supported by Microsoft Edge TTS (no silent substitution).';

export const initialEdgeVoices = [
  // --- UK (GB) ---
  {
    id: "en-GB-AlfieNeural",
    label: "Alfie (UK)",
    lang: "en-GB",
    available: false,
    unavailable: true,
    diagnostic: UNSUPPORTED_EDGE_VOICE_DIAGNOSTICS['en-GB-AlfieNeural']
  },
  { id: "en-GB-LibbyNeural", label: "Libby (UK)", lang: "en-GB" },
  { id: "en-GB-MaisieNeural", label: "Maisie (UK - Child)", lang: "en-GB", child: true },
  { id: "en-GB-RyanNeural", label: "Ryan (UK)", lang: "en-GB" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK)", lang: "en-GB" },
  { id: "en-GB-ThomasNeural", label: "Thomas (UK)", lang: "en-GB" },

  // --- US ---
  { id: "en-US-AnaNeural", label: "Ana (US - Child)", lang: "en-US", child: true },
  { id: "en-US-AriaNeural", label: "Aria (US)", lang: "en-US" },
  { id: "en-US-ChristopherNeural", label: "Christopher (US)", lang: "en-US" },
  { id: "en-US-EricNeural", label: "Eric (US)", lang: "en-US" },
  { id: "en-US-GuyNeural", label: "Guy (US)", lang: "en-US" },
  { id: "en-US-JennyNeural", label: "Jenny (US)", lang: "en-US" },
  { id: "en-US-MichelleNeural", label: "Michelle (US)", lang: "en-US" },
  { id: "en-US-RogerNeural", label: "Roger (US)", lang: "en-US" },
  { id: "en-US-SteffanNeural", label: "Steffan (US)", lang: "en-US" },

  // --- AU (Australia) ---
  { id: "en-AU-AnnetteNeural", label: "Annette (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-CarlyNeural", label: "Carly (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-DarrenNeural", label: "Darren (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-DuncanNeural", label: "Duncan (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-ElsieNeural", label: "Elsie (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-FreyaNeural", label: "Freya (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-JoanneNeural", label: "Joanne (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-KenNeural", label: "Ken (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-KimNeural", label: "Kim (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-NatashaNeural", label: "Natasha (AU)", lang: "en-AU" },
  { id: "en-AU-NeilNeural", label: "Neil (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-TimNeural", label: "Tim (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-TinaNeural", label: "Tina (AU)", lang: "en-AU", available: false, unavailable: true, diagnostic: DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC },
  { id: "en-AU-WilliamNeural", label: "William (AU)", lang: "en-AU" },

  // --- NZ (New Zealand) ---
  { id: "en-NZ-MitchellNeural", label: "Mitchell (NZ)", lang: "en-NZ" },
  { id: "en-NZ-MollyNeural", label: "Molly (NZ)", lang: "en-NZ" },

  // --- SG (Singapore) ---
  { id: "en-SG-LunaNeural", label: "Luna (SG)", lang: "en-SG" },
  { id: "en-SG-WayneNeural", label: "Wayne (SG)", lang: "en-SG" },

  // --- CA (Canada) ---
  { id: "en-CA-ClaraNeural", label: "Clara (CA)", lang: "en-CA" },
  { id: "en-CA-LiamNeural", label: "Liam (CA)", lang: "en-CA" },

  // --- IE (Ireland) ---
  { id: "en-IE-ConnorNeural", label: "Connor (IE)", lang: "en-IE" },
  { id: "en-IE-EmilyNeural", label: "Emily (IE)", lang: "en-IE" },

  // --- OTHER ENGLISH ---
  { id: "en-HK-SamNeural", label: "Sam (Hong Kong)", lang: "en-HK" },
  { id: "en-HK-YanNeural", label: "Yan (Hong Kong)", lang: "en-HK" },
  { id: "en-IN-NeerjaNeural", label: "Neerja (India)", lang: "en-IN" },
  { id: "en-IN-PrabhatNeural", label: "Prabhat (India)", lang: "en-IN" },
  { id: "en-KE-AsiliaNeural", label: "Asilia (Kenya)", lang: "en-KE" },
  { id: "en-KE-ChilembaNeural", label: "Chilemba (Kenya)", lang: "en-KE" },
  { id: "en-NG-AbeoNeural", label: "Abeo (Nigeria)", lang: "en-NG" },
  { id: "en-NG-EzinneNeural", label: "Ezinne (Nigeria)", lang: "en-NG" },
  { id: "en-PH-JamesNeural", label: "James (Philippines)", lang: "en-PH" },
  { id: "en-PH-RosaNeural", label: "Rosa (Philippines)", lang: "en-PH" },
  { id: "en-ZA-LeahNeural", label: "Leah (South Africa)", lang: "en-ZA" },
  { id: "en-ZA-LukeNeural", label: "Luke (South Africa)", lang: "en-ZA" },
  { id: "en-TZ-ElimuNeural", label: "Elimu (Tanzania)", lang: "en-TZ" },
  { id: "en-TZ-ImaniNeural", label: "Imani (Tanzania)", lang: "en-TZ" },

  // --- INDONESIAN REGION (ID, JV, SU) ---
  { id: "id-ID-ArdiNeural", label: "Ardi (Indonesia)", lang: "id-ID" },
  { id: "id-ID-GadisNeural", label: "Gadis (Indonesia)", lang: "id-ID" },
  { id: "jv-ID-DimasNeural", label: "Dimas (Javanese)", lang: "jv-ID" },
  { id: "jv-ID-SitiNeural", label: "Siti (Javanese)", lang: "jv-ID" },
  { id: "su-ID-JajangNeural", label: "Jajang (Sundanese)", lang: "su-ID" },
  { id: "su-ID-TutiNeural", label: "Tuti (Sundanese)", lang: "su-ID" }
];

const UNSUPPORTED_EDGE_VOICE_LOWER_SET = new Set(UNSUPPORTED_EDGE_VOICE_IDS.map(id => String(id).trim().toLowerCase()));
const normalizeEdgeId = value => String(value && typeof value === 'object' ? (value.id || value.voiceId || '') : (value ?? '')).trim();
const lowerEdgeId = value => normalizeEdgeId(value).toLowerCase();

export const isEdgeVoiceUnavailable = (voiceOrId, edgeVoices = initialEdgeVoices) => {
  if (voiceOrId && typeof voiceOrId === 'object') {
    if (voiceOrId.available === false || voiceOrId.unavailable === true) return true;
    if (voiceOrId.available === true && voiceOrId.unavailable === false) return false;
  }
  const targetLower = lowerEdgeId(voiceOrId);
  if (!targetLower) return false;
  const catalog = Array.isArray(edgeVoices) ? edgeVoices : initialEdgeVoices;
  const entry = catalog.find(item => lowerEdgeId(item?.id) === targetLower);
  if (entry) {
    if (entry.available === false || entry.unavailable === true) return true;
    if (entry.available === true && entry.unavailable === false) return false;
    // Present in active catalog without unavailable flags (e.g. reversible recovery or custom test list).
    if ('available' in entry || 'unavailable' in entry) return false;
  }
  return UNSUPPORTED_EDGE_VOICE_LOWER_SET.has(targetLower);
};

export const filterAvailableEdgeVoices = (edgeVoices = initialEdgeVoices) =>
  (Array.isArray(edgeVoices) ? edgeVoices : []).filter(voice => !isEdgeVoiceUnavailable(voice, edgeVoices));

export const getEdgeVoiceDiagnostic = (voiceOrId, edgeVoices = initialEdgeVoices) => {
  if (!isEdgeVoiceUnavailable(voiceOrId, edgeVoices)) return '';
  if (voiceOrId && typeof voiceOrId === 'object' && voiceOrId.diagnostic) return String(voiceOrId.diagnostic);
  const id = normalizeEdgeId(voiceOrId);
  if (!id) return '';
  const catalog = Array.isArray(edgeVoices) ? edgeVoices : initialEdgeVoices;
  const entry = catalog.find(item => lowerEdgeId(item?.id) === id.toLowerCase());
  if (entry?.diagnostic) return String(entry.diagnostic);
  const exactDiag = Object.entries(UNSUPPORTED_EDGE_VOICE_DIAGNOSTICS).find(([key]) => key.toLowerCase() === id.toLowerCase());
  if (exactDiag) return exactDiag[1];
  return DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC;
};

export const applyEdgeVoiceCompatibilityResult = (edgeVoices = initialEdgeVoices, voiceId, { available, diagnostic = null } = {}) => {
  const cleanId = normalizeEdgeId(voiceId);
  const list = Array.isArray(edgeVoices) ? edgeVoices : initialEdgeVoices;
  if (!cleanId) return list;
  const targetLower = cleanId.toLowerCase();
  let matched = false;
  const updated = list.map(entry => {
    if (lowerEdgeId(entry?.id) !== targetLower) return entry;
    matched = true;
    if (available === true) {
      return {
        ...entry,
        available: true,
        unavailable: false,
        diagnostic: null
      };
    }
    return {
      ...entry,
      available: false,
      unavailable: true,
      diagnostic: diagnostic || entry.diagnostic || getEdgeVoiceDiagnostic(cleanId, list) || DEFAULT_UNSUPPORTED_EDGE_DIAGNOSTIC
    };
  });
  return matched ? updated : list;
};
