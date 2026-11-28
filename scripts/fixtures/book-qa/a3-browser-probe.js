import { resolveTextLibraryDocumentTree } from '../../../src/domain/text/textLibraryDomain.js';
import { getBookBodyGenerationRequests } from '../../../src/domain/text/bookQaBodyAudioDomain.js';
import { planBookAtomicGeneration } from '../../../src/domain/text/bookQaHeadingAudioDomain.js';
import { openPortableAudioZip } from '../../../src/services/audio/textStructuredAudioZipArchiveService.js';

const preferences = { edgeTextVoiceId: 'en-GB-SoniaNeural', edgeMeaningVoiceId: 'id-ID-GadisNeural', edgeRate: 0, edgePitch: 0 };
const body = (tree, card, channel, extra = {}, settings = preferences) => getBookBodyGenerationRequests(tree, card, channel, {
  ...extra, options: { preferences: settings, globalRate: 1, audioSourceMode: 'local-first' }
})[0];

const entries = (connection, workspaceId) => {
  const tree = resolveTextLibraryDocumentTree(connection.session.getSnapshot(), workspaceId);
  const card = tree.blocks.find(item => item.blockType === 'paragraph' && item.segments.length);
  const scene = tree.blocks.find(item => item.blockType === 'conversation' && item.segments.length);
  return [
    body(tree, card, 'text'), body(tree, card, 'meaning'),
    body(tree, card, 'text', {}, { ...preferences, edgeRate: 18, edgePitch: 10 }),
    body(tree, card, 'text', { full: true }),
    planBookAtomicGeneration(tree, null, 'mainTitle', 'text', preferences),
    planBookAtomicGeneration(tree, card, 'heading', 'meaning', preferences),
    body(tree, scene, 'text'), body(tree, scene, 'text', { full: true })
  ];
};

export async function seedA3Audio(connection, workspaceId) {
  const blobs = await Promise.all([440, 660].map(tone => fetch('/__book_audio_' + tone + '.mp3').then(response => response.blob())));
  const requests = entries(connection, workspaceId);
  const generated = entry => entry.kind === 'heading' || entry.descriptor.engine === 'derived';
  await connection.audio.submit(requests.filter(entry => !generated(entry)).map((entry, index) => ({ ...entry, blob: blobs[index % 2] })));
  await connection.audio.generate(requests.filter(generated));
  return requests;
}

export async function readA3Audio(connection, workspaceId, requests = null) {
  return Promise.all((requests || entries(connection, workspaceId)).map(async request => {
    const read = await connection.audio.readRuntime(request);
    const bytes = read.url ? await fetch(read.url).then(response => response.arrayBuffer()) : null;
    const digest = bytes ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).toHex() : null;
    return { fingerprint: request.fingerprint, status: read.status, digest, trustedComposition: read.trustedComposition === true };
  }));
}

export async function inspectA3Zip(blob) {
  const archive = await openPortableAudioZip(blob);
  const paths = archive.entries.map(entry => entry.filename);
  const manifestFile = archive.entries.find(entry => entry.filename.endsWith('manifest.json'));
  const manifest = JSON.parse(await (await archive.read(manifestFile)).text());
  const digests = {};
  for (const { fingerprint, path, digest } of manifest.assets) {
    const asset = await archive.read(archive.entries.find(entry => entry.filename === path));
    const measured = new Uint8Array(await crypto.subtle.digest('SHA-256', await asset.arrayBuffer())).toHex();
    if (digest !== measured) throw Error('Portable byte digest did not match the manifest');
    digests[fingerprint] = digest;
  }
  return { version: manifest.packageVersion, paths, digests, references: manifest.references.length };
}
