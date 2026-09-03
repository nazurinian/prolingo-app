import './server/loadLocalEnv.js';
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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, rate, pitch } = req.body || {};
    const audioStream = await createEdgeTtsStream({ text, voice, rate, pitch });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Transfer-Encoding', 'chunked');
    audioStream.on('error', error => {
      console.error('Edge TTS stream error:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate audio', details: error.message });
      else res.end();
    });
    audioStream.pipe(res);
  } catch (error) {
    console.error('Edge TTS Error:', error);
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
  try {
    const credential = resolveGeminiRequestCredential({ req });
    const data = await requestGeminiTts({
      text: req.body?.text,
      voiceName: req.body?.voiceName || 'Kore',
      apiKey: credential.apiKey
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  } catch (error) {
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
  console.log(`ProLingo API backend running on port ${port} (0.0.0.0)`);
});
