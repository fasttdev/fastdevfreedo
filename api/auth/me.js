import { users } from '../../lib/db.js';
import { getAuthedUser } from '../../lib/auth.js';
import { sendJson, sendError, noCache } from '../../lib/http.js';

export default async function handler(req, res) {
  noCache(res);
  const uid = await getAuthedUser(req);
  if (!uid) return sendError(res, 401, 'Unauthorized');
  const user = await users.findById(uid);
  if (!user) return sendError(res, 401, 'Unauthorized');
  sendJson(res, 200, { user: users.safe(user) });
}