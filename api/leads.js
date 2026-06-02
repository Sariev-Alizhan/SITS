// /api/leads.js — отдаёт список заявок для CRM-админки.
// Защита простым паролем из переменной ADMIN_PASSWORD.

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const pass =
    req.query.key ||
    (req.headers.authorization || '').replace('Bearer ', '');

  if (!process.env.ADMIN_PASSWORD || pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Неверный пароль' });
  }

  try {
    let leads = [];
    if (process.env.KV_REST_API_URL) {
      const [raw, statuses] = await Promise.all([
        kv.lrange('leads', 0, 1000),
        kv.hgetall('lead-statuses').catch(() => ({})),
      ]);
      leads = (raw || [])
        .map((r) => {
          try { return typeof r === 'string' ? JSON.parse(r) : r; }
          catch { return null; }
        })
        .filter(Boolean)
        .map((l) => ({ ...l, status: (statuses && statuses[l.id]) || l.status || 'new' }));
    }
    return res.status(200).json({ ok: true, leads });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
