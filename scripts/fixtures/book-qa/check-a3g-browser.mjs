import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const a3gLibrary = 'prolingo_text_library_d3b_qa_a3g_browser';
export const a3gLibraries = { [a3gLibrary]: 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(a3gLibrary).digest('hex') };
const q = JSON.stringify;
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const settings = '[data-book-playback-settings]';
const reader = '[data-text-structured-player]';

export async function checkBookQaA3G({ evaluate, waitFor, navigate, chooseOptIn, clickButton, probe, uatOrigin }) {
  const checks = [];
  const pass = name => { checks.push(name); console.log('PASS', name); };
  const selector = label => '[data-global-player] button[aria-label="' + label + '"]';
  const click = async query => {
    await waitFor(`document.querySelector(${q(query)}) && !document.querySelector(${q(query)}).disabled`);
    await evaluate(`document.querySelector(${q(query)}).click(); true`);
  };
  const control = label => click(selector(label));
  const now = () => evaluate(`${player}.nowPlaying`);
  const at = (segment, channel = 'text') => waitFor(`${player}.transport.phase === 'playing'
    && ${player}.nowPlaying.segment?.id === ${q(segment.id)} && ${player}.nowPlaying.channel === ${q(channel)}`);
  const phase = value => waitFor(`${player}.transport.phase === ${q(value)}`);
  const stop = async () => { await control('Stop playback'); await phase('idle'); };
  const speakNext = () => evaluate('speechSynthesis.finish(); true');
  const change = (query, value, type = 'select') => evaluate(`(() => {
    const el = document.querySelector(${q(query)});
    if (!el) throw Error('Missing field ' + ${q(query)});
    el.focus();
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${q(String(value))});
    el.dispatchEvent(new Event(${q(type === 'select' ? 'change' : 'input')}, { bubbles: true }));
    if (${q(type)} === 'number') el.blur();
    return el.value;
  })()`);
  const setting = async (label, value, options = {}) => {
    const numeric = await evaluate(`(() => {
    const scope = [...document.querySelectorAll('${settings} fieldset')].find(el => el.querySelector('legend').textContent === ${q(options.group)});
    const el = [...(scope || document.querySelector('${settings}')).querySelectorAll('label')].find(label => label.firstChild.textContent.trim() === ${q(label)})?.querySelector('input,select');
    if (!el) throw Error('Missing setting ' + ${q(label)});
    el.focus(); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${q(String(value))});
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    return el.type === 'number';
  })()`);
    if (numeric) await evaluate('document.activeElement.blur(); true');
  };
  const toggle = (label, value) => evaluate(`(() => {
    const el = [...document.querySelectorAll('[data-book-interaction] label')].find(label => label.textContent.trim() === ${q(label)}).querySelector('input');
    if (el.checked !== ${value}) el.click(); return el.checked;
  })()`);
  const textTarget = (segment, channel = 'text') => click(`[data-text-player-segment="${segment.id}"][data-shared-card-channel="${channel}"][role="button"]`);
  const mode = async value => {
    await click(`[data-shared-reader-mode-option="${value}"]`);
    await waitFor(`document.querySelector('[data-shared-card-bilingual-toolbar]')?.dataset.sharedReaderMode === ${q(value)}`);
  };

  await navigate(uatOrigin, '/?qa=book-qa&db=' + a3gLibrary);
  await waitFor(`location.search.includes(${q(a3gLibrary)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
  await chooseOptIn();
  await clickButton('Initialize A2 demo library');
  await waitFor(`document.querySelector('${reader}')`);
  await click('[data-text-main-reader-option="shared"]');
  await waitFor(`document.querySelector('[data-shared-card-bilingual-toolbar]')`);
  const data = await evaluate(`(() => {
    const snapshot = ${host}.session.getSnapshot();
    const document = snapshot.documents.find(item => item.documentType === 'mixed');
    const cards = snapshot.blocks.filter(card => card.documentId === document.id).sort((a,b) => a.order-b.order);
    const units = snapshot.contentUnits.filter(unit => unit.blockId === cards[0].id).sort((a,b) => a.order-b.order);
    const segments = snapshot.segments.filter(segment => segment.blockId === cards[0].id).sort((a,b) => a.order-b.order);
    return { document, cards, units, segments };
  })()`);
  const [first, second, third, fourth] = data.segments;
  assert(first.meaning && second.meaning && data.units.length >= 2);
  await change('[data-app-header] select', data.document.id);
  await waitFor(`${host}.session.getState().view.selection.workspaceId === ${q(data.document.id)}`);
  await mode('full');
  await click('[data-shared-reading-language-option="en-id"]');
  await click(settings + ' summary');
  const defaults = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-book-timing] select')].map(el => [el.parentElement.firstChild.textContent.trim(), Number(el.value)]))`);
  assert.deepEqual(Object.values(defaults), [0, 0, 200, 350, 750, 400, 500]);
  const reset = () => evaluate(`[...document.querySelectorAll('${settings} button')].find(button => button.textContent === 'Reset playback delays').disabled`);
  assert.equal(await reset(), true);
  await setting('Channel Delay', 250);
  await waitFor(`![...document.querySelectorAll('${settings} button')].find(button => button.textContent === 'Reset playback delays').disabled`);
  await setting('Channel Delay', 0);
  await waitFor(`[...document.querySelectorAll('${settings} button')].find(button => button.textContent === 'Reset playback delays').disabled`);
  await setting('Global sequence', 'text-meaning');
  await setting('From Here boundary', 'unit');
  await setting('Channel Delay', 250);
  await toggle('Tap to Play', false);
  await toggle('Continue From Here', true);
  await textTarget(third);
  await phase('idle');
  await control('Start playback');
  await at(third);
  const firstSession = await now();
  assert.equal(firstSession.boundary, 'unit');
  assert.equal(await evaluate(`document.querySelector(${q(selector('Previous sentence'))}).disabled`), true);
  await speakNext();
  await phase('waiting');
  await control('Pause playback');
  await phase('paused');
  const waited = await evaluate(`(async () => {
    const events = window.__bookQaSpeech.filter(item => item[0] === 'speak').length;
    await new Promise(resolve => setTimeout(resolve, 320));
    return { unchanged: events === window.__bookQaSpeech.filter(item => item[0] === 'speak').length, timeline: ${player}.nowPlaying.timeline };
  })()`);
  assert.deepEqual(waited, { unchanged: true, timeline: null });
  await control('Resume playback');
  await at(third, 'meaning');
  assert.equal((await now()).sessionId, firstSession.sessionId);
  await stop();
  assert.equal(await evaluate(`${player}.transport.ready.channel`), 'meaning');
  await control('Start playback');
  await at(third, 'meaning');
  await stop();
  await setting('Play after Stop', 'restart');
  assert.equal(await evaluate(`${player}.transport.ready.channel`), 'text');
  await control('Start playback');
  await at(third);
  await control('Pause playback');
  const paused = await now();
  await control('Next sentence');
  await phase('paused');
  assert.equal((await now()).sessionId, paused.sessionId);
  await control('Resume playback');
  await at(fourth);
  assert.equal((await now()).sessionId, paused.sessionId);
  assert.equal(await evaluate(`document.querySelector(${q(selector('Next sentence'))}).disabled`), true);
  await stop();
  await clickButton('Reset playback delays');
  assert.equal(await reset(), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('${settings} label')].find(el => el.firstChild.textContent === 'Global sequence').querySelector('select').value`), 'text-meaning');
  pass('G-P2/G-P4 scoped From Here, exact ID Continue, bounded Restart, paused Next, timing defaults and scoped Reset');

  await toggle('Continue From Here', false);
  await textTarget(first);
  await phase('idle');
  await control('Start playback');
  await at(first);
  assert.equal((await now()).scope, 'segment');
  await textTarget(second);
  assert.equal((await now()).segment.id, first.id);
  await stop();
  await control('Start playback');
  await at(second);
  await stop();
  await toggle('Tap to Play', true);
  await textTarget(first, 'meaning');
  await at(first, 'meaning');
  assert.equal((await now()).commandTarget.channel, 'meaning');
  await stop();
  await toggle('Continue From Here', true);
  await setting('Channel sequence', 'meaning-text', { group: 'Manual Segment' });
  await setting('Channel sequence', 'text-only', { group: 'From Here' });
  await textTarget(first);
  await at(first, 'meaning');
  assert.equal((await now()).scope, 'from-here');
  const viewOwner = (await now()).sessionId;
  for (const view of ['card', 'focus', 'segment', 'full']) {
    await mode(view);
    assert.equal((await now()).sessionId, viewOwner);
  }
  await speakNext();
  await at(first);
  await speakNext();
  await at(second);
  await stop();
  pass('G-P3 all four text interaction cases, pending priority and one owner through Full/Card/Focus/Segment view switches');

  await mode('focus');
  await toggle('Tap to Play', false);
  await toggle('Follow Playback', false);
  const focused = `[data-shared-card-id="${data.cards[0].id}"] [data-shared-part-focused-unit-id]`;
  const firstUnitSelector = `[data-shared-card-id="${data.cards[0].id}"] [data-shared-focus-rail-unit-id="${data.units[0].id}"]`;
  const secondUnitSelector = `[data-shared-card-id="${data.cards[0].id}"] [data-shared-focus-rail-unit-id="${data.units[1].id}"]`;
  await click(firstUnitSelector);
  await waitFor(`document.querySelector(${q(focused)})?.dataset.sharedPartFocusedUnitId === ${q(data.units[0].id)}`);
  // Start the authored second Unit from its own explicit action.
  await click(secondUnitSelector);
  await click(`[data-book-unit-from="${data.units[1].id}"]`);
  const secondUnitFirst = data.segments.find(item => item.unitId === data.units[1].id);
  await at(secondUnitFirst);
  await click(firstUnitSelector);
  await waitFor(`document.querySelector(${q(focused)})?.dataset.sharedPartFocusedUnitId === ${q(data.units[0].id)}`);
  const returning = (await now()).sessionId;
  await click('[data-book-return-to-playing]');
  await waitFor(`document.querySelector(${q(focused)})?.dataset.sharedPartFocusedUnitId === ${q(data.units[1].id)}`);
  assert.equal((await now()).sessionId, returning);
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-book-interaction] label')].find(label => label.textContent.trim() === 'Follow Playback').querySelector('input').checked`), false);
  await click(firstUnitSelector);
  await toggle('Follow Playback', true);
  await waitFor(`document.querySelector(${q(focused)})?.dataset.sharedPartFocusedUnitId === ${q(data.units[0].id)}`);
  await control('Next sentence');
  const nextInUnit = data.segments.filter(item => item.unitId === data.units[1].id)[1];
  await at(nextInUnit);
  await waitFor(`document.querySelector(${q(focused)})?.dataset.sharedPartFocusedUnitId === ${q(data.units[1].id)}`);
  assert.equal((await now()).sessionId, returning);
  pass('G-P3 explicit Unit From Here, independent Focus, one-shot return and Follow restoration on the next actual sentence');
  const persisted = await probe(`module.readCompleteLibrary(${q(a3gLibrary)})`);
  return { checks, defaults, pausedWait: waited, persisted, document: data.document.id, currentOwner: (await now()).sessionId };
}

export async function checkBookUatTabBoundaries({ evaluate, waitFor, clickButton, chooseOptIn, probe, readAudit, starting }) {
  const database = a3gLibrary;
  const tab = name => evaluate(`[...document.querySelectorAll('[data-uat-tabs] a')].find(link => link.textContent === ${q(name)}).click(); true`);
  await tab('Legacy');
  await waitFor(`location.search.includes('qa=legacy-uat') && document.querySelector('[data-uat-legacy-gate]')`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-global-player]').length`), 0);
  assert.equal(await evaluate(`navigator.mediaSession?.metadata ?? null`), null);
  const legacy = await readAudit();
  assert.deepEqual(legacy.opens, starting.opens);
  assert.deepEqual(legacy.writes, starting.writes);
  await tab('Table');
  await waitFor(`location.search.includes('qa=table-uat') && [...document.querySelectorAll('button')].some(button => button.textContent.includes('Open Table workspace'))`);
  await clickButton('Open Table workspace');
  await waitFor(`document.querySelectorAll('[data-global-player]').length === 1`);
  await evaluate(`document.querySelector('[data-global-player] [aria-label="Start playback"]').click(); true`);
  await waitFor(`window.__bookQaSpeech.some(event => event[0] === 'speak' && event[1] === 'abandon')`);
  assert.equal((await evaluate(`${player}.nowPlaying`)).domain, 'table');
  const native = await readAudit();
  const opens = native.opens.slice(starting.opens.length);
  const writes = native.writes.slice(starting.writes.length);
  assert(![...opens, ...writes].some(entry => entry.name === 'prolingo_text_library' || entry.name.startsWith('prolingo_text_library_d3b_qa_')
    || entry.name.startsWith('prolingo_book_qa_audio')));
  await tab('Book');
  await waitFor(`location.search.includes(${q(database)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-global-player]').length`), 0);
  assert.equal(await evaluate(`navigator.mediaSession?.metadata ?? null`), null);
  await chooseOptIn();
  await clickButton('Load / Connect existing v2 library');
  await waitFor(`document.querySelectorAll('[data-global-player]').length === 1`);
  assert.equal((await evaluate(`${player}.nowPlaying`)).state, 'idle');
  assert.equal(await evaluate(`window.__bookQaSpeech.filter(item => item[0] === 'speak').length`), 0);
  return { legacyGate: true, tablePlayback: true, nativeOpens: [...new Set(opens.map(entry => entry.name))],
    nativeWrites: [...new Set(writes.map(entry => entry.name))], reconnect: (await probe(`module.readCompleteLibrary(${q(database)})`)).snapshot };
}
