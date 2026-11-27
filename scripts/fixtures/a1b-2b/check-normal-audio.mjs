import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const name = 'prolingo_text_library_d3b_qa_bilingual_normal';
export const normalAuditLibraries = {
  [name]: 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex')
};
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const status = 'document.querySelector("[data-book-portable-status]")?.textContent';
const q = JSON.stringify;

export async function checkBookNormalAudio({ navigate, evaluate, waitFor, probe, chooseOptIn, clickButton, uatOrigin }) {
  const groups = [];
  const pass = message => { groups.push(message); console.log('PASS', message); };
  const prep = async () => {
    await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
    await waitFor(`location.search.includes(${q(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
    await chooseOptIn();
  };
  const connect = async () => {
    await clickButton('Load / Connect existing v2 library');
    await waitFor('document.querySelector("[data-book-portable-audio] summary")');
    await evaluate(`(() => {
      const audio = ${host}.audio;
      const exportNormal = audio.exportNormal;
      window.__normalAudioLock = audio.name;
      audio.exportNormal = async (...args) => {
        window.__normalOutcome = null;
        try {
          const result = await exportNormal(...args);
          window.__normalOutcome = { blob: Boolean(result.blob) };
          return result;
        } catch (error) {
          window.__normalOutcome = { code: error.code, message: error.message };
          throw error;
        }
      };
      window.__normalDownloads = [];
      document.addEventListener('click', event => {
        const anchor = event.target.closest('a[download]');
        if (anchor?.href.startsWith('blob:') && anchor.download.endsWith('.zip')) {
          event.preventDefault();
          window.__normalDownloads.push({ name: anchor.download, blob: fetch(anchor.href).then(response => response.blob()) });
        }
      }, { capture: true });
      document.querySelector("[data-book-portable-audio] summary").click();
    })()`);
    await waitFor('document.querySelector("[data-book-portable-audio] fieldset")');
    await evaluate('document.querySelector("[data-book-portable-audio] input[type=checkbox]").click()');
  };
  const available = () => evaluate('navigator.locks.request(window.__normalAudioLock, { ifAvailable: true }, lock => Boolean(lock))');
  const fingerprint = () => probe(`module.normalSnapshotFingerprint(${q(name)})`);
  const count = () => evaluate('window.__normalDownloads.length');
  const run = () => clickButton('Export Normal Audio');
  const finished = () => waitFor(`${status}?.includes('Exported') && ${status}?.includes('listening occurrences')`);

  await prep();
  const fixture = await probe(`module.seedBilingualNormal(${q(name)})`);
  await connect();
  const prepared = await probe(`module.populateBilingualNormal(${host}, ${q(fixture.workspaceId)}, ${q(fixture.speakers)})`);
  const before = await fingerprint();
  await probe('module.armNormalDecode()');
  try {
    await run();
    await waitFor('window.__normalDecode.paused');
    assert.equal(await available(), false);
    await clickButton('Cancel transfer');
  } finally { await evaluate('window.__normalDecode.restore()'); }
  await waitFor(`${status}?.includes('AUDIO_CANCELLED')`);
  const cancelled = await evaluate(`({ opened: window.__normalDecode.opened, closed: window.__normalDecode.closed, decodes: window.__normalDecode.decodes,
    status: ${status}, downloads: window.__normalDownloads.length })`);
  assert.deepEqual([cancelled.opened, cancelled.closed, cancelled.decodes, cancelled.downloads], [1, 1, 1, 0]);
  assert.equal(await available(), true);
  assert.equal(await fingerprint(), before);
  await run();
  await finished();
  assert.equal(await count(), 1);
  assert.match(await evaluate('window.__normalDownloads[0].name'), /Listening.*\.zip$/u);
  pass('Normal control cancels after native Unit decode, closes its AudioContext and lock, and retries without partial output or data changes');
  const bilingual = await probe(`module.inspectBilingualNormal(${host}, ${q(fixture.workspaceId)})`);
  assert.deepEqual([prepared.splits, prepared.units, prepared.fulls], [32, 10, 2]);
  assert.deepEqual([bilingual.splits.length, bilingual.wavs.length], [32, 12]);
  const diagnostics = await probe(`module.inspectNormalUnitDiagnostics(${host}, ${q(fixture.workspaceId)})`);
  assert.deepEqual(diagnostics, { missing: ['metadata-only', 'unavailable-unit-input'], corrupt: ['corrupt', 'unavailable-unit-input'] });
  assert.equal(await count(), 1);
  assert.equal(await fingerprint(), before);
  pass('Normal browser download preserves exact EN and ID voices, Split hashes and complete ordered PCM for each Turn, Section and trusted Full Conversation');

  await probe('module.armNormalDecode()');
  let current;
  try {
    await run();
    await waitFor('window.__normalDecode.paused');
    const external = await probe(`module.executeExternal(${q(name)}, {}, {type:'collection.create',payload:{title:'Normal export external snapshot'}})`);
    assert(external.ok, q(external.error));
    current = await fingerprint();
    assert.notEqual(current, before);
  } finally { await evaluate('window.__normalDecode.restore()'); }
  await waitFor(`${status}?.includes('STALE_RESULT')`);
  const stale = await evaluate(status);
  assert.equal(await count(), 1);
  assert.equal(await fingerprint(), current);
  assert.equal(await available(), true);
  await evaluate(`document.querySelector(${q('[aria-label="Refresh isolated Book QA library"]')}).click()`);
  await waitFor(`${host}.session.getSnapshot().collections.some(row => row.title === 'Normal export external snapshot')`);
  await run();
  await finished();
  assert.equal(await count(), 2);
  assert.equal(await fingerprint(), current);
  pass('An external authoritative write during the real Normal control yields typed stale status and zero downloads, then Refresh enables retry');

  await probe(`module.armNormalFinalRead(${q(name)})`);
  try {
    await run();
    await waitFor('window.__normalFinalRead.paused');
    assert.equal(await available(), false);
    await evaluate(`${host}.session.dispose()`);
  } finally { await evaluate('window.__normalFinalRead.restore()'); }
  await waitFor('window.__normalOutcome');
  const disposed = await evaluate(`({ outcome: window.__normalOutcome, status: ${status} ?? null })`);
  assert.match(disposed.outcome.code ?? '', /^AUDIO_(CANCELLED|CONNECTION_CLOSED)$/u, q(disposed));
  if (disposed.status !== null) assert.match(disposed.status, /AUDIO_(CANCELLED|CONNECTION_CLOSED)/u);
  assert.equal(await count(), 2);
  assert.equal(await available(), true);
  assert.equal(await fingerprint(), current);
  await prep();
  await connect();
  await run();
  await finished();
  assert.equal(await count(), 1);
  assert.equal(await fingerprint(), current);
  pass('Disposal during the final durable read produces a typed failure and no download, with a successful new connection');
  return { groups, workspaceId: fixture.workspaceId, bilingual, diagnostics, cancelled, stale, disposed };
}
