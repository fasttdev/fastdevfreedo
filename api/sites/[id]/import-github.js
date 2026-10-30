import { unzipSync } from 'fflate';
import config from '../../../lib/config.js';
import { sites, deployments } from '../../../lib/db.js';
import { getAuthedUser } from '../../../lib/auth.js';
import { sendJson, sendError, noCache, readJsonBody } from '../../../lib/http.js';
import { uploadFile, contentTypeFor, deleteFiles } from '../../../lib/blob.js';

const { rootDomain, maxFiles, maxTotalSize, githubToken } = config;

const SKIP_DIRS = ['node_modules/', '.git/', '.github/', '.vscode/', '.idea/', '.next/', 'dist/', 'build/'];
const SKIP_FILES = ['.DS_Store', 'Thumbs.db', 'package-lock.json'];
const MAX_FILE_SIZE = 500 * 1024;
const MAX_ZIP_SIZE = 10 * 1024 * 1024;

function parseRepo(input) {
  const s = String(input || '').trim().replace(/\.git$/, '');
  const urlMatch = s.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const simpleMatch = s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (simpleMatch) return { owner: simpleMatch[1], repo: simpleMatch[2] };
  return null;
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
    const parsed = parseRepo(body.repo);
    if (!parsed) {
      return sendError(res, 400, 'Format repo tidak valid. Contoh: user/repo atau https://github.com/user/repo');
    }
    const { owner, repo } = parsed;
    const branch = String(body.branch || '').trim();

    const headers = {
      'User-Agent': 'Fortech-Deploy',
      'Accept': 'application/vnd.github+json'
    };
    if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

    const branchPath = branch ? `/${encodeURIComponent(branch)}` : '';
    const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball${branchPath}`;

    let zipRes;
    try {
      zipRes = await fetch(zipUrl, { headers, redirect: 'follow' });
    } catch (e) {
      return sendError(res, 502, 'Gagal fetch dari GitHub');
    }

    if (zipRes.status === 404) {
      return sendError(res, 404, `Repo ${owner}/${repo}${branch ? ' branch ' + branch : ''} tidak ditemukan`);
    }
    if (zipRes.status === 403) {
      return sendError(res, 429, 'Rate limit GitHub tercapai. Coba lagi nanti atau set GITHUB_TOKEN.');
    }
    if (!zipRes.ok) {
      return sendError(res, 502, `GitHub error: ${zipRes.status}`);
    }

    const contentLength = parseInt(zipRes.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_ZIP_SIZE) {
      return sendError(res, 413, 'Repo terlalu besar (>10MB). Gunakan repo dengan file lebih kecil.');
    }

    const arrayBuf = await zipRes.arrayBuffer();
    if (arrayBuf.byteLength > MAX_ZIP_SIZE) {
      return sendError(res, 413, 'Repo terlalu besar (>10MB).');
    }

    let files;
    try {
      files = unzipSync(new Uint8Array(arrayBuf));
    } catch (e) {
      return sendError(res, 400, 'Gagal ekstrak arsip. Pastikan repo valid.');
    }

    const paths = Object.keys(files);
    if (!paths.length) return sendError(res, 400, 'Repo kosong');

    let prefix = '';
    const firstSlash = paths[0].indexOf('/');
    if (firstSlash > 0) {
      const candidate = paths[0].slice(0, firstSlash + 1);
      if (paths.every((p) => p.startsWith(candidate))) prefix = candidate;
    }

    const prepared = [];
    let totalSize = 0;
    let hasIndex = false;

    for (const [path, data] of Object.entries(files)) {
      const rel = prefix ? path.slice(prefix.length) : path;
      if (!rel || rel.endsWith('/')) continue;
      if (SKIP_DIRS.some((d) => rel.startsWith(d))) continue;

      const baseName = rel.split('/').pop();
      if (SKIP_FILES.includes(baseName)) continue;
      if (data.length > MAX_FILE_SIZE) continue;

      totalSize += data.length;
      if (totalSize > maxTotalSize) {
        return sendError(res, 413, 'Total ukuran melebihi batas (~3MB). Repo terlalu besar.');
      }

      if (rel === 'index.html' || rel === 'index.htm') hasIndex = true;
      prepared.push({ rel, data });
    }

    if (!prepared.length) return sendError(res, 400, 'Tidak ada file yang bisa di-deploy');
    if (!hasIndex) {
      return sendError(res, 400, 'Repo tidak memiliki index.html di root');
    }
    if (prepared.length > maxFiles) {
      return sendError(res, 400, `Repo punya ${prepared.length} file, maksimal ${maxFiles} file`);
    }

    const prev = await deployments.latest(site.id);
    const filesMap = {};
    for (const { rel, data } of prepared) {
      const buf = Buffer.from(data);
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
    console.error('import-github error', err);
    sendError(res, 500, 'Internal error');
  }
}