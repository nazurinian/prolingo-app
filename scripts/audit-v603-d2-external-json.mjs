import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
  PROLINGO_TEXT_EXTERNAL_PACKAGE_VERSION,
  TEXT_EXTERNAL_ENTITY_METADATA_KEY,
  TEXT_EXTERNAL_SOURCE_METADATA_KEY,
  planProLingoTextExternalInitialImport,
  validateProLingoTextExternalPackage
} from '../src/domain/text/textExternalJsonDomain.js';
import { normalizeTextLibraryRuntimeSnapshot } from '../src/domain/text/textLibraryDomain.js';
import { collectTextGlobalUidDiagnostics } from '../src/domain/text/textGlobalIdentityDomain.js';
import { getTextStructuredSpeakerRegistry } from '../src/domain/text/textStructuredSpeakerIdentityDomain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const examplePath = path.join(root, 'scripts/fixtures/v603-d2-external-mix-example.json');

const emptySnapshot = () => normalizeTextLibraryRuntimeSnapshot({
  schemaVersion: 1,
  initialized: true,
  activeDocumentId: null,
  counters: { collection: 0, document: 0, text: 0, segment: 0, audioVariant: 0 },
  collections: [], documents: [], blocks: [], segments: [], audioVariants: []
});

let checks = 0;
const pass = fn => { fn(); checks += 1; };

const mix = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
const validated = validateProLingoTextExternalPackage(mix).package;
pass(() => assert.equal(validated.packageType, PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE));
pass(() => assert.equal(validated.packageVersion, PROLINGO_TEXT_EXTERNAL_PACKAGE_VERSION));
pass(() => assert.equal(validated.workspace.workspaceType, 'conversation'));
pass(() => assert.equal(validated.workspace.conversationMode, 'mix'));
pass(() => assert.equal(validated.workspace.cards.length, 6));

const imported = planProLingoTextExternalInitialImport({ localSnapshot: emptySnapshot(), package: mix, now: 1000, fileName: 'mix.json' });
pass(() => assert.equal(imported.counts.documents, 1));
pass(() => assert.equal(imported.counts.blocks, 6));
pass(() => assert.equal(imported.counts.segments, 8));
pass(() => assert.equal(imported.counts.speakers, 2));
pass(() => assert.equal(imported.snapshot.documents[0].documentType, 'mixed'));
pass(() => assert.equal(imported.snapshot.documents[0].editorModel, 'structured-v1'));
pass(() => assert.equal(imported.snapshot.documents[0].metadata[TEXT_EXTERNAL_SOURCE_METADATA_KEY].externalSourceKey, mix.externalSourceKey));
pass(() => assert.equal(imported.snapshot.blocks[0].metadata[TEXT_EXTERNAL_ENTITY_METADATA_KEY].cardKey, 'title'));
pass(() => assert.equal(imported.snapshot.segments[0].metadata[TEXT_EXTERNAL_ENTITY_METADATA_KEY].segmentKey, 'title-001'));
pass(() => assert.equal(imported.snapshot.segments.find(s => s.metadata?.[TEXT_EXTERNAL_ENTITY_METADATA_KEY]?.segmentKey === 'conversation-01-line-001')?.metadata?.[TEXT_EXTERNAL_ENTITY_METADATA_KEY]?.speakerKey, 'speaker-a'));
pass(() => assert.equal(collectTextGlobalUidDiagnostics(imported.snapshot).valid, true));
const registry = getTextStructuredSpeakerRegistry(imported.snapshot.documents[0]);
pass(() => assert.equal(registry.length, 2));
pass(() => assert.equal(registry[0].externalKey, 'speaker-a'));
pass(() => assert.equal(imported.importRecord.baselinePackage.externalSourceKey, mix.externalSourceKey));

pass(() => assert.throws(() => planProLingoTextExternalInitialImport({
  localSnapshot: imported.snapshot,
  package: mix,
  existingImports: [imported.importRecord],
  now: 1001
}), error => error?.code === 'TEXT_EXTERNAL_SOURCE_ALREADY_IMPORTED'));

const paragraph = {
  packageType: PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
  packageVersion: 1,
  externalSourceKey: 'fixture-paragraph-source',
  source: { sourceKind: 'ai-authored', title: 'Paragraph fixture' },
  workspace: {
    workspaceKey: 'main', title: 'Paragraph', workspaceType: 'paragraph', textLanguage: 'en-GB', meaningLanguage: 'id',
    cards: [{ cardKey: 'paragraph-01', order: 1, type: 'paragraph', role: 'paragraph', segments: [
      { segmentKey: 'paragraph-01-sentence-001', order: 1, text: 'Hello.', meaning: 'Halo.' }
    ] }]
  }
};
const paragraphPlan = planProLingoTextExternalInitialImport({ localSnapshot: imported.snapshot, package: paragraph, existingImports: [imported.importRecord], now: 1100 });
pass(() => assert.equal(paragraphPlan.snapshot.documents.find(d => d.id === paragraphPlan.importRecord.documentId)?.documentType, 'paragraph'));
pass(() => assert.equal(paragraphPlan.counts.segments, 1));

const conversation = {
  packageType: PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
  packageVersion: 1,
  externalSourceKey: 'fixture-conversation-source',
  source: { sourceKind: 'ai-authored', title: 'Conversation fixture' },
  workspace: {
    workspaceKey: 'main', title: 'Conversation', workspaceType: 'conversation', conversationMode: 'conversation-only', textLanguage: 'en-GB', meaningLanguage: 'id',
    speakers: [{ speakerKey: 'speaker-a', order: 1, displayName: 'A' }],
    cards: [{ cardKey: 'conversation-01', order: 1, type: 'conversation', segments: [
      { segmentKey: 'conversation-01-line-001', order: 1, speakerKey: 'speaker-a', text: 'Hello.', meaning: 'Halo.' }
    ] }]
  }
};
const conversationPlan = planProLingoTextExternalInitialImport({ localSnapshot: paragraphPlan.snapshot, package: conversation, existingImports: [imported.importRecord, paragraphPlan.importRecord], now: 1200 });
pass(() => assert.equal(conversationPlan.snapshot.documents.find(d => d.id === conversationPlan.importRecord.documentId)?.documentType, 'conversation'));
pass(() => assert.equal(conversationPlan.counts.speakers, 1));

const legacy = {
  packageType: PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
  packageVersion: 1,
  externalSourceKey: 'fixture-legacy-source',
  source: { sourceKind: 'manual-notes', title: 'Legacy fixture' },
  workspace: {
    workspaceKey: 'main', title: 'Legacy', workspaceType: 'legacy', textLanguage: 'en', meaningLanguage: 'id',
    entries: [{ entryKey: 'entry-001', order: 1, text: 'Good morning.' }]
  }
};
const legacyPlan = planProLingoTextExternalInitialImport({ localSnapshot: conversationPlan.snapshot, package: legacy, existingImports: [imported.importRecord, paragraphPlan.importRecord, conversationPlan.importRecord], now: 1300 });
const legacyDoc = legacyPlan.snapshot.documents.find(d => d.id === legacyPlan.importRecord.documentId);
pass(() => assert.equal(legacyDoc.editorModel, 'legacy-line-v1'));
pass(() => assert.equal(legacyDoc.documentType, 'mixed'));
pass(() => assert.equal(legacyPlan.snapshot.segments.find(s => s.documentId === legacyDoc.id)?.metadata?.[TEXT_EXTERNAL_ENTITY_METADATA_KEY]?.entryKey, 'entry-001'));

const invalidDuplicateKey = structuredClone(paragraph);
invalidDuplicateKey.workspace.cards.push({ ...invalidDuplicateKey.workspace.cards[0], order: 2 });
pass(() => assert.throws(() => validateProLingoTextExternalPackage(invalidDuplicateKey), /Duplicate Workspace cards cardKey/));

const invalidSpeaker = structuredClone(conversation);
invalidSpeaker.workspace.cards[0].segments[0].speakerKey = 'speaker-missing';
pass(() => assert.throws(() => validateProLingoTextExternalPackage(invalidSpeaker), /unknown speakerKey/));

const internalIdPollution = structuredClone(paragraph);
internalIdPollution.workspace.cards[0].segments[0].segmentKey = 'SEGMENT_000001';
pass(() => assert.throws(() => validateProLingoTextExternalPackage(internalIdPollution), /lowercase stable-key syntax/));

console.log(`PASS D2 External JSON audit: ${checks} checks`);
