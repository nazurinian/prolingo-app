import {
  TEXT_AUDIO_CODEC_PROFILE,
  TEXT_AUDIO_RENDERER_PROFILE_VERSION
} from '../text/textStructuredAudioRenderFingerprintDomain.js';

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

export const AUDIO_PROVIDER_IDS = Object.freeze({
  BROWSER_TTS: 'browser-tts',
  EDGE_TTS: 'edge-tts',
  LOCAL_AI_KOKORO: 'local-ai-kokoro',
  LOCAL_AI_PIPER: 'local-ai-piper'
});

export const AUDIO_PROVIDER_FAMILIES = Object.freeze({
  BROWSER_TTS: 'browser-tts',
  EDGE_TTS: 'edge-tts',
  LOCAL_AI: 'local-ai'
});

export const AUDIO_PROVIDER_OPERATIONS = Object.freeze({
  LIVE_PLAYBACK: 'live-playback',
  BLOB_SYNTHESIS: 'blob-synthesis',
  HEALTH_CHECK: 'health-check',
  OFFLINE_DOWNLOAD: 'offline-download',
  STAGING_PERSISTENCE: 'staging-persistence'
});

export const AUDIO_PROVIDER_ERROR_CODES = Object.freeze({
  OK: 'OK',
  UNKNOWN_PROVIDER: 'UNKNOWN_PROVIDER',
  PROVIDER_PLAYBACK_ONLY: 'PROVIDER_PLAYBACK_ONLY',
  PROVIDER_BLOB_SYNTHESIS_ONLY: 'PROVIDER_BLOB_SYNTHESIS_ONLY',
  PROVIDER_RESERVED_NOT_IMPLEMENTED: 'PROVIDER_RESERVED_NOT_IMPLEMENTED',
  PROVIDER_RUNTIME_UNSUPPORTED: 'PROVIDER_RUNTIME_UNSUPPORTED',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION'
});

const ALIAS_TO_PROVIDER_ID = Object.freeze({
  'browser': AUDIO_PROVIDER_IDS.BROWSER_TTS,
  'browser-tts': AUDIO_PROVIDER_IDS.BROWSER_TTS,
  'speechsynthesis': AUDIO_PROVIDER_IDS.BROWSER_TTS,
  'speech-synthesis': AUDIO_PROVIDER_IDS.BROWSER_TTS,
  'tts': AUDIO_PROVIDER_IDS.BROWSER_TTS,
  'edge': AUDIO_PROVIDER_IDS.EDGE_TTS,
  'edge-tts': AUDIO_PROVIDER_IDS.EDGE_TTS,
  'kokoro': AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO,
  'local-ai-kokoro': AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO,
  'piper': AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER,
  'local-ai-piper': AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER
});

export const AUDIO_PROVIDER_CAPABILITIES = Object.freeze({
  [AUDIO_PROVIDER_IDS.BROWSER_TTS]: Object.freeze({
    id: AUDIO_PROVIDER_IDS.BROWSER_TTS,
    family: AUDIO_PROVIDER_FAMILIES.BROWSER_TTS,
    engineKey: 'browser-tts',
    label: 'Browser TTS (SpeechSynthesis)',
    reserved: false,
    implemented: true,
    active: true,
    supportsLivePlayback: true,
    supportsBlobSynthesis: false,
    supportsOfflineDownload: false,
    supportsStagingPersistence: false,
    supportsHealthCheck: false,
    supportsRateAdjustment: true,
    supportsPitchAdjustment: true,
    requiresNetwork: false,
    endpoint: null,
    outputMimeTypes: Object.freeze([]),
    renderProfile: null,
    placeholderReason: null
  }),
  [AUDIO_PROVIDER_IDS.EDGE_TTS]: Object.freeze({
    id: AUDIO_PROVIDER_IDS.EDGE_TTS,
    family: AUDIO_PROVIDER_FAMILIES.EDGE_TTS,
    engineKey: 'edge',
    label: 'Edge TTS Server (/api/tts)',
    reserved: false,
    implemented: true,
    active: true,
    supportsLivePlayback: false,
    supportsBlobSynthesis: true,
    supportsOfflineDownload: true,
    supportsStagingPersistence: true,
    supportsHealthCheck: true,
    supportsRateAdjustment: true,
    supportsPitchAdjustment: true,
    requiresNetwork: true,
    endpoint: '/api/tts',
    outputMimeTypes: Object.freeze(['audio/mpeg']),
    renderProfile: Object.freeze({
      engine: 'edge',
      rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
      codecProfile: TEXT_AUDIO_CODEC_PROFILE
    }),
    placeholderReason: null
  }),
  [AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO]: Object.freeze({
    id: AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO,
    family: AUDIO_PROVIDER_FAMILIES.LOCAL_AI,
    engineKey: 'kokoro',
    label: 'Local AI · Kokoro (Reserved P15)',
    reserved: true,
    implemented: false,
    active: false,
    supportsLivePlayback: false,
    supportsBlobSynthesis: false,
    supportsOfflineDownload: false,
    supportsStagingPersistence: false,
    supportsHealthCheck: false,
    supportsRateAdjustment: false,
    supportsPitchAdjustment: false,
    requiresNetwork: false,
    endpoint: null,
    outputMimeTypes: Object.freeze([]),
    renderProfile: null,
    futureRenderProfileNamespace: Object.freeze({
      engine: 'kokoro',
      rendererVersion: 'prolingo-kokoro-reserved-v1',
      codecProfile: 'wav-pcm16-reserved-v1'
    }),
    placeholderReason: 'Reserved capability contract for future P15 Local AI (Kokoro) integration; no model weights, workers, WebGPU, or WASM runtime bundled in v6.0.3.'
  }),
  [AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER]: Object.freeze({
    id: AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER,
    family: AUDIO_PROVIDER_FAMILIES.LOCAL_AI,
    engineKey: 'piper',
    label: 'Local AI · Piper (Reserved P15)',
    reserved: true,
    implemented: false,
    active: false,
    supportsLivePlayback: false,
    supportsBlobSynthesis: false,
    supportsOfflineDownload: false,
    supportsStagingPersistence: false,
    supportsHealthCheck: false,
    supportsRateAdjustment: false,
    supportsPitchAdjustment: false,
    requiresNetwork: false,
    endpoint: null,
    outputMimeTypes: Object.freeze([]),
    renderProfile: null,
    futureRenderProfileNamespace: Object.freeze({
      engine: 'piper',
      rendererVersion: 'prolingo-piper-reserved-v1',
      codecProfile: 'wav-pcm16-reserved-v1'
    }),
    placeholderReason: 'Reserved capability contract for future P15 Local AI (Piper) integration; no model weights, workers, WebGPU, or WASM runtime bundled in v6.0.3.'
  })
});

export const normalizeAudioProviderId = candidate => ALIAS_TO_PROVIDER_ID[lower(candidate)] || null;

export const getAudioProviderCapability = providerId => {
  const normalized = normalizeAudioProviderId(providerId);
  return normalized ? AUDIO_PROVIDER_CAPABILITIES[normalized] || null : null;
};

export const listAudioProviderCapabilities = ({ includeReserved = true } = {}) =>
  Object.values(AUDIO_PROVIDER_CAPABILITIES).filter(cap => includeReserved || !cap.reserved);

export const canProviderSynthesizeBlob = providerId => {
  const cap = getAudioProviderCapability(providerId);
  return Boolean(cap && !cap.reserved && cap.implemented && cap.supportsBlobSynthesis);
};

export const canProviderPlayLiveUtterance = providerId => {
  const cap = getAudioProviderCapability(providerId);
  return Boolean(cap && !cap.reserved && cap.implemented && cap.supportsLivePlayback);
};

const OPERATION_TO_FLAG = Object.freeze({
  [AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK]: 'supportsLivePlayback',
  [AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS]: 'supportsBlobSynthesis',
  [AUDIO_PROVIDER_OPERATIONS.HEALTH_CHECK]: 'supportsHealthCheck',
  [AUDIO_PROVIDER_OPERATIONS.OFFLINE_DOWNLOAD]: 'supportsOfflineDownload',
  [AUDIO_PROVIDER_OPERATIONS.STAGING_PERSISTENCE]: 'supportsStagingPersistence'
});

/**
 * Fail-closed capability validation before invoking any provider operation.
 * Ensures playback-only providers (Browser TTS) never assume Blob synthesis
 * and reserved Local AI slots (Kokoro/Piper) fail deterministically.
 */
export const validateAudioProviderOperation = ({
  providerId,
  operation = AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS,
  runtimeSupport = null
} = {}) => {
  const normalizedId = normalizeAudioProviderId(providerId);
  const capability = normalizedId ? AUDIO_PROVIDER_CAPABILITIES[normalizedId] : null;
  if (!capability) {
    return {
      allowed: false,
      code: AUDIO_PROVIDER_ERROR_CODES.UNKNOWN_PROVIDER,
      providerId: normalizedId || clean(providerId) || null,
      operation,
      capability: null,
      reason: `Audio provider '${clean(providerId) || 'missing'}' is not registered in the v6.0.3 gateway.`
    };
  }
  if (capability.reserved || !capability.implemented) {
    return {
      allowed: false,
      code: AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RESERVED_NOT_IMPLEMENTED,
      providerId: capability.id,
      operation,
      capability,
      reason: capability.placeholderReason || `${capability.label} is reserved and not implemented yet.`
    };
  }
  const flag = OPERATION_TO_FLAG[operation];
  if (!flag) {
    return {
      allowed: false,
      code: AUDIO_PROVIDER_ERROR_CODES.UNSUPPORTED_OPERATION,
      providerId: capability.id,
      operation,
      capability,
      reason: `Unknown gateway operation '${clean(operation) || 'missing'}'.`
    };
  }
  if (!capability[flag]) {
    const code = capability.id === AUDIO_PROVIDER_IDS.BROWSER_TTS
      && (operation === AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS
        || operation === AUDIO_PROVIDER_OPERATIONS.OFFLINE_DOWNLOAD
        || operation === AUDIO_PROVIDER_OPERATIONS.STAGING_PERSISTENCE)
      ? AUDIO_PROVIDER_ERROR_CODES.PROVIDER_PLAYBACK_ONLY
      : (capability.id === AUDIO_PROVIDER_IDS.EDGE_TTS && operation === AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK
          ? AUDIO_PROVIDER_ERROR_CODES.PROVIDER_BLOB_SYNTHESIS_ONLY
          : AUDIO_PROVIDER_ERROR_CODES.UNSUPPORTED_OPERATION);
    const reason = code === AUDIO_PROVIDER_ERROR_CODES.PROVIDER_PLAYBACK_ONLY
      ? `${capability.label} is playback-only and does not synthesize downloadable or Staging Blobs.`
      : `${capability.label} does not support gateway operation '${operation}'.`;
    return {
      allowed: false,
      code,
      providerId: capability.id,
      operation,
      capability,
      reason
    };
  }
  if (capability.id === AUDIO_PROVIDER_IDS.BROWSER_TTS
    && operation === AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK
    && runtimeSupport?.speechSynthesisSupported === false) {
    return {
      allowed: false,
      code: AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RUNTIME_UNSUPPORTED,
      providerId: capability.id,
      operation,
      capability,
      reason: 'Browser speechSynthesis is unavailable in this environment.'
    };
  }
  return {
    allowed: true,
    code: AUDIO_PROVIDER_ERROR_CODES.OK,
    providerId: capability.id,
    operation,
    capability,
    reason: null
  };
};

export const resolveAudioProviderGatewayRoute = ({
  preferredProviderId = null,
  engine = null,
  operation = AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS,
  fallbackToEdgeOnUnknown = false,
  runtimeSupport = null
} = {}) => {
  const requestedRaw = clean(preferredProviderId || engine);
  let targetProviderId = normalizeAudioProviderId(requestedRaw);
  if (!targetProviderId && fallbackToEdgeOnUnknown && operation === AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS) {
    targetProviderId = AUDIO_PROVIDER_IDS.EDGE_TTS;
  }
  return validateAudioProviderOperation({
    providerId: targetProviderId || requestedRaw,
    operation,
    runtimeSupport
  });
};
