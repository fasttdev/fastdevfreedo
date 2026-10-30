import bcrypt from 'bcryptjs';
import { users } from '../../lib/db.js';
import { signToken, setAuthCookie } from '../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody, requireMethod } from '../../lib/http.js';

export default async function handler(req, res) {
  noCache(res);
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = await readJsonBody(req);
    const { email, password } = body || {};
    if (!email || !password) return sendError(res, 400, 'Email dan password wajib diisi');

    const user = await users.findByEmail(email);
    if (!user) return sendError(res, 401, 'Email atau password salah');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return sendError(res, 401, 'Email atau password salah');

    const token = await signToken(user.id);
    setAuthCookie(res, token);
    sendJson(res, 200, { user: users.safe(user) });
  } catch (err) {
    console.error('login error', err);
    sendError(res, 500, 'Internal error');
  }
}