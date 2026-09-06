import { getRecordAudioNo } from '../../utils/audioUtils';
import { getMaxAssignedNoFromRecords, getMaxManualIdFromRecords, parseTableRecords } from '../../utils/csvUtils';
import { resolveTextPlaylist } from '../../domain/text/textIdentityDomain';

export const executeSystemLogAppend = ({ type, message, setSystemLogs }) => {
      const timestamp = new Date().toLocaleTimeString();
      setSystemLogs(prev => {
          const next = [...prev, { time: timestamp, type, message }];
          // LIMIT UPDATED: 50 -> 20
          if (next.length > 20) return next.slice(next.length - 20); 
          return next;
      });
};

export const executePlaylistContentSyncEffect = ({
  mode, textIdentityState, textDatabaseStatus, setTextDatabaseStatus, setPlaylist, setBatchConfig, tableContent, sequenceHighWater,
  setSequenceHighWater, setManualIdHighWater, addLog
}) => {
    try {
        if (mode === 'text') {
            // P4-A2 hydration gate: never project legacy/default rows before IndexedDB wins.
            if (textDatabaseStatus !== 'hydrated' && textDatabaseStatus !== 'ready') {
                setPlaylist([]);
                setBatchConfig(prev => ({ ...prev, end: 1 }));
                return;
            }
            const newPlaylist = resolveTextPlaylist(textIdentityState);
            setPlaylist(newPlaylist);
            setBatchConfig(prev => ({ ...prev, end: Math.max(1, newPlaylist.length) }));
            if (textDatabaseStatus === 'hydrated') {
                setTextDatabaseStatus('ready');
                addLog('Text DB', `Text UI projection ready (${newPlaylist.length} items).`);
            }
            return;
        }

        const parsed = parseTableRecords(tableContent)
          .sort((a, b) => (getRecordAudioNo(a) || 0) - (getRecordAudioNo(b) || 0));
        const currentMaxNo = getMaxAssignedNoFromRecords(parsed);
        setPlaylist(parsed);
        // Raw/manual edits may introduce a higher NO, but deletion must never lower the counter.
        setSequenceHighWater(prev => Math.max(prev, currentMaxNo));
        setManualIdHighWater(prev => Math.max(prev, getMaxManualIdFromRecords(parsed)));
        setBatchConfig(prev => ({ ...prev, end: Math.max(1, sequenceHighWater, currentMaxNo) }));
    } catch (error) {
        console.error("Error parsing content:", error);
        addLog("Error", `Gagal memproses data: ${error.message}`);
    }
};

export const executeResetFullState = ({
  localAudioMapTable, localAudioMapText, setLocalAudioMapTable, setLocalAudioMapText,
  setAudioStatusTable, setAudioStatusText, setCurrentIndex, setMasterIndex, setStudyIndex,
  setPlayingIndex, setPlayingContext, setStudyQueue, setTableViewMode, forceStopAll, addLog
}) => {
    [...Object.values(localAudioMapTable), ...Object.values(localAudioMapText)].forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) { console.warn("Failed to revoke audio URL", e); }
    });
    setLocalAudioMapTable({});
    setLocalAudioMapText({});
    setAudioStatusTable('idle');
    setAudioStatusText('idle');
    setCurrentIndex(null); 
    setMasterIndex(null);
    setStudyIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    setStudyQueue([]); 
    setTableViewMode('master');
    forceStopAll(); 
    addLog("System", "State fully reset.");
};


export const executeResetTextState = ({
  localAudioMapText, setLocalAudioMapText, setAudioStatusText,
  setCurrentIndex, setPlayingIndex, setPlayingContext, setSavedIndices,
  forceStopAll, addLog
}) => {
    Object.values(localAudioMapText || {}).forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) { console.warn("Failed to revoke Text audio URL", e); }
    });
    setLocalAudioMapText({});
    setAudioStatusText('idle');
    setCurrentIndex(null);
    setPlayingIndex(null);
    setPlayingContext(null);
    setSavedIndices(prev => ({ ...prev, text: null }));
    forceStopAll();
    addLog("System", "Text state reset without mutating Table state.");
};
