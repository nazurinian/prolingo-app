import { cancelActiveRowVisualFollow, executeActiveRowAutoFollow, executeForegroundPlaybackResync, executeMobileHeaderScroll } from './scrollViewportService.js';
import { DEFAULT_ROW_HEIGHT_MOBILE, DEFAULT_ROW_HEIGHT_PC } from '../../constants/datasetConstants.js';

export const executeBodyScrollLockEffect = ({ isMobile, isSidebarOpen }) => {
      if (isMobile && isSidebarOpen) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => { document.body.style.overflow = ''; };
};

export const executeSidebarHeaderVisibilityEffect = ({ isMobile, isSidebarOpen, isPlaying, mobileTab, setShowAppBar }) => {
      if (isMobile) {
          if (isSidebarOpen) {
              setShowAppBar(true);
          } else if (isPlaying) {
              // FIX: When closing sidebar while playing, hide header to restore focus
              // ONLY if we are in player tab
              if(mobileTab === 'player') setShowAppBar(false);
          }
      }
};

export const executeUnsavedCsvBeforeUnloadEffect = ({ isCsvDirty }) => {
      if (!isCsvDirty) return undefined;
      const handleBeforeUnload = (event) => {
          event.preventDefault();
          event.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
};

export const executeBodyThemeBackgroundEffect = ({ theme }) => {
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      // Colors match bg-slate-50 and bg-slate-900
      document.body.style.backgroundColor = isDark ? '#0f172a' : '#f8fafc';
};

export const executeMobileHeaderScrollListenerEffect = ({ isMobile, isAutoScrolling, lastScrollY, mobileTab, setShowAppBar }) => {
      const handleScroll = () => executeMobileHeaderScroll({
          isMobile, isAutoScrolling, lastScrollY, mobileTab, setShowAppBar
      });
      
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
};

export const executeResponsiveViewportLifecycleEffect = ({ isMobile, listContainerRef, setIsMobile, setIsSidebarOpen, setContainerHeight, setRowHeights, setActiveMenuId }) => {
      let lastMobile = null;
      let resizeFrame = null;

      const applyViewport = () => {
          resizeFrame = null;
          const width = window.innerWidth;
          const mobile = width < 768;
          const breakpointChanged = lastMobile === null || mobile !== lastMobile;

          // Mobile browser chrome can change viewport HEIGHT repeatedly while scrolling.
          // Do not recreate sidebar/row-height state for those height-only resize events.
          if (breakpointChanged) {
              setIsMobile(mobile);
              setIsSidebarOpen(!mobile);
              setRowHeights(mobile
                  ? { table: DEFAULT_ROW_HEIGHT_MOBILE, text: 100 }
                  : { table: DEFAULT_ROW_HEIGHT_PC, text: 70 });
              lastMobile = mobile;
          }

          if (mobile) {
              setContainerHeight(Math.round(window.visualViewport?.height || window.innerHeight));
          } else if (listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
      };

      const handleResize = () => {
          if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(applyViewport);
      };
      
      applyViewport();
      window.addEventListener('resize', handleResize, { passive: true });
      window.visualViewport?.addEventListener('resize', handleResize, { passive: true });
      const settleTimer = setTimeout(() => {
          if (!isMobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
      }, 500);

      const handleGlobalClick = () => setActiveMenuId(null);
      window.addEventListener('click', handleGlobalClick);

      return () => {
          clearTimeout(settleTimer);
          if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
          window.removeEventListener('resize', handleResize);
          window.visualViewport?.removeEventListener('resize', handleResize);
          window.removeEventListener('click', handleGlobalClick);
      };
};

export const executeActiveRowAutoFollowEffect = ({ currentIndex, currentPlayerList, isPlaying, independentPlayingId, playingContext, mode, tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling, isSidebarOpen, mobileTab, setShowAppBar, listContainerRef, followRuntimeRef = null, setScrollTop = null }) => {
      if (currentIndex === null) return undefined;
      if (typeof document !== 'undefined' && document.hidden) {
          if (followRuntimeRef?.current) followRuntimeRef.current.resumePending = true;
          return undefined;
      }
      const scrollAction = () => executeActiveRowAutoFollow({
          currentPlayerList, currentIndex, isPlaying, independentPlayingId, playingContext, mode,
          tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling,
          isSidebarOpen, mobileTab, setShowAppBar, listContainerRef, followRuntimeRef, setScrollTop, behavior: 'smooth'
      });

      const timer = setTimeout(scrollAction, 100);
      return () => clearTimeout(timer);
};

export const executeForegroundPlaybackVisibilityEffect = ({
  currentPlayerList, playingIndex, isPlaying, independentPlayingId, playingContext, mode, tableViewMode,
  prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling, isSidebarOpen, mobileTab,
  setShowAppBar, listContainerRef, followRuntimeRef, setScrollTop
}) => {
      if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;

      const handleHidden = () => {
          if (followRuntimeRef?.current) {
              followRuntimeRef.current.hidden = true;
              followRuntimeRef.current.resumePending = true;
          }
          cancelActiveRowVisualFollow({ isAutoScrolling, followRuntimeRef, markResumePending: true });
      };

      const handleVisible = () => {
          if (document.hidden) return;
          const runtime = followRuntimeRef?.current;
          const shouldResync = Boolean(runtime?.hidden || runtime?.resumePending);
          if (runtime) runtime.hidden = false;
          if (!shouldResync) return;
          executeForegroundPlaybackResync({
              currentPlayerList, playingIndex, isPlaying, independentPlayingId, playingContext, mode, tableViewMode,
              prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling, isSidebarOpen, mobileTab,
              setShowAppBar, listContainerRef, followRuntimeRef, setScrollTop
          });
      };

      const handleVisibility = () => {
          if (document.hidden) handleHidden();
          else handleVisible();
      };
      const handlePageShow = () => handleVisible();

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('pageshow', handlePageShow);
      return () => {
          document.removeEventListener('visibilitychange', handleVisibility);
          window.removeEventListener('pageshow', handlePageShow);
      };
};

export const executeMobileWindowScrollEffect = ({ isMobile, setScrollTop, setContainerHeight }) => {
      let frameId = null;
      const applyWindowScroll = () => {
          frameId = null;
          setScrollTop(window.scrollY);
          setContainerHeight(Math.round(window.visualViewport?.height || window.innerHeight));
      };
      const handleWindowScroll = () => {
          if (!isMobile || frameId !== null) return;
          frameId = requestAnimationFrame(applyWindowScroll);
      };

      if (isMobile) {
          window.addEventListener('scroll', handleWindowScroll, { passive: true });
          applyWindowScroll();
      }

      return () => {
          window.removeEventListener('scroll', handleWindowScroll);
          if (frameId !== null) cancelAnimationFrame(frameId);
      };
};

export const executeLogAutoScrollEffect = ({ logContainerRef }) => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
};

