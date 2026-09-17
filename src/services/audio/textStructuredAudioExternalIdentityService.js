import { parseTextStructuredGeneratedFilename } from '../../domain/text/textStructuredAudioGenerationDomain.js';
import { textVoiceFilenameTokenMatches } from '../../domain/text/textFilenameDomain.js';

const clean = value => String(value ?? '').trim();
const upper = value => clean(value).toUpperCase();
const lower = value => clean(value).toLowerCase();

const sourceId = record => clean(record?.metadata?.prolingoTextPackSource?.sourceId);
const sourceEntity = record => lower(record?.metadata?.prolingoTextPackSource?.sourceEntity);

const pushIndex = (map, key, value) => {
  const normalized = upper(key);
  if (!normalized) return;
  const list = map.get(normalized) || [];
  list.push(value);
  map.set(normalized, list);
};

export const parseTextStructuredLegacyAudioFilename = filename => {
  const name = clean(filename).split('/').filter(Boolean).pop() || '';
  // Pre-structured filenames such as TEXT_000002_en-GB-SoniaNeural_text.mp3 do
  // not contain SEGMENT_ID/TXTAUDIO_ID, so they are detected for audit only.
  const match = name.match(/^(TEXT_\d+)_(.+)_(text|meaning)\.(mp3|wav|ogg|webm)$/i);
  if (!match) return null;
  return {
    textId: match[1].toUpperCase(),
    voiceToken: match[2],
    channel: match[3].toLowerCase(),
    extension: match[4].toLowerCase(),
    filename: name
  };
};

export const buildTextStructuredExternalAudioIdentityIndex = ({ audioVariants = [], segments = [] } = {}) => {
  const variantsByCurrentId = new Map();
  const variantsBySourceId = new Map();
  const segmentsByCurrentId = new Map();
  const segmentsBySourceId = new Map();

  (Array.isArray(segments) ? segments : []).forEach(segment => {
    if (segment?.id) segmentsByCurrentId.set(upper(segment.id), segment);
    if (sourceEntity(segment) === 'segment' && sourceId(segment)) pushIndex(segmentsBySourceId, sourceId(segment), segment);
  });
  (Array.isArray(audioVariants) ? audioVariants : []).forEach(variant => {
    if (variant?.id) variantsByCurrentId.set(upper(variant.id), variant);
    if (sourceEntity(variant) === 'audiovariant' && sourceId(variant)) pushIndex(variantsBySourceId, sourceId(variant), variant);
  });

  return { variantsByCurrentId, variantsBySourceId, segmentsByCurrentId, segmentsBySourceId };
};

const segmentMatchesParsedIdentity = ({ variant, parsed, index }) => {
  if (upper(variant?.segmentId) === upper(parsed?.segmentId)) return { matched: true, aliasMatched: false };
  const currentSegment = index.segmentsByCurrentId.get(upper(variant?.segmentId));
  if (currentSegment && sourceEntity(currentSegment) === 'segment' && upper(sourceId(currentSegment)) === upper(parsed?.segmentId)) {
    return { matched: true, aliasMatched: true };
  }
  return { matched: false, aliasMatched: false };
};

const variantMatchesParsedDetails = ({ variant, parsed }) => {
  if (lower(variant?.channel) !== lower(parsed?.channel)) return false;
  if (lower(variant?.engine) !== lower(parsed?.engine)) return false;
  if (clean(variant?.voiceId) && !textVoiceFilenameTokenMatches(parsed?.voiceToken, variant.voiceId)) return false;
  return true;
};

export const resolveTextStructuredExternalAudioVariant = ({ filename, parsed = null, index }) => {
  const identity = parsed || parseTextStructuredGeneratedFilename(filename);
  if (!identity || !index) return { status: 'unrecognized', parsed: identity, variant: null, aliasMatched: false };

  const exact = index.variantsByCurrentId.get(upper(identity.audioVariantId));
  if (exact) {
    const segmentMatch = segmentMatchesParsedIdentity({ variant: exact, parsed: identity, index });
    if (!segmentMatch.matched || !variantMatchesParsedDetails({ variant: exact, parsed: identity })) {
      return { status: 'identity-mismatch', parsed: identity, variant: null, aliasMatched: false };
    }
    return { status: 'matched', parsed: identity, variant: exact, aliasMatched: segmentMatch.aliasMatched };
  }

  const aliases = index.variantsBySourceId.get(upper(identity.audioVariantId)) || [];
  const candidates = aliases
    .map(variant => ({ variant, segmentMatch: segmentMatchesParsedIdentity({ variant, parsed: identity, index }) }))
    .filter(item => item.segmentMatch.matched && variantMatchesParsedDetails({ variant: item.variant, parsed: identity }));
  if (candidates.length === 1) {
    return { status: 'matched', parsed: identity, variant: candidates[0].variant, aliasMatched: true };
  }
  if (candidates.length > 1) return { status: 'alias-collision', parsed: identity, variant: null, aliasMatched: true };
  return { status: 'missing-metadata', parsed: identity, variant: null, aliasMatched: false };
};
