import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isBookQaDestructiveCommand } from '../../../domain/text/bookQaCapabilities.js';
import { BOOK_JSON_MAX_BYTES, inspectBookJson } from '../../../domain/text/bookQaTransferDomain.js';
import DataManagementLibraryExplorer from './DataManagementLibraryExplorer.jsx';
import DataManagementWorkspaceInspector from './DataManagementWorkspaceInspector.jsx';
import DataManagementStructuredEditor from './DataManagementStructuredEditor.jsx';
import { DM_CONTROL_BTN, DM_INPUT_CLASS } from './dataManagementUiUtils.js';

const button = DM_CONTROL_BTN + ' border-slate-300 dark:border-slate-700';
const tabs = [
  ['library', 'Library'],
  ['workspace', 'Workspace & Speakers'],
  ['cards', 'Cards, Units & Sentences'],
  ['json', 'JSON Transfer']
];

const saveJson = (data, scope) => {
  const serialized = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  if (serialized.size > BOOK_JSON_MAX_BYTES) throw Error('Export exceeds 16 MiB. Export smaller scopes separately.');
  const url = URL.createObjectURL(serialized);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'PL_BOOK_' + scope.toUpperCase() + '_' + data.exportedAt.replace(/[:.]/g, '-') + '.json';
  try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
};

function BookJsonTransfer({ session, selection, catalog, dispatch, blocked }) {
  const fileToken = useRef(0);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [destination, setDestination] = useState('root');
  const [name, setName] = useState('');
  const [status, setStatus] = useState(null);
  useEffect(() => () => { fileToken.current++; }, []);

  const resetPreview = () => {
    fileToken.current++;
    setPreview(null);
    setReading(false);
    setStatus(null);
  };
  const readFile = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    resetPreview();
    const token = fileToken.current;
    const revision = session.getState().revision;
    setReading(true);
    try {
      if (file.size > BOOK_JSON_MAX_BYTES) throw Error('JSON must be 16 MiB or smaller.');
      const candidate = JSON.parse(await file.text());
      if (token !== fileToken.current) return;
      const { scope, workspaceCount, collectionCount } = inspectBookJson(candidate);
      setDestination(['collection', 'library'].includes(scope) ? 'preserve' : 'root');
      setName('');
      setPreview({ candidate, revision, scope, workspaceCount, collectionCount, filename: file.name });
    } catch (error) {
      if (token === fileToken.current) setStatus({ error: true, message: error.message });
    } finally {
      if (token === fileToken.current) setReading(false);
    }
  };
  const importCopy = async event => {
    event.preventDefault();
    if (blocked || !preview || preview.revision !== session.getState().revision) return;
    const target = destination === 'new' ? { kind: 'new', name } : ['root', 'preserve'].includes(destination)
      ? { kind: destination } : { kind: 'existing', collectionId: destination };
    const result = await dispatch({ type: 'bookPack.import', payload: { candidate: preview.candidate, destination: target } },
      { expectedRevision: preview.revision });
    if (result.ok) {
      const { documentIds, collectionIds } = result.result;
      resetPreview();
      setStatus({ message: 'Imported ' + documentIds.length + ' Workspace copies and ' + collectionIds.length + ' new Collections.' });
    }
  };
  const exportJson = scope => {
    try {
      saveJson(session.exportBookJson(scope), scope);
      setStatus({ message: 'JSON download started. Export recording bytes separately with Portable Audio.' });
    } catch (error) {
      setStatus({ error: true, message: error.message });
    }
  };
  const canPreserve = preview && ['collection', 'library'].includes(preview.scope);
  const stale = preview && preview.revision !== session.getState().revision;

  return <section className="space-y-4" aria-label="Book JSON Transfer">
    <p className="text-sm">JSON backups contain authored data, identities and recording reference metadata. Use Portable Audio ZIP for recording bytes.</p>
    <div className="flex flex-wrap gap-2">
      {[['workspace', 'Workspace', !selection.workspaceId], ['collection', 'Custom Collection', !selection.collectionId],
        ['root', 'Root', false], ['library', 'Full Library', false]].map(([scope, label, unavailable]) =>
        <button key={scope} type="button" className={button} disabled={blocked || unavailable}
          title={unavailable ? 'Select a ' + label + ' in Library first.' : undefined}
          onClick={() => exportJson(scope)}>Export {label} JSON</button>)}
    </div>
    <form className="space-y-3 border-t border-slate-300 pt-4 dark:border-slate-700" onSubmit={importCopy}>
      <p className="text-sm">Import adds new copies with fresh local identities and source lineage. Existing Workspaces stay in place. Attach, sync and replace restore are unavailable here.</p>
      <label className="block text-sm font-semibold">Choose Book JSON
        <input type="file" accept=".json,application/json" onChange={readFile} disabled={blocked}
          className={DM_INPUT_CLASS + ' mt-1 w-full max-w-lg'} />
      </label>
      {reading && <p role="status">Reading the file…</p>}
      {preview && <>
        <p data-book-json-preview className="break-all text-sm">{preview.filename} · {preview.workspaceCount} Workspaces · {preview.collectionCount} Collections</p>
        <label className="block text-sm font-semibold">Import destination
          <select className={DM_INPUT_CLASS + ' mt-1 w-full max-w-lg'} value={destination} disabled={blocked}
            onChange={event => setDestination(event.target.value)}>
            {canPreserve && <option value="preserve">{preview.scope === 'library' ? 'Preserve Root and Custom Collections' : 'Preserve as a new Collection'}</option>}
            {preview.scope !== 'library' && preview.workspaceCount > 0 && <>
              <option value="root">Root — Default Collection</option>
              <option value="new">Create New Collection</option>
              {catalog.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.title} ({collection.id})</option>)}
            </>}
          </select>
        </label>
        {destination === 'new' && <label className="block text-sm font-semibold">New destination Collection name
          <input required maxLength={160} value={name} onChange={event => setName(event.target.value)} disabled={blocked}
            className={DM_INPUT_CLASS + ' mt-1 w-full max-w-lg'} />
        </label>}
        {preview.scope === 'collection' && destination !== 'preserve' && <p className="text-sm">Only the Workspaces will be copied into this destination.</p>}
        {stale && <p role="status" className="text-sm">The library changed. Choose the file again to review the latest destination.</p>}
        <button type="submit" className={button} disabled={blocked || stale || (!preview.workspaceCount && !canPreserve)}>Import as new copy</button>
      </>}
      {(reading || preview) && <button type="button" className={button + ' ml-2'} disabled={blocked} onClick={resetPreview}>Cancel import</button>}
    </form>
    {status && <p role={status.error ? 'alert' : 'status'} className="text-sm">{status.message}</p>}
  </section>;
}

export default function BookQaDataManager({ connection, onClose, onRefresh, refreshing }) {
  const { session } = connection;
  const dialog = useRef(null);
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const [tab, setTab] = useState('library');
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const blocked = state.pending || refreshing;
  const { view } = state;
  const reloadRequired = actionError?.reloadRequired || state.error?.reloadRequired;

  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);

  const execute = async (command, options) => {
    setActionError(null);
    const result = await session.dispatch(command, options);
    if (!result.ok) setActionError(result.error);
    if (result.ok && command.type === 'document.create') session.navigate({ workspaceId: result.result.id });
    if (result.ok && command.type === 'bookPack.import' && result.result.documentIds.length) {
      session.navigate({ workspaceId: result.result.documentIds[0] });
    }
    return result;
  };
  const dispatch = (command, options = {}) => {
    if (isBookQaDestructiveCommand(command)) {
      setConfirm({ command, revision: state.revision });
      return Promise.resolve({ ok: false });
    }
    return execute(command, options);
  };
  const navigate = selection => {
    if (blocked || confirm) return false;
    if (!reloadRequired) setActionError(null);
    return session.navigate(selection);
  };
  const refresh = async () => {
    try {
      await onRefresh();
      setActionError(null);
    } catch (error) {
      setActionError({ code: error.code, message: error.message, reloadRequired: true });
    }
  };
  const shared = { view, isPending: blocked || Boolean(confirm) || reloadRequired, onNavigate: navigate, onDispatch: dispatch,
    getDraft: session.getDraft, setDraft: session.setDraft, clearDraft: session.clearDraft, book: true };
  const { catalog, selection } = view;
  const searchTerm = query.trim().toLowerCase();
  const matches = searchTerm ? [
    ...catalog.rootDocuments.map(doc => ({ doc, group: 'Root' })),
    ...catalog.collections.flatMap(collection => collection.documents.map(doc => ({ doc, group: collection.title })))
  ].filter(({ doc }) => doc.title.toLowerCase().includes(searchTerm)) : [];
  const shownError = actionError || state.error;
  return <dialog ref={dialog} aria-labelledby="book-data-title" data-book-data-manager
    onCancel={event => { event.preventDefault(); if (!blocked) { if (confirm) setConfirm(null); else onClose(); } }}
    className="max-h-[92dvh] w-[min(96vw,72rem)] max-w-none overflow-auto rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:bg-slate-950 dark:text-slate-100">
    <header className="sticky top-0 z-10 space-y-2 border-b border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="book-data-title" className="text-lg font-bold">Book Data</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={blocked || Boolean(confirm)} onClick={refresh}>Refresh library</button>
          <button type="button" className={button} disabled={blocked} onClick={onClose}>Back to Reader</button>
        </div>
      </div>
      <nav aria-label="Book Data sections" className="flex flex-wrap gap-1">
        {tabs.map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} className={button + (tab === id ? ' bg-indigo-100 dark:bg-indigo-900' : '')}
          disabled={blocked || Boolean(confirm)} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      {view.workspace && <p className="break-words text-xs font-semibold">{view.workspace.document.title}</p>}
      {shownError && <p role="alert" data-book-data-error={shownError.code}
        className="text-sm text-red-700 dark:text-red-300">{shownError.code} · {shownError.message}{reloadRequired && ' Refresh the library before retrying.'}</p>}
      {confirm && <div role="alert" className="space-y-2 rounded border border-red-300 p-2 text-sm">
        <p>Confirm {confirm.command.type.replace('.', ' ')} in this library. This changes authored data and may remove its audio references.</p>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => setConfirm(null)}>Cancel change</button>
          <button type="button" className={button} onClick={() => {
            const { command, revision } = confirm;
            setConfirm(null);
            void execute(command, { confirmed: true, expectedRevision: revision });
          }}>Confirm change</button>
        </div>
      </div>}
    </header>
    <div className="p-3 sm:p-4">
      {tab === 'library' && <div className="space-y-3">
        <label className="block text-sm font-semibold">Search Workspace names
          <input type="search" value={query} className={DM_INPUT_CLASS + ' mt-1 w-full max-w-md'}
            disabled={blocked || Boolean(confirm)} onChange={event => setQuery(event.target.value)} />
        </label>
        {searchTerm ? <ul className="space-y-1">
          {matches.map(({ doc, group }) => <li key={doc.id}>
            <button type="button" className={button} disabled={blocked}
              onClick={() => { if (navigate({ workspaceId: doc.id })) { setQuery(''); setTab('workspace'); } }}>{doc.title} · {group}</button>
          </li>)}
          {!matches.length && <li className="text-sm">No matching Workspaces.</li>}
        </ul> : <DataManagementLibraryExplorer {...shared} />}
      </div>}
      {tab === 'workspace' && <>
        <DataManagementWorkspaceInspector {...shared} />
        {view.workspace && <p className="mt-2 text-sm">Use Title and Heading audio in the Reader to set the independent Show and Read policies.</p>}
      </>}
      {tab === 'cards' && (view.workspace ? <DataManagementStructuredEditor {...shared} snapshot={session.getSnapshot()} />
        : <p className="text-sm">Select a Workspace in Library to edit its Cards.</p>)}
      {tab === 'json' && <BookJsonTransfer session={session} selection={selection} catalog={catalog}
        dispatch={dispatch} blocked={shared.isPending} />}
    </div>
  </dialog>;
}
