import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Download, FileDown, Headphones, ListOrdered, Play, Plus, RotateCcw, Server, Square, Trash2, Users, Volume2, X } from 'lucide-react';
import {
  collectTextStructuredCardSpeakers,
  formatTextStructuredBrowserVoiceLabel,
  getTextStructuredVoiceOverrideLabel,
  getTextStructuredVoiceOverrideProfile,
  getTextStructuredVoiceSourceDisplayLabel,
  resolveTextStructuredBrowserVoiceResolution,
  resolveTextStructuredEffectiveVoiceProfile
} from '../../domain/text/textStructuredVoiceAssignmentDomain.js';
import { normalizeTextStructuredSpeakerKey } from '../../domain/text/textStructuredAudioIdentityDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../../domain/text/textStructuredAudioRuntimeDomain.js';
import {
  getTextStructuredAudioDownloadChannelMode,
  getTextStructuredAudioDownloadProfile,
  resolveTextStructuredEffectiveDownloadVoice,
  TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES
} from '../../domain/text/textStructuredAudioDownloadProfileDomain.js';
import { getTextStructuredAudioPlaybackOrder } from '../../domain/text/textStructuredAudioPlaybackOrderDomain.js';
import {
  getTextStructuredFullAudioArtifacts,
  resolveTextStructuredFullArtifactReadiness,
  TEXT_STRUCTURED_ARTIFACT_READINESS
} from '../../domain/text/textStructuredSplitFullDomain.js';
import { useLiveOverlayViewportRef } from '../../hooks/useStableOverlayViewport.js';
import { BrowserTtsVoiceOptgroups, EdgeVoiceOptgroups } from '../common/GroupedVoiceSelect.jsx';
import { dedupeBrowserTtsVoices } from '../../domain/audio/browserTtsVoicePresentationDomain.js';
import { isEdgeVoiceUnavailable } from '../../constants/voiceConstants.js';
import { formatEdgeVoiceLabel } from '../../domain/audio/voicePresentationDomain.js';

const clean = value => String(value ?? '').trim();

const compactVoiceLabel = value => {
  const name = clean(value);
  if (!name) return 'Default';
  const microsoft = name.match(/^Microsoft\s+(.+?)\s+Online/i);
  if (microsoft?.[1]) return microsoft[1];
  const neural = name.match(/(?:^|[-_])([A-Za-z]+)Neural$/i);
  if (neural?.[1]) return neural[1];
  return name.length > 30 ? `${name.slice(0, 29)}…` : name;
};

const clue = (segment, channel = 'text') => {
  const value = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
  if (!value) return '—';
  return value.length > 54 ? `${value.slice(0, 53)}…` : value;
};

const uniqueVoiceNames = voices => [...new Set((Array.isArray(voices) ? voices : [])
  .map(voice => clean(voice?.name))
  .filter(Boolean))];

const clonePlaybackProfiles = profiles => (Array.isArray(profiles) ? profiles : []).map(profile => ({
  engine: clean(profile?.engine || 'edge').toLowerCase() || 'edge',
  voiceId: clean(profile?.voiceId),
  rate: Number(profile?.rate) || 0,
  pitch: Number(profile?.pitch) || 0
})).filter(profile => Boolean(profile.voiceId));

const profilesEqual = (left = [], right = []) => {
  const a = clonePlaybackProfiles(left);
  const b = clonePlaybackProfiles(right);
  if (a.length !== b.length) return false;
  return a.every((item, index) => (
    item.engine === b[index].engine
    && item.voiceId === b[index].voiceId
    && item.rate === b[index].rate
    && item.pitch === b[index].pitch
  ));
};

const buildInitialPlayerDraft = (block, segments) => {
  const cardProfile = getTextStructuredVoiceOverrideProfile(block);
  const cardPlaybackOrder = getTextStructuredAudioPlaybackOrder(block);
  const segmentChannels = {};
  (Array.isArray(segments) ? segments : []).forEach(segment => {
    const segProfile = getTextStructuredVoiceOverrideProfile(segment);
    segmentChannels[segment.id] = {
      text: clean(segProfile.channels?.text) || null,
      meaning: clean(segProfile.channels?.meaning) || null
    };
  });
  return {
    cardChannels: {
      text: clean(cardProfile.channels?.text) || null,
      meaning: clean(cardProfile.channels?.meaning) || null
    },
    speakerIds: {
      text: { ...(cardProfile.speakerIds?.text || {}) },
      meaning: { ...(cardProfile.speakerIds?.meaning || {}) }
    },
    speakers: {
      text: { ...(cardProfile.speakers?.text || {}) },
      meaning: { ...(cardProfile.speakers?.meaning || {}) }
    },
    segmentChannels,
    playbackOrder: {
      text: clonePlaybackProfiles(cardPlaybackOrder.channels?.text),
      meaning: clonePlaybackProfiles(cardPlaybackOrder.channels?.meaning)
    }
  };
};

const isPlayerDraftDirty = (draft, baseline, segments) => {
  if (!draft || !baseline) return false;
  for (const channel of ['text', 'meaning']) {
    if ((clean(draft.cardChannels?.[channel]) || null) !== (clean(baseline.cardChannels?.[channel]) || null)) {
      return true;
    }
    const draftSpeakerIds = draft.speakerIds?.[channel] || {};
    const baseSpeakerIds = baseline.speakerIds?.[channel] || {};
    const speakerIdKeys = new Set([...Object.keys(draftSpeakerIds), ...Object.keys(baseSpeakerIds)]);
    for (const key of speakerIdKeys) {
      if ((clean(draftSpeakerIds[key]) || null) !== (clean(baseSpeakerIds[key]) || null)) return true;
    }
    const draftSpeakers = draft.speakers?.[channel] || {};
    const baseSpeakers = baseline.speakers?.[channel] || {};
    const speakerKeys = new Set([...Object.keys(draftSpeakers), ...Object.keys(baseSpeakers)]);
    for (const key of speakerKeys) {
      if ((clean(draftSpeakers[key]) || null) !== (clean(baseSpeakers[key]) || null)) return true;
    }
    if (!profilesEqual(draft.playbackOrder?.[channel], baseline.playbackOrder?.[channel])) {
      return true;
    }
  }
  for (const segment of (Array.isArray(segments) ? segments : [])) {
    for (const channel of ['text', 'meaning']) {
      const draftVal = clean(draft.segmentChannels?.[segment.id]?.[channel]) || null;
      const baseVal = clean(baseline.segmentChannels?.[segment.id]?.[channel]) || null;
      if (draftVal !== baseVal) return true;
    }
  }
  return false;
};

const VoiceSelect = ({ value, inheritedLabel, voices, context = 'general', disabled, onChange, testId }) => {
  const voiceOptions = dedupeBrowserTtsVoices(voices);
  const names = uniqueVoiceNames(voiceOptions);
  const missing = value && !names.includes(value);
  return <select
    value={value || ''}
    disabled={disabled}
    onChange={event => onChange?.(event.target.value || null)}
    className="w-full min-w-0 min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs md:text-[10px] font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
    data-text-voice-override-select={testId}
  >
    <option value="">Inherit • {inheritedLabel || 'default'}</option>
    {missing && <option value={value}>Unavailable in browser • {formatTextStructuredBrowserVoiceLabel(value)}</option>}
    <BrowserTtsVoiceOptgroups voices={voiceOptions} context={context} />
  </select>;
};

const EdgeVoiceSelect = ({ value, inheritedVoiceId, voices, channel = 'text', disabled, onChange, testId }) => {
  const voiceList = Array.isArray(voices) ? voices : [];
  const context = channel === 'meaning' ? 'meaning' : 'main';
  const known = voiceList.some(voice => voice?.id === value);
  return <select
    value={value || ''}
    disabled={disabled}
    onChange={event => onChange?.(event.target.value || null)}
    className="w-full min-w-0 min-h-10 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs md:text-[10px] font-medium text-violet-800 dark:text-violet-200 disabled:opacity-50"
    data-text-download-voice-select={testId}
  >
    <option value="">Inherit Edge • {compactVoiceLabel(inheritedVoiceId)}</option>
    {value && !known && <option value={value} disabled>Unavailable · {value}</option>}
    <EdgeVoiceOptgroups voices={voiceList} context={context} />
  </select>;
};

const DownloadPresetSelect = ({ value, disabled, onChange, testId }) => <select value={value || TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT} disabled={disabled} onChange={event => onChange?.(event.target.value)} className="w-full min-w-0 min-h-10 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-violet-800 dark:text-violet-200 disabled:opacity-50" data-text-card-download-preset={testId}>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.DEFAULT}>DEFAULT • Inherit Workspace Edge</option>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER}>FOLLOW PLAYER • Match TTS Voice</option>
  <option value={TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM}>CUSTOM • Pin Card Edge Voice</option>
</select>;

const CardPlaybackOrderEditor = ({ channel = 'text', cardOrder, globalOrder, availableLocalVoices, disabled, onChange }) => {
  const profiles = Array.isArray(cardOrder?.channels?.[channel]) ? cardOrder.channels[channel] : [];
  const globalProfiles = Array.isArray(globalOrder?.channels?.[channel]) ? globalOrder.channels[channel] : [];
  const voiceIds = [...new Set([...(availableLocalVoices?.channels?.[channel] || []), ...globalProfiles.map(item => item?.voiceId), ...profiles.map(item => item?.voiceId)].map(clean).filter(Boolean))].sort();
  const remaining = voiceIds.filter(voiceId => !profiles.some(item => clean(item?.voiceId).toLowerCase() === voiceId.toLowerCase()));
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= profiles.length) return;
    const next = [...profiles];
    [next[index], next[target]] = [next[target], next[index]];
    onChange?.(next, channel);
  };
  return <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/40 p-2.5" data-text-card-playback-order={channel}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-300">{channel === 'meaning' ? 'ID Local Priority' : 'EN Local Priority'}</span>
      <button type="button" disabled={disabled || !profiles.length} onClick={() => onChange?.([], channel)} className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 text-[8px] font-black text-indigo-600 dark:text-indigo-300 disabled:opacity-30">INHERIT GLOBAL</button>
    </div>
    {profiles.length ? <div className="mt-1.5 space-y-1">{profiles.map((profile, index) => <div key={`${channel}-${profile?.id || profile?.voiceId || index}`} className="flex items-center gap-1 rounded-lg border border-slate-100 dark:border-slate-800 px-2 py-1"><span className="w-4 text-center text-[8px] font-black text-indigo-500">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[9px] font-bold text-slate-600 dark:text-slate-300">{compactVoiceLabel(profile?.voiceId)}</span><button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)} className="min-h-7 min-w-7 text-slate-400 disabled:opacity-25"><ArrowUp className="mx-auto h-3 w-3"/></button><button type="button" disabled={disabled || index === profiles.length - 1} onClick={() => move(index, 1)} className="min-h-7 min-w-7 text-slate-400 disabled:opacity-25"><ArrowDown className="mx-auto h-3 w-3"/></button><button type="button" disabled={disabled} onClick={() => onChange?.(profiles.filter((_, i) => i !== index), channel)} className="min-h-7 min-w-7 text-slate-400 hover:text-red-500 disabled:opacity-25"><Trash2 className="mx-auto h-3 w-3"/></button></div>)}</div> : <p className="mt-1.5 text-[8px] leading-relaxed text-slate-400">Inherits Global: {globalProfiles.map(item => compactVoiceLabel(item?.voiceId)).join(' → ') || 'compatibility fallback'}.</p>}
    <div className="mt-1.5 flex items-center gap-1"><Plus className="h-3 w-3 text-indigo-400"/><select disabled={disabled || !remaining.length} value="" onChange={event => { const voiceId = event.target.value; if (voiceId) onChange?.([...profiles, { engine: 'edge', voiceId }], channel); }} className="min-h-8 min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-[9px] disabled:opacity-40"><option value="">{remaining.length ? 'Add Card priority voice…' : 'No other Ready voice'}</option>{remaining.map(voiceId => <option key={voiceId} value={voiceId}>{compactVoiceLabel(voiceId)}</option>)}</select></div>
  </div>;
};

export const TextStructuredCardAudioPanel = ({
  documentTree,
  block,
  englishVoices = [],
  indonesianVoices = [],
  defaultTextVoiceName = null,
  defaultMeaningVoiceName = null,
  generationPreferences = {},
  edgeGenerationVoices = [],
  playbackOrder = null,
  availableLocalVoices = null,
  cardCoverage = null,
  audioCoverageMap = {},
  runtimeFullAudio = {},
  playbackSourceStatus = null,
  initialSurface = 'player',
  generationRunning = false,
  disabled = false,
  onClose,
  onCardVoiceChange,
  onSegmentVoiceChange,
  onApplyCardPlayerChanges,
  onCardDownloadVoiceChange,
  onCardDownloadModeChange,
  onSegmentDownloadVoiceChange,
  onSegmentDownloadModeChange,
  onPreviewTts,
  onGenerateCardAudio,
  onCancelGeneration,
  onCardPlaybackOrderChange,
  onExportSegmentAudio,
  onExportFullCardAudio
}) => {
  const [activeSurface, setActiveSurface] = useState(() => (initialSurface === 'download' ? 'download' : 'player'));
  const [showSegments, setShowSegments] = useState(false);
  const [showPlayerSegments, setShowPlayerSegments] = useState(true);
  const [expandedSpeakerKey, setExpandedSpeakerKey] = useState(null);
  const [workflowExpanded, setWorkflowExpanded] = useState(false);
  const overlayRef = useLiveOverlayViewportRef(true);
  const segments = Array.isArray(block?.segments) ? block.segments : [];
  const savedPlayerBaseline = useMemo(() => buildInitialPlayerDraft(block, segments), [block, segments]);
  const [playerDraft, setPlayerDraft] = useState(() => buildInitialPlayerDraft(block, segments));

  useEffect(() => {
    setPlayerDraft(buildInitialPlayerDraft(block, segments));
  }, [block, segments]);

  const isPlayerDirty = useMemo(
    () => isPlayerDraftDirty(playerDraft, savedPlayerBaseline, segments),
    [playerDraft, savedPlayerBaseline, segments]
  );

  const draftBlock = useMemo(() => {
    const baseMeta = block?.metadata && typeof block.metadata === 'object' ? { ...block.metadata } : {};
    const draftVoiceProfile = {
      channels: {
        text: clean(playerDraft?.cardChannels?.text) || null,
        meaning: clean(playerDraft?.cardChannels?.meaning) || null
      },
      speakers: {
        text: { ...(playerDraft?.speakers?.text || {}) },
        meaning: { ...(playerDraft?.speakers?.meaning || {}) }
      },
      speakerIds: {
        text: { ...(playerDraft?.speakerIds?.text || {}) },
        meaning: { ...(playerDraft?.speakerIds?.meaning || {}) }
      }
    };
    const draftSegments = segments.map(segment => {
      const segMeta = segment?.metadata && typeof segment.metadata === 'object' ? { ...segment.metadata } : {};
      const segVoice = playerDraft?.segmentChannels?.[segment.id] || { text: null, meaning: null };
      return {
        ...segment,
        metadata: {
          ...segMeta,
          audioVoiceOverrideV1: {
            channels: {
              text: clean(segVoice.text) || null,
              meaning: clean(segVoice.meaning) || null
            },
            speakers: { text: {}, meaning: {} },
            speakerIds: { text: {}, meaning: {} }
          }
        }
      };
    });
    return {
      ...block,
      metadata: {
        ...baseMeta,
        audioVoiceOverrideV1: draftVoiceProfile,
        audioPlaybackOrderV1: {
          channels: {
            text: clonePlaybackProfiles(playerDraft?.playbackOrder?.text),
            meaning: clonePlaybackProfiles(playerDraft?.playbackOrder?.meaning)
          }
        }
      },
      segments: draftSegments
    };
  }, [block, segments, playerDraft]);

  const cardProfile = getTextStructuredVoiceOverrideProfile(draftBlock);
  const cardDownloadProfile = getTextStructuredAudioDownloadProfile(block);
  const cardPlaybackOrder = getTextStructuredAudioPlaybackOrder(draftBlock);
  const speakers = useMemo(() => collectTextStructuredCardSpeakers(block), [block]);
  const firstSegment = draftBlock?.segments?.[0] || segments[0] || null;
  const isConversation = block?.blockType === 'conversation';

  const cardChannelCoverage = useMemo(() => {
    const result = {
      text: { total: 0, ready: 0, missing: 0, stale: 0, voices: new Set() },
      meaning: { total: 0, ready: 0, missing: 0, stale: 0, voices: new Set() }
    };
    segments.forEach(segment => {
      ['text', 'meaning'].forEach(channel => {
        const content = clean(channel === 'meaning' ? segment?.meaning : segment?.text);
        if (!content) return;
        const slot = audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, channel)] || { status: 'missing' };
        result[channel].total += 1;
        if (slot.status === 'ready') result[channel].ready += 1;
        else if (slot.status === 'stale' || slot.status === 'other-voice') result[channel].stale += 1;
        else result[channel].missing += 1;
        if (slot.requiredVoiceId) result[channel].voices.add(slot.requiredVoiceId);
      });
    });
    return result;
  }, [segments, audioCoverageMap]);

  const cardFullReadinessByChannel = useMemo(() => {
    const fullArtifacts = getTextStructuredFullAudioArtifacts(block);
    const evaluateChannel = channel => {
      const target = resolveTextStructuredEffectiveDownloadVoice({
        documentTree,
        block,
        segment: firstSegment,
        channel,
        preferences: generationPreferences
      });
      const language = channel === 'meaning' ? (documentTree?.meaningLanguage || 'id') : (documentTree?.textLanguage || 'en');
      const targetVoiceId = clean(target?.voiceId) || (channel === 'meaning' ? clean(generationPreferences?.edgeMeaningVoiceId) : clean(generationPreferences?.edgeTextVoiceId));
      if (isConversation) {
        return {
          channel,
          status: TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING,
          ready: false,
          targetVoiceId: targetVoiceId || null,
          storedArtifactCount: 0
        };
      }
      const profile = targetVoiceId ? {
        engine: 'edge',
        voiceId: targetVoiceId,
        rate: Number(generationPreferences?.edgeRate) || 0,
        pitch: Number(generationPreferences?.edgePitch) || 0
      } : null;
      const readiness = resolveTextStructuredFullArtifactReadiness({
        block,
        channel,
        profile,
        language,
        runtimeFullAudio
      });
      const channelArtifacts = fullArtifacts.filter(item => clean(item?.descriptor?.channel) === channel);
      return {
        channel,
        status: readiness.status || TEXT_STRUCTURED_ARTIFACT_READINESS.MISSING,
        ready: Boolean(readiness.ready && readiness.status === TEXT_STRUCTURED_ARTIFACT_READINESS.READY),
        targetVoiceId: targetVoiceId || null,
        storedArtifactCount: channelArtifacts.length
      };
    };
    return {
      text: evaluateChannel('text'),
      meaning: evaluateChannel('meaning')
    };
  }, [block, documentTree, firstSegment, generationPreferences, isConversation, runtimeFullAudio]);

  const cardVoiceResolutions = useMemo(() => ({
    text: resolveTextStructuredBrowserVoiceResolution({
      documentTree,
      block: draftBlock,
      segment: firstSegment,
      channel: 'text',
      globalVoiceName: defaultTextVoiceName,
      availableBrowserVoices: englishVoices,
      ignoreSegmentOverride: true,
      representationMode: 'full'
    }),
    meaning: resolveTextStructuredBrowserVoiceResolution({
      documentTree,
      block: draftBlock,
      segment: firstSegment,
      channel: 'meaning',
      globalVoiceName: defaultMeaningVoiceName,
      availableBrowserVoices: indonesianVoices,
      ignoreSegmentOverride: true,
      representationMode: 'full'
    })
  }), [documentTree, draftBlock, firstSegment, defaultTextVoiceName, defaultMeaningVoiceName, englishVoices, indonesianVoices]);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const findBrowserVoiceEntry = (voiceName, channel = 'text') => {
    const cleanName = clean(voiceName);
    if (!cleanName) return null;
    const pool = channel === 'meaning' ? indonesianVoices : englishVoices;
    return (Array.isArray(pool) ? pool : []).find(item => clean(item?.name || item?.voiceURI) === cleanName) || cleanName;
  };

  const inheritedFor = (segment, channel, ignoreCard = false) => {
    const safeBlock = ignoreCard ? { ...draftBlock, metadata: {} } : draftBlock;
    const resolved = resolveTextStructuredEffectiveVoiceProfile({
      documentTree,
      block: safeBlock,
      segment: segment ? { ...segment, metadata: { ...(segment.metadata?.speakerIdentityV1 ? { speakerIdentityV1: segment.metadata.speakerIdentityV1 } : {}) } } : null,
      channel,
      defaultVoiceName: channel === 'meaning' ? defaultMeaningVoiceName : defaultTextVoiceName,
      ignoreSegmentOverride: true
    });
    return `${formatTextStructuredBrowserVoiceLabel(findBrowserVoiceEntry(resolved.voiceName, channel))} · ${getTextStructuredVoiceSourceDisplayLabel(resolved.source)}`;
  };

  const handleDraftCardVoiceChange = (channel, voiceName, speaker = null) => {
    const cleanedVoice = clean(voiceName) || null;
    setPlayerDraft(prev => {
      if (speaker?.id) {
        const nextMap = { ...(prev.speakerIds?.[channel] || {}) };
        if (cleanedVoice) nextMap[speaker.id] = cleanedVoice;
        else delete nextMap[speaker.id];
        return {
          ...prev,
          speakerIds: { ...prev.speakerIds, [channel]: nextMap }
        };
      }
      return {
        ...prev,
        cardChannels: { ...prev.cardChannels, [channel]: cleanedVoice }
      };
    });
  };

  const handleDraftSegmentVoiceChange = (segmentId, channel, voiceName) => {
    const cleanedVoice = clean(voiceName) || null;
    setPlayerDraft(prev => ({
      ...prev,
      segmentChannels: {
        ...prev.segmentChannels,
        [segmentId]: {
          ...(prev.segmentChannels?.[segmentId] || { text: null, meaning: null }),
          [channel]: cleanedVoice
        }
      }
    }));
  };

  const handleDraftCardPlaybackOrderChange = (profiles, channel) => {
    setPlayerDraft(prev => ({
      ...prev,
      playbackOrder: {
        ...prev.playbackOrder,
        [channel]: clonePlaybackProfiles(profiles)
      }
    }));
  };

  const handleResetPlayerDraft = () => {
    setPlayerDraft(buildInitialPlayerDraft(block, segments));
  };

  const handleApplyPlayerDraft = () => {
    if (!isPlayerDirty || disabled) return;
    if (typeof onApplyCardPlayerChanges === 'function') {
      onApplyCardPlayerChanges(block.id, {
        cardChannels: { ...playerDraft.cardChannels },
        speakerIds: {
          text: { ...(playerDraft.speakerIds?.text || {}) },
          meaning: { ...(playerDraft.speakerIds?.meaning || {}) }
        },
        speakers: {
          text: { ...(playerDraft.speakers?.text || {}) },
          meaning: { ...(playerDraft.speakers?.meaning || {}) }
        },
        segmentChannels: { ...playerDraft.segmentChannels },
        playbackOrder: {
          text: clonePlaybackProfiles(playerDraft.playbackOrder?.text),
          meaning: clonePlaybackProfiles(playerDraft.playbackOrder?.meaning)
        }
      });
      return;
    }

    for (const channel of ['text', 'meaning']) {
      if ((clean(playerDraft.cardChannels?.[channel]) || null) !== (clean(savedPlayerBaseline.cardChannels?.[channel]) || null)) {
        onCardVoiceChange?.(block.id, channel, playerDraft.cardChannels?.[channel] || null, null);
      }
      speakers.forEach(({ id, key, label }) => {
        const draftSpeakerVoice = clean(playerDraft.speakerIds?.[channel]?.[id] || playerDraft.speakers?.[channel]?.[key]) || null;
        const baseSpeakerVoice = clean(savedPlayerBaseline.speakerIds?.[channel]?.[id] || savedPlayerBaseline.speakers?.[channel]?.[key]) || null;
        if (draftSpeakerVoice !== baseSpeakerVoice) {
          onCardVoiceChange?.(block.id, channel, draftSpeakerVoice, { id, label });
        }
      });
      if (!profilesEqual(playerDraft.playbackOrder?.[channel], savedPlayerBaseline.playbackOrder?.[channel])) {
        const profiles = clonePlaybackProfiles(playerDraft.playbackOrder?.[channel]);
        onCardPlaybackOrderChange?.(block.id, profiles, channel);
      }
    }

    segments.forEach(segment => {
      for (const channel of ['text', 'meaning']) {
        const draftSegVoice = clean(playerDraft.segmentChannels?.[segment.id]?.[channel]) || null;
        const baseSegVoice = clean(savedPlayerBaseline.segmentChannels?.[segment.id]?.[channel]) || null;
        if (draftSegVoice !== baseSegVoice) {
          onSegmentVoiceChange?.(segment.id, channel, draftSegVoice);
        }
      }
    });
  };

  const speakerOverrideCount = speakers.reduce((count, { id, key }) => (
    count
    + ((cardProfile.speakerIds?.text?.[id] || cardProfile.speakers?.text?.[key]) ? 1 : 0)
    + ((cardProfile.speakerIds?.meaning?.[id] || cardProfile.speakers?.meaning?.[key]) ? 1 : 0)
  ), 0);

  const paragraphHasVoiceOverride = Boolean(cardProfile.channels?.text || cardProfile.channels?.meaning);
  const unavailableEdgeVoicesByChannel = Object.fromEntries(
    ['text', 'meaning'].map(channel => {
      const info = cardChannelCoverage[channel];
      const fallbackTargetVoiceId = resolveTextStructuredEffectiveDownloadVoice({
        documentTree,
        block,
        segment: firstSegment,
        channel,
        preferences: generationPreferences
      })?.voiceId;
      const targetVoiceIds = [...info.voices].length
        ? [...info.voices]
        : (fallbackTargetVoiceId ? [fallbackTargetVoiceId] : []);
      return [channel, targetVoiceIds.filter(voiceId => isEdgeVoiceUnavailable(voiceId, edgeGenerationVoices))];
    })
  );
  const unavailableCardEdgeVoices = [
    ...new Set([
      ...(unavailableEdgeVoicesByChannel.text || []),
      ...(unavailableEdgeVoicesByChannel.meaning || [])
    ])
  ];
  const hasUnavailableCardEdgeVoice = unavailableCardEdgeVoices.length > 0;
  const cardPlaybackStatus = playbackSourceStatus && (!playbackSourceStatus.blockId || playbackSourceStatus.blockId === block?.id)
    ? playbackSourceStatus
    : null;

  return <div
    ref={overlayRef}
    className="fixed left-0 top-0 z-[90] box-border flex items-end md:items-center justify-center overflow-hidden overscroll-none bg-slate-950/45 p-1.5 md:p-4 animate-in fade-in duration-150"
    data-text-card-audio-panel={block?.id}
    role="presentation"
    onClick={onClose}
  >
    <div
      className="prolingo-text-audio-sheet flex w-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Audio settings for ${block?.title || 'Text card'}`}
      onClick={event => event.stopPropagation()}
    >
      {/* Header */}
      <div className="prolingo-text-audio-sheet-header sticky top-0 z-10 shrink-0 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3.5 py-2.5 md:px-4 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center"><Volume2 className="w-4 h-4"/></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs md:text-sm font-black text-slate-800 dark:text-white truncate">Card Audio • {block?.title || 'Card'}</h3>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase ${isConversation ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'}`}>
                {isConversation ? 'Conversation' : 'Paragraph'}
              </span>
              {isPlayerDirty && (
                <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-800 dark:text-amber-300" data-text-card-player-dirty-badge="true">
                  Unsaved Draft
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {isConversation ? `${speakers.length} speaker${speakers.length === 1 ? '' : 's'} detected` : 'Player TTS & Edge Download surfaces'} • {segments.length} segment{segments.length === 1 ? '' : 's'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 shrink-0 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center active:scale-95 transition" aria-label="Close audio settings"><X className="w-4 h-4"/></button>
        </div>

        {/* Surface Switcher: Player vs Download */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1" role="tablist" aria-label="Card audio surfaces" data-text-card-audio-tabs="true">
          {[
            ['player', 'Player (TTS & Priority)'],
            ['download', 'Download (Edge MP3)']
          ].map(([surfaceId, surfaceLabel]) => (
            <button
              key={surfaceId}
              type="button"
              role="tab"
              aria-selected={activeSurface === surfaceId}
              onClick={() => setActiveSurface(surfaceId)}
              data-text-card-audio-tab={surfaceId}
              className={`min-h-9 rounded-lg px-2.5 py-1.5 text-[10px] font-black transition-all ${
                activeSurface === surfaceId
                  ? surfaceId === 'download'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {surfaceLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 md:p-4 space-y-3" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
        {activeSurface === 'player' ? (
          <div className="space-y-3" data-text-card-audio-player-surface="true">
            {/* 1. Effective Voice Reporting & Inheritance Chain */}
            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/70 bg-indigo-50/40 dark:bg-indigo-950/15 p-3 space-y-2.5" data-text-card-effective-voice-reporting="true">
              <div className="flex items-start gap-2" data-text-simple-audio-rule="true">
                <Headphones className="w-4 h-4 mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0"/>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-100">Browser TTS Voice Hierarchy & Effective Resolution</p>
                    <span className="rounded bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 text-[8px] font-black uppercase text-indigo-700 dark:text-indigo-300">Browser SpeechSynthesis</span>
                  </div>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-slate-600 dark:text-slate-300">
                    Full Card TTS resolves <span className="font-bold">Card Browser TTS Voice → Workspace Narrator → Global Browser TTS</span> (ignoring Segment overrides). Split TTS resolves <span className="font-bold">Segment override → Card override → Workspace Narrator → Global Browser TTS</span>. Browser TTS voices (including Microsoft system/browser voices) are live speech synthesis, not Edge Neural MP3 downloads.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2" data-text-card-voice-hierarchy-grid="true">
                {['text', 'meaning'].map(channel => {
                  const isMeaning = channel === 'meaning';
                  const res = cardVoiceResolutions[channel];
                  return (
                    <div
                      key={channel}
                      className={`rounded-xl border p-2.5 space-y-1.5 ${
                        isMeaning
                          ? 'border-emerald-200 dark:border-emerald-900/70 bg-white/90 dark:bg-slate-900/50'
                          : 'border-indigo-200 dark:border-indigo-900/70 bg-white/90 dark:bg-slate-900/50'
                      }`}
                      data-text-card-voice-resolution={channel}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={`text-[9px] font-black uppercase ${isMeaning ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                          {isMeaning ? 'ID (Meaning) Browser TTS' : 'EN (Text) Browser TTS'}
                        </span>
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[8px] font-black text-slate-600 dark:text-slate-300">
                          {res.effectiveSourceLabel}
                        </span>
                      </div>

                      <div className="space-y-1 text-[9px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">Global Browser TTS:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate" title={res.globalBrowserVoiceName || 'Browser system default'}>
                            {formatTextStructuredBrowserVoiceLabel(res.globalBrowserVoiceName)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">Workspace Narrator:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate" title={res.workspaceNarratorVoiceName || 'Inherits Global Browser TTS'}>
                            {res.workspaceNarratorVoiceName ? formatTextStructuredBrowserVoiceLabel(res.workspaceNarratorVoiceName) : 'Inherits Global Browser TTS'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">Card Override:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate" title={res.cardOverrideVoiceName || 'Inherits Workspace / Global'}>
                            {res.cardOverrideVoiceName ? formatTextStructuredBrowserVoiceLabel(res.cardOverrideVoiceName) : 'Inherits Workspace / Global'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-1">
                          <span className="text-slate-500 dark:text-slate-400">Requested Voice:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                            {formatTextStructuredBrowserVoiceLabel(res.requestedVoiceName)} ({res.requestedSourceLabel})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-slate-700 dark:text-slate-200">Effective Card TTS Voice:</span>
                          <span className={`font-black truncate ${isMeaning ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`} data-text-card-effective-voice={channel}>
                            {formatTextStructuredBrowserVoiceLabel(res.effectiveVoiceName)} ({res.effectiveSourceLabel})
                          </span>
                        </div>
                      </div>

                      {res.fallbackUsed && res.fallbackReason && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 text-[8px] font-semibold text-amber-800 dark:text-amber-200 flex items-start gap-1.5" data-text-card-voice-fallback-warning={channel}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"/>
                          <span>{res.fallbackReason}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Actual Playback Source / Voice Status */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 px-3 py-2 text-[9px]" data-text-card-actual-playback-source="true">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">Actual Playback Source & Voice</span>
                  <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                    cardPlaybackStatus
                      ? cardPlaybackStatus.mode === 'local'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {cardPlaybackStatus
                      ? (cardPlaybackStatus.mode === 'local' ? 'Local MP3' : 'Browser TTS')
                      : 'Idle (Ready to Play)'}
                  </span>
                </div>
                {cardPlaybackStatus ? (
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    <span className="font-bold">{cardPlaybackStatus.mode === 'local' ? 'Local MP3' : 'Browser TTS'}</span>
                    {' • '}
                    <span>Voice: {cardPlaybackStatus.effectiveVoice || cardPlaybackStatus.voice || 'Browser system default'}</span>
                    {cardPlaybackStatus.effectiveSourceLabel ? ` (${cardPlaybackStatus.effectiveSourceLabel})` : ''}
                    {cardPlaybackStatus.requestedVoice && cardPlaybackStatus.requestedVoice !== cardPlaybackStatus.effectiveVoice
                      ? ` • Requested: ${cardPlaybackStatus.requestedVoice}`
                      : ''}
                    {cardPlaybackStatus.fallbackReason ? ` • ${cardPlaybackStatus.fallbackReason}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Play this Card or a Segment to inspect live Local MP3 versus Browser TTS runtime routing.
                  </p>
                )}
              </div>
            </div>

            {/* 2. Card Browser TTS Override */}
            {!isConversation && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-3 space-y-2.5" data-text-paragraph-audio-profile="true">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Card Browser TTS Override</span>
                  <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${paragraphHasVoiceOverride ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {paragraphHasVoiceOverride ? 'Custom Active' : 'Inherits Workspace / Global'}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {['text', 'meaning'].map(channel => {
                    const isMeaning = channel === 'meaning';
                    const value = playerDraft.cardChannels?.[channel] || '';
                    return <label key={channel} className="block min-w-0">
                      <span className="mb-1 block text-[9px] font-black uppercase tracking-wide text-slate-500">{isMeaning ? 'ID (Meaning) Card TTS Override' : 'EN (Text) Card TTS Override'}</span>
                      <VoiceSelect
                        value={value}
                        inheritedLabel={inheritedFor(firstSegment, channel, true)}
                        voices={isMeaning ? indonesianVoices : englishVoices}
                        context={isMeaning ? 'meaning' : 'main'}
                        disabled={disabled}
                        onChange={voiceName => handleDraftCardVoiceChange(channel, voiceName, null)}
                        testId={`${block.id}:${channel}`}
                      />
                    </label>;
                  })}
                </div>
              </div>
            )}

            {isConversation && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-3 space-y-2" data-text-conversation-card-voices="true">
                <div className="flex items-center gap-2 px-0.5">
                  <Users className="w-4 h-4 text-sky-500"/>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Detected Speakers ({speakers.length || 0})</p>
                    <p className="text-[8px] text-slate-400">{speakerOverrideCount} custom Card TTS assignment{speakerOverrideCount === 1 ? '' : 's'}</p>
                  </div>
                </div>

                {speakers.length === 0 && <div className="rounded-xl border border-dashed border-sky-200 dark:border-sky-900 p-3 text-center text-[9px] text-slate-400">Add speaker names to Conversation Segments first.</div>}

                {speakers.map(({ id, key, label }) => {
                  const sample = draftBlock.segments.find(segment => segment?.metadata?.speakerIdentityV1 === id) || draftBlock.segments.find(segment => normalizeTextStructuredSpeakerKey(segment?.speaker) === key) || null;
                  const speakerExpanded = expandedSpeakerKey === id;
                  const enOverride = cardProfile.speakerIds?.text?.[id] || cardProfile.speakers?.text?.[key] || '';
                  const idOverride = cardProfile.speakerIds?.meaning?.[id] || cardProfile.speakers?.meaning?.[key] || '';
                  const hasOverride = Boolean(enOverride || idOverride);
                  return <div key={id} className={`rounded-xl border overflow-hidden transition ${hasOverride ? 'border-sky-200 dark:border-sky-800 bg-sky-50/55 dark:bg-sky-950/15' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30'}`} data-text-mobile-speaker-card={id}>
                    <button type="button" onClick={() => setExpandedSpeakerKey(current => current === id ? null : id)} className="w-full min-h-11 flex items-center gap-2 px-2.5 py-2 text-left" aria-expanded={speakerExpanded} aria-controls={`speaker-voice-${block.id}-${id}`}>
                      <span className="shrink-0 px-2 py-1 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-[10px] font-black text-sky-700 dark:text-sky-300">{label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] text-slate-600 dark:text-slate-300">{clue(sample, 'text')}</p>
                        <p className="mt-0.5 truncate text-[8px] text-slate-400">{hasOverride ? `Custom • EN ${compactVoiceLabel(enOverride || defaultTextVoiceName)} • ID ${compactVoiceLabel(idOverride || defaultMeaningVoiceName)}` : `Inherits Workspace/Global • ${compactVoiceLabel(defaultTextVoiceName)}`}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${speakerExpanded ? 'rotate-180' : ''}`}/>
                    </button>

                    {speakerExpanded && <div id={`speaker-voice-${block.id}-${id}`} className="grid gap-2 border-t border-slate-100 dark:border-slate-800 p-3 md:grid-cols-2">
                      {['text', 'meaning'].map(channel => {
                        const isMeaning = channel === 'meaning';
                        const value = cardProfile.speakerIds?.[channel]?.[id] || cardProfile.speakers?.[channel]?.[key] || '';
                        return <label key={channel} className="block min-w-0">
                          <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-slate-500">{isMeaning ? 'ID (Meaning) TTS' : 'EN (Text) TTS'}</span>
                          <VoiceSelect value={value} inheritedLabel={inheritedFor(sample, channel, true)} voices={isMeaning ? indonesianVoices : englishVoices} context={isMeaning ? 'meaning' : 'main'} disabled={disabled} onChange={voiceName => handleDraftCardVoiceChange(channel, voiceName, { id, label })} testId={`${block.id}:${id}:${channel}`}/>
                        </label>;
                      })}
                    </div>}
                  </div>;
                })}
              </div>
            )}

            {/* 3. Segment TTS Overrides (Player Surface) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-text-card-player-segment-overrides="true">
              <button type="button" onClick={() => setShowPlayerSegments(value => !value)} className="w-full min-h-10 flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors" aria-expanded={showPlayerSegments}>
                {showPlayerSegments ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Segment TTS Overrides ({segments.length})</span>
                  <span className="ml-2 text-[9px] text-slate-400">Used in Split TTS mode (ignored during Full Card TTS)</span>
                </div>
              </button>
              {showPlayerSegments && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/40">
                  {draftBlock.segments.map((segment, index) => {
                    const segValue = playerDraft.segmentChannels?.[segment.id] || { text: null, meaning: null };
                    return (
                      <div key={segment.id} className="p-3 space-y-2" data-text-player-segment-voice-row={segment.id}>
                        <div className="flex items-start gap-2">
                          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-slate-100 dark:bg-slate-800 px-1 text-[9px] font-black text-slate-600 dark:text-slate-300">#{index + 1}</span>
                          <p className="min-w-0 flex-1 text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">{segment.speaker ? `${segment.speaker} • ` : ''}{clue(segment, 'text')}</p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {['text', 'meaning'].map(channel => {
                            const isMeaning = channel === 'meaning';
                            const value = segValue[channel] || '';
                            const inherited = resolveTextStructuredEffectiveVoiceProfile({
                              documentTree,
                              block: draftBlock,
                              segment: { ...segment, metadata: { ...(segment.metadata?.speakerIdentityV1 ? { speakerIdentityV1: segment.metadata.speakerIdentityV1 } : {}) } },
                              channel,
                              defaultVoiceName: isMeaning ? defaultMeaningVoiceName : defaultTextVoiceName,
                              ignoreSegmentOverride: true
                            });
                            return (
                              <div key={channel} className="flex min-w-0 items-center gap-1.5">
                                <div className="min-w-0 flex-1">
                                  <VoiceSelect
                                    value={value}
                                    inheritedLabel={`${formatTextStructuredBrowserVoiceLabel(findBrowserVoiceEntry(inherited.voiceName, channel))} · ${getTextStructuredVoiceSourceDisplayLabel(inherited.source)}`}
                                    voices={isMeaning ? indonesianVoices : englishVoices}
                                    context={isMeaning ? 'meaning' : 'main'}
                                    disabled={disabled}
                                    onChange={voiceName => handleDraftSegmentVoiceChange(segment.id, channel, voiceName)}
                                    testId={`${segment.id}:${channel}`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={disabled || (isMeaning ? !segment.meaning : !segment.text)}
                                  onClick={() => onPreviewTts?.(segment.id, channel)}
                                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 disabled:opacity-35 active:scale-95 transition"
                                  title={`Preview ${isMeaning ? 'ID' : 'EN'} Browser TTS`}
                                >
                                  <Play className="w-3.5 h-3.5 fill-current"/>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Card Local Voice Priority Override (Player Surface) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/35 p-3 space-y-2" data-text-card-playback-advanced="true">
              <div className="flex items-center gap-1.5">
                <ListOrdered className="h-3.5 w-3.5 text-indigo-500"/>
                <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300">Card Local Voice Priority Override</span>
              </div>
              <p className="text-[9px] text-slate-500 dark:text-slate-400">
                Optional per-Card priority override when multiple downloaded voices exist. Empty lists inherit the Global Text playback order.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <CardPlaybackOrderEditor
                  channel="text"
                  cardOrder={cardPlaybackOrder}
                  globalOrder={playbackOrder}
                  availableLocalVoices={availableLocalVoices}
                  disabled={disabled || generationRunning}
                  onChange={(profiles, channel) => handleDraftCardPlaybackOrderChange(profiles, channel)}
                />
                <CardPlaybackOrderEditor
                  channel="meaning"
                  cardOrder={cardPlaybackOrder}
                  globalOrder={playbackOrder}
                  availableLocalVoices={availableLocalVoices}
                  disabled={disabled || generationRunning}
                  onChange={(profiles, channel) => handleDraftCardPlaybackOrderChange(profiles, channel)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3" data-text-card-audio-download-surface="true">
            {/* 1. Split Readiness vs Full Readiness (Strictly Separate) */}
            <div className="space-y-2" data-text-card-split-full-readiness="true">
              <div className="grid grid-cols-2 gap-2" data-text-card-manual-coverage="true">
                {['text', 'meaning'].map(channel => {
                  const info = cardChannelCoverage[channel];
                  const ready = info.total > 0 && info.ready === info.total;
                  const needChannel = info.total > info.ready;
                  const unavailableTargetIds = unavailableEdgeVoicesByChannel[channel] || [];
                  const hasUnavailableTarget = unavailableTargetIds.length > 0;
                  const voiceLabels = [...info.voices].map(compactVoiceLabel);
                  const isMeaning = channel === 'meaning';
                  return <div key={channel} className={`rounded-xl border p-2.5 flex flex-col justify-between gap-1.5 ${hasUnavailableTarget ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/25' : ready ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/15'}`} data-text-card-split-readiness={channel}>
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider ${isMeaning ? 'text-emerald-700 dark:text-emerald-300' : 'text-indigo-700 dark:text-indigo-300'}`}>
                          <span className={`rounded px-1 py-0.5 text-[8px] ${isMeaning ? 'bg-emerald-100 dark:bg-emerald-900/60' : 'bg-indigo-100 dark:bg-indigo-900/60'}`}>{isMeaning ? 'ID' : 'EN'}</span>
                          <span>Split ({isMeaning ? 'Meaning' : 'Text'})</span>
                        </span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black ${ready ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'}`}>
                          {info.ready}/{info.total} READY
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[9px] font-medium text-slate-600 dark:text-slate-300" title={voiceLabels.join(', ')}>
                        Edge target: {voiceLabels.length > 1 ? `Multi-voice (${voiceLabels.join(' + ')})` : (voiceLabels[0] || 'No target')}
                      </p>
                      {(info.missing > 0 || info.stale > 0) && (
                        <p className="mt-0.5 text-[8px] font-semibold text-amber-700 dark:text-amber-300">
                          {info.missing > 0 ? `${info.missing} missing` : ''}{info.missing > 0 && info.stale > 0 ? ' • ' : ''}{info.stale > 0 ? `${info.stale} stale/other` : ''}
                        </p>
                      )}
                      {hasUnavailableTarget && (
                        <p className="mt-1 text-[8px] font-bold text-amber-800 dark:text-amber-200" data-text-card-edge-unavailable={channel}>
                          Unavailable in Edge: {unavailableTargetIds.map(id => formatEdgeVoiceLabel(id, { edgeVoices: edgeGenerationVoices })).join(', ')}. Switch voice to generate.
                        </p>
                      )}
                    </div>
                    {info.total > 0 && (
                      <button
                        type="button"
                        disabled={disabled || generationRunning || !needChannel || hasUnavailableTarget}
                        onClick={() => onGenerateCardAudio?.(block.id, [channel], { missingOnly: true })}
                        className={`min-h-8 w-full rounded-lg border px-2 py-1 text-[9px] font-black transition-colors disabled:opacity-40 ${
                          ready
                            ? 'border-emerald-200 dark:border-emerald-800 bg-white/70 dark:bg-slate-900/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-violet-300 dark:border-violet-700 bg-violet-600 text-white hover:bg-violet-700'
                        }`}
                      >
                        {hasUnavailableTarget ? 'Voice Unavailable' : ready ? `${isMeaning ? 'ID' : 'EN'} Split Complete` : `Generate Missing ${isMeaning ? 'ID' : 'EN'}`}
                      </button>
                    )}
                  </div>;
                })}
              </div>

              {/* Separate Full Artifact Readiness */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-2.5" data-text-card-full-readiness="true">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Full Card Artifact Readiness (Independent from Split)</span>
                  <span className="text-[8px] font-semibold text-slate-400">Generated via Bulk Audio (Full option)</span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {['text', 'meaning'].map(channel => {
                    const fullInfo = cardFullReadinessByChannel[channel];
                    const isMeaning = channel === 'meaning';
                    return (
                      <div
                        key={`full-${channel}`}
                        className={`rounded-lg border px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                          fullInfo.ready
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'
                        }`}
                        data-text-card-full-channel-readiness={channel}
                      >
                        <div className="min-w-0">
                          <span className="text-[9px] font-black text-slate-700 dark:text-slate-200">
                            {isMeaning ? 'ID Full' : 'EN Full'}
                          </span>
                          <p className="truncate text-[8px] text-slate-500 dark:text-slate-400">
                            Target: {compactVoiceLabel(fullInfo.targetVoiceId)}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                            fullInfo.ready
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                              : fullInfo.status === TEXT_STRUCTURED_ARTIFACT_READINESS.STALE
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {fullInfo.ready ? 'FULL READY' : fullInfo.status === TEXT_STRUCTURED_ARTIFACT_READINESS.STALE ? 'FULL STALE' : 'FULL MISSING'}
                          </span>
                          <button
                            type="button"
                            disabled={disabled || isConversation || !fullInfo.ready || generationRunning}
                            onClick={() => onExportFullCardAudio?.(block.id, channel)}
                            data-text-card-full-export={channel}
                            className="min-h-8 px-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-[8px] font-black text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-35 inline-flex items-center gap-1"
                            title={isConversation
                              ? 'Full Card MP3 export is only available for Paragraph cards'
                              : fullInfo.ready
                                ? `Export Ready ${isMeaning ? 'ID' : 'EN'} Full Card MP3`
                                : `Generate Ready ${isMeaning ? 'ID' : 'EN'} Full Card MP3 via Bulk Audio first`}
                          >
                            <FileDown className="w-3 h-3"/>
                            <span>{isMeaning ? 'ID Full MP3' : 'EN Full MP3'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. Card Edge Generation Preset: Default / Follow Player / Custom */}
            <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/45 dark:bg-violet-950/15 p-3 space-y-2.5" data-text-card-download-profile="true">
              <div className="flex items-start gap-2">
                <Server className="w-4 h-4 mt-0.5 text-violet-600 dark:text-violet-300 shrink-0"/>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Card Edge Generation Preset (Local MP3)</p>
                    {cardCoverage && <span className={`shrink-0 rounded-md px-2 py-0.5 text-[8px] font-black ${cardCoverage.needDownload ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}`}>{cardCoverage.covered}/{cardCoverage.total}</span>}
                  </div>
                  <p className="mt-0.5 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Controls which Edge neural voice is generated into local Staging for this Card. Changing this preset never changes your Browser TTS voice.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2" data-text-card-download-presets="true">
                {['text', 'meaning'].map(channel => {
                  const isMeaning = channel === 'meaning';
                  const inherited = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block: { ...block, metadata: {} }, segment: firstSegment, channel, preferences: generationPreferences });
                  const mode = getTextStructuredAudioDownloadChannelMode(block, channel);
                  const value = cardDownloadProfile.channels?.[channel] || '';
                  return <div key={channel} className="rounded-xl border border-violet-100 dark:border-violet-900 bg-white/85 dark:bg-slate-900/40 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-1">
                      <span className="text-[9px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">{isMeaning ? 'ID (Meaning) Preset' : 'EN (Text) Preset'}</span>
                      <span className="text-[8px] font-semibold text-slate-400 truncate max-w-[8rem]" title={inherited.voiceId}>Base: {compactVoiceLabel(inherited.voiceId)}</span>
                    </div>
                    <DownloadPresetSelect value={mode} disabled={disabled} onChange={next => onCardDownloadModeChange?.(block.id, channel, next)} testId={`${block.id}:${channel}`}/>
                    {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM && <div className="mt-1.5"><EdgeVoiceSelect value={value} inheritedVoiceId={inherited.voiceId} voices={edgeGenerationVoices} channel={channel} disabled={disabled} onChange={voiceId => onCardDownloadVoiceChange?.(block.id, channel, voiceId, null)} testId={`${block.id}:download:${channel}`}/></div>}
                    {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER && <p className="mt-1.5 text-[8px] font-semibold text-sky-600 dark:text-sky-300">Maps each segment's effective TTS playback voice to Edge.</p>}
                  </div>;
                })}
              </div>

              {isConversation && <div className="mt-2 pt-2 border-t border-violet-200/60 dark:border-violet-900/60 space-y-2">
                <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Speaker Edge Overrides (optional — overrides Card preset for a specific speaker):</p>
                {speakers.map(({ id, key, label }) => {
                  const sample = segments.find(segment => segment?.metadata?.speakerIdentityV1 === id) || segments.find(segment => normalizeTextStructuredSpeakerKey(segment?.speaker) === key) || firstSegment;
                  return <div key={`download-${id}`} className="rounded-xl border border-violet-100 dark:border-violet-900 bg-white/80 dark:bg-slate-900/40 p-2.5">
                    <p className="mb-1.5 text-[10px] font-black text-violet-700 dark:text-violet-300">{label}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {['text', 'meaning'].map(channel => {
                        const inherited = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block: { ...block, metadata: { ...block.metadata, audioDownloadProfileV1: { ...cardDownloadProfile, speakers: { text: {}, meaning: {} }, speakerIds: { text: {}, meaning: {} } } } }, segment: sample, channel, preferences: generationPreferences });
                        const value = cardDownloadProfile.speakerIds?.[channel]?.[id] || cardDownloadProfile.speakers?.[channel]?.[key] || '';
                        return <label key={channel} className="block min-w-0">
                          <span className="mb-1 block text-[8px] font-bold text-slate-500">{channel === 'meaning' ? 'ID Edge Voice' : 'EN Edge Voice'}</span>
                          <EdgeVoiceSelect value={value} inheritedVoiceId={inherited.voiceId} voices={edgeGenerationVoices} channel={channel} disabled={disabled} onChange={voiceId => onCardDownloadVoiceChange?.(block.id, channel, voiceId, { id, label })} testId={`${block.id}:${id}:download:${channel}`}/>
                        </label>;
                      })}
                    </div>
                  </div>;
                })}
              </div>}
            </div>

            {/* 3. Effective Target Voices per Segment and Channel */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-3 space-y-2" data-text-card-effective-target-voices="true">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Effective Edge Target Voices per Segment</span>
                <span className="text-[8px] font-semibold text-slate-400">{segments.length} segment{segments.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-1.5">
                {segments.map((segment, index) => {
                  const enTarget = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel: 'text', preferences: generationPreferences });
                  const idTarget = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment, channel: 'meaning', preferences: generationPreferences });
                  return (
                    <div key={`target-${segment.id}`} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[9px]" data-text-segment-effective-target={segment.id}>
                      <span className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[14rem]">
                        #{index + 1} {segment.speaker ? `${segment.speaker} • ` : ''}{clue(segment, 'text')}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 text-[8px] font-bold text-indigo-700 dark:text-indigo-300" title={enTarget.voiceId || ''}>
                          EN: {compactVoiceLabel(enTarget.voiceId)} ({enTarget.mode})
                        </span>
                        <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300" title={idTarget.voiceId || ''}>
                          ID: {compactVoiceLabel(idTarget.voiceId)} ({idTarget.mode})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Advanced Download Overrides & Per-Segment MP3 Export */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden" data-text-segment-voice-overrides="true">
              <button type="button" onClick={() => setShowSegments(value => !value)} className="w-full min-h-11 flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors" aria-expanded={showSegments}>
                {showSegments ? <ChevronDown className="w-4 h-4 text-slate-400"/> : <ChevronRight className="w-4 h-4 text-slate-400"/>}
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Segment overrides ({segments.length})</span>
                  <span className="ml-2 text-[9px] text-slate-400">Per-sentence generation, single-file MP3 export & download overrides</span>
                </div>
                <span className="shrink-0 rounded bg-slate-200/80 dark:bg-slate-700 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-600 dark:text-slate-300">Advanced</span>
              </button>
              {showSegments && <div>
                <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2">
                  <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Advanced per-Segment download controls and single-file tools. Generate stores audio in local Staging; Export MP3 saves a standalone file to your device. Scope exports now live in Bulk Audio.
                  </p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {segments.map((segment, index) => (
                  <div key={segment.id} className="p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-slate-100 dark:bg-slate-800 px-1 text-[9px] font-black text-slate-600 dark:text-slate-300">#{index + 1}</span>
                      <p className="min-w-0 flex-1 text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">{segment.speaker ? `${segment.speaker} • ` : ''}{clue(segment, 'text')}</p>
                    </div>

                    {/* Generate vs Export MP3 per channel */}
                    <div className="grid gap-2 md:grid-cols-2" data-text-segment-manual-audio={segment.id}>
                      {['text', 'meaning'].map(channel => {
                        const isMeaning = channel === 'meaning';
                        const slot = audioCoverageMap?.[buildTextStructuredRuntimeAudioKey(segment.id, channel)] || { status: 'missing' };
                        const hasContent = isMeaning ? Boolean(clean(segment.meaning)) : Boolean(clean(segment.text));
                        const ready = slot.status === 'ready';
                        const targetVoiceId = clean(slot.requiredVoiceId) || resolveTextStructuredEffectiveDownloadVoice({
                          documentTree,
                          block,
                          segment,
                          channel,
                          preferences: generationPreferences
                        })?.voiceId;
                        const segmentVoiceUnavailable = isEdgeVoiceUnavailable(targetVoiceId, edgeGenerationVoices);
                        return <div key={`manual-${channel}`} className={`flex min-w-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 ${segmentVoiceUnavailable ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20' : ready ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'}`}>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${isMeaning ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200'}`}>{isMeaning ? 'ID' : 'EN'}</span>
                          <span className="min-w-0 flex-1 truncate text-[8px] font-medium text-slate-500 dark:text-slate-400" title={targetVoiceId || ''}>
                            {segmentVoiceUnavailable
                              ? `Unavailable • ${compactVoiceLabel(targetVoiceId)}`
                              : ready
                                ? `Ready • ${compactVoiceLabel(targetVoiceId)}`
                                : `${slot.status || 'missing'} • ${compactVoiceLabel(targetVoiceId)}`}
                          </span>
                          <button
                            type="button"
                            disabled={disabled || generationRunning || !hasContent || segmentVoiceUnavailable}
                            onClick={() => onGenerateCardAudio?.(block.id, [channel], { missingOnly: false, segmentIds: [segment.id] })}
                            className="min-h-8 px-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/40 text-[8px] font-black text-violet-700 dark:text-violet-300 hover:bg-violet-100 disabled:opacity-35"
                            title={segmentVoiceUnavailable ? 'Selected Edge voice is unavailable; switch voice before generating' : ready ? 'Regenerate local audio into Staging' : 'Generate local audio into Staging'}
                          >
                            {segmentVoiceUnavailable ? 'Unavailable' : ready ? 'Regen' : 'Generate'}
                          </button>
                          <button
                            type="button"
                            disabled={!ready}
                            onClick={() => onExportSegmentAudio?.(segment.id, channel)}
                            className="min-h-8 px-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-[8px] font-black text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-35 inline-flex items-center gap-1"
                            title="Export this segment's Ready MP3 file to your device"
                          >
                            <FileDown className="w-3 h-3"/>
                            <span>MP3</span>
                          </button>
                        </div>;
                      })}
                    </div>

                    {/* Segment Edge download preset override */}
                    <div className="grid gap-2 border-t border-violet-100 dark:border-violet-900/60 pt-2 md:grid-cols-2" data-text-segment-download-overrides="true">
                      {['text', 'meaning'].map(channel => {
                        const segmentDownload = getTextStructuredAudioDownloadProfile(segment);
                        const mode = getTextStructuredAudioDownloadChannelMode(segment, channel);
                        const inherited = resolveTextStructuredEffectiveDownloadVoice({ documentTree, block, segment: { ...segment, metadata: { ...(segment.metadata?.speakerIdentityV1 ? { speakerIdentityV1: segment.metadata.speakerIdentityV1 } : {}) } }, channel, preferences: generationPreferences });
                        return <div key={`download-${channel}`} className="block min-w-0">
                          <span className="mb-1 block text-[8px] font-bold text-violet-600 dark:text-violet-300">{channel === 'meaning' ? 'ID download preset' : 'EN download preset'}</span>
                          <DownloadPresetSelect value={mode} disabled={disabled} onChange={next => onSegmentDownloadModeChange?.(segment.id, channel, next)} testId={`${segment.id}:${channel}`}/>
                          {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.CUSTOM && <div className="mt-1.5"><EdgeVoiceSelect value={segmentDownload.channels?.[channel] || ''} inheritedVoiceId={inherited.voiceId} voices={edgeGenerationVoices} channel={channel} disabled={disabled} onChange={voiceId => onSegmentDownloadVoiceChange?.(segment.id, channel, voiceId)} testId={`${segment.id}:download:${channel}`}/></div>}
                          {mode === TEXT_STRUCTURED_AUDIO_DOWNLOAD_MODES.FOLLOW_PLAYER && <p className="mt-1.5 text-[8px] font-semibold text-sky-600 dark:text-sky-300">Follows this Segment's effective playback voice.</p>}
                        </div>;
                      })}
                    </div>
                  </div>
                ))}
                </div>
              </div>}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Surface-specific actions */}
      {activeSurface === 'player' ? (
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-white/98 dark:bg-slate-900/98 px-3.5 py-2.5 md:px-4" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }} data-text-card-player-draft-footer="true">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">Card Player Settings</span>
                <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${isPlayerDirty ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}`}>
                  {isPlayerDirty ? 'UNSAVED CHANGES' : 'SAVED'}
                </span>
              </div>
              <p className="mt-0.5 text-[8px] leading-relaxed text-slate-400">
                Reset reverts unsaved Player voice/priority edits without touching stored audio or Download settings.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={disabled || !isPlayerDirty}
                onClick={handleResetPlayerDraft}
                data-text-card-player-reset="true"
                className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-[9px] font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-35 transition-colors inline-flex items-center gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5"/>
                <span>Reset</span>
              </button>
              <button
                type="button"
                disabled={disabled || !isPlayerDirty}
                onClick={handleApplyPlayerDraft}
                data-text-card-player-apply="true"
                className="min-h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 text-[9px] font-black text-white shadow-sm disabled:opacity-35 transition-colors inline-flex items-center gap-1"
              >
                <Check className="h-3.5 w-3.5"/>
                <span>Apply</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-white/98 dark:bg-slate-900/98 px-3.5 py-2.5 md:px-4" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }} data-text-card-audio-generate-footer="true">
          <div className="flex items-center gap-2.5" data-text-card-audio-state="true">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">Card Audio State</span>
                <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${cardCoverage?.needDownload ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'}`}>
                  {cardCoverage?.covered || 0}/{cardCoverage?.total || 0} READY{cardCoverage?.needDownload ? ` • ${cardCoverage.needDownload} MISSING` : ''}
                </span>
              </div>
              <p className="mt-0.5 text-[8px] leading-relaxed text-slate-400">
                Generates local Split audio into Staging (shared RF deduplicated). Audio-Only and Portable ZIP exports are centralized in Bulk Audio.
              </p>
            </div>
            {generationRunning
              ? <button type="button" onClick={() => onCancelGeneration?.()} className="min-h-10 shrink-0 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3.5 text-[9px] font-black text-red-600 hover:bg-red-100 transition-colors"><Square className="mr-1 inline h-3 w-3 fill-current"/>STOP</button>
              : <button type="button" disabled={disabled || hasUnavailableCardEdgeVoice || !cardCoverage?.needDownload} onClick={() => onGenerateCardAudio?.(block.id, ['text', 'meaning'], { missingOnly: true })} data-text-card-generate-missing="true" className="min-h-10 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-700 px-3.5 text-[9px] font-black text-white shadow-sm disabled:opacity-35 transition-colors"><Download className="mr-1.5 inline h-3.5 w-3.5"/>GENERATE MISSING</button>}
          </div>
          {hasUnavailableCardEdgeVoice && (
            <p className="mt-1.5 text-[8px] font-bold text-amber-800 dark:text-amber-200" role="alert" data-text-card-footer-unavailable-warning="true">
              Unavailable Edge voice selected ({unavailableCardEdgeVoices.map(id => formatEdgeVoiceLabel(id, { edgeVoices: edgeGenerationVoices })).join(', ')}). Switch voice before generating.
            </p>
          )}

          <button type="button" onClick={() => setWorkflowExpanded(value => !value)} className="mt-1.5 inline-flex items-center gap-1 min-h-7 text-[8px] font-black uppercase tracking-wider text-slate-400 hover:text-violet-600 transition-colors" aria-expanded={workflowExpanded}>
            {workflowExpanded ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
            <span>{workflowExpanded ? 'HIDE ADVANCED REGENERATE' : 'ADVANCED REGENERATE CARD SPLIT'}</span>
          </button>

          {workflowExpanded && <div className="mt-1.5 rounded-xl border border-violet-100 dark:border-violet-900 bg-violet-50/35 dark:bg-violet-950/10 p-2.5 space-y-2" data-text-card-audio-advanced-generation="true">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[8px] leading-relaxed text-slate-500 dark:text-slate-400">Force-regenerate every Split slot in this Card with the current Edge profile.</p>
              <button type="button" disabled={disabled || generationRunning || hasUnavailableCardEdgeVoice || !cardCoverage?.total} onClick={() => onGenerateCardAudio?.(block.id, ['text', 'meaning'], { missingOnly: false })} className="shrink-0 min-h-8 rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 px-2.5 text-[8px] font-black text-violet-700 dark:text-violet-300 hover:bg-violet-50 disabled:opacity-35">REGENERATE CARD SPLIT</button>
            </div>
          </div>}
        </div>
      )}
    </div>
  </div>;
};

export default TextStructuredCardAudioPanel;
