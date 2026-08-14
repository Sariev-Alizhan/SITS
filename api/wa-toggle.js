// /api/wa-toggle.js — включить/выключить бота для конкретного WhatsApp-контакта.
// POST { phone, enabled } → wa_contacts.bot_enabled = enabled.
import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = ['https://sits-eta.vercel.app'];

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `wa-toggle:${ip}`, limit: 120, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });

  let body;
  try { body = await readBody(req, 8 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });

  const phone = String(body.phone || '').replace(/\D/g, '');
  const enabled = !!body.enabled;
  if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
  if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });

  try {
    await db.upsert('wa_contacts', { phone, bot_enabled: enabled, updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: true, phone, enabled });
  } catch (e) {
    console.error('wa-toggle:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Не удалось сохранить' });
  }
}
