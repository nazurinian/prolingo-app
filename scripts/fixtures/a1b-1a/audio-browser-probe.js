import { createJourneyToLondonFixture } from '../uat4/journey-to-london.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../../../src/domain/text/textPackJsonDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from '../../../src/domain/text/textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredFullArtifactIdentity } from '../../../src/domain/text/textStructuredSplitFullDomain.js';
import { BOOK_AUDIO_REFS, readBookAudioReferences } from '../../../src/domain/text/bookQaAudioDomain.js';
import { deriveBookQaAudioStagingName } from '../../../src/services/persistence/bookQaAudioStagingService.js';
import { createBookQaConnection } from '../../../src/services/bookQaSessionService.js';
import { createTextDataManagementPersistenceAdapter, seedDisposableTextManagementDatabase } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { validateBookAudioBytes } from '../../../src/services/audio/bookQaAudioBytes.js';
import { buildDerivedTextFullAudioWav } from '../../../src/services/audio/textStructuredFullAudioExportService.js';
import { planBookAtomicGeneration } from '../../../src/domain/text/bookQaHeadingAudioDomain.js';
import { getBookSplitPlaybackRequests } from '../../../src/domain/text/bookQaBodyAudioDomain.js';
import { getTextStructuredSegmentSpeakerId } from '../../../src/domain/text/textStructuredSpeakerIdentityDomain.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const adapterFor = dbName => createTextDataManagementPersistenceAdapter({
  dbName, boundary: 'disposable', permissions: ['catalog', 'content'], bookAuthoring: true
});
const open = name => request(indexedDB.open(name));
const request = value => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
const rows = async (name, store) => {
  const db = await open(name);
  try { return await request(db.transaction(store).objectStore(store).getAll()); }
  finally { db.close(); }
};
const result = async promise => {
  try { return await promise; }
  catch (error) { return { code: error.code, status: error.status, reloadRequired: error.reloadRequired, operationId: error.operationId }; }
};
const fixtureBlob = frequency => fetch('/__book_audio_' + frequency + '.mp3').then(response => response.blob());

export const seedHeadingLibrary = async name => {
  const fixture = createJourneyToLondonFixture();
  const first = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const paragraph = first.blocks[0];
  const scene = first.blocks[1];
  const contents = { en: paragraph.segments[0].text, id: 'Judul London' };
  let snapshot = fixture.snapshot;
  for (const [type, payload] of [
    ['document.update', { id: first.id, metadata: { ...first.metadata, bookMainTitleV1: { mode: 'custom', ...contents } } }],
    ['block.update', { id: paragraph.id, title: 'Atomic paragraph heading', metadata: { ...paragraph.metadata, bookHeadingV1: { id: 'Judul paragraf' } } }],
    ['block.update', { id: scene.id, title: 'Atomic scene heading', metadata: { ...scene.metadata, bookHeadingV1: { id: 'Judul adegan' } } }],
    ['document.create', { title: 'Title-only Workspace', documentType: 'paragraph', metadata: { bookMainTitleV1: { mode: 'workspace-name' } } }]
  ]) snapshot = applyTextLibraryCommand(snapshot, { type, payload }, 42).snapshot;
  await seedDisposableTextManagementDatabase({ dbName: name, snapshot, createOnly: true });
  return { contents, workspace: first.id, uid: first.uid, paragraph: paragraph.id, scene: scene.id, empty: snapshot.documents.at(-1).id,
    segment: paragraph.segments[0].id,
    sceneSegments: scene.segments.map(item => ({ text: item.text, speakerId: getTextStructuredSegmentSpeakerId(item) })) };
};

export const inspectHeadingSharing = async connection => {
  const snapshot = connection.session.getSnapshot();
  const document = resolveTextLibraryDocumentTree(snapshot, snapshot.documents[0].id);
  const [block] = document.blocks;
  const preferences = { edgeTextVoiceId: 'en-GB-RyanNeural', edgeRate: 0, edgePitch: 0 };
  const heading = planBookAtomicGeneration(document, null, 'mainTitle', 'text', preferences);
  const [split] = getBookSplitPlaybackRequests(document, block, block.segments[0], 'text', { preferences });
  const [a, b] = await Promise.all([connection.audio.readRuntime(heading), connection.audio.readRuntime(split)]);
  const physical = (await rows(connection.audio.name, 'audioMeta')).filter(row => row.mapKey === heading.fingerprint);
  return { fingerprint: heading.fingerprint, same: heading.fingerprint === split.fingerprint && a.id === b.id && a.url === b.url,
    statuses: [a.status, b.status], physical: physical.length, id: a.id, url: a.url };
};
const fixtureWav = () => {
  const frames = 480;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  for (const [offset, tag] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    for (let index = 0; index < tag.length; index++) view.setUint8(offset + index, tag.charCodeAt(index));
  }
  for (const [offset, value] of [[4, buffer.byteLength - 8], [16, 16], [24, 48000], [28, 96000], [40, frames * 2]]) view.setUint32(offset, value, true);
  for (const [offset, value] of [[20, 1], [22, 1], [32, 2], [34, 16]]) view.setUint16(offset, value, true);
  for (let index = 0; index < frames; index++) view.setInt16(44 + index * 2, Math.round(Math.sin(index / 12) * 2000), true);
  return new Blob([buffer], { type: 'audio/wav' });
};

export const seedAudioLibrary = async name => {
  const fixture = createJourneyToLondonFixture();
  const first = resolveTextLibraryDocumentTree(fixture.snapshot, fixture.ids.documentId);
  const segment = first.blocks[0].segments[0];
  const legacy = buildTextStructuredAudioRenderFingerprint({ channel: 'text', content: segment.text, voiceId: 'en-GB-LibbyNeural' });
  const withLegacySplit = applyTextLibraryCommand(fixture.snapshot, { type: 'audioVariant.upsert', payload: {
    segmentId: segment.id, channel: 'text', engine: 'edge', voiceId: legacy.descriptor.voiceId, source: 'generated',
    metadata: { audioRenderFingerprintV1: legacy.renderFingerprint, audioRenderDescriptorV1: legacy.descriptor, fixtureNote: 'retain' }
  } }).snapshot;
  const full = buildTextStructuredFullArtifactIdentity({ block: first.blocks[0], channel: 'text', voiceId: legacy.descriptor.voiceId });
  const seeded = applyTextLibraryCommand(withLegacySplit, { type: 'fullAudioArtifact.upsert', payload: {
    blockId: first.blocks[0].id, artifact: { fullArtifactFingerprint: full.fullArtifactFingerprint,
      descriptor: full.descriptor, segmentCount: full.fullRepresentation.segmentCount }
  } }).snapshot;
  const pack = createProLingoTextPack({ snapshot: fixture.snapshot, rootId: first.id });
  const { snapshot } = mergeProLingoTextPack({ localSnapshot: seeded, pack, uidMode: 'new-copy' });
  await seedDisposableTextManagementDatabase({ dbName: name, snapshot, createOnly: true });
  return { documents: snapshot.documents.map(item => item.id), segmentId: segment.id, legacyId: seeded.audioVariants[0].id };
};

const itemFor = (snapshot, index, { rate = 0, pitch = 0, kind = 'split', cardIndex = 0, segmentIndex = 0 } = {}) => {
  const document = resolveTextLibraryDocumentTree(snapshot, snapshot.documents[index].id);
  const block = document.blocks[cardIndex], segment = block.segments[segmentIndex];
  const target = { documentId: document.id, documentUid: document.uid, cardId: block.id, cardUid: block.uid };
  const profile = { channel: 'text', language: document.textLanguage, voiceId: 'en-GB-LibbyNeural', rate, pitch };
  if (kind === 'full') {
    const full = buildTextStructuredFullArtifactIdentity({ ...profile, block });
    return { kind, target, fingerprint: full.fullArtifactFingerprint, descriptor: full.descriptor };
  }
  const rf = buildTextStructuredAudioRenderFingerprint({ ...profile, content: segment.text });
  return { kind, target: { ...target, segmentId: segment.id, segmentUid: segment.uid }, fingerprint: rf.renderFingerprint, descriptor: rf.descriptor };
};

export const auditAudioAuthorization = async name => {
  const adapter = adapterFor(name);
  const loaded = await adapter.loadState();
  for (const authorization of [
    null, { library: name, optIn: false, origin: location.origin },
    { library: name, optIn: true, origin: 'https://prolingo.web.id' },
    { library: name + '_other', optIn: true, origin: location.origin }
  ]) {
    const connection = createBookQaConnection(adapter, loaded, authorization);
    check(!connection.audio, 'Invalid authorization opened the audio capability');
    connection.session.dispose();
  }
  for (const rejected of ['prolingo_text_library', deriveBookQaAudioStagingName(name), 'non-qa-name', name + ' ']) {
    let threw = false;
    try { deriveBookQaAudioStagingName(rejected); } catch { threw = true; }
    check(threw, 'Invalid companion input was accepted');
  }
  return true;
};

const exerciseDerivedAudio = async (connection, blob) => {
  const snapshot = connection.session.getSnapshot();
  const document = resolveTextLibraryDocumentTree(snapshot, snapshot.documents[0].id);
  const cardIndex = document.blocks.findIndex(block => block.blockType === 'conversation');
  const block = document.blocks[cardIndex];
  const inputs = block.segments.flatMap((segment, segmentIndex) => segment.text.trim()
    ? [itemFor(snapshot, 0, { cardIndex, segmentIndex })] : []);
  const composition = inputs.map(item => ({ renderFingerprint: item.fingerprint, playbackRate: 1 }));
  const full = buildTextStructuredFullArtifactIdentity({ block, channel: 'text', composition });
  const entry = { kind: 'full', fingerprint: full.fullArtifactFingerprint, descriptor: full.descriptor,
    target: { documentId: document.id, documentUid: document.uid, cardId: block.id, cardUid: block.uid } };
  const wav = await buildDerivedTextFullAudioWav({ blobs: inputs.map(() => blob), sampleRate: 48000 });
  const derived = () => connection.audio.submit([{ ...entry, blob: wav.blob }]);
  check((await result(derived())).code === 'INVALID_AUDIO_COMPOSITION', 'Derived Full accepted absent inputs');
  await connection.audio.submit(inputs.map(item => ({ ...item, blob })));
  check((await derived()).results[0].id === entry.fingerprint && (await connection.audio.readRuntime(entry)).binary.format === 'wav',
    'Actual composed WAV lost its Full identity or binary proof');
};

const withAddFault = async (storeName, matches, fault, run) => {
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function(value, ...args) {
    if (this.name === storeName && matches(value)) fault(this.transaction, value);
    return original.call(this, value, ...args);
  };
  try { return await run(); }
  finally { IDBObjectStore.prototype.add = original; }
};
const metaMarker = row => row.key?.startsWith('bookQaAudioCommitV1:');
const isProvisional = row => row.status === 'provisional';

export const exerciseBookAudio = async (connection, legacyId) => {
  const groups = [];
  const { audio, session } = connection;
  const snapshot = session.getSnapshot();
  const first = itemFor(snapshot, 0), other = itemFor(snapshot, 1);
  const [blob, different] = await Promise.all([fixtureBlob(440), fixtureBlob(660)]);
  const submit = (entry, media = blob, options) => audio.submit([{ ...entry, blob: media }], options);
  check(audio.name === deriveBookQaAudioStagingName(connection.dbName), 'Host bound the wrong companion');
  check((await session.dispatch({ type: 'audioVariant.upsert', payload: {} })).error.code === 'CAPABILITY_UNAVAILABLE', 'Public authoring leaked');
  check((await audio.readRuntime(first)).status === 'legacy-unverified', 'Legacy metadata claimed readiness');
  check((await audio.readRuntime(other)).status === 'missing', 'Missing slot claimed coverage');
  check((await audio.readRuntime({ ...first, target: { ...first.target, segmentUid: other.target.segmentUid } })).status === 'stale',
    'Changed owner did not report stale');
  const pending = audio.submit([{ ...first, blob }, { ...other, blob }]);
  session.navigate({ workspaceId: snapshot.documents[1].id });
  const committed = await pending;
  check(committed.results[0].id === legacyId && committed.results[1].id !== legacyId, 'Stable legacy variant or second owner lost');
  check(session.getState().view.selection.workspaceId === snapshot.documents[1].id, 'Audio moved the browsed selection');
  const ready = await audio.readRuntime(first), dedup = await audio.readRuntime(other);
  check(ready.status === 'ready' && ready.id === dedup.id && ready.url === dedup.url
    && (await rows(audio.name, 'audioBlob')).length === 1, 'Within-library deduplication failed');
  groups.push('Legacy promotion, stable owners, passive navigation and cross-Workspace deduplication');

  const changed = itemFor(snapshot, 0, { rate: 12, pitch: 4 });
  check((await audio.readRuntime(changed)).status === 'other-profile', 'Other-profile state was lost');
  const secondProfile = await submit(changed);
  const promoted = session.getSnapshot().audioVariants.find(item => item.id === legacyId);
  check(secondProfile.results[0].id === legacyId && Object.keys(readBookAudioReferences(promoted)).length === 2
    && !Object.hasOwn(promoted.metadata, 'audioRenderFingerprintV1') && promoted.metadata.fixtureNote === 'retain'
    && promoted.metadata[BOOK_AUDIO_REFS][changed.fingerprint].descriptor.voiceId === first.descriptor.voiceId, 'RF references or provider voice changed');
  const full = itemFor(snapshot, 0, { kind: 'full' });
  check((await audio.readRuntime(full)).status === 'metadata-only', 'Legacy Full metadata claimed readiness');
  check((await submit(full)).results[0].id === full.fingerprint && (await audio.readRuntime(full)).status === 'ready', 'Full fingerprint or binding lost');
  await exerciseDerivedAudio(connection, blob);
  groups.push('Same-voice rate/pitch coexistence and native RF/Full fingerprints');

  for (const media of [new Blob([]), new Blob(['fake'], { type: 'audio/mpeg' }), blob.slice(0, blob.size - 1)]) {
    check((await result(submit(changed, media))).code === 'INVALID_AUDIO_BINARY', 'Invalid audio was accepted');
  }
  const misleading = new Blob([blob], { type: 'image/png' });
  check((await submit(first, misleading)).status === 'committed', 'Actual codec did not take priority over MIME');
  const wav = fixtureWav();
  const waveProof = await validateBookAudioBytes(wav, 'wav');
  check(waveProof.format === 'wav' && waveProof.sampleRate === 48000 && /^[a-f0-9]{64}$/.test(waveProof.digest)
    && (await result(validateBookAudioBytes(wav.slice(0, 45), 'wav'))).code === 'INVALID_AUDIO_BINARY', 'PCM WAV validation was incomplete');
  const conflict = await result(submit(first, different));
  check(conflict.code === 'AUDIO_BYTE_CONFLICT' && (await audio.readRuntime(first)).binary.digest === ready.binary.digest, 'Conflicting bytes replaced accepted bytes');
  groups.push('Decoded real audio, truncated/misleading input and immutable same-RF conflict');

  const quotaCandidate = itemFor(snapshot, 0, { rate: 21 });
  const beforeFault = session.getSnapshot();
  const quota = await withAddFault('audioBlob', () => true, () => { throw new DOMException('Fixture quota', 'QuotaExceededError'); }, () => result(submit(quotaCandidate)));
  const stageFailure = await withAddFault('batchSessions', isProvisional, tx => tx.abort(), () => result(submit(quotaCandidate)));
  check(quota.code === 'AUDIO_QUOTA' && stageFailure.status === 'precommit-failed' && session.getSnapshot() === beforeFault
    && !(await rows(audio.name, 'audioMeta')).some(row => row.mapKey === quotaCandidate.fingerprint), 'Stage faults were not atomic');
  const badCommit = await withAddFault('meta', metaMarker, tx => tx.abort(), () => result(submit(quotaCandidate)));
  check(badCommit.status === 'uncertain' && badCommit.reloadRequired && session.getSnapshot() === beforeFault, 'Aborted Text transaction replaced the projection');
  await connection.refresh();
  check((await rows(audio.name, 'batchSessions')).find(job => job.id === badCommit.operationId)?.status === 'precommit-failed'
    && (await audio.readRuntime(quotaCandidate)).status === 'other-profile', 'Reconciliation published aborted metadata');
  groups.push('Quota, Staging and metadata transaction failure with atomic rollback per database');

  const cancelBefore = new AbortController();
  const cancelled = await withAddFault('batchSessions', isProvisional, tx => tx.addEventListener('complete', () => cancelBefore.abort()),
    () => result(submit(quotaCandidate, blob, { signal: cancelBefore.signal })));
  check(cancelled.status === 'precommit-failed' && cancelled.code === 'AUDIO_CANCELLED', 'Precommit cancel was not isolated');
  const cancelAfter = new AbortController();
  const next = itemFor(snapshot, 0, { rate: 22 });
  const lastValid = session.getSnapshot();
  const unaccepted = await withAddFault('meta', metaMarker, tx => tx.addEventListener('complete', () => cancelAfter.abort()),
    () => result(submit(next, blob, { signal: cancelAfter.signal })));
  check(unaccepted.status === 'committed-unaccepted' && session.getSnapshot() === lastValid, 'Post-commit cancellation was published');
  check((await result(submit(next))).code === 'REFRESH_REQUIRED', 'Unaccepted receipt failed to fence writes');
  check((await session.dispatch({ type: 'collection.create', payload: { title: 'Forbidden while reconciling' } })).error.code === 'REFRESH_REQUIRED', 'Dependent native write bypass');
  const db = await open(audio.name);
  const row = (await rows(audio.name, 'audioMeta')).find(item => item.mapKey === next.fingerprint);
  const put = async media => {
    const tx = db.transaction('audioBlob', 'readwrite');
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
    tx.objectStore('audioBlob').put({ id: row.id, blob: media });
    await done;
  };
  try {
    await put(different);
    check((await result(connection.refresh())).code === 'AUDIO_READBACK_FAILED' && session.getSnapshot() === lastValid,
      'Failed reconciliation replaced the last valid projection');
    await put(blob);
    await connection.refresh();
    await put(different);
    check((await audio.readRuntime(next)).status === 'corrupt', 'Runtime reported changed durable bytes as Ready');
    await put(blob);
  } finally { db.close(); }
  check((await audio.readRuntime(next)).status === 'ready' && (await rows(audio.name, 'batchSessions'))
    .filter(job => job.id === unaccepted.operationId).length === 1, 'Commit was replayed or not recovered');
  groups.push('Cancel around commit, frozen projection, corrupt recovery and explicit no-replay Refresh');
  return { groups, ready: { id: ready.id, digest: ready.binary.digest }, counts: {
    variants: session.getSnapshot().audioVariants.length, assets: (await rows(audio.name, 'audioMeta')).length
  } };
};

export const openAudioPeer = async name => {
  const adapter = adapterFor(name);
  return createBookQaConnection(adapter, await adapter.loadState(), { library: name, optIn: true, origin: location.origin });
};

export const startAudioCompetition = async connection => {
  const entry = itemFor(connection.session.getSnapshot(), 0, { rate: 32 });
  const blob = await fixtureBlob(440);
  return result(connection.audio.submit([{ ...entry, blob }]));
};

export const exerciseUncertainAndClosed = async name => {
  const peer = await openAudioPeer(name);
  const first = itemFor(peer.session.getSnapshot(), 0, { rate: 43 });
  const blob = await fixtureBlob(440);
  const submit = () => result(peer.audio.submit([{ ...first, blob }]));
  const prototype = IDBTransaction.prototype;
  const handler = Object.getOwnPropertyDescriptor(prototype, 'oncomplete');
  let inject = true;
  const commitUncertain = await withAddFault('meta', metaMarker, tx => {
    if (!inject) return;
    inject = false;
    // The real Text transaction commits. Deliver a false error before P15 can accept its receipt.
    handler.set.call(tx, () => tx.onerror(new Event('error')));
  }, submit);
  check(commitUncertain.status === 'uncertain' && commitUncertain.reloadRequired, 'Lost receipt classified as known failure');
  peer.session.dispose();
  const reconnected = await openAudioPeer(name);
  const live = await reconnected.audio.readRuntime(first);
  check(live.status === 'ready' && (await rows(reconnected.audio.name, 'batchSessions')).find(row => row.id === commitUncertain.operationId)?.status === 'committed',
    'Restart did not reconcile the real commit');
  const closedItem = itemFor(reconnected.session.getSnapshot(), 0, { rate: 44 });
  const prior = reconnected.session.getSnapshot();
  const closed = await withAddFault('meta', metaMarker, tx => tx.addEventListener('complete', () => reconnected.session.dispose()),
    () => result(reconnected.audio.submit([{ ...closedItem, blob }])));
  check(closed.status === 'committed-unaccepted' && reconnected.session.getSnapshot() === prior
    && (await result(reconnected.audio.submit([{ ...closedItem, blob }]))).code === 'AUDIO_CONNECTION_CLOSED', 'An old callback published through a disposed connection');
  check(await fetch(live.url).then(() => false, () => true), 'Old connection kept a live object URL');
  return { lostOperation: commitUncertain.operationId, closedOperation: closed.operationId };
};

export const verifyRestartAudio = async (connection, closedOperation) => {
  const current = itemFor(connection.session.getSnapshot(), 0, { rate: 44 });
  check((await connection.audio.readRuntime(current)).status === 'ready', 'Restart did not recover the closed connection commit');
  const recovered = (await rows(connection.audio.name, 'batchSessions')).filter(job => job.id === closedOperation);
  check(recovered.length === 1 && recovered[0].status === 'committed' && recovered[0].reconciled, 'Restart replayed or failed to recover the journal');
  return true;
};

export const exerciseHeadingReceipt = async name => {
  const connection = await openAudioPeer(name);
  const document = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), connection.session.getSnapshot().documents[0].id);
  const entry = planBookAtomicGeneration(document, null, 'mainTitle', 'text', { edgeTextVoiceId: 'en-GB-RyanNeural', edgeRate: 45, edgePitch: 4 });
  const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  const lost = await withAddFault('meta', metaMarker, tx => descriptor.set.call(tx, () => tx.onerror(new Event('error'))),
    () => result(connection.audio.generate([entry])));
  check(lost.status === 'uncertain' && lost.reloadRequired, 'Heading commit was not fenced after losing its receipt');
  check((await result(connection.audio.generate([entry]))).code === 'REFRESH_REQUIRED', 'Uncertain Heading write bypassed reconciliation');
  connection.session.dispose();
  check((await result(connection.audio.readRuntime(entry))).code === 'AUDIO_CONNECTION_CLOSED', 'Old Heading connection accepted a late read');
  const next = await openAudioPeer(name);
  try {
    check((await next.audio.readRuntime(entry)).status === 'ready', 'Reconnect failed to recover exact Heading bytes');
    const jobs = (await rows(next.audio.name, 'batchSessions')).filter(job => job.entries.some(item => item.fingerprint === entry.fingerprint));
    check(jobs.length === 1 && jobs[0].id === lost.operationId && jobs[0].status === 'committed' && jobs[0].reconciled, 'Heading reconciliation replayed the job');
    return entry.fingerprint;
  } finally { next.session.dispose(); }
};

export const readPrimaryAudio = async (connection, frequency = null) => {
  const item = itemFor(connection.session.getSnapshot(), 0);
  if (frequency) await connection.audio.submit([{ ...item, blob: await fixtureBlob(frequency) }]);
  const bound = await connection.audio.readRuntime(item);
  return { status: bound.status, id: bound.id, digest: bound.binary?.digest, fp: item.fingerprint, nativeId: item.target.segmentId,
    jobs: (await rows(connection.audio.name, 'batchSessions')).length };
};

export const exerciseBookBodyEntryChecks = async connection => {
  const entry = itemFor(connection.session.getSnapshot(), 0, { rate: 37 });
  const [original, different] = await Promise.all([fixtureBlob(440), fixtureBlob(660)]);
  const aborter = new AbortController();
  const cancelled = await withAddFault('batchSessions', isProvisional,
    tx => tx.addEventListener('complete', () => aborter.abort()),
    () => result(connection.audio.submit([{ ...entry, blob: original }], { signal: aborter.signal })));
  check(cancelled.status === 'precommit-failed', 'Failed to create a controlled provisional asset');
  check((await connection.audio.generate([entry])).status === 'committed', 'Generation failed to reuse valid provisional bytes');
  const accepted = await connection.audio.readRuntime(entry);
  const db = await open(connection.audio.name);
  const alter = async media => {
    const tx = db.transaction('audioBlob', 'readwrite');
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
    if (media) tx.objectStore('audioBlob').put({ id: accepted.id, blob: media });
    else tx.objectStore('audioBlob').delete(accepted.id);
    await done;
  };
  try {
    await alter(different);
    check((await connection.audio.readRuntime(entry)).status === 'corrupt', 'Corrupt bytes were reported Ready');
    check((await result(connection.audio.generate([entry]))).code === 'AUDIO_REPAIR_BYTES_REQUIRED', 'Generation failed to request digest-bound repair');
    check((await result(connection.audio.repair(entry, different))).code === 'AUDIO_REPAIR_BYTES_REQUIRED', 'Repair accepted different valid bytes');
    check((await connection.audio.repair(entry, original)).status === 'repaired', 'Exact committed copy did not repair corruption');
    await alter(null);
    check((await connection.audio.readRuntime(entry)).status === 'metadata-only', 'Missing physical bytes were reported Ready');
    check((await connection.audio.repair(entry, original)).status === 'repaired', 'Exact committed copy did not restore missing bytes');
    check((await connection.audio.readRuntime(entry)).binary.digest === accepted.binary.digest, 'Repair changed the committed digest');
  } finally { db.close(); }
  const adapter = adapterFor(connection.dbName);
  const loaded = await adapter.loadState();
  let failRead = true;
  const cold = createBookQaConnection({ ...adapter, loadState: async () => {
    if (failRead) throw Object.assign(new Error('Controlled failed cold read'), { code: 'TEST_COLD_READ' });
    return adapter.loadState();
  } }, loaded, { library: connection.dbName, optIn: true, origin: location.origin });
  try {
    check((await result(cold.audio.readRuntime(entry))).code === 'TEST_COLD_READ', 'Cold failure did not propagate');
    failRead = false;
    check((await result(cold.audio.readRuntime(entry))).code === 'REFRESH_REQUIRED', 'Touched bypassed failed cold recovery');
    check((await result(cold.audio.generate([entry]))).code === 'REFRESH_REQUIRED', 'Failed cold recovery did not fence publication');
    await cold.refresh();
    check((await cold.audio.readRuntime(entry)).status === 'ready', 'Successful Refresh did not unlock recovery');
  } finally { cold.session.dispose(); }
  return true;
};
