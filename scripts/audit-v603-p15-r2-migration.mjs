import assert from 'node:assert/strict';
import { createMigrationFixture } from './fixtures/p15-integrated/migration-fixture.js';
import { planTextV2MigrationCopy } from '../src/domain/text/textV2MigrationCopyDomain.js';
import { backfillTextContentUnits } from '../src/domain/text/textContentUnitDomain.js';
import { selectTextUnifiedReader } from '../src/domain/text/textUnifiedReaderDomain.js';
const f = createMigrationFixture(), before = JSON.stringify(f), plan = planTextV2MigrationCopy({ ...f, now: 21000 });
for (const key of ['collections', 'documents', 'blocks', 'audioVariants']) assert.deepEqual(plan.snapshot[key], f.snapshot[key]);
for (const segment of f.snapshot.segments) {
  const after = plan.snapshot.segments.find(s => s.id === segment.id);
  for (const key of Object.keys(segment)) assert.deepEqual(after[key], segment[key], segment.id + ':' + key);
}
assert.equal(plan.snapshot.contentUnits.filter(u => u.documentId === f.ids.legacyId).length, 0);
assert.ok(plan.snapshot.contentUnits.length > 0);
assert.equal(backfillTextContentUnits(plan.snapshot).changed, false);
assert.ok(selectTextUnifiedReader(plan.snapshot, f.ids.mixedId).presentation.cards.length > 0);
assert.deepEqual(plan.metaRecords.find(m => m.key === 'unknownFutureKey'), f.metaRecords.find(m => m.key === 'unknownFutureKey'));
assert.equal(JSON.stringify(f), before);
for (const bad of [{ ...f.snapshot, schemaVersion: 3 }, { ...f.snapshot, contentUnits: [] },
  { ...f.snapshot, segments: f.snapshot.segments.map((s, i, all) => i === 1 ? { ...s, uid: all[0].uid } : s) }]) {
  assert.throws(() => planTextV2MigrationCopy({ snapshot: bad, metaRecords: f.metaRecords }));
}
console.log('PASS R2: exact identities/content/audio/source/metadata, legacy isolation, Mixed conversion, repeat idempotency, invalid-source rejection, immutable source');
