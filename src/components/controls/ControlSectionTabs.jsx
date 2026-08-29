import React from 'react';
import { Volume2, BookOpen, Database, Settings } from 'lucide-react';
import { V5116_CONTROL_SECTIONS } from '../../constants/playbackConstants';

export const ControlSectionTabs = ({ sidebarSection, setSidebarSection, compact = false }) => {
  const iconFor = (key) => {
    if (key === 'player') return <Volume2 className="w-3.5 h-3.5"/>;
    if (key === 'learn') return <BookOpen className="w-3.5 h-3.5"/>;
    if (key === 'data') return <Database className="w-3.5 h-3.5"/>;
    return <Settings className="w-3.5 h-3.5"/>;
  };

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 ${compact ? 'p-1.5' : 'p-2'}`}>
      <div className="grid grid-cols-4 gap-1">
        {V5116_CONTROL_SECTIONS.map(section => {
          const active = sidebarSection === section.key;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setSidebarSection(section.key)}
              className={`min-w-0 rounded-lg border transition-all duration-150 flex flex-col items-center justify-center gap-1 ${compact ? 'px-1 py-2' : 'px-1.5 py-2'} ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
              title={`${section.label} controls`}
            >
              {iconFor(section.key)}
              <span className="text-[8px] font-black tracking-wide truncate w-full text-center">{section.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ControlSectionTabs;
