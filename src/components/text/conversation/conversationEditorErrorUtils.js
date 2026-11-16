import { normalizeTextStructuredSpeakerKey } from '../../../domain/text/textStructuredAudioIdentityDomain.js';
import { deriveTextStructuredSpeakerId } from '../../../domain/text/textStructuredSpeakerIdentityDomain.js';

export const TEXT_CONVERSATION_ERROR_META = Object.freeze({
  MIGRATION_REQUIRED: Object.freeze({
    code: 'MIGRATION_REQUIRED',
    title: 'Isolated Schema v2 Snapshot Required',
    recovery: 'Load or prepare a complete schema v2 QA snapshot before editing. The canonical v1 library will never be upgraded implicitly.',
    tone: 'amber'
  }),
  INVALID_SNAPSHOT: Object.freeze({
    code: 'INVALID_SNAPSHOT',
    title: 'Snapshot Integrity Check Failed',
    recovery: 'Editing stopped to protect data integrity. Inspect UIDs, Content Unit links, or corruption in the QA harness without silent repair.',
    tone: 'red'
  }),
  WORKSPACE_NOT_FOUND: Object.freeze({
    code: 'WORKSPACE_NOT_FOUND',
    title: 'Workspace Not Found',
    recovery: 'Select an existing eligible Conversation or Mixed Workspace from the selector.',
    tone: 'amber'
  }),
  UNSUPPORTED_WORKSPACE: Object.freeze({
    code: 'UNSUPPORTED_WORKSPACE',
    title: 'Unsupported Workspace Type',
    recovery: 'Switch to a structured Conversation or Mixed Workspace. Paragraph-only and Legacy workspaces are excluded from this editor.',
    tone: 'amber'
  }),
  OUT_OF_SCOPE: Object.freeze({
    code: 'OUT_OF_SCOPE',
    title: 'Target Outside Scope or Stale',
    recovery: 'Refresh your selection after a deletion or target entities inside the selected Conversation Workspace.',
    tone: 'red'
  }),
  INVALID_COMMAND: Object.freeze({
    code: 'INVALID_COMMAND',
    title: 'Invalid Command Input',
    recovery: 'Review the required fields, explicit Turn target, speaker choice, or bilingual split parts and retry.',
    tone: 'red'
  }),
  COMMAND_REJECTED: Object.freeze({
    code: 'COMMAND_REJECTED',
    title: 'Constraint Rejected Edit',
    recovery: 'Resolve the structural or speaker constraint below. Your draft input has been preserved for correction.',
    tone: 'red'
  })
});

/**
 * Formats any caught error using stable D4-A error codes without string parsing.
 */
export const normalizeConversationEditorError = error => {
  const code = error && typeof error === 'object' && Object.hasOwn(TEXT_CONVERSATION_ERROR_META, error.code)
    ? error.code
    : null;
  const meta = code ? TEXT_CONVERSATION_ERROR_META[code] : null;
  return {
    code: meta ? meta.code : 'UNKNOWN_ERROR',
    title: meta ? meta.title : 'Editor Error',
    recovery: meta ? meta.recovery : 'Review your draft input and retry.',
    tone: meta ? meta.tone : 'red',
    message: String(error?.message || 'Unknown Conversation Editor error.'),
    details: error?.details ?? null
  };
};

/**
 * Collects registered and label-detected speakers across Turns and Sentences (including empty Turns).
 */
export const collectConversationEditorSpeakers = state => {
  const workspaceId = state?.workspace?.id || '';
  const registry = Array.isArray(state?.speakerRegistry) ? state.speakerRegistry : [];
  const byId = new Map();

  registry.forEach(entry => {
    if (!entry?.id) return;
    byId.set(entry.id, {
      id: entry.id,
      uid: entry.uid || null,
      label: String(entry.label || entry.id),
      externalKey: entry.externalKey || null,
      registered: true,
      turnCount: 0,
      sentenceCount: 0,
      used: false
    });
  });

  const findEntryForTurn = turn => {
    if (turn?.speakerId && byId.has(turn.speakerId)) return byId.get(turn.speakerId);
    const labelKey = normalizeTextStructuredSpeakerKey(turn?.speaker || '');
    if (turn?.speakerId) {
      const created = {
        id: turn.speakerId,
        uid: null,
        label: String(turn.speaker || turn.speakerId),
        externalKey: null,
        registered: false,
        turnCount: 0,
        sentenceCount: 0,
        used: false
      };
      byId.set(created.id, created);
      return created;
    }
    if (!labelKey) return null;
    for (const existing of byId.values()) {
      if (normalizeTextStructuredSpeakerKey(existing.label) === labelKey) return existing;
    }
    const derivedId = deriveTextStructuredSpeakerId({ documentId: workspaceId, speaker: turn.speaker });
    const detected = {
      id: derivedId,
      uid: null,
      label: String(turn.speaker).trim(),
      externalKey: null,
      registered: false,
      turnCount: 0,
      sentenceCount: 0,
      used: false
    };
    byId.set(derivedId, detected);
    return detected;
  };

  (state?.scenes || []).forEach(scene => {
    (scene.turns || []).forEach(turn => {
      const entry = findEntryForTurn(turn);
      if (!entry) return;
      entry.turnCount += 1;
      entry.sentenceCount += Array.isArray(turn.sentences) ? turn.sentences.length : 0;
      entry.used = true;
    });
  });

  return [...byId.values()];
};

/**
 * Checks whether two adjacent Turns share canonical speaker attribution for merge eligibility.
 */
export const canMergeTurnsPair = (leftTurn, rightTurn) => {
  if (!leftTurn || !rightTurn) return false;
  const leftId = String(leftTurn.speakerId || '').trim();
  const rightId = String(rightTurn.speakerId || '').trim();
  if (leftId || rightId) {
    if (!leftId || !rightId || leftId !== rightId) return false;
  }
  return normalizeTextStructuredSpeakerKey(leftTurn.speaker || '') === normalizeTextStructuredSpeakerKey(rightTurn.speaker || '');
};

/**
 * Builds replacement metadata preserving all untouched keys (e.g. externalEntityV1, speakerIdentityV1).
 */
export const buildReplacedMetadataWithNote = (currentMetadata, note) => {
  const base = currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
    ? { ...currentMetadata }
    : {};
  const cleanNote = String(note ?? '').trim();
  if (cleanNote) {
    base.note = cleanNote;
  } else {
    delete base.note;
  }
  return base;
};

/**
 * Summarizes metadata keys for transparent preservation display.
 */
export const listPreservedMetadataEntries = (metadata, { exclude = [] } = {}) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const skip = new Set(exclude);
  return Object.entries(metadata)
    .filter(([key, value]) => !skip.has(key) && value !== undefined)
    .map(([key, value]) => ({
      key,
      summary: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : Array.isArray(value)
          ? `[${value.length}]`
          : '{...}'
    }));
};

/**
 * Reorders an ID inside an ordered array by moving +1 or -1.
 */
export const swapArrayIds = (ids, targetId, direction) => {
  const list = [...(Array.isArray(ids) ? ids : [])];
  const from = list.indexOf(targetId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return null;
  [list[from], list[to]] = [list[to], list[from]];
  return list;
};

/**
 * Reorders a Conversation Scene inside the full Workspace cardOrderIds list (preserving Mixed Paragraph cards).
 */
export const swapConversationSceneInCardOrder = (cardOrderIds, scenes, sceneId, direction) => {
  const orderList = [...(Array.isArray(cardOrderIds) ? cardOrderIds : [])];
  const sceneIds = (Array.isArray(scenes) ? scenes : []).map(scene => scene.id);
  const sceneIndex = sceneIds.indexOf(sceneId);
  const targetSceneIndex = sceneIndex + direction;
  if (sceneIndex < 0 || targetSceneIndex < 0 || targetSceneIndex >= sceneIds.length) return null;
  const siblingSceneId = sceneIds[targetSceneIndex];
  const posA = orderList.indexOf(sceneId);
  const posB = orderList.indexOf(siblingSceneId);
  if (posA < 0 || posB < 0) return null;
  [orderList[posA], orderList[posB]] = [orderList[posB], orderList[posA]];
  return orderList;
};

/**
 * Reports logical audio metadata state attached to a Sentence channel without implying physical Readiness.
 */
export const getSentenceLogicalAudioMetaState = (audioVariants = [], channel = 'text') => {
  const matches = (Array.isArray(audioVariants) ? audioVariants : []).filter(v => v?.channel === channel);
  if (matches.length === 0) {
    return { status: 'none', label: 'No Meta', count: 0 };
  }
  const hasInvalidated = matches.every(v => Boolean(v?.metadata?.contentInvalidatedV1));
  if (hasInvalidated) {
    return { status: 'invalidated', label: 'Meta Stale', count: matches.length };
  }
  const hasRf = matches.some(v => Boolean(v?.metadata?.audioRenderFingerprintV1) && !v?.metadata?.contentInvalidatedV1);
  if (hasRf) {
    return { status: 'recorded', label: 'RF Recorded', count: matches.length };
  }
  return { status: 'recorded', label: `${matches.length} Variant`, count: matches.length };
};
