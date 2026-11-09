// AI Voice experiment v0.1 — registry only; no P9 playback behaviour is replaced.
// Engines are deliberately platform-neutral. Web and Android can register different adapters.

export const VOICE_OUTPUT = Object.freeze({
  DIRECT: 'direct-playback',
  STREAM: 'audio-chunks'
});

const cleanId = value => String(value ?? '').trim();

const checkAdapter = adapter => {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Voice adapter must be an object.');
  const id = cleanId(adapter.id);
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new TypeError('Voice adapter id must be a lowercase kebab-case identifier.');
  }
  if (!cleanId(adapter.label)) throw new TypeError(`Voice adapter "${id}" needs a label.`);
  if (adapter.output === VOICE_OUTPUT.DIRECT) {
    if (typeof adapter.play !== 'function') throw new TypeError(`Voice adapter "${id}" must implement play().`);
  } else if (adapter.output === VOICE_OUTPUT.STREAM) {
    if (typeof adapter.stream !== 'function') throw new TypeError(`Voice adapter "${id}" must implement stream().`);
  } else {
    throw new TypeError(`Voice adapter "${id}" has an unsupported output type.`);
  }
  return id;
};

export const createVoiceEngineRegistry = ({ fallbackId = 'browser' } = {}) => {
  const adapters = new Map();

  const available = adapter => {
    try {
      return typeof adapter.isAvailable !== 'function' || Boolean(adapter.isAvailable());
    } catch {
      return false;
    }
  };

  const register = adapter => {
    const id = checkAdapter(adapter);
    if (adapters.has(id)) throw new Error(`Voice adapter "${id}" is already registered.`);
    adapters.set(id, adapter);
    return adapter;
  };

  const unregister = id => adapters.delete(cleanId(id));
  const get = id => adapters.get(cleanId(id)) || null;
  const list = () => [...adapters.values()].map(adapter => ({
    id: adapter.id,
    label: adapter.label,
    output: adapter.output,
    capabilities: { ...(adapter.capabilities || {}) },
    available: available(adapter)
  }));

  const resolve = (preferredId = fallbackId, { allowFallback = true } = {}) => {
    const preferred = get(preferredId);
    if (preferred && available(preferred)) return preferred;
    if (allowFallback && preferredId !== fallbackId) {
      const fallback = get(fallbackId);
      if (fallback && available(fallback)) return fallback;
    }
    return null; // Let the caller report unavailable; never silently invent audio.
  };

  return Object.freeze({ register, unregister, get, list, resolve });
};
