// /api/wa-messages.js — переписка одного WhatsApp-контакта для CRM.
// GET ?phone=77071234567 → все сообщения по порядку.
import { rateLimit, getClientIp } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `wa-msg:${ip}`, limit: 240, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const phone = String(req.query.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });

  if (!dbReady()) return res.status(200).json({ ok: true, messages: [], cloud: false });
  try {
    const rows = await db.select(
      'wa_messages',
      `phone=eq.${phone}&select=id,role,text,created_at&order=created_at.asc&limit=1000`
    );
    return res.status(200).json({ ok: true, messages: rows || [], cloud: true });
  } catch (e) {
    console.error('wa-messages:', e?.message || e);
    return res.status(200).json({ ok: true, messages: [], cloud: false });
  }
}
