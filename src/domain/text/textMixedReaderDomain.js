import { TextCardPresentationError, selectTextCardPresentation } from './textCardPresentationDomain.js';
import { resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { TEXT_LIBRARY_V2_SCHEMA_VERSION } from '../../constants/textDatabaseConstants.js';

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

/**
 * A1 owns the visual projection and validation. The detached hydrated tree keeps
 * source/audio metadata available to the one owning host without a second cache.
 * Both returned values are read-only views, never persistence/command payloads.
 */
export const selectTextMixedReaderState = (snapshot, { documentId } = {}) => {
  const presentation = selectTextCardPresentation(snapshot, { documentId });
  if (presentation.workspace.documentType !== 'mixed') {
    throw new TextCardPresentationError('UNSUPPORTED_WORKSPACE', 'The Mixed reader requires a Mixed Workspace.');
  }
  if (Number(snapshot?.schemaVersion) !== TEXT_LIBRARY_V2_SCHEMA_VERSION || !Array.isArray(snapshot?.contentUnits)) {
    throw new TextCardPresentationError('PERSISTENT_UNITS_REQUIRED', 'Mixed reading requires a complete disposable v2 snapshot; no migration is performed.');
  }
  for (const card of presentation.cards) {
    for (const unit of card.units) {
      if (unit.speakerId && !unit.speakerUid) {
        throw new TextCardPresentationError('INVALID_SNAPSHOT', `Speaker ${unit.speakerId} is not in this Workspace registry.`);
      }
    }
  }
  try {
    const documentTree = freeze(structuredClone(resolveTextLibraryDocumentTree(snapshot, presentation.workspace.id)));
    return Object.freeze({ presentation, documentTree });
  } catch (error) {
    throw new TextCardPresentationError('INVALID_SNAPSHOT', error.message);
  }
};

// These bridges are Workspace-type independent. No new session/token/index logic.
export {
  resolveTextConversationReaderCursor as resolveTextMixedReaderCursor,
  createTextConversationReaderActions as createTextMixedReaderActions
} from './textConversationReaderDomain.js';
