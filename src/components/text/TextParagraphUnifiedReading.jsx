import React, { useMemo } from 'react';
import { Play } from 'lucide-react';
import {
  TEXT_STRUCTURED_DISPLAY_MODES,
  resolveStructuredTextDisplayState
} from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../domain/text/textStructuredAudioRuntimeDomain.js';
import { TEXT_AUDIO_COVERAGE_STATUS } from '../../domain/text/textStructuredAudioCoverageDomain.js';

const coverageLabel = status => ({
  [TEXT_AUDIO_COVERAGE_STATUS.READY]: 'READY',
  [TEXT_AUDIO_COVERAGE_STATUS.STALE]: 'STALE',
  [TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE]: 'OTHER',
  [TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED]: 'HISTORY',
  [TEXT_AUDIO_COVERAGE_STATUS.MISSING]: 'MISSING'
}[status] || 'MISSING');

const normalize = value => String(value || '').trim();

const sentenceTitle = ({ segment, index, audioCoverageMap }) => {
  const textCoverage = segment?.text
    ? audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, 'text')]
    : null;
  const meaningCoverage = segment?.meaning
    ? audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, 'meaning')]
    : null;
  const parts = [`Sentence ${index + 1}`];
  if (segment?.text) parts.push(`EN ${coverageLabel(textCoverage?.status)}`);
  if (segment?.meaning) parts.push(`ID ${coverageLabel(meaningCoverage?.status)}`);
  return parts.join(' • ');
};

const SentenceFlow = ({
  channel,
  segments,
  splitMode,
  fullChannelHighlighted = false,
  activeSegmentId,
  activeChannel,
  focusSegmentId,
  audioCoverageMap,
  playableSegmentIds,
  indexById,
  disabled = false,
  onPlaySegment
}) => (
  <div
    className="text-sm leading-8 text-slate-800 dark:text-slate-100"
    style={{ textAlign: 'justify', textAlignLast: 'left', textJustify: 'inter-word' }}
    data-text-paragraph-flow={channel}
    data-text-full-text-highlight={fullChannelHighlighted ? 'true' : undefined}
  >
    {segments.map((segment, index) => {
      const content = normalize(channel === 'meaning' ? segment.meaning : segment.text);
      if (!content) return null;
      const logicalIndex = indexById?.get ? (indexById.get(segment.id) ?? index) : index;
      const active = segment.id === activeSegmentId;
      const speaking = active && activeChannel === channel;
      const focused = segment.id === focusSegmentId;
      const playable = playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : true;
      const sentenceDisabled = disabled || !playable;
      const sharedDataProps = {
        'data-text-player-segment': segment.id,
        'data-text-player-segment-active': active ? 'true' : undefined,
        'data-text-search-focus-segment': focused ? 'true' : undefined,
        'data-text-paragraph-sentence': segment.id,
        'data-text-paragraph-sentence-index': logicalIndex + 1,
        'data-text-paragraph-sentence-channel': channel
      };
      const classes = fullChannelHighlighted
        ? `inline align-baseline transition-colors rounded-sm ${splitMode && !sentenceDisabled ? 'cursor-pointer' : ''} ${channel === 'meaning' ? 'bg-emerald-200/80 dark:bg-emerald-800/65' : 'bg-indigo-200/80 dark:bg-indigo-800/65'}`
        : splitMode
          ? `inline align-baseline transition-colors duration-150 focus:outline-none ${sentenceDisabled ? 'cursor-default' : 'cursor-pointer'} ${speaking ? 'bg-indigo-200 dark:bg-indigo-800/70' : ''}`
          : `inline transition-colors ${focused ? 'bg-amber-100 dark:bg-amber-950/40' : ''}`;

      if (splitMode) {
        const activateSentence = event => {
          if (sentenceDisabled) return;
          if (event?.type === 'keydown') {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
          }
          onPlaySegment?.(segment.id);
        };
        return <React.Fragment key={`${channel}-${segment.id}`}>
          <span
            {...sharedDataProps}
            role="button"
            tabIndex={sentenceDisabled ? -1 : 0}
            aria-disabled={sentenceDisabled ? 'true' : undefined}
            onClick={activateSentence}
            onKeyDown={activateSentence}
            className={classes}
            style={{
              font: 'inherit',
              lineHeight: 'inherit',
              color: 'inherit',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone'
            }}
            title={`${sentenceTitle({ segment, index: logicalIndex, audioCoverageMap })}${sentenceDisabled ? ' • Not playable with current Manual Segment settings' : ' • Click to play only this sentence'}`}
            aria-label={`Play sentence ${logicalIndex + 1} only`}
          >{content}</span>{' '}
        </React.Fragment>;
      }

      return <React.Fragment key={`${channel}-${segment.id}`}>
        <span {...sharedDataProps} className={classes}>{content}</span>{' '}
      </React.Fragment>;
    })}
  </div>
);

export const TextParagraphUnifiedReading = ({
  segments = [],
  splitMode = false,
  displayMode,
  activeSegmentId = null,
  isPlaybackActive = false,
  fullCardActive = false,
  speakingPart = null,
  focusSegmentId = null,
  audioCoverageMap = {},
  playableSegmentIds = null,
  disabled = false,
  onPlaySegment,
  onPlayChannel
}) => {
  const activeSegment = useMemo(
    () => segments.find(segment => segment.id === activeSegmentId) || null,
    [segments, activeSegmentId]
  );
  const display = resolveStructuredTextDisplayState({ displayMode, isActive: Boolean(isPlaybackActive && (activeSegment || fullCardActive)) });
  const activeMeaningOnly = displayMode === TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING;
  const meaningSegments = activeMeaningOnly && !fullCardActive
    ? (activeSegment?.meaning ? [activeSegment] : [])
    : segments;
  const indexById = useMemo(() => new Map(segments.map((segment, index) => [segment.id, index])), [segments]);

  return (
    <div className="space-y-3" data-text-paragraph-unified="true" data-text-paragraph-split-mode={splitMode ? 'true' : 'false'}>
      {display.showText && <div className={`rounded-xl border p-3 transition-colors ${fullCardActive && speakingPart === 'text' ? 'border-indigo-400 bg-indigo-100/65 ring-1 ring-indigo-200 dark:border-indigo-600 dark:bg-indigo-900/30 dark:ring-indigo-800' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/30'}`} data-text-paragraph-channel="text" data-text-full-active={fullCardActive && speakingPart === 'text' ? 'true' : undefined}>
        <div className="mb-1.5 flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">TEXT</p>
          <button type="button" disabled={disabled || !segments.some(item => normalize(item.text))} onClick={() => onPlayChannel?.('text')} className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-indigo-100 bg-indigo-50/70 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/25 dark:text-indigo-300 disabled:opacity-40 transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-950/50" title="Play English only (entire card, one-time override)" aria-label="Play Text EN only" data-text-paragraph-play-channel="text"><Play className="h-3.5 w-3.5 fill-current"/></button>
        </div>
        <SentenceFlow
          channel="text"
          segments={segments}
          splitMode={splitMode}
          fullChannelHighlighted={fullCardActive && speakingPart === 'text'}
          activeSegmentId={activeSegmentId}
          activeChannel={speakingPart}
          focusSegmentId={focusSegmentId}
          audioCoverageMap={audioCoverageMap}
          playableSegmentIds={playableSegmentIds}
          indexById={indexById}
          disabled={disabled}
          onPlaySegment={onPlaySegment}
        />
      </div>}

      {display.showMeaning && <div className={`rounded-xl border p-3 transition-colors ${fullCardActive && speakingPart === 'meaning' ? 'border-emerald-400 bg-emerald-100/65 ring-1 ring-emerald-200 dark:border-emerald-600 dark:bg-emerald-900/30 dark:ring-emerald-800' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/55'}`} data-text-paragraph-channel="meaning" data-text-full-active={fullCardActive && speakingPart === 'meaning' ? 'true' : undefined}>
        <div className="mb-1.5 flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">MEANING</p>
          <button type="button" disabled={disabled || !segments.some(item => normalize(item.meaning))} onClick={() => onPlayChannel?.('meaning')} className="h-9 w-9 sm:h-8 sm:w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-300 disabled:opacity-40 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-950/50" title="Play Indonesian only (entire card, one-time override)" aria-label="Play Meaning ID only" data-text-paragraph-play-channel="meaning"><Play className="h-3.5 w-3.5 fill-current"/></button>
          {activeMeaningOnly && activeSegment && <p className="ml-auto text-[9px] font-semibold text-emerald-600 dark:text-emerald-300">Active sentence only</p>}
        </div>
        {meaningSegments.length > 0
          ? <SentenceFlow
              channel="meaning"
              segments={meaningSegments}
              splitMode={splitMode}
              fullChannelHighlighted={fullCardActive && speakingPart === 'meaning'}
              activeSegmentId={activeSegmentId}
              activeChannel={speakingPart}
              focusSegmentId={focusSegmentId}
              audioCoverageMap={audioCoverageMap}
              playableSegmentIds={playableSegmentIds}
              indexById={indexById}
              disabled={disabled}
              onPlaySegment={onPlaySegment}
            />
          : <p className="text-xs italic text-slate-400">No Meaning</p>}
      </div>}
    </div>
  );
};

export default TextParagraphUnifiedReading;
