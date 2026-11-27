import { isBookBodyAudioCard, readBookAudioBinding } from '../../domain/text/bookQaAudioDomain.js';
import { getBookFullPlaybackRequests, getBookSplitPlaybackRequests } from '../../domain/text/bookQaBodyAudioDomain.js';
import { buildTextStructuredFullRepresentation } from '../../domain/text/textStructuredSplitFullDomain.js';

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

export const prepareBookFullPlayback = async ({ audio, snapshot, document, block, channel, options, fallback, stillCurrent }) => {
  if (!isBookBodyAudioCard(block)) return fallback;
  const ready = await findBookBodyRuntime(audio, snapshot, getBookFullPlaybackRequests(document, block, channel, options));
  if (!stillCurrent()) return { steps: [] };
  if (ready) {
    const { request, runtime } = ready;
    return { steps: [{
      type: 'full-local', channel, blockId: block.id, segmentId: null,
      content: buildTextStructuredFullRepresentation({ block, channel }).content,
      runtimeFull: { runtime, profile: request.descriptor, artifact: { descriptor: request.descriptor } },
      fallbackSteps: request.descriptor.engine === 'derived' ? fallback.steps : null
    }] };
  }
  // Retain the established Paragraph Full fallback. Any verified Split input
  // selects the per-Sentence fallback path; all-TTS stays a whole-card read.
  if (block.blockType === 'paragraph' && options.audioSourceMode !== 'tts-only') {
    const steps = [];
    let anyRecorded = false;
    for (const segment of block.segments) {
      if (!segment[channel]?.trim()) continue;
      const split = await findBookBodyRuntime(audio, snapshot, getBookSplitPlaybackRequests(document, block, segment, channel, options));
      if (!stillCurrent()) return { steps: [] };
      anyRecorded ||= Boolean(split);
      steps.push({ type: split ? 'split-local' : 'split-tts', segmentId: segment.id, content: segment[channel], channel,
        ignoreSegmentVoiceOverride: true, bookRuntime: split });
    }
    if (anyRecorded) return { steps };
  }
  return fallback;
};
