import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTextExternalPackageDataFingerprint,
  planProLingoTextExternalInitialImport
} from '../src/domain/text/textExternalJsonDomain.js';
import {
  inspectTextExternalReconciliation,
  planTextExternalUpdateExisting
} from '../src/domain/text/textExternalReconciliationDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../src/domain/text/textLibraryDomain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/v603-d2-external-mix-example.json'), 'utf8'));
const emptySnapshot = () => normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: 1, initialized: true, activeDocumentId: null,
  counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
  collections: [], documents: [], blocks: [], segments: [], audioVariants: []
});
const ext = record => record?.metadata?.externalEntityV1 || null;
const bySegKey = (snapshot, documentId) => new Map(snapshot.segments.filter(s => s.documentId === documentId).map(s => [ext(s)?.segmentKey || ext(s)?.entryKey, s]));
let checks = 0;
const pass = fn => { fn(); checks += 1; };

const first = planProLingoTextExternalInitialImport({ localSnapshot: emptySnapshot(), package: fixture, now: 1000, fileName: 'mix.json' });
const documentId = first.importRecord.documentId;
const baselineMap = bySegKey(first.snapshot, documentId);
const fpA = buildTextExternalPackageDataFingerprint(fixture);
const fpB = buildTextExternalPackageDataFingerprint(structuredClone(fixture));
pass(() => assert.equal(fpA, fpB));
pass(() => assert.equal(fpA, first.importRecord.dataFingerprint));

const exact = inspectTextExternalReconciliation({ localSnapshot: first.snapshot, package: fixture, existingImport: first.importRecord });
pass(() => assert.equal(exact.status, 'up-to-date'));
pass(() => assert.equal(exact.summary.conflicts, 0));

const changed = structuredClone(fixture);
const changedLine = changed.workspace.cards.find(c => c.cardKey === 'conversation-01').segments.find(s => s.segmentKey === 'conversation-01-line-002');
changedLine.text = 'No, I am full now.';
changedLine.meaning = 'Tidak, saya sudah kenyang sekarang.';
const inspection = inspectTextExternalReconciliation({ localSnapshot: first.snapshot, package: changed, existingImport: first.importRecord });
pass(() => assert.equal(inspection.status, 'decision-required'));
pass(() => assert.ok(inspection.summary.updated >= 1));
pass(() => assert.equal(inspection.summary.conflicts, 0));

const updated = planTextExternalUpdateExisting({ localSnapshot: first.snapshot, package: changed, existingImport: first.importRecord, conflictPolicy: 'keep-local', now: 2000 });
const afterMap = bySegKey(updated.snapshot, documentId);
pass(() => assert.equal(afterMap.get('conversation-01-line-002').id, baselineMap.get('conversation-01-line-002').id));
pass(() => assert.equal(afterMap.get('conversation-01-line-002').uid, baselineMap.get('conversation-01-line-002').uid));
pass(() => assert.equal(afterMap.get('conversation-01-line-001').id, baselineMap.get('conversation-01-line-001').id));
pass(() => assert.equal(updated.importRecord.revision, Number(first.importRecord.revision || 1) + 1));
pass(() => assert.notEqual(updated.importRecord.dataFingerprint, first.importRecord.dataFingerprint));

// Local edit and incoming edit from the same baseline must be detected as a conflict.
const locallyEdited = structuredClone(first.snapshot);
const localTarget = locallyEdited.segments.find(s => ext(s)?.segmentKey === 'conversation-01-line-002');
localTarget.text = 'LOCAL OVERRIDE';
localTarget.updatedAt = 1500;
const conflicted = inspectTextExternalReconciliation({ localSnapshot: locallyEdited, package: changed, existingImport: first.importRecord });
pass(() => assert.ok(conflicted.summary.conflicts >= 1));

const keepLocal = planTextExternalUpdateExisting({ localSnapshot: locallyEdited, package: changed, existingImport: first.importRecord, conflictPolicy: 'keep-local', now: 2100 });
pass(() => assert.equal(bySegKey(keepLocal.snapshot, documentId).get('conversation-01-line-002')?.text, 'LOCAL OVERRIDE'));
const useIncoming = planTextExternalUpdateExisting({ localSnapshot: locallyEdited, package: changed, existingImport: first.importRecord, conflictPolicy: 'use-incoming', now: 2200 });
pass(() => assert.equal(bySegKey(useIncoming.snapshot, documentId).get('conversation-01-line-002')?.text, 'No, I am full now.'));

// Safe removal/addition uses stable external keys and preserves unrelated IDs.
const reshaped = structuredClone(fixture);
const conv = reshaped.workspace.cards.find(c => c.cardKey === 'conversation-01');
conv.segments = conv.segments.filter(s => s.segmentKey !== 'conversation-01-line-002');
conv.segments.push({ segmentKey: 'conversation-01-line-003', order: 3, speakerKey: 'speaker-a', text: 'Thank you.', meaning: 'Terima kasih.' });
const reshapePlan = planTextExternalUpdateExisting({ localSnapshot: first.snapshot, package: reshaped, existingImport: first.importRecord, conflictPolicy: 'keep-local', now: 2300 });
const reshapeMap = bySegKey(reshapePlan.snapshot, documentId);
pass(() => assert.equal(reshapeMap.has('conversation-01-line-002'), false));
pass(() => assert.equal(reshapeMap.has('conversation-01-line-003'), true));
pass(() => assert.equal(reshapeMap.get('conversation-01-line-001').id, baselineMap.get('conversation-01-line-001').id));
pass(() => assert.notEqual(reshapeMap.get('conversation-01-line-003').uid, baselineMap.get('conversation-01-line-001').uid));

console.log(`PASS D3/D4 external reconciliation audit: ${checks} checks`);
