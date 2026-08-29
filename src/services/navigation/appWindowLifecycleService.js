import { executeActiveRowAutoFollow, executeMobileHeaderScroll } from './scrollViewportService';
import { DEFAULT_ROW_HEIGHT_MOBILE, DEFAULT_ROW_HEIGHT_PC } from '../../constants/datasetConstants';

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
      
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
};

export const executeResponsiveViewportLifecycleEffect = ({ isMobile, listContainerRef, setIsMobile, setIsSidebarOpen, setContainerHeight, setRowHeights, setActiveMenuId }) => {
      const handleResize = () => {
          const width = window.innerWidth;
          const mobile = width < 768;
          setIsMobile(mobile);
          setIsSidebarOpen(!mobile);

          if (!mobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
          
          if (mobile) {
              setRowHeights({ table: DEFAULT_ROW_HEIGHT_MOBILE, text: 100 });
              setContainerHeight(window.innerHeight); 
          } else {
              setRowHeights({ table: DEFAULT_ROW_HEIGHT_PC, text: 70 });
          }
      };
      
      handleResize();
      window.addEventListener('resize', handleResize);
      setTimeout(() => {
          if (!isMobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
      }, 500);

      const handleGlobalClick = () => setActiveMenuId(null);
      window.addEventListener('click', handleGlobalClick);

      return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('click', handleGlobalClick);
      };
};

export const executeActiveRowAutoFollowEffect = ({ currentIndex, currentPlayerList, isPlaying, independentPlayingId, playingContext, mode, tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling, isSidebarOpen, mobileTab, setShowAppBar, listContainerRef }) => {
      if (currentIndex !== null) {
          const scrollAction = () => executeActiveRowAutoFollow({
              currentPlayerList, currentIndex, isPlaying, independentPlayingId, playingContext, mode,
              tableViewMode, prevCurrentIndex, justSwitchedTab, rowHeights, isMobile, isAutoScrolling,
              isSidebarOpen, mobileTab, setShowAppBar, listContainerRef
          });

          const timer = setTimeout(scrollAction, 100);
          return () => clearTimeout(timer);
      }
};

export const executeMobileWindowScrollEffect = ({ isMobile, setScrollTop, setContainerHeight }) => {
      const handleWindowScroll = () => {
          if (isMobile) {
              setScrollTop(window.scrollY);
              setContainerHeight(window.innerHeight); 
          }
      };

      if (isMobile) {
          window.addEventListener('scroll', handleWindowScroll);
          handleWindowScroll(); 
      } else {
          window.removeEventListener('scroll', handleWindowScroll);
      }

      return () => window.removeEventListener('scroll', handleWindowScroll);
};

export const executeLogAutoScrollEffect = ({ logContainerRef }) => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
};

