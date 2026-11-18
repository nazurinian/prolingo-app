export const CAPABILITY_REASON_EXPLANATIONS = Object.freeze({
  READ_ONLY: 'Read-only boundary (or read-only persistence adapter ceiling). Editing requires an explicit disposable boundary grant.',
  PERMISSION_DENIED: 'Missing catalog or content permission (or blocked by the active persistence adapter ceiling).',
  UNINITIALIZED: 'Database or library snapshot has not been initialized yet.',
  CONNECTION_ERROR: 'Unable to read or validate the selected disposable IndexedDB database.',
  ALREADY_INITIALIZED: 'Refused ordinary initialization because an initialized disposable database already exists on disk.',
  EXISTING_DB_PROTECTED: 'Existing disposable database (valid, partial, wrong-version, or corrupted) is protected against ordinary initialization. Use explicit two-step confirmation if overwrite is intentional.',
  CONCURRENT_INIT: 'Another initialization or overwrite operation is already in flight. Concurrent initialization was rejected.',
  INITIALIZE_FAILED: 'Disposable database initialization failed before a readable snapshot could be confirmed.',
  CONFIRMATION_REQUIRED: 'Explicit confirmation checkbox acknowledgment is required before overwriting an existing database.',
  SELECT_WORKSPACE: 'Select a supported Workspace first.',
  SELECT_COLLECTION: 'Select a specific Collection first.',
  SELECT_CATALOG_SCOPE: 'Return from Workspace view to Library or Collection scope to create or reorder catalog items.',
  SELECT_LIBRARY_SCOPE: 'Select Whole Library ({}) scope to create or reorder Collections.',
  OUT_OF_SCOPE: 'Target belongs to another Workspace, Collection, or parent and was rejected.',
  INVALID_COMMAND: 'Invalid command fields, Card/Unit kind mismatch, or native constraint violation.',
  PROTECTED_METADATA: 'Only metadata.note is editable; source, audio, speaker, and identity metadata must stay intact.',
  UNSUPPORTED_WORKSPACE: 'Legacy or incomplete v1 Conversation/Mixed Workspace cannot be edited or migrated here.',
  UNSUPPORTED_SCHEMA: 'Only explicit Schema v1 or complete Schema v2 snapshots are supported.',
  PERSISTENT_UNITS_REQUIRED: 'Schema v1 Paragraph uses read-only virtual Sections (id: null). Persistent Content Units, Unit moves, Conversation/Mixed authoring, and Speaker commands require complete Schema v2.',
  USE_UNIT_SEGMENT_ORDER: 'Schema v2 Workspaces reorder Sentences via contentUnit.reorderSegments inside their Content Unit.',
  MIGRATION_REQUIRED: 'Incomplete Content Unit migration detected. No automatic migration or repair is allowed.',
  INVALID_SNAPSHOT: 'Snapshot validation failed. Reload an authoritative valid complete snapshot to resume.',
  PRECONDITION_REQUIRED: 'Missing expected snapshot fingerprint precondition for transactional commit.',
  CANONICAL_DB_PROTECTED: 'Canonical ProLingo database (prolingo_text_library) is hard-blocked in P15-H2 isolated mode.',
  CANONICAL_WRITES_DISABLED: 'Canonical live persistence writes remain disabled in P15-H2; only disposable QA databases are permitted.',
  INVALID_EXECUTOR: 'Non-transactional DB command runners such as executeTextLibraryCommand cannot be bound directly.',
  INVALID_DATABASE_NAME: 'Database name must stay within the approved prolingo_text_library_d3b_qa_* disposable QA namespace.',
  VERSION_MISMATCH: 'Existing IndexedDB version does not match the requested schema version.',
  BUSY: 'Another command is already pending. Wait for settlement before submitting again.',
  STALE_RESULT: 'Session scope, permissions, or database snapshot changed while this command was pending. Review recoverable drafts and reload the authoritative source before acting.',
  INVALID_RESPONSE: 'Transaction acknowledgement failed reconciliation or shape validation against the active session.',
  COMMAND_REJECTED: 'Native command rejected this change. Recoverable drafts have been preserved for review.',
  COLLECTION_SOURCE_SCOPE_REQUIRED: 'Multi-Workspace Text Pack attachment preview requires Collection-level review and is disabled in A1.',
  SELECT_EXPORT_SCOPE: 'Select a Collection or Workspace scope before exporting a Text Pack.',
  METADATA_REQUIRED: 'Complete Database Backup export requires authoritative metaRecords from the same consistent read as the snapshot.',
  METADATA_MISMATCH: 'Supplied or stored database metaRecords disagree with the snapshot core state or ID counter floors.',
  INVALID_TRANSFER: 'Transfer payload failed native format parsing or validation.'
});

export const explainReason = code => CAPABILITY_REASON_EXPLANATIONS[code] || code || 'Unavailable.';

export const formatDraftKeyLabel = key => {
  if (!key || typeof key !== 'object') return 'Unknown draft';
  if (key.catalog) {
    return key.collectionId ? `Catalog (${key.collectionId}) · ${key.field}` : `Catalog (Library) · ${key.field}`;
  }
  return `${key.workspaceId || '?'} · ${key.entityId || '?'} · ${key.field || '?'}`;
};

export const buildSerializedDraftId = key => JSON.stringify(
  key?.catalog
    ? { catalog: true, collectionId: key.collectionId ?? null, field: key.field }
    : { workspaceId: key?.workspaceId || '', entityId: key?.entityId || '', field: key?.field || '' }
);

/**
 * Projects a session workspace view into the state contract consumed by D4 ConversationSpeakerPanel.
 */
export const buildSpeakerPanelStateFromWorkspace = workspace => {
  if (!workspace?.document || !workspace?.documentTree) return null;
  const blocks = Array.isArray(workspace.documentTree.blocks) ? workspace.documentTree.blocks : [];
  const scenes = blocks
    .filter(block => block.blockType === 'conversation')
    .map(block => {
      const turns = (Array.isArray(block.units) ? block.units : []).map(({ segments = [], ...unit }) => ({
        ...unit,
        sentences: segments,
        empty: segments.length === 0,
        sentenceCount: segments.length
      }));
      return {
        ...block,
        turns,
        empty: turns.length === 0,
        turnCount: turns.length,
        sentenceCount: turns.reduce((sum, turn) => sum + turn.sentenceCount, 0)
      };
    });

  return {
    workspace: {
      id: workspace.document.id,
      uid: workspace.document.uid,
      title: workspace.document.title,
      documentType: workspace.document.documentType,
      textLanguage: workspace.document.textLanguage,
      meaningLanguage: workspace.document.meaningLanguage
    },
    cardOrderIds: blocks.map(block => block.id),
    speakerRegistry: Array.isArray(workspace.speakers) ? workspace.speakers : [],
    scenes
  };
};

/**
 * Builds the complete authoritative metaRecords list consistent with `snapshot`
 * for pure P15 Database Backup JSON export (never synthesizes missing core metadata on mismatch).
 */
export const buildCompleteBackupMetaRecords = (
  snapshot,
  { sourceAttachments = [], externalImports = [], extraMetaRecords = [] } = {}
) => {
  if (!snapshot) return [];
  const core = [
    { key: 'schemaVersion', value: snapshot.schemaVersion },
    { key: 'initialized', value: snapshot.initialized },
    { key: 'activeDocumentId', value: snapshot.activeDocumentId ?? null },
    { key: 'idCounters', value: structuredClone(snapshot.counters || {}) },
    ...(snapshot.contentUnitMigration
      ? [{ key: 'contentUnitMigration', value: structuredClone(snapshot.contentUnitMigration) }]
      : []),
    { key: 'sourceAttachments', value: structuredClone(sourceAttachments) },
    { key: 'externalSourceImports', value: structuredClone(externalImports) }
  ];
  const seen = new Set(core.map(record => record.key));
  for (const extra of extraMetaRecords) {
    if (extra?.key && !seen.has(extra.key)) {
      seen.add(extra.key);
      core.push({ key: extra.key, value: structuredClone(extra.value) });
    }
  }
  return core;
};

/** Shared responsive button and input class tokens aligned with ProLingo Text UI. */
export const DM_CONTROL_BTN = 'min-h-11 sm:min-h-9 max-w-full px-3 py-1.5 rounded-lg border text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 text-center';
export const DM_SMALL_BTN = 'min-h-11 sm:min-h-8 max-w-full px-2.5 py-1 rounded-lg border text-[11px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1 text-center';
export const DM_INPUT_CLASS = 'w-full min-w-0 max-w-full min-h-11 sm:min-h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm sm:text-xs text-slate-900 dark:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 disabled:opacity-50';

export const formatDocTypeBadge = documentType => {
  if (documentType === 'conversation') return { label: 'CONVERSATION', cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800' };
  if (documentType === 'mixed') return { label: 'MIXED', cls: 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-800' };
  if (documentType === 'paragraph') return { label: 'PARAGRAPH', cls: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800' };
  return { label: String(documentType || 'LEGACY').toUpperCase(), cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800' };
};
