import { PROLINGO_TEXT_AUDIO_MANIFEST_TYPE } from './textAudioManifestDomain.js';
import {
  isSafePortableZipPath, parseCanonicalTextFullArtifactFilename, parseCanonicalTextRenderAudioFilename,
  portableZipPathKey, textVoiceFilenameTokenMatches
} from './textFilenameDomain.js';
import { buildCanonicalSha256Fingerprint } from './textCanonicalFingerprintDomain.js';
import { TEXT_AUDIO_CODEC_PROFILE, TEXT_AUDIO_RENDERER_PROFILE_VERSION } from './textStructuredAudioRenderFingerprintDomain.js';
import { TEXT_STRUCTURED_FULL_ARTIFACT_DERIVATION_VERSION } from './textStructuredSplitFullDomain.js';

export const BOOK_PORTABLE_AUDIO_VERSION = 3;
export const BOOK_PORTABLE_MAX_ASSETS = 2046;
export const BOOK_PORTABLE_MAX_REFERENCES = 8192;
export const BOOK_PORTABLE_KINDS = Object.freeze({
  'main-title': 'heading', 'paragraph-heading': 'heading', 'scene-heading': 'heading',
  split: 'split', 'full-paragraph': 'full', 'full-conversation': 'full'
});
const SHA = /^[0-9a-f]{64}$/u;
const RF = /^rf-sha256-[0-9a-f]{64}$/u;
const CHANNELS = ['text', 'meaning'];
const fields = (record, keys) => record && Object.getPrototypeOf(record) === Object.prototype
  && Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key));
const token = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
const fail = message => { throw Object.assign(new Error(message), { code: 'INVALID_PORTABLE_MANIFEST' }); };
const core = ['schemaVersion', 'contentFingerprint', 'channel', 'engine', 'voiceId', 'codecProfile'];
const rendered = ['language', 'rate', 'pitch', 'rendererVersion'];

export const portablePhysicalType = (fingerprint, descriptor) => {
  if (!descriptor || !CHANNELS.includes(descriptor.channel) || !/^sha256-[0-9a-f]{64}$/u.test(descriptor.contentFingerprint)
    || !token(descriptor.voiceId)) return null;
  const full = descriptor.representation === 'full';
  if (descriptor.engine === 'derived') {
    if (!full || !fields(descriptor, [...core, 'representation', 'composition', 'sampleRate', 'derivationVersion'])
      || descriptor.schemaVersion !== 2 || descriptor.voiceId !== 'multi-speaker' || descriptor.sampleRate !== 48000
      || descriptor.codecProfile !== 'wav-pcm16-derived-v1' || descriptor.derivationVersion !== 'prolingo-conversation-full-v1'
      || !Array.isArray(descriptor.composition) || !descriptor.composition.length || descriptor.composition.length > BOOK_PORTABLE_MAX_REFERENCES
      || !descriptor.composition.every(row => fields(row, ['renderFingerprint', 'playbackRate']) && RF.test(row.renderFingerprint)
        && row.playbackRate === 1)) return null;
  } else if (descriptor.engine !== 'edge' || descriptor.schemaVersion !== 1
    || !fields(descriptor, [...core, ...rendered, ...(full ? ['representation', 'derivationVersion'] : [])])
    || descriptor.rendererVersion !== TEXT_AUDIO_RENDERER_PROFILE_VERSION || descriptor.codecProfile !== TEXT_AUDIO_CODEC_PROFILE
    || !token(descriptor.language) || !Number.isFinite(descriptor.rate) || !Number.isFinite(descriptor.pitch)
    || (full && descriptor.derivationVersion !== TEXT_STRUCTURED_FULL_ARTIFACT_DERIVATION_VERSION)) return null;
  if (fingerprint !== buildCanonicalSha256Fingerprint(descriptor, full ? 'full-sha256' : 'rf-sha256')) return null;
  return descriptor.engine === 'derived' ? 'full-conversation' : full ? 'full-paragraph' : 'rf';
};

export const portableMime = codec => codec === 'wav' ? 'audio/wav' : 'audio/mpeg';
export const portableFilenameMatches = (path, fingerprint, descriptor, codec) => {
  const parsed = fingerprint.startsWith('rf-') ? parseCanonicalTextRenderAudioFilename(path) : parseCanonicalTextFullArtifactFilename(path);
  if (!parsed || (parsed.renderFingerprint ?? parsed.fullArtifactFingerprint) !== fingerprint || parsed.extension !== codec) return false;
  // The historical parser's engine group can consume both debug tokens.
  const [, engine, voice, extra] = parsed.filename.slice(0, -codec.length - 1).split('__');
  return extra === undefined && (!engine || engine.toLowerCase() === descriptor.engine)
    && (!voice || textVoiceFilenameTokenMatches(voice, descriptor.voiceId));
};

export const portableReferenceKey = ref => JSON.stringify([ref.workspaceUid, ref.ownerUid, ref.representation, ref.channel, ref.fingerprint]);

export const validateBookPortableAudioManifest = input => {
  if (!fields(input, ['packageType', 'packageVersion', 'assets', 'references']) || input.packageType !== PROLINGO_TEXT_AUDIO_MANIFEST_TYPE
    || input.packageVersion !== BOOK_PORTABLE_AUDIO_VERSION || !Array.isArray(input.assets) || !input.assets.length
    || input.assets.length > BOOK_PORTABLE_MAX_ASSETS || !Array.isArray(input.references) || !input.references.length
    || input.references.length > BOOK_PORTABLE_MAX_REFERENCES) fail('Invalid portable manifest v3 root or limits');
  const byFingerprint = new Map(), paths = new Set();
  for (const asset of input.assets) {
    if (!fields(asset, ['fingerprint', 'descriptor', 'digest', 'codec', 'mimeType', 'size', 'sampleRate', 'path'])
      || typeof asset.fingerprint !== 'string' || typeof asset.digest !== 'string' || !SHA.test(asset.digest)
      || !isSafePortableZipPath(asset.path) || asset.path.endsWith('/')
      || !Number.isSafeInteger(asset.size) || asset.size < 4 || asset.size > 64 * 1024 ** 2
      || !Number.isSafeInteger(asset.sampleRate) || asset.sampleRate < 8000 || asset.sampleRate > 96000) fail('Invalid portable physical asset');
    const kind = portablePhysicalType(asset.fingerprint, asset.descriptor);
    const path = portableZipPathKey(asset.path);
    if (!kind || asset.codec !== (kind === 'full-conversation' ? 'wav' : 'mp3') || asset.mimeType !== portableMime(asset.codec)
      || (kind === 'full-conversation' && asset.sampleRate !== asset.descriptor.sampleRate)
      || !portableFilenameMatches(asset.path, asset.fingerprint, asset.descriptor, asset.codec)
      || paths.has(path) || byFingerprint.has(asset.fingerprint)) fail('Inconsistent or duplicate portable physical asset');
    byFingerprint.set(asset.fingerprint, { kind, asset });
    paths.add(path);
  }
  const keys = new Set(), referenced = new Set();
  for (const ref of input.references) {
    if (!fields(ref, ['fingerprint', 'representation', 'workspaceUid', 'ownerUid', 'channel', 'order'])
      || !Object.hasOwn(BOOK_PORTABLE_KINDS, ref.representation)
      || !token(ref.workspaceUid) || !token(ref.ownerUid) || !Array.isArray(ref.order) || ref.order.length !== 4
      || ref.order.some(value => !Number.isSafeInteger(value) || value < 0)
      || (ref.representation === 'main-title' && ref.workspaceUid !== ref.ownerUid)) fail('Invalid portable logical reference');
    const physical = byFingerprint.get(ref.fingerprint);
    const expected = BOOK_PORTABLE_KINDS[ref.representation] === 'full' ? ref.representation : 'rf';
    const key = portableReferenceKey(ref);
    if (physical?.kind !== expected || physical.asset.descriptor.channel !== ref.channel || keys.has(key)) fail('Portable reference is duplicated or disagrees with its asset');
    keys.add(key);
    referenced.add(ref.fingerprint);
  }
  if (referenced.size !== byFingerprint.size) fail('Portable manifest contains unreferenced assets');
  return input;
};

export const buildBookPortableAudioManifest = (assets, references) => validateBookPortableAudioManifest({
  packageType: PROLINGO_TEXT_AUDIO_MANIFEST_TYPE, packageVersion: BOOK_PORTABLE_AUDIO_VERSION, assets, references
});
