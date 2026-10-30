export function sendJson(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(data));
}

export function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

export function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow);
  sendError(res, 405, 'Method not allowed');
}

export function noCache(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 50 * 1024 * 1024) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    methodNotAllowed(res, method);
    return false;
  }
  return true;
}