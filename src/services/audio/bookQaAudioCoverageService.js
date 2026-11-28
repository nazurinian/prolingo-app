import { bookAudioError, readBookAudioBinding } from '../../domain/text/bookQaAudioDomain.js';
import { BOOK_BODY_CHANNELS } from '../../domain/text/bookQaBodyAudioDomain.js';
import { collectBookPortableReferences, listBookPortableRequirements, listBookPortableTargets } from '../../domain/text/bookPortableAudioDomain.js';
import { canonicalJsonStringify } from '../../domain/text/textCanonicalFingerprintDomain.js';
import { readBoundBookAudioBytes } from './bookQaBodyAudioService.js';
import { bookListeningProfileKey, findBookUnitCompositionInputs } from './bookNormalAudioService.js';

const slotKey = ({ representation, ownerUid, channel }) => canonicalJsonStringify([representation, ownerUid, channel]);
const splitSlot = (ownerUid, channel) => slotKey({ representation: 'split', ownerUid, channel });
const checkCancelled = signal => {
  if (signal?.aborted) throw bookAudioError('AUDIO_CANCELLED', 'Audio verification cancelled');
};

export const verifyBookAudioCoverage = async ({ snapshot, workspaceId = null, cardId = null, preferences, read, signal }) => {
  const targets = listBookPortableTargets(snapshot, workspaceId).filter(target => cardId === null || target.block?.id === cardId);
  if (cardId !== null && (!workspaceId || !targets.length)) throw bookAudioError('INVALID_PORTABLE_SCOPE', 'Choose a Book Card in the selected Workspace');
  const requirements = listBookPortableRequirements(targets, preferences);
  const rowsBySlot = new Map();
  for (const row of collectBookPortableReferences(snapshot, targets, preferences)) {
    const key = slotKey(row.ref);
    const rows = rowsBySlot.get(key) ?? [];
    rows.push(row);
    rowsBySlot.set(key, rows);
  }
  const reads = new Map();
  const verifyBytes = async (fingerprint, binary) => {
    checkCancelled(signal);
    const key = canonicalJsonStringify([fingerprint, binary]);
    if (reads.has(key)) return reads.get(key);
    const result = await read(fingerprint, binary);
    checkCancelled(signal);
    const status = result.status === 'ready' && canonicalJsonStringify(result.binary) !== canonicalJsonStringify(binary) ? 'conflict' : result.status;
    const verified = { status };
    reads.set(key, verified);
    return verified;
  };
  const verify = async (entry, binding) => {
    if (binding.status !== 'bound') return binding.status;
    if (entry.descriptor.engine === 'derived' && !binding.trustedComposition) return 'unverified-composition';
    return (await readBoundBookAudioBytes(snapshot, entry, binding, verifyBytes)).status;
  };

  const groups = new Map(), profiles = new Map();
  const addStatus = (representation, channel, status, otherReady = 0, otherDiagnostics = {}) => {
    const key = representation + '|' + channel;
    const group = groups.get(key) ?? { representation, channel, expected: 0, statuses: {}, otherReady: 0, otherDiagnostics: {} };
    group.expected++;
    group.statuses[status] = (group.statuses[status] ?? 0) + 1;
    group.otherReady += otherReady;
    for (const [diagnostic, count] of Object.entries(otherDiagnostics)) {
      group.otherDiagnostics[diagnostic] = (group.otherDiagnostics[diagnostic] ?? 0) + count;
    }
    groups.set(key, group);
  };
  const addProfile = (descriptor, ref, state) => {
    const key = bookListeningProfileKey(descriptor);
    if (!key) return;
    const profile = profiles.get(key) ?? { key, descriptor, channels: [], representations: [], current: 0, alternate: 0 };
    if (!profile.channels.includes(ref.channel)) profile.channels.push(ref.channel);
    if (!profile.representations.includes(ref.representation)) profile.representations.push(ref.representation);
    profile[state === 'current' ? 'current' : 'alternate']++;
    profiles.set(key, profile);
  };

  for (const { entry, ref, status: requirementStatus } of requirements) {
    checkCancelled(signal);
    const rows = rowsBySlot.get(slotKey(ref)) ?? [];
    let status = requirementStatus;
    if (entry) {
      const binding = readBookAudioBinding(snapshot, entry);
      // A derived requirement can depend on Split inputs even before any Full
      // artifact exists. Classify that empty Full slot separately from its inputs.
      status = binding.status === 'stale' && entry.descriptor.engine === 'derived' && !rows.length
        ? 'missing' : await verify(entry, binding);
      if (status === 'ready') addProfile(entry.descriptor, ref, 'current');
    }
    let otherReady = 0;
    const otherDiagnostics = {};
    for (const row of rows) {
      if (row.state !== 'other-profile') continue;
      const alternate = await verify(row.entry, readBookAudioBinding(snapshot, row.entry));
      if (alternate === 'ready') {
        otherReady++;
        addProfile(row.entry.descriptor, row.ref, row.state);
      } else otherDiagnostics[alternate] = (otherDiagnostics[alternate] ?? 0) + 1;
    }
    addStatus(ref.representation, ref.channel, status, otherReady, otherDiagnostics);
  }

  const currentSplit = (uid, channel) => rowsBySlot.get(splitSlot(uid, channel))?.find(row => row.state === 'current');
  for (const { doc, block, representation } of targets) {
    if (!representation.startsWith('full-')) continue;
    for (const unit of block.units) for (const channel of BOOK_BODY_CHANNELS) {
      const { status } = await findBookUnitCompositionInputs({
        doc, block, unit, channel, currentSplit, readExact: async (fingerprint, binary) => ({
          status: (await verifyBytes(fingerprint, binary)).status, result: {}
        }), signal
      });
      if (status !== 'no-content') addStatus(unit.kind === 'turn' ? 'turn-composition' : 'section-composition', channel, status);
    }
  }
  checkCancelled(signal);
  return { groups: [...groups.values()], profiles: [...profiles.values()].sort((left, right) => left.key.localeCompare(right.key)) };
};
