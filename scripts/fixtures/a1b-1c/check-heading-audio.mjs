import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const names = ['prolingo_text_library_d3b_qa_a1b_heading', 'prolingo_text_library_d3b_qa_a1b_heading_peer'];
export const headingAuditLibraries = Object.fromEntries(names.map(name =>
  [name, 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex')]));
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const heading = '[data-book-heading-audio]';
const status = "document.querySelector('[data-book-heading-status]')?.textContent";
const q = JSON.stringify;

export async function checkBookHeadingAudio({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, call, bodyRequests }) {
  const groups = [];
  const pass = name => { groups.push(name); console.log('PASS', name); };
  const click = selector => evaluate(`document.querySelector(${q(selector)}).click()`);
  const change = (selector, value) => evaluate(`(() => {
    const element = document.querySelector(${q(selector)});
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${q(value)});
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  })()`);
  const select = id => change('[data-app-header] select', id);
  const action = label => evaluate(`(() => {
    const button = [...document.querySelectorAll('${heading} button')].find(item => item.textContent.trim() === ${q(label)});
    if (!button || button.disabled) throw new Error('Unavailable Heading action ' + ${q(label)});
    button.click();
  })()`);
  const run = async (label, expected) => {
    await action(label);
    await waitFor(`${status} && ${status} !== 'Working…'`);
    assert((await evaluate(status)).includes(expected), `${label}: ${await evaluate(status)}`);
  };
  const connect = async (name, seed) => {
    await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
    await waitFor(`location.search.includes(${q(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
    await chooseOptIn();
    const fixture = seed ? await probe(`module.seedHeadingLibrary(${q(name)})`) : null;
    await clickButton('Load / Connect existing v2 library');
    await waitFor("document.querySelector('[data-app-header] select')");
    if (fixture) {
      await select(fixture.workspace);
      await waitFor(`document.querySelector('[data-app-header] select').value === ${q(fixture.workspace)}`);
    }
    await waitFor(`document.querySelector('${heading} summary')`);
    await click(heading + ' summary');
    await waitFor(`document.querySelector('${heading} select')`);
    return fixture;
  };
  const channel = value => change(heading + ' select:has(option[value="meaning"])', value);
  const card = value => change(heading + ' select:has(option[value=""])', value);
  const global = async () => {
    for (const [name, value] of Object.entries({
      browserTextVoiceName: 'Fixture EN', browserMeaningVoiceName: 'Fixture ID',
      edgeTextVoiceId: 'en-GB-RyanNeural', edgeMeaningVoiceId: 'id-ID-ArdiNeural'
    })) await change(`${heading} input[name="${name}"]`, value);
    await run('Set session Global voices', 'updated');
  };
  const transport = label => click(`[data-global-player] button[aria-label="${label}"]`);
  const setLanguageOrder = async label => {
    await transport('Expand player details');
    await waitFor("document.querySelector('[data-player-open-text-settings]')");
    await click('[data-player-open-text-settings]');
    const choice = `[...document.querySelectorAll('[data-text-choice-group="global-language-order"] button')].find(button => button.textContent.trim() === ${q(label)})`;
    await waitFor(`${choice} && !${choice}.disabled`);
    await evaluate(`${choice}.click()`);
    await waitFor(`${choice}.getAttribute('aria-pressed') === 'true'`);
    await evaluate(`[...document.querySelectorAll('[data-text-player-workspace] button')].find(button => button.textContent.trim() === 'Close').click()`);
    if (await evaluate(`Boolean(document.querySelector('[data-global-player] button[aria-label="Collapse player details"]'))`)) {
      await transport('Collapse player details');
    }
  };
  const now = (source, language) => waitFor(`${player}.nowPlaying.precision === 'heading' && ${player}.nowPlaying.source === ${q(source)}
    && ${player}.nowPlaying.channel === ${q(language)} && (${q(source)} !== 'generated' || ${player}.media?.duration > 0)`);
  const selected = () => action('Play selected channel');

  const fixture = await connect(names[0], true);
  await global();
  assert.equal(await evaluate(`document.querySelector('[aria-label="Show Paragraph Heading"]').checked`), false);
  await click('[aria-label="Read Paragraph Heading"]');
  await waitFor(`${status}?.includes('saved')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Show Paragraph Heading"]').checked`), false);
  await click('[aria-label="Show Main Title"]');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Read Main Title"]').checked`), true);
  const beforeVoice = bodyRequests.length;
  await run('Generate Heading', 'committed');
  await channel('meaning');
  await run('Generate Heading', 'committed');
  const synthesis = bodyRequests.slice(beforeVoice);
  assert.deepEqual(synthesis.map(item => [item.text, item.voice]), [[fixture.contents.en, 'en-GB-RyanNeural'], [fixture.contents.id, 'id-ID-ArdiNeural']]);
  await run('Verify Heading audio', 'Recorded playback available');
  await selected();
  await now('generated', 'meaning');
  const playing = await evaluate(`${player}.nowPlaying`);
  assert.equal(playing.voice, 'id-ID-ArdiNeural');
  assert.equal(playing.card, null);
  assert.equal(playing.segment, null);
  assert.equal(playing.unit, null);
  assert.equal(playing.queue, null);
  assert(playing.timeline.seekable);
  assert.equal(await evaluate('navigator.mediaSession.metadata.title'), 'Main Title · ' + fixture.contents.id);
  await transport('Pause playback');
  await select(fixture.empty);
  await waitFor(`document.querySelector('[data-app-header] select').value === ${q(fixture.empty)}`);
  assert.equal(await evaluate(`${player}.nowPlaying.sessionId`), playing.sessionId);
  assert.equal(await evaluate(`${player}.nowPlaying.workspace.uid`), fixture.uid);
  await transport('Resume playback');
  await transport('Stop playback');
  await select(fixture.workspace);
  await waitFor(`document.querySelector('${heading} summary')`);
  await click(heading + ' summary');
  pass('Actual Indonesian recorded Main Title, Media Session and owned Pause/Resume across Workspace navigation');

  await click('[data-book-body-audio] summary');
  await waitFor(`document.querySelector('[data-book-body-audio-status]')`);
  const beforeReuse = bodyRequests.length;
  await evaluate(`[...document.querySelectorAll('[data-book-body-audio] button')].find(item => item.textContent === 'Generate Sentence').click()`);
  await waitFor(`document.querySelector('[data-book-body-audio-status]').textContent.includes('committed')`);
  assert.equal(bodyRequests.length, beforeReuse);
  const shared = await probe(`module.inspectHeadingSharing(${host})`);
  assert.deepEqual({ same: shared.same, statuses: shared.statuses, physical: shared.physical }, { same: true, statuses: ['ready', 'ready'], physical: 1 });
  await click('button[title="Play Workspace from start"]');
  await now('generated', 'text');
  await transport('Next sentence');
  await waitFor(`${player}.nowPlaying.precision === 'segment' && ${player}.nowPlaying.segment.id === ${q(fixture.segment)}`);
  await transport('Stop playback');
  pass('Heading and Body use one durable RF asset and one connection URL without provider synthesis');

  await setLanguageOrder('ID → EN');
  await action('Play saved language order');
  await now('generated', 'meaning');
  await evaluate(`${player}.media.currentTime = Math.max(0, ${player}.media.duration - 0.04)`);
  await now('generated', 'text');
  assert.equal(await evaluate(`${player}.nowPlaying.voice`), 'en-GB-RyanNeural');
  await transport('Stop playback');
  await card(fixture.scene);
  await setLanguageOrder('EN → ID');
  await action('Play saved language order');
  await now('tts', 'text');
  assert.deepEqual((await evaluate('window.__bookQaSpeech.filter(event => event[0] === "speak").at(-1)')).slice(1), ['Atomic scene heading', 'Fixture EN']);
  await evaluate('speechSynthesis.finish()');
  await now('tts', 'meaning');
  assert.deepEqual((await evaluate('window.__bookQaSpeech.filter(event => event[0] === "speak").at(-1)')).slice(1), ['Judul adegan', 'Fixture ID']);
  assert.equal(await evaluate(`${player}.nowPlaying.timeline`), null);
  assert.equal(await evaluate(`${player}.nowPlaying.card.id`), fixture.scene);
  await transport('Stop playback');
  await channel('text');
  await run('Generate Heading', 'committed');
  await selected();
  await now('generated', 'text');
  assert.equal(await evaluate(`${player}.nowPlaying.heading.key`), 'scene');
  await transport('Stop playback');
  pass('ID-EN recorded and EN-ID controlled Browser TTS retain exact text, voice and atomic owner');

  const speakers = [...new Set(fixture.sceneSegments.map(item => item.speakerId))];
  assert.equal(speakers.length, 2);
  const edge = ['en-GB-LibbyNeural', 'en-GB-SoniaNeural'];
  for (const [index, speakerId] of speakers.entries()) {
    const payload = { id: fixture.workspace, bodyAudioProfile: { workspaceUid: fixture.uid, channel: 'text',
      kind: 'conversation', speakerId, values: { edgeVoice: edge[index] } } };
    assert((await evaluate(`${host}.session.dispatch(${q({ type: 'document.update', payload })})`)).ok);
  }
  await run('Verify Heading audio', 'Recorded playback available');
  await change('[data-book-body-audio] select[aria-label="Body audio Card"]', fixture.scene);
  const requestsStart = bodyRequests.length;
  await evaluate(`[...document.querySelectorAll('[data-book-body-audio] button')].find(item => item.textContent === 'Generate Card Split').click()`);
  await waitFor(`document.querySelector('[data-book-body-audio-status]').textContent.includes('committed')`);
  assert.deepEqual(bodyRequests.slice(requestsStart).map(item => [item.text, item.voice]),
    fixture.sceneSegments.map(item => [item.text, edge[speakers.indexOf(item.speakerId)]]));
  pass('Two stable Speaker voices render in authored Split order and leave the Scene Heading profile unchanged');

  const setRenderRate = async value => {
    await change('[data-book-body-audio] input[name="rate"]', value);
    await evaluate(`[...document.querySelectorAll('[data-book-body-audio] button')].find(item => item.textContent === 'Set session audio defaults').click()`);
    await waitFor(`document.querySelector('[data-book-body-audio-status]').textContent.includes('updated')`);
  };
  const waitForProvider = async rate => {
    for (let elapsed = 0; elapsed < 1000 && !bodyRequests.some(request => request.rate === rate && request.text === 'Atomic scene heading'); elapsed += 20) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(bodyRequests.some(request => request.rate === rate && request.text === 'Atomic scene heading'));
  };
  await setRenderRate(14);
  await action('Generate Heading');
  await waitForProvider('+14%');
  await action('Cancel Heading operation');
  await waitFor(`${status}?.includes('CANCELLED') || ${status}?.includes('abort')`);
  await setRenderRate(15);
  await action('Generate Heading');
  await waitForProvider('+15%');
  const stale = { type: 'block.update', payload: { id: fixture.scene, heading: { en: 'Externally edited scene heading' } } };
  assert((await probe(`module.executeBookTransaction(${q(names[0])}, ${q(fixture.workspace)}, ${q(stale)})`)).ok);
  await waitFor(`${status}?.includes('STALE_RESULT')`);
  await evaluate(`${host}.refresh()`);
  await setRenderRate(0);
  await run('Verify Heading audio', 'Selected render stale');
  pass('Cancelled and stale Heading generation uploads no binding and explicit Refresh projects the external edit');

  await select(fixture.empty);
  await waitFor(`document.querySelector('[data-app-header] select').value === ${q(fixture.empty)}`);
  await transport('Start playback');
  await now('tts', 'text');
  assert.equal(await evaluate(`${player}.nowPlaying.heading.content`), 'Title-only Workspace');
  assert.equal(await evaluate(`${player}.nowPlaying.segment`), null);
  await evaluate('speechSynthesis.finish()');
  await waitFor(`${player}.nowPlaying.state === 'idle'`);

  const alternate = await probe(`module.exerciseHeadingReceipt(${q(names[0])})`);
  await connect(names[0], false);
  await select(fixture.workspace);
  await waitFor(`document.querySelector('[data-app-header] select').value === ${q(fixture.workspace)}`);
  if (!(await evaluate(`Boolean(document.querySelector('${heading} select'))`))) await click(heading + ' summary');
  await global();
  assert.equal(await evaluate(`document.querySelector('[aria-label="Show Main Title"]').checked`), true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Read Paragraph Heading"]').checked`), true);
  await run('Verify Heading audio', 'Recorded playback available');
  const references = await evaluate(`${host}.session.getSnapshot().documents.find(item => item.id === ${q(fixture.workspace)}).metadata.bookHeadingAudioV1.text`);
  assert(references[shared.fingerprint] && references[alternate]);
  assert.equal(await evaluate(`fetch(${q(shared.url)}).then(() => false, () => true)`), true);
  pass('Title-only normal transport, uncertain Heading receipt recovery, retained alternate profiles and session disposal');

  await connect(names[1], true);
  await global();
  await run('Verify Heading audio', 'Selected render missing');
  await run('Generate Heading', 'committed');
  const peer = await probe(`module.inspectHeadingSharing(${host})`);
  assert.equal(peer.fingerprint, shared.fingerprint);
  assert.notEqual(peer.id, shared.id);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor('window.innerWidth === 390 && document.querySelector(\'[data-mobile-controls-toggle][aria-label="Close Controls"]\')?.getClientRects().length');
  await click('[data-mobile-controls-toggle][aria-label="Close Controls"]');
  await waitFor(`document.querySelector('${heading} summary')?.getClientRects().length`);
  await run('Verify Heading audio', 'Recorded playback available');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false });
  pass('Same RF in a second library remains scoped, with the same Heading controls on mobile');
  return { groups };
}
