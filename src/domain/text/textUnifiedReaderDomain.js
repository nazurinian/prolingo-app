import { validateTextManagementSnapshot } from './textDataManagementDomain.js';
import { selectTextMainReaderPresentation } from './textMainReaderDomain.js';
import { resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
export const selectTextUnifiedReader = (candidate, documentId) => {
  const snapshot = validateTextManagementSnapshot(candidate);
  const { presentation, reason } = selectTextMainReaderPresentation(snapshot, documentId);
  if (!presentation) throw Object.assign(Error(reason), { code: 'UNSUPPORTED_WORKSPACE' });
  if (presentation.cards.some(c => c.units.some(u => u.kind === 'turn' && u.speakerId && !u.speakerUid))) {
    throw Object.assign(Error('Unresolved Speaker identity'), { code: 'INVALID_SNAPSHOT' });
  }
  return { presentation, documentTree: resolveTextLibraryDocumentTree(snapshot, documentId) };
};
