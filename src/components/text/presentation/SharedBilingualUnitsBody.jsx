import React, { useMemo } from 'react';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE
} from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import TextSegmentInteraction from './TextSegmentInteraction.jsx';
import {
  IDLE_SHARED_CURSOR,
  buildCardSegmentIndexMap,
  buildCardSpeakerAppearanceMap,
  buildConversationBodyStyle,
  buildParagraphBodyStyle,
  buildSharedSegmentRenderFlags,
  getSharedUnitHeading,
  getSharedUnitTerms,
  normalizeSegmentDisplayText,
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

const CardChannelFlowBody = ({
  units,
  authoredUnitIndexByViewKey,
  channel,
  indexById,
  speakerAppearanceMap,
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
  showSectionHeaders,
  showMissingInline,
  workspaceStylePresentation,
  onPlaySegment,
  onSelectSegment = null
}) => {
  const isMeaning = channel === 'meaning';
  const proseTypography = isTitleRole
    ? (isMeaning
        ? 'text-base sm:text-[1.0625rem] leading-[1.72] text-slate-600 dark:text-slate-300'
        : 'text-lg sm:text-[1.25rem] font-medium leading-[1.72] tracking-[-0.01em] text-slate-900 dark:text-slate-50')
    : (isMeaning
        ? 'text-[0.96875rem] sm:text-base leading-[1.75] text-slate-700 dark:text-slate-200'
        : 'text-[1.0625rem] sm:text-[1.125rem] leading-[1.8] text-slate-800 dark:text-slate-100');

  const paragraphBodyStyle = buildParagraphBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    isTitleRole,
    allowIndent: true
  });
  const conversationBodyStyle = buildConversationBodyStyle({
    workspaceStyle: workspaceStylePresentation.style
  });
  const { speakerLayout, showAccents } = workspaceStylePresentation;

  return (
    <div
      className="space-y-5"
      data-shared-card-flow={channel}
      data-shared-full-channel-highlight={fullChannelHighlighted ? 'true' : undefined}
    >
      {units.map((unit, unitIndex) => {
        const authoredUnitIndex = authoredUnitIndexByViewKey?.get(unit.viewKey) ?? unitIndex;
        const unitSegments = unit.segments || [];
        const isTurn = unit.kind === 'turn';
        const speakerInfo = isTurn
          ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
          : null;
        const prevUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
        const prevSpeakerInfo = prevUnit?.kind === 'turn'
          ? resolveTurnSpeakerPresentation({ unit: prevUnit, appearanceMap: speakerAppearanceMap })
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
        const hasAnyContent = unitSegments.some(segment => (
          Boolean(normalizeSegmentDisplayText(isMeaning ? segment.meaning : segment.text))
        ));
        const bodyStyle = isTurn ? conversationBodyStyle : paragraphBodyStyle;
        const useAlignedTurn = isTurn && showSectionHeaders && speakerLayout === 'aligned';
        const useInlineTurn = isTurn && showSectionHeaders && speakerLayout === 'inline';
        const useStackedTurn = isTurn && showSectionHeaders && speakerLayout === 'stacked';
        const accentClass = resolveUnitAccentClass({
          isTurn,
          isTitleRole,
          showAccents,
          speakerInfo,
          isAudibleTurn
        });

        const renderFlowContent = () => {
          if (unitSegments.length === 0) {
            return (
              <p className="text-left text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-section={unit.viewKey}>
                {useInlineTurn && <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />}
                Empty {getSharedUnitTerms(unit).lower} — no sentences yet.
              </p>
            );
          }
          if (!hasAnyContent && !showMissingInline) {
            return (
              <p className="text-left text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-channel={channel}>
                {useInlineTurn && <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />}
                {`No ${isMeaning ? 'Indonesian meaning' : 'English text'} in this ${getSharedUnitTerms(unit).lower} yet.`}
              </p>
            );
          }
          return (
            <div
              lang={langTag}
              data-shared-reading-body="true"
              data-shared-reading-channel={channel}
              data-shared-reading-kind={isTurn ? 'turn' : isTitleRole ? 'title' : 'paragraph'}
              data-shared-reading-align={bodyStyle.textAlign}
              data-shared-paragraph-indent-applied={!isTurn && paragraphBodyStyle.indentApplied ? 'true' : 'false'}
              style={bodyStyle.inlineStyle}
              className={`max-w-[66ch] min-w-0 break-words whitespace-pre-line ${bodyStyle.className} ${proseTypography}`}
            >
              {useInlineTurn && <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />}
              {unitSegments.map((segment, segIdx) => {
                const content = normalizeSegmentDisplayText(isMeaning ? segment.meaning : segment.text);
                const logicalIndex = indexById.get(segment.id) ?? segIdx;
                if (!content) {
                  if (!showMissingInline) return null;
                  return (
                    <React.Fragment key={`${channel}-${segment.id}-missing`}>
                      <span
                        data-shared-card-missing-meaning={isMeaning ? segment.id : undefined}
                        data-shared-card-missing-text={!isMeaning ? segment.id : undefined}
                        className="inline text-xs italic text-slate-400 dark:text-slate-500 select-none"
                      >
                        [{`#${logicalIndex + 1}: `}{isMeaning ? 'no meaning' : 'no text'}]
                      </span>
                      {segIdx < unitSegments.length - 1 ? ' ' : null}
                    </React.Fragment>
                  );
                }
                const flags = buildSharedSegmentRenderFlags({
                  segment,
                  logicalIndex,
                  channel,
                  cursor,
                  isSpeakingCard,
                  fullChannelHighlighted,
                  focusSegmentId,
                  selectedSegmentId,
                  selectionOnly,
                  playableSegmentIds,
                  audioCoverageMap,
                  disabled
                });
                const nextHasRenderable = unitSegments.slice(segIdx + 1).some(item => (
                  showMissingInline || Boolean(normalizeSegmentDisplayText(isMeaning ? item.meaning : item.text))
                ));
                return (
                  <React.Fragment key={`${channel}-${segment.id}`}>
                    <TextSegmentInteraction
                      segmentId={segment.id}
                      channel={channel}
                      interactive
                      disabled={flags.segmentDisabled}
                      active={flags.active}
                      speaking={flags.speaking}
                      focused={flags.focused}
                      fullChannelHighlighted={flags.fullChannelHighlighted}
                      className={flags.className}
                      dataAttributes={flags.dataAttributes}
                      title={flags.title}
                      accessibleLabel={flags.accessibleLabel}
                      onActivate={selectionOnly ? onSelectSegment : onPlaySegment}
                    >
                      {content}
                    </TextSegmentInteraction>
                    {renderChannelJoinSeparator(segment, nextHasRenderable)}
                  </React.Fragment>
                );
              })}
            </div>
          );
        };

        return (
          <section
            key={`${channel}-${unit.viewKey}`}
            data-shared-card-unit={unit.viewKey}
            data-shared-card-unit-id={unit.id || undefined}
            data-shared-card-identity-source={unit.identitySource}
            data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
            data-shared-turn-audible={isAudibleTurn ? 'true' : undefined}
            data-shared-turn-layout={isTurn ? speakerLayout : undefined}
            data-shared-unit-accent={showAccents ? 'on' : 'off'}
            className={`${unitIndex > 0 ? 'pt-5 border-t border-slate-200/75 dark:border-slate-800/80' : ''}`}
          >
            <div className={accentClass}>
              {showSectionHeaders && !isTurn && (
                <UnitHeadingBlock
                  unit={unit}
                  unitIndex={authoredUnitIndex}
                  compact
                  showAccents={showAccents}
                />
              )}
              {useStackedTurn && (
                <UnitHeadingBlock
                  unit={unit}
                  unitIndex={authoredUnitIndex}
                  speakerInfo={speakerInfo}
                  isRepeatedSpeaker={isRepeatedSpeaker}
                  isAudibleTurn={isAudibleTurn}
                  cursorState={cursor.state}
                  compact
                  showAccents={showAccents}
                />
              )}
              {useInlineTurn && (
                <InlineTurnMetaStrip
                  unit={unit}
                  unitIndex={authoredUnitIndex}
                  speakerInfo={speakerInfo}
                  isRepeatedSpeaker={isRepeatedSpeaker}
                  isAudibleTurn={isAudibleTurn}
                  cursorState={cursor.state}
                />
              )}
              {useAlignedTurn ? (
                <div
                  className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(7rem,9.75rem)_minmax(0,1fr)] sm:gap-x-4 sm:items-start min-w-0"
                  data-shared-turn-aligned-grid={unit.viewKey}
                >
                  <AlignedSpeakerColumn
                    unit={unit}
                    unitIndex={authoredUnitIndex}
                    speakerInfo={speakerInfo}
                    isRepeatedSpeaker={isRepeatedSpeaker}
                    isAudibleTurn={isAudibleTurn}
                    cursorState={cursor.state}
                    showAccents={showAccents}
                  />
                  <div className="min-w-0" data-shared-turn-body-column="true">
                    {renderFlowContent()}
                  </div>
                </div>
              ) : (
                renderFlowContent()
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const CardInterlinearBody = ({
  units,
  authoredUnitIndexByViewKey,
  indexById,
  speakerAppearanceMap,
  cursor,
  focusSegmentId,
  selectedSegmentId = null,
  selectionOnly = false,
  playableSegmentIds,
  audioCoverageMap,
  isSpeakingCard,
  isTitleRole,
  textLang,
  meaningLang,
  disabled,
  showSectionHeaders,
  showSegmentNumbers = true,
  workspaceStylePresentation,
  onPlaySegment,
  onSelectSegment = null
}) => {
  const fullTextHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text';
  const fullMeaningHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning';

  // Sentence Interlinear stacks individual segment pairs; never indent each Segment.
  const paragraphBodyStyle = buildParagraphBodyStyle({
    workspaceStyle: workspaceStylePresentation.style,
    isTitleRole,
    allowIndent: false
  });
  const conversationBodyStyle = buildConversationBodyStyle({
    workspaceStyle: workspaceStylePresentation.style
  });
  const { speakerLayout, showAccents } = workspaceStylePresentation;

  return (
    <div className="space-y-6" data-shared-card-flow="interlinear">
      {units.map((unit, unitIndex) => {
        const authoredUnitIndex = authoredUnitIndexByViewKey?.get(unit.viewKey) ?? unitIndex;
        const unitSegments = unit.segments || [];
        const isTurn = unit.kind === 'turn';
        const speakerInfo = isTurn
          ? resolveTurnSpeakerPresentation({ unit, appearanceMap: speakerAppearanceMap })
          : null;
        const prevUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
        const prevSpeakerInfo = prevUnit?.kind === 'turn'
          ? resolveTurnSpeakerPresentation({ unit: prevUnit, appearanceMap: speakerAppearanceMap })
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
        const bodyStyle = isTurn ? conversationBodyStyle : paragraphBodyStyle;
        const useAlignedTurn = isTurn && showSectionHeaders && speakerLayout === 'aligned';
        const useInlineTurn = isTurn && showSectionHeaders && speakerLayout === 'inline';
        const useStackedTurn = isTurn && showSectionHeaders && speakerLayout === 'stacked';
        const accentClass = resolveUnitAccentClass({
          isTurn,
          isTitleRole,
          showAccents,
          speakerInfo,
          isAudibleTurn
        });

        const renderSegmentsList = () => {
          if (unitSegments.length === 0) {
            return (
              <p className="text-left text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-section={unit.viewKey}>
                {useInlineTurn && <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />}
                Empty {getSharedUnitTerms(unit).lower} — no sentences yet.
              </p>
            );
          }

          return (
            <div className="space-y-4">
              {unitSegments.map((segment, segIdx) => {
                const logicalIndex = indexById.get(segment.id) ?? segIdx;
                const textContent = normalizeSegmentDisplayText(segment.text);
                const meaningContent = normalizeSegmentDisplayText(segment.meaning);
                const textFlags = buildSharedSegmentRenderFlags({
                  segment,
                  logicalIndex,
                  channel: 'text',
                  cursor,
                  isSpeakingCard,
                  fullChannelHighlighted: fullTextHighlight,
                  focusSegmentId,
                  selectedSegmentId,
                  selectionOnly,
                  playableSegmentIds,
                  audioCoverageMap,
                  disabled
                });
                const meaningFlags = buildSharedSegmentRenderFlags({
                  segment,
                  logicalIndex,
                  channel: 'meaning',
                  cursor,
                  isSpeakingCard,
                  fullChannelHighlighted: fullMeaningHighlight,
                  focusSegmentId,
                  selectedSegmentId,
                  selectionOnly,
                  playableSegmentIds,
                  audioCoverageMap,
                  disabled
                });
                const active = textFlags.active;
                const focused = textFlags.focused;

                return (
                  <div
                    key={segment.id}
                    data-shared-card-segment-pair={segment.id}
                    data-shared-card-index={logicalIndex + 1}
                    className={
                      showSegmentNumbers
                        ? 'grid grid-cols-[1.6rem_minmax(0,1fr)] gap-x-2.5 items-baseline'
                        : 'block'
                    }
                  >
                    {showSegmentNumbers && (
                      <span
                        aria-hidden="true"
                        className={`select-none text-xs tabular-nums text-right ${
                          active
                            ? 'font-bold text-indigo-600 dark:text-indigo-400'
                            : focused
                              ? 'font-bold text-amber-600 dark:text-amber-400'
                              : 'font-medium text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {logicalIndex + 1}
                      </span>
                    )}
                    <div className="min-w-0 max-w-[66ch] space-y-1.5">
                      <div
                        lang={textLang}
                        data-shared-reading-body="true"
                        data-shared-reading-channel="text"
                        data-shared-reading-kind={isTurn ? 'turn' : isTitleRole ? 'title' : 'paragraph'}
                        data-shared-reading-align={bodyStyle.textAlign}
                        data-shared-paragraph-indent-applied="false"
                        style={bodyStyle.inlineStyle}
                        className={`break-words whitespace-pre-line ${bodyStyle.className} ${
                          isTitleRole
                            ? 'text-lg sm:text-[1.25rem] font-medium leading-[1.72] tracking-[-0.01em] text-slate-900 dark:text-slate-50'
                            : 'text-[1.0625rem] sm:text-[1.125rem] font-normal leading-[1.74] text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {useInlineTurn && segIdx === 0 && (
                          <InlineSpeakerLeadIn unit={unit} speakerInfo={speakerInfo} />
                        )}
                        {textContent ? (
                          <TextSegmentInteraction
                            segmentId={segment.id}
                            channel="text"
                            interactive
                            disabled={textFlags.segmentDisabled}
                            active={textFlags.active}
                            speaking={textFlags.speaking}
                            focused={textFlags.focused}
                            fullChannelHighlighted={textFlags.fullChannelHighlighted}
                            className={textFlags.className}
                            dataAttributes={textFlags.dataAttributes}
                            title={textFlags.title}
                            accessibleLabel={textFlags.accessibleLabel}
                            onActivate={selectionOnly ? onSelectSegment : onPlaySegment}
                          >
                            {textContent}
                          </TextSegmentInteraction>
                        ) : (
                          <span
                            data-shared-card-missing-text={segment.id}
                            className="text-xs italic text-slate-400 dark:text-slate-500 select-none"
                          >
                            No English text
                          </span>
                        )}
                      </div>

                      <div
                        lang={meaningLang}
                        data-shared-reading-body="true"
                        data-shared-reading-channel="meaning"
                        data-shared-reading-kind={isTurn ? 'turn' : isTitleRole ? 'title' : 'paragraph'}
                        data-shared-reading-align={bodyStyle.textAlign}
                        data-shared-paragraph-indent-applied="false"
                        style={bodyStyle.inlineStyle}
                        className={`break-words whitespace-pre-line text-[0.9375rem] sm:text-[0.96875rem] leading-[1.62] text-slate-600 dark:text-slate-300 ${bodyStyle.className}`}
                      >
                        {meaningContent ? (
                          <TextSegmentInteraction
                            segmentId={segment.id}
                            channel="meaning"
                            interactive
                            disabled={meaningFlags.segmentDisabled}
                            active={meaningFlags.active}
                            speaking={meaningFlags.speaking}
                            focused={meaningFlags.focused}
                            fullChannelHighlighted={meaningFlags.fullChannelHighlighted}
                            className={meaningFlags.className}
                            dataAttributes={meaningFlags.dataAttributes}
                            title={meaningFlags.title}
                            accessibleLabel={meaningFlags.accessibleLabel}
                            onActivate={selectionOnly ? onSelectSegment : onPlaySegment}
                          >
                            {meaningContent}
                          </TextSegmentInteraction>
                        ) : (
                          <span
                            data-shared-card-missing-meaning={segment.id}
                            className="text-xs italic text-slate-400 dark:text-slate-500 select-none"
                          >
                            No Indonesian meaning
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        };

        return (
          <section
            key={unit.viewKey}
            data-shared-card-unit={unit.viewKey}
            data-shared-card-unit-id={unit.id || undefined}
            data-shared-card-identity-source={unit.identitySource}
            data-shared-turn-speaker-palette={speakerInfo?.palette?.id || undefined}
            data-shared-turn-audible={isAudibleTurn ? 'true' : undefined}
            data-shared-turn-layout={isTurn ? speakerLayout : undefined}
            data-shared-unit-accent={showAccents ? 'on' : 'off'}
            className={unitIndex > 0 ? 'pt-5 border-t border-slate-200/75 dark:border-slate-800/80' : ''}
          >
            <div className={accentClass}>
              {showSectionHeaders && !isTurn && (
                <UnitHeadingBlock
                  unit={unit}
                  unitIndex={authoredUnitIndex}
                  showAccents={showAccents}
                />
              )}
              {useStackedTurn && (
                <UnitHeadingBlock
                  unit={unit}
                  unitIndex={authoredUnitIndex}
                  speakerInfo={speakerInfo}
                  isRepeatedSpeaker={isRepeatedSpeaker}
                  isAudibleTurn={isAudibleTurn}
                  cursorState={cursor.state}
                  showAccents={showAccents}
                />
              )}
              {useInlineTurn && (
                <InlineTurnMetaStrip
                  unit={unit}
                  unitIndex={authoredUnitIndex}
                  speakerInfo={speakerInfo}
                  isRepeatedSpeaker={isRepeatedSpeaker}
                  isAudibleTurn={isAudibleTurn}
                  cursorState={cursor.state}
                />
              )}
              {useAlignedTurn ? (
                <div
                  className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(7rem,9.75rem)_minmax(0,1fr)] sm:gap-x-4 sm:items-start min-w-0"
                  data-shared-turn-aligned-grid={unit.viewKey}
                >
                  <AlignedSpeakerColumn
                    unit={unit}
                    unitIndex={authoredUnitIndex}
                    speakerInfo={speakerInfo}
                    isRepeatedSpeaker={isRepeatedSpeaker}
                    isAudibleTurn={isAudibleTurn}
                    cursorState={cursor.state}
                    showAccents={showAccents}
                  />
                  <div className="min-w-0" data-shared-turn-body-column="true">
                    {renderSegmentsList()}
                  </div>
                </div>
              ) : (
                renderSegmentsList()
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

/**
 * Shared bilingual reading renderer across Full, Card, Focus, and Segment views.
 * Accepts any unit slice while keeping logical Sentence numbering anchored to `card`
 * and consuming normalized view-only Workspace Style settings.
 */
export const SharedBilingualUnitsBody = ({
  card,
  unitsOverride = null,
  workspace = null,
  speakerAppearanceMap = null,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  workspaceStyle = DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  selectedSegmentId = null,
  selectionOnly = false,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  forceSectionHeaders = null,
  showSegmentNumbers = true,
  onPlaySegment,
  onSelectSegment = null
}) => {
  const units = unitsOverride || card?.units || [];
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
  const hasMultipleUnits = units.length > 1;
  const hasPersistentEmpty = units.some(unit => unit.identitySource === 'persistent' && (unit.segments?.length || 0) === 0);
  const showSectionHeaders = forceSectionHeaders !== null ? forceSectionHeaders : (card?.blockType === 'conversation' || hasMultipleUnits || hasPersistentEmpty);
  const textLang = workspace?.textLanguage || 'en';
  const meaningLang = workspace?.meaningLanguage || 'id';

  const workspaceStyleAttrs = {
    'data-shared-workspace-align': workspaceStylePresentation.style.textAlign,
    'data-shared-workspace-indent': workspaceStylePresentation.style.paragraphIndent ? 'on' : 'off',
    'data-shared-workspace-speaker-layout': workspaceStylePresentation.style.speakerLayout,
    'data-shared-workspace-accents': workspaceStylePresentation.style.showAccents ? 'on' : 'off'
  };

  if (units.length === 0) {
    return (
      <p
        className="text-left text-sm italic text-slate-400 dark:text-slate-500"
        data-shared-card-empty="zero-units"
        {...workspaceStyleAttrs}
      >
        No {getSharedUnitTerms(card).plural} in this {getSharedUnitTerms(card).cardLower} yet.
      </p>
    );
  }

  if (bilingualLayout === 'separated') {
    return (
      <div className="space-y-6" data-shared-card-separated="true" {...workspaceStyleAttrs}>
        <div>
          <p className="mb-3 text-left text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 select-none">
            English
          </p>
          <CardChannelFlowBody
            units={units}
            authoredUnitIndexByViewKey={authoredUnitIndexByViewKey}
            channel="text"
            indexById={indexById}
            speakerAppearanceMap={resolvedSpeakerMap}
            cursor={cursor}
            focusSegmentId={focusSegmentId}
            selectedSegmentId={selectedSegmentId}
            selectionOnly={selectionOnly}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            isSpeakingCard={isSpeakingCard}
            fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text'}
            isTitleRole={isTitleRole}
            langTag={textLang}
            disabled={disabled}
            showSectionHeaders={showSectionHeaders}
            showMissingInline={false}
            workspaceStylePresentation={workspaceStylePresentation}
            onPlaySegment={onPlaySegment}
            onSelectSegment={onSelectSegment}
          />
        </div>
        <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800">
          <p className="mb-3 text-left text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 select-none">
            Indonesian Meaning
          </p>
          <CardChannelFlowBody
            units={units}
            authoredUnitIndexByViewKey={authoredUnitIndexByViewKey}
            channel="meaning"
            indexById={indexById}
            speakerAppearanceMap={resolvedSpeakerMap}
            cursor={cursor}
            focusSegmentId={focusSegmentId}
            selectedSegmentId={selectedSegmentId}
            selectionOnly={selectionOnly}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            isSpeakingCard={isSpeakingCard}
            fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning'}
            isTitleRole={isTitleRole}
            langTag={meaningLang}
            disabled={disabled}
            showSectionHeaders={showSectionHeaders}
            showMissingInline={false}
            workspaceStylePresentation={workspaceStylePresentation}
            onPlaySegment={onPlaySegment}
            onSelectSegment={onSelectSegment}
          />
        </div>
      </div>
    );
  }

  if (bilingualLayout === 'text-only' || bilingualLayout === 'meaning-only') {
    const channel = bilingualLayout === 'meaning-only' ? 'meaning' : 'text';
    return (
      <div {...workspaceStyleAttrs}>
        <CardChannelFlowBody
          units={units}
          authoredUnitIndexByViewKey={authoredUnitIndexByViewKey}
          channel={channel}
          indexById={indexById}
          speakerAppearanceMap={resolvedSpeakerMap}
          cursor={cursor}
          focusSegmentId={focusSegmentId}
          selectedSegmentId={selectedSegmentId}
          selectionOnly={selectionOnly}
          playableSegmentIds={playableSegmentIds}
          audioCoverageMap={audioCoverageMap}
          isSpeakingCard={isSpeakingCard}
          fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === channel}
          isTitleRole={isTitleRole}
          langTag={channel === 'meaning' ? meaningLang : textLang}
          disabled={disabled}
          showSectionHeaders={showSectionHeaders}
          showMissingInline
          workspaceStylePresentation={workspaceStylePresentation}
          onPlaySegment={onPlaySegment}
          onSelectSegment={onSelectSegment}
        />
      </div>
    );
  }

  return (
    <div {...workspaceStyleAttrs}>
      <CardInterlinearBody
        units={units}
        authoredUnitIndexByViewKey={authoredUnitIndexByViewKey}
        indexById={indexById}
        speakerAppearanceMap={resolvedSpeakerMap}
        cursor={cursor}
        focusSegmentId={focusSegmentId}
        selectedSegmentId={selectedSegmentId}
        selectionOnly={selectionOnly}
        playableSegmentIds={playableSegmentIds}
        audioCoverageMap={audioCoverageMap}
        isSpeakingCard={isSpeakingCard}
        isTitleRole={isTitleRole}
        textLang={textLang}
        meaningLang={meaningLang}
        disabled={disabled}
        showSectionHeaders={showSectionHeaders}
        showSegmentNumbers={showSegmentNumbers}
        workspaceStylePresentation={workspaceStylePresentation}
        onPlaySegment={onPlaySegment}
        onSelectSegment={onSelectSegment}
      />
    </div>
  );
};

export default SharedBilingualUnitsBody;
