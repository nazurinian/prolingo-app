import React, { useEffect, useId, useReducer, useState } from 'react';
import { ChevronDown, ChevronUp, List, Pause, Play, Repeat1, Shuffle, SkipBack, SkipForward, SlidersHorizontal, XCircle } from 'lucide-react';
import { presentGlobalPlayer } from '../../domain/playback/globalPlayerPresentationDomain.js';

const mediaEvents = ['timeupdate', 'durationchange', 'loadedmetadata', 'ratechange'];
const controlClass = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 md:h-10 md:w-10 disabled:opacity-40';

const formatTime = seconds => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const PlayerTimeline = ({ timeline }) => {
  if (!timeline) return null;
  const { elapsedSeconds, durationSeconds } = timeline;
  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs tabular-nums" data-player-timeline>
    {elapsedSeconds != null && <progress className="min-w-20 flex-1" aria-label="Playback progress" value={elapsedSeconds} max={durationSeconds}/>}
    <span>{elapsedSeconds == null ? 'Duration ' : `${formatTime(elapsedSeconds)} / `}{formatTime(durationSeconds)}</span>
  </div>;
};

const repeatLabels = { once: 'Once', sequence: 'Sequence', repeat_2x: 'Repeat twice', loop_one: 'Loop one', random: 'Random' };
const repeatIcons = { sequence: List, loop_one: Repeat1, random: Shuffle };
const languages = { 'text-only': 'EN', 'meaning-only': 'ID', 'text-meaning': 'EN → ID', 'meaning-text': 'ID → EN' };
const idle = { transport: { phase: 'idle', navKind: 'item', canNavigate: true } };

export default function BottomPlayerBar({
  isMobile, readPlayer, handleSmartNav, handleGlobalPlay, forceStopAll, playbackMode, cyclePlaybackMode, setPlaybackMode,
  structuredTextModeActive, textPlaybackRepresentationMode, textPlaybackOrder, textPlaybackChannelMode,
  onTextPlaybackRepresentationModeChange, onOpenTextPlayer
}) {
  const [expanded, setExpanded] = useState(false);
  const [, refresh] = useReducer(revision => revision + 1, 0);
  const detailsId = useId();
  const snapshot = readPlayer?.() ?? idle;
  const { media } = snapshot;
  const player = presentGlobalPlayer(snapshot);
  const active = player.phase !== 'idle';
  const pausedAction = ['playing', 'waiting'].includes(player.phase);
  const PlayIcon = pausedAction ? Pause : Play;
  const ExpandIcon = expanded ? ChevronDown : ChevronUp;
  const RepeatIcon = repeatIcons[playbackMode];
  const fullSaved = textPlaybackRepresentationMode === 'full';
  const localOrder = channel => {
    const profiles = textPlaybackOrder?.channels?.[channel];
    return (Array.isArray(profiles) ? profiles.map(profile => profile?.voiceId || profile).filter(Boolean).join(' → ') : '') || 'Auto';
  };

  useEffect(() => {
    if (!expanded || !media?.addEventListener) return undefined;
    // Media events refresh this bar only. Replacing the observed source releases its listeners.
    for (const event of mediaEvents) media.addEventListener(event, refresh);
    return () => {
      for (const event of mediaEvents) media.removeEventListener(event, refresh);
    };
  }, [expanded, media]);

  return (
    <section aria-label="Global player" aria-busy={player.phase === 'pending'} data-global-player data-player-phase={player.phase}
      className={`z-50 shrink-0 border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 prolingo-text-bottom-player ${isMobile ? 'fixed inset-x-0 bottom-0 px-2.5 pt-2 prolingo-mobile-bottom-safe' : 'px-4 py-3'}`}>
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:gap-4">
          <div className="min-w-0">
            <p data-player-title className="truncate text-xs font-bold md:text-sm" title={player.title}>{player.title || 'Global Player'}</p>
            {player.context && <p data-player-context className="line-clamp-2 break-words text-xs" title={player.context}>{player.context}</p>}
            <p data-player-status className="truncate text-xs text-slate-600 dark:text-slate-300" title={player.status}>{player.compactStatus}</p>
          </div>
          <div className="flex items-center gap-1 md:gap-2 prolingo-text-player-controls">
            <button type="button" className={controlClass} aria-label={`Previous ${player.navLabel}`} disabled={!player.canNavigate} onClick={() => handleSmartNav('prev')}><SkipBack aria-hidden="true" size={16}/></button>
            <button type="button" className={`${controlClass} !bg-indigo-600 !text-white`} aria-label={player.playLabel} disabled={player.phase === 'pending'} onClick={handleGlobalPlay}><PlayIcon aria-hidden="true" size={18}/></button>
            <button type="button" className={controlClass} aria-label={`Next ${player.navLabel}`} disabled={!player.canNavigate} onClick={() => handleSmartNav('next')}><SkipForward aria-hidden="true" size={16}/></button>
            <button type="button" className={controlClass} aria-label="Stop playback" disabled={!active} onClick={forceStopAll}><XCircle aria-hidden="true" size={17}/></button>
            <button type="button" className={controlClass} aria-label={expanded ? 'Collapse player details' : 'Expand player details'} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}><ExpandIcon aria-hidden="true" size={17}/></button>
          </div>
        </div>
        <div id={detailsId} hidden={!expanded} className="mt-2 max-h-[40dvh] overflow-y-auto border-t border-slate-200 pt-2 dark:border-slate-700 md:max-h-[48dvh]">
          {expanded && <>
            {player.details.length > 0 && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              {player.details.map(([label, value]) => <React.Fragment key={label}>
                <dt className="font-semibold">{label}</dt><dd className="break-words" data-player-detail={label}>{value}</dd>
              </React.Fragment>)}
            </dl>}
            <PlayerTimeline timeline={player.timeline}/>
            <div className="mt-2 flex flex-wrap items-center gap-2 pb-1 text-xs">
              {structuredTextModeActive ? <div className="flex flex-wrap items-center gap-2" data-text-global-player-controls="true">
                <button type="button" className="min-h-9 rounded-lg border px-2" onClick={() => onTextPlaybackRepresentationModeChange(fullSaved ? 'split' : 'full')}>Saved {fullSaved ? 'Full' : 'Split'}</button>
                <button type="button" className="flex min-h-9 items-center gap-1 rounded-lg border px-2" onClick={onOpenTextPlayer}><SlidersHorizontal aria-hidden="true" size={16}/>Open Text Player settings</button>
                <p className="min-w-0 break-words">Saved language {languages[textPlaybackChannelMode]} · Local voice EN {localOrder('text')} · ID {localOrder('meaning')}</p>
              </div> : isMobile ? (
                <button type="button" className="flex min-h-9 items-center gap-1 rounded-lg border px-2" onClick={cyclePlaybackMode}>
                  {RepeatIcon && <RepeatIcon aria-hidden="true" size={16}/>}Repeat setting · {repeatLabels[playbackMode]}
                </button>
              ) : <label className="flex items-center gap-2">Repeat setting
                <select className="min-h-9 rounded-lg border bg-transparent px-2" value={playbackMode} onChange={event => setPlaybackMode(event.target.value)}>
                  {Object.entries(repeatLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>}
            </div>
          </>}
        </div>
      </div>
    </section>
  );
}
