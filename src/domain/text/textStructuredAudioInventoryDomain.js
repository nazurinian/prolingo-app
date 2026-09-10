const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();

const sourceTypeForRuntime = entry => {
  if (entry?.zipBacked) return 'zip';
  if (entry?.folderBacked) return 'folder';
  if (entry?.generated) return 'generated';
  if (entry?.url) return 'runtime';
  return 'metadata';
};

export const summarizeTextStructuredAudioRuntimeInventory = ({ documentTree, audioVariants = [], runtimeAudioUrls = {} } = {}) => {
  const segmentIds = new Set((documentTree?.blocks || []).flatMap(block => (block?.segments || []).map(segment => String(segment?.id || '').toUpperCase())).filter(Boolean));
  const variants = (Array.isArray(audioVariants) ? audioVariants : []).filter(variant => segmentIds.has(String(variant?.segmentId || '').toUpperCase()));
  const voices = new Map();
  const sources = { folder: 0, zip: 0, generated: 0, runtime: 0, metadata: 0 };
  let ready = 0;
  let metadataOnly = 0;

  variants.forEach(variant => {
    const runtime = runtimeAudioUrls?.[variant.id];
    if (runtime?.url || runtime?.zipBacked) {
      ready += 1;
      const source = sourceTypeForRuntime(runtime);
      sources[source] = (sources[source] || 0) + 1;
      const voiceId = clean(variant?.voiceId);
      if (voiceId) {
        const key = lower(voiceId);
        const current = voices.get(key) || { id: voiceId, count: 0, sources: new Set() };
        current.count += 1;
        current.sources.add(source);
        voices.set(key, current);
      }
    } else {
      metadataOnly += 1;
    }
  });

  return {
    variantCount: variants.length,
    ready,
    metadataOnly,
    sources,
    voices: [...voices.values()].map(item => ({ id: item.id, count: item.count, sources: [...item.sources] }))
  };
};
