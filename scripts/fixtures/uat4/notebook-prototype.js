import {
  createJourneyToLondonFixture,
  createJourneyToLondonStressFixtures
} from './journey-to-london.js';
import { selectTextMixedReaderState } from '../../../src/domain/text/textMixedReaderDomain.js';
import {
  SHARED_APPEARANCE_FONT_FAMILY_OPTIONS,
  SHARED_APPEARANCE_LINE_HEIGHT_OPTIONS,
  SHARED_APPEARANCE_PRIMARY_SIZE_OPTIONS,
  SHARED_APPEARANCE_SECONDARY_SIZE_OPTIONS,
  resolveSegmentJoinSeparator
} from '../../../src/components/text/presentation/sharedCardPresentationUtils.js';

const SPEAKER_COLORS = Object.freeze({
  James: '#0369a1',
  'Ticket Officer': '#0f766e',
  Emma: '#be123c',
  'Senior International Railway Ticketing & Passenger Assistance Coordinator': '#6d28d9'
});

const SPEAKER_COLORS_DARK = Object.freeze({
  James: '#7dd3fc',
  'Ticket Officer': '#5eead4',
  Emma: '#fda4af',
  'Senior International Railway Ticketing & Passenger Assistance Coordinator': '#c4b5fd'
});

const DATASET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'short-long-mixed', label: 'Short + Long Mix' }),
  Object.freeze({ id: 'london-mixed', label: 'A Journey to London (4/11/37)' }),
  Object.freeze({ id: 'stress-complete', label: 'Complete Stress (3/8/9)' }),
  Object.freeze({ id: 'extreme-mismatch', label: 'Extreme Mismatch (Derived)' })
]);

const CANDIDATE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'side-by-side', label: 'Side-by-Side (A vs B)' }),
  Object.freeze({ id: 'candidate-a', label: 'Candidate A: HTML Ruby' }),
  Object.freeze({ id: 'candidate-b', label: 'Candidate B: Measured Flow' })
]);

const WIDTH_PRESETS = Object.freeze([
  Object.freeze({ id: 'auto', label: 'Auto', px: null }),
  Object.freeze({ id: 'desktop', label: '760px', px: 760 }),
  Object.freeze({ id: 'tablet', label: '540px', px: 540 }),
  Object.freeze({ id: 'mobile', label: '390px', px: 390 })
]);

// Build authoritative projections once without mutating fixture snapshots.
const londonFixture = createJourneyToLondonFixture();
const londonSnapshotBefore = JSON.stringify(londonFixture.snapshot);
const londonPresentation = selectTextMixedReaderState(londonFixture.snapshot, {
  documentId: londonFixture.ids.documentId
}).presentation;

const stressFixture = createJourneyToLondonStressFixtures();
const stressSnapshotBefore = JSON.stringify(stressFixture.snapshot);
const stressPresentation = selectTextMixedReaderState(stressFixture.snapshot, {
  documentId: stressFixture.ids.documentId
}).presentation;

/**
 * Builds the disposable derived "Short + Long Mix" case specified in
 * ProLingo_UAT4_Mixed_Fixture_A_Journey_to_London.md line 122 without modifying
 * the authoritative London fixture segments, plus a Conversation dialogue scene.
 */
const buildShortLongMixedCards = () => {
  const p1 = londonPresentation.cardById[londonFixture.ids.cards.P1];
  const c1 = londonPresentation.cardById[londonFixture.ids.cards.C1];
  const p1Sc1Segs = p1.units[0].segments;
  return [
    {
      id: 'DERIVED_P_MIX',
      blockType: 'paragraph',
      paragraphRole: 'body',
      title: 'Paragraph · Short Adjacent + Multi-Line Wrapping (Derived + Verbatim P1 SG2–SG3)',
      units: [
        {
          id: 'DERIVED_U_MIX_1',
          viewKey: 'derived:mix:sc1',
          kind: 'paragraph',
          label: 'Section',
          segments: [
            {
              id: 'DERIVED_SEG_SHORT_1',
              text: 'James woke up early.',
              meaning: 'James bangun lebih awal.',
              joinAfter: 'space'
            },
            {
              id: 'DERIVED_SEG_SHORT_2',
              text: 'The weather was beautiful.',
              meaning: 'Cuacanya sangat indah.',
              joinAfter: 'space'
            },
            p1Sc1Segs[1],
            p1Sc1Segs[2]
          ]
        }
      ]
    },
    {
      id: c1.id,
      blockType: c1.blockType,
      paragraphRole: c1.paragraphRole,
      title: `${c1.title} (Verbatim London C1)`,
      units: c1.units.slice(0, 2)
    }
  ];
};

/**
 * Disposable derived extreme-length, missing-translation, and shared-line overflow cases
 * for honest boundary testing of extra annotation rows and Sentence Interlinear fallback.
 */
const buildExtremeMismatchCards = () => [
  {
    id: 'DERIVED_EXTREME_1',
    blockType: 'paragraph',
    paragraphRole: 'body',
    title: 'Extreme Mismatch · Short Primary Sharing Line + Huge Secondary + Missing Translation',
    units: [
      {
        id: 'DERIVED_U_EXT_SHARED',
        viewKey: 'derived:ext:shared',
        kind: 'paragraph',
        label: 'Section',
        segments: [
          {
            id: 'DERIVED_EXT_TINY_PRIMARY',
            text: 'Stop!',
            meaning: 'Mohon berhenti sejenak di belakang garis kuning pengaman peron karena kereta ekspres jarak jauh sedang melintas cepat tanpa berhenti di stasiun ini dan hembusan anginnya sangat kuat bagi penumpang yang berdiri terlalu dekat.',
            joinAfter: 'space'
          },
          {
            id: 'DERIVED_EXT_NEXT_NORMAL',
            text: 'The express train passes through this platform at full speed.',
            meaning: 'Kereta ekspres melintas di peron ini dengan kecepatan penuh.',
            joinAfter: 'space'
          },
          {
            id: 'DERIVED_EXT_MISSING_MEANING',
            text: 'Please wait behind the yellow line until the signal turns green.',
            meaning: '',
            joinAfter: 'space'
          },
          {
            id: 'DERIVED_EXT_LONG_PRIMARY_SHORT_SEC',
            text: 'Whenever regional engineering maintenance affects the mainline tracks between Reading and Paddington on Sunday mornings, station staff post updated departure platforms across every concourse screen.',
            meaning: 'Staf memperbarui papan peron saat perawatan rel.',
            joinAfter: 'space'
          }
        ]
      }
    ]
  },
  {
    id: 'DERIVED_EXTREME_2',
    blockType: 'conversation',
    paragraphRole: 'body',
    title: 'Conversation · Short Turns & Unequal Lengths',
    units: [
      {
        id: 'DERIVED_U_EXT_TURN_1',
        viewKey: 'derived:ext:t1',
        kind: 'turn',
        label: 'Speaker Turn',
        speakerLabel: 'Senior International Railway Ticketing & Passenger Assistance Coordinator',
        segments: [
          {
            id: 'DERIVED_EXT_T1_S1',
            text: 'Platform 4',
            meaning: 'Peron 4',
            joinAfter: 'none'
          },
          {
            id: 'DERIVED_EXT_T1_S2',
            text: '—direct express service.',
            meaning: '—layanan kereta ekspres langsung tanpa transit menuju London Paddington.',
            joinAfter: 'line'
          },
          {
            id: 'DERIVED_EXT_T1_S3',
            text: 'Ready?',
            meaning: 'Siap?',
            joinAfter: 'space'
          },
          {
            id: 'DERIVED_EXT_T1_S4',
            text: 'Let us board right now.',
            meaning: 'Mari kita naik sekarang juga.',
            joinAfter: 'space'
          }
        ]
      }
    ]
  }
];

const SHORT_LONG_MIXED_CARDS = buildShortLongMixedCards();
const EXTREME_MISMATCH_CARDS = buildExtremeMismatchCards();

const getDatasetCards = datasetId => {
  if (datasetId === 'london-mixed') return londonPresentation.cards;
  if (datasetId === 'stress-complete') return stressPresentation.cards;
  if (datasetId === 'extreme-mismatch') return EXTREME_MISMATCH_CARDS;
  return SHORT_LONG_MIXED_CARDS;
};

const getFontFamilySpec = id => (
  SHARED_APPEARANCE_FONT_FAMILY_OPTIONS.find(o => o.id === id) || SHARED_APPEARANCE_FONT_FAMILY_OPTIONS[0]
);
const getPrimarySizeSpec = id => (
  SHARED_APPEARANCE_PRIMARY_SIZE_OPTIONS.find(o => o.id === id) || SHARED_APPEARANCE_PRIMARY_SIZE_OPTIONS[1]
);
const getSecondarySizeSpec = id => (
  SHARED_APPEARANCE_SECONDARY_SIZE_OPTIONS.find(o => o.id === id) || SHARED_APPEARANCE_SECONDARY_SIZE_OPTIONS[1]
);
const getLineHeightSpec = id => (
  SHARED_APPEARANCE_LINE_HEIGHT_OPTIONS.find(o => o.id === id) || SHARED_APPEARANCE_LINE_HEIGHT_OPTIONS[2]
);

const getPrimaryText = (seg, order) => String(order === 'id-en' ? (seg?.meaning ?? '') : (seg?.text ?? '')).trim();
const getSecondaryText = (seg, order) => String(order === 'id-en' ? (seg?.text ?? '') : (seg?.meaning ?? '')).trim();
const getPrimaryChannel = order => (order === 'id-en' ? 'meaning' : 'text');
const getSecondaryChannel = order => (order === 'id-en' ? 'text' : 'meaning');

const getSpeakerColor = (speakerName, dark) => {
  const table = dark ? SPEAKER_COLORS_DARK : SPEAKER_COLORS;
  return table[speakerName] || (dark ? '#94a3b8' : '#475569');
};

// Lightweight Canvas text width measurer matched to exact rendered secondary font.
let sharedMeasureCanvas = null;
const measureTextWidthPx = (text, fontCss) => {
  if (!text) return 0;
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement('canvas');
  }
  const ctx = sharedMeasureCanvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = fontCss;
  return ctx.measureText(text).width;
};

/**
 * Splits a string into exact lossless word/whitespace tokens so joining all
 * tokens reconstructs the original text character-for-character.
 */
const tokenizeLossless = text => {
  if (!text) return [];
  return text.match(/\S+\s*|\s+/g) || [text];
};

/**
 * Measures real browser line breaks for a Unit's primary text using an off-screen
 * mirror container styled identically to the live Unit and `Range.getClientRects()`.
 * Returns visual lines with exact character slices and horizontal x-intervals per Segment.
 */
const measureUnitPrimaryLines = ({
  mirrorEl,
  unit,
  state,
  showInlineSpeaker
}) => {
  const segments = unit.segments || [];
  const primaryOrder = state.order;
  mirrorEl.innerHTML = '';
  mirrorEl.dataset.align = state.align;

  const isParagraphBody = unit.kind !== 'turn' && !unit._isTitleRole;
  const applyIndent = Boolean(isParagraphBody && state.indent);
  mirrorEl.style.textIndent = applyIndent ? '1.5em' : '0';

  let inlineSpeakerSpan = null;
  if (showInlineSpeaker) {
    inlineSpeakerSpan = document.createElement('span');
    inlineSpeakerSpan.className = 'nb-speaker-inline';
    inlineSpeakerSpan.textContent = `${unit.speakerLabel || 'Unassigned speaker'}:`;
    mirrorEl.appendChild(inlineSpeakerSpan);
  }

  const segmentDomNodes = [];
  segments.forEach((seg, segIndex) => {
    const primaryText = getPrimaryText(seg, primaryOrder);
    const span = document.createElement('span');
    span.dataset.measureSegIdx = String(segIndex);
    span.textContent = primaryText;
    mirrorEl.appendChild(span);
    segmentDomNodes.push({ seg, segIndex, span, primaryText });

    if (segIndex < segments.length - 1) {
      const sep = resolveSegmentJoinSeparator(seg.joinAfter);
      if (sep === '\n') {
        mirrorEl.appendChild(document.createElement('br'));
      } else if (sep === ' ') {
        mirrorEl.appendChild(document.createTextNode(' '));
      }
    }
  });

  const mirrorRect = mirrorEl.getBoundingClientRect();
  const containerWidth = Math.max(120, mirrorRect.width);
  const computedPrimary = window.getComputedStyle(mirrorEl);
  const approxLineHeight = parseFloat(computedPrimary.lineHeight) || (parseFloat(computedPrimary.fontSize) * 1.65) || 26;
  const lineTolerance = Math.max(6, approxLineHeight * 0.45);

  const lines = [];
  const findOrCreateLine = rectTop => {
    for (let i = 0; i < lines.length; i += 1) {
      if (Math.abs(lines[i].top - rectTop) <= lineTolerance) return lines[i];
    }
    const created = {
      lineIndex: lines.length,
      top: rectTop,
      slices: [],
      hasHardBreakAfter: false
    };
    lines.push(created);
    return created;
  };

  let inlineSpeakerWidth = 0;
  if (inlineSpeakerSpan) {
    const spRect = inlineSpeakerSpan.getBoundingClientRect();
    inlineSpeakerWidth = Math.max(0, spRect.right - mirrorRect.left);
    findOrCreateLine(spRect.top);
  }

  const range = document.createRange();

  for (const entry of segmentDomNodes) {
    const textNode = entry.span.firstChild;
    if (!textNode || !entry.primaryText) {
      // Preserve zero-primary segment cleanly without crashing
      const targetLine = lines[lines.length - 1] || findOrCreateLine(mirrorRect.top);
      targetLine.slices.push({
        segmentId: entry.seg.id,
        segmentIndex: entry.segIndex,
        text: '',
        xStart: 0,
        xEnd: Math.min(80, containerWidth),
        width: Math.min(80, containerWidth),
        joinAfter: entry.seg.joinAfter || 'space',
        isSegmentEnd: true
      });
      continue;
    }

    const tokens = tokenizeLossless(entry.primaryText);
    let offset = 0;
    let currentLineForSeg = null;
    let currentSlice = null;

    for (const token of tokens) {
      const tokenStart = offset;
      const tokenEnd = offset + token.length;
      offset = tokenEnd;

      range.setStart(textNode, tokenStart);
      range.setEnd(textNode, tokenEnd);
      const rects = [...range.getClientRects()].filter(r => r.width > 0 || r.height > 0);
      if (!rects.length) {
        if (currentSlice) {
          currentSlice.text += token;
        }
        continue;
      }

      // If a single long token wrapped across multiple rects, keep it on its starting rect line
      const firstRect = rects[0];
      const lastRect = rects[rects.length - 1];
      const line = findOrCreateLine(firstRect.top);
      const xStart = Math.max(0, firstRect.left - mirrorRect.left);
      const xEnd = Math.min(containerWidth, Math.max(xStart + 2, lastRect.right - mirrorRect.left));

      if (currentLineForSeg === line && currentSlice) {
        currentSlice.text += token;
        currentSlice.xEnd = Math.max(currentSlice.xEnd, xEnd);
        currentSlice.width = Math.max(8, currentSlice.xEnd - currentSlice.xStart);
      } else {
        currentLineForSeg = line;
        currentSlice = {
          segmentId: entry.seg.id,
          segmentIndex: entry.segIndex,
          text: token,
          xStart,
          xEnd,
          width: Math.max(8, xEnd - xStart),
          joinAfter: entry.seg.joinAfter || 'space',
          isSegmentEnd: false
        };
        line.slices.push(currentSlice);
      }
    }

    if (currentSlice) {
      currentSlice.isSegmentEnd = true;
      if (resolveSegmentJoinSeparator(entry.seg.joinAfter) === '\n') {
        currentLineForSeg.hasHardBreakAfter = true;
      }
    }
  }

  lines.sort((a, b) => a.top - b.top);
  lines.forEach((line, idx) => {
    line.lineIndex = idx;
  });

  // Compute exact non-overlapping horizontal column slot budgets for every slice on every line.
  // Never inflate a far-right stub past containerWidth (otherwise CSS Grid's final 1fr track is
  // narrower than slotWidth and chops short words like "He" vertically).
  const COLUMN_GAP = 8;
  for (const line of lines) {
    for (let i = 0; i < line.slices.length; i += 1) {
      const slice = line.slices[i];
      const nextSlice = line.slices[i + 1] || null;
      const slotEnd = nextSlice
        ? Math.max(slice.xStart + 4, nextSlice.xStart - COLUMN_GAP)
        : containerWidth;
      slice.slotStart = slice.xStart;
      slice.slotEnd = slotEnd;
      slice.slotWidth = Math.max(4, Math.floor(slotEnd - slice.slotStart));
    }
  }

  return {
    containerWidth,
    inlineSpeakerWidth,
    applyIndent,
    lines
  };
};

/**
 * Distributes each Segment's secondary translation across its real measured primary visual
 * slices so translation begins beneath the matching Segment's beginning and continues
 * underneath later lines. Detects extreme mismatch cleanly without overlapping or clipping.
 */
const distributeSecondaryToLines = ({
  unit,
  measured,
  state,
  secondaryFontCss
}) => {
  const segments = unit.segments || [];
  const segById = new Map(segments.map(s => [s.id, s]));
  const slicesBySegmentId = new Map();

  for (const line of measured.lines) {
    for (const slice of line.slices) {
      if (!slicesBySegmentId.has(slice.segmentId)) {
        slicesBySegmentId.set(slice.segmentId, []);
      }
      slicesBySegmentId.get(slice.segmentId).push({ line, slice });
    }
  }

  let extremeMismatchDetected = false;
  let extremeMismatchReason = null;
  let extraAnnotationBandCount = 0;

  for (const [segmentId, occurrences] of slicesBySegmentId.entries()) {
    const seg = segById.get(segmentId);
    const secText = getSecondaryText(seg, state.order);
    const fragCount = occurrences.length;

    occurrences.forEach((occ, idx) => {
      occ.slice.fragmentIndex = idx;
      occ.slice.fragmentCount = fragCount;
      occ.slice.secondaryText = '';
      occ.slice.secondaryMissing = !secText;
      occ.slice.extraAnnotationBand = '';
      occ.slice.estimatedSecondaryRows = 0;
    });

    if (!secText) continue;

    const words = tokenizeLossless(secText);
    const wordWidths = words.map(w => measureTextWidthPx(w, secondaryFontCss) * 1.05);
    const totalSecWidth = wordWidths.reduce((sum, w) => sum + w, 0);
    const totalSlotWidth = occurrences.reduce((sum, occ) => sum + occ.slice.slotWidth, 0);

    // Check if this segment sits in a narrow shared-line slot with massive secondary overflow.
    const isNarrowSharedSingleSlice = (
      fragCount === 1
      && occurrences[0].line.slices.length > 1
      && occurrences[0].slice.slotWidth < measured.containerWidth * 0.55
    );
    const singleSliceRowsNeeded = fragCount === 1
      ? Math.ceil(totalSecWidth / Math.max(40, occurrences[0].slice.slotWidth))
      : Math.ceil(totalSecWidth / Math.max(40, totalSlotWidth));

    if (isNarrowSharedSingleSlice && singleSliceRowsNeeded >= 4) {
      extremeMismatchDetected = true;
      extremeMismatchReason = `Segment "${getPrimaryText(seg, state.order).slice(0, 24)}" needs ~${singleSliceRowsNeeded} wrapped translation rows inside a ${Math.round(occurrences[0].slice.slotWidth)}px shared-line slot.`;
    } else if (singleSliceRowsNeeded >= 5 && measured.containerWidth <= 420) {
      extremeMismatchDetected = true;
      extremeMismatchReason = `Extreme translation-to-primary ratio (~${singleSliceRowsNeeded}x) on narrow ${Math.round(measured.containerWidth)}px width.`;
    }

    // If user selected Extra Annotation Rows mode on an extreme narrow shared-line slot,
    // keep only words that genuinely fit cleanly in the narrow slot without mid-word breaks
    // and move overflow into a clean full-width in-flow continuation annotation band.
    if (isNarrowSharedSingleSlice && singleSliceRowsNeeded >= 3 && state.fallbackPolicy === 'extra-rows') {
      const colW = occurrences[0].slice.slotWidth;
      const slotCap = colW * 1.85;
      let accWidth = 0;
      let splitIdx = 0;
      while (splitIdx < words.length) {
        const w = wordWidths[splitIdx];
        if (w > colW) break; // Never force a word wider than the narrow column to chop mid-word!
        if (splitIdx > 0 && accWidth + w > slotCap) break;
        accWidth += w;
        splitIdx += 1;
      }
      occurrences[0].slice.secondaryText = words.slice(0, splitIdx).join('');
      occurrences[0].slice.extraAnnotationBand = words.slice(splitIdx).join('');
      occurrences[0].slice.estimatedSecondaryRows = splitIdx > 0 ? 1 : 0;
      if (occurrences[0].slice.extraAnnotationBand) {
        extraAnnotationBandCount += 1;
      }
      continue;
    }

    // Standard Parallel-Flow width-aware distribution across all K visual fragments:
    // - Starts beneath the earliest fragment whose slot can fit the first word cleanly
    //   (preventing vertical letter-chopping like "S/a/y/a" inside a 14px trailing "I" stub).
    // - Absorbs trailing short-stub words cleanly onto the spacious preceding fragment when
    //   the final fragment is a narrow shared-line stub narrower than the final word
    //   (preventing "had/apa/nnya" or "emp/at." inside a 30px "him."/"four." stub).
    const effectiveRowMultiplier = Math.max(1, totalSecWidth / Math.max(40, totalSlotWidth));
    const allocatedWords = occurrences.map(() => []);
    let wordCursor = 0;

    for (let j = 0; j < fragCount; j += 1) {
      const occ = occurrences[j];
      const remainingWords = words.length - wordCursor;
      if (remainingWords <= 0) break;

      const slotW = occ.slice.slotWidth;
      const nextWordW = wordWidths[wordCursor];
      const hasMoreSpaciousLaterSlot = occurrences
        .slice(j + 1)
        .some(later => later.slice.slotWidth >= nextWordW);

      // Skip tiny edge stub if even the next single word cannot fit without chopping mid-word
      // AND a later fragment of this same Segment has enough room.
      if (nextWordW > slotW && hasMoreSpaciousLaterSlot) {
        continue;
      }

      if (j === fragCount - 1) {
        // Final fragment absorbs remaining words — unless it is a narrow shared-line stub
        // narrower than a remaining word AND the previous fragment has generous width!
        const rest = words.slice(wordCursor);
        const restWidths = wordWidths.slice(wordCursor);
        const isNarrowSharedFinalStub = (
          j > 0
          && occ.line.slices.length > 1
          && restWidths.some(w => w > slotW)
          && occurrences[j - 1].slice.slotWidth >= Math.max(...restWidths)
        );
        if (isNarrowSharedFinalStub) {
          allocatedWords[j - 1].push(...rest);
        } else {
          allocatedWords[j].push(...rest);
        }
        wordCursor = words.length;
        break;
      }

      const targetWidth = slotW * Math.max(0.95, Math.min(effectiveRowMultiplier, 2.2));
      // Check whether the final slot can hold the final word; if not, don't artificially hold back a word for it.
      const lastOcc = occurrences[fragCount - 1];
      const lastWordW = wordWidths[words.length - 1];
      const reserveForLater = (
        j === fragCount - 2
        && lastOcc.line.slices.length > 1
        && lastWordW > lastOcc.slice.slotWidth
      ) ? 0 : (fragCount - 1 - j);
      const maxTakeIdx = Math.max(wordCursor, words.length - reserveForLater);

      let takenWidth = 0;
      const startCursor = wordCursor;

      while (wordCursor < maxTakeIdx) {
        const w = wordWidths[wordCursor];
        if (w > slotW && wordCursor > startCursor) break;
        if (wordCursor > startCursor && takenWidth + w > targetWidth) break;
        takenWidth += w;
        wordCursor += 1;
      }

      allocatedWords[j].push(...words.slice(startCursor, wordCursor));
    }

    // Backfill safety: if any words remained unallocated (e.g. every slot was tiny), append to widest slot.
    if (wordCursor < words.length) {
      let widestIdx = 0;
      for (let j = 1; j < fragCount; j += 1) {
        if (occurrences[j].slice.slotWidth > occurrences[widestIdx].slice.slotWidth) widestIdx = j;
      }
      allocatedWords[widestIdx].push(...words.slice(wordCursor));
    }

    occurrences.forEach((occ, j) => {
      const joined = allocatedWords[j].join('');
      occ.slice.secondaryText = joined;
      const w = joined ? measureTextWidthPx(joined, secondaryFontCss) : 0;
      occ.slice.estimatedSecondaryRows = joined ? Math.max(1, Math.ceil(w / Math.max(40, occ.slice.slotWidth))) : 0;
    });
  }

  return {
    useFallback: Boolean(extremeMismatchDetected && state.fallbackPolicy === 'auto-fallback'),
    extremeMismatchDetected,
    extremeMismatchReason,
    extraAnnotationBandCount
  };
};

// =============================================================================
// PROTOTYPE APPLICATION CONTROLLER
// =============================================================================
export const mountNotebookPrototype = rootEl => {
  const params = new URLSearchParams(window.location.search);
  const state = {
    candidateView: params.get('candidate') || 'side-by-side',
    dataset: params.get('dataset') || 'short-long-mixed',
    order: params.get('order') === 'id-en' ? 'id-en' : 'en-id',
    align: params.get('align') === 'justify' ? 'justify' : 'left',
    primarySize: params.get('pSize') || 'md',
    secondarySize: params.get('sSize') || 'xs',
    fontFamily: params.get('font') || 'sans',
    lineHeight: params.get('lh') || 'relaxed',
    speakerLayout: params.get('speaker') || 'aligned',
    indent: params.get('indent') !== 'off',
    guideLines: params.get('guides') !== 'off',
    widthPreset: params.get('width') || 'auto',
    customWidthPx: null,
    dark: params.get('dark') === '1',
    fallbackPolicy: params.get('fallback') || 'auto-fallback',
    selected: null
  };

  let simulatedAudioCalls = 0;
  let candidateBMeasurePasses = 0;
  let activeResizeObserver = null;
  let rafId = null;

  const setSelectedFragment = info => {
    state.selected = info;
    updateSelectionHighlights();
    renderInspector();
  };

  const updateSelectionHighlights = () => {
    const selectedId = state.selected?.segmentId || null;
    rootEl.querySelectorAll('[data-notebook-segment-id]').forEach(el => {
      const match = Boolean(selectedId && el.dataset.notebookSegmentId === selectedId);
      el.dataset.selected = match ? 'true' : 'false';
      if (el.hasAttribute('aria-pressed')) {
        el.setAttribute('aria-pressed', match ? 'true' : 'false');
      }
    });
  };

  const renderInspector = () => {
    const inspector = rootEl.querySelector('[data-nb-inspector="true"]');
    if (!inspector) return;
    if (!state.selected) {
      inspector.innerHTML = `
        <div class="nb-inspector-meta">
          <span class="nb-inspector-pill">Fragment Inspector</span>
          <span style="color: var(--nb-text-muted)">
            Click any primary or secondary visual fragment below to inspect its original Segment ID, actual channel, and lossless reconstruction (selection only — 0 production audio calls).
          </span>
        </div>
      `;
      return;
    }

    const sel = state.selected;
    const primaryMatches = sel.reconstructedPrimary === sel.originalPrimary;
    const secondaryMatches = sel.reconstructedSecondary === sel.originalSecondary;
    inspector.innerHTML = `
      <div class="nb-inspector-meta">
        <span class="nb-inspector-pill" data-nb-inspected-candidate="${sel.candidate}">${sel.candidate === 'candidate-a' ? 'Candidate A (Ruby)' : 'Candidate B (Measured)'}</span>
        <span><strong>Segment ID:</strong> <code style="display:inline" data-nb-inspected-segment-id="${sel.segmentId}">${sel.segmentId}</code></span>
        <span><strong>Channel:</strong> <code style="display:inline" data-nb-inspected-channel="${sel.channel}">${sel.channel === 'text' ? 'text (EN)' : 'meaning (ID)'}</code></span>
        <span><strong>Fragment:</strong> <span data-nb-inspected-fragment="${sel.fragmentIndex + 1}/${sel.fragmentCount}">${sel.fragmentIndex + 1} of ${sel.fragmentCount}</span></span>
        <span><strong>Reconstruction:</strong> <span class="${primaryMatches && secondaryMatches ? 'nb-diag-ok' : 'nb-diag-warn'}" data-nb-inspected-exact="${primaryMatches && secondaryMatches ? 'true' : 'false'}">${primaryMatches && secondaryMatches ? 'EXACT MATCH' : 'MISMATCH'}</span></span>
      </div>
      <div style="font-size:11px;color:var(--nb-text-muted)">Simulated selection only · Audio calls: <strong>${simulatedAudioCalls}</strong></div>
      <div class="nb-inspector-text">
        <div>
          <strong>Original Primary (${sel.primaryChannel === 'text' ? 'EN' : 'ID'})</strong>
          <code>${escapeHtml(sel.originalPrimary || '(empty)')}</code>
        </div>
        <div>
          <strong>Reconstructed Secondary (${sel.secondaryChannel === 'text' ? 'EN' : 'ID'})</strong>
          <code>${escapeHtml(sel.reconstructedSecondary || '(missing translation)')}</code>
        </div>
      </div>
    `;
  };

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const createControlsHtml = () => {
    const makeGroup = (label, key, options, current) => `
      <div class="nb-control-group">
        <span class="nb-control-label">${label}</span>
        <div class="nb-seg-group" role="group" aria-label="${label}">
          ${options.map(opt => `
            <button type="button" class="nb-btn"
              data-nb-control="${key}"
              data-nb-value="${opt.id}"
              aria-pressed="${current === opt.id ? 'true' : 'false'}"
            >${opt.label}</button>
          `).join('')}
        </div>
      </div>
    `;

    const activeWidthPx = state.customWidthPx
      || WIDTH_PRESETS.find(w => w.id === state.widthPreset)?.px
      || 900;

    return `
      <section class="nb-controls" data-nb-controls="true" aria-label="Notebook Prototype Controls">
        <div class="nb-control-row">
          ${makeGroup('Candidate', 'candidateView', CANDIDATE_OPTIONS, state.candidateView)}
          ${makeGroup('Test Content', 'dataset', DATASET_OPTIONS, state.dataset)}
        </div>
        <div class="nb-control-row">
          ${makeGroup('Order', 'order', [{ id: 'en-id', label: 'EN–ID' }, { id: 'id-en', label: 'ID–EN' }], state.order)}
          ${makeGroup('Align', 'align', [{ id: 'left', label: 'Left' }, { id: 'justify', label: 'Justify' }], state.align)}
          ${makeGroup('Speakers', 'speakerLayout', [{ id: 'aligned', label: 'Aligned' }, { id: 'stacked', label: 'Stacked' }, { id: 'inline', label: 'Inline' }], state.speakerLayout)}
          <button type="button" class="nb-btn-toggle" data-nb-toggle="indent" aria-pressed="${state.indent ? 'true' : 'false'}">Indent ${state.indent ? 'On' : 'Off'}</button>
          <button type="button" class="nb-btn-toggle" data-nb-toggle="guideLines" aria-pressed="${state.guideLines ? 'true' : 'false'}">Guides ${state.guideLines ? 'On' : 'Off'}</button>
          <button type="button" class="nb-btn-toggle" data-nb-toggle="dark" aria-pressed="${state.dark ? 'true' : 'false'}">${state.dark ? 'Dark Theme' : 'Light Theme'}</button>
        </div>
        <div class="nb-control-row">
          ${makeGroup('Primary Size', 'primarySize', SHARED_APPEARANCE_PRIMARY_SIZE_OPTIONS, state.primarySize)}
          ${makeGroup('Secondary Size', 'secondarySize', SHARED_APPEARANCE_SECONDARY_SIZE_OPTIONS, state.secondarySize)}
          ${makeGroup('Font', 'fontFamily', SHARED_APPEARANCE_FONT_FAMILY_OPTIONS, state.fontFamily)}
          ${makeGroup('Line Height', 'lineHeight', SHARED_APPEARANCE_LINE_HEIGHT_OPTIONS, state.lineHeight)}
        </div>
        <div class="nb-control-row">
          ${makeGroup('Width', 'widthPreset', WIDTH_PRESETS, state.customWidthPx ? '' : state.widthPreset)}
          <label class="nb-control-group" style="font-size:11px;color:var(--nb-text-secondary)">
            <span>Custom: <strong data-nb-width-readout="true">${state.customWidthPx ? `${state.customWidthPx}px` : (WIDTH_PRESETS.find(w => w.id === state.widthPreset)?.label || 'Auto')}</strong></span>
            <input type="range" class="nb-width-slider" min="320" max="920" step="10" value="${activeWidthPx}" data-nb-width-slider="true" aria-label="Custom viewport width" />
          </label>
          ${makeGroup('Extreme Overflow (B)', 'fallbackPolicy', [
            { id: 'auto-fallback', label: 'Auto Fallback' },
            { id: 'extra-rows', label: 'Extra Annotation Rows' }
          ], state.fallbackPolicy)}
        </div>
      </section>
    `;
  };

  /**
   * Renders a shared Unit shell (Paragraph Section or Conversation Turn) while keeping
   * Speaker attribution once per Turn across Aligned / Stacked / Inline layouts.
   */
  const createUnitShell = ({ card, unit, unitIndex, forceStackAligned }) => {
    const isTurn = unit.kind === 'turn';
    const isTitle = card.paragraphRole === 'title';
    const section = document.createElement('section');
    section.className = `nb-unit${isTurn ? ' is-turn' : ''}${isTitle ? ' is-title' : ''}`;
    section.dataset.nbUnitKey = unit.viewKey;
    section.dataset.nbUnitId = unit.id || '';
    section.dataset.nbUnitKind = unit.kind;

    const speakerName = unit.speakerLabel || 'Unassigned speaker';
    const speakerColor = getSpeakerColor(speakerName, state.dark);
    if (isTurn) {
      section.style.borderLeftColor = speakerColor;
    }

    const bodyCol = document.createElement('div');
    bodyCol.className = 'nb-unit-body-col';

    if (!isTurn) {
      if ((card.units?.length || 0) > 1 || (unit.segments?.length || 0) === 0) {
        const heading = document.createElement('p');
        heading.className = 'nb-section-label';
        heading.textContent = `${unit.label || 'Section'} ${unitIndex + 1}`;
        section.appendChild(heading);
      }
      section.appendChild(bodyCol);
      return { section, bodyCol, showInlineSpeaker: false };
    }

    if ((unit.segments?.length || 0) === 0) {
      const hdr = document.createElement('div');
      hdr.className = 'nb-speaker-stacked';
      hdr.innerHTML = `<span class="nb-speaker-name" style="color:${speakerColor}">${escapeHtml(speakerName)}:</span><span class="nb-speaker-sub">Turn ${unitIndex + 1}</span>`;
      section.appendChild(hdr);
      const empty = document.createElement('p');
      empty.className = 'nb-empty-unit';
      empty.textContent = 'Empty speaker turn — no sentences yet.';
      bodyCol.appendChild(empty);
      section.appendChild(bodyCol);
      return { section, bodyCol, showInlineSpeaker: false, isEmpty: true };
    }

    if (state.speakerLayout === 'aligned') {
      const grid = document.createElement('div');
      grid.className = `nb-turn-aligned${forceStackAligned ? ' force-stack' : ''}`;
      const speakerCol = document.createElement('div');
      speakerCol.className = 'nb-speaker-col';
      speakerCol.innerHTML = `
        <div class="nb-speaker-name" style="color:${speakerColor}" data-nb-speaker-name="true">${escapeHtml(speakerName)}:</div>
        <span class="nb-speaker-sub">Speaker Turn ${unitIndex + 1}</span>
      `;
      grid.appendChild(speakerCol);
      grid.appendChild(bodyCol);
      section.appendChild(grid);
      return { section, bodyCol, showInlineSpeaker: false };
    }

    if (state.speakerLayout === 'stacked') {
      const hdr = document.createElement('div');
      hdr.className = 'nb-speaker-stacked';
      hdr.innerHTML = `
        <span class="nb-speaker-name" style="color:${speakerColor}" data-nb-speaker-name="true">${escapeHtml(speakerName)}:</span>
        <span class="nb-speaker-sub">Speaker Turn ${unitIndex + 1}</span>
      `;
      section.appendChild(hdr);
      section.appendChild(bodyCol);
      return { section, bodyCol, showInlineSpeaker: false };
    }

    // Inline speaker layout: speaker lead-in flows at the beginning of line 0.
    section.appendChild(bodyCol);
    return { section, bodyCol, showInlineSpeaker: true };
  };

  /**
   * CANDIDATE A — Native HTML <ruby> + <rt> (`ruby-position: under`)
   */
  const renderCandidateAUnit = ({ card, unit, bodyCol, showInlineSpeaker, typo }) => {
    const segments = unit.segments || [];
    if (!segments.length) {
      const empty = document.createElement('p');
      empty.className = 'nb-empty-unit';
      empty.textContent = `Empty ${unit.kind === 'turn' ? 'speaker turn' : 'section'} — no sentences yet.`;
      bodyCol.appendChild(empty);
      return;
    }

    const flow = document.createElement('div');
    flow.className = 'nb-ruby-flow';
    flow.dataset.nbCandidateFlow = 'candidate-a';
    flow.dataset.align = state.align;
    flow.style.fontFamily = typo.fontFamily;
    flow.style.fontSize = card.paragraphRole === 'title' ? typo.titlePrimarySize : typo.primarySize;
    flow.style.lineHeight = String(typo.lineHeight);
    flow.style.setProperty('--nb-secondary-size', typo.secondarySize);
    flow.style.textIndent = (unit.kind !== 'turn' && card.paragraphRole !== 'title' && state.indent) ? '1.5em' : '0';

    if (showInlineSpeaker) {
      const sp = document.createElement('span');
      sp.className = 'nb-speaker-inline';
      sp.style.color = getSpeakerColor(unit.speakerLabel || 'Unassigned speaker', state.dark);
      sp.textContent = `${unit.speakerLabel || 'Unassigned speaker'}:`;
      flow.appendChild(sp);
    }

    const pChannel = getPrimaryChannel(state.order);
    const sChannel = getSecondaryChannel(state.order);

    segments.forEach((seg, segIdx) => {
      const pText = getPrimaryText(seg, state.order);
      const sText = getSecondaryText(seg, state.order);
      const ruby = document.createElement('ruby');
      ruby.dataset.nbRubySegment = seg.id;

      const base = document.createElement('span');
      base.className = 'nb-ruby-base';
      base.setAttribute('role', 'button');
      base.tabIndex = 0;
      base.dataset.notebookSegmentId = seg.id;
      base.dataset.notebookChannel = pChannel;
      base.dataset.notebookFragmentIndex = '0';
      base.dataset.notebookCandidate = 'candidate-a';
      base.textContent = pText;

      const handleSelect = channel => event => {
        event.stopPropagation();
        setSelectedFragment({
          candidate: 'candidate-a',
          segmentId: seg.id,
          channel,
          primaryChannel: pChannel,
          secondaryChannel: sChannel,
          fragmentIndex: 0,
          fragmentCount: 1,
          originalPrimary: pText,
          originalSecondary: sText,
          reconstructedPrimary: pText,
          reconstructedSecondary: sText
        });
      };

      base.addEventListener('click', handleSelect(pChannel));
      base.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect(pChannel)(e);
        }
      });

      const rt = document.createElement('rt');
      rt.className = 'nb-ruby-rt';
      rt.dataset.notebookSegmentId = seg.id;
      rt.dataset.notebookChannel = sChannel;
      rt.dataset.notebookFragmentIndex = '0';
      rt.dataset.notebookCandidate = 'candidate-a';
      rt.textContent = sText || '—';
      rt.addEventListener('click', handleSelect(sChannel));

      ruby.appendChild(base);
      ruby.appendChild(rt);
      flow.appendChild(ruby);

      if (segIdx < segments.length - 1) {
        const sep = resolveSegmentJoinSeparator(seg.joinAfter);
        if (sep === '\n') flow.appendChild(document.createElement('br'));
        else if (sep === ' ') flow.appendChild(document.createTextNode(' '));
      }
    });

    bodyCol.appendChild(flow);
  };

  /**
   * CANDIDATE B — Measured Custom Parallel-Flow Layout Engine
   * Measures real browser primary line breaks, maps secondary text across matching
   * line fragments, enforces zero overlap via aligned CSS Grid columns, and triggers
   * an explicit Sentence Interlinear fallback on unresolvable extreme mismatch.
   */
  const renderCandidateBUnit = ({ card, unit, bodyCol, showInlineSpeaker, typo }) => {
    const segments = unit.segments || [];
    if (!segments.length) {
      const empty = document.createElement('p');
      empty.className = 'nb-empty-unit';
      empty.textContent = `Empty ${unit.kind === 'turn' ? 'speaker turn' : 'section'} — no sentences yet.`;
      bodyCol.appendChild(empty);
      return null;
    }

    const host = document.createElement('div');
    host.className = 'nb-measured-host';
    host.dataset.nbMeasuredUnit = unit.viewKey;

    const mirror = document.createElement('div');
    mirror.className = 'nb-measure-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.fontFamily = typo.fontFamily;
    mirror.style.fontSize = card.paragraphRole === 'title' ? typo.titlePrimarySize : typo.primarySize;
    mirror.style.lineHeight = String(typo.lineHeight);

    const rendered = document.createElement('div');
    rendered.dataset.nbCandidateFlow = 'candidate-b';

    host.appendChild(mirror);
    host.appendChild(rendered);
    bodyCol.appendChild(host);

    const pChannel = getPrimaryChannel(state.order);
    const sChannel = getSecondaryChannel(state.order);
    const unitWithRole = { ...unit, _isTitleRole: card.paragraphRole === 'title' };

    const layoutNow = () => {
      candidateBMeasurePasses += 1;
      const measured = measureUnitPrimaryLines({
        mirrorEl: mirror,
        unit: unitWithRole,
        state,
        showInlineSpeaker
      });
      const secondaryFontCss = `400 ${typo.secondarySize} ${typo.fontFamily}`;
      const distribution = distributeSecondaryToLines({
        unit: unitWithRole,
        measured,
        state,
        secondaryFontCss
      });

      rendered.innerHTML = '';
      rendered.dataset.nbFallbackActive = distribution.useFallback ? 'true' : 'false';
      rendered.dataset.nbLineCount = String(measured.lines.length);
      rendered.dataset.nbExtraBands = String(distribution.extraAnnotationBandCount);

      const segById = new Map(segments.map(s => [s.id, s]));

      const makeSelectHandler = (segId, channel, fragIndex, fragCount) => event => {
        event.stopPropagation();
        const seg = segById.get(segId);
        const origP = getPrimaryText(seg, state.order);
        const origS = getSecondaryText(seg, state.order);
        const reconP = [...rendered.querySelectorAll(`[data-notebook-segment-id="${segId}"][data-notebook-channel="${pChannel}"]`)]
          .map(el => el.textContent)
          .join('');
        const reconS = [...rendered.querySelectorAll(`[data-notebook-segment-id="${segId}"][data-notebook-channel="${sChannel}"]`)]
          .filter(el => el.dataset.notebookMissingPlaceholder !== 'true')
          .map(el => el.textContent)
          .join('');
        setSelectedFragment({
          candidate: 'candidate-b',
          segmentId: segId,
          channel,
          primaryChannel: pChannel,
          secondaryChannel: sChannel,
          fragmentIndex: fragIndex,
          fragmentCount: fragCount,
          originalPrimary: origP,
          originalSecondary: origS,
          reconstructedPrimary: reconP.trim(),
          reconstructedSecondary: reconS.trim()
        });
      };

      if (distribution.useFallback) {
        const banner = document.createElement('div');
        banner.className = 'nb-fallback-banner';
        banner.dataset.notebookFallback = 'sentence-interlinear';
        banner.textContent = `Fallback: Sentence Interlinear — ${distribution.extremeMismatchReason || 'Extreme translation length mismatch for parallel flow at this width.'}`;
        rendered.appendChild(banner);

        const list = document.createElement('div');
        list.className = 'nb-fallback-list';
        if (showInlineSpeaker) {
          const sp = document.createElement('div');
          sp.className = 'nb-speaker-name';
          sp.style.color = getSpeakerColor(unit.speakerLabel || 'Unassigned speaker', state.dark);
          sp.textContent = `${unit.speakerLabel || 'Unassigned speaker'}:`;
          list.appendChild(sp);
        }

        segments.forEach(seg => {
          const pText = getPrimaryText(seg, state.order);
          const sText = getSecondaryText(seg, state.order);
          const row = document.createElement('div');
          row.className = 'nb-fallback-row';
          row.dataset.align = state.align;

          const pDiv = document.createElement('div');
          pDiv.className = 'nb-fallback-primary';
          pDiv.style.fontFamily = typo.fontFamily;
          pDiv.style.fontSize = card.paragraphRole === 'title' ? typo.titlePrimarySize : typo.primarySize;
          pDiv.style.lineHeight = String(typo.lineHeight);
          const pSpan = document.createElement('span');
          pSpan.className = 'nb-frag';
          pSpan.setAttribute('role', 'button');
          pSpan.tabIndex = 0;
          pSpan.dataset.notebookSegmentId = seg.id;
          pSpan.dataset.notebookChannel = pChannel;
          pSpan.dataset.notebookFragmentIndex = '0';
          pSpan.dataset.notebookCandidate = 'candidate-b';
          pSpan.textContent = pText;
          pSpan.addEventListener('click', makeSelectHandler(seg.id, pChannel, 0, 1));
          pDiv.appendChild(pSpan);

          const sDiv = document.createElement('div');
          sDiv.className = 'nb-fallback-secondary';
          sDiv.style.fontFamily = typo.fontFamily;
          sDiv.style.fontSize = typo.secondarySize;
          sDiv.style.lineHeight = '1.5';
          const sSpan = document.createElement('span');
          sSpan.className = `nb-frag${sText ? '' : ' nb-frag-missing'}`;
          sSpan.dataset.notebookSegmentId = seg.id;
          sSpan.dataset.notebookChannel = sChannel;
          sSpan.dataset.notebookFragmentIndex = '0';
          sSpan.dataset.notebookCandidate = 'candidate-b';
          if (!sText) sSpan.dataset.notebookMissingPlaceholder = 'true';
          sSpan.textContent = sText || '[No translation]';
          sSpan.addEventListener('click', makeSelectHandler(seg.id, sChannel, 0, 1));
          sDiv.appendChild(sSpan);

          row.appendChild(pDiv);
          row.appendChild(sDiv);
          list.appendChild(row);
        });
        rendered.appendChild(list);
        updateSelectionHighlights();
        return { measured, distribution };
      }

      const linesWrap = document.createElement('div');
      linesWrap.className = `nb-parallel-lines${state.guideLines ? ' with-guides' : ''}`;

      measured.lines.forEach((line, lineIdx) => {
        const pair = document.createElement('div');
        pair.className = 'nb-line-pair';
        pair.dataset.notebookLine = String(lineIdx);

        // 1. Primary visual line row
        const pRow = document.createElement('div');
        pRow.className = 'nb-primary-row';
        pRow.style.fontFamily = typo.fontFamily;
        pRow.style.fontSize = card.paragraphRole === 'title' ? typo.titlePrimarySize : typo.primarySize;
        pRow.style.lineHeight = String(Math.max(1.32, Number((typo.lineHeight - 0.25).toFixed(2))));

        const isLastLine = lineIdx === measured.lines.length - 1;
        const lineTextPlain = line.slices.map(s => s.text).join('').trim();
        const wordCount = lineTextPlain ? lineTextPlain.split(/\s+/).length : 0;
        const justifyThisLine = Boolean(
          state.align === 'justify'
          && !isLastLine
          && !line.hasHardBreakAfter
          && wordCount >= 3
        );
        pRow.dataset.justifyLine = justifyThisLine ? 'true' : 'false';

        if (lineIdx === 0 && measured.applyIndent) {
          pRow.style.textIndent = '1.5em';
        }
        if (lineIdx === 0 && showInlineSpeaker) {
          const sp = document.createElement('span');
          sp.className = 'nb-speaker-inline';
          sp.style.color = getSpeakerColor(unit.speakerLabel || 'Unassigned speaker', state.dark);
          sp.textContent = `${unit.speakerLabel || 'Unassigned speaker'}:`;
          pRow.appendChild(sp);
        }

        line.slices.forEach((slice, sIdx) => {
          const span = document.createElement('span');
          span.className = 'nb-frag';
          span.dataset.notebookSegmentId = slice.segmentId;
          span.dataset.notebookChannel = pChannel;
          span.dataset.notebookFragmentIndex = String(slice.fragmentIndex);
          span.dataset.notebookFragmentCount = String(slice.fragmentCount);
          span.dataset.notebookCandidate = 'candidate-b';
          span.setAttribute('role', 'button');
          span.tabIndex = slice.fragmentIndex === 0 ? 0 : -1;
          span.textContent = slice.text;
          const handler = makeSelectHandler(slice.segmentId, pChannel, slice.fragmentIndex, slice.fragmentCount);
          span.addEventListener('click', handler);
          span.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handler(e);
            }
          });
          pRow.appendChild(span);

          if (slice.isSegmentEnd && sIdx < line.slices.length - 1) {
            const sep = resolveSegmentJoinSeparator(slice.joinAfter);
            if (sep === ' ') pRow.appendChild(document.createTextNode(' '));
          }
        });
        pair.appendChild(pRow);

        // 2. Paired secondary annotation grid row aligned under each primary fragment's xStart
        const hasAnySecondaryOrMissing = line.slices.some(s => s.secondaryText || s.secondaryMissing || s.extraAnnotationBand);
        if (hasAnySecondaryOrMissing) {
          const sGrid = document.createElement('div');
          sGrid.className = 'nb-secondary-grid';
          sGrid.dataset.notebookSecondaryRow = String(lineIdx);
          sGrid.style.fontFamily = typo.fontFamily;
          sGrid.style.fontSize = typo.secondarySize;
          sGrid.style.lineHeight = '1.46';

          const cols = [];
          const COLUMN_GAP_PX = 8;
          const leadingOffsetPx = Math.round(line.slices[0]?.slotStart || 0);
          const hasLeadingOffset = leadingOffsetPx > COLUMN_GAP_PX;
          if (hasLeadingOffset) {
            cols.push(`${leadingOffsetPx - COLUMN_GAP_PX}px`);
          }

          line.slices.forEach((slice, sIdx) => {
            if (sIdx === line.slices.length - 1) {
              cols.push('minmax(0, 1fr)');
            } else {
              cols.push(`minmax(0, ${Math.floor(slice.slotWidth)}px)`);
            }
          });

          sGrid.style.gridTemplateColumns = cols.join(' ');
          if (hasLeadingOffset) {
            const spacer = document.createElement('div');
            spacer.setAttribute('aria-hidden', 'true');
            sGrid.appendChild(spacer);
          }

          line.slices.forEach(slice => {
            const slot = document.createElement('div');
            slot.className = 'nb-secondary-slot';
            slot.dataset.notebookSlotSegment = slice.segmentId;
            if (slice.secondaryText) {
              const sSpan = document.createElement('span');
              sSpan.className = 'nb-frag';
              sSpan.dataset.notebookSegmentId = slice.segmentId;
              sSpan.dataset.notebookChannel = sChannel;
              sSpan.dataset.notebookFragmentIndex = String(slice.fragmentIndex);
              sSpan.dataset.notebookFragmentCount = String(slice.fragmentCount);
              sSpan.dataset.notebookCandidate = 'candidate-b';
              sSpan.textContent = slice.secondaryText;
              sSpan.addEventListener('click', makeSelectHandler(slice.segmentId, sChannel, slice.fragmentIndex, slice.fragmentCount));
              slot.appendChild(sSpan);
            } else if (slice.secondaryMissing && slice.fragmentIndex === 0) {
              const miss = document.createElement('span');
              miss.className = 'nb-frag nb-frag-missing';
              miss.dataset.notebookSegmentId = slice.segmentId;
              miss.dataset.notebookChannel = sChannel;
              miss.dataset.notebookFragmentIndex = '0';
              miss.dataset.notebookMissingPlaceholder = 'true';
              miss.dataset.notebookCandidate = 'candidate-b';
              miss.textContent = '—';
              miss.addEventListener('click', makeSelectHandler(slice.segmentId, sChannel, 0, slice.fragmentCount));
              slot.appendChild(miss);
            }
            sGrid.appendChild(slot);
          });

          pair.appendChild(sGrid);

          // Optional full-width continuation annotation band when Extra Annotation Rows is chosen
          line.slices.forEach(slice => {
            if (!slice.extraAnnotationBand) return;
            const band = document.createElement('div');
            band.className = 'nb-secondary-extra-band';
            band.dataset.notebookExtraBand = slice.segmentId;
            band.style.fontFamily = typo.fontFamily;
            band.style.fontSize = typo.secondarySize;
            band.style.lineHeight = '1.46';
            const bSpan = document.createElement('span');
            bSpan.className = 'nb-frag';
            bSpan.dataset.notebookSegmentId = slice.segmentId;
            bSpan.dataset.notebookChannel = sChannel;
            bSpan.dataset.notebookFragmentIndex = String(slice.fragmentIndex + 1);
            bSpan.dataset.notebookFragmentCount = String(slice.fragmentCount + 1);
            bSpan.dataset.notebookCandidate = 'candidate-b';
            bSpan.textContent = slice.extraAnnotationBand;
            bSpan.addEventListener('click', makeSelectHandler(slice.segmentId, sChannel, slice.fragmentIndex + 1, slice.fragmentCount + 1));
            band.appendChild(bSpan);
            pair.appendChild(band);
          });
        }

        linesWrap.appendChild(pair);
      });

      rendered.appendChild(linesWrap);
      updateSelectionHighlights();
      return { measured, distribution };
    };

    return { host, layoutNow };
  };

  /**
   * Computes live geometry & text integrity diagnostics for a rendered candidate panel.
   */
  const computePanelDiagnostics = (panelEl, candidateId, cards) => {
    const pChannel = getPrimaryChannel(state.order);
    const sChannel = getSecondaryChannel(state.order);
    const allSegs = cards.flatMap(c => c.units.flatMap(u => u.segments || []));

    let exactPrimaryCount = 0;
    let exactSecondaryCount = 0;
    let sharedLineCount = 0;
    let wrappedMultiLineSegments = 0;
    let fallbackUnits = 0;
    let horizontalOverflow = false;
    let secondaryOverlapCount = 0;

    for (const seg of allSegs) {
      const origP = getPrimaryText(seg, state.order);
      const origS = getSecondaryText(seg, state.order);
      const pNodes = [...panelEl.querySelectorAll(`[data-notebook-segment-id="${seg.id}"][data-notebook-channel="${pChannel}"]`)];
      const sNodes = [...panelEl.querySelectorAll(`[data-notebook-segment-id="${seg.id}"][data-notebook-channel="${sChannel}"]`)]
        .filter(n => n.dataset.notebookMissingPlaceholder !== 'true');
      const reconP = pNodes.map(n => n.textContent).join('').trim();
      const reconS = sNodes.map(n => n.textContent).join('').trim();
      if (reconP === origP) exactPrimaryCount += 1;
      if (reconS === origS) exactSecondaryCount += 1;
      if (pNodes.length > 1) wrappedMultiLineSegments += 1;
    }

    if (candidateId === 'candidate-b') {
      const lines = [...panelEl.querySelectorAll('[data-notebook-line]')];
      sharedLineCount = lines.filter(line => {
        const segIds = new Set([...line.querySelectorAll(`[data-notebook-channel="${pChannel}"]`)].map(n => n.dataset.notebookSegmentId));
        return segIds.size >= 2;
      }).length;
      fallbackUnits = panelEl.querySelectorAll('[data-notebook-fallback="sentence-interlinear"]').length;

      // Measure actual rendered rects for adjacent secondary slots on every line to prove zero overlap
      for (const row of panelEl.querySelectorAll('[data-notebook-secondary-row]')) {
        const slots = [...row.querySelectorAll('.nb-secondary-slot')].filter(s => s.textContent.trim().length > 0);
        for (let i = 0; i < slots.length - 1; i += 1) {
          const a = slots[i].getBoundingClientRect();
          const b = slots[i + 1].getBoundingClientRect();
          if (a.right > b.left + 1.5) secondaryOverlapCount += 1;
        }
      }
    }

    if (panelEl.scrollWidth > panelEl.clientWidth + 2) {
      horizontalOverflow = true;
    }

    return {
      totalSegments: allSegs.length,
      exactPrimaryCount,
      exactSecondaryCount,
      sharedLineCount,
      wrappedMultiLineSegments,
      fallbackUnits,
      horizontalOverflow,
      secondaryOverlapCount
    };
  };

  const renderStage = () => {
    if (activeResizeObserver) {
      activeResizeObserver.disconnect();
      activeResizeObserver = null;
    }
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }

    document.documentElement.classList.toggle('dark', state.dark);

    const typo = {
      fontFamily: getFontFamilySpec(state.fontFamily).cssValue,
      primarySize: getPrimarySizeSpec(state.primarySize).fontSize,
      titlePrimarySize: getPrimarySizeSpec(state.primarySize).titleFontSize,
      secondarySize: getSecondarySizeSpec(state.secondarySize).fontSize,
      lineHeight: getLineHeightSpec(state.lineHeight).cssValue
    };

    const cards = getDatasetCards(state.dataset);
    const effectiveWidthPx = state.customWidthPx
      || WIDTH_PRESETS.find(w => w.id === state.widthPreset)?.px
      || null;
    const forceStackAligned = Boolean(effectiveWidthPx && effectiveWidthPx <= 520);

    rootEl.innerHTML = `
      <main class="nb-shell" data-nb-prototype="true" data-nb-dataset="${state.dataset}" data-nb-candidate-view="${state.candidateView}">
        <header class="nb-header">
          <div>
            <p class="nb-kicker">ProLingo UAT-4 · Packet E / 4C2 Isolated Prototype (Not Integrated Into Production Reader)</p>
            <h1 class="nb-title">Notebook Interlinear — Parallel Flow Feasibility Comparison</h1>
            <p class="nb-subtitle">Candidate A (Native HTML &lt;ruby&gt;) vs Candidate B (Browser-Measured Parallel Flow) · Verbatim London &amp; Stress Fixtures + Disposable Extreme Cases</p>
          </div>
          <span class="nb-badge">4C2 Gate · Read-Only Fixtures · 0 Audio Calls</span>
        </header>
        ${createControlsHtml()}
        <div class="nb-inspector" data-nb-inspector="true" role="status" aria-live="polite"></div>
        <div class="nb-stage-viewport" data-nb-stage-viewport="true" style="${effectiveWidthPx ? `width:${effectiveWidthPx}px` : 'width:100%'}">
          <div class="${state.candidateView === 'side-by-side' ? 'nb-compare-grid' : ''}" data-nb-panels-wrap="true"></div>
        </div>
      </main>
    `;

    // Bind controls
    rootEl.querySelectorAll('[data-nb-control]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.nbControl;
        const val = btn.dataset.nbValue;
        state[key] = val;
        if (key === 'widthPreset') state.customWidthPx = null;
        if (key === 'dataset') state.selected = null;
        renderStage();
      });
    });

    rootEl.querySelectorAll('[data-nb-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.nbToggle;
        state[key] = !state[key];
        renderStage();
      });
    });

    const slider = rootEl.querySelector('[data-nb-width-slider="true"]');
    if (slider) {
      slider.addEventListener('input', event => {
        state.customWidthPx = Number(event.target.value);
        renderStage();
      });
    }

    const panelsWrap = rootEl.querySelector('[data-nb-panels-wrap="true"]');
    const candidatesToRender = state.candidateView === 'side-by-side'
      ? ['candidate-a', 'candidate-b']
      : [state.candidateView];

    const measuredControllers = [];

    for (const candidateId of candidatesToRender) {
      const panel = document.createElement('section');
      panel.className = 'nb-candidate-panel';
      panel.dataset.nbCandidatePanel = candidateId;

      const header = document.createElement('div');
      header.className = 'nb-candidate-header';
      header.innerHTML = candidateId === 'candidate-a'
        ? `<h2 class="nb-candidate-title">Candidate A · Native HTML &lt;ruby&gt;</h2><span class="nb-candidate-tag">ruby-position: under</span>`
        : `<h2 class="nb-candidate-title">Candidate B · Measured Parallel Flow</h2><span class="nb-candidate-tag">Range.getClientRects() + Aligned Grid</span>`;
      panel.appendChild(header);

      const body = document.createElement('div');
      body.className = 'nb-candidate-body';

      for (const card of cards) {
        const cardEl = document.createElement('article');
        cardEl.className = 'nb-card';
        cardEl.dataset.nbCardId = card.id;

        const cardHdr = document.createElement('header');
        cardHdr.className = 'nb-card-header';
        cardHdr.innerHTML = `
          <span class="nb-card-meta ${card.blockType === 'conversation' ? 'conversation' : 'paragraph'}">
            ${card.paragraphRole === 'title' ? 'Title Card' : card.blockType === 'conversation' ? 'Conversation Scene' : 'Paragraph Card'}
          </span>
          <h3 class="nb-card-title">${escapeHtml(card.title || card.id)}</h3>
        `;
        cardEl.appendChild(cardHdr);

        const unitsStack = document.createElement('div');
        unitsStack.className = 'nb-units-stack';

        (card.units || []).forEach((unit, unitIndex) => {
          const shell = createUnitShell({ card, unit, unitIndex, forceStackAligned });
          if (!shell.isEmpty) {
            if (candidateId === 'candidate-a') {
              renderCandidateAUnit({
                card,
                unit,
                bodyCol: shell.bodyCol,
                showInlineSpeaker: shell.showInlineSpeaker,
                typo
              });
            } else {
              const ctrl = renderCandidateBUnit({
                card,
                unit,
                bodyCol: shell.bodyCol,
                showInlineSpeaker: shell.showInlineSpeaker,
                typo
              });
              if (ctrl) measuredControllers.push({ panel, ctrl });
            }
          }
          unitsStack.appendChild(shell.section);
        });

        cardEl.appendChild(unitsStack);
        body.appendChild(cardEl);
      }

      panel.appendChild(body);
      const diagBar = document.createElement('div');
      diagBar.className = 'nb-diag-bar';
      diagBar.dataset.nbDiagBar = candidateId;
      panel.appendChild(diagBar);
      panelsWrap.appendChild(panel);
    }

    const updateDiagnostics = () => {
      for (const candidateId of candidatesToRender) {
        const panel = panelsWrap.querySelector(`[data-nb-candidate-panel="${candidateId}"]`);
        const bar = panel?.querySelector(`[data-nb-diag-bar="${candidateId}"]`);
        if (!panel || !bar) continue;
        const d = computePanelDiagnostics(panel, candidateId, cards);
        panel.dataset.nbExactPrimary = String(d.exactPrimaryCount === d.totalSegments);
        panel.dataset.nbExactSecondary = String(d.exactSecondaryCount === d.totalSegments);
        panel.dataset.nbHorizontalOverflow = String(d.horizontalOverflow);
        panel.dataset.nbSecondaryOverlaps = String(d.secondaryOverlapCount);
        panel.dataset.nbSharedLines = String(d.sharedLineCount);
        panel.dataset.nbWrappedSegments = String(d.wrappedMultiLineSegments);
        panel.dataset.nbFallbackUnits = String(d.fallbackUnits);

        bar.innerHTML = `
          <span>Segments: <strong>${d.totalSegments}</strong></span>
          <span>Exact Text: <strong class="${d.exactPrimaryCount === d.totalSegments && d.exactSecondaryCount === d.totalSegments ? 'nb-diag-ok' : 'nb-diag-warn'}">${d.exactPrimaryCount}/${d.totalSegments} P · ${d.exactSecondaryCount}/${d.totalSegments} S</strong></span>
          ${candidateId === 'candidate-b' ? `
            <span>Shared-Segment Lines: <strong>${d.sharedLineCount}</strong></span>
            <span>Multi-Line Wrapped Segs: <strong>${d.wrappedMultiLineSegments}</strong></span>
            <span>Fallback Units: <strong>${d.fallbackUnits}</strong></span>
            <span>Secondary Overlaps: <strong class="${d.secondaryOverlapCount === 0 ? 'nb-diag-ok' : 'nb-diag-warn'}">${d.secondaryOverlapCount}</strong></span>
          ` : `
            <span>Native Ruby Layout (Browser-Controlled)</span>
          `}
          <span>Overflow: <strong class="${d.horizontalOverflow ? 'nb-diag-warn' : 'nb-diag-ok'}">${d.horizontalOverflow ? 'YES' : 'NONE'}</strong></span>
        `;
      }
    };

    const runAllMeasuredLayouts = () => {
      for (const item of measuredControllers) {
        item.ctrl.layoutNow();
      }
      updateDiagnostics();
      renderInspector();
    };

    // Initial measured pass
    runAllMeasuredLayouts();

    // Observe ONLY inline width changes on the stage viewport so height changes NEVER cause ResizeObserver loops!
    const stageEl = rootEl.querySelector('[data-nb-stage-viewport="true"]');
    if (stageEl && measuredControllers.length > 0 && typeof ResizeObserver === 'function') {
      let lastObservedWidth = Math.round(stageEl.getBoundingClientRect().width);
      activeResizeObserver = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        const nextWidth = Math.round(entry.contentRect.width);
        if (Math.abs(nextWidth - lastObservedWidth) <= 1) return;
        lastObservedWidth = nextWidth;
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          runAllMeasuredLayouts();
        });
      });
      activeResizeObserver.observe(stageEl);
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (measuredControllers.length > 0) runAllMeasuredLayouts();
      });
    }
  };

  window.__notebook4C2 = {
    getState: () => ({ ...state }),
    setState: patch => {
      Object.assign(state, patch);
      renderStage();
    },
    getMeasurePasses: () => candidateBMeasurePasses,
    resetMeasurePasses: () => { candidateBMeasurePasses = 0; },
    getSimulatedAudioCalls: () => simulatedAudioCalls,
    getFixturesUnchanged: () => (
      JSON.stringify(londonFixture.snapshot) === londonSnapshotBefore
      && JSON.stringify(stressFixture.snapshot) === stressSnapshotBefore
    ),
    londonIds: londonFixture.ids,
    stressIds: stressFixture.ids
  };

  renderStage();
};

const rootNode = document.getElementById('notebook-prototype-root');
if (rootNode) {
  mountNotebookPrototype(rootNode);
}
