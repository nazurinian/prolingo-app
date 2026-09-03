import { isGeminiOwnerSession } from './geminiOwnerSession.js';
import { readGeminiByokKey } from './geminiByokSession.js';

const DEFAULT_GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

export const resolveGeminiRequestCredential = ({ req }) => {
  if (isGeminiOwnerSession(req)) {
    const ownerKey = String(process.env.GEMINI_OWNER_API_KEY || '').trim();
    if (!ownerKey) throw Object.assign(new Error('Owner Gemini key is not configured.'), { statusCode: 503 });
    return { apiKey: ownerKey, mode: 'owner' };
  }
  const userKey = readGeminiByokKey(req);
  if (!userKey) throw Object.assign(new Error('Gemini is locked. Register your API key or unlock owner access.'), { statusCode: 401 });
  return { apiKey: userKey, mode: 'byok' };
};

export const requestGeminiTts = async ({ text, voiceName, apiKey }) => {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw Object.assign(new Error('Text is required.'), { statusCode: 400 });
  if (cleanText.length > 20000) throw Object.assign(new Error('Text is too long.'), { statusCode: 413 });
  const cleanVoiceName = String(voiceName || 'Kore').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(cleanVoiceName)) {
    throw Object.assign(new Error('Voice name is invalid.'), { statusCode: 400 });
  }
  const cleanApiKey = String(apiKey || '').trim();
  if (!cleanApiKey) throw Object.assign(new Error('Gemini credential is unavailable.'), { statusCode: 401 });
  const model = String(process.env.GEMINI_TTS_MODEL || DEFAULT_GEMINI_TTS_MODEL).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanApiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: cleanText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cleanVoiceName } } }
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini API Error ${response.status}`;
    throw Object.assign(new Error(message), { statusCode: response.status });
  }
  return data;
};
