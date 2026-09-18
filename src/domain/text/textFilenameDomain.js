const clean = value => String(value ?? '').trim();

export const sanitizeTextFilenameToken = (value, fallback = 'TEXT', maxLength = 72) => {
  const token = clean(value)
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/[-_]{2,}/g, '_')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, Math.max(8, Number(maxLength || 72)));
  return token || fallback;
};

export const compactTextVoiceFilenameLabel = value => {
  const raw = clean(value);
  if (!raw) return 'Voice';
  const microsoft = raw.match(/^Microsoft\s+(.+?)\s+(?:Online|Desktop|Natural)/i);
  if (microsoft?.[1]) return sanitizeTextFilenameToken(microsoft[1], 'Voice', 36);
  const tail = raw.split('-').pop() || raw;
  const compact = tail
    .replace(/Neural$/i, '')
    .replace(/Multilingual$/i, '')
    .replace(/Online$/i, '')
    .replace(/Natural$/i, '');
  return sanitizeTextFilenameToken(compact || raw, 'Voice', 36);
};

export const textVoiceFilenameTokenMatches = (token, voiceId) => {
  const left = clean(token).toLowerCase();
  const right = clean(voiceId).toLowerCase();
  if (!left || !right) return !left && !right;
  if (left === right) return true; // legacy full canonical voice token
  return compactTextVoiceFilenameLabel(token).toLowerCase() === compactTextVoiceFilenameLabel(voiceId).toLowerCase();
};

export const formatTextFilenameTimestamp = value => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return safe.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const join = (...tokens) => tokens.filter(Boolean).map(token => sanitizeTextFilenameToken(token, 'TEXT')).join('__');

export const buildCanonicalTextPackFilename = ({ scopeType, title, packageId }) =>
  `${join('ProLingo', 'TEXT_PACK', String(scopeType || 'scope').toUpperCase(), title || 'Text', packageId || 'PACKAGE')}.json`;

export const buildCanonicalTextDatabaseBackupFilename = ({ createdAt = null } = {}) =>
  `${join('ProLingo', 'TEXT_DB_BACKUP', formatTextFilenameTimestamp(createdAt))}.json`;

export const buildCanonicalTextAudioFilename = ({ audioVariantId, segmentId, channel, engine, voiceId, extension = 'mp3' }) => {
  const ext = sanitizeTextFilenameToken(String(extension || 'mp3').replace(/^\.+/, '').toLowerCase(), 'mp3', 8);
  return `${join(
    String(segmentId || 'SEGMENT').toUpperCase(),
    String(channel || 'text').toUpperCase(),
    String(engine || 'local').toUpperCase(),
    compactTextVoiceFilenameLabel(voiceId),
    String(audioVariantId || 'TXTAUDIO').toUpperCase()
  )}.${ext}`;
};

export const buildCanonicalTextBrowserAudioPackageFilename = ({ title = 'Text', createdAt = null } = {}) =>
  `${join('ProLingo', 'TEXT_AUDIO', title, formatTextFilenameTimestamp(createdAt))}.zip`;

const normalizeVoiceGroup = voiceIds => {
  const labels = [...new Set((Array.isArray(voiceIds) ? voiceIds : [voiceIds]).filter(Boolean).map(compactTextVoiceFilenameLabel))];
  if (!labels.length) return 'Voice';
  if (labels.length <= 3) return labels.join('+');
  return `${labels.slice(0, 2).join('+')}+${labels.length - 2}`;
};

export const buildCanonicalTextCardZipFilename = ({ documentTitle = 'Text', blockId = 'CARD', voiceIds = [] } = {}) =>
  `${join(documentTitle, String(blockId || 'CARD').toUpperCase(), normalizeVoiceGroup(voiceIds), 'CARD_AUDIO')}.zip`;

export const buildCanonicalTextDocumentZipFilename = ({ documentTitle = 'Text', voiceIds = [], partNo = null } = {}) => {
  const base = [documentTitle, normalizeVoiceGroup(voiceIds), 'TEXT_AUDIO'];
  if (partNo) base.push(`PART_${String(partNo).padStart(2, '0')}`);
  return `${join(...base)}.zip`;
};

export const buildCanonicalTextConsolidatedZipFilename = ({ documentTitle = 'Text', voiceIds = [], partial = false, partNo = null } = {}) => {
  const base = [documentTitle, normalizeVoiceGroup(voiceIds), partial ? 'PARTIAL' : 'FULL', 'TEXT_AUDIO'];
  if (partNo) base.push(`PART_${String(partNo).padStart(2, '0')}`);
  return `${join(...base)}.zip`;
};
