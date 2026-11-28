import React from 'react';
import { BOOK_TIMING_DEFAULTS } from '../../domain/text/bookPlaybackDomain.js';

const delayLabels = {
  channelDelayMs: 'Channel Delay', segmentDelayMs: 'Sentence Delay', unitDelayMs: 'Section / Turn Delay',
  cardDelayMs: 'Card Delay', mainTitleDelayMs: 'Main Title Delay', headingDelayMs: 'Card Heading Delay', repeatDelayMs: 'Repeat Delay'
};
const sequences = [['text-only', 'EN only'], ['meaning-only', 'ID only'], ['text-meaning', 'EN → ID'], ['meaning-text', 'ID → EN']];
const repeats = [['once', 'Once'], ['twice', '2×'], ['custom', 'Custom'], ['loop', 'Loop']];
const delays = Array.from({ length: 101 }, (_, index) => [index * 50, index * 50]);
const passes = Array.from({ length: 20 }, (_, index) => [index + 1, index + 1]);
const control = 'min-h-9 w-full rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900';

function Choice({ label, value, items, onChange }) {
  return <label className="block">{label}
    <select className={control} value={value} onChange={event => onChange(event.target.value)}>
      {items.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </select>
  </label>;
}

function Profile({ label, sequence, repeat, count, onChange }) {
  return <fieldset className="space-y-1 rounded border border-slate-300 p-2 dark:border-slate-700">
    <legend>{label}</legend>
    <Choice label="Channel sequence" value={sequence} items={ [['inherit-global', 'Follow Global'], ...sequences] }
      onChange={value => onChange({ sequence: value })} />
    <Choice label="Repeat" value={repeat} items={repeats} onChange={value => onChange({ repeat: value })} />
    {repeat === 'custom' && <Choice label="Passes" value={count} items={passes} onChange={value => onChange({ count: value })} />}
  </fieldset>;
}

export default function BookPlaybackSettings({ settings, preferences, timing, onSettings, onPreferences, onTiming }) {
  const dirty = Object.keys(delayLabels).some(key => timing[key] !== BOOK_TIMING_DEFAULTS[key]);
  const updateProfile = (group, patch) => onSettings({ [group]: { ...settings[group], ...patch } });
  const updateManual = (kind, patch) => {
    const prefix = kind === 'Segment' ? 'manualSegment' : 'manualCard';
    onPreferences(Object.fromEntries(Object.entries(patch).map(([key, value]) => [
      prefix + ({ sequence: 'PlaybackChannelMode', repeat: 'RepeatMode', count: 'RepeatCount' })[key], value
    ])));
  };
  return <details className="mx-2 mb-2 rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700" data-book-playback-settings>
    <summary className="cursor-pointer font-semibold">Book playback settings</summary>
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <fieldset className="space-y-1 rounded border border-slate-300 p-2 dark:border-slate-700">
        <legend>Play All</legend>
        <Choice label="Global sequence" value={preferences.playbackChannelMode} items={sequences} onChange={playbackChannelMode => onPreferences({ playbackChannelMode })} />
        <Choice label="Global order" value={preferences.playbackOrderMode} items={ [['sequential', 'Authored'], ['shuffle', 'Shuffle Cards']] }
          onChange={playbackOrderMode => onPreferences({ playbackOrderMode })} />
        <Choice label="Global repeat" value={settings.globalCustom ? 'custom' : preferences.repeatMode} items={repeats}
          onChange={repeat => {
            onSettings({ globalCustom: repeat === 'custom' });
            if (repeat !== 'custom') onPreferences({ repeatMode: repeat });
          }} />
        {settings.globalCustom && <Choice label="Global passes" value={settings.globalCount} items={passes}
          onChange={globalCount => onSettings({ globalCount })} />}
      </fieldset>
      {['Segment', 'Card'].map(kind => {
        const prefix = kind === 'Segment' ? 'manualSegment' : 'manualCard';
        return <Profile key={kind} label={'Manual ' + kind} sequence={preferences[prefix + 'PlaybackChannelMode']}
          repeat={preferences[prefix + 'RepeatMode']} count={preferences[prefix + 'RepeatCount']} onChange={patch => updateManual(kind, patch)} />;
      })}
      <Profile label="Manual Section / Turn" {...settings.unit} onChange={patch => updateProfile('unit', patch)} />
      <Profile label="From Here" {...settings.from} onChange={patch => updateProfile('from', patch)} />
      <fieldset className="space-y-1 rounded border border-slate-300 p-2 dark:border-slate-700">
        <legend>Audio and Stop</legend>
        <Choice label="Requested audio" value={preferences.playbackRepresentationMode} items={ [['split', 'Split'], ['full', 'Full']] }
          onChange={playbackRepresentationMode => onPreferences({ playbackRepresentationMode })} />
        <Choice label="Play after Stop" value={preferences.resumeMode} items={ [['restart', 'Restart session start'], ['continue', 'Continue last step']] }
          onChange={resumeMode => onPreferences({ resumeMode })} />
        <Choice label="From Here boundary" value={settings.boundary} items={ [['unit', 'Section / Turn'], ['card', 'Card'], ['document', 'Workspace']] }
          onChange={boundary => onSettings({ boundary })} />
      </fieldset>
    </div>
    <fieldset data-book-timing className="mt-3 rounded border border-slate-300 p-2 dark:border-slate-700">
      <legend>Playback delays (ms)</legend>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Object.entries(delayLabels).map(([key, label]) => <Choice key={key} label={label}
          value={timing[key]} items={delays} onChange={value => onTiming({ [key]: value })} />)}
      </div>
      <button type="button" disabled={!dirty} className="mt-2 min-h-9 rounded border px-3 disabled:opacity-40"
        onClick={() => onTiming(BOOK_TIMING_DEFAULTS)}>Reset playback delays</button>
    </fieldset>
  </details>;
}
