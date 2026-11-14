import { initialEdgeVoices, isEdgeVoiceUnavailable } from '../../constants/voiceConstants.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredAudioRenderFingerprint, TEXT_AUDIO_CODEC_PROFILE, TEXT_AUDIO_RENDERER_PROFILE_VERSION } from './textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredFullArtifactIdentity, buildTextStructuredFullRepresentation, getTextStructuredFullAudioArtifacts } from './textStructuredSplitFullDomain.js';

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const upper = value => clean(value).toUpperCase();

export const TEXT_STRUCTURED_BULK_REPRESENTATIONS = Object.freeze({
  SPLIT: 'split',
  FULL: 'full'
});

export const TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS = Object.freeze({
  READY: 'ready',
  REUSABLE: 'reusable-physical',
  STALE: 'stale',
  MISSING: 'missing'
});

export const TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES = Object.freeze({
  SINGLE: 'single',
  MULTIPLE: 'multiple'
});

const uniqueVoiceIds = (candidate, fallback = null, allowEmpty = false) => {
  const list = (Array.isArray(candidate) ? candidate : []).map(clean).filter(Boolean);
  if (allowEmpty) return [...new Set(list)];
  return [...new Set((list.length ? list : [fallback]).filter(Boolean))];
};

export const applyTextStructuredBulkVoiceSelectionChange = ({
  currentVoiceIds = [],
  targetVoiceId = '',
  mode = TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.MULTIPLE
} = {}) => {
  const normalizedTarget = clean(targetVoiceId);
  const current = uniqueVoiceIds(currentVoiceIds, null, true);
  if (!normalizedTarget) return current;
  if (mode === TEXT_STRUCTURED_BULK_VOICE_SELECTION_MODES.SINGLE) {
    return [normalizedTarget];
  }
  const exists = current.includes(normalizedTarget);
  return exists
    ? current.filter(id => id !== normalizedTarget)
    : [...current, normalizedTarget];
};

export const validateTextStructuredBulkVoiceDraft = ({
  includeText = true,
  includeMeaning = true,
  textVoiceIds = [],
  meaningVoiceIds = [],
  edgeVoices = initialEdgeVoices
} = {}) => {
  const textChannelEnabled = Boolean(includeText);
  const meaningChannelEnabled = Boolean(includeMeaning);
  const textVoices = uniqueVoiceIds(textVoiceIds, null, true);
  const meaningVoices = uniqueVoiceIds(meaningVoiceIds, null, true);
  const unavailableTextVoices = textChannelEnabled
    ? textVoices.filter(voiceId => isEdgeVoiceUnavailable(voiceId, edgeVoices))
    : [];
  const unavailableMeaningVoices = meaningChannelEnabled
    ? meaningVoices.filter(voiceId => isEdgeVoiceUnavailable(voiceId, edgeVoices))
    : [];
  const textEmptyWarning = textChannelEnabled && textVoices.length === 0
    ? 'EN (Text) channel is enabled with 0 voices selected. Select at least one EN voice or disable EN (Text) to generate.'
    : null;
  const meaningEmptyWarning = meaningChannelEnabled && meaningVoices.length === 0
    ? 'ID (Meaning) channel is enabled with 0 voices selected. Select at least one ID voice or disable ID (Meaning) to generate.'
    : null;
  const unavailableTextWarning = unavailableTextVoices.length
    ? `Unavailable EN voice${unavailableTextVoices.length > 1 ? 's' : ''} selected (${unavailableTextVoices.join(', ')}). Remove or switch before generating (no silent substitution).`
    : null;
  const unavailableMeaningWarning = unavailableMeaningVoices.length
    ? `Unavailable ID voice${unavailableMeaningVoices.length > 1 ? 's' : ''} selected (${unavailableMeaningVoices.join(', ')}). Remove or switch before generating (no silent substitution).`
    : null;
  const noChannelsEnabled = !textChannelEnabled && !meaningChannelEnabled;
  const hasInvalidEnabledChannel = Boolean(textEmptyWarning || meaningEmptyWarning);
  const hasUnavailableVoice = unavailableTextVoices.length > 0 || unavailableMeaningVoices.length > 0;
  const warnings = [
    textEmptyWarning,
    meaningEmptyWarning,
    unavailableTextWarning,
    unavailableMeaningWarning
  ].filter(Boolean);
  return {
    textChannelEnabled,
    meaningChannelEnabled,
    textVoices,
    meaningVoices,
    unavailableTextVoices,
    unavailableMeaningVoices,
    textEmptyWarning,
    meaningEmptyWarning,
    unavailableTextWarning,
    unavailableMeaningWarning,
    noChannelsEnabled,
    hasInvalidEnabledChannel,
    hasUnavailableVoice,
    canGenerate: !noChannelsEnabled && !hasInvalidEnabledChannel && !hasUnavailableVoice,
    warnings
  };
};

export const validateTextStructuredBulkRequirementsVoices = ({
  requirements = [],
  edgeVoices = initialEdgeVoices
} = {}) => {
  const unavailableTextVoices = [];
  const unavailableMeaningVoices = [];
  const textSet = new Set();
  const meaningSet = new Set();
  (Array.isArray(requirements) ? requirements : []).forEach(req => {
    const voiceId = clean(req?.voiceId || req?.downloadVoiceId);
    if (!voiceId || !isEdgeVoiceUnavailable(voiceId, edgeVoices)) return;
    if (lower(req?.channel) === 'meaning') {
      if (!meaningSet.has(lower(voiceId))) {
        meaningSet.add(lower(voiceId));
        unavailableMeaningVoices.push(voiceId);
      }
      return;
    }
    if (!textSet.has(lower(voiceId))) {
      textSet.add(lower(voiceId));
      unavailableTextVoices.push(voiceId);
    }
  });
  const unavailableVoiceIds = [...new Set([...unavailableTextVoices, ...unavailableMeaningVoices])];
  return {
    unavailableTextVoices,
    unavailableMeaningVoices,
    unavailableVoiceIds,
    hasUnavailableVoice: unavailableVoiceIds.length > 0
  };
};

const activeStagingRecords = candidate => {
  if (candidate instanceof Map) return [...candidate.values()].filter(record => record?.hasBlob !== false);
  return (Array.isArray(candidate) ? candidate : []).filter(record => record?.hasBlob !== false);
};

const stagingPhysicalIdentity = record => {
  const full = lower(record?.metadata?.fullArtifactFingerprint);
  if (full.startsWith('full-sha256-')) return full;
  const split = lower(record?.metadata?.renderFingerprint || record?.mapKey);
  if (split.startsWith('rf-sha256-')) return split;
  return null;
};

const EMPTY_VARIANTS = Object.freeze([]);

const resolveSplitLogicalState = ({ requirement, audioVariants, preindexedCandidates = null, runtimeAudioUrls, stagingPhysical }) => {
  const candidates = Array.isArray(preindexedCandidates)
    ? preindexedCandidates
    : (Array.isArray(audioVariants) ? audioVariants : []).filter(variant =>
        upper(variant?.segmentId) === upper(requirement.segmentId)
        && lower(variant?.channel) === requirement.channel
        && lower(variant?.engine) === 'edge'
        && lower(variant?.voiceId) === lower(requirement.voiceId)
      );
  const exact = candidates.find(variant => lower(variant?.metadata?.audioRenderFingerprintV1) === requirement.physicalKey) || null;
  const runtime = exact ? runtimeAudioUrls?.[exact.id] : null;
  const physicalReady = stagingPhysical.has(requirement.physicalKey)
    || Boolean(runtime?.stagingBacked || runtime?.url || runtime?.zipBacked || runtime?.folderBacked);
  if (exact && physicalReady) return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY, exact, physicalReady: true, logicalReady: true };
  if (physicalReady) return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE, exact, physicalReady: true, logicalReady: false };
  if (candidates.length) return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE, exact, physicalReady: false, logicalReady: false };
  return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING, exact: null, physicalReady: false, logicalReady: false };
};

const resolveFullLogicalState = ({ requirement, block, runtimeFullAudio, stagingPhysical }) => {
  const artifacts = getTextStructuredFullAudioArtifacts(block);
  const exact = artifacts.find(artifact => lower(artifact?.fullArtifactFingerprint) === requirement.physicalKey) || null;
  const runtime = runtimeFullAudio?.[requirement.physicalKey] || runtimeFullAudio?.[exact?.id] || null;
  const physicalReady = stagingPhysical.has(requirement.physicalKey)
    || Boolean(runtime?.stagingBacked || runtime?.url || runtime?.zipBacked || runtime?.folderBacked);
  if (exact && physicalReady) return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY, exact, physicalReady: true, logicalReady: true };
  if (physicalReady) return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE, exact, physicalReady: true, logicalReady: false };
  const stale = artifacts.some(artifact =>
    lower(artifact?.descriptor?.channel) === requirement.channel
    && lower(artifact?.descriptor?.engine) === 'edge'
    && lower(artifact?.descriptor?.voiceId) === lower(requirement.voiceId)
    && lower(artifact?.fullArtifactFingerprint) !== requirement.physicalKey
  );
  if (stale) return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE, exact: null, physicalReady: false, logicalReady: false };
  return { status: TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING, exact: null, physicalReady: false, logicalReady: false };
};

const selectedScopeByDocument = selection => new Map((selection?.documents || []).map(document => [upper(document?.id), new Set(document?.scope?.blockIds || [])]));
const isP5EligibleBlock = block => lower(block?.blockType || 'paragraph') === 'paragraph';

const createFullBlockRequirement = ({
  documentTree,
  block,
  channel,
  language,
  voiceId,
  downloadVoiceSource = 'bulk-selection',
  representation = null,
  preferences = {},
  runtimeFullAudio = {},
  stagingPhysical = new Set()
}) => {
  const resolvedRepresentation = representation || buildTextStructuredFullRepresentation({ block, channel });
  if (!clean(resolvedRepresentation?.content) || !clean(voiceId)) return null;
  const identity = buildTextStructuredFullArtifactIdentity({
    block,
    channel,
    language,
    engine: 'edge',
    voiceId,
    rate: preferences?.edgeRate || 0,
    pitch: preferences?.edgePitch || 0,
    rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
    codecProfile: TEXT_AUDIO_CODEC_PROFILE
  });
  const requirement = {
    representation: TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL,
    documentId: documentTree.id,
    documentTitle: documentTree.title || 'Text Workspace',
    collectionId: documentTree.collectionId || null,
    blockId: block.id,
    blockTitle: block.title || null,
    segmentId: null,
    channel,
    language,
    voiceId,
    downloadVoiceId: voiceId,
    downloadVoiceSource,
    content: resolvedRepresentation.content,
    segmentCount: resolvedRepresentation.segmentCount,
    physicalKey: lower(identity.fullArtifactFingerprint),
    fullArtifactFingerprint: lower(identity.fullArtifactFingerprint),
    fullArtifactDescriptor: identity.descriptor
  };
  return {
    ...requirement,
    ...resolveFullLogicalState({ requirement, block, runtimeFullAudio, stagingPhysical })
  };
};

export const buildTextStructuredBulkGenerationPlan = ({
  documentTrees = [],
  selection = null,
  preferences = {},
  audioVariants = [],
  runtimeAudioUrls = {},
  runtimeFullAudio = {},
  stagingRecords = [],
  allowEmptyVoiceSelection = false
} = {}) => {
  const scopeByDocument = selectedScopeByDocument(selection);
  const selectedDocumentIds = new Set((selection?.documents || []).map(document => upper(document?.id)).filter(Boolean));
  const respectEmptyDraft = Boolean(allowEmptyVoiceSelection || preferences?.allowEmptyVoiceSelection);
  const textVoices = respectEmptyDraft && Array.isArray(preferences?.bulkTextVoiceIds)
    ? uniqueVoiceIds(preferences.bulkTextVoiceIds, null, true)
    : uniqueVoiceIds(preferences?.bulkTextVoiceIds, preferences?.edgeTextVoiceId, false);
  const meaningVoices = respectEmptyDraft && Array.isArray(preferences?.bulkMeaningVoiceIds)
    ? uniqueVoiceIds(preferences.bulkMeaningVoiceIds, null, true)
    : uniqueVoiceIds(preferences?.bulkMeaningVoiceIds, preferences?.edgeMeaningVoiceId, false);
  const includeSplit = preferences?.bulkGenerateSplit !== false;
  const includeFull = preferences?.bulkGenerateFull === true;
  const includeText = preferences?.generateText !== false;
  const includeMeaning = preferences?.generateMeaning !== false;
  const edgeVoices = Array.isArray(preferences?.edgeVoices) && preferences.edgeVoices.length
    ? preferences.edgeVoices
    : initialEdgeVoices;
  const voiceValidation = validateTextStructuredBulkVoiceDraft({
    includeText,
    includeMeaning,
    textVoiceIds: textVoices,
    meaningVoiceIds: meaningVoices,
    edgeVoices
  });
  const stagingPhysical = new Set(activeStagingRecords(stagingRecords).map(stagingPhysicalIdentity).filter(Boolean));
  const variantsBySlotVoice = new Map();
  for (const variant of (Array.isArray(audioVariants) ? audioVariants : [])) {
    if (lower(variant?.engine) !== 'edge') continue;
    const key = `${upper(variant?.segmentId)}|${lower(variant?.channel)}|${lower(variant?.voiceId)}`;
    let bucket = variantsBySlotVoice.get(key);
    if (!bucket) {
      bucket = [];
      variantsBySlotVoice.set(key, bucket);
    }
    bucket.push(variant);
  }
  const requirements = [];

  for (const documentTree of (Array.isArray(documentTrees) ? documentTrees : [])) {
    if (!documentTree?.id || !selectedDocumentIds.has(upper(documentTree.id))) continue;
    const blockScope = scopeByDocument.get(upper(documentTree.id)) || new Set((documentTree.blocks || []).map(block => block.id));
    for (const block of (documentTree.blocks || [])) {
      if (!blockScope.has(block.id)) continue;
      // beta.8 P5 is intentionally Paragraph-first. Conversation adaptation is a later contract.
      if (!isP5EligibleBlock(block)) continue;
      const channels = [];
      if (includeText) channels.push({ channel: 'text', voices: textVoices, language: documentTree?.textLanguage || 'en' });
      if (includeMeaning) channels.push({ channel: 'meaning', voices: meaningVoices, language: documentTree?.meaningLanguage || 'id' });

      for (const { channel, voices, language } of channels) {
        if (includeSplit) {
          for (const segment of (block.segments || [])) {
            const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
            if (!content) continue;
            for (const voiceId of voices) {
              const render = buildTextStructuredAudioRenderFingerprint({
                channel,
                content,
                language,
                engine: 'edge',
                voiceId,
                rate: preferences?.edgeRate || 0,
                pitch: preferences?.edgePitch || 0,
                rendererVersion: TEXT_AUDIO_RENDERER_PROFILE_VERSION,
                codecProfile: TEXT_AUDIO_CODEC_PROFILE
              });
              const requirement = {
                representation: TEXT_STRUCTURED_BULK_REPRESENTATIONS.SPLIT,
                documentId: documentTree.id,
                documentTitle: documentTree.title || 'Text Workspace',
                collectionId: documentTree.collectionId || null,
                blockId: block.id,
                blockTitle: block.title || null,
                segmentId: segment.id,
                channel,
                language,
                voiceId,
                downloadVoiceId: voiceId,
                downloadVoiceSource: 'bulk-selection',
                content,
                physicalKey: lower(render.renderFingerprint),
                renderFingerprint: lower(render.renderFingerprint),
                renderDescriptor: render.descriptor,
                contentFingerprintV2: render.contentFingerprintV2
              };
              const preindexedCandidates = variantsBySlotVoice.get(`${upper(segment.id)}|${channel}|${lower(voiceId)}`) || EMPTY_VARIANTS;
              requirements.push({ ...requirement, ...resolveSplitLogicalState({ requirement, audioVariants, preindexedCandidates, runtimeAudioUrls, stagingPhysical }) });
            }
          }
        }

        if (includeFull) {
          const representation = buildTextStructuredFullRepresentation({ block, channel });
          if (!clean(representation?.content)) continue;
          for (const voiceId of voices) {
            const requirement = createFullBlockRequirement({
              documentTree,
              block,
              channel,
              language,
              voiceId,
              downloadVoiceSource: 'bulk-selection',
              representation,
              preferences,
              runtimeFullAudio,
              stagingPhysical
            });
            if (requirement) requirements.push(requirement);
          }
        }
      }
    }
  }

  const physicalKeys = new Set(requirements.map(item => item.physicalKey).filter(Boolean));
  const readyPhysicalKeys = new Set(requirements.filter(item => item.physicalReady).map(item => item.physicalKey).filter(Boolean));
  const readyLogical = requirements.filter(item => item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY).length;
  const reusableLogical = requirements.filter(item => item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE).length;
  const staleLogical = requirements.filter(item => item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.STALE).length;
  const missingLogical = requirements.filter(item => item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING).length;
  const needGenerateMissing = reusableLogical + missingLogical;
  const needGenerateWithStale = needGenerateMissing + staleLogical;
  const coverage = {
    total: requirements.length,
    covered: readyLogical,
    ready: readyLogical,
    downloaded: 0,
    otherVoice: 0,
    reusable: reusableLogical,
    stale: staleLogical,
    missing: missingLogical,
    needDownload: needGenerateWithStale,
    needGenerate: needGenerateWithStale,
    needGenerateMissing,
    needGenerateWithStale,
    logicalRequirements: requirements.length,
    uniquePhysicalRequirements: physicalKeys.size,
    uniquePhysicalReady: readyPhysicalKeys.size,
    uniquePhysicalMissing: Math.max(0, physicalKeys.size - readyPhysicalKeys.size),
    splitLogical: requirements.filter(item => item.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.SPLIT).length,
    fullLogical: requirements.filter(item => item.representation === TEXT_STRUCTURED_BULK_REPRESENTATIONS.FULL).length,
    eligibleBlockCount: (selection?.documents || []).reduce((sum, document) => {
      const tree = (Array.isArray(documentTrees) ? documentTrees : []).find(item => upper(item?.id) === upper(document?.id));
      const scope = new Set(document?.scope?.blockIds || []);
      return sum + (tree?.blocks || []).filter(block => scope.has(block.id) && isP5EligibleBlock(block)).length;
    }, 0),
    skippedConversationBlockCount: (selection?.documents || []).reduce((sum, document) => {
      const tree = (Array.isArray(documentTrees) ? documentTrees : []).find(item => upper(item?.id) === upper(document?.id));
      const scope = new Set(document?.scope?.blockIds || []);
      return sum + (tree?.blocks || []).filter(block => scope.has(block.id) && !isP5EligibleBlock(block)).length;
    }, 0)
  };

  const missingRequirements = requirements.filter(item =>
    item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING
    || item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE
  );
  const missingAndStaleRequirements = requirements.filter(item =>
    item.status !== TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY
  );
  const operationVoiceValidation = {
    missing: validateTextStructuredBulkRequirementsVoices({ requirements: missingRequirements, edgeVoices }),
    missingAndStale: validateTextStructuredBulkRequirementsVoices({ requirements: missingAndStaleRequirements, edgeVoices }),
    all: validateTextStructuredBulkRequirementsVoices({ requirements, edgeVoices })
  };

  return {
    requirements,
    coverage,
    selectedVoices: { text: textVoices, meaning: meaningVoices },
    voiceValidation,
    operationVoiceValidation,
    representations: { split: includeSplit, full: includeFull }
  };
};

export const selectTextStructuredBulkGenerationRequirements = (plan, { mode = 'missing' } = {}) => {
  const requirements = Array.isArray(plan?.requirements) ? plan.requirements : [];
  if (mode === 'all') return requirements;
  if (mode === 'missing-and-stale') {
    return requirements.filter(item => item.status !== TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.READY);
  }
  // Generate Missing satisfies truly missing logical requirements plus reusable physical
  // identities that only need logical fan-out. Stale is kept separate by contract/UI.
  return requirements.filter(item =>
    item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING
    || item.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE
  );
};

export const buildTextStructuredCardMissingFullRequirements = ({
  documentTree = null,
  block = null,
  channels = null,
  preferences = {},
  runtimeFullAudio = {},
  stagingRecords = null
} = {}) => {
  if (!documentTree?.id || !block?.id || !isP5EligibleBlock(block)) return [];
  const requestedChannels = (Array.isArray(channels) && channels.length ? channels : ['text', 'meaning'])
    .map(ch => (ch === 'meaning' ? 'meaning' : 'text'));
  const targetChannels = [...new Set(requestedChannels)];
  const stagingPhysical = new Set(activeStagingRecords(stagingRecords).map(stagingPhysicalIdentity).filter(Boolean));
  const firstSegment = (block.segments || [])[0] || null;
  const requirements = [];

  for (const channel of targetChannels) {
    const language = channel === 'meaning'
      ? (documentTree?.meaningLanguage || 'id')
      : (documentTree?.textLanguage || 'en');
    const resolved = resolveTextStructuredEffectiveDownloadVoice({
      documentTree,
      block,
      segment: firstSegment,
      channel,
      preferences
    });
    const voiceId = clean(resolved?.voiceId)
      || (channel === 'meaning' ? clean(preferences?.edgeMeaningVoiceId) : clean(preferences?.edgeTextVoiceId));
    if (!voiceId) continue;
    const requirement = createFullBlockRequirement({
      documentTree,
      block,
      channel,
      language,
      voiceId,
      downloadVoiceSource: resolved?.source || 'global-edge',
      preferences,
      runtimeFullAudio,
      stagingPhysical
    });
    if (!requirement) continue;
    if (
      requirement.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.MISSING
      || requirement.status === TEXT_STRUCTURED_BULK_REQUIREMENT_STATUS.REUSABLE
    ) {
      requirements.push(requirement);
    }
  }
  return requirements;
};

export const summarizeTextStructuredBulkPhysicalWork = requirementsCandidate => {
  const requirements = Array.isArray(requirementsCandidate) ? requirementsCandidate : [];
  const groups = new Map();
  requirements.forEach(requirement => {
    if (!requirement?.physicalKey) return;
    const current = groups.get(requirement.physicalKey) || { physicalKey: requirement.physicalKey, representation: requirement.representation, logicalCount: 0, physicalReady: false };
    current.logicalCount += 1;
    current.physicalReady = current.physicalReady || Boolean(requirement.physicalReady);
    groups.set(requirement.physicalKey, current);
  });
  return {
    logicalRequirements: requirements.length,
    uniquePhysicalRequirements: groups.size,
    readyPhysical: [...groups.values()].filter(item => item.physicalReady).length,
    missingPhysical: [...groups.values()].filter(item => !item.physicalReady).length,
    groups: [...groups.values()]
  };
};
