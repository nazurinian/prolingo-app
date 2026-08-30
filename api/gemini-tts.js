import { requestGeminiTts, resolveGeminiRequestCredential } from '../server/geminiTtsService.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const credential = resolveGeminiRequestCredential({ req });
    const data = await requestGeminiTts({
      text: req.body?.text,
      voiceName: req.body?.voiceName || 'Kore',
      apiKey: credential.apiKey
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    res.status(status).json({ error: error.message || 'Gemini TTS request failed.' });
  }
}
