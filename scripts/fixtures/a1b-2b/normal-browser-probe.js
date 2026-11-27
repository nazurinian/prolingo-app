import { createJourneyToLondonFixture } from '../uat4/journey-to-london.js';
import { getBookBodyGenerationRequests, updateBookBodyProfileMetadata } from '../../../src/domain/text/bookQaBodyAudioDomain.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { openPortableAudioZip } from '../../../src/services/audio/textStructuredAudioZipArchiveService.js';
import { validateBookAudioBytes } from '../../../src/services/audio/bookQaAudioBytes.js';
import { createTextDataManagementPersistenceAdapter, seedDisposableTextManagementDatabase } from '../../../src/services/persistence/textDataManagementPersistenceService.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const voices = {
  Narrator: ['en-GB-SoniaNeural', 'id-ID-GadisNeural'],
  James: ['en-GB-RyanNeural', 'id-ID-ArdiNeural'],
  'Ticket Officer': ['en-GB-LibbyNeural', 'id-ID-GadisNeural']
};
const tokens = { Narrator: ['SONIA', 'GADIS'], James: ['RYAN', 'ARDI'], 'Ticket Officer': ['LIBBY', 'GADIS'] };
const channels = ['text', 'meaning'];
const options = { preferences: { edgeTextVoiceId: 'en-GB-MaisieNeural', edgeMeaningVoiceId: 'id-ID-ArdiNeural' },
  audioSourceMode: 'local-first', globalRate: 1 };
const pad = value => String(value).padStart(2, '0');

export const seedBilingualNormal = async dbName => {
  const { snapshot, ids } = createJourneyToLondonFixture();
  const document = resolveTextLibraryDocumentTree(snapshot, ids.documentId);
  let metadata = document.metadata;
  for (const [label, profile] of Object.entries(voices)) {
    for (const [index, channel] of channels.entries()) {
      metadata = updateBookBodyProfileMetadata({ ...document, metadata }, { workspaceUid: document.uid, channel,
        kind: label === 'Narrator' ? 'paragraph' : 'conversation', values: { edgeVoice: profile[index] },
        ...(label === 'Narrator' ? {} : { speakerId: ids.speakers[label] }) });
    }
  }
  const authored = applyTextLibraryCommand(snapshot, { type: 'document.update', payload: { id: document.id, metadata } }, 42).snapshot;
  await seedDisposableTextManagementDatabase({ dbName, snapshot: authored, createOnly: true });
  return { workspaceId: document.id, speakers: ids.speakers };
};

export const populateBilingualNormal = async (connection, workspaceId, speakers) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const [paragraph, scene] = tree.blocks;
  const tones = await Promise.all([440, 660].map(frequency => fetch('/__book_audio_' + frequency + '.mp3').then(response => response.blob())));
  const splits = [], units = [], fulls = [], requests = [];
  for (const block of [paragraph, scene]) {
    const cardOrder = block === paragraph ? '01_P1_' : '02_C1_';
    const selectedUnits = block === paragraph ? block.units.slice(0, 1) : block.units;
    for (const [unitIndex, unit] of selectedUnits.entries()) {
      const speaker = block === paragraph ? 'Narrator' : unit.speaker;
      const unitName = block === paragraph ? 'SC01' : `T${pad(unitIndex + 1)}_${speaker.replaceAll(' ', '_')}`;
      if (block === scene) check(unit.speakerId === speakers[speaker], 'Unexpected registered Turn owner');
      for (const [channelIndex, channel] of channels.entries()) {
        const lang = channelIndex ? 'ID' : 'EN';
        const token = tokens[speaker][channelIndex];
        const members = [];
        for (const [index, segment] of unit.segments.entries()) {
          const [entry] = getBookBodyGenerationRequests(tree, block, channel, { segment, options });
          check(entry.target.segmentUid === segment.uid && entry.target.cardUid === block.uid
            && entry.descriptor.voiceId === voices[speaker][channelIndex], 'Split owner or effective provider voice mismatch');
          const fixture = tones[(index + unitIndex + channelIndex) % 2];
          const blob = new Blob(Array(3 + channelIndex + unitIndex + 2 * index).fill(fixture), { type: 'audio/mpeg' });
          const digest = (await validateBookAudioBytes(blob, 'mp3')).digest;
          const tail = `/Split/${unitName}/SG${pad(index + 1)}_${lang}_${token}.mp3`;
          splits.push({ cardOrder, tail, digest, entry, speaker, unitUid: unit.uid, speakerId: unit.speakerId, sentence: segment[channel] });
          members.push({ blob, digest, fingerprint: entry.fingerprint, sentence: segment[channel] });
          requests.push({ ...entry, blob });
        }
        units.push({ cardOrder, tail: `/Full_${block === scene ? 'Turn' : 'Section'}/${unitName}_${lang}_${token}.wav`, members, speaker, channel });
      }
    }
  }
  check(requests.length === 32, 'Bilingual fixture selection must supply 32 logical Splits');
  await connection.audio.submit(requests);
  const [alternate] = getBookBodyGenerationRequests(tree, scene, 'text', { segment: scene.segments[0],
    options: { ...options, preferences: { ...options.preferences, edgePitch: 9 } } });
  const alternateBlob = new Blob(Array(9).fill(tones[1]), { type: 'audio/mpeg' });
  const alternateDigest = (await validateBookAudioBytes(alternateBlob, 'mp3')).digest;
  await connection.audio.submit([{ ...alternate, blob: alternateBlob }]);
  for (const [channelIndex, channel] of channels.entries()) {
    const [entry] = getBookBodyGenerationRequests(tree, scene, channel, { full: true, options });
    const members = units.filter(unit => unit.cardOrder === '02_C1_' && unit.channel === channel).flatMap(unit => unit.members);
    check(entry.descriptor.composition.every((input, index) => input.renderFingerprint === members[index].fingerprint),
      'Derived plan used a different order or render identity');
    fulls.push({ cardOrder: '02_C1_', tail: `/Full_Card/${channelIndex ? 'ID' : 'EN'}_MULTI-SPEAKER.wav`, members, entry });
  }
  await connection.audio.generate(fulls.map(full => full.entry));
  for (const full of fulls) {
    const runtime = await connection.audio.readRuntime(full.entry, { withUrl: false });
    check(runtime.status === 'ready' && runtime.trustedComposition, 'Full Conversation was not locally verified');
  }
  window.__normalFixture = { splits, units, fulls, alternate, alternateDigest };
  return { splits: splits.length, units: units.length, fulls: fulls.length, alt: alternate.descriptor };
};

const matchPath = (item, expected) => item.filename.split('/')[1]?.startsWith(expected.cardOrder) && item.filename.endsWith(expected.tail);

export const inspectBilingualNormal = async (connection, workspaceId) => {
  const expected = window.__normalFixture;
  const archive = await openPortableAudioZip(await window.__normalDownloads.at(-1).blob);
  const find = expected => {
    const found = archive.entries.filter(item => matchPath(item, expected));
    check(found.length === 1, 'Missing or duplicate occurrence ' + expected.tail);
    return archive.read(found[0]);
  };
  check(archive.entries.length === expected.splits.length + expected.units.length + expected.fulls.length, 'Unexpected listening occurrence');
  const splits = [];
  for (const split of expected.splits) {
    const proof = await validateBookAudioBytes(await find(split), 'mp3');
    check(proof.digest === split.digest, 'Split audio bytes differ from the selected render at ' + split.tail);
    splits.push({ pathSuffix: split.tail, voiceId: split.entry.descriptor.voiceId, speakerId: split.speakerId, unitUid: split.unitUid,
      sentence: split.sentence, digest: proof.digest });
  }
  check(new Set(splits.map(split => split.digest)).size > 6, 'Fixture could not distinguish authored inputs');
  const context = new AudioContext({ sampleRate: 48000 });
  const wavs = [];
  try {
    const decoded = new Map();
    for (const output of [...expected.units, ...expected.fulls]) {
      const blob = await find(output);
      const proof = await validateBookAudioBytes(blob, 'wav');
      const bytes = await blob.arrayBuffer();
      const view = new DataView(bytes);
      check(proof.sampleRate === 48000 && view.getUint16(22, true) === 1, 'Unexpected fixture WAV precision');
      let offset = 44;
      for (const member of output.members) {
        if (!decoded.has(member.digest)) decoded.set(member.digest, (await context.decodeAudioData(await member.blob.arrayBuffer())).getChannelData(0));
        for (const sample of decoded.get(member.digest)) {
          const pcm = sample < 0 ? Math.round(Math.max(-1, sample) * 32768) : Math.round(Math.min(1, sample) * 32767);
          check(Math.abs(view.getInt16(offset, true) - pcm) <= 1, 'PCM mismatch at ' + output.tail + ' frame ' + (offset - 44) / 2);
          offset += 2;
        }
      }
      check(offset === view.byteLength, 'Unexpected extra samples at ' + output.tail);
      wavs.push({ pathSuffix: output.tail, digest: proof.digest, frames: (offset - 44) / 2,
        orderedInputDigests: output.members.map(member => member.digest) });
    }
  } finally { await context.close(); }
  const settings = { workspaceId, preferences: options.preferences, channels: ['text'], representations: ['split'] };
  const { blob } = await connection.audio.exportNormal({ ...settings, includeAlternate: true });
  const profiles = await openPortableAudioZip(blob);
  const alternate = profiles.entries.find(item => item.filename.endsWith(expected.alternate.fingerprint.split('-').at(-1) + '.mp3'));
  check(alternate && !archive.entries.some(item => item.filename === alternate.filename), 'Current and alternate profiles were not separated');
  check((await validateBookAudioBytes(await profiles.read(alternate), 'mp3')).digest === expected.alternateDigest, 'Alternate bytes were substituted');
  check(profiles.entries.every(item => item.filename.includes('_EN_') && item.filename.includes('/Split/')), 'Channel or representation was ignored');
  return { paths: archive.entries.map(item => item.filename), splits, wavs, alternate: alternate.filename, alternateDigest: expected.alternateDigest };
};

export const armNormalDecode = () => {
  const Native = globalThis.AudioContext;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const state = { opened: 0, closed: 0, decodes: 0, paused: false, release,
    restore: () => { globalThis.AudioContext = Native; release(); } };
  globalThis.AudioContext = class extends Native {
    constructor(settings) { super(settings); state.opened++; }
    async decodeAudioData(buffer) {
      state.decodes++;
      const decoded = await super.decodeAudioData(buffer);
      if (state.decodes === 1) { state.paused = true; await gate; }
      return decoded;
    }
    async close() { await super.close(); state.closed++; }
  };
  window.__normalDecode = state;
};

export const armNormalFinalRead = dbName => {
  const originalTransaction = IDBDatabase.prototype.transaction;
  const oncomplete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
  let count = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const state = { paused: false, release, restore: () => { IDBDatabase.prototype.transaction = originalTransaction; release(); } };
  IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
    const tx = originalTransaction.call(this, stores, mode, ...rest);
    if (this.name === dbName && mode === 'readonly' && Array.isArray(stores) && stores.includes('audioVariants') && ++count === 2) {
      Object.defineProperty(tx, 'oncomplete', { set(handler) {
        oncomplete.set.call(tx, async event => { state.paused = true; await gate; handler.call(tx, event); });
      } });
    }
    return tx;
  };
  window.__normalFinalRead = state;
};

export const normalSnapshotFingerprint = async dbName => (await createTextDataManagementPersistenceAdapter({ dbName, boundary: 'disposable',
  permissions: ['catalog', 'content'], bookAuthoring: true }).loadState()).snapshotFingerprint;

export const normalMediaDigest = async (url, digest) => {
  if (!url?.startsWith('blob:')) return false;
  const buffer = await (await fetch(url)).arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
  return hash === digest;
};

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const inspectNormalUnitDiagnostics = async (connection, workspaceId) => {
  const { splits } = window.__normalFixture;
  const [first, second] = splits;
  const runtime = await connection.audio.readRuntime(first.entry, { withUrl: false });
  const db = await requestResult(indexedDB.open(connection.audio.name));
  const store = 'audioBlob';
  const original = await requestResult(db.transaction(store).objectStore(store).get(runtime.id));
  const mutate = change => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    change(tx.objectStore(store));
  });
  const requested = { workspaceId, preferences: options.preferences, channels: ['text'], representations: ['unit', 'split'] };
  const run = async splitStatus => {
    const result = await connection.audio.exportNormal(requested);
    const archive = await openPortableAudioZip(result.blob);
    check(!archive.entries.some(item => matchPath(item, first)), 'Damaged input was included');
    check(archive.entries.some(item => matchPath(item, second)), 'Another exact Split was omitted');
    check(!archive.entries.some(item => item.filename.startsWith('01_') && item.filename.includes('/Full_Section/SC01_EN_')),
      'Partial Unit was included');
    const matching = result.report.omissions.filter(row => row.unitUid === first.unitUid || row.ref?.ownerUid === first.entry.target.segmentUid);
    check(matching.some(row => row.status === 'unavailable-unit-input') && matching.some(row => row.status === splitStatus),
      'Incomplete Unit lacked precise diagnostics');
    return matching.map(item => item.status);
  };
  try {
    await mutate(target => target.delete(runtime.id));
    const missing = await run('metadata-only');
    await mutate(target => target.put({ id: runtime.id, blob: new Blob(['disturbed fixture']) }));
    const corrupt = await run('corrupt');
    return { missing, corrupt };
  } finally {
    try { await mutate(target => target.put(original)); }
    finally { db.close(); }
  }
};
