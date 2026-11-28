import {
  resolveTextManagementSelection, selectTextDataManagementState,
  TextDataManagementError, validateTextManagementSnapshot
} from '../domain/text/textDataManagementDomain.js';
import { createTextDataManagementSession } from './textDataManagementSession.js';
import { isBookQaNativeCommand, isBookQaWorkspace } from '../domain/text/bookQaCapabilities.js';
import { createBookQaAudioSession } from './bookQaAudioSessionService.js';

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

export const createBookQaConnection = (adapter, loaded, authorization = null) => {
  const session = createTextDataManagementSession({ ...prepareSource(loaded), ...access, execute: adapter.execute });
  let needsRefresh = false;
  let refreshing = false;
  const replace = source => {
    const before = session.getState();
    const { snapshot, ...options } = prepareSource(source, before.view?.selection);
    session.replaceSource(snapshot, options);
    const replaced = session.getState();
    if (replaced.error || replaced.revision !== before.revision + 1 || !replaced.view) {
      throw failure('REFRESH_REPLACE_FAILED', replaced.error?.message || 'Book QA session replacement failed.');
    }
  };
  const audio = authorization?.optIn === true && authorization.origin === globalThis.location?.origin
    && isBookQaOrigin(authorization.origin) && adapter.dbName === authorization.library && loaded.dbVersion === 2
    ? createBookQaAudioSession({
      library: adapter.dbName,
      loadState: adapter.loadState,
      getSnapshot: session.getSnapshot,
      getRevision: () => session.getState().revision,
      publish: replace,
      blockWrites: () => { needsRefresh = true; },
      assertReadable: () => {
        if (needsRefresh || refreshing) throw failure('REFRESH_REQUIRED', 'Refresh the connected Book QA library before reading new audio.');
      },
      assertWritable: () => {
        if (needsRefresh || refreshing) throw failure('REFRESH_REQUIRED', 'Refresh the connected Book QA library before writing.');
        if (session.getState().pending) throw failure('AUDIO_BUSY', 'Wait for the pending Text command.');
      }
    }) : null;
  return {
    dbName: adapter.dbName,
    ...(audio ? { audio: { name: audio.name, submit: audio.submit, readRuntime: audio.readRuntime, getPlaybackReadStamp: audio.getPlaybackReadStamp, generate: audio.generate, generateSequence: audio.generateSequence, repair: audio.repair,
      exportNormal: audio.exportNormal, exportPortable: audio.exportPortable, importPortable: audio.importPortable, verifyCoverage: audio.verifyCoverage } } : {}),
    session: {
      getState: session.getState,
      getSnapshot: session.getSnapshot,
      subscribe: session.subscribe,
      navigate: session.navigate,
      dispose() { audio?.dispose(); session.dispose(); },
      async dispatch(command) {
        if (!isBookQaNativeCommand(command)) {
          return { ok: false, error: { code: 'CAPABILITY_UNAVAILABLE', message: 'This command is unavailable in A1a Book QA.' } };
        }
        if (needsRefresh || refreshing) {
          return { ok: false, error: { code: 'REFRESH_REQUIRED', message: 'Refresh the connected Book QA library before writing.' } };
        }
        if (audio?.pending) return { ok: false, error: { code: 'AUDIO_BUSY', message: 'Wait for the active audio operation.' } };
        const result = await session.dispatch(command);
        if (result.error?.reloadRequired) needsRefresh = true;
        return result;
      }
    },
    async refresh({ recoverAudio = false } = {}) {
      const before = session.getState();
      if (refreshing || before.pending || before.disposed || audio?.pending) {
        throw failure('REFRESH_BUSY', 'Wait for the active Book QA operation before refreshing.');
      }
      refreshing = true;
      try {
        const loaded = audio && (audio.touched || recoverAudio) ? await audio.recover() : await adapter.loadState();
        const current = session.getState();
        if (current.pending || current.disposed || current.revision !== before.revision) {
          throw failure('REFRESH_STALE', 'The Book QA selection changed during Refresh. Retry Refresh.');
        }
        replace(loaded);
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
