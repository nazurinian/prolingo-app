import crypto from 'node:crypto';

export const GEMINI_OWNER_COOKIE = 'prolingo_gemini_owner_v1';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const safeEqual = (a = '', b = '') => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const getSessionSecret = () => String(process.env.PROLINGO_OWNER_SESSION_SECRET || '');
const getOwnerAccessCode = () => String(process.env.PROLINGO_OWNER_ACCESS_CODE || '');

export const isGeminiOwnerConfigured = () => Boolean(
  process.env.GEMINI_OWNER_API_KEY && getOwnerAccessCode() && getSessionSecret()
);

export const verifyGeminiOwnerAccessCode = (candidate) => {
  const configured = getOwnerAccessCode();
  const cleanCandidate = String(candidate || '');
  if (!configured || !cleanCandidate || cleanCandidate.length > 512) return false;
  return safeEqual(cleanCandidate, configured);
};

const signPayload = (payload) => crypto
  .createHmac('sha256', getSessionSecret())
  .update(payload)
  .digest('base64url');

const createToken = () => {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    exp: Math.floor(Date.now() / 1000) + ONE_YEAR_SECONDS
  })).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
};

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

export const isGeminiOwnerSession = (req) => {
  if (!isGeminiOwnerConfigured()) return false;
  const token = readCookie(req, GEMINI_OWNER_COOKIE);
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded?.v === 1 && Number(decoded.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

const isHttpsRequest = (req) => {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
  return forwarded === 'https' || process.env.NODE_ENV === 'production';
};

export const createGeminiOwnerCookie = (req) => {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${GEMINI_OWNER_COOKIE}=${encodeURIComponent(createToken())}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${ONE_YEAR_SECONDS}${secure}`;
};

export const createGeminiOwnerClearCookie = (req) => {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `${GEMINI_OWNER_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
};
