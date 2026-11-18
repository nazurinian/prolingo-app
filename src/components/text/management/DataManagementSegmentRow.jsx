import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Crosshair,
  GitMerge,
  RotateCcw,
  Save,
  Scissors,
  Split,
  Trash2
} from 'lucide-react';
import ConversationSentenceSplitPanel from '../conversation/ConversationSentenceSplitPanel.jsx';
import {
  buildReplacedMetadataWithNote,
  listPreservedMetadataEntries,
  swapArrayIds
} from '../conversation/conversationEditorErrorUtils.js';
import { DM_INPUT_CLASS, DM_SMALL_BTN, explainReason } from './dataManagementUiUtils.js';

const clean = value => String(value ?? '').trim();

/**
 * Renders one persistent Sentence Segment with session-backed drafts and native segment commands.
 */
export default function DataManagementSegmentRow({
  workspaceId,
  schemaVersion,
  card,
  unit,
  seg,
  rawSeg,
  segIndex,
  siblings,
  nextSeg,
  isSelected,
  canContent,
  capabilities,
  isPending,
  onNavigate,
  onDispatch,
  getDraft,
  setDraft,
  clearDraft,
  compact = false
}) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const isV1Virtual = schemaVersion === 1 || unit.id === null;
  const effectiveSeg = rawSeg || seg;

  const textKey = { workspaceId, entityId: seg.id, field: 'text' };
  const meaningKey = { workspaceId, entityId: seg.id, field: 'meaning' };
  const joinKey = { workspaceId, entityId: seg.id, field: 'joinAfter' };
  const noteKey = { workspaceId, entityId: seg.id, field: 'note' };

  const draftText = getDraft(textKey) ?? seg.text ?? '';
  const draftMeaning = getDraft(meaningKey) ?? seg.meaning ?? '';
  const draftJoinAfter = getDraft(joinKey) ?? seg.joinAfter ?? 'space';
  const draftNote = getDraft(noteKey) ?? (typeof effectiveSeg?.metadata?.note === 'string' ? effectiveSeg.metadata.note : '');

  const hasDirtyDraft = (
    getDraft(textKey) !== undefined
    || getDraft(meaningKey) !== undefined
    || getDraft(joinKey) !== undefined
    || getDraft(noteKey) !== undefined
  );

  const otherUnits = (card.units || []).filter(u => u.id && u.id !== unit.id);
  const moveTargetKey = { workspaceId, entityId: seg.id, field: 'moveTargetUnitId' };
  const moveTargetId = getDraft(moveTargetKey) ?? (otherUnits[0]?.id || '');

  const opaqueMeta = listPreservedMetadataEntries(effectiveSeg?.metadata, { exclude: ['note'] });
  const unitLabel = card.blockType === 'paragraph' ? 'Section' : 'Turn';
  const reorderCmd = isV1Virtual ? 'segment.reorder' : 'contentUnit.reorderSegments';
  const splitCmd = card.blockType === 'paragraph' ? 'paragraphSegment.split' : 'conversationSegment.split';
  const mergeCmd = card.blockType === 'paragraph' ? 'paragraphSegments.merge' : 'conversationSegments.merge';

  const canUpdate = Boolean(capabilities?.['segment.update']?.enabled);
  const canReorder = Boolean(capabilities?.[reorderCmd]?.enabled);
  const canSplitSeg = Boolean(capabilities?.[splitCmd]?.enabled);
  const canMergeSeg = Boolean(capabilities?.[mergeCmd]?.enabled);
  const canDeleteSeg = Boolean(capabilities?.['segment.delete']?.enabled);
  const canMoveSeg = Boolean(capabilities?.['segment.move']?.enabled && !isV1Virtual && otherUnits.length > 0);
  const canSplitUnit = Boolean(capabilities?.['contentUnit.split']?.enabled && !isV1Virtual && segIndex > 0);

  const handleSave = async event => {
    event.preventDefault();
    const res = await onDispatch({
      type: 'segment.update',
      payload: {
        id: seg.id,
        text: draftText,
        meaning: draftMeaning,
        joinAfter: draftJoinAfter,
        metadata: buildReplacedMetadataWithNote(effectiveSeg?.metadata, draftNote)
      }
    });
    if (res?.ok) {
      clearDraft(textKey);
      clearDraft(meaningKey);
      clearDraft(joinKey);
      clearDraft(noteKey);
    }
  };

  const handleReorder = async direction => {
    const orderedIds = swapArrayIds(siblings.map(s => s.id), seg.id, direction);
    if (!orderedIds) return;
    if (isV1Virtual) {
      await onDispatch({ type: 'segment.reorder', payload: { blockId: card.id, orderedIds } });
    } else {
      await onDispatch({ type: 'contentUnit.reorderSegments', payload: { id: unit.id, orderedIds } });
    }
  };

  const handleMove = async event => {
    event.preventDefault();
    if (!moveTargetId) return;
    const res = await onDispatch({
      type: 'segment.move',
      payload: { segmentId: seg.id, targetUnitId: moveTargetId }
    });
    if (res?.ok) {
      clearDraft(moveTargetKey);
      setMoveOpen(false);
    }
  };

  return (
    <div
      data-dm-segment-id={seg.id}
      className={`rounded-xl border p-3 space-y-2.5 ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/25 ring-1 ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">
              Sentence #{segIndex + 1} (order {effectiveSeg?.order ?? seg.order ?? segIndex})
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 break-all max-w-full">
              {seg.id}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all max-w-full">
              {seg.uid}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              joinAfter: {seg.joinAfter || 'space'}
            </span>
            {(effectiveSeg?.audioVariants?.length || 0) > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300">
                {effectiveSeg.audioVariants.length} AudioVariant meta
              </span>
            )}
            {hasDirtyDraft && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                Draft Modified
              </span>
            )}
          </div>
          {opaqueMeta.length > 0 && (
            <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all">
              Preserved meta: {opaqueMeta.map(m => `${m.key}=${m.summary}`).join(' · ')}
            </p>
          )}
        </div>

        <button
          type="button"
          data-dm-select-segment={seg.id}
          onClick={() => onNavigate({ workspaceId, segmentId: seg.id })}
          className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
        >
          <Crosshair className="w-3 h-3" aria-hidden="true" />
          Focus Context
        </button>
      </div>

      {/* Inline Session-Draft Form */}
      <form onSubmit={handleSave} data-dm-segment-edit-form={seg.id} className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <span>Text (EN)</span>
            <textarea
              aria-label={`Sentence text ${seg.id}`}
              value={draftText}
              onChange={e => setDraft(textKey, e.target.value)}
              rows={2}
              disabled={isPending || !canUpdate}
              className={`${DM_INPUT_CLASS} resize-y`}
            />
          </label>
          <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <span>Meaning / Translation (ID)</span>
            <textarea
              aria-label={`Sentence meaning ${seg.id}`}
              value={draftMeaning}
              onChange={e => setDraft(meaningKey, e.target.value)}
              rows={2}
              disabled={isPending || !canUpdate}
              placeholder="(Optional meaning)"
              className={`${DM_INPUT_CLASS} border-amber-300 dark:border-amber-900/80 resize-y`}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <span>joinAfter</span>
            <select
              aria-label={`Sentence joinAfter ${seg.id}`}
              value={draftJoinAfter}
              onChange={e => setDraft(joinKey, e.target.value)}
              disabled={isPending || !canUpdate}
              className={DM_INPUT_CLASS}
            >
              <option value="space">space</option>
              <option value="line">line</option>
              <option value="paragraph">paragraph</option>
              <option value="none">none</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
            <span>metadata.note</span>
            <input
              aria-label={`Sentence note ${seg.id}`}
              value={draftNote}
              onChange={e => setDraft(noteKey, e.target.value)}
              disabled={isPending || !canUpdate}
              placeholder="Preserves opaque source/speaker keys"
              className={DM_INPUT_CLASS}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-dm-segment-up={seg.id}
              disabled={isPending || !canReorder || segIndex === 0}
              onClick={() => handleReorder(-1)}
              title={canReorder ? 'Move Sentence up' : explainReason(capabilities?.[reorderCmd]?.reason)}
              aria-label={`Move sentence ${seg.id} up`}
              className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
            >
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-dm-segment-down={seg.id}
              disabled={isPending || !canReorder || segIndex === siblings.length - 1}
              onClick={() => handleReorder(1)}
              title={canReorder ? 'Move Sentence down' : explainReason(capabilities?.[reorderCmd]?.reason)}
              aria-label={`Move sentence ${seg.id} down`}
              className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
            >
              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-dm-segment-split-toggle={seg.id}
              disabled={isPending || !canSplitSeg}
              onClick={() => setSplitOpen(v => !v)}
              title={canSplitSeg ? 'Open Bilingual Sentence Split' : explainReason(capabilities?.[splitCmd]?.reason)}
              className={`${DM_SMALL_BTN} border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300`}
            >
              <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
              Split Sentence
            </button>
            {nextSeg && (
              <button
                type="button"
                data-dm-segment-merge-next={seg.id}
                disabled={isPending || !canMergeSeg}
                onClick={() => onDispatch({ type: mergeCmd, payload: { ids: [seg.id, nextSeg.id] } })}
                title={canMergeSeg ? 'Merge with next Sentence' : explainReason(capabilities?.[mergeCmd]?.reason)}
                className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200`}
              >
                <GitMerge className="w-3.5 h-3.5" aria-hidden="true" />
                Merge Next
              </button>
            )}
            <button
              type="button"
              data-dm-segment-move-toggle={seg.id}
              disabled={isPending || !canMoveSeg}
              onClick={() => setMoveOpen(v => !v)}
              title={
                isV1Virtual
                  ? explainReason('PERSISTENT_UNITS_REQUIRED')
                  : otherUnits.length === 0
                    ? `Add another ${unitLabel} inside this Card to move Sentences (cross-Card moves are unsupported)`
                    : `Move to another ${unitLabel} inside this Card`
              }
              className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Move {unitLabel}
            </button>
            {!isV1Virtual && segIndex > 0 && (
              <button
                type="button"
                data-dm-unit-split-before={seg.id}
                disabled={isPending || !canSplitUnit}
                onClick={() => onDispatch({ type: 'contentUnit.split', payload: { id: unit.id, beforeSegmentId: seg.id } })}
                title={canSplitUnit ? `Split ${unitLabel} before this Sentence` : explainReason(capabilities?.['contentUnit.split']?.reason)}
                className={`${DM_SMALL_BTN} border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300`}
              >
                <Split className="w-3.5 h-3.5" aria-hidden="true" />
                Split {unitLabel} Here
              </button>
            )}
            <button
              type="button"
              data-dm-segment-delete={seg.id}
              disabled={isPending || !canDeleteSeg}
              onClick={() => onDispatch({ type: 'segment.delete', payload: { id: seg.id } })}
              title={canDeleteSeg ? `Delete Sentence (preserves empty ${unitLabel} in v2)` : explainReason(capabilities?.['segment.delete']?.reason)}
              className={`${DM_SMALL_BTN} border-red-200 dark:border-red-900 text-red-700 dark:text-red-300`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {hasDirtyDraft && (
              <button
                type="button"
                data-dm-segment-clear-draft={seg.id}
                disabled={isPending}
                onClick={() => {
                  clearDraft(textKey);
                  clearDraft(meaningKey);
                  clearDraft(joinKey);
                  clearDraft(noteKey);
                }}
                className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                Clear Draft
              </button>
            )}
            <button
              type="submit"
              data-dm-segment-save={seg.id}
              disabled={isPending || !canUpdate || !clean(draftText)}
              title={canUpdate ? 'Save Sentence update' : explainReason(capabilities?.['segment.update']?.reason)}
              className={`${DM_SMALL_BTN} border-indigo-600 bg-indigo-600 text-white`}
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              Save Sentence
            </button>
          </div>
        </div>
      </form>

      {moveOpen && canMoveSeg && (
        <form onSubmit={handleMove} data-dm-segment-move-form={seg.id} className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black text-sky-800 dark:text-sky-200">
              Move Sentence to Another {unitLabel} in Card {card.id}
            </span>
            <span className="text-[10px] text-slate-500">Cross-Card moves unsupported</span>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <label className="flex-1 min-w-0 space-y-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
              <span>Target {unitLabel}</span>
              <select
                aria-label={`Destination ${unitLabel} for ${seg.id}`}
                value={moveTargetId}
                onChange={e => setDraft(moveTargetKey, e.target.value)}
                disabled={isPending}
                className={`${DM_INPUT_CLASS} w-full sm:min-w-44`}
              >
                {otherUnits.map((target, idx) => (
                  <option key={target.id} value={target.id}>
                    {target.kind === 'turn' ? `Turn (${target.speakerLabel || 'No Speaker'})` : `Section #${idx + 1}`} · {target.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 items-end">
              <button type="submit" disabled={isPending} data-dm-segment-move-submit={seg.id} className={`${DM_SMALL_BTN} border-sky-600 bg-sky-600 text-white`}>
                Confirm Move
              </button>
              <button type="button" onClick={() => setMoveOpen(false)} className={`${DM_SMALL_BTN} border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300`}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {splitOpen && canContent && (
        <ConversationSentenceSplitPanel
          sentence={effectiveSeg}
          unitKind={card.blockType === 'paragraph' ? 'paragraph' : 'turn'}
          isBusy={isPending || !canSplitSeg}
          onCommand={onDispatch}
          onClose={() => setSplitOpen(false)}
          compact={compact}
        />
      )}
    </div>
  );
}
