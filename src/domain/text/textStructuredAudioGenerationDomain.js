import { initialEdgeVoices } from '../../constants/voiceConstants.js';
import { buildTextStructuredAudioFilename } from './textStructuredAudioIdentityDomain.js';
import { buildCanonicalTextRenderAudioFilename, parseCanonicalTextRenderAudioFilename } from './textFilenameDomain.js';
import { resolveStructuredTextPlaybackList } from './textStructuredPlaybackDomain.js';
import { resolveTextStructuredEffectiveDownloadVoice } from './textStructuredAudioDownloadProfileDomain.js';
import { getTextStructuredSegmentSpeakerId } from './textStructuredSpeakerIdentityDomain.js';

export const TEXT_STRUCTURED_GENERATOR_ENGINES = Object.freeze({ EDGE: 'edge', GEMINI: 'gemini' });
export const TEXT_STRUCTURED_GENERATION_FEATURES = Object.freeze({ EDGE: true, GEMINI: false });
export const TEXT_STRUCTURED_GENERATION_CHANNELS = Object.freeze({ TEXT: 'text', MEANING: 'meaning' });
export const TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION = 2;

export const TEXT_STRUCTURED_GENERATION_DEFAULTS = Object.freeze({
  engine: TEXT_STRUCTURED_GENERATOR_ENGINES.EDGE,
  edgeTextVoiceId: 'en-GB-SoniaNeural',
  edgeMeaningVoiceId: 'su-ID-TutiNeural',
  geminiVoiceName: 'Kore',
  edgeRate: 0,
  edgePitch: 0,
  generateText: true,
  generateMeaning: true,
  // beta.8/P5: Bulk generation selection is independent from playback priority.
  bulkTextVoiceIds: ['en-GB-LibbyNeural'],
  bulkMeaningVoiceIds: ['su-ID-TutiNeural'],
  bulkGenerateSplit: true,
  bulkGenerateFull: false,
  // beta.8/P6: export policy is independent from generation and playback order.
  bulkAutoExport: false,
  bulkExportFormat: 'portable-zip',
  bulkExportVoicePolicy: 'all-selected',
  bulkExportTextVoiceId: 'en-GB-LibbyNeural',
  bulkExportMeaningVoiceId: 'su-ID-TutiNeural',
  bulkExportRepresentation: 'split'
});

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const normalizeVoiceIds = (candidate, fallback) => {
  const list = (Array.isArray(candidate) ? candidate : []).map(clean).filter(Boolean);
  return [...new Set(list.length ? list : [fallback].filter(Boolean))];
};
const clampInteger = (value, min, max, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

export const normalizeTextStructuredAudioGenerationPreferences = candidate => ({
  defaultsVersion: TEXT_STRUCTURED_GENERATION_DEFAULTS_VERSION,
  // A12.1 is deliberately Edge-first. Preserve the Gemini fields for the later
  // provider patch, but do not allow a stale preference to route generation there.
  engine: TEXT_STRUCTURED_GENERATOR_ENGINES.EDGE,
  edgeTextVoiceId: clean(candidate?.edgeTextVoiceId) || TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeTextVoiceId,
  edgeMeaningVoiceId: clean(candidate?.edgeMeaningVoiceId) || TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeMeaningVoiceId,
  geminiVoiceName: clean(candidate?.geminiVoiceName) || TEXT_STRUCTURED_GENERATION_DEFAULTS.geminiVoiceName,
  edgeRate: clampInteger(candidate?.edgeRate, -50, 50, 0),
  edgePitch: clampInteger(candidate?.edgePitch, -20, 20, 0),
  generateText: candidate?.generateText !== false,
  generateMeaning: candidate?.generateMeaning !== false,
  // Bulk defaults are deliberately independent from normal/manual Edge defaults.
  bulkTextVoiceIds: normalizeVoiceIds(candidate?.bulkTextVoiceIds, TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkTextVoiceIds[0]),
  bulkMeaningVoiceIds: normalizeVoiceIds(candidate?.bulkMeaningVoiceIds, TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkMeaningVoiceIds[0]),
  // Keep at least one representation selected. Full-only is valid; both-off falls back to Split.
  bulkGenerateSplit: candidate?.bulkGenerateSplit !== false || candidate?.bulkGenerateFull !== true,
  bulkGenerateFull: candidate?.bulkGenerateFull === true,
  bulkAutoExport: candidate?.bulkAutoExport === true,
  bulkExportFormat: ['audio-only-direct', 'audio-only-zip', 'portable-zip'].includes(candidate?.bulkExportFormat) ? candidate.bulkExportFormat : 'portable-zip',
  bulkExportVoicePolicy: ['preferred', 'selected', 'all-selected'].includes(candidate?.bulkExportVoicePolicy) ? candidate.bulkExportVoicePolicy : 'all-selected',
  bulkExportTextVoiceId: clean(candidate?.bulkExportTextVoiceId) || normalizeVoiceIds(candidate?.bulkTextVoiceIds, TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkTextVoiceIds[0])[0],
  bulkExportMeaningVoiceId: clean(candidate?.bulkExportMeaningVoiceId) || normalizeVoiceIds(candidate?.bulkMeaningVoiceIds, TEXT_STRUCTURED_GENERATION_DEFAULTS.bulkMeaningVoiceIds[0])[0],
  bulkExportRepresentation: ['split', 'full', 'both'].includes(candidate?.bulkExportRepresentation) ? candidate.bulkExportRepresentation : 'split'
});

const extractPersonToken = value => {
  const text = clean(value);
  if (!text) return '';
  const neural = text.match(/(?:^|[-_])([A-Za-z]+)Neural(?:$|\b)/i);
  if (neural?.[1]) return neural[1].toLowerCase();
  const microsoft = text.match(/Microsoft\s+([A-Za-z]+)\s+(?:Online|Desktop|Natural)/i);
  if (microsoft?.[1]) return microsoft[1].toLowerCase();
  const parenthetical = text.match(/^([A-Za-z]+)\s*\(/);
  if (parenthetical?.[1]) return parenthetical[1].toLowerCase();
  return lower(text).split(/[^a-z]+/).filter(Boolean)[0] || '';
};

export const resolveTextStructuredEdgeVoiceForProfile = ({
  requestedProfileVoiceId,
  defaultEdgeVoiceId,
  edgeVoices = initialEdgeVoices
}) => {
  const requested = clean(requestedProfileVoiceId);
  const fallback = clean(defaultEdgeVoiceId) || TEXT_STRUCTURED_GENERATION_DEFAULTS.edgeTextVoiceId;
  const voices = Array.isArray(edgeVoices) ? edgeVoices : [];
  if (!requested) return { voiceId: fallback, matchedProfile: false, requestedProfileVoiceId: null };

  const exact = voices.find(voice => clean(voice?.id).toLowerCase() === requested.toLowerCase());
  if (exact) return { voiceId: exact.id, matchedProfile: true, requestedProfileVoiceId: requested };

  const token = extractPersonToken(requested);
  const tokenMatch = token
    ? voices.find(voice => lower(voice?.id).includes(`-${token}neural`) || lower(voice?.label).startsWith(`${token} `) || lower(voice?.label) === token)
    : null;
  if (tokenMatch) return { voiceId: tokenMatch.id, matchedProfile: true, requestedProfileVoiceId: requested };

  return { voiceId: fallback, matchedProfile: false, requestedProfileVoiceId: requested };
};

export const resolveTextStructuredGenerationVoiceState = ({
  channel,
  requestedDownloadVoiceId = null,
  requestedPlaybackVoiceId = null,
  preferences,
  edgeVoices = initialEdgeVoices
}) => {
  const prefs = normalizeTextStructuredAudioGenerationPreferences(preferences);
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const defaultEdgeVoiceId = normalizedChannel === 'meaning' ? prefs.edgeMeaningVoiceId : prefs.edgeTextVoiceId;

  // C3.4: Download voice is independent from Browser TTS playback voice. The
  // requestedPlaybackVoiceId branch is kept only as an A12 compatibility bridge
  // for historical callers/tests; current runtime passes requestedDownloadVoiceId.
  if (clean(requestedDownloadVoiceId)) {
    const exact = (Array.isArray(edgeVoices) ? edgeVoices : []).find(voice => lower(voice?.id) === lower(requestedDownloadVoiceId));
    return {
      engine: 'edge',
      engineVoiceId: exact?.id || defaultEdgeVoiceId,
      downloadProfileVoiceId: exact?.id || defaultEdgeVoiceId,
      playbackProfileVoiceId: null,
      matchedProfile: Boolean(exact)
    };
  }

  const resolved = resolveTextStructuredEdgeVoiceForProfile({
    requestedProfileVoiceId: requestedPlaybackVoiceId,
    defaultEdgeVoiceId,
    edgeVoices
  });
  return {
    engine: 'edge',
    engineVoiceId: resolved.voiceId,
    downloadProfileVoiceId: resolved.voiceId,
    playbackProfileVoiceId: clean(requestedPlaybackVoiceId) || null,
    matchedProfile: resolved.matchedProfile
  };
};

export const buildTextStructuredGenerationJobs = ({
  documentTree,
  preferences,
  blockId = null,
  speaker = null,
  segmentIds = null,
  channels = null
}) => {
  const prefs = normalizeTextStructuredAudioGenerationPreferences(preferences);
  const resolutionPreferences = {
    ...prefs,
    playbackTextVoiceName: preferences?.playbackTextVoiceName || null,
    playbackMeaningVoiceName: preferences?.playbackMeaningVoiceName || null,
    edgeVoices: Array.isArray(preferences?.edgeVoices) ? preferences.edgeVoices : undefined
  };
  const requestedSegmentIds = Array.isArray(segmentIds) && segmentIds.length
    ? new Set(segmentIds.map(value => String(value || '').toUpperCase()))
    : null;
  const requestedChannels = Array.isArray(channels) && channels.length
    ? new Set(channels.map(value => value === 'meaning' ? 'meaning' : 'text'))
    : null;
  const speakerKey = lower(speaker).replace(/\s+/g, ' ');
  const list = resolveStructuredTextPlaybackList(documentTree).filter(item => {
    if (blockId && item.blockId !== blockId) return false;
    if (speakerKey && lower(item.speaker).replace(/\s+/g, ' ') !== speakerKey) return false;
    if (requestedSegmentIds && !requestedSegmentIds.has(String(item.segmentId || item.id || '').toUpperCase())) return false;
    return true;
  });
  const allowText = requestedChannels ? requestedChannels.has('text') : prefs.generateText;
  const allowMeaning = requestedChannels ? requestedChannels.has('meaning') : prefs.generateMeaning;
  const jobs = [];
  list.forEach(item => {
    const block = (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).find(candidate => candidate.id === item.blockId) || null;
    const segment = (Array.isArray(block?.segments) ? block.segments : []).find(candidate => candidate.id === (item.segmentId || item.id)) || item;
    if (allowText && clean(item?.text)) {
      const download = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel: 'text', preferences: resolutionPreferences });
      jobs.push({ segmentId: item.segmentId || item.id, channel: 'text', blockId: item.blockId, speaker: item.speaker || null, speakerId: getTextStructuredSegmentSpeakerId(segment) || null, downloadVoiceId: download.voiceId, downloadVoiceSource: download.source });
    }
    if (allowMeaning && clean(item?.meaning)) {
      const download = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel: 'meaning', preferences: resolutionPreferences });
      jobs.push({ segmentId: item.segmentId || item.id, channel: 'meaning', blockId: item.blockId, speaker: item.speaker || null, speakerId: getTextStructuredSegmentSpeakerId(segment) || null, downloadVoiceId: download.voiceId, downloadVoiceSource: download.source });
    }
  });
  return jobs;
};

export const getTextStructuredGeneratedAudioExtension = mimeType => {
  const mime = lower(mimeType);
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  return 'wav';
};

export const buildTextStructuredGeneratedFilename = ({
  audioVariantId,
  segmentId,
  channel,
  engine,
  engineVoiceId,
  renderFingerprint = null,
  mimeType
}) => renderFingerprint
  ? buildCanonicalTextRenderAudioFilename({
      renderFingerprint,
      engine,
      voiceId: engineVoiceId,
      extension: getTextStructuredGeneratedAudioExtension(mimeType)
    })
  : buildTextStructuredAudioFilename({
      audioVariantId,
      segmentId,
      channel,
      engine,
      voiceId: engineVoiceId,
      extension: getTextStructuredGeneratedAudioExtension(mimeType)
    });

export const parseTextStructuredGeneratedFilename = filename => {
  const rf = parseCanonicalTextRenderAudioFilename(filename);
  if (rf) return rf;
  const name = clean(filename).split('/').filter(Boolean).pop() || '';
  const match = name.match(/^(SEGMENT_\d+)__(TEXT|MEANING)__([A-Za-z0-9._-]+)__(.+?)__(TXTAUDIO_\d+)\.(mp3|wav|ogg|webm)$/i);
  if (!match) return null;
  return {
    version: 1,
    segmentId: match[1].toUpperCase(),
    channel: match[2].toLowerCase(),
    engine: match[3].toLowerCase(),
    voiceToken: match[4],
    audioVariantId: match[5].toUpperCase(),
    extension: match[6].toLowerCase()
  };
};
