import assert from 'node:assert/strict';

const selector = {
  gate: '[data-book-qa-host="disconnected"]',
  indicator: '[data-book-qa-indicator]',
  desktop: '[data-text-data-workspace]',
  mobile: '[data-text-mobile-full-workspace]',
  refresh: '[aria-label="Refresh isolated Book QA library"]',
  player: '[data-global-player]'
};
const quoted = JSON.stringify;

export async function checkBookQaHostBoundaries({
  call, evaluate, waitFor, clickButton, navigate, chooseOptIn, readAudit, probe, qaDbName, uatOrigin
}) {
  const passed = [];
  const check = async (label, run) => { await run(); passed.push(label); console.log('PASS', label); };
  const present = query => `Boolean(document.querySelector(${quoted(query)}))`;
  const click = async query => {
    await waitFor(`${present(query)} && !document.querySelector(${quoted(query)}).disabled`);
    await evaluate(`document.querySelector(${quoted(query)}).click(); true`);
  };
  const clickByLabel = label => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.getClientRects().length && !item.disabled && item.textContent.trim().startsWith(${quoted(label)}));
    if (!button) throw Error('Missing action ' + ${quoted(label)});
    button.click();
    return true;
  })()`);
  const change = (query, value) => evaluate(`(() => {
    const input = document.querySelector(${quoted(query)});
    const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${quoted(value)});
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    return true;
  })()`);
  const open = async (dbName, action) => {
    await navigate(uatOrigin, `/?qa=book-qa&db=${dbName}`);
    await waitFor(`${present(selector.gate)} && location.search.includes(${quoted(dbName)})`);
    await chooseOptIn();
    await clickButton(action);
    await waitFor(present(selector.indicator));
  };
  const state = dbName => probe(`module.readCompleteLibrary(${quoted(dbName)})`);
  const current = () => evaluate('window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection").bookQaConnection.session.getState()');
  const select = async workspaceId => {
    await change('[data-app-header] select', workspaceId);
    await waitFor(`document.querySelector('[data-app-header] select')?.value === ${quoted(workspaceId)}`);
  };
  const refresh = () => evaluate('window.__bookQaProps("[data-book-qa-indicator]", "onBookQaRefresh").onBookQaRefresh().then(() => true, error => error.code || error.message)');
  const closeData = () => click('[aria-label="Close Text Data workspace"]');
  const alternate = 'prolingo_text_library_d3b_qa_hf1_empty';

  await closeData();
  const original = await state(qaDbName);
  await check('Empty second library, exact DB targets and unchanged first library', async () => {
    await open(alternate, 'Initialize empty v2 library');
    const empty = await state(alternate);
    assert.equal(empty.snapshot.schemaVersion, 2);
    assert.deepEqual(empty.snapshot.documents, []);
    assert.equal((await readAudit()).opens.at(-1).name, alternate);
  });
  await check('UI creates and renames Collection and Workspace, moves and selects stable identity', async () => {
    await clickButton('OPEN DATA WORKSPACE');
    await clickButton('CREATE');
    await clickByLabel('Create Book Collection');
    await change('[placeholder="Book Collection title"]', 'HF1 collection');
    await clickButton('Create Book Collection');
    await waitFor(`document.querySelector('[data-text-library-demos] button')?.disabled === false`);
    await clickByLabel('Create Workspace');
    await change('[placeholder="Workspace title"]', 'HF1 workspace');
    await clickButton('Create & Open');
    await waitFor(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.includes('HF1 workspace')`);
    const before = (await state(alternate)).snapshot.documents[0];
    await clickButton('MANAGE');
    await click('[data-text-library-crud] button:first-of-type');
    await change('input[value="HF1 workspace"]', 'HF1 renamed');
    await click('input[value="HF1 renamed"] + button');
    await waitFor(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.includes('HF1 renamed')`);
    const collection = (await state(alternate)).snapshot.collections[0];
    await clickButton('Move');
    await change('[data-text-document-move] select', collection.id);
    await clickButton('Move Here');
    await waitFor(`!document.querySelector('[data-text-document-move]')`);
    await evaluate(`[...document.querySelectorAll('[data-text-library-crud] button')].filter(x => x.textContent.trim() === 'Rename').at(-1).click(); true`);
    await change('input[value="HF1 collection"]', 'HF1 renamed collection');
    await click('input[value="HF1 renamed collection"] + button');
    await waitFor(`document.querySelector('[data-text-library-crud]')?.textContent.includes('HF1 renamed collection')`);
    const after = (await state(alternate)).snapshot.documents[0];
    assert.equal(after.id, before.id);
    assert.ok(before.uid);
    assert.equal(after.uid, before.uid);
    assert.equal(after.collectionId, collection.id);
    await clickButton('LIBRARY');
    await clickByLabel('HF1 renamed');
    assert.equal((await current()).view.selection.workspaceId, before.id);
  });

  await check('T1 Main Title input, repair-safe mode changes and reconnect in the real App', async () => {
    const title = '[data-book-main-title]';
    const mainEn = '[data-text-data-workspace] fieldset input[required]';
    const mainId = '[data-text-data-workspace] fieldset input:not([type="checkbox"]):not([required])';
    const inherited = '[data-text-data-workspace] fieldset input[type="checkbox"]';
    await clickButton('CREATE');
    await clickByLabel('Create Workspace');
    await change('[placeholder="Workspace title"]', 'T1 catalogue label');
    await click(inherited);
    const before = await state(alternate);
    await clickButton('Create & Open');
    await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Resolved Main Title EN must be nonblank')`);
    assert.deepEqual(await state(alternate), before);
    await change(mainEn, 'T1 independent title');
    await change(mainId, 'Judul utama');
    await clickButton('Create & Open');
    await waitFor(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.includes('T1 catalogue label')`);
    const document = (await state(alternate)).snapshot.documents.find(item => item.title === 'T1 catalogue label');
    assert.deepEqual(document.metadata.bookMainTitleV1, { mode: 'custom', en: 'T1 independent title', id: 'Judul utama' });
    await closeData();
    assert.equal(await evaluate(`document.querySelectorAll('${title}').length`), 1);
    assert.equal(await evaluate(`document.querySelector('${title} [lang="en"]')?.textContent`), 'T1 independent title');
    assert.equal(await evaluate(`document.querySelector('${title} [lang="id"]')?.textContent`), 'Judul utama');
    // T1 asserted the Body-empty workspace action with no audible Title.
    await click('[data-book-heading-audio] summary');
    await click('[aria-label="Read Main Title"]');
    await waitFor(`document.querySelector('[data-book-heading-status]')?.textContent.includes('saved')`);
    assert.equal(await evaluate(`document.querySelector('button[title="Play Workspace from start"]')?.disabled`), true);
    await click('[data-book-heading-audio] summary');

    await clickButton('OPEN DATA WORKSPACE');
    await clickButton('MANAGE');
    await click('[data-text-library-crud] button:first-of-type');
    await click(inherited);
    await change('input[value="T1 catalogue label"]', 'T1 linked title');
    await click('[aria-label="Save Workspace"]');
    await waitFor(`document.querySelector('[data-app-header] select')?.selectedOptions[0]?.textContent.includes('T1 linked title')`);
    await open(alternate, 'Load / Connect existing v2 library');
    await select(document.id);
    const reloaded = (await state(alternate)).snapshot.documents.find(item => item.id === document.id);
    assert.equal(reloaded.uid, document.uid);
    assert.deepEqual(reloaded.metadata.bookMainTitleV1, { mode: 'workspace-name', id: 'Judul utama' });
    await waitFor(`document.querySelector('${title} [lang="en"]')?.textContent === 'T1 linked title'`);
    assert.equal(await evaluate(`document.querySelector('${title} [lang="id"]')?.textContent`), 'Judul utama');
  });

  await check('T1 disposable v2 Heading transaction, Refresh and Classic/Full Reader projection', async () => {
    await clickButton('OPEN DATA WORKSPACE');
    await clickButton('CREATE');
    await clickByLabel('Mixed');
    await waitFor(`document.querySelector('[data-text-library-demos] button:last-child')?.textContent === 'Mixed' && !document.querySelector('[data-text-library-demos] button:last-child').disabled`);
    const before = (await state(alternate)).snapshot;
    const document = before.documents.find(item => item.title === 'Book QA · Mixed sample');
    const [paragraph, scene] = before.blocks.filter(item => item.documentId === document.id);
    assert.deepEqual(document.metadata.bookMainTitleV1, { mode: 'workspace-name' });
    assert.equal(paragraph.metadata.bookHeadingV1.id, 'Latihan harian');
    assert.equal(scene.metadata.bookHeadingV1.id, 'Latihan percakapan');
    const execute = payload => probe(`module.executeBookTransaction(${quoted(alternate)}, ${quoted(document.id)}, ${quoted({ type: 'block.update', payload })})`);
    const invalid = await execute({ id: paragraph.id, heading: { en: '', id: 'Forbidden' } });
    assert.equal(invalid.error.code, 'BOOK_CARD_HEADING_INVALID');
    assert.deepEqual((await state(alternate)).snapshot, before);
    const metadataInjection = await execute({ id: paragraph.id, metadata: { paragraphRoleV1: 'title' } });
    assert.equal(metadataInjection.ok, false);
    assert.deepEqual((await state(alternate)).snapshot, before);
    const mutation = { id: paragraph.id, heading: { en: 'Updated heading', id: 'Judul baru' } };
    await closeData();
    const forbidden = await evaluate(`window.__bookQaProps('[data-book-qa-indicator]', 'bookQaConnection').bookQaConnection.session.dispatch({ type: 'audioPreferences.reset', payload: {} })`);
    assert.equal(forbidden.error.code, 'CAPABILITY_UNAVAILABLE');
    const receipt = await execute(mutation);
    assert.equal(receipt.ok && receipt.authoritative, true);
    const updated = (await state(alternate)).snapshot;
    for (const store of ['segments', 'contentUnits', 'audioVariants']) assert.deepEqual(updated[store], before[store]);
    assert.equal(updated.blocks.find(item => item.id === paragraph.id).uid, paragraph.uid);
    assert.equal(await refresh(), true);
    const english = `[data-book-card-heading="${paragraph.id}"]`;
    const indonesian = `[data-book-card-heading-id="${paragraph.id}"]`;
    const showParagraph = async () => {
      await click('[data-book-heading-audio] summary');
      await click('[aria-label="Show Paragraph Heading"]');
    };
    await showParagraph();
    await waitFor(`document.querySelector(${quoted(english)})?.textContent.trim() === 'Updated heading'`);
    assert.equal(await evaluate(`document.querySelector(${quoted(indonesian)})?.textContent`), 'Judul baru');
    await open(alternate, 'Load / Connect existing v2 library');
    await select(document.id);
    await showParagraph();
    await waitFor(`document.querySelector(${quoted(indonesian)})?.textContent === 'Judul baru'`);
    await click('[data-text-main-reader-option="shared"]');
    await click('[data-shared-reader-mode-option="full"]');
    await waitFor(present('[data-shared-book-page]'));
    assert.equal(await evaluate(`document.querySelectorAll('[data-book-main-title]').length`), 1);
    assert.equal(await evaluate(`document.querySelector('[data-shared-book-page] ' + ${quoted(english)})?.textContent.trim()`), 'Updated heading');
    assert.equal(await evaluate(`document.querySelector('[data-shared-book-page] ' + ${quoted(indonesian)})?.textContent`), 'Judul baru');
    assert.equal(await evaluate(`document.querySelector('[data-shared-book-page] [data-book-card-heading-id="${scene.id}"]')?.textContent`), 'Latihan percakapan');
    await click('[aria-label="Show Paragraph Heading"]');
    assert.equal(await evaluate(`document.querySelector('[data-shared-book-page] [data-shared-book-card="${paragraph.id}"] h3')?.textContent ?? null`), null);
  });

  await check('T1 stale title writer and committed-but-unaccepted receipt never replay', async () => {
    const workspaceId = (await state(alternate)).snapshot.documents.find(item => item.title === 'T1 linked title').id;
    const result = await probe(`module.runBookTitleReceiptReview(${quoted(alternate)}, ${quoted(workspaceId)})`);
    assert.equal(result.winner, true);
    assert.equal(result.stale, 'STALE_RESULT');
    assert.equal(result.rejected.code, 'INVALID_RESPONSE');
    assert.equal(result.rejected.committed, true);
    assert.equal(result.rejected.reloadRequired, true);
    assert.equal(result.blocked.code, 'REFRESH_REQUIRED');
    assert.deepEqual(result.beforeRefresh, { mode: 'custom', en: 'T1 conflict winner', id: 'Judul utama' });
    assert.deepEqual(result.afterRefresh, { mode: 'custom', en: 'T1 committed without accepted receipt', id: 'Judul utama' });
    assert.deepEqual(result.persisted, result.afterRefresh);
    assert.equal(result.calls, 1);
  });

  await open(qaDbName, 'Load / Connect existing v2 library');
  assert.deepEqual(await state(qaDbName), original, 'Second library commands changed first library');
  await check('Real Reader and Global Player transport retain audible ownership across navigation', async () => {
    await click('[data-text-main-reader-option="shared"]');
    await waitFor(present('[data-shared-card-embedded]'));
    await click(`${selector.player} button[aria-label="Start playback"]`);
    await waitFor('window.__bookQaSpeech.some(event => event[0] === "speak")');
    const before = (await current()).view.selection.workspaceId;
    const next = original.snapshot.documents.find(document => document.id !== before);
    const events = await evaluate('window.__bookQaSpeech.length');
    await select(next.id);
    assert.equal((await current()).view.selection.workspaceId, next.id);
    assert.equal(await evaluate('window.__bookQaSpeech.length'), events);
    await click(`${selector.player} button[aria-label="Pause playback"]`);
    await click(`${selector.player} button[aria-label="Resume playback"]`);
    await click(`${selector.player} button[aria-label="Stop playback"]`);
    assert.ok(await evaluate('["pause", "resume", "cancel"].every(type => window.__bookQaSpeech.some(event => event[0] === type))'));
  });

  await check('External move, invalid Refresh, mutation lock and deleted selection recovery', async () => {
    const selected = (await current()).view.selection.workspaceId;
    const collectionId = original.snapshot.collections.find(item => item.id !== (original.snapshot.documents.find(d => d.id === selected)?.collectionId))?.id;
    assert.ok(collectionId);
    assert.ok((await probe(`module.executeExternal(${quoted(qaDbName)}, ${quoted({ workspaceId: selected })}, ${quoted({ type:'document.update', payload:{ id: selected, collectionId } })})`)).ok);
    assert.equal(await refresh(), true);
    assert.deepEqual((await current()).view.selection, { workspaceId: selected, collectionId });
    const prior = await current();
    await probe(`module.setMetaValue(${quoted(qaDbName)}, 'schemaVersion', 99)`);
    assert.notEqual(await refresh(), true);
    await waitFor(present('[data-book-qa-refresh-error]'));
    assert.deepEqual((await current()).view.selection, prior.view.selection);
    const blocked = await evaluate('window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection").bookQaConnection.session.dispatch({type:"collection.create",payload:{title:"must not persist"}})');
    assert.equal(blocked.error.code, 'REFRESH_REQUIRED');
    await probe(`module.setMetaValue(${quoted(qaDbName)}, 'schemaVersion', 2)`);
    assert.equal(await refresh(), true);
    assert.ok((await probe(`module.executeExternal(${quoted(qaDbName)}, ${quoted({ workspaceId: selected })}, ${quoted({ type:'document.delete', payload:{ id: selected } })})`)).ok);
    assert.equal(await refresh(), true);
    assert.deepEqual((await current()).view.selection, { collectionId });
  });

  await check('Direct edit callback rejects and mobile exposes only Book QA capabilities', async () => {
    await open(qaDbName, 'Load / Connect existing v2 library');
    await clickButton('OPEN DATA WORKSPACE');
    const before = await state(qaDbName);
    const changed = await evaluate(`window.__bookQaProps('[data-text-structured-editor]', 'onCommand').onCommand({ type:'block.create', payload:{blockType:'conversation', title:'Forbidden direct edit'} })`);
    assert.equal(changed, null);
    await closeData();
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitFor(present('[data-mobile-tools-surface]:not([hidden])'));
    const backend = await evaluate(`(async () => {
      const { structuredTextAudioSidebarControls: audio } = window.__bookQaProps('[data-mobile-tools-surface] > div', 'structuredTextAudioSidebarControls');
      return { health: await audio.onEdgeHealthCheck(), reset: audio.onResetGlobalEdge() };
    })()`);
    assert.deepEqual(backend, { health: null, reset: null });
    await click('[data-text-mobile-open-workspace]');
    assert.ok(await evaluate(`[...document.querySelectorAll('${selector.mobile} button')].find(button => button.textContent === 'Edit Cards')?.disabled`));
    await clickButton('CREATE');
    assert.ok(await evaluate(`!document.querySelector('${selector.mobile} [data-text-library-demos]').textContent.includes('Legacy')`));
    await closeData();
    for (const title of ['Audio', 'System']) {
      await evaluate(`[...document.querySelectorAll('[data-mobile-tools-surface] button')].find(button => button.textContent.trim().toLowerCase() === ${quoted(title.toLowerCase())}).click(); true`);
      await waitFor(present('[data-book-qa-tools-limit]'));
      assert.equal(await evaluate(`document.querySelectorAll('[data-text-edge-health-action], [data-text-audio-import-zip], input[type="file"]').length`), 0);
    }
    assert.deepEqual(await state(qaDbName), before);
  });

  await check('Mobile creates a native v2 sample through the same catalogue contract', async () => {
    const before = await state(qaDbName);
    await evaluate(`[...document.querySelectorAll('[data-mobile-tools-surface] button')].find(button => button.textContent.trim().toLowerCase() === 'data').click(); true`);
    await click('[data-text-mobile-open-workspace]');
    await clickButton('CREATE');
    const sample = button => button.textContent.trim() === 'Paragraph' && !button.disabled;
    const action = `[...document.querySelectorAll('${selector.mobile} [data-text-library-demos] button')].find(${sample})`;
    await waitFor(`Boolean(${action})`);
    await evaluate(`${action}.click(); true`);
    await waitFor(`Boolean(${action}) && document.querySelector('${selector.mobile}').textContent.includes('Transactional v2 Samples')`);
    const after = await state(qaDbName);
    const created = after.snapshot.documents.find(document => before.snapshot.documents.every(old => old.id !== document.id));
    assert.equal(created?.documentType, 'paragraph');
    assert.ok(after.snapshot.segments.some(segment => segment.documentId === created.id && segment.text === 'I practise English every day.'));
    assert.equal(after.snapshot.audioVariants.length, before.snapshot.audioVariants.length);
  });
  return passed;
}
