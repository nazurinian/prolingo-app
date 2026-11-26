import {
  resolveTextManagementSelection, selectTextDataManagementState,
  TextDataManagementError, validateTextManagementSnapshot
} from '../domain/text/textDataManagementDomain.js';
import { createTextDataManagementSession } from './textDataManagementSession.js';
import { isBookQaNativeCommand, isBookQaWorkspace } from '../domain/text/bookQaCapabilities.js';

const origins = new Set(['https://text-uat.prolingo.web.id']);
for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  for (const port of [4173, 5173]) origins.add(`http://${host}:${port}`);
}

export const isBookQaOrigin = origin => origins.has(origin);

const access = { boundary: 'disposable', permissions: ['catalog', 'content'], bookAuthoring: true };
const failure = (code, message) => new TextDataManagementError(code, message);

const reconcileSelection = (snapshot, previous) => {
  const workspace = snapshot.documents.find(item => item.id === previous.workspaceId && isBookQaWorkspace(item));
  if (workspace) {
    const selection = { workspaceId: workspace.id };
    for (const [field, records] of [
      ['segmentId', snapshot.segments], ['unitId', snapshot.contentUnits], ['cardId', snapshot.blocks]
    ]) {
      if (records.some(item => item.id === previous[field] && item.documentId === workspace.id)) {
        return resolveTextManagementSelection(snapshot, { ...selection, [field]: previous[field] });
      }
    }
    return selection;
  }
  if (snapshot.collections.some(item => item.id === previous.collectionId)) {
    return { collectionId: previous.collectionId };
  }
  const first = snapshot.documents.find(isBookQaWorkspace);
  return first ? { workspaceId: first.id } : {};
};

// loadState validates the persisted sidecars and metadata in the same read as
// the snapshot. Validate the exact projection before invoking P15 replacement.
const prepareSource = (loaded, previous = {}) => {
  const { snapshot: candidate, sourceAttachments, externalImports, metaRecords } = loaded;
  if (candidate?.schemaVersion !== 2) {
    throw failure('SCHEMA_UNSUPPORTED', 'Book QA accepts complete disposable v2 libraries only.');
  }
  const snapshot = validateTextManagementSnapshot(candidate);
  const selection = reconcileSelection(snapshot, previous);
  if (![sourceAttachments, externalImports, metaRecords].every(Array.isArray)) {
    throw failure('INVALID_SIDECARS', 'The Book QA read did not provide complete validated sidecars.');
  }
  const sidecars = structuredClone({ sourceAttachments, externalImports, metaRecords });
  selectTextDataManagementState(snapshot, { selection, ...sidecars, ...access });
  return { snapshot, selection, ...sidecars };
};

export const createBookQaConnection = (adapter, loaded) => {
  const session = createTextDataManagementSession({ ...prepareSource(loaded), ...access, execute: adapter.execute });
  let needsRefresh = false;
  let refreshing = false;
  return {
    dbName: adapter.dbName,
    session: {
      getState: session.getState,
      getSnapshot: session.getSnapshot,
      subscribe: session.subscribe,
      navigate: session.navigate,
      dispose: session.dispose,
      async dispatch(command) {
        if (!isBookQaNativeCommand(command)) {
          return { ok: false, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'This command is unavailable in A1a Book QA.' } };
        }
        if (needsRefresh || refreshing) {
          return { ok: false, error: { code: 'REFRESH_REQUIRED', message: 'Refresh the connected Book QA library before writing.' } };
        }
        const result = await session.dispatch(command);
        if (result.error?.reloadRequired) needsRefresh = true;
        return result;
      }
    },
    async refresh() {
      const before = session.getState();
      if (refreshing || before.pending || before.disposed) {
        throw failure('REFRESH_BUSY', 'Wait for the active Book QA operation before refreshing.');
      }
      refreshing = true;
      try {
        const loaded = await adapter.loadState();
        const current = session.getState();
        if (current.pending || current.disposed || current.revision !== before.revision) {
          throw failure('REFRESH_STALE', 'The Book QA selection changed during Refresh. Retry Refresh.');
        }
        const { snapshot, ...options } = prepareSource(loaded, current.view?.selection);
        session.replaceSource(snapshot, options);
        const replaced = session.getState();
        if (replaced.error || replaced.revision !== before.revision + 1 || !replaced.view) {
          throw failure('REFRESH_REPLACE_FAILED', replaced.error?.message || 'Book QA session replacement failed.');
        }
        needsRefresh = false;
      } catch (error) {
        needsRefresh = true;
        throw error;
      } finally {
        refreshing = false;
      }
    }
  };
};
