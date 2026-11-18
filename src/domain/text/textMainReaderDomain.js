import { selectTextCardPresentation } from './textCardPresentationDomain.js';
import { resolveTextCardPresentationCursor } from './textCardPresentationCursorDomain.js';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from './textStructuredPlaybackDomain.js';

/** Main Text pilot: read-only eligibility; never repairs or migrates a snapshot. */
export const selectTextMainReaderPresentation = (snapshot, documentId) => {
  const document = Array.isArray(snapshot?.documents) ? snapshot.documents.find(item => item?.id === documentId) : null;
  if (!document) return { presentation: null, reason: 'Pilih Workspace Paragraph yang sudah dimuat.' };
  if (document.editorModel !== 'structured-v1') {
    return { presentation: null, reason: 'Shared Beta belum tersedia untuk Workspace Legacy.' };
  }
  if (!['paragraph', 'conversation', 'mixed'].includes(document.documentType)
    || (snapshot.schemaVersion !== 2 && document.documentType !== 'paragraph')) {
    return { presentation: null, reason: 'Conversation/Mixed memerlukan snapshot v2 lengkap di lingkungan QA terisolasi.' };
  }
  try {
    const presentation = selectTextCardPresentation(snapshot, { documentId });
    return { presentation, reason: null };
  } catch {
    return { presentation: null, reason: 'Snapshot belum lengkap atau tidak valid untuk Shared Beta. Tampilan Lama tetap digunakan.' };
  }
};

/**
 * Provenance is captured by the owning App at its existing playback-cursor callback.
 * Require the same snapshot object and actual engine session/status. Never use a
 * browse index as audible evidence, including during the async start transition.
 */
export const resolveTextMainReaderCursor = ({
  presentation, snapshot, provenance, context, sessionId, status,
  isPlaying, isPaused, playingContext, stopped
}) => {
  const current = presentation && !stopped
    && provenance?.snapshot === snapshot
    && provenance?.documentId === presentation.workspace.id
    && provenance?.workspaceUid === presentation.workspace.uid
    && provenance?.sessionId === sessionId
    && context?.sessionId === sessionId
    && context?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
    && context?.documentId === presentation.workspace.id
    && status?.sessionId === sessionId
    && status?.documentId === presentation.workspace.id;
  return resolveTextCardPresentationCursor({
    presentation,
    playback: current ? {
      workspaceId: provenance.documentId, workspaceUid: provenance.workspaceUid,
      sessionId, playingContext, isPlaying, isPaused,
      playbackSourceStatus: status
    } : {}
  });
};
