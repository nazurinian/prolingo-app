import { getMobilePlayerTopOffset } from '../../constants/layoutConstants';
export const executeTableViewTabSwitch = ({
  targetTab, tableViewMode, getScrollPos, viewScrollPosRef, isPlaying, playingContext,
  isMobile, setShowAppBar, setMasterIndex, currentIndex, setStudyIndex, playingIndex,
  playlist, studyQueueSet, rowHeights, mode, justSwitchedTab, masterIndex, studyIndex,
  pendingScrollRestoration, isAutoScrolling, setScrollTop, setTableViewMode,
  setCurrentIndex, addLog
}) => {
      if (targetTab === tableViewMode) return;
      
      // 1. Save current position
      const currentPos = getScrollPos();
      viewScrollPosRef.current[tableViewMode] = currentPos;

      const isSwitchingToPlayingContext = isPlaying && playingContext === targetTab;

      // FIX: Smart Header Visibility on Tab Switch
      if (isMobile) {
          if (isSwitchingToPlayingContext) {
              setShowAppBar(false); 
          } else {
              setShowAppBar(true);
          }
      }

      if (tableViewMode === 'master') setMasterIndex(currentIndex);
      else setStudyIndex(currentIndex);

      // --- LOGIC BARU: INSTANT JUMP JIKA PLAYING (Meniru handleMobileTabSwitch) ---
      let nextPos = 0;
      
      if (isSwitchingToPlayingContext && playingIndex !== null) {
          // Jika playing & switch ke context yang sama, HITUNG POSISI target
          const _activeItem = playlist.find(p => p.id === playingIndex); // Note: playlist used directly might need filtering context logic if complex
          
          // Filter playlist based on target tab to get correct index
          const targetList = targetTab === 'study' ? playlist.filter(item => studyQueueSet.has(item.id)) : playlist;
          const targetItem = targetList.find(p => p.id === playingIndex);

          if (targetItem) {
              const idx = targetList.indexOf(targetItem);
              const rowH = rowHeights[mode];
              
              // Hitung posisi (Mobile vs Desktop logic)
              if (isMobile) {
                  const containerPadding = getMobilePlayerTopOffset(mode);
                  const targetIdx = Math.max(0, idx - 1);
                  nextPos = containerPadding + (targetIdx * rowH);
                  setShowAppBar(false); // Force hide header
              } else {
                  nextPos = idx * rowH;
              }
              
              // Non-aktifkan auto scroll useEffect karena kita sudah manual set
              justSwitchedTab.current = false; 
          } else {
              // Fallback ke posisi tersimpan
              nextPos = viewScrollPosRef.current[targetTab] || 0;
          }
      } else {
          // Jika tidak playing, restore posisi biasa
          nextPos = viewScrollPosRef.current[targetTab] || 0;
          justSwitchedTab.current = false;
      }

      // 3. SET PENDING SCROLL RESTORATION & BLOCK HEADER HIDING
      pendingScrollRestoration.current = nextPos;
      isAutoScrolling.current = true; 

      // 4. UPDATE STATE
      setScrollTop(nextPos); 
      setTableViewMode(targetTab);
      
      if (playingContext === targetTab && playingIndex !== null) {
          setCurrentIndex(playingIndex);
      } else {
          const restoredIndex = targetTab === 'master' ? masterIndex : studyIndex;
          setCurrentIndex(restoredIndex);
      }
      
      addLog("System", `View Switched to ${targetTab}.`);
};

export const executeMobileTabSwitch = ({
  targetMobileTab, mobileTab, mode, viewScrollPosRef, tableViewMode, isPlaying,
  currentIndex, currentPlayerList, rowHeights, setShowAppBar, setScrollTop,
  pendingScrollRestoration, isAutoScrolling, setMobileTab
}) => {
      if (targetMobileTab === mobileTab) return;

      // If leaving Player tab, save scroll
      if (mobileTab === 'player') {
          if (mode === 'table') viewScrollPosRef.current[tableViewMode] = window.scrollY;
          else viewScrollPosRef.current['text'] = window.scrollY;
      }

      // If entering Player tab, restore scroll
      if (targetMobileTab === 'player') {
          let targetPos = 0;
          
          if (isPlaying && currentIndex !== null) {
              // LOGIC BARU: Jika playing, hitung posisi item aktif agar INSTANT (tanpa animasi smooth)
              // Copy logic kalkulasi dari renderPlaylist
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              if (activeItem) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  const containerPadding = getMobilePlayerTopOffset(mode);
                  const targetIdx = Math.max(0, idx - 1);
                  targetPos = containerPadding + (targetIdx * rowH);
                  
                  // Hide header explicitly saat kembali ke player yang sedang jalan
                  setShowAppBar(false); 
              } else {
                  // Fallback ke posisi manual jika item tidak ketemu
                  if (mode === 'table') targetPos = viewScrollPosRef.current[tableViewMode];
                  else targetPos = viewScrollPosRef.current['text'];
              }
          } else {
              // Restore Manual Position jika tidak playing
              if (mode === 'table') targetPos = viewScrollPosRef.current[tableViewMode];
              else targetPos = viewScrollPosRef.current['text'];
          }

          // Apply Instant Scroll via pending ref (picked up by useLayoutEffect)
          // Ini mencegah glitch karena dilakukan sebelum paint
          setScrollTop(targetPos);
          pendingScrollRestoration.current = targetPos;
          isAutoScrolling.current = true;
      }

      setMobileTab(targetMobileTab);
};

export const executeModeSwitch = ({
  targetMode, mode, isSystemBusy, forceStopAll, setPlayingIndex, setPlayingContext,
  setIndependentPlayingId, viewScrollPosRef, tableViewMode, getScrollPos, currentIndex,
  setSavedIndices, setScrollTop, pendingScrollRestoration, isAutoScrolling, setMode,
  savedIndices, setCurrentIndex, addLog
}) => {
      if (targetMode === mode) return;
      if (isSystemBusy) return; 

      forceStopAll();
      setPlayingIndex(null);
      setPlayingContext(null);
      setIndependentPlayingId(null); 

      // SAVE Scroll Position
      if (mode === 'table') viewScrollPosRef.current[tableViewMode] = getScrollPos();
      else viewScrollPosRef.current['text'] = getScrollPos();

      const currentIdx = currentIndex;
      setSavedIndices(prev => ({
          ...prev,
          [mode]: currentIdx
      }));

      // PREPARE RESTORE SCROLL
      let saved = 0;
      if (targetMode === 'table') saved = viewScrollPosRef.current[tableViewMode];
      else saved = viewScrollPosRef.current['text'];
      
      // CRITICAL FIX: Set scrollTop STATE instantly to avoid virtual list flicker
      setScrollTop(saved);
      // Also set ref for physical scroll via useLayoutEffect
      pendingScrollRestoration.current = saved;
      isAutoScrolling.current = true;

      setMode(targetMode);
      const targetIndex = savedIndices[targetMode];
      setCurrentIndex(targetIndex);

      addLog("System", `Switched to ${targetMode}.`);
};
