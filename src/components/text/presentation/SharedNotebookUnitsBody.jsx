import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { measureNotebookParallelFlow } from './notebookParallelFlowLayout.js';
import './sharedNotebookParallelFlow.css';

export default function SharedNotebookUnitsBody({
  segments, primaryChannel, secondaryChannel, primaryStyle, secondaryStyle,
  primaryClassName, secondaryClassName, primaryLang, secondaryLang,
  guides, spacing, resolveFlags, onActivate, renderFallback, inlineLeadIn
}) {
  const rootRef = useRef(null);
  const primaryRef = useRef(null);
  const secondaryRef = useRef(null);
  const leadRef = useRef(null);
  const leadKey = inlineLeadIn?.props.speakerInfo?.displayName || '';
  const layoutInput = JSON.stringify(segments);
  const typography = JSON.stringify([primaryStyle, secondaryStyle, primaryClassName, secondaryClassName, leadKey]);
  const [snapshot, setSnapshot] = useState(null);
  const focusRestore = useRef(null);
  const layout = snapshot?.input === layoutInput ? snapshot : null;

  useEffect(() => {
    const root = rootRef.current;
    const fonts = root.ownerDocument.fonts;
    const mirror = root.ownerDocument.createElement('div');
    mirror.className = 'prolingo-notebook-sample';
    mirror.setAttribute('aria-hidden', 'true');
    let visible = false;
    let disposed = false;
    let frame = null;
    let measuredWidth;
    const queue = () => {
      if (disposed || !visible || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!visible || root.closest('[inert], [hidden]') || !root.getClientRects().length) return;
        const style = getComputedStyle(root);
        if (style.visibility !== 'visible') return;
        const width = root.getBoundingClientRect().width;
        // A transformed Focus ancestor changes visual geometry, not the width
        // available to the authored text. The mirror sits in the document body.
        const contentWidth = parseFloat(style.width) || width;
        if (!contentWidth || contentWidth === measuredWidth) return;
        measuredWidth = contentWidth;
        root.ownerDocument.body.append(mirror);
        let measured;
        try {
          measured = measureNotebookParallelFlow({
            mirror,
            primarySample: primaryRef.current,
            secondarySample: secondaryRef.current,
            segments: JSON.parse(layoutInput),
            width: contentWidth,
            leadIn: leadRef.current
          });
        } finally {
          mirror.remove();
        }
        const focused = root.ownerDocument.activeElement;
        if (root.contains(focused) && focused.dataset.notebookAction) {
          focusRestore.current = focused.dataset.notebookAction;
        } else if (root.contains(focused) && focused.dataset.sharedCardSegment) {
          focusRestore.current = focused.dataset.sharedCardSegment + ':' + focused.dataset.sharedCardChannel;
        }
        setSnapshot({ ...measured, input: layoutInput });
      });
    };
    const resize = new ResizeObserver(queue);
    resize.observe(root);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      queue();
    }, { rootMargin: '500px 0px' });
    visibility.observe(root);
    const invalidateFonts = () => {
      measuredWidth = undefined;
      queue();
    };
    fonts?.addEventListener('loadingdone', invalidateFonts);
    if (fonts?.status === 'loading') fonts.ready.then(invalidateFonts);
    return () => {
      disposed = true;
      resize.disconnect();
      visibility.disconnect();
      fonts?.removeEventListener('loadingdone', invalidateFonts);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [layoutInput, typography]);

  useLayoutEffect(() => {
    const key = focusRestore.current;
    focusRestore.current = null;
    const root = rootRef.current;
    if (!key || root.contains(root.ownerDocument.activeElement) || root.ownerDocument.activeElement !== root.ownerDocument.body) return;
    const target = [...root.querySelectorAll('[data-notebook-action], [role="button"][data-shared-card-segment]')]
      .find(node => (node.dataset.notebookAction || node.dataset.sharedCardSegment + ':' + node.dataset.sharedCardChannel) === key);
    target?.focus({ preventScroll: true });
  }, [layout]);

  const renderFragment = (fragment, channel, text, style, className, lang, role) => {
    if (!text) return null;
    const segment = segments[fragment.index];
    const flags = resolveFlags(fragment.index, channel);
    return (
      <span
        lang={lang}
        {...flags.dataAttributes}
        data-shared-notebook-fragment={fragment.ordinal}
        data-shared-notebook-role={role}
        data-shared-notebook-join-after={segment.joinAfter}
        data-text-player-segment={segment.id}
        data-text-player-segment-active={flags.speaking || flags.paused ? 'true' : undefined}
        data-text-search-focus-segment={flags.focused ? 'true' : undefined}
        data-notebook-speaking={flags.speaking || flags.fullChannelHighlighted ? 'true' : undefined}
        data-notebook-target={segment.id + ':' + channel}
        className={`prolingo-notebook-fragment ${className} ${flags.className}${flags.focused ? ' outline outline-1 outline-amber-400' : ''}${flags.segmentDisabled ? '' : ' cursor-pointer'}`}
        style={{
          ...style, textIndent: 0, overflowWrap: 'normal', hyphens: 'none',
          width: role === 'primary' ? Math.min(fragment.width, fragment.end - fragment.x + 0.5) : fragment.secondaryWidth,
          ...(role === 'secondary'
            ? { textAlign: 'left', textAlignLast: 'start' }
            : { textAlignLast: style.textAlign })
        }}
        onClick={flags.segmentDisabled ? undefined : () => onActivate(segment.id, channel)}
      >{text}</span>
    );
  };

  // Keep a single accessible text/action for each authored Segment/channel.
  // The visual projection may have several fragments and is hidden from AT.
  const actions = layout && !layout.reason && (
    <div className="prolingo-notebook-actions">
      {segments.flatMap((segment, index) => [[primaryChannel, segment.primary, primaryLang], [secondaryChannel, segment.secondary, secondaryLang]]
        .filter(([, text]) => text.trim())
        .map(([channel, text, lang]) => {
          const flags = resolveFlags(index, channel);
          return flags.segmentDisabled
            ? <span key={segment.id + ':' + channel} className="sr-only" lang={lang}>{text}</span>
            : <button key={segment.id + ':' + channel} type="button" lang={lang}
                data-notebook-action={segment.id + ':' + channel}
                aria-label={flags.accessibleLabel + ': ' + text}
                onClick={() => onActivate(segment.id, channel)}>{text}</button>;
        }))}
    </div>
  );

  return (
    <div ref={rootRef} className="prolingo-notebook-unit" data-shared-notebook-unit={layout ? (layout.reason ? 'fallback' : 'parallel') : 'pending'}
      data-shared-notebook-guides={guides ? 'on' : 'off'} data-shared-notebook-spacing={spacing}>
      {inlineLeadIn && <div ref={leadRef} style={{ ...primaryStyle, textIndent: 0, ...(layout?.inlineLead ? { position: 'absolute', inset: '0 auto auto 0' } : {}) }}>{inlineLeadIn}</div>}
      <div aria-hidden="true" className="prolingo-notebook-sample">
        <span ref={primaryRef} style={primaryStyle} className={primaryClassName} />
        <span ref={secondaryRef} style={secondaryStyle} className={secondaryClassName} />
      </div>
      {!layout || layout.reason ? (
        <>
          {layout?.reason && <p role="note" data-shared-notebook-fallback={layout.reason} className="text-xs text-slate-500 dark:text-slate-400 mb-2">Sentence Interlinear for this unit</p>}
          {renderFallback()}
        </>
      ) : (
        <>
          {actions}
          <div aria-hidden="true" className="prolingo-notebook-lines">
            {layout.lines.map((line, lineIndex) => (
              <div key={lineIndex} className="prolingo-notebook-line" data-shared-notebook-line="true"
                style={{ gridTemplateColumns: [`${Math.max(0, line.fragments[0].x)}px`, ...line.fragments.map(fragment => `minmax(0, ${fragment.width}px)`)].join(' ') }}>
                {line.fragments.map((fragment, index) => (
                  <div className="prolingo-notebook-slot" key={fragment.index} style={{ gridColumn: index + 2 }}>
                    {renderFragment(fragment, primaryChannel, fragment.primary, primaryStyle, primaryClassName, primaryLang, 'primary')}
                    {renderFragment(fragment, secondaryChannel, fragment.secondary, secondaryStyle, secondaryClassName, secondaryLang, 'secondary')}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
