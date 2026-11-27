import { useEffect, useRef, useState } from 'react';
import { BOOK_HEADING_LABELS, planBookAtomicGeneration, planBookAtomicPlayback } from '../../domain/text/bookQaHeadingAudioDomain.js';
import { projectBookHeadings, resolveBookHeadingRead } from '../../domain/text/textBookHeadingDomain.js';
import { resolveStructuredTextPlaybackChannelOrder, TEXT_STRUCTURED_PLAYBACK_CHANNEL_MODES as CHANNELS } from '../../domain/text/textStructuredPlaybackPreferenceDomain.js';
import { readBookBodyAvailability } from '../../services/audio/bookQaBodyAudioService.js';

const button = 'min-h-9 rounded border border-slate-300 px-2 font-semibold disabled:opacity-45 dark:border-slate-700';
const input = 'block min-h-9 w-full rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900';

export function BookQaHeadingAudioPanel({ connection, workspace, visibility, setVisibility, optionsFor, play, channelMode, setVoices }) {
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState('');
  const [channel, setChannel] = useState('text');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const operation = useRef(null);
  useEffect(() => () => operation.current?.abort(), [connection]);
  if (!open) return <details className="mx-2 mb-2 rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700"
    data-book-heading-audio onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Title and Heading audio</summary>
  </details>;

  const { cards } = projectBookHeadings(workspace);
  const block = workspace.blocks.find(item => item.id === cardId && cards[item.id]);
  const slot = block ? 'heading' : 'mainTitle';
  const options = optionsFor(channel);
  const render = targetChannel => planBookAtomicGeneration(workspace, block, slot, targetChannel, optionsFor(targetChannel).preferences);
  const request = render(channel);
  const canPlay = resolveStructuredTextPlaybackChannelOrder(channelMode).some(targetChannel => Boolean(render(targetChannel)));
  const read = resolveBookHeadingRead(workspace);
  const run = async callback => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setMessage('Working…');
    try { setMessage(await callback(controller.signal)); }
    catch (error) { setMessage([error.code, error.message, error.reloadRequired ? 'Refresh before retrying.' : ''].filter(Boolean).join(' ')); }
    finally { operation.current = null; setBusy(false); }
  };
  const preferences = options.preferences;
  const voices = [
    ['browserTextVoiceName', 'Global Browser EN', preferences.playbackTextVoiceName],
    ['browserMeaningVoiceName', 'Global Browser ID', preferences.playbackMeaningVoiceName],
    ['edgeTextVoiceId', 'Global Edge EN', preferences.edgeTextVoiceId],
    ['edgeMeaningVoiceId', 'Global Edge ID', preferences.edgeMeaningVoiceId]
  ];
  return <details className="mx-2 mb-2 rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700"
    data-book-heading-audio onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Title and Heading audio</summary>
    <div className="mt-2 space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {Object.entries(BOOK_HEADING_LABELS).filter(([key]) => key === 'mainTitle' || workspace.documentType === 'mixed'
          || (key === 'paragraph' ? workspace.documentType === 'paragraph' : workspace.documentType === 'conversation'))
          .map(([key, label]) => <fieldset key={key} className="rounded border border-slate-300 px-2 dark:border-slate-700">
            <legend>{label}</legend>
            <label className="mr-3 inline-flex items-center gap-1 py-2"><input type="checkbox" aria-label={'Show ' + label}
              checked={visibility[key]} onChange={event => setVisibility(workspace.uid, key, event.target.checked)} />Show</label>
            <label className="inline-flex items-center gap-1 py-2"><input type="checkbox" aria-label={'Read ' + label} checked={read[key]}
              disabled={busy} onChange={event => {
                const checked = event.target.checked;
                void run(async () => {
                  const result = await connection.session.dispatch({ type: 'document.update',
                    payload: { id: workspace.id, headingRead: { workspaceUid: workspace.uid, key, read: checked } } });
                  if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
                  return 'Read preference saved.';
                });
              }} />Read</label>
          </fieldset>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label>Audio target<select className={input} value={block?.id || ''} onChange={event => setCardId(event.target.value)}>
          <option value="">Main Title</option>
          {Object.entries(cards).filter(([, value]) => value.en || value.id).map(([id, value]) =>
            <option key={id} value={id}>{value.en || value.fallback}</option>)}
        </select></label>
        <label>Heading channel<select className={input} value={channel} onChange={event => setChannel(event.target.value)}>
          <option value="text">English</option><option value="meaning">Indonesian</option>
        </select></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={!request || busy} onClick={() => play(block?.id,
          channel === 'text' ? CHANNELS.TEXT_ONLY : CHANNELS.MEANING_ONLY)}>Play selected channel</button>
        <button type="button" className={button} disabled={!canPlay || busy} onClick={() => play(block?.id, channelMode)}>Play saved language order</button>
        <button type="button" className={button} disabled={!request || busy} onClick={() => run(async signal => {
          await connection.audio.generate([request], { signal });
          return 'Heading audio committed.';
        })}>Generate Heading</button>
        <button type="button" className={button} disabled={!request || busy} onClick={() => run(async () => {
          const snapshot = connection.session.getSnapshot();
          const result = await readBookBodyAvailability(connection.audio, snapshot, request, { withUrl: false });
          const matches = planBookAtomicPlayback(workspace, block, slot, channel, options);
          const playable = (await Promise.all(matches.map(candidate =>
            readBookBodyAvailability(connection.audio, snapshot, candidate, { withUrl: false })))).some(item => item.status === 'ready');
          return 'Selected render ' + result.status.replaceAll('-', ' ') + (playable ? ' • Recorded playback available.' : ' • Browser TTS for playback.');
        })}>Verify Heading audio</button>
        {busy && <button type="button" className={button} onClick={() => operation.current?.abort()}>Cancel Heading operation</button>}
      </div>
      <label className="block">Restore exact committed Heading bytes
        <input className="block" type="file" accept="audio/mpeg,.mp3" disabled={!request || busy} onChange={event => {
          const blob = event.target.files[0];
          event.target.value = '';
          if (blob) void run(async () => {
            await connection.audio.repair(request, blob);
            await connection.refresh();
            return 'Committed Heading bytes verified.';
          });
        }} />
      </label>
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={event => {
        event.preventDefault();
        setVoices(Object.fromEntries(new FormData(event.currentTarget)));
        setMessage('Session Global voices updated.');
      }}>
        {voices.map(([name, label, value]) => <label key={name}>{label}<input name={name} className={input}
          maxLength={128} defaultValue={value || ''} /></label>)}
        <button type="submit" className={button} disabled={busy}>Set session Global voices</button>
      </form>
      <p role="status" data-book-heading-status>{message}</p>
    </div>
  </details>;
}
