import { validateTextManagementSnapshot, freezeTextManagementView, TextDataManagementError } from './textDataManagementDomain.js';
import { resolveLegacyTextIdentityProjection, resolveTextLibraryDocumentTree } from './textLibraryDomain.js';

/** Caller-supplied snapshots only. No Content Units, commands, persistence or audio ownership. */
export const selectTextLegacyManagement = (candidate, { documentId = null } = {}) => {
  const snapshot = validateTextManagementSnapshot(candidate);
  const catalog = snapshot.documents.filter(d => d.editorModel === 'legacy-line-v1');
  if (!documentId) return freezeTextManagementView({ catalog, workspace: null, capabilities: { edit: false, delete: false, migrate: false, audioGenerate: false, physicalDelete: false } });
  const document = snapshot.documents.find(d => d.id === documentId);
  if (!document || document.editorModel !== 'legacy-line-v1') throw new TextDataManagementError('UNSUPPORTED_WORKSPACE', 'Select an explicit Legacy Workspace');
  const tree = resolveTextLibraryDocumentTree(snapshot, documentId);
  const compatibility = resolveLegacyTextIdentityProjection({ document, blocks: tree.blocks, segments: tree.blocks.flatMap(b => b.segments), highWater: snapshot.counters.text });
  const lines = tree.blocks.map(block => {
    const segment = block.segments[0];
    return { id: block.id, uid: block.uid ?? null, documentId, order: block.order, metadata: block.metadata,
      segment: { ...segment }, audioReadiness: 'not-evaluated' };
  });
  return freezeTextManagementView({ catalog, workspace: { document, lines, highWater: compatibility.highWater },
    capabilities: { edit: false, delete: false, migrate: false, audioGenerate: false, physicalDelete: false } });
};

export const inspectTextLegacyManagement = (snapshot, options) => {
  try { return { status: 'ready', view: selectTextLegacyManagement(snapshot, options), error: null }; }
  catch (error) { return { status: 'unavailable', view: null, error: { code: error.code || 'INVALID_SNAPSHOT', message: error.message } }; }
};
