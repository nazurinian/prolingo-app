import { isBookBodyAudioCard, readBookAudioBinding, resolveBookAudioTarget } from '../../domain/text/bookQaAudioDomain.js';
import { getBookFullPlaybackRequests, getBookSplitPlaybackRequests } from '../../domain/text/bookQaBodyAudioDomain.js';
import { buildTextStructuredFullRepresentation } from '../../domain/text/textStructuredSplitFullDomain.js';

export const readBoundBookAudioBytes = async (snapshot, entry, binding, read) => {
  if (binding.trustedComposition) {
    for (const input of resolveBookAudioTarget(snapshot, entry).dependencies) {
      const source = await read(input.fingerprint, input.binary);
      if (source.status !== 'ready') return { status: 'unavailable-composition-input' };
    }
  }
  return read(entry.fingerprint, binding.binary);
};

export const readBookBodyAvailability = async (audio, snapshot, entry, options) => {
  const binding = readBookAudioBinding(snapshot, entry);
  if (binding.status !== 'bound') return binding;
  if (entry.descriptor.engine === 'derived' && !binding.trustedComposition) return { status: 'legacy-unverified' };
  return audio.readRuntime(entry, options);
};

export const findBookBodyRuntime = async (audio, snapshot, requests) => {
  for (const request of requests) {
    try {
      const runtime = await readBookBodyAvailability(audio, snapshot, request);
      if (runtime.status === 'ready') return { request, runtime: { ...runtime, renderFingerprint: request.fingerprint } };
    } catch {
      // Reads cannot authorize playback while the connection is refreshing or reconciling.
      return null;
    }
  }
  return null;
};

export const canStartVerifiedBookAudio = (snapshot, request, runtime) => {
  if (!snapshot || !request || !runtime?.binary) return false;
  const binding = readBookAudioBinding(snapshot, request);
  return binding.status === 'bound'
    && ['digest', 'format', 'bytes', 'sampleRate'].every(field => binding.binary[field] === runtime.binary[field])
    && (request.descriptor.engine !== 'derived' || binding.trustedComposition);
};

export const prepareBookFullPlayback = async ({ audio, snapshot, document, block, channel, options, fallback, stillCurrent }) => {
  if (!isBookBodyAudioCard(block) || options.audioSourceMode === 'tts-only') return fallback;
  // Retain the established Paragraph Full fallback. Any verified Split input
  // selects the per-Sentence fallback path; all-TTS stays a whole-card read.
  const resolveFallback = async () => {
    if (block.blockType !== 'paragraph' || options.audioSourceMode === 'tts-only') return fallback.steps;
    const steps = [];
    let anyRecorded = false;
    for (const segment of block.segments) {
      if (!segment[channel]?.trim()) continue;
      // The first verified recording settles the Full-versus-Split decision.
      // Later Sentences still verify through the session lookahead or on demand.
      const checked = !anyRecorded;
      const split = checked
        ? await findBookBodyRuntime(audio, snapshot, getBookSplitPlaybackRequests(document, block, segment, channel, options))
        : null;
      if (!stillCurrent()) return [];
      anyRecorded ||= Boolean(split);
      steps.push({ type: split ? 'split-local' : 'split-tts', segmentId: segment.id, content: segment[channel], channel,
        ignoreSegmentVoiceOverride: true, ...(checked ? { bookRuntime: split, bookReadStamp: snapshot } : {}) });
    }
    return anyRecorded ? steps : fallback.steps;
  };
  const ready = await findBookBodyRuntime(audio, snapshot, getBookFullPlaybackRequests(document, block, channel, options));
  if (!stillCurrent()) return { steps: [] };
  if (!ready) return { ...fallback, steps: await resolveFallback() };
  const { request, runtime } = ready;
  return { steps: [{
    type: 'full-local', channel, blockId: block.id, segmentId: null,
    content: buildTextStructuredFullRepresentation({ block, channel }).content,
    runtimeFull: { request, runtime, profile: request.descriptor, artifact: { descriptor: request.descriptor } },
    resolveFallback
  }] };
};
