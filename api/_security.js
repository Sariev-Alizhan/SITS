// /api/_security.js
// Shared security helpers. Имя начинается с _, Vercel игнорирует как endpoint.
//
// - rateLimit(): per-key sliding window через KV (fixed-window-аналог с короткими bucket'ами).
// - getClientIp(): IP клиента из x-forwarded-for.
// - timingSafeEqual(): сравнение секретов в постоянное время (защита от timing attack).
// - checkOrigin(): защита от CSRF — Origin/Referer должен совпадать со списком.
// - parseBody(): безопасный парс JSON с лимитом размера.

import crypto from 'node:crypto';

/**
 * Простой fixed-window rate limit на bucket'е.
 * @returns {{ok:boolean, remaining:number, resetSec:number}}
 */
// Хранилище KV отключено (перешли на Supabase). Rate-limit сейчас fail-open —
// не блокирует и не висит. Анти-абьюз формы держится на honeypot + time-trap в lead.js.
export async function rateLimit({ failOpen = true } = {}) {
  return { ok: failOpen, remaining: 0, resetSec: 0 };
}

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'] || '';
  const ip = xff.split(',')[0].trim();
  return ip || 'unknown';
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch { return false; }
}

/**
 * Защита от CSRF: проверяет, что Origin (или Referer) — из доверенного списка.
 * Если оба заголовка отсутствуют (curl, серверный POST) — пропускаем (allow).
 */
export function checkOrigin(req, allowedOrigins) {
  const o = req.headers.origin || '';
  const r = req.headers.referer || '';
  if (!o && !r) return true;
  try {
    const got = o || new URL(r).origin;
    const url = new URL(got);
    return allowedOrigins.includes(url.origin);
  } catch { return false; }
}

/**
 * Безопасный парс JSON-body с лимитом размера.
 * @param maxBytes — отсекаем дальше, защита от больших payload'ов.
 */
export function parseBody(req, maxBytes = 16 * 1024) {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (raw.length > maxBytes) {
    const err = new Error('Body too large');
    err.code = 413;
    throw err;
  }
  try { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { return {}; }
}

/**
 * Надёжное чтение JSON-body: сначала req.body (если рантайм распарсил),
 * иначе читаем сырой поток запроса. Работает независимо от рантайма Vercel.
 * ВАЖНО: вызывать ДО любого сетевого await, чтобы поток не потерялся.
 */
export async function readBody(req, maxBytes = 16 * 1024) {
  const b = req.body;
  if (b !== undefined && b !== null) {
    if (typeof b === 'string') { try { return JSON.parse(b || '{}'); } catch { return {}; } }
    if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8') || '{}'); } catch { return {}; } }
    if (typeof b === 'object') return b;
  }
  let data = '';
  try {
    for await (const chunk of req) {
      data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      if (data.length > maxBytes) { const e = new Error('Body too large'); e.code = 413; throw e; }
    }
  } catch (e) { if (e && e.code === 413) throw e; return {}; }
  try { return JSON.parse(data || '{}'); } catch { return {}; }
}
