import {
  DEFAULT_TEXT_WORKSPACE_STYLE_STATE,
  isTextWorkspaceStyleDirty,
  normalizeTextCardPresentationState,
  normalizeTextWorkspaceStyleOverride,
  normalizeTextWorkspaceStyleState,
  resolveEffectiveTextWorkspaceStyle,
  updateTextWorkspaceStyleState
} from '../../domain/text/textCardPresentationStateDomain.js';
import {
  TEXT_CARD_EXPANSION_MODES,
  normalizeTextCardExpansionMode
} from '../../domain/text/textStructuredCardExpansionDomain.js';

// Separate from both the historical Shared QA view preference and audio settings.
export const TEXT_MAIN_READER_PREFERENCE_KEY = 'prolingo_text_main_reader_v1';

export const TEXT_MAIN_READER_MODES = Object.freeze(['full', 'card']);
export const DEFAULT_TEXT_MAIN_READER_MODE = 'full';
export const DEFAULT_SHARED_CARD_VISIBILITY = TEXT_CARD_EXPANSION_MODES.ALL;

export const TEXT_WORKSPACE_STYLE_SCOPES = Object.freeze({
  SHARED: 'shared',
  WORKSPACE: 'workspace'
});

const FORBIDDEN_WORKSPACE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Bounded LRU-by-recency safeguard for per-Workspace style overrides.
 * JS object insertion order tracks recency (updates move touched keys to the tail),
 * so if more than MAX_WORKSPACE_OVERRIDE_ENTRIES unique overrides accumulate, only
 * the oldest least-recently-used entries are evicted — never the active or newly
 * written Workspace override. Storage quota failures also fall back safely without
 * losing Shared defaults, Reader Mode, Card Visibility, or View preferences.
 */
export const MAX_WORKSPACE_OVERRIDE_ENTRIES = 250;

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
  const validEntries = [];
  for (const [rawKey, rawOverride] of Object.entries(candidate)) {
    const key = normalizeTextWorkspacePreferenceKey(rawKey);
    if (!key) continue;
    const override = normalizeTextWorkspaceStyleOverride(rawOverride);
    if (Object.keys(override).length === 0) continue;
    validEntries.push([key, override]);
  }
  // Retain the most recently updated overrides if raw persisted input exceeds capacity.
  const boundedEntries = validEntries.length > MAX_WORKSPACE_OVERRIDE_ENTRIES
    ? validEntries.slice(validEntries.length - MAX_WORKSPACE_OVERRIDE_ENTRIES)
    : validEntries;
  const normalized = {};
  for (const [key, override] of boundedEntries) {
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

export const inspectTextMainReaderOverrideCapacity = preference => {
  const normalized = normalizeTextMainReaderPreference(preference);
  const count = Object.keys(normalized.workspaceStyleOverrides).length;
  return Object.freeze({
    count,
    maxEntries: MAX_WORKSPACE_OVERRIDE_ENTRIES,
    remaining: Math.max(0, MAX_WORKSPACE_OVERRIDE_ENTRIES - count),
    atCapacity: count >= MAX_WORKSPACE_OVERRIDE_ENTRIES,
    evictionPolicy: 'lru-oldest-on-overflow'
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

export const updateTextMainReaderWorkspaceStyle = (preference, patch, options = {}) => {
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

  // Maintain LRU recency order by moving the updated key to the tail.
  const nextOverrides = {};
  for (const [existingKey, existingOverride] of Object.entries(normalized.workspaceStyleOverrides)) {
    if (existingKey !== key) {
      nextOverrides[existingKey] = existingOverride;
    }
  }
  if (Object.keys(sparseOverride).length > 0) {
    nextOverrides[key] = sparseOverride;
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
export const resetTextMainReaderWorkspaceStyle = (preference, options = {}) => {
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
      try {
        storage.setItem(key, JSON.stringify(normalized));
      } catch {
        // Quota-safe fallback: trim oldest workspace overrides before giving up,
        // preserving Shared defaults, Reader Mode, Card Visibility, and View state.
        const overrideEntries = Object.entries(normalized.workspaceStyleOverrides);
        if (overrideEntries.length > 0) {
          const reduced = normalizeTextMainReaderPreference({
            ...normalized,
            workspaceStyleOverrides: Object.fromEntries(overrideEntries.slice(-Math.min(32, Math.floor(overrideEntries.length / 2))))
          });
          storage.setItem(key, JSON.stringify(reduced));
          return reduced;
        }
      }
    }
  } catch { /* Optional view preferences must never block reading. */ }
  return normalized;
};

export const saveTextMainReaderWorkspaceStyle = (patch, options = {}) => {
  const current = loadTextMainReaderPreference(options);
  const next = updateTextMainReaderWorkspaceStyle(current, patch, options);
  if (next === current) return current;
  return saveTextMainReaderPreference(next, options);
};

export const resetSavedTextMainReaderWorkspaceStyle = (options = {}) => {
  const current = loadTextMainReaderPreference(options);
  const next = resetTextMainReaderWorkspaceStyle(current, options);
  if (next === current) return current;
  return saveTextMainReaderPreference(next, options);
};
