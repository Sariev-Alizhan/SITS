// /api/_authdb.js — доступ к отдельной "auth"-базе Supabase (проект SITS):
// таблицы crm_users (регистрация/роли) и chat_managers (привязка менеджера к чату).
// Живые чаты/сделки остаются в основной базе (_db.js) — эту базу не трогаем.
// Требует env: AUTH_SUPABASE_URL, AUTH_SUPABASE_KEY.

const URL = process.env.AUTH_SUPABASE_URL || '';
const KEY = process.env.AUTH_SUPABASE_KEY || '';

export const authDbReady = () => !!(URL && KEY);

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('authdb timeout')), ms))]);
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
    throw new Error(`authdb ${r.status}: ${t.slice(0, 200)}`);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

export const authDb = {
  select: (table, query = 'select=*') => req(`${table}?${query}`),
  upsert: (table, row) => req(table, { method: 'POST', body: [row], prefer: 'resolution=merge-duplicates,return=representation' }),
  insert: (table, row) => req(table, { method: 'POST', body: [row], prefer: 'return=representation' }),
  update: (table, query, patch) => req(`${table}?${query}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' }),
  remove: (table, query) => req(`${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' }),
};
