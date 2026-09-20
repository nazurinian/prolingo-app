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

const uniqueVoiceIds = (candidate, fallback = null) => {
  const list = (Array.isArray(candidate) ? candidate : []).map(clean).filter(Boolean);
  return [...new Set((list.length ? list : [fallback]).filter(Boolean))];
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

const resolveSplitLogicalState = ({ requirement, audioVariants, runtimeAudioUrls, stagingPhysical }) => {
  const candidates = (Array.isArray(audioVariants) ? audioVariants : []).filter(variant =>
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

export const buildTextStructuredBulkGenerationPlan = ({
  documentTrees = [],
  selection = null,
  preferences = {},
  audioVariants = [],
  runtimeAudioUrls = {},
  runtimeFullAudio = {},
  stagingRecords = []
} = {}) => {
  const scopeByDocument = selectedScopeByDocument(selection);
  const selectedDocumentIds = new Set((selection?.documents || []).map(document => upper(document?.id)).filter(Boolean));
  const textVoices = uniqueVoiceIds(preferences?.bulkTextVoiceIds, preferences?.edgeTextVoiceId);
  const meaningVoices = uniqueVoiceIds(preferences?.bulkMeaningVoiceIds, preferences?.edgeMeaningVoiceId);
  const includeSplit = preferences?.bulkGenerateSplit !== false;
  const includeFull = preferences?.bulkGenerateFull === true;
  const includeText = preferences?.generateText !== false;
  const includeMeaning = preferences?.generateMeaning !== false;
  const stagingPhysical = new Set(activeStagingRecords(stagingRecords).map(stagingPhysicalIdentity).filter(Boolean));
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
              requirements.push({ ...requirement, ...resolveSplitLogicalState({ requirement, audioVariants, runtimeAudioUrls, stagingPhysical }) });
            }
          }
        }

        if (includeFull) {
          const representation = buildTextStructuredFullRepresentation({ block, channel });
          if (!clean(representation?.content)) continue;
          for (const voiceId of voices) {
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
              downloadVoiceSource: 'bulk-selection',
              content: representation.content,
              segmentCount: representation.segmentCount,
              physicalKey: lower(identity.fullArtifactFingerprint),
              fullArtifactFingerprint: lower(identity.fullArtifactFingerprint),
              fullArtifactDescriptor: identity.descriptor
            };
            requirements.push({ ...requirement, ...resolveFullLogicalState({ requirement, block, runtimeFullAudio, stagingPhysical }) });
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

  return {
    requirements,
    coverage,
    selectedVoices: { text: textVoices, meaning: meaningVoices },
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
