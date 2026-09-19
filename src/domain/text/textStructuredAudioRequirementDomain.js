import { resolveTextLibraryDocumentTree } from './textLibraryDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from './textStructuredAudioRenderFingerprintDomain.js';

const clean = value => String(value ?? '').trim();

export const buildTextStructuredAudioRequirementsForDocument = ({ documentTree, preferences } = {}) => {
  if (!documentTree || documentTree.editorModel !== 'structured-v1') return [];
  const requirements = [];
  (documentTree.blocks || []).forEach(block => {
    (block.segments || []).forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
        if (!content) return;
        const voice = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel, preferences });
        if (!voice?.voiceId) return;
        const language = channel === 'meaning' ? (documentTree.meaningLanguage || 'id') : (documentTree.textLanguage || 'en');
        const render = buildTextStructuredAudioRenderFingerprint({
          channel,
          content,
          language,
          engine: 'edge',
          voiceId: voice.voiceId,
          rate: preferences?.edgeRate ?? 0,
          pitch: preferences?.edgePitch ?? 0
        });
        requirements.push({
          documentId: documentTree.id,
          blockId: block.id,
          segmentId: segment.id,
          segmentUid: segment.uid || null,
          channel,
          content,
          language,
          engine: 'edge',
          voiceId: voice.voiceId,
          voiceSource: voice.source,
          rate: preferences?.edgeRate ?? 0,
          pitch: preferences?.edgePitch ?? 0,
          renderFingerprint: render.renderFingerprint,
          contentFingerprintV2: render.contentFingerprintV2,
          renderDescriptor: render.descriptor
        });
      });
    });
  });
  return requirements;
};

export const buildTextStructuredAudioRequirementsForSnapshot = ({ snapshot, preferences } = {}) => {
  if (!snapshot) return [];
  return (snapshot.documents || [])
    .filter(document => document.editorModel === 'structured-v1')
    .flatMap(document => buildTextStructuredAudioRequirementsForDocument({
      documentTree: resolveTextLibraryDocumentTree(snapshot, document.id),
      preferences
    }));
};

export const buildTextStructuredAudioRequirementIndex = requirements => {
  const byRf = new Map();
  (requirements || []).forEach(requirement => {
    const rf = clean(requirement?.renderFingerprint).toLowerCase();
    if (!rf) return;
    const list = byRf.get(rf) || [];
    list.push(requirement);
    byRf.set(rf, list);
  });
  return { byRf };
};
