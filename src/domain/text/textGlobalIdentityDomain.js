export const TEXT_GLOBAL_UID_SCHEMA_VERSION = 1;

export const TEXT_GLOBAL_UID_KINDS = Object.freeze({
  COLLECTION: 'COLLECTION',
  WORKSPACE: 'WORKSPACE',
  CARD: 'CARD',
  SEGMENT: 'SEGMENT',
  SPEAKER: 'SPEAKER',
  AUDIO_VARIANT: 'AUDIO_VARIANT'
});

export const TEXT_GLOBAL_UID_PREFIXES = Object.freeze({
  [TEXT_GLOBAL_UID_KINDS.COLLECTION]: 'COLLUID_',
  [TEXT_GLOBAL_UID_KINDS.WORKSPACE]: 'WSUID_',
  [TEXT_GLOBAL_UID_KINDS.CARD]: 'CARDUID_',
  [TEXT_GLOBAL_UID_KINDS.SEGMENT]: 'SEGUID_',
  [TEXT_GLOBAL_UID_KINDS.SPEAKER]: 'SPKUID_',
  [TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT]: 'AUDUID_'
});

const SPEAKER_REGISTRY_METADATA_KEY = 'speakerRegistryV1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clean = value => String(value ?? '').trim();
const metadataObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export const normalizeTextGlobalUid = (value, kind) => {
  const prefix = TEXT_GLOBAL_UID_PREFIXES[kind];
  if (!prefix) return null;
  const raw = clean(value);
  if (!raw.toUpperCase().startsWith(prefix)) return null;
  const uuid = raw.slice(prefix.length).toLowerCase();
  if (!UUID_PATTERN.test(uuid)) return null;
  return `${prefix}${uuid}`;
};

export const isTextGlobalUid = (value, kind) => Boolean(normalizeTextGlobalUid(value, kind));

const formatUuidV4FromBytes = bytes => {
  const data = Uint8Array.from(bytes);
  data[6] = (data[6] & 0x0f) | 0x40;
  data[8] = (data[8] & 0x3f) | 0x80;
  const hex = [...data].map(value => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
};

const resolveRandomUuid = randomUuid => {
  if (typeof randomUuid === 'function') return randomUuid;
  if (typeof globalThis?.crypto?.randomUUID === 'function') return () => globalThis.crypto.randomUUID();
  if (typeof globalThis?.crypto?.getRandomValues === 'function') {
    return () => {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return formatUuidV4FromBytes(bytes);
    };
  }
  throw new Error('Secure UUID generation is unavailable; Web Crypto is required');
};

export const createTextGlobalUid = (kind, randomUuid = null) => {
  const prefix = TEXT_GLOBAL_UID_PREFIXES[kind];
  if (!prefix) throw new Error(`Unsupported Text global UID kind: ${kind}`);
  const uuid = clean(resolveRandomUuid(randomUuid)()).toLowerCase();
  if (!UUID_PATTERN.test(uuid)) throw new Error(`UUID factory returned an invalid UUID for ${kind}`);
  return `${prefix}${uuid}`;
};

export const cloneTextRecordWithUid = ({ record, kind, uid = record?.uid }) => {
  const normalized = normalizeTextGlobalUid(uid, kind);
  return normalized ? { ...record, uid: normalized } : { ...record };
};

const createUniqueUid = ({ kind, seen, uidFactory }) => {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const uid = uidFactory(kind);
    if (!seen.has(uid)) {
      seen.add(uid);
      return uid;
    }
  }
  throw new Error(`Failed to allocate a unique Text ${kind} UID after 32 attempts`);
};

const backfillRecordGroup = ({ records, kind, seen, uidFactory }) => {
  let changed = 0;
  const next = (records || []).map(record => {
    const current = normalizeTextGlobalUid(record?.uid, kind);
    if (current && !seen.has(current)) {
      seen.add(current);
      if (current === record.uid) return record;
      changed += 1;
      return { ...record, uid: current };
    }
    changed += 1;
    return { ...record, uid: createUniqueUid({ kind, seen, uidFactory }) };
  });
  return { records: next, changed };
};

const backfillDocumentSpeakerUids = ({ documents, seen, uidFactory }) => {
  let changedDocuments = 0;
  let changedSpeakers = 0;
  const nextDocuments = (documents || []).map(document => {
    const metadata = metadataObject(document?.metadata);
    const source = metadata?.[SPEAKER_REGISTRY_METADATA_KEY];
    const registry = Array.isArray(source) ? source : Array.isArray(source?.speakers) ? source.speakers : null;
    if (!registry?.length) return document;

    let documentChanged = false;
    const nextRegistry = registry.map(entry => {
      const current = normalizeTextGlobalUid(entry?.uid, TEXT_GLOBAL_UID_KINDS.SPEAKER);
      if (current && !seen.has(current)) {
        seen.add(current);
        if (current === entry.uid) return entry;
        documentChanged = true;
        changedSpeakers += 1;
        return { ...entry, uid: current };
      }
      documentChanged = true;
      changedSpeakers += 1;
      return {
        ...entry,
        uid: createUniqueUid({ kind: TEXT_GLOBAL_UID_KINDS.SPEAKER, seen, uidFactory })
      };
    });

    if (!documentChanged) return document;
    changedDocuments += 1;
    const nextSource = Array.isArray(source) ? nextRegistry : { ...source, speakers: nextRegistry };
    return {
      ...document,
      metadata: {
        ...metadata,
        [SPEAKER_REGISTRY_METADATA_KEY]: nextSource
      }
    };
  });
  return { documents: nextDocuments, changedDocuments, changedSpeakers };
};

// D1 compatibility backfill. This function intentionally does not change local IndexedDB
// primary keys. It only adds globally portable UIDs alongside COLL_/DOC_/TEXT_/SEGMENT_/
// TXTAUDIO_ identifiers and speaker registry entries.
export const backfillTextGlobalUids = (snapshotCandidate = {}, options = {}) => {
  const uidFactory = typeof options.uidFactory === 'function'
    ? options.uidFactory
    : kind => createTextGlobalUid(kind);
  const seen = new Set();

  const collectionsResult = backfillRecordGroup({
    records: snapshotCandidate.collections,
    kind: TEXT_GLOBAL_UID_KINDS.COLLECTION,
    seen,
    uidFactory
  });
  const documentsResult = backfillRecordGroup({
    records: snapshotCandidate.documents,
    kind: TEXT_GLOBAL_UID_KINDS.WORKSPACE,
    seen,
    uidFactory
  });
  const blocksResult = backfillRecordGroup({
    records: snapshotCandidate.blocks,
    kind: TEXT_GLOBAL_UID_KINDS.CARD,
    seen,
    uidFactory
  });
  const segmentsResult = backfillRecordGroup({
    records: snapshotCandidate.segments,
    kind: TEXT_GLOBAL_UID_KINDS.SEGMENT,
    seen,
    uidFactory
  });
  const audioResult = backfillRecordGroup({
    records: snapshotCandidate.audioVariants,
    kind: TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT,
    seen,
    uidFactory
  });
  const speakerResult = backfillDocumentSpeakerUids({
    documents: documentsResult.records,
    seen,
    uidFactory
  });

  const counts = {
    collections: collectionsResult.changed,
    workspaces: documentsResult.changed,
    cards: blocksResult.changed,
    segments: segmentsResult.changed,
    audioVariants: audioResult.changed,
    speakerRegistryEntries: speakerResult.changedSpeakers,
    speakerRegistryDocuments: speakerResult.changedDocuments
  };
  const changed = Object.values(counts).some(value => Number(value || 0) > 0);

  return {
    changed,
    counts,
    snapshot: {
      ...snapshotCandidate,
      collections: collectionsResult.records,
      documents: speakerResult.documents,
      blocks: blocksResult.records,
      segments: segmentsResult.records,
      audioVariants: audioResult.records
    }
  };
};

export const collectTextGlobalUidDiagnostics = (snapshot = {}) => {
  const groups = [
    ['collections', TEXT_GLOBAL_UID_KINDS.COLLECTION, snapshot.collections || []],
    ['workspaces', TEXT_GLOBAL_UID_KINDS.WORKSPACE, snapshot.documents || []],
    ['cards', TEXT_GLOBAL_UID_KINDS.CARD, snapshot.blocks || []],
    ['segments', TEXT_GLOBAL_UID_KINDS.SEGMENT, snapshot.segments || []],
    ['audioVariants', TEXT_GLOBAL_UID_KINDS.AUDIO_VARIANT, snapshot.audioVariants || []]
  ];
  const seen = new Set();
  const diagnostics = {};
  groups.forEach(([label, kind, records]) => {
    let missing = 0;
    let invalid = 0;
    let duplicate = 0;
    records.forEach(record => {
      const raw = clean(record?.uid);
      const uid = normalizeTextGlobalUid(raw, kind);
      if (!raw) missing += 1;
      else if (!uid) invalid += 1;
      else if (seen.has(uid)) duplicate += 1;
      else seen.add(uid);
    });
    diagnostics[label] = { total: records.length, missing, invalid, duplicate };
  });

  let speakerTotal = 0;
  let speakerMissing = 0;
  let speakerInvalid = 0;
  let speakerDuplicate = 0;
  (snapshot.documents || []).forEach(document => {
    const source = document?.metadata?.[SPEAKER_REGISTRY_METADATA_KEY];
    const registry = Array.isArray(source) ? source : Array.isArray(source?.speakers) ? source.speakers : [];
    registry.forEach(entry => {
      speakerTotal += 1;
      const raw = clean(entry?.uid);
      const uid = normalizeTextGlobalUid(raw, TEXT_GLOBAL_UID_KINDS.SPEAKER);
      if (!raw) speakerMissing += 1;
      else if (!uid) speakerInvalid += 1;
      else if (seen.has(uid)) speakerDuplicate += 1;
      else seen.add(uid);
    });
  });
  diagnostics.speakers = { total: speakerTotal, missing: speakerMissing, invalid: speakerInvalid, duplicate: speakerDuplicate };
  diagnostics.valid = Object.values(diagnostics).filter(value => value && typeof value === 'object' && 'total' in value)
    .every(value => value.missing === 0 && value.invalid === 0 && value.duplicate === 0);
  return diagnostics;
};
