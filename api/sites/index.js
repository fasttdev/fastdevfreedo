import { sites, users, deployments } from '../../lib/db.js';
import { getAuthedUser } from '../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody } from '../../lib/http.js';
import { uploadFile } from '../../lib/blob.js';
import config from '../../lib/config.js';

const { rootDomain, subdomainRegex, reservedSubdomains, planLimits, adminEmail } = config;

function isAdmin(user) {
  if (!adminEmail) return false;
  return (user.email || '').toLowerCase() === adminEmail;
}

export default async function handler(req, res) {
  noCache(res);
  const uid = await getAuthedUser(req);
  if (!uid) return sendError(res, 401, 'Unauthorized');

  try {
    if (req.method === 'GET') {
      const user = await users.findById(uid);
      const list = await sites.listByUser(uid);
      const max = planLimits[user.plan] || 3;
      return sendJson(res, 200, {
        sites: list.map((s) => ({
          id: s.id,
          name: s.name,
          subdomain: s.subdomain,
          status: s.status,
          maintenance: Number(s.maintenance) === 1,
          created_at: Number(s.created_at),
          updated_at: Number(s.updated_at),
          deploy_count: s.deploy_count,
          last_deploy_at: s.last_deploy_at ? Number(s.last_deploy_at) : null,
          url: `https://${s.subdomain}.${rootDomain}`
        })),
        limits: { max, used: list.length }
      });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const { subdomain, name } = body || {};
      if (!subdomain || !name) return sendError(res, 400, 'Subdomain dan nama wajib diisi');

      const user = await users.findById(uid);
      const admin = isAdmin(user);

      const sub = String(subdomain).toLowerCase().trim();
      if (!subdomainRegex.test(sub) || sub.length < 3) {
        return sendError(res, 400, 'Subdomain 3-63 karakter, huruf kecil/angka/hubung');
      }
      if (reservedSubdomains.includes(sub) && !admin) {
        return sendError(res, 400, 'Subdomain ini dipesan sistem');
      }
      if (await sites.findBySubdomain(sub)) return sendError(res, 409, 'Subdomain sudah dipakai');

      if (!admin) {
        const used = await sites.countByUser(uid);
        const max = planLimits[user.plan] || 3;
        if (used >= max) {
          return sendError(res, 403, `Batas paket ${user.plan} tercapai (maks ${max})`);
        }
      }

      const site = await sites.create(uid, sub, String(name).slice(0, 60));
      const defaultHtml = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(site.name)}</title>
<style>body{font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:2rem}h1{font-size:2rem;margin-bottom:.5rem}</style></head>
<body><div class="box"><h1>${escapeHtml(site.name)}</h1><p>Site is live.</p></div></body></html>`;
      const buf = Buffer.from(defaultHtml, 'utf-8');
      const url = await uploadFile(sub, 'index.html', buf, 'text/html; charset=utf-8');

      const version = await deployments.nextVersion(site.id);
      await deployments.create(site.id, version, 'index.html', 1, buf.length, {
        'index.html': url
      });

      return sendJson(res, 201, {
        site: {
          id: site.id,
          name: site.name,
          subdomain: site.subdomain,
          status: site.status,
          maintenance: false,
          url: `https://${site.subdomain}.${rootDomain}`
        }
      });
    }

    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('sites/index error', err);
    sendError(res, 500, 'Internal error');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}