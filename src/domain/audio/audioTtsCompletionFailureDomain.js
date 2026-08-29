export const shouldIgnoreLocalAudioFailure = (settled) => Boolean(settled);

export const shouldResolveLocalAudioFailure = (stopRequested) => Boolean(stopRequested);

export const resolveEdgeHealthStatusMessage = (blobSize) =>
  `OK • ${Math.round(blobSize / 1024)} KB`;

export const resolveEdgeHealthLogMessage = (blobSize) =>
  `Health check OK (${Math.round(blobSize / 1024)} KB).`;

export const resolveEdgeHealthFailureMessage = ({ name, message }) =>
  name === 'AbortError' ? 'Request dibatalkan / timeout.' : message;

export const resolveGeminiInlineAudioState = (data) => {
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  return {
    hasInlineAudio: Boolean(inlineData),
    base64Audio: inlineData?.data
  };
};

export const resolveGeneratedAudioMapKey = ({ mode, stableId, part }) =>
  mode === 'table' ? `${stableId}_${part}` : stableId;

export const resolveGeneratedAudioFilename = ({ generatorEngine, blobType, filename }) => {
  let completedFilename = filename;
  if (generatorEngine === 'edge') {
    const mime = String(blobType || '').toLowerCase();
    if (mime.includes('mpeg') || mime.includes('mp3')) completedFilename = completedFilename.replace(/\.wav$/i, '.mp3');
    else if (mime.includes('ogg')) completedFilename = completedFilename.replace(/\.wav$/i, '.ogg');
    else if (mime.includes('webm')) completedFilename = completedFilename.replace(/\.wav$/i, '.webm');
  }
  return completedFilename;
};

export const isGenerationCancelled = (errorName) => errorName === 'AbortError';

export const resolveGenerationFailureState = ({ errorMessage, generatorEngine }) => ({
  edgeHealth: generatorEngine === 'edge' ? { status: 'error', message: errorMessage } : null,
  logMessage: `Gen Failed: ${errorMessage}`,
  alertMessage: `Gagal: ${errorMessage}`
});
