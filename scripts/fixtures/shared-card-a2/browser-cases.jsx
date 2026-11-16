import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SharedParagraphWorkspaceReader, { SharedCardReadingSurface } from '../../../src/components/text/presentation/SharedParagraphCardReader.jsx';
import TextStructuredPlayer from '../../../src/components/text/TextStructuredPlayer.jsx';
import { useConversationAudioPlayback } from '../../../src/components/text/conversation/useConversationAudioPlayback.js';
import { selectTextCardPresentation } from '../../../src/domain/text/textCardPresentationDomain.js';
import { normalizeTextCardPresentationState, updateTextCardPresentationState } from '../../../src/domain/text/textCardPresentationStateDomain.js';
import { resolveTextCardPresentationCursor } from '../../../src/domain/text/textCardPresentationCursorDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { TEXT_STRUCTURED_PLAYBACK_CONTEXT } from '../../../src/domain/text/textStructuredPlaybackDomain.js';
import { TEXT_AUDIO_COVERAGE_STATUS } from '../../../src/domain/text/textStructuredAudioCoverageDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../../src/domain/text/textStructuredAudioRuntimeDomain.js';
import {
  createA2ParagraphReaderFixture,
  createA2V1CompatibilityParagraphFixture
} from './paragraph-reader-fixture.js';
import { createD5AudioFixture } from '../d5/conversation-audio-fixture.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => assert(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${message}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
);
const until = async predicate => {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await tick(20);
  }
  throw new Error('Browser condition timed out');
};

const render = async element => {
  root.render(element ? <React.StrictMode>{element}</React.StrictMode> : null);
  await tick(50);
};

let nextInputId = 0;
const pressKey = key => new Promise(resolve => {
  const id = ++nextInputId;
  window.__a2InputPending[id] = resolve;
  window.a2BrowserControl(JSON.stringify({ type: 'key', id, key }));
});
const setViewport = (width, height) => new Promise(resolve => {
  const id = ++nextInputId;
  window.__a2InputPending[id] = resolve;
  window.a2BrowserControl(JSON.stringify({ type: 'viewport', id, width, height }));
});
const setReducedMotion = enabled => new Promise(resolve => {
  const id = ++nextInputId;
  window.__a2InputPending[id] = resolve;
  window.a2BrowserControl(JSON.stringify({ type: 'reducedMotion', id, enabled }));
});

const segTarget = (segId, channel = 'text') => document.querySelector(
  `[data-shared-card-segment="${segId}"][data-shared-card-channel="${channel}"]`
);

export const runA2BrowserCases = async () => {
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

  await runCase('Cohesive Full Card avoids nested Section/Segment boxes and preserves Title, Empty Section and Zero-Unit Card', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    await render(<SharedParagraphWorkspaceReader presentation={pres} audioCoverageMap={f.audioCoverageMap} />);

    assert(document.querySelector('[data-shared-bilingual-layout="interlinear"]'), 'Default layout must be interlinear');
    assert(document.querySelectorAll('[data-shared-card-role="title"]').length === 1, 'TITLE card role must render');
    assert(document.querySelector('[data-shared-card-empty-section]'), 'Empty section must stay rendered');
    assert(document.querySelector('[data-shared-card-empty="zero-units"]'), 'Zero-unit empty card must stay rendered');

    const titleHeading = document.querySelector('[data-shared-card-role="title"] h3');
    const storyHeading = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"] h3`);
    assert(parseFloat(getComputedStyle(titleHeading).fontSize) > parseFloat(getComputedStyle(storyHeading).fontSize), 'TITLE card heading typography must outweigh Paragraph heading');

    const storyUnits = [...document.querySelectorAll(`[data-shared-card-id="${f.ids.storyCardId}"] [data-shared-card-unit]`)];
    assert(storyUnits.length === 3, `Expected 3 Sections in story card, got ${storyUnits.length}`);
    for (const unit of storyUnits) {
      const style = getComputedStyle(unit);
      assert(style.borderLeftWidth === '0px' && style.borderRightWidth === '0px' && style.borderBottomWidth === '0px', 'Sections must not have boxed side/bottom borders in Full View');
      assert(style.backgroundColor === 'rgba(0, 0, 0, 0)', 'Sections must remain open unboxed canvas');
    }
    const pairs = [...document.querySelectorAll('[data-shared-card-segment-pair]')];
    assert(pairs.length === 7, 'All 7 readable Segment pairs must render');
    for (const pair of pairs) {
      const style = getComputedStyle(pair);
      assert(style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)', 'Sentences must not render as bordered boxes in Interlinear Full View');
    }
  });

  await runCase('Four bilingual layouts preserve duplicate EN disambiguation, Missing Meaning, multilingual wrap and clean text selection', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const cursorSpeakingDup2 = resolveTextCardPresentationCursor({
      presentation: pres,
      playback: {
        workspaceId: pres.workspace.id,
        workspaceUid: pres.workspace.uid,
        sessionId: 5,
        playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
        isPlaying: true,
        isPaused: false,
        playbackRepresentationMode: 'split',
        playingIndex: f.ids.duplicateSeg2Id,
        activeBlockId: f.ids.storyCardId,
        speakingPart: 'text'
      }
    });

    await render(
      <div style={{ width: 390 }}>
        <SharedParagraphWorkspaceReader presentation={pres} playbackCursor={cursorSpeakingDup2} />
      </div>
    );

    const dup1Meaning = segTarget(f.ids.duplicateSeg1Id, 'meaning');
    const dup2Meaning = segTarget(f.ids.duplicateSeg2Id, 'meaning');
    assert(dup1Meaning.textContent.includes('Pintu kereta itu') && dup2Meaning.textContent.includes('Pintu gerbang stasiun'), 'Duplicate English segments must keep distinct paired meanings');
    assert(segTarget(f.ids.duplicateSeg2Id, 'text').dataset.textPlayerSegmentActive === 'true', 'Active duplicate #2 highlighted');
    assert(segTarget(f.ids.duplicateSeg1Id, 'text').dataset.textPlayerSegmentActive === undefined, 'Duplicate #1 must NOT light up when #2 plays');

    const longEn = segTarget(f.ids.longSegId, 'text');
    assert(longEn.style.boxDecorationBreak === 'clone' || longEn.style.webkitBoxDecorationBreak === 'clone', 'Wrapped spans must keep clone box-decoration-break');
    const multiEn = segTarget(f.ids.multilingualSegId, 'text');
    const range = document.createRange();
    range.selectNodeContents(multiEn);
    assert(range.getClientRects().length > 1, 'Multilingual + long URL text must wrap across lines');
    const storyCardRect = document.querySelector(`[data-shared-card-id="${f.ids.multilingualCardId}"]`).getBoundingClientRect();
    assert(multiEn.getBoundingClientRect().right <= storyCardRect.right + 1, 'Long unbroken URL must wrap cleanly inside card');

    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    assert(window.getSelection().toString().includes('Zürich') && !window.getSelection().toString().startsWith('1'), 'Text selection copies clean readable content without sentence numerals');
    window.getSelection().removeAllRanges();

    document.querySelector('[data-shared-card-layout-option="separated"]').click();
    await tick();
    assert(document.querySelector('[data-shared-card-separated="true"]'), 'Separated layout renders');
    assert(segTarget(f.ids.duplicateSeg2Id, 'meaning').dataset.sharedCardIndex === '5', 'Missing meaning #4 never shifts #5 in Separated flow');

    document.querySelector('[data-shared-card-layout-option="text-only"]').click();
    await tick();
    assert(document.querySelectorAll('[data-shared-card-channel="meaning"]').length === 0, 'EN Only hides Indonesian targets');

    document.querySelector('[data-shared-card-layout-option="meaning-only"]').click();
    await tick();
    assert(document.querySelectorAll('[data-shared-card-channel="text"]').length === 0, 'ID Only hides English targets');
    assert(document.querySelector(`[data-shared-card-missing-meaning="${f.ids.missingMeaningSegId}"]`), 'Missing meaning marker remains explicit in ID Only');
  });

  await runCase('Keyboard Enter/Space, visible focus ring, EN/ID manual callbacks and disabled targets work even under Full Card playback', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const fullCursor = resolveTextCardPresentationCursor({
      presentation: pres,
      playback: {
        workspaceId: pres.workspace.id,
        workspaceUid: pres.workspace.uid,
        sessionId: 8,
        playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
        isPlaying: true,
        isPaused: false,
        playbackRepresentationMode: 'full',
        playingIndex: null,
        activeBlockId: f.ids.storyCardId,
        speakingPart: 'text',
        playbackSourceStatus: {
          sessionId: 8,
          documentId: pres.workspace.id,
          workspaceUid: pres.workspace.uid,
          blockId: f.ids.storyCardId,
          segmentId: null,
          channel: 'text',
          mode: 'full-local'
        }
      }
    });
    const segCalls = [];
    const cardCalls = [];
    const playable = new Set([f.ids.longSegId, f.ids.duplicateSeg1Id]);

    await render(
      <div style={{ minHeight: '160vh' }}>
        <SharedParagraphWorkspaceReader
          presentation={pres}
          playbackCursor={fullCursor}
          playableSegmentIds={playable}
          onPlaySegment={id => segCalls.push(id)}
          onPlayCard={(id, opts) => cardCalls.push([id, opts?.playbackChannelMode || null])}
        />
      </div>
    );

    const statusText = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"] [data-shared-card-status-pill]`).textContent;
    assert(statusText.includes('Full Card'), `Expected truthful Card precision pill, got: ${statusText}`);
    assert(!document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"] [data-text-player-segment-active="true"]`), 'Cached Full must not mark Sentence 1 active');

    const enTarget = segTarget(f.ids.longSegId, 'text');
    const idTarget = segTarget(f.ids.longSegId, 'meaning');
    enTarget.click();
    idTarget.click();
    await pressKey('Tab');
    enTarget.focus();
    assert(enTarget.matches(':focus-visible'), 'Keyboard focus-visible must stay active');
    assert(getComputedStyle(enTarget).boxShadow !== 'none', 'Focus ring must be computed/visible');
    const scrollAfterFocus = window.scrollY;
    await tick(60);
    await pressKey('Enter');
    const scrollBeforeSpace = window.scrollY;
    await pressKey(' ');
    assert(
      window.scrollY === scrollBeforeSpace,
      `Space activation must prevent page scroll (afterFocus=${scrollAfterFocus}, before=${scrollBeforeSpace}, after=${window.scrollY}, activeTag=${document.activeElement?.tagName}, activeSeg=${document.activeElement?.dataset?.sharedCardSegment}, calls=${JSON.stringify(segCalls)})`
    );
    equal(segCalls, [f.ids.longSegId, f.ids.longSegId, f.ids.longSegId, f.ids.longSegId], 'Click, Meaning click, Enter & Space must each forward exact Segment ID even under Full audio');

    const disabledTarget = segTarget(f.ids.duplicateSeg2Id, 'text');
    assert(disabledTarget.tabIndex === -1 && disabledTarget.getAttribute('aria-disabled') === 'true', 'Unplayable segment must set disabled accessibility');
    disabledTarget.click();
    equal(segCalls.length, 4, 'Disabled target must not invoke playback callback');

    const storyCard = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`);
    storyCard.querySelector('[data-shared-card-play-channel="text"]').click();
    storyCard.querySelector('[data-shared-card-play-channel="meaning"]').click();
    storyCard.querySelector('[data-shared-card-play="true"]').click();
    equal(cardCalls, [
      [f.ids.storyCardId, 'text-only'],
      [f.ids.storyCardId, 'meaning-only'],
      [f.ids.storyCardId, null]
    ], 'Explicit Play EN / Play ID / Play Card callbacks remain accurate and distinct');
  });

  await runCase('Real D5 playback session stays uninterrupted while switching all 4 bilingual layouts', async () => {
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
    // Compose standalone Paragraph presentation side by side with real D5 audio hook to verify zero session churn
    const para = createA2ParagraphReaderFixture();
    const paraPres = selectTextCardPresentation(para.snapshot, { documentId: para.ids.documentId });
    const mountCheck = { initialNode: null };

    function Harness() {
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
          />
        </div>
      );
    }

    await render(<Harness />);
    mountCheck.initialNode = document.querySelector('[data-shared-paragraph-reader]');
    document.querySelector('[data-test-start-d5]').click();
    await until(() => starts === 1 && holder.audio?.isPlaying);
    const initialCancels = cancels;
    const initialCursor = holder.audio.currentIndex;

    for (const layout of ['separated', 'text-only', 'meaning-only', 'interlinear']) {
      document.querySelector(`[data-shared-card-layout-option="${layout}"]`).click();
      await tick();
      assert(document.querySelector('[data-shared-paragraph-reader]') === mountCheck.initialNode, `Reader host must not remount on ${layout}`);
      assert(holder.audio.isPlaying && starts === 1 && cancels === initialCancels, `Audio session disrupted on ${layout}`);
      assert(holder.audio.currentIndex === initialCursor, `Audio cursor altered on ${layout}`);
      assert(holder.audio.config.preferences === d5.preferences, 'Audio config preferences reference must remain identical');
    }
    assert(JSON.stringify(d5.snapshot) === beforeSnapshot, 'Zero snapshot mutations allowed');
    holder.audio.stopPlayback();
    await until(() => !holder.audio.isPlaying);
  });

  await runCase('Search reveal centers target Card/Segment, channel-qualified follow targets active flow, and opt-in TextStructuredPlayer works', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const tree = resolveTextLibraryDocumentTree(f.snapshot, f.ids.documentId);
    const scrollCalls = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      scrollCalls.push({
        seg: this.dataset?.textPlayerSegment || this.dataset?.sharedCardSegment || null,
        channel: this.dataset?.sharedCardChannel || null,
        options
      });
      return originalScrollIntoView.call(this, options);
    };

    try {
      await render(
        <div style={{ height: 240, overflow: 'auto' }}>
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
              nonce: 99
            }}
            onFocusConsumed={() => {}}
          />
        </div>
      );
      await tick(100);
      assert(scrollCalls.some(c => c.seg === f.ids.duplicateSeg2Id && c.options?.block === 'center'), 'Opt-in player must center search reveal target');
      const dup2El = document.querySelector(`[data-shared-card-segment="${f.ids.duplicateSeg2Id}"][data-shared-card-channel="text"]`);
      assert(dup2El.dataset.textSearchFocusSegment === 'true', 'Search target attribute must stay visible when interactive');
      assert(getComputedStyle(dup2El).backgroundColor !== 'rgba(0, 0, 0, 0)', 'Interactive search target must expose amber highlight background');

      // Channel-qualified follow in Separated mode targets ID flow when cursor speaks meaning
      scrollCalls.length = 0;
      const separatedState = normalizeTextCardPresentationState({ bilingualLayout: 'separated' });
      const idCursor = resolveTextCardPresentationCursor({
        presentation: pres,
        playback: {
          workspaceId: pres.workspace.id,
          workspaceUid: pres.workspace.uid,
          sessionId: 12,
          playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
          isPlaying: true,
          isPaused: false,
          playbackRepresentationMode: 'split',
          playingIndex: f.ids.duplicateSeg2Id,
          activeBlockId: f.ids.storyCardId,
          speakingPart: 'meaning'
        }
      });
      await render(
        <div style={{ height: 220, overflow: 'auto' }}>
          <SharedParagraphWorkspaceReader
            presentation={pres}
            presentationState={separatedState}
            playbackCursor={idCursor}
          />
        </div>
      );
      await tick(80);
      assert(
        scrollCalls.some(c => c.seg === f.ids.duplicateSeg2Id && c.channel === 'meaning'),
        `Separated follow must resolve channel-qualified meaning target, got ${JSON.stringify(scrollCalls)}`
      );
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  await runCase('V1 compat, Desktop 1280px, Mobile 375px, Narrow 320px, Dark Mode, 200% Scale and Reduced Motion succeed', async () => {
    const v1 = createA2V1CompatibilityParagraphFixture();
    const v1Pres = selectTextCardPresentation(v1.snapshot, { documentId: v1.ids.documentId });
    const f = createA2ParagraphReaderFixture();
    const v2Pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });

    // V1 check at Desktop 1280px
    await setViewport(1280, 800);
    await render(<SharedParagraphWorkspaceReader presentation={v1Pres} />);
    assert(document.querySelector('[data-shared-card-identity-source="v1-paragraph-compat"]'), 'V1 compat identity source must be visible in DOM');
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'Desktop must have zero horizontal overflow');
    const measureEl = document.querySelector(`[data-shared-card-body="${v1.ids.cardId}"] [data-shared-card-segment-pair] > div`)
      || document.querySelector(`[data-shared-card-body="${v1.ids.cardId}"]`);
    assert(measureEl.getBoundingClientRect().width <= 800, 'Desktop reading column measure must stay comfortably bounded');

    // Switch to full v2 fixture + Dark mode + Mobile 375px + 320px + 200% zoom
    document.documentElement.classList.add('dark');
    await setViewport(375, 812);
    await render(<SharedParagraphWorkspaceReader presentation={v2Pres} />);
    assert(document.documentElement.scrollWidth <= 375, 'Mobile 375px must have zero horizontal overflow');
    const darkCardBg = getComputedStyle(document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"]`)).backgroundColor;
    const darkTextColor = getComputedStyle(segTarget(f.ids.longSegId, 'text')).color;
    assert(darkCardBg !== darkTextColor && !darkCardBg.includes('255, 255, 255'), `Dark mode colors invalid: bg=${darkCardBg}, fg=${darkTextColor}`);

    const enPlayBtn = document.querySelector(`[data-shared-card-id="${f.ids.storyCardId}"] [data-shared-card-play-channel="text"]`);
    assert(enPlayBtn.getBoundingClientRect().height >= 44, `Mobile touch target height must be >= 44px, got ${enPlayBtn.getBoundingClientRect().height}`);

    await setViewport(320, 640);
    await tick(60);
    assert(document.documentElement.scrollWidth <= 320, 'Narrow 320px must reflow without horizontal overflow');

    // 200% text scale at standard mobile viewport
    await setViewport(375, 812);
    document.documentElement.style.fontSize = '200%';
    await tick(60);
    assert(document.documentElement.scrollWidth <= 375, `200% text scale must reflow at 375px without horizontal overflow (scrollWidth=${document.documentElement.scrollWidth})`);
    document.documentElement.style.fontSize = '';

    // Reduced motion behavior check
    await setReducedMotion(true);
    await setViewport(1024, 300);
    const motionCalls = [];
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      motionCalls.push(options);
      return originalScrollIntoView.call(this, options);
    };
    try {
      await render(
        <SharedParagraphWorkspaceReader
          presentation={v2Pres}
          focusTarget={{
            documentId: f.ids.documentId,
            blockId: f.ids.storyCardId,
            segmentId: f.ids.duplicateSeg2Id,
            nonce: 101
          }}
        />
      );
      await tick(80);
      assert(motionCalls.length > 0 && motionCalls.every(o => o?.behavior === 'auto'), `Reduced motion must use behavior:'auto', got ${JSON.stringify(motionCalls)}`);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  await runCase('HF1: Card visible Ready label excludes historical, metadata-only, other profiles, stale and missing audio', async () => {
    const f = createA2ParagraphReaderFixture();
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const card = pres.cardById[f.ids.storyCardId];
    const slots = card.units.flatMap(unit => unit.segments).flatMap(segment => ['text', 'meaning']
      .filter(channel => String(segment[channel] || '').trim()).map(channel => buildTextStructuredRuntimeAudioKey(segment.id, channel)));
    for (const status of [...Object.values(TEXT_AUDIO_COVERAGE_STATUS), 'unknown', null]) {
      const audioCoverageMap = status ? Object.fromEntries(slots.map(key => [key, { status }])) : {};
      await render(<SharedCardReadingSurface card={card} workspace={pres.workspace} audioCoverageMap={audioCoverageMap} />);
      const expectedReady = status === TEXT_AUDIO_COVERAGE_STATUS.READY ? slots.length : 0;
      equal(document.querySelector('[data-shared-card-readiness]').textContent.trim(), `Audio ${expectedReady}/${slots.length} ready`, `Visible readiness for ${status}`);
    }
  });

  await runCase('HF1: opt-in host preserves provided Split/Full cursor and fails closed without authoritative cursor scope', async () => {
    const f = createA2ParagraphReaderFixture(); const before = JSON.stringify(f.snapshot);
    const pres = selectTextCardPresentation(f.snapshot, { documentId: f.ids.documentId });
    const tree = resolveTextLibraryDocumentTree(f.snapshot, f.ids.documentId);
    const calls = [];
    const options = { documentTree: tree, sharedPresentation: pres, displayMode: 'text-meaning', playbackChannelMode: 'text-only',
      playbackPreferences: { cardExpansionMode: 'all' }, isPlaying: true, playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT,
      playingIndex: f.ids.longSegId, activeCursorSegmentId: f.ids.longSegId, speakingPart: 'text',
      onPlaySegment: id => calls.push(id), onStopPlayback: () => calls.push('stop') };
    for (const mode of ['split', 'full']) {
      const cursor = resolveTextCardPresentationCursor({ presentation: pres, playback: {
        workspaceId: pres.workspace.id, workspaceUid: pres.workspace.uid, sessionId: 41,
        playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT, isPlaying: true, playbackRepresentationMode: mode,
        playingIndex: f.ids.longSegId, currentIndex: f.ids.longSegId, speakingPart: 'text'
      } });
      const fullSentence = resolveTextCardPresentationCursor({ presentation: pres, playback: {
        workspaceId: pres.workspace.id, workspaceUid: pres.workspace.uid, sessionId: 41,
        playingContext: TEXT_STRUCTURED_PLAYBACK_CONTEXT, isPlaying: true, playbackRepresentationMode: 'full',
        playbackSourceStatus: { sessionId: 41, documentId: pres.workspace.id, blockId: f.ids.storyCardId,
          segmentId: f.ids.longSegId, channel: 'text', representation: 'full', mode: 'tts' }
      } });
      const valid = [cursor, fullSentence];
      for (const supplied of [undefined, {}, { ...cursor, sessionId: null }, { ...cursor, workspaceUid: 'old-workspace' },
        { ...cursor, workspaceId: 'DOC_999999' }, { ...fullSentence, segmentId: 'SEGMENT_999999' }, ...valid]) {
        await render(<TextStructuredPlayer {...options} useSharedCardReader playbackRepresentationMode={mode}
          activeSessionRepresentationMode={mode} sharedPlaybackCursor={supplied} />);
        const body = document.querySelector(`[data-shared-card-embedded][data-shared-card-id="${f.ids.storyCardId}"]`);
        equal(body.dataset.sharedCardPrecision, valid.includes(supplied) ? supplied.precision : 'none', 'Truthful display precision');
        const active = body.querySelectorAll('[data-text-player-segment-active="true"]');
        assert(active.length === (valid.includes(supplied) && supplied.precision === 'segment' ? 2 : 0), 'No invented exact audible Sentence');
      }
      await render(<TextStructuredPlayer {...options} playbackRepresentationMode={mode} activeSessionRepresentationMode={mode} />);
      assert(document.querySelector('[data-text-paragraph-unified]') && !document.querySelector('[data-shared-card-embedded]'), 'Opt-out keeps the existing Paragraph reader');
    }
    equal(calls, [], 'Renders must not request stop/play or reset a session');
    equal(JSON.stringify(f.snapshot), before, 'Coverage/cursor presentation must never write content');
  });

  return {
    browser: navigator.userAgent,
    results,
    passed: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
    indexedDbCalls: window.__a2DbCalls,
    storageCalls: window.__a2StorageCalls
  };
};
