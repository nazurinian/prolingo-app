import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextMixedWorkspaceEditor from '../../../src/components/text/mixed/TextMixedWorkspaceEditor.jsx';
import SharedMixedWorkspaceReader from '../../../src/components/text/presentation/SharedMixedWorkspaceReader.jsx';
import { selectTextMixedReaderState } from '../../../src/domain/text/textMixedReaderDomain.js';
import { useConversationAudioPlayback } from '../../../src/components/text/conversation/useConversationAudioPlayback.js';
import { createP13MixedFixture } from './mixed-workspace-fixture.js';

const root = createRoot(document.getElementById('root'));
const tick = () => new Promise(r => requestAnimationFrame(r));
const assert = (value, message) => { if (!value) throw Error(message); };
const until = async (predicate, label = 'condition') => {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) { if (predicate()) return; await tick(); }
  throw Error('Timed out: ' + label);
};
const q = (selector, scope = document) => { const el = scope.querySelector(selector); assert(el, 'Missing ' + selector); return el; };
const button = (label, scope = document) => {
  const el = [...scope.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent.trim() === label);
  assert(el && !el.disabled, 'Missing/disabled button ' + label); return el;
};
const click = async (label, scope) => { button(label, scope).click(); await tick(); };
const input = async (label, value, scope = document) => {
  const el = q(`[aria-label="${label}"]`, scope);
  const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await tick();
};
const editor = () => q('[data-mixed-workspace-editor]');
const card = id => q(`[data-mixed-editor-card-id="${id}"]`);
const section = id => q(`[data-mixed-section-id="${id}"]`);
const sentence = id => q(`[data-conversation-sentence-id="${id}"]`, editor());
let latest, setModel, generation = 0;
async function mount() {
  const fixture = createP13MixedFixture(), source = JSON.stringify(fixture.snapshot), events = [], commits = [];
  const transport = { mode: 'accept', calls: 0, release: null, staged: null };
  let cancels = 0;
  const config = { preferences: fixture.preferences, playbackChannelMode: 'text-only', playbackRepresentationMode: 'split', globalPlaybackRate: 1 };
  const hooks = {
    speechSynth: { getVoices: () => [], speak() {}, pause() {}, resume() {}, cancel() { cancels++; } },
    executeBrowserTts: args => new Promise(resolve => events.push({ args, finish: resolve })),
    executeRuntimeAudio: args => new Promise(resolve => events.push({ args, finish: resolve }))
  };
  const execute = (_command, { preparedOutcome }) => {
    transport.calls++; transport.staged = preparedOutcome;
    if (transport.mode === 'reject') return { ok: false, error: { code: 'QA_REJECTED', message: 'Disposable transport rejection' } };
    if (transport.mode === 'defer') return new Promise(resolve => { transport.release = resolve; });
    if (transport.mode === 'malformed') return { ok: true };
    return preparedOutcome;
  };
  function Harness() {
    const [model, update] = useState({ snapshot: fixture.snapshot, documentId: fixture.ids.documentId, revision: 0 });
    const [pending, setPending] = useState(false), [view, setView] = useState(undefined);
    const selection = useMemo(() => selectTextMixedReaderState(model.snapshot, { documentId: model.documentId }), [model]);
    const audio = useConversationAudioPlayback({ snapshot: model.snapshot, documentTree: selection.documentTree, audioConfig: config, audioRuntimeHooks: hooks });
    useEffect(() => { latest = { ...model, audio, pending }; setModel = update; }, [model, audio, pending]);
    const accept = (outcome, scope) => {
      commits.push(outcome.result);
      update(current => current.snapshot === scope.snapshot && current.documentId === scope.documentId ? { ...current, snapshot: outcome.snapshot } : current);
    };
    return <><TextMixedWorkspaceEditor key={`${model.documentId}:${selection.presentation.workspace.uid}`} snapshot={model.snapshot} documentId={model.documentId}
      revision={model.revision} onStateChange={accept} executeCommand={execute} onPendingChange={setPending} />
      <SharedMixedWorkspaceReader snapshot={model.snapshot} documentId={model.documentId} audioPlayback={audio} isBusy={pending} presentationState={view} onPresentationStateChange={setView} /></>;
  }
  latest = null;
  root.render(<React.StrictMode><Harness key={++generation} /></React.StrictMode>);
  await until(() => latest?.snapshot === fixture.snapshot && document.querySelector('[data-mixed-workspace-editor]'));
  return { fixture, transport, events, commits, get model() { return latest; }, get cancels() { return cancels; },
    update: fn => setModel(fn), dispose: async () => {
      latest.audio.stopPlayback(); events.forEach(e => e.finish({ status: 'stopped' }));
      root.render(null); await tick(); assert(JSON.stringify(fixture.snapshot) === source, 'Source fixture mutated');
    } };
}

export async function runP13BrowserCases() {
  const results = []; let h;
  window.confirm = () => true;
  const run = async (name, fn) => {
    try { h = await mount(); await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: e.stack }); }
    finally { if (h) { await h.dispose(); h = null; } }
  };
  await run('Both Card types in global order, zero-Unit Cards and empty Sections/Turns retain identity', async () => {
    const order = [...editor().querySelectorAll('[data-mixed-editor-card-id]')].map(e => e.dataset.mixedEditorCardId);
    assert(JSON.stringify(order) === JSON.stringify(h.fixture.cardOrder), 'Global order');
    assert(section(h.fixture.ids.emptySectionId).textContent.includes('Intentionally empty'), 'Empty Section');
    assert(card(h.fixture.ids.zeroSceneId).textContent.includes('Zero Turns persisted'), 'Zero-Turn Scene');
    assert(card(h.fixture.ids.emptyParagraphId).textContent.includes('zero Sections retained'), 'Zero-Section Card');
  });
  await run('Create Paragraph and Conversation, rename, global reorder through both wrappers, delete', async () => {
    const { ids } = h.fixture;
    for (const blockType of ['paragraph', 'conversation']) {
      await click('Create Card', editor()); await input('New Card type', blockType, editor()); await input('Card title', 'Created ' + blockType, editor());
      await click('Save', editor()); await until(() => h.model.snapshot.blocks.some(b => b.title === 'Created ' + blockType));
      const created = h.model.snapshot.blocks.find(b => b.title === 'Created ' + blockType);
      await click(`Move ${blockType === 'paragraph' ? 'Card' : 'Scene'} ${created.id} up`, card(created.id));
      await until(() => h.model.snapshot.blocks.find(b => b.id === created.id).order === h.fixture.cardOrder.length);
      await click(blockType === 'paragraph' ? 'Edit Paragraph Card' : `Edit Scene ${created.id}`, card(created.id));
      await input(blockType === 'paragraph' ? 'Card title' : 'Scene Card Title', 'Renamed ' + blockType, card(created.id));
      await click(blockType === 'paragraph' ? 'Save' : 'Save Scene', card(created.id));
      await until(() => h.model.snapshot.blocks.find(b => b.id === created.id).title === 'Renamed ' + blockType);
      await click(blockType === 'paragraph' ? 'Delete Paragraph Card' : `Delete Scene ${created.id}`, card(created.id));
      await until(() => !h.model.snapshot.blocks.some(b => b.id === created.id));
    }
    await click(`Move Scene ${ids.sceneId} down`, card(ids.sceneId));
    await until(() => [...editor().querySelectorAll('[data-mixed-editor-card-id]')][2].dataset.mixedEditorCardId === ids.sceneId);
    assert(q('[data-shared-mixed-reader]').textContent.includes('After the dialogue'), 'Reader missing global Cards');
  });
  await run('Paragraph add/edit bilingual Sentence, joinAfter and Reader update preserve persistent identity', async () => {
    const { ids } = h.fixture;
    await click('Add Sentence', section(ids.emptySectionId));
    await input('New Sentence Text', 'Repeated sentence.', section(ids.emptySectionId));
    await input('New Sentence Meaning', 'Arti baru.', section(ids.emptySectionId)); await input('New Sentence joinAfter', 'none', section(ids.emptySectionId));
    await click('Add Sentence', q('[data-conversation-add-sentence]', section(ids.emptySectionId)));
    await until(() => h.model.snapshot.segments.some(s => s.text === 'Repeated sentence.'));
    const created = h.model.snapshot.segments.find(s => s.text === 'Repeated sentence.');
    assert(created.unitId === ids.emptySectionId && created.joinAfter === 'none', 'Explicit Unit and joinAfter');
    await click(`Edit sentence ${created.id}`, sentence(created.id));
    await input('Edit Sentence Text', 'Edited sentence.', editor()); await input('Edit Sentence Meaning', 'Arti diubah.', editor()); await input('Edit joinAfter', 'line', editor());
    await click('Save Sentence', editor()); await until(() => h.model.snapshot.segments.find(s => s.id === created.id).text === 'Edited sentence.');
    const saved = h.model.snapshot.segments.find(s => s.id === created.id);
    assert(saved.uid === created.uid && saved.meaning === 'Arti diubah.' && saved.joinAfter === 'line', 'Paired edit');
    assert(q(`[data-shared-card-segment="${created.id}"][data-shared-card-channel="meaning"]`).textContent.includes('Arti diubah.'), 'Reader stale after edit');
  });
  await run('Paragraph Sentence split/merge uses native Paragraph commands; Section split/merge and same-Card move', async () => {
    const { ids } = h.fixture;
    await click(`Edit sentence ${ids.beforeSentenceId}`, sentence(ids.beforeSentenceId));
    await input('Edit Sentence Meaning', 'Halo. Selamat datang.', editor()); await click('Save Sentence', editor());
    await until(() => h.model.snapshot.segments.find(s => s.id === ids.beforeSentenceId).meaning === 'Halo. Selamat datang.');
    await click('Split', sentence(ids.beforeSentenceId)); await click('Apply Auto Split (2)', sentence(ids.beforeSentenceId));
    await until(() => h.commits.some(c => c.entity === 'paragraphSegment' && c.action === 'split'));
    const split = h.commits.find(c => c.entity === 'paragraphSegment' && c.action === 'split'), newId = split.createdIds[0];
    await click('Merge Next', sentence(ids.beforeSentenceId)); await click('Confirm Merge (1 + 2)', sentence(ids.beforeSentenceId));
    await until(() => !h.model.snapshot.segments.some(s => s.id === newId));
    await click('Split Section Here', sentence(ids.blankMeaningId)); await until(() => h.model.snapshot.contentUnits.filter(u => u.blockId === ids.beforeCardId).length === 4);
    await click('Merge next Section', section(ids.sectionId)); await until(() => h.model.snapshot.contentUnits.filter(u => u.blockId === ids.beforeCardId).length === 3);
    await click('Move Section', sentence(ids.blankMeaningId)); await input('Destination Section', ids.emptySectionId, sentence(ids.blankMeaningId)); await click('Move Sentence', sentence(ids.blankMeaningId));
    await until(() => h.model.snapshot.segments.find(s => s.id === ids.blankMeaningId).unitId === ids.emptySectionId);
    assert(h.model.snapshot.segments.find(s => s.id === ids.blankMeaningId).meaning === '', 'Blank meaning lost');
  });
  await run('Section creation/edit/reorder/deletion; last Sentence deletion retains empty Section', async () => {
    const { ids } = h.fixture;
    await click('Add Section', card(ids.emptyParagraphId)); await until(() => h.model.snapshot.contentUnits.some(u => u.blockId === ids.emptyParagraphId));
    const newUnit = h.model.snapshot.contentUnits.find(u => u.blockId === ids.emptyParagraphId);
    await click('Edit Section note', section(newUnit.id)); await input('Metadata note', 'Retained empty.', section(newUnit.id)); await click('Save', section(newUnit.id));
    await until(() => h.model.snapshot.contentUnits.find(u => u.id === newUnit.id).metadata.note === 'Retained empty.');
    await click('Delete Section', section(newUnit.id)); await until(() => !h.model.snapshot.contentUnits.some(u => u.id === newUnit.id));
    await click('Section down', section(ids.sectionId)); await until(() => h.model.snapshot.contentUnits.find(u => u.id === ids.sectionId).order === 2);
    await click(`Delete sentence ${ids.afterSentenceId}`, sentence(ids.afterSentenceId)); await until(() => !h.model.snapshot.segments.some(s => s.id === ids.afterSentenceId));
    assert(section(ids.afterSectionId).textContent.includes('Intentionally empty'), 'Last deletion removed Section');
  });
  await run('Conversation forms reuse D4; adjacent same-speaker Turns stay distinct and empty Turn survives deletion', async () => {
    const { ids } = h.fixture;
    await click('Add Speaker Turn', card(ids.zeroSceneId)); await input('First Sentence Text', 'A Turn.', card(ids.zeroSceneId)); await input('First Sentence Meaning', 'Sebuah giliran.', card(ids.zeroSceneId));
    // AddTurn form permits an explicitly unassigned empty or authored Turn.
    await click('Create Turn + Sentence', card(ids.zeroSceneId)); await until(() => h.model.snapshot.segments.some(s => s.text === 'A Turn.'));
    const created = h.model.snapshot.segments.find(s => s.text === 'A Turn.');
    await click(`Delete sentence ${created.id}`, sentence(created.id)); await until(() => !h.model.snapshot.segments.some(s => s.id === created.id));
    assert(h.model.snapshot.contentUnits.some(u => u.id === created.unitId), 'Last deletion removed Turn');
    const alice = h.model.snapshot.contentUnits.find(u => u.id === ids.aliceTurnId), next = h.model.snapshot.contentUnits.find(u => u.id === ids.nextAliceTurnId);
    assert(alice.speakerId === next.speakerId && alice.id !== next.id, 'Adjacent identity conflated');
  });
  await run('Speaker registry register/rename/reassign/remove uses the shared D4 panel and protects assigned empty Turns', async () => {
    q('button', q('[data-conversation-speaker-registry]')).click(); await tick(); await input('New speaker label', 'Carla', editor()); await click('Register', editor());
    await until(() => h.model.snapshot.documents.find(d => d.id === h.fixture.ids.documentId).metadata.speakerRegistryV1.some(s => s.label === 'Carla'));
    assert(editor().textContent.includes('Carla'), 'Registry not updated');
    const registry = () => h.model.snapshot.documents.find(d => d.id === h.fixture.ids.documentId).metadata.speakerRegistryV1;
    const speaker = registry().find(s => s.label === 'Carla');
    await click('Edit speaker Carla', editor()); await input('Rename Carla', 'Carla Renamed', editor()); await click('Save speaker name', editor());
    await until(() => registry().some(s => s.id === speaker.id && s.label === 'Carla Renamed'));
    const { ids } = h.fixture;
    await click(`Edit Turn ${ids.emptyTurnId}`, editor()); await input('Turn Speaker Choice', speaker.id, editor()); await click('Save Turn', editor());
    await until(() => h.model.snapshot.contentUnits.find(u => u.id === ids.emptyTurnId).speakerId === speaker.id);
    const assigned = h.model.snapshot;
    await click('Remove speaker Carla Renamed', editor()); await until(() => editor().querySelector('[data-mixed-editor-error]'));
    assert(h.model.snapshot === assigned && editor().textContent.includes('in use'), 'Assigned empty Turn did not protect speaker');
    await click(`Edit Turn ${ids.emptyTurnId}`, editor()); await input('Turn Speaker Choice', '__none__', editor()); await click('Save Turn', editor());
    await until(() => !h.model.snapshot.contentUnits.find(u => u.id === ids.emptyTurnId).speakerId);
    await click('Remove speaker Carla Renamed', editor()); await until(() => !registry().some(s => s.id === speaker.id));
  });
  await run('Rejected and malformed acknowledgements preserve bilingual drafts; retry succeeds', async () => {
    const { ids } = h.fixture; const original = h.model.snapshot;
    await click(`Edit sentence ${ids.beforeSentenceId}`, sentence(ids.beforeSentenceId));
    await input('Edit Sentence Text', 'Draft preserved.', editor()); await input('Edit Sentence Meaning', 'Draf tersimpan.', editor());
    for (const mode of ['reject', 'malformed']) {
      h.transport.mode = mode; await click('Save Sentence', editor()); await until(() => editor().querySelector('[data-mixed-editor-error]'));
      assert(h.model.snapshot === original && h.commits.length === 0, 'Rejected command published');
      assert(q('[aria-label="Edit Sentence Meaning"]').value === 'Draf tersimpan.', 'Draft lost');
    }
    h.transport.mode = 'accept'; await click('Save Sentence', editor()); await until(() => h.model.snapshot.segments.find(s => s.id === ids.beforeSentenceId).text === 'Draft preserved.');
  });
  await run('Pending lock blocks repeated submissions and reader playback controls until exact acknowledgement', async () => {
    h.transport.mode = 'defer'; await click('Create Card', editor()); await input('Card title', 'One submission.', editor());
    const save = button('Save', editor()); save.click(); save.click();
    await until(() => h.model.pending && h.transport.release);
    assert(h.transport.calls === 1 && save.disabled, 'Duplicate dispatch escaped lock');
    assert(editor().getAttribute('aria-busy') === 'true', 'Missing busy state');
    const plays = [...q('[data-shared-mixed-reader]').querySelectorAll('[data-shared-card-play], [data-shared-card-play-channel]')];
    assert(plays.length > 0 && plays.every(b => b.disabled), 'Reader playback controls escaped the pending lock');
    plays[0].click(); await tick(); assert(h.events.length === 0, 'Pending command started playback');
    h.transport.release(h.transport.staged); await until(() => h.commits.length === 1 && !h.model.pending);
    assert(h.model.snapshot.blocks.filter(b => b.title === 'One submission.').length === 1, 'Duplicate Card');
  });
  await run('Late acknowledgement after snapshot replacement, Workspace switching or reset cannot overwrite current data', async () => {
    for (const action of ['snapshot', 'workspace', 'reset']) {
      h.transport.mode = 'defer';
      await click('Create Card', editor()); await input('Card title', 'Never publish ' + action, editor()); await click('Save', editor());
      await until(() => h.transport.release && h.model.pending);
      const release = h.transport.release, staged = h.transport.staged;
      if (action === 'workspace') h.update(m => ({ ...m, documentId: h.fixture.ids.mixedDocumentId }));
      else if (action === 'reset') h.update(m => ({ ...m, snapshot: createP13MixedFixture().snapshot, documentId: h.fixture.ids.documentId, revision: m.revision + 1 }));
      else h.update(m => ({ ...m, snapshot: structuredClone(m.snapshot) }));
      await tick(); await tick(); release(staged); await tick(); await tick();
      assert(!h.model.snapshot.blocks.some(b => b.title === 'Never publish ' + action) && h.commits.length === 0, 'Stale overwrite');
      await until(() => !h.model.pending, 'Pending Reader lock released after stale result or disposal');
      if (action === 'snapshot') await click('Cancel', q('[data-mixed-metadata-draft]'));
      h.transport.release = null;
    }
  });
  await run('One existing Split 1x host; layout/browse changes do not reset playback; edits use existing mutation cancellation', async () => {
    const { ids } = h.fixture;
    await latest.audio.playSentence(ids.firstSentenceId); await until(() => h.events.length === 1);
    const session = h.model.audio.readPresentationPlaybackScope().sessionId, cancels = h.cancels;
    for (const level of ['part', 'segment', 'full']) {
      q(`[data-shared-card-level-option="${level}"]`).click(); await tick();
      assert(h.model.audio.readPresentationPlaybackScope().sessionId === session && h.cancels === cancels && h.events.length === 1, 'View reset audio session');
    }
    assert(h.model.audio.config.playbackRepresentationMode === 'split' && h.model.audio.config.globalPlaybackRate === 1, 'Audio gate changed');
    await click('Edit Paragraph Card', card(ids.beforeCardId)); await input('Card title', 'Updated during playback', card(ids.beforeCardId)); await click('Save', card(ids.beforeCardId));
    await until(() => h.model.snapshot.blocks.find(b => b.id === ids.beforeCardId).title === 'Updated during playback');
    await until(() => !h.model.audio.isPlaying); assert(h.events.length === 1, 'Mutation duplicated playback');
  });
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results,
    indexedDbCalls: window.__p13DbCalls, storageCalls: window.__p13StorageCalls };
}

export const runP13AudioDiagnostics = async () => ({ scope: 'A3 editor; unrestricted audio intentionally excluded',
  unresolved: ['A4-FULL-01', 'A4-RATE-01'], testedAsPassing: false });
