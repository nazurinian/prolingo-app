import { useEffect, useRef, useState } from 'react';
import { buildCanonicalTextBrowserAudioPackageFilename } from '../../domain/text/textFilenameDomain.js';
import { triggerBrowserDownload } from '../../utils/audioUtils.js';

const button = 'min-h-9 rounded border border-slate-300 px-3 font-semibold disabled:opacity-45 dark:border-slate-700';
const countsBy = (items, getKey) => Object.entries(items.reduce((counts, item) => {
  const key = getKey(item);
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {})).map(([key, count]) => key + ' ' + count).join(', ');
const representationLabel = {
  'main-title': 'Main Title', 'paragraph-heading': 'Paragraph Heading', 'scene-heading': 'Scene Heading',
  split: 'Split', 'full-paragraph': 'Full Paragraph', 'full-conversation': 'Full Conversation'
};

export function BookQaPortableAudioPanel({ connection, workspace, preferences }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(workspace ? 'workspace' : 'library');
  const [includeAlternate, setIncludeAlternate] = useState(true);
  const [channel, setChannel] = useState('both');
  const [representations, setRepresentations] = useState(['main-title', 'heading', 'full', 'unit', 'split']);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);
  const operation = useRef(null);
  useEffect(() => () => operation.current?.abort(), [connection]);
  const run = async direction => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setDetails(null);
    setMessage(direction === 'import' ? 'Checking archives and audio bytes…' : 'Checking scoped audio bytes…');
    const workspaceId = scope === 'workspace' ? workspace?.id ?? null : null;
    const options = { workspaceId, preferences, signal: controller.signal };
    try {
      if (direction !== 'import') {
        const normal = direction === 'normal';
        const exportOptions = { ...options, includeAlternate, channels: channel === 'both' ? ['text', 'meaning'] : [channel], representations,
          onProgress: progress => { if (!controller.signal.aborted) setMessage(`Checked ${progress.completed} audio occurrences.`); } };
        const { blob, report } = await (normal ? connection.audio.exportNormal(exportOptions) : connection.audio.exportPortable(exportOptions));
        if (controller.signal.aborted) {
          setMessage('AUDIO_CANCELLED Audio export was cancelled.');
          return;
        }
        setDetails(normal ? { ...report, normal: true } : report);
        setMessage(blob ? normal ? `Exported ${report.logical} listening occurrences.` : `Exported ${report.physical} verified assets and ${report.logical} references.` : 'No verified audio to export.');
        if (blob) {
          const url = URL.createObjectURL(blob);
          try {
            const title = workspaceId ? workspace.title : 'Book_QA_Library';
            triggerBrowserDownload(url, buildCanonicalTextBrowserAudioPackageFilename({ title: normal ? `${title}_Listening` : title }));
          } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
        }
      } else {
        const report = await connection.audio.importPortable(files, { ...options, onProgress: progress => {
          if (!controller.signal.aborted) setMessage(`Batch ${progress.batches} complete. ${progress.committed} references committed.`);
        } });
        setDetails(report);
        setMessage(report.stopped
          ? `Stopped after ${report.logicalCommitted} committed references. ${report.stopped.code} ${report.stopped.message}`
          : `Import complete. ${report.logicalCommitted} references committed and ${report.alreadyAvailable} already available.`);
      }
    } catch (error) { setMessage([error.code, error.message].filter(Boolean).join(' ')); }
    finally { operation.current = null; setBusy(false); }
  };
  return <details className="mx-2 mb-2 rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700" data-book-portable-audio
    onToggle={event => {
      setOpen(event.currentTarget.open);
      if (!event.currentTarget.open) setFiles([]);
    }}>
    <summary className="cursor-pointer font-semibold">Portable Audio ZIP</summary>
    {open && <div className="mt-2 space-y-2">
      <label className="mr-4">Scope <select className="min-h-9 max-w-full rounded border px-2 dark:bg-slate-900" value={workspace ? scope : 'library'}
        disabled={busy} onChange={event => setScope(event.target.value)}>
        {workspace && <option value="workspace">Selected Workspace</option>}
        <option value="library">Connected Library</option>
      </select></label>
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={includeAlternate}
        disabled={busy} onChange={event => setIncludeAlternate(event.target.checked)} />Include alternate profiles in export</label>
      <label className="block">Listening channels <select value={channel} disabled={busy} onChange={event => setChannel(event.target.value)}>
        <option value="both">EN and ID</option><option value="text">EN</option><option value="meaning">ID</option>
      </select></label>
      <fieldset><legend>Listening representations</legend>
        {Object.entries({ 'main-title': 'Main Title', heading: 'Headings', full: 'Full Card', unit: 'Full Section/Turn', split: 'Split' }).map(([key, text]) =>
          <label key={key} className="mr-3 inline-flex gap-1"><input type="checkbox" disabled={busy} checked={representations.includes(key)}
            onChange={event => setRepresentations(current => event.target.checked ? [...current, key] : current.filter(item => item !== key))} />{text}</label>)}
      </fieldset>
      <p>Full Section and Turn use current profiles at 1×.</p>
      <label className="block">ZIP packages or canonical audio files<input type="file" accept=".zip,.mp3,.wav,application/zip" multiple
        className="block max-w-full" disabled={busy} onChange={event => setFiles([...event.target.files])} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={button} type="button" disabled={busy} onClick={() => run('export')}>Export Portable Audio</button>
        <button className={button} type="button" disabled={busy} onClick={() => run('normal')}>Export Normal Audio</button>
        <button className={button} type="button" disabled={busy || !files.length} onClick={() => run('import')}>Import selected files</button>
        {busy && <button className={button} type="button" onClick={() => operation.current?.abort()}>Cancel transfer</button>}
      </div>
      <p role="status" data-book-portable-status>{message}</p>
      {details && (details.normal ? <p>Listening omissions {countsBy(details.omissions, row => row.status) || 'none'}.</p> : 'physicalDiscovered' in details ? <>
        <p>Asset entries discovered {details.physicalDiscovered}, validated {details.physicalValidated}. Unique verified assets {details.physicalUniqueValidated}, stored {details.physicalStored},
          reused {details.physicalReused}, repaired {details.physicalRepaired}. Logical matches {details.logicalMatched}, other profiles {details.otherProfile}.</p>
        {details.issues.length > 0 && <p>Archive and asset issues {countsBy(details.issues, row => row.status)}.</p>}
        {details.logical.length > 0 && <p>Logical outcomes {countsBy(details.logical, row => row.status)}.</p>}
      </> : <>
        <p>Alternate references {details.alternate}, omitted {details.omissions.length}.</p>
        {details.omissions.length > 0 && <p>Omission reasons {countsBy(details.omissions, row => row.status)}.</p>}
        {details.coverage.length > 0 && <ul data-book-portable-coverage className="space-y-1">
          {details.coverage.map(({ representation, channel, expected, available, exported, alternateExported, statuses }) => {
            const unavailable = Object.entries(statuses).filter(([status]) => status !== 'ready')
              .map(([status, count]) => count + ' ' + status.replaceAll('-', ' '));
            return <li key={representation + '|' + channel}>
              {representationLabel[representation]} {channel === 'text' ? 'EN' : 'ID'} · {available}/{expected} current available · {exported} current exported
              {alternateExported > 0 && ` · ${alternateExported} alternate exported`}
              {unavailable.length > 0 && ` · ${unavailable.join(', ')}`}
            </li>;
          })}
        </ul>}
      </>)}
    </div>}
  </details>;
}
