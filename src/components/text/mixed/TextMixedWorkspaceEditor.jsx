import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTextMixedEditorCoordinator, selectTextMixedEditorState } from '../../../domain/text/textMixedEditorDomain.js';
import ConversationSceneCard from '../conversation/ConversationSceneCard.jsx';
import ConversationSentenceItem from '../conversation/ConversationSentenceItem.jsx';
import ConversationSpeakerPanel from '../conversation/ConversationSpeakerPanel.jsx';
import { AddSentenceForm } from '../conversation/ConversationTurnSection.jsx';
import { buildReplacedMetadataWithNote, collectConversationEditorSpeakers, swapArrayIds } from '../conversation/conversationEditorErrorUtils.js';

const control = 'min-h-10 rounded border px-3 text-sm disabled:opacity-40';
const confirmed = message => typeof window === 'undefined' || window.confirm(message);

/** Separate drafts: a rejected acknowledgement never closes or resets this form. */
function MetadataDraft({ record = null, titleField = false, createCard = false, isBusy, onSubmit, onClose }) {
  const [title, setTitle] = useState(record?.title || '');
  const [note, setNote] = useState(record?.metadata?.note || '');
  const [blockType, setBlockType] = useState('paragraph');
  const [error, setError] = useState(null);
  const submit = async event => {
    event.preventDefault();
    const result = await onSubmit({ ...(titleField ? { title } : {}), ...(createCard ? { blockType } : {}),
      metadata: buildReplacedMetadataWithNote(record?.metadata, note) });
    if (result?.ok) onClose(); else setError(result?.error || { message: 'Command rejected; retry your draft.' });
  };
  return <form onSubmit={submit} data-mixed-metadata-draft className="border rounded p-3 space-y-2">
    {error && <p role="alert">{error.code}: {error.message}</p>}
    {createCard && <label className="block">Card type <select aria-label="New Card type" disabled={isBusy} value={blockType} onChange={e => setBlockType(e.target.value)} className={control}>
      <option value="paragraph">Paragraph</option><option value="conversation">Conversation</option>
    </select></label>}
    {titleField && <label className="block">Title <input aria-label="Card title" value={title} disabled={isBusy} onChange={e => setTitle(e.target.value)} className={control} /></label>}
    <label className="block">Note <input aria-label="Metadata note" value={note} disabled={isBusy} onChange={e => setNote(e.target.value)} className={control} /></label>
    <div className="flex gap-2"><button type="submit" disabled={isBusy} className={control}>Save</button>
      <button type="button" disabled={isBusy} onClick={onClose} className={control}>Cancel</button></div>
  </form>;
}

function ParagraphSection({ unit, index, card, units, isBusy, onCommand }) {
  const [editing, setEditing] = useState(false), [adding, setAdding] = useState(false);
  const reorder = direction => onCommand({ type: 'contentUnit.reorder', payload: { blockId: card.id, orderedIds: swapArrayIds(units.map(u => u.id), unit.id, direction) } });
  return <section data-mixed-section-id={unit.id} className="border rounded p-3 space-y-2">
    <h4 className="font-bold">Section {index + 1} <span className="text-xs font-normal">{unit.id}</span></h4>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={isBusy || index === 0} onClick={() => reorder(-1)} className={control}>Section up</button>
      <button type="button" disabled={isBusy || index === units.length - 1} onClick={() => reorder(1)} className={control}>Section down</button>
      <button type="button" disabled={isBusy} onClick={() => setEditing(v => !v)} className={control}>Edit Section note</button>
      <button type="button" disabled={isBusy || !units[index + 1]} onClick={() => onCommand({ type: 'contentUnit.merge', payload: { ids: [unit.id, units[index + 1].id] } })} className={control}>Merge next Section</button>
      <button type="button" disabled={isBusy} onClick={() => { if (confirmed(`Delete Section ${unit.id} and its Sentences?`)) onCommand({ type: 'contentUnit.delete', payload: { id: unit.id } }); }} className={control}>Delete Section</button>
    </div>
    {editing && <MetadataDraft record={unit} isBusy={isBusy} onSubmit={payload => onCommand({ type: 'contentUnit.update', payload: { id: unit.id, ...payload } })} onClose={() => setEditing(false)} />}
    {unit.sentences.length === 0 && <p>Intentionally empty Section.</p>}
    {unit.sentences.map((sentence, sentenceIndex) => <ConversationSentenceItem key={sentence.id} sentence={sentence} sentenceIndex={sentenceIndex}
      turn={unit} sceneTurns={units} nextSentence={unit.sentences[sentenceIndex + 1]} isBusy={isBusy} onCommand={onCommand} />)}
    {adding ? <AddSentenceForm sceneId={card.id} turn={unit} isBusy={isBusy} onCommand={onCommand} onClose={() => setAdding(false)} />
      : <button type="button" disabled={isBusy} onClick={() => setAdding(true)} className={control}>Add Sentence</button>}
  </section>;
}

function ParagraphCard({ card, index, state, isBusy, onCommand }) {
  const [editing, setEditing] = useState(false);
  const units = card.units.map(unit => ({ ...unit, sentences: unit.segments, sentenceCount: unit.segments.length }));
  const reorder = direction => onCommand({ type: 'block.reorder', payload: { documentId: state.workspace.id, orderedIds: swapArrayIds(state.cardOrderIds, card.id, direction) } });
  return <article data-mixed-paragraph-editor={card.id} className="border rounded p-3 space-y-3">
    <h3 className="font-bold">Paragraph Card: {card.title || card.id}</h3>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={isBusy || index === 0} aria-label={`Move Card ${card.id} up`} onClick={() => reorder(-1)} className={control}>Card up</button>
      <button type="button" disabled={isBusy || index === state.cards.length - 1} aria-label={`Move Card ${card.id} down`} onClick={() => reorder(1)} className={control}>Card down</button>
      <button type="button" disabled={isBusy} onClick={() => setEditing(v => !v)} className={control}>Edit Paragraph Card</button>
      <button type="button" disabled={isBusy} onClick={() => { if (confirmed(`Delete Card ${card.id} and its contents?`)) onCommand({ type: 'block.delete', payload: { id: card.id } }); }} className={control}>Delete Paragraph Card</button>
    </div>
    {editing && <MetadataDraft record={card} titleField isBusy={isBusy} onSubmit={payload => onCommand({ type: 'block.update', payload: { id: card.id, ...payload } })} onClose={() => setEditing(false)} />}
    {units.length === 0 && <p>Empty Paragraph Card: zero Sections retained.</p>}
    {units.map((unit, i) => <ParagraphSection key={unit.id} unit={unit} index={i} card={card} units={units} isBusy={isBusy} onCommand={onCommand} />)}
    <button type="button" disabled={isBusy} onClick={() => onCommand({ type: 'contentUnit.create', payload: { blockId: card.id, kind: 'paragraph' } })} className={control}>Add Section</button>
  </article>;
}

/** Controlled disposable-snapshot editor. Owns no storage or audio host. */
export default function TextMixedWorkspaceEditor({ snapshot, documentId, revision = 0, onStateChange, executeCommand = null, onPendingChange = null }) {
  const scopeRef = useRef({ snapshot, documentId, revision }), callbacksRef = useRef({ onStateChange, executeCommand, onPendingChange }), coordinatorRef = useRef(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(null), [creating, setCreating] = useState(false);
  useLayoutEffect(() => {
    scopeRef.current = { snapshot, documentId, revision };
    callbacksRef.current = { onStateChange, executeCommand, onPendingChange };
  }, [snapshot, documentId, revision, onStateChange, executeCommand, onPendingChange]);
  const selection = useMemo(() => {
    try { return { state: selectTextMixedEditorState(snapshot, { documentId }) }; }
    catch (e) { return { error: e }; }
  }, [snapshot, documentId]);
  useEffect(() => {
    const coordinator = createTextMixedEditorCoordinator({
      getScope: () => scopeRef.current,
      onCommit: (outcome, scope) => callbacksRef.current.onStateChange(outcome, scope),
      onPending: value => { setPending(value); callbacksRef.current.onPendingChange?.(value); },
      execute: (command, context) => callbacksRef.current.executeCommand ? callbacksRef.current.executeCommand(command, context) : context.preparedOutcome
    });
    coordinatorRef.current = coordinator;
    return () => { coordinator.dispose(); coordinatorRef.current = null; callbacksRef.current.onPendingChange?.(false); };
  }, []);
  const dispatch = async command => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return { ok: false, error: { code: 'STALE_RESULT', message: 'Editor session is not active' } };
    const result = await coordinator.dispatch(command);
    if (coordinatorRef.current === coordinator) setError(result.ok ? null : result.error);
    return result;
  };
  if (selection.error) return <div role="alert">{selection.error.code}: {selection.error.message}</div>;
  const { state } = selection;
  const speakers = collectConversationEditorSpeakers(state);
  return <section data-mixed-workspace-editor={state.workspace.id} aria-busy={pending} className="space-y-3 border rounded p-3">
    <h2 className="font-bold">Mixed Workspace Editor (disposable QA)</h2>
    <p className="text-sm">{state.cards.length} Cards in global order. No canonical persistence. Cross-Card Sentence moves are unavailable.</p>
    {error && <p role="alert" data-mixed-editor-error>{error.code}: {error.message} Your draft remains available; review and retry.</p>}
    <ConversationSpeakerPanel state={state} isBusy={pending} onCommand={dispatch} />
    {creating ? <MetadataDraft titleField createCard isBusy={pending} onSubmit={payload => dispatch({ type: 'block.create', payload: { documentId: state.workspace.id, ...payload } })} onClose={() => setCreating(false)} />
      : <button type="button" disabled={pending} onClick={() => setCreating(true)} className={control}>Create Card</button>}
    {state.empty && <p>Empty Mixed Workspace: create either Card type.</p>}
    {state.cards.map((card, index) => <div key={card.id} data-mixed-editor-card-id={card.id} data-mixed-editor-card-kind={card.blockType}>
      {card.blockType === 'paragraph' ? <ParagraphCard card={card} index={index} state={state} isBusy={pending} onCommand={dispatch} />
        : <ConversationSceneCard scene={state.scenes.find(s => s.id === card.id)} sceneIndex={index} state={state} cardOrderPeers={state.cards} speakerOptions={speakers} isBusy={pending} onCommand={dispatch} />}
    </div>)}
  </section>;
}
