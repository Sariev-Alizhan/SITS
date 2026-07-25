// /api/_crm-auth.js — общая авторизация CRM.
// Порядок проверки пароля:
//   1) мастер-пароль владельца (env ADMIN_PASSWORD) — совместимость с админкой;
//   2) персональный пароль из Supabase (таблица crm_creds), если пользователь его менял;
//   3) дефолтный пароль из _crm-users.js (первый пароль — Demo1234).
// Всё сравнение — в постоянное время (timing-safe).

import crypto from 'node:crypto';
import { timingSafeEqual } from './_security.js';
import { USERS } from './_crm-users.js';
import { db, dbReady } from './_db.js';

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function readCreds(req) {
  const login = String(req.headers['x-crm-login'] || (req.query && req.query.u) || '').trim().toLowerCase();
  const pass = String(
    req.headers['x-crm-pass'] ||
    (req.query && req.query.key) ||
    (req.headers.authorization || '').replace('Bearer ', '')
  );
  return { login, pass };
}

// Возвращает персональную запись {salt,hash} из БД или null.
async function dbOverride(login) {
  if (!dbReady()) return null;
  try {
    const rows = await db.select('crm_creds', `select=salt,hash&login=eq.${encodeURIComponent(login)}&limit=1`);
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  } catch {
    return null;
  }
}

// Проверяет login+pass. Возвращает {login,name} базового пользователя или null.
export async function verifyUser(login, pass) {
  if (!pass) return null;
  const u = USERS.find((x) => x.login === login);
  if (!u) return null;
  const ov = await dbOverride(login);
  const salt = ov ? ov.salt : u.salt;
  const hash = ov ? ov.hash : u.hash;
  if (timingSafeEqual(sha256(salt + pass), hash)) return { login: u.login, name: u.name };
  return null;
}

// Полная авторизация из запроса. Возвращает {login,name} или null.
export async function authUser(req) {
  const { login, pass } = readCreds(req);
  if (!pass) return null;
  const master = process.env.ADMIN_PASSWORD || '';
  if (master && timingSafeEqual(pass, master)) {
    const u = USERS.find((x) => x.login === login);
    return { login: u ? u.login : (login || 'admin'), name: u ? u.name : 'Владелец' };
  }
  return verifyUser(login, pass);
}
