import { base64ToInt16Array, encodeWAV, isIndonesianAudioPart, triggerBrowserDownload } from '../../utils/audioUtils';
import {
  resolveAudioGenerationPreparation,
  resolveEdgeHealthCheckRequest,
  resolveEdgeTtsRequestState,
  resolveGeminiTtsRequestState,
  resolveTtsGenerationProvider
} from '../../domain/audio/ttsRequestProviderDomain';
import {
  isGenerationCancelled,
  resolveEdgeHealthFailureMessage,
  resolveEdgeHealthLogMessage,
  resolveEdgeHealthStatusMessage,
  resolveGeneratedAudioFilename,
  resolveGeneratedAudioMapKey,
  resolveGenerationFailureState,
  resolveGeminiInlineAudioState
} from '../../domain/audio/audioTtsCompletionFailureDomain';
import { executeTtsRequestWithRetry, readAudioResponseBlobWithIdleWatchdog, resolveAdaptiveTtsTimeoutMs } from './ttsResilienceService.js';

export const executeEdgeBackendHealthService = async ({
edgeHealth,
edgeTestAbortControllerRef,
setEdgeHealth,
edgeVoice,
addLog
}) => {
  if (edgeHealth.status === 'testing') {
      edgeTestAbortControllerRef.current?.abort();
      return;
  }

  const controller = new AbortController();
  edgeTestAbortControllerRef.current = controller;
  setEdgeHealth({ status: 'testing', message: 'Testing /api/tts...' });
  let timeoutId = null;

  try {
      timeoutId = setTimeout(() => controller.abort(), 12000);
      const edgeHealthRequest = resolveEdgeHealthCheckRequest(edgeVoice);
      const response = await fetch(edgeHealthRequest.url, {
          method: edgeHealthRequest.method,
          headers: edgeHealthRequest.headers,
          signal: controller.signal,
          body: JSON.stringify(edgeHealthRequest.body)
      });

      if (!response.ok) {
          const detail = await response.text();
          throw new Error(`HTTP ${response.status}: ${detail || response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/')) {
          const detail = await response.text();
          throw new Error(`Unexpected response: ${detail.slice(0, 180)}`);
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error('Backend returned empty audio.');

      setEdgeHealth({ status: 'online', message: resolveEdgeHealthStatusMessage(blob.size) });
      addLog("Edge", resolveEdgeHealthLogMessage(blob.size));
  } catch (error) {
      const msg = resolveEdgeHealthFailureMessage(error);
      setEdgeHealth({ status: 'error', message: msg });
      addLog("Error", `Edge health: ${msg}`);
  } finally {
      if (timeoutId) clearTimeout(timeoutId);
      edgeTestAbortControllerRef.current = null;
  }
};

export const executeAudioGenerationService = async ({
item,
part,
mode,
generatorEngine,
edgeIndonesianVoice,
edgeVoice,
aiVoiceName,
edgeRate,
edgePitch,
geminiAccessUnlocked,
generationAbortControllerRef,
setAiLoadingId,
setEdgeHealth,
setLocalAudioMapTable,
setLocalAudioMapText,
onGeneratedAudio,
addLog,
deferBrowserDownload = false,
suppressFailureAlert = false
}) => {
  const uniqueLoadingId = `${item.id}-${part}`;
  setAiLoadingId(uniqueLoadingId);

  // Product rule: Gemini generation is English-only in Table mode. Keep the
  // guard in the service as well as the UI so Indonesian audio cannot slip
  // through from a stale menu/batch configuration.
  if (mode === 'table' && generatorEngine === 'gemini' && isIndonesianAudioPart(part)) {
      setAiLoadingId(null);
      addLog('Warn', `Gemini EN-only: ${part} is locked.`);
      return { status: 'locked-language', part };
  }

  const generationPreparation = resolveAudioGenerationPreparation({
      item,
      part,
      mode,
      generatorEngine,
      edgeIndonesianVoice,
      edgeVoice,
      aiVoiceName
  });
  let { textToSpeak, filename } = generationPreparation;
  const { stableId } = generationPreparation;

  if (!String(textToSpeak || '').trim()) {
      setAiLoadingId(null);
      addLog("Warn", `Skip ${stableId}/${part}: empty text.`);
      return { status: 'skipped-empty', stableId, part };
  }

  addLog("Info", `Gen (${generatorEngine}) ${stableId}/${part}...`);
  const controller = new AbortController();
  generationAbortControllerRef.current = controller;

  try {
      let blob = null;

      const generationProvider = resolveTtsGenerationProvider(generatorEngine);
      if (generationProvider === 'edge') {
           const edgeRequest = resolveEdgeTtsRequestState({
               part,
               textToSpeak,
               edgeRate,
               edgePitch,
               edgeIndonesianVoice,
               edgeVoice
           });

           const edgeResult = await executeTtsRequestWithRetry({
               operationSignal: controller.signal,
               timeoutMs: resolveAdaptiveTtsTimeoutMs({ text: textToSpeak, minimumMs: 30000, perCharacterMs: 80, maximumMs: 120000 }),
               maxAttempts: 3,
               retryDelayMs: 700,
               onRetry: ({ nextAttempt, maxAttempts, error }) => {
                   addLog('Warn', `Edge retry ${nextAttempt}/${maxAttempts}: ${stableId}/${part} • ${error.message}`);
               },
               runAttempt: async ({ signal }) => {
                   const response = await fetch(edgeRequest.url, {
                       method: edgeRequest.method,
                       headers: edgeRequest.headers,
                       signal,
                       body: JSON.stringify(edgeRequest.body)
                   });

                   if (!response.ok) {
                       const errText = await response.text();
                       const error = new Error(`Edge ${response.status}: ${errText || response.statusText}`);
                       error.retryable = response.status >= 500 || response.status === 408 || response.status === 429;
                       throw error;
                   }

                   const contentType = response.headers.get('content-type') || '';
                   if (contentType.includes('application/json') || contentType.includes('text/')) {
                       const errText = await response.text();
                       const error = new Error(`Edge returned non-audio response: ${errText.slice(0, 220)}`);
                       error.retryable = false;
                       throw error;
                   }

                   const attemptBlob = await readAudioResponseBlobWithIdleWatchdog({ response, signal, idleTimeoutMs: 15000 });
                   if (!attemptBlob.size) {
                       const error = new Error('Edge backend returned empty audio.');
                       error.retryable = true;
                       throw error;
                   }
                   return { blob: attemptBlob };
               }
           });
           blob = edgeResult.blob;
           setEdgeHealth({ status: 'online', message: `Last request OK • ${Math.round(blob.size / 1024)} KB` });
      } else {
          if (!geminiAccessUnlocked) {
              alert("Gemini terkunci. Daftarkan API key Anda atau unlock Owner Access.");
              return;
          }
          const geminiRequest = resolveGeminiTtsRequestState({ textToSpeak, aiVoiceName });

          const response = await fetch(geminiRequest.url, {
              method: geminiRequest.method,
              headers: geminiRequest.headers,
              credentials: geminiRequest.credentials,
              signal: controller.signal,
              body: JSON.stringify(geminiRequest.body)
          });

          if (!response.ok) {
              const errorBody = await response.json().catch(() => ({}));
              throw new Error(errorBody?.error || `Gemini API Error ${response.status}`);
          }
          const data = await response.json();

          const geminiAudio = resolveGeminiInlineAudioState(data);
          if (geminiAudio.hasInlineAudio) {
              const base64Audio = geminiAudio.base64Audio;
              blob = new Blob([encodeWAV(base64ToInt16Array(base64Audio))], { type: 'audio/wav' });
          } else {
              throw new Error('Gemini tidak mengembalikan audio (Safety/Model Issue).');
          }
      }

      if (blob) {
          const url = URL.createObjectURL(blob);
          if (mode === 'table') {
              setLocalAudioMapTable(prev => {
                  const key = resolveGeneratedAudioMapKey({ mode, stableId, part });
                  if (prev[key]) URL.revokeObjectURL(prev[key]);
                  return { ...prev, [key]: url };
              });
          } else {
              setLocalAudioMapText(prev => {
                  const key = resolveGeneratedAudioMapKey({ mode, stableId, part });
                  if (prev[key]) URL.revokeObjectURL(prev[key]);
                  return { ...prev, [key]: url };
              });
          }

          filename = resolveGeneratedAudioFilename({ generatorEngine, blobType: blob.type, filename });
          const generatedKey = resolveGeneratedAudioMapKey({ mode, stableId, part });
          const generatedVoice = generatorEngine === 'edge'
              ? (isIndonesianAudioPart(part) ? edgeIndonesianVoice : edgeVoice)
              : aiVoiceName;
          const deliveryStatus = deferBrowserDownload ? 'pending-package' : 'browser-direct-triggered';
          onGeneratedAudio?.({
              mode,
              mapKey: generatedKey,
              part,
              engine: generatorEngine,
              voice: generatedVoice,
              filename,
              deliveryStatus
          });
          if (!deferBrowserDownload) triggerBrowserDownload(url, filename);
          addLog("Success", `${deferBrowserDownload ? 'Generated' : 'Saved'}: ${filename}`);
          return { status: 'success', mapKey: generatedKey, filename, blob, url, part, engine: generatorEngine, voice: generatedVoice, deliveryStatus };
      }
  } catch (e) {
      if (isGenerationCancelled(e.name)) {
          addLog("Info", `Generation cancelled: ${stableId}/${part}`);
          return { status: 'cancelled', stableId, part };
      } else {
          const failureState = resolveGenerationFailureState({ errorMessage: e.message, generatorEngine });
          console.error(e);
          if (failureState.edgeHealth) setEdgeHealth(failureState.edgeHealth);
          addLog("Error", failureState.logMessage);
          if (!suppressFailureAlert) alert(failureState.alertMessage);
          return { status: 'error', stableId, part, error: e.message || String(e) };
      }
  } finally {
      if (generationAbortControllerRef.current === controller) generationAbortControllerRef.current = null;
      setAiLoadingId(null);
  }
};


export const executeGeminiOwnerStatusService = async ({ setGeminiOwnerState, addLog }) => {
  try {
    const [ownerResponse, byokResponse] = await Promise.all([
      fetch('/api/gemini-auth', { credentials: 'include' }),
      fetch('/api/gemini-byok', { credentials: 'include' })
    ]);
    if (!ownerResponse.ok) throw new Error(`Owner HTTP ${ownerResponse.status}`);
    if (!byokResponse.ok) throw new Error(`BYOK HTTP ${byokResponse.status}`);
    const owner = await ownerResponse.json();
    const byok = await byokResponse.json();
    setGeminiOwnerState({
      checked: true,
      configured: Boolean(owner.configured),
      unlocked: Boolean(owner.unlocked),
      byokAvailable: Boolean(byok.available),
      byokRegistered: Boolean(byok.registered)
    });
  } catch (error) {
    setGeminiOwnerState(prev => ({ ...prev, checked: true }));
    addLog?.('Warn', `Gemini access status unavailable: ${error.message}`);
  }
};

export const executeGeminiOwnerUnlockService = async ({ accessCode, setGeminiOwnerState, addLog }) => {
  const response = await fetch('/api/gemini-auth', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  setGeminiOwnerState(prev => ({ ...prev, checked: true, configured: true, unlocked: true }));
  addLog?.('Gemini', 'Owner access unlocked on this device.');
  return data;
};

export const executeGeminiOwnerLockService = async ({ setGeminiOwnerState, addLog }) => {
  const response = await fetch('/api/gemini-auth', { method: 'DELETE', credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  setGeminiOwnerState(prev => ({ ...prev, checked: true, unlocked: false }));
  addLog?.('Gemini', 'Owner access locked on this device.');
  return data;
};

export const executeGeminiByokRegisterService = async ({ apiKey, setGeminiOwnerState, addLog }) => {
  const response = await fetch('/api/gemini-byok', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  setGeminiOwnerState(prev => ({ ...prev, checked: true, byokAvailable: true, byokRegistered: true }));
  addLog?.('Gemini', 'Your Gemini API key is registered for this device.');
  return data;
};

export const executeGeminiByokClearService = async ({ setGeminiOwnerState, addLog }) => {
  const response = await fetch('/api/gemini-byok', { method: 'DELETE', credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  setGeminiOwnerState(prev => ({ ...prev, checked: true, byokRegistered: false }));
  addLog?.('Gemini', 'Your Gemini API key was removed from this device.');
  return data;
};
