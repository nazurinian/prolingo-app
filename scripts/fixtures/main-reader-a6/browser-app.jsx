import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/App.jsx';
import { createA2V1CompatibilityParagraphFixture } from '../shared-card-a2/paragraph-reader-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { openTextLibraryDatabase, readTextLibrarySnapshot } from '../../../src/services/persistence/textLibraryIndexedDbService.js';
import { TEXT_LIBRARY_META_KEYS, TEXT_LIBRARY_STORES } from '../../../src/constants/textDatabaseConstants.js';
import { buildTextStructuredFullArtifactRecord, buildTextStructuredFullAudioArtifactsMetadata } from '../../../src/domain/text/textStructuredSplitFullDomain.js';
import { putTextFullAudioStagingBlob } from '../../../src/services/persistence/textAudioStagingService.js';
import { waitForCompletedReveal, waitForStableBrowserLayout } from '../shared-card-a2/completed-reveal.js';

// Runs the REAL App, bootstrap, commands and audio host. Only browser I/O is
// isolated by the harness (namespaced native IDB and controllable speech/media).
const f = createA2V1CompatibilityParagraphFixture();
let snapshot = f.snapshot;
const apply = (type, payload) => {
  const result = applyTextLibraryCommand(snapshot, { type, payload }, 900);
  snapshot = result.snapshot;
  return result.result.id;
};
for (let i = 4; i <= 15; i++) apply('segment.create', {
  blockId: f.ids.cardId,
  text: i === 15 ? 'A6 unique search destination at the end of this passage.' : `Sentence ${i} follows the same persistent Paragraph data path. Reading carefully preserves every identity while comparing the two presentations.`,
  meaning: `Makna kalimat ${i} tetap terhubung ke Segment yang sama.`
});
const conversationId = apply('document.create', { title: 'A6 Conversation unavailable', documentType: 'conversation' });
const mixedId = apply('document.create', { title: 'A6 Mixed unavailable', documentType: 'mixed' });
const legacyId = apply('document.create', { title: 'A6 Legacy unavailable', editorModel: 'legacy-line-v1', documentType: 'paragraph' });
const secondId = apply('document.create', { title: 'A6 Other Paragraph', documentType: 'paragraph' });
const secondCardId = apply('block.create', { documentId: secondId, blockType: 'paragraph', title: 'Other Workspace Card' });
apply('segment.create', { blockId: secondCardId, text: 'Other Workspace distinct content.', meaning: 'Isi Workspace lain.' });
snapshot.activeDocumentId = f.ids.documentId;
const block = resolveTextLibraryDocumentTree(snapshot, f.ids.documentId).blocks.find(b => b.id === f.ids.cardId);
const artifact = buildTextStructuredFullArtifactRecord({
  block, channel: 'text', engine: 'edge', voiceId: 'en-GB-SoniaNeural', filename: 'a6-disposable-full.wav'
});
snapshot.blocks.find(b => b.id === block.id).metadata = buildTextStructuredFullAudioArtifactsMetadata({ metadata: block.metadata, artifact });
if (window.location.pathname === '/corrupt') snapshot.segments[0].blockId = 'BLOCK_999999';

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
});
const db = await openTextLibraryDatabase();
const existing = await readTextLibrarySnapshot();
if (!existing.initialized) {
  const tx = db.transaction(Object.values(TEXT_LIBRARY_STORES), 'readwrite');
  const complete = done(tx);
  const meta = tx.objectStore('meta');
  for (const [key, value] of [
    [TEXT_LIBRARY_META_KEYS.SCHEMA_VERSION, 1], [TEXT_LIBRARY_META_KEYS.INITIALIZED, true],
    [TEXT_LIBRARY_META_KEYS.ACTIVE_DOCUMENT_ID, snapshot.activeDocumentId], [TEXT_LIBRARY_META_KEYS.ID_COUNTERS, snapshot.counters]
  ]) meta.put({ key, value, updatedAt: 900 });
  for (const name of ['collections', 'documents', 'blocks', 'segments', 'audioVariants']) {
    snapshot[name].forEach(row => tx.objectStore(name).put(row));
  }
  await complete;
  // A real disposable WAV binary and exact artifact metadata, never production data.
  const bytes = new ArrayBuffer(44 + 16000);
  const view = new DataView(bytes);
  const ascii = (offset, value) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, 16000, true);
  await putTextFullAudioStagingBlob({
    fullArtifactFingerprint: artifact.fullArtifactFingerprint, documentId: f.ids.documentId,
    blockId: block.id, channel: 'text', engine: 'edge', voiceId: 'en-GB-SoniaNeural',
    filename: artifact.filename, descriptor: artifact.descriptor, blob: new Blob([bytes], { type: 'audio/wav' })
  });
}
db.close();
window.a6 = {
  ids: { ...f.ids, conversationId, mixedId, legacyId, secondId, secondCardId },
  readSnapshot: readTextLibrarySnapshot,
  stableLayout: () => waitForStableBrowserLayout(() => document.querySelector('[data-text-structured-player]')),
  completedReveal: segmentId => waitForCompletedReveal(() => document.querySelector(`[data-shared-card-segment="${segmentId}"][data-shared-card-channel="text"]`), { label: 'A6 actual App search reveal' }),
  fullFingerprint: artifact.fullArtifactFingerprint
};
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
