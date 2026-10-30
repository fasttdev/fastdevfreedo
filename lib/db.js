import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
export { sql };

export const users = {
  async create(email, username, passwordHash) {
    const rows = await sql`
      INSERT INTO users (email, username, password_hash, plan, created_at)
      VALUES (${email.toLowerCase()}, ${username.toLowerCase()}, ${passwordHash}, 'free', ${Date.now()})
      RETURNING *
    `;
    return rows[0];
  },
  async findByEmail(email) {
    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
    return rows[0] || null;
  },
  async findByUsername(username) {
    const rows = await sql`SELECT * FROM users WHERE username = ${username.toLowerCase()} LIMIT 1`;
    return rows[0] || null;
  },
  async findById(id) {
    const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return rows[0] || null;
  },
  safe(u) {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      plan: u.plan,
      created_at: Number(u.created_at)
    };
  }
};

export const sites = {
  async create(userId, subdomain, name) {
    const now = Date.now();
    const rows = await sql`
      INSERT INTO sites (user_id, subdomain, name, status, maintenance, created_at, updated_at)
      VALUES (${userId}, ${subdomain.toLowerCase()}, ${name}, 'active', 0, ${now}, ${now})
      RETURNING *
    `;
    return rows[0];
  },
  async findById(id) {
    const rows = await sql`SELECT * FROM sites WHERE id = ${id} LIMIT 1`;
    return rows[0] || null;
  },
  async findBySubdomain(sub) {
    const rows = await sql`
      SELECT * FROM sites WHERE subdomain = ${sub.toLowerCase()} AND status = 'active' LIMIT 1
    `;
    return rows[0] || null;
  },
  async findBySubdomainAny(sub) {
    const rows = await sql`
      SELECT * FROM sites WHERE subdomain = ${sub.toLowerCase()} LIMIT 1
    `;
    return rows[0] || null;
  },
  async listByUser(userId) {
    return await sql`
      SELECT s.*,
        (SELECT COUNT(*)::int FROM deployments d WHERE d.site_id = s.id) AS deploy_count,
        (SELECT MAX(created_at) FROM deployments d WHERE d.site_id = s.id) AS last_deploy_at
      FROM sites s
      WHERE s.user_id = ${userId}
      ORDER BY s.created_at DESC
    `;
  },
  async update(id, fields) {
    const name = fields.name ?? null;
    const status = fields.status ?? null;
    const maintenance = fields.maintenance !== undefined ? (fields.maintenance ? 1 : 0) : null;
    const rows = await sql`
      UPDATE sites SET
        name = COALESCE(${name}, name),
        status = COALESCE(${status}, status),
        maintenance = COALESCE(${maintenance}, maintenance),
        updated_at = ${Date.now()}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  },
  async remove(id) {
    await sql`DELETE FROM sites WHERE id = ${id}`;
  },
  async countByUser(userId) {
    const rows = await sql`SELECT COUNT(*)::int AS c FROM sites WHERE user_id = ${userId}`;
    return rows[0].c;
  }
};

export const deployments = {
  async create(siteId, version, entryFile, fileCount, sizeBytes, filesMap) {
    const rows = await sql`
      INSERT INTO deployments (site_id, version, entry_file, file_count, size_bytes, files_map, created_at)
      VALUES (${siteId}, ${version}, ${entryFile}, ${fileCount}, ${sizeBytes}, ${JSON.stringify(filesMap)}::jsonb, ${Date.now()})
      RETURNING *
    `;
    return rows[0];
  },
  async findById(id) {
    const rows = await sql`SELECT * FROM deployments WHERE id = ${id} LIMIT 1`;
    return rows[0] || null;
  },
  async listBySite(siteId) {
    return await sql`
      SELECT id, site_id, version, entry_file, file_count, size_bytes, created_at
      FROM deployments WHERE site_id = ${siteId}
      ORDER BY version DESC
    `;
  },
  async nextVersion(siteId) {
    const rows = await sql`
      SELECT COALESCE(MAX(version), 0) + 1 AS v FROM deployments WHERE site_id = ${siteId}
    `;
    return rows[0].v;
  },
  async latest(siteId) {
    const rows = await sql`
      SELECT * FROM deployments WHERE site_id = ${siteId} ORDER BY version DESC LIMIT 1
    `;
    return rows[0] || null;
  }
};