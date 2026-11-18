/* global __TEXT_UAT_METADATA__ */
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createTextDataManagementPersistenceAdapter, seedDisposableTextManagementDatabase,
  inspectStrictTextManagementBackup } from '../../../services/persistence/textDataManagementPersistenceService.js';
import { createTextDataManagementSession } from '../../../services/textDataManagementSession.js';
import { planTextV2MigrationCopy } from '../../../domain/text/textV2MigrationCopyDomain.js';
import { canonicalJsonStringify } from '../../../domain/text/textCanonicalFingerprintDomain.js';
import { resolveTextManagementSelection } from '../../../domain/text/textDataManagementDomain.js';
import { bindQaPortableAudio } from '../../../services/audio/textQaPortableAudioService.js';
import { createStructuredTestingFixture } from '../../../../scripts/fixtures/p15-integrated/structured-fixture.js';
import { backfillTextContentUnits } from '../../../domain/text/textContentUnitDomain.js';
import TextDataManagementPage from './TextDataManagementPage.jsx';
import StructuredWorkspacePlayer from '../presentation/StructuredWorkspacePlayer.jsx';

const CONTROL = 'min-h-11 border rounded px-3 py-2 disabled:opacity-40';
const EMPTY_BINDINGS = Object.freeze({ runtimeAudioUrls: {}, runtimeFullAudio: {} });
const DEFAULT_NAME = 'prolingo_text_library_d3b_qa_structured_beta';
const UAT_METADATA = typeof __TEXT_UAT_METADATA__ === 'undefined' ? null : __TEXT_UAT_METADATA__;
const blank = () => backfillTextContentUnits({ schemaVersion: 1, initialized: true, activeDocumentId: null, counters: {},
  collections: [], documents: [], blocks: [], segments: [], audioVariants: [] }).snapshot;
const updateLocation = name => { const url = new URL(window.location.href); url.searchParams.set('db', name); window.history.replaceState(null, '', url); };
const asError = error => ({ code: error.code || 'CONNECTION_ERROR', message: error.message, databaseMissing: error.databaseMissing === true });
const download = data => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = 'structured-qa.no-audio.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function ConnectedBeta({ connection, audioRuntimeHooks, onExport }) {
  const { session, adapter } = connection;
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const [editor, setEditor] = useState(false), [notice, setNotice] = useState(''), [bindings, setBindings] = useState(EMPTY_BINDINGS);
  const current = session.getSnapshot();
  const workspaceId = state.view?.selection.workspaceId || null;
  const reload = async () => {
    try {
      const loaded = await adapter.loadState();
      let selection;
      try { selection = resolveTextManagementSelection(loaded.snapshot, state.view?.selection || {}); }
      catch { selection = loaded.snapshot.documents.some(d => d.id === workspaceId) ? { workspaceId } : {}; }
      session.replaceSource(loaded.snapshot, { selection, metaRecords: loaded.metaRecords, sourceAttachments: loaded.sourceAttachments, externalImports: loaded.externalImports });
      setNotice('Reloaded authoritative QA data; session drafts retained.');
    } catch (error) { setNotice(error.message); }
  };
  const exportBackup = async () => {
    try { const data = await adapter.exportBackup(); onExport?.(data); download(data); setNotice('Exported a consistent QA backup. Audio binaries NOT included.'); }
    catch (error) { setNotice(error.message); }
  };
  const attach = async event => {
    const files = [...event.target.files];
    try {
      const captured = session.getSnapshot(), result = await bindQaPortableAudio({ snapshot: captured, files });
      if (session.getSnapshot() !== captured) throw Error('Snapshot changed while scanning ZIP; select it again');
      setBindings(result); setNotice('Bound existing exact RF/Full identities: ' + result.matched + '; unmatched: ' + result.unmatched + '. Binary decoding is verified at playback, not by metadata.');
    } catch (error) { setNotice(error.message); }
  };
  return <section data-structured-beta-connected={adapter.dbName} className="space-y-4">
    <p className="font-semibold break-all">Connected QA database: {adapter.dbName}</p>
    <div className="flex flex-wrap gap-3 items-center">
      <label>Workspace <select aria-label="Beta Workspace" value={workspaceId || ''} onChange={e => session.navigate(e.target.value ? { workspaceId: e.target.value } : {})}>
        <option value="">Select / manage library</option>{current.documents.filter(d => d.editorModel === 'structured-v1').map(d => <option key={d.id} value={d.id}>{d.documentType}: {d.title}</option>)}
      </select></label>
      <button className={CONTROL} onClick={() => setEditor(v => !v)}>{editor ? 'Show Reader' : 'Data Management / Editor'}</button>
      <button className={CONTROL} disabled={state.pending} onClick={reload}>Reload QA data</button>
      <button className={CONTROL} disabled={state.pending} onClick={exportBackup}>Export QA JSON</button>
    </div>
    <p role="status">{notice}</p>
    <label>Optional portable audio ZIP (session only) <input type="file" accept=".zip" multiple onChange={attach} /></label>
    <p className="text-sm">ZIP selection binds only existing matching metadata through the existing RF matcher. No metadata/Staging writes. Reselect audio after browser restart; JSON never includes audio. Full WAV composition still uses the existing rate-aware restriction.</p>
    <div hidden={editor}><StructuredWorkspacePlayer snapshot={current} documentId={workspaceId} disabled={state.pending}
      runtimeAudioUrls={bindings.runtimeAudioUrls} runtimeFullAudio={bindings.runtimeFullAudio} audioRuntimeHooks={audioRuntimeHooks} /></div>
    <div hidden={!editor}><TextDataManagementPage session={session} boundary="disposable" permissions={['catalog', 'content']}
      persistenceAdapter={adapter} onReloadValidSource={reload} /></div>
  </section>;
}

/** DEV-only. No IDB access until explicit opt-in. No canonical database reads or auto-seeding. */
export default function StructuredTextBeta({ initialDbName = null, audioRuntimeHooks = null, onExport = null }) {
  const [name, setName] = useState(() => initialDbName || new URLSearchParams(window.location.search).get('db') || DEFAULT_NAME);
  const [optIn, setOptIn] = useState(false), [connection, setConnection] = useState(null), [error, setError] = useState(null), [pending, setPending] = useState(false);
  const [file, setFile] = useState(null), [copyName, setCopyName] = useState(DEFAULT_NAME + '_recovered'), [confirmCopy, setConfirmCopy] = useState(false);
  const flight = useRef(false), live = useRef(true), owned = useRef(null), generation = useRef(0);
  useEffect(() => { const clock = generation; live.current = true; return () => { live.current = false; clock.current++; owned.current?.dispose(); }; }, []);
  const action = async operation => {
    if (!optIn || flight.current) return; flight.current = true; setPending(true);
    const token = ++generation.current;
    try {
      const next = await operation();
      if (!live.current || token !== generation.current) { next.session.dispose(); return; }
      owned.current?.dispose(); owned.current = next.session; setConnection(next); updateLocation(next.adapter.dbName); setName(next.adapter.dbName); setError(null);
    } catch (e) { if (live.current) setError(asError(e)); }
    finally { flight.current = false; if (live.current) setPending(false); }
  };
  const load = async target => {
    const adapter = createTextDataManagementPersistenceAdapter({ dbName: target, boundary: 'disposable', permissions: ['catalog', 'content'] });
    const loaded = await adapter.loadState();
    if (loaded.schemaVersion !== 2) throw Error('Beta expects a complete QA v2 library. Create a separate v2 migration copy.');
    const workspaceId = loaded.snapshot.documents.find(d => d.editorModel === 'structured-v1')?.id;
    const session = createTextDataManagementSession({ ...loaded, selection: workspaceId ? { workspaceId } : {}, boundary: 'disposable', permissions: ['catalog', 'content'], execute: adapter.execute });
    return { session, adapter };
  };
  const initialize = demo => action(async () => {
    await seedDisposableTextManagementDatabase({ dbName: name, snapshot: demo ? createStructuredTestingFixture().snapshot : blank(), createOnly: true });
    return load(name);
  });
  const inspectFile = async event => {
    setFile(null); setConfirmCopy(false);
    try { const parsed = JSON.parse(await event.target.files[0].text()); const verified = inspectStrictTextManagementBackup(parsed);
      setFile(verified); setError(null);
    } catch (e) { setError(asError(e)); }
  };
  const recover = () => action(async () => {
    if (!file || !confirmCopy) throw Error('Inspect a JSON backup and explicitly confirm a fresh QA copy');
    const data = file.snapshot.schemaVersion === 1 ? planTextV2MigrationCopy({ snapshot: file.snapshot, metaRecords: file.backup.metaRecords }) : file;
    const metaRecords = data.metaRecords || data.backup.metaRecords;
    await seedDisposableTextManagementDatabase({ dbName: copyName, snapshot: data.snapshot, metaRecords, createOnly: true });
    const next = await load(copyName);
    if (canonicalJsonStringify(next.session.getSnapshot()) !== canonicalJsonStringify(data.snapshot)) { next.session.dispose(); throw Error('Recovery verification failed'); }
    return next;
  });
  return <main data-structured-text-beta className="min-h-screen bg-white dark:bg-slate-950 dark:text-white p-4 space-y-4">
    {UAT_METADATA && <aside data-text-uat-info className="text-xs border rounded p-3">
      <strong>{UAT_METADATA.label}</strong> · {UAT_METADATA.version} · {UAT_METADATA.channel}
      <p>Commit {UAT_METADATA.sha} · Built {UAT_METADATA.builtAt}</p>
      <p>Database: isolated QA v2 · Canonical database: unchanged v1 · Not Stable</p>
    </aside>}
    <h1 className="text-xl font-bold">Structured Text Beta — isolated persistent v2 QA</h1>
    <p>This environment never opens or upgrades your canonical library. QA edits persist locally in this browser. Export JSON backups; deleting browser storage removes QA data.</p>
    <label><input type="checkbox" aria-label="Opt in to isolated QA storage" disabled={pending || Boolean(connection)} checked={optIn} onChange={e => setOptIn(e.target.checked)} /> I choose isolated QA storage; this is not production activation.</label>
    <fieldset disabled={!optIn || pending} className="flex flex-wrap gap-2">
      <input aria-label="QA database name" className={CONTROL} value={name} onChange={e => { setName(e.target.value); setError(null); }} />
      <button className={CONTROL} onClick={() => action(() => load(name))}>Connect QA database</button>
      {!connection && (!error || error.databaseMissing) && <>
        <button className={CONTROL} onClick={() => initialize(false)}>Initialize empty QA library</button>
        <button className={CONTROL} onClick={() => initialize(true)}>Initialize three-type demo</button>
      </>}
    </fieldset>
    {error && <p role="alert" data-beta-error={error.code}>{error.code}: {error.message}. Existing databases are never overwritten; use another QA name or the separately confirmed QA maintenance workflow.</p>}
    {connection && <ConnectedBeta key={connection.adapter.dbName} connection={connection} audioRuntimeHooks={audioRuntimeHooks} onExport={onExport} />}
    <details><summary>Verify exported JSON / create a fresh recovery copy</summary>
      <p>Selecting a file reads only that file. No canonical database is copied. A v1 file is converted only after you confirm a fresh QA destination.</p>
      <input type="file" aria-label="Verify backup JSON" accept=".json" onChange={inspectFile} />
      {file && <p data-beta-file-verified>Validated schema {file.snapshot.schemaVersion}; {file.snapshot.documents.length} Workspaces; complete recovery metadata. No binaries.</p>}
      <input aria-label="Recovery QA database name" value={copyName} onChange={e => setCopyName(e.target.value)} className={CONTROL} />
      <label><input type="checkbox" checked={confirmCopy} onChange={e => setConfirmCopy(e.target.checked)} /> Create a new isolated copy; preserve the original</label>
      <button className={CONTROL} disabled={!optIn || pending || !file || !confirmCopy} onClick={recover}>Create verified recovery copy</button>
    </details>
  </main>;
}
