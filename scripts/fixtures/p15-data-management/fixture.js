import { createP13MixedFixture } from '../p13-mixed/mixed-workspace-fixture.js';
import { createA1V1ParagraphFixture } from '../shared-card-a1/presentation-fixture.js';
import { applyTextLibraryCommand } from '../../../src/domain/text/textLibraryCommandDomain.js';
import { createProLingoTextPack, mergeProLingoTextPack } from '../../../src/domain/text/textPackJsonDomain.js';
import { createTextSourceAttachmentFromMerge } from '../../../src/domain/text/textSourceAttachmentDomain.js';
import { planProLingoTextExternalInitialImport } from '../../../src/domain/text/textExternalJsonDomain.js';
import externalMixExample from '../v603-d2-external-mix-example.json' with { type: 'json' };

export const P15_EXTERNAL_SAMPLE_PACKAGE = Object.freeze(structuredClone(externalMixExample));

export const createP15Fixture = () => {
  const mixed = createP13MixedFixture();
  let snapshot = mixed.snapshot;
  const apply = (type, payload) => { const out = applyTextLibraryCommand(snapshot, { type, payload }, 15000); snapshot = out.snapshot; return out.result.id; };
  const collectionId = apply('collection.create', { title: 'P15 Collection' });
  apply('document.update', { id: mixed.ids.documentId, collectionId });
  const paragraphId = apply('document.create', { collectionId, documentType: 'paragraph', title: 'Paragraph management' });
  const paragraphCardId = apply('block.create', { documentId: paragraphId, blockType: 'paragraph' });
  const paragraphUnitId = snapshot.contentUnits.find(u => u.blockId === paragraphCardId).id;
  const paragraphSegmentId = apply('segment.create', { blockId: paragraphCardId, unitId: paragraphUnitId, text: 'Same words.', meaning: 'Arti.' });
  const legacyId = apply('document.create', { editorModel: 'legacy-line-v1', title: 'Protected Legacy' });
  const pack = createProLingoTextPack({ snapshot, scopeType: 'document', rootId: mixed.ids.documentId, now: 15001 });
  const merged = mergeProLingoTextPack({ localSnapshot: snapshot, pack, now: 15002 });
  const attached = createTextSourceAttachmentFromMerge({ pack, merged, now: 15002 });
  return { ...mixed, snapshot: attached.snapshot, pack, sourceAttachments: [attached.attachment],
    ids: { ...mixed.ids, collectionId, paragraphId, paragraphCardId, paragraphUnitId, paragraphSegmentId, legacyId,
      attachedId: merged.idMap.documents[mixed.ids.documentId] } };
};

/**
 * Extended disposable presets for P15-H1 DEV QA and headless Edge UI testing.
 * Keeps createP15Fixture() identical for existing A1 contract tests.
 */
export const createP15ExtendedQaFixtures = () => {
  const base = createP15Fixture();
  const externalPlan = planProLingoTextExternalInitialImport({
    localSnapshot: base.snapshot,
    package: P15_EXTERNAL_SAMPLE_PACKAGE,
    existingImports: [],
    now: 15100
  });
  const colPack = createProLingoTextPack({
    snapshot: externalPlan.snapshot,
    scopeType: 'collection',
    rootId: base.ids.collectionId,
    now: 15101
  });
  const colMerged = mergeProLingoTextPack({ localSnapshot: externalPlan.snapshot, pack: colPack, now: 15102 });
  const colAttached = createTextSourceAttachmentFromMerge({ pack: colPack, merged: colMerged, now: 15102 });
  const multiDocIds = [...new Set(Object.values(colAttached.attachment.idMap.documents))];

  const v1Compat = createA1V1ParagraphFixture();
  const v2EmptySnapshot = {
    schemaVersion: 2,
    initialized: true,
    activeDocumentId: null,
    counters: {},
    collections: [],
    documents: [],
    blocks: [],
    contentUnits: [],
    segments: [],
    audioVariants: []
  };

  return {
    base,
    externalSamplePackage: structuredClone(P15_EXTERNAL_SAMPLE_PACKAGE),
    presets: {
      'v2-complete': {
        label: 'v2 Complete Library (P15 Fixture)',
        snapshot: base.snapshot,
        sourceAttachments: base.sourceAttachments,
        externalImports: [],
        extraMetaRecords: [{ key: 'retainedOpaqueMeta', value: { source: 'qa-preset', preserve: true } }],
        preferences: base.preferences,
        samplePack: base.pack,
        sampleExternalPackage: P15_EXTERNAL_SAMPLE_PACKAGE
      },
      'v2-external-sources': {
        label: 'v2 + External JSON + Multi-Workspace Source',
        snapshot: colAttached.snapshot,
        sourceAttachments: [...base.sourceAttachments, colAttached.attachment],
        externalImports: [externalPlan.importRecord],
        extraMetaRecords: [{ key: 'retainedOpaqueMeta', value: { source: 'qa-external', preserve: true } }],
        preferences: base.preferences,
        samplePack: colPack,
        sampleExternalPackage: P15_EXTERNAL_SAMPLE_PACKAGE,
        ids: {
          ...base.ids,
          externalDocumentId: externalPlan.importRecord.documentId,
          multiWorkspaceDocIds: multiDocIds,
          multiAttachmentId: colAttached.attachment.attachmentId
        }
      },
      'v1-paragraph': {
        label: 'v1 Paragraph Compat (Virtual Section)',
        snapshot: v1Compat.snapshot,
        sourceAttachments: [],
        externalImports: [],
        extraMetaRecords: [],
        preferences: base.preferences,
        samplePack: null,
        sampleExternalPackage: P15_EXTERNAL_SAMPLE_PACKAGE,
        ids: v1Compat.ids
      },
      'v2-empty': {
        label: 'Empty v2 Library',
        snapshot: v2EmptySnapshot,
        sourceAttachments: [],
        externalImports: [],
        extraMetaRecords: [],
        preferences: base.preferences,
        samplePack: base.pack,
        sampleExternalPackage: P15_EXTERNAL_SAMPLE_PACKAGE
      }
    }
  };
};
