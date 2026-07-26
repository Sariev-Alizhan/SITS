// /api/lead-status.js — обновление статуса заявки в CRM.
// Защита: timing-safe пароль, rate-limit на провалы.

import { rateLimit, getClientIp, timingSafeEqual, readBody } from './_security.js';
import { db, dbReady } from './_db.js';

const ALLOWED = new Set(['new', 'in_progress', 'closed']);

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
    try { body = await readBody(req, 4 * 1024); }
    catch (e) { return res.status(e.code || 400).json({ ok: false, error: 'Bad request' }); }

    const { id, status } = body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Не передан id заявки' });
    }
    if (!ALLOWED.has(status)) {
      return res.status(400).json({ ok: false, error: 'Недопустимый статус' });
    }

    if (dbReady()) {
      await db.update('leads', `id=eq.${encodeURIComponent(id)}`, { status });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
