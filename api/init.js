import { sql } from '../lib/db.js';
import { sendJson, sendError, noCache } from '../lib/http.js';

export default async function handler(req, res) {
  noCache(res);
  const secret = req.query.secret;
  if (!process.env.INIT_SECRET || secret !== process.env.INIT_SECRET) {
    return sendError(res, 403, 'Forbidden');
  }

  try {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at BIGINT NOT NULL
    )`;

    await sql`CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subdomain TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      maintenance INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`;

    await sql`CREATE TABLE IF NOT EXISTS deployments (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      entry_file TEXT NOT NULL DEFAULT 'index.html',
      file_count INTEGER NOT NULL,
      size_bytes BIGINT NOT NULL,
      files_map JSONB NOT NULL,
      created_at BIGINT NOT NULL
    )`;

    await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS maintenance INTEGER NOT NULL DEFAULT 0`;

    await sql`CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sites_sub ON sites(subdomain)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deploy_site ON deployments(site_id)`;

    sendJson(res, 200, { ok: true, message: 'Schema ready' });
  } catch (err) {
    console.error('init error', err);
    sendError(res, 500, 'Init failed: ' + err.message);
  }
}