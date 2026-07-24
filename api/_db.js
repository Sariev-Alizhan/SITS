// /api/_db.js — доступ к Supabase Postgres через REST (PostgREST), без SDK.
// Требует env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (секрет — только на сервере).
// dbReady() === false, если переменные не заданы → код работает в режиме "без облака".

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

export const dbReady = () => !!(URL && KEY);

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('db timeout')), ms))]);
}

async function req(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  const r = await withTimeout(fetch(`${URL}/rest/v1/${path}`, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  }), 5000);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`supabase ${r.status}: ${t.slice(0, 200)}`);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

export const db = {
  // query — строка PostgREST, напр. 'select=*&order=created_at.desc&limit=1000'
  select: (table, query = 'select=*') => req(`${table}?${query}`),
  upsert: (table, row) => req(table, { method: 'POST', body: [row], prefer: 'resolution=merge-duplicates,return=representation' }),
  insert: (table, row) => req(table, { method: 'POST', body: [row], prefer: 'return=representation' }),
  update: (table, query, patch) => req(`${table}?${query}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' }),
  remove: (table, query) => req(`${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' }),
};
