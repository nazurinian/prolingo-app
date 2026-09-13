import { getMobilePlayerTopOffset } from '../../constants/layoutConstants.js';

export const executeMobileHeaderScroll = ({
  isMobile, isAutoScrolling, lastScrollY, mobileTab, setShowAppBar
}) => {
          if (!isMobile) return;

          const currentScrollY = window.scrollY;

          // If auto-follow is moving the viewport, header visibility must not
          // react to the synthetic scroll events.
          if (isAutoScrolling.current) {
              lastScrollY.current = currentScrollY;
              return;
          }

          if (mobileTab !== 'player') {
              setShowAppBar(true);
              lastScrollY.current = currentScrollY;
              return;
          }

          const diff = currentScrollY - lastScrollY.current;
          if (diff > 10 && currentScrollY > 50) {
              setShowAppBar(false);
          } else if (diff < -10 || currentScrollY < 50) {
              setShowAppBar(true);
          }

          lastScrollY.current = currentScrollY;
};

export const executePendingScrollRestoration = ({
  pendingScrollRestoration, isAutoScrolling, isMobile, listContainerRef
}) => {
      if (pendingScrollRestoration.current !== null) {
          const target = pendingScrollRestoration.current;
          isAutoScrolling.current = true;

          const restoreScroll = () => {
               if (isMobile) {
                  window.scrollTo({ top: target, behavior: 'auto' });
               } else if (listContainerRef.current) {
                  listContainerRef.current.scrollTop = target;
               }
          };

          restoreScroll();
          requestAnimationFrame(() => {
              restoreScroll();
          });

          pendingScrollRestoration.current = null;
          setTimeout(() => {
              isAutoScrolling.current = false;
          }, 150);
      }
};

const clearFollowRuntime = (followRuntimeRef) => {
  const runtime = followRuntimeRef?.current;
  if (!runtime) return;
  if (runtime.rafId !== null && runtime.rafId !== undefined) {
    cancelAnimationFrame(runtime.rafId);
    runtime.rafId = null;
  }
  if (runtime.startTimerId !== null && runtime.startTimerId !== undefined) {
    clearTimeout(runtime.startTimerId);
    runtime.startTimerId = null;
  }
  if (runtime.unlockTimerId !== null && runtime.unlockTimerId !== undefined) {
    clearTimeout(runtime.unlockTimerId);
    runtime.unlockTimerId = null;
  }
};

export const cancelActiveRowVisualFollow = ({ isAutoScrolling, followRuntimeRef, markResumePending = false } = {}) => {
  clearFollowRuntime(followRuntimeRef);
  if (followRuntimeRef?.current) {
    followRuntimeRef.current.resumePending = Boolean(markResumePending);
  }
  if (isAutoScrolling?.current !== undefined) isAutoScrolling.current = false;
};

const resolveTargetScroll = ({ idx, rowH, mode, isMobile }) => {
  if (!isMobile) return Math.max(0, idx * rowH);
  const targetIdx = mode === 'table' ? idx : Math.max(0, idx - 1);
  const containerPadding = getMobilePlayerTopOffset(mode);
  const masterToolbarHeight = mode === 'table'
      ? (document.querySelector('[data-master-toolbar-shell="true"]')?.getBoundingClientRect().height || 0)
      : 0;
  const activeRowOriginOffset = mode === 'table' ? -10 : 0;
  return Math.max(0, containerPadding + masterToolbarHeight + (targetIdx * rowH) + activeRowOriginOffset);
};

const beginSmoothUnlockWatch = ({ isMobile, isAutoScrolling, followRuntimeRef }) => {
  if (!isMobile || !followRuntimeRef?.current) return;
  const runtime = followRuntimeRef.current;
  let lastPos = window.scrollY;
  let samePosCount = 0;
  const startedAt = performance.now();

  const check = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      cancelActiveRowVisualFollow({ isAutoScrolling, followRuntimeRef, markResumePending: true });
      return;
    }
    const currentPos = window.scrollY;
    if (Math.abs(currentPos - lastPos) < 1) samePosCount += 1;
    else {
      samePosCount = 0;
      lastPos = currentPos;
    }

    // Never let a stale smooth-scroll watcher live indefinitely. This is also
    // important when Android suspends animation frames during screen lock.
    if (samePosCount > 3 || performance.now() - startedAt > 1800) {
      runtime.rafId = null;
      runtime.unlockTimerId = window.setTimeout(() => {
        isAutoScrolling.current = false;
        runtime.unlockTimerId = null;
      }, 120);
      return;
    }
    runtime.rafId = requestAnimationFrame(check);
  };

  runtime.startTimerId = window.setTimeout(() => {
    runtime.startTimerId = null;
    runtime.rafId = requestAnimationFrame(check);
  }, 50);
};

const scrollToResolvedIndex = ({
  idx, rowH, mode, behavior = 'smooth', isMobile, isAutoScrolling,
  isSidebarOpen, mobileTab, setShowAppBar, listContainerRef, followRuntimeRef,
  setScrollTop = null
}) => {
  cancelActiveRowVisualFollow({ isAutoScrolling, followRuntimeRef, markResumePending: false });
  isAutoScrolling.current = true;

  if (isMobile) {
    if (!isSidebarOpen && mobileTab === 'player') setShowAppBar(false);
    else setShowAppBar(true);
  }

  const target = resolveTargetScroll({ idx, rowH, mode, isMobile });
  if (isMobile) {
    window.scrollTo({ top: target, behavior });
  } else if (listContainerRef.current) {
    listContainerRef.current.scrollTo({ top: target, behavior });
  }
  setScrollTop?.(target);

  if (behavior === 'smooth') {
    if (isMobile) beginSmoothUnlockWatch({ isMobile, isAutoScrolling, followRuntimeRef });
    else {
      const runtime = followRuntimeRef?.current;
      if (runtime) {
        runtime.unlockTimerId = window.setTimeout(() => {
          isAutoScrolling.current = false;
          runtime.unlockTimerId = null;
        }, 450);
      } else {
        window.setTimeout(() => { isAutoScrolling.current = false; }, 450);
      }
    }
  } else {
    const runtime = followRuntimeRef?.current;
    const unlock = () => {
      isAutoScrolling.current = false;
      if (runtime) runtime.rafId = null;
    };
    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(unlock);
      if (runtime) runtime.rafId = id;
    } else {
      unlock();
    }
  }
  return target;
};

export const executeActiveRowAutoFollow = ({
  currentPlayerList, currentIndex, isPlaying, independentPlayingId, playingContext, mode,
  tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling,
  isSidebarOpen, mobileTab, setShowAppBar, listContainerRef, followRuntimeRef = null,
  behavior = 'smooth', setScrollTop = null
}) => {
              if (typeof document !== 'undefined' && document.hidden) {
                  if (followRuntimeRef?.current) followRuntimeRef.current.resumePending = true;
                  return { status: 'hidden' };
              }
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              const isBackgroundPlayback = (isPlaying || independentPlayingId) && (playingContext && playingContext !== (mode === 'table' ? tableViewMode : 'text'));
              const indexChanged = prevCurrentIndex.current !== currentIndex;
              const shouldScroll = justSwitchedTab.current || (indexChanged && !isBackgroundPlayback && isPlaying);

              if (activeItem && shouldScroll) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  scrollToResolvedIndex({
                    idx, rowH, mode, behavior, isMobile, isAutoScrolling, isSidebarOpen,
                    mobileTab, setShowAppBar, listContainerRef, followRuntimeRef, setScrollTop
                  });
                  justSwitchedTab.current = false;
                  prevCurrentIndex.current = currentIndex;
                  return { status: 'scrolled', idx };
              }
              if (!indexChanged) prevCurrentIndex.current = currentIndex;
              return { status: activeItem ? 'no-scroll' : 'unresolved' };
};

// R2: after a hidden/background interval, snap directly to the latest playback
// item. Do not animate through every row that advanced while the page was hidden.
export const executeForegroundPlaybackResync = ({
  currentPlayerList, playingIndex, isPlaying, independentPlayingId, playingContext,
  mode, tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile,
  isAutoScrolling, isSidebarOpen, mobileTab, setShowAppBar, listContainerRef,
  followRuntimeRef = null, setScrollTop = null
}) => {
  if (mode !== 'table') return { status: 'not-table' };
  if (!(isPlaying || independentPlayingId !== null)) return { status: 'not-playing' };
  if (playingContext !== tableViewMode) return { status: 'context-mismatch' };
  const activeItem = (currentPlayerList || []).find(item => item?.id === playingIndex);
  if (!activeItem) return { status: 'unresolved' };

  const idx = currentPlayerList.indexOf(activeItem);
  const rowH = rowHeights[mode];
  scrollToResolvedIndex({
    idx, rowH, mode, behavior: 'auto', isMobile, isAutoScrolling, isSidebarOpen,
    mobileTab, setShowAppBar, listContainerRef, followRuntimeRef, setScrollTop
  });
  prevCurrentIndex.current = playingIndex;
  justSwitchedTab.current = false;
  if (followRuntimeRef?.current) followRuntimeRef.current.resumePending = false;
  return { status: 'resynced', idx, playingIndex };
};
