import { scanTextStructuredAudioZipFiles, readTextStructuredAudioZipRuntimeBlob } from './textStructuredAudioZipArchiveService.js';
import { getTextStructuredFullAudioArtifacts } from '../../domain/text/textStructuredSplitFullDomain.js';
import { buildTextStructuredAudioRequirementsForSnapshot } from '../../domain/text/textStructuredAudioRequirementDomain.js';
/** User-selected ZIP only. Reuse native RF matching; bind existing logical records.
 * No metadata commit, Staging access, physical deletion or independent cache. */
export const bindQaPortableAudio = async ({ snapshot, files, preferences = {} }) => {
  const full = snapshot.blocks.flatMap(block => getTextStructuredFullAudioArtifacts(block).map(artifact => ({
    blockId: block.id, documentId: block.documentId, fullArtifactFingerprint: artifact.fullArtifactFingerprint, descriptor: artifact.descriptor
  })));
  const scan = await scanTextStructuredAudioZipFiles({ files, audioVariants: snapshot.audioVariants, segments: snapshot.segments,
    blocks: snapshot.blocks, documents: snapshot.documents, requirements: buildTextStructuredAudioRequirementsForSnapshot({ snapshot, preferences }), fullArtifactRequirements: full });
  const runtimeAudioUrls = {}, runtimeFullAudio = {};
  for (const match of scan.matches) {
    if (!match.variant || !match.renderFingerprint || match.variant.metadata?.audioRenderFingerprintV1 !== match.renderFingerprint) continue;
    runtimeAudioUrls[match.variant.id] = { blob: await readTextStructuredAudioZipRuntimeBlob(match), renderFingerprint: match.renderFingerprint };
  }
  for (const match of scan.fullMatches) {
    if (!getTextStructuredFullAudioArtifacts(match.block).some(a => a.fullArtifactFingerprint === match.fullArtifactFingerprint)) continue;
    runtimeFullAudio[match.fullArtifactFingerprint] = { blob: await readTextStructuredAudioZipRuntimeBlob(match), fullArtifactFingerprint: match.fullArtifactFingerprint };
  }
  return { runtimeAudioUrls, runtimeFullAudio, matched: Object.keys(runtimeAudioUrls).length + Object.keys(runtimeFullAudio).length,
    unmatched: scan.orphanCount + scan.legacyCount };
};
