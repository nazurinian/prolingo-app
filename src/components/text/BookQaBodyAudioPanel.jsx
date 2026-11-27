import { useEffect, useRef, useState } from 'react';
import { BOOK_BODY_PROFILES, getBookBodyGenerationRequests } from '../../domain/text/bookQaBodyAudioDomain.js';
import { BOOK_AUDIO_MAX_ITEMS, isBookBodyAudioCard } from '../../domain/text/bookQaAudioDomain.js';
import { projectBookHeadings } from '../../domain/text/textBookHeadingDomain.js';
import { getTextStructuredSpeakerRegistry } from '../../domain/text/textStructuredSpeakerIdentityDomain.js';
import { readBookBodyAvailability } from '../../services/audio/bookQaBodyAudioService.js';

const fields = [['browserVoice', 'Browser voice name'], ['edgeVoice', 'Edge voice ID'], ['localVoice', 'Local voice pin'], ['playbackRate', 'Playback speed']];
const fieldClass = 'block w-full min-h-9 rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900';
const buttonClass = 'min-h-9 rounded border border-slate-300 px-2 font-semibold disabled:opacity-45 dark:border-slate-700';

export function BookQaBodyAudioPanel({ connection, workspace, optionsFor, setGlobal, onOpen }) {
  const [channel, setChannel] = useState('text');
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [profileKind, setProfileKind] = useState('paragraph');
  const [speakerId, setSpeakerId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), [connection]);
  const cards = workspace.blocks.filter(isBookBodyAudioCard);
  const headings = projectBookHeadings(workspace).cards;
  const card = cards.find(item => item.id === cardId) || cards[0];
  const segment = card?.segments.find(item => item.id === segmentId) || card?.segments[0];
  const speakers = getTextStructuredSpeakerRegistry(workspace);
  const speaker = speakers.find(item => item.id === speakerId) || speakers[0];
  const kind = workspace.documentType === 'mixed' ? profileKind : workspace.documentType;
  const saved = workspace.metadata?.[BOOK_BODY_PROFILES];
  const selected = (kind === 'conversation' ? saved?.speakers?.[speaker?.id]?.[channel] : saved?.paragraph?.[channel]) || {};
  const options = optionsFor(channel);
  const requests = (full, one = false) => card && (!one || segment)
    ? getBookBodyGenerationRequests(workspace, card, channel, { full, options, segment: one ? segment : null }) : [];
  const canRun = entries => !busy && entries.length > 0 && entries.length <= BOOK_AUDIO_MAX_ITEMS;
  const execute = async run => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage('Working…');
    try { setMessage(await run(controller.signal)); }
    catch (error) { setMessage([error.code, error.message, error.reloadRequired ? 'Refresh before retrying.' : ''].filter(Boolean).join(' ')); }
    finally { active.current = null; setBusy(false); }
  };
  const generate = entries => execute(async signal => {
    const result = await connection.audio.generate(entries, { signal });
    return result.results.length + ' committed';
  });
  const verify = entries => execute(async signal => {
    const counts = {};
    for (const entry of entries) {
      if (signal.aborted) return 'Cancelled';
      const { status } = await readBookBodyAvailability(connection.audio, connection.session.getSnapshot(), entry, { withUrl: false });
      counts[status] = (counts[status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => count + ' ' + status.replaceAll('-', ' ')).join(', ') || 'No audible content.';
  });
  const saveProfile = values => execute(async () => {
    const result = await connection.session.dispatch({ type: 'document.update', payload: { id: workspace.id, bodyAudioProfile: {
      workspaceUid: workspace.uid, kind, channel, ...(kind === 'conversation' ? { speakerId: speaker?.id } : {}), values
    } } });
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
    return 'Workspace audio profile saved.';
  });
  const one = requests(false, true), all = requests(false), full = requests(true);
  return (
    <details className="mx-2 mb-2 rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700" data-book-body-audio="true"
      onToggle={event => { const next = event.currentTarget.open; setOpen(next); if (next) onOpen(); }}>
      <summary className="cursor-pointer font-semibold">Body audio</summary>
      {open && <div className="mt-2 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>Channel<select className={fieldClass} value={channel} onChange={event => setChannel(event.target.value)}>
            <option value="text">English</option><option value="meaning">Indonesian</option>
          </select></label>
          <label>Card<select aria-label="Body audio Card" className={fieldClass} value={card?.id || ''} onChange={event => { setCardId(event.target.value); setSegmentId(''); }}>
            {cards.map(item => <option key={item.id} value={item.id}>{headings[item.id].en || headings[item.id].fallback}</option>)}
          </select></label>
          <label>Sentence<select className={fieldClass} value={segment?.id || ''} onChange={event => setSegmentId(event.target.value)}>
            {card?.segments.map((item, index) => <option key={item.id} value={item.id}>{index + 1} · {(item[channel] || '').slice(0, 64)}</option>)}
          </select></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} type="button" onClick={() => generate(one)} disabled={!canRun(one)}>Generate Sentence</button>
          <button className={buttonClass} type="button" onClick={() => generate(all)} disabled={!canRun(all)}>Generate Card Split</button>
          <button className={buttonClass} type="button" onClick={() => generate(full)} disabled={!canRun(full)}>{card?.blockType === 'conversation' ? 'Compose Scene Full' : 'Generate Card Full'}</button>
          <button className={buttonClass} type="button" onClick={() => verify([...all, ...full])} disabled={busy || !card}>Verify Card audio</button>
          {busy && <button className={buttonClass} type="button" onClick={() => active.current?.abort()}>Cancel</button>}
        </div>
        {all.length > BOOK_AUDIO_MAX_ITEMS && <p>Cards over 32 Split targets can be generated one Sentence at a time.</p>}
        <button className={buttonClass} type="button" onClick={() => setRepairOpen(value => !value)} aria-expanded={repairOpen}>Restore committed bytes</button>
        {repairOpen && <div className="flex flex-wrap gap-2">
          {[['Sentence', one[0]], ['Full Card', full[0]]].map(([label, entry]) => entry && <label key={label} className="text-xs">
            Repair {label} from matching audio
            <input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" disabled={busy} className="block" onChange={event => {
              const blob = event.target.files[0];
              event.target.value = '';
              if (blob) void execute(async () => {
                await connection.audio.repair(entry, blob);
                await connection.refresh();
                return 'Committed audio bytes verified.';
              });
            }} />
          </label>)}
        </div>}
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setGlobal({ rate: Number(data.get('rate')), pitch: Number(data.get('pitch')), source: data.get('source') });
          setMessage('Session audio defaults updated.');
        }}>
          <label>Edge render rate<input className={fieldClass} name="rate" type="number" required min="-100" max="100" defaultValue={options.preferences.edgeRate} /></label>
          <label>Edge render pitch<input className={fieldClass} name="pitch" type="number" required min="-100" max="100" defaultValue={options.preferences.edgePitch} /></label>
          <label>Playback source<select className={fieldClass} name="source" defaultValue={options.audioSourceMode}>
            <option value="local-first">Local first</option><option value="tts-only">Browser TTS only</option><option value="custom-local">Custom local voice</option>
          </select></label>
          <button className={buttonClass} type="submit" disabled={busy}>Set session audio defaults</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {workspace.documentType === 'mixed' && <label>Workspace profile<select className={fieldClass} value={kind} onChange={event => setProfileKind(event.target.value)}>
            <option value="paragraph">Paragraph narrator</option><option value="conversation">Conversation Speaker</option>
          </select></label>}
          {kind === 'conversation' && <label>Speaker<select className={fieldClass} value={speaker?.id || ''} onChange={event => setSpeakerId(event.target.value)}>
            {speakers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>}
        </div>
        <form key={JSON.stringify([workspace.uid, kind, speaker?.id, channel, selected])} className="grid gap-2 sm:grid-cols-2" onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void saveProfile(Object.fromEntries(fields.map(([field]) => {
            const value = String(data.get(field) || '').trim();
            return [field, value ? (field === 'playbackRate' ? Number(value) : value) : null];
          })));
        }}>
          {fields.map(([field, label]) => <label key={field}>{label}<input className={fieldClass} name={field}
            type={field === 'playbackRate' ? 'number' : 'text'} min="0.5" max="2" step="0.1"
            maxLength={128} defaultValue={selected[field] ?? ''} placeholder="Inherit" /></label>)}
          <button className={buttonClass} type="submit" disabled={busy || (kind === 'conversation' && !speaker)}>Save Workspace profile</button>
          <button className={buttonClass} type="button" disabled={busy || (kind === 'conversation' && !speaker)}
            onClick={() => saveProfile(Object.fromEntries(fields.map(([field]) => [field, null])))}>Reset this profile</button>
        </form>
        <p role="status" data-book-body-audio-status="true">{message}</p>
      </div>}
    </details>
  );
}
