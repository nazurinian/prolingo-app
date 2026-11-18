import { createP15Fixture } from '../p15-data-management/fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
export const createStructuredTestingFixture = () => {
  const base = createP15Fixture(); let snapshot = base.snapshot;
  const apply = (type, payload) => { const out = applyTextLibraryCommand(snapshot, { type, payload }, 19000); snapshot = out.snapshot; return out.result.id; };
  const conversationId = apply('document.create', { documentType: 'conversation', title: 'Conversation UAT' });
  const sceneId = apply('block.create', { documentId: conversationId, blockType: 'conversation', title: 'A meeting' });
  const alice = apply('speaker.register', { documentId: conversationId, label: 'Alice' });
  const bob = apply('speaker.register', { documentId: conversationId, label: 'Bob' });
  const turn = apply('contentUnit.create', { blockId: sceneId, kind: 'turn', speakerId: alice });
  apply('segment.create', { blockId: sceneId, unitId: turn, text: 'Hello, Bob.', meaning: 'Halo, Bob.', joinAfter: 'line' });
  apply('segment.create', { blockId: sceneId, unitId: turn, text: 'Welcome to the meeting.', meaning: 'Selamat datang.' });
  apply('contentUnit.create', { blockId: sceneId, kind: 'turn', speakerId: alice });
  apply('contentUnit.create', { blockId: sceneId, kind: 'turn', speakerId: bob, text: 'Thank you, Alice.', meaning: 'Terima kasih.' });
  return { ...base, snapshot, ids: { ...base.ids, conversationId, testSceneId: sceneId } };
};
