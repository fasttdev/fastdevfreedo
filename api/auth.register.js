import bcrypt from 'bcryptjs';
import { users } from '../../lib/db.js';
import { signToken, setAuthCookie } from '../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody, requireMethod } from '../../lib/http.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^[a-z0-9_]{3,24}$/;

export default async function handler(req, res) {
  noCache(res);
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = await readJsonBody(req);
    const { email, username, password } = body || {};
    if (!email || !username || !password) {
      return sendError(res, 400, 'Email, username, password wajib diisi');
    }
    if (!emailRegex.test(email)) return sendError(res, 400, 'Format email tidak valid');
    if (!usernameRegex.test(username)) {
      return sendError(res, 400, 'Username 3-24 karakter, huruf kecil/angka/underscore');
    }
    if (password.length < 6) return sendError(res, 400, 'Password minimal 6 karakter');
    if (await users.findByEmail(email)) return sendError(res, 409, 'Email sudah terdaftar');
    if (await users.findByUsername(username)) return sendError(res, 409, 'Username sudah dipakai');

    const hash = await bcrypt.hash(password, 10);
    const user = await users.create(email, username, hash);
    const token = await signToken(user.id);
    setAuthCookie(res, token);
    sendJson(res, 200, { user: users.safe(user) });
  } catch (err) {
    console.error('register error', err);
    sendError(res, 500, 'Internal error');
  }
}