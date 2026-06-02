// /api/lead-delete.js — удаление заявки из CRM.
// Защита: timing-safe пароль, rate-limit на провалы.

import { kv } from '@vercel/kv';
import { rateLimit, getClientIp, timingSafeEqual, parseBody } from './_security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `admin-write:${ip}`, limit: 60, windowSec: 300 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.resetSec || 60));
    return res.status(429).json({ ok: false, error: 'Слишком много запросов' });
  }

  const provided =
    req.query.key ||
    (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.ADMIN_PASSWORD || '';

  if (!expected || !timingSafeEqual(String(provided), expected)) {
    const failRl = await rateLimit({ key: `admin-fail:${ip}`, limit: 5, windowSec: 300 });
    if (!failRl.ok) {
      res.setHeader('Retry-After', String(failRl.resetSec || 60));
      return res.status(429).json({ ok: false, error: 'Слишком много неудачных попыток. Подождите.' });
    }
    return res.status(401).json({ ok: false, error: 'Неверный пароль' });
  }

  try {
    let body;
    try { body = parseBody(req, 4 * 1024); }
    catch (e) { return res.status(e.code || 400).json({ ok: false, error: 'Bad request' }); }

    const { id } = body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Не передан id заявки' });
    }

    if (!process.env.KV_REST_API_URL) {
      return res.status(503).json({ ok: false, error: 'KV не подключён' });
    }

    // Найти точную JSON-строку записи (нужна для LREM по значению)
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
    if (target != null) removed = await kv.lrem('leads', 1, target);
    try { await kv.hdel('lead-statuses', id); } catch { /* ok */ }

    return res.status(200).json({ ok: true, removed });
  } catch (e) {
    console.error(e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
