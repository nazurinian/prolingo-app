import { createProLingoTextPack, validateProLingoTextPack, mergeProLingoTextPack } from './textPackJsonDomain.js';
import { createProLingoTextDatabaseBackup, validateProLingoTextDatabaseBackup, resolveProLingoTextDatabaseBackupDiagnostics } from './textDatabaseBackupDomain.js';
import { validateProLingoTextExternalPackage, planProLingoTextExternalInitialImport } from './textExternalJsonDomain.js';
import { inspectTextExternalReconciliation } from './textExternalReconciliationDomain.js';
import { planTextSourceSync, planTextSourceDetach } from './textSourceAttachmentDomain.js';
import { validateTextManagementSnapshot, resolveTextManagementSelection, freezeTextManagementView, TextDataManagementError } from './textDataManagementDomain.js';
import { canonicalJsonStringify } from './textCanonicalFingerprintDomain.js';

const fail = (code, message) => { throw new TextDataManagementError(code, message); };
/** JSON/data only. No downloads, writes, restore, attach, deletion or physical audio access. */
const exportData = (candidate, { kind, selection = {}, metaRecords, now = Date.now() } = {}) => {
  const snapshot = validateTextManagementSnapshot(candidate);
  const scope = resolveTextManagementSelection(snapshot, selection);
  if (kind === 'text-pack') {
    if (!scope.workspaceId && !scope.collectionId) fail('SELECT_EXPORT_SCOPE', 'Select a Workspace or Collection for Text Pack export');
    return freezeTextManagementView(createProLingoTextPack({ snapshot,
      scopeType: scope.workspaceId ? 'document' : 'collection', rootId: scope.workspaceId || scope.collectionId, now }));
  }
  if (kind !== 'database-backup') fail('UNSUPPORTED_OPERATION', 'Use text-pack or database-backup');
  if (!Array.isArray(metaRecords)) fail('METADATA_REQUIRED', 'Database backup requires the complete authoritative metaRecords from the same read as the snapshot');
  const meta = new Map(metaRecords.map(record => [record.key, record.value]));
  for (const [key, value] of Object.entries({ schemaVersion: snapshot.schemaVersion, initialized: snapshot.initialized,
    activeDocumentId: snapshot.activeDocumentId, idCounters: snapshot.counters,
    ...(snapshot.contentUnitMigration ? { contentUnitMigration: snapshot.contentUnitMigration } : {}) })) {
    if (canonicalJsonStringify(meta.get(key)) !== canonicalJsonStringify(value)) fail('METADATA_MISMATCH', 'Backup metadata must match the snapshot: ' + key);
  }
  return freezeTextManagementView(createProLingoTextDatabaseBackup({ stores: snapshot, metaRecords: structuredClone(metaRecords), now }));
};

const inspectTransfer = ({ kind, data }) => {
  const candidate = typeof data === 'string' ? JSON.parse(data) : structuredClone(data);
  if (kind === 'database-backup') return freezeTextManagementView({ kind,
    ...validateProLingoTextDatabaseBackup(candidate), diagnostics: resolveProLingoTextDatabaseBackupDiagnostics(candidate), applyEnabled: false });
  if (kind === 'text-pack') return freezeTextManagementView({ kind, ...validateProLingoTextPack(candidate), applyEnabled: false });
  if (kind === 'external-json') return freezeTextManagementView({ kind, ...validateProLingoTextExternalPackage(candidate), applyEnabled: false });
  fail('UNSUPPORTED_OPERATION', 'Unknown transfer format');
};

/** Preview only; the returned native plan is never a command acknowledgement. */
const previewTransfer = (candidate, { operation, data, selection = {}, sourceAttachments = [], externalImports = [], attachmentId, now = Date.now() } = {}) => {
  const snapshot = validateTextManagementSnapshot(candidate);
  const scope = resolveTextManagementSelection(snapshot, selection);
  let plan;
  if (['text-pack-copy', 'external-json-import'].includes(operation)) {
    if (scope.workspaceId || scope.collectionId !== undefined) fail('OUT_OF_SCOPE', 'Import preview requires the whole-library scope');
    plan = operation === 'text-pack-copy' ? mergeProLingoTextPack({ localSnapshot: snapshot, pack: data, now })
      : planProLingoTextExternalInitialImport({ localSnapshot: snapshot, package: data, existingImports: structuredClone(externalImports), now });
  } else if (['source-sync', 'source-detach'].includes(operation)) {
    const attachment = structuredClone(sourceAttachments.find(a => a.attachmentId === attachmentId));
    if (!attachment || !scope.workspaceId || !Object.values(attachment.idMap?.documents || {}).includes(scope.workspaceId)) fail('OUT_OF_SCOPE', 'Attachment does not own this Workspace');
    const owned = [...new Set(Object.values(attachment.idMap.documents))];
    if (owned.length !== 1) fail('COLLECTION_SOURCE_SCOPE_REQUIRED', 'Multi-Workspace source preview must be reviewed at its Collection boundary; not enabled in A1');
    plan = operation === 'source-sync' ? planTextSourceSync({ localSnapshot: snapshot, pack: data, attachment, now })
      : planTextSourceDetach({ localSnapshot: snapshot, attachment, removeData: false, now });
  } else if (operation === 'external-json-inspect') {
    const record = externalImports.find(i => i.documentId === scope.workspaceId);
    if (!record || record.externalSourceKey !== validateProLingoTextExternalPackage(data).package.externalSourceKey) fail('OUT_OF_SCOPE', 'External source does not match this Workspace');
    plan = inspectTextExternalReconciliation({ localSnapshot: snapshot, package: data, existingImport: structuredClone(record) });
  } else fail('UNSUPPORTED_OPERATION', 'Workflow apply, replace-restore, source removal and physical audio actions are not bound in A1');
  if (plan.snapshot) validateTextManagementSnapshot(plan.snapshot);
  return freezeTextManagementView(structuredClone({ operation, applyEnabled: false, plan }));
};

const typedTransfer = operation => (...args) => {
  try { return operation(...args); }
  catch (error) {
    if (error instanceof TextDataManagementError) throw error;
    fail('INVALID_TRANSFER', error?.message || 'Transfer validation failed');
  }
};
export const exportTextManagementData = typedTransfer(exportData);
export const inspectTextManagementTransfer = typedTransfer(inspectTransfer);
export const previewTextManagementTransfer = typedTransfer(previewTransfer);
