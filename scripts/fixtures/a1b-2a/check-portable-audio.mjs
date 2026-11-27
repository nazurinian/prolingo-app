import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const names = ['prolingo_text_library_d3b_qa_portable_source', 'prolingo_text_library_d3b_qa_portable_dest'];
export const portableAuditLibraries = Object.fromEntries(names.map(name =>
  [name, 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex')]));
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const player = 'window.__bookQaProps("[data-global-player]", "readPlayer", true).readPlayer()';
const q = JSON.stringify;
const portableRoot = '[data-book-portable-audio]';

export async function checkBookPortableAudio({ navigate, evaluate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, call }) {
  const groups = [];
  const pass = message => { groups.push(message); console.log('PASS', message); };
  const prep = async name => {
    await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
    await waitFor(`location.search.includes(${q(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
    await chooseOptIn();
  };
  const connect = async () => {
    await clickButton('Load / Connect existing v2 library');
    await waitFor(`document.querySelector('${portableRoot} summary')`);
  };
  const click = selector => evaluate(`document.querySelector(${q(selector)}).click()`);
  const change = (selector, value) => evaluate(`(() => {
    const element = document.querySelector(${q(selector)});
    const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${q(value)});
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  })()`);
  const select = async id => {
    await change('[data-app-header] select', id);
    await waitFor(`document.querySelector('[data-app-header] select').value === ${q(id)}`);
  };
  const transfer = (id, files, mode = null) => probe(`module.importPortableFixture(${host}, ${q(id)}, ${q(files)}, ${q(mode)})`);
  const transport = label => click(`[data-global-player] button[aria-label="${label}"]`);
  const identity = id => evaluate(`(() => {
    const snapshot = ${host}.session.getSnapshot(), workspace = snapshot.documents.find(row => row.id === ${q(id)});
    return {
      workspace: [workspace.id, workspace.uid, workspace.title, workspace.order, workspace.collectionId],
      body: ['blocks', 'contentUnits', 'segments'].map(store => snapshot[store].filter(row => row.documentId === workspace.id)
        .map(row => [row.id, row.uid, row.documentId, row.blockId, row.unitId, row.order, row.title, row.text, row.meaning]))
    };
  })()`);

  await prep(names[0]);
  const source = await probe(`module.seedPortableSource(${q(names[0])})`);
  await connect();
  const data = await probe(`module.buildPortableFixture(${host}, ${q(source.workspaceId)})`);
  const kinds = [...new Set(data.manifest.references.map(ref => ref.representation))].sort();
  assert.deepEqual(kinds, ['full-conversation', 'full-paragraph', 'main-title', 'paragraph-heading', 'scene-heading', 'split']);
  assert.deepEqual(data.manifest.references.filter(ref => ref.fingerprint === data.first.fingerprint).map(row => row.representation).sort(),
    ['main-title', 'paragraph-heading', 'split']);
  assert.equal(data.manifest.assets.filter(asset => asset.fingerprint === data.first.fingerprint).length, 1);
  assert(data.manifest.references.length > 32);
  await click(portableRoot + ' summary');
  await waitFor(`document.querySelector('${portableRoot} input[type="file"]')`);
  await evaluate(`document.addEventListener('click', event => {
    const anchor = event.target.closest('a[download]');
    if (anchor?.href.startsWith('blob:')) { event.preventDefault(); window.__portableDownload = anchor.download; }
  }, { capture: true })`);
  await clickButton('Export Portable Audio');
  await waitFor(`window.__portableDownload?.endsWith('.zip') && document.querySelector('[data-book-portable-status]')?.textContent.includes('Exported')`);
  pass('Scoped v3 export captures six representations, alternate profiles and three RF consumers on one asset');

  await prep(names[1]);
  const dest = await probe(`module.seedPortableDestination(${q(names[1])}, ${q(source.pack)})`);
  await connect();
  assert.notEqual(dest.preserve, source.workspaceId);
  const beforePreserve = await identity(dest.preserve), beforeCopy = await identity(dest.copy);
  const unrelated = await probe(`module.seedUnrelatedPortableAudio(${host}, ${q(dest.decoy)})`);
  const first = await transfer(dest.preserve, [data.partA]);
  assert.equal(first.stopped, null, q(first));
  assert.equal(first.logicalCommitted, data.partACount);
  assert(first.physicalStored < first.logicalCommitted);
  const next = await transfer(dest.preserve, [data.partB]);
  assert.equal(next.stopped, null, q(next));
  assert.equal(next.logicalCommitted, data.partBCount);
  assert(next.otherProfile > 0);
  assert(next.logical.some(row => row.status === 'unverified-composition'));
  const reread = await transfer(dest.preserve, [data.partA, data.partB]);
  assert.equal(reread.stopped, null, q(reread));
  assert.equal(reread.logicalCommitted, 0);
  assert.equal(reread.physicalStored, 0);
  assert.equal(reread.alreadyAvailable, data.manifest.references.length);
  assert(reread.batches.every(batch => batch.operationId === null));
  assert.equal(await evaluate(`(async () => (await ${host}.audio.readRuntime(${q(unrelated)})).status)()`), 'ready');
  const state = await probe(`module.readPortableFixtureBindings(${host}, ${q(dest.preserve)}, ${q({ derived: data.derived, alternate: data.alternate })})`);
  assert.deepEqual(state.states, ['ready', 'ready', 'ready', 'ready', 'ready']);
  assert.equal(state.shared, true);
  assert.equal(state.compositionTrusted, false);
  assert.deepEqual(state.identity, [source.workspaceUid, source.segmentUid, 4, 11, 37]);
  assert.deepEqual(await identity(dest.preserve), beforePreserve);
  pass('Separate ZIP A and B merge, grouped reimport is a no-op, UID remapping and unrelated destination audio held');

  const historical = await transfer(dest.preserve, data.historical);
  assert.equal(historical.stopped, null, q(historical));
  assert.equal(historical.physicalValidated, data.historical.length);
  assert.equal(historical.alreadyAvailable, 1);
  const loose = await transfer(dest.preserve, data.loose);
  assert.equal(loose.physicalValidated, 2);
  assert.equal(loose.alreadyAvailable, 2);
  const problems = await transfer(dest.preserve, data.problems);
  assert.deepEqual(problems.issues.map(issue => issue.status), ['corrupt', 'corrupt', 'invalid-archive']);
  assert.equal(problems.logicalCommitted, 0);
  const conflicting = await transfer(dest.preserve, [data.conflicting]);
  assert.equal(conflicting.logicalCommitted, 0);
  assert.equal(conflicting.stopped?.code, 'AUDIO_BYTE_CONFLICT');
  const crossArchive = await transfer(dest.preserve, [data.partA, data.conflicting]);
  assert(crossArchive.issues.some(issue => issue.status === 'conflict' && issue.fingerprint === data.first.fingerprint));
  assert.equal(crossArchive.logicalCommitted, 0);
  pass('Legacy v1/v2 and loose RF/Full bytes validate, while digest, invalid codec, duplicate manifest and accepted-byte conflicts fail closed');

  const missingInputs = await transfer(dest.copy, [data.derivedOnly]);
  assert.equal(missingInputs.physicalValidated, 1);
  assert.equal(missingInputs.logicalCommitted, 0);
  assert.equal(missingInputs.logical[0].status, 'unverified-composition');
  const interrupted = await transfer(dest.copy, [data.complete], 'cancel');
  assert.equal(interrupted.stopped?.code, 'AUDIO_CANCELLED');
  assert.equal(interrupted.logicalCommitted, 32);
  assert.equal(interrupted.batches.length, 1);
  assert((await probe(`module.executeExternal(${q(names[1])}, {}, {type:'collection.create',payload:{title:'Portable external writer'}})`)).ok);
  const stale = await transfer(dest.copy, [data.complete]);
  assert.equal(stale.stopped?.code, 'STALE_RESULT');
  assert.equal(stale.logicalCommitted, 0);
  await evaluate(`${host}.refresh()`);
  const uncertain = await transfer(dest.copy, [data.complete], 'uncertain');
  assert.equal(uncertain.stopped?.status, 'uncertain');
  assert(uncertain.stopped.reloadRequired);
  assert.equal(uncertain.logicalCommitted, 0);
  await evaluate(`${host}.refresh()`);
  const complete = await transfer(dest.copy, [data.complete]);
  assert.equal(complete.stopped, null, q(complete));
  assert(complete.alreadyAvailable > interrupted.logicalCommitted);
  assert.equal(complete.alreadyAvailable + complete.logicalCommitted, data.manifest.references.length);
  const copy = await probe(`module.readPortableFixtureBindings(${host}, ${q(dest.copy)}, ${q({ derived: data.derived, alternate: data.alternate })})`);
  assert.notEqual(copy.identity[0], source.workspaceUid);
  assert.notEqual(copy.identity[1], source.segmentUid);
  assert.deepEqual(copy.identity.slice(2), [4, 11, 37]);
  assert.deepEqual(await identity(dest.copy), beforeCopy);
  assert.equal(copy.shared, true);
  pass('New-copy transfer preserves London and stops at batch boundaries, reconciles stale writers and uncertain receipts without replay');

  await prep(names[1]);
  await connect();
  await select(dest.preserve);
  await click('[data-book-heading-audio] summary');
  await waitFor('document.querySelector("[data-book-heading-audio] input[name=edgeTextVoiceId]")');
  await change('[data-book-heading-audio] input[name="edgeTextVoiceId"]', 'en-GB-SoniaNeural');
  await clickButton('Set session Global voices');
  await waitFor('document.querySelector("[data-book-heading-status]")?.textContent.includes("updated")');
  await clickButton('Play selected channel');
  await waitFor(`${player}.nowPlaying.heading?.key === 'mainTitle' && ${player}.nowPlaying.source === 'generated' && ${player}.media?.duration > 0`);
  assert.equal(await evaluate(`${player}.nowPlaying.voice`), 'en-GB-SoniaNeural');
  await transport('Stop playback');
  await click('[aria-label="Read Conversation Scene Heading"]');
  await waitFor('document.querySelector("[data-book-heading-status]")?.textContent.includes("saved")');
  await transport('Expand player details');
  await waitFor('document.querySelector("[data-text-global-player-controls] button")');
  await click('[data-text-global-player-controls] button');
  await waitFor('document.querySelector("[data-text-global-player-controls] button")?.textContent.includes("Saved Full")');
  await transport('Collapse player details');
  const scene = await evaluate(`${host}.session.getSnapshot().blocks.find(row => row.documentId === ${q(dest.preserve)} && row.blockType === "conversation").id`);
  await click(`[data-text-player-card="${scene}"] button[data-text-card-play-compact]`);
  await waitFor(`${player}.nowPlaying.card?.id === ${q(scene)} && ${player}.nowPlaying.actualRepresentation === 'split'`);
  assert.equal(await evaluate(`${player}.nowPlaying.representationFallback`), true);
  await transport('Stop playback');
  pass('Imported recorded Main Title plays after reconnect, while imported Conversation Full uses truthful per-Sentence fallback');

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await waitFor('window.innerWidth === 390 && document.querySelector(\'[data-mobile-controls-toggle][aria-label="Close Controls"]\')?.getClientRects().length');
  await click('[data-mobile-controls-toggle][aria-label="Close Controls"]');
  await waitFor(`document.querySelector('${portableRoot} summary')?.getClientRects().length`);
  await click(portableRoot + ' summary');
  const fileSelector = portableRoot + ' input[type="file"]';
  await waitFor(`document.querySelector(${q(fileSelector)})`);
  await evaluate(`(() => {
    const file = new File([Uint8Array.from(atob(${q(data.partA)}), value => value.charCodeAt(0))], 'incremental.zip', { type: 'application/zip' });
    const input = document.querySelector(${q(fileSelector)});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await clickButton('Import selected files');
  await waitFor(`document.querySelector('[data-book-portable-status]')?.textContent.includes('0 references committed and ${data.partACount} already available')`);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 920, deviceScaleFactor: 1, mobile: false });
  pass('The real mobile panel imports selected ZIPs through the same bounded Workspace capability');
  return { groups, first, next, reread, interrupted, stale, uncertain, complete };
}
