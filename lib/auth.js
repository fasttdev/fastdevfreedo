import { SignJWT, jwtVerify } from 'jose';

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET missing');
  return new TextEncoder().encode(s);
}

const COOKIE_NAME = 'token';
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

export async function signToken(userId) {
  return await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function setAuthCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_SEC}; HttpOnly; Secure; SameSite=Lax`
  );
}

export function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  );
}

export async function getAuthedUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || !payload.uid) return null;
  return payload.uid;
}