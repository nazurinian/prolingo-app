import { buildTextStructuredFullRepresentation, getTextStructuredFullAudioArtifacts } from './textStructuredSplitFullDomain.js';
import { resolveTextStructuredEffectivePlaybackOrder } from './textStructuredAudioPlaybackOrderDomain.js';
import { isTextStructuredAudioVariantContentCompatible } from './textStructuredAudioIdentityDomain.js';

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const upper = value => clean(value).toUpperCase();

export const TEXT_STRUCTURED_BULK_EXPORT_FORMATS = Object.freeze({
  AUDIO_ONLY_DIRECT: 'audio-only-direct',
  AUDIO_ONLY_ZIP: 'audio-only-zip',
  PORTABLE_ZIP: 'portable-zip'
});

export const TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES = Object.freeze({
  PREFERRED: 'preferred',
  SELECTED: 'selected',
  ALL_SELECTED: 'all-selected'
});

export const TEXT_STRUCTURED_BULK_EXPORT_REPRESENTATIONS = Object.freeze({
  SPLIT: 'split',
  FULL: 'full',
  BOTH: 'both'
});

const scopeByDocument = selection => new Map((selection?.documents || []).map(document => [upper(document?.id), new Set(document?.scope?.blockIds || [])]));
const isParagraph = block => lower(block?.blockType || 'paragraph') === 'paragraph';
const normalizeVoiceList = candidate => [...new Set((Array.isArray(candidate) ? candidate : []).map(clean).filter(Boolean))];

const resolveStagingPhysicalIdentity = record => {
  const full = lower(record?.metadata?.fullArtifactFingerprint);
  if (full.startsWith('full-sha256-')) return { representation: 'full', identity: full };
  const split = lower(record?.metadata?.renderFingerprint || record?.mapKey);
  if (split.startsWith('rf-sha256-')) return { representation: 'split', identity: split };
  return { representation: 'legacy', identity: lower(record?.mapKey || record?.id) || null };
};

const matchesCurrentRenderProfile = ({ descriptor, preferences } = {}) => {
  if (!descriptor || typeof descriptor !== 'object') return true;
  if (lower(descriptor.engine || 'edge') !== 'edge') return false;
  const expectedRate = Number(preferences?.edgeRate ?? 0);
  const expectedPitch = Number(preferences?.edgePitch ?? 0);
  const descriptorRate = Number(descriptor?.rate ?? 0);
  const descriptorPitch = Number(descriptor?.pitch ?? 0);
  return descriptorRate === expectedRate && descriptorPitch === expectedPitch;
};

const activeStagingMap = records => {
  const map = new Map();
  const source = records instanceof Map ? [...records.values()] : (Array.isArray(records) ? records : []);
  source.filter(record => record?.hasBlob !== false).forEach(record => {
    const physical = resolveStagingPhysicalIdentity(record);
    if (physical?.identity && ['split', 'full'].includes(physical.representation)) map.set(lower(physical.identity), record);
  });
  return map;
};

const normalizeRepresentationSelection = preferences => {
  const value = lower(preferences?.bulkExportRepresentation);
  if (value === TEXT_STRUCTURED_BULK_EXPORT_REPRESENTATIONS.FULL) return { split: false, full: true };
  if (value === TEXT_STRUCTURED_BULK_EXPORT_REPRESENTATIONS.BOTH) return { split: true, full: true };
  return { split: true, full: false };
};

const requestedVoiceForChannel = ({ channel, policy, preferences, documentTree, block, globalPlaybackOrder }) => {
  const selected = channel === 'meaning'
    ? clean(preferences?.bulkExportMeaningVoiceId || preferences?.bulkMeaningVoiceIds?.[0] || preferences?.edgeMeaningVoiceId)
    : clean(preferences?.bulkExportTextVoiceId || preferences?.bulkTextVoiceIds?.[0] || preferences?.edgeTextVoiceId);
  if (policy === TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.SELECTED) return selected;
  if (policy !== TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.PREFERRED) return null;
  const fallbackProfiles = selected ? [{ voiceId: selected, engine: 'edge' }] : [];
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree, block, channel, globalProfiles: globalPlaybackOrder?.channels?.[channel] || [], fallbackProfiles });
  return clean(order?.profiles?.[0]?.voiceId) || selected;
};

const isVoiceIncluded = ({ channel, voiceId, policy, preferences, documentTree, block, globalPlaybackOrder }) => {
  const voice = lower(voiceId);
  if (!voice) return false;
  if (policy === TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.ALL_SELECTED) {
    const selected = normalizeVoiceList(channel === 'meaning' ? preferences?.bulkMeaningVoiceIds : preferences?.bulkTextVoiceIds);
    return selected.some(item => lower(item) === voice);
  }
  return lower(requestedVoiceForChannel({ channel, policy, preferences, documentTree, block, globalPlaybackOrder })) === voice;
};

const addPhysicalCandidate = (physicalMap, candidate) => {
  const key = lower(candidate?.physicalKey);
  if (!key || !candidate?.stagingRecord) return;
  const current = physicalMap.get(key);
  if (current) {
    current.references.push(candidate.reference);
    if (!current.documentIds.includes(candidate.documentId)) current.documentIds.push(candidate.documentId);
    if (!current.blockIds.includes(candidate.blockId)) current.blockIds.push(candidate.blockId);
    return;
  }
  physicalMap.set(key, {
    physicalKey: key,
    representation: candidate.representation,
    voiceId: candidate.voiceId,
    channel: candidate.channel,
    stagingRecord: candidate.stagingRecord,
    canonicalFilename: candidate.stagingRecord?.filename || null,
    mimeType: candidate.stagingRecord?.mimeType || null,
    documentIds: [candidate.documentId].filter(Boolean),
    blockIds: [candidate.blockId].filter(Boolean),
    references: [candidate.reference]
  });
};

export const buildTextStructuredBulkExportPlan = ({
  documentTrees = [],
  selection = null,
  preferences = {},
  audioVariants = [],
  stagingRecords = [],
  globalPlaybackOrder = null
} = {}) => {
  const selectedDocumentIds = new Set((selection?.documents || []).map(document => upper(document?.id)).filter(Boolean));
  const blocksByDocument = scopeByDocument(selection);
  const stagingByPhysical = activeStagingMap(stagingRecords);
  const representation = normalizeRepresentationSelection(preferences);
  const policy = Object.values(TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES).includes(preferences?.bulkExportVoicePolicy)
    ? preferences.bulkExportVoicePolicy
    : TEXT_STRUCTURED_BULK_EXPORT_VOICE_POLICIES.ALL_SELECTED;
  const includeText = preferences?.generateText !== false;
  const includeMeaning = preferences?.generateMeaning !== false;
  const variantsBySegment = new Map();
  for (const variant of (Array.isArray(audioVariants) ? audioVariants : [])) {
    const key = upper(variant?.segmentId);
    if (!key) continue;
    const list = variantsBySegment.get(key) || [];
    list.push(variant);
    variantsBySegment.set(key, list);
  }

  const logical = [];
  const physicalMap = new Map();
  let eligibleBlockCount = 0;
  let skippedConversationBlockCount = 0;

  for (const documentTree of (Array.isArray(documentTrees) ? documentTrees : [])) {
    if (!documentTree?.id || !selectedDocumentIds.has(upper(documentTree.id))) continue;
    const blockScope = blocksByDocument.get(upper(documentTree.id)) || new Set((documentTree.blocks || []).map(block => block.id));
    for (const block of (documentTree.blocks || [])) {
      if (!blockScope.has(block.id)) continue;
      if (!isParagraph(block)) { skippedConversationBlockCount += 1; continue; }
      eligibleBlockCount += 1;
      const channels = [];
      if (includeText) channels.push('text');
      if (includeMeaning) channels.push('meaning');

      for (const channel of channels) {
        if (representation.split) {
          for (const segment of (block.segments || [])) {
            const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
            if (!content) continue;
            for (const variant of (variantsBySegment.get(upper(segment.id)) || [])) {
              if (lower(variant?.channel) !== channel) continue;
              if (!isTextStructuredAudioVariantContentCompatible({ variant, channel, content }).compatible) continue;
              const descriptor = variant?.metadata?.audioRenderDescriptorV1 || null;
              if (!matchesCurrentRenderProfile({ descriptor, preferences })) continue;
              const physicalKey = lower(variant?.metadata?.audioRenderFingerprintV1);
              const stagingRecord = stagingByPhysical.get(physicalKey) || null;
              if (!physicalKey || !stagingRecord) continue;
              if (!isVoiceIncluded({ channel, voiceId: variant?.voiceId, policy, preferences, documentTree, block, globalPlaybackOrder })) continue;
              const reference = {
                scope: 'bulk-audio',
                collectionId: documentTree.collectionId || null,
                documentId: documentTree.id,
                documentUid: documentTree.uid || null,
                documentTitle: documentTree.title || 'Text Workspace',
                cardId: block.id,
                cardUid: block.uid || null,
                cardTitle: block.title || null,
                segmentId: segment.id,
                segmentUid: segment.uid || null,
                channel,
                voiceId: variant.voiceId,
                audioVariantId: variant.id,
                representation: 'split',
                status: 'ready'
              };
              const item = { representation: 'split', physicalKey, stagingRecord, documentId: documentTree.id, blockId: block.id, segmentId: segment.id, channel, voiceId: variant.voiceId, reference };
              logical.push(item);
              addPhysicalCandidate(physicalMap, item);
            }
          }
        }

        if (representation.full) {
          const currentFull = buildTextStructuredFullRepresentation({ block, channel });
          for (const artifact of getTextStructuredFullAudioArtifacts(block)) {
            if (lower(artifact?.descriptor?.channel) !== channel) continue;
            if (clean(artifact?.descriptor?.contentFingerprint) !== clean(currentFull?.contentFingerprint)) continue;
            if (!matchesCurrentRenderProfile({ descriptor: artifact?.descriptor, preferences })) continue;
            const physicalKey = lower(artifact?.fullArtifactFingerprint);
            const stagingRecord = stagingByPhysical.get(physicalKey) || null;
            if (!physicalKey || !stagingRecord) continue;
            const voiceId = artifact?.descriptor?.voiceId;
            if (!isVoiceIncluded({ channel, voiceId, policy, preferences, documentTree, block, globalPlaybackOrder })) continue;
            const reference = {
              scope: 'bulk-audio',
              collectionId: documentTree.collectionId || null,
              documentId: documentTree.id,
              documentUid: documentTree.uid || null,
              documentTitle: documentTree.title || 'Text Workspace',
              cardId: block.id,
              cardUid: block.uid || null,
              cardTitle: block.title || null,
              segmentId: null,
              channel,
              voiceId,
              representation: 'full',
              status: 'ready'
            };
            const item = { representation: 'full', physicalKey, stagingRecord, documentId: documentTree.id, blockId: block.id, segmentId: null, channel, voiceId, reference };
            logical.push(item);
            addPhysicalCandidate(physicalMap, item);
          }
        }
      }
    }
  }

  const physical = [...physicalMap.values()];
  return {
    policy,
    representation,
    logical,
    physical,
    coverage: {
      logicalReady: logical.length,
      uniquePhysicalReady: physical.length,
      splitLogical: logical.filter(item => item.representation === 'split').length,
      fullLogical: logical.filter(item => item.representation === 'full').length,
      splitPhysical: physical.filter(item => item.representation === 'split').length,
      fullPhysical: physical.filter(item => item.representation === 'full').length,
      eligibleBlockCount,
      skippedConversationBlockCount,
      voiceCount: new Set(logical.map(item => lower(item.voiceId)).filter(Boolean)).size
    }
  };
};
