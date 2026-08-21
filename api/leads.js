// /api/leads.js — заявки CRM-админки: список (GET) + удаление/статус (POST ?action=).
// Объединяет прежние lead-delete.js и lead-status.js (экономия слота функций Vercel).
// Защита: пароль ADMIN_PASSWORD (timing-safe), rate-limit по IP.

import { rateLimit, getClientIp, timingSafeEqual, readBody } from './_security.js';
import { db, dbReady } from './_db.js';

const ALLOWED_STATUS = new Set(['new', 'in_progress', 'closed']);

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `admin-rw:${ip}`, limit: 60, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  const provided = req.query.key || (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !timingSafeEqual(String(provided), expected)) {
    const failRl = await rateLimit({ key: `admin-fail:${ip}`, limit: 5, windowSec: 300 });
    if (!failRl.ok) { res.setHeader('Retry-After', String(failRl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много неудачных попыток. Подождите.' }); }
    return res.status(401).json({ ok: false, error: 'Неверный пароль' });
  }

  const action = req.query.action || (req.method === 'GET' ? 'list' : '');
  try {
    if (action === 'list') {
      let leads = [];
      if (dbReady()) {
        const rows = await db.select('leads', 'select=*&order=created_at.desc&limit=2000');
        leads = (rows || []).map((r) => { const { created_at, ...rest } = r; return { ...rest, createdAt: created_at, status: r.status || 'new' }; });
      }
      return res.status(200).json({ ok: true, leads });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    let body; try { body = await readBody(req, 4 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
    const { id, status } = body;
    if (!id || typeof id !== 'string') return res.status(400).json({ ok: false, error: 'Не передан id заявки' });
    if (!dbReady()) return res.status(503).json({ ok: false, error: 'База не подключена' });

    if (action === 'delete') {
      await db.remove('leads', `id=eq.${encodeURIComponent(id)}`);
      return res.status(200).json({ ok: true });
    }
    if (action === 'status') {
      if (!ALLOWED_STATUS.has(status)) return res.status(400).json({ ok: false, error: 'Недопустимый статус' });
      await db.update('leads', `id=eq.${encodeURIComponent(id)}`, { status });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) {
    console.error(e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
