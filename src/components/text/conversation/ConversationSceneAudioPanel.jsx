import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileAudio,
  Play,
  Volume2
} from 'lucide-react';
import {
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES
} from '../../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import {
  assembleConversationSceneFullWavPreview,
  getConversationFullCompositionStatus
} from './conversationAudioUiUtils.js';

const routeBadgeLabel = (plan, fullFailed) => {
  if (!plan) return 'no-plan';
  if (plan.route === 'full-local' && fullFailed) return 'full fallback (Per-Sentence)';
  if (plan.route === 'full-local') return 'full-local (Cached WAV)';
  if (plan.route === 'conversation-composition') return 'full fallback (Per-Sentence)';
  return plan.route || 'split';
};

const fullStatusTone = status => {
  if (status === 'ready') return 'bg-emerald-50 dark:bg-emerald-950/35 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  if (status === 'metadata-only') return 'bg-amber-50 dark:bg-amber-950/35 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  if (status === 'stale') return 'bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  if (status === 'other-profile') return 'bg-violet-50 dark:bg-violet-950/35 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
};

/**
 * Scene-level D5 audio readiness summary and Full WAV assembly availability strip.
 */
export const ConversationSceneAudioPanel = ({
  scene,
  hydratedBlock = null,
  documentTitle = 'Conversation',
  scenePlans = null,
  playbackChannelMode = TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
  globalPlaybackRate = 1,
  runtimeAudioUrls = {},
  failedVariantIds = null,
  isBusy = false,
  onAssembleFullWav = null,
  onPlaySceneChannel = null
}) => {
  const [assemblingKey, setAssemblingKey] = useState(null);
  const [assemblyError, setAssemblyError] = useState(null);
  const [assembledPreviews, setAssembledPreviews] = useState({});

  if (!scenePlans || scene?.empty) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[9px] text-slate-400"
        data-conversation-scene-audio={scene?.id}
      >
        Audio plan: empty Scene (0 Turns • 0 Sentences)
      </div>
    );
  }

  if (scenePlans.error) {
    return (
      <div
        className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/25 px-2.5 py-1.5 text-[9px] font-bold text-red-700 dark:text-red-300"
        role="alert"
        data-conversation-scene-audio={scene?.id}
      >
        Audio plan unavailable: {scenePlans.error}
      </div>
    );
  }

  const includesMeaning = playbackChannelMode !== TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY;
  const activeChannels = [
    ...(playbackChannelMode === TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY ? [] : ['text']),
    ...(includesMeaning && (scenePlans.meaning?.entries?.length || 0) > 0 ? ['meaning'] : [])
  ];
  const visibleChannels = activeChannels.length ? activeChannels : ['text'];

  const handleCompose = async (channel, plan) => {
    setAssemblyError(null);
    const key = `${scene.id}:${channel}`;
    setAssemblingKey(key);
    try {
      if (typeof onAssembleFullWav === 'function') {
        const res = await onAssembleFullWav({ block: hydratedBlock || scene, channel, plan });
        if (res?.composed && res?.artifact) {
          setAssembledPreviews(prev => ({
            ...prev,
            [key]: {
              fingerprint: res.artifact.fullArtifactFingerprint,
              sampleRate: res.composed.sampleRate,
              segmentCount: res.composed.segmentCount,
              filename: res.filename || res.artifact.filename
            }
          }));
        }
        return;
      }
      const res = await assembleConversationSceneFullWavPreview({
        documentTitle,
        block: hydratedBlock || scene,
        plan,
        runtimeAudioUrls
      });
      setAssembledPreviews(prev => ({
        ...prev,
        [key]: {
          fingerprint: res.artifact.fullArtifactFingerprint,
          sampleRate: res.composed.sampleRate,
          segmentCount: res.composed.segmentCount,
          filename: res.filename
        }
      }));
    } catch (error) {
      setAssemblyError(error?.message || 'Unable to compose Scene Full WAV.');
    } finally {
      setAssemblingKey(null);
    }
  };

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 p-2.5 space-y-2"
      data-conversation-scene-audio={scene.id}
    >
      {assemblyError && (
        <div
          className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-2 py-1 text-[9px] font-bold text-red-700 dark:text-red-300"
          role="alert"
        >
          {assemblyError}
        </div>
      )}

      {visibleChannels.map(channel => {
        const plan = scenePlans[channel];
        if (!plan) return null;
        const chLabel = channel === 'meaning' ? 'ID (Meaning)' : 'EN (Text)';
        const entries = plan.entries || [];
        const readyCount = entries.filter(e => e.status === 'ready').length;
        const metaOnlyCount = entries.filter(e => e.status === 'metadata-only' || e.status === 'legacy-unverified').length;
        const staleCount = entries.filter(e => e.status === 'stale').length;
        const missingCount = entries.filter(e => e.status === 'missing').length;
        const sampleRates = entries.map(e => Number(e.playbackRate) || 1);
        const nonUnitRate = sampleRates.find(r => r !== 1) ?? (globalPlaybackRate !== 1 ? globalPlaybackRate : 1);
        const compStatus = getConversationFullCompositionStatus(plan, { channel, playbackRate: nonUnitRate });
        const artifact = plan.fullReadiness?.artifact;
        const fullFailed = Boolean(failedVariantIds?.[artifact?.fullArtifactFingerprint || artifact?.id]);
        const fullStatus = fullFailed ? 'unavailable-binary' : compStatus.fullStatus;
        const previewKey = `${scene.id}:${channel}`;
        const activePreview = assembledPreviews[previewKey];
        const previewCurrent = Boolean(
          activePreview
          && plan.fullArtifactRequirement?.fullArtifactFingerprint
          && activePreview.fingerprint === plan.fullArtifactRequirement.fullArtifactFingerprint
        );

        return (
          <div
            key={channel}
            className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-2.5 py-2 space-y-1.5"
            data-conversation-full-composition={`${scene.id}:${channel}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                <span className="font-black text-slate-700 dark:text-slate-200 inline-flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-indigo-500" />{chLabel}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono text-[8px] font-bold">
                  route: {routeBadgeLabel(plan, fullFailed)}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/35 text-emerald-700 dark:text-emerald-300 font-black text-[8px]">
                  READY {readyCount}/{entries.length}
                </span>
                {metaOnlyCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/35 text-amber-700 dark:text-amber-300 font-black text-[8px]">
                    META-ONLY {metaOnlyCount}
                  </span>
                )}
                {staleCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-300 font-black text-[8px]">
                    STALE {staleCount}
                  </span>
                )}
                {missingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-black text-[8px]">
                    MISSING {missingCount}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase ${fullStatusTone(fullStatus)}`}>
                  Full Cache: {fullStatus}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {typeof onPlaySceneChannel === 'function' && entries.length > 0 && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onPlaySceneChannel(scene.id, channel)}
                    className="min-h-8 px-2 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 text-[9px] font-black inline-flex items-center gap-1 disabled:opacity-35"
                    aria-label={`Play Scene ${scene.id} ${channel === 'meaning' ? 'ID' : 'EN'}`}
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />Play {channel === 'meaning' ? 'ID' : 'EN'}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBusy || assemblingKey === previewKey || !compStatus.readyToCompose}
                  onClick={() => handleCompose(channel, plan)}
                  className="min-h-8 px-2.5 rounded-lg bg-violet-600 text-white text-[9px] font-black inline-flex items-center gap-1 disabled:opacity-35 disabled:cursor-not-allowed"
                  aria-label={`Compose Full WAV ${scene.id} ${channel}`}
                  title={compStatus.reasonMessage}
                >
                  <FileAudio className="w-3 h-3" />
                  {assemblingKey === previewKey ? 'Assembling...' : 'Compose Full WAV'}
                </button>
              </div>
            </div>

            <div className={`flex items-start gap-1.5 text-[8px] leading-snug ${compStatus.readyToCompose ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {compStatus.readyToCompose ? <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />}
              <span>{compStatus.reasonMessage}</span>
            </div>

            {previewCurrent && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800 px-2 py-1 text-[8px] font-mono text-emerald-800 dark:text-emerald-200">
                <Download className="w-3 h-3 shrink-0" />
                <span>{activePreview.filename}</span>
                <span>• {activePreview.sampleRate} Hz</span>
                <span>• {activePreview.segmentCount} segments</span>
                <span className="truncate max-w-[200px]">{activePreview.fingerprint}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ConversationSceneAudioPanel;
