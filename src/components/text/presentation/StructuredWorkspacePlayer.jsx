import React, { useCallback, useMemo, useState } from 'react';
import { selectTextUnifiedReader } from '../../../domain/text/textUnifiedReaderDomain.js';
import { useConversationAudioPlayback } from '../conversation/useConversationAudioPlayback.js';
import UnifiedStructuredReader from './UnifiedStructuredReader.jsx';
const EMPTY = Object.freeze({});

/** One accepted D5 host, shared by both presentations and every structured Card type. */
export default function StructuredWorkspacePlayer({ snapshot, documentId, audioRuntimeHooks = null, runtimeAudioUrls = EMPTY, runtimeFullAudio = EMPTY, preferences = EMPTY, disabled = false }) {
  const selected = useMemo(() => { try { return selectTextUnifiedReader(snapshot, documentId); } catch (error) { return { error }; } }, [snapshot, documentId]);
  const [mode, setMode] = useState('classic'), [view, setView] = useState(undefined), [query, setQuery] = useState(''), [focus, setFocus] = useState(null);
  const [options, setOptions] = useState({ playbackChannelMode: 'text-only', playbackRepresentationMode: 'split', globalPlaybackRate: 1 });
  const audioConfig = useMemo(() => ({ preferences, ...options }), [preferences, options]);
  const audio = useConversationAudioPlayback({ snapshot, documentTree: selected.documentTree, audioConfig, runtimeAudioUrls, runtimeFullAudio, audioRuntimeHooks });
  const consume = useCallback(nonce => setFocus(f => f?.nonce === nonce ? null : f), []);
  const search = event => {
    event.preventDefault();
    const entry = Object.values(selected.presentation?.segmentById || {}).find(s => query.trim() && (s.text + ' ' + s.meaning).toLowerCase().includes(query.trim().toLowerCase()));
    if (entry) setFocus({ documentId, blockId: selected.presentation.locationBySegmentId[entry.id].cardId, segmentId: entry.id, nonce: Date.now() });
  };
  return <section data-structured-workspace-player={documentId} className="space-y-3">
    <fieldset className="flex flex-wrap gap-2" aria-label="Reader presentation">
      <button type="button" className="min-h-11 border rounded px-3" aria-pressed={mode === 'classic'} onClick={() => setMode('classic')}>Tampilan Lama</button>
      <button type="button" className="min-h-11 border rounded px-3" aria-pressed={mode === 'shared'} onClick={() => setMode('shared')}>Shared UI (Beta)</button>
    </fieldset>
    <fieldset disabled={disabled} className="flex flex-wrap gap-2" aria-label="QA audio controls">
      <button type="button" className="min-h-11 border px-3" onClick={audio.playWorkspace}>Play Workspace</button>
      <button type="button" className="min-h-11 border px-3" onClick={audio.pausePlayback}>Pause</button>
      <button type="button" className="min-h-11 border px-3" onClick={audio.resumePlayback}>Resume</button>
      <button type="button" className="min-h-11 border px-3" onClick={audio.stopPlayback}>Stop</button>
      <label>Audio <select aria-label="Audio representation" value={options.playbackRepresentationMode} onChange={e => setOptions(o => ({ ...o, playbackRepresentationMode: e.target.value }))}><option value="split">Split</option><option value="full">Full</option></select></label>
      <label>Channel <select aria-label="Audio channel" value={options.playbackChannelMode} onChange={e => setOptions(o => ({ ...o, playbackChannelMode: e.target.value }))}>
        <option value="text-only">EN</option><option value="meaning-only">ID</option><option value="text-meaning">EN → ID</option><option value="meaning-text">ID → EN</option></select></label>
      <label>Rate <select aria-label="Audio rate" value={options.globalPlaybackRate} onChange={e => setOptions(o => ({ ...o, globalPlaybackRate: Number(e.target.value) }))}>{[0.75, 1, 1.5, 2].map(r => <option key={r} value={r}>{r}×</option>)}</select></label>
    </fieldset>
    <p className="text-sm">Audio setting changes stop the current attempt; presentation changes do not. Metadata alone is not physical audio readiness.</p>
    <output data-unified-source-status>{JSON.stringify(audio.playbackSourceStatus)}</output>
    <form onSubmit={search} className="flex gap-2"><input aria-label="Find Sentence" value={query} onChange={e => setQuery(e.target.value)} className="border rounded p-2" /><button type="submit">Find</button></form>
    {selected.error ? <p role="alert">{selected.error.message}</p> : <UnifiedStructuredReader snapshot={snapshot} documentId={documentId} audioPlayback={audio}
      disabled={disabled} mode={mode} view={view} onViewChange={setView} focusTarget={focus} onFocusConsumed={consume} />}
  </section>;
}
