import {
  initializeTextLibraryFromLegacy,
  syncLegacyTextProjectionToDatabase
} from './textLibraryIndexedDbService.js';

export const executeTextLibraryBootstrapEffect = ({
  legacyState,
  setTextIdentityState,
  setTextContent,
  setActiveTextDocumentId,
  setTextLibrarySnapshot,
  setTextDatabaseStatus,
  setTextDatabaseError,
  addLog
}) => {
  let cancelled = false;
  setTextDatabaseStatus('booting');
  setTextDatabaseError(null);
  setTextLibrarySnapshot(null);

  initializeTextLibraryFromLegacy(legacyState)
    .then(result => {
      if (cancelled) return;
      setActiveTextDocumentId(result.activeDocumentId);
      setTextLibrarySnapshot(result.librarySnapshot);
      setTextIdentityState(result.textIdentityState);
      setTextContent(result.textIdentityState.rawContent);
      // P4-A2: IndexedDB data is hydrated, but keep UI gated until the Text playlist
      // projection is synchronized in the app lifecycle.
      setTextDatabaseStatus('hydrated');
      if (result.migrated) addLog('Text DB', `Legacy Text migrated to IndexedDB (${result.textIdentityState.items.length} items); hydration complete.`);
      else addLog('Text DB', `IndexedDB Text Library hydrated (${result.activeDocumentId}).`);
    })
    .catch(error => {
      if (cancelled) return;
      console.error('Text Library bootstrap failed.', error);
      setTextLibrarySnapshot(null);
      setTextDatabaseStatus('error');
      setTextDatabaseError(error?.message || String(error));
      addLog('Error', `Text Library IndexedDB bootstrap failed: ${error?.message || error}`);
    });

  return () => { cancelled = true; };
};

export const executeTextLibraryCompatibilityPersistenceEffect = ({
  textDatabaseStatus,
  activeTextDocumentId,
  activeTextEditorModel,
  textIdentityState,
  setTextLibrarySnapshot,
  setTextDatabaseError,
  addLog
}) => {
  if (textDatabaseStatus !== 'ready' || !activeTextDocumentId) return undefined;
  // P4-A3: the legacy textarea bridge owns only legacy-line-v1 documents.
  // Structured documents are mutated exclusively through the command API.
  if (activeTextEditorModel !== 'legacy-line-v1') return undefined;
  let cancelled = false;
  const timer = window.setTimeout(() => {
    syncLegacyTextProjectionToDatabase({
      documentId: activeTextDocumentId,
      textIdentityState
    }).then(result => {
      if (cancelled) return;
      setTextLibrarySnapshot(result.librarySnapshot);
    }).catch(error => {
      if (cancelled) return;
      console.error('Text Library compatibility persistence failed.', error);
      setTextDatabaseError(error?.message || String(error));
      addLog('Error', `Text Library save failed: ${error?.message || error}`);
    });
  }, 250);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
};
