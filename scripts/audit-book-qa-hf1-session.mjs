import assert from 'node:assert/strict';
import { createBookQaConnection, isBookQaOrigin } from '../src/services/bookQaSessionService.js';
import { createStructuredTestingFixture } from './fixtures/p15-integrated/structured-fixture.js';

const test = async (name, run) => { await run(); console.log('PASS', name); };
const source = () => ({
  snapshot: structuredClone(createStructuredTestingFixture().snapshot),
  sourceAttachments: [], externalImports: [], metaRecords: []
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const command = { type: 'collection.create', payload: { title: 'must not replay' } };

await test('Dedicated origin and exact HTTP loopback ports', () => {
  for (const allowed of ['https://text-uat.prolingo.web.id', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://[::1]:4173']) {
    assert.equal(isBookQaOrigin(allowed), true, allowed);
  }
  for (const blocked of ['https://prolingo.web.id', 'https://beta.prolingo.web.id', 'https://prolingo.site', 'https://invalid.test',
    'http://text-uat.prolingo.web.id', 'https://text-uat.prolingo.web.id:4173', 'https://localhost:4173',
    'http://localhost:80', 'http://192.168.0.10:4173', 'null']) {
    assert.equal(isBookQaOrigin(blocked), false, blocked);
  }
});

await test('Session wrapper rejects destructive and audio commands before the P15 executor', async () => {
  const connection = createBookQaConnection({ execute() { throw Error('Unexpected executor call'); } }, source());
  for (const type of ['document.delete', 'collection.delete', 'segment.update', 'audioVariant.upsert']) {
    assert.equal((await connection.session.dispatch({ type, payload: {} })).error.code, 'CAPABILITY_UNAVAILABLE');
  }
  connection.session.dispose();
});

await test('Refresh blocks writes during a read and latches a stale result until retry', async () => {
  const initial = source();
  const read = deferred();
  const connection = createBookQaConnection({ loadState: () => read.promise }, initial);
  const before = connection.session.getSnapshot();
  const refresh = connection.refresh();
  assert.equal((await connection.session.dispatch(command)).error.code, 'REFRESH_REQUIRED');
  await assert.rejects(connection.refresh(), { code: 'REFRESH_BUSY' });
  assert.ok(connection.session.navigate({ workspaceId: initial.snapshot.documents[1].id }));
  read.resolve(source());
  await assert.rejects(refresh, { code: 'REFRESH_STALE' });
  assert.equal(connection.session.getSnapshot(), before);
  assert.equal((await connection.session.dispatch(command)).error.code, 'REFRESH_REQUIRED');
  await connection.refresh();
  assert.ok(connection.session.getState().view.selection.workspaceId);
  connection.session.dispose();
});

await test('Invalid sidecars and invalid snapshot leave the authoritative projection and selection intact', async () => {
  const initial = source();
  let loaded = { ...source(), metaRecords: null };
  const connection = createBookQaConnection({ loadState: async () => loaded }, initial);
  const before = connection.session.getSnapshot();
  const selection = connection.session.getState().view.selection;
  await assert.rejects(connection.refresh(), { code: 'INVALID_SIDECARS' });
  assert.equal(connection.session.getSnapshot(), before);
  loaded = source();
  loaded.snapshot.schemaVersion = 99;
  await assert.rejects(connection.refresh(), { code: 'SCHEMA_UNSUPPORTED' });
  assert.equal(connection.session.getSnapshot(), before);
  assert.deepEqual(connection.session.getState().view.selection, selection);
  loaded = source();
  await connection.refresh();
  assert.notEqual(connection.session.getSnapshot(), before);
  connection.session.dispose();
});
