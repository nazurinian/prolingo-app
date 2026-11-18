import assert from 'node:assert/strict';
import { createStructuredTestingFixture } from './fixtures/p15-integrated/structured-fixture.js';
import { selectTextUnifiedReader } from '../src/domain/text/textUnifiedReaderDomain.js';
import { createA1V1ParagraphFixture } from './fixtures/shared-card-a1/presentation-fixture.js';
const f = createStructuredTestingFixture(), before = JSON.stringify(f.snapshot);
for (const id of [f.ids.paragraphId, f.ids.conversationId, f.ids.documentId]) {
  const state = selectTextUnifiedReader(f.snapshot, id);
  assert.deepEqual(state.presentation.cards.map(c => c.id), state.documentTree.blocks.map(c => c.id));
  for (const s of Object.values(state.presentation.segmentById)) {
    const original = f.snapshot.segments.find(r => r.id === s.id);
    assert.deepEqual([s.uid, s.unitId, s.text, s.meaning, s.joinAfter], [original.uid, original.unitId, original.text, original.meaning, original.joinAfter]);
  }
}
assert.equal(JSON.stringify(f.snapshot), before);
assert.throws(() => selectTextUnifiedReader(f.snapshot, f.ids.legacyId), /Legacy/);
const v1 = createA1V1ParagraphFixture();
assert.equal(selectTextUnifiedReader(v1.snapshot, v1.ids.documentId).presentation.cards[0].units[0].id, null);
console.log('PASS R1: three persistent types, global order/identity/EN-ID, legacy rejection, v1 virtual compatibility, immutability');
