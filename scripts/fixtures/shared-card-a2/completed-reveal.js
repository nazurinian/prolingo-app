// Browser-test observation only: never scrolls, focuses or changes the target.
const sampleReveal = target => {
  if (!target?.isConnected || target.closest('[inert], [aria-hidden="true"]')) return { visible: false };
  const style = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  const bounds = { top: 0, left: 0, bottom: innerHeight, right: innerWidth };
  const scrollContainers = [];
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent === document.scrollingElement) continue;
    const parentStyle = getComputedStyle(parent);
    const clipX = /auto|scroll|hidden|clip/.test(parentStyle.overflowX);
    const clipY = /auto|scroll|hidden|clip/.test(parentStyle.overflowY);
    if (!clipX && !clipY) continue;
    const box = parent.getBoundingClientRect();
    const top = box.top + parent.clientTop;
    const left = box.left + parent.clientLeft;
    if (clipY) { bounds.top = Math.max(bounds.top, top); bounds.bottom = Math.min(bounds.bottom, top + parent.clientHeight); }
    if (clipX) { bounds.left = Math.max(bounds.left, left); bounds.right = Math.min(bounds.right, left + parent.clientWidth); }
    scrollContainers.push({ top: parent.scrollTop, left: parent.scrollLeft, height: parent.clientHeight, width: parent.clientWidth });
  }
  const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    && Number(style.opacity) > 0 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
    && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
  return { visible, segmentId: target.dataset.textPlayerSegment, channel: target.dataset.sharedCardChannel,
    rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, bounds,
    documentTop: scrollY, documentLeft: scrollX, scrollContainers };
};

/** Require actual clipped visibility AND stable geometry/scroll offsets, within a deadline. */
export const waitForCompletedReveal = async (getTarget, { label = 'Search target', timeoutMs = 4000, settleMs = 120 } = {}) => {
  const start = performance.now();
  let stableSince = null;
  let previous = null;
  let last;
  while (performance.now() - start < timeoutMs) {
    last = sampleReveal(getTarget());
    const now = performance.now();
    const coordinates = last.visible ? [
      ...Object.values(last.rect), ...Object.values(last.bounds), last.documentTop, last.documentLeft,
      ...last.scrollContainers.flatMap(container => Object.values(container))
    ] : null;
    const unchanged = coordinates && previous && coordinates.length === previous.length
      && coordinates.every((value, i) => Math.abs(value - previous[i]) < 0.5);
    stableSince = last.visible ? (unchanged ? stableSince ?? now : now) : null;
    if (stableSince !== null && now - stableSince >= settleMs) {
      return { label, ...last, elapsedMs: Math.round(now - start), settledMs: Math.round(now - stableSince),
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    }
    previous = coordinates;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`${label} was not visibly revealed and settled within ${timeoutMs}ms: ${JSON.stringify(last)}`);
};
