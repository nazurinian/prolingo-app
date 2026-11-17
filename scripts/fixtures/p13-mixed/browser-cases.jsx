import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SharedMixedWorkspaceReader from '../../../src/components/text/presentation/SharedMixedWorkspaceReader.jsx';
import { selectTextMixedReaderState } from '../../../src/domain/text/textMixedReaderDomain.js';
import { normalizeTextCardPresentationState } from '../../../src/domain/text/textCardPresentationStateDomain.js';
import { useConversationAudioPlayback } from '../../../src/components/text/conversation/useConversationAudioPlayback.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { createP13MixedFixture } from './mixed-workspace-fixture.js';
import { waitForCompletedReveal, waitForStableBrowserLayout } from '../shared-card-a2/completed-reveal.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 25) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw Error(message); };
const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), message + ': ' + JSON.stringify(a));
const until = async predicate => {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) { if (predicate()) return; await tick(20); }
  throw Error('Mixed browser condition timed out');
};
const q = (selector, scope = document) => {
  const el = scope.querySelector(selector); assert(el, 'Missing ' + selector); return el;
};
const click = async selector => { const button = q(selector); assert(!button.disabled, 'Disabled ' + selector); button.click(); await tick(); };
const reader = () => q('[data-shared-mixed-reader]');
const card = id => q(`[data-shared-card-id="${id}"]`);
const precision = () => reader().dataset.readerCursorPrecision;
const voices = ['en-GB-RyanNeural', 'en-GB-SoniaNeural', 'en-GB-LibbyNeural', 'id-ID-GadisNeural']
  .map(name => ({ name, lang: name.startsWith('id-') ? 'id-ID' : 'en-GB', voiceURI: name, localService: true }));
let latest, change, generation = 0;

const mount = async ({ full = false, rate = 1 } = {}) => {
  const data = createP13MixedFixture({ runtimeBindings: true });
  const events = [], steps = [], urls = [];
  let cancels = 0;
  const runtimeFullAudio = {};
  if (full) {
    const blob = new Blob(['Disposable binding; injected playback below never decodes it.'], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob); urls.push(url);
    runtimeFullAudio[data.artifact.fullArtifactFingerprint] = { blob, url, fullArtifactFingerprint: data.artifact.fullArtifactFingerprint };
  }
  const hooks = {
    speechSynth: { getVoices: () => voices, speak() {}, pause() {}, resume() {}, cancel() { cancels++; } },
    onPlaybackStep: step => steps.push(step),
    executeRuntimeAudio: args => new Promise(resolve => events.push({ kind: 'local', args, finish: resolve })),
    executeBrowserTts: args => new Promise(resolve => events.push({ kind: 'tts', args, finish: resolve }))
  };
  const config = { preferences: data.preferences, playbackChannelMode: 'text-only', playbackRepresentationMode: full ? 'full' : 'split', globalPlaybackRate: rate };
  function Harness() {
    const [model, setModel] = useState({ snapshot: data.snapshot, documentId: data.ids.documentId, focus: null });
    const [view, setView] = useState(normalizeTextCardPresentationState);
    const selection = useMemo(() => selectTextMixedReaderState(model.snapshot, { documentId: model.documentId }), [model.snapshot, model.documentId]);
    // Exactly one call site, outside all Card renderers.
    const audio = useConversationAudioPlayback({
      snapshot: model.snapshot, documentTree: selection.documentTree, runtimeAudioUrls: data.runtimeAudioUrls,
      runtimeFullAudio, audioConfig: config, audioRuntimeHooks: hooks, availableBrowserVoices: voices
    });
    useEffect(() => { latest = { ...model, audio, view, selection }; change = setModel; }, [model, audio, view, selection]);
    return <SharedMixedWorkspaceReader snapshot={model.snapshot} documentId={model.documentId} audioPlayback={audio}
      presentationState={view} onPresentationStateChange={setView} focusTarget={model.focus} />;
  }
  root.render(<React.StrictMode><Harness key={++generation} /></React.StrictMode>);
  await until(() => latest?.snapshot === data.snapshot && document.querySelector('[data-shared-mixed-reader]'));
  return { data, events, steps, get host() { return latest; }, get cancels() { return cancels; },
    change: update => change(update),
    dispose: async () => {
      latest?.audio?.stopPlayback();
      events.forEach(event => event.finish({ status: 'stopped' }));
      root.render(null); await tick(); urls.forEach(url => URL.revokeObjectURL(url));
    } };
};

export const runP13BrowserCases = async () => {
  const results = [], completedReveals = [];
  let h;
  const run = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack }); }
    finally { if (h) { await h.dispose(); h = null; } else { root.render(null); await tick(); } }
  };
  await run('Interleaved Paragraph/Scene/Paragraph, empty Sections/Turns/Cards and same-speaker identities render together', async () => {
    h = await mount(); const { ids } = h.data;
    equal([...reader().querySelectorAll('[data-shared-card-id]')].map(c => c.dataset.sharedCardId), h.data.cardOrder, 'Card order');
    assert(card(ids.beforeCardId).dataset.sharedCardRole === 'paragraph', 'Paragraph interpretation');
    assert(card(ids.sceneId).dataset.sharedCardRole === 'scene', 'Scene interpretation');
    assert(q(`[data-shared-card-unit-id="${ids.aliceTurnId}"]`).textContent.includes('Alice'), 'Persistent speaker label');
    assert(q(`[data-shared-card-unit-id="${ids.emptyTurnId}"]`).textContent.includes('Empty speaker turn'), 'Empty Turn');
    assert(card(ids.beforeCardId).querySelector('[data-shared-card-empty-section]'), 'Empty Section');
    assert(card(ids.zeroSceneId).querySelector('[data-shared-card-empty]'), 'Zero-Turn Scene');
    assert(card(ids.emptyParagraphId).querySelector('[data-shared-card-empty]'), 'Zero-Section Paragraph');
    assert(card(ids.sceneId).querySelectorAll('[data-shared-card-unit-id]').length === 4, 'Consecutive same-speaker Turns distinct');
    assert(card(ids.sceneId).querySelector('[data-shared-card-unit-id]').dataset.sharedCardUnitId === ids.aliceTurnId, 'First Turn identity');
  });
  await run('All levels, bilingual layouts and Part layouts apply to each Card type without audio/content changes', async () => {
    h = await mount(); const before = JSON.stringify(h.host.snapshot), cancels = h.cancels;
    for (const level of ['full', 'part', 'segment']) {
      await click(`[data-shared-card-level-option="${level}"]`);
      for (const layout of ['interlinear', 'separated', 'text-only', 'meaning-only']) {
        await click(`[data-shared-card-layout-option="${layout}"]`);
        assert([...reader().querySelectorAll('[data-shared-card-id]')].every(c => c.dataset.sharedCardLevel === level && c.dataset.sharedCardLayout === layout), 'All Card types share current view');
      }
      if (level === 'part') for (const layout of ['horizontal-focus', 'vertical-focus', 'vertical-list']) {
        await click(`[data-shared-card-part-layout-option="${layout}"]`);
        assert([...reader().querySelectorAll('[data-shared-card-id]')].every(c => c.dataset.sharedCardPartLayout === layout), 'Part layout');
      }
    }
    assert(h.events.length === 0 && h.cancels === cancels, 'View change invoked/cancelled audio');
    assert(JSON.stringify(h.host.snapshot) === before, 'View mutated snapshot');
    assert(q('[data-shared-card-level-option="part"]').title.includes('section or speaker turn'), 'Mixed toolbar terminology');
  });
  await run('Duplicate EN, distinct meanings and blank meanings stay bound to exact Segment IDs', async () => {
    h = await mount(); const { ids } = h.data;
    for (const layout of ['interlinear', 'separated', 'text-only', 'meaning-only']) {
      await click(`[data-shared-card-layout-option="${layout}"]`);
      const meaning = reader().querySelector(`[data-shared-card-segment="${ids.blankMeaningId}"][data-shared-card-channel="meaning"]`);
      assert(!meaning, 'Blank meaning borrowed another translation');
      if (layout !== 'text-only') {
        assert(q(`[data-shared-card-segment="${ids.beforeSentenceId}"][data-shared-card-channel="meaning"]`).textContent.includes('Arti pengantar'), 'Paragraph meaning');
        assert(q(`[data-shared-card-segment="${ids.firstSentenceId}"][data-shared-card-channel="meaning"]`).textContent.includes('Halo. Selamat datang.'), 'Scene meaning');
      }
    }
  });
  await run('Real search/focus reveals Paragraph and Scene targets across Full/Part/Segment with completed geometry', async () => {
    h = await mount(); const { ids } = h.data; let nonce = 0;
    for (const level of ['full', 'part', 'segment']) {
      h.change(model => ({ ...model, focus: null }));
      await until(() => h.host.focus === null);
      // End the previous search's document motion before shrinking/replacing its
      // layout. This is setup only; fresh reveal requests below must scroll unaided.
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      await click(`[data-shared-card-level-option="${level}"]`);
      const layouts = level === 'part' ? ['horizontal-focus', 'vertical-focus', 'vertical-list'] : [null];
      for (const layout of layouts) {
        h.change(model => ({ ...model, focus: null }));
        await until(() => h.host.focus === null);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        if (layout) await click(`[data-shared-card-part-layout-option="${layout}"]`);
        const samples = [];
        try {
          await waitForStableBrowserLayout(() => {
            const element = reader(), rect = element.getBoundingClientRect();
            samples.push({ time: Math.round(performance.now()), y: scrollY, height: document.documentElement.scrollHeight,
              top: rect.top, bottom: rect.bottom, fonts: document.fonts?.status, visibility: document.visibilityState });
            return element;
          }, { label: `Mixed ${level}/${layout || 'default'} readiness` });
        } catch (error) {
          error.message += ' Readiness samples: ' + JSON.stringify({ count: samples.length, first: samples.slice(0, 3), last: samples.slice(-24) });
          throw error;
        }
        for (const [blockId, segmentId] of [[ids.beforeCardId, ids.beforeSentenceId], [ids.sceneId, ids.secondSentenceId], [ids.afterCardId, ids.afterSentenceId]]) {
          h.change(model => ({ ...model, focus: { documentId: ids.documentId, blockId, segmentId, nonce: ++nonce } }));
          await until(() => reader().querySelector(`[data-shared-card-segment="${segmentId}"][data-shared-card-channel="text"]`));
          const geometry = await waitForCompletedReveal(() => reader().querySelector(`[data-shared-card-segment="${segmentId}"][data-shared-card-channel="text"]`));
          assert(geometry.segmentId === segmentId && geometry.channel === 'text', 'Reveal identity/channel');
          completedReveals.push({ level, layout, ...geometry });
        }
      }
    }
    assert(h.events.length === 0, 'Search played audio');
  });
  await run('Part/Segment manual browsing is silent and preserves persistent parent context', async () => {
    h = await mount(); const { ids } = h.data;
    await click('[data-shared-card-level-option="part"]');
    const scene = card(ids.sceneId);
    q('[data-shared-part-next]', scene).click(); await tick();
    assert(scene.textContent.includes('Speaker Turn 2'), 'Turn navigator uses distinct persistent Turn');
    await click('[data-shared-card-level-option="segment"]');
    q('[data-shared-segment-next]', card(ids.beforeCardId)).click(); await tick();
    assert(q('[data-shared-segment-focus]', card(ids.beforeCardId)).dataset.sharedSegmentFocus === ids.blankMeaningId, 'Sentence browsing identity');
    assert(h.events.length === 0 && precision() === 'none', 'Browsing became audible');
  });
  await run('One existing host traverses Paragraph → Scene → Paragraph with exact Sentence order and speaker profiles', async () => {
    h = await mount(); const before = JSON.stringify(h.host.snapshot);
    const expected = h.host.selection.documentTree.blocks.flatMap(b => b.segments.map(s => s.id));
    h.host.audio.playWorkspace();
    for (let i = 0; i < expected.length; i++) {
      await until(() => h.events.length === i + 1 && reader().dataset.readerCursorSegment === expected[i]);
      assert(precision() === 'segment', 'Split requires Segment precision');
      const source = h.steps[i];
      assert(source.segmentId === expected[i], 'No skipped/duplicated Sentence');
      h.events[i].finish({ status: 'played' });
    }
    await until(() => !h.host.audio.isPlaying && precision() === 'none');
    equal(h.steps.map(step => step.segmentId), expected, 'Workspace traversal');
    assert(h.steps.find(s => s.segmentId === h.data.ids.firstSentenceId).voiceId === 'en-GB-RyanNeural', 'Alice voice');
    assert(h.steps.find(s => s.segmentId === h.data.ids.bobSentenceId).voiceId === 'en-GB-SoniaNeural', 'Bob voice');
    assert(JSON.stringify(h.host.snapshot) === before, 'Traversal wrote snapshot');
  });
  await run('Explicit Paragraph and Scene actions use the same host callbacks; layout switches preserve its current token', async () => {
    h = await mount(); const { ids } = h.data;
    q('[data-shared-card-play="true"]', card(ids.beforeCardId)).click();
    await until(() => h.events.length === 1 && precision() === 'segment');
    const token = h.host.audio.readPresentationPlaybackScope().sessionId, cancels = h.cancels;
    for (const level of ['part', 'segment', 'full']) {
      await click(`[data-shared-card-level-option="${level}"]`);
      assert(h.host.audio.readPresentationPlaybackScope().sessionId === token && h.cancels === cancels, 'View restarted host');
    }
    assert(h.events.length === 1, 'Extra audio invocation on view');
    h.host.audio.stopPlayback(); h.events[0].finish({ status: 'stopped' });
    await until(() => precision() === 'none');
    q('[data-shared-card-play="true"]', card(ids.sceneId)).click();
    await until(() => h.events.length === 2 && reader().dataset.readerCursorUnit === ids.aliceTurnId);
  });
  await run('Cached Full is Card-only; actual failed-artifact per-Sentence recovery restores exact Turn identity', async () => {
    h = await mount({ full: true }); const { ids } = h.data; const before = JSON.stringify(h.host.snapshot);
    q('[data-shared-card-play="true"]', card(ids.sceneId)).click();
    await until(() => h.events.length === 1 && precision() === 'card');
    assert(!reader().dataset.readerCursorSegment && !reader().dataset.readerCursorUnit, 'Cached Full invented timing');
    const token = h.host.audio.readPresentationPlaybackScope().sessionId;
    await click('[data-shared-card-level-option="part"]');
    assert(h.events.length === 1 && h.host.audio.readPresentationPlaybackScope().sessionId === token, 'Part changed session');
    h.events[0].finish({ status: 'error' });
    await until(() => h.events.length === 2 && precision() === 'segment');
    assert(reader().dataset.readerCursorSegment === ids.firstSentenceId && reader().dataset.readerCursorUnit === ids.aliceTurnId, 'Fallback Sentence/Turn');
    h.host.audio.pausePlayback(); await until(() => h.host.audio.isPaused);
    const cancelled = h.cancels;
    await click('[data-shared-card-level-option="segment"]');
    assert(h.host.audio.isPaused && h.cancels === cancelled, 'Display resumed/cancelled audio');
    h.host.audio.resumePlayback(); await until(() => !h.host.audio.isPaused);
    assert(h.host.audio.readPresentationPlaybackScope().sessionId === token, 'Recovery changed token');
    assert(JSON.stringify(h.host.snapshot) === before, 'Playback failure rewrote artifact metadata');
  });
  await run('Workspace switch, snapshot reorder and fixture reset suppress stale highlights and old completions', async () => {
    h = await mount(); const { ids } = h.data;
    h.host.audio.playSentence(ids.firstSentenceId);
    await until(() => h.events.length === 1 && precision() === 'segment');
    h.change(model => ({ ...model, documentId: ids.mixedDocumentId }));
    await until(() => h.host.documentId === ids.mixedDocumentId && precision() === 'none');
    h.events[0].finish({ status: 'played' }); await tick();
    assert(h.events.length === 1, 'Old session continued in other Workspace');
    equal([...reader().querySelectorAll('[data-shared-card-id]')].map(c=>c.dataset.sharedCardId), [ids.paragraphId, ids.mixedSceneId], 'New Workspace Cards');
    h.change(model => ({ ...model, documentId: ids.documentId }));
    await until(() => h.host.documentId === ids.documentId);
    h.host.audio.playSentence(ids.firstSentenceId); await until(() => h.events.length === 2 && precision() === 'segment');
    const next = applyTextLibraryCommand(h.host.snapshot, { type: 'block.reorder', payload: { documentId: ids.documentId, orderedIds: [...h.data.cardOrder].reverse() } }, 1400).snapshot;
    h.change(model => ({ ...model, snapshot: next }));
    await until(() => h.host.snapshot === next && precision() === 'none');
    h.events[1].finish({ status: 'played' });
    equal([...reader().querySelectorAll('[data-shared-card-id]')].map(c=>c.dataset.sharedCardId), [...h.data.cardOrder].reverse(), 'Reordered Cards');
    h.host.audio.playSentence(ids.firstSentenceId); await until(() => h.events.length === 3 && precision() === 'segment');
    const reset = createP13MixedFixture().snapshot;
    h.change(model => ({ ...model, snapshot: reset }));
    await until(() => h.host.snapshot === reset && precision() === 'none');
    h.events[2].finish({ status: 'played' });
  });
  await run('Corrupted Mixed input shows a readable error; missing audio host leaves all play disabled', async () => {
    const data = createP13MixedFixture(); const before = JSON.stringify(data.snapshot);
    root.render(<SharedMixedWorkspaceReader snapshot={data.snapshot} documentId={data.ids.documentId} />);
    await until(() => document.querySelector('[data-shared-mixed-reader]'));
    assert([...reader().querySelectorAll('[data-shared-card-play], [data-shared-card-play-channel]')].every(b => b.disabled), 'Missing host play enabled');
    const corrupt = structuredClone(data.snapshot);
    corrupt.contentUnits.find(u => u.id === data.ids.sectionId).kind = 'turn';
    root.render(<SharedMixedWorkspaceReader snapshot={corrupt} documentId={data.ids.documentId} />);
    await until(() => document.querySelector('[role=alert]'));
    assert(!document.querySelector('[data-shared-mixed-reader]'), 'Invalid graph rendered');
    assert(JSON.stringify(data.snapshot) === before, 'Error repaired original snapshot');
  });
  await run('A zero-Card Mixed Workspace remains readable without borrowed Cards or playback', async () => {
    h = await mount();
    const outcome = applyTextLibraryCommand(h.host.snapshot, { type: 'document.create', payload: { documentType: 'mixed', title: 'Empty Mixed' } }, 1400);
    h.change(model => ({ ...model, snapshot: outcome.snapshot, documentId: outcome.result.id }));
    await until(() => h.host.documentId === outcome.result.id);
    assert(reader().textContent.includes('does not have any cards'), 'Missing Workspace empty state');
    assert(!reader().querySelector('[data-shared-card-id]') && h.events.length === 0, 'Borrowed a Card or started audio');
  });
  return { results, completedReveals, passed: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length,
    indexedDbCalls: window.__p13DbCalls, storageCalls: window.__p13StorageCalls };
};

/**
 * Original A4 blocker reproductions, retained as assertions after A4 closure.
 * The runner now fails if either diagnostic's expected behavior regresses.
 */
export const runP13AudioDiagnostics = async () => {
  const diagnostics = [];
  let h = await mount({ full: true });
  try {
    h.host.audio.playScene(h.data.ids.afterCardId);
    await until(() => h.events.length > 0 || h.host.audio.playbackLogs.some(log => log.message === 'Structured Text playback finished.'));
    diagnostics.push({
      issue: 'A4-FULL-01', expected: 'Nonempty Paragraph Full playback invokes local audio or TTS',
      actualAudioInvocations: h.events.length,
      expectationMet: h.events.length > 0,
      paragraphSegmentCount: h.host.selection.documentTree.blocks.find(b => b.id === h.data.ids.afterCardId).segments.length,
      logs: h.host.audio.playbackLogs
    });
  } finally { await h.dispose(); }
  h = await mount({ rate: 1.5 });
  try {
    h.host.audio.playSentence(h.data.ids.beforeSentenceId);
    await until(() => h.events.length === 1);
    diagnostics.push({
      issue: 'A4-RATE-01', expectedPlaybackRate: 1.5,
      actualPlaybackRate: h.events[0].args.playbackRate, expectationMet: h.events[0].args.playbackRate === 1.5, source: h.events[0].kind
    });
  } finally { await h.dispose(); }
  return diagnostics;
};
