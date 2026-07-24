// /api/crm-deals.js — CRM сделки + КП для внутренней команды SITS (Fibonacci Control).
// GET  ?key=PASS                        → список всех сделок
// POST ?key=PASS  {action:'save', deal} → создать/обновить сделку (по deal.id)
// POST ?key=PASS  {action:'delete', id} → удалить сделку
// Защита: timing-safe пароль ADMIN_PASSWORD, rate-limit, Origin-check, лимит размера.
// Хранилище: Vercel KV, hash 'crm-deals' (поле = id, значение = JSON сделки).

import { kv } from '@vercel/kv';
import crypto from 'node:crypto';
import { rateLimit, getClientIp, timingSafeEqual, checkOrigin, parseBody } from './_security.js';
import { USERS } from './_crm-users.js';

const ALLOWED_ORIGINS = [
  'https://sits-eta.vercel.app',
];

const STATUSES = new Set(['new', 'in_progress', 'kp_sent', 'invoice', 'won', 'lost']);
const HKEY = 'crm-deals';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Возвращает {login,name} при успехе, иначе null.
function authUser(req) {
  const login = String(req.headers['x-crm-login'] || req.query.u || '').trim().toLowerCase();
  const pass = String(
    req.headers['x-crm-pass'] ||
    req.query.key ||
    (req.headers.authorization || '').replace('Bearer ', '')
  );
  if (!pass) return null;

  // Мастер-доступ владельца через env (совместимость с админкой)
  const master = process.env.ADMIN_PASSWORD || '';
  if (master && timingSafeEqual(pass, master)) {
    const u = USERS.find((x) => x.login === login);
    return { login: u ? u.login : (login || 'admin'), name: u ? u.name : 'Владелец' };
  }

  // Учётки команды: salted SHA-256, сравнение в постоянное время
  const u = USERS.find((x) => x.login === login);
  if (u && timingSafeEqual(sha256(u.salt + pass), u.hash)) {
    return { login: u.login, name: u.name };
  }
  return null;
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

  const user = authUser(req);
  if (!user) {
    const failRl = await rateLimit({ key: `crm-fail:${ip}`, limit: 8, windowSec: 300 });
    if (!failRl.ok) {
      res.setHeader('Retry-After', String(failRl.resetSec || 60));
      return res.status(429).json({ ok: false, error: 'Слишком много неудачных попыток. Подождите.' });
    }
    return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  }

  if (!process.env.KV_REST_API_URL) {
    return res.status(503).json({ ok: false, error: 'Хранилище не подключено (KV)' });
  }

  try {
    if (req.method === 'GET') {
      const map = (await kv.hgetall(HKEY)) || {};
      const deals = Object.values(map)
        .map((v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return res.status(200).json({ ok: true, deals, user });
    }

    if (req.method === 'POST') {
      if (!checkOrigin(req, ALLOWED_ORIGINS)) {
        return res.status(403).json({ ok: false, error: 'Forbidden origin' });
      }
      let body;
      try { body = parseBody(req, 32 * 1024); }
      catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }

      const action = body.action;

      if (action === 'delete') {
        const id = str(body.id, 40);
        if (!id) return res.status(400).json({ ok: false, error: 'Не передан id' });
        await kv.hdel(HKEY, id);
        return res.status(200).json({ ok: true });
      }

      if (action === 'save') {
        const deal = sanitizeDeal(body.deal || {});
        await kv.hset(HKEY, { [deal.id]: JSON.stringify(deal) });
        return res.status(200).json({ ok: true, deal });
      }

      return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('crm-deals error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
