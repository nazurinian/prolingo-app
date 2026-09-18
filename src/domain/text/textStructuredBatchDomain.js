import { buildTextStructuredGenerationJobs } from './textStructuredAudioGenerationDomain.js';
import { buildTextStructuredRuntimeAudioKey } from './textStructuredAudioRuntimeDomain.js';
import { TEXT_AUDIO_COVERAGE_STATUS } from './textStructuredAudioCoverageDomain.js';

const clean = value => String(value ?? '').trim();
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

export const normalizeTextStructuredBatchScope = ({ documentTree, scope = null } = {}) => {
  const cardCount = Math.max(0, Array.isArray(documentTree?.blocks) ? documentTree.blocks.length : 0);
  if (!cardCount) return { startCard: 0, endCard: 0, cardCount: 0, blockIds: [] };
  const startCard = clamp(scope?.startCard, 1, cardCount, 1);
  const endCard = clamp(scope?.endCard, 1, cardCount, cardCount);
  const start = Math.min(startCard, endCard);
  const end = Math.max(startCard, endCard);
  const blockIds = documentTree.blocks.slice(start - 1, end).map(block => block?.id).filter(Boolean);
  return { startCard: start, endCard: end, cardCount, blockIds };
};

const countStatus = (counts, status) => {
  if (status === TEXT_AUDIO_COVERAGE_STATUS.READY) counts.ready += 1;
  else if (status === TEXT_AUDIO_COVERAGE_STATUS.DOWNLOADED) counts.downloaded += 1;
  else if (status === TEXT_AUDIO_COVERAGE_STATUS.OTHER_VOICE) counts.otherVoice += 1;
  else if (status === TEXT_AUDIO_COVERAGE_STATUS.STALE) counts.stale += 1;
  else counts.missing += 1;
};

export const buildTextStructuredBatchSelection = ({ documentTree, preferences, coverageMap = {}, scope = null } = {}) => {
  const normalizedScope = normalizeTextStructuredBatchScope({ documentTree, scope });
  const blockIdSet = new Set(normalizedScope.blockIds);
  const allJobs = buildTextStructuredGenerationJobs({ documentTree, preferences }).filter(job => blockIdSet.has(job.blockId));
  const blocksById = new Map((documentTree?.blocks || []).map((block, index) => [block.id, { block, index }]));
  const slots = allJobs.map(job => {
    const key = buildTextStructuredRuntimeAudioKey(job.segmentId, job.channel);
    const coverage = coverageMap?.[key] || { status: TEXT_AUDIO_COVERAGE_STATUS.MISSING, requiredVoiceId: job.downloadVoiceId, requiredVoiceSource: job.downloadVoiceSource };
    const blockInfo = blocksById.get(job.blockId) || {};
    return { ...job, key, coverage, cardIndex: Number.isFinite(blockInfo.index) ? blockInfo.index + 1 : null, cardTitle: blockInfo.block?.title || null };
  });

  const counts = { total: slots.length, ready: 0, downloaded: 0, otherVoice: 0, stale: 0, missing: 0, needDownload: 0, covered: 0 };
  slots.forEach(slot => countStatus(counts, slot.coverage?.status));
  counts.needDownload = counts.downloaded + counts.otherVoice + counts.stale + counts.missing;
  counts.covered = counts.ready;

  return {
    scope: normalizedScope,
    jobs: allJobs,
    slots,
    coverage: counts,
    voices: [...new Set(slots.map(slot => clean(slot.coverage?.requiredVoiceId || slot.downloadVoiceId)).filter(Boolean))],
    speakers: [...new Set(slots.map(slot => clean(slot.speaker)).filter(Boolean))]
  };
};

export const buildTextStructuredBatchWorkspaceSelection = ({
  documentTrees = [],
  preferences,
  coverageMapsByDocument = {},
  activeDocumentId = null,
  activeScope = null
} = {}) => {
  const documents = [];
  const jobs = [];
  const slots = [];
  const totalCoverage = { total: 0, ready: 0, downloaded: 0, otherVoice: 0, stale: 0, missing: 0, needDownload: 0, covered: 0 };

  for (const documentTree of (Array.isArray(documentTrees) ? documentTrees : [])) {
    if (!documentTree?.id) continue;
    const isActiveDocument = documentTree.id === activeDocumentId;
    const selection = buildTextStructuredBatchSelection({
      documentTree,
      preferences,
      coverageMap: coverageMapsByDocument?.[documentTree.id] || {},
      scope: isActiveDocument ? activeScope : null
    });
    const annotatedSlots = (selection.slots || []).map(slot => ({
      ...slot,
      documentId: documentTree.id,
      documentTitle: documentTree.title || 'Text Document',
      collectionId: documentTree.collectionId || null,
      documentType: documentTree.documentType || 'mixed'
    }));
    const slotByKey = new Map(annotatedSlots.map(slot => [slot.key, slot]));
    const annotatedJobs = (selection.jobs || []).map(job => {
      const key = buildTextStructuredRuntimeAudioKey(job.segmentId, job.channel);
      const slot = slotByKey.get(key);
      return {
        ...job,
        documentId: documentTree.id,
        documentTitle: documentTree.title || 'Text Document',
        collectionId: documentTree.collectionId || null,
        documentType: documentTree.documentType || 'mixed',
        coverage: slot?.coverage || null,
        coverageStatus: slot?.coverage?.status || TEXT_AUDIO_COVERAGE_STATUS.MISSING
      };
    });
    jobs.push(...annotatedJobs);
    slots.push(...annotatedSlots);
    Object.keys(totalCoverage).forEach(key => { totalCoverage[key] += Number(selection.coverage?.[key] || 0); });
    documents.push({
      id: documentTree.id,
      title: documentTree.title || 'Text Document',
      collectionId: documentTree.collectionId || null,
      documentType: documentTree.documentType || 'mixed',
      cardCount: selection.scope?.blockIds?.length || 0,
      totalCardCount: selection.scope?.cardCount || 0,
      jobCount: selection.jobs?.length || 0,
      coverage: selection.coverage,
      scope: selection.scope
    });
  }

  return {
    documents,
    documentCount: documents.length,
    jobs,
    slots,
    coverage: totalCoverage,
    voices: [...new Set(slots.map(slot => clean(slot.coverage?.requiredVoiceId || slot.downloadVoiceId)).filter(Boolean))],
    speakers: [...new Set(slots.map(slot => clean(slot.speaker)).filter(Boolean))]
  };
};
