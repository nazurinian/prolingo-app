import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const A = 'prolingo_text_library_d3b_qa_a1b_audio_a';
const B = 'prolingo_text_library_d3b_qa_a1b_audio_b';
export const bookAudioAuditLibraries = Object.fromEntries([A, B].map(name => [name,
  'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex')]));
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection").bookQaConnection';
const escaped = JSON.stringify;

export async function checkBookQaAudioStorage({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, readAudit, uatOrigin, withPeerTab }) {
  const passed = [];
  const pass = label => { console.log('PASS', label); passed.push(label); };
  const connect = async (name, seed) => {
    const before = await readAudit();
    await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
    await waitFor(`location.search.includes(${escaped(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
    assert.equal((await readAudit()).opens.length, before.opens.length);
    await chooseOptIn();
    const fixture = seed ? await probe(`module.seedAudioLibrary(${escaped(name)})`) : null;
    await clickButton('Load / Connect existing v2 library');
    await waitFor(`Boolean(document.querySelector('[data-book-qa-indicator]'))`);
    assert.equal(await evaluate(`${host}.audio?.name`), bookAudioAuditLibraries[name]);
    assert.equal((await readAudit()).opens.slice(before.opens.length).filter(row => row.name === bookAudioAuditLibraries[name]).length, 0);
    return fixture;
  };
  const first = await connect(A, true);
  assert.equal(await probe(`module.auditAudioAuthorization(${escaped(A)})`), true);
  assert.equal((await readAudit()).opens.filter(row => row.name === bookAudioAuditLibraries[A]).length, 0);
  pass('Audio authorization, deterministic disjoint namespace, zero companion opens before use');
  const audited = await probe(`module.exerciseBookAudio(${host}, ${escaped(first.legacyId)})`);
  audited.groups.forEach(pass);
  const recovered = await probe(`module.exerciseUncertainAndClosed(${escaped(A)})`);
  assert.ok(recovered.lostOperation && recovered.closedOperation);
  await connect(A, false);
  assert.equal(await probe(`module.verifyRestartAudio(${host}, ${escaped(recovered.closedOperation)})`), true);
  pass('Uncertain commit and old connection callback recovered after page restart without replay');
  const primary = await probe(`module.readPrimaryAudio(${host})`);
  assert.equal(primary.status, 'ready');
  assert.equal(primary.digest, audited.ready.digest);
  assert.equal(primary.id, audited.ready.id);

  const competition = await withPeerTab(uatOrigin + '/?qa=book-qa&db=' + A, async evaluatePeer => {
    assert.equal(await evaluatePeer(`(async () => {
      document.querySelector('input[aria-label="Opt in to isolated Book QA storage"]').click();
      const connect = [...document.querySelectorAll('button')].find(button => button.textContent === 'Load / Connect existing v2 library');
      for (let attempt = 0; attempt < 100 && connect.disabled; attempt++) await new Promise(resolve => setTimeout(resolve, 30));
      connect.click();
      for (let attempt = 0; attempt < 100 && !document.querySelector('[data-book-qa-indicator]'); attempt++) await new Promise(resolve => setTimeout(resolve, 30));
      window.__bookQaPeerModule = await import('/__a1a_probe.js');
      return Boolean(${host}.audio);
    })()`), true);
    const outcomes = await Promise.all([
      probe(`module.startAudioCompetition(${host})`),
      evaluatePeer(`window.__bookQaPeerModule.startAudioCompetition(${host})`)
    ]);
    return { outcomes, peerAudit: await evaluatePeer('window.__bookQaAudit') };
  });
  assert.equal(competition.outcomes.filter(outcome => outcome.status === 'committed').length, 1);
  assert.equal(competition.outcomes.filter(outcome => outcome.code === 'STALE_RESULT').length, 1);
  assert.deepEqual(competition.peerAudit.violations, []);
  assert.deepEqual(competition.peerAudit.storage, []);
  pass('Actual two-tab competing writer is fenced by library lock and snapshot fingerprint');

  const second = await connect(B, true);
  assert.equal(second.segmentId, first.segmentId);
  const isolated = await probe(`module.readPrimaryAudio(${host}, 660)`);
  assert.equal(isolated.status, 'ready');
  assert.equal(isolated.fp, primary.fp);
  assert.equal(isolated.nativeId, primary.nativeId);
  assert.notEqual(isolated.id, primary.id);
  assert.notEqual(isolated.digest, primary.digest);
  assert.equal(isolated.jobs, 1);
  await connect(A, false);
  const reloaded = await probe(`module.readPrimaryAudio(${host})`);
  assert.equal(reloaded.digest, primary.digest);
  assert.equal(reloaded.jobs, primary.jobs + 1);
  pass('Equal RF and native ID on two libraries retain separate bytes, runtime IDs and journals');
  return { passed, libraries: bookAudioAuditLibraries, primary: reloaded, isolated, recovered, concurrent: competition.outcomes };
}
