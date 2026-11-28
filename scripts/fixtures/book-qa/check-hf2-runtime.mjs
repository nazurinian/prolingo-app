import assert from 'node:assert/strict';
import { checkHf2Archives } from './check-hf2-archives.mjs';

const q = JSON.stringify;

export async function checkHf2Runtime({ mode, evaluate, waitFor, clickButton, click, change, control, openBody,
  run, record, result, adjustPlayback, playFrom, waitAudible, stop, selectMode, player, host, body, paragraph, conversation, mixed,
  call, selectWorkspace, probe, saveVoice }) {
  const baseline = mode === 'hf2-baseline';
  const [card, nextCard] = paragraph.cards;
  const [first, second, third, fourth] = card.segments;
  const setSource = async source => {
    await change(body + ' [name=source]', source);
    await clickButton('Set session audio defaults');
  };
  const configure = async options => {
    if (await evaluate(`Boolean(document.querySelector('[aria-label="Collapse player details"]'))`)) await control('Collapse player details');
    await adjustPlayback(options);
    await control('Expand player details');
  };
  const finish = async (phase, source) => {
    if (source === 'tts') return evaluate('speechSynthesis.finish(); true');
    return evaluate(`(() => {
      const media = ${player}.media;
      if (!media || ${player}.transport.phase !== ${q(phase)}) throw Error('Native media is unavailable');
      media.currentTime = Math.max(0, media.duration - 0.04);
      return true;
    })()`);
  };
  if (mode === 'hf2-native') {
    await waitFor('speechSynthesis.getVoices().length > 0');
    const voices = await evaluate(`['en', 'id'].map(lang => speechSynthesis.getVoices().find(voice => voice.localService && voice.lang.startsWith(lang))?.name)`);
    if (voices.some(voice => !voice)) {
      result.observations.native = { status: 'NOT CONFIRMED', catalogLocalVoices: voices };
      return result;
    }
    await saveVoice({ browser: voices[0] });
    await saveVoice({ browser: voices[1], channel: 'meaning' });
    await change(body + ' select', 'text');
    await run('Generate Sentence', '1 committed');
    await configure();
    await playFrom(first);
    await waitAudible(first);
    const owner = await evaluate(`${player}.nowPlaying.sessionId`);
    await evaluate(`${player}.media.addEventListener('ended', () => { window.__hf2NativeEnEnd = performance.now(); }, { capture: true, once: true })`);
    await finish('playing', 'generated');
    await waitAudible(first, 'meaning');
    const fallback = await evaluate(`({ owner: ${player}.nowPlaying.sessionId, source: ${player}.nowPlaying.source,
      voice: ${player}.nowPlaying.voice, liveTimeline: Boolean(${player}.nowPlaying.timeline),
      mediaEnd: window.__hf2NativeEnEnd, events: window.__bookQaSpeech.slice() })`);
    assert.equal(fallback.owner, owner);
    assert.equal(fallback.source, 'tts');
    assert.equal(fallback.voice, voices[1]);
    assert.equal(fallback.liveTimeline, false);
    await stop();
    await setSource('tts-only');
    await evaluate('window.__bookQaSpeech.length = 0');
    await playFrom(first);
    await waitFor(`window.__bookQaSpeech.some(event => event[0] === 'end' && event[1] === ${q(first.meaning)})`);
    const both = await evaluate(`window.__bookQaSpeech.filter(event => ['start', 'end', 'speak'].includes(event[0]))`);
    assert.deepEqual(both.filter(event => event[0] === 'start').slice(0, 2).map(event => event[2]), voices);
    if (await evaluate(`${player}.transport.phase !== 'idle'`)) await stop();
    result.observations.native = { status: 'PASS', fallback, both };
    record('Actual installed EN and ID voices: native Browser startup and recorded-to-ID fallback');
    return result;
  }
  await openBody();
  await run('Generate Workspace Split', '6 committed');
  await change(body + ' select', 'meaning');
  const sentenceChoice = body + ' select:has(option[value="' + first.id + '"])';
  for (const target of [first, second]) {
    await change(sentenceChoice, target.id);
    await run('Generate Sentence', '1 committed');
  }
  await configure();
  await evaluate(`(() => {
    window.__hf2Trace = [];
    const audio = ${host}.audio;
    const read = audio.readRuntime;
    audio.readRuntime = async (...args) => {
      const start = performance.now();
      try { return await read(...args); }
      finally { __hf2Trace.push({ kind: 'verify', id: args[0].target.segmentId, channel: args[0].descriptor.channel, start, at: performance.now() }); }
    };
    let serial = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      if (this.src.startsWith('blob:') && !this.__hf2Watched) {
        this.__hf2Watched = true;
        const mediaId = ++serial;
        __hf2Trace.push({ kind: 'play', mediaId, at: performance.now() });
        for (const event of ['playing', 'ended']) this.addEventListener(event, () => {
          __hf2Trace.push({ kind: event, mediaId, at: performance.now() });
        }, { capture: true });
      }
      return play.apply(this, args);
    };
  })()`);
  const measure = async (before, after, toChannel, source) => {
    await evaluate(`(() => {
      const frames = window.__hf2Frames = [];
      const drawing = window.__hf2Measure = {};
      const tick = () => {
        if (window.__hf2Measure !== drawing) return;
        const { nowPlaying: np, media, transport } = ${player};
        const info = document.querySelector('[data-player-section="playback-info"]')?.getBoundingClientRect();
        const toggle = document.querySelector('[aria-label="Collapse player details"]');
        const drawer = document.getElementById(toggle?.getAttribute('aria-controls'))?.getBoundingClientRect();
        const timeline = document.querySelector('[data-player-timeline-slot], [data-player-timeline]')?.getBoundingClientRect();
        frames.push({ phase: transport.phase, target: np.segment?.id, channel: np.channel, owner: np.sessionId, source: np.source,
          media: !!media, timeline: !!document.querySelector('[data-player-timeline]'),
          timelineSlot: !!document.querySelector('[data-player-timeline-slot]'), timelineHeight: timeline?.height ?? 0,
          infoTop: info?.top, drawerTop: drawer?.top,
          activeHighlight: !!document.querySelector('[data-text-player-segment-active=true]') });
        requestAnimationFrame(tick);
      };
      tick();
    })()`);
    const began = await evaluate('performance.now()');
    await finish('playing', source);
    await waitAudible(after, toChannel);
    return evaluate(`(() => {
      window.__hf2Measure = null;
      const frames = __hf2Frames;
      const waiting = frames.filter(row => row.phase === 'waiting');
      const values = entries => [...new Set(entries)];
      const events = __hf2Trace.filter(row => row.at > ${began} - 300);
      const ended = events.find(row => row.kind === 'ended' && row.at >= ${began});
      const end = ended?.at;
      const started = events.find(row => row.kind === 'playing' && row.at >= (end ?? ${began}) && row.mediaId !== ended?.mediaId);
      const next = started?.at;
      const play = events.find(row => row.kind === 'play' && row.mediaId === started?.mediaId)?.at;
      const tts = window.__bookQaSpeech.find(row => row[0] === 'speak' && row[3] > (end ?? ${began}))?.[3];
      return { endToNextMs: +( (next ?? tts) - (end ?? ${began}) ).toFixed(1),
        nativeMediaStartupMs: next && play ? +(next - play).toFixed(1) : null,
        reads: events.filter(row => row.kind === 'verify').map(row => ({
          id: row.id, channel: row.channel, ms: +(row.at-row.start).toFixed(1), readyBeforeEnd: end ? row.at < end : null,
        })), frames: frames.length, waitingFrames: waiting.length,
        waitingRetained: waiting.filter(row => row.target === ${q(before.id)} && row.activeHighlight).length,
        falseLiveTimeline: waiting.filter(row => row.media || row.timeline).length,
        waitingWithTimelineSlot: waiting.filter(row => row.timelineSlot).length,
        detailsTops: values(frames.map(row => row.infoTop)), drawerTops: values(frames.map(row => row.drawerTop)),
        timelineHeights: values(frames.map(row => row.timelineHeight)), owners: values(frames.map(row => row.owner)),
        sources: values(frames.map(row => row.phase === 'playing' ? row.source : 'silent')),
        channel: ${player}.nowPlaying.channel };
    })()`);
  };
  const transitions = result.observations.transitions = {};
  await playFrom(first);
  await waitAudible(first);
  const owner = await evaluate(`${player}.nowPlaying.sessionId`);
  result.observations.intrinsicFixtureSilence = await evaluate(`(async () => {
    const context = new AudioContext();
    try {
      const bytes = await (await fetch(${player}.media.currentSrc)).arrayBuffer();
      const decoded = await context.decodeAudioData(bytes);
      const pcm = decoded.getChannelData(0);
      let peak = 0;
      for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
      const threshold = peak * 0.01;
      const leading = pcm.findIndex(sample => Math.abs(sample) > threshold);
      let end = pcm.length - 1;
      while (end > leading && Math.abs(pcm[end]) <= threshold) end--;
      return { durationMs: +(1000 * decoded.duration).toFixed(1),
        leadingMs: +(1000 * leading / decoded.sampleRate).toFixed(1),
        trailingMs: +(1000 * (pcm.length - 1 - end) / decoded.sampleRate).toFixed(1), threshold: '1% peak amplitude' };
    } finally { await context.close(); }
  })()`);
  transitions.recordedEnToIdZero = await measure(first, first, 'meaning', 'generated');
  transitions.recordedIdToNextEnZero = await measure(first, second, 'text', 'generated');
  await finish('playing', 'generated');
  await waitAudible(second, 'meaning');
  transitions.recordedAcrossSections = await measure(second, third, 'text', 'generated');
  await stop();
  await configure({ delay: '0.5s' });
  await playFrom(first);
  await waitAudible(first);
  transitions.recordedEnToId500 = await measure(first, first, 'meaning', 'generated');
  await stop();
  await configure({ delay: 'None' });
  await playFrom(fourth);
  await waitAudible(fourth);
  transitions.recordedToBrowser = await measure(fourth, fourth, 'meaning', 'generated');
  transitions.acrossCards = await measure(fourth, nextCard.segments[0], 'text', 'tts');
  await stop();
  await configure({ representation: 'Full' });
  await evaluate('window.__hf2Trace.length = 0');
  await playFrom(first);
  await waitAudible(first);
  await waitFor(`${player}.media?.duration > 0`);
  result.observations.fullFallbackStartup = await evaluate(`(() => {
    const start = __hf2Trace.find(row => row.kind === 'play')?.at ?? performance.now();
    const proofs = __hf2Trace.filter(row => row.kind === 'verify' && row.at <= start);
    return { beforeStart: proofs.length, verificationTotalMs: +proofs.reduce((sum, row) => sum + row.at - row.start, 0).toFixed(1),
      playback: ${player}.nowPlaying.actualRepresentation, fallback: ${player}.nowPlaying.representationFallback };
  })()`);
  assert.equal(result.observations.fullFallbackStartup.fallback, true);
  if (!baseline) assert.equal(result.observations.fullFallbackStartup.beforeStart, 1);
  await stop();
  await configure();
  await setSource('tts-only');
  await playFrom(first);
  await waitAudible(first);
  transitions.browserOnly = await measure(first, first, 'meaning', 'tts');
  await stop();
  await selectWorkspace(conversation);
  await setSource('local-first');
  await change(body + ' select', 'text');
  await run('Generate Workspace Split', '6 committed');
  await change(body + ' select', 'meaning');
  await run('Generate Workspace Split', '5 committed');
  const [turnOne, turnTwo] = conversation.cards[0].segments;
  assert.notEqual(turnOne.unitId, turnTwo.unitId);
  await playFrom(turnOne);
  await waitAudible(turnOne);
  await finish('playing', 'generated');
  await waitAudible(turnOne, 'meaning');
  transitions.recordedAcrossTurns = await measure(turnOne, turnTwo, 'text', 'generated');
  await stop();
  for (const observation of Object.values(transitions)) {
    assert.equal(observation.falseLiveTimeline, 0);
    assert.equal(observation.owners.length, 1);
  }
  assert.equal(transitions.recordedEnToIdZero.owners[0], owner);
  assert(transitions.recordedEnToId500.endToNextMs >= 485);
  if (!baseline) assert.equal(transitions.recordedEnToId500.waitingWithTimelineSlot, transitions.recordedEnToId500.waitingFrames);
  record('Details-open recorded, fallback and Browser-only transition matrix');

  await control('Collapse player details');
  await selectWorkspace(paragraph);
  await setSource('tts-only');
  await click(body + ' summary');
  await selectMode('focus');
  await click('[data-shared-focus-orientation-option="vertical-focus"]');
  await waitFor(`document.querySelector('[data-text-card-expansion-mode="all"]')`);
  await click('[data-text-card-expansion-mode="all"]');
  const scope = '[data-text-player-card="' + card.id + '"]';
  const focused = `document.querySelector(${q(scope + ' [data-shared-part-focused-unit-id]')})?.dataset.sharedPartFocusedUnitId`;
  const rail = unit => click(scope + ' [data-shared-focus-rail-unit-id="' + unit + '"]');
  const scrollToUnit = async unit => {
    const placement = await evaluate(`(() => {
      const root = document.querySelector('[data-text-structured-player]');
      const bounds = root.getBoundingClientRect();
      const target = document.querySelector(${q(scope + ' [data-shared-focus-vertical-unit-id="' + unit + '"]')}).getBoundingClientRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + 75, before: root.scrollTop,
        delta: target.top + target.height / 2 - bounds.top - root.clientHeight * 0.42 };
    })()`);
    const { x, y, before, delta } = placement;
    await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: delta });
    const after = await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(
      () => resolve(document.querySelector('[data-text-structured-player]').scrollTop)))))`);
    return [before, after];
  };
  const focus = result.observations.focus = {};
  for (const phase of ['idle', 'playing', 'paused']) {
    if (phase === 'playing') {
      await playFrom(first);
      await waitAudible(first);
    }
    if (phase === 'paused') await control('Pause playback');
    await rail(first.unitId);
    await waitFor(`${focused} === ${q(first.unitId)}`);
    await evaluate(`new Promise(resolve => {
      const root = document.querySelector('[data-text-structured-player]');
      root.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })`);
    const before = await evaluate(`${player}.nowPlaying`);
    const offset = await scrollToUnit(third.unitId);
    const after = await evaluate(`${player}.nowPlaying`);
    focus[phase] = { before: first.unitId, after: await evaluate(focused), offset,
      sameOwner: before.sessionId === after.sessionId, sameCursor: before.segment?.id === after.segment?.id };
    if (!baseline || phase !== 'idle') assert.equal(focus[phase].after, first.unitId);
    assert(focus[phase].sameOwner && focus[phase].sameCursor);
    assert.notEqual(offset[0], offset[1], 'Trusted wheel must move the outer reader');
  }
  await rail(third.unitId);
  await waitFor(`${focused} === ${q(third.unitId)}`);
  await click(scope + ' [data-shared-focus-return-to-playing]');
  await waitFor(`${focused} === ${q(first.unitId)}`);
  await stop();
  record('Vertical Focus passive scroll and explicit Return to Playing checked in all states');
  if (!baseline) await checkHf2Archives({ evaluate, waitFor, clickButton, click, change, openBody,
    run, record, result, selectMode, host, body, mixed, selectWorkspace, probe });
  return result;
}
