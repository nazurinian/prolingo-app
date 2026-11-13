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

/**
 * Resolves the next open state for a guarded Batch popup toggle/setter, supporting
 * both direct boolean values and functional updaters while failing closed outside
 * Table and Structured Text (`structured-v1`).
 */
export const resolveGuardedBatchOpenValue = ({
  nextValue,
  prevOpen = false,
  mode,
  activeTextEditorModel = null
} = {}) => {
  if (!isBatchPopupAllowed({ mode, activeTextEditorModel })) return false;
  return Boolean(typeof nextValue === 'function' ? nextValue(Boolean(prevOpen)) : nextValue);
};

/**
 * Returns true when live scope still matches the expected Legacy/Table Audio Folder
 * scope captured when an async operation began.
 */
export const isMatchingAudioFolderScope = (liveScope, expectedMode, expectedEditorModel = null) => {
  if (!liveScope || liveScope.mode !== expectedMode) return false;
  if (expectedMode === 'text' && liveScope.activeTextEditorModel !== expectedEditorModel) return false;
  return isLegacyAudioFolderSupported(liveScope);
};

/**
 * Table Gemini/Edge generator controls and credentials belong exclusively to Table mode.
 * Structured Text stays Edge-only inside Text -> Audio -> Generate Audio.
 */
export const isTableGeneratorSystemSupported = ({ mode } = {}) => mode === 'table';

/**
 * Table storage/cache/mastery/study-tracking/backup controls belong exclusively to Table mode.
 */
export const isTableStorageSystemSupported = ({ mode } = {}) => mode === 'table';

/**
 * Builds an accurate, mode-aware explanation of Text System audio and storage ownership
 * without exposing Table generator controls, Table metrics, or unbuilt storage managers.
 */
export const getTextSystemBoundarySummary = ({
  mode,
  activeTextEditorModel = null
} = {}) => {
  if (mode !== 'text') return null;
  if (activeTextEditorModel === 'structured-v1') {
    return {
      variant: 'structured',
      audioTitle: 'Text Audio Architecture',
      audioBadge: 'Edge-Only',
      audioSummary:
        'Structured Text uses Edge-only cloud generation alongside Browser TTS.',
      audioDetail:
        'Configure Edge defaults and connection checks in Text → Audio → Generate Audio, per-card/speaker overrides in Card Audio or Bulk Audio, and offline packs in Audio Library (Staging & Portable ZIP).',
      storageTitle: 'Text Data & Storage',
      storageSummary:
        'Structured workbooks, blocks, segments, and staged audio are stored separately under Text Library IndexedDB.',
      storageDetail:
        'Manage Collections, documents, workspace creation, and document actions in Text → Data.'
    };
  }
  if (activeTextEditorModel === 'legacy-line-v1') {
    return {
      variant: 'legacy',
      audioTitle: 'Legacy Text Audio',
      audioBadge: 'Legacy Folder + TTS',
      audioSummary:
        'Legacy Text documents (legacy-line-v1) use Browser TTS and optional local Legacy Audio Folder files loaded below.',
      audioDetail:
        'Structured Text Edge generation applies only to Structured workbooks in Text → Audio → Generate Audio.',
      storageTitle: 'Text Data & Storage',
      storageSummary:
        'Legacy Text documents are stored separately under Text Library IndexedDB.',
      storageDetail:
        'Manage Collections and documents in Text → Data.'
    };
  }
  return {
    variant: 'pending',
    audioTitle: 'Text Audio Architecture',
    audioBadge: 'Loading',
    audioSummary:
      'Loading active Text document model.',
    audioDetail:
      'Structured Text configures Edge-only generation in Text → Audio → Generate Audio, while Legacy Text documents use Legacy Audio Folder.',
    storageTitle: 'Text Data & Storage',
    storageSummary:
      'Text documents and workspaces are stored separately under Text Library IndexedDB.',
    storageDetail:
      'Manage Collections, documents, and workspace actions in Text → Data.'
  };
};
