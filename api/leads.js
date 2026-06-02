// /api/leads.js — отдаёт список заявок для CRM-админки.
// Защита: пароль ADMIN_PASSWORD сравнивается timing-safe, попытки rate-limit'нуты по IP.

import { kv } from '@vercel/kv';
import { rateLimit, getClientIp, timingSafeEqual } from './_security.js';

export default async function handler(req, res) {
  // --- Rate-limit любых попыток (success или нет): 30 / 5 мин на IP ---
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `admin-read:${ip}`, limit: 30, windowSec: 300 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.resetSec || 60));
    return res.status(429).json({ ok: false, error: 'Слишком много запросов' });
  }

  const provided =
    req.query.key ||
    (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.ADMIN_PASSWORD || '';

  if (!expected || !timingSafeEqual(String(provided), expected)) {
    // Отдельный rate-limit на провальные попытки: 5 / 5 мин на IP — против brute-force
    const failRl = await rateLimit({ key: `admin-fail:${ip}`, limit: 5, windowSec: 300 });
    if (!failRl.ok) {
      res.setHeader('Retry-After', String(failRl.resetSec || 60));
      return res.status(429).json({ ok: false, error: 'Слишком много неудачных попыток. Подождите.' });
    }
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
    console.error(e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
