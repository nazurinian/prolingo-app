import { openPortableAudioZip } from '../../../src/services/audio/textStructuredAudioZipArchiveService.js';
import { validateBookAudioBytes } from '../../../src/services/audio/bookQaAudioBytes.js';
import { importBookPortableAudio } from '../../../src/services/audio/bookPortableAudioService.js';
import { applyBookQaAudioOperation } from '../../../src/domain/text/bookQaAudioDomain.js';

export const inspectHf2Archive = async blob => {
  const archive = await openPortableAudioZip(blob);
  const files = [];
  for (const entry of archive.entries) {
    const ext = entry.filename.split('.').at(-1);
    const bytes = await archive.read(entry);
    const proof = ['mp3', 'wav'].includes(ext) ? await validateBookAudioBytes(bytes, ext) : null;
    files.push({ path: entry.filename, size: bytes.size, ...(proof ? { digest: proof.digest, sampleRate: proof.sampleRate } : {}) });
  }
  return files;
};

export const importHf2ArchiveToCleanSnapshot = async (snapshot, workspaceId, blob) => {
  const options = { workspaceId, preferences: { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural' } };
  const report = await importBookPortableAudio({
    ...options, files: [new File([blob], 'HF2-roundtrip.zip')], snapshot,
    publish: async items => {
      const verified = await Promise.all(items.map(async ({ blob: asset, ...entry }) =>
        ({ ...entry, binary: await validateBookAudioBytes(asset, asset.type === 'audio/wav' ? 'wav' : 'mp3') })));
      const { snapshot: next } = applyBookQaAudioOperation(snapshot, verified, 42);
      snapshot = next;
      return { results: verified, available: [], stored: verified.map(entry => entry.fingerprint), reused: [], repaired: [], snapshot };
    }
  });
  const scopedSegments = new Set(snapshot.segments.filter(segment => segment.documentId === workspaceId).map(segment => segment.id));
  return { report, splitReferences: snapshot.audioVariants.filter(variant => scopedSegments.has(variant.segmentId)).length };
};
