const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

const SOURCE_RANK = Object.freeze({
  staging: 0,
  folder: 1,
  zip: 2,
  generated: 3,
  legacy: 4
});

export const normalizeTableAudioVoiceId = value => clean(value);

const variantIdentity = variant => [
  clean(variant?.sourceType),
  clean(variant?.sourceId),
  clean(variant?.mapKey),
  lower(variant?.voiceId),
  clean(variant?.filename),
  clean(variant?.entryId)
].join('|');

// C3.4.4: several ZIP archives may contain the same logical Table audio.
// Keep only one effective ZIP copy per stable slot + voice; the first loaded
// archive wins deterministically. Unknown-voice legacy ZIP entries are kept
// separate by filename because we cannot safely prove that they are the same voice.
const effectiveMergeIdentity = variant => {
  if (variant?.sourceType !== 'zip') return variantIdentity(variant);
  const mapKey = clean(variant?.mapKey);
  const voiceId = lower(variant?.voiceId);
  if (mapKey && voiceId) return `zip-effective|${mapKey}|${voiceId}`;
  return `zip-unknown|${mapKey}|${lower(variant?.filename)}|${clean(variant?.entryId)}`;
};

export const mergeTableAudioVariantInventories = (...inventories) => {
  const merged = {};
  inventories.forEach(inventory => {
    Object.entries(inventory || {}).forEach(([mapKey, variants]) => {
      const list = Array.isArray(variants) ? variants : [];
      if (!list.length) return;
      if (!merged[mapKey]) merged[mapKey] = [];
      const seen = new Set(merged[mapKey].map(effectiveMergeIdentity));
      list.forEach(variant => {
        const next = { ...variant, mapKey: variant?.mapKey || mapKey };
        const id = effectiveMergeIdentity(next);
        if (seen.has(id)) return;
        seen.add(id);
        merged[mapKey].push(next);
      });
    });
  });
  return merged;
};

export const tableAudioVariantsFromRecords = records => {
  const inventory = {};
  (Array.isArray(records) ? records : []).forEach(record => {
    const mapKey = clean(record?.mapKey);
    if (!mapKey) return;
    if (!inventory[mapKey]) inventory[mapKey] = [];
    inventory[mapKey].push(record);
  });
  return inventory;
};

export const buildTableAudioGeneratedVariantInventory = ({ localAudioMapTable, generatedAudioMeta }) => {
  const inventory = {};
  Object.entries(generatedAudioMeta || {}).forEach(([metaKey, meta]) => {
    if (!metaKey.startsWith('table:')) return;
    if (meta?.verified && meta?.deliveryStatus === 'folder-verified') return;
    const mapKey = metaKey.slice('table:'.length);
    const url = localAudioMapTable?.[mapKey];
    if (!url) return;
    inventory[mapKey] = [{
      sourceType: 'generated',
      sourceId: 'session-generated',
      mapKey,
      part: meta?.part || null,
      voiceId: meta?.voice || null,
      voiceLabel: meta?.voiceLabel || null,
      engine: meta?.engine || null,
      filename: meta?.filename || null,
      verified: false,
      url,
      deliveryStatus: meta?.deliveryStatus || 'session-generated',
      vocabId: meta?.vocabId || null,
      bookId: meta?.bookId || null,
      displayId: meta?.displayId ?? null
    }];
  });
  return inventory;
};

export const buildTableAudioVoiceOptions = ({ inventory, edgeVoices = [] }) => {
  const edgeById = new Map((Array.isArray(edgeVoices) ? edgeVoices : []).map(voice => [lower(voice?.id), voice]));
  const stats = new Map();
  Object.entries(inventory || {}).forEach(([mapKey, variants]) => {
    (Array.isArray(variants) ? variants : []).forEach(variant => {
      const voiceId = clean(variant?.voiceId);
      if (!voiceId) return;
      const key = lower(voiceId);
      const edge = edgeById.get(key);
      const current = stats.get(key) || {
        id: voiceId,
        label: clean(variant?.voiceLabel) || clean(edge?.label) || clean(edge?.name) || voiceId,
        slotKeys: new Set(),
        sourceCopies: 0,
        sourceTypes: new Set()
      };
      current.slotKeys.add(clean(variant?.mapKey) || clean(mapKey));
      current.sourceCopies += 1;
      if (variant?.sourceType) current.sourceTypes.add(variant.sourceType);
      stats.set(key, current);
    });
  });
  return [...stats.values()].map(value => ({
    id: value.id,
    label: value.label,
    // `count` intentionally means unique playable Table slots for this voice,
    // not raw source copies. The same Sonia file in two ZIPs must count once.
    count: value.slotKeys.size,
    sourceCopies: value.sourceCopies,
    sourceTypes: [...value.sourceTypes]
  }));
};

export const reconcileTableAudioVoicePriority = ({ currentPriority = [], voiceOptions = [] }) => {
  const availableByLower = new Map((voiceOptions || []).map(option => [lower(option?.id), clean(option?.id)]));
  const next = [];
  const seen = new Set();
  (Array.isArray(currentPriority) ? currentPriority : []).forEach(id => {
    const resolved = availableByLower.get(lower(id));
    if (!resolved || seen.has(lower(resolved))) return;
    seen.add(lower(resolved));
    next.push(resolved);
  });
  (voiceOptions || []).forEach(option => {
    const id = clean(option?.id);
    if (!id || seen.has(lower(id))) return;
    seen.add(lower(id));
    next.push(id);
  });
  return next;
};

const sourceRank = variant => SOURCE_RANK[variant?.sourceType] ?? 99;
const chooseBestSource = variants => [...variants].sort((a, b) => sourceRank(a) - sourceRank(b))[0] || null;

export const resolveTableAudioPlaybackVariant = ({ variants, voiceMode = 'auto', voicePriority = [] }) => {
  const list = (Array.isArray(variants) ? variants : []).filter(Boolean);
  if (!list.length) return null;

  if (voiceMode && voiceMode !== 'auto') {
    const matches = list.filter(variant => lower(variant?.voiceId) === lower(voiceMode));
    return chooseBestSource(matches);
  }

  const priority = (Array.isArray(voicePriority) ? voicePriority : []).map(lower).filter(Boolean);
  for (const wanted of priority) {
    const matches = list.filter(variant => lower(variant?.voiceId) === wanted);
    if (matches.length) return chooseBestSource(matches);
  }

  // Legacy / unknown-voice local audio remains usable in Auto mode.
  const unknown = list.filter(variant => !clean(variant?.voiceId));
  if (unknown.length) return chooseBestSource(unknown);

  return chooseBestSource(list);
};

export const buildTableAudioPresenceMap = ({ inventory, legacyMap = {} }) => {
  const map = {};
  Object.keys(legacyMap || {}).forEach(key => { if (legacyMap[key]) map[key] = legacyMap[key]; });
  Object.entries(inventory || {}).forEach(([mapKey, variants]) => {
    if ((Array.isArray(variants) ? variants : []).length) map[mapKey] = map[mapKey] || `inventory://${mapKey}`;
  });
  return map;
};

export const summarizeTableAudioVariantInventory = inventory => {
  const mapKeys = Object.keys(inventory || {});
  const effectiveAudio = new Set();
  let sourceCopies = 0;
  let folderVariants = 0;
  let zipVariants = 0;
  let generatedVariants = 0;
  let stagingVariants = 0;
  mapKeys.forEach(mapKey => {
    (inventory?.[mapKey] || []).forEach(variant => {
      sourceCopies += 1;
      // Logical audio count: one slot + one known voice = one playable audio
      // even if that same variant is available from Folder and one/many ZIPs.
      const voiceKey = lower(variant?.voiceId) || `unknown:${lower(variant?.filename)}`;
      effectiveAudio.add(`${mapKey}|${voiceKey}`);
      if (variant?.sourceType === 'staging') stagingVariants += 1;
      else if (variant?.sourceType === 'folder') folderVariants += 1;
      else if (variant?.sourceType === 'zip') zipVariants += 1;
      else if (variant?.sourceType === 'generated') generatedVariants += 1;
    });
  });
  return { slots: mapKeys.length, variants: effectiveAudio.size, sourceCopies, stagingVariants, folderVariants, zipVariants, generatedVariants };
};
