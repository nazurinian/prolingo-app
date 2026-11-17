import React, { useCallback, useMemo, useState } from 'react';
import { createP13MixedFixture } from '../../../../scripts/fixtures/p13-mixed/mixed-workspace-fixture.js';
import { selectTextMixedReaderState } from '../../../domain/text/textMixedReaderDomain.js';
import { normalizeTextCardPresentationState } from '../../../domain/text/textCardPresentationStateDomain.js';
import { useConversationAudioPlayback } from '../conversation/useConversationAudioPlayback.js';
import SharedMixedWorkspaceReader from './SharedMixedWorkspaceReader.jsx';

/** DEV-only isolated reading pilot. One existing host for the entire hydrated tree. */
export default function TextMixedWorkspaceQaPreview() {
  const [fixture, setFixture] = useState(createP13MixedFixture);
  const [otherWorkspace, setOtherWorkspace] = useState(false);
  const [view, setView] = useState(normalizeTextCardPresentationState);
  const [focusTarget, setFocusTarget] = useState(null);
  const documentId = otherWorkspace ? fixture.ids.mixedDocumentId : fixture.ids.documentId;
  const state = useMemo(() => selectTextMixedReaderState(fixture.snapshot, { documentId }), [fixture, documentId]);
  const audioConfig = useMemo(() => ({
    preferences: fixture.preferences, playbackChannelMode: 'text-only', playbackRepresentationMode: 'split', globalPlaybackRate: 1
  }), [fixture]);
  const audioPlayback = useConversationAudioPlayback({
    snapshot: fixture.snapshot, documentTree: state.documentTree, audioConfig
  });
  const consumeFocus = useCallback(nonce => setFocusTarget(current => current?.nonce === nonce ? null : current), []);
  const reveal = cardId => {
    const card = state.presentation.cardById[cardId];
    setFocusTarget(previous => ({
      documentId, blockId: cardId,
      segmentId: card.units.flatMap(u => u.segments)[0]?.id ?? null,
      nonce: (previous?.nonce || 0) + 1
    }));
  };
  return (
    <main data-mixed-workspace-qa-preview="true" className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-3">
        <header className="space-y-2">
          <h1 className="text-lg font-bold">P13 Mixed Workspace — isolated QA</h1>
          <p className="text-sm">Disposable v2 fixture. No canonical storage. Paragraph Sections and Speaker Turns stay in separate Cards.</p>
          <p className="text-sm">One existing audio host. Metadata-only fixture audio falls back through the existing browser playback path. This is not production Mixed audio activation.</p>
          <p className="text-sm" data-mixed-qa-audio-scope="split-1x">Audio QA: Split at 1×. Full audio and rate integration remain gated for P13-A4; Full/Part/Segment below controls reading only.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 border rounded px-3" data-mixed-qa-workspace onClick={() => { setFocusTarget(null); setOtherWorkspace(v => !v); }}>Switch Workspace</button>
            <button type="button" className="min-h-11 border rounded px-3" data-mixed-qa-reset onClick={() => { setFocusTarget(null); setFixture(createP13MixedFixture()); }}>Reset fixture</button>
            <button type="button" className="min-h-11 border rounded px-3" onClick={audioPlayback.pausePlayback}>Pause</button>
            <button type="button" className="min-h-11 border rounded px-3" onClick={audioPlayback.resumePlayback}>Resume</button>
            <button type="button" className="min-h-11 border rounded px-3" onClick={audioPlayback.stopPlayback}>Stop</button>
          </div>
          <nav aria-label="Find Card" className="flex flex-wrap gap-2">
            {state.presentation.cards.map(card => <button key={card.id} type="button" data-mixed-qa-find={card.id}
              className="min-h-11 border rounded px-3 text-xs" onClick={() => reveal(card.id)}>{card.title || card.id}</button>)}
          </nav>
        </header>
        <SharedMixedWorkspaceReader snapshot={fixture.snapshot} documentId={documentId} audioPlayback={audioPlayback}
          presentationState={view} onPresentationStateChange={setView} focusTarget={focusTarget} onFocusConsumed={consumeFocus} />
      </div>
    </main>
  );
}
