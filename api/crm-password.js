// /api/crm-password.js — смена собственного пароля пользователем CRM.
// POST {newPass}  (текущие логин/пароль — в заголовках x-crm-login / x-crm-pass)
// Новый пароль сохраняется в Supabase (crm_creds) и перекрывает дефолт из _crm-users.js.
// Защита: авторизация текущим паролём, rate-limit, Origin-check, лимит длины.

import crypto from 'node:crypto';
import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser, sha256 } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = ['https://sits-eta.vercel.app'];
const DEFAULT_PASSWORD = 'Demo1234';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `crm-pass:${ip}`, limit: 12, windowSec: 600 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много попыток' }); }

  if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });

  // ВАЖНО: читаем body ДО любого сетевого await (authUser ходит в БД) — иначе тело теряется.
  let body;
  try { body = await readBody(req, 4 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
  const newPass = String(body.newPass || '');
  if (newPass.length < 6) return res.status(400).json({ ok: false, error: 'Новый пароль — минимум 6 символов' });
  if (newPass.length > 200) return res.status(400).json({ ok: false, error: 'Слишком длинный пароль' });

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  if (!dbReady()) return res.status(503).json({ ok: false, error: 'База недоступна — смена пароля временно невозможна' });

  const salt = crypto.randomBytes(12).toString('hex');
  const hash = sha256(salt + newPass);
  try {
    await db.upsert('crm_creds', { login: user.login, salt, hash, updated_at: new Date().toISOString() });
  } catch {
    return res.status(500).json({ ok: false, error: 'Не удалось сохранить пароль' });
  }
  const backToDefault = newPass === DEFAULT_PASSWORD;
  return res.status(200).json({ ok: true, message: backToDefault ? 'Пароль сброшен на стандартный' : 'Пароль изменён' });
}
