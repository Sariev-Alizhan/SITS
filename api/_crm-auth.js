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
import { authDb, authDbReady } from './_authdb.js';

// Роль по умолчанию для хардкод-пользователей (fallback, если новой базы нет).
const DEFAULT_ROLE = (login) => (login === 'alizhan' ? 'super_admin' : 'manager');

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

// Запись пользователя из новой auth-базы (crm_users) или null.
export async function getAuthUser(login) {
  if (!authDbReady() || !login) return null;
  try {
    const rows = await authDb.select('crm_users', `select=login,name,salt,hash,role,status&login=eq.${encodeURIComponent(login)}&limit=1`);
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  } catch { return null; }
}

// Проверяет login+pass. Возвращает {login,name,role} или спец-значения:
//   { pending:true } — пользователь есть, но не одобрен; null — нет/неверный пароль.
export async function verifyUser(login, pass) {
  if (!pass || !login) return null;
  // 1) Новая база crm_users (регистрация/роли) — приоритет.
  const au = await getAuthUser(login);
  if (au) {
    const match = au.hash && timingSafeEqual(sha256((au.salt || '') + pass), au.hash);
    if (match) {
      if (au.status && au.status !== 'active') return { pending: true, status: au.status };
      return { login: au.login, name: au.name || au.login, role: au.role || 'manager' };
    }
    // Пароль не совпал с crm_users — НЕ отказываем сразу: возможно, человек менял
    // пароль в старой базе (crm_creds). Падаем в fallback ниже. Роль возьмём из crm_users.
  }
  // 2) Fallback: хардкод USERS + crm_creds (совместимость — вход не ломаем).
  const u = USERS.find((x) => x.login === login);
  if (!u) return null;
  const ov = await dbOverride(login);
  const salt = ov ? ov.salt : u.salt;
  const hash = ov ? ov.hash : u.hash;
  if (timingSafeEqual(sha256(salt + pass), hash)) {
    if (au && au.status && au.status !== 'active') return { pending: true, status: au.status };
    return { login: u.login, name: u.name, role: (au && au.role) || DEFAULT_ROLE(u.login) };
  }
  return null;
}

// Полная авторизация из запроса. Возвращает {login,name,role} или null (в т.ч. для pending).
export async function authUser(req) {
  const { login, pass } = readCreds(req);
  if (!pass) return null;
  const master = process.env.ADMIN_PASSWORD || '';
  if (master && timingSafeEqual(pass, master)) {
    const u = USERS.find((x) => x.login === login);
    return { login: u ? u.login : (login || 'admin'), name: u ? u.name : 'Владелец', role: 'super_admin' };
  }
  const v = await verifyUser(login, pass);
  if (v && v.pending) return null;   // не одобренные — не пускаем в защищённые эндпоинты
  return v;
}
