import { createJourneyToLondonFixture } from '../uat4/journey-to-london.js';
import { getBookBodyGenerationRequests, updateBookBodyProfileMetadata } from '../../../src/domain/text/bookQaBodyAudioDomain.js';
import { BOOK_AUDIO_MAX_BYTES, BOOK_AUDIO_MAX_ITEMS } from '../../../src/domain/text/bookQaAudioDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { withAddFault, openAudioPeer } from '../a1b-1a/audio-browser-probe.js';
import { seedDisposableTextManagementDatabase } from '../../../src/services/persistence/textDataManagementPersistenceService.js';
import { validateBookAudioBytes } from '../../../src/services/audio/bookQaAudioBytes.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const get = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const failed = promise => promise.then(() => null, ({ code, status, operationId }) => ({ code, status, operationId }));
const marker = value => value.key?.startsWith('bookQaAudioCommitV1:');
const tone = frequency => fetch('/__book_audio_' + frequency + '.mp3').then(response => response.blob());

export const seedBookAudioHardening = async dbName => {
  let { snapshot } = createJourneyToLondonFixture();
  const add = (type, payload) => {
    const applied = applyTextLibraryCommand(snapshot, { type, payload }, 6789);
    snapshot = applied.snapshot;
    return applied.result.id;
  };
  const workspaceId = add('document.create', { title: 'Audio batch stress', documentType: 'paragraph', textLanguage: 'en', meaningLanguage: 'id' });
  for (const count of [67, 4]) {
    const blockId = add('block.create', { documentId: workspaceId, blockType: 'paragraph', title: count + ' Sentences' });
    const unitId = snapshot.contentUnits.find(unit => unit.blockId === blockId).id;
    for (let index = 0; index < count; index++) {
      const group = index === 32 ? 0 : Math.floor(index / 32);
      add('segment.create', { blockId, unitId, text: `Stress ${count} group ${group} sentence ${index === 32 ? 0 : index % 4}.`,
        meaning: index % 2 === 0 ? `Arti ${group} ${index % 4}.` : '' });
    }
  }
  const conversationId = add('document.create', { title: 'Speaker audio stress', documentType: 'conversation', textLanguage: 'en', meaningLanguage: 'id' });
  const first = add('speaker.register', { documentId: conversationId, label: 'Nadia' });
  const second = add('speaker.register', { documentId: conversationId, label: 'Tariq' });
  const scene = add('block.create', { documentId: conversationId, blockType: 'conversation', title: 'Bilingual scene' });
  for (const [index, speakerId] of [first, first, second].entries()) {
    const unitId = add('contentUnit.create', { blockId: scene, kind: 'turn', speakerId });
    add('segment.create', { blockId: scene, unitId, text: `Standalone scene sentence ${index + 1}`, meaning: index === 1 ? '' : `Kalimat adegan ${index + 1}` });
  }
  const conversation = snapshot.documents.find(item => item.id === conversationId);
  let metadata = conversation.metadata;
  const profiles = [[first, ['en-GB-SoniaNeural', 'id-ID-GadisNeural']], [second, ['en-GB-RyanNeural', 'id-ID-ArdiNeural']]];
  for (const [speakerId, voices] of profiles) for (const [index, channel] of ['text', 'meaning'].entries()) {
    metadata = updateBookBodyProfileMetadata({ ...conversation, metadata }, {
      workspaceUid: conversation.uid, kind: 'conversation', channel, speakerId, values: { edgeVoice: voices[index] }
    });
  }
  add('document.update', { id: conversationId, metadata });
  await seedDisposableTextManagementDatabase({ dbName, snapshot, createOnly: true });
  return { workspaceId, conversationId };
};

const cardRequests = (connection, workspaceId, rate, count = 67) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  return getBookBodyGenerationRequests(tree, tree.blocks[0], 'text', {
    options: { preferences: { edgeTextVoiceId: 'en-GB-RyanNeural', edgeRate: rate, edgePitch: 0 } }
  }).slice(0, count);
};

const accessStore = async (audio, name, operation, write = false) => {
  const db = await get(indexedDB.open(audio.name));
  try {
    const tx = db.transaction(name, write ? 'readwrite' : 'readonly');
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    done.catch(() => {});
    const result = await get(operation(tx.objectStore(name)));
    await done;
    return result;
  } finally { db.close(); }
};
const rows = (audio, name) => accessStore(audio, name, store => store.getAll());
const journals = audio => rows(audio, 'batchSessions');
const set = (audio, name, row) => accessStore(audio, name, store => store.put(row), true);
const getAsset = async (audio, request) => (await rows(audio, 'audioMeta')).find(meta => meta.mapKey === request.fingerprint);

export const exerciseGenerationSequence = async (connection, workspaceId, externalWrite) => {
  const { audio, session } = connection;
  const run = (rate, count, options) => audio.generateSequence(cardRequests(connection, workspaceId, rate, count), options);
  const expect = (result, committed, available, batchCounts, stopped = null) => {
    check(result.committed === committed && result.alreadyAvailable === available && (result.stopped?.code ?? null) === stopped
      && JSON.stringify(result.batches.map(batch => batch.logical)) === JSON.stringify(batchCounts), 'Unexpected generation report ' + JSON.stringify(result));
  };
  const initial = session.getSnapshot();
  const count32 = await run(1, 32);
  expect(count32, 32, 0, [32]);
  check(count32.batches[0].stored === 4, '32 logical recordings did not reuse shared RFs');
  const count33 = await run(2, 33);
  expect(count33, 33, 0, [32, 1]);
  check(count33.batches[1].reused === 1 && count33.batches[1].stored === 0, 'Shared RF across batch boundaries was duplicated');
  const beforeNoop = await journals(audio);
  const again = await run(2, 33);
  expect(again, 0, 33, [32, 1]);
  check(again.batches.every(batch => !batch.operationId) && (await journals(audio)).length === beforeNoop.length, 'Exact repetition published metadata');

  const controller = new AbortController();
  const cancelled = await run(4, 67, { signal: controller.signal, onProgress: () => controller.abort() });
  expect(cancelled, 32, 0, [32], 'AUDIO_CANCELLED');
  const resumed = await run(4, 67);
  expect(resumed, 35, 32, [32, 32, 3]);

  let injectQuota = false;
  const partial = await withAddFault('audioBlob', () => injectQuota, () => { throw new DOMException('Fixture quota', 'QuotaExceededError'); },
    () => run(5, 67, { onProgress: () => { injectQuota = true; } }));
  expect(partial, 32, 0, [32], 'AUDIO_QUOTA');
  const partialRetry = await run(5, 67);
  expect(partialRetry, 35, 32, [32, 32, 3]);

  const stale = await run(6, 67, { onProgress: externalWrite });
  expect(stale, 32, 0, [32], 'STALE_RESULT');
  check((await failed(run(6, 67))).code === 'REFRESH_REQUIRED', 'Stale connection permitted another operation');
  await connection.refresh();
  const staleRetry = await run(6, 67);
  expect(staleRetry, 35, 32, [32, 32, 3]);

  const completion = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  let commits = 0;
  const uncertain = await withAddFault('meta', marker, tx => {
    if (++commits === 2) completion.set.call(tx, () => tx.onerror(new Event('error')));
  }, () => run(7, 67));
  check(uncertain.committed === 32 && uncertain.batches.length === 1 && uncertain.stopped?.status === 'uncertain'
    && uncertain.stopped.reloadRequired, 'Uncertain commit crossed the batch boundary');
  check((await failed(run(7, 67))).code === 'REFRESH_REQUIRED', 'Uncertain connection permitted another operation');
  const peer = await openAudioPeer(connection.dbName);
  let peerRetry;
  try {
    peerRetry = await peer.audio.generateSequence(cardRequests(peer, workspaceId, 7));
    expect(peerRetry, 3, 64, [32, 32, 3]);
  } finally { peer.session.dispose(); }
  await connection.refresh();
  check((await journals(audio)).find(job => job.id === uncertain.stopped.operationId).status === 'committed', 'Reconciliation did not accept the original marker');

  const postcommit = new AbortController();
  commits = 0;
  const unaccepted = await withAddFault('meta', marker, tx => {
    if (++commits === 2) tx.addEventListener('complete', () => postcommit.abort());
  }, () => run(8, 67, { signal: postcommit.signal }));
  check(unaccepted.committed === 32 && unaccepted.batches.length === 1 && unaccepted.stopped?.status === 'committed-unaccepted'
    && unaccepted.stopped.reloadRequired, 'Publication continued after a committed but unaccepted batch');
  check((await failed(run(8, 67))).code === 'REFRESH_REQUIRED', 'Committed but unaccepted state permitted another operation');
  await connection.refresh();
  const acceptedRetry = await run(8, 67);
  expect(acceptedRetry, 3, 64, [32, 32, 3]);
  const after = session.getSnapshot();
  check(['documents', 'blocks', 'contentUnits', 'segments'].every(key => JSON.stringify(after[key]) === JSON.stringify(initial[key])),
    'Generation changed authored identity or order');
  const savedJobs = await journals(audio);
  const requests = cardRequests(connection, workspaceId, 7);
  const acceptedIds = [...uncertain.batches.map(batch => batch.operationId), uncertain.stopped.operationId,
    ...peerRetry.batches.map(batch => batch.operationId).filter(Boolean)];
  const ordered = acceptedIds.flatMap(id => savedJobs.find(job => job.id === id).entries);
  check(ordered.every((entry, index) => entry.target.segmentUid === requests[index].target.segmentUid
    && entry.descriptor.voiceId === 'en-GB-RyanNeural'), 'Receipt order, ownership, or voice changed');
  check(savedJobs.every(job => job.entries.length <= BOOK_AUDIO_MAX_ITEMS
    && [...new Map(job.entries.map(entry => [entry.fingerprint, entry.binary.bytes])).values()].reduce((a, b) => a + b, 0) <= BOOK_AUDIO_MAX_BYTES),
  'A journal exceeded release batch limits');
  return { count32, count33, again, cancelled, resumed, partial, partialRetry, stale, staleRetry, uncertain, peerRetry,
    unaccepted, acceptedRetry, journals: savedJobs.length };
};

export const exerciseDamagedProvisional = async (connection, workspaceId) => {
  const { audio, session } = connection;
  const [original, different] = await Promise.all([tone(440), tone(660)]);
  const candidate = rate => cardRequests(connection, workspaceId, rate, 1)[0];
  const provisional = async entry => {
    const controller = new AbortController();
    const result = await withAddFault('batchSessions', row => row.status === 'provisional',
      tx => tx.addEventListener('complete', () => controller.abort()),
      () => failed(audio.submit([{ ...entry, blob: original }], { signal: controller.signal })));
    check(result.status === 'precommit-failed', 'Fixture failed to create uncommitted audio');
    return getAsset(audio, entry);
  };

  const intact = candidate(31);
  await provisional(intact);
  await audio.generateSequence([intact]);
  const initialDigest = (await validateBookAudioBytes(original, 'mp3')).digest;
  check((await audio.readRuntime(intact)).binary.digest === initialDigest, 'Valid provisional content was rendered again');
  const damaged = candidate(32);
  const originalMeta = await provisional(damaged);
  await set(audio, 'audioBlob', { id: originalMeta.id, blob: different });
  const before = session.getSnapshot();
  const recovered = await audio.generateSequence([damaged]);
  const accepted = await audio.readRuntime(damaged, { withUrl: false });
  const newMeta = await getAsset(audio, damaged);
  check(recovered.committed === 1 && !recovered.stopped && accepted.status === 'ready' && accepted.binary.digest !== initialDigest
    && originalMeta.id === newMeta.id && originalMeta.batchSessionId !== newMeta.batchSessionId, 'Damaged provisional recovery did not verify new bytes');
  check((await journals(audio)).find(job => job.id === originalMeta.batchSessionId).status === 'precommit-failed', 'Prior job was removed');
  check((await audio.readRuntime(intact)).binary.digest === initialDigest, 'Unrelated committed bytes changed');
  check(JSON.stringify(session.getSnapshot().segments) === JSON.stringify(before.segments), 'Recovery changed authored data');
  const conflicting = await failed(audio.submit([{ ...damaged, blob: original }]));
  check(conflicting.code === 'AUDIO_BYTE_CONFLICT', 'Different bytes displaced an accepted digest');

  const protectedBytes = await accessStore(audio, 'audioBlob', store => store.get(newMeta.id));
  await set(audio, 'audioBlob', { id: newMeta.id, blob: different });
  const [standalone, ...series] = cardRequests(connection, workspaceId, 32, 5);
  const shared = series.find(entry => entry.fingerprint === standalone.fingerprint);
  const direct = await audio.generateSequence([damaged]);
  const otherOwner = await audio.generateSequence([shared]);
  check(direct.stopped?.code === 'AUDIO_REPAIR_BYTES_REQUIRED' && otherOwner.stopped?.code === 'AUDIO_REPAIR_BYTES_REQUIRED',
    'A committed digest was treated as provisional');
  await audio.repair(damaged, protectedBytes.blob);
  check((await audio.readRuntime(damaged, { withUrl: false })).binary.digest === accepted.binary.digest, 'Exact restore changed the committed digest');

  const unknown = candidate(33);
  const unknownMeta = await provisional(unknown);
  await set(audio, 'audioMeta', { ...unknownMeta, batchSessionId: crypto.randomUUID() });
  await set(audio, 'audioBlob', { id: unknownMeta.id, blob: different });
  const rejected = await audio.generateSequence([unknown]);
  check(rejected.stopped?.code === 'AUDIO_STAGED_BYTES_UNAVAILABLE' && !rejected.committed, 'Unproven journal ownership was accepted');
  // Restore the fixture row for the next independent reconciliation case.
  await set(audio, 'audioMeta', unknownMeta);

  const uncertainEntry = candidate(34);
  const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  const uncertain = await withAddFault('meta', marker, tx => complete.set.call(tx, () => tx.onerror(new Event('error'))),
    () => failed(audio.submit([{ ...uncertainEntry, blob: original }])));
  const uncertainMeta = await getAsset(audio, uncertainEntry);
  await set(audio, 'audioBlob', { id: uncertainMeta.id, blob: different });
  check(uncertain.status === 'uncertain' && (await failed(connection.refresh())).code === 'AUDIO_READBACK_FAILED',
    'Corrupt uncertain ownership did not block recovery');
  check((await failed(audio.generateSequence([uncertainEntry]))).code === 'REFRESH_REQUIRED', 'Uncertain state allowed replacement');
  await set(audio, 'audioBlob', { id: uncertainMeta.id, blob: original });
  await connection.refresh();
  check((await audio.readRuntime(uncertainEntry, { withUrl: false })).binary.digest === initialDigest, 'Commit reconciliation changed the accepted digest');
  return { recovered, firstDigest: initialDigest, recoveredDigest: accepted.binary.digest, conflicting, direct, otherOwner, rejected, uncertain };
};

export const populateStandaloneConversation = async (connection, workspaceId) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const [scene] = tree.blocks;
  const [low, high] = await Promise.all([440, 660].map(async frequency => {
    const audio = await tone(frequency);
    return new Blob(Array(18).fill(audio), { type: 'audio/mpeg' });
  }));
  const options = { preferences: { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-ArdiNeural' } };
  const en = getBookBodyGenerationRequests(tree, scene, 'text', { options });
  const id = getBookBodyGenerationRequests(tree, scene, 'meaning', { options });
  check(id.length === 2 && id.every(entry => entry.target.segmentId !== scene.segments[1].id), 'Blank channel created a recording requirement');
  await connection.audio.submit(en.map(entry => ({ ...entry, blob: entry.descriptor.voiceId === 'en-GB-SoniaNeural' ? low : high })));
  await connection.audio.submit([{ ...id[1], blob: high }]);
  const ready = await Promise.all([...en, ...id].map(entry => connection.audio.readRuntime(entry, { withUrl: false })));
  check(ready.map(row => row.status).join() === 'ready,ready,ready,missing,ready', 'Independent channel readiness was not preserved');
  return { cardId: scene.id, segments: scene.segments.map(segment => segment.id), units: scene.units.map(unit => [unit.id, unit.speakerId]),
    readiness: ready.map(row => row.status), voices: [...en, ...id].map(entry => entry.descriptor.voiceId) };
};

export const exerciseGenerationByteBoundary = async (connection, workspaceId) => {
  const [original, requests] = await Promise.all([tone(440), cardRequests(connection, workspaceId, 18, 3)]);
  const size = BOOK_AUDIO_MAX_BYTES / 2;
  const padding = size - 10 - original.size;
  const tag = Uint8Array.of(73, 68, 51, 3, 0, 0, ...[21, 14, 7, 0].map(shift => (padding >>> shift) & 127));
  const padded = new Blob([tag, new Uint8Array(padding), original], { type: 'audio/mpeg' });
  check(padded.size === size, 'Padded MP3 fixture size was incorrect');
  const nativeFetch = window.fetch;
  let calls = 0;
  window.fetch = (resource, init) => {
    if (new URL(typeof resource === 'string' ? resource : resource.url, location.href).pathname !== '/api/tts') {
      return nativeFetch(resource, init);
    }
    init.signal?.throwIfAborted();
    return Promise.resolve(new Response(++calls <= 2 ? padded : original, { headers: { 'Content-Type': 'audio/mpeg' } }));
  };
  let result;
  try { result = await connection.audio.generateSequence(requests); }
  finally { window.fetch = nativeFetch; }
  check(result.committed === 3 && !result.stopped && calls === 3
    && result.batches[0].bytes === BOOK_AUDIO_MAX_BYTES && result.batches[0].logical === 2
    && result.batches[1].bytes === original.size && result.batches[1].logical === 1,
  '64 MiB byte boundary failed ' + JSON.stringify(result));
  return { result, calls, fileBytes: padded.size };
};
