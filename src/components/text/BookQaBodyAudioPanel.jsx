import { useEffect, useRef, useState } from 'react';
import { BOOK_BODY_PROFILES, getBookBodyGenerationRequests } from '../../domain/text/bookQaBodyAudioDomain.js';
import { isBookBodyAudioCard } from '../../domain/text/bookQaAudioDomain.js';
import { projectBookHeadings } from '../../domain/text/textBookHeadingDomain.js';
import { getTextStructuredSpeakerRegistry } from '../../domain/text/textStructuredSpeakerIdentityDomain.js';
import { BookQaVoiceSelect } from './BookQaVoiceSelect.jsx';
import { BookQaCoverageTable } from './BookQaCoverageTable.jsx';

const fields = ['browserVoice', 'edgeVoice', 'localVoice', 'playbackRate'];
const fieldClass = 'block w-full min-w-0 min-h-9 rounded border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900';
const buttonClass = 'min-h-9 rounded border border-slate-300 px-2 font-semibold disabled:opacity-45 dark:border-slate-700';

export function BookQaBodyAudioPanel({ connection, workspace, optionsFor, getBrowserVoice, setGlobal, onOpen }) {
  const [channel, setChannel] = useState('text');
  const [open, setOpen] = useState(false);
  const [cardId, setCardId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [profileKind, setProfileKind] = useState('paragraph');
  const [speakerId, setSpeakerId] = useState('');
  const [message, setMessage] = useState('');
  const [coverage, setCoverage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), [connection]);
  const toggle = event => {
    const next = event.currentTarget.open;
    setOpen(next);
    if (next) onOpen();
  };
  const panelClass = 'mx-2 mb-2 rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700';
  if (!open) return <details className={panelClass} data-book-body-audio="true" onToggle={toggle}>
    <summary className="cursor-pointer font-semibold">Body audio</summary>
  </details>;

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
  const { browserVoices, edgeVoices } = options;
  const { edgeRate, edgePitch, edgeTextVoiceId, edgeMeaningVoiceId, playbackTextVoiceName, playbackMeaningVoiceName } = options.preferences;
  const coverageProfile = JSON.stringify([edgeRate, edgePitch, edgeTextVoiceId, edgeMeaningVoiceId, playbackTextVoiceName, playbackMeaningVoiceName]);
  const profileCard = kind === 'paragraph' ? (card?.blockType === kind ? card : cards.find(item => item.blockType === kind)) : null;
  const speakerCard = kind === 'conversation' ? cards.find(item => item.blockType === kind
    && item.units.some(unit => unit.speakerId === speaker?.id && unit.segments.some(row => row[channel]?.trim()))) : null;
  const example = speakerCard?.units.find(unit => unit.speakerId === speaker?.id && unit.segments.some(row => row[channel]?.trim()))
    ?.segments.find(row => row[channel]?.trim());
  const browser = getBrowserVoice(example ? { ...example, blockType: 'conversation' } : null, channel,
    { block: profileCard || speakerCard, ignoreSegmentOverride: true });
  const requests = (full, one = false) => card && (!one || segment)
    ? getBookBodyGenerationRequests(workspace, card, channel, { full, options, segment: one ? segment : null }) : [];
  const canRun = entries => !busy && entries.length > 0;
  const execute = async run => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setCoverage(null);
    setBusy(true);
    setMessage('Working…');
    try { setMessage(await run(controller.signal)); }
    catch (error) { setMessage([error.code, error.message, error.reloadRequired ? 'Refresh before retrying.' : ''].filter(Boolean).join(' ')); }
    finally { active.current = null; setBusy(false); }
  };
  const generate = entries => execute(async signal => {
    const progress = ({ committed, alreadyAvailable }) => `${committed} committed, ${alreadyAvailable} already available.`;
    const result = await connection.audio.generateSequence(entries, { signal, onProgress: next => setMessage(progress(next)) });
    const stopped = result.stopped;
    const nextStep = stopped?.reloadRequired ? 'Refresh before retrying.'
      : stopped?.code === 'INVALID_AUDIO_COMPOSITION' ? 'Generate the missing Split recordings for this channel and use 1× playback speed.'
        : stopped?.status === 422 || stopped?.code === 'EDGE_VOICE_UNSUPPORTED' ? 'Select an available Edge recording voice for the affected profile and save it.'
          : stopped?.code === 'AUDIO_GENERATION_FAILED' || stopped?.status >= 500 || stopped?.status === 404
            ? 'For local UAT, start npm run server in a second terminal and check its output before retrying.' : '';
    return stopped ? [progress(result), stopped.code, stopped.message, nextStep].filter(Boolean).join(' ')
      : progress(result);
  });
  const verify = selectedCard => execute(async signal => {
    const report = await connection.audio.verifyCoverage({
      workspaceId: workspace.id, cardId: selectedCard?.id ?? null, preferences: options.preferences, signal
    });
    const scope = selectedCard ? `Card · ${headings[selectedCard.id].en || headings[selectedCard.id].fallback} · ${workspace.title}`
      : `Workspace · ${workspace.title}`;
    setCoverage({ report, scope, workspaceUid: workspace.uid, cardId: selectedCard?.id,
      snapshot: connection.session.getSnapshot(), coverageProfile, edgeVoices });
    const counts = {};
    for (const row of report.groups.filter(group => group.channel === channel && (group.representation === 'split' || group.representation.startsWith('full-')))) {
      for (const [status, count] of Object.entries(row.statuses)) counts[status] = (counts[status] ?? 0) + count;
    }
    const summary = Object.entries(counts).map(([status, count]) => count + ' ' + status.replaceAll('-', ' ')).join(', ') || 'No audible Body content';
    return `${channel === 'text' ? 'EN' : 'ID'} Split and Full Card · ${summary}.`;
  });
  const saveProfile = values => execute(async () => {
    const result = await connection.session.dispatch({ type: 'document.update', payload: { id: workspace.id, bodyAudioProfile: {
      workspaceUid: workspace.uid, kind, channel, ...(kind === 'conversation' ? { speakerId: speaker?.id } : {}), values
    } } });
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
    return 'Workspace audio profile saved.';
  });
  const one = requests(false, true), all = requests(false), full = requests(true);
  const workspaceRequests = () => cards.flatMap(item => getBookBodyGenerationRequests(workspace, item, channel, { options }));
  const workspaceHasContent = cards.some(item => item.segments.some(row => row[channel]?.trim()));
  const cardVoices = [...new Set(all.map(entry => entry.descriptor.voiceId))];
  return (
    <details className={panelClass} data-book-body-audio="true" onToggle={toggle}>
      <summary className="cursor-pointer font-semibold">Body audio</summary>
      <div className="mt-2 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <label>Channel<select className={fieldClass} value={channel} onChange={event => setChannel(event.target.value)}>
            <option value="text">English</option><option value="meaning">Indonesian</option>
          </select></label>
          <label>Card<select aria-label="Body audio Card" className={fieldClass} value={card?.id || ''} onChange={event => {
            const next = cards.find(item => item.id === event.target.value);
            if (!next) return;
            setCardId(next.id);
            setSegmentId('');
            setProfileKind(next.blockType);
            if (next.blockType === 'conversation') setSpeakerId(next.units.find(unit => unit.segments.length)?.speakerId || '');
          }}>
            {cards.map(item => <option key={item.id} value={item.id}>{headings[item.id].en || headings[item.id].fallback}</option>)}
          </select></label>
          <label>Sentence<select className={fieldClass} value={segment?.id || ''} onChange={event => setSegmentId(event.target.value)}>
            {card?.segments.map((item, index) => <option key={item.id} value={item.id}>{index + 1} · {(item[channel] || '').slice(0, 64)}</option>)}
          </select></label>
        </div>
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
          void saveProfile(Object.fromEntries(fields.map(field => {
            const value = String(data.get(field) || '').trim();
            return [field, value ? (field === 'playbackRate' ? Number(value) : value) : null];
          })));
        }}>
          <BookQaVoiceSelect name="browserVoice" label="Browser playback voice" saved={selected.browserVoice} catalog={browserVoices} className={fieldClass} />
          <BookQaVoiceSelect name="edgeVoice" label="Edge recording voice" saved={selected.edgeVoice} catalog={edgeVoices} className={fieldClass} edge />
          <BookQaVoiceSelect name="localVoice" label="Custom local voice pin" saved={selected.localVoice} catalog={edgeVoices} className={fieldClass}
            edge inheritLabel="No pin" />
          <label>Playback speed<input className={fieldClass} name="playbackRate" type="number" min="0.5" max="2" step="0.1"
            defaultValue={selected.playbackRate ?? ''} placeholder="Inherit" /></label>
          <button className={buttonClass} type="submit" disabled={busy || (kind === 'conversation' && !speaker)}>Save Workspace profile</button>
          <button className={buttonClass} type="button" disabled={busy || (kind === 'conversation' && !speaker)}
            onClick={() => saveProfile(Object.fromEntries(fields.map(field => [field, null])))}>Reset this profile</button>
        </form>
        {(profileCard || speakerCard) && <p data-book-body-voice-resolution>Browser profile: {browser.effectiveVoiceName || 'Browser system default'}. {browser.fallbackReason}</p>}
        <fieldset className="space-y-2">
          <legend className="font-semibold">Save recordings in this Book QA library</legend>
          <p>Generation uses saved profiles and any authored overrides. Card Split voices: {cardVoices.map(id => edgeVoices.find(voice => voice.id === id)?.label || id).join(', ') || 'No audible content'}.</p>
          <p>For local Edge generation, run <code>npm run server</code> in a second terminal. Compose Scene Full after verifying all Scene Split recordings for the channel at 1×.</p>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} type="button" onClick={() => generate(one)} disabled={!canRun(one)}>Generate Sentence</button>
            <button className={buttonClass} type="button" onClick={() => generate(all)} disabled={!canRun(all)}>Generate Card Split</button>
            <button className={buttonClass} type="button" onClick={() => generate(workspaceRequests())} disabled={busy || !workspaceHasContent}>Generate Workspace Split</button>
            <button className={buttonClass} type="button" onClick={() => generate(full)} disabled={!canRun(full)}>{card?.blockType === 'conversation' ? 'Compose Scene Full' : 'Generate Card Full'}</button>
            <button className={buttonClass} type="button" onClick={() => verify(card)} disabled={busy || !card}>Verify Card audio</button>
            <button className={buttonClass} type="button" onClick={() => verify(null)} disabled={busy}>Verify Workspace audio</button>
            {busy && <button className={buttonClass} type="button" onClick={() => active.current?.abort()}>Cancel</button>}
          </div>
          <p>After verification, open <a href="#book-qa-zip" onClick={() => {
            const zip = document.getElementById('book-qa-zip');
            if (zip) zip.open = true;
          }} className="font-semibold underline">Portable Audio ZIP</a> to download a file.</p>
          <p role="status" data-book-body-audio-status="true">{message}</p>
          {coverage?.workspaceUid === workspace.uid && coverage.coverageProfile === coverageProfile && coverage.edgeVoices === edgeVoices
            && (!coverage.cardId || coverage.cardId === card?.id)
            && coverage.snapshot === connection.session.getSnapshot() && <BookQaCoverageTable report={coverage.report} scope={coverage.scope} />}
        </fieldset>
        <details className="space-y-2">
          <summary className="cursor-pointer font-semibold">Session playback and repair</summary>
          <form className="grid gap-2 sm:grid-cols-3" onSubmit={event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setGlobal({ rate: Number(data.get('rate')), pitch: Number(data.get('pitch')), source: data.get('source') });
            setCoverage(null);
            setMessage('Session audio defaults updated.');
          }}>
            <label>Edge render rate<input className={fieldClass} name="rate" type="number" required min="-100" max="100" defaultValue={options.preferences.edgeRate} /></label>
            <label>Edge render pitch<input className={fieldClass} name="pitch" type="number" required min="-100" max="100" defaultValue={options.preferences.edgePitch} /></label>
            <label>Playback source<select className={fieldClass} name="source" defaultValue={options.audioSourceMode}>
              <option value="local-first">Local first</option><option value="tts-only">Browser TTS only</option><option value="custom-local">Custom local voice</option>
            </select></label>
            <button className={buttonClass} type="submit" disabled={busy}>Set session audio defaults</button>
          </form>
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
        </details>
      </div>
    </details>
  );
}
