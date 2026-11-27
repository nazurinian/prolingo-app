import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createTextDataManagementPersistenceAdapter, seedDisposableTextManagementDatabase } from '../../../services/persistence/textDataManagementPersistenceService.js';
import { assertDisposableQaDatabaseName } from '../../../services/persistence/textContentUnitPersistenceService.js';
import { createBookQaConnection, isBookQaOrigin } from '../../../services/bookQaSessionService.js';
import { validateTextManagementSnapshot } from '../../../domain/text/textDataManagementDomain.js';
import { backfillTextContentUnits } from '../../../domain/text/textContentUnitDomain.js';
import { createStructuredTestingFixture } from '../../../../scripts/fixtures/p15-integrated/structured-fixture.js';
import App from '../../../App.jsx';
import { BookQaBodyAudioPanel } from '../BookQaBodyAudioPanel.jsx';

const DEFAULT_BOOK_QA_DATABASE = 'prolingo_text_library_d3b_qa_book_main';
const emptyV2Snapshot = () => backfillTextContentUnits({
  schemaVersion: 1,
  initialized: true,
  activeDocumentId: null,
  counters: {},
  collections: [],
  documents: [],
  blocks: [],
  segments: [],
  audioVariants: []
}).snapshot;

const cleanFixtureSnapshot = () => {
  const snapshot = structuredClone(createStructuredTestingFixture().snapshot);
  const documents = snapshot.documents.filter(document => (
    document.editorModel === 'structured-v1'
    && ['paragraph', 'conversation', 'mixed'].includes(document.documentType)
  ));
  const documentIds = new Set(documents.map(document => document.id));
  const blocks = snapshot.blocks.filter(block => documentIds.has(block.documentId));
  const blockIds = new Set(blocks.map(block => block.id));
  const contentUnits = (snapshot.contentUnits || []).filter(unit => documentIds.has(unit.documentId) && blockIds.has(unit.blockId));
  const unitIds = new Set(contentUnits.map(unit => unit.id));
  const segments = snapshot.segments.filter(segment => documentIds.has(segment.documentId)
    && blockIds.has(segment.blockId) && (!segment.unitId || unitIds.has(segment.unitId)));

  // This starter library is for Reader and persistence checks. Strip fixture audio
  // readiness/artifacts so no sample is presented as physically available audio.
  const cleanMetadata = metadata => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata || {};
    const result = { ...metadata };
    delete result.fullAudioArtifactsV1;
    return result;
  };
  const cleaned = {
    ...snapshot,
    activeDocumentId: documents[0]?.id || null,
    documents: documents.map(document => ({ ...document, metadata: cleanMetadata(document.metadata) })),
    blocks: blocks.map(block => ({ ...block, metadata: cleanMetadata(block.metadata) })),
    contentUnits: contentUnits.map(unit => ({ ...unit, metadata: cleanMetadata(unit.metadata) })),
    segments: segments.map(segment => ({ ...segment, metadata: cleanMetadata(segment.metadata) })),
    audioVariants: []
  };
  return validateTextManagementSnapshot(cleaned);
};

const errorRecord = error => ({ code: error?.code || 'BOOK_QA_ERROR', message: error?.message || String(error), databaseMissing: error?.databaseMissing === true });
const assertBookQaDatabaseName = value => {
  try {
    return assertDisposableQaDatabaseName(value);
  } catch (error) {
    throw Object.assign(new Error(error?.message || 'A valid disposable QA database name is required.'), { code: 'INVALID_DATABASE_NAME' });
  }
};

export default function BookQaHost() {
  const [optIn, setOptIn] = useState(false);
  const [databaseName, setDatabaseName] = useState(() => new URLSearchParams(window.location.search).get('db') || DEFAULT_BOOK_QA_DATABASE);
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const ownedSession = useRef(null);
  const mounted = useRef(false);
  const flight = useRef(false);
  const originAllowed = isBookQaOrigin(window.location.origin);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ownedSession.current?.dispose();
      ownedSession.current = null;
    };
  }, []);

  const assertOptIn = useCallback(() => {
    if (!optIn) throw new Error('Select the isolated Book QA storage opt-in before connecting.');
    if (!originAllowed) throw new Error('Book QA is blocked on this origin. Use the dedicated UAT origin or an approved loopback origin.');
    return assertBookQaDatabaseName(databaseName);
  }, [databaseName, optIn, originAllowed]);

  const connect = useCallback(async requestedName => {
    const safeName = assertBookQaDatabaseName(requestedName);
    const adapter = createTextDataManagementPersistenceAdapter({
      dbName: safeName,
      boundary: 'disposable',
      permissions: ['catalog', 'content'],
      bookAuthoring: true
    });
    const loaded = await adapter.loadState();
    if (!mounted.current) return;
    const nextConnection = createBookQaConnection(adapter, loaded, {
      library: safeName, origin: window.location.origin, optIn
    });
    ownedSession.current?.dispose();
    ownedSession.current = nextConnection.session;
    setConnection(nextConnection);
    setDatabaseName(safeName);
    const url = new URL(window.location.href);
    url.searchParams.set('db', safeName);
    window.history.replaceState(null, '', url);
    setError(null);
    setNotice(`Connected ${safeName}; v2 snapshot is the application source of truth.`);
  }, [optIn]);

  const runHostAction = useCallback(async operation => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (nextError) {
      setError(errorRecord(nextError));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }, []);

  const handleConnect = () => runHostAction(async () => {
    const safeName = assertOptIn();
    await connect(safeName);
  });

  const handleInitialize = (withDemo = false) => runHostAction(async () => {
    const safeName = assertOptIn();
    const snapshot = withDemo ? cleanFixtureSnapshot() : emptyV2Snapshot();
    await seedDisposableTextManagementDatabase({
      dbName: safeName,
      snapshot,
      sourceAttachments: [],
      externalImports: [],
      createOnly: true
    });
    await connect(safeName);
    setNotice(withDemo
      ? `Initialized ${safeName} with clean v2 Paragraph, Conversation, and Mixed samples; audio readiness was removed.`
      : `Initialized a new empty v2 library in ${safeName}.`);
  });

  const refresh = useCallback(async () => {
    if (!connection) return;
    setRefreshing(true);
    try {
      await connection.refresh();
      setNotice('Reloaded authoritative persisted state. No pending command was replayed.');
      setError(null);
    } catch (refreshError) {
      setError(errorRecord(refreshError));
      throw refreshError;
    } finally {
      setRefreshing(false);
    }
  }, [connection]);

  if (connection) {
    return <App
      bookQaConnection={connection}
      BookQaBodyAudioControls={BookQaBodyAudioPanel}
      onBookQaRefresh={refresh}
      bookQaRefreshing={refreshing}
      bookQaRefreshError={error}
    />;
  }

  return <main data-book-qa-host="disconnected" className="min-h-screen bg-slate-50 p-5 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
    <section className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-amber-300 bg-white p-5 shadow-sm dark:border-amber-900 dark:bg-slate-900">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Book QA · Isolated v2</p>
        <h1 className="mt-1 text-xl font-black">Main App integration host</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This host mounts the actual ProLingo App after it connects to a disposable v2 library. Canonical Text storage remains v1 and is never selected here.</p>
      </header>
      <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
        <p><b>Testing origin:</b> {window.location.origin}</p>
        <p className={originAllowed ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}>{originAllowed ? 'Origin accepted for isolated QA.' : 'Blocked: use the dedicated UAT origin or an approved loopback origin.'}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" aria-label="Opt in to isolated Book QA storage" checked={optIn} disabled={busy} onChange={event => setOptIn(event.target.checked)} />
        <span>I explicitly opt in to isolated Book QA storage for this browser origin.</span>
      </label>
      <fieldset disabled={!optIn || busy || !originAllowed} className="space-y-3 rounded-lg border border-slate-200 p-3 disabled:opacity-50 dark:border-slate-700">
        <label className="block text-xs font-bold">Disposable database name
          <input aria-label="Book QA database name" value={databaseName} onChange={event => setDatabaseName(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-slate-300 bg-white px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <p className="text-[11px] text-slate-500">Required form: <code>prolingo_text_library_d3b_qa_*</code>. Initialize uses create-only semantics and refuses to replace an existing database.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!optIn || busy || !originAllowed} onClick={handleConnect} className="min-h-11 rounded bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-40">Load / Connect existing v2 library</button>
          <button type="button" disabled={!optIn || busy || !originAllowed} onClick={() => handleInitialize(false)} className="min-h-11 rounded border border-indigo-300 px-3 text-xs font-bold text-indigo-700 disabled:opacity-40 dark:text-indigo-300">Initialize empty v2 library</button>
          <button type="button" disabled={!optIn || busy || !originAllowed} onClick={() => handleInitialize(true)} className="min-h-11 rounded border border-indigo-300 px-3 text-xs font-bold text-indigo-700 disabled:opacity-40 dark:text-indigo-300">Initialize clean demo library</button>
        </div>
      </fieldset>
      {busy && <p role="status" className="text-xs text-indigo-600">Connecting to the explicit disposable database…</p>}
      {notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}
      {error && <p role="alert" data-book-qa-error={error.code} className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error.code}: {error.message}{error.databaseMissing ? ' This name is not initialized; initialize a new name or connect an existing v2 library.' : ''}</p>}
    </section>
  </main>;
}
