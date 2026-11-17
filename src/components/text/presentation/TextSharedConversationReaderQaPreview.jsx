import React, { useState } from 'react';
import { createD4aConversationFixture } from '../../../../scripts/fixtures/d4a/conversation-editor-fixture.js';
import TextConversationEditor from '../conversation/TextConversationEditor.jsx';
import SharedConversationReader from './SharedConversationReader.jsx';

const renderReader = ({ snapshot, editorState, audioPlayback, isBusy }) => (
  <SharedConversationReader snapshot={snapshot} documentId={editorState.workspace.id}
    audioPlayback={audioPlayback} isBusy={isBusy} />
);

/** DEV-only in-memory preview. The original authoring QA route is untouched. */
export default function TextSharedConversationReaderQaPreview() {
  const [fixture, setFixture] = useState(createD4aConversationFixture);
  const [generation, setGeneration] = useState(0);
  return (
    <main className="p-4 space-y-4" data-shared-conversation-qa-preview="true">
      <h1>Conversation Reader integration QA · disposable snapshot</h1>
      <button type="button" onClick={() => {
        setFixture(createD4aConversationFixture());
        setGeneration(value => value + 1);
      }}>Reset fixture</button>
      <TextConversationEditor key={generation} snapshot={fixture.snapshot} documentId={fixture.ids.documentId}
        onStateChange={outcome => setFixture(current => ({ ...current, snapshot: outcome.snapshot }))}
        renderReader={renderReader} />
    </main>
  );
}
