import {
  createGeminiByokClearCookie,
  createGeminiByokCookie,
  hasGeminiByokSession,
  isGeminiByokVaultConfigured
} from '../server/geminiByokSession.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      available: isGeminiByokVaultConfigured(),
      registered: hasGeminiByokSession(req)
    });
    return;
  }
  if (req.method === 'POST') {
    if (!isGeminiByokVaultConfigured()) {
      res.status(503).json({ error: 'Gemini BYOK vault is not configured on the server.' });
      return;
    }
    try {
      res.setHeader('Set-Cookie', createGeminiByokCookie(req, req.body?.apiKey));
      res.status(200).json({ available: true, registered: true });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to register Gemini API key.' });
    }
    return;
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', createGeminiByokClearCookie(req));
    res.status(200).json({ available: isGeminiByokVaultConfigured(), registered: false });
    return;
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
}
