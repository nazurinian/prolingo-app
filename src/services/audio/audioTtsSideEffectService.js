import { base64ToInt16Array, encodeWAV, triggerBrowserDownload } from '../../utils/audioUtils';
import {
  resolveAudioGenerationPreparation,
  resolveEdgeHealthCheckRequest,
  resolveEdgeTtsRequestState,
  resolveGeminiTtsApiKey,
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
userApiKey,
apiKey,
generationAbortControllerRef,
setAiLoadingId,
setEdgeHealth,
setLocalAudioMapTable,
setLocalAudioMapText,
addLog
}) => {
  const uniqueLoadingId = `${item.id}-${part}`;
  setAiLoadingId(uniqueLoadingId);

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
      return;
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

           const response = await fetch(edgeRequest.url, {
               method: edgeRequest.method,
               headers: edgeRequest.headers,
               signal: controller.signal,
               body: JSON.stringify(edgeRequest.body)
           });

           if (!response.ok) {
               const errText = await response.text();
               throw new Error(`Edge ${response.status}: ${errText || response.statusText}`);
           }

           const contentType = response.headers.get('content-type') || '';
           if (contentType.includes('application/json') || contentType.includes('text/')) {
               const errText = await response.text();
               throw new Error(`Edge returned non-audio response: ${errText.slice(0, 220)}`);
           }

           blob = await response.blob();
           if (!blob.size) throw new Error('Edge backend returned empty audio.');
           setEdgeHealth({ status: 'online', message: `Last request OK • ${Math.round(blob.size / 1024)} KB` });
      } else {
          const keyToUse = resolveGeminiTtsApiKey(apiKey, userApiKey);
          if (!keyToUse) {
              alert("API Key Kosong! Masukkan key di menu Tools.");
              return;
          }
          const geminiRequest = resolveGeminiTtsRequestState({
              textToSpeak,
              aiVoiceName,
              keyToUse
          });

          const response = await fetch(geminiRequest.url, {
              method: geminiRequest.method,
              headers: geminiRequest.headers,
              signal: controller.signal,
              body: JSON.stringify(geminiRequest.body)
          });

          if (!response.ok) throw new Error(`Gemini API Error ${response.status}`);
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
          triggerBrowserDownload(url, filename);
          addLog("Success", `Saved: ${filename}`);
      }
  } catch (e) {
      if (isGenerationCancelled(e.name)) {
          addLog("Info", `Generation cancelled: ${stableId}/${part}`);
      } else {
          const failureState = resolveGenerationFailureState({ errorMessage: e.message, generatorEngine });
          console.error(e);
          if (failureState.edgeHealth) setEdgeHealth(failureState.edgeHealth);
          addLog("Error", failureState.logMessage);
          alert(failureState.alertMessage);
      }
  } finally {
      if (generationAbortControllerRef.current === controller) generationAbortControllerRef.current = null;
      setAiLoadingId(null);
  }
};
