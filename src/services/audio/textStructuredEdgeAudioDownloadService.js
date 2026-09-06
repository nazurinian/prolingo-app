const clean = value => String(value ?? '').trim();

const formatRate = value => {
  const number = Number(value) || 0;
  return `${number >= 0 ? '+' : ''}${number}%`;
};

const formatPitch = value => {
  const number = Number(value) || 0;
  return `${number >= 0 ? '+' : ''}${number}Hz`;
};

const linkAbortSignal = (sourceSignal, controller) => {
  if (!sourceSignal) return () => {};
  if (sourceSignal.aborted) {
    controller.abort(sourceSignal.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(sourceSignal.reason);
  sourceSignal.addEventListener('abort', onAbort, { once: true });
  return () => sourceSignal.removeEventListener('abort', onAbort);
};

export const executeTextStructuredEdgeAudioRequest = async ({
  text,
  voiceId,
  rate = 0,
  pitch = 0,
  signal = null,
  timeoutMs = 25000
}) => {
  const content = clean(text);
  const voice = clean(voiceId);
  if (!content) throw new Error('Edge Text audio requires non-empty content.');
  if (!voice) throw new Error('Edge Text audio requires a voice.');

  const controller = new AbortController();
  const unlink = linkAbortSignal(signal, controller);
  const timeoutId = setTimeout(() => controller.abort(new DOMException('Edge TTS timeout', 'TimeoutError')), timeoutMs);

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        text: content,
        voice,
        rate: formatRate(rate),
        pitch: formatPitch(pitch)
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Edge ${response.status}: ${detail || response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('text/')) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Edge returned non-audio response: ${detail.slice(0, 220)}`);
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error('Edge backend returned empty audio.');
    return { blob, engine: 'edge', engineVoiceId: voice, contentType: contentType || blob.type || 'audio/mpeg' };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted && error?.name === 'AbortError') {
      throw new Error('Edge TTS request timed out. Check the local/server TTS backend.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    unlink();
  }
};

export const executeTextStructuredEdgeHealthCheck = async ({ voiceId, signal = null } = {}) => {
  const result = await executeTextStructuredEdgeAudioRequest({
    text: 'ProLingo Text Edge audio test.',
    voiceId,
    rate: 0,
    pitch: 0,
    signal,
    timeoutMs: 15000
  });
  return {
    status: 'online',
    voiceId: result.engineVoiceId,
    size: result.blob.size,
    mimeType: result.blob.type || result.contentType || null
  };
};
