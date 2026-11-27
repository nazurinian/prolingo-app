import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const name = 'prolingo_text_library_d3b_qa_a1b_body_audio';
export const bodyAuditLibraries = { [name]: 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex') };
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection").bookQaConnection';
const reader = prop => `window.__bookQaProps('[data-text-structured-player]', ${JSON.stringify(prop)}, true).${prop}`;
const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const field = name => `[data-book-body-audio] [name="${name}"]`;
const body = '[data-book-body-audio]';
const status = `document.querySelector('[data-book-body-audio-status]')?.textContent`;

export async function checkBookBodyAudio({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, call, bodyRequests }) {
  const groups = [];
  const pass = label => { groups.push(label); console.log('PASS', label); };
  const button = async label => {
    await evaluate(`(() => {
      const item = [...document.querySelectorAll(${JSON.stringify(body + ' button')})].find(button => button.textContent.trim() === ${JSON.stringify(label)});
      if (!item || item.disabled) throw new Error('Unavailable Body audio action');
      item.click();
    })()`);
  };
  const change = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Missing ' + ${JSON.stringify(selector)});
    const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  })()`);
  const setRenderProfile = async (rate, pitch = 0) => {
    await change(field('rate'), rate);
    await change(field('pitch'), pitch);
    await button('Set session audio defaults');
  };
  const run = async (label, expected) => {
    await button(label);
    try { await waitFor(`${status}?.includes(${JSON.stringify(expected)}) || (${status} && !document.querySelector('${body} button:disabled'))`); }
    catch { /* Include the actual Reader status in the assertion. */ }
    assert((await evaluate(status))?.includes(expected), `${label}: expected ${expected}, got ${await evaluate(status)}`);
  };
  const connect = async seed => {
    await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
    await waitFor(`location.search.includes(${JSON.stringify(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
    await chooseOptIn();
    const fixture = seed ? await probe(`module.seedAudioLibrary(${JSON.stringify(name)})`) : null;
    await clickButton('Load / Connect existing v2 library');
    await waitFor(`document.querySelector('${body} summary')`);
    await evaluate(`document.querySelector('${body} summary').click()`);
    await waitFor(`document.querySelector(${JSON.stringify(field('rate'))})`);
    return fixture;
  };
  const transport = async name => evaluate(`document.querySelector('[data-global-player] button[aria-label="${name}"]').click()`);
  const playCardEn = async card => {
    // Classic uses Manual Card English by default. Select the actual control to
    // avoid invoking an alternate React tree's stale representation closure.
    const action = `document.querySelector(${JSON.stringify('[data-text-player-card="' + card + '"] button[data-text-card-play-compact]')})`;
    await waitFor(`${action}?.getAttribute('data-reader-playback-action') === 'play'`);
    await evaluate(`${action}.click()`);
  };
  const setRepresentation = async mode => {
    const saved = `document.querySelector('[data-text-global-player-controls] button')`;
    const label = mode === 'full' ? 'Saved Full' : 'Saved Split';
    await transport('Expand player details');
    await waitFor(`${saved}?.getClientRects().length`);
    if (await evaluate(`${saved}.textContent.trim()`) !== label) await evaluate(`${saved}.click()`);
    await waitFor(`${saved}.textContent.trim() === ${JSON.stringify(label)}`);
    await transport('Collapse player details');
  };
  const recorded = async precision => {
    try { await waitFor(`${player}.nowPlaying.precision === "${precision}" && ${player}.media?.duration > 0`); }
    catch (error) {
      const observed = await evaluate(`({ nowPlaying: ${player}.nowPlaying, representation: ${reader('playbackRepresentationMode')}, speech: window.__bookQaSpeech.slice(-5) })`);
      throw new Error(`Expected recorded ${precision}: ${JSON.stringify(observed)}`, { cause: error });
    }
  };

  const fixture = await connect(true);
  await evaluate(`document.querySelector('[data-book-heading-audio] summary').click()`);
  await waitFor(`document.querySelector('[aria-label="Read Conversation Scene Heading"]')?.checked`);
  await evaluate(`document.querySelector('[aria-label="Read Conversation Scene Heading"]').click()`);
  await waitFor(`document.querySelector('[data-book-heading-status]')?.textContent.includes('saved')`);
  await evaluate(`document.querySelector('[data-book-heading-audio] summary').click()`);
  const originalNetworkCount = bodyRequests.length;
  assert.equal(await probe(`module.exerciseBookBodyEntryChecks(${host})`), true);
  assert.equal(bodyRequests.length, originalNetworkCount, 'Valid provisional bytes should avoid any synthesis');
  pass('Valid provisional reuse, exact-digest repair for corrupt and missing bytes, and failed cold recovery fence');
  const workspaces = fixture.documents;
  const bodyCards = await evaluate(`${host}.session.getSnapshot().blocks.filter(block => block.documentId === ${JSON.stringify(workspaces[0])}).map(block => ({ id: block.id, type: block.blockType }))`);
  const paragraph = bodyCards.find(card => card.type === 'paragraph').id;
  const scene = bodyCards.find(card => card.type === 'conversation').id;

  await change(field('edgeVoice'), 'en-GB-RyanNeural');
  await change(field('browserVoice'), 'Fixture EN');
  await run('Save Workspace profile', 'saved');
  await run('Generate Sentence', '1 committed');
  await transport('Start playback');
  await recorded('segment');
  await transport('Pause playback');
  const playing = await evaluate(`${player}.nowPlaying`);
  assert.equal(playing.voice, 'en-GB-RyanNeural');
  assert.equal(playing.source, 'generated');
  assert.equal(playing.channel, 'text');
  assert(playing.timeline.seekable);
  assert(await evaluate('navigator.mediaSession.metadata?.title?.length > 0'));
  await change('[data-app-header] select', workspaces[1]);
  await waitFor(`${host}.session.getState().view.selection.workspaceId === ${JSON.stringify(workspaces[1])}`);
  assert.equal(await evaluate(`${player}.nowPlaying.workspace.id`), workspaces[0]);
  await run('Reset this profile', 'saved');
  assert.equal(await evaluate(`${player}.nowPlaying.sessionId`), playing.sessionId);
  await transport('Resume playback');
  await transport('Stop playback');
  await change('[data-app-header] select', workspaces[0]);
  await waitFor(`document.querySelector(${JSON.stringify(field('edgeVoice'))})?.value === 'en-GB-RyanNeural'`);
  pass('Actual scoped Split playback, Media Session, pause/resume and ownership across navigation and reset');

  await setRenderProfile(12);
  await run('Generate Sentence', '1 committed');
  await setRenderProfile(12, 4);
  await run('Generate Sentence', '1 committed');
  const sameVoice = await evaluate(`${host}.session.getSnapshot().audioVariants.find(row => row.segmentId === ${JSON.stringify(fixture.segmentId)} && row.voiceId === 'en-GB-RyanNeural')`);
  assert.equal(Object.keys(sameVoice.metadata.bookAudioRenderReferencesV1).length, 3);
  await setRenderProfile(12);
  await run('Generate Card Full', '1 committed');
  await setRepresentation('full');
  await playCardEn(paragraph);
  await recorded('card');
  const full = await evaluate(`${player}.nowPlaying`);
  assert.equal(full.actualRepresentation, 'full');
  assert.equal(full.segment, null);
  assert.equal(full.voice, 'en-GB-RyanNeural');
  await transport('Stop playback');
  pass('Actual untimed Full Paragraph playback and same-voice alternate RF retention');

  await setRepresentation('split');
  await run('Generate Card Split', 'committed');
  const sentences = await evaluate(`${host}.session.getSnapshot().segments.filter(row => row.blockId === ${JSON.stringify(paragraph)}).map(row => row.id)`);
  await evaluate(`${reader('onPlaySegment')}(${JSON.stringify(sentences[0])}, 'text')`);
  await recorded('segment');
  assert.equal(await evaluate(`${player}.nowPlaying.scope`), 'segment');
  await transport('Stop playback');
  await evaluate(`${reader('onPlayContinueFromSegment')}(${JSON.stringify(sentences[0])}, { scope: 'card' })`);
  await recorded('segment');
  assert.equal(await evaluate(`${player}.nowPlaying.boundary`), 'card');
  await transport('Stop playback');
  await evaluate(`${reader('onStartFromSegment')}(${JSON.stringify(sentences[0])})`);
  await recorded('segment');
  assert.equal(await evaluate(`${player}.nowPlaying.boundary`), 'document');
  await transport('Next sentence');
  await waitFor(`${player}.nowPlaying.segment?.id === ${JSON.stringify(sentences[1])}`);
  await transport('Previous sentence');
  await waitFor(`${player}.nowPlaying.segment?.id === ${JSON.stringify(sentences[0])}`);
  await transport('Stop playback');
  pass('Recorded Single, Continue and Start From Here use the existing bounded transport');

  await setRepresentation('full');

  await change(`${body} select[aria-label="Body audio Card"]`, scene);
  await change(`${body} select:has(option[value="conversation"])`, 'conversation');
  await change(field('edgeVoice'), 'en-GB-LibbyNeural');
  await run('Save Workspace profile', 'saved');
  await run('Compose Scene Full', 'INVALID_AUDIO_COMPOSITION');
  await playCardEn(scene);
  await waitFor(`${player}.nowPlaying.card?.id === ${JSON.stringify(scene)} && ${player}.nowPlaying.source === 'tts'`);
  await transport('Stop playback');
  await run('Generate Card Split', 'committed');
  const beforeCompose = bodyRequests.length;
  await run('Compose Scene Full', '1 committed');
  assert.equal(bodyRequests.length, beforeCompose, 'Scene Full should compose verified Split bytes without provider synthesis');
  const composition = await evaluate(`${host}.session.getSnapshot().blocks.find(row => row.id === ${JSON.stringify(scene)}).metadata.fullAudioArtifactsV1.artifacts.find(item => item.descriptor.engine === 'derived')`);
  assert.equal(composition.metadata.bookAudioTrustedCompositionV1, true);
  assert.equal(composition.metadata.bookAudioBinaryV1.sampleRate, 48_000);
  await playCardEn(scene);
  await recorded('card');
  assert.equal(await evaluate(`${player}.media.playbackRate`), 1);
  assert.equal(await evaluate(`${player}.nowPlaying.segment`), null);
  await transport('Stop playback');
  pass('Incomplete Conversation falls back to TTS, then plays trusted composed 48 kHz Full');

  await change(`${body} select[aria-label="Body audio Card"]`, paragraph);
  await setRenderProfile(13);
  await run('Generate Sentence', 'FIXTURE_RENDER_REJECTED');
  await setRenderProfile(14);
  await button('Generate Sentence');
  await button('Cancel');
  await waitFor(`${status}?.includes('CANCELLED') || ${status}?.includes('abort')`);
  await setRenderProfile(15);
  const beforeStale = bodyRequests.length;
  await button('Generate Sentence');
  for (let attempt = 0; attempt < 40 && bodyRequests.length === beforeStale; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert(bodyRequests.length > beforeStale);
  assert((await probe(`module.executeExternal(${JSON.stringify(name)}, {}, {type:'collection.create',payload:{title:'External writer'}})`)).ok);
  await waitFor(`${status}?.includes('STALE_RESULT')`);
  await evaluate(`${host}.refresh()`);
  pass('Controlled provider failure, cancellation and stale authoritative generation reject without replay');

  await connect(false);
  await waitFor(`document.querySelector(${JSON.stringify(field('edgeVoice'))})?.value === 'en-GB-RyanNeural'`);
  await setRenderProfile(12, 4);
  await run('Verify Card audio', 'ready');
  await setRenderProfile(12);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor('window.innerWidth === 390 && document.querySelector(\'[data-mobile-controls-toggle][aria-label="Close Controls"]\')?.getClientRects().length');
  await evaluate(`document.querySelector('[data-mobile-controls-toggle][aria-label="Close Controls"]').click()`);
  await waitFor(`document.querySelector('${body} summary')?.getClientRects().length > 0`);
  assert(await evaluate(`[...document.querySelectorAll('${body} button')].some(button => button.textContent === 'Generate Sentence')`));
  await run('Verify Card audio', 'ready');
  await run('Reset this profile', 'saved');
  const afterReset = await evaluate(`${host}.session.getSnapshot().audioVariants.find(row => row.id === ${JSON.stringify(sameVoice.id)})`);
  assert.equal(afterReset.uid, sameVoice.uid);
  assert.deepEqual(afterReset.metadata.bookAudioRenderReferencesV1, sameVoice.metadata.bookAudioRenderReferencesV1);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false });
  pass('Reconnect and mobile profile reset preserve the stable variant and all rate/pitch references');
  return { groups, controlledRequests: bodyRequests.length };
}
