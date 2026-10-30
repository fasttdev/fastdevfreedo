import { sql, sites, deployments } from '../lib/db.js';

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

  // Maintenance mode: serve maintenance page (kecuali kalau site-nya sendiri adalah 'maintenance')
  if (Number(site.maintenance) === 1 && site.subdomain !== 'maintenance') {
    return serveMaintenance(res, site);
  }

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

/* ============================================================
   MAINTENANCE PAGE
   ============================================================ */
async function serveMaintenance(res, site) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', '3600');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // Coba pakai konten dari site 'maintenance' kalau ada
  try {
    const rows = await sql`SELECT * FROM sites WHERE subdomain = 'maintenance' LIMIT 1`;
    const maintSite = rows[0];
    if (maintSite) {
      const dep = await deployments.latest(maintSite.id);
      if (dep && dep.files_map && dep.files_map['index.html']) {
        const response = await fetch(dep.files_map['index.html']);
        if (response.ok) {
          const html = await response.text();
          res.status(503).setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(html);
        }
      }
    }
  } catch (e) {
    console.error('maintenance lookup error', e);
  }

  // Fallback: halaman maintenance bawaan
  res.status(503).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildDefaultMaintenance(site));
}

function buildDefaultMaintenance(site) {
  const siteName = escapeHtml(site.name || '');
  const sub = escapeHtml(site.subdomain || '');
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Under Maintenance — ${siteName}</title>
<meta name="robots" content="noindex,nofollow">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#000;color:#ededed;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;line-height:1.5;-webkit-font-smoothing:antialiased;text-align:center}
.wrap{max-width:520px}
.icon{width:64px;height:64px;margin:0 auto 24px;background:#161616;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:32px;border:1px solid #333}
h1{font-size:clamp(24px,4vw,32px);font-weight:800;letter-spacing:-.03em;margin-bottom:12px;background:linear-gradient(180deg,#fff 0%,#666 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
p{color:#888;font-size:15px;margin-bottom:8px}
strong{color:#ededed;font-weight:600}
.meta{margin-top:32px;padding:14px 16px;background:#0a0a0a;border:1px solid #222;border-radius:12px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:#666;display:flex;align-items:center;justify-content:center;gap:8px}
.meta strong{padding:2px 6px;background:#222;border-radius:4px;color:#ededed}
.dot{width:8px;height:8px;background:#fa0;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
</style>
</head>
<body>
<div class="wrap">
  <div class="icon">🛠️</div>
  <h1>Sedang Dalam Perawatan</h1>
  <p>Situs <strong>${siteName}</strong> sedang menjalani perawatan.</p>
  <p>Silakan kembali lagi dalam beberapa saat.</p>
  <div class="meta">
    <span class="dot"></span>
    <span>Status:</span>
    <strong>maintenance</strong>
    <span>·</span>
    <span>${sub}.fastdev.my.id</span>
  </div>
</div>
</body>
</html>`;
}

/* ============================================================
   HELPERS
   ============================================================ */
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