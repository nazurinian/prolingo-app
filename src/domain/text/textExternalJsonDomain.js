import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import {
  createTextBlockRecord,
  createTextCollectionRecord,
  createTextDocumentRecord,
  createTextSegmentRecord,
  formatTextLibraryId,
  normalizeTextIdCounters,
  normalizeTextLibraryRuntimeSnapshot
} from './textLibraryDomain.js';
import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from './textGlobalIdentityDomain.js';
import { buildCanonicalSha256Fingerprint } from './textCanonicalFingerprintDomain.js';
import { TEXT_PARAGRAPH_ROLE_METADATA_KEY, normalizeTextParagraphCardRole } from './textParagraphRoleDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY,
  TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY
} from './textStructuredSpeakerIdentityDomain.js';

export const PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE = 'prolingo-text-external';
export const PROLINGO_TEXT_EXTERNAL_PACKAGE_VERSION = 1;
export const TEXT_EXTERNAL_SOURCE_METADATA_KEY = 'externalSourceV1';
export const TEXT_EXTERNAL_ENTITY_METADATA_KEY = 'externalEntityV1';
export const TEXT_EXTERNAL_COLLECTION_HINT_METADATA_KEY = 'externalCollectionHintV1';

const clean = value => String(value ?? '').trim();
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const stableKeyPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const cloneJson = value => JSON.parse(JSON.stringify(value));

const requireObject = (value, label) => {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value;
};

const requireText = (value, label) => {
  const normalized = clean(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const requireStableKey = (value, label) => {
  const normalized = requireText(value, label);
  if (!stableKeyPattern.test(normalized)) {
    throw new Error(`${label} must use lowercase stable-key syntax (letters/numbers plus . _ - separators)`);
  }
  return normalized;
};

const normalizeOptionalText = value => clean(value) || null;
const normalizeMeaning = (value, label) => {
  if (value === undefined || value === null) throw new Error(`${label} is required (use an empty string only when genuinely unavailable)`);
  return String(value).trim();
};

const assertUnique = (values, label) => {
  const seen = new Set();
  values.forEach(value => {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  });
};

const normalizeOrderedArray = ({ source, label, keyField, normalizeItem }) => {
  if (!Array.isArray(source) || source.length === 0) throw new Error(`${label} must contain at least one item`);
  const normalized = source.map((candidate, index) => normalizeItem(requireObject(candidate, `${label}[${index}]`), index));
  assertUnique(normalized.map(item => item[keyField]), `${label} ${keyField}`);
  assertUnique(normalized.map(item => item.order), `${label} order`);
  return normalized.sort((a, b) => a.order - b.order);
};

const normalizeSource = candidate => {
  const source = requireObject(candidate, 'source');
  return {
    sourceKind: requireStableKey(source.sourceKind, 'source.sourceKind'),
    title: requireText(source.title, 'source.title'),
    reference: normalizeOptionalText(source.reference),
    notes: normalizeOptionalText(source.notes)
  };
};

const normalizeCollectionHint = candidate => {
  if (candidate === undefined || candidate === null) return null;
  const hint = requireObject(candidate, 'collectionHint');
  return {
    collectionKey: requireStableKey(hint.collectionKey, 'collectionHint.collectionKey'),
    title: requireText(hint.title, 'collectionHint.title')
  };
};

const normalizeParagraphSegment = (candidate, index, segmentKeys) => {
  const segmentKey = requireStableKey(candidate.segmentKey, `segment[${index}].segmentKey`);
  segmentKeys.push(segmentKey);
  return {
    segmentKey,
    order: positiveInt(candidate.order) || (() => { throw new Error(`Segment ${segmentKey} requires a positive integer order`); })(),
    text: requireText(candidate.text, `Segment ${segmentKey}.text`),
    meaning: normalizeMeaning(candidate.meaning, `Segment ${segmentKey}.meaning`)
  };
};

const normalizeConversationSegment = (candidate, index, segmentKeys, speakerKeys) => {
  const base = normalizeParagraphSegment(candidate, index, segmentKeys);
  const speakerKey = requireStableKey(candidate.speakerKey, `Segment ${base.segmentKey}.speakerKey`);
  if (!speakerKeys.has(speakerKey)) throw new Error(`Segment ${base.segmentKey} references unknown speakerKey ${speakerKey}`);
  return { ...base, speakerKey };
};

const normalizeStructuredCard = ({ candidate, index, workspaceType, conversationMode, segmentKeys, speakerKeys }) => {
  const cardKey = requireStableKey(candidate.cardKey, `card[${index}].cardKey`);
  const order = positiveInt(candidate.order);
  if (!order) throw new Error(`Card ${cardKey} requires a positive integer order`);
  const type = clean(candidate.type);
  if (!['paragraph', 'conversation'].includes(type)) throw new Error(`Card ${cardKey} has invalid type ${type || 'missing'}`);
  if (workspaceType === 'paragraph' && type !== 'paragraph') throw new Error(`Paragraph Workspace cannot contain ${type} Card ${cardKey}`);
  if (workspaceType === 'conversation' && conversationMode === 'conversation-only' && type !== 'conversation') {
    throw new Error(`Conversation-only Workspace cannot contain ${type} Card ${cardKey}`);
  }
  const role = type === 'paragraph' ? normalizeTextParagraphCardRole(candidate.role) : null;
  if (type === 'paragraph' && !['title', 'paragraph'].includes(clean(candidate.role))) {
    throw new Error(`Paragraph Card ${cardKey} requires role "title" or "paragraph"`);
  }
  const segments = normalizeOrderedArray({
    source: candidate.segments,
    label: `Card ${cardKey} segments`,
    keyField: 'segmentKey',
    normalizeItem: (segment, segmentIndex) => type === 'conversation'
      ? normalizeConversationSegment(segment, segmentIndex, segmentKeys, speakerKeys)
      : normalizeParagraphSegment(segment, segmentIndex, segmentKeys)
  });
  return {
    cardKey,
    order,
    type,
    role,
    title: normalizeOptionalText(candidate.title),
    segments
  };
};

const normalizeLegacyWorkspace = workspace => {
  const entryKeys = [];
  const entries = normalizeOrderedArray({
    source: workspace.entries,
    label: 'Legacy entries',
    keyField: 'entryKey',
    normalizeItem: (candidate, index) => {
      const entryKey = requireStableKey(candidate.entryKey, `entry[${index}].entryKey`);
      entryKeys.push(entryKey);
      const order = positiveInt(candidate.order);
      if (!order) throw new Error(`Legacy entry ${entryKey} requires a positive integer order`);
      return {
        entryKey,
        order,
        text: requireText(candidate.text, `Legacy entry ${entryKey}.text`),
        meaning: candidate.meaning === undefined || candidate.meaning === null ? '' : String(candidate.meaning).trim()
      };
    }
  });
  assertUnique(entryKeys, 'Legacy entryKey');
  return { entries };
};

const normalizeSpeakers = workspace => {
  if (!Array.isArray(workspace.speakers) || workspace.speakers.length === 0) throw new Error('Conversation Workspace requires workspace.speakers');
  const speakers = workspace.speakers.map((candidate, index) => {
    const speaker = requireObject(candidate, `speaker[${index}]`);
    const speakerKey = requireStableKey(speaker.speakerKey, `speaker[${index}].speakerKey`);
    return {
      speakerKey,
      order: positiveInt(speaker.order) || index + 1,
      displayName: requireText(speaker.displayName, `speaker ${speakerKey}.displayName`)
    };
  }).sort((a, b) => a.order - b.order);
  assertUnique(speakers.map(item => item.speakerKey), 'speakerKey');
  assertUnique(speakers.map(item => item.order), 'speaker order');
  return speakers;
};

export const validateProLingoTextExternalPackage = candidate => {
  const root = requireObject(candidate, 'External Text JSON root');
  if (root.packageType !== PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE) throw new Error(`Unsupported external Text package type: ${root.packageType || 'missing'}`);
  if (Number(root.packageVersion) !== PROLINGO_TEXT_EXTERNAL_PACKAGE_VERSION) throw new Error(`Unsupported external Text package version: ${root.packageVersion}`);

  const externalSourceKey = requireStableKey(root.externalSourceKey, 'externalSourceKey');
  const source = normalizeSource(root.source);
  const collectionHint = normalizeCollectionHint(root.collectionHint);
  const workspaceCandidate = requireObject(root.workspace, 'workspace');
  const workspaceKey = requireStableKey(workspaceCandidate.workspaceKey, 'workspace.workspaceKey');
  const title = requireText(workspaceCandidate.title, 'workspace.title');
  const workspaceType = clean(workspaceCandidate.workspaceType);
  if (!['legacy', 'paragraph', 'conversation'].includes(workspaceType)) throw new Error(`Invalid workspaceType: ${workspaceType || 'missing'}`);
  const textLanguage = requireText(workspaceCandidate.textLanguage, 'workspace.textLanguage');
  const meaningLanguage = requireText(workspaceCandidate.meaningLanguage, 'workspace.meaningLanguage');

  let normalizedWorkspace;
  if (workspaceType === 'legacy') {
    const legacy = normalizeLegacyWorkspace(workspaceCandidate);
    normalizedWorkspace = { workspaceKey, title, workspaceType, textLanguage, meaningLanguage, ...legacy };
  } else {
    const conversationMode = workspaceType === 'conversation'
      ? clean(workspaceCandidate.conversationMode)
      : null;
    if (workspaceType === 'conversation' && !['conversation-only', 'mix'].includes(conversationMode)) {
      throw new Error('Conversation Workspace requires conversationMode "conversation-only" or "mix"');
    }
    const speakers = workspaceType === 'conversation' ? normalizeSpeakers(workspaceCandidate) : [];
    const speakerKeys = new Set(speakers.map(item => item.speakerKey));
    const segmentKeys = [];
    const cards = normalizeOrderedArray({
      source: workspaceCandidate.cards,
      label: 'Workspace cards',
      keyField: 'cardKey',
      normalizeItem: (card, index) => normalizeStructuredCard({
        candidate: card,
        index,
        workspaceType,
        conversationMode,
        segmentKeys,
        speakerKeys
      })
    });
    assertUnique(segmentKeys, 'segmentKey');
    normalizedWorkspace = {
      workspaceKey,
      title,
      workspaceType,
      ...(conversationMode ? { conversationMode } : {}),
      textLanguage,
      meaningLanguage,
      ...(speakers.length ? { speakers } : {}),
      cards
    };
  }

  return {
    package: {
      packageType: PROLINGO_TEXT_EXTERNAL_PACKAGE_TYPE,
      packageVersion: PROLINGO_TEXT_EXTERNAL_PACKAGE_VERSION,
      externalSourceKey,
      collectionHint,
      source,
      workspace: normalizedWorkspace
    }
  };
};

const hashString = value => {
  let h = 2166136261;
  for (const ch of String(value || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
};

const maxOrder = records => (records || []).reduce((max, record) => Math.max(max, Number(record?.order) || 0), 0);

const allocateLocalId = (state, kind) => {
  const counterKey = kind === 'COLLECTION' ? 'collection' : kind === 'DOCUMENT' ? 'document' : kind === 'BLOCK' ? 'text' : 'segment';
  const next = Number(state.counters[counterKey] || 0) + 1;
  state.counters = { ...state.counters, [counterKey]: next };
  return formatTextLibraryId(kind, next);
};

const sourceIdentityMetadata = ({ packageValue, importedAt, fileName }) => ({
  externalSourceKey: packageValue.externalSourceKey,
  workspaceKey: packageValue.workspace.workspaceKey,
  packageType: packageValue.packageType,
  packageVersion: packageValue.packageVersion,
  source: cloneJson(packageValue.source),
  collectionHint: packageValue.collectionHint ? cloneJson(packageValue.collectionHint) : null,
  importedAt,
  sourceFileName: fileName || null
});

const entityMetadata = ({ packageValue, cardKey = null, segmentKey = null, entryKey = null, speakerKey = null }) => ({
  externalSourceKey: packageValue.externalSourceKey,
  workspaceKey: packageValue.workspace.workspaceKey,
  ...(cardKey ? { cardKey } : {}),
  ...(segmentKey ? { segmentKey } : {}),
  ...(entryKey ? { entryKey } : {}),
  ...(speakerKey ? { speakerKey } : {})
});

const resolveCollectionForImport = ({ snapshot, state, packageValue, now }) => {
  const hint = packageValue.collectionHint;
  if (!hint) return { collectionId: null, collection: null };
  const existing = (snapshot.collections || []).find(collection => clean(collection?.metadata?.[TEXT_EXTERNAL_COLLECTION_HINT_METADATA_KEY]?.collectionKey) === hint.collectionKey) || null;
  if (existing) return { collectionId: existing.id, collection: null };
  const id = allocateLocalId(state, 'COLLECTION');
  const collection = createTextCollectionRecord({
    id,
    uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.COLLECTION),
    title: hint.title,
    order: maxOrder(snapshot.collections) + 1,
    createdAt: now,
    updatedAt: now,
    metadata: {
      [TEXT_EXTERNAL_COLLECTION_HINT_METADATA_KEY]: {
        collectionKey: hint.collectionKey,
        createdFromExternalSourceKey: packageValue.externalSourceKey
      }
    }
  });
  return { collectionId: collection.id, collection };
};

export const normalizeTextExternalImportRegistry = candidate => (Array.isArray(candidate) ? candidate : [])
  .filter(item => isObject(item) && clean(item.externalSourceKey) && clean(item.documentId))
  .map(item => ({
    externalSourceKey: clean(item.externalSourceKey),
    workspaceKey: clean(item.workspaceKey) || 'main',
    documentId: clean(item.documentId),
    documentUid: clean(item.documentUid) || null,
    collectionId: clean(item.collectionId) || null,
    fileName: clean(item.fileName) || null,
    importedAt: Number(item.importedAt) || null,
    lastImportedAt: Number(item.lastImportedAt) || Number(item.importedAt) || null,
    source: isObject(item.source) ? cloneJson(item.source) : {},
    collectionHint: isObject(item.collectionHint) ? cloneJson(item.collectionHint) : null,
    dataFingerprint: clean(item.dataFingerprint) || null,
    baselineEntityFingerprints: isObject(item.baselineEntityFingerprints) ? cloneJson(item.baselineEntityFingerprints) : null,
    baselinePackage: isObject(item.baselinePackage) ? cloneJson(item.baselinePackage) : null,
    revision: Math.max(1, Number(item.revision) || 1),
    history: Array.isArray(item.history) ? cloneJson(item.history) : []
  }));

export const findTextExternalImportBySourceKey = (registry, externalSourceKey) => normalizeTextExternalImportRegistry(registry)
  .find(item => item.externalSourceKey === clean(externalSourceKey)) || null;

export const planProLingoTextExternalInitialImport = ({
  localSnapshot: snapshotCandidate,
  package: packageCandidate,
  existingImports = [],
  fileName = null,
  now = Date.now()
}) => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  const existing = findTextExternalImportBySourceKey(existingImports, packageValue.externalSourceKey);
  if (existing) {
    const error = new Error(`External source ${packageValue.externalSourceKey} is already imported. D3/D4 duplicate/update reconciliation must decide the next action.`);
    error.code = 'TEXT_EXTERNAL_SOURCE_ALREADY_IMPORTED';
    error.existingImport = existing;
    throw error;
  }

  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate || {});
  const state = { counters: normalizeTextIdCounters(snapshot.counters) };
  const { collectionId, collection } = resolveCollectionForImport({ snapshot, state, packageValue, now });
  const siblings = snapshot.documents.filter(item => (item.collectionId || null) === (collectionId || null));
  const documentId = allocateLocalId(state, 'DOCUMENT');
  const workspace = packageValue.workspace;
  const speakerMap = new Map();
  const speakerRegistry = (workspace.speakers || []).map(speaker => {
    const id = `SPK_EXT_${hashString(`${packageValue.externalSourceKey}::${workspace.workspaceKey}::${speaker.speakerKey}`)}`;
    const entry = {
      id,
      uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SPEAKER),
      label: speaker.displayName,
      externalKey: speaker.speakerKey
    };
    speakerMap.set(speaker.speakerKey, entry);
    return entry;
  });

  const documentMetadata = {
    [TEXT_EXTERNAL_SOURCE_METADATA_KEY]: sourceIdentityMetadata({ packageValue, importedAt: now, fileName }),
    ...(speakerRegistry.length ? { [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: speakerRegistry } : {})
  };
  const documentType = workspace.workspaceType === 'paragraph'
    ? 'paragraph'
    : workspace.workspaceType === 'conversation'
      ? (workspace.conversationMode === 'mix' ? 'mixed' : 'conversation')
      : 'mixed';
  const editorModel = workspace.workspaceType === 'legacy' ? TEXT_LEGACY_EDITOR_MODEL : TEXT_STRUCTURED_EDITOR_MODEL;
  const document = createTextDocumentRecord({
    id: documentId,
    uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.WORKSPACE),
    title: workspace.title,
    collectionId,
    order: maxOrder(siblings) + 1,
    documentType,
    textLanguage: workspace.textLanguage,
    meaningLanguage: workspace.meaningLanguage,
    editorModel,
    createdAt: now,
    updatedAt: now,
    metadata: documentMetadata
  });

  const blocks = [];
  const segments = [];
  if (workspace.workspaceType === 'legacy') {
    workspace.entries.forEach(entry => {
      const blockId = allocateLocalId(state, 'BLOCK');
      const block = createTextBlockRecord({
        id: blockId,
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD),
        documentId,
        order: entry.order,
        blockType: 'paragraph',
        createdAt: now,
        updatedAt: now,
        metadata: {
          migratedFromLegacyLine: false,
          [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: entityMetadata({ packageValue, entryKey: entry.entryKey })
        }
      });
      const segmentId = allocateLocalId(state, 'SEGMENT');
      const segment = createTextSegmentRecord({
        id: segmentId,
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
        documentId,
        blockId,
        order: 1,
        text: entry.text,
        meaning: entry.meaning,
        createdAt: now,
        updatedAt: now,
        metadata: {
          [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: entityMetadata({ packageValue, entryKey: entry.entryKey })
        }
      });
      blocks.push(block);
      segments.push(segment);
    });
  } else {
    workspace.cards.forEach(card => {
      const blockId = allocateLocalId(state, 'BLOCK');
      const block = createTextBlockRecord({
        id: blockId,
        uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD),
        documentId,
        order: card.order,
        blockType: card.type,
        title: card.title,
        createdAt: now,
        updatedAt: now,
        metadata: {
          ...(card.type === 'paragraph' ? { [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: card.role } : {}),
          [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: entityMetadata({ packageValue, cardKey: card.cardKey })
        }
      });
      blocks.push(block);
      card.segments.forEach(item => {
        const speakerEntry = item.speakerKey ? speakerMap.get(item.speakerKey) : null;
        const segmentId = allocateLocalId(state, 'SEGMENT');
        segments.push(createTextSegmentRecord({
          id: segmentId,
          uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT),
          documentId,
          blockId,
          order: item.order,
          text: item.text,
          meaning: item.meaning,
          speaker: speakerEntry?.label || null,
          createdAt: now,
          updatedAt: now,
          metadata: {
            ...(speakerEntry ? { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: speakerEntry.id } : {}),
            [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: entityMetadata({
              packageValue,
              cardKey: card.cardKey,
              segmentKey: item.segmentKey,
              speakerKey: item.speakerKey || null
            })
          }
        }));
      });
    });
  }

  const nextSnapshot = normalizeTextLibraryRuntimeSnapshot({
    ...snapshot,
    activeDocumentId: document.id,
    counters: state.counters,
    collections: collection ? [...snapshot.collections, collection] : snapshot.collections,
    documents: [...snapshot.documents, document],
    blocks: [...snapshot.blocks, ...blocks],
    segments: [...snapshot.segments, ...segments]
  });
  const importRecord = {
    externalSourceKey: packageValue.externalSourceKey,
    workspaceKey: workspace.workspaceKey,
    documentId: document.id,
    documentUid: document.uid,
    collectionId: collectionId || null,
    fileName: fileName || null,
    importedAt: now,
    lastImportedAt: now,
    source: cloneJson(packageValue.source),
    collectionHint: packageValue.collectionHint ? cloneJson(packageValue.collectionHint) : null,
    dataFingerprint: buildTextExternalPackageDataFingerprint(packageValue),
    baselineEntityFingerprints: buildTextExternalPackageEntityFingerprints(packageValue),
    baselinePackage: cloneJson(packageValue),
    revision: 1,
    history: []
  };
  return {
    package: packageValue,
    snapshot: nextSnapshot,
    importRecord,
    created: {
      collectionIds: collection ? [collection.id] : [],
      documentIds: [document.id],
      blockIds: blocks.map(item => item.id),
      segmentIds: segments.map(item => item.id)
    },
    counts: {
      collections: collection ? 1 : 0,
      documents: 1,
      blocks: blocks.length,
      segments: segments.length,
      speakers: speakerRegistry.length
    }
  };
};

// D3/D4 canonical external-source fingerprints and reconciliation helpers.
// These fingerprints intentionally ignore collection placement and source notes:
// those fields are organizational/non-semantic and must not create duplicate data.
export const buildTextExternalCanonicalPackagePayload = packageCandidate => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  return {
    packageType: packageValue.packageType,
    packageVersion: packageValue.packageVersion,
    externalSourceKey: packageValue.externalSourceKey,
    source: {
      sourceKind: packageValue.source.sourceKind,
      title: packageValue.source.title,
      reference: packageValue.source.reference || null
    },
    workspace: cloneJson(packageValue.workspace)
  };
};

export const buildTextExternalPackageDataFingerprint = packageCandidate =>
  buildCanonicalSha256Fingerprint(buildTextExternalCanonicalPackagePayload(packageCandidate), 'sha256');

const paragraphSegmentSemantic = segment => ({
  text: clean(segment?.text),
  meaning: String(segment?.meaning ?? '').trim()
});

const conversationSegmentSemantic = segment => ({
  ...paragraphSegmentSemantic(segment),
  speakerKey: clean(segment?.speakerKey) || null
});

export const buildTextExternalPackageEntityFingerprints = packageCandidate => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  const workspace = packageValue.workspace;
  const fingerprints = {
    workspace: buildCanonicalSha256Fingerprint({
      workspaceType: workspace.workspaceType,
      conversationMode: workspace.conversationMode || null,
      title: workspace.title,
      textLanguage: workspace.textLanguage,
      meaningLanguage: workspace.meaningLanguage
    }, 'sha256'),
    cards: {},
    segments: {},
    speakers: {},
    legacyEntries: {}
  };
  (workspace.speakers || []).forEach(speaker => {
    fingerprints.speakers[speaker.speakerKey] = buildCanonicalSha256Fingerprint({ displayName: speaker.displayName }, 'sha256');
  });
  if (workspace.workspaceType === 'legacy') {
    workspace.entries.forEach(entry => {
      fingerprints.legacyEntries[entry.entryKey] = buildCanonicalSha256Fingerprint(paragraphSegmentSemantic(entry), 'sha256');
    });
    return fingerprints;
  }
  workspace.cards.forEach(card => {
    fingerprints.cards[card.cardKey] = buildCanonicalSha256Fingerprint({
      type: card.type,
      role: card.role || null,
      title: card.title || null
    }, 'sha256');
    card.segments.forEach(segment => {
      fingerprints.segments[segment.segmentKey] = buildCanonicalSha256Fingerprint(
        card.type === 'conversation' ? conversationSegmentSemantic(segment) : paragraphSegmentSemantic(segment),
        'sha256'
      );
    });
  });
  return fingerprints;
};

const localExternalMeta = record => record?.metadata?.[TEXT_EXTERNAL_ENTITY_METADATA_KEY] || null;

const resolveSpeakerKeyForLocalSegment = ({ segment, speakerRegistry = [] }) => {
  const speakerId = clean(segment?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]);
  if (!speakerId) return null;
  const entry = (Array.isArray(speakerRegistry) ? speakerRegistry : []).find(item => clean(item?.id) === speakerId) || null;
  return clean(entry?.externalKey) || null;
};

export const buildTextExternalLocalEntityFingerprints = ({ localSnapshot: snapshotCandidate, documentId }) => {
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate || {});
  const document = snapshot.documents.find(item => item.id === documentId) || null;
  if (!document) return null;
  const sourceMeta = document.metadata?.[TEXT_EXTERNAL_SOURCE_METADATA_KEY] || {};
  const workspaceType = document.editorModel === TEXT_LEGACY_EDITOR_MODEL
    ? 'legacy'
    : document.documentType === 'paragraph'
      ? 'paragraph'
      : 'conversation';
  const speakerRegistry = document.metadata?.[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY] || [];
  const fingerprints = {
    workspace: buildCanonicalSha256Fingerprint({
      workspaceType,
      conversationMode: document.editorModel === TEXT_STRUCTURED_EDITOR_MODEL && document.documentType === 'mixed' ? 'mix' : document.documentType === 'conversation' ? 'conversation-only' : null,
      title: document.title,
      textLanguage: document.textLanguage,
      meaningLanguage: document.meaningLanguage
    }, 'sha256'),
    cards: {}, segments: {}, speakers: {}, legacyEntries: {}
  };
  speakerRegistry.forEach(entry => {
    const key = clean(entry?.externalKey);
    if (key) fingerprints.speakers[key] = buildCanonicalSha256Fingerprint({ displayName: clean(entry?.label) }, 'sha256');
  });
  const blocks = snapshot.blocks.filter(item => item.documentId === document.id);
  blocks.forEach(block => {
    const meta = localExternalMeta(block);
    const blockSegments = snapshot.segments.filter(item => item.blockId === block.id);
    if (workspaceType === 'legacy') {
      const segment = blockSegments[0] || null;
      const key = clean(meta?.entryKey || localExternalMeta(segment)?.entryKey);
      if (key && segment) fingerprints.legacyEntries[key] = buildCanonicalSha256Fingerprint(paragraphSegmentSemantic(segment), 'sha256');
      return;
    }
    const cardKey = clean(meta?.cardKey);
    if (cardKey) {
      fingerprints.cards[cardKey] = buildCanonicalSha256Fingerprint({
        type: block.blockType,
        role: block.blockType === 'paragraph' ? normalizeTextParagraphCardRole(block.metadata?.[TEXT_PARAGRAPH_ROLE_METADATA_KEY]) : null,
        title: block.title || null
      }, 'sha256');
    }
    blockSegments.forEach(segment => {
      const segmentMeta = localExternalMeta(segment);
      const segmentKey = clean(segmentMeta?.segmentKey);
      if (!segmentKey) return;
      fingerprints.segments[segmentKey] = buildCanonicalSha256Fingerprint(
        block.blockType === 'conversation'
          ? { ...paragraphSegmentSemantic(segment), speakerKey: clean(segmentMeta?.speakerKey) || resolveSpeakerKeyForLocalSegment({ segment, speakerRegistry }) }
          : paragraphSegmentSemantic(segment),
        'sha256'
      );
    });
  });
  return { externalSourceKey: clean(sourceMeta.externalSourceKey), workspaceKey: clean(sourceMeta.workspaceKey), fingerprints };
};

export const classifyTextExternalEntityRevision = ({ baselineFingerprint = null, localFingerprint = null, incomingFingerprint = null } = {}) => {
  const baseline = clean(baselineFingerprint);
  const local = clean(localFingerprint);
  const incoming = clean(incomingFingerprint);
  if (local && incoming && local === incoming) return 'same';
  if (!local && incoming) return 'incoming-add';
  if (local && !incoming) return baseline && local === baseline ? 'incoming-remove-safe' : 'incoming-remove-conflict';
  if (!baseline) return local === incoming ? 'same' : 'conflict-no-baseline';
  if (local === baseline && incoming !== baseline) return 'incoming-update-safe';
  if (incoming === baseline && local !== baseline) return 'local-only-change';
  if (local !== baseline && incoming !== baseline && local !== incoming) return 'conflict';
  return 'same';
};
