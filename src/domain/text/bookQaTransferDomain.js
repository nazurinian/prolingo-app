import { createProLingoTextPack, mergeProLingoTextPack, validateProLingoTextPack } from './textPackJsonDomain.js';
import { resolveTextLibraryCatalog } from './textLibraryDomain.js';
import { applyTextLibraryCommand } from './textLibraryCommandDomain.js';
import { BOOK_HEADING_AUDIO_KEY } from './textBookHeadingDomain.js';
import { BOOK_AUDIO_BINARY, BOOK_AUDIO_COMPOSITION, BOOK_AUDIO_REFS } from './bookQaAudioDomain.js';
import { TEXT_STRUCTURED_FULL_AUDIO_ARTIFACTS_METADATA_KEY as fullKey } from './textStructuredSplitFullDomain.js';
import { isBookQaWorkspace } from './bookQaCapabilities.js';

export const BOOK_JSON_MAX_BYTES = 16 * 1024 * 1024;
const envelopeType = 'prolingo-book-library';
const maxPacks = 1000;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const clean = value => typeof value === 'string' ? value.trim() : '';
const envelope = (scope, packs, now) => {
  if (packs.length > maxPacks) fail('BOOK_JSON_LIMIT', 'Export smaller scopes. The library has more than 1,000 packs.');
  return { packageType: envelopeType, packageVersion: 1, textSchemaVersion: 2,
    audioBinaryIncluded: false, exportedAt: new Date(now).toISOString(), scope, packs };
};

export const createBookJsonExport = (snapshot, selection, scope, now = Date.now()) => {
  const pack = (scopeType, rootId, allowEmptyCollection = false) =>
    createProLingoTextPack({ snapshot, scopeType, rootId, now, allowEmptyCollection });
  if (scope === 'workspace' && selection.workspaceId) return pack('document', selection.workspaceId);
  if (scope === 'collection' && selection.collectionId) {
    const result = pack('collection', selection.collectionId, true);
    return result.documents.length ? result : envelope('collection', [result], now);
  }
  if (scope !== 'root' && scope !== 'library') fail('SELECT_EXPORT_SCOPE', 'Select the Workspace or Custom Collection to export.');
  const catalog = resolveTextLibraryCatalog(snapshot);
  return envelope(scope, [
    ...catalog.rootDocuments.map(doc => pack('document', doc.id)),
    ...(scope === 'library' ? catalog.collections.map(collection => pack('collection', collection.id, true)) : [])
  ], now);
};

export const inspectBookJson = candidate => {
  const wrapped = candidate?.packageType === envelopeType;
  const scope = wrapped ? candidate.scope : candidate?.scope?.type;
  const inputs = wrapped ? candidate.packs : [candidate];
  if (wrapped && (candidate.packageVersion !== 1 || candidate.textSchemaVersion !== 2 || candidate.audioBinaryIncluded !== false
    || !['root', 'library', 'collection'].includes(scope) || !Array.isArray(inputs) || inputs.length > maxPacks
    || (scope === 'collection' && (inputs.length !== 1 || inputs[0]?.scope?.type !== 'collection'))
    || (scope === 'root' && inputs.some(pack => pack?.scope?.type !== 'document')))) {
    fail('INVALID_BOOK_JSON', 'Unsupported Book Library envelope.');
  }
  const packs = inputs.map(input => {
    try {
      const { pack } = validateProLingoTextPack(input, { allowEmptyCollection: wrapped });
      if (pack.audioBinaryIncluded !== false || (wrapped && pack.textSchemaVersion !== 2) || !pack.documents.every(isBookQaWorkspace)) {
        fail('INVALID_BOOK_JSON', 'Choose data-only Book Workspace or Collection JSON.');
      }
      return pack;
    } catch (error) {
      fail('INVALID_BOOK_JSON', error.message);
    }
  });
  return {
    scope, packs, workspaceCount: packs.reduce((count, pack) => count + pack.documents.length, 0),
    collectionCount: packs.reduce((count, pack) => count + pack.collections.length, 0)
  };
};

export const validateBookJsonImport = (snapshot, payload) => {
  const { candidate, destination } = payload;
  const inspected = inspectBookJson(candidate);
  const kind = destination?.kind;
  const allowedFields = { preserve: ['kind'], root: ['kind'], existing: ['kind', 'collectionId'], new: ['kind', 'name'] };
  if (!Object.hasOwn(allowedFields, kind) || Object.keys(destination).some(key => !allowedFields[kind].includes(key))
    || (kind === 'existing' && !snapshot.collections.some(c => c.id === destination.collectionId))
    || (kind === 'new' && (!clean(destination.name) || clean(destination.name).length > 160))
    || (kind === 'preserve' && !['collection', 'library'].includes(inspected.scope))
    || (inspected.scope === 'library' && kind !== 'preserve')
    || (kind !== 'preserve' && !inspected.workspaceCount)) {
    fail('INVALID_DESTINATION', 'Choose a valid destination. Import a full Library or an empty Collection with its structure.');
  }
  return inspected;
};

// JSON can carry descriptor and digest evidence. Only the scoped Portable Audio
// importer is allowed to establish a live binding or trust a Full composition.
const detachLocalAudio = pack => {
  const cleanOwner = owner => {
    const metadata = { ...owner.metadata };
    if (metadata[BOOK_HEADING_AUDIO_KEY]) {
      metadata.bookTransferredHeadingAudioV1 = metadata[BOOK_HEADING_AUDIO_KEY];
      delete metadata[BOOK_HEADING_AUDIO_KEY];
    }
    if (Object.hasOwn(metadata, fullKey)) {
      const source = metadata[fullKey];
      metadata[fullKey] = { ...source, artifacts: (Array.isArray(source?.artifacts) ? source.artifacts : []).map(artifact => {
        const artifactMetadata = { ...artifact.metadata };
        delete artifactMetadata[BOOK_AUDIO_BINARY];
        delete artifactMetadata[BOOK_AUDIO_COMPOSITION];
        delete artifactMetadata.stagingId;
        return { ...artifact, metadata: artifactMetadata };
      }) };
    }
    return { ...owner, metadata };
  };
  return {
    ...pack, documents: pack.documents.map(cleanOwner), blocks: pack.blocks.map(cleanOwner),
    audioVariants: pack.audioVariants.map(variant => {
      const metadata = { ...variant.metadata };
      delete metadata.stagingId;
      delete metadata[BOOK_AUDIO_BINARY];
      if (Object.hasOwn(metadata, BOOK_AUDIO_REFS)) {
        const refs = metadata[BOOK_AUDIO_REFS];
        if (!refs || typeof refs !== 'object' || Array.isArray(refs) || Object.keys(refs).length > 64
          || Object.keys(refs).some(rf => !/^rf-sha256-[a-f0-9]{64}$/u.test(rf))) {
          fail('INVALID_BOOK_JSON', 'Invalid recording profile references.');
        }
        metadata[BOOK_AUDIO_REFS] = Object.fromEntries(Object.entries(refs).map(([rf, ref]) =>
          [rf, { descriptor: ref?.descriptor ?? null, binary: null }]));
      }
      return { ...variant, metadata };
    })
  };
};

export const applyBookJsonImport = (snapshot, payload, now) => {
  const { packs } = validateBookJsonImport(snapshot, payload);
  const { destination } = payload;
  let next = snapshot;
  let destinationId = destination.kind === 'existing' ? destination.collectionId : null;
  const documentIds = [], collectionIds = [];
  const run = (type, nativePayload) => {
    const outcome = applyTextLibraryCommand(next, { type, payload: nativePayload }, now);
    next = outcome.snapshot;
    return outcome.result.id;
  };
  if (destination.kind === 'new') {
    destinationId = run('collection.create', { title: clean(destination.name) });
    collectionIds.push(destinationId);
  }
  for (const pack of packs) {
    const merged = mergeProLingoTextPack({ localSnapshot: next, pack: detachLocalAudio(pack), now,
      allowEmptyCollection: true, preserveSourceAliases: true });
    next = merged.snapshot;
    documentIds.push(...merged.imported.documentIds);
    if (destination.kind === 'preserve') collectionIds.push(...merged.imported.collectionIds);
    else {
      for (const id of merged.imported.documentIds) {
        if (next.documents.find(document => document.id === id).collectionId !== destinationId) {
          run('document.update', { id, collectionId: destinationId });
        }
      }
      for (const id of merged.imported.collectionIds) run('collection.delete', { id });
    }
  }
  return { snapshot: next, result: { action: 'import-copy', documentIds, collectionIds } };
};
