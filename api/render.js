import { sites, deployments } from '../lib/db.js';

const RESERVED = new Set(['www', 'api']);

export default async function handler(req, res) {
  const sub = (req.query.sub || '').toString().toLowerCase();
  const rawPath = (req.query.path || '/').toString();

  if (!sub || RESERVED.has(sub)) return res.status(404).send('Not found');

  let cleanPath = rawPath.split('?')[0];
  if (cleanPath.includes('..') || cleanPath.includes('//') || cleanPath.includes('\\')) {
    return res.status(400).send('Bad request');
  }
  if (cleanPath === '' || cleanPath === '/') cleanPath = '/index.html';
  if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;

  let site;
  try {
    site = await sites.findBySubdomain(sub);
  } catch (err) {
    console.error('render db error', err);
    return res.status(500).send('Server error');
  }
  if (!site) return serveFallback(res, sub);

  let dep;
  try {
    dep = await deployments.latest(site.id);
  } catch (err) {
    console.error('render deploy lookup error', err);
    return res.status(500).send('Server error');
  }
  if (!dep || !dep.files_map) return serveFallback(res, sub);

  const requested = cleanPath.slice(1);
  let blobUrl = dep.files_map[requested];
  if (!blobUrl) {
    blobUrl = dep.files_map['index.html'];
    if (!blobUrl) return serveFallback(res, sub);
  }

  try {
    const response = await fetch(blobUrl);
    if (!response.ok) return res.status(502).send('Origin error');
    const contentType = response.headers.get('content-type') || guessType(requested);
    const isHtml = contentType.includes('text/html');
    const cacheControl = isHtml
      ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'
      : 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    const arrayBuf = await response.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuf));
  } catch (err) {
    console.error('render fetch error', err);
    res.status(502).send('Bad gateway');
  }
}

function guessType(path) {
  const ext = (path.match(/\.[^./]+$/) || [''])[0].toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

function serveFallback(res, sub) {
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const root = process.env.ROOT_DOMAIN || 'fastdev.my.id';
  res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(sub)} — Not Found</title>
<style>body{font-family:system-ui;background:#000;color:#ededed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}
h1{font-size:80px;font-weight:800;letter-spacing:-.05em;margin:0 0 8px;background:linear-gradient(180deg,#fff,#333);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
p{color:#888;margin:0 0 24px;font-size:15px}
a{background:#fff;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;display:inline-block}
code{font-family:ui-monospace,monospace;background:#111;padding:2px 6px;border-radius:4px;color:#ededed}</style></head>
<body><div><h1>404</h1><p>Subdomain <code>${escapeHtml(sub)}</code> belum terdaftar.</p>
<a href="https://${escapeHtml(root)}/">Kembali ke Beranda</a></div></body></html>`);
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