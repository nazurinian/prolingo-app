import assert from 'node:assert/strict';
import {
  TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY,
  buildTextStructuredAudioPlaybackOrderMetadata,
  getTextStructuredAudioPlaybackOrder,
  resolveTextStructuredEffectivePlaybackOrder,
  resolveTextStructuredEffectiveTtsOnly,
  doesTextStructuredVariantMatchPlaybackProfile
} from '../src/domain/text/textStructuredAudioPlaybackOrderDomain.js';
import { resolveTextStructuredRuntimeAudio } from '../src/domain/text/textStructuredAudioRuntimeDomain.js';
import { buildTextStructuredAudioDownloadProfileMetadata } from '../src/domain/text/textStructuredAudioDownloadProfileDomain.js';

let pass = 0;
const check = (name, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, '0')} — ${name}`);
};

const baseMeta = { keepMe: { safe: true } };
const orderedMeta = buildTextStructuredAudioPlaybackOrderMetadata({
  metadata: baseMeta,
  channel: 'text',
  profiles: [
    { engine: 'edge', voiceId: 'en-GB-LibbyNeural' },
    { engine: 'edge', voiceId: 'en-GB-MaisieNeural' }
  ]
});
const documentTree = { id: 'DOCUMENT_000001', metadata: orderedMeta };
const block = { id: 'BLOCK_000001', documentId: documentTree.id, metadata: {} };
const segmentId = 'SEGMENT_000001';
const content = 'This sentence has two local voices.';
const makeVariant = ({ id, voiceId, updatedAt, rate = 0, pitch = 0 }) => ({
  id,
  segmentId,
  channel: 'text',
  source: 'generated',
  engine: 'edge',
  voiceId,
  createdAt: updatedAt,
  updatedAt,
  metadata: {
    audioRenderDescriptorV1: { engine: 'edge', voiceId, rate, pitch },
    contentFingerprint: null
  }
});
const libby = makeVariant({ id: 'AUDIOVARIANT_000001', voiceId: 'en-GB-LibbyNeural', updatedAt: 100 });
const maisie = makeVariant({ id: 'AUDIOVARIANT_000002', voiceId: 'en-GB-MaisieNeural', updatedAt: 200 });
const runtimeBoth = {
  [libby.id]: { stagingBacked: true, stagingId: 'STAGE_LIBBY' },
  [maisie.id]: { stagingBacked: true, stagingId: 'STAGE_MAISIE' }
};

check('metadata is additive and keeps unrelated keys', () => {
  assert.equal(orderedMeta.keepMe.safe, true);
  assert.ok(orderedMeta[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY]);
});

check('Workspace order normalizes and deduplicates profiles', () => {
  const profile = getTextStructuredAudioPlaybackOrder(documentTree);
  assert.deepEqual(profile.channels.text.map(item => item.voiceId), ['en-GB-LibbyNeural', 'en-GB-MaisieNeural']);
});

check('Document order resolves when Card has no override', () => {
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree, block, channel: 'text' });
  assert.equal(order.source, 'document-order-legacy');
  assert.equal(order.explicit, true);
  assert.equal(order.profiles[0].voiceId, 'en-GB-LibbyNeural');
});

check('Card Advanced order overrides Workspace order', () => {
  const cardMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: {}, channel: 'text', profiles: ['en-GB-MaisieNeural', 'en-GB-LibbyNeural'] });
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree, block: { ...block, metadata: cardMeta }, channel: 'text' });
  assert.equal(order.source, 'card-order');
  assert.deepEqual(order.profiles.map(item => item.voiceId), ['en-GB-MaisieNeural', 'en-GB-LibbyNeural']);
});

check('first READY ordered voice wins even when second voice is newer', () => {
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree, block, channel: 'text' });
  const resolved = resolveTextStructuredRuntimeAudio({
    audioVariants: [libby, maisie], runtimeAudioUrls: runtimeBoth, segmentId, channel: 'text', content,
    preferredGeneratedProfiles: order.profiles, strictProfileOrder: true
  });
  assert.equal(resolved.variant.id, libby.id);
  assert.equal(resolved.playbackProfileRank, 1);
});

check('missing preferred voice promotes next READY ordered voice', () => {
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree, block, channel: 'text' });
  const resolved = resolveTextStructuredRuntimeAudio({
    audioVariants: [libby, maisie], runtimeAudioUrls: { [maisie.id]: runtimeBoth[maisie.id] }, segmentId, channel: 'text', content,
    preferredGeneratedProfiles: order.profiles, strictProfileOrder: true
  });
  assert.equal(resolved.variant.id, maisie.id);
  assert.equal(resolved.playbackProfileRank, 2);
});

check('explicit order fails closed when no listed voice is READY', () => {
  const ryanMeta = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: {}, channel: 'text', profiles: ['en-GB-RyanNeural'] });
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: { ...documentTree, metadata: ryanMeta }, block, channel: 'text' });
  const resolved = resolveTextStructuredRuntimeAudio({
    audioVariants: [libby, maisie], runtimeAudioUrls: runtimeBoth, segmentId, channel: 'text', content,
    preferredGeneratedProfiles: order.profiles, strictProfileOrder: true, allowAnyGenerated: true
  });
  assert.equal(resolved, null);
});

check('compatibility fallback can still use another READY legacy voice', () => {
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: { ...documentTree, metadata: {} }, block, channel: 'text', fallbackProfiles: ['en-GB-LibbyNeural'] });
  assert.equal(order.explicit, false);
  const resolved = resolveTextStructuredRuntimeAudio({
    audioVariants: [libby, maisie], runtimeAudioUrls: { [maisie.id]: runtimeBoth[maisie.id] }, segmentId, channel: 'text', content,
    preferredGeneratedVoiceId: 'en-GB-LibbyNeural', preferredGeneratedEngine: 'edge',
    preferredGeneratedProfiles: order.profiles, strictProfileOrder: false, allowAnyGenerated: true
  });
  assert.equal(resolved.variant.id, maisie.id);
});

check('profile rate/pitch may pin an exact render profile', () => {
  const pinned = { engine: 'edge', voiceId: 'en-GB-LibbyNeural', rate: 10, pitch: 0 };
  assert.equal(doesTextStructuredVariantMatchPlaybackProfile({ variant: libby, profile: pinned }), false);
  assert.equal(doesTextStructuredVariantMatchPlaybackProfile({ variant: libby, profile: { ...pinned, rate: 0 } }), true);
});

check('Legacy document TTS Only remains readable only through explicit compatibility mode', () => {
  const metadata = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: orderedMeta, ttsOnly: true });
  const settings = getTextStructuredAudioPlaybackOrder({ metadata });
  assert.equal(settings.ttsOnly, true);
  assert.equal(settings.channels.text.length, 2);
  assert.deepEqual(resolveTextStructuredEffectiveTtsOnly({ documentTree: { ...documentTree, metadata }, block, allowLegacyMetadata: true }).enabled, true);
});

check('global TTS Only always wins', () => {
  const state = resolveTextStructuredEffectiveTtsOnly({ documentTree, block, globalTtsOnly: true });
  assert.deepEqual(state, { enabled: true, source: 'global' });
});

check('generation/download profile remains separate from playback order metadata', () => {
  const downloadMeta = buildTextStructuredAudioDownloadProfileMetadata({ metadata: orderedMeta, channel: 'text', voiceId: 'en-GB-RyanNeural' });
  const order = getTextStructuredAudioPlaybackOrder({ metadata: downloadMeta });
  assert.deepEqual(order.channels.text.map(item => item.voiceId), ['en-GB-LibbyNeural', 'en-GB-MaisieNeural']);
  assert.equal(downloadMeta.audioDownloadProfileV1.channels.text, 'en-GB-RyanNeural');
});

check('clearing explicit order returns compatibility fallback without deleting unrelated metadata', () => {
  const cleared = buildTextStructuredAudioPlaybackOrderMetadata({ metadata: orderedMeta, channel: 'text', profiles: [] });
  assert.equal(cleared.keepMe.safe, true);
  assert.equal(cleared[TEXT_STRUCTURED_AUDIO_PLAYBACK_ORDER_KEY], undefined);
  const order = resolveTextStructuredEffectivePlaybackOrder({ documentTree: { ...documentTree, metadata: cleared }, block, channel: 'text', fallbackProfiles: ['en-GB-LibbyNeural'] });
  assert.equal(order.explicit, false);
  assert.equal(order.profiles[0].voiceId, 'en-GB-LibbyNeural');
});

console.log(`\nP1 AUDIT COMPLETE — ${pass} PASS`);
