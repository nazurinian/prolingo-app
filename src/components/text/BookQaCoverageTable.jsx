const bookCoverageLabels = {
  split: 'Split Sentence',
  'full-paragraph': 'Full Paragraph Card',
  'full-conversation': 'Full Conversation Card',
  'main-title': 'Main Title',
  'paragraph-heading': 'Paragraph Heading',
  'scene-heading': 'Conversation Heading',
  'section-composition': 'Full Section composition',
  'turn-composition': 'Full Turn composition'
};

const labels = {
  missing: 'Missing', stale: 'Stale', 'other-profile': 'Other Profile', unsupported: 'Unsupported', corrupt: 'Corrupt',
  'metadata-only': 'Metadata Only', 'legacy-unverified': 'Unverified', 'unverified-composition': 'Unverified composition',
  'missing-unit-input': 'Missing current Split input', 'unavailable-unit-input': 'Unavailable Split bytes',
  'unsupported-unit-rate': 'Requires 1× playback', 'unsupported-unit-composition': 'Input limit exceeded'
};

const breakdown = statuses => Object.entries(statuses).map(([key, count]) =>
  count + ' ' + (labels[key] ?? key.replaceAll('-', ' '))).join(', ');

export function BookQaCoverageTable({ report, scope }) {
  const groups = new Map(report.groups.map(group => [group.representation + '|' + group.channel, group]));
  const renderCell = group => {
    if (!group) return <span className="text-slate-500">No requirement</span>;
    const composition = group.representation.endsWith('-composition');
    const { ready = 0, eligible = 0, ...diagnostics } = group.statuses;
    return <>
      <div>{composition ? eligible : ready}/{group.expected} {composition ? 'eligible' : 'current Ready'}</div>
      {Object.keys(diagnostics).length > 0 && <div>{breakdown(diagnostics)}</div>}
      {group.otherReady > 0 && <div>{group.otherReady} verified alternate {group.otherReady === 1 ? 'reference' : 'references'}</div>}
      {Object.keys(group.otherDiagnostics).length > 0 && <div>Alternate diagnostics · {breakdown(group.otherDiagnostics)}</div>}
    </>;
  };
  return <div className="overflow-x-auto" data-book-qa-coverage>
    <table className="w-full text-left text-xs">
      <caption className="py-1 text-left text-sm font-semibold">Verified coverage · {scope}</caption>
      <thead><tr><th className="p-1" scope="col">Audio</th><th className="p-1" scope="col">EN</th><th className="p-1" scope="col">ID</th></tr></thead>
      <tbody>{Object.entries(bookCoverageLabels).map(([key, label]) =>
        <tr key={key} className="border-t border-slate-300 align-top dark:border-slate-700" data-book-coverage-row={key}>
          <th className="p-1 font-medium" scope="row">{label}</th>
          {['text', 'meaning'].map(channel => <td key={channel} className="p-1" data-book-coverage-channel={channel}>
            {renderCell(groups.get(key + '|' + channel))}
          </td>)}
        </tr>)}</tbody>
    </table>
    <p className="text-xs">Composition eligibility checks current Split inputs and 1× playback. Listening export checks decoded duration and creates the Unit WAVs for that download.</p>
  </div>;
}
