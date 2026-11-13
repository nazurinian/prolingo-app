import { normalizeTextStructuredSpeakerKey } from './textStructuredAudioIdentityDomain.js';
import { getTextStructuredSpeakerVoiceMap } from './textStructuredSpeakerVoiceProfileDomain.js';
import { deriveTextStructuredSpeakerId, getTextStructuredSegmentSpeakerId, getTextStructuredSpeakerVoiceProfileV2 } from './textStructuredSpeakerIdentityDomain.js';
import { formatBrowserTtsVoiceLabel } from '../audio/browserTtsVoicePresentationDomain.js';

export const TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY = 'audioVoiceOverrideV1';

const clean = value => String(value ?? '').trim();
const CHANNELS = ['text', 'meaning'];

const normalizeChannel = channel => channel === 'meaning' ? 'meaning' : 'text';

const normalizeChannelOverrides = candidate => ({
  text: clean(candidate?.text) || null,
  meaning: clean(candidate?.meaning) || null
});

const normalizeSpeakerChannelMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([speaker, voiceName]) => [normalizeTextStructuredSpeakerKey(speaker), clean(voiceName)])
      .filter(([speaker, voiceName]) => Boolean(speaker && voiceName))
  );
};

const normalizeSpeakerIdChannelMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .map(([speakerId, voiceName]) => [clean(speakerId), clean(voiceName)])
      .filter(([speakerId, voiceName]) => Boolean(speakerId && voiceName))
  );
};

export const normalizeTextStructuredVoiceOverrideProfile = candidate => ({
  channels: normalizeChannelOverrides(candidate?.channels),
  speakers: {
    text: normalizeSpeakerChannelMap(candidate?.speakers?.text),
    meaning: normalizeSpeakerChannelMap(candidate?.speakers?.meaning)
  },
  speakerIds: {
    text: normalizeSpeakerIdChannelMap(candidate?.speakerIds?.text),
    meaning: normalizeSpeakerIdChannelMap(candidate?.speakerIds?.meaning)
  }
});

export const getTextStructuredVoiceOverrideProfile = recordLike =>
  normalizeTextStructuredVoiceOverrideProfile(recordLike?.metadata?.[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY]);

const profileHasAssignments = profile => Boolean(
  profile?.channels?.text
  || profile?.channels?.meaning
  || Object.keys(profile?.speakers?.text || {}).length
  || Object.keys(profile?.speakers?.meaning || {}).length
  || Object.keys(profile?.speakerIds?.text || {}).length
  || Object.keys(profile?.speakerIds?.meaning || {}).length
);

export const buildTextStructuredVoiceOverrideMetadata = ({
  metadata,
  channel = 'text',
  voiceName = null,
  speaker = null,
  speakerId = null
}) => {
  const normalizedChannel = normalizeChannel(channel);
  const baseMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const profile = getTextStructuredVoiceOverrideProfile({ metadata: baseMetadata });
  const voice = clean(voiceName) || null;
  const stableSpeakerId = clean(speakerId);
  const speakerKey = normalizeTextStructuredSpeakerKey(speaker);

  let nextProfile = profile;
  if (stableSpeakerId) {
    const nextMap = { ...(profile.speakerIds?.[normalizedChannel] || {}) };
    if (voice) nextMap[stableSpeakerId] = voice;
    else delete nextMap[stableSpeakerId];
    nextProfile = {
      ...profile,
      speakerIds: {
        ...profile.speakerIds,
        [normalizedChannel]: nextMap
      }
    };
  } else if (speakerKey) {
    const nextMap = { ...(profile.speakers?.[normalizedChannel] || {}) };
    if (voice) nextMap[speakerKey] = voice;
    else delete nextMap[speakerKey];
    nextProfile = {
      ...profile,
      speakers: {
        ...profile.speakers,
        [normalizedChannel]: nextMap
      }
    };
  } else {
    nextProfile = {
      ...profile,
      channels: {
        ...profile.channels,
        [normalizedChannel]: voice
      }
    };
  }

  const nextMetadata = { ...baseMetadata };
  if (profileHasAssignments(nextProfile)) nextMetadata[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY] = nextProfile;
  else delete nextMetadata[TEXT_STRUCTURED_VOICE_OVERRIDE_METADATA_KEY];
  return nextMetadata;
};

export const collectTextStructuredCardSpeakers = block => {
  const seen = new Set();
  const result = [];
  if (block?.blockType !== 'conversation') return result;
  (Array.isArray(block?.segments) ? block.segments : []).forEach(segment => {
    const label = clean(segment?.speaker);
    const legacyKey = normalizeTextStructuredSpeakerKey(label);
    if (!legacyKey) return;
    const id = getTextStructuredSegmentSpeakerId(segment) || deriveTextStructuredSpeakerId({ documentId: block?.documentId, speaker: label });
    if (seen.has(id)) return;
    seen.add(id);
    result.push({ id, key: legacyKey, label });
  });
  return result;
};

const buildTextStructuredVoiceCandidateChain = ({
  documentTree = null,
  block = null,
  segment = null,
  channel = 'text',
  defaultVoiceName = null,
  ignoreSegmentOverride = false,
  representationMode = 'split'
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const isFullRepresentation = String(representationMode || '').toLowerCase() === 'full';
  const skipSegmentOverride = Boolean(ignoreSegmentOverride) || isFullRepresentation;
  const speakerKey = normalizeTextStructuredSpeakerKey(segment?.speaker);
  const speakerId = getTextStructuredSegmentSpeakerId(segment);
  const segmentProfile = getTextStructuredVoiceOverrideProfile(segment);
  const blockProfile = getTextStructuredVoiceOverrideProfile(block);
  const documentProfile = getTextStructuredVoiceOverrideProfile(documentTree);
  const documentSpeakerMap = getTextStructuredSpeakerVoiceMap(documentTree);
  const documentSpeakerProfileV2 = getTextStructuredSpeakerVoiceProfileV2(documentTree);
  const segmentOverrideVoiceName = clean(segmentProfile.channels?.[normalizedChannel]) || null;

  return {
    normalizedChannel,
    skipSegmentOverride,
    segmentOverrideVoiceName,
    cardOverrideVoiceName: clean(blockProfile.channels?.[normalizedChannel]) || null,
    workspaceNarratorVoiceName: clean(documentProfile.channels?.[normalizedChannel]) || null,
    candidates: [
      ...(skipSegmentOverride ? [] : [{ source: 'segment', voiceName: segmentOverrideVoiceName }]),
      { source: 'card-speaker', voiceName: speakerId ? blockProfile.speakerIds?.[normalizedChannel]?.[speakerId] : null },
      { source: 'card-speaker-legacy', voiceName: speakerKey ? blockProfile.speakers?.[normalizedChannel]?.[speakerKey] : null },
      { source: 'document-speaker', voiceName: speakerId ? documentSpeakerProfileV2?.[normalizedChannel]?.[speakerId] : null },
      { source: 'document-speaker-legacy', voiceName: speakerKey ? documentSpeakerMap?.[normalizedChannel]?.[speakerKey] : null },
      { source: 'card', voiceName: blockProfile.channels?.[normalizedChannel] },
      { source: 'document', voiceName: documentProfile.channels?.[normalizedChannel] },
      { source: 'global', voiceName: defaultVoiceName }
    ]
  };
};

export const resolveTextStructuredEffectiveVoiceProfile = ({
  documentTree,
  block,
  segment,
  channel = 'text',
  defaultVoiceName = null,
  ignoreSegmentOverride = false,
  representationMode = 'split'
}) => {
  const {
    normalizedChannel,
    segmentOverrideVoiceName,
    skipSegmentOverride,
    candidates
  } = buildTextStructuredVoiceCandidateChain({
    documentTree,
    block,
    segment,
    channel,
    defaultVoiceName,
    ignoreSegmentOverride,
    representationMode
  });
  const selected = candidates.find(candidate => clean(candidate.voiceName)) || { source: 'none', voiceName: null };
  return {
    channel: normalizedChannel,
    voiceName: clean(selected.voiceName) || null,
    source: selected.source,
    inherited: selected.source === 'global' || selected.source === 'document' || selected.source === 'document-speaker',
    ignoredSegmentOverride: Boolean(skipSegmentOverride && segmentOverrideVoiceName),
    segmentOverrideVoiceName
  };
};

export const resolveTextStructuredFullCardVoiceProfile = ({
  documentTree,
  block,
  segment = null,
  channel = 'text',
  defaultVoiceName = null
}) => resolveTextStructuredEffectiveVoiceProfile({
  documentTree,
  block,
  segment,
  channel,
  defaultVoiceName,
  ignoreSegmentOverride: true,
  representationMode: 'full'
});

export const resolveTextStructuredEffectiveVoiceForItem = ({
  documentTree,
  item,
  block: explicitBlock = null,
  channel = 'text',
  defaultVoiceName = null,
  ignoreSegmentOverride = false,
  representationMode = 'split'
}) => {
  const blockId = item?.blockId || item?.textId || explicitBlock?.id;
  const segmentId = item?.segmentId || item?.id;
  const block = explicitBlock
    || (Array.isArray(documentTree?.blocks) ? documentTree.blocks : []).find(candidate => candidate?.id === blockId)
    || null;
  const segment = (Array.isArray(block?.segments) ? block.segments : []).find(candidate => candidate?.id === segmentId) || null;
  return resolveTextStructuredEffectiveVoiceProfile({
    documentTree,
    block,
    segment,
    channel,
    defaultVoiceName,
    ignoreSegmentOverride,
    representationMode
  });
};

export const getTextStructuredVoiceOverrideLabel = source => ({
  segment: 'Segment override',
  'card-speaker': 'Card speaker override',
  'card-speaker-legacy': 'Card speaker override (legacy)',
  'document-speaker': 'Document speaker profile',
  'document-speaker-legacy': 'Document speaker profile (legacy)',
  card: 'Card override',
  document: 'Document default',
  global: 'Global default',
  'browser-fallback': 'Browser fallback voice',
  'system-default': 'Browser system default',
  none: 'No voice'
}[source] || 'Voice');

export const getTextStructuredVoiceSourceDisplayLabel = source => ({
  segment: 'Segment override',
  'card-speaker': 'Card speaker override',
  'card-speaker-legacy': 'Card speaker override',
  'document-speaker': 'Workspace speaker profile',
  'document-speaker-legacy': 'Workspace speaker profile',
  card: 'Card override',
  document: 'Workspace Narrator',
  global: 'Global Browser TTS',
  'browser-fallback': 'Browser fallback voice',
  'system-default': 'Browser system default',
  none: 'Browser system default'
}[source] || 'Browser TTS');

// Display-only labels. Keep raw browser voice names in preference values and IDs.
export const formatTextStructuredBrowserVoiceLabel = (
  voiceLike,
  { fallbackLabel = 'Browser system default', includeEngineHint = false } = {}
) => formatBrowserTtsVoiceLabel(voiceLike, { fallbackLabel, includeEngineHint });

export const resolveTextStructuredBrowserVoiceResolution = ({
  documentTree = null,
  block = null,
  segment = null,
  channel = 'text',
  globalVoiceName = null,
  defaultVoiceName = null,
  requestedVoiceName: explicitRequestedVoiceName = null,
  requestedSource: explicitRequestedSource = null,
  availableBrowserVoices = null,
  ignoreSegmentOverride = false,
  representationMode = 'split'
} = {}) => {
  const globalBrowserVoiceName = clean(globalVoiceName || defaultVoiceName) || null;
  const chainInfo = buildTextStructuredVoiceCandidateChain({
    documentTree,
    block,
    segment,
    channel,
    defaultVoiceName: globalBrowserVoiceName,
    ignoreSegmentOverride,
    representationMode
  });
  const {
    normalizedChannel,
    skipSegmentOverride,
    segmentOverrideVoiceName,
    cardOverrideVoiceName,
    workspaceNarratorVoiceName,
    candidates
  } = chainInfo;

  const requestedProfile = clean(explicitRequestedVoiceName)
    ? {
        voiceName: clean(explicitRequestedVoiceName),
        source: clean(explicitRequestedSource) || 'card',
        ignoredSegmentOverride: false
      }
    : resolveTextStructuredEffectiveVoiceProfile({
        documentTree,
        block,
        segment,
        channel: normalizedChannel,
        defaultVoiceName: globalBrowserVoiceName,
        ignoreSegmentOverride: skipSegmentOverride,
        representationMode
      });

  const requestedVoiceName = requestedProfile.voiceName;
  const requestedSource = requestedProfile.source;
  const requestedSourceLabel = getTextStructuredVoiceSourceDisplayLabel(requestedSource);

  const hasBrowserVoiceList = Array.isArray(availableBrowserVoices);
  const browserVoiceNames = hasBrowserVoiceList
    ? availableBrowserVoices
      .map(entry => (typeof entry === 'string' ? clean(entry) : clean(entry?.name)))
      .filter(Boolean)
    : [];
  const browserVoiceSet = new Set(browserVoiceNames);

  if (!requestedVoiceName) {
    const fallbackBrowserVoice = browserVoiceNames[0] || null;
    const effectiveSource = fallbackBrowserVoice ? 'browser-fallback' : 'system-default';
    const effectiveSourceLabel = getTextStructuredVoiceSourceDisplayLabel(effectiveSource);
    const available = Boolean(fallbackBrowserVoice || !hasBrowserVoiceList);
    return {
      channel: normalizedChannel,
      globalBrowserVoiceName,
      workspaceNarratorVoiceName,
      cardOverrideVoiceName,
      segmentOverrideVoiceName,
      ignoredSegmentOverride: requestedProfile.ignoredSegmentOverride,
      requestedVoiceName: null,
      requestedSource: 'none',
      requestedSourceLabel,
      effectiveVoiceName: fallbackBrowserVoice,
      effectiveSource,
      effectiveSourceLabel,
      availableInBrowser: available,
      requestedVoiceAvailable: available,
      fallbackUsed: false,
      fallbackReason: null
    };
  }

  const isRequestedAvailable = !hasBrowserVoiceList || browserVoiceSet.has(requestedVoiceName);
  if (isRequestedAvailable) {
    return {
      channel: normalizedChannel,
      globalBrowserVoiceName,
      workspaceNarratorVoiceName,
      cardOverrideVoiceName,
      segmentOverrideVoiceName,
      ignoredSegmentOverride: requestedProfile.ignoredSegmentOverride,
      requestedVoiceName,
      requestedSource,
      requestedSourceLabel,
      effectiveVoiceName: requestedVoiceName,
      effectiveSource: requestedSource,
      effectiveSourceLabel: requestedSourceLabel,
      availableInBrowser: true,
      requestedVoiceAvailable: true,
      fallbackUsed: false,
      fallbackReason: null
    };
  }

  const tierOrder = candidates.map(candidate => candidate.source);
  const requestedTierIndex = tierOrder.indexOf(requestedSource);
  const hierarchyFallbacks = candidates
    .filter((candidate, index) => {
      if (requestedTierIndex >= 0) {
        if (clean(explicitRequestedVoiceName)) {
          if (index < requestedTierIndex) return false;
        } else if (index <= requestedTierIndex) {
          return false;
        }
      }
      const voice = clean(candidate.voiceName);
      return Boolean(voice && voice !== requestedVoiceName && browserVoiceSet.has(voice));
    });

  const secondaryGlobalFallback = !hierarchyFallbacks.length && clean(defaultVoiceName)
    && clean(defaultVoiceName) !== requestedVoiceName
    && browserVoiceSet.has(clean(defaultVoiceName))
    ? { source: 'global', voiceName: clean(defaultVoiceName) }
    : null;

  const matchedFallback = hierarchyFallbacks[0] || secondaryGlobalFallback || (browserVoiceNames[0]
    ? { source: 'browser-fallback', voiceName: browserVoiceNames[0] }
    : { source: 'system-default', voiceName: null });

  const effectiveVoiceName = clean(matchedFallback.voiceName) || null;
  const effectiveSource = matchedFallback.source;
  const effectiveSourceLabel = getTextStructuredVoiceSourceDisplayLabel(effectiveSource);
  const fallbackTargetText = effectiveVoiceName
    ? `${effectiveVoiceName} (${effectiveSourceLabel})`
    : 'Browser system default';

  return {
    channel: normalizedChannel,
    globalBrowserVoiceName,
    workspaceNarratorVoiceName,
    cardOverrideVoiceName,
    segmentOverrideVoiceName,
    ignoredSegmentOverride: requestedProfile.ignoredSegmentOverride,
    requestedVoiceName,
    requestedSource,
    requestedSourceLabel,
    effectiveVoiceName,
    effectiveSource,
    effectiveSourceLabel,
    availableInBrowser: false,
    requestedVoiceAvailable: false,
    fallbackUsed: true,
    fallbackReason: `Requested voice "${requestedVoiceName}" (${requestedSourceLabel}) is unavailable in this browser; falling back to ${fallbackTargetText}.`
  };
};

export const TEXT_STRUCTURED_VOICE_OVERRIDE_CHANNELS = Object.freeze([...CHANNELS]);
