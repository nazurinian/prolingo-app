import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const name = 'prolingo_text_library_d3b_qa_a2_hf1_browser';
export const readerRefinementLibraries = {
  [name]: 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex')
};
const q = JSON.stringify;
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const reader = prop => `window.__bookQaProps('[data-text-structured-player]', ${q(prop)}, true).${prop}`;
const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const body = '[data-book-body-audio]';
const bodyStatus = 'document.querySelector("[data-book-body-audio-status]")?.textContent';

export async function checkBookQaReaderRefinement({ mode, evaluate, navigate, waitFor, chooseOptIn, clickButton, uatOrigin, call, bodyRequests }) {
  const baseline = mode === 'baseline';
  const result = { mode, observations: {}, checks: [] };
  const record = label => { result.checks.push(label); console.log('PASS', label); };
  const click = selector => evaluate(`document.querySelector(${q(selector)}).click()`);
  const control = label => click(`[data-global-player] button[aria-label="${label}"]`);
  const change = (selector, value) => evaluate(`(() => {
    const field = document.querySelector(${q(selector)});
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value');
    setter.set.call(field, ${q(value)});
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    if (field.value !== ${q(String(value))}) throw Error('Unavailable choice at ' + ${q(selector)} + ': ' + ${q(value)});
  })()`);
  const current = () => evaluate(`${player}.nowPlaying`);
  const waitAudible = (segment, channel = 'text') => waitFor(`${player}.transport.phase === 'playing'
    && ${player}.nowPlaying.segment?.id === ${q(segment.id)} && ${player}.nowPlaying.channel === ${q(channel)}`);
  const stop = async () => { await control('Stop playback'); await waitFor(`${player}.nowPlaying.state === 'idle'`); };
  const spoken = () => evaluate('speechSynthesis.finish()');
  const selectWorkspace = async target => {
    await change('[data-app-header] select', target.id);
    await waitFor(`${host}.session.getState().view.selection.workspaceId === ${q(target.id)}`);
  };
  const openBody = async () => {
    if (!(await evaluate(`document.querySelector('${body}').open`))) await click(body + ' summary');
    await waitFor(`document.querySelector('${body} select')`);
  };
  const saveVoice = async ({ browser, edge, kind, speaker, channel = 'text' }) => {
    await openBody();
    await change(body + ' select', channel);
    if (kind) await change(body + ' select:has(option[value="paragraph"])', kind);
    if (speaker) await change(body + ' select:has(option[value=' + q(speaker) + '])', speaker);
    if (browser) await change(body + ' [name=browserVoice]', browser);
    if (edge) await change(body + ' [name=edgeVoice]', edge);
    await clickButton('Save Workspace profile');
    try { await waitFor(`${bodyStatus}?.includes('saved')`, 5000); }
    catch (error) { throw new Error('Voice save result: ' + await evaluate(bodyStatus), { cause: error }); }
  };
  const run = async (label, wanted) => {
    await clickButton(label);
    await waitFor(`${bodyStatus}?.includes(${q(wanted)})`);
  };
  const playFrom = segment => evaluate(`${reader('onStartFromSegment')}(${q(segment.id)})`);
  const playOne = (segment, channel = 'text') => evaluate(`${reader('onPlaySegment')}(${q(segment.id)}, ${q(channel)})`);
  const toolbar = '[data-shared-card-bilingual-toolbar]';
  const modeButton = mode => `[data-shared-reader-mode-option="${mode}"]`;
  const selectMode = async mode => {
    await click(modeButton(mode));
    await waitFor(`document.querySelector('${toolbar}')?.dataset.sharedReaderMode === ${q(mode)}`);
  };
  const measureToolbar = async () => {
    if (await evaluate(`Boolean(document.querySelector('[aria-label="Expand sidebar"]'))`)) await click('[aria-label="Expand sidebar"]');
    await selectMode('focus');
    const measurements = [];
    for (const width of [1440, 1280, 1180, 980, 768, 390]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await waitFor(`innerWidth === ${width}`);
      if (width === 390) {
        await waitFor(`document.querySelector('[data-mobile-workspace-toolbar]')`);
        await click('[data-mobile-workspace-toolbar] [data-shared-reading-settings-toggle]');
      }
      const measurement = await evaluate(`(() => {
        const root = document.querySelector(${q(width === 390 ? '[role="dialog"][aria-modal="true"]' : toolbar)}) || document;
        const buttons = [...root.querySelectorAll('[data-shared-reader-mode-option], [data-shared-reading-language-option], [data-shared-focus-orientation-option], [data-shared-reading-settings-toggle]')].filter(item => item.getClientRects().length);
        const rects = buttons.map(item => item.getBoundingClientRect());
        const limits = root.getBoundingClientRect?.() || { left: 0, right: innerWidth };
        return { width: innerWidth, visible: rects.length, sidebarExpanded: !!document.querySelector('[aria-label="Collapse sidebar"]'),
          overlap: rects.some((a, index) => rects.slice(index + 1)
            .some(b => Math.min(a.right,b.right)-Math.max(a.left,b.left) > 1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top) > 1)),
          clipped: rects.some(rect => rect.left < Math.max(0, limits.left) - 1 || rect.right > Math.min(innerWidth, limits.right) + 1) };
      })()`);
      measurements.push(measurement);
      if (!baseline) {
        assert(measurement.visible >= 10, JSON.stringify(measurement));
        assert.equal(measurement.overlap || measurement.clipped, false, JSON.stringify(measurement));
      }
    }
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false });
    return measurements;
  };
  const adjustPlayback = async ({ representation = 'Split', bilingual = true, delay = '0 ms' } = {}) => {
    await control('Expand player details');
    await waitFor(`document.querySelector('[data-player-open-text-settings]')`);
    await click('[data-player-open-text-settings]');
    const choice = (scope, match) => evaluate(`(() => {
      const button = [...document.querySelectorAll(${q(scope + ' button')})].find(item => item.textContent.trim().includes(${q(match)}));
      if (!button) throw Error('Missing setting ' + ${q(match)});
      button.click();
    })()`);
    await waitFor(`document.querySelector('[data-text-choice-group="representation"]')`);
    await choice('[data-text-choice-group="representation"]', representation);
    if (bilingual) await choice('[data-text-choice-group="global-language-order"]', 'EN → ID');
    if (delay !== '0 ms') await choice('[data-text-choice-group="Pause between EN / ID"]', delay);
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    if (await evaluate(`Boolean(document.querySelector('[aria-label="Collapse player details"]'))`)) await control('Collapse player details');
  };

  await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
  await waitFor(`location.search.includes(${q(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
  await chooseOptIn();
  await clickButton('Initialize A2 demo library');
  await waitFor(`document.querySelector('${body}')`);
  await click('[data-text-main-reader-option="shared"]');
  await waitFor(`document.querySelector('[data-text-main-reader="shared"] ${toolbar}')`);
  const documents = await evaluate(`(() => {
    const snapshot = ${host}.session.getSnapshot();
    const ordered = rows => [...rows].sort((a, b) => a.order - b.order);
    return snapshot.documents.slice(0, 3).map(({ id, uid, documentType }) => ({
      id, uid, documentType,
      cards: ordered(snapshot.blocks.filter(card => card.documentId === id)).map(card => ({
        id: card.id, type: card.blockType,
        segments: ordered(snapshot.segments.filter(row => row.blockId === card.id)).map(({ id, text, meaning, unitId }) => ({
          id, text, meaning, unitId, speaker: snapshot.contentUnits.find(unit => unit.id === unitId)?.speakerId
        }))
      }))
    }));
  })()`);
  const [mixed, paragraph, conversation] = documents;
  const [p1] = paragraph.cards;
  const [c1] = conversation.cards;
  const maya = c1.segments[0];
  const ari = c1.segments[2];
  const [sentence, second] = p1.segments;
  await selectWorkspace(paragraph);
  if (mode === 'native') {
    await waitFor(`speechSynthesis.getVoices().length > 0`, 10000).catch(() => {});
    const catalog = await evaluate(`speechSynthesis.getVoices().map(({ name, lang, localService }) => ({ name, lang, localService }))`);
    const [narratorVoice, speakerVoice] = catalog.filter(voice => voice.localService && voice.lang.startsWith('en'));
    result.observations.nativeCatalog = { total: catalog.length, localEnglish: catalog.filter(voice => voice.localService && voice.lang.startsWith('en')).length,
      localIndonesian: catalog.filter(voice => voice.localService && voice.lang.startsWith('id')).length };
    if (!speakerVoice) return result;
    const pairs = [[paragraph, sentence, narratorVoice], [conversation, maya, speakerVoice, maya.speaker],
      [mixed, mixed.cards[0].segments[0], narratorVoice, null, 'paragraph'],
      [mixed, mixed.cards[1].segments[0], speakerVoice, mixed.cards[1].segments[0].speaker, 'conversation']];
    for (const [workspace, target, voice, speaker, kind] of pairs) {
      await selectWorkspace(workspace);
      const count = await evaluate('window.__bookQaSpeech.length');
      await saveVoice({ browser: voice.name, speaker, kind });
      await playOne(target);
      await waitFor(`window.__bookQaSpeech.slice(${count}).some(event => ['end', 'error'].includes(event[0]) && event[1] === ${q(target.text)})`);
    }
    result.observations.speechEvents = await evaluate('window.__bookQaSpeech');
    const started = result.observations.speechEvents.filter(event => event[0] === 'start');
    assert.deepEqual(started.map(event => event[2]), pairs.map(([, , voice]) => voice.name));
    assert.equal(result.observations.speechEvents.filter(event => event[0] === 'end').length, pairs.length);
    record('Native Browser TTS starts and ends distinct installed Narrator and Speaker voices in all workspace types');
    return result;
  }

  await adjustPlayback({ delay: '0.5s' });
  await playFrom(sentence);
  await waitAudible(sentence);
  const gap = await evaluate(`(async () => {
    const before = ${player}.nowPlaying;
    const begin = performance.now();
    speechSynthesis.finish();
    const frames = [];
    while (performance.now() - begin < 1200) {
      await new Promise(requestAnimationFrame);
      const { nowPlaying, transport, media } = ${player};
      frames.push({ phase: transport.phase, target: nowPlaying.segment?.id, voice: nowPlaying.voice,
        highlight: !!document.querySelector('[data-text-player-segment-active=true]'), hasMedia: !!media,
        loading: !!document.querySelector('[data-player-status] .animate-spin'),
        sessionId: nowPlaying.sessionId });
      if (nowPlaying.channel === 'meaning') break;
    }
    const silent = frames.filter(frame => frame.phase === 'waiting');
    return { from: before.segment.id, to: ${player}.nowPlaying.segment?.id,
      elapsedMs: +(window.__bookQaSpeech.at(-1)[3] - begin).toFixed(1), silentFrames: silent.length,
      withTarget: silent.filter(frame => frame.target === before.segment.id).length,
      withHighlight: silent.filter(frame => frame.highlight).length,
      withVoice: silent.filter(frame => !!frame.voice).length,
      withTimeline: silent.filter(frame => frame.hasMedia).length,
      withLoadingGlyph: silent.filter(frame => frame.loading).length,
      sessionIds: [...new Set(frames.map(frame => frame.sessionId))] };
  })()`);
  result.observations.configuredBrowserGap = gap;
  assert(gap.silentFrames > 0);
  assert.equal(gap.withTarget, baseline ? 0 : gap.silentFrames);
  if (!baseline) assert.equal(gap.withHighlight, gap.silentFrames);
  if (!baseline) assert.equal(gap.withLoadingGlyph, 0);
  assert.equal(gap.withTimeline, 0);
  assert.equal(gap.sessionIds.length, 1);
  await waitAudible(sentence, 'meaning');
  await stop();
  record('Configured EN to ID gap measured through actual Reader and Global Player');

  await openBody();
  await run('Generate Card Split', '4 committed');
  await run('Verify Card audio', '4 ready');
  await evaluate(`(() => {
    const audio = ${host}.audio;
    const read = audio.readRuntime;
    window.__hf1Reads = [];
    audio.readRuntime = async (...args) => {
      const start = performance.now();
      try { return await read(...args); }
      finally { window.__hf1Reads.push({ segmentId: args[0].target.segmentId, start, end: performance.now() }); }
    };
    window.__hf1Media = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.startsWith('blob:')) {
        const attempt = { called: performance.now(), started: null };
        window.__hf1Media.push(attempt);
        this.addEventListener('playing', () => { attempt.started = performance.now(); }, { once: true });
      }
      return play.apply(this, args);
    };
  })()`);
  await playFrom(sentence);
  await waitAudible(sentence);
  assert.equal((await current()).voice, 'en-GB-SoniaNeural');
  const local = await evaluate(`(async () => {
    const old = ${player}.media;
    if (!old) throw Error('Expected native HTMLAudioElement');
    await new Promise(resolve => old.addEventListener('ended', resolve, { once: true }));
    const start = performance.now();
    while (performance.now() - start < 2000) {
      await new Promise(requestAnimationFrame);
      const step = ${player}.nowPlaying;
      if (step.channel === 'meaning' && ${player}.transport.phase === 'playing') {
        speechSynthesis.finish();
        break;
      }
    }
    const endText = performance.now();
    while (performance.now() - endText < 2000) {
      await new Promise(requestAnimationFrame);
      if (${player}.media && ${player}.media !== old) return {
        nextStartMs: +(performance.now() - endText).toFixed(1), allSourcesGapMs: +(performance.now() - start).toFixed(1),
        voice: ${player}.nowPlaying.voice, precision: ${player}.nowPlaying.precision,
        duration: ${player}.media.duration, via: ${player}.media.currentSrc.split(':')[0],
        mediaStartupMs: window.__hf1Media.filter(row => row.started !== null).map(row => +(row.started - row.called).toFixed(1)),
        verification: window.__hf1Reads.map(row => ({ segmentId: row.segmentId, verifiedMs: +(row.end - row.start).toFixed(1),
          startedBeforePreviousCompletion: row.start < endText && row.segmentId === ${q(second.id)} })) };
    }
    throw Error('Next recorded step never started');
  })()`);
  result.observations.recordedTransition = local;
  assert.equal(local.via, 'blob');
  assert.equal(local.voice, 'en-GB-SoniaNeural');
  await stop();
  if (!baseline) {
    assert(local.verification.some(row => row.segmentId === second.id && row.startedBeforePreviousCompletion));
    await run('Generate Workspace Split', '2 committed, 4 already available');
    await run('Verify Workspace audio', '6 ready');
  }
  if (baseline) {
    result.observations.toolbar = await measureToolbar();
    return result;
  }

  await saveVoice({ browser: 'Fixture EN' });
  await selectWorkspace(conversation);
  await saveVoice({ browser: 'Fixture Speaker EN', speaker: maya.speaker });
  await saveVoice({ browser: 'Fixture EN', speaker: ari.speaker });
  await playOne(maya);
  await waitAudible(maya);
  assert.equal((await current()).voice, 'Fixture Speaker EN');
  await stop();
  await playOne(ari);
  await waitAudible(ari);
  assert.equal((await current()).voice, 'Fixture EN');
  await stop();
  const unavailable = 'HF1 saved voice absent from the catalog';
  const savedFallback = await evaluate(`${host}.session.dispatch({ type: 'document.update', payload: { id: ${q(conversation.id)},
    bodyAudioProfile: { workspaceUid: ${q(conversation.uid)}, kind: 'conversation', channel: 'text', speakerId: ${q(ari.speaker)},
      values: { browserVoice: ${q(unavailable)} } } } })`);
  assert(savedFallback.ok);
  await waitFor(`document.querySelector('${body} [name=browserVoice] option:checked')?.textContent.includes('saved, unavailable')`);
  await playOne(ari);
  await waitAudible(ari);
  const fallback = await current();
  assert.equal(fallback.source, 'tts');
  assert(fallback.fallbackReason.includes(unavailable), q(fallback));
  result.observations.missingVoice = { actual: fallback.voice, reason: fallback.fallbackReason };
  await stop();
  await run('Generate Card Split', '4 committed');
  await run('Compose Scene Full', '1 committed');
  const expectedRoutes = bodyRequests.slice(-4).map(({ voice }) => voice);
  assert.notEqual(expectedRoutes[0], expectedRoutes[2]);
  const heard = [];
  for (const segment of [maya, ari]) {
    await playOne(segment);
    await waitAudible(segment);
    const { speaker, source, voice } = await current();
    assert.equal(source, 'generated');
    assert.equal(voice, expectedRoutes[segment === maya ? 0 : 2]);
    const digest = await evaluate(`(async () => {
      const bytes = await (await fetch(${player}.media.currentSrc)).arrayBuffer();
      const hex = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hex), byte => byte.toString(16).padStart(2, '0')).join('');
    })()`);
    heard.push({ speaker: speaker.name, voice, source, digest });
    await stop();
  }
  result.observations.recordedSpeakers = heard;
  assert.notEqual(heard[0].digest, heard[1].digest);
  record('Browser catalog choices and scoped recorded Edge profiles resolve independently per Speaker');

  const renderRate = async rate => {
    await change(body + ' [name=rate]', rate);
    await clickButton('Set session audio defaults');
  };
  await renderRate(14);
  const beforeCancel = await evaluate(`${host}.session.getSnapshot().audioVariants.length`);
  await clickButton('Generate Sentence');
  await waitFor(`[...document.querySelectorAll('${body} button')].some(button => button.textContent === 'Cancel')`);
  await clickButton('Cancel');
  await waitFor(`${bodyStatus}?.includes('AUDIO_CANCELLED')`);
  assert.equal(await evaluate(`${host}.session.getSnapshot().audioVariants.length`), beforeCancel);
  await renderRate(16);
  await run('Generate Sentence', 'start npm run server');
  result.observations.providerError = await evaluate(bodyStatus);
  await renderRate(0);
  record('Explicit generation can be cancelled and provider errors give the local startup command');

  await click(body + ' a[href="#book-qa-zip"]');
  await waitFor(`document.querySelector('#book-qa-zip[open] button')`);
  await evaluate(`window.__hf1Downloads = []; document.addEventListener('click', event => {
    if (event.target instanceof HTMLAnchorElement && event.target.download) window.__hf1Downloads.push(event.target.download);
  });`);
  await clickButton('Export Portable Audio');
  await waitFor(`document.querySelector('[data-book-portable-status]')?.textContent.includes('verified assets')`);
  await clickButton('Export Normal Audio');
  await waitFor(`document.querySelector('[data-book-portable-status]')?.textContent.includes('listening occurrences')`);
  result.observations.downloads = await evaluate('window.__hf1Downloads');
  record('Reader shell generation, coverage verification, Full composition and both ZIP exports');

  await selectWorkspace(paragraph);
  await playFrom(sentence);
  await waitAudible(sentence);
  const session = (await current()).sessionId;
  await control('Next sentence');
  await waitAudible(second);
  await control('Pause playback');
  await waitFor(`${player}.nowPlaying.state === 'paused'`);
  assert.equal((await current()).sessionId, session);
  await control('Previous sentence');
  await waitFor(`${player}.transport.phase === 'paused'`);
  await control('Resume playback');
  await waitAudible(sentence);
  assert.equal((await current()).sessionId, session);
  await stop();
  record('Next, Previous, Pause, and Resume retain the Book presentation session');

  result.observations.authoredTraversal = {};
  for (const workspace of [paragraph, conversation, mixed]) {
    await selectWorkspace(workspace);
    await openBody();
    await change(body + ' [name=source]', 'tts-only');
    await clickButton('Set session audio defaults');
    const [firstCard, nextCard] = workspace.cards;
    const unitBoundary = firstCard.segments.findIndex((row, index) => index > 0 && row.unitId !== firstCard.segments[index - 1].unitId);
    if (unitBoundary > 0) {
      const beforeUnit = firstCard.segments[unitBoundary - 1];
      await playFrom(beforeUnit);
      await waitAudible(beforeUnit);
      const owner = (await current()).sessionId;
      await spoken();
      if (beforeUnit.meaning) { await waitAudible(beforeUnit, 'meaning'); await spoken(); }
      await waitAudible(firstCard.segments[unitBoundary]);
      assert.equal((await current()).sessionId, owner);
      await stop();
    }
    const start = firstCard.segments.at(-1);
    await playFrom(start);
    await waitAudible(start);
    const from = await current();
    assert.equal(from.boundary, 'document');
    await evaluate('speechSynthesis.finish()');
    if (start.meaning) { await waitAudible(start, 'meaning'); await evaluate('speechSynthesis.finish()'); }
    await waitFor(`${player}.nowPlaying.card?.id === ${q(nextCard.id)} && ${player}.transport.phase === 'playing'`);
    while ((await current()).precision === 'heading') {
      const heading = (await current()).heading;
      await spoken();
      await waitFor(`${player}.transport.phase === 'playing' && ${player}.nowPlaying.heading?.id !== ${q(heading.id)}`);
    }
    await waitAudible(nextCard.segments[0]);
    assert.equal((await current()).sessionId, from.sessionId);
    result.observations.authoredTraversal[workspace.documentType] = { from: firstCard.type, to: nextCard.type, crossedUnits: unitBoundary > 0 };
    await stop();
  }
  record('Start From Here continues across authored Sections, Turns, and Cards in all workspace types');

  const setSource = async source => {
    await openBody();
    await change(body + ' [name=source]', source);
    await clickButton('Set session audio defaults');
  };
  await setSource('local-first');
  await adjustPlayback({ representation: 'Full' });
  await selectWorkspace(paragraph);
  await playFrom(sentence);
  await waitAudible(sentence);
  const paragraphFallback = await current();
  assert.equal(paragraphFallback.source, 'generated');
  assert.equal(paragraphFallback.representationFallback, true);
  await stop();
  await selectWorkspace(conversation);
  await playFrom(maya);
  await waitFor(`${player}.nowPlaying.precision === 'card' && ${player}.nowPlaying.source === 'full-artifact'`);
  const composed = await current();
  assert.equal(composed.unit, null);
  assert.equal(composed.segment, null);
  await evaluate(`${player}.media.currentTime = Math.max(0, ${player}.media.duration - 0.05)`);
  await waitAudible(maya, 'meaning');
  const conversationFallback = await current();
  assert.equal(conversationFallback.representationFallback, true);
  assert.equal(conversationFallback.source, 'tts');
  assert.equal(conversationFallback.sessionId, composed.sessionId);
  await stop();
  await selectWorkspace(mixed);
  const mixedSentence = mixed.cards[1].segments[0];
  await playFrom(mixedSentence);
  await waitAudible(mixedSentence);
  const mixedFallback = await current();
  assert.equal(mixedFallback.representationFallback, true);
  assert.equal(mixedFallback.source, 'tts');
  await spoken();
  await waitAudible(mixed.cards[1].segments[1]);
  assert.equal((await current()).sessionId, mixedFallback.sessionId);
  await stop();
  result.observations.full = [paragraphFallback, composed, conversationFallback, mixedFallback].map(
    ({ workspace, precision, actualRepresentation, source, representationFallback, channel }) => ({ workspace: workspace.title,
      precision, actualRepresentation, source, representationFallback, channel })
  );
  record('Paragraph, Conversation and Mixed Full fallback preserves actual source, precision and session');

  await adjustPlayback();
  await setSource('tts-only');

  await selectWorkspace(paragraph);
  await playFrom(sentence);
  await waitAudible(sentence);
  const duringGapId = (await current()).sessionId;
  await spoken();
  await waitFor(`${player}.transport.phase === 'waiting'`);
  await control('Pause playback');
  assert.equal((await current()).segment.id, sentence.id);
  assert.equal(await evaluate(`${player}.media`), null);
  await control('Resume playback');
  await waitAudible(sentence, 'meaning');
  assert.equal((await current()).sessionId, duringGapId);
  await stop();
  result.observations.toolbar = await measureToolbar();
  record('Focus controls fit with the Sidebar open on desktop and in the mobile settings');

  await waitFor(`!document.querySelector('[data-mobile-workspace-toolbar]')`);
  const settings = toolbar + ' [data-shared-reading-settings-toggle]';
  const setStyle = async style => {
    if (!(await evaluate(`document.querySelector(${q(settings)}).getAttribute('aria-expanded') === 'true'`))) await click(settings);
    await waitFor(`document.querySelector('[data-shared-bilingual-style-option="${style}"]')`);
    await click(`[data-shared-bilingual-style-option="${style}"]`);
    await waitFor(`document.querySelector('${toolbar}')?.dataset.sharedBilingualStyleEffective === ${q(style)}`);
    await click(settings);
  };
  await click(toolbar + ' [data-shared-reading-language-option="en-id"]');
  const pairing = async channel => {
    const other = channel === 'text' ? 'meaning' : 'text';
    const active = `[data-text-player-segment="${sentence.id}"][data-shared-card-channel="${channel}"][data-text-player-segment-active="true"]`;
    const paired = `[data-text-player-segment="${sentence.id}"][data-shared-card-channel="${other}"][data-shared-segment-paired="true"]`;
    await waitFor(`document.querySelector(${q(active)}) && document.querySelector(${q(paired)})`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector(${q(paired)})).textDecorationLine`), 'underline');
  };
  const modes = [];
  for (const view of ['full', 'card', 'focus', 'segment']) {
    await selectMode(view);
    await setStyle('notebook');
    await playFrom(sentence);
    await waitAudible(sentence);
    await pairing('text');
    await waitFor(`[...document.querySelectorAll('[data-shared-notebook-guides="on"] [data-shared-notebook-line], [data-shared-notebook-guides="on"] [data-shared-notebook-fallback-rows] [data-shared-interlinear-segment]')]
      .some(line => line.getClientRects().length && getComputedStyle(line).boxShadow !== 'none')`);
    await spoken();
    await waitAudible(sentence, 'meaning');
    await pairing('meaning');
    await stop();
    modes.push(view);
  }
  result.observations.notebookGuideModes = modes;
  for (const style of ['interlinear', 'separated', 'contextual']) {
    await selectMode('card');
    await setStyle(style);
    await playFrom(sentence);
    await waitAudible(sentence);
    await pairing('text');
    await spoken();
    await waitAudible(sentence, 'meaning');
    await pairing('meaning');
    await stop();
  }
  record('Notebook guides render across four levels; EN/ID highlighting switches with a paired underline');

  await selectMode('focus');
  await click(toolbar + ' [data-shared-focus-orientation-option="vertical-focus"]');
  await playFrom(sentence);
  await waitAudible(sentence);
  const owner = await current();
  const card = '[data-text-player-card="' + p1.id + '"]';
  const focused = `document.querySelector(${q(card + ' [data-shared-part-focused-unit-id]')})?.dataset.sharedPartFocusedUnitId`;
  await waitFor(`${focused} === ${q(sentence.unitId)}`);
  const nextUnit = p1.segments.find(row => row.unitId !== sentence.unitId).unitId;
  const scroll = await evaluate(`new Promise(resolve => {
    const root = document.querySelector('[data-text-structured-player]');
    const before = root.scrollTop;
    root.dispatchEvent(new WheelEvent('wheel', { deltaY: 500, bubbles: true }));
    root.scrollTo({ top: root.scrollHeight, behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(() => resolve([before, root.scrollTop])));
  })`);
  assert.notEqual(scroll[0], scroll[1]);
  assert.equal(await evaluate(focused), sentence.unitId);
  await click(card + ' [data-shared-focus-rail-unit-id="' + nextUnit + '"]');
  await waitFor(`${focused} === ${q(nextUnit)}`);
  assert.equal((await current()).segment.id, sentence.id);
  assert.equal((await current()).sessionId, owner.sessionId);
  await click(card + ' [data-shared-focus-return-to-playing]');
  await waitFor(`${focused} === ${q(sentence.unitId)}`);
  await stop();
  result.observations.focusScroll = scroll;
  record('Passive vertical scroll, explicit Unit selection and return preserve the playback owner');
  return result;
}
