import { sites, deployments } from '../../../lib/db.js';
import { getAuthedUser } from '../../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody } from '../../../lib/http.js';
import { uploadFile, contentTypeFor, deleteFiles } from '../../../lib/blob.js';
import config from '../../../lib/config.js';

const { rootDomain, maxFiles, maxTotalSize } = config;

function safeRelPath(name) {
  const parts = [];
  for (const seg of String(name).replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.' || seg === '..') continue;
    parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

export default async function handler(req, res) {
  noCache(res);
  const uid = await getAuthedUser(req);
  if (!uid) return sendError(res, 401, 'Unauthorized');

  const id = parseInt(req.query.id, 10);
  if (!id || Number.isNaN(id)) return sendError(res, 400, 'Invalid id');
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  try {
    const site = await sites.findById(id);
    if (!site || site.user_id !== uid) return sendError(res, 404, 'Site tidak ditemukan');
    if (site.status !== 'active') return sendError(res, 403, 'Site sedang dijeda');

    const body = await readJsonBody(req);
    const files = Array.isArray(body.files) ? body.files : null;
    if (!files || !files.length) return sendError(res, 400, 'Tidak ada file');
    if (files.length > maxFiles) {
      return sendError(res, 400, `Maksimal ${maxFiles} file per deploy`);
    }

    const prepared = [];
    let totalSize = 0;
    let hasIndex = false;

    for (const f of files) {
      if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') {
        return sendError(res, 400, 'Format file tidak valid');
      }
      const rel = safeRelPath(f.path);
      if (!rel) continue;
      let buf;
      try {
        buf = Buffer.from(f.content, 'base64');
      } catch {
        return sendError(res, 400, 'Base64 tidak valid pada ' + rel);
      }
      if (!buf.length) continue;
      totalSize += buf.length;
      if (totalSize > maxTotalSize) {
        return sendError(res, 413, 'Total ukuran melebihi batas (~3MB)');
      }
      if (rel === 'index.html' || rel === 'index.htm') hasIndex = true;
      prepared.push({ rel, buf });
    }

    if (!prepared.length) return sendError(res, 400, 'Tidak ada file valid');
    if (!hasIndex) return sendError(res, 400, 'Harus ada index.html di root');

    const prev = await deployments.latest(site.id);
    const filesMap = {};
    for (const { rel, buf } of prepared) {
      const url = await uploadFile(site.subdomain, rel, buf, contentTypeFor(rel));
      filesMap[rel] = url;
    }

    const version = await deployments.nextVersion(site.id);
    const dep = await deployments.create(
      site.id,
      version,
      'index.html',
      prepared.length,
      totalSize,
      filesMap
    );

    if (prev && prev.files_map) {
      const newUrls = Object.values(filesMap);
      const oldUrls = Object.values(prev.files_map).filter((u) => !newUrls.includes(u));
      if (oldUrls.length) await deleteFiles(oldUrls);
    }

    await sites.update(site.id, {});

    sendJson(res, 200, {
      deployment: {
        id: dep.id,
        version: dep.version,
        file_count: dep.file_count,
        size_bytes: Number(dep.size_bytes),
        created_at: Number(dep.created_at)
      },
      site_url: `https://${site.subdomain}.${rootDomain}`
    });
  } catch (err) {
    console.error('deploy error', err);
    sendError(res, 500, 'Internal error');
  }
}