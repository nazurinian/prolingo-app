import React, { useMemo } from 'react';
import {
  selectTextConversationReaderPresentation,
  resolveTextConversationReaderCursor,
  createTextConversationReaderActions
} from '../../../domain/text/textConversationReaderDomain.js';
import SharedWorkspaceReader from './SharedParagraphCardReader.jsx';

/** Read-only sibling of D4. Owns neither commands nor an audio hook/session. */
export default function SharedConversationReader({ snapshot, documentId, audioPlayback = null, isBusy = false,
  presentationState = null, onPresentationStateChange = null, focusTarget = null, onFocusConsumed = null }) {
  const selection = useMemo(() => {
    try {
      return { presentation: selectTextConversationReaderPresentation(snapshot, { documentId }) };
    } catch (error) {
      return { error };
    }
  }, [snapshot, documentId]);
  if (selection.error) return <p role="alert">Conversation reader unavailable: {selection.error.message}</p>;
  const { presentation } = selection;
  const cursor = resolveTextConversationReaderCursor({ presentation, audioPlayback });
  const disabled = isBusy || !audioPlayback;
  const actions = createTextConversationReaderActions({ presentation, audioPlayback, disabled });
  return (
    <section data-shared-conversation-reader="true" data-reader-cursor-precision={cursor.precision}
      data-reader-cursor-segment={cursor.segmentId || undefined} data-reader-cursor-unit={cursor.unitId || undefined}
      data-reader-cursor-card={cursor.cardId || undefined} data-reader-cursor-channel={cursor.channel || undefined}>
      <SharedWorkspaceReader key={`${presentation.workspace.id}:${presentation.workspace.uid}`}
        presentation={presentation} playbackCursor={cursor} disabled={disabled}
        presentationState={presentationState} onPresentationStateChange={onPresentationStateChange}
        focusTarget={focusTarget} onFocusConsumed={onFocusConsumed} {...actions} />
    </section>
  );
}
