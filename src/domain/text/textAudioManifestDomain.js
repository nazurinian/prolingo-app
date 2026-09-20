import {
  TEXT_AUDIO_MANIFEST_FILENAME,
  normalizeTextFullArtifactFingerprint,
  normalizeTextRenderFingerprint
} from './textFilenameDomain.js';

export const PROLINGO_TEXT_AUDIO_MANIFEST_TYPE = 'prolingo-text-audio-manifest';
export const PROLINGO_TEXT_AUDIO_MANIFEST_VERSION = 2;
export const PROLINGO_TEXT_AUDIO_MANIFEST_SUPPORTED_VERSIONS = Object.freeze([1, 2]);
export { TEXT_AUDIO_MANIFEST_FILENAME };

const clean = value => String(value ?? '').trim();
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const normalizeRepresentation = value => String(value || '').toLowerCase() === 'full' ? 'full' : 'split';

const normalizeEntryIdentity = candidate => {
  const explicitRepresentation = normalizeRepresentation(candidate?.representation || (candidate?.fullArtifactFingerprint ? 'full' : 'split'));
  if (explicitRepresentation === 'full') {
    const identity = normalizeTextFullArtifactFingerprint(candidate?.identity || candidate?.fullArtifactFingerprint);
    return identity ? { identity, representation: 'full', rf: null, fullArtifactFingerprint: identity } : null;
  }
  const identity = normalizeTextRenderFingerprint(candidate?.identity || candidate?.rf || candidate?.renderFingerprint);
  return identity ? { identity, representation: 'split', rf: identity, fullArtifactFingerprint: null } : null;
};

const normalizeEntry = (candidate, index, { strict = false } = {}) => {
  if (!isObject(candidate)) {
    if (strict) throw new Error(`Text Audio Manifest entry ${index} must be an object`);
    return null;
  }
  const identity = normalizeEntryIdentity(candidate);
  if (!identity) {
    if (strict) throw new Error(`Text Audio Manifest entry ${index} has invalid physical identity`);
    return null;
  }
  const filename = clean(candidate.filename);
  if (!filename) {
    if (strict) throw new Error(`Text Audio Manifest entry ${index} requires filename`);
    return null;
  }
  return {
    ...identity,
    filename,
    mimeType: clean(candidate.mimeType) || null,
    size: Math.max(0, Number(candidate.size || 0)),
    render: isObject(candidate.render) ? { ...candidate.render } : null,
    references: Array.isArray(candidate.references) ? candidate.references.map(item => ({ ...item })) : []
  };
};

export const buildProLingoTextAudioManifest = ({ entries = [], createdAt = Date.now(), source = null } = {}) => {
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < (entries || []).length; index += 1) {
    const entry = normalizeEntry(entries[index], index);
    if (!entry) continue;
    const key = `${entry.representation}|${entry.identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }
  return {
    packageType: PROLINGO_TEXT_AUDIO_MANIFEST_TYPE,
    packageVersion: PROLINGO_TEXT_AUDIO_MANIFEST_VERSION,
    createdAt: new Date(createdAt).toISOString(),
    source: isObject(source) ? { ...source } : null,
    entries: normalized
  };
};

export const validateProLingoTextAudioManifest = candidate => {
  if (!isObject(candidate)) throw new Error('Text Audio Manifest root must be an object');
  if (candidate.packageType !== PROLINGO_TEXT_AUDIO_MANIFEST_TYPE) throw new Error(`Unsupported Text Audio Manifest type: ${candidate.packageType || 'missing'}`);
  const version = Number(candidate.packageVersion);
  if (!PROLINGO_TEXT_AUDIO_MANIFEST_SUPPORTED_VERSIONS.includes(version)) throw new Error(`Unsupported Text Audio Manifest version: ${candidate.packageVersion}`);
  if (!Array.isArray(candidate.entries)) throw new Error('Text Audio Manifest entries must be an array');

  const seen = new Set();
  const entries = candidate.entries.map((entry, index) => {
    // v1 manifests were Split-only and used `rf` as the physical identity.
    const source = version === 1 ? { ...entry, representation: 'split', identity: entry?.rf } : entry;
    const normalized = normalizeEntry(source, index, { strict: true });
    const key = `${normalized.representation}|${normalized.identity}`;
    if (seen.has(key)) throw new Error(`Text Audio Manifest duplicate physical identity: ${normalized.identity}`);
    seen.add(key);
    return normalized;
  });
  return { ...candidate, packageVersion: version, entries };
};

export const parseProLingoTextAudioManifestJson = raw => {
  let parsed;
  try { parsed = JSON.parse(String(raw ?? '')); }
  catch (error) { throw new Error(`Invalid Text Audio Manifest JSON: ${error.message}`); }
  return validateProLingoTextAudioManifest(parsed);
};

export const buildTextAudioManifestIndex = manifestCandidate => {
  const manifest = validateProLingoTextAudioManifest(manifestCandidate);
  const byIdentity = new Map();
  const byRf = new Map();
  const byFullArtifactFingerprint = new Map();
  const byFilename = new Map();
  manifest.entries.forEach(entry => {
    byIdentity.set(entry.identity, entry);
    if (entry.rf) byRf.set(entry.rf, entry);
    if (entry.fullArtifactFingerprint) byFullArtifactFingerprint.set(entry.fullArtifactFingerprint, entry);
    byFilename.set(entry.filename.toLowerCase(), entry);
  });
  return { manifest, byIdentity, byRf, byFullArtifactFingerprint, byFilename };
};
