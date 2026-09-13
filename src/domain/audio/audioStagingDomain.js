const clean = value => String(value ?? '').trim();
const upper = value => clean(value).toUpperCase();
const lower = value => clean(value).toLowerCase();

export const resolveTableAudioBookId = itemOrVocabId => {
  const raw = typeof itemOrVocabId === 'string'
    ? itemOrVocabId
    : (itemOrVocabId?.vocabId || itemOrVocabId?.VOCAB_ID || '');
  const value = upper(raw);
  if (!value) return 'TABLE';
  const match = value.match(/^(.*)_\d+$/);
  return clean(match?.[1] || value) || 'TABLE';
};

export const resolveActiveTableAudioScope = playlist => {
  const vocabIds = new Set();
  const bookIds = new Set();
  (Array.isArray(playlist) ? playlist : []).forEach(item => {
    if (!item?.isStructured) return;
    const vocabId = upper(item?.vocabId || item?.VOCAB_ID || item?.id);
    if (vocabId) vocabIds.add(vocabId);
    const bookId = upper(resolveTableAudioBookId(item));
    if (bookId) bookIds.add(bookId);
  });
  return { vocabIds, bookIds, active: vocabIds.size > 0 || bookIds.size > 0 };
};

export const isTableAudioScopeMatch = (candidate, reference) => {
  if (!candidate || !reference) return false;
  const candidateVocab = upper(candidate?.vocabId || candidate?.VOCAB_ID);
  const referenceVocab = upper(reference?.vocabId || reference?.VOCAB_ID);
  if (candidateVocab && referenceVocab) return candidateVocab === referenceVocab;
  const candidateBook = upper(candidate?.bookId);
  const referenceBook = upper(reference?.bookId);
  if (candidateBook && referenceBook) return candidateBook === referenceBook;
  return false;
};

export const isTableAudioRecordInScope = (record, scope) => {
  if (!scope?.active) return true;
  const vocabId = upper(record?.vocabId || record?.VOCAB_ID);
  if (vocabId) return scope.vocabIds.has(vocabId);
  const bookId = upper(record?.bookId);
  if (bookId) return scope.bookIds.has(bookId);
  // Scoped R2 audio without dataset identity is ambiguous across decks because
  // Table mapKey intentionally remains NO-based. Fail closed instead of leaking
  // an old deck's binary into the newly active deck.
  return false;
};

export const filterTableAudioStagingRecordsForPlaylist = (records, playlist) => {
  const scope = resolveActiveTableAudioScope(playlist);
  return (Array.isArray(records) ? records : []).filter(record => isTableAudioRecordInScope(record, scope));
};

export const filterTableAudioVariantInventoryForPlaylist = (inventory, playlist) => {
  const scope = resolveActiveTableAudioScope(playlist);
  if (!scope.active) return inventory || {};
  const filtered = {};
  Object.entries(inventory || {}).forEach(([mapKey, variants]) => {
    const scoped = (Array.isArray(variants) ? variants : []).filter(variant => {
      const vocabId = upper(variant?.vocabId || variant?.VOCAB_ID);
      if (vocabId) return scope.vocabIds.has(vocabId);
      const bookId = upper(variant?.bookId);
      if (bookId) return scope.bookIds.has(bookId);
      // Runtime/legacy sources that cannot prove their dataset scope are not
      // allowed to surface across a deck switch. They remain stored and can be
      // re-indexed/reconnected for the active deck.
      return false;
    });
    if (scoped.length) filtered[mapKey] = scoped;
  });
  return filtered;
};

export const filterTableAudioBatchSessionsForPlaylist = (sessions, playlist) => {
  const scope = resolveActiveTableAudioScope(playlist);
  if (!scope.active) return Array.isArray(sessions) ? sessions : [];
  return (Array.isArray(sessions) ? sessions : []).filter(session => {
    const specs = Array.isArray(session?.requestedSpecs) ? session.requestedSpecs : [];
    if (!specs.length) return false;
    return specs.some(spec => {
      const vocabId = upper(spec?.vocabId);
      if (vocabId) return scope.vocabIds.has(vocabId);
      const bookId = upper(spec?.bookId);
      return bookId ? scope.bookIds.has(bookId) : false;
    });
  });
};

export const buildTableAudioStagingVariantInventory = (records, { playlist = null } = {}) => {
  const source = playlist ? filterTableAudioStagingRecordsForPlaylist(records, playlist) : (Array.isArray(records) ? records : []);
  const inventory = {};
  source.filter(record => record?.mode === 'table' && record?.hasBlob && record?.mapKey).forEach(record => {
    if (!inventory[record.mapKey]) inventory[record.mapKey] = [];
    inventory[record.mapKey].push({
      sourceType: 'staging',
      sourceId: 'indexeddb-staging',
      stagingId: record.id,
      mapKey: record.mapKey,
      part: record.part || null,
      voiceId: record.voiceId || null,
      engine: record.engine || null,
      filename: record.filename || null,
      verified: true,
      deliveryStatus: 'staged-ready',
      size: Number(record.size || 0),
      displayId: record.displayId ?? null,
      vocabId: record.vocabId || null,
      bookId: record.bookId || null,
      mp3ExportedAt: record.mp3ExportedAt || null,
      zipExportedAt: record.zipExportedAt || null,
      lastExportKind: record.lastExportKind || null
    });
  });
  return inventory;
};

export const summarizeAudioStagingRecords = records => {
  const active = (Array.isArray(records) ? records : []).filter(record => record?.hasBlob);
  const bytes = active.reduce((sum, record) => sum + Number(record?.size || 0), 0);
  const voices = {};
  active.forEach(record => {
    const voice = clean(record?.voiceId) || 'Unknown';
    voices[voice] = (voices[voice] || 0) + 1;
  });
  return { count: active.length, bytes, voices };
};

export const isSameLogicalAudioVoice = (staged, externalVariant) => {
  if (!staged?.hasBlob || !externalVariant?.mapKey || staged.mapKey !== externalVariant.mapKey) return false;
  const stagedVocab = upper(staged.vocabId);
  const externalVocab = upper(externalVariant.vocabId);
  if (stagedVocab && externalVocab && stagedVocab !== externalVocab) return false;
  const stagedBook = upper(staged.bookId);
  const externalBook = upper(externalVariant.bookId);
  if (stagedBook && externalBook && stagedBook !== externalBook) return false;
  // If one side has scope identity and the other does not, do not auto-release
  // staging. We must prove the replacement belongs to the same deck first.
  if ((stagedVocab || stagedBook) && !(externalVocab || externalBook)) return false;
  const stagedVoice = lower(staged.voiceId);
  const externalVoice = lower(externalVariant.voiceId);
  if (stagedVoice || externalVoice) return Boolean(stagedVoice && externalVoice && stagedVoice === externalVoice);
  return true;
};

export const groupStagedAudioForZipExport = records => {
  const groups = new Map();
  (Array.isArray(records) ? records : []).filter(record => record?.hasBlob).forEach(record => {
    const bookId = clean(record.bookId) || 'TABLE';
    const voiceId = clean(record.voiceId) || 'UnknownVoice';
    const part = clean(record.part) || 'audio';
    const key = `${bookId}|${lower(voiceId)}|${part}`;
    if (!groups.has(key)) groups.set(key, { key, bookId, voiceId, part, records: [], bytes: 0 });
    const group = groups.get(key);
    group.records.push(record);
    group.bytes += Number(record.size || 0);
  });
  return [...groups.values()].map(group => ({
    ...group,
    records: group.records.sort((a, b) => Number(a?.displayId || 0) - Number(b?.displayId || 0))
  }));
};

export const splitStagedAudioGroupByBytes = (group, maxBytes) => {
  const limit = Number(maxBytes || 0);
  if (!limit || Number(group?.bytes || 0) <= limit) return [{ ...group, partNo: null }];
  const chunks = [];
  let records = [];
  let bytes = 0;
  (group?.records || []).forEach(record => {
    const size = Number(record?.size || 0);
    if (records.length && bytes + size > limit) {
      chunks.push({ ...group, records, bytes, partNo: chunks.length + 1 });
      records = [];
      bytes = 0;
    }
    records.push(record);
    bytes += size;
  });
  if (records.length) chunks.push({ ...group, records, bytes, partNo: chunks.length + 1 });
  return chunks;
};

export const resolveStagedGroupRange = records => {
  const values = (Array.isArray(records) ? records : []).map(record => Number(record?.displayId)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return { start: null, end: null };
  return { start: values[0], end: values[values.length - 1] };
};

export const resolveBatchSessionAvailability = ({ session, inventory = {} }) => {
  const specs = Array.isArray(session?.requestedSpecs) ? session.requestedSpecs : [];
  const unique = new Map();
  specs.forEach(spec => {
    if (!spec?.mapKey) return;
    const voice = lower(spec?.voiceId || spec?.requiredVoiceId);
    unique.set(`${spec.mapKey}|${voice}|${upper(spec?.vocabId || spec?.bookId)}`, spec);
  });
  let ready = 0;
  let staged = 0;
  let external = 0;
  let generated = 0;
  for (const spec of unique.values()) {
    const wantedVoice = lower(spec?.voiceId || spec?.requiredVoiceId);
    const variants = (Array.isArray(inventory?.[spec.mapKey]) ? inventory[spec.mapKey] : []).filter(variant => {
      if (wantedVoice && lower(variant?.voiceId) !== wantedVoice) return false;
      const specVocab = upper(spec?.vocabId);
      const variantVocab = upper(variant?.vocabId);
      if (specVocab && variantVocab) return specVocab === variantVocab;
      const specBook = upper(spec?.bookId);
      const variantBook = upper(variant?.bookId);
      if (specBook && variantBook) return specBook === variantBook;
      return !(specVocab || specBook);
    });
    if (!variants.length) continue;
    ready += 1;
    if (variants.some(variant => variant?.sourceType === 'staging')) staged += 1;
    if (variants.some(variant => variant?.sourceType === 'folder' || variant?.sourceType === 'zip')) external += 1;
    if (variants.some(variant => variant?.sourceType === 'generated' || variant?.sourceType === 'legacy')) generated += 1;
  }
  const total = unique.size || Number(session?.requestedCount || 0);
  return {
    total,
    ready,
    staged,
    external,
    generated,
    unavailable: Math.max(0, total - ready)
  };
};
