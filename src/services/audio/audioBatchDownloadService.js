import { getAdvancedExpressionPairs } from '../../utils/audioUtils';
import { getMaxAssignedNoFromRecords } from '../../utils/csvUtils';

export const executeAudioBatchDownloadService = async ({
isBatchDownloading,
batchStopSignalRef,
generationAbortControllerRef,
setIsBatchStopping,
setBatchStatusText,
addLog,
batchConfig,
mode,
sequenceHighWater,
playlist,
generatorEngine,
setIsBatchDownloading,
generateAIAudio
}) => {
  if (isBatchDownloading) {
      batchStopSignalRef.current = true;
      generationAbortControllerRef.current?.abort();
      setIsBatchStopping(true); 
      setBatchStatusText("Stopping...");
      addLog("Batch", "Stopping batch download...");
      return;
  }
  
  batchStopSignalRef.current = false;
  setIsBatchStopping(false);

  const startIdx = parseInt(batchConfig.start);
  const endIdx = parseInt(batchConfig.end);
  
  const maxRangeNo = mode === 'table'
      ? Math.max(1, sequenceHighWater, getMaxAssignedNoFromRecords(playlist))
      : Math.max(1, playlist.length);
  if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 1 || endIdx > maxRangeNo || startIdx > endIdx) {
      alert(`Range tidak valid. Maksimum saat ini: ${maxRangeNo}.`);
      return;
  }

  const targets = mode === 'table'
      ? playlist.filter(p => p.displayId >= startIdx && p.displayId <= endIdx)
      : playlist.filter((_, idx) => (idx + 1) >= startIdx && (idx + 1) <= endIdx);
  
  if (targets.length === 0) {
      alert("Tidak ada item dalam range tersebut.");
      return;
  }

  setIsBatchDownloading(true);
  addLog("Info", `Starting BATCH DL (${targets.length} items) via ${generatorEngine.toUpperCase()}...`);

  for (const item of targets) {
      if (batchStopSignalRef.current) {
          addLog("Batch", "Batch Stopped by User.");
          break;
      }
      
      if (mode === 'table') {
          if (batchConfig.doWord) { 
              setBatchStatusText(`${item.displayId} Word`); 
              await generateAIAudio(item, 'word'); // Uses the smart wrapper
              await new Promise(r => setTimeout(r, 1000)); 
          }
          if (batchStopSignalRef.current) break;
          if (batchConfig.doWordTranslation && generatorEngine === 'edge' && item.meaningWord) {
              setBatchStatusText(`${item.displayId} Word IDN`);
              await generateAIAudio(item, 'word_idn');
              await new Promise(r => setTimeout(r, 800));
          }
          if (batchStopSignalRef.current) break; 
          if (batchConfig.doSentence) { 
              setBatchStatusText(`${item.displayId} Sent`); 
              await generateAIAudio(item, 'sentence'); // Uses the smart wrapper
              await new Promise(r => setTimeout(r, 1000)); 
          }
          if (batchStopSignalRef.current) break;
          
          // New Meaning Logic
          if (batchConfig.doMeaning && generatorEngine === 'edge') { 
               setBatchStatusText(`${item.displayId} Meaning`); 
               await generateAIAudio(item, 'meaning'); 
               await new Promise(r => setTimeout(r, 1000)); 
          }
          if (batchStopSignalRef.current) break;
          if (batchConfig.doExpressions) {
               for (const pair of getAdvancedExpressionPairs(item)) {
                   if (batchStopSignalRef.current) break;
                   if (pair.en) {
                       setBatchStatusText(`${item.displayId} EXP${pair.number} EN`);
                       await generateAIAudio(item, `exp${pair.number}_en`);
                       await new Promise(r => setTimeout(r, 800));
                   }
                   if (batchConfig.doExpressionTranslations && generatorEngine === 'edge' && pair.idn) {
                       if (batchStopSignalRef.current) break;
                       setBatchStatusText(`${item.displayId} EXP${pair.number} IDN`);
                       await generateAIAudio(item, `exp${pair.number}_idn`);
                       await new Promise(r => setTimeout(r, 800));
                   }
               }
          }
      } else {
           setBatchStatusText(`${item.displayId} Full`); 
           await generateAIAudio(item, 'full'); // Uses the smart wrapper
           await new Promise(r => setTimeout(r, 1000));
      }
  }

  setIsBatchDownloading(false);
  setBatchStatusText(""); 
  setIsBatchStopping(false);
  batchStopSignalRef.current = false;
};
