import React, { useContext } from 'react';
import { SHARED_SEMANTIC_COLORS } from './sharedDesignTokens.js';
import { BookReaderInteractionContext } from './BookReaderInteractionContext.js';

/**
 * Reusable inline Segment target. `interactive` is a capability, not an audio or
 * presentation mode. Activation forwards only the persistent Segment ID; the
 * host retains manual-play channel/repeat preferences and playback ownership.
 */
export const TextSegmentInteraction = ({
  segmentId, channel, children, interactive = false, disabled = false,
  active = false, speaking = false, paused = false, focused = false, fullChannelHighlighted = false,
  title, accessibleLabel, className = '', dataAttributes = {}, onActivate
}) => {
  const book = useContext(BookReaderInteractionContext);
  const selected = book?.pending?.segmentId === segmentId && book.pending.channel === channel;
  const bookLabel = book?.tap === false ? `Select ${channel === 'meaning' ? 'ID' : 'EN'} sentence` : accessibleLabel;
  const fullHighlightTone = paused
    ? SHARED_SEMANTIC_COLORS.paused.segmentFull
    : channel === 'meaning'
      ? SHARED_SEMANTIC_COLORS.id.segmentFull
      : SHARED_SEMANTIC_COLORS.en.segmentFull;
  const speakingTone = channel === 'meaning'
    ? SHARED_SEMANTIC_COLORS.id.segmentSpeaking
    : SHARED_SEMANTIC_COLORS.en.segmentSpeaking;
  const baseClasses = fullChannelHighlighted
    ? `inline align-baseline transition-colors rounded-sm ${interactive ? 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' : ''}${interactive && !disabled ? 'cursor-pointer' : ''} ${fullHighlightTone}`
    : interactive
      ? `inline align-baseline transition-colors duration-150 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800/60'} ${speaking ? speakingTone : active ? 'bg-slate-200/60 dark:bg-slate-800/50 underline decoration-slate-400/70 decoration-2 underline-offset-4' : focused ? 'bg-amber-100/90 dark:bg-amber-950/45 ring-1 ring-amber-300/70 dark:ring-amber-700/60' : ''}`
      : `inline transition-colors ${focused ? 'bg-amber-100 dark:bg-amber-950/40' : ''}`;
  const classes = className ? `${baseClasses} ${className}` : baseClasses;
  const activate = event => {
    if (disabled) return;
    if (event.type === 'keydown') {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
    }
    if (book) book.activate(segmentId, channel);
    else onActivate?.(segmentId);
  };
  return <span
    {...dataAttributes}
    data-book-selected-channel={selected ? channel : undefined}
    aria-pressed={book && interactive ? Boolean(selected) : undefined}
    data-text-player-segment={segmentId}
    data-text-player-segment-active={active ? 'true' : undefined}
    data-text-search-focus-segment={focused ? 'true' : undefined}
    {...(interactive ? {
      role: 'button', tabIndex: disabled ? -1 : 0, 'aria-disabled': disabled ? 'true' : undefined,
      onClick: activate, onKeyDown: activate, title, 'aria-label': bookLabel,
      style: { font: 'inherit', lineHeight: 'inherit', color: 'inherit', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }
    } : {})}
    className={selected ? classes + ' ring-1 ring-indigo-400' : classes}
  >{children}</span>;
};

export default TextSegmentInteraction;
