import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJourneyToLondonFixture } from './fixtures/uat4/journey-to-london.js';
import { applyTextDataManagementCommand } from '../src/domain/text/textDataManagementDomain.js';
import { resolveTextLibraryDocumentTree } from '../src/domain/text/textLibraryDomain.js';
import { applyBookQaAudioOperation, collectBookHeadingAudioReferences, readBookAudioBinding } from '../src/domain/text/bookQaAudioDomain.js';
import { bookHeadingBoundarySteps, planBookAtomicGeneration, planBookAtomicPlayback } from '../src/domain/text/bookQaHeadingAudioDomain.js';
import { BOOK_HEADING_AUDIO_KEY, projectBookHeadings, resolveBookHeadingRead } from '../src/domain/text/textBookHeadingDomain.js';
import { getBookSplitPlaybackRequests } from '../src/domain/text/bookQaBodyAudioDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../src/domain/text/textPackJsonDomain.js';
import { executeStructuredTextPlaybackSessionService } from '../src/services/playback/textStructuredPlaybackSessionService.js';
import { navigateOwnedPlayback } from '../src/services/playback/playbackRuntimeControlService.js';

const { snapshot: original, ids } = createJourneyToLondonFixture();
const tree = snapshot => resolveTextLibraryDocumentTree(snapshot, ids.documentId);
const first = tree(original).blocks[0];
const execute = (snapshot, type, payload) => applyTextDataManagementCommand(snapshot, { type, payload }, {
  bookAuthoring: true, boundary: 'disposable', permissions: ['catalog', 'content'], selection: { workspaceId: ids.documentId }, now: 42
}).snapshot;
const prefs = { edgeTextVoiceId: 'en-GB-LibbyNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 };
const proof = { digest: 'a'.repeat(64), format: 'mp3', bytes: 64, sampleRate: 24000 };
const setTitle = (snapshot, mainTitle, title) => execute(snapshot, 'document.update', { id: ids.documentId, mainTitle, ...(title ? { title } : {}) });
const setHeading = (snapshot, card, heading) => execute(snapshot, 'block.update', { id: card.id, heading });
const authored = setHeading(setTitle(original, { mode: 'custom', en: first.segments[0].text, id: 'Judul mandiri' }), first, { en: 'A paragraph heading', id: 'Paragraf awal' });
const titleAudio = (snapshot, channel, preferences = prefs) => planBookAtomicGeneration(tree(snapshot), null, 'mainTitle', channel, preferences);
const sound = request => ({ ...request, binary: proof });

test('atomic RF shares exact Segment bytes without adding any learning or Full records', () => {
  const document = tree(authored);
  const split = getBookSplitPlaybackRequests(document, document.blocks[0], document.blocks[0].segments[0], 'text', { preferences: prefs })[0];
  const heading = titleAudio(authored, 'text');
  assert.equal(heading.fingerprint, split.fingerprint);
  assert.deepEqual(heading.descriptor, split.descriptor);
  const { snapshot, result } = applyBookQaAudioOperation(authored, [sound(split), sound(heading)], 43);
  assert.equal(result[1].id, JSON.stringify([document.uid, 'mainTitle', 'text']));
  for (const store of ['blocks', 'contentUnits', 'segments']) assert.deepEqual(snapshot[store], authored[store]);
  assert.deepEqual(collectBookHeadingAudioReferences(snapshot), [[heading.fingerprint, {
    descriptor: heading.descriptor, binary: proof
  }]]);
  assert.equal(readBookAudioBinding(snapshot, heading).status, 'bound');
  assert.throws(() => applyBookQaAudioOperation(snapshot, [{ ...sound(split), binary: { ...proof, digest: 'b'.repeat(64) } }], 43),
    { code: 'AUDIO_BYTE_CONFLICT' });
  assert.throws(() => applyBookQaAudioOperation(snapshot, [sound({ ...heading, target: { ...heading.target, documentUid: 'forged' } })], 43),
    { code: 'AUDIO_TARGET_CHANGED' });
});

test('linked/custom rename and channel edits retain prior exact references and unaffected Body', () => {
  const en = titleAudio(authored, 'text'), id = titleAudio(authored, 'meaning');
  const alternate = titleAudio(authored, 'text', { ...prefs, edgePitch: 4 });
  const { snapshot } = applyBookQaAudioOperation(authored, [en, alternate, id].map(sound), 43);
  const renamed = execute(snapshot, 'document.update', { id: ids.documentId, title: 'Catalogue label changed' });
  assert.equal(titleAudio(renamed, 'text').fingerprint, en.fingerprint);
  const changedEn = setTitle(renamed, { mode: 'custom', en: 'Different title' });
  assert.equal(readBookAudioBinding(changedEn, en).status, 'stale');
  assert.equal(readBookAudioBinding(changedEn, titleAudio(changedEn, 'text')).status, 'stale');
  assert.equal(readBookAudioBinding(changedEn, id).status, 'bound');
  const changedId = setTitle(renamed, { mode: 'custom', en: tree(renamed).metadata.bookMainTitleV1.en, id: 'Terjemahan lain' });
  assert.equal(readBookAudioBinding(changedId, en).status, 'bound');
  assert.equal(readBookAudioBinding(changedId, id).status, 'stale');
  assert.equal(readBookAudioBinding(changedId, alternate).status, 'bound');
  const linked = setTitle(changedEn, { mode: 'workspace-name' }, 'Linked title');
  const linkedRenamed = execute(linked, 'document.update', { id: ids.documentId, title: 'New linked name' });
  assert.notEqual(titleAudio(linked, 'text').fingerprint, titleAudio(linkedRenamed, 'text').fingerprint);
  assert.equal(titleAudio(linkedRenamed, 'meaning').fingerprint, id.fingerprint);
  for (const store of ['blocks', 'contentUnits', 'segments', 'audioVariants']) assert.deepEqual(linkedRenamed[store], snapshot[store]);
});

test('Card clearing, authored reorder and Text Pack UID modes preserve the correct logical ownership', () => {
  const document = tree(authored), card = document.blocks[0];
  const audio = planBookAtomicGeneration(document, card, 'heading', 'text', prefs);
  const { snapshot, result } = applyBookQaAudioOperation(authored, [sound(audio)], 43);
  const moved = { ...snapshot, blocks: snapshot.blocks.map(block => ({ ...block, order: 5 - block.order })) };
  assert.equal(readBookAudioBinding(moved, audio).headingId, result[0].id);
  const cleared = setHeading(snapshot, card, { en: '', id: null });
  const clearedTree = tree(cleared);
  assert.equal(planBookAtomicGeneration(clearedTree, clearedTree.blocks[0], 'heading', 'text', prefs), null);
  assert.equal(collectBookHeadingAudioReferences(cleared).length, 1);
  const empty = { ...original, collections: [], documents: [], blocks: [], contentUnits: [], segments: [], audioVariants: [], activeDocumentId: null };
  const pack = createProLingoTextPack({ snapshot, rootId: document.id });
  for (const uidMode of ['preserve', 'new-copy']) {
    const { snapshot: transferred } = mergeProLingoTextPack({ localSnapshot: empty, pack, uidMode });
    const next = resolveTextLibraryDocumentTree(transferred, transferred.documents[0].id);
    const request = planBookAtomicGeneration(next, next.blocks[0], 'heading', 'text', prefs);
    assert.equal(request.fingerprint, audio.fingerprint);
    const binding = readBookAudioBinding(transferred, request);
    assert.equal(binding.status, 'bound');
    assert.equal(binding.headingId === result[0].id, uidMode === 'preserve');
  }
});

test('read/show and Global profiles ignore Body overrides and reject protected setting injection', () => {
  const document = tree(authored);
  assert.deepEqual(resolveBookHeadingRead(document), { mainTitle: true, paragraph: false, scene: true });
  const saved = execute(authored, 'document.update', { id: document.id, headingRead: { workspaceUid: document.uid, key: 'paragraph', read: true } });
  const changed = execute(saved, 'document.update', { id: document.id, bodyAudioProfile: {
    workspaceUid: document.uid, channel: 'text', kind: 'paragraph', values: { edgeVoice: 'en-GB-RyanNeural', playbackRate: 1.5 }
  } });
  const updated = tree(changed);
  assert.equal(projectBookHeadings(updated, { paragraph: false }).cards[first.id].visible, false);
  assert.equal(bookHeadingBoundarySteps(updated, updated.blocks[0], ['meaning', 'text']).map(step => step.content).join('|'), 'Paragraf awal|A paragraph heading');
  assert.deepEqual(titleAudio(changed, 'text'), titleAudio(authored, 'text'));
  assert.equal(planBookAtomicPlayback(updated, null, 'mainTitle', 'text', { preferences: prefs, audioSourceMode: 'tts-only' }).length, 0);
  assert.equal(planBookAtomicPlayback(updated, null, 'mainTitle', 'text', { preferences: prefs, audioSourceMode: 'custom-local' }).length, 0);
  assert.throws(() => execute(saved, 'document.update', { id: document.id, metadata: { [BOOK_HEADING_AUDIO_KEY]: {} } }), { code: 'PROTECTED_METADATA' });
  assert.throws(() => execute(saved, 'document.update', { id: document.id, headingRead: { workspaceUid: 'forged', key: 'paragraph', read: true } }), { code: 'BOOK_HEADING_READ_INVALID' });
});

test('pure Paragraph and Conversation use authored channels, with blank labels and old Title roles excluded', async () => {
  const document = tree(authored);
  const paragraph = document.blocks[0];
  const scene = document.blocks.find(item => item.blockType === 'conversation');
  const blank = { ...paragraph, title: '', metadata: {} };
  const legacy = { ...paragraph, metadata: { ...paragraph.metadata, paragraphRoleV1: 'title' } };
  assert.equal(planBookAtomicGeneration({ ...document, documentType: 'paragraph' }, blank, 'heading', 'text', prefs), null);
  assert.equal(planBookAtomicGeneration({ ...document, documentType: 'paragraph' }, legacy, 'heading', 'text', prefs), null);
  const titledScene = { ...scene, title: 'English scene', metadata: {} };
  const conversation = { ...document, documentType: 'conversation', blocks: [titledScene] };
  assert.deepEqual(bookHeadingBoundarySteps(conversation, titledScene, ['meaning', 'text']).map(step => step.content), ['English scene']);
  const turn = scene.units[0];
  const { labels } = await run(conversation, { scope: 'unit', unitId: turn.id });
  assert(labels.length > 0 && labels.every(([id]) => turn.segments.some(segment => segment.id === id)));
});

const run = async (documentTree, options = {}) => {
  const labels = [], no = () => {};
  const playbackSessionRef = { current: 1 }, playbackContextRef = { current: null }, stopSignalRef = { current: false };
  let done;
  const hasStarted = executeStructuredTextPlaybackSessionService({
    documentTree, scope: 'document', playbackSessionRef, playbackContextRef, stopSignalRef,
    pauseStateRef: { current: false }, silentAudioRef: { current: null },
    setIsPlaying: no, setIsPaused: no, setPlayingContext: no, setPlayingIndex: no, setCurrentIndex: no, setSpeakingPart: no,
    async safePlayTransition(start, context) { playbackContextRef.current = { ...context, sessionId: 1 }; done = start(); },
    waitWhilePaused: async () => {}, forceStopAll: no,
    playStructuredChannel: async (_, item, channel) => labels.push([item.id, channel]),
    playHeadingStep: async step => { labels.push([step.key, step.channel]); options.onHeading?.(step, stopSignalRef); },
    ...options
  });
  await done;
  return { labels, hasStarted };
};

test('owned Workspace/Card/Unit/Segment/Continue, explicit and repeat traverse only applicable Heading boundaries', async () => {
  const document = tree(execute(authored, 'document.update', { id: ids.documentId,
    headingRead: { workspaceUid: tree(authored).uid, key: 'paragraph', read: true }
  }));
  const card = document.blocks[0], segment = card.segments[0], unit = card.units[0];
  const opening = await run(document, { playbackChannelMode: 'meaning-text', repeatMode: 'twice' });
  assert.deepEqual(opening.labels.slice(0, 6), [
    ['mainTitle', 'meaning'], ['mainTitle', 'text'], ['paragraph', 'meaning'], ['paragraph', 'text'], [segment.id, 'meaning'], [segment.id, 'text']
  ]);
  assert.equal(opening.labels.filter(([key]) => key === 'mainTitle').length, 2);
  assert.deepEqual(opening.labels.filter(([key]) => key === 'paragraph'), [
    ['paragraph', 'meaning'], ['paragraph', 'text'], ['paragraph', 'text'],
    ['paragraph', 'meaning'], ['paragraph', 'text'], ['paragraph', 'text']
  ]);
  assert.deepEqual((await run(document, { scope: 'card', blockId: card.id, playbackChannelMode: 'meaning-only' })).labels[0], ['paragraph', 'meaning']);
  const from = await run(document, { scope: 'from-here', boundary: 'document', startSegmentId: segment.id });
  assert.deepEqual(from.labels[0], [segment.id, 'text']);
  assert(!from.labels.some(([key]) => key === 'mainTitle'));
  const partialRepeat = await run(document, { scope: 'from-here', boundary: 'card', startSegmentId: card.segments.at(-1).id, repeatMode: 'twice' });
  assert.deepEqual(partialRepeat.labels, [[card.segments.at(-1).id, 'text'], [card.segments.at(-1).id, 'text']]);
  const segmentOnly = await run(document, { scope: 'segment', startSegmentId: segment.id, channel: 'text' });
  assert.deepEqual(segmentOnly.labels, [[segment.id, 'text']]);
  const unitOnly = await run(document, { scope: 'unit', unitId: unit.id });
  assert(unitOnly.labels.length && unitOnly.labels.every(([key]) => unit.segments.some(item => item.id === key)));
  assert.deepEqual((await run(document, { atomicOnly: true })).labels, [['mainTitle', 'text']]);
  assert.deepEqual((await run(document, { atomicOnly: true, scope: 'card', blockId: card.id })).labels, [['paragraph', 'text']]);
});

test('heading-only, shuffle, loop cancellation and body-based transport skip phantom progress', async () => {
  const document = tree(authored);
  const titleOnly = { ...document, blocks: [] };
  assert.deepEqual((await run(titleOnly)).labels, [['mainTitle', 'text']]);
  assert.equal((await run(titleOnly, { workspaceUid: 'forged' })).hasStarted, false);
  const emptyCard = { ...document.blocks[0], id: 'EMPTY', uid: 'empty-uid', segments: [], units: [] };
  assert.deepEqual((await run({ ...titleOnly, blocks: [emptyCard] }, { scope: 'card', blockId: 'EMPTY', atomicOnly: true })).labels, [['paragraph', 'text']]);
  const stopped = await run(document, { repeatMode: 'loop', onHeading(_, stop) { stop.current = true; } });
  assert.deepEqual(stopped.labels, [['mainTitle', 'text']]);
  const scene = document.blocks.find(block => block.blockType === 'conversation');
  const mixed = tree(setHeading(authored, scene, { en: 'An authored scene' }));
  const { labels } = await run(mixed, { playbackOrderMode: 'shuffle', random: () => 0 });
  const index = labels.findIndex(([key]) => key === 'scene');
  assert.deepEqual(labels[index + 1], [scene.segments[0].id, 'text']);
  const destinations = [];
  const queue = [{ id: 'first', blockId: 'A' }, { id: 'last', blockId: 'B' }];
  const owner = { headingIntro: true, orderedList: queue, restart: item => destinations.push(item.id) };
  assert(navigateOwnedPlayback(owner, 'next'));
  assert(navigateOwnedPlayback(owner, 'prev'));
  assert.deepEqual(destinations, ['first', 'last']);
});
