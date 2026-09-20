export const TEXT_AUDIO_INDEX_FILENAME = 'AUDIO_INDEX.csv';

const clean = value => String(value ?? '').trim();
const csv = value => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const referenceRows = entry => {
  const refs = Array.isArray(entry?.references) && entry.references.length ? entry.references : [{}];
  return refs.map(reference => ({ entry, reference }));
};

export const buildTextAudioIndexRows = manifest => (manifest?.entries || []).flatMap(referenceRows).map(({ entry, reference }) => ({
  file: clean(entry?.filename),
  representation: clean(entry?.representation) || 'split',
  identity: clean(entry?.identity || entry?.rf || entry?.fullArtifactFingerprint),
  scope: clean(reference?.scope || manifest?.source?.kind),
  collection: clean(reference?.collectionTitle || reference?.collectionId),
  workspace: clean(reference?.documentTitle || reference?.workspaceTitle || reference?.documentId),
  card: clean(reference?.cardTitle || reference?.cardId || reference?.blockId),
  segment: clean(reference?.segmentLabel || reference?.segmentId),
  channel: clean(reference?.channel || entry?.render?.channel),
  voice: clean(reference?.voiceId || entry?.render?.voiceId),
  playbackOrder: reference?.playbackOrder ?? '',
  status: clean(reference?.status || 'ready'),
  notes: clean(reference?.notes)
}));

export const buildTextAudioIndexCsv = manifest => {
  const headers = ['file', 'representation', 'identity', 'scope', 'collection', 'workspace', 'card', 'segment', 'channel', 'voice', 'playbackOrder', 'status', 'notes'];
  const lines = [headers.join(',')];
  for (const row of buildTextAudioIndexRows(manifest)) lines.push(headers.map(key => csv(row[key])).join(','));
  return `${lines.join('\n')}\n`;
};
