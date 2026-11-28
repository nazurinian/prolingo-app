import assert from 'node:assert/strict';

const q = JSON.stringify;

export async function checkHf2Archives({ evaluate, waitFor, clickButton, click, change, openBody,
  run, record, result, selectMode, host, body, mixed, selectWorkspace, probe }) {
  await selectWorkspace(mixed);
  await selectMode('card');
  await openBody();
  await change(body + ' select', 'text');
  await evaluate(`window.__hf2Clean = ${host}.session.getSnapshot()`);
  await run('Generate Workspace Split', '37 committed');
  await run('Generate Card Full', '1 committed');
  await run('Verify Card audio', '9 ready');
  const verifyTable = () => evaluate(`Array.from(document.querySelectorAll('${body} [data-book-coverage-row]'), row => ({
    group: row.dataset.bookCoverageRow, en: row.cells[1].textContent, id: row.cells[2].textContent
  }))`);
  const cardCoverage = await verifyTable();
  await run('Verify Workspace audio', '38 ready, 3 missing');
  const workspaceCoverage = await verifyTable();
  assert(cardCoverage.some(row => row.group === 'split' && row.en.includes('8/8') && row.id.includes('0/8')));
  assert(workspaceCoverage.some(row => row.group === 'split' && row.en.includes('37/37') && row.id.includes('0/37')));
  assert(workspaceCoverage.some(row => row.group === 'section-composition' && row.en.includes('3/3')));
  assert(workspaceCoverage.some(row => row.group === 'turn-composition' && row.en.includes('8/8')));
  assert(workspaceCoverage.some(row => row.group === 'main-title' && row.en.includes('1 Missing')));
  result.observations.coverage = { card: cardCoverage, workspace: workspaceCoverage };
  record('London fixture reproduces 9 Card Ready and 38 Workspace Ready / 3 Full Missing');

  await click('[data-book-portable-audio] summary');
  await waitFor(`document.querySelector('[data-book-portable-audio][open] [name=listeningProfile]')`);
  await evaluate(`(() => {
    const audio = ${host}.audio;
    const capture = (method, kind) => {
      const run = audio[method];
      audio[method] = async (...args) => {
        const value = await run(...args);
        window.__hf2Archives[kind] = value;
        return value;
      };
    };
    window.__hf2Archives = {};
    window.__hf2ArchiveNames = [];
    document.addEventListener('click', event => {
      if (event.target instanceof HTMLAnchorElement && event.target.download) window.__hf2ArchiveNames.push(event.target.download);
    });
    capture('exportPortable', 'portable');
    capture('exportNormal', 'listening');
  })()`);
  const exportZip = async (label, status) => {
    await clickButton(label);
    await waitFor(`document.querySelector('[data-book-portable-status]')?.textContent.includes(${q(status)})`, 30000);
  };
  assert.equal(await evaluate(`document.querySelector('[name=listeningProfile]').value`), 'current');
  assert.equal(await evaluate(`document.querySelector('[data-book-portable-audio] input[type=checkbox]').checked`), true);
  await exportZip('Export Portable Audio', '38 verified assets');
  await exportZip('Export Normal Audio', '49 listening occurrences');
  const portable = await probe('module.inspectHf2Archive(window.__hf2Archives.portable.blob)');
  const listening = await probe('module.inspectHf2Archive(window.__hf2Archives.listening.blob)');
  const manifest = await evaluate(`window.__hf2Archives.portable.manifest`);
  const digestSet = files => files.filter(file => file.path.endsWith('.mp3')).map(file => file.digest).sort();
  assert.equal(manifest.packageVersion, 3);
  assert.equal(manifest.references.length, 38);
  assert.equal(portable.length, 40);
  assert.equal(listening.filter(file => file.path.endsWith('.wav') && file.sampleRate === 48000).length, 11);
  assert.deepEqual(digestSet(portable), digestSet(listening));
  for (const asset of manifest.assets) assert.equal(portable.find(item => item.path === asset.path)?.digest, asset.digest);
  assert(!listening.some(file => file.path.includes('_ID_')));
  const additive = await probe(`module.importHf2ArchiveToCleanSnapshot(window.__hf2Clean, ${q(mixed.id)}, window.__hf2Archives.portable.blob)`);
  assert.equal(additive.report.stopped, null);
  assert.equal(additive.report.logicalCommitted, 38);
  assert.equal(additive.splitReferences, 37);
  const reimport = await evaluate(`(async () => {
    const result = await ${host}.audio.importPortable([new File([window.__hf2Archives.portable.blob], 'roundtrip.zip')], { workspaceId: ${q(mixed.id)} });
    return { alreadyAvailable: result.alreadyAvailable, logicalCommitted: result.logicalCommitted, stopped: result.stopped };
  })()`);
  assert.deepEqual(reimport, { alreadyAvailable: 38, logicalCommitted: 0, stopped: null });
  const names = await evaluate('window.__hf2ArchiveNames');
  assert.match(names[0], /^PL_PORTABLE__A_Journey_to_London__\d{8}T\d{6}(?:\.\d{3})?Z\.zip$/u);
  assert.match(names[1], /^PL_LISTENING__A_Journey_to_London__\d{8}T\d{6}(?:\.\d{3})?Z\.zip$/u);
  result.observations.archives = { names, portable, listening,
    manifest: { version: manifest.packageVersion, assets: manifest.assets.length, references: manifest.references.length },
    additive: { committed: additive.report.logicalCommitted, splitReferences: additive.splitReferences }, reimport };
  record('Actual Reader ZIP downloads, matching digests, generated Unit WAVs and Portable roundtrip');

  await change(body + ' [name=rate]', 20);
  await clickButton('Set session audio defaults');
  await run('Generate Sentence', '1 committed');
  await change(body + ' [name=rate]', 0);
  await clickButton('Set session audio defaults');
  await exportZip('Export Portable Audio', '39 verified assets');
  await exportZip('Export Normal Audio', '49 listening occurrences');
  await exportZip('Check coverage and profiles', 'profiles verified');
  const profile = await evaluate(`Array.from(document.querySelector('[name=listeningProfile]').options).find(option => option.textContent.includes('render 20%'))?.value`);
  assert(profile);
  await change('[name=listeningProfile]', profile);
  await exportZip('Export Normal Audio', '1 listening occurrences');
  const exact = await probe('module.inspectHf2Archive(window.__hf2Archives.listening.blob)');
  assert.equal(exact.length, 1);
  assert.match(exact[0].path, /SG01_EN_EDGE_SONIA_R\+20Pct\.mp3$/u);
  result.observations.exactSelection = exact[0];
  record('Portable defaults to alternates while Listening defaults to current and supports exact recorded selection');
}
