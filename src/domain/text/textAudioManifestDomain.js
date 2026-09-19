import { TEXT_AUDIO_MANIFEST_FILENAME, normalizeTextRenderFingerprint } from './textFilenameDomain.js';

export const PROLINGO_TEXT_AUDIO_MANIFEST_TYPE = 'prolingo-text-audio-manifest';
export const PROLINGO_TEXT_AUDIO_MANIFEST_VERSION = 1;
export { TEXT_AUDIO_MANIFEST_FILENAME };

const clean = value => String(value ?? '').trim();
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

export const buildProLingoTextAudioManifest = ({ entries = [], createdAt = Date.now(), source = null } = {}) => {
  const seen = new Set();
  const normalized = [];
  for (const candidate of entries || []) {
    const rf = normalizeTextRenderFingerprint(candidate?.rf || candidate?.renderFingerprint);
    if (!rf || seen.has(rf)) continue;
    seen.add(rf);
    normalized.push({
      rf,
      filename: clean(candidate?.filename),
      mimeType: clean(candidate?.mimeType) || null,
      size: Math.max(0, Number(candidate?.size || 0)),
      render: isObject(candidate?.render) ? { ...candidate.render } : null,
      references: Array.isArray(candidate?.references) ? candidate.references.map(item => ({ ...item })) : []
    });
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
  if (Number(candidate.packageVersion) !== PROLINGO_TEXT_AUDIO_MANIFEST_VERSION) throw new Error(`Unsupported Text Audio Manifest version: ${candidate.packageVersion}`);
  if (!Array.isArray(candidate.entries)) throw new Error('Text Audio Manifest entries must be an array');
  const seen = new Set();
  const entries = candidate.entries.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`Text Audio Manifest entry ${index} must be an object`);
    const rf = normalizeTextRenderFingerprint(entry.rf);
    if (!rf) throw new Error(`Text Audio Manifest entry ${index} has invalid RF`);
    if (seen.has(rf)) throw new Error(`Text Audio Manifest duplicate RF: ${rf}`);
    seen.add(rf);
    const filename = clean(entry.filename);
    if (!filename) throw new Error(`Text Audio Manifest entry ${index} requires filename`);
    return {
      rf,
      filename,
      mimeType: clean(entry.mimeType) || null,
      size: Math.max(0, Number(entry.size || 0)),
      render: isObject(entry.render) ? { ...entry.render } : null,
      references: Array.isArray(entry.references) ? entry.references.map(item => ({ ...item })) : []
    };
  });
  return { ...candidate, entries };
};

export const parseProLingoTextAudioManifestJson = raw => {
  let parsed;
  try { parsed = JSON.parse(String(raw ?? '')); }
  catch (error) { throw new Error(`Invalid Text Audio Manifest JSON: ${error.message}`); }
  return validateProLingoTextAudioManifest(parsed);
};

export const buildTextAudioManifestIndex = manifestCandidate => {
  const manifest = validateProLingoTextAudioManifest(manifestCandidate);
  const byRf = new Map();
  const byFilename = new Map();
  manifest.entries.forEach(entry => {
    byRf.set(entry.rf, entry);
    byFilename.set(entry.filename.toLowerCase(), entry);
  });
  return { manifest, byRf, byFilename };
};
