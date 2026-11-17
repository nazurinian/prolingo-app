import { buildTextStructuredRuntimeAudioKey } from '../../../domain/text/textStructuredAudioRuntimeDomain.js';
import { summarizeTextStructuredAudioCoverage, TEXT_AUDIO_COVERAGE_STATUS } from '../../../domain/text/textStructuredAudioCoverageDomain.js';

export const SHARED_BILINGUAL_LAYOUT_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'interlinear',
    label: 'Combined',
    description: 'Pair each English sentence directly above its Indonesian meaning'
  }),
  Object.freeze({
    id: 'separated',
    label: 'Separated',
    description: 'Read the full English passage first, followed by the Indonesian passage'
  }),
  Object.freeze({
    id: 'text-only',
    label: 'EN Only',
    description: 'Display English text only without changing audio playback'
  }),
  Object.freeze({
    id: 'meaning-only',
    label: 'ID Only',
    description: 'Display Indonesian meanings only without changing audio playback'
  })
]);

export const normalizeSegmentDisplayText = value => String(value ?? '').trim();

const SECTION_TERMS = Object.freeze({ label: 'Section', lower: 'section', plural: 'sections' });
const TURN_TERMS = Object.freeze({ label: 'Speaker Turn', lower: 'speaker turn', plural: 'speaker turns' });
export const getSharedUnitTerms = unitOrCard => unitOrCard?.kind === 'turn' || unitOrCard?.blockType === 'conversation'
  ? TURN_TERMS : SECTION_TERMS;
export const getSharedUnitHeading = (unit, index) => `${unit?.label || getSharedUnitTerms(unit).label} ${index + 1}`
  + (unit?.kind === 'turn' ? ` · ${unit.speakerLabel || 'Unassigned speaker'}` : '');

export const IDLE_SHARED_CURSOR = Object.freeze({
  workspaceId: null,
  workspaceUid: null,
  sessionId: null,
  state: 'idle',
  cardId: null,
  unitId: null,
  segmentId: null,
  channel: null,
  precision: 'none'
});

/**
 * Single authoritative builder for TextSegmentInteraction props shared across
 * Full, Part, and Segment views so speaking, active, search, coverage, and
 * full-channel highlighting never diverge.
 */
export const buildSharedSegmentRenderFlags = ({
  segment,
  logicalIndex,
  channel,
  cursor = IDLE_SHARED_CURSOR,
  isSpeakingCard = false,
  fullChannelHighlighted = false,
  focusSegmentId = null,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false
}) => {
  const active = isSpeakingCard && cursor.precision === 'segment' && cursor.segmentId === segment.id;
  const speaking = active && cursor.channel === channel;
  const focused = segment.id === focusSegmentId;
  const playable = playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : true;
  const segmentDisabled = disabled || !playable;
  const isMeaning = channel === 'meaning';

  return {
    active,
    speaking,
    focused,
    playable,
    segmentDisabled,
    fullChannelHighlighted,
    dataAttributes: {
      'data-shared-card-segment': segment.id,
      'data-shared-card-channel': channel,
      'data-shared-card-index': logicalIndex + 1
    },
    title: buildSegmentCoverageTitle({
      segment,
      logicalIndex,
      audioCoverageMap,
      playable,
      disabled
    }),
    accessibleLabel: `Play sentence ${logicalIndex + 1} (${isMeaning ? 'Indonesian meaning' : 'English text'})`
  };
};

export const resolveSegmentJoinSeparator = joinAfter => {
  if (joinAfter === 'none') return '';
  if (joinAfter === 'line') return '\n';
  return ' ';
};

export const buildCardSegmentIndexMap = card => {
  const orderedSegments = [];
  const indexById = new Map();
  let runningIndex = 0;
  for (const unit of card?.units || []) {
    for (const segment of unit?.segments || []) {
      orderedSegments.push(segment);
      indexById.set(segment.id, runningIndex);
      runningIndex += 1;
    }
  }
  return { orderedSegments, indexById };
};

export const resolveCardChannelAvailability = card => {
  let hasText = false;
  let hasMeaning = false;
  for (const unit of card?.units || []) {
    for (const segment of unit?.segments || []) {
      if (!hasText && normalizeSegmentDisplayText(segment?.text)) hasText = true;
      if (!hasMeaning && normalizeSegmentDisplayText(segment?.meaning)) hasMeaning = true;
      if (hasText && hasMeaning) return { hasText, hasMeaning };
    }
  }
  return { hasText, hasMeaning };
};

export const summarizeCardPresentationCoverage = ({ orderedSegments = [], audioCoverageMap = null }) => {
  if (!audioCoverageMap || typeof audioCoverageMap !== 'object') return null;
  // Consume host statuses using the existing authoritative summary. History,
  // metadata-only and unverified entries never become current Ready audio.
  return summarizeTextStructuredAudioCoverage({
    documentTree: { blocks: [{ segments: orderedSegments }] },
    coverageMap: audioCoverageMap
  });
};

export const coverageLabelFor = status => ({
  [TEXT_AUDIO_COVERAGE_STATUS.READY]: 'READY',
  [TEXT_AUDIO_COVERAGE_STATUS.STALE]: 'STALE',
  [TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE]: 'OTHER',
  [TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED]: 'HISTORY',
  [TEXT_AUDIO_COVERAGE_STATUS.METADATA_ONLY]: 'META-ONLY',
  [TEXT_AUDIO_COVERAGE_STATUS.LEGACY_UNVERIFIED]: 'UNVERIFIED',
  [TEXT_AUDIO_COVERAGE_STATUS.OTHER_PROFILE]: 'OTHER PROFILE',
  [TEXT_AUDIO_COVERAGE_STATUS.MISSING]: 'MISSING'
}[status] || 'MISSING');

export const buildSegmentCoverageTitle = ({
  segment,
  logicalIndex,
  audioCoverageMap = null,
  playable = true,
  disabled = false
}) => {
  const parts = [`Sentence ${logicalIndex + 1}`];
  const hasText = Boolean(normalizeSegmentDisplayText(segment?.text));
  const hasMeaning = Boolean(normalizeSegmentDisplayText(segment?.meaning));
  if (audioCoverageMap) {
    if (hasText) {
      const textCoverage = audioCoverageMap[buildTextStructuredRuntimeAudioKey(segment.id, 'text')];
      parts.push(`EN ${coverageLabelFor(textCoverage?.status)}`);
    }
    if (hasMeaning) {
      const meaningCoverage = audioCoverageMap[buildTextStructuredRuntimeAudioKey(segment.id, 'meaning')];
      parts.push(`ID ${coverageLabelFor(meaningCoverage?.status)}`);
    }
  }
  if (disabled || !playable) {
    parts.push('Not playable with current Manual Segment settings');
  } else {
    parts.push('Activate to play this sentence only');
  }
  return parts.join(' • ');
};

export const isPrefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
);

export const resolveSafeScrollContainer = element => {
  if (!element || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return null;
  }
  let node = element;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflowY = style?.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 2) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

export const countMissingMeanings = orderedSegments => orderedSegments.filter(
  segment => Boolean(normalizeSegmentDisplayText(segment?.text)) && !normalizeSegmentDisplayText(segment?.meaning)
).length;

export const SHARED_LEVEL_OPTIONS = Object.freeze([
  Object.freeze({ id: 'full', label: 'Full', description: 'Read the complete card continuously' }),
  Object.freeze({ id: 'part', label: 'Part', description: 'Focus on one section at a time' }),
  Object.freeze({ id: 'segment', label: 'Segment', description: 'Focus closely on one sentence at a time' })
]);

export const SHARED_PART_LAYOUT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'horizontal-focus', label: 'Horizontal', description: 'Swipe or step between sections horizontally' }),
  Object.freeze({ id: 'vertical-focus', label: 'Focus', description: 'Emphasize the active section vertically with previous and next neighbors' }),
  Object.freeze({ id: 'vertical-list', label: 'List', description: 'Read all sections stacked vertically in order' })
]);

/**
 * Builds deterministic unit and segment lookups preserving empty sections and blank channels.
 */
export const buildCardUnitLookup = card => {
  const units = Array.isArray(card?.units) ? card.units : [];
  const unitByViewKey = new Map();
  const unitIndexByViewKey = new Map();
  const entries = [];
  const entryBySegmentId = new Map();

  let runningSegmentIndex = 0;
  units.forEach((unit, unitIndex) => {
    unitByViewKey.set(unit.viewKey, unit);
    unitIndexByViewKey.set(unit.viewKey, unitIndex);
    (unit.segments || []).forEach(segment => {
      const entry = {
        segment,
        logicalIndex: runningSegmentIndex,
        unit,
        unitIndex,
        unitViewKey: unit.viewKey
      };
      entries.push(entry);
      entryBySegmentId.set(segment.id, entry);
      runningSegmentIndex += 1;
    });
  });

  return {
    units,
    unitByViewKey,
    unitIndexByViewKey,
    entries,
    entryBySegmentId
  };
};

/**
 * Clamps Previous/Next stepping across ordered Card units (preserving empty units).
 */
export const stepCardUnitViewKey = ({ units = [], currentViewKey = null, delta = 1 }) => {
  if (!units.length) return { nextViewKey: null, nextIndex: -1, atStart: true, atEnd: true };
  const currentIndex = Math.max(0, units.findIndex(u => u.viewKey === currentViewKey));
  const targetIndex = Math.min(units.length - 1, Math.max(0, currentIndex + (delta < 0 ? -1 : 1)));
  return {
    nextViewKey: units[targetIndex].viewKey,
    nextIndex: targetIndex,
    atStart: targetIndex === 0,
    atEnd: targetIndex === units.length - 1
  };
};

/**
 * Clamps Previous/Next stepping across ordered Card segments (never skipping blank Meaning/Text).
 */
export const stepCardSegmentId = ({ entries = [], currentSegmentId = null, delta = 1 }) => {
  if (!entries.length) return { nextSegmentId: null, nextIndex: -1, atStart: true, atEnd: true };
  const currentIndex = Math.max(0, entries.findIndex(e => e.segment.id === currentSegmentId));
  const targetIndex = Math.min(entries.length - 1, Math.max(0, currentIndex + (delta < 0 ? -1 : 1)));
  return {
    nextSegmentId: entries[targetIndex].segment.id,
    nextIndex: targetIndex,
    atStart: targetIndex === 0,
    atEnd: targetIndex === entries.length - 1
  };
};

/**
 * Resolves visible Part and Segment focus deterministically from:
 * 1) undismissed Search focusTarget,
 * 2) manual browse selection during grace (or when not actively stepping Segment audio),
 * 3) authoritative playing Segment cursor (`precision === 'segment'`),
 * 4) validated manual/paused fallback,
 * 5) first available Section / Segment (or explicit empty state for zero-Unit cards).
 */
export const resolveEffectiveCardSelection = ({
  card,
  lookup = null,
  cursor = null,
  focusTarget = null,
  workspaceId = null,
  workspaceKey = null,
  manualAnchor = null,
  dismissedFocusNonce = null,
  manualGraceActive = false
}) => {
  const resolvedLookup = lookup || buildCardUnitLookup(card);
  const { units, unitByViewKey, unitIndexByViewKey, entries, entryBySegmentId } = resolvedLookup;
  const cardId = card?.id || null;

  const isAudibleOnCard = Boolean(
    cardId
    && cursor?.cardId === cardId
    && (cursor?.state === 'playing' || cursor?.state === 'paused')
  );
  const authoritativeSegmentEntry = isAudibleOnCard
    && cursor?.precision === 'segment'
    && cursor?.segmentId
    ? (entryBySegmentId.get(cursor.segmentId) || null)
    : null;
  const audibleUnitViewKey = authoritativeSegmentEntry?.unitViewKey || null;
  const audibleSegmentId = authoritativeSegmentEntry?.segment?.id || null;
  const audiblePlayingKey = isAudibleOnCard
    && cursor?.state === 'playing'
    && authoritativeSegmentEntry
    ? `${cursor.sessionId}:${authoritativeSegmentEntry.segment.id}`
    : null;

  const focusMatchesCard = Boolean(
    cardId
    && workspaceId
    && focusTarget?.documentId === workspaceId
    && focusTarget?.blockId === cardId
    && focusTarget?.nonce !== dismissedFocusNonce
  );
  const focusEntry = focusMatchesCard && focusTarget?.segmentId
    ? (entryBySegmentId.get(focusTarget.segmentId) || null)
    : null;

  const validManual = manualAnchor && (!workspaceKey || manualAnchor.workspaceKey === workspaceKey)
    ? {
        unitViewKey: manualAnchor.unitViewKey && unitByViewKey.has(manualAnchor.unitViewKey)
          ? manualAnchor.unitViewKey
          : null,
        segmentId: manualAnchor.segmentId && entryBySegmentId.has(manualAnchor.segmentId)
          ? manualAnchor.segmentId
          : null,
        playingKeyAtManual: manualAnchor.playingKeyAtManual || null
      }
    : null;

  const shouldFollowPlayingAudio = Boolean(
    audiblePlayingKey
    && !manualGraceActive
    && (!validManual || !validManual.playingKeyAtManual || validManual.playingKeyAtManual !== audiblePlayingKey)
  );

  let selectedUnitViewKey = units[0]?.viewKey || null;
  let source = units.length ? 'default' : 'empty';

  if (focusMatchesCard) {
    selectedUnitViewKey = focusEntry?.unitViewKey || units[0]?.viewKey || null;
    source = 'search';
  } else if (shouldFollowPlayingAudio && audibleUnitViewKey) {
    selectedUnitViewKey = audibleUnitViewKey;
    source = 'audible';
  } else if (validManual?.unitViewKey) {
    selectedUnitViewKey = validManual.unitViewKey;
    source = 'manual';
  } else if (isAudibleOnCard && cursor?.state === 'paused' && audibleUnitViewKey) {
    selectedUnitViewKey = audibleUnitViewKey;
    source = 'paused-cursor';
  }

  const selectedUnit = selectedUnitViewKey ? (unitByViewKey.get(selectedUnitViewKey) || null) : null;
  const selectedUnitIndex = selectedUnitViewKey && unitIndexByViewKey.has(selectedUnitViewKey)
    ? unitIndexByViewKey.get(selectedUnitViewKey)
    : -1;

  let selectedSegmentId = entries[0]?.segment?.id || null;
  if (focusMatchesCard) {
    selectedSegmentId = focusEntry?.segment?.id
      || selectedUnit?.segments?.[0]?.id
      || entries[0]?.segment?.id
      || null;
  } else if (shouldFollowPlayingAudio && audibleSegmentId) {
    selectedSegmentId = audibleSegmentId;
  } else if (validManual?.segmentId) {
    selectedSegmentId = validManual.segmentId;
  } else if (validManual?.unitViewKey && selectedUnit?.segments?.[0]?.id) {
    selectedSegmentId = selectedUnit.segments[0].id;
  } else if (isAudibleOnCard && cursor?.state === 'paused' && audibleSegmentId) {
    selectedSegmentId = audibleSegmentId;
  }

  const selectedEntry = selectedSegmentId ? (entryBySegmentId.get(selectedSegmentId) || null) : null;
  const unitDivergedFromAudible = Boolean(
    audibleUnitViewKey && selectedUnitViewKey && audibleUnitViewKey !== selectedUnitViewKey
  );
  const segmentDivergedFromAudible = Boolean(
    audibleSegmentId && selectedSegmentId && audibleSegmentId !== selectedSegmentId
  );

  return {
    source,
    selectedUnit,
    selectedUnitViewKey,
    selectedUnitIndex,
    selectedEntry,
    selectedSegmentId: selectedEntry?.segment?.id || null,
    selectedSegmentIndex: selectedEntry ? selectedEntry.logicalIndex : -1,
    audibleUnitViewKey,
    audibleUnitIndex: audibleUnitViewKey && unitIndexByViewKey.has(audibleUnitViewKey)
      ? unitIndexByViewKey.get(audibleUnitViewKey)
      : -1,
    audibleSegmentId,
    audibleSegmentIndex: authoritativeSegmentEntry ? authoritativeSegmentEntry.logicalIndex : -1,
    audiblePlayingKey,
    unitDivergedFromAudible,
    segmentDivergedFromAudible,
    isCardPrecisionPlaying: Boolean(isAudibleOnCard && cursor?.precision === 'card')
  };
};

export const resolveSegmentCoverageStatuses = ({ segment, audioCoverageMap = null }) => {
  if (!audioCoverageMap || !segment) return null;
  const hasText = Boolean(normalizeSegmentDisplayText(segment.text));
  const hasMeaning = Boolean(normalizeSegmentDisplayText(segment.meaning));
  return {
    text: hasText ? coverageLabelFor(audioCoverageMap[buildTextStructuredRuntimeAudioKey(segment.id, 'text')]?.status) : null,
    meaning: hasMeaning ? coverageLabelFor(audioCoverageMap[buildTextStructuredRuntimeAudioKey(segment.id, 'meaning')]?.status) : null
  };
};
