// /api/lead-delete.js — удаление заявки из CRM.
// POST { id } + auth via ADMIN_PASSWORD.
// 1) Находит запись в списке `leads` по id, делает LREM с точной JSON-строкой.
// 2) Удаляет статус-override из хэша `lead-statuses` (HDEL).

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const pass =
    req.query.key ||
    (req.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.ADMIN_PASSWORD || pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Неверный пароль' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { id } = body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Не передан id заявки' });
    }

    if (!process.env.KV_REST_API_URL) {
      return res.status(503).json({ ok: false, error: 'KV не подключён' });
    }

    // Найти точную строку записи (нужна для LREM по значению)
    const raw = await kv.lrange('leads', 0, 5000);
    let target = null;
    for (const r of raw || []) {
      try {
        const item = typeof r === 'string' ? JSON.parse(r) : r;
        if (item && item.id === id) {
          target = typeof r === 'string' ? r : JSON.stringify(r);
          break;
        }
      } catch { /* skip malformed */ }
    }

    let removed = 0;
    if (target != null) {
      removed = await kv.lrem('leads', 1, target);
    }
    // Снять status-override (если был)
    try { await kv.hdel('lead-statuses', id); } catch { /* ok */ }

    return res.status(200).json({ ok: true, removed });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
