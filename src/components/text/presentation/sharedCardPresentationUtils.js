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
