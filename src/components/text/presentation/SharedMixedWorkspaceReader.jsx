import React, { useMemo } from 'react';
import {
  selectTextMixedReaderState,
  resolveTextMixedReaderCursor,
  createTextMixedReaderActions
} from '../../../domain/text/textMixedReaderDomain.js';
import SharedWorkspaceReader from './SharedParagraphCardReader.jsx';

/** Read-only mixed-Card adapter. The parent owns the sole existing playback host. */
export default function SharedMixedWorkspaceReader({ snapshot, documentId, audioPlayback = null, isBusy = false,
  presentationState = null, onPresentationStateChange = null, focusTarget = null, onFocusConsumed = null }) {
  const selection = useMemo(() => {
    try { return selectTextMixedReaderState(snapshot, { documentId }); }
    catch (error) { return { error }; }
  }, [snapshot, documentId]);
  if (selection.error) return <p role="alert">Mixed reader unavailable: {selection.error.message}</p>;
  const { presentation } = selection;
  const cursor = resolveTextMixedReaderCursor({ presentation, audioPlayback });
  const disabled = isBusy || !audioPlayback;
  const actions = createTextMixedReaderActions({ presentation, audioPlayback, disabled });
  return (
    <section data-shared-mixed-reader="true" data-reader-cursor-precision={cursor.precision}
      data-reader-cursor-segment={cursor.segmentId || undefined} data-reader-cursor-unit={cursor.unitId || undefined}
      data-reader-cursor-card={cursor.cardId || undefined} data-reader-cursor-channel={cursor.channel || undefined}>
      <SharedWorkspaceReader key={`${presentation.workspace.id}:${presentation.workspace.uid}`}
        presentation={presentation} playbackCursor={cursor} disabled={disabled}
        presentationState={presentationState} onPresentationStateChange={onPresentationStateChange}
        focusTarget={focusTarget} onFocusConsumed={onFocusConsumed} {...actions} />
    </section>
  );
}
