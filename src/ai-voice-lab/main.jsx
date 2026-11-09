import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createVoiceEngineRegistry } from '../services/audio/voiceEngines/voiceEngineRegistry.js';
import {
  createKokoroWebAdapter,
  KOKORO_BRITISH_VOICES,
  KOKORO_MAX_LAB_TEXT
} from '../services/audio/voiceEngines/kokoroWebAdapter.js';
import { createPcmLabPlayer } from './pcmLabPlayer.js';
import './style.css';

const INITIAL_TEXT = 'Good morning. Today I want to practise my British English. I hope my pronunciation gets better every day.';

function Lab() {
  const engineRef = useRef(null);
  const playerRef = useRef(null);
  if (!engineRef.current) {
    const registry = createVoiceEngineRegistry({ fallbackId: 'browser' });
    const engine = createKokoroWebAdapter();
    registry.register(engine);
    engineRef.current = { registry, engine };
  }
  if (!playerRef.current) playerRef.current = createPcmLabPlayer();

  const sessionRef = useRef(0);
  const controllerRef = useRef(null);
  const [text, setText] = useState(INITIAL_TEXT);
  const [voiceId, setVoiceId] = useState('bf_emma');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Belum memuat model.');
  const [progress, setProgress] = useState(null);
  const [chunks, setChunks] = useState(0);
  const [firstAudioMs, setFirstAudioMs] = useState(null);
  const [latestText, setLatestText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => {
    controllerRef.current?.abort();
    engineRef.current?.engine.dispose();
    void playerRef.current?.dispose();
  }, []);

  const load = async () => {
    if (loading || ready) return;
    setLoading(true);
    setError('');
    setProgress(null);
    setStatus('Memuat model Kokoro Q8 (WASM)…');
    try {
      await engineRef.current.engine.load({
        onProgress: detail => {
          const pct = Number(detail?.progress);
          if (Number.isFinite(pct)) setProgress(Math.max(0, Math.min(100, pct)));
          if (detail?.status) setStatus('Model: ' + detail.status + (detail.file ? ' — ' + detail.file : ''));
        }
      });
      setReady(true);
      setStatus('Kokoro siap. Model berjalan lokal di browser.');
    } catch (e) {
      setStatus('Gagal memuat model.');
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    sessionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    engineRef.current.engine.cancel();
    playerRef.current.stop();
    setPlaying(false);
    setStatus('Playback dihentikan.');
  };

  const play = async mode => {
    if (!ready || playing) return;
    const session = ++sessionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPlaying(true);
    setError('');
    setChunks(0);
    setFirstAudioMs(null);
    setLatestText('');
    setStatus(mode === 'stream' ? 'Streaming per kalimat…' : 'Menghasilkan satu audio…');
    const start = performance.now();
    let count = 0;
    try {
      // Called directly by a user click to allow mobile audio playback.
      await playerRef.current.unlock();
      for await (const chunk of engineRef.current.engine.stream({
        text,
        voiceId,
        mode,
        signal: controller.signal
      })) {
        if (sessionRef.current !== session) break;
        count += 1;
        if (count === 1) setFirstAudioMs(Math.round(performance.now() - start));
        await playerRef.current.enqueue(chunk);
        setChunks(count);
        setLatestText(chunk.text);
      }
      if (sessionRef.current !== session) return;
      setStatus('Sintesis selesai. Menyelesaikan antrean playback…');
      await playerRef.current.waitForIdle();
      if (sessionRef.current === session) setStatus('Playback selesai.');
    } catch (e) {
      if (sessionRef.current !== session || e?.name === 'AbortError') return;
      setError(e?.message || String(e));
      setStatus('Eksperimen gagal.');
    } finally {
      if (sessionRef.current === session) {
        controllerRef.current = null;
        setPlaying(false);
      }
    }
  };

  return (
    <main>
      <a href="/">← ProLingo Beta (tanpa perubahan)</a>
      <h1>ProLingo · AI Voice Lab v0.2</h1>
      <p>Halaman eksperimen mandiri. Tidak terhubung ke P9, Global Player, atau preferensi suara Stable. Model diunduh dari Hugging Face saat diminta; inferensi dilakukan di perangkat.</p>

      <section className="lab-card">
        <h2>1. Memuat model lokal</h2>
        <p>Kokoro 82M v1.0 · Q8 sekitar 92 MB, belum termasuk runtime dan voice. Cache browser membantu menghindari download ulang, tetapi tidak dijamin permanen.</p>
        <div className="lab-row">
          <button disabled={loading || ready || playing} onClick={load}>
            {ready ? 'Model siap ✓' : loading ? 'Memuat…' : 'Load Kokoro (unduh jika perlu)'}
          </button>
          <span className="lab-muted">WASM / Q8 · percobaan Web</span>
        </div>
        {progress !== null && <progress max="100" value={progress} aria-label="Download model" />}
      </section>

      <section className="lab-card">
        <h2>2. Bandingkan Generate & Streaming</h2>
        <div className="lab-row">
          <label>British Voice
            <select value={voiceId} disabled={playing} onChange={e => setVoiceId(e.target.value)}>
              {KOKORO_BRITISH_VOICES.map(v => <option key={v.id} value={v.id}>{v.name} ({v.id})</option>)}
            </select>
          </label>
        </div>
        <label style={{ marginTop: 12 }}>Teks percobaan
          <textarea maxLength={KOKORO_MAX_LAB_TEXT} value={text} disabled={playing} onChange={e => setText(e.target.value)} />
        </label>
        <div className="lab-row lab-muted" style={{ justifyContent: 'space-between', marginTop: 5 }}>
          <span>{text.length}/{KOKORO_MAX_LAB_TEXT} karakter</span>
          <span>Generate = satu file PCM · Stream = chunk per kalimat</span>
        </div>
        <div className="lab-row" style={{ marginTop: 13 }}>
          <button disabled={!ready || playing || !text.trim()} onClick={() => void play('generate')}>Generate & Play</button>
          <button disabled={!ready || playing || !text.trim()} onClick={() => void play('stream')}>Stream & Play</button>
          <button className="danger" disabled={!playing} onClick={stop}>Stop</button>
        </div>
      </section>

      <section className="lab-card">
        <h2>3. Hasil pengujian</h2>
        <div className="lab-grid">
          <div className="lab-metric"><strong>{chunks}</strong><span className="lab-muted">Chunk diterima</span></div>
          <div className="lab-metric"><strong>{firstAudioMs === null ? '—' : firstAudioMs + ' ms'}</strong><span className="lab-muted">Waktu sampai chunk pertama</span></div>
        </div>
        <p className={error ? 'lab-status lab-error' : 'lab-status'} role="status">{error || status}</p>
        {latestText && <p className="lab-muted">Segmen yang terakhir dihasilkan (bukan highlight sinkron): “{latestText}”</p>}
      </section>

      <p className="lab-muted">Catatan: tombol Stop menghentikan playback segera; model yang sedang menghitung satu chunk mungkin membutuhkan waktu untuk menerima pembatalan. Browser Web Audio tidak otomatis setara dengan playback P9. Uji di Chrome/Edge PC dan HP setelah paket Kokoro terpasang.</p>
    </main>
  );
}

createRoot(document.getElementById('ai-voice-lab-root')).render(<Lab />);
