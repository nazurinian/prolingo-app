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
  const localDocExists = Array.isArray(localSnapshot?.documents)
    && localSnapshot.documents.some(item => item?.id === existingImport?.documentId);
  if (!localDocExists) {
    return {
      status: 'missing-local-workspace',
      externalSourceKey: packageValue.externalSourceKey,
      dataFingerprint: incomingDataFingerprint,
      existingImport,
      conflicts: [],
      summary: { added: 0, updated: 0, removed: 0, conflicts: 0 }
    };
  }
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

const detachExternalSpeaker = entry => {
  const { externalKey: _detached, ...detached } = entry;
  return detached;
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
      const detached = detachExternalSpeaker(entry);
      next.push(detached);
      decisions.push({ key, speakerId: entry.id, action: 'detach-local', conflict: decision.conflict, entry: detached });
    } else decisions.push({ key, speakerId: entry.id, action: 'remove', conflict: decision.conflict, entry });
  });
  // Preserve user-added or detached local-only speakers lacking externalKey.
  const seenIds = new Set(next.map(item => item.id));
  (existingRegistry || []).forEach(entry => {
    if (!entry?.id || clean(entry?.externalKey) || seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    next.push(entry);
    decisions.push({ key: null, speakerId: entry.id, action: 'preserve-local', conflict: false, entry });
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
  speakerPlan.decisions.filter(item => item.conflict).forEach(item => {
    conflicts.push({ kind: 'speakers', key: item.key });
    stats.conflicts += 1;
  });
  speakerPlan.decisions.forEach(item => {
    if (item.action === 'preserve-local' || item.action === 'detach-local' || (item.action === 'keep' && item.conflict)) {
      stats.preservedLocal += 1;
    } else if (item.action === 'add') {
      stats.created += 1;
    } else if (item.action === 'update') {
      stats.updated += 1;
    } else if (item.action === 'remove') {
      stats.deleted += 1;
    }
  });
  const speakerByExternal = new Map(speakerPlan.registry.filter(item => clean(item?.externalKey)).map(item => [clean(item.externalKey), item]));
  const nextDocumentMetadata = {
    ...(nextDocument.metadata || {}),
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
  };
  if (speakerPlan.registry.length) nextDocumentMetadata[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY] = speakerPlan.registry;
  else delete nextDocumentMetadata[TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY];
  nextDocument = {
    ...nextDocument,
    metadata: nextDocumentMetadata
  };

  const localBlocks = snapshot.blocks.filter(item => item.documentId === document.id).sort(byOrder);
  const localSegments = snapshot.segments.filter(item => item.documentId === document.id).sort(byOrder);
  const nextBlocks = snapshot.blocks.filter(item => item.documentId !== document.id);
  const nextSegments = snapshot.segments.filter(item => item.documentId !== document.id);

  const localSegmentsByBlock = new Map();
  localSegments.forEach(segment => {
    const list = localSegmentsByBlock.get(segment.blockId) || [];
    list.push(segment);
    localSegmentsByBlock.set(segment.blockId, list);
  });

  if (packageValue.workspace.workspaceType === 'legacy') {
    const localByEntry = new Map();
    const localOnlyBlocks = [];
    localBlocks.forEach(block => {
      const blockSegs = localSegmentsByBlock.get(block.id) || [];
      const segment = blockSegs[0] || null;
      const key = clean(externalMeta(block)?.entryKey || externalMeta(segment)?.entryKey);
      if (key) localByEntry.set(key, { block, segment, extraSegments: blockSegs.slice(1) });
      else localOnlyBlocks.push({ block, segments: blockSegs });
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
        if (current.segment) {
          nextSegments.push({ ...current.segment, text: entry.text, meaning: entry.meaning, updatedAt: now });
          changedSegmentIds.add(current.segment.id);
        }
        stats.updated += 1;
      } else {
        nextBlocks.push(current.block);
        if (current.segment) nextSegments.push(current.segment);
        stats.preservedLocal += 1;
      }
      current.extraSegments.forEach(extra => {
        nextSegments.push(extra);
        stats.preservedLocal += 1;
      });
      localByEntry.delete(entry.entryKey);
    }
    localByEntry.forEach(({ block, segment, extraSegments }, key) => {
      const decision = revisionDecision({ baseline: baselineFingerprints.legacyEntries?.[key], local: localFingerprints.legacyEntries?.[key], incoming: null, conflictPolicy });
      if (decision.conflict) { conflicts.push({ kind: 'legacyEntries', key }); stats.conflicts += 1; }
      if (decision.action === 'local') {
        nextBlocks.push(withoutExternalMeta(block));
        if (segment) nextSegments.push(withoutExternalMeta(segment));
        extraSegments.forEach(extra => nextSegments.push(extra));
        stats.preservedLocal += 1 + extraSegments.length;
      } else if (extraSegments.length) {
        nextBlocks.push(withoutExternalMeta(block));
        if (segment) { removedSegmentIds.add(segment.id); stats.deleted += 1; }
        extraSegments.forEach(extra => { nextSegments.push(extra); stats.preservedLocal += 1; });
      } else {
        if (segment) removedSegmentIds.add(segment.id);
        stats.deleted += segment ? 2 : 1;
      }
    });
    localOnlyBlocks.forEach(({ block, segments }) => {
      nextBlocks.push(block);
      segments.forEach(segment => nextSegments.push(segment));
      stats.preservedLocal += 1 + segments.length;
    });
  } else {
    const localByCard = new Map(localBlocks.map(block => [clean(externalMeta(block)?.cardKey), block]).filter(([key]) => key));
    const localOnlyBlocks = localBlocks.filter(block => !clean(externalMeta(block)?.cardKey));
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
          const nextSegMeta = {
            ...(segment.metadata || {}),
            [TEXT_EXTERNAL_ENTITY_METADATA_KEY]: sourceEntityMeta({ packageValue, cardKey: card.cardKey, segmentKey: incomingSegment.segmentKey, speakerKey: incomingSegment.speakerKey || null })
          };
          if (speakerEntry) nextSegMeta[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY] = speakerEntry.id;
          else delete nextSegMeta[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY];
          segment = {
            ...segment,
            blockId: block.id,
            order: incomingSegment.order,
            text: incomingSegment.text,
            meaning: incomingSegment.meaning,
            speaker: speakerEntry?.label || null,
            updatedAt: now,
            metadata: nextSegMeta
          };
          changedSegmentIds.add(segment.id); stats.updated += 1;
        } else stats.preservedLocal += 1;
        nextSegments.push(segment);
        localSegmentsByKey.delete(incomingSegment.segmentKey);
      }
      // Preserve user-added local-only Segments belonging to this retained external Card.
      (localSegmentsByBlock.get(block.id) || []).forEach(localSegment => {
        if (clean(externalMeta(localSegment)?.segmentKey)) return;
        nextSegments.push(localSegment);
        stats.preservedLocal += 1;
      });
    }
    // Preserve user-added local-only Cards and all of their child Segments.
    localOnlyBlocks.forEach(localBlock => {
      nextBlocks.push(localBlock);
      const childSegments = localSegmentsByBlock.get(localBlock.id) || [];
      childSegments.forEach(segment => {
        const key = clean(externalMeta(segment)?.segmentKey);
        if (key) localSegmentsByKey.delete(key);
        nextSegments.push(segment);
      });
      stats.preservedLocal += 1 + childSegments.length;
    });
    // Cards removed from incoming: keep only when locally changed/conflicted or holding preserved children.
    localByCard.forEach((block, cardKey) => {
      const decision = revisionDecision({ baseline: baselineFingerprints.cards?.[cardKey], local: localFingerprints.cards?.[cardKey], incoming: null, conflictPolicy });
      const childSegments = localSegmentsByBlock.get(block.id) || [];
      const childPlans = childSegments.map(segment => {
        const key = clean(externalMeta(segment)?.segmentKey);
        if (!key) return { segment, key: null, keep: true, localOnly: true, conflict: false };
        const d = revisionDecision({ baseline: baselineFingerprints.segments?.[key], local: localFingerprints.segments?.[key], incoming: null, conflictPolicy });
        return { segment, key, keep: d.action === 'local', localOnly: false, conflict: d.conflict };
      });
      const hasKeptChild = childPlans.some(item => item.keep);
      if (decision.conflict) { conflicts.push({ kind: 'cards', key: cardKey }); stats.conflicts += 1; }
      childPlans.filter(item => item.conflict).forEach(item => { conflicts.push({ kind: 'segments', key: item.key }); stats.conflicts += 1; });
      if (decision.action === 'local' || hasKeptChild) {
        nextBlocks.push(withoutExternalMeta(block));
        stats.preservedLocal += 1;
        childPlans.forEach(({ segment, key, keep, localOnly }) => {
          if (key) localSegmentsByKey.delete(key);
          if (localOnly || keep || decision.action === 'local') {
            nextSegments.push(localOnly ? segment : withoutExternalMeta(segment));
            stats.preservedLocal += 1;
          } else {
            removedSegmentIds.add(segment.id);
            stats.deleted += 1;
          }
        });
      } else {
        childPlans.forEach(({ segment, key }) => {
          if (key) localSegmentsByKey.delete(key);
          removedSegmentIds.add(segment.id);
        });
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

  // Synchronize incoming speaker display-name renames onto all retained/preserved workspace segments.
  const updatedSpeakersById = new Map();
  const updatedSpeakersByExternalKey = new Map();
  speakerPlan.decisions.forEach(item => {
    if (item.action !== 'update' || !item.entry?.id || !clean(item.entry?.label)) return;
    updatedSpeakersById.set(item.entry.id, item.entry);
    if (clean(item.entry?.externalKey)) {
      updatedSpeakersByExternalKey.set(clean(item.entry.externalKey), item.entry);
    }
  });
  const syncedSegments = updatedSpeakersById.size
    ? nextSegments.map(segment => {
      if (segment.documentId !== document.id) return segment;
      const speakerId = clean(segment?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]);
      const matchedById = speakerId ? updatedSpeakersById.get(speakerId) || null : null;
      const matchedSpeaker = matchedById || (!speakerId ? updatedSpeakersByExternalKey.get(clean(externalMeta(segment)?.speakerKey)) || null : null);
      if (!matchedSpeaker) return segment;
      const targetLabel = clean(matchedSpeaker.label);
      const nextSpeakerMeta = speakerId
        ? segment.metadata
        : { ...(segment.metadata || {}), [TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]: matchedSpeaker.id };
      if (clean(segment.speaker) === targetLabel && nextSpeakerMeta === segment.metadata) return segment;
      return {
        ...segment,
        speaker: targetLabel,
        updatedAt: now,
        metadata: nextSpeakerMeta
      };
    })
    : nextSegments;

  // Preserve & detach externally removed speakers still referenced by surviving workspace segments.
  const survivingSpeakerIds = new Set(
    syncedSegments
      .filter(segment => segment.documentId === document.id)
      .map(segment => clean(segment?.metadata?.[TEXT_STRUCTURED_SPEAKER_ID_METADATA_KEY]))
      .filter(Boolean)
  );
  const seenRegistryIds = new Set(speakerPlan.registry.map(item => item.id));
  const rescuedSpeakers = [];
  speakerPlan.decisions.forEach(item => {
    if (item.action !== 'remove' || !item.entry?.id || seenRegistryIds.has(item.entry.id)) return;
    if (!survivingSpeakerIds.has(item.entry.id)) return;
    seenRegistryIds.add(item.entry.id);
    rescuedSpeakers.push(detachExternalSpeaker(item.entry));
    stats.deleted = Math.max(0, stats.deleted - 1);
    stats.preservedLocal += 1;
  });
  if (rescuedSpeakers.length) {
    nextDocument = {
      ...nextDocument,
      metadata: {
        ...(nextDocument.metadata || {}),
        [TEXT_STRUCTURED_SPEAKER_REGISTRY_METADATA_KEY]: [...speakerPlan.registry, ...rescuedSpeakers]
      }
    };
  }

  let nextAudioVariants = snapshot.audioVariants.filter(variant => !removedSegmentIds.has(variant.segmentId));
  nextAudioVariants = invalidateVariantsForSegments(nextAudioVariants, changedSegmentIds, 'external-json-reconcile', now);
  const nextSnapshot = normalizeTextLibraryRuntimeSnapshot({
    ...snapshot,
    counters: state.counters,
    activeDocumentId: document.id,
    documents: snapshot.documents.map(item => item.id === document.id ? nextDocument : item),
    blocks: nextBlocks,
    segments: syncedSegments,
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
