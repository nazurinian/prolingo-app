import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  isTextWorkspaceStyleDirty,
  normalizeTextCardPresentationState,
  normalizeTextWorkspaceStyleOverride,
  normalizeTextWorkspaceStyleState,
  resolveEffectiveTextWorkspaceStyle,
  updateTextWorkspaceStyleState
} from '../../domain/text/textCardPresentationStateDomain.js';

// Separate from both the historical Shared QA view preference and audio settings.
export const TEXT_MAIN_READER_PREFERENCE_KEY = 'prolingo_text_main_reader_v1';

const FORBIDDEN_WORKSPACE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_WORKSPACE_OVERRIDE_ENTRIES = 200;

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

const normalizeWorkspaceStyleOverridesMap = candidate => {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return Object.freeze({});
  }
  const normalized = {};
  let count = 0;
  for (const [rawKey, rawOverride] of Object.entries(candidate)) {
    if (count >= MAX_WORKSPACE_OVERRIDE_ENTRIES) break;
    const key = normalizeTextWorkspacePreferenceKey(rawKey);
    if (!key) continue;
    const override = normalizeTextWorkspaceStyleOverride(rawOverride);
    if (Object.keys(override).length === 0) continue;
    normalized[key] = override;
    count += 1;
  }
  return Object.freeze(normalized);
};

export const normalizeTextMainReaderPreference = candidate => {
  const isV1 = candidate?.version === 1;
  return Object.freeze({
    version: 1,
    reader: isV1 && candidate.reader === 'shared' ? 'shared' : 'legacy',
    view: normalizeTextCardPresentationState(isV1 ? candidate.view : null),
    workspaceStyle: normalizeTextWorkspaceStyleState(isV1 ? candidate.workspaceStyle : null),
    workspaceStyleOverrides: normalizeWorkspaceStyleOverridesMap(isV1 ? candidate.workspaceStyleOverrides : null)
  });
};

export const resolveTextMainReaderWorkspaceStyle = (preference, workspaceKey = null) => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const key = normalizeTextWorkspacePreferenceKey(workspaceKey);
  const sharedStyle = normalized.workspaceStyle;
  const workspaceOverride = key && Object.hasOwn(normalized.workspaceStyleOverrides, key)
    ? normalized.workspaceStyleOverrides[key]
    : null;
  const effectiveStyle = key
    ? resolveEffectiveTextWorkspaceStyle({ sharedStyle, workspaceOverride })
    : sharedStyle;
  const effectiveDefaults = key ? sharedStyle : DEFAULT_TEXT_WORKSPACE_STYLE_STATE;
  const hasWorkspaceOverride = Boolean(workspaceOverride && Object.keys(workspaceOverride).length > 0);
  const isSharedDirty = isTextWorkspaceStyleDirty(sharedStyle, DEFAULT_TEXT_WORKSPACE_STYLE_STATE);
  const isWorkspaceOverrideDirty = key ? isTextWorkspaceStyleDirty(effectiveStyle, sharedStyle) : false;
  return Object.freeze({
    scope: key ? 'workspace' : 'shared',
    workspaceKey: key,
    effectiveStyle,
    sharedStyle,
    workspaceOverride,
    hasWorkspaceOverride,
    effectiveDefaults,
    isDirty: key ? isWorkspaceOverrideDirty : isSharedDirty,
    isSharedDirty,
    isWorkspaceOverrideDirty
  });
};

export const updateTextMainReaderWorkspaceStyle = (preference, patch, { workspaceKey = null } = {}) => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const key = normalizeTextWorkspacePreferenceKey(workspaceKey);
  if (!key) {
    return normalizeTextMainReaderPreference({
      ...normalized,
      workspaceStyle: updateTextWorkspaceStyleState(normalized.workspaceStyle, patch)
    });
  }
  const current = resolveTextMainReaderWorkspaceStyle(normalized, key);
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
 * a specific Workspace override) without touching Reader opt-in, Reader Mode,
 * bilingual layout, audio preferences, or unrelated Workspaces.
 */
export const resetTextMainReaderWorkspaceStyle = (preference, { workspaceKey = null } = {}) => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const key = normalizeTextWorkspacePreferenceKey(workspaceKey);
  if (!key) {
    return normalizeTextMainReaderPreference({
      ...normalized,
      workspaceStyle: DEFAULT_TEXT_WORKSPACE_STYLE_STATE
    });
  }
  const nextOverrides = { ...normalized.workspaceStyleOverrides };
  delete nextOverrides[key];
  return normalizeTextMainReaderPreference({
    ...normalized,
    workspaceStyleOverrides: nextOverrides
  });
};

const resolveStorage = options => {
  if (options?.storage) return options.storage;
  return typeof window !== 'undefined' ? window.localStorage : null;
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

export const saveTextMainReaderPreference = (candidate, options = {}) => {
  const normalized = normalizeTextMainReaderPreference(candidate);
  try {
    const storage = resolveStorage(options);
    if (storage) {
      const key = resolveTextMainReaderPreferenceStorageKey(options);
      storage.setItem(key, JSON.stringify(normalized));
    }
  } catch { /* Optional view preferences must never block reading. */ }
  return normalized;
};

export const saveTextMainReaderWorkspaceStyle = (patch, options = {}) => {
  const current = loadTextMainReaderPreference(options);
  const next = updateTextMainReaderWorkspaceStyle(current, patch, { workspaceKey: options?.workspaceKey ?? null });
  return saveTextMainReaderPreference(next, options);
};

export const resetSavedTextMainReaderWorkspaceStyle = (options = {}) => {
  const current = loadTextMainReaderPreference(options);
  const next = resetTextMainReaderWorkspaceStyle(current, { workspaceKey: options?.workspaceKey ?? null });
  return saveTextMainReaderPreference(next, options);
};
