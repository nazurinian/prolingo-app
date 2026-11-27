import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPersistentBookQaDemo } from './persistent-demo.js';
import { createJourneyToLondonFixture } from '../uat4/journey-to-london.js';
import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { resolveBookMainTitle } from '../../../src/domain/text/textBookHeadingDomain.js';

const name = 'prolingo_text_library_d3b_qa_a2_browser';
export const demoAuditLibraries = { [name]: 'prolingo_book_qa_audio_staging_v1__' + createHash('sha256').update(name).digest('hex') };
const q = JSON.stringify;
const host = 'window.__bookQaProps("[data-book-qa-indicator]", "bookQaConnection", true).bookQaConnection';
const status = 'document.querySelector("[data-book-body-audio-status]")?.textContent';
const options = { preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural' } };

const verifyDemoContents = () => {
  const demo = createPersistentBookQaDemo();
  const original = createJourneyToLondonFixture();
  const trees = demo.documents.map(row => resolveTextLibraryDocumentTree(demo, row.id));
  const [london, paragraph, conversation, stress] = trees;
  const authored = rows => rows.map(({ id, blockId, unitId, text, meaning, order }) => [id, blockId, unitId, text, meaning, order]);
  assert.deepEqual(authored(demo.segments.filter(row => row.documentId === london.id)), authored(original.snapshot.segments));
  assert.deepEqual(london.blocks.map(row => [row.id, row.blockType, row.segments.length]), original.snapshot.blocks.map(row =>
    [row.id, row.blockType, original.snapshot.segments.filter(segment => segment.blockId === row.id).length]));
  assert.deepEqual(trees.map(tree => tree.documentType), ['mixed', 'paragraph', 'conversation', 'mixed']);
  assert(trees.every(tree => resolveBookMainTitle(tree).saved));
  assert(paragraph.blocks.every(row => row.blockType === 'paragraph'));
  assert(conversation.blocks.every(row => row.blockType === 'conversation'));
  const [first, second, third] = conversation.blocks[0].units;
  assert.equal(first.speakerId, second.speakerId);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.speakerId, third.speakerId);
  assert(conversation.blocks[1].units.some(unit => unit.segments.length === 0));
  assert(stress.blocks.some(block => block.units.some(unit => unit.segments.length === 0)));
  assert.deepEqual([stress.blocks.at(-1).segments.length, stress.blocks.at(-1).segments.filter(row => row.meaning).length], [34, 33]);
  console.log('PASS A2 fixture keeps the exact London Body order, two pure Workspaces, blank channels and empty Units');
};

export async function checkPersistentBookQaDemo({ evaluate, navigate, waitFor, probe, chooseOptIn, clickButton, uatOrigin, bodyRequests, restartBrowser }) {
  verifyDemoContents();
  const disconnected = async () => {
    await navigate(uatOrigin, '/?qa=book-qa&db=' + name);
    await waitFor(`location.search.includes(${q(name)}) && document.querySelector('[data-book-qa-host="disconnected"]')`);
    assert.equal(await evaluate(`document.querySelector(${q('[aria-label="Opt in to isolated Book QA storage"]')}).checked`), false);
    await chooseOptIn();
  };
  const read = () => probe(`module.readLibrary(${q(name)})`);
  const connected = () => waitFor('document.querySelector("[data-book-qa-indicator]") && document.querySelector("[data-text-structured-player]")');
  const select = (selector, id) => evaluate(`(() => {
    const element = document.querySelector(${q(selector)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, ${q(id)});
    element.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const archives = workspaceId => evaluate(`(async () => {
    const options = { ...${q(options)}, workspaceId: ${q(workspaceId)} };
    const portable = await ${host}.audio.exportPortable(options);
    const normal = await ${host}.audio.exportNormal({ ...options, representations: ['split'] });
    const magic = async blob => Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
    return {
      paths: portable.manifest.assets.map(asset => asset.path),
      digests: portable.manifest.assets.map(asset => asset.digest),
      references: portable.manifest.references.length,
      normal: normal.report.logical,
      signatures: await Promise.all([magic(portable.blob), magic(normal.blob)])
    };
  })()`);

  await disconnected();
  const previousRequests = bodyRequests.length;
  await clickButton('Initialize A2 demo library');
  await connected();
  const initial = await read();
  assert.deepEqual(initial.counts, { collections: 0, documents: 4, blocks: 12, contentUnits: 30, segments: 92, audioVariants: 0 });
  assert.equal(bodyRequests.length, previousRequests);
  const paragraph = initial.documents.find(doc => doc.documentType === 'paragraph');
  for (const { id } of [...initial.documents, paragraph]) {
    await select('[data-app-header] select', id);
    await waitFor(`${host}.session.getState().view.selection.workspaceId === ${q(id)}`);
  }
  await evaluate('document.querySelector("[data-book-body-audio] summary").click()');
  await waitFor('document.querySelector("[data-book-body-audio-status]")');
  await clickButton('Generate Sentence');
  await waitFor(`${status}?.includes('1 committed')`);
  await select('[data-book-body-audio] select', 'meaning');
  await clickButton('Generate Sentence');
  await waitFor(`${status}?.includes('1 committed')`);
  const routes = bodyRequests.slice(previousRequests).map(({ voice, text }) => [voice, text]);
  assert.deepEqual(routes, [['en-GB-SoniaNeural', 'The path follows the river.'], ['id-ID-GadisNeural', 'Jalur ini mengikuti aliran sungai.']]);
  const partial = await archives(paragraph.id);
  assert.deepEqual([partial.references, partial.normal], [2, 2]);
  assert.deepEqual(partial.signatures, [[80, 75, 3, 4], [80, 75, 3, 4]]);
  console.log('PASS A2 create-only shell initializes four Workspaces and explicit EN/ID fixture generation exports two verified recordings');

  const newName = 'A2 retained edit';
  const saved = await evaluate(`${host}.session.dispatch({type: 'document.update', payload:{id:${q(paragraph.id)},title:${q(newName)}}})`);
  assert(saved.ok, q(saved.error));
  await evaluate(`${host}.refresh()`);
  const edited = await read();
  const persistedSnapshot = await evaluate(`JSON.stringify(${host}.session.getSnapshot())`);
  assert.equal(edited.documents.find(doc => doc.id === paragraph.id).title, newName);
  assert.equal(edited.counts.audioVariants, 2);

  await disconnected();
  await clickButton('Initialize A2 demo library');
  await waitFor('document.querySelector("[data-book-qa-error=EXISTING_DB_PROTECTED]")');
  assert.deepEqual(await read(), edited);
  await restartBrowser();
  await disconnected();
  await clickButton('Load / Connect existing v2 library');
  await connected();
  assert.deepEqual(await read(), edited);
  assert.equal(await evaluate(`JSON.stringify(${host}.session.getSnapshot())`), persistedSnapshot);
  assert.deepEqual(await archives(paragraph.id), partial);
  assert.equal(bodyRequests.length, previousRequests + 2);
  console.log('PASS A2 Refresh, refused initialization and a new browser process preserve user edits and exact scoped audio bytes');
  return { initial, routes, partial, restarted: true };
}
