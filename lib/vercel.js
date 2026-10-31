const VERCEL_API = 'https://api.vercel.com';

function buildUrl(path, teamId) {
  const url = new URL(VERCEL_API + path);
  if (teamId) url.searchParams.set('teamId', teamId);
  return url.toString();
}

export async function createCnameRecord({ domain, name, target, token, teamId }) {
  if (!token) return { error: 'VERCEL_API_TOKEN belum diset', status: 500 };
  try {
    const res = await fetch(buildUrl(`/v2/domains/${encodeURIComponent(domain)}/records`, teamId), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type: 'CNAME', value: target, ttl: 60 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (data.error && data.error.message) || `HTTP ${res.status}`, status: res.status };
    }
    return { record: data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function updateCnameRecord({ domain, recordId, name, target, token, teamId }) {
  if (!token) return { error: 'VERCEL_API_TOKEN belum diset', status: 500 };
  try {
    const res = await fetch(buildUrl(`/v2/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(recordId)}`, teamId), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type: 'CNAME', value: target, ttl: 60 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (data.error && data.error.message) || `HTTP ${res.status}`, status: res.status };
    }
    return { record: data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function createTxtRecord({ domain, name, value, token, teamId }) {
  if (!token) return { error: 'VERCEL_API_TOKEN belum diset', status: 500 };
  try {
    const res = await fetch(buildUrl(`/v2/domains/${encodeURIComponent(domain)}/records`, teamId), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type: 'TXT', value, ttl: 60 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (data.error && data.error.message) || `HTTP ${res.status}`, status: res.status };
    }
    return { record: data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function updateTxtRecord({ domain, recordId, name, value, token, teamId }) {
  if (!token) return { error: 'VERCEL_API_TOKEN belum diset', status: 500 };
  try {
    const res = await fetch(buildUrl(`/v2/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(recordId)}`, teamId), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, type: 'TXT', value, ttl: 60 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: (data.error && data.error.message) || `HTTP ${res.status}`, status: res.status };
    }
    return { record: data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function deleteDnsRecord({ domain, recordId, token, teamId }) {
  if (!token) return { error: 'VERCEL_API_TOKEN belum diset', status: 500 };
  try {
    const res = await fetch(buildUrl(`/v2/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(recordId)}`, teamId), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      return { error: (data.error && data.error.message) || `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}