export const TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY = 'audioPlaybackSyncProfileV1';

const normalizeChannel = channel => channel === 'meaning' ? 'meaning' : 'text';
const normalizeKind = kind => kind === 'rate' ? 'rate' : 'voice';
const normalizeFlags = candidate => ({
  text: candidate?.text === true,
  meaning: candidate?.meaning === true
});

export const getTextStructuredAudioSyncProfile = recordLike => {
  const source = recordLike?.metadata?.[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY] || {};
  return {
    voice: normalizeFlags(source.voice),
    rate: normalizeFlags(source.rate)
  };
};

export const buildTextStructuredAudioSyncProfileMetadata = ({
  metadata,
  kind = 'voice',
  channel = 'text',
  enabled = false
}) => {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const current = getTextStructuredAudioSyncProfile({ metadata: base });
  const normalizedKind = normalizeKind(kind);
  const normalizedChannel = normalizeChannel(channel);
  const next = {
    voice: { ...current.voice },
    rate: { ...current.rate },
    [normalizedKind]: {
      ...current[normalizedKind],
      [normalizedChannel]: Boolean(enabled)
    }
  };
  const result = { ...base };
  const hasEnabled = next.voice.text || next.voice.meaning || next.rate.text || next.rate.meaning;
  if (hasEnabled) result[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY] = next;
  else delete result[TEXT_STRUCTURED_AUDIO_SYNC_PROFILE_KEY];
  return result;
};

export const isTextStructuredAudioSyncEnabled = ({ recordLike, kind = 'voice', channel = 'text' }) => {
  const profile = getTextStructuredAudioSyncProfile(recordLike);
  return Boolean(profile[normalizeKind(kind)]?.[normalizeChannel(channel)]);
};
