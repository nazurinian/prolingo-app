import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BaselineParagraph from 'a1-approved-paragraph';
import TextParagraphUnifiedReading from '../../../src/components/text/TextParagraphUnifiedReading.jsx';
import TextSegmentInteraction from '../../../src/components/text/presentation/TextSegmentInteraction.jsx';
import TextStructuredPlayer from '../../../src/components/text/TextStructuredPlayer.jsx';
import { useConversationAudioPlayback } from '../../../src/components/text/conversation/useConversationAudioPlayback.js';
import { normalizeTextCardPresentationState, updateTextCardPresentationState } from '../../../src/domain/text/textCardPresentationStateDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { createA1V1ParagraphFixture } from './presentation-fixture.js';
import { createD5AudioFixture } from '../d5/conversation-audio-fixture.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw Error(message); };
const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
const until = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(20); }
  throw Error('Browser condition timed out');
};
const render = async element => { root.render(<React.StrictMode>{element}</React.StrictMode>); await tick(50); };
const span = (id = 's1', channel = 'text') => document.querySelector(`[data-text-paragraph-sentence="${id}"][data-text-paragraph-sentence-channel="${channel}"]`);
const segments = [{ id: 's1', text: 'A long first sentence with selectable words and enough content to wrap across several lines. '.repeat(3), meaning: 'Arti pertama.' },
  { id: 's2', text: 'Second sentence.', meaning: '' }, { id: 's3', text: 'Third sentence.', meaning: 'Arti ketiga.' }];
const props = { segments, splitMode: true, displayMode: 'text-meaning', activeSegmentId: 's1', speakingPart: 'text', isPlaybackActive: true };
const paragraph = (Component, overrides = {}) => <div style={{ width: 420 }}><Component {...props} {...overrides} /></div>;
const domSignature = node => node.nodeType === Node.TEXT_NODE ? node.textContent
  : node.nodeType === Node.ELEMENT_NODE ? [node.tagName, [...node.attributes].map(attr => [attr.name, attr.value]).sort(), [...node.childNodes].map(domSignature)] : null;
const appearance = () => [...document.querySelectorAll('[data-text-paragraph-sentence]')].map(node => {
  const css = getComputedStyle(node); const rect = node.getBoundingClientRect();
  return [node.dataset.textParagraphSentence, node.dataset.textParagraphSentenceChannel, css.color, css.backgroundColor,
    css.font, css.lineHeight, css.textDecorationLine, css.boxDecorationBreak, rect.width, rect.height];
});
let nextInputId = 0;
const press = key => new Promise(resolve => {
  const id = ++nextInputId;
  window.__a1InputPending[id] = resolve;
  window.a1BrowserInput(JSON.stringify({ id, key }));
});

export const runA1BrowserCases = async () => {
  const results = [];
  const test = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack || error.message }); }
    finally { await render(null); }
  };
  await test('Approved Paragraph DOM, classes, inline styles and computed geometry remain identical in 10 states', async () => {
    const states = [{}, { speakingPart: 'meaning' }, { disabled: true }, { playableSegmentIds: new Set(['s3']) },
      { splitMode: false, activeSegmentId: null, fullCardActive: true },
      { splitMode: false, activeSegmentId: null, fullCardActive: true, speakingPart: 'meaning' },
      { splitMode: false, activeSegmentId: null, focusSegmentId: 's3' },
      { displayMode: 'text-only' }, { displayMode: 'meaning-only' }, { displayMode: 'text-active-meaning' }];
    for (const state of states) {
      await render(paragraph(BaselineParagraph, state));
      const baseline = domSignature(document.getElementById('root')); const geometry = appearance();
      await render(paragraph(TextParagraphUnifiedReading, state));
      equal(domSignature(document.getElementById('root')), baseline, 'DOM compatibility');
      equal(appearance(), geometry, 'Computed appearance/geometry compatibility');
    }
  });
  await test('Paragraph clicks and native Enter/Space forward only Segment ID; channel quick play stays explicit', async () => {
    const calls = []; const channels = [];
    await render(paragraph(TextParagraphUnifiedReading, { onPlaySegment: (...args) => calls.push(args), onPlayChannel: value => channels.push(value) }));
    span().click(); span('s1', 'meaning').click();
    await press('Tab'); span().focus();
    assert(span().matches(':focus-visible'), 'Keyboard focus-visible must remain available');
    assert(getComputedStyle(span()).boxShadow !== 'none', 'Focus ring must be visible');
    await press('Enter'); const top = window.scrollY; await press(' ');
    equal(calls, [['s1'], ['s1'], ['s1'], ['s1']], 'Manual callback arguments/count');
    assert(window.scrollY === top, 'Space activation must prevent page scrolling');
    document.querySelector('[data-text-paragraph-play-channel="text"]').click();
    document.querySelector('[data-text-paragraph-play-channel="meaning"]').click();
    equal(channels, ['text', 'meaning'], 'One-shot channel requests');
    assert(span('s3', 'meaning').dataset.textParagraphSentenceIndex === '3', 'Blank Meaning must not renumber pairing');
  });
  await test('Disabled and nonplayable Sentence targets suppress click/keyboard without changing their persistent target', async () => {
    const calls = [];
    for (const state of [{ disabled: true }, { playableSegmentIds: new Set(['s3']) }]) {
      await render(paragraph(TextParagraphUnifiedReading, { ...state, onPlaySegment: id => calls.push(id) }));
      const target = span(); assert(target.tabIndex === -1 && target.getAttribute('aria-disabled') === 'true', 'Disabled accessibility');
      target.click(); target.focus(); await press('Enter'); await press(' ');
    }
    equal(calls, [], 'No disabled manual playback');
  });
  await test('Indigo/emerald speaking, active underline, wrapped decoration, search focus and native text selection remain intact', async () => {
    await render(paragraph(TextParagraphUnifiedReading));
    const en = span(); const id = span('s1', 'meaning');
    assert(en.className.includes('bg-indigo-200/90'), 'EN speaking semantic color');
    assert(getComputedStyle(id).textDecorationLine.includes('underline'), 'Inactive channel of active Sentence remains underlined');
    assert(en.style.boxDecorationBreak === 'clone', 'Wrapped-line decoration');
    const range = document.createRange(); range.selectNodeContents(en);
    assert(range.getClientRects().length > 1, 'Fixture must actually wrap lines');
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    assert(window.getSelection().toString() === segments[0].text.trim(), 'Selectable/copyable native text');
    await render(paragraph(TextParagraphUnifiedReading, { speakingPart: 'meaning' }));
    assert(span('s1', 'meaning').className.includes('bg-emerald-200/90'), 'ID speaking semantic color');
    await render(paragraph(TextParagraphUnifiedReading, { splitMode: false, activeSegmentId: null, focusSegmentId: 's3' }));
    assert(span('s3').dataset.textSearchFocusSegment === 'true' && span('s3').className.includes('bg-amber-100'), 'Search focus survives noninteractive view');
  });
  await test('Shared primitive interaction capability does not depend on Full/Part/Segment or audio configuration', async () => {
    const calls = [];
    for (const level of ['full', 'part', 'segment']) {
      const view = normalizeTextCardPresentationState({ level });
      await render(<div data-level={view.level}><TextSegmentInteraction segmentId="stable-id" channel="meaning" interactive
        accessibleLabel="Play unchanged manual target" onActivate={id => calls.push(id)}>Selectable meaning</TextSegmentInteraction></div>);
      document.querySelector('[role="button"]').click();
    }
    equal(calls, ['stable-id', 'stable-id', 'stable-id'], 'Identical capability in every view level');
  });
  await test('Actual Structured Player still reveals search target and yields passive follow after user navigation', async () => {
    const data = createA1V1ParagraphFixture();
    const tree = resolveTextLibraryDocumentTree(data.snapshot, data.ids.documentId);
    tree.blocks[0].segments[0].text = 'Long readable content. '.repeat(300);
    const calls = []; const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) { calls.push({ id: this.dataset.textPlayerSegment, options }); return originalScroll.call(this, options); };
    const shared = { documentTree: tree, displayMode: 'text-meaning', playbackChannelMode: 'text-only', playbackRepresentationMode: 'split',
      playbackPreferences: { cardExpansionMode: 'all' }, onFocusConsumed: () => {} };
    const player = extra => <div style={{ height: 240 }}><TextStructuredPlayer {...shared} {...extra} /></div>;
    try {
      await render(player({ focusTarget: { documentId: data.ids.documentId, blockId: data.ids.cardId, segmentId: data.ids.secondSegmentId, nonce: 1 } }));
      assert(calls.some(call => call.id === data.ids.secondSegmentId && call.options.block === 'center'), 'Explicit search centers original Segment target');
      // Retire the explicit request before testing passive following. Otherwise
      // a pending search RAF can legitimately center the target after the trace
      // is cleared, which is not a violation of the passive user-input grace.
      await render(player({}));
      await tick(100);
      calls.length = 0;
      const container = document.querySelector('[data-text-structured-player]');
      container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await render(player({ isPlaying: true, playingContext: 'text-structured', playingIndex: data.ids.segmentId, speakingPart: 'text' }));
      assert(calls.length === 0, `User navigation grace must suppress passive auto-follow: ${JSON.stringify(calls)}`);
    } finally { Element.prototype.scrollIntoView = originalScroll; }
  });
  await test('View and browse changes leave the real D5 hook/session, snapshot and audio configuration untouched', async () => {
    const data = createD5AudioFixture(); const before = JSON.stringify(data.snapshot);
    const tree = resolveTextLibraryDocumentTree(data.snapshot, data.ids.documentId);
    const config = { preferences: data.preferences, playbackRepresentationMode: 'split' };
    let starts = 0; let cancels = 0;
    const control = {};
    const hooks = { speechSynth: { cancel: () => { cancels++; }, pause() {}, resume() {}, getVoices: () => [] },
      executeRuntimeAudio: ({ playbackResolveRef }) => new Promise(resolve => {
        starts++; playbackResolveRef.current = () => resolve({ status: 'stopped' });
      }) };
    function Harness() {
      const [view, setView] = useState(normalizeTextCardPresentationState);
      const [browse, setBrowse] = useState(data.ids.emptyTurnId);
      const audio = useConversationAudioPlayback({ snapshot: data.snapshot, documentTree: tree,
        runtimeAudioUrls: data.runtimeAudioUrls, audioConfig: config, audioRuntimeHooks: hooks });
      useEffect(() => { Object.assign(control, { audio, view, browse }); }, [audio, view, browse]);
      return <div>
        <button onClick={() => audio.playScene(data.ids.sceneId)}>Start original session</button>
        <button onClick={() => setView(previous => updateTextCardPresentationState(previous, {
          level: previous.level === 'full' ? 'part' : previous.level === 'part' ? 'segment' : 'full',
          bilingualLayout: previous.bilingualLayout === 'interlinear' ? 'meaning-only' : 'interlinear',
          partLayout: previous.partLayout === 'vertical-list' ? 'horizontal-focus' : 'vertical-list'
        }))}>Change view only</button>
        <button onClick={() => setBrowse(data.ids.bobTurnId)}>Browse Bob only</button>
      </div>;
    }
    await render(<Harness />);
    const buttons = document.querySelectorAll('button'); buttons[0].click();
    await until(() => starts === 1 && control.audio.isPlaying);
    const startCancels = cancels; const cursor = control.audio.currentIndex;
    for (let i = 0; i < 6; i++) { buttons[1].click(); await tick(); }
    buttons[2].click(); await tick();
    assert(control.audio.isPlaying && starts === 1 && cancels === startCancels, 'No session stop, restart, duplicate step or synth cancellation');
    assert(control.browse === data.ids.bobTurnId && control.audio.currentIndex === cursor, 'Browse must not set the audible cursor');
    assert(control.audio.config.preferences === data.preferences, 'Audio preference reference must stay identical');
    assert(JSON.stringify(data.snapshot) === before, 'No content, RF, metadata or identity writes');
    control.audio.stopPlayback(); await until(() => !control.audio.isPlaying);
  });
  return { browser: navigator.userAgent, results, passed: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).length, indexedDbCalls: window.__a1DbCalls, storageCalls: window.__a1StorageCalls };
};
