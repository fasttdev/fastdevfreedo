import { sites, deployments } from '../../lib/db.js';
import { getAuthedUser } from '../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody } from '../../lib/http.js';
import { deleteFiles } from '../../lib/blob.js';
import config from '../../lib/config.js';

const { rootDomain } = config;

async function ownSite(uid, id) {
  const site = await sites.findById(id);
  if (!site) return null;
  if (site.user_id !== uid) return null;
  return site;
}

function toSiteDto(site) {
  return {
    id: site.id,
    name: site.name,
    subdomain: site.subdomain,
    status: site.status,
    maintenance: Number(site.maintenance) === 1,
    custom_origin: site.custom_origin || null,
    dns_target: site.dns_target || null,
    dns_record_id: site.dns_record_id || null,
    created_at: Number(site.created_at),
    updated_at: Number(site.updated_at),
    url: `https://${site.subdomain}.${rootDomain}`
  };
}

function validateOrigin(input) {
  if (input === null || input === '') return { ok: true, value: null };
  const s = String(input).trim();
  if (!s) return { ok: true, value: null };
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: 'URL tidak valid. Contoh: https://project.vercel.app' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'URL harus http:// atau https://' };
  }
  return { ok: true, value: parsed.origin };
}

export default async function handler(req, res) {
  noCache(res);
  const uid = await getAuthedUser(req);
  if (!uid) return sendError(res, 401, 'Unauthorized');

  const id = parseInt(req.query.id, 10);
  if (!id || Number.isNaN(id)) return sendError(res, 400, 'Invalid id');

  try {
    const site = await ownSite(uid, id);
    if (!site) return sendError(res, 404, 'Site tidak ditemukan');

    if (req.method === 'GET') {
      const list = await deployments.listBySite(site.id);
      return sendJson(res, 200, {
        site: toSiteDto(site),
        deployments: list.map((d) => ({
          id: d.id,
          version: d.version,
          entry_file: d.entry_file,
          file_count: d.file_count,
          size_bytes: Number(d.size_bytes),
          created_at: Number(d.created_at)
        }))
      });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const update = {};
      if (body.name && typeof body.name === 'string') update.name = body.name.trim().slice(0, 60);
      if (body.status === 'active' || body.status === 'paused') update.status = body.status;
      if (typeof body.maintenance === 'boolean') update.maintenance = body.maintenance;

      if (Object.prototype.hasOwnProperty.call(body, 'custom_origin')) {
        const v = validateOrigin(body.custom_origin);
        if (!v.ok) return sendError(res, 400, v.error);
        update.custom_origin = v.value;
      }

      const updated = await sites.update(site.id, update);
      return sendJson(res, 200, { site: toSiteDto(updated) });
    }

    if (req.method === 'DELETE') {
      const latest = await deployments.latest(site.id);
      if (latest && latest.files_map) {
        await deleteFiles(Object.values(latest.files_map));
      }
      await sites.remove(site.id);
      return sendJson(res, 200, { ok: true });
    }

    return sendError(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('sites/[id] error', err);
    sendError(res, 500, 'Internal error');
  }
}