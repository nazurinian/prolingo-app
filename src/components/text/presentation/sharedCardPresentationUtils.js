import { buildTextStructuredRuntimeAudioKey } from '../../../domain/text/textStructuredAudioRuntimeDomain.js';
import { summarizeTextStructuredAudioCoverage, TEXT_AUDIO_COVERAGE_STATUS } from '../../../domain/text/textStructuredAudioCoverageDomain.js';
import { normalizeTextWorkspaceStyleState } from '../../../domain/text/textCardPresentationStateDomain.js';

export const SHARED_WORKSPACE_ALIGNMENT_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'left',
    label: 'Left',
    description: 'Align Paragraph and Conversation reading text to the left edge'
  }),
  Object.freeze({
    id: 'justify',
    label: 'Justify',
    description: 'Justify Paragraph and Conversation reading text across both EN and ID'
  })
]);

export const SHARED_CONVERSATION_SPEAKER_LAYOUT_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'stacked',
    label: 'Stacked',
    description: 'Place the Speaker name above each Turn body'
  }),
  Object.freeze({
    id: 'aligned',
    label: 'Aligned',
    description: 'Place the Speaker name in an independent leading column beside each Turn body'
  }),
  Object.freeze({
    id: 'inline',
    label: 'Inline',
    description: 'Start each Turn body inline immediately after the Speaker name'
  })
]);

export const PARAGRAPH_FIRST_LINE_INDENT_VALUE = '1.5em';

/**
 * Normalizes Workspace Style into reusable body typography and structural flags
 * consumed across Paragraph Sections and Conversation Turns in all Reader modes.
 */
export const resolveWorkspaceStylePresentation = (workspaceStyle = null) => {
  const style = normalizeTextWorkspaceStyleState(workspaceStyle);
  const isJustified = style.textAlign === 'justify';
  const bodyAlignClass = isJustified ? 'text-justify' : 'text-left';
  const bodyAlignStyle = Object.freeze({
    textAlign: style.textAlign,
    overflowWrap: 'break-word',
    ...(isJustified ? { hyphens: 'auto' } : {})
  });
  return Object.freeze({
    style,
    isJustified,
    bodyAlignClass,
    bodyAlignStyle,
    paragraphIndent: style.paragraphIndent,
    paragraphIndentValue: style.paragraphIndent ? PARAGRAPH_FIRST_LINE_INDENT_VALUE : '0',
    speakerLayout: style.speakerLayout,
    showAccents: style.showAccents
  });
};

export const buildParagraphBodyStyle = ({
  workspaceStyle = null,
  isTitleRole = false,
  allowIndent = true
} = {}) => {
  const presentation = resolveWorkspaceStylePresentation(workspaceStyle);
  const indentApplied = Boolean(allowIndent && !isTitleRole && presentation.paragraphIndent);
  return Object.freeze({
    className: presentation.bodyAlignClass,
    inlineStyle: Object.freeze({
      ...presentation.bodyAlignStyle,
      textIndent: indentApplied ? presentation.paragraphIndentValue : '0'
    }),
    indentApplied,
    textAlign: presentation.style.textAlign,
    showAccents: presentation.showAccents
  });
};

export const buildConversationBodyStyle = ({ workspaceStyle = null } = {}) => {
  const presentation = resolveWorkspaceStylePresentation(workspaceStyle);
  return Object.freeze({
    className: presentation.bodyAlignClass,
    inlineStyle: Object.freeze({
      ...presentation.bodyAlignStyle,
      textIndent: '0'
    }),
    textAlign: presentation.style.textAlign,
    speakerLayout: presentation.speakerLayout,
    showAccents: presentation.showAccents
  });
};

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

const SECTION_TERMS = Object.freeze({
  label: 'Section',
  lower: 'section',
  plural: 'sections',
  cardLabel: 'Paragraph',
  cardLower: 'card',
  collectionNoun: 'passage'
});
const TURN_TERMS = Object.freeze({
  label: 'Speaker Turn',
  lower: 'speaker turn',
  plural: 'speaker turns',
  cardLabel: 'Scene',
  cardLower: 'scene',
  collectionNoun: 'dialogue'
});
const MIXED_TERMS = Object.freeze({
  label: 'Part',
  lower: 'section or speaker turn',
  plural: 'sections or speaker turns',
  cardLabel: 'Card',
  cardLower: 'card',
  collectionNoun: 'content'
});
export const getSharedUnitTerms = unitOrCard => (
  unitOrCard?.documentType === 'mixed'
    ? MIXED_TERMS
    : unitOrCard?.kind === 'turn' || unitOrCard?.blockType === 'conversation' || unitOrCard === 'turn'
    ? TURN_TERMS
    : SECTION_TERMS
);
export const getSharedUnitHeading = (unit, index) => `${unit?.label || getSharedUnitTerms(unit).label} ${index + 1}`
  + (unit?.kind === 'turn' ? ` · ${unit.speakerLabel || 'Unassigned speaker'}` : '');

export const SPEAKER_ACCENT_PALETTE = Object.freeze([
  Object.freeze({
    id: 'sky',
    rail: 'border-l-sky-500 dark:border-l-sky-400',
    railMuted: 'border-l-sky-300/90 dark:border-l-sky-700/80',
    avatar: 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950',
    pill: 'border-sky-200/90 bg-sky-50/85 text-sky-900 dark:border-sky-800/75 dark:bg-sky-950/45 dark:text-sky-100',
    nameText: 'text-sky-900 dark:text-sky-100',
    dot: 'bg-sky-500 dark:bg-sky-400',
    surfaceTint: 'bg-sky-50/30 dark:bg-sky-950/15'
  }),
  Object.freeze({
    id: 'teal',
    rail: 'border-l-teal-500 dark:border-l-teal-400',
    railMuted: 'border-l-teal-300/90 dark:border-l-teal-700/80',
    avatar: 'bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950',
    pill: 'border-teal-200/90 bg-teal-50/85 text-teal-900 dark:border-teal-800/75 dark:bg-teal-950/45 dark:text-teal-100',
    nameText: 'text-teal-900 dark:text-teal-100',
    dot: 'bg-teal-500 dark:bg-teal-400',
    surfaceTint: 'bg-teal-50/30 dark:bg-teal-950/15'
  }),
  Object.freeze({
    id: 'rose',
    rail: 'border-l-rose-500 dark:border-l-rose-400',
    railMuted: 'border-l-rose-300/90 dark:border-l-rose-700/80',
    avatar: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-slate-950',
    pill: 'border-rose-200/90 bg-rose-50/85 text-rose-900 dark:border-rose-800/75 dark:bg-rose-950/45 dark:text-rose-100',
    nameText: 'text-rose-900 dark:text-rose-100',
    dot: 'bg-rose-500 dark:bg-rose-400',
    surfaceTint: 'bg-rose-50/30 dark:bg-rose-950/15'
  }),
  Object.freeze({
    id: 'violet',
    rail: 'border-l-violet-500 dark:border-l-violet-400',
    railMuted: 'border-l-violet-300/90 dark:border-l-violet-700/80',
    avatar: 'bg-violet-600 text-white dark:bg-violet-500 dark:text-slate-950',
    pill: 'border-violet-200/90 bg-violet-50/85 text-violet-900 dark:border-violet-800/75 dark:bg-violet-950/45 dark:text-violet-100',
    nameText: 'text-violet-900 dark:text-violet-100',
    dot: 'bg-violet-500 dark:bg-violet-400',
    surfaceTint: 'bg-violet-50/30 dark:bg-violet-950/15'
  }),
  Object.freeze({
    id: 'orange',
    rail: 'border-l-orange-500 dark:border-l-orange-400',
    railMuted: 'border-l-orange-300/90 dark:border-l-orange-700/80',
    avatar: 'bg-orange-600 text-white dark:bg-orange-500 dark:text-slate-950',
    pill: 'border-orange-200/90 bg-orange-50/85 text-orange-900 dark:border-orange-800/75 dark:bg-orange-950/45 dark:text-orange-100',
    nameText: 'text-orange-900 dark:text-orange-100',
    dot: 'bg-orange-500 dark:bg-orange-400',
    surfaceTint: 'bg-orange-50/30 dark:bg-orange-950/15'
  }),
  Object.freeze({
    id: 'cyan',
    rail: 'border-l-cyan-600 dark:border-l-cyan-400',
    railMuted: 'border-l-cyan-300/90 dark:border-l-cyan-700/80',
    avatar: 'bg-cyan-700 text-white dark:bg-cyan-500 dark:text-slate-950',
    pill: 'border-cyan-200/90 bg-cyan-50/85 text-cyan-900 dark:border-cyan-800/75 dark:bg-cyan-950/45 dark:text-cyan-100',
    nameText: 'text-cyan-900 dark:text-cyan-100',
    dot: 'bg-cyan-500 dark:bg-cyan-400',
    surfaceTint: 'bg-cyan-50/30 dark:bg-cyan-950/15'
  })
]);

export const UNASSIGNED_SPEAKER_APPEARANCE = Object.freeze({
  id: 'neutral',
  rail: 'border-l-slate-400 dark:border-l-slate-600',
  railMuted: 'border-l-slate-300 dark:border-l-slate-700',
  avatar: 'border border-dashed border-slate-400 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  pill: 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300',
  nameText: 'text-slate-600 dark:text-slate-300 italic',
  dot: 'bg-slate-400 dark:bg-slate-500',
  surfaceTint: 'bg-slate-50/40 dark:bg-slate-900/35'
});

const hashSpeakerKey = key => {
  let h = 2166136261;
  for (const ch of String(key || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const getSpeakerMonogram = label => {
  const cleanLabel = normalizeSegmentDisplayText(label);
  if (!cleanLabel) return '?';
  const words = cleanLabel.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = [...words[0]][0] || '';
    const second = [...words[1]][0] || '';
    const pair = `${first}${second}`.toUpperCase();
    if (pair.trim()) return pair;
  }
  const chars = [...cleanLabel];
  return (chars[0] || '?').toUpperCase();
};

export const getStableTurnSpeakerKey = unit => {
  if (!unit || unit.kind !== 'turn') return null;
  if (unit.speakerId) return `id:${unit.speakerId}`;
  if (unit.speakerUid) return `uid:${unit.speakerUid}`;
  return null;
};

/**
 * Derives color only from persistent speaker ID/UID, independent of Scene cast,
 * labels and Turn order. Six hues deliberately allow reuse; names, monograms and
 * Turn identity distinguish speakers whose colors coincide. Nothing is persisted.
 */
export const buildCardSpeakerAppearanceMap = card => {
  const map = new Map();
  for (const unit of card?.units || []) {
    const key = getStableTurnSpeakerKey(unit);
    if (key && !map.has(key)) map.set(key, SPEAKER_ACCENT_PALETTE[hashSpeakerKey(key) % SPEAKER_ACCENT_PALETTE.length]);
  }
  return map;
};

export const resolveTurnSpeakerPresentation = ({ unit, appearanceMap = null }) => {
  const displayName = normalizeSegmentDisplayText(unit?.speakerLabel);
  const speakerKey = getStableTurnSpeakerKey(unit);
  const isAssigned = Boolean(displayName || speakerKey);
  const palette = speakerKey && appearanceMap?.has?.(speakerKey)
    ? appearanceMap.get(speakerKey)
    : UNASSIGNED_SPEAKER_APPEARANCE;
  return {
    isAssigned,
    speakerKey,
    displayName: displayName || 'Unassigned speaker',
    monogram: isAssigned && displayName ? getSpeakerMonogram(displayName) : '?',
    palette
  };
};

export const summarizeSceneSpeakers = ({ card, appearanceMap = null }) => {
  if (!card || card.blockType !== 'conversation') return [];
  const resolvedMap = appearanceMap || buildCardSpeakerAppearanceMap(card);
  const roster = [];
  const seenKeys = new Set();
  let hasUnassigned = false;
  for (const unit of card.units || []) {
    const info = resolveTurnSpeakerPresentation({ unit, appearanceMap: resolvedMap });
    if (!info.isAssigned) {
      hasUnassigned = true;
      continue;
    }
    const dedupeKey = info.speakerKey || `label:${info.displayName.toLowerCase()}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    roster.push(info);
  }
  if (hasUnassigned) {
    roster.push({
      isAssigned: false,
      speakerKey: null,
      displayName: 'Unassigned',
      monogram: '?',
      palette: UNASSIGNED_SPEAKER_APPEARANCE
    });
  }
  return roster;
};

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
  selectedSegmentId = null,
  selectionOnly = false,
  playableSegmentIds = null,
  audioCoverageMap = null,
  disabled = false
}) => {
  const active = isSpeakingCard && cursor.precision === 'segment' && cursor.segmentId === segment.id;
  const paused = active && cursor.state === 'paused' && cursor.channel === channel;
  const speaking = active && !paused && cursor.channel === channel;
  const focused = segment.id === focusSegmentId;
  const selected = Boolean(selectedSegmentId && segment.id === selectedSegmentId);
  const playable = playableSegmentIds?.has ? playableSegmentIds.has(segment.id) : true;
  const segmentDisabled = selectionOnly ? false : (disabled || !playable);
  const isMeaning = channel === 'meaning';

  const visualStateClasses = [];
  if (paused && !fullChannelHighlighted) {
    visualStateClasses.push('!bg-amber-100/95 dark:!bg-amber-950/60 !text-amber-950 dark:!text-amber-100 ring-1 ring-amber-400/75 dark:ring-amber-600/75');
    if (!selected) {
      visualStateClasses.push('!no-underline');
    }
  }
  if (selected) {
    if (speaking || paused || fullChannelHighlighted) {
      visualStateClasses.push('underline decoration-sky-500 dark:decoration-sky-300 decoration-2 underline-offset-4');
    } else {
      visualStateClasses.push('!bg-sky-100/85 dark:!bg-sky-900/45 !text-slate-950 dark:!text-sky-50 underline decoration-sky-500 dark:decoration-sky-400 decoration-2 underline-offset-4 ring-1 ring-sky-300/80 dark:ring-sky-700/80');
    }
  }

  return {
    active,
    paused,
    speaking,
    focused,
    selected,
    playable,
    segmentDisabled,
    fullChannelHighlighted,
    className: visualStateClasses.join(' '),
    dataAttributes: {
      'data-shared-card-segment': segment.id,
      'data-shared-card-channel': channel,
      'data-shared-card-index': logicalIndex + 1,
      ...(selected ? { 'data-shared-segment-selected': 'true' } : {}),
      ...(paused ? { 'data-shared-segment-paused': 'true' } : {}),
      ...(selectionOnly ? { 'data-shared-segment-select-only': 'true' } : {})
    },
    title: selectionOnly
      ? `Sentence ${logicalIndex + 1} • Tap to select in Study Box (does not start audio)`
      : buildSegmentCoverageTitle({
          segment,
          logicalIndex,
          audioCoverageMap,
          playable,
          disabled
        }),
    accessibleLabel: selectionOnly
      ? `Select sentence ${logicalIndex + 1} in Study Box (${isMeaning ? 'Indonesian meaning' : 'English text'})`
      : `Play sentence ${logicalIndex + 1} (${isMeaning ? 'Indonesian meaning' : 'English text'})`
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

export const SHARED_FOCUS_ORIENTATION_OPTIONS = Object.freeze([
  Object.freeze({ id: 'vertical-focus', label: 'Vertical', description: 'Focus one section vertically with smaller previous and next previews' }),
  Object.freeze({ id: 'horizontal-focus', label: 'Horizontal', description: 'Swipe or step horizontally with centered focus and peeking neighbor previews' })
]);

export const getSharedUnitShortCode = (unit, index) => (
  unit?.kind === 'turn' ? `T${index + 1}` : `SC${index + 1}`
);

export const buildUnitPreviewExcerpt = (unit, bilingualLayout = 'interlinear', maxChars = 140) => {
  const segments = unit?.segments || [];
  if (!segments.length) return '';
  const preferMeaning = bilingualLayout === 'meaning-only';
  const chunks = [];
  let previousEmitted = null;
  for (const segment of segments) {
    const primary = normalizeSegmentDisplayText(preferMeaning ? segment?.meaning : segment?.text);
    const fallback = normalizeSegmentDisplayText(preferMeaning ? segment?.text : segment?.meaning);
    const chosen = primary || fallback;
    if (!chosen) continue;
    if (previousEmitted) {
      chunks.push(resolveSegmentJoinSeparator(previousEmitted.joinAfter));
    }
    chunks.push(chosen);
    previousEmitted = segment;
  }
  const joined = chunks.join('').trim();
  if (!joined) return '';
  return joined.length > maxChars ? `${joined.slice(0, maxChars - 1).trimEnd()}…` : joined;
};

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
 * Resolves visible Unit and Segment selection deterministically under the explicit
 * manual-follow policy:
 * 1) Undismissed transient Search focusTarget (does NOT mutate manual selection;
 *    once consumed, prior manual selection is restored automatically),
 * 2) Validated explicit manual selection (`manualAnchor` — NEVER overridden by
 *    elapsed timers or playback cursor advancement until explicitly cleared via
 *    Return to Playing or Follow Playback),
 * 3) Authoritative playing Segment cursor (`precision === 'segment'`),
 * 4) Authoritative paused Segment cursor (`precision === 'segment'`),
 * 5) First available Unit / Segment (or explicit empty state for zero-Unit cards;
 *    empty Units always resolve `selectedSegmentId: null` and never borrow another
 *    Unit's segment).
 */
export const resolveEffectiveCardSelection = ({
  card,
  lookup = null,
  cursor = null,
  focusTarget = null,
  workspaceId = null,
  workspaceKey = null,
  manualAnchor = null,
  unitSegmentMemory = null,
  dismissedFocusNonce = null
}) => {
  const resolvedLookup = lookup || buildCardUnitLookup(card);
  const { units, unitByViewKey, unitIndexByViewKey, entryBySegmentId } = resolvedLookup;
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

  // Validate manual anchor against live Workspace, Card Units, and Segments.
  // Deleted or replaced Segments recover safely within their surviving Unit (or
  // fall through cleanly if both Unit and Segment were removed).
  const manualWorkspaceMatches = Boolean(
    manualAnchor
    && (!workspaceKey || !manualAnchor.workspaceKey || manualAnchor.workspaceKey === workspaceKey)
  );
  const rawManualUnit = manualWorkspaceMatches && manualAnchor.unitViewKey && unitByViewKey.has(manualAnchor.unitViewKey)
    ? unitByViewKey.get(manualAnchor.unitViewKey)
    : null;
  const rawManualSegEntry = manualWorkspaceMatches && manualAnchor.segmentId && entryBySegmentId.has(manualAnchor.segmentId)
    ? entryBySegmentId.get(manualAnchor.segmentId)
    : null;

  const resolvedManualUnitViewKey = rawManualUnit?.viewKey || rawManualSegEntry?.unitViewKey || null;
  const resolvedManualUnit = resolvedManualUnitViewKey
    ? (unitByViewKey.get(resolvedManualUnitViewKey) || null)
    : null;
  const resolvedManualSegmentId = resolvedManualUnit
    ? (
        rawManualSegEntry && rawManualSegEntry.unitViewKey === resolvedManualUnitViewKey
          ? rawManualSegEntry.segment.id
          : null
      )
    : null;
  const hasValidManual = Boolean(resolvedManualUnitViewKey);

  const pickValidRememberedOrFirstSegment = unit => {
    const unitSegments = unit?.segments || [];
    if (!unitSegments.length) return null;
    const rememberedId = unit?.viewKey && unitSegmentMemory ? unitSegmentMemory[unit.viewKey] : null;
    if (rememberedId && unitSegments.some(segment => segment.id === rememberedId)) {
      return rememberedId;
    }
    return unitSegments[0]?.id || null;
  };

  let selectedUnitViewKey = units[0]?.viewKey || null;
  let source = units.length ? 'default' : 'empty';

  if (focusMatchesCard) {
    selectedUnitViewKey = focusEntry?.unitViewKey || units[0]?.viewKey || null;
    source = 'search';
  } else if (hasValidManual) {
    selectedUnitViewKey = resolvedManualUnitViewKey;
    source = 'manual';
  } else if (audiblePlayingKey && audibleUnitViewKey) {
    selectedUnitViewKey = audibleUnitViewKey;
    source = 'audible';
  } else if (isAudibleOnCard && cursor?.state === 'paused' && audibleUnitViewKey) {
    selectedUnitViewKey = audibleUnitViewKey;
    source = 'paused-cursor';
  }

  const selectedUnit = selectedUnitViewKey ? (unitByViewKey.get(selectedUnitViewKey) || null) : null;
  const selectedUnitIndex = selectedUnitViewKey && unitIndexByViewKey.has(selectedUnitViewKey)
    ? unitIndexByViewKey.get(selectedUnitViewKey)
    : -1;
  const selectedUnitSegments = selectedUnit?.segments || [];

  let selectedSegmentId = null;
  if (selectedUnitSegments.length > 0) {
    if (focusMatchesCard) {
      selectedSegmentId = (focusEntry && focusEntry.unitViewKey === selectedUnitViewKey)
        ? focusEntry.segment.id
        : (selectedUnitSegments[0]?.id || null);
    } else if (hasValidManual) {
      selectedSegmentId = resolvedManualSegmentId || pickValidRememberedOrFirstSegment(selectedUnit);
    } else if (audiblePlayingKey && audibleSegmentId && audibleUnitViewKey === selectedUnitViewKey) {
      selectedSegmentId = audibleSegmentId;
    } else if (isAudibleOnCard && cursor?.state === 'paused' && audibleSegmentId && audibleUnitViewKey === selectedUnitViewKey) {
      selectedSegmentId = audibleSegmentId;
    } else {
      selectedSegmentId = pickValidRememberedOrFirstSegment(selectedUnit);
    }
  }

  const selectedEntry = selectedSegmentId ? (entryBySegmentId.get(selectedSegmentId) || null) : null;
  const unitDivergedFromAudible = Boolean(
    audibleUnitViewKey && selectedUnitViewKey && audibleUnitViewKey !== selectedUnitViewKey
  );
  const segmentDivergedFromAudible = Boolean(
    audibleSegmentId && audibleSegmentId !== (selectedEntry?.segment?.id || null)
  );

  return {
    source,
    hasManualOverride: hasValidManual,
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
