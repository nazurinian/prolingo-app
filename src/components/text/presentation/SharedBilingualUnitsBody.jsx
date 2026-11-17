import React, { useMemo } from 'react';
import { DEFAULT_TEXT_CARD_PRESENTATION_STATE } from '../../../domain/text/textCardPresentationStateDomain.js';
import { TEXT_PARAGRAPH_CARD_ROLES } from '../../../domain/text/textParagraphRoleDomain.js';
import TextSegmentInteraction from './TextSegmentInteraction.jsx';
import {
  IDLE_SHARED_CURSOR,
  getSharedUnitTerms,
  getSharedUnitHeading,
  buildCardSegmentIndexMap,
  buildSharedSegmentRenderFlags,
  normalizeSegmentDisplayText,
  resolveSegmentJoinSeparator
} from './sharedCardPresentationUtils.js';

const renderChannelJoinSeparator = (segment, hasNextSegment) => {
  if (!hasNextSegment) return null;
  const separator = resolveSegmentJoinSeparator(segment?.joinAfter);
  if (separator === '') return null;
  if (separator === '\n') return <br aria-hidden="true" />;
  return ' ';
};

const CardChannelFlowBody = ({
  units,
  channel,
  indexById,
  cursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  isSpeakingCard,
  fullChannelHighlighted,
  isTitleRole,
  langTag,
  disabled,
  showSectionHeaders,
  showMissingInline,
  onPlaySegment
}) => {
  const isMeaning = channel === 'meaning';
  const proseTypography = isTitleRole
    ? (isMeaning
        ? 'text-base sm:text-[1.0625rem] leading-[1.72] text-slate-600 dark:text-slate-300'
        : 'text-lg sm:text-[1.25rem] font-medium leading-[1.72] tracking-[-0.01em] text-slate-900 dark:text-slate-50')
    : (isMeaning
        ? 'text-[0.96875rem] sm:text-base leading-[1.75] text-slate-700 dark:text-slate-200'
        : 'text-[1.0625rem] sm:text-[1.125rem] leading-[1.8] text-slate-800 dark:text-slate-100');

  return (
    <div
      className="space-y-5"
      data-shared-card-flow={channel}
      data-shared-full-channel-highlight={fullChannelHighlighted ? 'true' : undefined}
    >
      {units.map((unit, unitIndex) => {
        const unitSegments = unit.segments || [];
        const hasAnyContent = unitSegments.some(segment => (
          Boolean(normalizeSegmentDisplayText(isMeaning ? segment.meaning : segment.text))
        ));
        return (
          <section
            key={`${channel}-${unit.viewKey}`}
            data-shared-card-unit={unit.viewKey}
            data-shared-card-unit-id={unit.id || undefined}
            data-shared-card-identity-source={unit.identitySource}
            className={unitIndex > 0 ? 'pt-5 border-t border-slate-200/75 dark:border-slate-800/80' : ''}
          >
            {showSectionHeaders && (
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                {getSharedUnitHeading(unit, unitIndex)}
              </p>
            )}
            {unitSegments.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-section={unit.viewKey}>
                Empty {getSharedUnitTerms(unit).lower} — no sentences yet.
              </p>
            ) : !hasAnyContent && !showMissingInline ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-channel={channel}>
                {`No ${isMeaning ? 'Indonesian meaning' : 'English text'} in this ${getSharedUnitTerms(unit).lower} yet.`}
              </p>
            ) : (
              <div lang={langTag} className={`max-w-[66ch] text-left break-words whitespace-pre-line ${proseTypography}`}>
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
                        dataAttributes={flags.dataAttributes}
                        title={flags.title}
                        accessibleLabel={flags.accessibleLabel}
                        onActivate={onPlaySegment}
                      >
                        {content}
                      </TextSegmentInteraction>
                      {renderChannelJoinSeparator(segment, nextHasRenderable)}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

const CardInterlinearBody = ({
  units,
  indexById,
  cursor,
  focusSegmentId,
  playableSegmentIds,
  audioCoverageMap,
  isSpeakingCard,
  isTitleRole,
  textLang,
  meaningLang,
  disabled,
  showSectionHeaders,
  showSegmentNumbers = true,
  onPlaySegment
}) => {
  const fullTextHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text';
  const fullMeaningHighlight = isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning';

  return (
    <div className="space-y-6" data-shared-card-flow="interlinear">
      {units.map((unit, unitIndex) => {
        const unitSegments = unit.segments || [];
        return (
          <section
            key={unit.viewKey}
            data-shared-card-unit={unit.viewKey}
            data-shared-card-unit-id={unit.id || undefined}
            data-shared-card-identity-source={unit.identitySource}
            className={unitIndex > 0 ? 'pt-5 border-t border-slate-200/75 dark:border-slate-800/80' : ''}
          >
            {showSectionHeaders && (
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                {getSharedUnitHeading(unit, unitIndex)}
              </p>
            )}
            {unitSegments.length === 0 ? (
              <p className="text-sm italic text-slate-400 dark:text-slate-500" data-shared-card-empty-section={unit.viewKey}>
                Empty {getSharedUnitTerms(unit).lower} — no sentences yet.
              </p>
            ) : (
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
                          className={`text-left break-words whitespace-pre-line ${
                            isTitleRole
                              ? 'text-lg sm:text-[1.25rem] font-medium leading-[1.72] tracking-[-0.01em] text-slate-900 dark:text-slate-50'
                              : 'text-[1.0625rem] sm:text-[1.125rem] font-normal leading-[1.74] text-slate-900 dark:text-slate-100'
                          }`}
                        >
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
                              dataAttributes={textFlags.dataAttributes}
                              title={textFlags.title}
                              accessibleLabel={textFlags.accessibleLabel}
                              onActivate={onPlaySegment}
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
                          className="text-left break-words whitespace-pre-line text-[0.9375rem] sm:text-[0.96875rem] leading-[1.62] text-slate-600 dark:text-slate-300"
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
                              dataAttributes={meaningFlags.dataAttributes}
                              title={meaningFlags.title}
                              accessibleLabel={meaningFlags.accessibleLabel}
                              onActivate={onPlaySegment}
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
            )}
          </section>
        );
      })}
    </div>
  );
};

/**
 * Shared bilingual reading renderer across Full Card and Part Section views.
 * Accepts any unit slice while keeping logical Sentence numbering anchored to `card`.
 */
export const SharedBilingualUnitsBody = ({
  card,
  unitsOverride = null,
  workspace = null,
  bilingualLayout = DEFAULT_TEXT_CARD_PRESENTATION_STATE.bilingualLayout,
  playbackCursor = IDLE_SHARED_CURSOR,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false,
  forceSectionHeaders = null,
  showSegmentNumbers = true,
  onPlaySegment
}) => {
  const units = unitsOverride || card?.units || [];
  const isTitleRole = card?.paragraphRole === TEXT_PARAGRAPH_CARD_ROLES.TITLE;
  const cursor = playbackCursor || IDLE_SHARED_CURSOR;
  const isSpeakingCard = Boolean(cursor.cardId === card?.id && (cursor.state === 'playing' || cursor.state === 'paused'));
  const { indexById } = useMemo(() => buildCardSegmentIndexMap(card), [card]);
  const hasMultipleUnits = units.length > 1;
  const hasPersistentEmpty = units.some(unit => unit.identitySource === 'persistent' && (unit.segments?.length || 0) === 0);
  const showSectionHeaders = forceSectionHeaders !== null ? forceSectionHeaders : (card?.blockType === 'conversation' || hasMultipleUnits || hasPersistentEmpty);
  const textLang = workspace?.textLanguage || 'en';
  const meaningLang = workspace?.meaningLanguage || 'id';

  if (units.length === 0) {
    return (
      <p
        className="text-sm italic text-slate-400 dark:text-slate-500"
        data-shared-card-empty="zero-units"
      >
        No {getSharedUnitTerms(card).plural} in this card yet.
      </p>
    );
  }

  if (bilingualLayout === 'separated') {
    return (
      <div className="space-y-6" data-shared-card-separated="true">
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 select-none">
            English
          </p>
          <CardChannelFlowBody
            units={units}
            channel="text"
            indexById={indexById}
            cursor={cursor}
            focusSegmentId={focusSegmentId}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            isSpeakingCard={isSpeakingCard}
            fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'text'}
            isTitleRole={isTitleRole}
            langTag={textLang}
            disabled={disabled}
            showSectionHeaders={showSectionHeaders}
            showMissingInline={false}
            onPlaySegment={onPlaySegment}
          />
        </div>
        <div className="pt-6 border-t border-slate-200/80 dark:border-slate-800">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 select-none">
            Indonesian Meaning
          </p>
          <CardChannelFlowBody
            units={units}
            channel="meaning"
            indexById={indexById}
            cursor={cursor}
            focusSegmentId={focusSegmentId}
            playableSegmentIds={playableSegmentIds}
            audioCoverageMap={audioCoverageMap}
            isSpeakingCard={isSpeakingCard}
            fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === 'meaning'}
            isTitleRole={isTitleRole}
            langTag={meaningLang}
            disabled={disabled}
            showSectionHeaders={showSectionHeaders}
            showMissingInline={false}
            onPlaySegment={onPlaySegment}
          />
        </div>
      </div>
    );
  }

  if (bilingualLayout === 'text-only' || bilingualLayout === 'meaning-only') {
    const channel = bilingualLayout === 'meaning-only' ? 'meaning' : 'text';
    return (
      <CardChannelFlowBody
        units={units}
        channel={channel}
        indexById={indexById}
        cursor={cursor}
        focusSegmentId={focusSegmentId}
        playableSegmentIds={playableSegmentIds}
        audioCoverageMap={audioCoverageMap}
        isSpeakingCard={isSpeakingCard}
        fullChannelHighlighted={isSpeakingCard && cursor.precision === 'card' && cursor.channel === channel}
        isTitleRole={isTitleRole}
        langTag={channel === 'meaning' ? meaningLang : textLang}
        disabled={disabled}
        showSectionHeaders={showSectionHeaders}
        showMissingInline
        onPlaySegment={onPlaySegment}
      />
    );
  }

  return (
    <CardInterlinearBody
      units={units}
      indexById={indexById}
      cursor={cursor}
      focusSegmentId={focusSegmentId}
      playableSegmentIds={playableSegmentIds}
      audioCoverageMap={audioCoverageMap}
      isSpeakingCard={isSpeakingCard}
      isTitleRole={isTitleRole}
      textLang={textLang}
      meaningLang={meaningLang}
      disabled={disabled}
      showSectionHeaders={showSectionHeaders}
      showSegmentNumbers={showSegmentNumbers}
      onPlaySegment={onPlaySegment}
    />
  );
};

export default SharedBilingualUnitsBody;
