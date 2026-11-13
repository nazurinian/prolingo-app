export const TEXT_LEGACY_EDITOR_MODEL = 'legacy-line-v1';
export const TEXT_STRUCTURED_EDITOR_MODEL = 'structured-v1';

/**
 * Returns true only when Text mode is active with an explicit Legacy editor document.
 */
export const isLegacyTextMode = (mode, activeTextEditorModel = null) => (
  mode === 'text' && activeTextEditorModel === TEXT_LEGACY_EDITOR_MODEL
);

/**
 * Returns true only when Text mode is active with an explicit Structured Text document.
 */
export const isStructuredTextMode = (mode, activeTextEditorModel = null) => (
  mode === 'text' && activeTextEditorModel === TEXT_STRUCTURED_EDITOR_MODEL
);

/**
 * Legacy Audio Folder picking, scanning, and persisted handle restoration are
 * allowed only for Table mode and explicit Legacy Text (`legacy-line-v1`).
 * Structured Text and unhydrated Text states fail closed.
 */
export const isLegacyAudioFolderSupported = ({ mode, activeTextEditorModel = null } = {}) => {
  if (mode === 'table') return true;
  return isLegacyTextMode(mode, activeTextEditorModel);
};

/**
 * Resolves whether Legacy/Table Audio Folder controls have an active folder
 * without conflating Structured Text Staging/ZIP counts.
 */
export const hasActiveLegacyAudioFolder = ({
  mode,
  activeTextEditorModel = null,
  tableAudioFolderActive = false,
  legacyTextAudioCount = 0
} = {}) => {
  if (mode === 'table') return Boolean(tableAudioFolderActive);
  if (!isLegacyTextMode(mode, activeTextEditorModel)) return false;
  return Number(legacyTextAudioCount) > 0;
};

/**
 * Resolves which Batch Popup surface is valid for the current mode.
 * Legacy Text and unhydrated Text states fail closed (`'none'`).
 */
export const resolveBatchPopupTarget = ({
  mode,
  activeTextEditorModel = null,
  hasStructuredTextBatch = false
} = {}) => {
  if (mode === 'table') return 'table';
  if (isStructuredTextMode(mode, activeTextEditorModel) && hasStructuredTextBatch) {
    return 'structured-text';
  }
  return 'none';
};

/**
 * Returns true only when the active mode supports opening a Batch / Bulk Audio popup.
 */
export const isBatchPopupAllowed = ({ mode, activeTextEditorModel = null } = {}) => {
  if (mode === 'table') return true;
  return isStructuredTextMode(mode, activeTextEditorModel);
};

/**
 * Builds a scope key identifying the active Batch popup owner so transitions across
 * Table <-> Legacy Text <-> Structured Text or Text documents close stale popup state.
 */
export const getBatchScopeKey = ({
  mode,
  activeTextEditorModel = null,
  activeTextDocumentId = ''
} = {}) => {
  if (mode === 'table') return 'table';
  if (mode === 'text') return `text:${activeTextEditorModel || 'unknown'}:${activeTextDocumentId || ''}`;
  return String(mode || 'unknown');
};
