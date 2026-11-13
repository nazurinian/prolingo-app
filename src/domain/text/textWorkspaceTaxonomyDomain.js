import {
  TEXT_LEGACY_EDITOR_MODEL,
  TEXT_STRUCTURED_EDITOR_MODEL
} from '../../constants/textDatabaseConstants.js';

export const TEXT_WORKSPACE_TYPES = Object.freeze({
  LEGACY: 'legacy',
  PARAGRAPH: 'paragraph',
  CONVERSATION: 'conversation',
  MIXED: 'mixed'
});

const TEXT_WORKSPACE_DISPLAY_META = Object.freeze({
  [TEXT_WORKSPACE_TYPES.LEGACY]: Object.freeze({
    key: TEXT_WORKSPACE_TYPES.LEGACY,
    label: 'Legacy',
    badge: 'LEGACY'
  }),
  [TEXT_WORKSPACE_TYPES.PARAGRAPH]: Object.freeze({
    key: TEXT_WORKSPACE_TYPES.PARAGRAPH,
    label: 'Paragraph',
    badge: 'PARAGRAPH'
  }),
  [TEXT_WORKSPACE_TYPES.CONVERSATION]: Object.freeze({
    key: TEXT_WORKSPACE_TYPES.CONVERSATION,
    label: 'Conversation',
    badge: 'CONVERSATION'
  }),
  [TEXT_WORKSPACE_TYPES.MIXED]: Object.freeze({
    key: TEXT_WORKSPACE_TYPES.MIXED,
    label: 'Mixed',
    badge: 'MIXED'
  })
});

export const TEXT_LIBRARY_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ key: 'all', label: 'All' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.LEGACY, label: 'Legacy' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.PARAGRAPH, label: 'Paragraph' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.CONVERSATION, label: 'Conversation' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.MIXED, label: 'Mixed' })
]);

export const TEXT_WORKSPACE_CREATE_OPTIONS = Object.freeze([
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.LEGACY, label: 'Legacy' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.PARAGRAPH, label: 'Paragraph' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.CONVERSATION, label: 'Conversation' }),
  Object.freeze({ key: TEXT_WORKSPACE_TYPES.MIXED, label: 'Mixed' })
]);

/**
 * Classifies a Text workspace into one of the four canonical workspace types:
 * Legacy, Paragraph, Conversation, or Mixed (returns null when unclassified/unhydrated).
 * Legacy (`editorModel === 'legacy-line-v1'`) always takes precedence, and
 * Mixed (`editorModel === 'structured-v1' && documentType === 'mixed'`) is kept
 * strictly distinct from Conversation.
 */
export const resolveTextWorkspaceType = (document = null, fallbackEditorModel = null) => {
  const editorModel = document?.editorModel ?? fallbackEditorModel ?? null;
  const documentType = document?.documentType ?? null;

  if (editorModel === TEXT_LEGACY_EDITOR_MODEL) {
    return TEXT_WORKSPACE_TYPES.LEGACY;
  }

  if (editorModel === TEXT_STRUCTURED_EDITOR_MODEL) {
    if (documentType === 'mixed') return TEXT_WORKSPACE_TYPES.MIXED;
    if (documentType === 'conversation') return TEXT_WORKSPACE_TYPES.CONVERSATION;
    if (documentType === 'paragraph') return TEXT_WORKSPACE_TYPES.PARAGRAPH;
    return null;
  }

  return null;
};

/**
 * Returns normalized display metadata (`key`, `label`, `badge`) for a Text workspace.
 */
export const getTextWorkspaceDisplay = (document = null, fallbackEditorModel = null) => {
  const key = resolveTextWorkspaceType(document, fallbackEditorModel);
  if (key && TEXT_WORKSPACE_DISPLAY_META[key]) {
    return TEXT_WORKSPACE_DISPLAY_META[key];
  }
  return {
    key: null,
    label: 'Text',
    badge: 'TEXT'
  };
};

export const getTextWorkspaceLabel = (document = null, fallbackEditorModel = null) => (
  getTextWorkspaceDisplay(document, fallbackEditorModel).label
);

export const getTextWorkspaceBadge = (document = null, fallbackEditorModel = null) => (
  getTextWorkspaceDisplay(document, fallbackEditorModel).badge
);

/**
 * Resolves the active classification descriptor used by Text Library filter empty states.
 */
export const getTextWorkspaceFilterEmptyLabel = (filterKey = 'all') => {
  if (!filterKey || filterKey === 'all') return 'Text';
  return TEXT_WORKSPACE_DISPLAY_META[filterKey]?.label || 'Text';
};
