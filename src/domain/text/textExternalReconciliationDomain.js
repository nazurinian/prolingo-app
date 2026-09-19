import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';
import {
  createTextBlockRecord,
  createTextSegmentRecord,
  formatTextLibraryId,
  normalizeTextIdCounters,
  normalizeTextLibraryRuntimeSnapshot
} from './textLibraryDomain.js';
import { createTextGlobalUid, TEXT_GLOBAL_UID_KINDS } from './textGlobalIdentityDomain.js';
import {
  TEXT_EXTERNAL_ENTITY_METADATA_KEY,
  TEXT_EXTERNAL_SOURCE_METADATA_KEY,
  buildTextExternalLocalEntityFingerprints,
  buildTextExternalPackageDataFingerprint,
  buildTextExternalPackageEntityFingerprints,
  classifyTextExternalEntityRevision,
  validateProLingoTextExternalPackage
} from './textExternalJsonDomain.js';
import { TEXT_PARAGRAPH_ROLE_METADATA_KEY, normalizeTextParagraphCardRole } from './textParagraphRoleDomain.js';
import {
  TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY,
  TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY
} from './textStructuredSpeakerIdentityDomain.js';

const clean = value => String(value ?? '').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const byOrder = (a, b) => Number(a?.order || 0) - Number(b?.order || 0) || String(a?.id || '').localeCompare(String(b?.id || ''));

const allocateLocalId = (state, kind) => {
  const counterKey = kind === 'BLOCK' ? 'text' : kind === 'SEGMENT' ? 'segment' : null;
  if (!counterKey) throw new Error(`Unsupported reconciliation allocation kind: ${kind}`);
  const next = Number(state.counters[counterKey] || 0) + 1;
  state.counters = { ...state.counters, [counterKey]: next };
  return formatTextLibraryId(kind, next);
};

const externalMeta = record => record?.metadata?.[TEXT_EXTERNAL_ENTITY_METADATA_KEY] || null;
const withExternalMeta = (record, externalValue) => ({
  ...record,
  metadata: { ...(record?.metadata || {}), [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: externalValue }
});
const withoutExternalMeta = record => {
  const metadata = { ...(record?.metadata || {}) };
  delete metadata[TEXT_EXTERNAL_ENTITY_METADATA_KEY];
  return { ...record, metadata };
};

const sourceEntityMeta = ({ packageValue, cardKey = null, segmentKey = null, entryKey = null, speakerKey = null }) => ({
  externalSourceKey: packageValue.externalSourceKey,
  workspaceKey: packageValue.workspace.workspaceKey,
  ...(cardKey ? { cardKey } : {}),
  ...(segmentKey ? { segmentKey } : {}),
  ...(entryKey ? { entryKey } : {}),
  ...(speakerKey ? { speakerKey } : {})
});

const invalidateVariantsForSegments = (audioVariants, segmentIds, reason, now) => {
  const ids = new Set(segmentIds || []);
  return (audioVariants || []).map(variant => {
    if (!ids.has(variant.segmentId)) return variant;
    return {
      ...variant,
      updatedAt: now,
      metadata: {
        ...(variant.metadata || {}),
        contentInvalidatedV1: {
          reason,
          invalidatedAt: now,
          previousContentFingerprint: variant?.metadata?.contentFingerprint || null,
          previousRenderFingerprint: variant?.metadata?.audioRenderFingerprintV1 || null
        }
      }
    };
  });
};

const revisionDecision = ({ baseline, local, incoming, conflictPolicy = 'keep-local' }) => {
  const classification = classifyTextExternalEntityRevision({ baselineFingerprint: baseline, localFingerprint: local, incomingFingerprint: incoming });
  if (classification === 'conflict' || classification === 'conflict-no-baseline' || classification === 'incoming-remove-conflict') {
    return { classification, action: conflictPolicy === 'use-incoming' ? 'incoming' : 'local', conflict: true };
  }
  if (classification === 'incoming-update-safe' || classification === 'incoming-add' || classification === 'incoming-remove-safe') {
    return { classification, action: 'incoming', conflict: false };
  }
  return { classification, action: 'local', conflict: false };
};

export const inspectTextExternalReconciliation = ({ localSnapshot, package: packageCandidate, existingImport }) => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  const incomingDataFingerprint = buildTextExternalPackageDataFingerprint(packageValue);
  const incomingFingerprints = buildTextExternalPackageEntityFingerprints(packageValue);
  const existingDataFingerprint = clean(existingImport?.dataFingerprint) || (existingImport?.baselinePackage ? buildTextExternalPackageDataFingerprint(existingImport.baselinePackage) : null);
  if (existingDataFingerprint && existingDataFingerprint === incomingDataFingerprint) {
    return {
      status: 'up-to-date',
      externalSourceKey: packageValue.externalSourceKey,
      dataFingerprint: incomingDataFingerprint,
      existingImport,
      conflicts: [],
      summary: { added: 0, updated: 0, removed: 0, conflicts: 0 }
    };
  }
  const local = buildTextExternalLocalEntityFingerprints({ localSnapshot, documentId: existingImport?.documentId });
  if (!local) {
    return {
      status: 'missing-local-workspace',
      externalSourceKey: packageValue.externalSourceKey,
      dataFingerprint: incomingDataFingerprint,
      existingImport,
      conflicts: [],
      summary: { added: 0, updated: 0, removed: 0, conflicts: 0 }
    };
  }
  const baseline = existingImport?.baselineEntityFingerprints || (existingImport?.baselinePackage ? buildTextExternalPackageEntityFingerprints(existingImport.baselinePackage) : { workspace: null, cards: {}, segments: {}, speakers: {}, legacyEntries: {} });
  const groups = ['cards', 'segments', 'speakers', 'legacyEntries'];
  const conflicts = [];
  const summary = { added: 0, updated: 0, removed: 0, unchanged: 0, localOnly: 0, conflicts: 0 };
  const inspectOne = (kind, key, baselineFp, localFp, incomingFp) => {
    const classification = classifyTextExternalEntityRevision({ baselineFingerprint: baselineFp, localFingerprint: localFp, incomingFingerprint: incomingFp });
    if (classification === 'incoming-add') summary.added += 1;
    else if (classification === 'incoming-update-safe') summary.updated += 1;
    else if (classification === 'incoming-remove-safe') summary.removed += 1;
    else if (classification === 'local-only-change') summary.localOnly += 1;
    else if (classification === 'same') summary.unchanged += 1;
    else {
      summary.conflicts += 1;
      conflicts.push({ kind, key, classification, baselineFingerprint: baselineFp || null, localFingerprint: localFp || null, incomingFingerprint: incomingFp || null });
    }
  };
  inspectOne('workspace', packageValue.workspace.workspaceKey, baseline?.workspace, local?.fingerprints?.workspace, incomingFingerprints.workspace);
  groups.forEach(group => {
    const keys = new Set([...Object.keys(baseline?.[group] || {}), ...Object.keys(local?.fingerprints?.[group] || {}), ...Object.keys(incomingFingerprints?.[group] || {})]);
    keys.forEach(key => inspectOne(group, key, baseline?.[group]?.[key], local?.fingerprints?.[group]?.[key], incomingFingerprints?.[group]?.[key]));
  });
  return {
    status: 'decision-required',
    externalSourceKey: packageValue.externalSourceKey,
    dataFingerprint: incomingDataFingerprint,
    existingImport,
    incomingFingerprints,
    localFingerprints: local.fingerprints,
    baselineFingerprints: baseline,
    conflicts,
    summary
  };
};

const buildIncomingSpeakerMap = ({ packageValue, existingRegistry = [], conflictPolicy, baselineFingerprints, localFingerprints, incomingFingerprints }) => {
  const existingByExternal = new Map((existingRegistry || []).filter(item => clean(item?.externalKey)).map(item => [clean(item.externalKey), item]));
  const next = [];
  const decisions = [];
  (packageValue.workspace.speakers || []).forEach(speaker => {
    const current = existingByExternal.get(speaker.speakerKey) || null;
    if (!current) {
      const speakerUid = createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SPEAKER);
      const created = { id: `SPK_EXT_${speakerUid.replace(/[^A-Za-z0-9]/g, '').slice(-10).toUpperCase()}`, uid: speakerUid, label: speaker.displayName, externalKey: speaker.speakerKey };
      next.push(created);
      decisions.push({ key: speaker.speakerKey, action: 'add', entry: created });
      return;
    }
    const decision = revisionDecision({
      baseline: baselineFingerprints?.speakers?.[speaker.speakerKey],
      local: localFingerprints?.speakers?.[speaker.speakerKey],
      incoming: incomingFingerprints?.speakers?.[speaker.speakerKey],
      conflictPolicy
    });
    const entry = decision.action === 'incoming' ? { ...current, label: speaker.displayName, externalKey: speaker.speakerKey } : current;
    next.push(entry);
    decisions.push({ key: speaker.speakerKey, action: decision.action === 'incoming' ? 'update' : 'keep', conflict: decision.conflict, entry });
  });
  // Locally retained speaker that disappeared from incoming survives only when changed/conflicted.
  existingByExternal.forEach((entry, key) => {
    if ((packageValue.workspace.speakers || []).some(item => item.speakerKey === key)) return;
    const decision = revisionDecision({ baseline: baselineFingerprints?.speakers?.[key], local: localFingerprints?.speakers?.[key], incoming: null, conflictPolicy });
    if (decision.action === 'local') {
      next.push({ ...entry, externalKey: undefined });
      decisions.push({ key, action: 'detach-local', conflict: decision.conflict, entry });
    } else decisions.push({ key, action: 'remove', conflict: decision.conflict, entry });
  });
  return { registry: next, decisions };
};

export const planTextExternalUpdateExisting = ({
  localSnapshot: snapshotCandidate,
  package: packageCandidate,
  existingImport,
  conflictPolicy = 'keep-local',
  fileName = null,
  now = Date.now()
}) => {
  const packageValue = validateProLingoTextExternalPackage(packageCandidate).package;
  const snapshot = normalizeTextLibraryRuntimeSnapshot(snapshotCandidate || {});
  const document = snapshot.documents.find(item => item.id === existingImport?.documentId) || null;
  if (!document) throw new Error(`External source ${packageValue.externalSourceKey} cannot update because its local Workspace is missing.`);
  const baselineFingerprints = existingImport?.baselineEntityFingerprints || (existingImport?.baselinePackage ? buildTextExternalPackageEntityFingerprints(existingImport.baselinePackage) : { workspace: null, cards: {}, segments: {}, speakers: {}, legacyEntries: {} });
  const incomingFingerprints = buildTextExternalPackageEntityFingerprints(packageValue);
  const localState = buildTextExternalLocalEntityFingerprints({ localSnapshot: snapshot, documentId: document.id });
  const localFingerprints = localState?.fingerprints || { workspace: null, cards: {}, segments: {}, speakers: {}, legacyEntries: {} };
  const state = { counters: normalizeTextIdCounters(snapshot.counters) };
  const conflicts = [];
  const changedSegmentIds = new Set();
  const removedSegmentIds = new Set();
  const stats = { created: 0, updated: 0, deleted: 0, preservedLocal: 0, conflicts: 0 };

  const workspaceDecision = revisionDecision({ baseline: baselineFingerprints.workspace, local: localFingerprints.workspace, incoming: incomingFingerprints.workspace, conflictPolicy });
  if (workspaceDecision.conflict) conflicts.push({ kind: 'workspace', key: packageValue.workspace.workspaceKey });
  let nextDocument = document;
  if (workspaceDecision.action === 'incoming') {
    const ws = packageValue.workspace;
    nextDocument = {
      ...document,
      title: ws.title,
      documentType: ws.workspaceType === 'paragraph' ? 'paragraph' : ws.workspaceType === 'conversation' ? (ws.conversationMode === 'mix' ? 'mixed' : 'conversation') : 'mixed',
      editorModel: ws.workspaceType === 'legacy' ? TEXT_LEGACY_EDITOR_MODEL : TEXT_STRUCTURED_EDITOR_MODEL,
      textLanguage: ws.textLanguage,
      meaningLanguage: ws.meaningLanguage,
      updatedAt: now
    };
    stats.updated += 1;
  } else if (workspaceDecision.classification === 'local-only-change' || workspaceDecision.conflict) stats.preservedLocal += 1;

  const oldRegistry = document.metadata?.[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY] || [];
  const speakerPlan = buildIncomingSpeakerMap({ packageValue, existingRegistry: oldRegistry, conflictPolicy, baselineFingerprints, localFingerprints, incomingFingerprints });
  speakerPlan.decisions.filter(item => item.conflict).forEach(item => conflicts.push({ kind: 'speakers', key: item.key }));
  const speakerByExternal = new Map(speakerPlan.registry.filter(item => clean(item?.externalKey)).map(item => [clean(item.externalKey), item]));
  nextDocument = {
    ...nextDocument,
    metadata: {
      ...(nextDocument.metadata || {}),
      ...(speakerPlan.registry.length ? { [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: speakerPlan.registry } : {}),
      [TEXT_EXTERNAL_SOURCE_METADATA_KEY]: {
        ...(nextDocument.metadata?.[TEXT_EXTERNAL_SOURCE_METADATA_KEY] || {}),
        externalSourceKey: packageValue.externalSourceKey,
        workspaceKey: packageValue.workspace.workspaceKey,
        packageType: packageValue.packageType,
        packageVersion: packageValue.packageVersion,
        source: clone(packageValue.source),
        collectionHint: packageValue.collectionHint ? clone(packageValue.collectionHint) : null,
        importedAt: nextDocument.metadata?.[TEXT_EXTERNAL_SOURCE_METADATA_KEY]?.importedAt || existingImport?.importedAt || now,
        lastImportedAt: now,
        sourceFileName: fileName || existingImport?.fileName || null
      }
    }
  };

  const localBlocks = snapshot.blocks.filter(item => item.documentId === document.id).sort(byOrder);
  const localSegments = snapshot.segments.filter(item => item.documentId === document.id).sort(byOrder);
  const nextBlocks = snapshot.blocks.filter(item => item.documentId !== document.id);
  const nextSegments = snapshot.segments.filter(item => item.documentId !== document.id);

  if (packageValue.workspace.workspaceType === 'legacy') {
    const localByEntry = new Map();
    localBlocks.forEach(block => {
      const segment = localSegments.find(item => item.blockId === block.id) || null;
      const key = clean(externalMeta(block)?.entryKey || externalMeta(segment)?.entryKey);
      if (key) localByEntry.set(key, { block, segment });
    });
    for (const entry of packageValue.workspace.entries) {
      const current = localByEntry.get(entry.entryKey) || null;
      if (!current) {
        const blockId = allocateLocalId(state, 'BLOCK');
        const segmentId = allocateLocalId(state, 'SEGMENT');
        const meta = sourceEntityMeta({ packageValue, entryKey: entry.entryKey });
        nextBlocks.push(createTextBlockRecord({ id: blockId, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD), documentId: document.id, order: entry.order, blockType: 'paragraph', createdAt: now, updatedAt: now, metadata: { [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: meta } }));
        nextSegments.push(createTextSegmentRecord({ id: segmentId, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT), documentId: document.id, blockId, order: 1, text: entry.text, meaning: entry.meaning, createdAt: now, updatedAt: now, metadata: { [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: meta } }));
        changedSegmentIds.add(segmentId); stats.created += 2;
        continue;
      }
      const decision = revisionDecision({ baseline: baselineFingerprints.legacyEntries?.[entry.entryKey], local: localFingerprints.legacyEntries?.[entry.entryKey], incoming: incomingFingerprints.legacyEntries?.[entry.entryKey], conflictPolicy });
      if (decision.conflict) { conflicts.push({ kind: 'legacyEntries', key: entry.entryKey }); stats.conflicts += 1; }
      if (decision.action === 'incoming') {
        nextBlocks.push({ ...current.block, order: entry.order, updatedAt: now });
        nextSegments.push({ ...current.segment, text: entry.text, meaning: entry.meaning, updatedAt: now });
        changedSegmentIds.add(current.segment.id); stats.updated += 1;
      } else {
        nextBlocks.push(current.block); nextSegments.push(current.segment); stats.preservedLocal += 1;
      }
      localByEntry.delete(entry.entryKey);
    }
    localByEntry.forEach(({ block, segment }, key) => {
      const decision = revisionDecision({ baseline: baselineFingerprints.legacyEntries?.[key], local: localFingerprints.legacyEntries?.[key], incoming: null, conflictPolicy });
      if (decision.conflict) { conflicts.push({ kind: 'legacyEntries', key }); stats.conflicts += 1; }
      if (decision.action === 'local') {
        nextBlocks.push(withoutExternalMeta(block));
        nextSegments.push(withoutExternalMeta(segment));
        stats.preservedLocal += 1;
      } else {
        removedSegmentIds.add(segment.id); stats.deleted += 2;
      }
    });
  } else {
    const localByCard = new Map(localBlocks.map(block => [clean(externalMeta(block)?.cardKey), block]).filter(([key]) => key));
    const localSegmentsByKey = new Map(localSegments.map(segment => [clean(externalMeta(segment)?.segmentKey), segment]).filter(([key]) => key));
    for (const card of packageValue.workspace.cards) {
      let block = localByCard.get(card.cardKey) || null;
      const cardDecision = block ? revisionDecision({ baseline: baselineFingerprints.cards?.[card.cardKey], local: localFingerprints.cards?.[card.cardKey], incoming: incomingFingerprints.cards?.[card.cardKey], conflictPolicy }) : { action: 'incoming', classification: 'incoming-add', conflict: false };
      if (cardDecision.conflict) { conflicts.push({ kind: 'cards', key: card.cardKey }); stats.conflicts += 1; }
      if (!block) {
        const id = allocateLocalId(state, 'BLOCK');
        block = createTextBlockRecord({ id, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.CARD), documentId: document.id, order: card.order, blockType: card.type, title: card.title, createdAt: now, updatedAt: now, metadata: { ...(card.type === 'paragraph' ? { [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: card.role } : {}), [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: sourceEntityMeta({ packageValue, cardKey: card.cardKey }) } });
        stats.created += 1;
      } else if (cardDecision.action === 'incoming') {
        block = {
          ...block,
          order: card.order,
          blockType: card.type,
          title: card.title || null,
          updatedAt: now,
          metadata: {
            ...(block.metadata || {}),
            ...(card.type === 'paragraph' ? { [TEXT_PARAGRAPH_ROLE_METADATA_KEY]: normalizeTextParagraphCardRole(card.role) } : {}),
            [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: sourceEntityMeta({ packageValue, cardKey: card.cardKey })
          }
        };
        stats.updated += 1;
      } else stats.preservedLocal += 1;
      nextBlocks.push(block);
      localByCard.delete(card.cardKey);

      for (const incomingSegment of card.segments) {
        let segment = localSegmentsByKey.get(incomingSegment.segmentKey) || null;
        const segDecision = segment ? revisionDecision({ baseline: baselineFingerprints.segments?.[incomingSegment.segmentKey], local: localFingerprints.segments?.[incomingSegment.segmentKey], incoming: incomingFingerprints.segments?.[incomingSegment.segmentKey], conflictPolicy }) : { action: 'incoming', classification: 'incoming-add', conflict: false };
        if (segDecision.conflict) { conflicts.push({ kind: 'segments', key: incomingSegment.segmentKey }); stats.conflicts += 1; }
        const speakerEntry = incomingSegment.speakerKey ? speakerByExternal.get(incomingSegment.speakerKey) || null : null;
        if (!segment) {
          const id = allocateLocalId(state, 'SEGMENT');
          segment = createTextSegmentRecord({ id, uid: createTextGlobalUid(TEXT_GLOBAL_UID_KINDS.SEGMENT), documentId: document.id, blockId: block.id, order: incomingSegment.order, text: incomingSegment.text, meaning: incomingSegment.meaning, speaker: speakerEntry?.label || null, createdAt: now, updatedAt: now, metadata: { ...(speakerEntry ? { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: speakerEntry.id } : {}), [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: sourceEntityMeta({ packageValue, cardKey: card.cardKey, segmentKey: incomingSegment.segmentKey, speakerKey: incomingSegment.speakerKey || null }) } });
          changedSegmentIds.add(id); stats.created += 1;
        } else if (segDecision.action === 'incoming') {
          segment = {
            ...segment,
            blockId: block.id,
            order: incomingSegment.order,
            text: incomingSegment.text,
            meaning: incomingSegment.meaning,
            speaker: speakerEntry?.label || null,
            updatedAt: now,
            metadata: {
              ...(segment.metadata || {}),
              ...(speakerEntry ? { [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: speakerEntry.id } : {}),
              [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: sourceEntityMeta({ packageValue, cardKey: card.cardKey, segmentKey: incomingSegment.segmentKey, speakerKey: incomingSegment.speakerKey || null })
            }
          };
          changedSegmentIds.add(segment.id); stats.updated += 1;
        } else stats.preservedLocal += 1;
        nextSegments.push(segment);
        localSegmentsByKey.delete(incomingSegment.segmentKey);
      }
    }
    // Cards removed from incoming: keep only when locally changed/conflicted; otherwise delete Card + descendants.
    localByCard.forEach((block, cardKey) => {
      const decision = revisionDecision({ baseline: baselineFingerprints.cards?.[cardKey], local: localFingerprints.cards?.[cardKey], incoming: null, conflictPolicy });
      const childSegments = localSegments.filter(segment => segment.blockId === block.id);
      const hasChangedChild = childSegments.some(segment => {
        const key = clean(externalMeta(segment)?.segmentKey);
        if (!key) return true;
        const d = revisionDecision({ baseline: baselineFingerprints.segments?.[key], local: localFingerprints.segments?.[key], incoming: null, conflictPolicy });
        return d.action === 'local';
      });
      if (decision.conflict) { conflicts.push({ kind: 'cards', key: cardKey }); stats.conflicts += 1; }
      if (decision.action === 'local' || hasChangedChild) {
        nextBlocks.push(withoutExternalMeta(block));
        childSegments.forEach(segment => { nextSegments.push(withoutExternalMeta(segment)); localSegmentsByKey.delete(clean(externalMeta(segment)?.segmentKey)); });
        stats.preservedLocal += 1 + childSegments.length;
      } else {
        childSegments.forEach(segment => { removedSegmentIds.add(segment.id); localSegmentsByKey.delete(clean(externalMeta(segment)?.segmentKey)); });
        stats.deleted += 1 + childSegments.length;
      }
    });
    // Segments that remain unmatched inside retained Cards are deletion candidates.
    localSegmentsByKey.forEach((segment, key) => {
      if (nextSegments.some(item => item.id === segment.id)) return;
      const decision = revisionDecision({ baseline: baselineFingerprints.segments?.[key], local: localFingerprints.segments?.[key], incoming: null, conflictPolicy });
      if (decision.conflict) { conflicts.push({ kind: 'segments', key }); stats.conflicts += 1; }
      if (decision.action === 'local') {
        nextSegments.push(withoutExternalMeta(segment)); stats.preservedLocal += 1;
      } else { removedSegmentIds.add(segment.id); stats.deleted += 1; }
    });
  }

  let nextAudioVariants = snapshot.audioVariants.filter(variant => !removedSegmentIds.has(variant.segmentId));
  nextAudioVariants = invalidateVariantsForSegments(nextAudioVariants, changedSegmentIds, 'external-json-reconcile', now);
  const nextSnapshot = normalizeTextLibraryRuntimeSnapshot({
    ...snapshot,
    counters: state.counters,
    activeDocumentId: document.id,
    documents: snapshot.documents.map(item => item.id === document.id ? nextDocument : item),
    blocks: nextBlocks,
    segments: nextSegments,
    audioVariants: nextAudioVariants
  });
  const nextImportRecord = {
    ...existingImport,
    externalSourceKey: packageValue.externalSourceKey,
    workspaceKey: packageValue.workspace.workspaceKey,
    documentId: document.id,
    documentUid: document.uid || existingImport?.documentUid || null,
    collectionId: nextDocument.collectionId || null,
    fileName: fileName || existingImport?.fileName || null,
    lastImportedAt: now,
    source: clone(packageValue.source),
    collectionHint: packageValue.collectionHint ? clone(packageValue.collectionHint) : null,
    dataFingerprint: buildTextExternalPackageDataFingerprint(packageValue),
    baselineEntityFingerprints: incomingFingerprints,
    baselinePackage: clone(packageValue),
    revision: Math.max(1, Number(existingImport?.revision) || 1) + 1,
    history: [...(Array.isArray(existingImport?.history) ? existingImport.history : []), {
      revision: Math.max(1, Number(existingImport?.revision) || 1),
      dataFingerprint: existingImport?.dataFingerprint || null,
      importedAt: existingImport?.lastImportedAt || existingImport?.importedAt || null
    }].slice(-20)
  };
  return { snapshot: nextSnapshot, importRecord: nextImportRecord, stats, conflicts, changedSegmentIds: [...changedSegmentIds], removedSegmentIds: [...removedSegmentIds] };
};
