import { put, del } from '@vercel/blob';

function basePrefix(subdomain) {
  return `sites/${subdomain}`;
}

export async function uploadFile(subdomain, relativePath, buffer, contentType) {
  const key = `${basePrefix(subdomain)}/${relativePath}`;
  const blob = await put(key, buffer, {
    access: 'public',
    contentType: contentType || 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true
  });
  return blob.url;
}

export async function deleteFiles(urls) {
  if (!urls || !urls.length) return;
  try {
    await del(urls);
  } catch {
    /* ignore */
  }
}

export function contentTypeFor(filePath) {
  const ext = (filePath.match(/\.[^./]+$/) || [''])[0].toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf'
  };
  return map[ext] || 'application/octet-stream';
}