import React from 'react';

const StatCard = ({ label, value, suffix = '' }) => (
  <div className="inline-flex items-baseline gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-1.5 py-1 md:block md:rounded-lg md:px-2 md:py-1.5 md:text-center">
    <div className="text-[8px] md:text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
    <div className="text-[11px] md:mt-0.5 md:text-sm font-black tabular-nums text-slate-700 dark:text-slate-200">{value}{suffix}</div>
  </div>
);

export const ProgressStatisticsSummary = ({ stats }) => {
  if (!stats) return null;

  return (
    <div aria-label="Mastery progress statistics" className="space-y-1">
      <div className="flex flex-wrap gap-1 md:grid md:grid-cols-7 md:gap-1.5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="New" value={stats.new} />
        <StatCard label="Learning" value={stats.learning} />
        <StatCard label="Familiar" value={stats.familiar} />
        <StatCard label="Mastered" value={stats.mastered} />
        <StatCard label="Started" value={stats.startedPercentage} suffix="%" />
        <StatCard label="Mastery" value={stats.masteredPercentage} suffix="%" />
      </div>
      {stats.untrackable > 0 && (
        <div className="text-[9px] text-slate-400 dark:text-slate-500">
          {stats.untrackable} structured row{stats.untrackable === 1 ? '' : 's'} without VOCAB_ID excluded from mastery statistics.
        </div>
      )}
    </div>
  );
};

export default ProgressStatisticsSummary;
