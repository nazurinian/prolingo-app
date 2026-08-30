import { synthesizeEdgeTtsBuffer } from '../server/edgeTtsService.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { text, voice, rate, pitch } = req.body || {};
    const audio = await synthesizeEdgeTtsBuffer({ text, voice, rate, pitch });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(audio);
  } catch (error) {
    console.error('Edge TTS API error:', error);
    res.status(500).json({ error: 'Failed to generate Edge TTS audio', details: error.message });
  }
}
