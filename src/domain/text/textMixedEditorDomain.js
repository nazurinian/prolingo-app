import { selectTextMixedReaderState } from './textMixedReaderDomain.js';
import { selectTextConversationEditorState, TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS, TextConversationEditorError } from './textConversationEditorDomain.js';
import { applyTextLibraryCommand } from './textLibraryCommandDomain.js';
import { canonicalJsonStringify } from './textCanonicalFingerprintDomain.js';
import { deriveTextStructuredSpeakerId } from './textStructuredSpeakerIdentityDomain.js';

const fail = (code, message) => { throw new TextConversationEditorError(code, message); };
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const TEXT_MIXED_EDITOR_COMMAND_FIELDS = Object.freeze({
  ...TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS,
  'paragraphSegment.split': TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS['conversationSegment.split'],
  'paragraphSegments.merge': TEXT_CONVERSATION_EDITOR_COMMAND_FIELDS['conversationSegments.merge']
});

/** Detached, immutable authoring view. All Cards retain their global order. Never persist this view. */
export const selectTextMixedEditorState = (snapshot, { documentId } = {}) => {
  const { presentation, documentTree } = selectTextMixedReaderState(snapshot, { documentId });
  const conversation = selectTextConversationEditorState(snapshot, { documentId: presentation.workspace.id });
  return freeze({ ...conversation, cards: documentTree.blocks, empty: documentTree.blocks.length === 0,
    counts: { ...conversation.counts, cards: documentTree.blocks.length,
      sections: documentTree.blocks.flatMap(c => c.units).filter(u => u.kind === 'paragraph').length,
      sentences: documentTree.blocks.reduce((sum, c) => sum + c.segments.length, 0) } });
};

// Shared structured authoring boundary; state must come from a validated hydrated tree.
export const scopeTextStructuredEditorCommand = (snapshot, state, command) => {
  const { type, payload = {} } = command || {};
  const fields = Object.hasOwn(TEXT_MIXED_EDITOR_COMMAND_FIELDS, type) && TEXT_MIXED_EDITOR_COMMAND_FIELDS[type];
  if (!fields || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).some(k => !fields.includes(k))) fail('INVALID_COMMAND', 'Unsupported command or fields');
  const card = id => {
    const value = state.cards.find(c => c.id === id);
    if (!value) fail('OUT_OF_SCOPE', 'Card is outside the selected Workspace');
    return value;
  };
  const unit = id => {
    const value = state.cards.flatMap(c => c.units).find(u => u.id === id);
    if (!value) fail('OUT_OF_SCOPE', 'Content Unit is outside the selected Workspace');
    return value;
  };
  const segment = id => {
    const value = state.cards.flatMap(c => c.segments).find(s => s.id === id);
    if (!value) fail('OUT_OF_SCOPE', 'Segment is outside the selected Workspace');
    return value;
  };
  let current;
  if (type.startsWith('speaker.') || ['block.create', 'block.reorder'].includes(type)) {
    if (payload.documentId !== state.workspace.id) fail('OUT_OF_SCOPE', 'Command Workspace must match the editor');
  } else if (type.startsWith('block.')) current = card(payload.id);
  else if (['contentUnit.create', 'contentUnit.reorder'].includes(type)) current = card(payload.blockId);
  else if (type === 'contentUnit.merge') (payload.ids || []).forEach(unit);
  else if (type.startsWith('contentUnit.')) current = unit(payload.id);
  else if (type === 'segment.create') {
    current = unit(payload.unitId);
    if (current.blockId !== payload.blockId) fail('OUT_OF_SCOPE', 'Sentence requires its explicit parent Card and Unit');
  } else if (type === 'segment.move') {
    current = segment(payload.segmentId);
    const target = unit(payload.targetUnitId);
    if (current.blockId !== target.blockId) fail('OUT_OF_SCOPE', 'Cross-Card Sentence moves are not supported');
    if (['beforeSegmentId', 'afterSegmentId', 'orderInUnit'].filter(k => payload[k] !== undefined).length > 1) fail('INVALID_COMMAND', 'Choose one move position');
  } else if (type.endsWith('Segments.merge')) {
    (payload.ids || []).forEach(id => {
      const s = segment(id);
      if (card(s.blockId).blockType !== (type.startsWith('paragraph') ? 'paragraph' : 'conversation')) fail('INVALID_COMMAND', 'Sentence command must match Card kind');
    });
  } else current = segment(payload.id);

  if (type === 'block.create' && !['paragraph', 'conversation'].includes(payload.blockType)) fail('INVALID_COMMAND', 'Choose Paragraph or Conversation Card');
  if (type === 'block.update' && payload.blockType !== undefined && payload.blockType !== current.blockType) fail('INVALID_COMMAND', 'Card kind conversion is not supported');
  if (type === 'contentUnit.create') {
    const kind = current.blockType === 'paragraph' ? 'paragraph' : 'turn';
    if (payload.kind !== undefined && payload.kind !== kind) fail('INVALID_COMMAND', 'Sections and Speaker Turns cannot share a Card');
    if (payload.afterUnitId && unit(payload.afterUnitId).blockId !== current.id) fail('OUT_OF_SCOPE', 'Insertion boundary must be in the same Card');
    if (kind === 'paragraph' && ['speaker', 'speakerId'].some(k => payload[k] !== undefined)) fail('INVALID_COMMAND', 'Sections cannot have speakers');
  }
  if (type === 'contentUnit.split' && ['beforeSegmentId', 'afterSegmentId', 'splitAtIndex'].filter(k => payload[k] !== undefined).length !== 1) fail('INVALID_COMMAND', 'Unit split requires exactly one boundary');
  if (type.endsWith('Segment.split')) {
    if (card(current.blockId).blockType !== (type.startsWith('paragraph') ? 'paragraph' : 'conversation')) fail('INVALID_COMMAND', 'Sentence command must match Card kind');
    if (!Array.isArray(payload.parts)) fail('INVALID_COMMAND', 'Provide bilingual Sentence parts');
    payload.parts.forEach(part => {
      if (!part || typeof part !== 'object' || Array.isArray(part) || Object.keys(part).some(k => !['text', 'meaning', 'joinAfter'].includes(k))
        || (String(current.meaning || '').trim() && part.meaning === undefined)) fail('INVALID_COMMAND', 'Translated Sentence splits require explicit paired meanings');
    });
  }
  const registry = state.speakerRegistry;
  if (payload.speakerId) {
    const known = registry.some(s => s.id === payload.speakerId);
    if (!known && !(type === 'speaker.register' && payload.speakerId === deriveTextStructuredSpeakerId({ documentId: state.workspace.id, speaker: payload.label }))) fail('OUT_OF_SCOPE', 'Speaker is not registered in this Workspace');
    if (payload.speaker === null || payload.speaker === '' || payload.resetSpeaker === true) fail('INVALID_COMMAND', 'Speaker selection and reset cannot be combined');
  }
  if (payload.metadata !== undefined) {
    if (!payload.metadata || typeof payload.metadata !== 'object' || Array.isArray(payload.metadata)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(payload.metadata))) fail('INVALID_COMMAND', 'metadata must be a plain object');
    // Existing source/audio/identity metadata is opaque to the editor. Only the
    // editable note may be replaced; other fields must survive byte-for-byte.
    const before = { ...(type.endsWith('.update') ? current?.metadata : {}) }, after = { ...payload.metadata };
    delete before.note; delete after.note;
    if (canonicalJsonStringify(before) !== canonicalJsonStringify(after)) fail('INVALID_COMMAND', 'Only metadata.note is editable; preserve source, audio and identity metadata');
  }
  return { type, payload: { ...payload, ...(type === 'segment.delete' ? { preserveEmptyUnit: true } : {}) } };
};

/** One existing command engine. No persistence, migration, physical audio or repair. */
export const applyTextMixedEditorCommand = (snapshot, command, { documentId, now = Date.now() } = {}) => {
  const state = selectTextMixedEditorState(snapshot, { documentId });
  try {
    const outcome = applyTextLibraryCommand(structuredClone(snapshot), scopeTextStructuredEditorCommand(snapshot, state, command), now);
    return { ...outcome, state: selectTextMixedEditorState(outcome.snapshot, { documentId: state.workspace.id }) };
  } catch (error) {
    if (error.code) throw error;
    fail('COMMAND_REJECTED', error.message);
  }
};

/** Synchronous lock + immutable staged command; async acknowledgements cannot replace newer snapshots. */
export const createTextSnapshotCommandCoordinator = ({ getScope, onCommit, onPending = () => {}, execute = null, prepare }) => {
  let pending = false, disposed = false;
  const errorResult = error => ({ ok: false, error: { code: typeof error?.code === 'string' ? error.code : 'COMMAND_REJECTED', message: error?.message || 'Command failed' } });
  return {
    dispose() { disposed = true; },
    async dispatch(command) {
      if (disposed) return errorResult({ code: 'STALE_RESULT', message: 'Editor session ended' });
      if (pending) return errorResult({ code: 'BUSY', message: 'Wait for the pending command' });
      pending = true;
      onPending(true);
      try {
        const scope = getScope();
        const captured = canonicalJsonStringify(scope.snapshot);
        const staged = freeze(prepare(scope.snapshot, command, { ...scope }));
        const expected = canonicalJsonStringify({ snapshot: staged.snapshot, result: staged.result });
        const outcome = await (execute ? execute(structuredClone(command), { preparedOutcome: staged, documentId: scope.documentId }) : staged);
        const latest = getScope();
        if (disposed || latest.documentId !== scope.documentId || latest.snapshot !== scope.snapshot || latest.revision !== scope.revision
          || canonicalJsonStringify(latest.snapshot) !== captured) fail('STALE_RESULT', 'Workspace or snapshot changed while the command was pending; retry against current data');
        if (outcome?.ok === false || outcome?.error) return errorResult(outcome.error || { message: 'Command rejected' });
        if (!outcome || (outcome.ok !== undefined && outcome.ok !== true)
          || canonicalJsonStringify({ snapshot: outcome.snapshot, result: outcome.result }) !== expected) fail('INVALID_RESPONSE', 'Command acknowledgement does not match the staged Workspace result');
        // Publish the staged result, never an externally supplied mutable object.
        onCommit(staged, scope);
        return { ok: true, ...staged };
      } catch (error) { return errorResult(error); }
      finally { pending = false; if (!disposed) onPending(false); }
    }
  };
};

export const createTextMixedEditorCoordinator = options => createTextSnapshotCommandCoordinator({
  ...options, prepare: (snapshot, command, scope) => applyTextMixedEditorCommand(snapshot, command, { documentId: scope.documentId })
});
