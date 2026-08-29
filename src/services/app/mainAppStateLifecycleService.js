import { getRecordAudioNo } from '../../utils/audioUtils';
import { getMaxAssignedNoFromRecords, getMaxManualIdFromRecords, parseTableRecords } from '../../utils/csvUtils';

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
  mode, textContent, setPlaylist, setBatchConfig, tableContent, sequenceHighWater,
  setSequenceHighWater, setManualIdHighWater, addLog
}) => {
    try {
        if (mode === 'text') {
            const safeText = typeof textContent === 'string' ? textContent : String(textContent || "");
            const lines = safeText.split('\n').filter(l => l.trim());
            const newPlaylist = lines.map((line, idx) => ({
                id: `TEXT_${String(idx + 1).padStart(6, '0')}`,
                vocabId: null,
                displayId: idx + 1,
                text: line.trim(),
                isStructured: false
            }));
            setPlaylist(newPlaylist);
            setBatchConfig(prev => ({ ...prev, end: Math.max(1, newPlaylist.length) }));
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
