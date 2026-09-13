const DEFAULT_RETRY_DELAY_MS = 700;

const createAbortError = (message = 'Request cancelled') => {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

const delayWithSignal = (ms, signal) => new Promise((resolve, reject) => {
  if (!ms) {
    resolve();
    return;
  }
  if (signal?.aborted) {
    reject(createAbortError('Request cancelled'));
    return;
  }
  const timer = setTimeout(() => {
    cleanup();
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    cleanup();
    reject(createAbortError('Request cancelled'));
  };
  const cleanup = () => signal?.removeEventListener?.('abort', onAbort);
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

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

/**
 * Execute one TTS network operation with a bounded per-attempt timeout and
 * bounded retries. Cancellation from operationSignal always wins immediately.
 * Errors may set retryable=false to fail without retry (for example HTTP 4xx).
 */
export const executeTtsRequestWithRetry = async ({
  operationSignal = null,
  timeoutMs = 20000,
  maxAttempts = 3,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  runAttempt,
  onRetry = null
} = {}) => {
  if (typeof runAttempt !== 'function') throw new Error('runAttempt is required');
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (operationSignal?.aborted) throw createAbortError('Request cancelled');

    const attemptController = new AbortController();
    const unlink = linkAbortSignal(operationSignal, attemptController);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      attemptController.abort();
    }, Math.max(1000, Number(timeoutMs) || 20000));

    try {
      return await runAttempt({ signal: attemptController.signal, attempt, maxAttempts: attempts });
    } catch (error) {
      if (operationSignal?.aborted) throw createAbortError('Request cancelled');

      const normalized = timedOut
        ? Object.assign(new Error(`TTS request timed out after ${Math.max(1000, Number(timeoutMs) || 20000)} ms.`), { code: 'TTS_TIMEOUT', retryable: true })
        : error;
      lastError = normalized;

      const canRetry = attempt < attempts && normalized?.retryable !== false;
      if (!canRetry) throw normalized;

      onRetry?.({ error: normalized, attempt, nextAttempt: attempt + 1, maxAttempts: attempts });
      await delayWithSignal(retryDelayMs * attempt, operationSignal);
    } finally {
      clearTimeout(timeoutId);
      unlink();
    }
  }

  throw lastError || new Error('TTS request failed.');
};


export const resolveAdaptiveTtsTimeoutMs = ({
  text = '',
  minimumMs = 30000,
  perCharacterMs = 120,
  maximumMs = 300000
} = {}) => {
  const length = String(text ?? '').trim().length;
  const min = Math.max(1000, Number(minimumMs) || 30000);
  const max = Math.max(min, Number(maximumMs) || 300000);
  const perChar = Math.max(0, Number(perCharacterMs) || 0);
  return Math.min(max, Math.max(min, Math.round(min + (length * perChar))));
};

export const readAudioResponseBlobWithIdleWatchdog = async ({
  response,
  signal = null,
  idleTimeoutMs = 20000
} = {}) => {
  if (!response) throw new Error('Audio response is required.');
  if (!response.body?.getReader) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  const idleMs = Math.max(1000, Number(idleTimeoutMs) || 20000);

  try {
    while (true) {
      if (signal?.aborted) throw createAbortError('Request cancelled');
      let timer = null;
      const idlePromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`TTS audio stream made no progress for ${idleMs} ms.`);
          error.code = 'TTS_IDLE_TIMEOUT';
          error.retryable = true;
          reject(error);
        }, idleMs);
      });
      try {
        const { done, value } = await Promise.race([reader.read(), idlePromise]);
        if (done) break;
        if (value?.byteLength) {
          chunks.push(value);
          totalBytes += value.byteLength;
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  } catch (error) {
    try { await reader.cancel(error?.message || 'Audio stream cancelled'); } catch {}
    throw error;
  } finally {
    try { reader.releaseLock?.(); } catch {}
  }

  const type = response.headers?.get?.('content-type') || 'audio/mpeg';
  return new Blob(chunks, { type });
};
