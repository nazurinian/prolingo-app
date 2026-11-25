import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { selectTextUnifiedReader } from '../../../domain/text/textUnifiedReaderDomain.js';
import {
  TEXT_WORKSPACE_STYLE_SCOPES,
  loadTextMainReaderPreference,
  normalizeTextWorkspacePreferenceKey,
  resetTextMainReaderWorkspaceStyle,
  resolveTextMainReaderWorkspaceStyle,
  saveTextMainReaderPreference,
  updateTextMainReaderWorkspaceStyle
} from '../../../services/persistence/textMainReaderPreferenceService.js';
import { useConversationAudioPlayback } from '../conversation/useConversationAudioPlayback.js';
import UnifiedStructuredReader from './UnifiedStructuredReader.jsx';

const EMPTY = Object.freeze({});
export const STRUCTURED_UAT_PREFERENCE_HOST_ID = 'structured-uat';

/** One accepted D5 host, shared by both presentations and every structured Card type. */
export default function StructuredWorkspacePlayer({
  snapshot,
  documentId,
  audioRuntimeHooks = null,
  runtimeAudioUrls = EMPTY,
  runtimeFullAudio = EMPTY,
  preferences = EMPTY,
  disabled = false,
  preferenceHostId = STRUCTURED_UAT_PREFERENCE_HOST_ID
}) {
  const storageOptions = useMemo(() => ({ hostId: preferenceHostId }), [preferenceHostId]);
  const selected = useMemo(() => { try { return selectTextUnifiedReader(snapshot, documentId); } catch (error) { return { error }; } }, [snapshot, documentId]);
  const [readerPref, setReaderPref] = useState(() => loadTextMainReaderPreference(storageOptions));
  const [styleScope, setStyleScope] = useState(TEXT_WORKSPACE_STYLE_SCOPES.SHARED);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(null);
  const [options, setOptions] = useState({ playbackChannelMode: 'text-only', playbackRepresentationMode: 'split', globalPlaybackRate: 1 });

  useEffect(() => {
    setReaderPref(loadTextMainReaderPreference(storageOptions));
  }, [storageOptions]);

  const activeWorkspaceKey = useMemo(
    () => normalizeTextWorkspacePreferenceKey(selected.presentation?.workspace || null),
    [selected.presentation?.workspace]
  );

  useEffect(() => {
    if (!activeWorkspaceKey && styleScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE) {
      setStyleScope(TEXT_WORKSPACE_STYLE_SCOPES.SHARED);
    }
  }, [activeWorkspaceKey, styleScope]);

  const effectiveStyleResolution = useMemo(
    () => resolveTextMainReaderWorkspaceStyle(readerPref, activeWorkspaceKey
      ? { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: activeWorkspaceKey }
      : { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED }),
    [readerPref, activeWorkspaceKey]
  );
  const sharedStyleResolution = useMemo(
    () => resolveTextMainReaderWorkspaceStyle(readerPref, { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED }),
    [readerPref]
  );
  const activeStyleScope = styleScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE && activeWorkspaceKey
    ? TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
    : TEXT_WORKSPACE_STYLE_SCOPES.SHARED;
  const controlStyleValue = activeStyleScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
    ? effectiveStyleResolution.effectiveStyle
    : sharedStyleResolution.sharedStyle;
  const controlStyleDefaults = activeStyleScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
    ? effectiveStyleResolution.effectiveDefaults
    : sharedStyleResolution.effectiveDefaults;

  const commitReaderPreference = useCallback(updater => {
    setReaderPref(previous => {
      const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
      return saveTextMainReaderPreference(next, storageOptions);
    });
  }, [storageOptions]);

  const mode = readerPref.reader === 'shared' ? 'shared' : 'classic';
  const handleModeChange = useCallback(nextMode => {
    commitReaderPreference({ reader: nextMode === 'shared' ? 'shared' : 'legacy' });
  }, [commitReaderPreference]);
  const handleReaderModeChange = useCallback(readerMode => {
    commitReaderPreference({ readerMode });
  }, [commitReaderPreference]);
  const handleCardVisibilityChange = useCallback(cardVisibility => {
    commitReaderPreference({ cardVisibility });
  }, [commitReaderPreference]);
  const handleViewChange = useCallback(view => {
    commitReaderPreference({ view });
  }, [commitReaderPreference]);
  const handleWorkspaceStyleChange = useCallback(patch => {
    const target = activeStyleScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
      ? { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: activeWorkspaceKey }
      : { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED };
    commitReaderPreference(previous => updateTextMainReaderWorkspaceStyle(previous, patch, target));
  }, [activeStyleScope, activeWorkspaceKey, commitReaderPreference]);
  const handleResetWorkspaceStyle = useCallback(() => {
    const target = activeStyleScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
      ? { scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE, workspaceKey: activeWorkspaceKey }
      : { scope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED };
    commitReaderPreference(previous => resetTextMainReaderWorkspaceStyle(previous, target));
  }, [activeStyleScope, activeWorkspaceKey, commitReaderPreference]);

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
      <button type="button" className="min-h-11 border rounded px-3" aria-pressed={mode === 'classic'} onClick={() => handleModeChange('classic')}>Tampilan Lama</button>
      <button type="button" className="min-h-11 border rounded px-3" aria-pressed={mode === 'shared'} onClick={() => handleModeChange('shared')}>Shared UI (Beta)</button>
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
    {selected.error ? <p role="alert">{selected.error.message}</p> : (
      <UnifiedStructuredReader
        snapshot={snapshot}
        documentId={documentId}
        audioPlayback={audio}
        disabled={disabled}
        mode={mode}
        readerMode={readerPref.readerMode}
        onReaderModeChange={handleReaderModeChange}
        cardVisibility={readerPref.cardVisibility}
        onCardVisibilityChange={handleCardVisibilityChange}
        view={readerPref.view}
        onViewChange={handleViewChange}
        workspaceStyle={effectiveStyleResolution.effectiveStyle}
        workspaceStyleControlValue={controlStyleValue}
        effectiveWorkspaceStyleDefaults={controlStyleDefaults}
        workspaceStyleScope={activeStyleScope}
        onWorkspaceStyleScopeChange={setStyleScope}
        hasWorkspaceStyleOverride={effectiveStyleResolution.hasWorkspaceOverride}
        canOverrideWorkspaceStyle={Boolean(activeWorkspaceKey)}
        onWorkspaceStyleChange={handleWorkspaceStyleChange}
        onResetWorkspaceStyle={handleResetWorkspaceStyle}
        showWorkspaceStyle
        focusTarget={focus}
        onFocusConsumed={consume}
      />
    )}
  </section>;
}
