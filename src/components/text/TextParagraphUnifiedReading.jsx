import React, { useMemo } from 'react';
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
      const classes = splitMode
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
  speakingPart = null,
  focusSegmentId = null,
  audioCoverageMap = {},
  playableSegmentIds = null,
  disabled = false,
  onPlaySegment
}) => {
  const activeSegment = useMemo(
    () => segments.find(segment => segment.id === activeSegmentId) || null,
    [segments, activeSegmentId]
  );
  const display = resolveStructuredTextDisplayState({ displayMode, isActive: Boolean(isPlaybackActive && activeSegment) });
  const activeMeaningOnly = displayMode === TEXT_STRUCTURED_DISPLAY_MODES.TEXT_ACTIVE_MEANING;
  const meaningSegments = activeMeaningOnly
    ? (activeSegment?.meaning ? [activeSegment] : [])
    : segments;
  const indexById = useMemo(() => new Map(segments.map((segment, index) => [segment.id, index])), [segments]);

  return (
    <div className="space-y-3" data-text-paragraph-unified="true" data-text-paragraph-split-mode={splitMode ? 'true' : 'false'}>
      {display.showText && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 p-3" data-text-paragraph-channel="text">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">Text</p>
        </div>
        <SentenceFlow
          channel="text"
          segments={segments}
          splitMode={splitMode}
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

      {display.showMeaning && <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/55 p-3" data-text-paragraph-channel="meaning">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">Meaning</p>
          {activeMeaningOnly && activeSegment && <p className="text-[7px] font-bold text-emerald-600 dark:text-emerald-300">Active sentence only</p>}
        </div>
        {meaningSegments.length > 0
          ? <SentenceFlow
              channel="meaning"
              segments={meaningSegments}
              splitMode={splitMode}
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
