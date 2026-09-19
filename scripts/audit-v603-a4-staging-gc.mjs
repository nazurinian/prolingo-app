import assert from 'node:assert/strict';
import { planTextAudioStagingGarbage } from '../src/services/persistence/textAudioStagingGcService.js';
const rfA = `rf-sha256-${'a'.repeat(64)}`;
const rfB = `rf-sha256-${'b'.repeat(64)}`;
const snapshot = { audioVariants: [
  { id: 'A', metadata: { audioRenderFingerprintV1: rfA } },
  { id: 'B', metadata: { audioRenderFingerprintV1: rfA } },
  { id: 'C', metadata: { audioRenderFingerprintV1: rfB, contentInvalidatedV1: { reason: 'changed' } } }
] };
const records = [
  { id: 'S_A', hasBlob: true, mapKey: rfA, size: 10 },
  { id: 'S_B', hasBlob: true, mapKey: rfB, size: 20 },
  { id: 'LEGACY', hasBlob: true, mapKey: 'TXTAUDIO_000001', size: 30 }
];
const plan = planTextAudioStagingGarbage({ snapshot, records });
assert.equal(plan.referencedCount, 1);
assert.equal(plan.orphanCount, 1);
assert.equal(plan.orphanRecords[0].id, 'S_B');
assert.equal(plan.legacyCount, 1);
assert.equal(plan.orphanBytes, 20);
assert.equal(plan.referencedFingerprints.has(rfA), true);
assert.equal(plan.referencedFingerprints.has(rfB), false);
console.log('PASS A4 staging GC audit: 7 checks');
