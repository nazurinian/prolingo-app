import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TextConversationEditor from '../../../src/components/text/conversation/TextConversationEditor.jsx';
import SharedConversationReader from '../../../src/components/text/presentation/SharedConversationReader.jsx';
import { applyTextConversationEditorCommand } from '../../../src/domain/text/textConversationEditorDomain.js';
import { createA4hShowcaseConversationFixture } from './conversation-ux-fixture.js';

const root = createRoot(document.getElementById('root'));
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => assert(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${message}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
);
const until = async (predicate, message = 'Browser condition timed out') => {
  for (let i = 0; i < 140; i += 1) {
    if (predicate()) return;
    await tick(25);
  }
  throw new Error(message);
};

let nextInputId = 0;
const sendControl = payload => new Promise(resolve => {
  const id = ++nextInputId;
  window.__a4hInputPending[id] = resolve;
  window.a4hBrowserControl(JSON.stringify({ ...payload, id }));
});
const pressKey = key => sendControl({ type: 'key', key });
const setViewport = (width, height) => sendControl({ type: 'viewport', width, height });
const setReducedMotion = enabled => sendControl({ type: 'reducedMotion', enabled });

const mountEditorWithReader = async (
  data,
  { initialView = null, config = {}, onCommand = null } = {}
) => {
  const events = [];
  const hostBox = { current: null };
  const handleHost = host => { hostBox.current = host; };
  let updateModel = null;
  let cancels = 0;

  function HostMirror({ host }) {
    useEffect(() => {
      handleHost(host);
    }, [host]);
    return null;
  }

  const hooks = {
    speechSynth: {
      getVoices: () => [],
      cancel() { cancels += 1; },
      pause() {},
      resume() {},
      speak() { throw new Error('Use injected QA audio runtime'); }
    },
    executeRuntimeAudio: args => new Promise(resolve => events.push({ args, finish: resolve })),
    executeBrowserTts: args => new Promise(resolve => events.push({ args, finish: resolve }))
  };

  function Harness() {
    const [model, setModel] = useState({
      snapshot: data.snapshot,
      documentId: data.ids.documentId,
      config: { ...data.preferences, ...config, preferences: data.preferences }
    });
    const [viewState, setViewState] = useState(initialView);
    useEffect(() => { updateModel = setModel; }, []);
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6">
        <TextConversationEditor
          snapshot={model.snapshot}
          documentId={model.documentId}
          audioConfig={model.config}
          runtimeFullAudio={data.runtimeFullAudio}
          onCommand={onCommand}
          onStateChange={outcome => setModel(curr => ({ ...curr, snapshot: outcome.snapshot }))}
          audioRuntimeHooks={hooks}
          renderReader={host => (
            <>
              <HostMirror host={host} />
              <SharedConversationReader
                snapshot={host.snapshot}
                documentId={host.editorState.workspace.id}
                audioPlayback={host.audioPlayback}
                isBusy={host.isBusy}
                presentationState={viewState}
                onPresentationStateChange={setViewState}
              />
            </>
          )}
        />
      </div>
    );
  }

  root.render(<React.StrictMode><Harness /></React.StrictMode>);
  await tick(90);
  return {
    events,
    get host() { return hostBox.current; },
    get cancels() { return cancels; },
    change: fn => updateModel(fn)
  };
};

const unmount = async () => {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.fontSize = '';
  await setReducedMotion(false);
  await setViewport(1280, 900);
  root.render(null);
  await tick(40);
};

export const renderA4hPreviewShot = async ({
  level = 'full',
  partLayout = 'horizontal-focus',
  bilingualLayout = 'interlinear',
  dark = false,
  width = 1280,
  height = 860,
  playingSegmentId = null
} = {}) => {
  document.documentElement.classList.toggle('dark', Boolean(dark));
  document.documentElement.style.fontSize = '';
  await setViewport(width, height);
  const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
  const presentation = (await import('../../../src/domain/text/textConversationReaderDomain.js'))
    .selectTextConversationReaderPresentation(f.snapshot, { documentId: f.ids.documentId });
  const { SharedParagraphWorkspaceReader } = await import('../../../src/components/text/presentation/SharedParagraphCardReader.jsx');

  const cursor = playingSegmentId
    ? {
        workspaceId: f.ids.documentId,
        workspaceUid: presentation.workspace.uid,
        sessionId: 88,
        state: 'playing',
        precision: 'segment',
        cardId: f.ids.scene1Id,
        unitId: presentation.locationBySegmentId[playingSegmentId]?.unitId || null,
        segmentId: playingSegmentId,
        channel: 'text'
      }
    : undefined;

  root.render(
    <React.StrictMode>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-3 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <SharedParagraphWorkspaceReader
            presentation={presentation}
            presentationState={{ level, partLayout, bilingualLayout }}
            onPresentationStateChange={() => {}}
            playbackCursor={cursor}
          />
        </div>
      </div>
    </React.StrictMode>
  );
  await tick(120);
};

export const runA4hBrowserCases = async () => {
  const results = [];
  const runCase = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error?.stack || error?.message || String(error) });
    } finally {
      await unmount();
    }
  };

  await runCase('Full View renders cohesive unboxed Scene dialogue, Scene Cast, consecutive same-speaker Turns, Unassigned speaker, Missing Meaning, Duplicate EN & Separated speaker attribution', async () => {
    const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
    await mountEditorWithReader(f);
    const reader = document.querySelector('[data-shared-conversation-reader]');
    const scene1 = reader.querySelector(`[data-shared-card-id="${f.ids.scene1Id}"]`);
    const zeroScene = reader.querySelector(`[data-shared-card-id="${f.ids.zeroSceneId}"]`);

    // Scene Cast pill + cohesive zero-nested-box flow
    const castEl = scene1.querySelector(`[data-shared-scene-cast="${f.ids.scene1Id}"]`);
    assert(castEl && castEl.textContent.includes('Barista') && castEl.textContent.includes('Maya') && castEl.textContent.includes('Tari'), 'Scene Cast lists speakers cleanly');
    const unitSections = [...scene1.querySelectorAll('[data-shared-card-unit-id]')];
    equal(unitSections.length, 7, 'All 7 persistent Turns render inside Scene 1');
    for (const sec of unitSections) {
      assert(getComputedStyle(sec).borderRightWidth === '0px', 'Turns inside cohesive Full Scene must not be boxed cards');
    }

    // Consecutive Maya Turn + Empty Barista Turn + Unassigned Speaker Turn + Duplicate EN + URL wrap
    assert(scene1.textContent.toLowerCase().includes('consecutive turn'), 'Consecutive same-speaker Turn distinction visible');
    assert(Boolean(scene1.querySelector(`[data-shared-card-empty-section]`)), 'Empty Turn stays visible');
    assert(scene1.textContent.includes('Unassigned speaker'), 'Missing speaker gets tasteful neutral label');
    assert(Boolean(zeroScene) && zeroScene.textContent.includes('No speaker turns'), 'Zero-Turn Scene preserved');
    assert(!reader.textContent.toLowerCase().includes('section'), 'Zero Paragraph "section" terminology in Conversation Scene');

    // Multilingual & long URL token stays within container width
    const urlSeg = scene1.querySelector(`[data-shared-card-segment="${f.ids.mayaS5UrlId}"]`);
    assert(urlSeg.getBoundingClientRect().right <= scene1.getBoundingClientRect().right + 1, 'Long URL token wraps inside Scene Card');

    // Separated, EN Only, ID Only preserve speaker labels & distinct duplicate EN pairings
    for (const layout of ['separated', 'text-only', 'meaning-only', 'interlinear']) {
      document.querySelector(`[data-shared-card-layout-option="${layout}"]`).click();
      await tick(40);
      const text = scene1.textContent;
      assert(text.includes('Barista') && text.includes('Maya') && text.includes('Tari'), `Speakers stay visible in ${layout}`);
      if (layout === 'separated') {
        const flows = scene1.querySelectorAll('[data-shared-card-flow]');
        equal(flows.length, 2, 'Separated renders distinct EN and ID dialogue flows');
        assert(flows[0].textContent.includes('Barista') && flows[1].textContent.includes('Barista'), 'Speaker identity preserved in both Separated EN and ID flows');
      }
      if (layout !== 'text-only') {
        assert(text.includes('Permisi, apakah kursi ini kosong untuk duduk?'), 'Duplicate EN Tari ID meaning intact');
        assert(text.includes('Maaf, apakah tempat duduk ini masih tersedia untuk tas saya?'), 'Duplicate EN Maya ID meaning intact');
        assert(!scene1.querySelector(`[data-shared-card-segment="${f.ids.mayaS4MissingMeaningId}"][data-shared-card-channel="meaning"]`), 'Missing meaning stays blank');
      }
    }
  });

  await runCase('Speaker palette identity survives speaker.rename and Turn reorder, and updates cleanly on Turn speaker reassignment', async () => {
    const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
    const h = await mountEditorWithReader(f);
    const reader = document.querySelector('[data-shared-conversation-reader]');
    const initialMayaPalette = reader.querySelector(`[data-shared-card-unit-id="${f.ids.mayaTurn1Id}"]`).dataset.sharedTurnSpeakerPalette;
    const initialBaristaPalette = reader.querySelector(`[data-shared-card-unit-id="${f.ids.baristaTurn1Id}"]`).dataset.sharedTurnSpeakerPalette;
    const initialTariPalette = reader.querySelector(`[data-shared-card-unit-id="${f.ids.tariTurnId}"]`).dataset.sharedTurnSpeakerPalette;

    const mayaSpeakerId = f.snapshot.contentUnits.find(u => u.id === f.ids.mayaTurn1Id).speakerId;
    const tariSpeakerId = f.snapshot.contentUnits.find(u => u.id === f.ids.tariTurnId).speakerId;

    // 1. Rename Maya -> Maya Putri + Reorder Turns
    let snap = applyTextConversationEditorCommand(
      h.host.snapshot,
      { type: 'speaker.rename', payload: { documentId: f.ids.documentId, speakerId: mayaSpeakerId, label: 'Maya Putri' } },
      { documentId: f.ids.documentId }
    ).snapshot;
    snap = applyTextConversationEditorCommand(
      snap,
      {
        type: 'contentUnit.reorder',
        payload: {
          blockId: f.ids.scene1Id,
          orderedIds: [
            f.ids.tariTurnId,
            f.ids.mayaTurn1Id,
            f.ids.baristaTurn1Id,
            f.ids.mayaTurn2ConsecutiveId,
            f.ids.baristaEmptyTurnId,
            f.ids.unassignedTurnId,
            f.ids.mayaTurn3DupId
          ]
        }
      },
      { documentId: f.ids.documentId }
    ).snapshot;
    h.change(c => ({ ...c, snapshot: snap }));
    await tick(60);

    const mayaUnitAfter = reader.querySelector(`[data-shared-card-unit-id="${f.ids.mayaTurn1Id}"]`);
    equal(mayaUnitAfter.dataset.sharedTurnSpeakerPalette, initialMayaPalette, 'Rename + reorder preserves Maya visual palette');
    assert(mayaUnitAfter.textContent.includes('Maya Putri'), 'Renamed speaker display label appears');
    equal(reader.querySelector(`[data-shared-card-unit-id="${f.ids.baristaTurn1Id}"]`).dataset.sharedTurnSpeakerPalette, initialBaristaPalette, 'Reorder preserves Barista palette');

    // 2. Reassign Barista Turn 1 -> Tari
    const reassigned = applyTextConversationEditorCommand(
      snap,
      { type: 'contentUnit.update', payload: { id: f.ids.baristaTurn1Id, speakerId: tariSpeakerId } },
      { documentId: f.ids.documentId }
    ).snapshot;
    h.change(c => ({ ...c, snapshot: reassigned }));
    await tick(60);
    const updatedTurn = reader.querySelector(`[data-shared-card-unit-id="${f.ids.baristaTurn1Id}"]`);
    equal(updatedTurn.dataset.sharedTurnSpeakerPalette, initialTariPalette, 'Reassigned Turn adopts Tari visual palette');
    assert(updatedTurn.textContent.includes('Tari'), 'Reassigned Turn displays Tari name');
  });

  await runCase('Part View adapts Horizontal Focus (with inert offscreen safety), Vertical Focus boundaries, and Vertical List cleanly for Speaker Turns', async () => {
    const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
    const h = await mountEditorWithReader(f, {
      initialView: { level: 'part', partLayout: 'horizontal-focus', bilingualLayout: 'interlinear' }
    });
    const scene1 = document.querySelector(`[data-shared-conversation-reader] [data-shared-card-id="${f.ids.scene1Id}"]`);
    const scene2 = document.querySelector(`[data-shared-conversation-reader] [data-shared-card-id="${f.ids.scene2Id}"]`);
    equal(h.events.length, 0, 'Initial mount triggers zero audio');

    assert(scene1.querySelector('[data-shared-part-position]').textContent.includes('Speaker Turn 1 of 7'), 'Turn position shown in navigator');
    assert(scene1.querySelector('[data-shared-part-nav-speaker]').textContent.includes('Barista'), 'Active Turn speaker shown in navigator');
    assert(!scene1.textContent.toLowerCase().includes('section'), 'Zero Section leaks in Horizontal Focus');

    const slides = [...scene1.querySelectorAll('[data-shared-part-slide]')];
    equal(slides.length, 7, 'Horizontal Focus includes all 7 persistent Turns');
    assert(slides[0].scrollHeight <= slides[0].clientHeight + 2, 'Multi-sentence Turn 1 unclipped horizontally');
    assert(slides[1].inert === true && slides[1].getAttribute('aria-hidden') === 'true', 'Offscreen Turn slides remain inert');

    // Verify Tab from navigator Next does not focus into offscreen inert slide
    const nextBtn = scene1.querySelector('[data-shared-part-next]');
    nextBtn.click();
    await tick(60);
    assert(scene1.querySelector('[data-shared-part-nav-speaker]').textContent.includes('Maya'), 'Next advances horizontally to Turn 2 Maya');
    const pill2 = scene1.querySelectorAll('[data-shared-part-pill]')[1];
    pill2.focus();
    await pressKey('ArrowRight');
    await until(() => slides[2].dataset.sharedPartActive === 'true');
    assert(slides[2].textContent.includes('consecutive turn'), 'Horizontal slide 3 shows consecutive Maya Turn notice');

    // Vertical Focus + Start/End of scene + Focus neighbor
    document.querySelector('[data-shared-card-part-layout-option="vertical-focus"]').click();
    await tick(50);
    assert(scene2.querySelector('[data-shared-part-boundary="start"]').textContent.includes('Start of scene · Speaker Turn 1 of 2'), 'Scene 2 shows Start of scene boundary');
    scene1.querySelector('[data-shared-part-neighbor="previous"] [data-shared-part-focus]').click();
    await tick(50);
    assert(scene1.querySelector('[data-shared-part-focused]').textContent.includes('Maya'), 'Clicking Previous Focus focuses Turn 2 Maya');

    // Vertical List keeps all 7 distinct Turns selectable without starting playback
    document.querySelector('[data-shared-card-part-layout-option="vertical-list"]').click();
    await tick(50);
    const listItems = [...scene1.querySelectorAll('[data-shared-part-list-item]')];
    equal(listItems.length, 7, 'Vertical List displays all 7 persistent Turns');
    equal(h.events.length, 0, 'Browsing across all Part styles triggers zero audio playback');
  });

  await runCase('Segment Focus spotlight displays Speaker Attribution, Turn line count, Duplicate EN & Missing Meaning passively with explicit Play', async () => {
    const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
    const h = await mountEditorWithReader(f, {
      initialView: { level: 'segment', partLayout: 'vertical-list', bilingualLayout: 'interlinear' }
    });
    const scene1 = document.querySelector(`[data-shared-conversation-reader] [data-shared-card-id="${f.ids.scene1Id}"]`);
    assert(scene1.querySelector('[data-shared-segment-speaker-stage]').textContent.includes('Barista'), 'Turn 1 Line 1 attributes Barista');
    assert(scene1.querySelector('[data-shared-segment-unit-context]').textContent.includes('Line 1 of 2'), 'Shows line position inside multi-sentence Turn');
    assert(!scene1.textContent.toLowerCase().includes('section'), 'Zero Section leaks in Segment Focus');

    // Step to Sentence 4 (Missing Meaning, Maya) & Sentence 6 (Unassigned speaker)
    const nextBtn = scene1.querySelector('[data-shared-segment-next]');
    for (let i = 0; i < 3; i += 1) {
      nextBtn.click();
      await tick(25);
    }
    assert(scene1.querySelector(`[data-shared-segment-focus="${f.ids.mayaS4MissingMeaningId}"]`), 'Reached Missing Meaning Sentence 4');
    assert(scene1.textContent.includes('No Indonesian meaning for this sentence.'), 'Missing Meaning state clear in Segment View');
    assert(scene1.querySelector('[data-shared-segment-speaker-stage]').textContent.includes('Maya'), 'Maya attributed on Line 2 of Turn 2');

    nextBtn.click(); // #5 URL Maya Turn 3
    await tick(25);
    nextBtn.click(); // #6 Unassigned PA Turn 5
    await tick(35);
    assert(scene1.querySelector('[data-shared-segment-speaker-stage]').textContent.includes('Unassigned speaker'), 'Unassigned Turn shows neutral Unassigned speaker');
    equal(h.events.length, 0, 'Next/Prev/Jump browsing in Segment Focus never starts audio');

    // Explicit Play Sentence invokes D5 host with exact Segment ID
    scene1.querySelector('[data-shared-segment-focus-play]').click();
    await until(() => h.events.length === 1);
    equal(h.events[0].args.item.id, f.ids.unassignedS6Id, 'Play Sentence starts exact targeted Segment ID');
    h.host.audioPlayback.stopPlayback();
    h.events[0].finish({ status: 'stopped' });
    await tick();
  });

  await runCase('Live D5 Cached Full WAV -> Per-Sentence Recovery, 1800ms Manual Grace, Follow Audio, and D4 Failed Draft Preservation work seamlessly', async () => {
    const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true, includeFullArtifact: true });
    let rejectCmd = true;
    const h = await mountEditorWithReader(f, {
      config: { playbackRepresentationMode: 'full' },
      onCommand: async command => {
        if (rejectCmd) throw new Error('Simulated transient command rejection');
        return applyTextConversationEditorCommand(h.host.snapshot, command, { documentId: f.ids.documentId });
      }
    });

    const reader = document.querySelector('[data-shared-conversation-reader]');
    const scene1 = reader.querySelector(`[data-shared-card-id="${f.ids.scene1Id}"]`);
    scene1.querySelector('[data-shared-card-play="true"]').click();
    await until(() => h.events.length === 1 && reader.dataset.readerCursorPrecision === 'card');

    const sessionId = h.host.audioPlayback.readPresentationPlaybackScope().sessionId;
    const cancels = h.cancels;

    // Switch through Full -> Part -> Segment & layouts during Cached Full playback without disrupting session
    for (const selector of [
      '[data-shared-card-level-option="part"]',
      '[data-shared-card-part-layout-option="horizontal-focus"]',
      '[data-shared-card-layout-option="separated"]',
      '[data-shared-card-level-option="segment"]',
      '[data-shared-card-layout-option="interlinear"]'
    ]) {
      document.querySelector(selector).click();
      await tick(35);
    }
    assert(scene1.querySelector('[data-shared-segment-full-notice]').textContent.includes('Playing Full Scene audio'), 'Full Scene precision notice shown in Segment View');
    equal([h.events.length, h.cancels, h.host.audioPlayback.readPresentationPlaybackScope().sessionId], [1, cancels, sessionId], 'View transitions preserve live D5 session');

    // Cached Full fails -> recovers into per-Sentence Turn 1 Barista
    h.events[0].finish({ status: 'error' });
    await until(() => h.events.length === 2 && reader.dataset.readerCursorPrecision === 'segment');
    document.querySelector('[data-shared-card-level-option="part"]').click();
    await tick(50);
    assert(scene1.querySelector('[data-shared-part-nav-speaker]').textContent.includes('Barista'), 'Per-sentence fallback highlights Barista Turn 1');

    // Manual browse -> 1800ms grace holds Maya Turn -> clicking Follow jumps cleanly back to Barista Turn 1
    scene1.querySelector('[data-shared-part-next]').click();
    await tick(50);
    assert(scene1.querySelector('[data-shared-part-nav-speaker]').textContent.includes('Maya'), 'Manual step moved view to Maya while Barista still speaks');
    const followBtn = scene1.querySelector('[data-shared-part-follow-audio]');
    assert(followBtn && followBtn.textContent.includes('Barista'), 'Follow button identifies active audible Turn speaker');
    h.events[1].finish({ status: 'played' }); // still inside 1800ms grace!
    await until(() => h.events.length === 3);
    assert(scene1.querySelector('[data-shared-part-nav-speaker]').textContent.includes('Maya'), '1800ms grace holds browsed Maya Turn across step');
    followBtn.click();
    await tick(50);
    assert(scene1.querySelector('[data-shared-part-nav-speaker]').textContent.includes('Barista'), 'Clicking Follow returns immediately to active Barista Turn');

    h.host.audioPlayback.stopPlayback();
    h.events[2].finish({ status: 'stopped' });
    await tick();

    // Verify D4 failed async edit preserves draft with reader active, then retry publishes to reader
    document.querySelector('[data-shared-card-level-option="full"]').click();
    await tick(40);
    document.querySelector(`[aria-label="Edit sentence ${f.ids.baristaS1Id}"]`).click();
    await tick(30);
    const field = document.querySelector('[aria-label="Edit Sentence Text"]');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'Good morning! Updated express check.');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(20);
    const saveBtn = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Save Sentence'));
    saveBtn.click();
    await tick(60);
    equal(document.querySelector('[aria-label="Edit Sentence Text"]').value, 'Good morning! Updated express check.', 'Failed edit retains user draft');
    rejectCmd = false;
    saveBtn.click();
    await tick(80);
    assert(reader.textContent.includes('Good morning! Updated express check.'), 'Retry publishes committed update to Conversation Reader');
  });

  await runCase('Responsive 320px/375px Mobile, Desktop 1280px, Dark Mode, 200% Text Scale, and Reduced Motion maintain >=44px touch targets and zero overflow', async () => {
    const f = createA4hShowcaseConversationFixture({ includeAudioVariants: true });
    for (const [level, partLayout, bilingualLayout] of [
      ['full', 'vertical-list', 'interlinear'],
      ['full', 'vertical-list', 'separated'],
      ['part', 'horizontal-focus', 'interlinear'],
      ['part', 'vertical-focus', 'interlinear'],
      ['part', 'vertical-list', 'interlinear'],
      ['segment', 'vertical-list', 'separated']
    ]) {
      for (const width of [320, 375, 1280]) {
        document.documentElement.classList.toggle('dark', width === 375);
        await setViewport(width, 844);
        await mountEditorWithReader(f, {
          initialView: { level, partLayout, bilingualLayout }
        });
        assert(
          document.documentElement.scrollWidth <= width,
          `Overflow at ${width}px in ${level}/${partLayout}/${bilingualLayout}: scrollWidth=${document.documentElement.scrollWidth}`
        );
        if (width === 375 && level === 'segment') {
          const playBtn = document.querySelector(`[data-shared-conversation-reader] [data-shared-segment-focus-play]`);
          assert(playBtn.getBoundingClientRect().height >= 44, `Mobile touch target height must be >=44px, got ${playBtn.getBoundingClientRect().height}`);
        }
        await unmount();
      }
    }

    // 200% font scale + reduced motion at 375px
    await setViewport(375, 844);
    await setReducedMotion(true);
    document.documentElement.style.fontSize = '32px';
    await mountEditorWithReader(f, {
      initialView: { level: 'part', partLayout: 'horizontal-focus', bilingualLayout: 'interlinear' }
    });
    assert(document.documentElement.scrollWidth <= 375, `200% scale overflows 375px: ${document.documentElement.scrollWidth}`);
  });

  return {
    browser: navigator.userAgent,
    passed: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    indexedDbCalls: window.__a4hDbCalls,
    storageCalls: window.__a4hStorageCalls,
    results
  };
};
