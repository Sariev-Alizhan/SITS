// /api/crm-deals.js — CRM сделки + КП для внутренней команды SITS (Fibonacci Control).
// GET  ?key=PASS                        → список всех сделок
// POST ?key=PASS  {action:'save', deal} → создать/обновить сделку (по deal.id)
// POST ?key=PASS  {action:'delete', id} → удалить сделку
// Защита: timing-safe пароль ADMIN_PASSWORD, rate-limit, Origin-check, лимит размера.
// Хранилище: Supabase Postgres, таблица 'deals' (PK = id).

import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = [
  'https://sits-eta.vercel.app',
];

const STATUSES = new Set(['new', 'in_progress', 'kp_sent', 'invoice', 'won', 'lost']);

// Маппинг camelCase (JS/фронт) ↔ snake_case (колонки Postgres)
function toRow(d) {
  const { createdAt, updatedAt, ...rest } = d;
  return { ...rest, created_at: createdAt, updated_at: updatedAt };
}
function fromRow(r) {
  const { created_at, updated_at, ...rest } = r;
  return { ...rest, createdAt: created_at, updatedAt: updated_at };
}

function num(v, max = 1e12) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}
function str(v, max = 300) {
  return String(v == null ? '' : v).slice(0, max);
}

function sanitizeDeal(d = {}) {
  const items = Array.isArray(d.items) ? d.items.slice(0, 40).map((it) => ({
    name: str(it.name, 200),
    qty: num(it.qty, 100000),
    price: num(it.price),
  })) : [];
  const total = items.reduce((s, it) => s + it.qty * it.price, 0);
  const status = STATUSES.has(d.status) ? d.status : 'new';
  return {
    id: str(d.id, 40) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
    no: str(d.no, 40),
    client: str(d.client, 200),
    company: str(d.company, 200),
    contact: str(d.contact, 200),
    manager: str(d.manager, 120),
    source: str(d.source, 120),
    items,
    total,
    currency: str(d.currency || '₸', 8),
    validity: str(d.validity, 80),
    note: str(d.note, 4000),
    status,
    createdAt: str(d.createdAt, 40) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  const ip = getClientIp(req);

  // общий rate-limit
  const rl = await rateLimit({ key: `crm:${ip}`, limit: 90, windowSec: 300 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.resetSec || 60));
    return res.status(429).json({ ok: false, error: 'Слишком много запросов' });
  }

  // ВАЖНО: тело POST читаем ДО сетевого authUser (ходит в БД) — иначе поток тела теряется.
  let body = {};
  if (req.method === 'POST') {
    if (!checkOrigin(req, ALLOWED_ORIGINS)) {
      return res.status(403).json({ ok: false, error: 'Forbidden origin' });
    }
    try { body = await readBody(req, 32 * 1024); }
    catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
  }

  const user = await authUser(req);
  if (!user) {
    const failRl = await rateLimit({ key: `crm-fail:${ip}`, limit: 8, windowSec: 300 });
    if (!failRl.ok) {
      res.setHeader('Retry-After', String(failRl.resetSec || 60));
      return res.status(429).json({ ok: false, error: 'Слишком много неудачных попыток. Подождите.' });
    }
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  try {
    if (req.method === 'GET') {
      if (!dbReady()) return res.status(200).json({ ok: true, deals: [], user, cloud: false });
      try {
        const rows = await db.select('deals', 'select=*&order=created_at.desc&limit=2000');
        const deals = (rows || []).map(fromRow);
        return res.status(200).json({ ok: true, deals, user, cloud: true });
      } catch (e) {
        console.error('db read error:', e?.message || e);
        return res.status(200).json({ ok: true, deals: [], user, cloud: false });
      }
    }

    if (req.method === 'POST') {

      const action = body.action;

      if (action === 'delete') {
        const id = str(body.id, 40);
        if (!id) return res.status(400).json({ ok: false, error: 'Не передан id' });
        let cloud = false;
        if (dbReady()) {
          try { await db.remove('deals', `id=eq.${encodeURIComponent(id)}`); cloud = true; }
          catch (e) { console.error('db delete error:', e?.message || e); }
        }
        return res.status(200).json({ ok: true, cloud });
      }

      if (action === 'save') {
        const deal = sanitizeDeal(body.deal || {});
        let cloud = false;
        if (dbReady()) {
          try { const saved = await db.upsert('deals', toRow(deal)); if (Array.isArray(saved) && saved[0]) Object.assign(deal, fromRow(saved[0])); cloud = true; }
          catch (e) { console.error('db save error:', e?.message || e); }
        }
        return res.status(200).json({ ok: true, deal, cloud });
      }

      return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('crm-deals error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
