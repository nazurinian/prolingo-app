import React from 'react';
import { Sun, Laptop, Moon } from 'lucide-react';

const SidebarTopControls = ({
  theme,
  setTheme,
  isSystemBusy,
  mode,
  handleModeSwitch,
  sidebarSection,
  renderControlSectionTabs
}) => (
  <>
    {/* THEME SELECTOR IN SIDEBAR */}
    <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600">
        <span className="text-[10px] font-bold text-slate-400 uppercase">Theme</span>
        <div className="flex gap-1">
            <button onClick={() => setTheme('light')} className={`p-1.5 rounded transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Light Mode"><Sun className="w-3.5 h-3.5" /></button>
            <button onClick={() => setTheme('system')} className={`p-1.5 rounded transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="System Mode"><Laptop className="w-3.5 h-3.5" /></button>
            <button onClick={() => setTheme('dark')} className={`p-1.5 rounded transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Dark Mode"><Moon className="w-3.5 h-3.5" /></button>
        </div>
    </div>

    <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
      <button disabled={isSystemBusy} onClick={() => handleModeSwitch('table')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'table' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Table</button>
      <button disabled={isSystemBusy} onClick={() => handleModeSwitch('text')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'text' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Text</button>
    </div>

    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Control Center</p>
          <p className="text-[8px] text-slate-400">Extensible shell for Player / Learn / Data / System.</p>
        </div>
        <span className="text-[8px] font-black px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{sidebarSection.toUpperCase()}</span>
      </div>
      {renderControlSectionTabs(true)}
    </div>
  </>
);

export default SidebarTopControls;
