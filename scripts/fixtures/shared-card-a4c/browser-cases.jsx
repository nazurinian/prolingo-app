import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextConversationEditor from '../../../src/components/text/conversation/TextConversationEditor.jsx';
import SharedConversationReader from '../../../src/components/text/presentation/SharedConversationReader.jsx';
import { SharedCardReadingSurface } from '../../../src/components/text/presentation/SharedParagraphCardReader.jsx';
import { selectTextCardPresentation } from '../../../src/domain/text/textCardPresentationDomain.js';
import { createA2ParagraphReaderFixture } from '../shared-card-a2/paragraph-reader-fixture.js';
import { createD5AudioFixture } from '../d5/conversation-audio-fixture.js';
import { applyTextConversationEditorCommand } from '../../../src/domain/text/textConversationEditorDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { buildTextStructuredBlockRuntimePlaybackPlan } from '../../../src/domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { buildTextStructuredFullArtifactRecord } from '../../../src/domain/text/textStructuredSplitFullDomain.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}: ${JSON.stringify(a)}`);
const q = (selector, scope = document) => { const el = scope.querySelector(selector); assert(el, `Missing ${selector}`); return el; };
const until = async (predicate, message = 'Browser condition timed out') => {
  for (let n = 0; n < 120; n++) { if (predicate()) return; await tick(20); }
  throw new Error(message);
};
const click = async selector => { q(selector).click(); await tick(45); };
const reader = () => q('[data-shared-conversation-reader]');
const scene = id => q(`[data-shared-card-id="${id}"]`, reader());
const precision = () => reader().dataset.readerCursorPrecision;
let generation = 0;

const dataFixture = (full = false) => {
  const data = createD5AudioFixture();
  data.runtimeFullAudio = {};
  if (full) {
    const tree = resolveTextLibraryDocumentTree(data.snapshot, data.ids.documentId);
    const block = tree.blocks.find(b => b.id === data.ids.sceneId);
    const plan = buildTextStructuredBlockRuntimePlaybackPlan({ documentTree: tree, block,
      audioVariants: data.snapshot.audioVariants, preferences: data.preferences, representationMode: 'full' });
    const artifact = buildTextStructuredFullArtifactRecord({ block, channel: 'text', composition: plan.composition, source: 'derived', mimeType: 'audio/wav' });
    data.snapshot = applyTextLibraryCommand(data.snapshot, { type: 'fullAudioArtifact.upsert', payload: { blockId: block.id, artifact } }, 600).snapshot;
    const blob = new Blob(['QA binding only; injected runtime gates playback'], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    data.runtimeFullAudio[artifact.fullArtifactFingerprint] = { blob, url, fullArtifactFingerprint: artifact.fullArtifactFingerprint };
    data.dispose = () => URL.revokeObjectURL(url);
  }
  return data;
};

const mount = async (data, config = {}, onCommand = null) => {
  const events = [];
  let latest;
  let change;
  let cancels = 0;
  const hooks = {
    speechSynth: { getVoices: () => [], cancel() { cancels++; }, pause() {}, resume() {}, speak() { throw new Error('Use injected QA runtime'); } },
    executeRuntimeAudio: args => new Promise(resolve => events.push({ args, finish: resolve })),
    executeBrowserTts: args => new Promise(resolve => events.push({ args, finish: resolve }))
  };
  const configValue = { preferences: data.preferences, playbackChannelMode: 'text-only', playbackRepresentationMode: 'split', ...config };
  const renderReader = host => {
    latest = host;
    return <SharedConversationReader snapshot={host.snapshot} documentId={host.editorState.workspace.id}
      audioPlayback={host.audioPlayback} isBusy={host.isBusy} />;
  };
  function Harness() {
    const [model, setModel] = useState({ snapshot: data.snapshot, documentId: data.ids.documentId, config: configValue });
    useEffect(() => { change = setModel; }, []);
    return <TextConversationEditor snapshot={model.snapshot} documentId={model.documentId}
      audioConfig={model.config} runtimeAudioUrls={data.runtimeAudioUrls} runtimeFullAudio={data.runtimeFullAudio}
      onCommand={onCommand} onStateChange={outcome => setModel(current => ({ ...current, snapshot: outcome.snapshot }))}
      audioRuntimeHooks={hooks} renderReader={renderReader} />;
  }
  root.render(<React.StrictMode><Harness key={++generation} /></React.StrictMode>);
  await tick(80);
  return { events, get host() { return latest; }, get cancels() { return cancels; }, change: update => change(update) };
};
const unmount = async data => { root.render(null); await tick(); data?.dispose?.(); };

export const runC1BrowserCases = async () => {
  const results = [];
  const test = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack }); }
    finally { await unmount(); }
  };
  await test('Collapsed zero-Unit Cards retain Paragraph wording and use Speaker Turn wording for Conversation', async () => {
    const paragraph = createA2ParagraphReaderFixture();
    const conversation = dataFixture();
    for (const [data, cardId, message] of [[paragraph, paragraph.ids.emptyCardId, 'No sections in this card yet.'],
      [conversation, conversation.ids.zeroSceneId, 'No speaker turns in this card yet.']]) {
      const p = selectTextCardPresentation(data.snapshot, { documentId: data.ids.documentId });
      root.render(<SharedCardReadingSurface card={p.cardById[cardId]} workspace={p.workspace} expanded={false} />);
      await tick();
      assert(document.body.textContent.includes(message), 'Collapsed empty-state terminology');
    }
  });
  await test('Persistent same-speaker Turns, multiple Sentences, empty Turn/Scene, and all bilingual layouts', async () => {
    const data = dataFixture();
    data.snapshot = applyTextConversationEditorCommand(data.snapshot, { type: 'segment.update', payload: {
      id: data.ids.secondSentenceId, text: 'Hello. Welcome.', meaning: '' } }, { documentId: data.ids.documentId }).snapshot;
    const before = JSON.stringify(data.snapshot);
    await mount(data);
    const first = q(`[data-shared-card-unit-id="${data.ids.aliceTurnId}"]`, reader());
    const empty = q(`[data-shared-card-unit-id="${data.ids.emptyTurnId}"]`, reader());
    assert(first.textContent.includes('Speaker Turn 1') && first.textContent.includes('Alice'), 'Turn heading context');
    assert(first.querySelectorAll('[data-shared-card-channel="text"]').length === 2, 'Two Sentences in first Turn');
    assert(empty.textContent.includes('Empty speaker turn'), 'Empty Turn retained');
    assert(scene(data.ids.zeroSceneId).textContent.includes('No speaker turns'), 'Zero-Unit Scene retained');
    assert(!scene(data.ids.sceneId).textContent.includes('sections'), 'No Paragraph terminology in Scene');
    for (const layout of ['interlinear', 'separated', 'text-only', 'meaning-only']) {
      await click(`[data-shared-card-layout-option="${layout}"]`);
      const secondMeaning = reader().querySelector(`[data-shared-card-segment="${data.ids.secondSentenceId}"][data-shared-card-channel="meaning"]`);
      assert(!secondMeaning, 'Blank meaning must not borrow duplicate text meaning');
      if (layout !== 'text-only') assert(reader().textContent.includes('Halo. Selamat datang.'), 'First meaning remains paired');
    }
    assert(JSON.stringify(data.snapshot) === before, 'Display changes never write snapshot');
  });
  await test('D5 Split cursor resolves Turn, manual browsing is silent, layout changes preserve live session', async () => {
    const data = dataFixture(); const h = await mount(data);
    await click(`[data-shared-card-id="${data.ids.sceneId}"] [data-shared-card-play="true"]`);
    await until(() => h.events.length === 1 && precision() === 'segment');
    assert(reader().dataset.readerCursorUnit === data.ids.aliceTurnId, 'Actual persistent parent Turn');
    const token = h.host.audioPlayback.readPresentationPlaybackScope().sessionId;
    const cancels = h.cancels;
    const before = JSON.stringify(h.host.snapshot);
    await click('[data-shared-card-level-option="part"]');
    const emptyUid = data.snapshot.contentUnits.find(u => u.id === data.ids.emptyTurnId).uid;
    await click(`[data-shared-part-pill="unit:${emptyUid}"]`);
    assert(reader().dataset.readerCursorSegment === data.ids.firstSentenceId, 'Browse must not move audible cursor');
    for (const layout of ['horizontal-focus', 'vertical-focus', 'vertical-list']) await click(`[data-shared-card-part-layout-option="${layout}"]`);
    await click('[data-shared-card-level-option="segment"]');
    await click(`[data-shared-segment-pill="${data.ids.bobSentenceId}"]`);
    assert(reader().dataset.readerCursorSegment === data.ids.firstSentenceId, 'Sentence browse stays separate');
    await click('[data-shared-card-layout-option="meaning-only"]');
    await click('[data-shared-card-level-option="full"]');
    equal([h.events.length, h.cancels, h.host.audioPlayback.readPresentationPlaybackScope().sessionId], [1, cancels, token], 'No restart or cancellation');
    assert(JSON.stringify(h.host.snapshot) === before, 'No content writes');
    h.events[0].finish({ status: 'played' });
    await until(() => h.events.length === 2 && reader().dataset.readerCursorSegment === data.ids.secondSentenceId);
    assert(reader().dataset.readerCursorUnit === data.ids.aliceTurnId, 'Next Sentence remains in same Turn');
    h.host.audioPlayback.stopPlayback(); await tick();
    assert(precision() === 'none', 'Stop clears audible identity');
    h.events[1].finish({ status: 'stopped' });
  });
  await test('D4 mutations refresh the same shared renderer and keep retained Turn identities and speaker context', async () => {
    const data = dataFixture(); const h = await mount(data);
    const uid = data.snapshot.contentUnits.find(u => u.id === data.ids.aliceTurnId).uid;
    const bobId = data.snapshot.contentUnits.find(u => u.id === data.ids.bobTurnId).speakerId;
    const mutate = async (type, payload) => {
      const out = applyTextConversationEditorCommand(h.host.snapshot, { type, payload }, { documentId: data.ids.documentId });
      h.change(current => ({ ...current, snapshot: out.snapshot })); await tick(60);
      return out.result;
    };
    await mutate('speaker.rename', { documentId: data.ids.documentId, speakerId: bobId, label: 'Robert' });
    await mutate('contentUnit.update', { id: data.ids.aliceTurnId, speakerId: bobId });
    assert(q(`[data-shared-card-unit="unit:${uid}"]`, reader()).textContent.includes('Robert'), 'Registry label refreshes without replacing Turn');
    await mutate('contentUnit.reorder', { blockId: data.ids.sceneId, orderedIds: [data.ids.bobTurnId, data.ids.aliceTurnId, data.ids.emptyTurnId, data.ids.nextAliceTurnId] });
    const split = await mutate('contentUnit.split', { id: data.ids.aliceTurnId, beforeSegmentId: data.ids.secondSentenceId });
    assert(reader().querySelectorAll('[data-shared-card-unit-id]').length === 5, 'Split adds actual persistent Turn');
    await mutate('contentUnit.merge', { ids: [data.ids.aliceTurnId, split.createdId] });
    await mutate('segment.move', { segmentId: data.ids.secondSentenceId, targetUnitId: data.ids.emptyTurnId });
    assert(q(`[data-shared-card-unit-id="${data.ids.emptyTurnId}"]`, reader()).textContent.includes('Please sit.'), 'Moved Segment has new parent');
    await mutate('segment.delete', { id: data.ids.secondSentenceId });
    assert(q(`[data-shared-card-unit-id="${data.ids.emptyTurnId}"]`, reader()).textContent.includes('Empty speaker turn'), 'Delete preserves empty Turn');
    assert(q(`[data-shared-card-unit="unit:${uid}"]`, reader()).textContent.includes('Hello. Welcome.'), 'Retained Turn/Segment identity');
    await mutate('contentUnit.delete', { id: data.ids.emptyTurnId });
    assert(!reader().querySelector(`[data-shared-card-unit-id="${data.ids.emptyTurnId}"]`), 'Deleted Turn removed');
    await mutate('block.delete', { id: data.ids.sceneId });
    assert(!reader().querySelector(`[data-shared-card-id="${data.ids.sceneId}"]`), 'Deleted Scene removed');
    assert(scene(data.ids.zeroSceneId).textContent.includes('No speaker turns'), 'Empty surviving Scene remains');
  });
  await test('Missing and foreign/stale host scope fail closed even with a plausible old Sentence status', async () => {
    const data = dataFixture();
    const workspace = data.snapshot.documents.find(d => d.id === data.ids.documentId);
    const base = { current: true, workspaceId: workspace.id, workspaceUid: workspace.uid, sessionId: 8,
      playingContext: 'text-structured', isPlaying: true, isPaused: false, playbackRepresentationMode: 'split' };
    for (const scope of [null, { ...base, current: false }, { ...base, sessionId: 9 }, { ...base, workspaceUid: 'old-uid' },
      { ...base, workspaceId: 'foreign' }, { ...base, isPlaying: false }]) {
      root.render(<SharedConversationReader snapshot={data.snapshot} documentId={data.ids.documentId}
        audioPlayback={{ readPresentationPlaybackScope: scope ? () => scope : undefined,
          playbackSourceStatus: { sessionId: 8, documentId: workspace.id, blockId: data.ids.sceneId,
            segmentId: data.ids.firstSentenceId, mode: 'local', representation: 'split', channel: 'text' } }} />);
      await tick(40);
      assert(precision() === 'none' && !document.querySelector('[data-text-player-segment-active="true"]'), 'Stale scope cannot nominate Sentence');
    }
  });
  await test('Cached Full Card precision -> per-Sentence Full fallback; no stale Sentence offset', async () => {
    const data = dataFixture(true);
    try {
      const h = await mount(data, { playbackRepresentationMode: 'full' });
      await click(`[data-shared-card-id="${data.ids.sceneId}"] [data-shared-card-play="true"]`);
      await until(() => h.events.length === 1 && precision() === 'card');
      assert(!reader().dataset.readerCursorSegment && !reader().dataset.readerCursorUnit, 'Cached Full has no Sentence/Turn timing');
      await click('[data-shared-card-level-option="part"]');
      assert(q('[data-shared-part-full-notice]', scene(data.ids.sceneId)), 'Full precision notice');
      h.events[0].finish({ status: 'error' });
      await until(() => h.events.length === 2 && precision() === 'segment');
      equal([reader().dataset.readerCursorSegment, reader().dataset.readerCursorUnit], [data.ids.firstSentenceId, data.ids.aliceTurnId], 'Fallback actual Sentence/Turn');
      h.host.audioPlayback.pausePlayback(); await tick();
      h.events[1].finish({ status: 'played' }); await tick(100);
      assert(h.events.length === 2, 'Pause holds traversal');
      h.host.audioPlayback.resumePlayback();
      await until(() => h.events.length === 3 && reader().dataset.readerCursorSegment === data.ids.secondSentenceId);
      h.host.audioPlayback.stopPlayback(); await tick();
      h.events[2].finish({ status: 'stopped' });
      assert(precision() === 'none', 'Stop ends recovery highlight');
    } finally { data.dispose(); }
  });
  await test('Sentence EN/ID activation uses exact existing playSentence signature; Card ID control uses one-time channel override', async () => {
    const data = dataFixture(); const h = await mount(data);
    await click(`[data-shared-card-segment="${data.ids.secondSentenceId}"][data-shared-card-channel="meaning"]`);
    await until(() => h.events.length === 1);
    assert(h.events[0].args.item.id === data.ids.secondSentenceId, 'Meaning click forwards only Segment identity');
    assert(h.host.audioPlayback.playbackSourceStatus.channel === 'text', 'Existing manual host channel config preserved');
    h.host.audioPlayback.stopPlayback(); h.events[0].finish({ status: 'stopped' }); await tick();
    await click(`[data-shared-card-id="${data.ids.sceneId}"] [data-shared-card-play-channel="meaning"]`);
    await until(() => h.events.length === 2);
    assert(h.host.audioPlayback.playbackSourceStatus.channel === 'meaning', 'Explicit Card ID override forwarded');
    assert(h.host.audioPlayback.config.playbackChannelMode === 'text-only', 'Override does not change preferences');
    h.host.audioPlayback.stopPlayback(); h.events[1].finish({ status: 'stopped' });
  });
  await test('D4 failed async command preserves edit draft with reader mounted; retry commits via original dispatcher', async () => {
    const data = dataFixture(); let reject = true;
    const h = await mount(data, {}, async command => {
      if (reject) throw new Error('C1 disposable command failure');
      return applyTextConversationEditorCommand(h.host.snapshot, command, { documentId: data.ids.documentId });
    });
    await click(`[aria-label="Edit sentence ${data.ids.firstSentenceId}"]`);
    const field = q('[aria-label="Edit Sentence Text"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Keep this failed draft.');
    field.dispatchEvent(new Event('input', { bubbles: true })); await tick();
    const save = () => [...document.querySelectorAll('button')].find(el => el.textContent.includes('Save Sentence'));
    save().click(); await tick(70);
    assert(q('[aria-label="Edit Sentence Text"]').value === 'Keep this failed draft.', 'Failure preserved draft');
    assert(h.host.snapshot.segments.find(s => s.id === data.ids.firstSentenceId).text === 'Hello. Welcome.', 'Failed snapshot unchanged');
    reject = false; save().click(); await tick(80);
    assert(reader().textContent.includes('Keep this failed draft.'), 'Retry renders committed D4 snapshot');
  });
  for (const kind of ['snapshot', 'Workspace', 'configuration', 'reset']) {
    await test(`${kind} change rejects stale session status and cancels through existing D5 lifecycle`, async () => {
      const data = dataFixture(); const h = await mount(data);
      await click(`[data-shared-card-id="${data.ids.sceneId}"] [data-shared-card-play="true"]`);
      await until(() => h.events.length === 1 && precision() === 'segment');
      const previous = h.host.audioPlayback;
      if (kind === 'reset') await mount(dataFixture());
      else h.change(current => kind === 'snapshot' ? { ...current, snapshot: structuredClone(current.snapshot) }
        : kind === 'Workspace' ? { ...current, documentId: data.ids.mixedDocumentId }
          : { ...current, config: { ...current.config, playbackChannelMode: 'meaning-only' } });
      await tick(100);
      assert(!previous.readPresentationPlaybackScope().current || !previous.readPresentationPlaybackScope().isPlaying, 'Old scope no longer authoritative');
      assert(!document.querySelector('[data-reader-cursor-precision="segment"]'), 'No stale audible highlight');
      h.events[0].finish({ status: 'played' }); await tick(80);
      assert(h.events.length === 1, 'No continuation from cancelled session');
    });
  }
  return { browser: navigator.userAgent, results, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length,
    indexedDbCalls: window.__c1DbCalls, storageCalls: window.__c1StorageCalls };
};
