import { initialEdgeVoices } from '../../constants/voiceConstants.js';
import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import { collectTextStructuredConversationSpeakerIdentities, getTextStructuredSegmentSpeakerId } from './textStructuredSpeakerIdentityDomain.js';
import { getTextStructuredAudioSyncProfile } from './textStructuredAudioSyncProfileDomain.js';
import { getTextStructuredSpeakerAssignedVoiceName } from './textStructuredSpeakerVoiceProfileDomain.js';
import { resolveTextStructuredEffectiveVoiceProfile } from './textStructuredVoiceAssignmentDomain.js';

export const TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY = 'audioDownloadProfileV1';
export const TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES = Object.freeze({
  DEFAULT: 'default',
  FOLLOW_PLAYER: 'follow-player',
  CUSTOM: 'custom'
});

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const normalizeMode = value => Object.values(TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES).includes(value) ? value : null;

const normalizeChannelMap = candidate => ({
  text: clean(candidate?.text) || null,
  meaning: clean(candidate?.meaning) || null
});

const normalizeModeMap = candidate => ({
  text: normalizeMode(candidate?.text),
  meaning: normalizeMode(candidate?.meaning)
});

const normalizeSpeakerMap = candidate => {
  const result = { text: {}, meaning: {} };
  ['text', 'meaning'].forEach(channel => {
    const source = candidate?.[channel] && typeof candidate[channel] === 'object' ? candidate[channel] : {};
    Object.entries(source).forEach(([speaker, voiceId]) => {
      const key = normalizeTextStructuredSpeakerKey(speaker);
      const value = clean(voiceId);
      if (key && value) result[channel][key] = value;
    });
  });
  return result;
};

const normalizeSpeakerIdMap = candidate => {
  const result = { text: {}, meaning: {} };
  ['text', 'meaning'].forEach(channel => {
    const source = candidate?.[channel] && typeof candidate[channel] === 'object' ? candidate[channel] : {};
    Object.entries(source).forEach(([speakerId, voiceId]) => {
      const key = clean(speakerId);
      const value = clean(voiceId);
      if (key && value) result[channel][key] = value;
    });
  });
  return result;
};

export const getTextStructuredAudioDownloadProfile = record => {
  const source = record?.metadata?.[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY] || record?.[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY] || {};
  return {
    modes: normalizeModeMap(source.modes),
    channels: normalizeChannelMap(source.channels),
    speakers: normalizeSpeakerMap(source.speakers),
    speakerIds: normalizeSpeakerIdMap(source.speakerIds)
  };
};

export const getTextStructuredAudioDownloadChannelMode = (record, channel = 'text') => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const profile = getTextStructuredAudioDownloadProfile(record);
  if (profile.modes?.[normalizedChannel]) return profile.modes[normalizedChannel];
  return profile.channels?.[normalizedChannel]
    ? TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM
    : TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT;
};

export const buildTextStructuredAudioDownloadProfileMetadata = ({
  metadata,
  channel = 'text',
  voiceId = undefined,
  mode = undefined,
  speaker = null,
  speakerId = null
}) => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const current = getTextStructuredAudioDownloadProfile({ metadata });
  const next = {
    modes: { ...current.modes },
    channels: { ...current.channels },
    speakers: {
      text: { ...current.speakers.text },
      meaning: { ...current.speakers.meaning }
    },
    speakerIds: {
      text: { ...current.speakerIds.text },
      meaning: { ...current.speakerIds.meaning }
    }
  };
  const stableSpeakerId = clean(speakerId);
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);

  if (stableSpeakerId || speakerKey) {
    if (voiceId !== undefined) {
      const value = clean(voiceId) || null;
      if (stableSpeakerId) {
        if (value) next.speakerIds[normalizedChannel][stableSpeakerId] = value;
        else delete next.speakerIds[normalizedChannel][stableSpeakerId];
      } else if (speakerKey) {
        if (value) next.speakers[normalizedChannel][speakerKey] = value;
        else delete next.speakers[normalizedChannel][speakerKey];
      }
    }
  } else {
    if (mode !== undefined) {
      const normalizedMode = normalizeMode(mode) || TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT;
      next.modes[normalizedChannel] = normalizedMode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT ? null : normalizedMode;
      if (normalizedMode !== TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM) next.channels[normalizedChannel] = null;
    }
    if (voiceId !== undefined) {
      const value = clean(voiceId) || null;
      next.channels[normalizedChannel] = value;
      next.modes[normalizedChannel] = value ? TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM : null;
    }
  }

  const hasModes = Boolean(next.modes.text || next.modes.meaning);
  const hasChannels = Boolean(next.channels.text || next.channels.meaning);
  const hasSpeakers = Boolean(Object.keys(next.speakers.text).length || Object.keys(next.speakers.meaning).length || Object.keys(next.speakerIds.text).length || Object.keys(next.speakerIds.meaning).length);
  const result = { ...(metadata || {}) };
  if (hasModes || hasChannels || hasSpeakers) result[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY] = next;
  else delete result[TEXT_STRUCTURED_AUDIO_DOWNLOAD_PROFILE_KEY];
  return result;
};

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

const mapPlaybackVoiceToEdge = ({ playbackVoiceName, defaultEdgeVoiceId, edgeVoices = initialEdgeVoices }) => {
  const requested = clean(playbackVoiceName);
  const fallback = clean(defaultEdgeVoiceId);
  const voices = Array.isArray(edgeVoices) ? edgeVoices : [];
  if (!requested) return { voiceId: fallback, matched: false, playbackVoiceName: null };
  const exact = voices.find(voice => lower(voice?.id) === requested.toLowerCase());
  if (exact) return { voiceId: exact.id, matched: true, playbackVoiceName: requested };
  const token = extractPersonToken(requested);
  const match = token ? voices.find(voice => lower(voice?.id).includes(`-${token}neural`) || lower(voice?.label).startsWith(`${token} `) || lower(voice?.label) === token) : null;
  return { voiceId: match?.id || fallback, matched: Boolean(match), playbackVoiceName: requested };
};

export const resolveTextStructuredEffectiveDownloadVoice = ({
  documentTree = null,
  block,
  segment,
  channel = 'text',
  preferences = null
}) => {
  const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
  const defaultVoiceId = clean(normalizedChannel === 'meaning' ? preferences?.edgeMeaningVoiceId : preferences?.edgeTextVoiceId)
    || (normalizedChannel === 'meaning' ? 'su-ID-TutiNeural' : 'en-GB-SoniaNeural');
  const defaultPlaybackVoiceName = clean(normalizedChannel === 'meaning' ? preferences?.playbackMeaningVoiceName : preferences?.playbackTextVoiceName) || null;
  const edgeVoices = Array.isArray(preferences?.edgeVoices) && preferences.edgeVoices.length ? preferences.edgeVoices : initialEdgeVoices;

  const followPlayer = source => {
    let playback = resolveTextStructuredEffectiveVoiceProfile({
      documentTree,
      block,
      segment,
      channel: normalizedChannel,
      defaultVoiceName: defaultPlaybackVoiceName
    });
    const syncProfile = getTextStructuredAudioSyncProfile(documentTree);
    if (block?.blockType === 'conversation' && syncProfile.voice?.[normalizedChannel] === true) {
      const speakers = collectTextStructuredConversationSpeakerIdentities(documentTree);
      const firstSpeaker = speakers[0] || null;
      if (firstSpeaker) {
        const syncedVoice = getTextStructuredSpeakerAssignedVoiceName({
          documentTree,
          speaker: firstSpeaker.label,
          speakerId: firstSpeaker.id,
          channel: normalizedChannel
        }) || defaultPlaybackVoiceName;
        playback = { ...playback, voiceName: syncedVoice || playback.voiceName, source: 'sync-speaker-1' };
      }
    }
    const mapped = mapPlaybackVoiceToEdge({ playbackVoiceName: playback.voiceName, defaultEdgeVoiceId: defaultVoiceId, edgeVoices });
    return {
      voiceId: mapped.voiceId || defaultVoiceId,
      source: `${source}-follow-player`,
      presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER,
      playbackVoiceName: playback.voiceName || null,
      playbackVoiceSource: playback.source,
      matchedPlaybackVoice: mapped.matched
    };
  };

  const resolveChannelCandidate = (profile, source) => {
    const mode = profile?.modes?.[normalizedChannel] || null;
    const voice = clean(profile?.channels?.[normalizedChannel]);
    if (mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER) return followPlayer(source);
    if (mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM && voice) return { voiceId: voice, source: `${source}-download`, presetMode: mode };
    if (mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT) return null;
    if (!mode && voice) return { voiceId: voice, source: `${source}-download`, presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM };
    return null;
  };

  const segmentProfile = getTextStructuredAudioDownloadProfile(segment);
  const segmentCandidate = resolveChannelCandidate(segmentProfile, 'segment');
  if (segmentCandidate) return segmentCandidate;

  const blockProfile = getTextStructuredAudioDownloadProfile(block);
  const documentProfile = getTextStructuredAudioDownloadProfile(documentTree);
  const speakerId = getTextStructuredSegmentSpeakerId(segment);
  const speakerKey = normalizeTextStructuredSpeakerKey(segment?.speaker);
  const stableCardSpeakerVoice = speakerId ? blockProfile.speakerIds?.[normalizedChannel]?.[speakerId] : null;
  if (stableCardSpeakerVoice) return { voiceId: stableCardSpeakerVoice, source: 'card-speaker-download', presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM };
  const speakerVoice = speakerKey ? blockProfile.speakers[normalizedChannel]?.[speakerKey] : null;
  if (speakerVoice) return { voiceId: speakerVoice, source: 'card-speaker-download-legacy', presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM };
  const documentSpeakerVoice = speakerId ? documentProfile.speakerIds?.[normalizedChannel]?.[speakerId] : null;
  if (documentSpeakerVoice) return { voiceId: documentSpeakerVoice, source: 'document-speaker-download', presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM };
  const legacyDocumentSpeakerVoice = speakerKey ? documentProfile.speakers?.[normalizedChannel]?.[speakerKey] : null;
  if (legacyDocumentSpeakerVoice) return { voiceId: legacyDocumentSpeakerVoice, source: 'document-speaker-download-legacy', presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM };

  const cardCandidate = resolveChannelCandidate(blockProfile, 'card');
  if (cardCandidate) return cardCandidate;
  const documentCandidate = resolveChannelCandidate(documentProfile, 'document');
  if (documentCandidate) return documentCandidate;

  return { voiceId: defaultVoiceId, source: 'global-download', presetMode: TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT };
};
