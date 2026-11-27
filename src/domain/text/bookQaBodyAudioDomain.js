import { buildTextStructuredAudioDownloadProfileMetadata, resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { buildTextStructuredAudioRenderFingerprint } from './textStructuredAudioRenderFingerprintDomain.js';
import { buildTextStructuredVoiceOverrideMetadata } from './textStructuredVoiceAssignmentDomain.js';
import { buildTextStructuredSpeakerVoiceProfileV2Metadata, getTextStructuredSpeakerRegistry } from './textStructuredSpeakerIdentityDomain.js';
import { buildTextStructuredPlaybackRateProfileMetadata, resolveTextStructuredEffectivePlaybackRate } from './textStructuredPlaybackRateProfileDomain.js';
import { buildTextStructuredLocalAudioProfileMetadata, resolveTextStructuredEffectiveCustomLocalVoice } from './textStructuredLocalAudioProfileDomain.js';
import { resolveTextStructuredEffectivePlaybackOrder } from './textStructuredAudioPlaybackOrderDomain.js';
import { buildTextStructuredFullArtifactIdentity, buildTextStructuredFullRepresentation } from './textStructuredSplitFullDomain.js';
import { TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY } from './textStructuredSpeakerVoiceProfileDomain.js';
import { isBookBodyAudioCard } from './bookQaAudioDomain.js';

export const BOOK_BODY_PROFILES = 'bookBodyAudioProfilesV1';
export const BOOK_BODY_CHANNELS = ['text', 'meaning'];
const PROFILE_FIELDS = ['browserVoice', 'edgeVoice', 'localVoice', 'playbackRate'];
const own = (value, key) => Object.hasOwn(value ?? {}, key);
const plain = value => value && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = message => { throw Object.assign(new Error(message), { code: 'INVALID_BOOK_AUDIO_PROFILE' }); };

export const updateBookBodyProfileMetadata = (document, patch) => {
  const keys = ['workspaceUid', 'channel', 'kind', 'speakerId', 'values'];
  if (!plain(patch) || Object.keys(patch).some(key => !keys.includes(key)) || !document?.uid || document.uid !== patch.workspaceUid
    || !BOOK_BODY_CHANNELS.includes(patch.channel) || !['paragraph', 'conversation'].includes(patch.kind)
    || ![patch.kind, 'mixed'].includes(document.documentType) || !plain(patch.values) || !Object.keys(patch.values).length) {
    fail('Invalid Workspace audio profile target');
  }
  const speaker = patch.kind === 'conversation' ? getTextStructuredSpeakerRegistry(document).find(item => item.id === patch.speakerId) : null;
  if (patch.kind === 'conversation' ? !speaker : own(patch, 'speakerId')) fail('Choose a registered Speaker for a Conversation profile');
  const values = {};
  for (const [field, value] of Object.entries(patch.values)) {
    if (!PROFILE_FIELDS.includes(field) || (value !== null && (field === 'playbackRate'
      ? typeof value !== 'number' || !Number.isInteger(value * 10) || value < 0.5 || value > 2
      : typeof value !== 'string' || !value.trim() || value.length > 128))) fail('Invalid Workspace audio profile value');
    values[field] = typeof value === 'string' ? value.trim() : value;
  }
  const metadata = { ...document.metadata };
  const profiles = { ...metadata[BOOK_BODY_PROFILES] };
  if (speaker) {
    const byId = { ...profiles.speakers };
    const channels = { ...byId[speaker.id] };
    channels[patch.channel] = { ...channels[patch.channel], ...values };
    profiles.speakers = { ...byId, [speaker.id]: channels };
  } else {
    const paragraph = { ...profiles.paragraph };
    paragraph[patch.channel] = { ...paragraph[patch.channel], ...values };
    profiles.paragraph = paragraph;
  }
  return { ...metadata, [BOOK_BODY_PROFILES]: profiles };
};

// Layer Book profiles over accepted native resolvers without altering legacy metadata.
export const projectBookBodyAudioDocument = (document, kind) => {
  const profiles = document?.metadata?.[BOOK_BODY_PROFILES];
  if (!profiles) return document;
  let metadata = document.metadata;
  const scopes = kind === 'paragraph' ? [[null, profiles.paragraph]] :
    getTextStructuredSpeakerRegistry(document).map(speaker => [speaker, profiles.speakers?.[speaker.id]]);
  for (const [speaker, channels] of scopes) {
    for (const channel of BOOK_BODY_CHANNELS) {
      const profile = channels?.[channel];
      if (!profile) continue;
      const scope = speaker ? { speakerId: speaker.id } : {};
      // Clear the corresponding legacy label alias when a typed Speaker setting has been saved.
      const clearLegacy = builder => {
        if (speaker) metadata = builder({ metadata, channel, speaker: speaker.label, voiceId: null, voiceName: null, rate: null });
      };
      if (own(profile, 'browserVoice')) {
        if (speaker) {
          metadata = buildTextStructuredSpeakerVoiceProfileV2Metadata({ metadata, speakerId: speaker.id, channel, voiceName: profile.browserVoice });
          const key = TEXT_STRUCTURED_SPEAKER_VOICE_METADATA_KEY;
          const byChannel = metadata[key]?.[channel];
          if (byChannel) {
            const normalized = speaker.label.trim().toLowerCase().replace(/\s+/g, ' ');
            const { [normalized]: _old, ...rest } = byChannel;
            metadata = { ...metadata, [key]: { ...metadata[key], [channel]: rest } };
          }
        } else metadata = buildTextStructuredVoiceOverrideMetadata({ metadata, channel, voiceName: profile.browserVoice });
      }
      if (own(profile, 'edgeVoice')) {
        clearLegacy(buildTextStructuredAudioDownloadProfileMetadata);
        metadata = buildTextStructuredAudioDownloadProfileMetadata({ metadata, channel, ...scope, voiceId: profile.edgeVoice });
      }
      if (own(profile, 'localVoice')) {
        clearLegacy(buildTextStructuredLocalAudioProfileMetadata);
        metadata = buildTextStructuredLocalAudioProfileMetadata({ metadata, channel, ...scope, voiceId: profile.localVoice });
      }
      if (own(profile, 'playbackRate')) {
        clearLegacy(buildTextStructuredPlaybackRateProfileMetadata);
        metadata = buildTextStructuredPlaybackRateProfileMetadata({ metadata, channel, ...scope, rate: profile.playbackRate });
      }
    }
  }
  return { ...document, metadata };
};

const targetFor = (document, block, segment) => ({
  documentId: document.id, documentUid: document.uid, cardId: block.id, cardUid: block.uid,
  ...(segment ? { segmentId: segment.id, segmentUid: segment.uid } : {})
});
const languageFor = (document, channel) => channel === 'meaning' ? document.meaningLanguage : document.textLanguage;
const edgeProfile = (document, block, segment, channel, preferences) => ({
  engine: 'edge',
  voiceId: resolveTextStructuredEffectiveDownloadVoice({ documentTree: document, block, segment, channel, preferences }).voiceId,
  rate: preferences.edgeRate ?? 0, pitch: preferences.edgePitch ?? 0
});
const splitRequest = (document, block, segment, channel, profile, preferences) => {
  if (!segment?.[channel]?.trim() || profile.engine !== 'edge' || !profile.voiceId) return null;
  const render = buildTextStructuredAudioRenderFingerprint({ channel, content: segment[channel], language: languageFor(document, channel),
    engine: profile.engine, voiceId: profile.voiceId, rate: profile.rate ?? preferences.edgeRate, pitch: profile.pitch ?? preferences.edgePitch });
  return { kind: 'split', target: targetFor(document, block, segment), fingerprint: render.renderFingerprint, descriptor: render.descriptor };
};
const fullRequest = (document, block, channel, profile, preferences) => {
  if (!profile.voiceId || profile.engine !== 'edge' || !buildTextStructuredFullRepresentation({ block, channel }).content) return null;
  const render = buildTextStructuredFullArtifactIdentity({ block, channel, language: languageFor(document, channel),
    engine: profile.engine, voiceId: profile.voiceId, rate: profile.rate ?? preferences.edgeRate, pitch: profile.pitch ?? preferences.edgePitch });
  return { kind: 'full', target: targetFor(document, block), fingerprint: render.fullArtifactFingerprint, descriptor: render.descriptor };
};
const orderedProfiles = (document, block, segment, channel, options) => {
  const { preferences, audioSourceMode, globalPlaybackOrder } = options;
  const fallback = edgeProfile(document, block, segment, channel, preferences);
  if (audioSourceMode === 'tts-only') return [];
  if (audioSourceMode === 'custom-local') {
    const pin = resolveTextStructuredEffectiveCustomLocalVoice({ documentTree: document, block, segment, channel });
    return pin ? [{ ...fallback, voiceId: pin }] : [];
  }
  return resolveTextStructuredEffectivePlaybackOrder({ documentTree: document, block, channel,
    globalProfiles: globalPlaybackOrder?.channels?.[channel], fallbackProfiles: [fallback] }).profiles
    .filter(profile => !profile.source || profile.source === 'generated');
};
export const getBookSplitPlaybackRequests = (document, block, segment, channel, options) =>
  isBookBodyAudioCard(block) ? orderedProfiles(document, block, segment, channel, options).map(profile =>
    splitRequest(document, block, segment, channel, profile, options.preferences)).filter(Boolean) : [];

export const getBookConversationFullRequest = (document, block, channel, options) => {
  const audible = block.segments.filter(segment => segment[channel]?.trim());
  if (!audible.length) return null;
  const composition = [];
  for (const segment of audible) {
    const input = getBookSplitPlaybackRequests(document, block, segment, channel, options)[0];
    const playbackRate = resolveTextStructuredEffectivePlaybackRate({
      documentTree: document, block, segment, channel, globalRate: options.globalRate, respectConversationSync: true
    });
    if (!input || playbackRate !== 1) return null;
    composition.push({ renderFingerprint: input.fingerprint, playbackRate });
  }
  const render = buildTextStructuredFullArtifactIdentity({ block, channel, composition });
  return { kind: 'full', target: targetFor(document, block), fingerprint: render.fullArtifactFingerprint, descriptor: render.descriptor };
};

export const getBookFullPlaybackRequests = (document, block, channel, options) => {
  if (!isBookBodyAudioCard(block)) return [];
  if (block.blockType === 'conversation') return [getBookConversationFullRequest(document, block, channel, options)].filter(Boolean);
  return orderedProfiles(document, block, null, channel, options).map(profile =>
    fullRequest(document, block, channel, profile, options.preferences)).filter(Boolean);
};

export const getBookBodyGenerationRequests = (document, block, channel, { segment = null, full = false, options }) => {
  if (!isBookBodyAudioCard(block)) return [];
  const owner = projectBookBodyAudioDocument(document, block.blockType);
  if (full) {
    const request = block.blockType === 'conversation' ? getBookConversationFullRequest(owner, block, channel, {
      ...options, audioSourceMode: options.audioSourceMode === 'tts-only' ? 'local-first' : options.audioSourceMode
    })
      : fullRequest(owner, block, channel, edgeProfile(owner, block, null, channel, options.preferences), options.preferences);
    return request ? [request] : [];
  }
  return (segment ? [segment] : block.segments).map(item =>
    splitRequest(owner, block, item, channel, edgeProfile(owner, block, item, channel, options.preferences), options.preferences)).filter(Boolean);
};
