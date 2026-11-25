const MAX_TRANSLATION_ROWS = 3;
const RECT_TOLERANCE = 0.75;
const TRANSLATION_GUTTER = 6;

// Keep spaces with the preceding word. Rendering may collapse whitespace at a
// line edge, but reconstruction still returns every authored character.
export const tokenizeNotebookText = text => text.match(/\S+\s*|\s+/gu) || [];

export const distributeNotebookTranslation = (text, slots, measure) => {
  const words = tokenizeNotebookText(text);
  if (!words.length) return slots.map(() => '');
  if (words.length > 1500) return null;
  const widths = words.map(word => measure(word.trimEnd()));
  const spaceWidths = words.map(word => measure(word) - measure(word.trimEnd()));
  const total = widths.reduce((sum, width, index) => sum + width + spaceWidths[index], 0);
  const capacity = slots.reduce((sum, width) => sum + width, 0);
  const density = Math.max(1, total / Math.max(1, capacity));

  // Dynamic programming keeps translation ranges contiguous even when a middle
  // slot is too narrow. A later word can never be backfilled before an earlier one.
  let paths = new Map([[0, { cost: 0, before: null }]]);
  for (const width of slots) {
    const next = new Map();
    const retain = (end, span, cost, before) => {
      if (!next.has(end) || next.get(end).cost > cost) next.set(end, { span, cost, before });
    };
    for (const [start, path] of paths) {
      let used = 0;
      let rows = 1;
      let rowWidth = 0;
      retain(start, [start, start], path.cost + (start < words.length && widths[start] <= width ? 5 : 0), path);
      for (let end = start; end < words.length; end++) {
        if (widths[end] > width) break;
        const addition = widths[end] + (end > start ? spaceWidths[end - 1] : 0);
        if (rowWidth + addition > width) {
          if (++rows > MAX_TRANSLATION_ROWS) break;
          rowWidth = widths[end];
        } else {
          rowWidth += addition;
        }
        used += addition;
        const proportion = used / Math.max(1, width);
        retain(end + 1, [start, end + 1], path.cost + (proportion - density) ** 2 + (rows - 1) * 0.15, path);
      }
    }
    paths = next;
  }
  let path = paths.get(words.length);
  if (!path) return null;
  return slots.map(() => {
    const [start, end] = path.span;
    path = path.before;
    return words.slice(start, end).join('');
  }).reverse();
};

const fontProperties = [
  'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch', 'fontVariant',
  'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'letterSpacing',
  'wordSpacing', 'lineHeight', 'textTransform', 'tabSize'
];

const copyFont = (target, source) => {
  const style = getComputedStyle(source);
  for (const key of fontProperties) target.style[key] = style[key];
  return style;
};

// Candidate B: the browser breaks the primary text, including authored joins.
// Deterministic allocation only decides which translation words fit each slot.
export const measureNotebookParallelFlow = ({ mirror, primarySample, secondarySample, segments, width, leadIn = null }) => {
  const fallback = reason => ({ reason, lines: [] });
  if (width < 1) return fallback('insufficient-width');
  if (segments.some(segment => !segment.primary.trim() || /[\r\n]/u.test(segment.primary + segment.secondary))) {
    return fallback('missing-primary-or-multiline-text');
  }
  const doc = mirror.ownerDocument;
  const primary = doc.createElement('div');
  const secondary = doc.createElement('div');
  const primaryStyle = copyFont(primary, primarySample);
  copyFont(secondary, secondarySample);
  Object.assign(primary.style, {
    width: width + 'px', whiteSpace: 'pre-wrap', overflowWrap: 'normal', wordBreak: 'normal',
    textAlign: primaryStyle.textAlign, textIndent: primaryStyle.textIndent
  });
  Object.assign(secondary.style, { whiteSpace: 'pre-wrap', overflowWrap: 'normal', wordBreak: 'normal' });
  mirror.replaceChildren(primary);
  try {
    const lead = leadIn?.firstElementChild?.cloneNode(true);
    if (lead) primary.append(lead);
    const nodes = segments.map((segment, index) => {
      const node = doc.createTextNode(segment.primary);
      primary.append(node);
      if (index < segments.length - 1) primary.append(segment.separator);
      return node;
    });
    const left = primary.getBoundingClientRect().left;
    const range = doc.createRange();
    const rows = [];
    const occurrences = segments.map(() => []);
    for (const [index, segment] of segments.entries()) {
      const words = tokenizeNotebookText(segment.primary);
      let offset = 0;
      let prefix = '';
      let fragment;
      for (const word of words) {
        const end = offset + word.trimEnd().length;
        if (end === offset) {
          prefix += word;
        } else {
          range.setStart(nodes[index], offset);
          range.setEnd(nodes[index], end);
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
          const rect = rects[0];
          if (rects.length !== 1 || rect.left < left - RECT_TOLERANCE || rect.right > left + width + RECT_TOLERANCE) {
            return fallback('primary-word-overflow');
          }
          let row = rows.at(-1);
          if (!row || Math.abs(row.top - rect.top) > RECT_TOLERANCE) {
            row = { top: rect.top, fragments: [] };
            rows.push(row);
          }
          if (fragment !== row.fragments.at(-1) || !fragment) {
            fragment = { index, x: rect.left - left, end: rect.right - left, primary: '', secondary: '', ordinal: occurrences[index].length };
            occurrences[index].push(fragment);
            row.fragments.push(fragment);
          }
          fragment.primary += prefix + word;
          fragment.end = rect.right - left;
          prefix = '';
        }
        offset += word.length;
      }
    }
    for (const row of rows) {
      row.fragments.forEach((fragment, index) => {
        const next = row.fragments[index + 1];
        fragment.width = (next?.x ?? width) - fragment.x;
        fragment.secondaryWidth = Math.max(0, fragment.width - (next ? TRANSLATION_GUTTER : 0));
      });
      if (row.fragments.some(fragment => fragment.end - fragment.x > fragment.width + RECT_TOLERANCE)) {
        return fallback('primary-slot-overflow');
      }
    }

    const context = doc.createElement('canvas').getContext('2d');
    if (!context) return fallback('secondary-measurement-unavailable');
    const secondaryStyle = getComputedStyle(secondarySample);
    context.font = `${secondaryStyle.fontStyle} ${secondaryStyle.fontWeight} ${secondaryStyle.fontSize} ${secondaryStyle.fontFamily}`;
    context.letterSpacing = secondaryStyle.letterSpacing === 'normal' ? '0px' : secondaryStyle.letterSpacing;
    context.wordSpacing = secondaryStyle.wordSpacing === 'normal' ? '0px' : secondaryStyle.wordSpacing;
    const measure = word => context.measureText(word).width;
    mirror.replaceChildren();
    const probes = [];
    for (const [index, segment] of segments.entries()) {
      const fragments = occurrences[index];
      const allocation = distributeNotebookTranslation(segment.secondary, fragments.map(fragment => fragment.secondaryWidth), measure);
      if (!allocation) return fallback('translation-overflow');
      fragments.forEach((fragment, ordinal) => {
        fragment.secondary = allocation[ordinal];
        if (!fragment.secondary.trim()) return;
        const probe = secondary.cloneNode();
        probe.style.width = fragment.secondaryWidth + 'px';
        probe.textContent = fragment.secondary.trimEnd();
        mirror.append(probe);
        probes.push(probe);
      });
    }
    for (const probe of probes) {
      const bounds = probe.getBoundingClientRect();
      range.selectNodeContents(probe);
      const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
      if (rects.length > MAX_TRANSLATION_ROWS || rects.some(rect => rect.right > bounds.right + RECT_TOLERANCE)) {
        return fallback('rendered-translation-overflow');
      }
    }
    return { lines: rows, reason: null, inlineLead: Boolean(lead && rows[0]?.fragments[0]?.x > 0) };
  } finally {
    mirror.replaceChildren();
  }
};
