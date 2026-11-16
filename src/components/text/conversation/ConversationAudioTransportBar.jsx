import React from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2
} from 'lucide-react';
import {
  TEXT_STRUCTURED_AUDIO_SOURCE_MODES,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES,
  TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES,
  getStructuredTextPlaybackModeLabel
} from '../../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { compactConversationVoiceName } from './conversationAudioUiUtils.js';

const CHANNEL_MODE_OPTIONS = [
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_THEN_MEANING,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_THEN_TEXT,
  TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.MEANING_ONLY
];

const SOURCE_MODE_OPTIONS = [
  { value: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST, label: 'Local First' },
  { value: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.TTS_ONLY, label: 'TTS Only' },
  { value: TEXT_STRUCTURED_AUDIO_SOURCE_MODES.CUSTOM_LOCAL, label: 'Custom Local' }
];

const playbackStatusTone = status => {
  if (!status) return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  if (status.unavailableBinaryFallback || status.mode === 'unavailable') {
    return 'bg-rose-50 dark:bg-rose-950/35 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  }
  if (status.mode === 'local' || status.mode === 'full-local') {
    return 'bg-emerald-50 dark:bg-emerald-950/35 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }
  return 'bg-sky-50 dark:bg-sky-950/35 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800';
};

/**
 * Workspace Conversation Audio Transport Bar reusing ProLingo Split/Full, Channel, Source, and Rate semantics.
 */
export const ConversationAudioTransportBar = ({
  audioConfig = {},
  onAudioConfigChange,
  playback,
  workspaceTotals = {},
  playableCount = 0,
  isMixed = false,
  isBusy = false,
  compact = false
}) => {
  const {
    isPlaying = false,
    isPaused = false,
    resumeCursorSegmentId = null,
    playbackSourceStatus = null,
    playWorkspace,
    pausePlayback,
    resumePlayback,
    stopPlayback
  } = playback || {};

  const representation = audioConfig.playbackRepresentationMode === TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    ? TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.FULL
    : TEXT_STRUCTURED_PLAYBACK_REPRESENTATION_MODES.SPLIT;
  const channelMode = audioConfig.playbackChannelMode || TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES.TEXT_ONLY;
  const sourceMode = audioConfig.audioSourceMode || TEXT_STRUCTURED_AUDIO_SOURCE_MODES.LOCAL_FIRST;
  const globalRate = Number(audioConfig.globalPlaybackRate) || 1;
  const active = isPlaying || isPaused;

  return (
    <section
      className="rounded-2xl border border-indigo-100 dark:border-indigo-900/70 bg-white dark:bg-slate-900 p-3 sm:p-3.5 shadow-sm space-y-2.5"
      data-conversation-audio-transport="true"
    >
      <div className={`flex ${compact ? 'flex-col' : 'items-center justify-between'} gap-2`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase">
            <Volume2 className="w-3 h-3" />Audio Playback
          </span>
          <div
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800"
            data-conversation-audio-representation="true"
          >
            <button
              type="button"
              disabled={isBusy}
              aria-pressed={representation === 'split'}
              onClick={() => onAudioConfigChange?.({ playbackRepresentationMode: 'split' })}
              className={`px-2 py-1 rounded-md text-[9px] font-black transition ${
                representation === 'split'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Split (Sentence)
            </button>
            <button
              type="button"
              disabled={isBusy}
              aria-pressed={representation === 'full'}
              onClick={() => onAudioConfigChange?.({ playbackRepresentationMode: 'full' })}
              className={`px-2 py-1 rounded-md text-[9px] font-black transition ${
                representation === 'full'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Full (Scene / Fallback)
            </button>
          </div>
          {representation === 'full' && (
            <span className="text-[8px] font-medium text-violet-700 dark:text-violet-300">
              Cached Full WAV if ready; otherwise per-Sentence Speaker steps
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={isBusy || playableCount === 0}
            onClick={() => playWorkspace?.()}
            className="min-h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black inline-flex items-center gap-1 disabled:opacity-35 active:scale-95 transition"
            aria-label="Play Workspace Audio"
          >
            <Play className="w-3 h-3 fill-current" />
            {isMixed ? 'Play Workspace' : 'Play All Scenes'}
          </button>

          {isPlaying && !isPaused && (
            <button
              type="button"
              onClick={() => pausePlayback?.()}
              className="min-h-9 px-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-[10px] font-black inline-flex items-center gap-1"
              aria-label="Pause playback"
            >
              <Pause className="w-3 h-3" />Pause
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={() => resumePlayback?.()}
              className="min-h-9 px-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black inline-flex items-center gap-1"
              aria-label="Resume playback"
            >
              <Play className="w-3 h-3 fill-current" />Resume
            </button>
          )}

          {!active && resumeCursorSegmentId && (
            <button
              type="button"
              disabled={isBusy || playableCount === 0}
              onClick={() => resumePlayback?.()}
              className="min-h-9 px-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[9px] font-black inline-flex items-center gap-1 disabled:opacity-35"
              aria-label="Resume from cursor"
              title={`Resume from stopped Sentence ${resumeCursorSegmentId}`}
            >
              <Play className="w-3 h-3" />Resume ({resumeCursorSegmentId})
            </button>
          )}

          {active && (
            <button
              type="button"
              onClick={() => stopPlayback?.()}
              className="min-h-9 px-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-[10px] font-black inline-flex items-center gap-1"
              aria-label="Stop playback"
            >
              <Square className="w-3 h-3 fill-current" />Stop
            </button>
          )}
        </div>
      </div>

      <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-3'} gap-2`}>
        <label className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400">
          <span>Channel Mode</span>
          <select
            value={channelMode}
            onChange={event => onAudioConfigChange?.({ playbackChannelMode: event.target.value })}
            disabled={isBusy}
            aria-label="Audio Channel Mode"
            className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            {CHANNEL_MODE_OPTIONS.map(modeValue => (
              <option key={modeValue} value={modeValue}>
                {getStructuredTextPlaybackModeLabel(modeValue)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400">
          <span>Source Policy</span>
          <select
            value={sourceMode}
            onChange={event => onAudioConfigChange?.({ audioSourceMode: event.target.value })}
            disabled={isBusy}
            aria-label="Audio Source Policy"
            className="min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            {SOURCE_MODE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400">
          <div className="flex items-center justify-between gap-1">
            <span>Global Speed</span>
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-indigo-700 dark:text-indigo-300" data-conversation-rate-readout="true">
                {globalRate.toFixed(1)}x
              </span>
              {globalRate !== 1 && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onAudioConfigChange?.({ globalPlaybackRate: 1 })}
                  className="p-0.5 rounded border border-slate-200 dark:border-slate-700 text-indigo-600"
                  title="Reset speed to 1.0x"
                  aria-label="Reset playback speed"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={globalRate}
            disabled={isBusy}
            onChange={event => onAudioConfigChange?.({ globalPlaybackRate: Number(event.target.value) })}
            aria-label="Global Playback Rate"
            className="w-full accent-indigo-600 min-h-7"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[9px]">
        <div className="flex flex-wrap items-center gap-1.5" data-conversation-audio-readiness="true">
          <span className="font-black text-slate-500 dark:text-slate-400">Inventory:</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-black">
            Ready {workspaceTotals.ready || 0}/{workspaceTotals.entries || 0}
          </span>
          {(workspaceTotals.metadataOnly || 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-black">
              Meta-only {workspaceTotals.metadataOnly}
            </span>
          )}
          {(workspaceTotals.stale || 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/35 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-black">
              Stale {workspaceTotals.stale}
            </span>
          )}
          {(workspaceTotals.otherProfile || 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/35 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 font-black">
              Other Voice {workspaceTotals.otherProfile}
            </span>
          )}
          {(workspaceTotals.missing || 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-black">
              Missing {workspaceTotals.missing}
            </span>
          )}
        </div>

        {playbackSourceStatus && (
          <div
            className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold flex items-center gap-1.5 ${playbackStatusTone(playbackSourceStatus)}`}
            data-conversation-playback-status="true"
          >
            <span>
              {isPaused ? 'PAUSED' : isPlaying ? 'PLAYING' : 'LAST STEP'}:
              {' '}
              {playbackSourceStatus.mode === 'full-local'
                ? 'Cached Full WAV'
                : playbackSourceStatus.mode === 'local'
                  ? `Local RF #${playbackSourceStatus.profileRank || 1}`
                  : playbackSourceStatus.unavailableBinaryFallback
                    ? 'Unavailable Binary -> TTS'
                    : playbackSourceStatus.mode === 'unavailable'
                      ? 'Audio Unavailable'
                      : 'Browser TTS'}
            </span>
            <span>•</span>
            <span>{playbackSourceStatus.speaker || 'Narrator'}</span>
            <span>•</span>
            <span className="font-mono">{playbackSourceStatus.channel === 'meaning' ? 'ID' : 'EN'}</span>
            <span>•</span>
            <span>{compactConversationVoiceName(playbackSourceStatus.effectiveVoice || playbackSourceStatus.requestedVoice)}</span>
            <span>•</span>
            <span className="font-mono">{Number(playbackSourceStatus.playbackRate || 1).toFixed(1)}x</span>
          </div>
        )}
      </div>
    </section>
  );
};

export default ConversationAudioTransportBar;
