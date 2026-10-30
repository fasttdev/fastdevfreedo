import { clearAuthCookie } from '../../lib/auth.js';
import { sendJson, noCache } from '../../lib/http.js';

export default async function handler(req, res) {
  noCache(res);
  clearAuthCookie(res);
  sendJson(res, 200, { ok: true });
}