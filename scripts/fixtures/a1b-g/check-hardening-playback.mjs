import assert from 'node:assert/strict';

const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const reader = prop => `window.__bookQaProps('[data-text-structured-player]', ${JSON.stringify(prop)}, true).${prop}`;
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const q = JSON.stringify;
const real = '[data-text-global-player-controls] button';

export async function checkBookHardeningPlayback({ evaluate, waitFor, probe, call, workspaceId, bilingual }) {
  const groups = [];
  const pass = message => { groups.push(message); console.log('PASS', message); };
  const click = selector => evaluate(`document.querySelector(${q(selector)}).click()`);
  const control = name => click(`[data-global-player] button[aria-label="${name}"]`);
  const current = () => evaluate(`${player}.nowPlaying`);
  const audible = (segmentId, channel = 'text') => waitFor(`${player}.nowPlaying.segment?.id === ${q(segmentId)} && ${player}.nowPlaying.channel === ${q(channel)} && ${player}.media?.duration > 0`);
  const advance = () => evaluate(`${player}.media.dispatchEvent(new Event('ended'))`);
  const playCard = id => click(`[data-text-player-card="${id}"] button[data-text-card-play-compact]`);
  const verifyBytes = digest => probe(`module.normalMediaDigest(${player}.media?.currentSrc, ${q(digest)})`);

  const cards = await evaluate(`(() => {
    const state = ${host}.session.getSnapshot();
    return state.blocks.filter(card => card.documentId === ${q(workspaceId)}).sort((a, b) => a.order - b.order)
      .map(card => ({ id: card.id, segments: state.segments.filter(row => row.blockId === card.id).sort((a, b) => a.order - b.order).map(row => row.id) }));
  })()`);
  const [paragraph, scene] = cards;
  await control('Expand player details');
  await waitFor(`document.querySelector(${q(real)})?.getClientRects().length`);
  if (!(await evaluate(`document.querySelector(${q(real)}).textContent.includes('Saved Full')`))) await click(real);
  await waitFor(`document.querySelector(${q(real)}).textContent.includes('Saved Full')`);
  await control('Collapse player details');

  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  let paragraphFallback, offlineId, sceneFull, resumed;
  try {
    await playCard(paragraph.id);
    await audible(paragraph.segments[0]);
    paragraphFallback = await current();
    assert.equal(paragraphFallback.requestedRepresentation, 'full');
    assert.equal(paragraphFallback.actualRepresentation, 'split');
    assert.equal(paragraphFallback.representationFallback, true);
    assert.equal(paragraphFallback.precision, 'segment');
    assert.equal(paragraphFallback.source, 'generated');
    assert.equal(paragraphFallback.voice, 'en-GB-SoniaNeural');
    assert.equal(paragraphFallback.unit?.ordinal, 1);
    assert(paragraphFallback.timeline?.durationSeconds > 0 && paragraphFallback.timeline?.durationSeconds < 1);
    assert.equal(await verifyBytes(bilingual.splits.find(item => item.pathSuffix.includes('/SC01/SG01_EN_')).digest), true);
    await control('Pause playback');
    await waitFor(`${player}.nowPlaying.state === 'paused'`);
    const paused = await current();
    assert.equal(paused.segment.id, paragraph.segments[0]);
    await control('Resume playback');
    await audible(paragraph.segments[0]);
    assert.equal((await current()).sessionId, paused.sessionId);
    await advance();
    await audible(paragraph.segments[1]);
    await control('Stop playback');
    await waitFor(`${player}.nowPlaying.state === 'idle'`);
    await control('Start playback');
    await audible(paragraph.segments[1]);
    resumed = await current();
    assert.equal(resumed.actualRepresentation, 'split');
    assert.equal(resumed.scope, 'document');
    await control('Next card');
    await waitFor(`${player}.nowPlaying.card?.id === ${q(scene.id)} && ${player}.nowPlaying.actualRepresentation === 'full' && ${player}.media?.duration > 0`);
    sceneFull = await current();
    assert.equal(sceneFull.source, 'full-artifact');
    assert.equal(sceneFull.precision, 'card');
    assert.equal(sceneFull.segment, null);
    assert.equal(sceneFull.unit, null);
    assert.equal(await verifyBytes(bilingual.wavs.find(item => item.pathSuffix.endsWith('/Full_Card/EN_MULTI-SPEAKER.wav')).digest), true);
    await control('Previous card');
    await audible(paragraph.segments[0]);
    await control('Stop playback');

    await evaluate(`${reader('onStartFromSegment')}(${q(paragraph.segments[2])})`);
    await audible(paragraph.segments[2]);
    const startFrom = await current();
    assert.equal(startFrom.requestedRepresentation, 'full');
    assert.equal(startFrom.actualRepresentation, 'split');
    assert.equal(startFrom.boundary, 'document');
    await control('Stop playback');

    await evaluate(`${reader('onPlaySegment')}(${q(scene.segments[3])}, 'meaning')`);
    await audible(scene.segments[3], 'meaning');
    offlineId = await current();
    assert.equal(offlineId.speaker?.name, 'Ticket Officer');
    assert.equal(offlineId.unit?.ordinal, 2);
    assert.equal(offlineId.voice, 'id-ID-GadisNeural');
    assert.equal(offlineId.scope, 'segment');
    assert.equal(await verifyBytes(bilingual.splits.find(item => item.pathSuffix.includes('/T02_Ticket_Officer/SG01_ID_')).digest), true);
    await advance();
    await waitFor(`${player}.nowPlaying.state === 'idle'`);
  } finally {
    await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  pass('Offline QA playback reports actual Split Sentence, owner, provider bytes and duration; Stop, resume, card navigation and From Here preserve their scopes');
  return { groups, paragraphFallback, resumed, offlineId, sceneFull };
}
