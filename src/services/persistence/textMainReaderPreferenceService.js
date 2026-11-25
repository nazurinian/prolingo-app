import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  TEXT_READER_MODES,
  isTextWorkspaceStyleDirty,
  normalizeTextCardPresentationState,
  normalizeTextWorkspaceStyleOverride,
  normalizeTextWorkspaceStyleState,
  resolveEffectiveTextWorkspaceStyle,
  resolveTextReaderModeFromState,
  updateTextWorkspaceStyleState
} from '../../domain/text/textCardPresentationStateDomain.js';
import {
  TEXT_CARD_EXPANSION_MODES,
  normalizeTextCardExpansionMode
} from '../../domain/text/textStructuredCardExpansionDomain.js';

// Separate from both the historical Shared QA view preference and audio settings.
export const TEXT_MAIN_READER_PREFERENCE_KEY = 'prolingo_text_main_reader_v1';

export const TEXT_MAIN_READER_MODES = TEXT_READER_MODES;
export const DEFAULT_TEXT_MAIN_READER_MODE = 'full';
export const DEFAULT_SHARED_CARD_VISIBILITY = TEXT_CARD_EXPANSION_MODES.ALL;

export const TEXT_WORKSPACE_STYLE_SCOPES = Object.freeze({
  SHARED: 'shared',
  WORKSPACE: 'workspace'
});

export const TEXT_MAIN_READER_PERSISTENCE_REASONS = Object.freeze({
  QUOTA_EXCEEDED: 'quota-exceeded',
  STORAGE_DENIED: 'storage-denied',
  STORAGE_UNAVAILABLE: 'storage-unavailable',
  WRITE_FAILED: 'write-failed'
});

const FORBIDDEN_WORKSPACE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

let lastPersistenceStatus = Object.freeze({
  ok: true,
  persisted: false,
  reason: null,
  storageKey: null,
  error: null,
  overrideCount: 0
});

export const getLastTextMainReaderPersistenceStatus = () => lastPersistenceStatus;

export const resolveTextMainReaderPreferenceStorageKey = ({ hostId = null, storageKey = null } = {}) => {
  const cleanStorageKey = typeof storageKey === 'string' ? storageKey.trim() : '';
  if (cleanStorageKey) return cleanStorageKey;
  const cleanHostId = typeof hostId === 'string'
    ? hostId.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
    : '';
  return cleanHostId
    ? `${TEXT_MAIN_READER_PREFERENCE_KEY}__host_${cleanHostId}`
    : TEXT_MAIN_READER_PREFERENCE_KEY;
};

export const normalizeTextWorkspacePreferenceKey = workspaceKey => {
  const raw = typeof workspaceKey === 'string'
    ? workspaceKey
    : (workspaceKey && typeof workspaceKey === 'object' ? (workspaceKey.uid || workspaceKey.id || '') : '');
  const clean = typeof raw === 'string' ? raw.trim() : '';
  if (!clean || clean.length > 128 || FORBIDDEN_WORKSPACE_KEYS.has(clean)) {
    return null;
  }
  return clean;
};

const normalizeTextMainReaderMode = candidate => (
  TEXT_MAIN_READER_MODES.includes(candidate) ? candidate : DEFAULT_TEXT_MAIN_READER_MODE
);

const normalizeSharedCardVisibility = candidate => (
  Object.values(TEXT_CARD_EXPANSION_MODES).includes(candidate)
    ? normalizeTextCardExpansionMode(candidate)
    : DEFAULT_SHARED_CARD_VISIBILITY
);

const normalizeWorkspaceStyleOverridesMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return Object.freeze({});
  }
  const normalized = {};
  for (const [rawKey, rawOverride] of Object.entries(candidate)) {
    const key = normalizeTextWorkspacePreferenceKey(rawKey);
    if (!key) continue;
    const override = normalizeTextWorkspaceStyleOverride(rawOverride);
    if (Object.keys(override).length === 0) continue;
    normalized[key] = override;
  }
  return Object.freeze(normalized);
};

export const normalizeTextMainReaderPreference = candidate => {
  const isV1 = candidate?.version === 1;
  return Object.freeze({
    version: 1,
    reader: isV1 && candidate.reader === 'shared' ? 'shared' : 'legacy',
    readerMode: normalizeTextMainReaderMode(isV1 ? candidate.readerMode : null),
    cardVisibility: normalizeSharedCardVisibility(isV1 ? candidate.cardVisibility : null),
    view: normalizeTextCardPresentationState(isV1 ? candidate.view : null),
    workspaceStyle: normalizeTextWorkspaceStyleState(isV1 ? candidate.workspaceStyle : null),
    workspaceStyleOverrides: normalizeWorkspaceStyleOverridesMap(isV1 ? candidate.workspaceStyleOverrides : null)
  });
};

export const resolveTextMainReaderMode = preference => {
  const normalized = normalizeTextMainReaderPreference(preference);
  return resolveTextReaderModeFromState({
    readerMode: normalized.readerMode,
    view: normalized.view,
    supportsFourModes: true
  });
};

const parseWorkspaceStyleTarget = (scopeOrWorkspaceKey = null) => {
  if (scopeOrWorkspaceKey === null || scopeOrWorkspaceKey === undefined) {
    return { intendedScope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED, workspaceKey: null, invalidWorkspaceKey: false };
  }
  if (typeof scopeOrWorkspaceKey === 'object' && !Array.isArray(scopeOrWorkspaceKey) && (
    Object.hasOwn(scopeOrWorkspaceKey, 'scope')
    || Object.hasOwn(scopeOrWorkspaceKey, 'workspaceKey')
  )) {
    const explicitScope = scopeOrWorkspaceKey.scope;
    const hasWorkspaceKeyProp = Object.hasOwn(scopeOrWorkspaceKey, 'workspaceKey');
    const rawWorkspaceKey = scopeOrWorkspaceKey.workspaceKey;
    const wantsWorkspace = explicitScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
      || (explicitScope !== TEXT_WORKSPACE_STYLE_SCOPES.SHARED && hasWorkspaceKeyProp && rawWorkspaceKey !== null && rawWorkspaceKey !== undefined);
    if (!wantsWorkspace) {
      return { intendedScope: TEXT_WORKSPACE_STYLE_SCOPES.SHARED, workspaceKey: null, invalidWorkspaceKey: false };
    }
    const key = normalizeTextWorkspacePreferenceKey(rawWorkspaceKey);
    return {
      intendedScope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE,
      workspaceKey: key,
      invalidWorkspaceKey: !key
    };
  }
  // Shorthand call: resolveTextMainReaderWorkspaceStyle(pref, workspaceKeyOrObj)
  const key = normalizeTextWorkspacePreferenceKey(scopeOrWorkspaceKey);
  return {
    intendedScope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE,
    workspaceKey: key,
    invalidWorkspaceKey: !key
  };
};

export const resolveTextMainReaderWorkspaceStyle = (preference, target = null) => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const { intendedScope, workspaceKey: key, invalidWorkspaceKey } = parseWorkspaceStyleTarget(target);
  const sharedStyle = normalized.workspaceStyle;
  const workspaceOverride = key && Object.hasOwn(normalized.workspaceStyleOverrides, key)
    ? normalized.workspaceStyleOverrides[key]
    : null;
  const effectiveStyle = key
    ? resolveEffectiveTextWorkspaceStyle({ sharedStyle, workspaceOverride })
    : sharedStyle;
  const effectiveDefaults = intendedScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE
    ? sharedStyle
    : DEFAULT_TEXT_WORKSPACE_STYLE_STATE;
  const hasWorkspaceOverride = Boolean(workspaceOverride && Object.keys(workspaceOverride).length > 0);
  const isSharedDirty = isTextWorkspaceStyleDirty(sharedStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  const isWorkspaceOverrideDirty = key ? isTextWorkspaceStyleDirty(effectiveStyle, sharedStyle) : false;
  return Object.freeze({
    scope: intendedScope,
    workspaceKey: key,
    canOverrideWorkspace: Boolean(key),
    invalidWorkspaceKey,
    effectiveStyle,
    sharedStyle,
    workspaceOverride,
    hasWorkspaceOverride,
    effectiveDefaults,
    isDirty: intendedScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE ? isWorkspaceOverrideDirty : isSharedDirty,
    isSharedDirty,
    isWorkspaceOverrideDirty
  });
};

export const updateTextMainReaderWorkspaceStyle = (preference, patch, options = null) => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const { intendedScope, workspaceKey: key, invalidWorkspaceKey } = parseWorkspaceStyleTarget(options);

  // Guard: an invalid or missing workspace key when Workspace scope was intended
  // MUST fail safely and NEVER silently mutate Shared/global Workspace Style.
  if (intendedScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE && (invalidWorkspaceKey || !key)) {
    return normalized;
  }

  if (intendedScope === TEXT_WORKSPACE_STYLE_SCOPES.SHARED) {
    return normalizeTextMainReaderPreference({
      ...normalized,
      workspaceStyle: updateTextWorkspaceStyleState(normalized.workspaceStyle, patch)
    });
  }

  const current = resolveTextMainReaderWorkspaceStyle(normalized, {
    scope: TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE,
    workspaceKey: key
  });
  const nextEffective = updateTextWorkspaceStyleState(current.effectiveStyle, patch, normalized.workspaceStyle);
  const sparseOverride = {};
  for (const styleKey of Object.keys(DEFAULT_TEXT_WORKSPACE_STYLE_STATE)) {
    if (nextEffective[styleKey] !== normalized.workspaceStyle[styleKey]) {
      sparseOverride[styleKey] = nextEffective[styleKey];
    }
  }

  const nextOverrides = { ...normalized.workspaceStyleOverrides };
  if (Object.keys(sparseOverride).length > 0) {
    nextOverrides[key] = sparseOverride;
  } else {
    delete nextOverrides[key];
  }

  return normalizeTextMainReaderPreference({
    ...normalized,
    workspaceStyleOverrides: nextOverrides
  });
};

/**
 * Restores only Workspace Style settings for the requested scope (shared defaults or
 * a specific Workspace override) without touching Reader opt-in, Reader Mode, Card
 * Visibility, bilingual layout, audio preferences, or unrelated Workspaces.
 * Invalid or missing workspace identity for Workspace scope fails safely as a no-op.
 */
export const resetTextMainReaderWorkspaceStyle = (preference, options = null) => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const { intendedScope, workspaceKey: key, invalidWorkspaceKey } = parseWorkspaceStyleTarget(options);

  if (intendedScope === TEXT_WORKSPACE_STYLE_SCOPES.WORKSPACE) {
    if (invalidWorkspaceKey || !key || !Object.hasOwn(normalized.workspaceStyleOverrides, key)) {
      return normalized;
    }
    const nextOverrides = { ...normalized.workspaceStyleOverrides };
    delete nextOverrides[key];
    return normalizeTextMainReaderPreference({
      ...normalized,
      workspaceStyleOverrides: nextOverrides
    });
  }

  return normalizeTextMainReaderPreference({
    ...normalized,
    workspaceStyle: DEFAULT_TEXT_WORKSPACE_STYLE_STATE
  });
};

const resolveStorage = options => {
  if (options?.storage) return options.storage;
  return typeof window !== 'undefined' ? window.localStorage : null;
};

const serializeError = (error, fallbackName = 'Error', fallbackMessage = 'Preference persistence failed') => Object.freeze({
  name: typeof error?.name === 'string' && error.name ? error.name : fallbackName,
  message: typeof error?.message === 'string' && error.message
    ? error.message
    : String(error || fallbackMessage),
  code: error?.code ?? null
});

const classifyPersistenceFailure = error => {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  if (
    name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error?.code === 22
    || error?.code === 1014
    || /quota/i.test(`${name} ${message}`)
  ) {
    return TEXT_MAIN_READER_PERSISTENCE_REASONS.QUOTA_EXCEEDED;
  }
  if (name === 'SecurityError' || /denied|security/i.test(`${name} ${message}`)) {
    return TEXT_MAIN_READER_PERSISTENCE_REASONS.STORAGE_DENIED;
  }
  return TEXT_MAIN_READER_PERSISTENCE_REASONS.WRITE_FAILED;
};

const recordPersistenceResult = (result, options) => {
  lastPersistenceStatus = Object.freeze({
    ok: result.ok,
    persisted: result.persisted,
    reason: result.reason,
    storageKey: result.storageKey,
    error: result.error,
    overrideCount: Object.keys(result.preference.workspaceStyleOverrides).length
  });
  try {
    options?.onPersistenceStatus?.(result);
    if (!result.persisted) {
      options?.onPersistenceError?.(result);
    }
  } catch { /* Diagnostic callbacks must never block reading. */ }
  return result;
};

export const loadTextMainReaderPreference = (options = {}) => {
  try {
    const storage = resolveStorage(options);
    if (!storage) return normalizeTextMainReaderPreference();
    const key = resolveTextMainReaderPreferenceStorageKey(options);
    return normalizeTextMainReaderPreference(JSON.parse(storage.getItem(key)));
  } catch {
    return normalizeTextMainReaderPreference();
  }
};

/**
 * Non-destructively persists normalized reader preferences to storage.
 * Storage quota or access errors never retry with trimmed preferences and never
 * overwrite previously persisted data; callers receive full in-memory state
 * alongside structured failure diagnostics.
 */
export const persistTextMainReaderPreference = (candidate, options = {}) => {
  const normalized = normalizeTextMainReaderPreference(candidate);
  const key = resolveTextMainReaderPreferenceStorageKey(options);

  let storage;
  try {
    storage = resolveStorage(options);
  } catch (error) {
    return recordPersistenceResult(Object.freeze({
      ok: false,
      persisted: false,
      reason: TEXT_MAIN_READER_PERSISTENCE_REASONS.STORAGE_DENIED,
      storageKey: key,
      preference: normalized,
      error: serializeError(error, 'SecurityError', 'localStorage access denied')
    }), options);
  }

  if (!storage || typeof storage.setItem !== 'function') {
    return recordPersistenceResult(Object.freeze({
      ok: false,
      persisted: false,
      reason: TEXT_MAIN_READER_PERSISTENCE_REASONS.STORAGE_UNAVAILABLE,
      storageKey: key,
      preference: normalized,
      error: Object.freeze({
        name: 'StorageUnavailableError',
        message: 'localStorage is unavailable.',
        code: null
      })
    }), options);
  }

  try {
    storage.setItem(key, JSON.stringify(normalized));
    return recordPersistenceResult(Object.freeze({
      ok: true,
      persisted: true,
      reason: null,
      storageKey: key,
      preference: normalized,
      error: null
    }), options);
  } catch (error) {
    return recordPersistenceResult(Object.freeze({
      ok: false,
      persisted: false,
      reason: classifyPersistenceFailure(error),
      storageKey: key,
      preference: normalized,
      error: serializeError(error, 'Error', 'Unable to write reader preferences')
    }), options);
  }
};

export const saveTextMainReaderPreference = (candidate, options = {}) => (
  persistTextMainReaderPreference(candidate, options).preference
);

const extractWorkspaceTargetOption = options => {
  if (!options || typeof options !== 'object') return null;
  if (
    Object.hasOwn(options, 'scope')
    || Object.hasOwn(options, 'workspaceKey')
    || Object.hasOwn(options, 'id')
    || Object.hasOwn(options, 'uid')
  ) {
    return options;
  }
  return null;
};

export const saveTextMainReaderWorkspaceStyle = (patch, options = {}) => {
  const current = loadTextMainReaderPreference(options);
  const next = updateTextMainReaderWorkspaceStyle(current, patch, extractWorkspaceTargetOption(options));
  if (next === current) return current;
  return saveTextMainReaderPreference(next, options);
};

export const resetSavedTextMainReaderWorkspaceStyle = (options = {}) => {
  const current = loadTextMainReaderPreference(options);
  const next = resetTextMainReaderWorkspaceStyle(current, extractWorkspaceTargetOption(options));
  if (next === current) return current;
  return saveTextMainReaderPreference(next, options);
};
