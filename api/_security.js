// /api/_security.js
// Shared security helpers. Имя начинается с _, Vercel игнорирует как endpoint.
//
// - rateLimit(): per-key sliding window через KV (fixed-window-аналог с короткими bucket'ами).
// - getClientIp(): IP клиента из x-forwarded-for.
// - timingSafeEqual(): сравнение секретов в постоянное время (защита от timing attack).
// - checkOrigin(): защита от CSRF — Origin/Referer должен совпадать со списком.
// - parseBody(): безопасный парс JSON с лимитом размера.

import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

/**
 * Простой fixed-window rate limit на bucket'е.
 * @returns {{ok:boolean, remaining:number, resetSec:number}}
 */
export async function rateLimit({ key, limit, windowSec, failOpen = true }) {
  if (!process.env.KV_REST_API_URL) {
    return { ok: failOpen, remaining: 0, resetSec: 0 };
  }
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const k = `rl:${key}:${bucket}`;
  try {
    const count = await kv.incr(k);
    if (count === 1) await kv.expire(k, windowSec + 1);
    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSec: (bucket + 1) * windowSec - Math.floor(Date.now() / 1000),
    };
  } catch (e) {
    console.error('rateLimit kv error:', e?.message || e);
    return { ok: failOpen, remaining: 0, resetSec: 0 };
  }
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
