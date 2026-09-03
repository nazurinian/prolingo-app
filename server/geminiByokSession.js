import crypto from 'node:crypto';

export const GEMINI_BYOK_COOKIE = 'prolingo_gemini_byok_v1';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const getVaultSecret = () => String(process.env.PROLINGO_GEMINI_BYOK_SECRET || '').trim();
const deriveKey = () => crypto.createHash('sha256').update(getVaultSecret()).digest();

const readCookie = (req, name) => {
  const raw = String(req?.headers?.cookie || '');
  for (const pair of raw.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const key = pair.slice(0, index).trim();
    if (key === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return '';
};

const isHttpsRequest = (req) => {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
  return forwarded === 'https' || process.env.NODE_ENV === 'production';
};

export const isGeminiByokVaultConfigured = () => Boolean(getVaultSecret());

const encryptPayload = (payload) => {
  if (!isGeminiByokVaultConfigured()) throw new Error('Gemini BYOK vault is not configured.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
};

const decryptPayload = (token) => {
  if (!token || !isGeminiByokVaultConfigured()) return '';
  try {
    const packed = Buffer.from(token, 'base64url');
    if (packed.length <= 28) return '';
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
};

export const readGeminiByokKey = (req) => {
  const token = readCookie(req, GEMINI_BYOK_COOKIE);
  const plaintext = decryptPayload(token);
  if (!plaintext) return '';
  try {
    const payload = JSON.parse(plaintext);
    if (payload?.v !== 1 || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return '';
    return String(payload.apiKey || '').trim();
  } catch {
    return '';
  }
};

export const hasGeminiByokSession = (req) => Boolean(readGeminiByokKey(req));

export const createGeminiByokCookie = (req, apiKey) => {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) throw new Error('Gemini API key is required.');
  if (cleanKey.length < 10 || cleanKey.length > 512) throw new Error('Gemini API key length is invalid.');
  const token = encryptPayload(JSON.stringify({
    v: 1,
    apiKey: cleanKey,
    exp: Math.floor(Date.now() / 1000) + ONE_YEAR_SECONDS
  }));
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${GEMINI_BYOK_COOKIE}=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${ONE_YEAR_SECONDS}${secure}`;
};

export const createGeminiByokClearCookie = (req) => {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${GEMINI_BYOK_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
};
