import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Crosshair,
  Edit3,
  Eye,
  EyeOff,
  GitMerge,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  User
} from 'lucide-react';
import SharedMixedWorkspaceReader from '../presentation/SharedMixedWorkspaceReader.jsx';
import SharedParagraphWorkspaceReader from '../presentation/SharedParagraphCardReader.jsx';
import {
  buildReplacedMetadataWithNote,
  canMergeTurnsPair,
  listPreservedMetadataEntries,
  swapArrayIds
} from '../conversation/conversationEditorErrorUtils.js';
import DataManagementSegmentRow from './DataManagementSegmentRow.jsx';
import { DM_CONTROL_BTN, DM_INPUT_CLASS, DM_SMALL_BTN, explainReason } from './dataManagementUiUtils.js';

const clean = value => String(value ?? '').trim();

/**
 * Section 3: Structured Editor covering global Card ordering, Paragraph Sections
 * (including read-only v1 virtual Sections), Conversation Speaker Turns,
 * bilingual Sentence Segments, and read-only Shared Reader preview.
 */
export default function DataManagementStructuredEditor({
  view,
  snapshot,
  isPending = false,
  onNavigate,
  onDispatch,
  getDraft,
  setDraft,
  clearDraft,
  compact = false
}) {
  const [showReaderPreview, setShowReaderPreview] = useState(true);
  const [editingCardId, setEditingCardId] = useState(null);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [creatingUnitCardId, setCreatingUnitCardId] = useState(null);

  const workspace = view?.workspace;
  if (!workspace || workspace.unsupportedReason || !workspace.presentation) {
    return null;
  }

  const { document: doc, documentTree, presentation, speakers = [] } = workspace;
  const selection = view?.selection || {};
  const capabilities = view?.capabilities || {};
  const schemaVersion = view?.schemaVersion;
  const isV1 = schemaVersion === 1;

  const canCreateCard = Boolean(capabilities['block.create']?.enabled);
  const canUpdateCard = Boolean(capabilities['block.update']?.enabled);
  const canDeleteCard = Boolean(capabilities['block.delete']?.enabled);
  const canReorderCard = Boolean(capabilities['block.reorder']?.enabled);
  const canCreateUnit = Boolean(capabilities['contentUnit.create']?.enabled && !isV1);
  const canUpdateUnit = Boolean(capabilities['contentUnit.update']?.enabled && !isV1);
  const canReorderUnit = Boolean(capabilities['contentUnit.reorder']?.enabled && !isV1);
  const canMergeUnit = Boolean(capabilities['contentUnit.merge']?.enabled && !isV1);
  const canDeleteUnit = Boolean(capabilities['contentUnit.delete']?.enabled && !isV1);
  const canCreateSeg = Boolean(capabilities['segment.create']?.enabled);
  const canContent = canUpdateCard || canCreateSeg;

  const defaultCardType = doc.documentType === 'conversation' ? 'conversation' : 'paragraph';
  const newCardTypeKey = { workspaceId: doc.id, entityId: doc.id, field: 'newCardType' };
  const newCardTitleKey = { workspaceId: doc.id, entityId: doc.id, field: 'newCardTitle' };
  const newCardNoteKey = { workspaceId: doc.id, entityId: doc.id, field: 'newCardNote' };
  const newCardType = doc.documentType === 'mixed'
    ? (getDraft(newCardTypeKey) ?? defaultCardType)
    : defaultCardType;
  const newCardTitle = getDraft(newCardTitleKey) ?? '';
  const newCardNote = getDraft(newCardNoteKey) ?? '';

  const rawBlockById = new Map((documentTree?.blocks || []).map(b => [b.id, b]));
  const rawSegById = new Map((documentTree?.blocks || []).flatMap(b => (b.segments || []).map(s => [s.id, s])));
  const globalCardOrder = presentation.cards.map(c => c.id);

  const handleCreateCard = async event => {
    event.preventDefault();
    const payload = {
      documentId: doc.id,
      blockType: newCardType,
      title: clean(newCardTitle) || undefined
    };
    if (clean(newCardNote)) payload.metadata = { note: clean(newCardNote) };
    const res = await onDispatch({ type: 'block.create', payload });
    if (res?.ok) {
      clearDraft(newCardTypeKey);
      clearDraft(newCardTitleKey);
      clearDraft(newCardNoteKey);
    }
  };

  const handleReorderCard = async (cardId, direction) => {
    const orderedIds = swapArrayIds(globalCardOrder, cardId, direction);
    if (!orderedIds) return;
    await onDispatch({ type: 'block.reorder', payload: { documentId: doc.id, orderedIds } });
  };

  return (
    <div className="space-y-4">
      {/* Live Read-Only Shared Reader Preview */}
      <section
        aria-label="Read-Only Shared Reader Preview"
        data-dm-reader-preview="true"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                Shared Card Reader Preview (Read-Only Sibling)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Live frozen A1 presentation projection with no audio host (`precision: none`).
              </p>
            </div>
          </div>
          <button
            type="button"
            data-dm-toggle-reader="true"
            onClick={() => setShowReaderPreview(v => !v)}
            className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
          >
            {showReaderPreview ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
            {showReaderPreview ? 'Hide Reader' : 'Show Reader'}
          </button>
        </div>

        {showReaderPreview && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3">
            {doc.documentType === 'mixed' ? (
              <SharedMixedWorkspaceReader
                snapshot={snapshot}
                documentId={doc.id}
                isBusy={isPending}
              />
            ) : (
              <div data-dm-shared-card-reader-preview="true">
                <SharedParagraphWorkspaceReader
                  presentation={presentation}
                  disabled
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Structured Editor */}
      <section
        aria-label="Structured Editor"
        data-dm-structured-editor={doc.id}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Structured Content Editor ({presentation.cards.length} Cards in Global Order)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isV1
                ? 'Schema v1 Paragraph: Card & Segment edits work cleanly; virtual Sections (id: null) stay read-only.'
                : 'Schema v2 Complete Units: Paragraph Sections and Conversation Speaker Turns stay cleanly separated per Card.'}
            </p>
          </div>
          {!capabilities['block.create']?.enabled && capabilities['block.create']?.reason && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {capabilities['block.create'].reason}
            </span>
          )}
        </div>

        {/* Create Card Form */}
        <form
          onSubmit={handleCreateCard}
          data-dm-create-card-form="true"
          className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2.5"
        >
          <p className="text-xs font-black text-indigo-800 dark:text-indigo-200">Create Card in Global Order</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Card Kind</span>
              <select
                aria-label="New Card kind"
                value={newCardType}
                onChange={e => setDraft(newCardTypeKey, e.target.value)}
                disabled={isPending || !canCreateCard}
                className={DM_INPUT_CLASS}
              >
                <option value="paragraph" disabled={doc.documentType === 'conversation'}>
                  Paragraph Card {doc.documentType === 'conversation' ? '(Mismatch)' : ''}
                </option>
                <option value="conversation" disabled={doc.documentType === 'paragraph'}>
                  Conversation Scene Card {doc.documentType === 'paragraph' ? '(Mismatch)' : ''}
                </option>
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Card Title (optional)</span>
              <input
                aria-label="New Card title"
                value={newCardTitle}
                onChange={e => setDraft(newCardTitleKey, e.target.value)}
                disabled={isPending || !canCreateCard}
                placeholder="Optional Card title"
                className={DM_INPUT_CLASS}
              />
            </label>
            <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Card metadata.note</span>
              <input
                aria-label="New Card note"
                value={newCardNote}
                onChange={e => setDraft(newCardNoteKey, e.target.value)}
                disabled={isPending || !canCreateCard}
                placeholder="Optional metadata.note"
                className={DM_INPUT_CLASS}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              data-dm-create-card-submit="true"
              disabled={isPending || !canCreateCard}
              title={canCreateCard ? 'Create new Card' : explainReason(capabilities['block.create']?.reason)}
              className={`${DM_CONTROL_BTN} border-indigo-600 bg-indigo-600 text-white`}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Create {newCardType === 'conversation' ? 'Scene Card' : 'Paragraph Card'}
            </button>
          </div>
        </form>

        {/* Empty Workspace */}
        {presentation.cards.length === 0 ? (
          <div data-dm-empty-cards="true" className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Empty Workspace: zero Cards persisted. Create a Card above when ready.
          </div>
        ) : (
          <div className="space-y-4">
            {presentation.cards.map((card, cardIdx) => {
              const rawBlock = rawBlockById.get(card.id) || {};
              const isCardSelected = selection.cardId === card.id;
              const isEditingCard = editingCardId === card.id;
              const cardTitleKey = { workspaceId: doc.id, entityId: card.id, field: 'title' };
              const cardNoteKey = { workspaceId: doc.id, entityId: card.id, field: 'note' };
              const draftCardTitle = getDraft(cardTitleKey) ?? card.title ?? '';
              const draftCardNote = getDraft(cardNoteKey) ?? (typeof rawBlock.metadata?.note === 'string' ? rawBlock.metadata.note : '');
              const cardOpaqueMeta = listPreservedMetadataEntries(rawBlock.metadata, { exclude: ['note'] });
              const persistentUnits = card.units.filter(u => Boolean(u.id));
              const unitOrderIds = persistentUnits.map(u => u.id);

              const handleSaveCard = async event => {
                event.preventDefault();
                const res = await onDispatch({
                  type: 'block.update',
                  payload: {
                    id: card.id,
                    title: clean(draftCardTitle) || null,
                    metadata: buildReplacedMetadataWithNote(rawBlock.metadata, draftCardNote)
                  }
                });
                if (res?.ok) {
                  clearDraft(cardTitleKey);
                  clearDraft(cardNoteKey);
                  setEditingCardId(null);
                }
              };

              // Add Unit Drafts (only persistent in v2)
              const addUnitOpen = creatingUnitCardId === card.id;
              const newUnitSpeakerKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitSpeaker' };
              const newUnitCustomSpkKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitCustomSpeaker' };
              const newUnitAfterKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitAfterId' };
              const newUnitTextKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitText' };
              const newUnitMeaningKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitMeaning' };
              const newUnitJoinKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitJoinAfter' };
              const newUnitNoteKey = { workspaceId: doc.id, entityId: card.id, field: 'newUnitNote' };

              const unitSpeakerChoice = getDraft(newUnitSpeakerKey) ?? (speakers[0]?.id || '__none__');
              const unitCustomSpeaker = getDraft(newUnitCustomSpkKey) ?? '';
              const unitAfterId = getDraft(newUnitAfterKey) ?? '';
              const unitInitText = getDraft(newUnitTextKey) ?? '';
              const unitInitMeaning = getDraft(newUnitMeaningKey) ?? '';
              const unitInitJoin = getDraft(newUnitJoinKey) ?? 'space';
              const unitNote = getDraft(newUnitNoteKey) ?? '';

              const handleCreateUnit = async event => {
                event.preventDefault();
                const kind = card.blockType === 'paragraph' ? 'paragraph' : 'turn';
                const payload = { blockId: card.id, kind };
                if (kind === 'turn') {
                  if (unitSpeakerChoice === '__custom__' && clean(unitCustomSpeaker)) {
                    payload.speaker = clean(unitCustomSpeaker);
                  } else if (unitSpeakerChoice && !['__none__', '__custom__'].includes(unitSpeakerChoice)) {
                    payload.speakerId = unitSpeakerChoice;
                  }
                }
                if (unitAfterId) payload.afterUnitId = unitAfterId;
                if (clean(unitInitText)) {
                  payload.text = clean(unitInitText);
                  payload.meaning = String(unitInitMeaning ?? '').trim();
                  payload.joinAfter = unitInitJoin;
                }
                if (clean(unitNote)) payload.metadata = { note: clean(unitNote) };
                const res = await onDispatch({ type: 'contentUnit.create', payload });
                if (res?.ok) {
                  [newUnitSpeakerKey, newUnitCustomSpkKey, newUnitAfterKey, newUnitTextKey, newUnitMeaningKey, newUnitJoinKey, newUnitNoteKey].forEach(clearDraft);
                  setCreatingUnitCardId(null);
                }
              };

              return (
                <article
                  key={card.id}
                  data-dm-card-id={card.id}
                  data-dm-card-kind={card.blockType}
                  className={`rounded-2xl border p-3.5 space-y-3 ${
                    isCardSelected
                      ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/15 ring-1 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/30'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-black text-slate-500 dark:text-slate-400">
                          Card #{cardIdx + 1}
                        </span>
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 break-words">
                          {card.title || (card.blockType === 'conversation' ? 'Untitled Scene Card' : 'Untitled Paragraph Card')}
                        </h4>
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${
                          card.blockType === 'conversation'
                            ? 'bg-sky-100 dark:bg-sky-900/40 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200'
                            : 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200'
                        }`}>
                          {card.blockType === 'conversation' ? 'CONVERSATION SCENE' : 'PARAGRAPH CARD'}
                        </span>
                        {card.units.length === 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-[9px] font-black text-amber-800 dark:text-amber-200">
                            ZERO UNITS
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all">
                        {card.id} · {card.uid} · order {rawBlock.order ?? cardIdx}
                        {rawBlock.metadata?.note ? ` · note: ${rawBlock.metadata.note}` : ''}
                      </p>
                      {cardOpaqueMeta.length > 0 && (
                        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          Preserved meta: {cardOpaqueMeta.map(e => `${e.key}=${e.summary}`).join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-dm-select-card={card.id}
                        onClick={() => onNavigate({ workspaceId: doc.id, cardId: card.id })}
                        className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
                      >
                        <Crosshair className="w-3 h-3" aria-hidden="true" />
                        Select
                      </button>
                      <button
                        type="button"
                        data-dm-card-up={card.id}
                        disabled={isPending || !canReorderCard || cardIdx === 0}
                        onClick={() => handleReorderCard(card.id, -1)}
                        title={canReorderCard ? 'Move Card up' : explainReason(capabilities?.['block.reorder']?.reason)}
                        aria-label={`Move Card ${card.id} up`}
                        className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-dm-card-down={card.id}
                        disabled={isPending || !canReorderCard || cardIdx === presentation.cards.length - 1}
                        onClick={() => handleReorderCard(card.id, 1)}
                        title={canReorderCard ? 'Move Card down' : explainReason(capabilities?.['block.reorder']?.reason)}
                        aria-label={`Move Card ${card.id} down`}
                        className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-dm-card-edit-toggle={card.id}
                        disabled={isPending || !canUpdateCard}
                        onClick={() => setEditingCardId(v => v === card.id ? null : card.id)}
                        title={canUpdateCard ? 'Edit Card title or metadata.note' : explainReason(capabilities?.['block.update']?.reason)}
                        aria-label={`Edit Card ${card.id}`}
                        className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        data-dm-card-delete={card.id}
                        disabled={isPending || !canDeleteCard}
                        onClick={() => onDispatch({ type: 'block.delete', payload: { id: card.id } })}
                        title={canDeleteCard ? 'Delete Card' : explainReason(capabilities?.['block.delete']?.reason)}
                        aria-label={`Delete Card ${card.id}`}
                        className={`${DM_SMALL_BTN} border-red-200 dark:border-red-900 text-red-700 dark:text-red-300`}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Card Edit Form */}
                  {isEditingCard && (
                    <form
                      onSubmit={handleSaveCard}
                      data-dm-card-edit-form={card.id}
                      className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                          Edit Card {card.id} (Kind fixed: {card.blockType})
                        </span>
                        <button type="button" onClick={() => setEditingCardId(null)} className="text-xs text-slate-500">Close</button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          aria-label={`Card title ${card.id}`}
                          value={draftCardTitle}
                          onChange={e => setDraft(cardTitleKey, e.target.value)}
                          disabled={isPending}
                          placeholder="Card title"
                          className={DM_INPUT_CLASS}
                        />
                        <input
                          aria-label={`Card note ${card.id}`}
                          value={draftCardNote}
                          onChange={e => setDraft(cardNoteKey, e.target.value)}
                          disabled={isPending}
                          placeholder="Card metadata.note"
                          className={DM_INPUT_CLASS}
                        />
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button type="submit" disabled={isPending} data-dm-card-save={card.id} className={`${DM_SMALL_BTN} border-indigo-600 bg-indigo-600 text-white`}>
                          <Save className="w-3.5 h-3.5" aria-hidden="true" />
                          Save Card
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Add Unit Control / v1 Virtual Banner */}
                  {isV1 ? (
                    <div
                      data-dm-v1-unit-disabled={card.id}
                      className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200"
                    >
                      Virtual v1 Section boundary: <span className="font-mono font-bold">PERSISTENT_UNITS_REQUIRED</span>. Virtual Section actions (`contentUnit.*`, `segment.move`) are disabled and never submitted as `unitId`.
                    </div>
                  ) : (
                    <div>
                      {!addUnitOpen ? (
                        <button
                          type="button"
                          data-dm-open-create-unit={card.id}
                          disabled={isPending || !canCreateUnit}
                          onClick={() => setCreatingUnitCardId(card.id)}
                          title={canCreateUnit ? `Add ${card.blockType === 'conversation' ? 'Speaker Turn' : 'Section'}` : explainReason(capabilities?.['contentUnit.create']?.reason)}
                          className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200`}
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Add {card.blockType === 'conversation' ? 'Speaker Turn' : 'Paragraph Section'}
                        </button>
                      ) : (
                        <form
                          onSubmit={handleCreateUnit}
                          data-dm-create-unit-form={card.id}
                          className="rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-sky-800 dark:text-sky-200">
                              New {card.blockType === 'conversation' ? 'Speaker Turn' : 'Paragraph Section'} in {card.id}
                            </span>
                            <button type="button" onClick={() => setCreatingUnitCardId(null)} className="text-xs text-slate-500">Cancel</button>
                          </div>
                          {card.blockType === 'conversation' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <select
                                aria-label={`New Turn speaker ${card.id}`}
                                value={unitSpeakerChoice}
                                onChange={e => setDraft(newUnitSpeakerKey, e.target.value)}
                                disabled={isPending}
                                className={DM_INPUT_CLASS}
                              >
                                <option value="__none__">Unassigned Speaker</option>
                                {speakers.map(s => (
                                  <option key={s.id} value={s.id}>{s.label} ({s.id})</option>
                                ))}
                                <option value="__custom__">+ Custom Speaker Label...</option>
                              </select>
                              {unitSpeakerChoice === '__custom__' && (
                                <input
                                  aria-label={`Custom Turn speaker ${card.id}`}
                                  value={unitCustomSpeaker}
                                  onChange={e => setDraft(newUnitCustomSpkKey, e.target.value)}
                                  disabled={isPending}
                                  placeholder="Custom speaker name"
                                  className={DM_INPUT_CLASS}
                                />
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              aria-label={`Insert unit position ${card.id}`}
                              value={unitAfterId}
                              onChange={e => setDraft(newUnitAfterKey, e.target.value)}
                              disabled={isPending}
                              className={DM_INPUT_CLASS}
                            >
                              <option value="">Append at end of Card</option>
                              {persistentUnits.map((u, idx) => (
                                <option key={u.id} value={u.id}>
                                  After {u.kind === 'turn' ? `Turn #${idx + 1} (${u.speakerLabel || 'Unassigned'})` : `Section #${idx + 1}`} · {u.id}
                                </option>
                              ))}
                            </select>
                            <input
                              aria-label={`New Unit note ${card.id}`}
                              value={unitNote}
                              onChange={e => setDraft(newUnitNoteKey, e.target.value)}
                              disabled={isPending}
                              placeholder="Optional Unit metadata.note"
                              className={DM_INPUT_CLASS}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              aria-label={`New Unit first text ${card.id}`}
                              value={unitInitText}
                              onChange={e => setDraft(newUnitTextKey, e.target.value)}
                              disabled={isPending}
                              placeholder="Optional first Sentence EN (leave blank for Empty Unit)"
                              className={DM_INPUT_CLASS}
                            />
                            <input
                              aria-label={`New Unit first meaning ${card.id}`}
                              value={unitInitMeaning}
                              onChange={e => setDraft(newUnitMeaningKey, e.target.value)}
                              disabled={isPending}
                              placeholder="Optional first Sentence ID"
                              className={DM_INPUT_CLASS}
                            />
                          </div>
                          <div className="flex justify-end gap-1.5">
                            <button type="submit" disabled={isPending} data-dm-create-unit-submit={card.id} className={`${DM_SMALL_BTN} border-sky-600 bg-sky-600 text-white`}>
                              {clean(unitInitText) ? 'Create Unit + Sentence' : `Create Empty ${card.blockType === 'conversation' ? 'Turn' : 'Section'}`}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Units inside Card */}
                  {card.units.length === 0 ? (
                    <div
                      data-dm-zero-unit-card={card.id}
                      className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      Zero-Unit Empty Card retained ({card.id}). No phantom Unit or Sentence generated.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {card.units.map((unit, unitIdx) => {
                        const isVirtualUnit = unit.id === null || unit.identitySource === 'v1-paragraph-compat';
                        const prevUnit = unitIdx > 0 ? card.units[unitIdx - 1] : null;
                        const nextUnit = card.units[unitIdx + 1] || null;
                        const isConsecutiveSameSpeaker = Boolean(
                          card.blockType === 'conversation'
                          && prevUnit
                          && (
                            (unit.speakerId && unit.speakerId === prevUnit.speakerId)
                            || (!unit.speakerId && !prevUnit.speakerId && clean(unit.speakerLabel) && clean(unit.speakerLabel) === clean(prevUnit.speakerLabel))
                          )
                        );
                        const canMergeWithNextTurn = card.blockType === 'paragraph'
                          ? Boolean(nextUnit && nextUnit.id)
                          : Boolean(nextUnit && nextUnit.id && canMergeTurnsPair(
                            { speakerId: unit.speakerId, speaker: unit.speakerLabel },
                            { speakerId: nextUnit.speakerId, speaker: nextUnit.speakerLabel }
                          ));

                        const isUnitSelected = Boolean(unit.id && selection.unitId === unit.id);
                        const isEditingUnit = Boolean(unit.id && editingUnitId === unit.id);
                        const rawUnit = (rawBlock.units || []).find(u => u.id === unit.id) || unit;
                        const unitOpaqueMeta = listPreservedMetadataEntries(rawUnit?.metadata, { exclude: ['note'] });

                        const unitSpkKey = unit.id ? { workspaceId: doc.id, entityId: unit.id, field: 'speakerChoice' } : null;
                        const unitCustomKey = unit.id ? { workspaceId: doc.id, entityId: unit.id, field: 'customSpeaker' } : null;
                        const unitNoteKey = unit.id ? { workspaceId: doc.id, entityId: unit.id, field: 'note' } : null;
                        const initialUnitChoice = unit.speakerId && speakers.some(s => s.id === unit.speakerId)
                          ? unit.speakerId
                          : unit.speakerLabel ? '__custom__' : '__none__';
                        const draftUnitSpk = unitSpkKey ? (getDraft(unitSpkKey) ?? initialUnitChoice) : '__none__';
                        const draftUnitCustom = unitCustomKey ? (getDraft(unitCustomKey) ?? (initialUnitChoice === '__custom__' ? (unit.speakerLabel || '') : '')) : '';
                        const draftUnitNote = unitNoteKey ? (getDraft(unitNoteKey) ?? (typeof rawUnit?.metadata?.note === 'string' ? rawUnit.metadata.note : '')) : '';

                        const handleSaveUnit = async event => {
                          event.preventDefault();
                          if (!unit.id) return;
                          const payload = {
                            id: unit.id,
                            metadata: buildReplacedMetadataWithNote(rawUnit?.metadata, draftUnitNote)
                          };
                          if (unit.kind === 'turn') {
                            if (draftUnitSpk === '__none__') {
                              if (unit.speakerId || unit.speakerLabel) payload.resetSpeaker = true;
                            } else if (draftUnitSpk === '__custom__') {
                              payload.speaker = clean(draftUnitCustom);
                            } else if (draftUnitSpk !== unit.speakerId) {
                              payload.speakerId = draftUnitSpk;
                            }
                          }
                          const res = await onDispatch({ type: 'contentUnit.update', payload });
                          if (res?.ok) {
                            clearDraft(unitSpkKey);
                            clearDraft(unitCustomKey);
                            clearDraft(unitNoteKey);
                            setEditingUnitId(null);
                          }
                        };

                        const handleReorderUnit = async direction => {
                          if (!unit.id) return;
                          const orderedIds = swapArrayIds(unitOrderIds, unit.id, direction);
                          if (!orderedIds) return;
                          await onDispatch({ type: 'contentUnit.reorder', payload: { blockId: card.id, orderedIds } });
                        };

                        // Add Sentence to Unit or v1 Card (v1 uses card.id as draft owner entity!)
                        const addSegOwnerId = unit.id || card.id;
                        const newSegTextKey = { workspaceId: doc.id, entityId: addSegOwnerId, field: 'newSegText' };
                        const newSegMeanKey = { workspaceId: doc.id, entityId: addSegOwnerId, field: 'newSegMeaning' };
                        const newSegJoinKey = { workspaceId: doc.id, entityId: addSegOwnerId, field: 'newSegJoinAfter' };
                        const newSegNoteKey = { workspaceId: doc.id, entityId: addSegOwnerId, field: 'newSegNote' };

                        const addSegText = getDraft(newSegTextKey) ?? '';
                        const addSegMean = getDraft(newSegMeanKey) ?? '';
                        const addSegJoin = getDraft(newSegJoinKey) ?? 'space';
                        const addSegNote = getDraft(newSegNoteKey) ?? '';

                        const handleAddSentence = async event => {
                          event.preventDefault();
                          const payload = {
                            blockId: card.id,
                            ...(isVirtualUnit ? {} : { unitId: unit.id }),
                            text: clean(addSegText),
                            meaning: String(addSegMean ?? '').trim(),
                            joinAfter: addSegJoin,
                            ...(clean(addSegNote) ? { metadata: { note: clean(addSegNote) } } : {})
                          };
                          const res = await onDispatch({ type: 'segment.create', payload });
                          if (res?.ok) {
                            [newSegTextKey, newSegMeanKey, newSegJoinKey, newSegNoteKey].forEach(clearDraft);
                          }
                        };

                        return (
                          <div
                            key={unit.id || unit.viewKey}
                            data-dm-unit-id={unit.id || undefined}
                            data-dm-virtual-unit={isVirtualUnit ? unit.viewKey : undefined}
                            data-dm-unit-kind={unit.kind}
                            className={`rounded-xl border p-3 space-y-2.5 ${
                              isUnitSelected
                                ? 'border-sky-500 bg-sky-50/40 dark:bg-sky-950/25 ring-1 ring-sky-500/20'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80'
                            }`}
                          >
                            {/* Unit Header */}
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                                    {unit.kind === 'turn' ? `Speaker Turn #${unitIdx + 1}` : `Section #${unitIdx + 1}`}
                                  </span>
                                  {isVirtualUnit ? (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                                      VIRTUAL V1 · id: null · uid: null · {unit.viewKey}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      {unit.id} · {unit.uid}
                                    </span>
                                  )}
                                  {unit.kind === 'turn' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200">
                                      <User className="w-3 h-3" aria-hidden="true" />
                                      {unit.speakerLabel || 'Unassigned speaker'}
                                      {unit.speakerId ? ` (${unit.speakerId})` : ''}
                                    </span>
                                  )}
                                  {isConsecutiveSameSpeaker && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      Consecutive distinct Turn
                                    </span>
                                  )}
                                  {unit.segments.length === 0 && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                                      EMPTY UNIT
                                    </span>
                                  )}
                                </div>
                                {unitOpaqueMeta.length > 0 && (
                                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                    Preserved meta: {unitOpaqueMeta.map(m => `${m.key}=${m.summary}`).join(' · ')}
                                  </p>
                                )}
                              </div>

                              {/* Unit Buttons (Disabled for Virtual v1 Section) */}
                              <div className="flex flex-wrap items-center gap-1 shrink-0">
                                {!isVirtualUnit && (
                                  <button
                                    type="button"
                                    data-dm-select-unit={unit.id}
                                    onClick={() => onNavigate({ workspaceId: doc.id, cardId: card.id, unitId: unit.id })}
                                    className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
                                  >
                                    <Crosshair className="w-3 h-3" aria-hidden="true" />
                                    Focus
                                  </button>
                                )}
                                <button
                                  type="button"
                                  data-dm-unit-up={unit.id || unit.viewKey}
                                  disabled={isPending || isVirtualUnit || !canReorderUnit || unitIdx === 0}
                                  onClick={() => handleReorderUnit(-1)}
                                  title={isVirtualUnit ? explainReason('PERSISTENT_UNITS_REQUIRED') : canReorderUnit ? 'Move Unit up' : explainReason(capabilities?.['contentUnit.reorder']?.reason)}
                                  aria-label={`Move unit ${unit.id || unit.viewKey} up`}
                                  className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
                                >
                                  <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  data-dm-unit-down={unit.id || unit.viewKey}
                                  disabled={isPending || isVirtualUnit || !canReorderUnit || unitIdx === card.units.length - 1}
                                  onClick={() => handleReorderUnit(1)}
                                  title={isVirtualUnit ? explainReason('PERSISTENT_UNITS_REQUIRED') : canReorderUnit ? 'Move Unit down' : explainReason(capabilities?.['contentUnit.reorder']?.reason)}
                                  aria-label={`Move unit ${unit.id || unit.viewKey} down`}
                                  className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
                                >
                                  <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  data-dm-unit-edit-toggle={unit.id || unit.viewKey}
                                  disabled={isPending || isVirtualUnit || !canUpdateUnit}
                                  onClick={() => setEditingUnitId(v => v === unit.id ? null : unit.id)}
                                  title={isVirtualUnit ? explainReason('PERSISTENT_UNITS_REQUIRED') : canUpdateUnit ? 'Edit Unit' : explainReason(capabilities?.['contentUnit.update']?.reason)}
                                  className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
                                >
                                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                  Edit Unit
                                </button>
                                {nextUnit && (
                                  <button
                                    type="button"
                                    data-dm-unit-merge-next={unit.id || unit.viewKey}
                                    disabled={isPending || isVirtualUnit || !canMergeUnit || !canMergeWithNextTurn}
                                    onClick={() => onDispatch({ type: 'contentUnit.merge', payload: { ids: [unit.id, nextUnit.id] } })}
                                    title={
                                      isVirtualUnit
                                        ? explainReason('PERSISTENT_UNITS_REQUIRED')
                                        : !canMergeWithNextTurn
                                          ? 'Native merge requires adjacent Turns with identical speaker'
                                          : 'Merge with next Unit'
                                    }
                                    className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300`}
                                  >
                                    <GitMerge className="w-3.5 h-3.5" aria-hidden="true" />
                                    Merge Next
                                  </button>
                                )}
                                <button
                                  type="button"
                                  data-dm-unit-delete={unit.id || unit.viewKey}
                                  disabled={isPending || isVirtualUnit || !canDeleteUnit}
                                  onClick={() => onDispatch({ type: 'contentUnit.delete', payload: { id: unit.id } })}
                                  title={isVirtualUnit ? explainReason('PERSISTENT_UNITS_REQUIRED') : canDeleteUnit ? 'Delete Unit' : explainReason(capabilities?.['contentUnit.delete']?.reason)}
                                  className={`${DM_SMALL_BTN} border-red-200 dark:border-red-900 text-red-700 dark:text-red-300`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  Delete Unit
                                </button>
                              </div>
                            </div>

                            {/* Edit Persistent Unit Form */}
                            {isEditingUnit && unit.id && (
                              <form
                                onSubmit={handleSaveUnit}
                                data-dm-unit-edit-form={unit.id}
                                className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-2.5 space-y-2"
                              >
                                {unit.kind === 'turn' ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <select
                                      aria-label={`Unit speaker ${unit.id}`}
                                      value={draftUnitSpk}
                                      onChange={e => setDraft(unitSpkKey, e.target.value)}
                                      disabled={isPending}
                                      className={DM_INPUT_CLASS}
                                    >
                                      <option value="__none__">Unassigned (Reset speaker)</option>
                                      {speakers.map(s => (
                                        <option key={s.id} value={s.id}>{s.label} ({s.id})</option>
                                      ))}
                                      <option value="__custom__">+ Custom Speaker Label...</option>
                                    </select>
                                    {draftUnitSpk === '__custom__' && (
                                      <input
                                        aria-label={`Custom unit speaker ${unit.id}`}
                                        value={draftUnitCustom}
                                        onChange={e => setDraft(unitCustomKey, e.target.value)}
                                        disabled={isPending}
                                        placeholder="Speaker label"
                                        className={DM_INPUT_CLASS}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                    Paragraph Section (speakers disabled on Sections).
                                  </p>
                                )}
                                <input
                                  aria-label={`Unit note ${unit.id}`}
                                  value={draftUnitNote}
                                  onChange={e => setDraft(unitNoteKey, e.target.value)}
                                  disabled={isPending}
                                  placeholder="Unit metadata.note"
                                  className={DM_INPUT_CLASS}
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button type="button" onClick={() => setEditingUnitId(null)} className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}>
                                    Cancel
                                  </button>
                                  <button type="submit" disabled={isPending} data-dm-unit-save={unit.id} className={`${DM_SMALL_BTN} border-sky-600 bg-sky-600 text-white`}>
                                    Save Unit
                                  </button>
                                </div>
                              </form>
                            )}

                            {/* Sentences inside Unit */}
                            {unit.segments.length === 0 ? (
                              <div
                                data-dm-empty-unit={unit.id || unit.viewKey}
                                className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 text-center text-xs text-slate-500 dark:text-slate-400"
                              >
                                <MessageSquare className="w-4 h-4 mx-auto mb-1 text-slate-400" aria-hidden="true" />
                                Intentionally empty {unit.kind === 'turn' ? 'Speaker Turn' : 'Section'} preserved.
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {unit.segments.map((seg, segIdx) => (
                                  <DataManagementSegmentRow
                                    key={seg.id}
                                    workspaceId={doc.id}
                                    schemaVersion={schemaVersion}
                                    card={card}
                                    unit={unit}
                                    seg={seg}
                                    rawSeg={rawSegById.get(seg.id)}
                                    segIndex={segIdx}
                                    siblings={unit.segments}
                                    nextSeg={unit.segments[segIdx + 1] || null}
                                    isSelected={selection.segmentId === seg.id}
                                    canContent={canContent}
                                    capabilities={capabilities}
                                    isPending={isPending}
                                    onNavigate={onNavigate}
                                    onDispatch={onDispatch}
                                    getDraft={getDraft}
                                    setDraft={setDraft}
                                    clearDraft={clearDraft}
                                    compact={compact}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Add Sentence Form */}
                            <form
                              onSubmit={handleAddSentence}
                              data-dm-add-sentence-form={addSegOwnerId}
                              className="rounded-lg border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/25 dark:bg-indigo-950/15 p-2.5 space-y-2"
                            >
                              <p className="text-[11px] font-black text-indigo-800 dark:text-indigo-200">
                                Add Sentence to {isVirtualUnit ? `Card ${card.id} (v1 omits unitId)` : unit.id}
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <input
                                  aria-label={`Add Sentence text ${addSegOwnerId}`}
                                  value={addSegText}
                                  onChange={e => setDraft(newSegTextKey, e.target.value)}
                                  disabled={isPending || !canCreateSeg}
                                  placeholder="New Sentence EN text"
                                  className={DM_INPUT_CLASS}
                                />
                                <input
                                  aria-label={`Add Sentence meaning ${addSegOwnerId}`}
                                  value={addSegMean}
                                  onChange={e => setDraft(newSegMeanKey, e.target.value)}
                                  disabled={isPending || !canCreateSeg}
                                  placeholder="Meaning / translation (optional)"
                                  className={DM_INPUT_CLASS}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  aria-label={`Add Sentence joinAfter ${addSegOwnerId}`}
                                  value={addSegJoin}
                                  onChange={e => setDraft(newSegJoinKey, e.target.value)}
                                  disabled={isPending || !canCreateSeg}
                                  className={`${DM_INPUT_CLASS} w-auto min-w-28`}
                                >
                                  <option value="space">space</option>
                                  <option value="line">line</option>
                                  <option value="paragraph">paragraph</option>
                                  <option value="none">none</option>
                                </select>
                                <input
                                  aria-label={`Add Sentence note ${addSegOwnerId}`}
                                  value={addSegNote}
                                  onChange={e => setDraft(newSegNoteKey, e.target.value)}
                                  disabled={isPending || !canCreateSeg}
                                  placeholder="Optional metadata.note"
                                  className={`${DM_INPUT_CLASS} flex-1 min-w-36`}
                                />
                                <button
                                  type="submit"
                                  data-dm-add-sentence-submit={addSegOwnerId}
                                  disabled={isPending || !canCreateSeg || !clean(addSegText)}
                                  title={canCreateSeg ? 'Add Sentence' : explainReason(capabilities?.['segment.create']?.reason)}
                                  className={`${DM_SMALL_BTN} border-indigo-600 bg-indigo-600 text-white`}
                                >
                                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                  Add Sentence
                                </button>
                              </div>
                            </form>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
