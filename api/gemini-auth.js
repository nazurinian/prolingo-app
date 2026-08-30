import {
  createGeminiOwnerClearCookie,
  createGeminiOwnerCookie,
  isGeminiOwnerConfigured,
  isGeminiOwnerSession,
  verifyGeminiOwnerAccessCode
} from '../server/geminiOwnerSession.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ configured: isGeminiOwnerConfigured(), unlocked: isGeminiOwnerSession(req) });
    return;
  }
  if (req.method === 'POST') {
    if (!isGeminiOwnerConfigured()) {
      res.status(503).json({ error: 'Owner Gemini access is not configured on the server.' });
      return;
    }
    if (!verifyGeminiOwnerAccessCode(req.body?.accessCode)) {
      res.status(401).json({ error: 'Owner access code is invalid.' });
      return;
    }
    res.setHeader('Set-Cookie', createGeminiOwnerCookie(req));
    res.status(200).json({ configured: true, unlocked: true });
    return;
  }
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', createGeminiOwnerClearCookie(req));
    res.status(200).json({ configured: isGeminiOwnerConfigured(), unlocked: false });
    return;
  }
  res.setHeader('Allow', 'GET, POST, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
}
