import { executeTtsRequestWithRetry, readAudioResponseBlobWithIdleWatchdog, resolveAdaptiveTtsTimeoutMs } from './ttsResilienceService.js';

const clean = value => String(value ?? '').trim();

const formatRate = value => {
  const number = Number(value) || 0;
  return `${number >= 0 ? '+' : ''}${number}%`;
};

const formatPitch = value => {
  const number = Number(value) || 0;
  return `${number >= 0 ? '+' : ''}${number}Hz`;
};

export const executeTextStructuredEdgeAudioRequest = async ({
  text,
  voiceId,
  rate = 0,
  pitch = 0,
  signal = null,
  timeoutMs = null,
  maxAttempts = 3,
  onRetry = null
}) => {
  const content = clean(text);
  const voice = clean(voiceId);
  if (!content) throw new Error('Edge Text audio requires non-empty content.');
  if (!voice) throw new Error('Edge Text audio requires a voice.');

  const adaptiveTimeoutMs = timeoutMs == null
    ? resolveAdaptiveTtsTimeoutMs({ text: content, minimumMs: 60000, perCharacterMs: 120, maximumMs: 300000 })
    : timeoutMs;

  return executeTtsRequestWithRetry({
    operationSignal: signal,
    timeoutMs: adaptiveTimeoutMs,
    maxAttempts,
    retryDelayMs: 700,
    onRetry,
    runAttempt: async ({ signal: attemptSignal }) => {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: attemptSignal,
        body: JSON.stringify({
          text: content,
          voice,
          rate: formatRate(rate),
          pitch: formatPitch(pitch)
        })
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const error = new Error(`Edge ${response.status}: ${detail || response.statusText}`);
        error.retryable = response.status >= 500 || response.status === 408 || response.status === 429;
        throw error;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const detail = await response.text().catch(() => '');
        const error = new Error(`Edge returned non-audio response: ${detail.slice(0, 220)}`);
        error.retryable = false;
        throw error;
      }

      const blob = await readAudioResponseBlobWithIdleWatchdog({ response, signal: attemptSignal, idleTimeoutMs: 20000 });
      if (!blob.size) {
        const error = new Error('Edge backend returned empty audio.');
        error.retryable = true;
        throw error;
      }
      return { blob, engine: 'edge', engineVoiceId: voice, contentType: contentType || blob.type || 'audio/mpeg' };
    }
  });
};

export const executeTextStructuredEdgeHealthCheck = async ({ voiceId, signal = null } = {}) => {
  const result = await executeTextStructuredEdgeAudioRequest({
    text: 'ProLingo Text Edge audio test.',
    voiceId,
    rate: 0,
    pitch: 0,
    signal,
    timeoutMs: 15000,
    maxAttempts: 1
  });
  return {
    status: 'online',
    voiceId: result.engineVoiceId,
    size: result.blob.size,
    mimeType: result.blob.type || result.contentType || null
  };
};
