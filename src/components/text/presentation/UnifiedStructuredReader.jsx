import React, { useEffect, useMemo, useRef } from 'react';
import { selectTextUnifiedReader } from '../../../domain/text/textUnifiedReaderDomain.js';
import { resolveTextConversationReaderCursor, createTextConversationReaderActions } from '../../../domain/text/textConversationReaderDomain.js';
import SharedWorkspaceReader from './SharedParagraphCardReader.jsx';
import TextParagraphUnifiedReading from '../TextParagraphUnifiedReading.jsx';

/** Read-only classic/Shared adapter. Playback remains entirely in the supplied host. */
export default function UnifiedStructuredReader({ snapshot, documentId, audioPlayback, mode = 'classic',
  view, onViewChange, focusTarget = null, onFocusConsumed, disabled = false }) {
  const root = useRef(null);
  const selected = useMemo(() => { try { return selectTextUnifiedReader(snapshot, documentId); } catch (error) { return { error }; } }, [snapshot, documentId]);
  const presentation = selected.presentation;
  const cursor = resolveTextConversationReaderCursor({ presentation, audioPlayback });
  const actions = createTextConversationReaderActions({ presentation, audioPlayback, disabled });
  useEffect(() => {
    if (mode !== 'classic' || !focusTarget?.segmentId || focusTarget.documentId !== documentId) return;
    const targets = root.current?.querySelectorAll('[data-text-player-segment]');
    const target = [...(targets || [])].find(el => el.dataset.textPlayerSegment === focusTarget.segmentId);
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'auto' }); onFocusConsumed?.(focusTarget.nonce); }
  }, [mode, focusTarget, documentId, onFocusConsumed]);
  if (selected.error) return <p role="alert">{selected.error.message}</p>;
  return <section ref={root} data-unified-reader={mode} data-reader-cursor-precision={cursor.precision}
    data-reader-cursor-segment={cursor.segmentId || ''} data-reader-cursor-card={cursor.cardId || ''}>
    {mode === 'shared' ? <SharedWorkspaceReader presentation={presentation} presentationState={view} onPresentationStateChange={onViewChange}
      playbackCursor={cursor} disabled={disabled} focusTarget={focusTarget} onFocusConsumed={onFocusConsumed} {...actions} />
      : <div className="space-y-4">
        {presentation.workspace.documentType !== 'paragraph' && <p className="text-sm">Tampilan Lama — compatible Turn adapter; not the former flat Sentence list.</p>}
        {!presentation.cards.length && <p>No Cards yet.</p>}
        {presentation.cards.map(card => <article key={card.id} data-classic-card={card.id} className="border rounded-xl p-4 space-y-3">
          <header className="flex flex-wrap gap-3 items-center"><h2 className="font-bold">{card.title || card.id}</h2>
            <button type="button" className="border rounded px-3 min-h-11" disabled={disabled || !card.units.some(u => u.segments.length)} onClick={() => actions.onPlayCard(card.id)}>Play Card</button></header>
          {!card.units.length && <p>Empty Card — no Units.</p>}
          {card.units.map(unit => <section key={unit.viewKey} data-classic-unit={unit.id || unit.viewKey} className="space-y-2">
            <h3 className="font-semibold">{unit.kind === 'turn' ? unit.speakerLabel || 'Unassigned Speaker' : 'Section'} <small>{unit.order}</small></h3>
            {!unit.segments.length && <p>Intentionally empty {unit.label}.</p>}
            <TextParagraphUnifiedReading segments={unit.segments} splitMode displayMode="text-meaning"
              disabled={disabled} activeSegmentId={cursor.precision === 'segment' ? cursor.segmentId : null}
              fullCardActive={cursor.precision === 'card' && cursor.cardId === card.id}
              isPlaybackActive={cursor.state === 'playing' || cursor.state === 'paused'} speakingPart={cursor.channel}
              focusSegmentId={focusTarget?.segmentId} onPlaySegment={actions.onPlaySegment}
              onPlayChannel={channel => actions.onPlayCard(card.id, { playbackChannelMode: channel === 'meaning' ? 'meaning-only' : 'text-only' })} />
          </section>)}
        </article>)}
      </div>}
  </section>;
}
