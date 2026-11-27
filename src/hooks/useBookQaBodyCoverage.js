import { useEffect, useMemo, useState } from 'react';
import { readBookAudioBinding } from '../domain/text/bookQaAudioDomain.js';
import { BOOK_BODY_CHANNELS, getBookBodyGenerationRequests } from '../domain/text/bookQaBodyAudioDomain.js';
import { buildTextStructuredRuntimeAudioKey } from '../domain/text/textStructuredAudioRuntimeDomain.js';

const EMPTY = Object.freeze({});

export function useBookQaBodyCoverage(audio, snapshot, document, preferences) {
  const planned = useMemo(() => {
    if (!audio || !snapshot || !document) return null;
    const checks = [], initial = {};
    for (const block of document.blocks) {
      for (const channel of BOOK_BODY_CHANNELS) {
        const entries = getBookBodyGenerationRequests(document, block, channel, { options: { preferences } });
        for (const entry of entries) {
          const key = buildTextStructuredRuntimeAudioKey(entry.target.segmentId, channel);
          let status;
          try { ({ status } = readBookAudioBinding(snapshot, entry)); }
          catch { status = 'corrupt'; }
          initial[key] = { status: status === 'bound' ? 'metadata-only' : status,
            requiredVoiceId: entry.descriptor.voiceId, expectedRenderFingerprint: entry.fingerprint };
          if (status === 'bound') checks.push({ entry, key });
        }
      }
    }
    return { initial, checks };
  }, [audio, snapshot, document, preferences]);
  const [readback, setReadback] = useState(null);
  useEffect(() => {
    if (!planned?.checks.length) return undefined;
    let cancelled = false;
    const verify = async () => {
      const map = { ...planned.initial };
      for (const { key, entry } of planned.checks) {
        if (cancelled) return;
        try {
          const { status } = await audio.readRuntime(entry, { withUrl: false });
          map[key] = { ...map[key], status };
        } catch { /* Keep the unverified status until a successful read. */ }
      }
      if (!cancelled) setReadback({ planned, map });
    };
    void verify();
    return () => { cancelled = true; };
  }, [audio, planned]);
  return readback?.planned === planned ? readback.map : planned?.initial ?? EMPTY;
}
