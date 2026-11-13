import {
  AUDIO_PROVIDER_ERROR_CODES,
  AUDIO_PROVIDER_IDS,
  AUDIO_PROVIDER_OPERATIONS,
  getAudioProviderCapability,
  listAudioProviderCapabilities,
  normalizeAudioProviderId,
  validateAudioProviderOperation
} from '../../domain/audio/audioProviderGatewayDomain.js';
import {
  executeBrowserTtsPlaybackService,
  isBrowserTtsSpeechSupported
} from './audioPlaybackSideEffectService.js';
import {
  executeTextStructuredEdgeAudioRequest,
  executeTextStructuredEdgeHealthCheck
} from './textStructuredEdgeAudioDownloadService.js';

export class AudioProviderCapabilityError extends Error {
  constructor(validation) {
    super(validation?.reason || 'Audio provider capability check failed.');
    this.name = 'AudioProviderCapabilityError';
    this.code = validation?.code || AUDIO_PROVIDER_ERROR_CODES.UNSUPPORTED_OPERATION;
    this.providerId = validation?.providerId || null;
    this.operation = validation?.operation || null;
    this.capability = validation?.capability || null;
    this.retryable = false;
  }
}

const createReservedPlaceholderAdapter = providerId => {
  const capability = getAudioProviderCapability(providerId);
  return {
    id: providerId,
    capability,
    async checkAvailability() {
      return {
        providerId,
        available: false,
        reserved: true,
        implemented: false,
        code: AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RESERVED_NOT_IMPLEMENTED,
        reason: capability?.placeholderReason || `${providerId} is reserved and not implemented yet.`
      };
    },
    async checkHealth() {
      throw new AudioProviderCapabilityError(
        validateAudioProviderOperation({ providerId, operation: AUDIO_PROVIDER_OPERATIONS.HEALTH_CHECK })
      );
    },
    async synthesizeBlob() {
      throw new AudioProviderCapabilityError(
        validateAudioProviderOperation({ providerId, operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS })
      );
    },
    async speak() {
      throw new AudioProviderCapabilityError(
        validateAudioProviderOperation({ providerId, operation: AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK })
      );
    }
  };
};

const createBrowserTtsAdapter = () => {
  const providerId = AUDIO_PROVIDER_IDS.BROWSER_TTS;
  const capability = getAudioProviderCapability(providerId);
  return {
    id: providerId,
    capability,
    async checkAvailability({ synth, Utterance } = {}) {
      const supported = isBrowserTtsSpeechSupported({ synth, Utterance });
      return {
        providerId,
        available: supported,
        reserved: false,
        implemented: true,
        code: supported ? AUDIO_PROVIDER_ERROR_CODES.OK : AUDIO_PROVIDER_ERROR_CODES.PROVIDER_RUNTIME_UNSUPPORTED,
        reason: supported ? null : 'Browser speechSynthesis is unavailable in this environment.'
      };
    },
    async checkHealth() {
      throw new AudioProviderCapabilityError(
        validateAudioProviderOperation({ providerId, operation: AUDIO_PROVIDER_OPERATIONS.HEALTH_CHECK })
      );
    },
    async synthesizeBlob() {
      throw new AudioProviderCapabilityError(
        validateAudioProviderOperation({ providerId, operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS })
      );
    },
    async speak(request = {}) {
      const supported = isBrowserTtsSpeechSupported({
        synth: request?.synth,
        Utterance: request?.Utterance
      });
      const validation = validateAudioProviderOperation({
        providerId,
        operation: AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK,
        runtimeSupport: { speechSynthesisSupported: supported }
      });
      if (!validation.allowed) throw new AudioProviderCapabilityError(validation);
      return executeBrowserTtsPlaybackService(request);
    }
  };
};

const createEdgeTtsAdapter = () => {
  const providerId = AUDIO_PROVIDER_IDS.EDGE_TTS;
  const capability = getAudioProviderCapability(providerId);
  return {
    id: providerId,
    capability,
    async checkAvailability() {
      return {
        providerId,
        available: true,
        reserved: false,
        implemented: true,
        code: AUDIO_PROVIDER_ERROR_CODES.OK,
        endpoint: capability?.endpoint || '/api/tts',
        reason: null
      };
    },
    async checkHealth({ voiceId, signal = null } = {}) {
      return executeTextStructuredEdgeHealthCheck({ voiceId, signal });
    },
    async synthesizeBlob({
      text,
      voiceId,
      engineVoiceId = null,
      rate = 0,
      edgeRate = null,
      pitch = 0,
      edgePitch = null,
      signal = null,
      timeoutMs = null,
      maxAttempts = 3,
      onRetry = null
    } = {}) {
      const result = await executeTextStructuredEdgeAudioRequest({
        text,
        voiceId: voiceId || engineVoiceId,
        rate: edgeRate != null ? edgeRate : rate,
        pitch: edgePitch != null ? edgePitch : pitch,
        signal,
        timeoutMs,
        maxAttempts,
        onRetry
      });
      return {
        ...result,
        providerId,
        renderProfile: capability?.renderProfile || null
      };
    },
    async speak() {
      throw new AudioProviderCapabilityError(
        validateAudioProviderOperation({ providerId, operation: AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK })
      );
    }
  };
};

/**
 * Capability-aware gateway coordinating active Edge TTS + Browser TTS adapters
 * alongside explicitly reserved Local AI (Kokoro/Piper) placeholder slots.
 */
export const createAudioProviderGatewayRegistry = ({ customAdapters = {} } = {}) => {
  const adapters = new Map([
    [AUDIO_PROVIDER_IDS.BROWSER_TTS, createBrowserTtsAdapter()],
    [AUDIO_PROVIDER_IDS.EDGE_TTS, createEdgeTtsAdapter()],
    [AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO, createReservedPlaceholderAdapter(AUDIO_PROVIDER_IDS.LOCAL_AI_KOKORO)],
    [AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER, createReservedPlaceholderAdapter(AUDIO_PROVIDER_IDS.LOCAL_AI_PIPER)]
  ]);

  for (const [key, adapter] of Object.entries(customAdapters || {})) {
    const providerId = normalizeAudioProviderId(key) || key;
    if (providerId && adapter && typeof adapter === 'object') {
      adapters.set(providerId, adapter);
    }
  }

  const getAdapter = providerOrEngine => {
    const providerId = normalizeAudioProviderId(providerOrEngine) || providerOrEngine;
    return providerId ? adapters.get(providerId) || null : null;
  };

  return {
    listCapabilities: options => listAudioProviderCapabilities(options),
    getCapability: providerOrEngine => getAudioProviderCapability(providerOrEngine),
    getAdapter,
    async checkAvailability(providerOrEngine, options = {}) {
      const providerId = normalizeAudioProviderId(providerOrEngine) || String(providerOrEngine || '').trim() || null;
      const adapter = getAdapter(providerOrEngine);
      if (!adapter || typeof adapter.checkAvailability !== 'function') {
        return {
          providerId,
          available: false,
          reserved: false,
          implemented: false,
          code: AUDIO_PROVIDER_ERROR_CODES.UNKNOWN_PROVIDER,
          reason: `Audio provider '${providerId || 'missing'}' is not registered.`
        };
      }
      return adapter.checkAvailability(options);
    },
    async checkHealth({ providerId = AUDIO_PROVIDER_IDS.EDGE_TTS, ...rest } = {}) {
      const normalizedId = normalizeAudioProviderId(providerId) || providerId;
      const validation = validateAudioProviderOperation({
        providerId: normalizedId,
        operation: AUDIO_PROVIDER_OPERATIONS.HEALTH_CHECK
      });
      if (!validation.allowed) throw new AudioProviderCapabilityError(validation);
      const adapter = getAdapter(normalizedId);
      return adapter.checkHealth(rest);
    },
    async synthesizeBlob({ providerId = null, engine = null, ...rest } = {}) {
      const target = providerId || engine || AUDIO_PROVIDER_IDS.EDGE_TTS;
      const normalizedId = normalizeAudioProviderId(target);
      const customOverride = normalizedId ? customAdapters?.[normalizedId] || customAdapters?.[target] : null;
      if (!customOverride) {
        const validation = validateAudioProviderOperation({
          providerId: normalizedId || target,
          operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS
        });
        if (!validation.allowed) throw new AudioProviderCapabilityError(validation);
      }
      const adapter = getAdapter(normalizedId || target);
      if (!adapter || typeof adapter.synthesizeBlob !== 'function') {
        throw new AudioProviderCapabilityError(validateAudioProviderOperation({
          providerId: target,
          operation: AUDIO_PROVIDER_OPERATIONS.BLOB_SYNTHESIS
        }));
      }
      return adapter.synthesizeBlob(rest);
    },
    async speak({ providerId = AUDIO_PROVIDER_IDS.BROWSER_TTS, ...rest } = {}) {
      const normalizedId = normalizeAudioProviderId(providerId);
      const adapter = getAdapter(normalizedId || providerId);
      if (!adapter || typeof adapter.speak !== 'function') {
        throw new AudioProviderCapabilityError(validateAudioProviderOperation({
          providerId: normalizedId || providerId,
          operation: AUDIO_PROVIDER_OPERATIONS.LIVE_PLAYBACK
        }));
      }
      return adapter.speak(rest);
    }
  };
};

export const defaultAudioProviderGateway = createAudioProviderGatewayRegistry();

export const getAudioProviderGatewayAdapter = providerOrEngine =>
  defaultAudioProviderGateway.getAdapter(providerOrEngine);

export const executeGatewayBlobSynthesis = request =>
  defaultAudioProviderGateway.synthesizeBlob(request);

export const executeGatewayHealthCheck = request =>
  defaultAudioProviderGateway.checkHealth(request);

export const executeGatewayLivePlayback = request =>
  defaultAudioProviderGateway.speak(request);
