import './server/loadLocalEnv.js';
import os from 'os';
import express from 'express';
import cors from 'cors';
import { createEdgeTtsStream } from './server/edgeTtsService.js';
import {
  createGeminiOwnerClearCookie,
  createGeminiOwnerCookie,
  isGeminiOwnerConfigured,
  isGeminiOwnerSession,
  verifyGeminiOwnerAccessCode
} from './server/geminiOwnerSession.js';
import { requestGeminiTts, resolveGeminiRequestCredential } from './server/geminiTtsService.js';
import {
  createGeminiByokClearCookie,
  createGeminiByokCookie,
  hasGeminiByokSession,
  isGeminiByokVaultConfigured
} from './server/geminiByokSession.js';

const app = express();
const port = 3001;
let edgeRequestSequence = 0;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Graceful handler for malformed JSON request bodies
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn(`[WARN] Bad JSON payload received from ${req.ip || 'client'} on ${req.method} ${req.originalUrl}: ${err.message}`);
    return res.status(400).json({ error: 'Invalid JSON payload received', details: err.message });
  }
  next(err);
});

app.post('/api/tts', async (req, res) => {
  const requestId = ++edgeRequestSequence;
  const startTime = Date.now();
  const { text, voice, rate, pitch } = req.body || {};
  const snippet = String(text || '').trim().substring(0, 30);
  const voiceName = voice || 'en-GB-LibbyNeural';
  let audioStream = null;
  let clientClosed = false;
  console.log(`[EDGE-TTS REQ #${requestId}] 🎙️  Start: "${snippet}${text && text.length > 30 ? '...' : ''}" (${voiceName})`);

  const drainDetachedStream = (stream) => {
    if (!stream) return;
    try { stream.unpipe?.(res); } catch { /* no-op */ }
    // Do not destroy msedge-tts streams on client abort. msedge-tts can still
    // receive WebSocket frames after its internal request bookkeeping changes;
    // destroying the stream here races that callback and can terminate Node.
    // Resume/drain instead so upstream can finish naturally while the browser
    // request is already considered cancelled.
    stream.on?.('error', () => {});
    stream.resume?.();
  };

  const cleanupClientDisconnect = () => {
    if (res.writableEnded || clientClosed) return;
    clientClosed = true;
    drainDetachedStream(audioStream);
    const durationMs = Date.now() - startTime;
    console.warn(`[EDGE-TTS REQ #${requestId}] ⚠️  Client disconnected/aborted after ${durationMs}ms • upstream draining safely`);
  };
  res.once('close', cleanupClientDisconnect);

  try {
    audioStream = await createEdgeTtsStream({ text, voice, rate, pitch });
    if (clientClosed) {
      drainDetachedStream(audioStream);
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Transfer-Encoding', 'chunked');

    let totalBytes = 0;
    audioStream.on('data', chunk => {
      totalBytes += chunk.length;
    });

    audioStream.on('end', () => {
      if (clientClosed) return;
      const durationMs = Date.now() - startTime;
      const kb = Math.round(totalBytes / 1024);
      console.log(`[EDGE-TTS REQ #${requestId}] ✅ Finished: "${snippet}" • ${kb} KB in ${durationMs}ms`);
    });

    audioStream.on('error', error => {
      if (clientClosed) return;
      console.error(`[EDGE-TTS REQ #${requestId}] ❌ Stream error:`, error.message);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate audio', details: error.message });
      else res.end();
    });

    audioStream.pipe(res);
  } catch (error) {
    if (clientClosed) return;
    console.error(`[EDGE-TTS REQ #${requestId}] ❌ Generation error:`, error.message);
    res.status(500).json({ error: 'Failed to generate audio', details: error.message });
  }
});

app.get('/api/gemini-auth', (req, res) => {
  res.json({ configured: isGeminiOwnerConfigured(), unlocked: isGeminiOwnerSession(req) });
});

app.post('/api/gemini-auth', (req, res) => {
  if (!isGeminiOwnerConfigured()) {
    res.status(503).json({ error: 'Owner Gemini access is not configured on the server.' });
    return;
  }
  if (!verifyGeminiOwnerAccessCode(req.body?.accessCode)) {
    res.status(401).json({ error: 'Owner access code is invalid.' });
    return;
  }
  res.setHeader('Set-Cookie', createGeminiOwnerCookie(req));
  res.json({ configured: true, unlocked: true });
});

app.delete('/api/gemini-auth', (req, res) => {
  res.setHeader('Set-Cookie', createGeminiOwnerClearCookie(req));
  res.json({ configured: isGeminiOwnerConfigured(), unlocked: false });
});

app.get('/api/gemini-byok', (req, res) => {
  res.json({ available: isGeminiByokVaultConfigured(), registered: hasGeminiByokSession(req) });
});

app.post('/api/gemini-byok', (req, res) => {
  if (!isGeminiByokVaultConfigured()) {
    res.status(503).json({ error: 'Gemini BYOK vault is not configured on the server.' });
    return;
  }
  try {
    res.setHeader('Set-Cookie', createGeminiByokCookie(req, req.body?.apiKey));
    res.json({ available: true, registered: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to register Gemini API key.' });
  }
});

app.delete('/api/gemini-byok', (req, res) => {
  res.setHeader('Set-Cookie', createGeminiByokClearCookie(req));
  res.json({ available: isGeminiByokVaultConfigured(), registered: false });
});

app.post('/api/gemini-tts', async (req, res) => {
  const startTime = Date.now();
  const text = req.body?.text;
  const voiceName = req.body?.voiceName || 'Kore';
  const snippet = String(text || '').trim().substring(0, 30);
  console.log(`[GEMINI-TTS] 🤖 Start: "${snippet}${text && text.length > 30 ? '...' : ''}" (${voiceName})`);

  try {
    const credential = resolveGeminiRequestCredential({ req });
    const data = await requestGeminiTts({
      text,
      voiceName,
      apiKey: credential.apiKey
    });
    const durationMs = Date.now() - startTime;
    console.log(`[GEMINI-TTS] ✅ Finished: "${snippet}" in ${durationMs}ms`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) {
    console.error(`[GEMINI-TTS] ❌ Error:`, error.message);
    res.status(Number(error.statusCode) || 500).json({ error: error.message || 'Gemini TTS request failed.' });
  }
});

app.get('/', (req, res) => {
  res.send(`
      <html>
          <head><title>ProLingo TTS Backend</title></head>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
              <div style="text-align: center; padding: 2rem; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; max-width: 480px;">
                  <h2 style="color: #6366f1; margin-top: 0;">⚡ ProLingo TTS Backend Online</h2>
                  <p style="color: #94a3b8; font-size: 14px;">Local API Backend (Port 3001).</p>
                  <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Status API: <span style="color: #4ade80;">Running OK</span></p>
              </div>
          </body>
      </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ProLingo API', timestamp: new Date().toISOString() });
});

app.listen(port, '0.0.0.0', () => {
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log(`ProLingo API backend running on port ${port} (0.0.0.0)`);
  console.log(`  ➜  Local:   http://localhost:${port}`);
  addresses.forEach(ip => console.log(`  ➜  Network: http://${ip}:${port}`));
  console.log('');
});

