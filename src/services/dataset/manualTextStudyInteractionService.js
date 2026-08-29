import { createEmptyManualForm, parseTableRecords } from '../../utils/csvUtils';
import { resolveManualAddForm, resolveManualAddNextNo, resolveManualEditAdvancedOpen, resolveManualEditForm } from '../../domain/dataset/manualEditorStateDomain';

export const executeOpenManualAdd = ({
  tableContent, sequenceHighWater, manualIdHighWater, setManualEditingId,
  setManualAdvancedOpen, setManualForm, setIsManualEditorOpen
}) => {
      const records = parseTableRecords(tableContent);
      const nextNo = resolveManualAddNextNo(records, sequenceHighWater);
      setManualEditingId(null);
      setManualAdvancedOpen(false);
      setManualForm(resolveManualAddForm(records, manualIdHighWater, nextNo));
      setIsManualEditorOpen(true);
};

export const executeOpenManualEdit = ({
  item, setManualEditingId, setManualAdvancedOpen, setManualForm, setIsManualEditorOpen
}) => {
      if (!item?.isStructured) return;
      setManualEditingId(item.id);
      setManualAdvancedOpen(resolveManualEditAdvancedOpen(item));
      setManualForm(resolveManualEditForm(item));
      setIsManualEditorOpen(true);
};

export const executeCloseManualEditor = ({
  setIsManualEditorOpen, setManualEditingId, setManualAdvancedOpen, setManualForm
}) => {
      setIsManualEditorOpen(false);
      setManualEditingId(null);
      setManualAdvancedOpen(false);
      setManualForm(createEmptyManualForm());
};

export const executeDeleteStructuredItemPrompt = ({ item, setPendingDeleteItem }) => {
      if (!item?.isStructured) return;
      setPendingDeleteItem(item);
};

export const executeInsertTab = ({ mode, setTableContent, setTextContent, textareaRef }) => {
    if (mode === 'table') {
        setTableContent(prev => prev + "\t");
    } else {
        setTextContent(prev => prev + "\t");
    }
    if(textareaRef.current) {
        textareaRef.current.focus();
    }
};

export const executeAddTextItem = ({
  newTextItem, textContent, setTextContent, setNewTextItem, newItemTextareaRef, addLog
}) => {
      if (!newTextItem.trim()) return;
      const newContent = textContent ? textContent + "\n" + newTextItem : newTextItem;
      setTextContent(newContent);
      setNewTextItem("");
      if (newItemTextareaRef.current) {
          newItemTextareaRef.current.style.height = 'auto'; 
      }
      addLog("Action", "Text added.");
};

export const executeDeleteTextItem = ({
  indexToDelete, playlist, setTextContent, addLog, currentIndex, forceStopAll
}) => {
      const targetItem = playlist[indexToDelete];
      const newLines = playlist
          .filter((_, idx) => idx !== indexToDelete)
          .map(item => item.text);
      
      setTextContent(newLines.join('\n'));
      addLog("Action", `Item #${indexToDelete + 1} deleted.`);
      if (targetItem && currentIndex === targetItem.id) forceStopAll();
};

export const executeToggleStudyItem = ({ id, setStudyQueue }) => {
      setStudyQueue(prev => {
          if (prev.includes(id)) {
              return prev.filter(x => x !== id);
          } else {
              return [...prev, id];
          }
      });
};

export const executeClearStudyQueue = ({ setStudyQueue, addLog }) => {
      setStudyQueue([]);
      addLog("Study", "Queue cleared.");
};

export const executeMenuToggle = ({ rowId, setActiveMenuId }) => {
      setActiveMenuId(prev => prev === rowId ? null : rowId);
};
