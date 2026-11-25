import React, { useContext, useMemo } from 'react';
import { Languages, Radio, X } from 'lucide-react';
import './sharedReaderTypography.css';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  normalizeTextCardPresentationState,
  resolveEffectiveBilingualPresentation
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import TextSegmentInteraction from './TextSegmentInteraction.jsx';
import SharedNotebookUnitsBody from './SharedNotebookUnitsBody.jsx';
import { SharedUnitPlaybackContext } from './SharedUnitPlaybackContext.js';
import {
  IDLE_SHARED_CURSOR,
  SHARED_APPEARANCE_SPACING_OPTIONS,
  buildCardSegmentIndexMap,
  buildCardSpeakerAppearanceMap,
  buildConversationBodyStyle,
  buildParagraphBodyStyle,
  buildSharedSegmentRenderFlags,
  getSharedUnitHeading,
  getSharedUnitShortCode,
  getSharedUnitTerms,
  normalizeSegmentDisplayText,
  resolveReaderAppearancePresentation,
  resolveSegmentJoinSeparator,
  resolveTurnSpeakerPresentation,
  resolveWorkspaceStylePresentation
} from './sharedCardPresentationUtils.js';

const AudibleTurnBadge = ({ speakerInfo, cursorState }) => (
  <span
    data-shared-turn-audible="true"
    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-700/70 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-200 shrink-0 select-none"
  >
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${speakerInfo.palette.dot}`} />
    <span>{cursorState === 'paused' ? 'Paused' : 'Speaking'}</span>
  </span>
);

const UnitHeadingBlock = ({
  unit,
  unitIndex,
  speakerInfo,
  isRepeatedSpeaker = false,
  isAudibleTurn = false,
  cursorState = 'idle',
  compact = false,
  showAccents = true
}) => {
  if (unit?.kind !== 'turn') {
    return (
      <p
        className={`${compact ? 'mb-2' : 'mb-2.5'} text-left text-[11px] font-semibold uppercase tracking-wider text-teal-700/80 dark:text-teal-300/80 select-none`}
        data-shared-section-heading={unit.viewKey}
      >
        {getSharedUnitHeading(unit, unitIndex)}
      </p>
    );
  }

  return (
    <div
      className={`${compact ? 'mb-2' : 'mb-2.5'} flex flex-wrap items-center justify-between gap-2 text-left`}
      data-shared-turn-header={unit.viewKey}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {showAccents && (
          <span
            aria-hidden="true"
            className={`h-6 w-6 rounded-full text-[11px] font-bold inline-flex items-center justify-center shrink-0 select-none ${speakerInfo.palette.avatar}`}
          >
            {speakerInfo.monogram}
          </span>
        )}
        <span className={`text-[13px] font-semibold leading-snug break-words [overflow-wrap:anywhere] text-left ${speakerInfo.palette.nameText}`}>
          <span data-shared-turn-speaker={unit.viewKey}>{speakerInfo.displayName}</span>
          <span aria-hidden="true">:</span>
        </span>
        <span
          data-shared-turn-label="true"
          className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums select-none"
        >
          {unit.label || getSharedUnitTerms(unit).label} {unitIndex + 1}
        </span>
        {isRepeatedSpeaker && (
          <span
            data-shared-turn-consecutive="true"
            className="text-[11px] text-slate-400 dark:text-slate-500 select-none"
          >
            · consecutive turn
          </span>
        )}
      </div>
      {isAudibleTurn && <AudibleTurnBadge speakerInfo={speakerInfo} cursorState={cursorState} />}
    </div>
  );
};

const AlignedSpeakerColumn = ({
  unit,
  unitIndex,
  speakerInfo,
  isRepeatedSpeaker = false,
  isAudibleTurn = false,
  cursorState = 'idle',
  showAccents = true
}) => (
  <div
    className="min-w-0 text-left space-y-1 sm:pt-0.5"
    data-shared-turn-header={unit.viewKey}
    data-shared-turn-speaker-column="true"
  >
    <div className="flex items-start gap-2 min-w-0">
      {showAccents && (
        <span
          aria-hidden="true"
          className={`mt-1 h-2 w-2 rounded-full shrink-0 ${speakerInfo.palette.dot}`}
        />
      )}
      <span className={`min-w-0 text-[13px] font-semibold leading-snug break-words [overflow-wrap:anywhere] text-left ${speakerInfo.palette.nameText}`}>
        <span data-shared-turn-speaker={unit.viewKey}>{speakerInfo.displayName}</span>
        <span aria-hidden="true">:</span>
      </span>
    </div>
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-left">
      <span
        data-shared-turn-label="true"
        className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums select-none"
      >
        {unit.label || getSharedUnitTerms(unit).label} {unitIndex + 1}
      </span>
      {isRepeatedSpeaker && (
        <span
          data-shared-turn-consecutive="true"
          className="text-[11px] text-slate-400 dark:text-slate-500 select-none"
        >
          · consecutive
        </span>
      )}
      {isAudibleTurn && <AudibleTurnBadge speakerInfo={speakerInfo} cursorState={cursorState} />}
    </div>
  </div>
);

const InlineSpeakerLeadIn = ({ unit, speakerInfo }) => (
  <span
    data-shared-turn-header={unit.viewKey}
    data-shared-turn-speaker-inline="true"
    className="inline-block max-w-full align-baseline text-left whitespace-normal break-words [overflow-wrap:anywhere] mr-1.5 select-none"
    style={{ textAlign: 'left', textIndent: '0' }}
  >
    <span
      data-shared-turn-speaker={unit.viewKey}
      className={`text-[0.92em] font-semibold ${speakerInfo.palette.nameText}`}
    >
      {speakerInfo.displayName}
    </span>
    <span aria-hidden="true" className={`text-[0.92em] font-semibold ${speakerInfo.palette.nameText}`}>:</span>
  </span>
);

const InlineTurnMetaStrip = ({ unit, unitIndex, speakerInfo, isRepeatedSpeaker, isAudibleTurn, cursorState }) => {
  if (!isRepeatedSpeaker && !isAudibleTurn) return null;
  return (
    <div className="mb-1 flex flex-wrap items-center gap-2 text-left select-none" data-shared-turn-inline-meta={unit.viewKey}>
      <span
        data-shared-turn-label="true"
        className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums"
      >
        {unit.label || getSharedUnitTerms(unit).label} {unitIndex + 1}
      </span>
      {isRepeatedSpeaker && (
        <span
          data-shared-turn-consecutive="true"
          className="text-[11px] text-slate-400 dark:text-slate-500"
        >
          · consecutive turn
        </span>
      )}
      {isAudibleTurn && <AudibleTurnBadge speakerInfo={speakerInfo} cursorState={cursorState} />}
    </div>
  );
};

const resolveUnitAccentClass = ({ isTurn, isTitleRole, showAccents, speakerInfo, isAudibleTurn }) => {
  if (!showAccents) return '';
  if (isTurn) {
    return `pl-3.5 sm:pl-4 border-l-2 transition-colors motion-reduce:transition-none ${
      isAudibleTurn ? speakerInfo.palette.rail : speakerInfo.palette.railMuted
    }`;
  }
  if (isTitleRole) {
    return 'pl-3.5 sm:pl-4 border-l-2 border-l-indigo-500/55 dark:border-l-indigo-400/50 transition-colors motion-reduce:transition-none';
  }
  return 'pl-3.5 sm:pl-4 border-l-2 border-l-teal-500/45 dark:border-l-teal-400/40 transition-colors motion-reduce:transition-none';
};

const renderChannelJoinSeparator = (segment, hasNextSegment) => {
  if (!hasNextSegment) return null;
  const separator = resolveSegmentJoinSeparator(segment?.joinAfter);
  if (separator === '') return null;
  if (separator === '\n') return <br aria-hidden="true" />;
  return ' ';
};

const channelDisplayMeta = (channel, workspace) => ({
  code: channel === 'meaning' ? 'ID' : 'EN',
  name: channel === 'meaning' ? 'Indonesian' : 'English',
  lang: channel === 'meaning' ? (workspace?.meaningLanguage || 'id') : (workspace?.textLanguage || 'en'),
  missingNotice: channel === 'meaning' ? 'No Indonesian translation yet.' : 'No English text yet.',
  missingInline: channel === 'meaning' ? '[No Indonesian meaning]' : '[No English text]'
});

const ContextualSourceBadge = ({ source }) => {
  if (source === 'audible') {
    return (
      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
        Playing
      </span>
    );
  }
  if (source === 'paused-cursor') {
    return (
      <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
        Paused
      </span>
    );
  }
  if (source === 'search') {
    return (
      <span className="rounded-full bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
        Search
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-100 dark:bg-sky-900/60 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-200">
      Selected
    </span>
  );
};

const ContextualReturnToPlayingButton = ({ audibleTarget, onFollowContextualAudible }) => {
  if (!audibleTarget || typeof onFollowContextualAudible !== 'function') return null;
  return (
    <button
      type="button"
      onClick={onFollowContextualAudible}
      data-shared-contextual-return-to-playing="true"
      className="min-h-8 sm:min-h-7 px-2.5 py-0.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <Radio aria-hidden="true" className="w-3 h-3 shrink-0" />
      <span>
        Return to Playing · {audibleTarget.unitShortCode}
        {audibleTarget.speakerLabel ? ` ${audibleTarget.speakerLabel}` : ''}
        {` SG${audibleTarget.localSegmentNumber}`}
      </span>
    </button>
  );
};

const ContextualTranslationText = ({ text, segmentId, channel, onPlaySegment, disabled }) => (
  <TextSegmentInteraction segmentId={segmentId} channel={channel}
    interactive={Boolean(onPlaySegment)} disabled={disabled}
    accessibleLabel={channel === 'meaning' ? 'Play Indonesian translation' : 'Play English text'}
    dataAttributes={{ 'data-shared-card-segment': segmentId, 'data-shared-card-channel': channel }}
    onActivate={() => onPlaySegment?.(segmentId, channel)}
  >{text}</TextSegmentInteraction>
);

const ContextualBlockCallout = ({
  placement,
  target,
  secondaryChannel,
  workspace,
  bodyStyle,
  appearancePres,
  divergedFromAudible,
  audibleTarget,
  onPlaySegment,
  disabled,
  onFollowContextualAudible,
  onDismissContextualTarget
}) => {
  const secMeta = channelDisplayMeta(secondaryChannel, workspace);
  const secondaryText = normalizeSegmentDisplayText(
    secondaryChannel === 'meaning' ? target.segment?.meaning : target.segment?.text
  );

  return (
    <div
      data-shared-contextual-panel={placement}
      data-shared-contextual-segment={target.segmentId}
      data-shared-contextual-source={target.source}
      data-shared-contextual-channel={secondaryChannel}
      className={`${placement === 'above' ? 'mb-3' : 'mt-3'} rounded-xl border px-3.5 py-2.5 space-y-1.5 text-left transition-colors motion-reduce:transition-none ${appearancePres.contextualBoxClass}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-left">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 select-none">
            <Languages aria-hidden="true" className="w-3 h-3 shrink-0" />
            <span>{secMeta.name} ({secMeta.code})</span>
          </span>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums select-none">
            · {target.unitShortCode} SG{target.localSegmentNumber}
          </span>
          <ContextualSourceBadge source={target.source} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {divergedFromAudible && (
            <ContextualReturnToPlayingButton
              audibleTarget={audibleTarget}
              onFollowContextualAudible={onFollowContextualAudible}
            />
          )}
          {target.source === 'manual' && typeof onDismissContextualTarget === 'function' && (
            <button
              type="button"
              onClick={onDismissContextualTarget}
              data-shared-contextual-dismiss="true"
              aria-label="Hide contextual translation"
              title="Hide contextual translation"
              className="min-h-7 min-w-7 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/70 inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <X aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div
        lang={secMeta.lang}
        data-shared-reading-body="true"
        data-shared-reading-channel={secondaryChannel}
        data-shared-reading-role="secondary"
        data-shared-reading-kind="contextual"
        data-shared-reading-align={bodyStyle.textAlign}
        style={bodyStyle.inlineStyle}
        className={`max-w-[66ch] break-words whitespace-pre-line ${appearancePres.secondaryTextClass} ${bodyStyle.className}`}
      >
        {secondaryText ? (
          <ContextualTranslationText text={secondaryText} segmentId={target.segmentId} channel={secondaryChannel}
            onPlaySegment={onPlaySegment} disabled={disabled} />
        ) : (
          <span className="italic text-slate-400 dark:text-slate-500">
            {secMeta.missingNotice}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Shared unit-level channel paragraph/dialogue stream.
 * Renders exact text, punctuation, joinAfter (space/none/line), optional inline speaker
 * lead-in, and optional Contextual select-only affordances + Inline translation reveal
 * WITHOUT altering reconstructed text or hijacking existing playback callbacks.
 */
const UnitChannelStream = ({
  card,
  unit,
  unitSegments,
  channel,
  channelRole = 'primary',
  indexById,
  cursor,
  focusSegmentId,
  selectedSegmentId = null,
  selectionOnly = false,
  playableSegmentIds,
  audioCoverageMap,
  isSpeakingCard,
  fullChannelHighlighted,
  isTitleRole,
  langTag,
  disabled,
  showMissingInline = false,
  inlineLeadIn = null,
  bodyStyle,
  appearancePres,
  readingKind,
  primarySizeToken,
  contextualActive = false,
  contextualPlacement = 'below',
  contextualTarget = null,
  secondaryChannel = 'meaning',
  workspace = null,
  onPlaySegment,
  onSelectSegment = null,
  onSelectContextualSegment = null
}) => {
  const isMeaning = channel === 'meaning';
  const meta = channelDisplayMeta(channel, workspace);
  const secMeta = channelDisplayMeta(secondaryChannel, workspace);

  const visibleEntries = unitSegments
    .map((segment, localIndex) => {
      const content = normalizeSegmentDisplayText(isMeaning ? segment.meaning : segment.text);
      return { segment, localIndex, content };
    })
    .filter(item => showMissingInline || Boolean(item.content));

  const toneClass = channelRole === 'secondary'
    ? appearancePres.secondaryTextClass
    : (isTitleRole ? 'font-medium tracking-[-0.01em] text-slate-900 dark:text-slate-50' : appearancePres.primaryTextClass);

  const handleSegmentActivate = segmentId => {
    if (selectionOnly) {
      onSelectSegment?.(segmentId);
    } else {
      onPlaySegment?.(segmentId, channel);
    }
  };

  if (visibleEntries.length === 0) {
    return (
      <div
        lang={langTag}
        data-shared-reading-body="true"
        data-shared-reading-channel={channel}
        data-shared-reading-role={channelRole}
        data-shared-reading-kind={readingKind}
        data-shared-reading-align={bodyStyle.textAlign}
        data-shared-reading-size={primarySizeToken}
        style={bodyStyle.inlineStyle}
        className={`max-w-[66ch] break-words ${bodyStyle.className}`}
      >
        {inlineLeadIn}
        <span
          className="text-sm italic text-slate-400 dark:text-slate-500"
          data-shared-card-empty-channel={`${unit.viewKey}:${channel}`}
        >
          {meta.missingNotice}
        </span>
      </div>
    );
  }

  return (
    <div
      lang={langTag}
      data-shared-reading-body="true"
      data-shared-reading-channel={channel}
      data-shared-reading-role={channelRole}
      data-shared-reading-kind={readingKind}
      data-shared-reading-align={bodyStyle.textAlign}
      data-shared-reading-size={primarySizeToken}
      style={bodyStyle.inlineStyle}
      className={`max-w-[66ch] break-words ${toneClass} ${bodyStyle.className}`}
    >
      {inlineLeadIn}
      {visibleEntries.map(({ segment, localIndex, content }, visibleIdx) => {
        const logicalIndex = indexById.get(segment.id) ?? 0;
        const isContextualTarget = Boolean(
          contextualActive
          && contextualTarget
          && contextualTarget.cardId === card?.id
          && contextualTarget.segmentId === segment.id
        );
        const effectiveSelectedId = contextualActive && isContextualTarget
          ? segment.id
          : selectedSegmentId;
        const flags = buildSharedSegmentRenderFlags({
          segment,
          logicalIndex,
          channel,
          cursor,
          isSpeakingCard,
          fullChannelHighlighted,
          focusSegmentId,
          selectedSegmentId: effectiveSelectedId,
          selectionOnly,
          playableSegmentIds: selectionOnly ? playableSegmentIds : null,
          audioCoverageMap,
          disabled
        });
        const inlineSecondaryText = contextualActive && contextualPlacement === 'inline' && isContextualTarget
          ? normalizeSegmentDisplayText(secondaryChannel === 'meaning' ? segment.meaning : segment.text)
          : '';
        const showContextualSelectTrigger = Boolean(
          contextualActive
          && channelRole === 'primary'
          && !selectionOnly
          && typeof onSelectContextualSegment === 'function'
        );

        return (
          <React.Fragment key={segment.id}>
            {content ? (
              <TextSegmentInteraction
                segmentId={segment.id}
                channel={channel}
                interactive
                disabled={flags.segmentDisabled}
                active={flags.active}
                speaking={flags.speaking}
                focused={flags.focused}
                fullChannelHighlighted={flags.fullChannelHighlighted}
                title={flags.title}
                accessibleLabel={flags.accessibleLabel}
                className={flags.className}
                dataAttributes={{
                  ...flags.dataAttributes,
                  ...(isContextualTarget ? { 'data-shared-contextual-target': 'true' } : {})
                }}
                onActivate={handleSegmentActivate}
              >
                {content}
              </TextSegmentInteraction>
            ) : (
              <span
                data-shared-card-missing={segment.id}
                className="text-sm italic text-slate-400 dark:text-slate-500"
              >
                {meta.missingInline}
              </span>
            )}

            {showContextualSelectTrigger && (
              <button
                type="button"
                aria-pressed={isContextualTarget}
                aria-label={`Show ${secMeta.name} translation for sentence ${localIndex + 1} without playing audio`}
                title={`Inspect ${secMeta.code} translation for sentence ${localIndex + 1} (select only, does not play audio)`}
                data-shared-contextual-select={segment.id}
                onClick={event => {
                  event.stopPropagation();
                  onSelectContextualSegment(card, segment.id);
                }}
                style={{ textIndent: '0' }}
                className={`inline-flex items-center justify-center align-middle ${segment?.joinAfter === 'none' ? 'mx-0.5' : 'ml-1'} h-[18px] w-[18px] rounded-md border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 select-none ${
                  isContextualTarget
                    ? 'border-sky-500 bg-sky-600 text-white shadow-xs'
                    : 'border-slate-200/90 dark:border-slate-700 bg-slate-50/85 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300'
                }`}
              >
                <Languages aria-hidden="true" className="w-3 h-3" />
              </button>
            )}

            {contextualActive && contextualPlacement === 'inline' && isContextualTarget && (
              <span
                lang={secMeta.lang}
                data-shared-contextual-panel="inline"
                data-shared-contextual-segment={segment.id}
                data-shared-contextual-source={contextualTarget.source}
                data-shared-contextual-channel={secondaryChannel}
                data-shared-reading-body="true"
                data-shared-reading-channel={secondaryChannel}
                data-shared-reading-role="secondary"
                data-shared-reading-kind="contextual"
                data-shared-reading-align={bodyStyle.textAlign}
                style={{
                  ...appearancePres.secondaryInlineStyle,
                  textIndent: '0'
                }}
                className={`inline align-baseline mx-1 px-1.5 py-0.5 rounded-md border ${appearancePres.contextualBoxClass} ${appearancePres.secondaryTextClass}`}
              >
                {inlineSecondaryText ? (
                  <ContextualTranslationText text={inlineSecondaryText} segmentId={segment.id} channel={secondaryChannel}
                    onPlaySegment={onPlaySegment} disabled={disabled} />
                ) : (
                  <span className="italic text-slate-400 dark:text-slate-500">
                    {secMeta.missingNotice}
                  </span>
                )}
              </span>
            )}

            {renderChannelJoinSeparator(segment, visibleIdx < visibleEntries.length - 1)}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * Shared Unit shell that enforces Workspace Style (Aligned / Stacked / Inline speaker
 * attribution rendered ONCE per Turn without repeating names across channels,
 * Section headings, left accent rails, and empty Unit notices).
 */
const SharedAuthoredUnitShell = ({
  unit,
  authoredUnitIndex,
  speakerInfo,
  isRepeatedSpeaker,
  isAudibleTurn,
  cursorState,
  showSectionHeaders,
  workspaceStylePresentation,
  isTitleRole,
  renderBody,
  unitPlayButton,
  allowInlineLeadIn = true
}) => {
  const isTurn = unit.kind === 'turn';
  const { speakerLayout, showAccents } = workspaceStylePresentation;
  const accentClass = resolveUnitAccentClass({
    isTurn,
    isTitleRole,
    showAccents,
    speakerInfo,
    isAudibleTurn
  });
  const unitSegments = unit.segments || [];

  const commonAttrs = {
    'data-shared-card-unit': unit.viewKey,
    'data-shared-unit': unit.viewKey,
    'data-shared-unit-id': unit.id || undefined,
    'data-shared-unit-kind': unit.kind,
    'data-shared-turn-speaker-palette': isTurn ? speakerInfo.palette.id : undefined,
    'data-shared-turn-speaker-layout': isTurn ? speakerLayout : undefined
  };

  if (unitSegments.length === 0) {
    return (
      <section {...commonAttrs} className={`min-w-0 ${accentClass}`}>
        {showSectionHeaders && (
          <UnitHeadingBlock
            unit={unit}
            unitIndex={authoredUnitIndex}
            speakerInfo={speakerInfo}
            isRepeatedSpeaker={isRepeatedSpeaker}
            isAudibleTurn={isAudibleTurn}
            cursorState={cursorState}
            showAccents={showAccents}
            compact
          />
        )}
        <p
          className="text-left text-sm italic text-slate-400 dark:text-slate-500"
          data-shared-unit-empty={unit.viewKey}
        >
          Empty {getSharedUnitTerms(unit).lower} — no sentences yet.
        </p>
      </section>
    );
  }

  if (isTurn && showSectionHeaders && speakerLayout === 'aligned') {
    return (
      <section {...commonAttrs} className={`min-w-0 ${accentClass}`}>
        <div
          data-shared-turn-aligned-grid={unit.viewKey}
          className="grid grid-cols-1 sm:grid-cols-[minmax(8.5rem,11.5rem)_minmax(0,1fr)] gap-y-1.5 sm:gap-x-5 items-start"
        >
          <AlignedSpeakerColumn
            unit={unit}
            unitIndex={authoredUnitIndex}
            speakerInfo={speakerInfo}
            isRepeatedSpeaker={isRepeatedSpeaker}
            isAudibleTurn={isAudibleTurn}
            cursorState={cursorState}
            showAccents={showAccents}
          />
          <div className="min-w-0" data-shared-turn-body-column="true">
            {unitPlayButton}
            {renderBody({ inlineLeadIn: null })}
          </div>
        </div>
      </section>
    );
  }

  if (isTurn && showSectionHeaders && speakerLayout === 'inline') {
    const inlineLeadIn = allowInlineLeadIn
      ? <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />
      : null;
    return (
      <section {...commonAttrs} className={`min-w-0 ${accentClass}`}>
        <InlineTurnMetaStrip
          unit={unit}
          unitIndex={authoredUnitIndex}
          speakerInfo={speakerInfo}
          isRepeatedSpeaker={isRepeatedSpeaker}
          isAudibleTurn={isAudibleTurn}
          cursorState={cursorState}
        />
        {!allowInlineLeadIn && (
          <div className="mb-1.5 text-left">
            <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />
          </div>
        )}
        {unitPlayButton}
        {renderBody({ inlineLeadIn })}
      </section>
    );
  }

  return (
    <section {...commonAttrs} className={`min-w-0 ${accentClass}`}>
      {showSectionHeaders && (
        <UnitHeadingBlock
          unit={unit}
          unitIndex={authoredUnitIndex}
          speakerInfo={speakerInfo}
          isRepeatedSpeaker={isRepeatedSpeaker}
          isAudibleTurn={isAudibleTurn}
          cursorState={cursorState}
          showAccents={showAccents}
          compact
        />
      )}
      {unitPlayButton}
      {renderBody({ inlineLeadIn: null })}
    </section>
  );
};

/**
 * Shared bilingual reading renderer across Full, Card, Focus, and Segment views.
 *
 * Implements the unified 4C1 contract for Paragraph & Conversation:
 * - Single language: EN Only / ID Only (or Segment fallback primary-only context)
 * - Separated (per-Unit): complete primary followed by complete secondary WITHIN EACH
 *   authored Section or Turn, preserving speaker attribution ONCE without repetition
 * - Sentence Interlinear: paired primary + secondary per Segment in active EN–ID or ID–EN order
 * - Contextual (Full/Card/Focus): complete primary text remains visible continuously;
 *   reveals ONLY the single active Workspace target's translation (Above, Below, or Inline)
 *   with a clear select-only affordance that never hijacks playback callbacks
 * - Independent Appearance / Typography controls applied consistently across reading bodies
 */
export const SharedBilingualUnitsBody = ({
  card,
  unitsOverride = null,
  workspace = null,
  speakerAppearanceMap = null,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  presentationState = null,
  bilingualPresentation = null,
  readerMode = null,
  appearance = null,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  selectedSegmentId = null,
  selectionOnly = false,
  contextualState = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  forceSectionHeaders = null,
  showSegmentNumbers = true,
  onPlaySegment,
  onSelectSegment = null,
  onSelectContextualSegment = null,
  onFollowContextualAudible = null,
  onDismissContextualTarget = null
}) => {
  const units = unitsOverride || card?.units || [];
  const onPlayUnit = useContext(SharedUnitPlaybackContext);
  const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const { indexById } = useMemo(() => buildCardSegmentIndexMap(card), [card]);
  const authoredUnitIndexByViewKey = useMemo(() => {
    const map = new Map();
    (card?.units || []).forEach((unit, idx) => {
      if (unit?.viewKey) map.set(unit.viewKey, idx);
    });
    return map;
  }, [card]);
  const resolvedSpeakerMap = useMemo(
    () => speakerAppearanceMap || buildCardSpeakerAppearanceMap(card),
    [card, speakerAppearanceMap]
  );
  const workspaceStylePresentation = useMemo(
    () => resolveWorkspaceStylePresentation(workspaceStyle),
    [workspaceStyle]
  );

  const effectiveBilingual = useMemo(() => {
    if (bilingualPresentation) return bilingualPresentation;
    const baseView = presentationState
      ? normalizeTextCardPresentationState(presentationState)
      : normalizeTextCardPresentationState({ bilingualLayout });
    return resolveEffectiveBilingualPresentation({ readerMode, view: baseView });
  }, [bilingualPresentation, presentationState, bilingualLayout, readerMode]);

  const effectiveAppearance = appearance || effectiveBilingual.appearance;
  const appearancePres = useMemo(
    () => resolveReaderAppearancePresentation(effectiveAppearance),
    [effectiveAppearance]
  );

  const hasMultipleUnits = units.length > 1;
  const hasPersistentEmpty = units.some(unit => unit.identitySource === 'persistent' && (unit.segments?.length || 0) === 0);
  const showSectionHeaders = forceSectionHeaders !== null
    ? forceSectionHeaders
    : (card?.blockType === 'conversation' || hasMultipleUnits || hasPersistentEmpty);

  const primaryChannel = effectiveBilingual.primaryChannel;
  const secondaryChannel = effectiveBilingual.secondaryChannel;
  const renderMode = effectiveBilingual.effectiveRenderMode;
  const contextualPlacement = effectiveBilingual.contextualPlacement;

  const primaryMeta = channelDisplayMeta(primaryChannel, workspace);
  const secondaryMeta = channelDisplayMeta(secondaryChannel, workspace);

  const paragraphPrimaryStyle = useMemo(() => buildParagraphBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    appearance: appearancePres.appearance,
    channelRole: 'primary',
    isTitleRole,
    allowIndent: true
  }), [workspaceStylePresentation.style, appearancePres.appearance, isTitleRole]);

  const paragraphSecondaryStyle = useMemo(() => buildParagraphBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    appearance: appearancePres.appearance,
    channelRole: 'secondary',
    isTitleRole,
    allowIndent: true
  }), [workspaceStylePresentation.style, appearancePres.appearance, isTitleRole]);

  const paragraphNoIndentPrimaryStyle = useMemo(() => buildParagraphBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    appearance: appearancePres.appearance,
    channelRole: 'primary',
    isTitleRole,
    allowIndent: false
  }), [workspaceStylePresentation.style, appearancePres.appearance, isTitleRole]);

  const paragraphNoIndentSecondaryStyle = useMemo(() => buildParagraphBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    appearance: appearancePres.appearance,
    channelRole: 'secondary',
    isTitleRole,
    allowIndent: false
  }), [workspaceStylePresentation.style, appearancePres.appearance, isTitleRole]);

  const conversationPrimaryStyle = useMemo(() => buildConversationBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    appearance: appearancePres.appearance,
    channelRole: 'primary'
  }), [workspaceStylePresentation.style, appearancePres.appearance]);

  const conversationSecondaryStyle = useMemo(() => buildConversationBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    appearance: appearancePres.appearance,
    channelRole: 'secondary'
  }), [workspaceStylePresentation.style, appearancePres.appearance]);

  const rootAttrs = {
    'data-shared-workspace-align': workspaceStylePresentation.style.textAlign,
    'data-shared-workspace-indent': workspaceStylePresentation.style.paragraphIndent ? 'on' : 'off',
    'data-shared-workspace-speaker-layout': workspaceStylePresentation.style.speakerLayout,
    'data-shared-workspace-accents': workspaceStylePresentation.style.showAccents ? 'on' : 'off',
    'data-shared-reading-language': effectiveBilingual.readingLanguage,
    'data-shared-bilingual-style': renderMode,
    'data-shared-contextual-placement': renderMode === 'contextual' ? contextualPlacement : undefined,
    'data-shared-appearance-primary-size': appearancePres.appearance.primaryFontSize,
    'data-shared-appearance-secondary-size': appearancePres.appearance.secondaryFontSize,
    'data-shared-appearance-font': appearancePres.appearance.fontFamily,
    'data-shared-appearance-line-height': appearancePres.appearance.lineHeight,
    'data-shared-appearance-contrast': appearancePres.appearance.translationContrast,
    'data-shared-appearance-spacing': appearancePres.appearance.textSpacing
  };

  if (units.length === 0) {
    return (
      <p
        className="text-left text-sm italic text-slate-400 dark:text-slate-500"
        data-shared-card-empty="zero-units"
        {...rootAttrs}
      >
        No {getSharedUnitTerms(card).plural} in this {getSharedUnitTerms(card).cardLower} yet.
      </p>
    );
  }

  const resolveUnitMeta = (unit, unitIndex) => {
    const authoredUnitIndex = authoredUnitIndexByViewKey.get(unit.viewKey) ?? unitIndex;
    const unitSegments = unit.segments || [];
    const isTurn = unit.kind === 'turn';
    const speakerInfo = isTurn
      ? resolveTurnSpeakerPresentation({ unit, appearanceMap: resolvedSpeakerMap })
      : null;
    const prevUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
    const prevSpeakerInfo = prevUnit?.kind === 'turn'
      ? resolveTurnSpeakerPresentation({ unit: prevUnit, appearanceMap: resolvedSpeakerMap })
      : null;
    const isRepeatedSpeaker = Boolean(
      isTurn
      && prevSpeakerInfo?.speakerKey
      && speakerInfo?.speakerKey
      && prevSpeakerInfo.speakerKey === speakerInfo.speakerKey
    );
    const isAudibleTurn = Boolean(
      isTurn
      && isSpeakingCard
      && cursor.precision === 'segment'
      && cursor.segmentId
      && unitSegments.some(item => item.id === cursor.segmentId)
    );
    const readingKind = isTurn ? 'turn' : (isTitleRole ? 'title' : 'paragraph');
    return {
      authoredUnitIndex,
      unitSegments,
      isTurn,
      speakerInfo,
      isRepeatedSpeaker,
      isAudibleTurn,
      readingKind
    };
  };

  const fullPrimaryHighlighted = isSpeakingCard && cursor.precision === 'card' && cursor.channel === primaryChannel;
  const fullSecondaryHighlighted = isSpeakingCard && cursor.precision === 'card' && cursor.channel === secondaryChannel;
  const activeContextualTarget = renderMode === 'contextual' ? (contextualState?.target || null) : null;
  const renderUnitPlay = unit => onPlayUnit && !disabled && unit.segments?.some(item =>
    normalizeSegmentDisplayText(item.text) || normalizeSegmentDisplayText(item.meaning)) && (
    <button type="button" data-shared-unit-play={unit.viewKey}
      className="mb-1 min-h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
      onClick={() => onPlayUnit({
        blockId: card.id, unitId: unit.id, virtualUnit: unit.identitySource === 'v1-paragraph-compat',
        workspaceId: workspace?.id, workspaceUid: workspace?.uid
      })}
    >Play {unit.kind === 'turn' ? 'Turn' : 'Section'}</button>
  );
  const contextualDiverged = Boolean(renderMode === 'contextual' && contextualState?.divergedFromAudible);
  const contextualAudibleTarget = renderMode === 'contextual' ? (contextualState?.audibleTarget || null) : null;

  // ---------------------------------------------------------------------------
  // 1. SENTENCE INTERLINEAR — each Segment pairs primary directly above secondary
  // ---------------------------------------------------------------------------
  if (renderMode === 'interlinear' || renderMode === 'notebook') {
    const isNotebook = renderMode === 'notebook';
    const notebookLetterSpacing = SHARED_APPEARANCE_SPACING_OPTIONS
      .find(option => option.id === appearancePres.appearance.notebookSpacing)?.letterSpacing;
    const handleSegmentActivate = (segmentId, channel) => {
      if (selectionOnly) onSelectSegment?.(segmentId);
      else onPlaySegment?.(segmentId, channel);
    };

    return (
      <div
        className={appearancePres.unitStackClass}
        data-shared-card-interlinear={!isNotebook ? 'true' : undefined}
        {...rootAttrs}
      >
        {units.map((unit, unitIndex) => {
          const meta = resolveUnitMeta(unit, unitIndex);
          const primaryBodyStyle = meta.isTurn ? conversationPrimaryStyle : paragraphNoIndentPrimaryStyle;
          const secondaryBodyStyle = meta.isTurn ? conversationSecondaryStyle : paragraphNoIndentSecondaryStyle;
          const getFlags = (segment, channel) => buildSharedSegmentRenderFlags({
            segment,
            logicalIndex: indexById.get(segment.id) ?? 0,
            channel, cursor, isSpeakingCard,
            fullChannelHighlighted: channel === primaryChannel ? fullPrimaryHighlighted : fullSecondaryHighlighted,
            focusSegmentId, selectedSegmentId, selectionOnly, playableSegmentIds: selectionOnly ? playableSegmentIds : null,
            audioCoverageMap, disabled
          });

          return (
            <SharedAuthoredUnitShell
              key={unit.viewKey}
              unit={unit}
              authoredUnitIndex={meta.authoredUnitIndex}
              speakerInfo={meta.speakerInfo}
              isRepeatedSpeaker={meta.isRepeatedSpeaker}
              isAudibleTurn={meta.isAudibleTurn}
              cursorState={cursor.state}
              showSectionHeaders={showSectionHeaders}
              workspaceStylePresentation={workspaceStylePresentation}
              isTitleRole={isTitleRole}
              unitPlayButton={renderUnitPlay(unit)}
              allowInlineLeadIn={isNotebook}
              renderBody={({ inlineLeadIn }) => {
                const renderSentenceBody = () => (
                <div className={appearancePres.pairGapClass}>
                  {meta.unitSegments.map((segment, localIdx) => {
                    const logicalIndex = indexById.get(segment.id) ?? 0;
                    const primaryText = isNotebook ? String(segment[primaryChannel] ?? '') : normalizeSegmentDisplayText(segment[primaryChannel]);
                    const secondaryText = isNotebook ? String(segment[secondaryChannel] ?? '') : normalizeSegmentDisplayText(segment[secondaryChannel]);
                    const primaryFlags = getFlags(segment, primaryChannel);
                    const secondaryFlags = getFlags(segment, secondaryChannel);
                    const isRowActive = !isNotebook && (primaryFlags.active || secondaryFlags.active);
                    const isRowPaused = !isNotebook && (primaryFlags.paused || secondaryFlags.paused);
                    const isRowSelected = primaryFlags.selected || secondaryFlags.selected;
                    const isRowFocused = primaryFlags.focused || secondaryFlags.focused;

                    return (
                      <div
                        key={segment.id}
                        data-shared-card-segment-index={logicalIndex + 1}
                        data-shared-interlinear-segment={segment.id}
                        className={`rounded-xl px-3 py-2 sm:px-3.5 sm:py-2.5 transition-colors duration-150 motion-reduce:transition-none ${
                          isRowPaused
                            ? 'bg-amber-50/70 dark:bg-amber-950/25 ring-1 ring-amber-300/75 dark:ring-amber-700/65'
                            : isRowActive
                              ? 'bg-indigo-50/55 dark:bg-indigo-950/25 ring-1 ring-indigo-300/70 dark:ring-indigo-700/60'
                              : isRowSelected
                                ? 'bg-sky-50/70 dark:bg-sky-950/25 ring-1 ring-sky-300/75 dark:ring-sky-700/65'
                                : isRowFocused
                                  ? 'bg-amber-50/60 dark:bg-amber-950/20 ring-1 ring-amber-300/60'
                                  : 'bg-slate-50/45 dark:bg-slate-800/35 hover:bg-slate-50/90 dark:hover:bg-slate-800/55'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {showSegmentNumbers && (
                            <span className="mt-1 text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500 select-none shrink-0 w-5 text-right">
                              {localIdx + 1}
                            </span>
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div
                              lang={primaryMeta.lang}
                              data-shared-reading-body="true"
                              data-shared-reading-channel={primaryChannel}
                              data-shared-reading-role="primary"
                              data-shared-reading-kind={meta.readingKind}
                              data-shared-reading-align={primaryBodyStyle.textAlign}
                              data-shared-reading-size={appearancePres.appearance.primaryFontSize}
                              style={primaryBodyStyle.inlineStyle}
                              className={`max-w-[66ch] break-words ${isNotebook ? 'whitespace-pre-wrap' : ''} ${isTitleRole ? 'font-medium text-slate-900 dark:text-slate-50' : appearancePres.primaryTextClass} ${primaryBodyStyle.className}`}
                            >
                              {primaryText ? (
                                <TextSegmentInteraction
                                  segmentId={segment.id}
                                  channel={primaryChannel}
                                  interactive
                                  disabled={primaryFlags.segmentDisabled}
                                  active={isNotebook ? primaryFlags.speaking || primaryFlags.paused : primaryFlags.active}
                                  speaking={primaryFlags.speaking}
                                  focused={primaryFlags.focused}
                                  fullChannelHighlighted={primaryFlags.fullChannelHighlighted}
                                  title={primaryFlags.title}
                                  accessibleLabel={primaryFlags.accessibleLabel}
                                  className={primaryFlags.className}
                                  dataAttributes={primaryFlags.dataAttributes}
                                  onActivate={segmentId => handleSegmentActivate(segmentId, primaryChannel)}
                                >
                                  {primaryText}
                                </TextSegmentInteraction>
                              ) : (
                                <span
                                  data-shared-card-missing={segment.id}
                                  className="text-sm italic text-slate-400 dark:text-slate-500"
                                >
                                  {primaryMeta.missingInline}
                                </span>
                              )}
                            </div>

                            <div
                              lang={secondaryMeta.lang}
                              data-shared-reading-body="true"
                              data-shared-reading-channel={secondaryChannel}
                              data-shared-reading-role="secondary"
                              data-shared-reading-kind={meta.readingKind}
                              data-shared-reading-align={secondaryBodyStyle.textAlign}
                              style={secondaryBodyStyle.inlineStyle}
                              className={`max-w-[66ch] break-words ${isNotebook ? 'whitespace-pre-wrap' : ''} ${appearancePres.secondaryTextClass} ${secondaryBodyStyle.className}`}
                            >
                              {secondaryText ? (
                                <TextSegmentInteraction
                                  segmentId={segment.id}
                                  channel={secondaryChannel}
                                  interactive
                                  disabled={secondaryFlags.segmentDisabled}
                                  active={isNotebook ? secondaryFlags.speaking || secondaryFlags.paused : secondaryFlags.active}
                                  speaking={secondaryFlags.speaking}
                                  focused={secondaryFlags.focused}
                                  fullChannelHighlighted={secondaryFlags.fullChannelHighlighted}
                                  title={secondaryFlags.title}
                                  accessibleLabel={secondaryFlags.accessibleLabel}
                                  className={secondaryFlags.className}
                                  dataAttributes={secondaryFlags.dataAttributes}
                                  onActivate={segmentId => handleSegmentActivate(segmentId, secondaryChannel)}
                                >
                                  {secondaryText}
                                </TextSegmentInteraction>
                              ) : (
                                <span
                                  data-shared-card-missing-meaning={secondaryChannel === 'meaning' ? segment.id : undefined}
                                  data-shared-card-missing-text={secondaryChannel === 'text' ? segment.id : undefined}
                                  className="text-xs italic text-slate-400 dark:text-slate-500"
                                >
                                  {secondaryMeta.missingInline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
                if (!isNotebook) return renderSentenceBody();
                return (
                  <SharedNotebookUnitsBody
                    key={`${workspace?.id || ''}:${workspace?.uid || ''}:${unit.viewKey}`}
                    segments={meta.unitSegments.map(segment => ({
                      id: segment.id,
                      joinAfter: segment.joinAfter,
                      separator: resolveSegmentJoinSeparator(segment.joinAfter),
                      primary: String(segment[primaryChannel] ?? ''),
                      secondary: String(segment[secondaryChannel] ?? '')
                    }))}
                    primaryChannel={primaryChannel}
                    secondaryChannel={secondaryChannel}
                    primaryStyle={{ ...(meta.isTurn ? conversationPrimaryStyle : paragraphPrimaryStyle).inlineStyle, letterSpacing: notebookLetterSpacing }}
                    secondaryStyle={secondaryBodyStyle.inlineStyle}
                    primaryClassName={isTitleRole ? 'font-medium text-slate-900 dark:text-slate-50' : appearancePres.primaryTextClass}
                    secondaryClassName={appearancePres.secondaryTextClass}
                    primaryLang={primaryMeta.lang}
                    secondaryLang={secondaryMeta.lang}
                    guides={appearancePres.appearance.notebookGuideLines}
                    spacing={appearancePres.appearance.notebookSpacing}
                    inlineLeadIn={inlineLeadIn}
                    resolveFlags={(index, channel) => getFlags(meta.unitSegments[index], channel)}
                    onActivate={handleSegmentActivate}
                    renderFallback={renderSentenceBody}
                  />
                );
              }}
            />
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. SEPARATED (PER-UNIT) — complete primary then complete secondary INSIDE
  //    EACH authored Unit without repeating speaker attribution for both channels
  // ---------------------------------------------------------------------------
  if (renderMode === 'separated') {
    return (
      <div
        className={appearancePres.unitStackClass}
        data-shared-card-separated="true"
        data-shared-separated-scope="unit"
        {...rootAttrs}
      >
        {units.map((unit, unitIndex) => {
          const meta = resolveUnitMeta(unit, unitIndex);
          const primaryBodyStyle = meta.isTurn ? conversationPrimaryStyle : paragraphPrimaryStyle;
          const secondaryBodyStyle = meta.isTurn ? conversationSecondaryStyle : paragraphSecondaryStyle;

          return (
            <SharedAuthoredUnitShell
              key={unit.viewKey}
              unit={unit}
              authoredUnitIndex={meta.authoredUnitIndex}
              speakerInfo={meta.speakerInfo}
              isRepeatedSpeaker={meta.isRepeatedSpeaker}
              isAudibleTurn={meta.isAudibleTurn}
              cursorState={cursor.state}
              showSectionHeaders={showSectionHeaders}
              workspaceStylePresentation={workspaceStylePresentation}
              isTitleRole={isTitleRole}
              unitPlayButton={renderUnitPlay(unit)}
              allowInlineLeadIn
              renderBody={({ inlineLeadIn }) => (
                <div data-shared-unit-separated={unit.viewKey}>
                  <div
                    data-shared-card-flow={primaryChannel}
                    data-shared-unit-channel-block="primary"
                    data-shared-full-channel-highlight={fullPrimaryHighlighted ? 'true' : undefined}
                  >
                    <UnitChannelStream
                      card={card}
                      unit={unit}
                      unitSegments={meta.unitSegments}
                      channel={primaryChannel}
                      channelRole="primary"
                      indexById={indexById}
                      cursor={cursor}
                      focusSegmentId={focusSegmentId}
                      selectedSegmentId={selectedSegmentId}
                      selectionOnly={selectionOnly}
                      playableSegmentIds={playableSegmentIds}
                      audioCoverageMap={audioCoverageMap}
                      isSpeakingCard={isSpeakingCard}
                      fullChannelHighlighted={fullPrimaryHighlighted}
                      isTitleRole={isTitleRole}
                      langTag={primaryMeta.lang}
                      disabled={disabled}
                      showMissingInline={false}
                      inlineLeadIn={inlineLeadIn}
                      bodyStyle={primaryBodyStyle}
                      appearancePres={appearancePres}
                      readingKind={meta.readingKind}
                      primarySizeToken={appearancePres.appearance.primaryFontSize}
                      workspace={workspace}
                      onPlaySegment={onPlaySegment}
                      onSelectSegment={onSelectSegment}
                    />
                  </div>

                  <div
                    data-shared-card-flow={secondaryChannel}
                    data-shared-unit-channel-block="secondary"
                    data-shared-full-channel-highlight={fullSecondaryHighlighted ? 'true' : undefined}
                    className={`${appearancePres.separatedGapClass} border-t border-slate-100/90 dark:border-slate-800/75`}
                  >
                    <UnitChannelStream
                      card={card}
                      unit={unit}
                      unitSegments={meta.unitSegments}
                      channel={secondaryChannel}
                      channelRole="secondary"
                      indexById={indexById}
                      cursor={cursor}
                      focusSegmentId={focusSegmentId}
                      selectedSegmentId={selectedSegmentId}
                      selectionOnly={selectionOnly}
                      playableSegmentIds={playableSegmentIds}
                      audioCoverageMap={audioCoverageMap}
                      isSpeakingCard={isSpeakingCard}
                      fullChannelHighlighted={fullSecondaryHighlighted}
                      isTitleRole={isTitleRole}
                      langTag={secondaryMeta.lang}
                      disabled={disabled}
                      showMissingInline={false}
                      inlineLeadIn={null}
                      bodyStyle={secondaryBodyStyle}
                      appearancePres={appearancePres}
                      readingKind={meta.readingKind}
                      primarySizeToken={appearancePres.appearance.secondaryFontSize}
                      workspace={workspace}
                      onPlaySegment={onPlaySegment}
                      onSelectSegment={onSelectSegment}
                    />
                  </div>
                </div>
              )}
            />
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. SINGLE LANGUAGE (EN Only / ID Only / Segment fallback) OR CONTEXTUAL
  //    (Complete primary visible continuously + ONE active Contextual reveal)
  // ---------------------------------------------------------------------------
  const isContextual = renderMode === 'contextual';

  return (
    <div
      className={appearancePres.unitStackClass}
      data-shared-card-flow={primaryChannel}
      data-shared-card-contextual={isContextual ? 'true' : undefined}
      data-shared-full-channel-highlight={fullPrimaryHighlighted ? 'true' : undefined}
      {...rootAttrs}
    >
      {isContextual && isSpeakingCard && contextualState?.isCardPrecisionPlaying && !activeContextualTarget && (
        <p
          data-shared-contextual-full-audio-notice="true"
          className="text-left text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/35 border border-indigo-200/70 dark:border-indigo-800/60 rounded-xl px-3 py-2"
        >
          Playing Full {card?.blockType === 'conversation' ? 'Scene' : 'Card'} audio (card-level timing) — tap any sentence&apos;s translate icon to inspect its {secondaryMeta.name} translation.
        </p>
      )}

      {units.map((unit, unitIndex) => {
        const meta = resolveUnitMeta(unit, unitIndex);
        const primaryBodyStyle = meta.isTurn ? conversationPrimaryStyle : paragraphPrimaryStyle;
        const contextualBlockBodyStyle = meta.isTurn ? conversationSecondaryStyle : paragraphNoIndentSecondaryStyle;
        const unitHasActiveContextualTarget = Boolean(
          isContextual
          && activeContextualTarget
          && activeContextualTarget.cardId === card?.id
          && activeContextualTarget.unitViewKey === unit.viewKey
        );
        const unitShortCode = getSharedUnitShortCode(unit, meta.authoredUnitIndex);
        const resolvedUnitTarget = unitHasActiveContextualTarget
          ? { ...activeContextualTarget, unitShortCode }
          : null;

        return (
          <SharedAuthoredUnitShell
            key={unit.viewKey}
            unit={unit}
            authoredUnitIndex={meta.authoredUnitIndex}
            speakerInfo={meta.speakerInfo}
            isRepeatedSpeaker={meta.isRepeatedSpeaker}
            isAudibleTurn={meta.isAudibleTurn}
            cursorState={cursor.state}
            showSectionHeaders={showSectionHeaders}
            workspaceStylePresentation={workspaceStylePresentation}
            isTitleRole={isTitleRole}
            unitPlayButton={renderUnitPlay(unit)}
            allowInlineLeadIn
            renderBody={({ inlineLeadIn }) => (
              <>
                {resolvedUnitTarget && contextualPlacement === 'above' && (
                  <ContextualBlockCallout
                    placement="above"
                    target={resolvedUnitTarget}
                    secondaryChannel={secondaryChannel}
                    workspace={workspace}
                    bodyStyle={contextualBlockBodyStyle}
                    appearancePres={appearancePres}
                    divergedFromAudible={contextualDiverged}
                    audibleTarget={contextualAudibleTarget}
                    onPlaySegment={onPlaySegment}
                    disabled={disabled}
                    onFollowContextualAudible={onFollowContextualAudible}
                    onDismissContextualTarget={onDismissContextualTarget}
                  />
                )}

                <UnitChannelStream
                  card={card}
                  unit={unit}
                  unitSegments={meta.unitSegments}
                  channel={primaryChannel}
                  channelRole="primary"
                  indexById={indexById}
                  cursor={cursor}
                  focusSegmentId={focusSegmentId}
                  selectedSegmentId={selectedSegmentId}
                  selectionOnly={selectionOnly}
                  playableSegmentIds={playableSegmentIds}
                  audioCoverageMap={audioCoverageMap}
                  isSpeakingCard={isSpeakingCard}
                  fullChannelHighlighted={fullPrimaryHighlighted}
                  isTitleRole={isTitleRole}
                  langTag={primaryMeta.lang}
                  disabled={disabled}
                  showMissingInline
                  inlineLeadIn={inlineLeadIn}
                  bodyStyle={primaryBodyStyle}
                  appearancePres={appearancePres}
                  readingKind={meta.readingKind}
                  primarySizeToken={appearancePres.appearance.primaryFontSize}
                  contextualActive={isContextual}
                  contextualPlacement={contextualPlacement}
                  contextualTarget={activeContextualTarget}
                  secondaryChannel={secondaryChannel}
                  workspace={workspace}
                  onPlaySegment={onPlaySegment}
                  onSelectSegment={onSelectSegment}
                  onSelectContextualSegment={onSelectContextualSegment}
                />

                {resolvedUnitTarget && contextualPlacement === 'below' && (
                  <ContextualBlockCallout
                    placement="below"
                    target={resolvedUnitTarget}
                    secondaryChannel={secondaryChannel}
                    workspace={workspace}
                    bodyStyle={contextualBlockBodyStyle}
                    appearancePres={appearancePres}
                    divergedFromAudible={contextualDiverged}
                    audibleTarget={contextualAudibleTarget}
                    onPlaySegment={onPlaySegment}
                    disabled={disabled}
                    onFollowContextualAudible={onFollowContextualAudible}
                    onDismissContextualTarget={onDismissContextualTarget}
                  />
                )}

                {resolvedUnitTarget && contextualPlacement === 'inline' && (contextualDiverged || resolvedUnitTarget.source === 'manual') && (
                  <div
                    data-shared-contextual-inline-controls="true"
                    className="mt-2 flex flex-wrap items-center gap-2 text-left"
                  >
                    <ContextualSourceBadge source={resolvedUnitTarget.source} />
                    {contextualDiverged && (
                      <ContextualReturnToPlayingButton
                        audibleTarget={contextualAudibleTarget}
                        onFollowContextualAudible={onFollowContextualAudible}
                      />
                    )}
                    {resolvedUnitTarget.source === 'manual' && typeof onDismissContextualTarget === 'function' && (
                      <button
                        type="button"
                        onClick={onDismissContextualTarget}
                        data-shared-contextual-dismiss="true"
                        className="min-h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        <X aria-hidden="true" className="w-3 h-3" />
                        <span>Hide</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          />
        );
      })}
    </div>
  );
};

export default SharedBilingualUnitsBody;
