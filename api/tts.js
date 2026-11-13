import { classifyEdgeTtsError, synthesizeEdgeTtsBuffer } from '../server/edgeTtsService.js';

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
    const classified = error?.statusCode
      ? {
          statusCode: error.statusCode,
          code: error.code || 'EDGE_TTS_UPSTREAM_ERROR',
          voice: error.voice || (req.body?.voice || null),
          error: error.errorTitle || 'Failed to generate Edge TTS audio',
          details: error.message
        }
      : await classifyEdgeTtsError({ error, voice: req.body?.voice });
    res.status(classified.statusCode).json({
      error: classified.error,
      code: classified.code,
      voice: classified.voice,
      details: classified.details
    });
  }
}
