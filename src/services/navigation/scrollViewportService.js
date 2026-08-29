export const executeMobileHeaderScroll = ({
  isMobile, isAutoScrolling, lastScrollY, mobileTab, setShowAppBar
}) => {
          if (!isMobile) return; 
          
          const currentScrollY = window.scrollY;

          // FIX: If we are in the middle of an auto-scroll, IGNORE scroll events to prevent glitch
          // This is SPECIFIC to the HEADER VISIBILITY LOGIC
          if (isAutoScrolling.current) {
              lastScrollY.current = currentScrollY; // FIX: Keep updating so we don't have a jump
              return;
          }

          // FIX 2: If we are NOT in player tab (e.g. tools/logs), ALWAYS show header
          if (mobileTab !== 'player') {
              setShowAppBar(true);
              lastScrollY.current = currentScrollY; // Keep updating for smooth return
              return;
          }
          
          const diff = currentScrollY - lastScrollY.current;

          // Logic Lebih Strict:
          // Hide jika scroll ke bawah dan bukan di paling atas
          if (diff > 10 && currentScrollY > 50) {
              setShowAppBar(false);
          } 
          // Show HANYA jika scroll ke atas signifikan ATAU di paling atas
          else if (diff < -10 || currentScrollY < 50) {
              setShowAppBar(true);
          }
          // Jika diff kecil (diam/jitter), jangan ubah status header
          
          lastScrollY.current = currentScrollY;
};

export const executePendingScrollRestoration = ({
  pendingScrollRestoration, isAutoScrolling, isMobile, listContainerRef
}) => {
      // If we have a pending scroll restoration from handleTabSwitch
      if (pendingScrollRestoration.current !== null) {
          const target = pendingScrollRestoration.current;
          
          // 1. Force isAutoScrolling to true (blocks header hiding)
          isAutoScrolling.current = true;
          
          // 2. Perform the DOM Scroll
          const restoreScroll = () => {
               if (isMobile) {
                  window.scrollTo({ top: target, behavior: 'auto' });
               } else if (listContainerRef.current) {
                  listContainerRef.current.scrollTop = target;
               }
          };

          restoreScroll();

          // FIX: Force a double check for "white screen" issues on mode switch
          // Sometimes Virtual List needs a second tick to realize heights changed
          requestAnimationFrame(() => {
              restoreScroll();
          });
          
          // 3. Clear the pending ref
          pendingScrollRestoration.current = null;
          
          // 4. Reset lock after a short delay (once scroll event storm settles)
          setTimeout(() => {
              isAutoScrolling.current = false;
          }, 150);
      }
};

export const executeActiveRowAutoFollow = ({
  currentPlayerList, currentIndex, isPlaying, independentPlayingId, playingContext, mode,
  tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling,
  isSidebarOpen, mobileTab, setShowAppBar, listContainerRef
}) => {
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              const isBackgroundPlayback = (isPlaying || independentPlayingId) && (playingContext && playingContext !== (mode === 'table' ? tableViewMode : 'text'));
              const indexChanged = prevCurrentIndex.current !== currentIndex;
              
              const shouldScroll = justSwitchedTab.current || (indexChanged && !isBackgroundPlayback && isPlaying);

              if (activeItem && shouldScroll) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  
                  if (isMobile) {
                      isAutoScrolling.current = true;
                      
                      if (!isSidebarOpen && mobileTab === 'player') {
                          setShowAppBar(false); 
                      } else {
                          setShowAppBar(true); 
                      }
                      
                      const targetIdx = Math.max(0, idx - 1);
                      const containerPadding = mode === 'table' ? 160 : 120;
                      const targetScrollY = containerPadding + (targetIdx * rowH);
                      
                      window.scrollTo({
                          top: targetScrollY,
                          behavior: 'smooth'
                      });

                      let lastPos = window.scrollY;
                      let samePosCount = 0;

                      const checkScrollComplete = () => {
                          const currentPos = window.scrollY;
                          if (Math.abs(currentPos - lastPos) < 1) {
                              samePosCount++;
                              if (samePosCount > 3) {
                                  setTimeout(() => {
                                      isAutoScrolling.current = false; 
                                  }, 500);
                                  return; 
                              }
                          } else {
                              samePosCount = 0;
                              lastPos = currentPos;
                          }
                          requestAnimationFrame(checkScrollComplete);
                      };
                      setTimeout(() => requestAnimationFrame(checkScrollComplete), 50);

                  } else {
                      const targetTop = idx * rowH;
                      if (listContainerRef.current) {
                          listContainerRef.current.scrollTo({
                              top: targetTop,
                              behavior: 'smooth'
                          });
                      }
                  }
                  
                  justSwitchedTab.current = false;
                  prevCurrentIndex.current = currentIndex; 
              } else if (!indexChanged) {
                  prevCurrentIndex.current = currentIndex;
              }
};
