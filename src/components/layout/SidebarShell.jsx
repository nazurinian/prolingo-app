import React from 'react';

const SidebarShell = ({
  isMobile,
  isSidebarOpen,
  setIsSidebarOpen,
  mode,
  mobileTab,
  children
}) => (
  <>
    {/* --- BACKDROP FOR MOBILE SIDEBAR --- */}
    {isMobile && isSidebarOpen && (
      <div 
        className="fixed inset-0 bg-black/50 z-[40] backdrop-blur-sm"
        onClick={() => setIsSidebarOpen(false)}
      />
    )}

    {/* --- SIDEBAR --- */}
    <div className={`
         border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-lg transition-transform duration-300 ease-in-out bg-white dark:bg-slate-800 overflow-hidden
         ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
         ${isMobile 
            ? `fixed inset-y-0 left-0 w-72 z-[45] pb-20 ${mode === 'table' && mobileTab === 'player' ? 'pt-[160px]' : 'pt-[112px]'}` 
            : 'relative w-72 h-full z-40'}
         ${!isSidebarOpen && !isMobile ? 'md:w-0 md:border-none' : ''}
    `}>
      {children}
    </div>
  </>
);

export default SidebarShell;
