import React from 'react';

/**
 * Reusable inline Segment target. `interactive` is a capability, not an audio or
 * presentation mode. Activation forwards only the persistent Segment ID; the
 * host retains manual-play channel/repeat preferences and playback ownership.
 */
export const TextSegmentInteraction = ({
  segmentId, channel, children, interactive = false, disabled = false,
  active = false, speaking = false, focused = false, fullChannelHighlighted = false,
  title, accessibleLabel, className = '', dataAttributes = {}, onActivate
}) => {
  const baseClasses = fullChannelHighlighted
    ? `inline align-baseline transition-colors rounded-sm ${interactive ? 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' : ''}${interactive && !disabled ? 'cursor-pointer' : ''} ${channel === 'meaning' ? 'bg-emerald-200/80 dark:bg-emerald-800/70 text-emerald-950 dark:text-emerald-50' : 'bg-indigo-200/80 dark:bg-indigo-800/70 text-indigo-950 dark:text-indigo-50'}`
    : interactive
      ? `inline align-baseline transition-colors duration-150 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60'} ${speaking ? (channel === 'meaning' ? 'bg-emerald-200/90 dark:bg-emerald-800/75 text-emerald-950 dark:text-emerald-50 font-semibold ring-1 ring-emerald-400/50' : 'bg-indigo-200/90 dark:bg-indigo-800/75 text-indigo-950 dark:text-indigo-50 font-semibold ring-1 ring-indigo-400/50') : active ? 'bg-slate-200/60 dark:bg-slate-800/50 underline decoration-indigo-400/60 decoration-2 underline-offset-4' : focused ? 'bg-amber-100/90 dark:bg-amber-950/45 ring-1 ring-amber-300/70 dark:ring-amber-700/60' : ''}`
      : `inline transition-colors ${focused ? 'bg-amber-100 dark:bg-amber-950/40' : ''}`;
  const classes = className ? `${baseClasses} ${className}` : baseClasses;
  const activate = event => {
    if (disabled) return;
    if (event.type === 'keydown') {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
    }
    onActivate?.(segmentId);
  };
  return <span
    {...dataAttributes}
    data-text-player-segment={segmentId}
    data-text-player-segment-active={active ? 'true' : undefined}
    data-text-search-focus-segment={focused ? 'true' : undefined}
    {...(interactive ? {
      role: 'button', tabIndex: disabled ? -1 : 0, 'aria-disabled': disabled ? 'true' : undefined,
      onClick: activate, onKeyDown: activate, title, 'aria-label': accessibleLabel,
      style: { font: 'inherit', lineHeight: 'inherit', color: 'inherit', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }
    } : {})}
    className={classes}
  >{children}</span>;
};

export default TextSegmentInteraction;
