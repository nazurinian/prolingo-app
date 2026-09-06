import { TEXT_LEGACY_EDITOR_MODEL } from '../../constants/textDatabaseConstants.js';
import { TEXT_LIBRARY_COMMAND_TYPES } from '../../domain/text/textLibraryCommandDomain.js';
import {
  resolveLegacyTextIdentityProjection,
  resolveTextLibraryDocumentTree
} from '../../domain/text/textLibraryDomain.js';
import { createEmptyTextIdentityState } from '../../domain/text/textIdentityDomain.js';
import { executeTextLibraryCommand } from './textLibraryCommandService.js';
import { syncLegacyTextProjectionToDatabase } from './textLibraryIndexedDbService.js';

export const resolveTextLibraryActiveProjection = librarySnapshot => {
  const activeDocumentId = librarySnapshot?.activeDocumentId || null;
  const document = librarySnapshot?.documents?.find(item => item.id === activeDocumentId) || null;
  if (!document || document.editorModel !== TEXT_LEGACY_EDITOR_MODEL) {
    const empty = createEmptyTextIdentityState();
    return { document, textIdentityState: empty, textContent: empty.rawContent };
  }
  const tree = resolveTextLibraryDocumentTree(librarySnapshot, activeDocumentId);
  const textIdentityState = resolveLegacyTextIdentityProjection({
    document,
    blocks: tree?.blocks || [],
    segments: (tree?.blocks || []).flatMap(block => block.segments || []),
    highWater: librarySnapshot.counters?.text || 0
  });
  return { document, textIdentityState, textContent: textIdentityState.rawContent };
};

const flushActiveLegacyProjection = async ({
  activeTextDocumentId,
  activeTextEditorModel,
  textIdentityState,
  setTextLibrarySnapshot
}) => {
  if (!activeTextDocumentId || activeTextEditorModel !== TEXT_LEGACY_EDITOR_MODEL) return null;
  const flushed = await syncLegacyTextProjectionToDatabase({
    documentId: activeTextDocumentId,
    textIdentityState
  });
  if (flushed?.librarySnapshot) setTextLibrarySnapshot(flushed.librarySnapshot);
  return flushed;
};

const applyActiveDocumentRuntime = ({
  librarySnapshot,
  setTextLibrarySnapshot,
  setActiveTextDocumentId,
  setTextIdentityState,
  setTextContent
}) => {
  const projection = resolveTextLibraryActiveProjection(librarySnapshot);
  setTextLibrarySnapshot(librarySnapshot);
  setActiveTextDocumentId(librarySnapshot.activeDocumentId || null);
  setTextIdentityState(projection.textIdentityState);
  setTextContent(projection.textContent);
  return projection;
};

export const executeTextLibrarySelectDocument = async ({
  documentId,
  activeTextDocumentId,
  activeTextEditorModel,
  textIdentityState,
  setTextLibrarySnapshot,
  setActiveTextDocumentId,
  setTextIdentityState,
  setTextContent,
  addLog
}) => {
  if (!documentId || documentId === activeTextDocumentId) return null;
  await flushActiveLegacyProjection({
    activeTextDocumentId,
    activeTextEditorModel,
    textIdentityState,
    setTextLibrarySnapshot
  });
  const result = await executeTextLibraryCommand({
    type: TEXT_LIBRARY_COMMAND_TYPES.SET_ACTIVE_DOCUMENT,
    payload: { id: documentId }
  });
  const projection = applyActiveDocumentRuntime({
    librarySnapshot: result.librarySnapshot,
    setTextLibrarySnapshot,
    setActiveTextDocumentId,
    setTextIdentityState,
    setTextContent
  });
  addLog?.('Text Library', `Active Document: ${projection.document?.title || documentId}.`);
  return result;
};

export const executeTextLibraryCreateDocument = async ({
  payload,
  activeTextDocumentId,
  activeTextEditorModel,
  textIdentityState,
  setTextLibrarySnapshot,
  setActiveTextDocumentId,
  setTextIdentityState,
  setTextContent,
  addLog
}) => {
  await flushActiveLegacyProjection({
    activeTextDocumentId,
    activeTextEditorModel,
    textIdentityState,
    setTextLibrarySnapshot
  });
  const result = await executeTextLibraryCommand({
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_DOCUMENT,
    payload: { ...payload, makeActive: true }
  });
  const projection = applyActiveDocumentRuntime({
    librarySnapshot: result.librarySnapshot,
    setTextLibrarySnapshot,
    setActiveTextDocumentId,
    setTextIdentityState,
    setTextContent
  });
  addLog?.('Text Library', `Created structured Document ${result.id}: ${projection.document?.title || result.id}.`);
  return result;
};

export const executeTextLibraryCreateCollection = async ({ title, setTextLibrarySnapshot, addLog }) => {
  const result = await executeTextLibraryCommand({
    type: TEXT_LIBRARY_COMMAND_TYPES.CREATE_COLLECTION,
    payload: { title }
  });
  setTextLibrarySnapshot(result.librarySnapshot);
  addLog?.('Text Library', `Created Collection ${result.id}.`);
  return result;
};

export const executeTextLibraryRenameDocument = async ({ id, title, setTextLibrarySnapshot, addLog }) => {
  const result = await executeTextLibraryCommand({
    type: TEXT_LIBRARY_COMMAND_TYPES.UPDATE_DOCUMENT,
    payload: { id, title }
  });
  setTextLibrarySnapshot(result.librarySnapshot);
  addLog?.('Text Library', `Renamed Document ${id}.`);
  return result;
};

export const executeTextLibraryStructuredCommand = async ({ command, setTextLibrarySnapshot, addLog }) => {
  const result = await executeTextLibraryCommand(command);
  setTextLibrarySnapshot(result.librarySnapshot);
  const label = [result.entity, result.action].filter(Boolean).join(' ');
  addLog?.('Text Library', `${label || 'Structured command'}${result.id ? `: ${result.id}` : ''}.`);
  return result;
};
