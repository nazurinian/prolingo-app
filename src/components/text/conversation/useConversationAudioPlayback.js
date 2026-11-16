import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveStructuredTextPlaybackList,
  TEXT_STRUCTURED_PLAYBACK_CONTEXT,
  TEXT_STRUCTURED_PLAYBACK_SCOPES
} from '../../../domain/text/textStructuredPlaybackDomain.js';
import {
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  TEXT_STRUCTURED_ORDER_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  TEXT_STRUCTURED_REPEAT_MODES
} from '../../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  buildTextStructuredBlockRuntimePlaybackPlan,
  TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES
} from '../../../domain/text/textStructuredRuntimePlaybackPlanDomain.js';
import { resolveTextStructuredBrowserVoiceResolution } from '../../../domain/text/textStructuredVoiceAssignmentDomain.js';
import {
  executeBrowserTtsPlaybackService,
  isBrowserTtsSpeechSupported
} from '../../../services/audio/audioPlaybackSideEffectService.js';
import { executeForceStopPlaybackService } from '../../../services/playback/playbackInteractionService.js';
import {
  executePausePlayback,
  executeResumePlayback,
  executeSafePlayTransition,
  executeSettlePlaybackPromise,
  executeWaitWhilePaused
} from '../../../services/playback/playbackRuntimeControlService.js';
import { executeStructuredTextRuntimeAudioPlaybackService } from '../../../services/playback/textStructuredAudioRuntimeService.js';
import { executeStructuredTextPlaybackSessionService } from '../../../services/playback/textStructuredPlaybackSessionService.js';

const EMPTY_MAP = Object.freeze({});

const NOOP_SYNTH = Object.freeze({
  paused: false,
  speaking: false,
  cancel: () => {},
  pause: () => {},
  resume: () => {},
  getVoices: () => []
});

const resolveSafeSynth = injected => {
  const candidate = injected || (typeof window !== 'undefined' ? window.speechSynthesis : null);
  if (!candidate || typeof candidate !== 'object') return NOOP_SYNTH;
  return {
    get paused() { return Boolean(candidate.paused); },
    get speaking() { return Boolean(candidate.speaking); },
    cancel: () => candidate.cancel?.(),
    pause: () => candidate.pause?.(),
    resume: () => candidate.resume?.(),
    ...(typeof candidate.speak === 'function' ? { speak: utterance => candidate.speak(utterance) } : {}),
    getVoices: () => (typeof candidate.getVoices === 'function' ? candidate.getVoices() : [])
  };
};

const useInstalledBrowserVoices = explicitVoices => {
  const [voices, setVoices] = useState(() => {
    if (Array.isArray(explicitVoices)) return explicitVoices;
    if (typeof window !== 'undefined' && typeof window.speechSynthesis?.getVoices === 'function') {
      return window.speechSynthesis.getVoices() || [];
    }
    return [];
  });

  useEffect(() => {
    if (Array.isArray(explicitVoices)) return undefined;
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    const synth = window.speechSynthesis;
    const refresh = () => {
      if (typeof synth.getVoices === 'function') {
        setVoices(synth.getVoices() || []);
      }
    };
    refresh();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refresh);
      return () => synth.removeEventListener('voiceschanged', refresh);
    }
    return undefined;
  }, [explicitVoices]);

  return Array.isArray(explicitVoices) ? explicitVoices : voices;
};

/**
 * Coordinates ProLingo's existing structured playback session executor for persistent Conversation Scenes/Turns/Sentences.
 */
export const useConversationAudioPlayback = ({
  snapshot = null,
  documentTree = null,
  runtimeAudioUrls = EMPTY_MAP,
  runtimeFullAudio = EMPTY_MAP,
  audioConfig = EMPTY_MAP,
  availableBrowserVoices = null,
  audioRuntimeHooks = null,
  isMobile = false
} = {}) => {
  const playbackSessionRef = useRef(0);
  const playbackContextRef = useRef(null);
  const stopSignalRef = useRef(false);
  const pauseStateRef = useRef(false);
  const currentAudioObjRef = useRef(null);
  const currentUtteranceRef = useRef(null);
  const ttsReplayRef = useRef(null);
  const playbackResolveRef = useRef(null);
  const silentAudioRef = useRef(null);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const objectUrlsByBlobRef = useRef(new Map());

  const [isPlaying, setIsPlayingState] = useState(false);
  const [isPaused, setIsPausedState] = useState(false);
  const [playingContext, setPlayingContext] = useState(null);
  const [playingIndex, setPlayingIndex] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [speakingPart, setSpeakingPart] = useState(null);
  const [resumeCursorSegmentId, setResumeCursorSegmentId] = useState(null);
  const [playbackSourceStatus, setPlaybackSourceStatus] = useState(null);
  const [playbackLogs, setPlaybackLogs] = useState([]);
  const [failedVariantIds, setFailedVariantIds] = useState({});
  // The active executor retains callbacks across renders. Share the same failure
  // telemetry synchronously so later steps/repeat passes cannot retry failed bytes.
  const failedVariantIdsRef = useRef(EMPTY_MAP);
  const markFailedVariant = useCallback(id => {
    if (!id || failedVariantIdsRef.current[id]) return;
    failedVariantIdsRef.current = { ...failedVariantIdsRef.current, [id]: true };
    setFailedVariantIds(failedVariantIdsRef.current);
  }, []);

  const setIsPlaying = useCallback(next => {
    const bool = Boolean(next);
    isPlayingRef.current = bool;
    setIsPlayingState(bool);
  }, []);

  const setIsPaused = useCallback(next => {
    const bool = Boolean(next);
    isPausedRef.current = bool;
    pauseStateRef.current = bool;
    setIsPausedState(bool);
  }, []);

  const addLog = useCallback((tag, message) => {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tag: String(tag || 'Audio'), message: String(message || '') };
    setPlaybackLogs(prev => [entry, ...prev].slice(0, 24));
    audioRuntimeHooks?.onLog?.(entry);
  }, [audioRuntimeHooks]);

  const installedVoices = useInstalledBrowserVoices(availableBrowserVoices);
  const synth = useMemo(() => resolveSafeSynth(audioRuntimeHooks?.speechSynth), [audioRuntimeHooks?.speechSynth]);

  const settlePlaybackPromise = useCallback(() => {
    executeSettlePlaybackPromise({ playbackResolveRef });
  }, []);

  const waitWhilePaused = useCallback(
    () => executeWaitWhilePaused({ pauseStateRef, stopSignalRef }),
    []
  );

  const forceStopAll = useCallback(() => {
    executeForceStopPlaybackService({
      playbackSessionRef,
      stopSignalRef,
      pauseStateRef,
      currentAudioObjRef,
      synth,
      settlePlaybackPromise,
      currentUtteranceRef,
      silentAudioRef,
      setIsPlaying,
      setIsPaused,
      setSpeakingPart,
      setIndependentPlayingId: () => {},
      playbackContextRef
    });
    setPlayingIndex(null);
  }, [synth, settlePlaybackPromise, setIsPlaying, setIsPaused]);

  const safePlayTransition = useCallback(
    actionCallback => executeSafePlayTransition({
      forceStopAll,
      playbackSessionRef,
      stopSignalRef,
      pauseStateRef,
      actionCallback
    }),
    [forceStopAll]
  );

  const resolveBlobObjectUrl = useCallback(runtime => {
    if (runtime?.url) return runtime.url;
    if (typeof Blob !== 'undefined' && runtime?.blob instanceof Blob && runtime.blob.size > 0) {
      const existing = objectUrlsByBlobRef.current.get(runtime.blob);
      if (existing) return existing;
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const created = URL.createObjectURL(runtime.blob);
        objectUrlsByBlobRef.current.set(runtime.blob, created);
        return created;
      }
    }
    return null;
  }, []);

  const cfgChannelMode = audioConfig?.playbackChannelMode || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY;
  const cfgRepresentation = audioConfig?.playbackRepresentationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    ? TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    : TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;
  const cfgOrderMode = audioConfig?.playbackOrderMode || TEXT_STRUCTURED_ORDER_MODES.SEQUENTIAL;
  const cfgRepeatMode = audioConfig?.repeatMode || TEXT_STRUCTURED_REPEAT_MODES.ONCE;
  const cfgSourceMode = audioConfig?.audioSourceMode || TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST;
  const cfgRate = Number(audioConfig?.globalPlaybackRate) || 1;
  const cfgGlobalOrder = audioConfig?.globalPlaybackOrder || null;
  const cfgCustomLocalVoice = audioConfig?.customLocalVoiceId || null;
  const cfgPreferences = audioConfig?.preferences || null;

  const normalizedConfig = useMemo(() => ({
    playbackChannelMode: cfgChannelMode,
    playbackRepresentationMode: cfgRepresentation,
    playbackOrderMode: cfgOrderMode,
    repeatMode: cfgRepeatMode,
    audioSourceMode: cfgSourceMode,
    globalPlaybackRate: cfgRate,
    globalPlaybackOrder: cfgGlobalOrder,
    customLocalVoiceId: cfgCustomLocalVoice,
    preferences: cfgPreferences
  }), [
    cfgChannelMode,
    cfgRepresentation,
    cfgOrderMode,
    cfgRepeatMode,
    cfgSourceMode,
    cfgRate,
    cfgGlobalOrder,
    cfgCustomLocalVoice,
    cfgPreferences
  ]);

  const workspaceKey = `${documentTree?.id || ''}:${documentTree?.uid || ''}`;
  const prevWorkspaceKeyRef = useRef(workspaceKey);
  const prevSnapshotRef = useRef(snapshot);
  const prevBindingsKeyRef = useRef({ runtimeAudioUrls, runtimeFullAudio, normalizedConfig });

  // Cancel stale playback immediately when Workspace switches, fixture resets, snapshot mutates, or audio config changes.
  useEffect(() => {
    const workspaceChanged = prevWorkspaceKeyRef.current !== workspaceKey;
    const snapshotChanged = prevSnapshotRef.current !== snapshot;
    const bindingsChanged = (
      prevBindingsKeyRef.current.runtimeAudioUrls !== runtimeAudioUrls
      || prevBindingsKeyRef.current.runtimeFullAudio !== runtimeFullAudio
      || prevBindingsKeyRef.current.normalizedConfig !== normalizedConfig
    );
    if (!workspaceChanged && !snapshotChanged && !bindingsChanged) return;

    prevWorkspaceKeyRef.current = workspaceKey;
    prevSnapshotRef.current = snapshot;
    prevBindingsKeyRef.current = { runtimeAudioUrls, runtimeFullAudio, normalizedConfig };

    const wasActive = isPlayingRef.current || isPausedRef.current;
    // Invalidate the session token even during the 120 ms safe-Play transition.
    forceStopAll();
    if (wasActive) {
      addLog('Session', workspaceChanged ? 'Stopped playback on Workspace/fixture change.' : 'Cancelled stale playback plan after snapshot or audio settings change.');
    }
    failedVariantIdsRef.current = EMPTY_MAP;
    setFailedVariantIds(prev => (Object.keys(prev).length ? EMPTY_MAP : prev));
    if (workspaceChanged) {
      setResumeCursorSegmentId(prev => (prev === null ? prev : null));
      setCurrentIndex(prev => (prev === null ? prev : null));
      setActiveBlockId(prev => (prev === null ? prev : null));
      setPlaybackSourceStatus(prev => (prev === null ? prev : null));
    } else if (documentTree) {
      const validIds = new Set(resolveStructuredTextPlaybackList(documentTree).map(item => item.id));
      setResumeCursorSegmentId(prev => (prev && validIds.has(prev) ? prev : null));
      setCurrentIndex(prev => (prev && validIds.has(prev) ? prev : null));
    } else {
      setResumeCursorSegmentId(prev => (prev === null ? prev : null));
      setCurrentIndex(prev => (prev === null ? prev : null));
      setActiveBlockId(prev => (prev === null ? prev : null));
    }
  }, [workspaceKey, snapshot, documentTree, runtimeAudioUrls, runtimeFullAudio, normalizedConfig, forceStopAll, addLog]);

  useEffect(() => {
    const blobUrlMap = objectUrlsByBlobRef.current;
    return () => {
      forceStopAll();
      blobUrlMap.forEach(url => {
        try {
          if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
        } catch { /* noop */ }
      });
      blobUrlMap.clear();
    };
  }, [forceStopAll]);

  const buildBlockPlan = useCallback(({ block, fullBlock = null, channel = 'text', allowFullArtifact = true, segmentIds = null, representationMode = normalizedConfig.playbackRepresentationMode } = {}) => {
    const targetBlock = fullBlock || block;
    if (!documentTree || !targetBlock) return null;
    const globalTtsOnly = normalizedConfig.audioSourceMode === TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY;
    return buildTextStructuredBlockRuntimePlaybackPlan({
      documentTree,
      block: targetBlock,
      channel: channel === 'meaning' ? 'meaning' : 'text',
      segmentIds,
      representationMode,
      audioVariants: snapshot?.audioVariants || [],
      runtimeAudioUrls,
      runtimeFullAudio,
      preferences: normalizedConfig.preferences,
      globalPlaybackRate: normalizedConfig.globalPlaybackRate,
      globalPlaybackOrder: normalizedConfig.globalPlaybackOrder,
      audioSourceMode: normalizedConfig.audioSourceMode,
      customLocalVoiceId: normalizedConfig.customLocalVoiceId,
      globalTtsOnly,
      allowFullArtifact
    });
  }, [documentTree, snapshot, runtimeAudioUrls, runtimeFullAudio, normalizedConfig]);

  const speakWithResolvedBrowserTts = useCallback(async ({
    textToRead,
    block,
    segment,
    item,
    channel,
    requestedVoiceName = null,
    requestedSource = null,
    playbackRate = 1,
    representation = 'split',
    playbackSessionId,
    unavailableBinaryFallback = false,
    step = null
  }) => {
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    if (!playbackStillCurrent()) return;

    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const defaultVoiceName = normalizedChannel === 'meaning'
      ? (normalizedConfig.preferences?.playbackMeaningVoiceName || null)
      : (normalizedConfig.preferences?.playbackTextVoiceName || null);
    const voiceResolution = resolveTextStructuredBrowserVoiceResolution({
      documentTree,
      block,
      segment,
      channel: normalizedChannel,
      globalVoiceName: defaultVoiceName,
      requestedVoiceName: requestedVoiceName || null,
      requestedSource: requestedSource || null,
      availableBrowserVoices: installedVoices,
      ignoreSegmentOverride: false,
      representationMode: 'split'
    });
    const matchedVoice = installedVoices.find(voice => (
      typeof voice === 'object' && voice?.name && voice.name === voiceResolution.effectiveVoiceName
    )) || null;
    const effectiveRate = Number(playbackRate) || 1;
    const speechSupported = isBrowserTtsSpeechSupported({ synth });

    const nextStatus = {
      sessionId: playbackSessionId,
      documentId: documentTree?.id || null,
      blockId: block?.id || item?.blockId || null,
      unitId: step?.unitId || item?.unitId || segment?.unitId || null,
      segmentId: item?.segmentId || item?.id || segment?.id || null,
      speaker: item?.speaker || segment?.speaker || null,
      channel: normalizedChannel,
      representation,
      mode: unavailableBinaryFallback ? 'unavailable-binary-tts' : speechSupported ? 'tts' : 'unavailable',
      source: speechSupported ? 'tts' : 'unavailable',
      requestedVoice: voiceResolution.requestedVoiceName,
      effectiveVoice: voiceResolution.effectiveVoiceName,
      playbackRate: effectiveRate,
      unavailableBinaryFallback,
      fallbackReason: voiceResolution.fallbackReason || (unavailableBinaryFallback ? 'Bound runtime binary could not play; using Browser TTS fallback.' : null),
      updatedAt: Date.now()
    };
    setPlaybackSourceStatus(nextStatus);
    audioRuntimeHooks?.onPlaybackStep?.({
      ...nextStatus,
      step,
      item,
      text: textToRead,
      voiceResolution
    });

    if (typeof audioRuntimeHooks?.executeBrowserTts === 'function') {
      await audioRuntimeHooks.executeBrowserTts({
        textToRead,
        overrideVoice: matchedVoice,
        targetVoiceName: voiceResolution.effectiveVoiceName,
        requestedVoiceName: voiceResolution.requestedVoiceName,
        voiceResolution,
        rate: effectiveRate,
        playbackRate: effectiveRate,
        channel: normalizedChannel,
        item,
        step,
        stopSignalRef,
        pauseStateRef,
        playbackSessionRef,
        waitWhilePaused
      });
      return;
    }

    if (!speechSupported) {
      addLog('Warn', `Browser TTS unavailable (${normalizedChannel.toUpperCase()} • ${item?.speaker || 'Narrator'}); skipped.`);
      return;
    }

    await executeBrowserTtsPlaybackService({
      textToRead: textToRead || '',
      overrideVoice: matchedVoice,
      selectedVoiceRef: { current: matchedVoice },
      stopSignalRef,
      pauseStateRef,
      synth,
      currentUtteranceRef,
      ttsReplayRef,
      playbackResolveRef,
      rateRef: null,
      rate: effectiveRate,
      pitch: 1
    });
  }, [documentTree, normalizedConfig.preferences, installedVoices, synth, audioRuntimeHooks, waitWhilePaused, addLog]);

  const playRuntimeUrl = useCallback(async ({ url, playbackRate = 1, label = 'Conversation audio', step = null, item = null, statusMeta = {} }) => {
    setPlaybackSourceStatus(statusMeta);
    audioRuntimeHooks?.onPlaybackStep?.({
      ...statusMeta,
      url,
      step,
      item
    });
    if (typeof audioRuntimeHooks?.executeRuntimeAudio === 'function') {
      return audioRuntimeHooks.executeRuntimeAudio({
        url,
        playbackRate,
        label,
        step,
        item,
        currentAudioObjRef,
        playbackResolveRef,
        stopSignalRef
      });
    }
    return executeStructuredTextRuntimeAudioPlaybackService({
      url,
      currentAudioObjRef,
      playbackResolveRef,
      stopSignalRef,
      playbackRate,
      addLog,
      label
    });
  }, [audioRuntimeHooks, addLog]);

  const playStructuredChannel = useCallback(async (textToRead, item, channel, options = {}) => {
    const playbackSessionId = playbackSessionRef.current;
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    if (!playbackStillCurrent()) return;

    const normalizedChannel = channel === 'meaning' ? 'meaning' : 'text';
    const fullBlock = options?.block || (documentTree?.blocks || []).find(b => b.id === item?.blockId) || null;
    const segment = (fullBlock?.segments || []).find(s => s.id === (item?.segmentId || item?.id)) || item;

    let step = options?.step || null;
    if (!step && fullBlock) {
      const splitPlan = buildBlockPlan({
        block: fullBlock,
        fullBlock,
        channel: normalizedChannel,
        segmentIds: item?.id ? [item.id] : null,
        representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT
      });
      step = splitPlan?.steps?.[0] || null;
    }

    const playbackRate = Number(step?.playbackRate) || 1;
    const representation = step?.representation || options?.representationMode || normalizedConfig.playbackRepresentationMode;
    const runtimeVariantId = step?.runtimeAudio?.variant?.id || null;
    const url = step?.runtimeAudio && !failedVariantIdsRef.current[runtimeVariantId]
      ? resolveBlobObjectUrl(step.runtimeAudio.runtime || runtimeAudioUrls[runtimeVariantId])
      : null;

    let unavailableBinaryFallback = Boolean(step?.runtimeAudio && (!url || failedVariantIdsRef.current[runtimeVariantId]));
    if (url && !unavailableBinaryFallback) {
      const statusMeta = {
        sessionId: playbackSessionId,
        documentId: documentTree?.id || null,
        blockId: fullBlock?.id || item?.blockId || null,
        unitId: step?.unitId || item?.unitId || segment?.unitId || null,
        segmentId: item?.segmentId || item?.id || null,
        speaker: item?.speaker || segment?.speaker || null,
        channel: normalizedChannel,
        representation,
        mode: 'local',
        source: 'local',
        voiceId: step.runtimeAudio.variant?.voiceId || step.voiceId || null,
        effectiveVoice: step.runtimeAudio.variant?.voiceId || step.voiceId || null,
        playbackRate,
        profileRank: step.profileRank || step.runtimeAudio.playbackProfileRank || 1,
        renderFingerprint: step.renderFingerprint || step.runtimeAudio.renderFingerprint || null,
        updatedAt: Date.now()
      };
      const result = await playRuntimeUrl({
        url,
        playbackRate,
        label: `Conversation ${fullBlock?.id || 'Scene'}/${item?.speaker || 'Narrator'}`,
        step,
        item,
        statusMeta
      });
      if (!playbackStillCurrent() || result.status === 'played' || result.status === 'stopped') return;
      markFailedVariant(runtimeVariantId);
      unavailableBinaryFallback = true;
    }

    if (!playbackStillCurrent()) return;
    await waitWhilePaused();
    if (!playbackStillCurrent()) return;
    await speakWithResolvedBrowserTts({
      textToRead,
      block: fullBlock,
      segment,
      item,
      channel: normalizedChannel,
      requestedVoiceName: step?.ttsVoiceName || step?.voiceProfile?.voiceName || null,
      requestedSource: step?.voiceProfile?.source || null,
      playbackRate,
      representation,
      playbackSessionId,
      unavailableBinaryFallback,
      step
    });
  }, [
    documentTree,
    buildBlockPlan,
    normalizedConfig.playbackRepresentationMode,
    markFailedVariant,
    waitWhilePaused,
    resolveBlobObjectUrl,
    runtimeAudioUrls,
    playRuntimeUrl,
    speakWithResolvedBrowserTts
  ]);

  const playStructuredFullStep = useCallback(async (step, block, item) => {
    const playbackSessionId = playbackSessionRef.current;
    const playbackStillCurrent = () => !stopSignalRef.current && playbackSessionRef.current === playbackSessionId;
    if (!playbackStillCurrent()) return;

    const normalizedChannel = step?.channel === 'meaning' ? 'meaning' : 'text';
    const runtimeFull = step?.runtimeFull || null;
    const artifactId = runtimeFull?.artifact?.fullArtifactFingerprint || runtimeFull?.artifact?.id || null;
    const runtime = runtimeFull?.runtime || (artifactId ? runtimeFullAudio[artifactId] : null) || null;
    const url = runtime && (!artifactId || !failedVariantIdsRef.current[artifactId])
      ? resolveBlobObjectUrl(runtime)
      : null;

    if (step?.type === TEXT_STRUCTURED_RUNTIME_PLAYBACK_STEP_TYPES.FULL_LOCAL && url) {
      const statusMeta = {
        sessionId: playbackSessionId,
        documentId: documentTree?.id || null,
        blockId: block?.id || null,
        unitId: null,
        segmentId: null,
        speaker: 'All Speakers (Cached Full)',
        channel: normalizedChannel,
        representation: 'full',
        mode: 'full-local',
        source: 'local',
        voiceId: runtimeFull?.artifact?.descriptor?.voiceId || 'multi-speaker',
        effectiveVoice: 'Composed Full WAV (48 kHz)',
        // Handoff contract: cached Full artifact schedule already bakes composition rates; keep playbackRate 1.
        playbackRate: 1,
        fullArtifactFingerprint: artifactId,
        updatedAt: Date.now()
      };
      const result = await playRuntimeUrl({
        url,
        playbackRate: 1,
        label: `Conversation Full ${block?.id || 'Scene'}/${normalizedChannel}`,
        step,
        item,
        statusMeta
      });
      if (!playbackStillCurrent() || result.status === 'played' || result.status === 'stopped') return;
    }

    if (!playbackStillCurrent()) return;
    markFailedVariant(artifactId);
    addLog('Warn', `Cached Full artifact unavailable for ${block?.id || 'Scene'}; recovering per Sentence.`);
    // Reuse the authoritative D5 plan and existing Sentence callback. In particular,
    // keep local RF matches, speaker voice/rate/channel and persistent identities.
    const recoveryPlan = buildBlockPlan({
      block,
      channel: normalizedChannel,
      representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
      allowFullArtifact: false
    });
    const items = new Map(resolveStructuredTextPlaybackList(documentTree).map(candidate => [candidate.id, candidate]));
    for (const sentenceStep of recoveryPlan?.steps || []) {
      if (!playbackStillCurrent()) return;
      await waitWhilePaused();
      if (!playbackStillCurrent()) return;
      const sentenceItem = items.get(sentenceStep.segmentId);
      if (!sentenceItem) return;
      setResumeCursorSegmentId(sentenceItem.id);
      if (playbackContextRef.current?.sessionId === playbackSessionId) {
        playbackContextRef.current.cursorSegmentId = sentenceItem.id;
      }
      await playStructuredChannel(sentenceStep.content, sentenceItem, normalizedChannel, {
        block,
        representationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL,
        step: sentenceStep
      });
    }
  }, [documentTree, runtimeFullAudio, markFailedVariant, resolveBlobObjectUrl, playRuntimeUrl, buildBlockPlan, waitWhilePaused, playStructuredChannel, addLog]);

  const startSession = useCallback(({
    scope = TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT,
    blockId = null,
    startSegmentId = null,
    cursorSegmentId = null,
    playbackChannelMode = normalizedConfig.playbackChannelMode,
    playbackRepresentationMode = normalizedConfig.playbackRepresentationMode
  } = {}) => {
    if (!documentTree) return false;
    setPlaybackSourceStatus(null);
    const requestedCursor = cursorSegmentId || startSegmentId
      || (blockId ? documentTree.blocks?.find(b => b.id === blockId)?.segments?.[0]?.id : null);
    if (requestedCursor) {
      setResumeCursorSegmentId(requestedCursor);
      setCurrentIndex(requestedCursor);
    }
    if (blockId) setActiveBlockId(blockId);

    return executeStructuredTextPlaybackSessionService({
      documentTree,
      startSegmentId,
      cursorSegmentId,
      blockId,
      scope,
      playbackChannelMode,
      playbackOrderMode: normalizedConfig.playbackOrderMode,
      playbackRepresentationMode,
      repeatMode: normalizedConfig.repeatMode,
      safePlayTransition,
      playbackSessionRef,
      playbackContextRef,
      setIsPlaying,
      setIsPaused,
      pauseStateRef,
      stopSignalRef,
      silentAudioRef,
      waitWhilePaused,
      setPlayingContext,
      setPlayingIndex,
      setCurrentIndex,
      setSpeakingPart,
      playStructuredChannel,
      resolveBlockChannelPlaybackPlan: buildBlockPlan,
      playStructuredFullStep,
      forceStopAll,
      onPlaybackCursor: ({ documentId: activeDocId, segmentId, blockId: cursorBlockId }) => {
        if (activeDocId !== documentTree?.id) return;
        if (segmentId) setResumeCursorSegmentId(segmentId);
        if (cursorBlockId) setActiveBlockId(cursorBlockId);
      },
      onPlaybackCompleted: ({ documentId: activeDocId, segmentId }) => {
        if (activeDocId !== documentTree?.id) return;
        setResumeCursorSegmentId(segmentId || null);
        setActiveBlockId(null);
      },
      addLog
    });
  }, [
    documentTree,
    normalizedConfig,
    safePlayTransition,
    setIsPlaying,
    setIsPaused,
    waitWhilePaused,
    playStructuredChannel,
    buildBlockPlan,
    playStructuredFullStep,
    forceStopAll,
    addLog
  ]);

  const playWorkspace = useCallback(
    () => startSession({ scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.DOCUMENT }),
    [startSession]
  );

  const playScene = useCallback((blockId, options = {}) => {
    const scopeNow = playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      ? playbackContextRef.current?.scope
      : null;
    if ((isPlayingRef.current || isPausedRef.current)
      && scopeNow === TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD
      && playbackContextRef.current?.blockId === blockId) {
      forceStopAll();
      return true;
    }
    return startSession({
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.CARD,
      blockId,
      ...(options.playbackChannelMode ? { playbackChannelMode: options.playbackChannelMode } : {}),
      ...(options.playbackRepresentationMode ? { playbackRepresentationMode: options.playbackRepresentationMode } : {})
    });
  }, [forceStopAll, startSession]);

  const playSentence = useCallback(segmentId => {
    const scopeNow = playbackContextRef.current?.context === TEXT_STRUCTURED_PLAYBACK_CONTEXT
      ? playbackContextRef.current?.scope
      : null;
    if ((isPlayingRef.current || isPausedRef.current)
      && scopeNow === TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT
      && playbackContextRef.current?.cursorSegmentId === segmentId) {
      forceStopAll();
      return true;
    }
    return startSession({
      scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.SEGMENT,
      startSegmentId: segmentId,
      playbackRepresentationMode: TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT
    });
  }, [forceStopAll, startSession]);

  const playFromSentence = useCallback(segmentId => startSession({
    scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
    startSegmentId: segmentId
  }), [startSession]);

  const pausePlayback = useCallback(() => {
    executePausePlayback({
      isPlaying: isPlayingRef.current,
      isMobile,
      pauseStateRef,
      currentAudioObjRef,
      synth,
      silentAudioRef,
      setIsPaused,
      addLog,
      ttsReplayRef,
      pauseSource: 'ui'
    });
  }, [isMobile, synth, setIsPaused, addLog]);

  const resumePlayback = useCallback(() => {
    if (isPlayingRef.current && pauseStateRef.current) {
      executeResumePlayback({
        isPlaying: isPlayingRef.current,
        pauseStateRef,
        currentAudioObjRef,
        synth,
        silentAudioRef,
        setIsPaused,
        addLog,
        ttsReplayRef
      });
      return true;
    }
    if (resumeCursorSegmentId) {
      return startSession({
        scope: TEXT_STRUCTURED_PLAYBACK_SCOPES.FROM_HERE,
        startSegmentId: resumeCursorSegmentId
      });
    }
    return playWorkspace();
  }, [synth, setIsPaused, addLog, resumeCursorSegmentId, startSession, playWorkspace]);

  const stopPlayback = useCallback(() => {
    forceStopAll();
  }, [forceStopAll]);

  return useMemo(() => ({
    isPlaying,
    isPaused,
    playingContext,
    playingIndex,
    currentIndex,
    activeBlockId,
    speakingPart,
    resumeCursorSegmentId,
    playbackSourceStatus,
    playbackLogs,
    failedVariantIds,
    config: normalizedConfig,
    playWorkspace,
    playScene,
    playSentence,
    playFromSentence,
    pausePlayback,
    resumePlayback,
    stopPlayback
  }), [
    isPlaying,
    isPaused,
    playingContext,
    playingIndex,
    currentIndex,
    activeBlockId,
    speakingPart,
    resumeCursorSegmentId,
    playbackSourceStatus,
    playbackLogs,
    failedVariantIds,
    normalizedConfig,
    playWorkspace,
    playScene,
    playSentence,
    playFromSentence,
    pausePlayback,
    resumePlayback,
    stopPlayback
  ]);
};
