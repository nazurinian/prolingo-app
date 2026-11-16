import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SharedParagraphWorkspaceReader from '../../../src/components/text/presentation/SharedParagraphCardReader.jsx';
import TextStructuredPlayer from '../../../src/components/text/TextStructuredPlayer.jsx';
import { useConversationAudioPlayback } from '../../../src/components/text/conversation/useConversationAudioPlayback.js';
import { selectTextCardPresentation } from '../../../src/domain/text/textCardPresentationDomain.js';
import {
  DEFAULT_TEXT_CARD_PRESENTATION_STATE,
  normalizeTextCardPresentationState,
  updateTextCardPresentationState
} from '../../../src/domain/text/textCardPresentationStateDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import {
  createA2ParagraphReaderFixture,
  createA2V1CompatibilityParagraphFixture
} from '../shared-card-a2/paragraph-reader-fixture.js';
import { createD5AudioFixture } from '../d5/conversation-audio-fixture.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => assert(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${message}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
);
const until = async (predicate, attempts = 120) => {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return;
    await tick(25);
  }
  throw new Error('Browser condition timed out');
};

const render = async element => {
  root.render(element ? <React.StrictMode>{element}</React.StrictMode> : null);
  await tick(60);
};

let nextInputId = 0;
const sendControl = payload => new Promise(resolve => {
  const id = ++nextInputId;
  window.__a3InputPending[id] = resolve;
  window.a3BrowserControl(JSON.stringify({ ...payload, id }));
});
const pressKey = key => sendControl({ type: 'key', key });
const setViewport = (width, height) => sendControl({ type: 'viewport', width, height });
const setReducedMotion = enabled => sendControl({ type: 'reducedMotion', enabled });

const segTarget = (segId, channel = 'text') => document.querySelector(
  `[data-shared-card-segment="${segId}"][data-shared-card-channel="${channel}"]`
);

export const renderA3PreviewShot = async ({
  level = 'part',
  partLayout = 'horizontal-focus',
  bilingualLayout = 'interlinear',
  dark = false,
  width = 390,
  height = 844
} = {}) => {
  document.documentElement.classList.toggle('dark', Boolean(dark));
  document.documentElement.style.fontSize = '';
  await setViewport(width, height);
  const f = createA2ParagraphReaderFixture();
  const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
  const playingCursor = {
    workspaceId: f.ids.documentId,
    workspaceUid: pres.workspace.uid,
    sessionId: 42,
    state: 'playing',
    precision: 'segment',
    cardId: f.ids.storyCardId,
    unitId: f.ids.storySection2Id,
    segmentId: f.ids.duplicateSeg2Id,
    channel: 'text'
  };
  await render(
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6">
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level, partLayout, bilingualLayout }}
        onPresentationStateChange={() => {}}
        playbackCursor={playingCursor}
        audioCoverageMap={f.audioCoverageMap}
      />
    </div>
  );
  await tick(120);
};

export const runA3BrowserCases = async () => {
  const results = [];
  const runCase = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error?.stack || error?.message || String(error) });
    } finally {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.fontSize = '';
      await setReducedMotion(false);
      await setViewport(1280, 800);
      await render(null);
    }
  };

  await runCase('View Level, Part Style & Bilingual Layout controls stay independent and Reset View restores defaults passively', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    let playCalls = 0;

    function StatefulReader() {
      const [viewState, setViewState] = useState(DEFAULT_TEXT_CARD_PRESENTATION_STATE);
      return (
        <SharedParagraphWorkspaceReader
          presentation={pres}
          presentationState={viewState}
          onPresentationStateChange={next => setViewState(normalizeTextCardPresentationState(next))}
          audioCoverageMap={f.audioCoverageMap}
          onPlayCard={() => { playCalls += 1; }}
          onPlaySegment={() => { playCalls += 1; }}
        />
      );
    }

    await render(<StatefulReader />);
    assert(!document.querySelector('[data-shared-part-layout-bar]'), 'Part layout strip must stay hidden in Full view');

    document.querySelector('[data-shared-card-layout-option="separated"]').click();
    await tick();
    document.querySelector('[data-shared-card-level-option="part"]').click();
    await tick();

    assert(Boolean(document.querySelector('[data-shared-part-layout-bar]')), 'Part layout strip must appear when level=part');
    assert(document.querySelector('[data-shared-bilingual-layout="separated"]'), 'Switching level must preserve active bilingual layout');
    assert(document.querySelector('[data-shared-part-layout="vertical-list"]'), 'Default part layout must be vertical-list');

    document.querySelector('[data-shared-card-part-layout-option="horizontal-focus"]').click();
    await tick();
    assert(document.querySelector('[data-shared-part-layout="horizontal-focus"]'), 'Part layout must switch to horizontal-focus');

    document.querySelector('[data-shared-card-level-option="segment"]').click();
    await tick();
    assert(!document.querySelector('[data-shared-part-layout-bar]'), 'Part layout strip must hide in Segment view');
    assert(document.querySelector('[data-shared-segment-view="true"]'), 'Segment focus card must render in Segment view');
    assert(document.querySelector('[data-shared-bilingual-layout="separated"]'), 'Segment view must preserve bilingual layout');

    document.querySelector('[data-shared-card-reset-view="true"]').click();
    await tick();
    const rootEl = document.querySelector('[data-shared-paragraph-reader]');
    equal(rootEl.dataset.sharedViewLevel, 'full', 'Reset View must return level to full');
    equal(rootEl.dataset.sharedPartLayout, 'vertical-list', 'Reset View must return partLayout to vertical-list');
    equal(rootEl.dataset.sharedBilingualLayout, 'interlinear', 'Reset View must return bilingualLayout to interlinear');
    equal(playCalls, 0, 'Toolbar transitions and Reset View must never invoke audio callbacks');
  });

  await runCase('Part View Horizontal Focus supports native scroll-snap swipe, Prev/Next, arrow keys, inert offscreen slides, and unclipped long sections', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    let playCalls = 0;

    await render(
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level: 'part', partLayout: 'horizontal-focus', bilingualLayout: 'interlinear' }}
        audioCoverageMap={f.audioCoverageMap}
        onPlayCard={() => { playCalls += 1; }}
        onPlaySegment={() => { playCalls += 1; }}
      />
    );

    const storyCard = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    const track = storyCard.querySelector('[data-shared-part-track="horizontal"]');
    const slides = [...storyCard.querySelectorAll('[data-shared-part-slide]')];
    equal(slides.length, 3, 'Story card must render all 3 horizontal slides including Empty Section 3');

    assert(getComputedStyle(track).scrollSnapType.includes('x'), 'Horizontal track must enable scroll-snap-x');
    assert(slides[0].dataset.sharedPartActive === 'true', 'First slide starts active');
    assert(slides[1].inert === true && slides[1].getAttribute('aria-hidden') === 'true', 'Offscreen horizontal slides must stay inert for keyboard Tab safety');
    assert(slides[0].scrollHeight <= slides[0].clientHeight + 2, 'Long Section 1 slide must expose full height without clipped inner scroll');

    // Step Next button -> Slide 2
    storyCard.querySelector('[data-shared-part-next="true"]').click();
    await tick(80);
    assert(slides[1].dataset.sharedPartActive === 'true', 'Next button selects Section 2');
    assert(slides[1].inert === false, 'Active Section 2 removes inert attribute');
    assert(storyCard.querySelector(`[data-shared-part-slide] [data-shared-card-index="5"]`), 'Logical sentence #5 preserved inside Section 2 slide');

    // Keyboard ArrowRight -> Empty Section 3 (Wait for compositor smooth-scroll settle to Slide 3)
    const pill2 = storyCard.querySelectorAll('[data-shared-part-pill]')[1];
    pill2.focus();
    await pressKey('ArrowRight');
    await until(() => slides[2].dataset.sharedPartActive === 'true' && Math.abs(track.scrollLeft - slides[2].offsetLeft) <= 2);
    assert(storyCard.querySelector('[data-shared-card-empty-section]'), 'Empty Section 3 remains explicitly visible');
    assert(storyCard.querySelector('[data-shared-part-next="true"]').disabled === true, 'Next disables cleanly at End boundary');

    // Native horizontal swipe back to Slide 1 via pointer gesture + instant scroll + settle debounce
    equal(slides[0].offsetLeft, 0, 'Relative horizontal track must align Slide 1 at offsetLeft=0');
    track.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    track.scrollTo({ left: slides[0].offsetLeft, behavior: 'instant' });
    track.dispatchEvent(new Event('scroll', { bubbles: false }));
    await tick(180);
    assert(slides[0].dataset.sharedPartActive === 'true', 'Native scroll-snap settle syncs selected Section back to Slide 1');
    assert(
      Math.abs(track.scrollLeft) <= 2,
      `Settled Slide 1 aligns cleanly at scrollLeft=0 without right clipping (scrollLeft=${track.scrollLeft}, offsets=${JSON.stringify(slides.map(s => s.offsetLeft))})`
    );
    equal(playCalls, 0, 'Horizontal swipe, arrow keys, and section pills must never start audio');
  });

  await runCase('Part View Vertical Focus and Vertical List handle boundaries, Neighbor Focus, Audible vs Selected, Compat, and Zero-Unit Cards', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    let playCalls = 0;

    const playingS2Cursor = {
      workspaceId: f.ids.documentId,
      workspaceUid: pres.workspace.uid,
      sessionId: 3,
      state: 'playing',
      precision: 'segment',
      cardId: f.ids.storyCardId,
      segmentId: f.ids.s2FirstSegId,
      channel: 'text'
    };

    await render(
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level: 'part', partLayout: 'vertical-focus', bilingualLayout: 'interlinear' }}
        playbackCursor={playingS2Cursor}
        audioCoverageMap={f.audioCoverageMap}
        onPlaySegment={() => { playCalls += 1; }}
      />
    );

    const storyCard = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    assert(storyCard.querySelector('[data-shared-part-focused]'), 'Vertical Focus highlights current Section');
    assert(storyCard.querySelector('[data-shared-part-neighbor="previous"]'), 'Previous Section neighbor rendered when focused on Section 2');
    assert(storyCard.querySelector('[data-shared-part-neighbor="next"]'), 'Next Section neighbor rendered when focused on Section 2');

    // Focus Previous neighbor -> Section 1 becomes Focused + Start boundary appears
    storyCard.querySelector('[data-shared-part-neighbor="previous"] [data-shared-part-focus]').click();
    await tick(60);
    assert(storyCard.querySelector('[data-shared-part-boundary="start"]'), 'Start of card boundary appears on Section 1');
    assert(!storyCard.querySelector('[data-shared-part-neighbor="previous"] button button'), 'No nested interactive buttons inside Neighbor focus header');
    assert(Boolean(storyCard.querySelector('[data-shared-part-follow-audio="true"]')), 'Follow Audio notice appears once browsed away from playing Section 2');

    // Switch to Vertical List and verify distinct Selected (Section 1) vs Audible (Section 2) surfaces
    await render(
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level: 'part', partLayout: 'vertical-list', bilingualLayout: 'interlinear' }}
        playbackCursor={playingS2Cursor}
        audioCoverageMap={f.audioCoverageMap}
        onPlaySegment={() => { playCalls += 1; }}
      />
    );
    const listStory = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    const listItems = [...listStory.querySelectorAll('[data-shared-part-list-item]')];
    equal(listItems.length, 3, 'Vertical list shows all 3 Sections');
    const sec1Btn = listStory.querySelector(`[data-shared-part-select="${listItems[0].dataset.sharedPartListItem}"]`);
    sec1Btn.click();
    await tick(60);
    assert(listItems[0].dataset.sharedPartActive === 'true', 'Section 1 is selected');
    assert(listItems[1].dataset.sharedPartAudible === 'true', 'Section 2 remains distinctly marked Audible');

    // Zero-unit empty card + v1 compat card checks
    const emptyCardEl = document.querySelector(`[data-shared-card-id="${f.ids.emptyCardId}"]`);
    assert(Boolean(emptyCardEl.querySelector('[data-shared-part-empty="zero-units"]')), 'Zero-unit empty card shows honest Part empty message');

    const v1 = createA2V1CompatibilityParagraphFixture();
    const v1Pres = selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId });
    await render(
      <SharedParagraphWorkspaceReader
        presentation={v1Pres}
        presentationState={{ level: 'part', partLayout: 'vertical-focus', bilingualLayout: 'interlinear' }}
      />
    );
    assert(Boolean(document.querySelector('[data-shared-part-compat-badge="true"]')), 'V1 compat card labels derived virtual section clearly');
    equal(playCalls, 0, 'Browsing Vertical Focus and Vertical List never invokes playback');
  });

  await runCase('Segment View browses passively, exposes Play Sentence + TextSegmentInteraction, shows missing meanings & duplicate indices, and keeps Cached Full Card honest', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const segCalls = [];

    await render(
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level: 'segment', partLayout: 'horizontal-focus', bilingualLayout: 'interlinear' }}
        audioCoverageMap={f.audioCoverageMap}
        onPlaySegment={segId => segCalls.push(segId)}
      />
    );

    const storyCard = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    assert(storyCard.querySelector(`[data-shared-segment-focus="${f.ids.longSegId}"]`), 'Segment View starts on Sentence 1');
    equal(storyCard.querySelector('[data-shared-segment-position="true"]').textContent.trim(), 'Sentence 1 of 5', 'Initial Sentence counter accurate');

    // Step silently to Missing Meaning (Sentence 4) and Duplicate EN #2 (Sentence 5)
    storyCard.querySelector('[data-shared-segment-next="true"]').click(); // #2 (dup 1)
    await tick(30);
    storyCard.querySelector('[data-shared-segment-next="true"]').click(); // #3 (s2FirstSegId)
    await tick(30);
    storyCard.querySelector('[data-shared-segment-next="true"]').click(); // #4 (missingMeaningSegId)
    await tick(40);
    assert(storyCard.querySelector(`[data-shared-segment-focus="${f.ids.missingMeaningSegId}"]`), 'Next reaches blank-meaning Sentence #4');
    assert(Boolean(storyCard.querySelector(`[data-shared-card-missing-meaning="${f.ids.missingMeaningSegId}"]`)), 'Blank-meaning Sentence #4 displays honest placeholder');
    equal(segCalls.length, 0, 'Next/Prev segment browsing stays strictly passive');

    storyCard.querySelector('[data-shared-segment-next="true"]').click(); // #5 (duplicateSeg2Id)
    await tick(40);
    equal(storyCard.querySelector('[data-shared-segment-focus-index]').dataset.sharedSegmentFocusIndex, '5', 'Duplicate EN Sentence #5 retains unique logical index 5');

    // Explicit Play Sentence button + direct interactive TextSegmentInteraction click/Enter
    storyCard.querySelector('[data-shared-segment-focus-play="true"]').click();
    const meaningInteractive = storyCard.querySelector(`[data-shared-card-segment="${f.ids.duplicateSeg2Id}"][data-shared-card-channel="meaning"]`);
    meaningInteractive.click();
    segTarget(f.ids.duplicateSeg2Id, 'text').focus();
    await pressKey('Enter');
    equal(segCalls, [f.ids.duplicateSeg2Id, f.ids.duplicateSeg2Id, f.ids.duplicateSeg2Id], 'Play Sentence and TextSegmentInteraction forward exact segment ID');

    // Cached Full Card playback honesty in Segment View: zero spoofed active sentence, notice displayed
    await render(
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level: 'segment', partLayout: 'vertical-focus', bilingualLayout: 'separated' }}
        playbackCursor={{
          workspaceId: f.ids.documentId,
          workspaceUid: pres.workspace.uid,
          sessionId: 8,
          state: 'playing',
          precision: 'card',
          cardId: f.ids.storyCardId,
          segmentId: null,
          channel: 'text'
        }}
        audioCoverageMap={f.audioCoverageMap}
      />
    );
    const fullStory = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    assert(Boolean(fullStory.querySelector('[data-shared-segment-full-notice="true"]')), 'Cached Full Card shows honest notice in Segment view');
    equal(fullStory.querySelectorAll('[data-shared-segment-active="true"]').length, 0, 'Cached Full Card never highlights fake active sentence');
  });

  await runCase('1,800 ms Manual Navigation Grace holds against auto-follow then yields cleanly on subsequent audio step or Follow Audio', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const setCursorExternal = { current: null };

    function GraceHarness() {
      const [viewState, setViewState] = useState({ level: 'part', partLayout: 'vertical-focus', bilingualLayout: 'interlinear' });
      const [cursor, setCursor] = useState({
        workspaceId: f.ids.documentId,
        workspaceUid: pres.workspace.uid,
        sessionId: 10,
        state: 'playing',
        precision: 'segment',
        cardId: f.ids.storyCardId,
        segmentId: f.ids.longSegId,
        channel: 'text'
      });
      useEffect(() => {
        setCursorExternal.current = setCursor;
      }, []);
      return (
        <SharedParagraphWorkspaceReader
          presentation={pres}
          presentationState={viewState}
          onPresentationStateChange={next => setViewState(normalizeTextCardPresentationState(next))}
          playbackCursor={cursor}
          audioCoverageMap={f.audioCoverageMap}
        />
      );
    }

    const s1Key = pres.cards[1].units[0].viewKey;
    const s2Key = pres.cards[1].units[1].viewKey;
    const s3Key = pres.cards[1].units[2].viewKey;

    await render(<GraceHarness />);
    const storyCard = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    assert(storyCard.querySelector(`[data-shared-part-focused="${s1Key}"]`), 'Starts following active Section 1');

    // Manually step to Empty Section 3 via Next twice
    storyCard.querySelector('[data-shared-part-next="true"]').click();
    await tick(20);
    storyCard.querySelector('[data-shared-part-next="true"]').click();
    await tick(40);
    assert(storyCard.querySelector(`[data-shared-part-focused="${s3Key}"]`), 'Manual browse moves focus to Empty Section 3');

    // Audio advances within 1800ms grace -> view MUST stay on Empty Section 3!
    setCursorExternal.current(prev => ({ ...prev, segmentId: f.ids.s2FirstSegId }));
    await tick(200);
    assert(storyCard.querySelector(`[data-shared-part-focused="${s3Key}"]`), '1800ms grace must hold manual Section even when audio steps to Section 2');
    assert(Boolean(storyCard.querySelector('[data-shared-part-follow-audio="true"]')), 'Follow Audio affordance stays visible while diverged');

    // Clicking Follow Audio returns immediately to audible Section 2
    storyCard.querySelector('[data-shared-part-follow-audio="true"]').click();
    await tick(60);
    assert(storyCard.querySelector(`[data-shared-part-focused="${s2Key}"]`), 'Follow Audio resumes audible Section immediately');

    // Re-test automatic yield after 1800ms grace window expires and audio transitions to another Segment
    storyCard.querySelector('[data-shared-part-prev="true"]').click();
    await tick(40);
    assert(storyCard.querySelector(`[data-shared-part-focused="${s1Key}"]`), 'Manual browse moved back to Section 1');
    await tick(1900);
    setCursorExternal.current(prev => ({ ...prev, segmentId: f.ids.duplicateSeg2Id }));
    await tick(80);
    assert(storyCard.querySelector(`[data-shared-part-focused="${s2Key}"]`), 'Once 1800ms grace elapses and next segment plays, view resumes following audible Section 2');
  });

  await runCase('Real D5 playback session stays uninterrupted across Full, all Part layouts, Segment, and Bilingual layouts', async () => {
    const d5 = createD5AudioFixture();
    const beforeSnapshot = JSON.stringify(d5.snapshot);
    const tree = resolveTextLibraryDocumentTree(d5.snapshot, d5.ids.documentId);
    const config = { preferences: d5.preferences, playbackRepresentationMode: 'split' };
    let starts = 0;
    let cancels = 0;
    const holder = {};
    const hooks = {
      speechSynth: { cancel: () => { cancels += 1; }, pause() {}, resume() {}, getVoices: () => [] },
      executeRuntimeAudio: ({ playbackResolveRef }) => new Promise(resolve => {
        starts += 1;
        playbackResolveRef.current = () => resolve({ status: 'stopped' });
      })
    };
    const para = createA2ParagraphReaderFixture();
    const paraPres = selectTextCardPresentation(para.snapshot, { documentId: para.ids.documentId });
    const mountCheck = { initialNode: null };

    function D5ContinuityHarness() {
      const [viewState, setViewState] = useState(normalizeTextCardPresentationState);
      const audio = useConversationAudioPlayback({
        snapshot: d5.snapshot,
        documentTree: tree,
        runtimeAudioUrls: d5.runtimeAudioUrls,
        audioConfig: config,
        audioRuntimeHooks: hooks
      });
      useEffect(() => {
        Object.assign(holder, { audio, viewState });
      }, [audio, viewState]);
      return (
        <div>
          <button type="button" data-test-start-d5="true" onClick={() => audio.playScene(d5.ids.sceneId)}>Start D5</button>
          <SharedParagraphWorkspaceReader
            presentation={paraPres}
            presentationState={viewState}
            onPresentationStateChange={next => setViewState(updateTextCardPresentationState(viewState, next))}
            audioCoverageMap={para.audioCoverageMap}
          />
        </div>
      );
    }

    await render(<D5ContinuityHarness />);
    mountCheck.initialNode = document.querySelector('[data-shared-paragraph-reader]');
    document.querySelector('[data-test-start-d5]').click();
    await until(() => starts === 1 && holder.audio?.isPlaying);
    const initialCancels = cancels;
    const initialCursor = holder.audio.currentIndex;

    const transitions = [
      ['level', 'part'],
      ['partLayout', 'horizontal-focus'],
      ['layout', 'separated'],
      ['partLayout', 'vertical-focus'],
      ['layout', 'text-only'],
      ['partLayout', 'vertical-list'],
      ['level', 'segment'],
      ['layout', 'meaning-only'],
      ['level', 'full'],
      ['layout', 'interlinear']
    ];
    for (const [kind, id] of transitions) {
      const selector = kind === 'level'
        ? `[data-shared-card-level-option="${id}"]`
        : kind === 'partLayout'
          ? `[data-shared-card-part-layout-option="${id}"]`
          : `[data-shared-card-layout-option="${id}"]`;
      document.querySelector(selector).click();
      await tick();
      assert(document.querySelector('[data-shared-paragraph-reader]') === mountCheck.initialNode, `Reader host must never remount on ${kind}:${id}`);
      assert(holder.audio.isPlaying && starts === 1 && cancels === initialCancels, `Audio session interrupted on ${kind}:${id}`);
      assert(holder.audio.currentIndex === initialCursor, `Audio cursor mutated on ${kind}:${id}`);
      assert(holder.audio.config.preferences === d5.preferences, 'Audio config preferences reference mutated');
    }
    assert(JSON.stringify(d5.snapshot) === beforeSnapshot, 'D5 snapshot must remain immutable');
    holder.audio.stopPlayback();
    await until(() => !holder.audio.isPlaying);
  });

  await runCase('Opt-in TextStructuredPlayer exposes Full/Part/Segment and Search reveal works across views', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const tree = resolveTextLibraryDocumentTree(f.snapshot, f.ids.documentId);

    await render(
      <TextStructuredPlayer
        documentTree={tree}
        useSharedCardReader
        sharedPresentation={pres}
        displayMode="text-meaning"
        playbackChannelMode="text-only"
        playbackRepresentationMode="split"
        playbackPreferences={{ cardExpansionMode: 'all' }}
        focusTarget={{
          documentId: f.ids.documentId,
          blockId: f.ids.storyCardId,
          segmentId: f.ids.duplicateSeg2Id,
          nonce: 77
        }}
        onFocusConsumed={() => {}}
      />
    );
    await tick(60);
    document.querySelector('[data-shared-card-level-option="part"]').click();
    await tick(50);
    const s2Key = pres.cards[1].units[1].viewKey;
    const storyCard = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    assert(Boolean(storyCard.querySelector(`[data-shared-part-list-item="${s2Key}"][data-shared-part-active="true"]`)), 'Search target must activate parent Section 2 in Part view');

    document.querySelector('[data-shared-card-level-option="segment"]').click();
    await tick(50);
    assert(Boolean(storyCard.querySelector(`[data-shared-segment-focus="${f.ids.duplicateSeg2Id}"]`)), 'Search target must focus target Sentence in Segment view');
  });

  await runCase('Responsive Mobile 320px/375px, Desktop 1280px, Dark Mode, 200% Text Scale, and Reduced Motion succeed', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });

    for (const [level, partLayout] of [['part', 'horizontal-focus'], ['part', 'vertical-focus'], ['part', 'vertical-list'], ['segment', 'horizontal-focus']]) {
      for (const width of [320, 375, 1280]) {
        await setViewport(width, 812);
        document.documentElement.classList.toggle('dark', width === 375);
        await render(
          <SharedParagraphWorkspaceReader
            presentation={pres}
            presentationState={{ level, partLayout, bilingualLayout: 'interlinear' }}
            audioCoverageMap={f.audioCoverageMap}
          />
        );
        assert(document.documentElement.scrollWidth <= width, `Overflow at ${width}px in ${level}/${partLayout}: scrollWidth=${document.documentElement.scrollWidth}`);
      }
    }

    // Touch target >= 44px on mobile + 200% font scale + reduced motion check
    await setViewport(375, 812);
    await setReducedMotion(true);
    document.documentElement.style.fontSize = '32px';
    await render(
      <SharedParagraphWorkspaceReader
        presentation={pres}
        presentationState={{ level: 'segment', partLayout: 'horizontal-focus', bilingualLayout: 'interlinear' }}
        audioCoverageMap={f.audioCoverageMap}
      />
    );
    const playSentenceBtn = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"] [data-shared-segment-focus-play="true"]`);
    assert(playSentenceBtn.getBoundingClientRect().height >= 44, `Play Sentence button must remain >=44px on mobile: ${playSentenceBtn.getBoundingClientRect().height}`);
    assert(document.documentElement.scrollWidth <= 375, '200% text scale must keep mobile layout within 375px width');
  });

  return {
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    indexedDbCalls: window.__a3DbCalls,
    storageCalls: window.__a3StorageCalls,
    results
  };
};
