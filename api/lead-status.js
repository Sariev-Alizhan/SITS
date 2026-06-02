// /api/lead-status.js — обновление статуса заявки в CRM.
// POST { id, status } + auth via ADMIN_PASSWORD (header Authorization: Bearer ... or ?key=).
// Статусы хранятся в отдельном хэше `lead-statuses` — список `leads` не трогаем,
// поэтому старые заявки и API остаются совместимыми.

import { kv } from '@vercel/kv';

const ALLOWED = new Set(['new', 'in_progress', 'closed']);

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
    const { id, status } = body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Не передан id заявки' });
    }
    if (!ALLOWED.has(status)) {
      return res.status(400).json({ ok: false, error: 'Недопустимый статус' });
    }

    if (process.env.KV_REST_API_URL) {
      await kv.hset('lead-statuses', { [id]: status });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
