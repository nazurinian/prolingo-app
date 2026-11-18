import React, { useState } from 'react';
import { createStructuredTestingFixture } from '../../../../scripts/fixtures/p15-integrated/structured-fixture.js';
import StructuredWorkspacePlayer from './StructuredWorkspacePlayer.jsx';
export default function StructuredTextDemo() {
  const [fixture] = useState(createStructuredTestingFixture);
  const [documentId, setDocumentId] = useState(fixture.ids.paragraphId);
  return <main data-unified-text-demo className="max-w-6xl mx-auto p-4 space-y-4 bg-white dark:bg-slate-950 dark:text-white">
    <h1 className="text-xl font-bold">Structured Text — isolated reader demo</h1>
    <p>In-memory only. Persistent testing is a separate opt-in route. Conversation/Mixed classic uses a compatible Turn adapter.</p>
    <select aria-label="Workspace" value={documentId} onChange={e => setDocumentId(e.target.value)}>
      {fixture.snapshot.documents.filter(d => d.editorModel === 'structured-v1').map(d => <option key={d.id} value={d.id}>{d.documentType}: {d.title}</option>)}
    </select>
    <StructuredWorkspacePlayer snapshot={fixture.snapshot} documentId={documentId} preferences={fixture.preferences} />
  </main>;
}
