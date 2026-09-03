import React from 'react';

const SidebarShell = ({ isMobile, isSidebarOpen, children }) => {
  // Mobile navigation is owned by the Header tabs + Bottom Player Tools shortcut.
  // Keeping a second drawer with the same controls duplicated navigation and
  // consumed scarce viewport space, so the sidebar is desktop-only.
  if (isMobile) return null;

  return (
    <div className={`border-r border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 overflow-hidden relative h-full z-40 transition-[width,border-color,box-shadow] duration-300 ease-out ${isSidebarOpen ? 'w-72 shadow-lg' : 'w-0 border-r-0 shadow-none'}`}>
      {children}
    </div>
  );
};

export default SidebarShell;
