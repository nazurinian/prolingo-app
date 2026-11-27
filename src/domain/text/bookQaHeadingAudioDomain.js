import { resolveBookCardHeading, resolveBookHeadingRead, resolveBookMainTitle } from './textBookHeadingDomain.js';
import { resolveTextParagraphCardRole } from './textParagraphRoleDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from './textStructuredAudioRenderFingerprintDomain.js';

export const BOOK_HEADING_LABELS = Object.freeze({
  mainTitle: 'Main Title', paragraph: 'Paragraph Heading', scene: 'Conversation Scene Heading'
});

export const resolveBookAtomicHeading = (document, block, slot, channel) => {
  if (!document?.uid || !['mainTitle', 'heading'].includes(slot) || !['text', 'meaning'].includes(channel)) return null;
  const owner = slot === 'mainTitle' ? document : block;
  if (!owner?.uid || (slot === 'heading' && (!['paragraph', 'conversation'].includes(block.blockType)
    || resolveTextParagraphCardRole(block) === 'title'))) return null;
  const heading = slot === 'mainTitle' ? resolveBookMainTitle(document) : resolveBookCardHeading(block);
  if (heading.diagnostic || (slot === 'mainTitle' && !heading.saved)) return null;
  const content = channel === 'text' ? heading.en : heading.id;
  if (!content) return null;
  const key = slot === 'mainTitle' ? 'mainTitle' : block.blockType === 'paragraph' ? 'paragraph' : 'scene';
  return {
    key, content, channel, slot, ownerUid: owner.uid, blockId: block?.id ?? null,
    id: JSON.stringify([owner.uid, slot, channel]),
    language: channel === 'text' ? document.textLanguage : document.meaningLanguage
  };
};

export const buildBookAtomicAudioRequest = (document, block, slot, channel, profile) => {
  const atomic = resolveBookAtomicHeading(document, block, slot, channel);
  if (!atomic || !profile?.voiceId || (profile.engine && profile.engine !== 'edge')) return null;
  const render = buildTextStructuredAudioRenderFingerprint({
    content: atomic.content, language: atomic.language, channel,
    engine: 'edge', voiceId: profile.voiceId, rate: profile.rate, pitch: profile.pitch
  });
  return { kind: 'heading', target: { documentId: document.id, documentUid: document.uid, slot,
    ...(slot === 'heading' ? { cardId: block.id, cardUid: block.uid } : {}) },
  fingerprint: render.renderFingerprint, descriptor: render.descriptor };
};

const globalRender = (preferences, channel) => ({
  voiceId: resolveTextStructuredEffectiveDownloadVoice({ preferences, channel }).voiceId,
  rate: preferences.edgeRate, pitch: preferences.edgePitch
});

export const planBookAtomicGeneration = (document, block, slot, channel, preferences) =>
  buildBookAtomicAudioRequest(document, block, slot, channel, globalRender(preferences, channel));

export const planBookAtomicPlayback = (document, block, slot, channel, options) => {
  if (options.audioSourceMode === 'tts-only') return [];
  const fallback = globalRender(options.preferences, channel);
  const order = options.globalPlaybackOrder?.channels?.[channel] ?? [];
  const profiles = order.length ? order : options.audioSourceMode === 'custom-local' ? [] : [fallback];
  return profiles.filter(profile => !profile.source || profile.source === 'generated').map(profile =>
    buildBookAtomicAudioRequest(document, block, slot, channel, {
      ...profile, rate: profile.rate ?? fallback.rate, pitch: profile.pitch ?? fallback.pitch
    })).filter(Boolean);
};

export const bookHeadingBoundarySteps = (document, block, channels, { explicit = false } = {}) => {
  const prefs = resolveBookHeadingRead(document);
  const slot = block ? 'heading' : 'mainTitle';
  return channels.map(channel => resolveBookAtomicHeading(document, block, slot, channel))
    .filter(step => step && (explicit || prefs[step.key]));
};
