// /api/wa-chats.js — список WhatsApp-чатов для CRM (вкладка «WhatsApp»).
// GET → контакты с последним сообщением и статусом бота.
import { rateLimit, getClientIp } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `wa-chats:${ip}`, limit: 180, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!dbReady()) return res.status(200).json({ ok: true, chats: [], cloud: false });
  try {
    const rows = await db.select(
      'wa_contacts',
      'select=phone,name,bot_enabled,service,last_text,last_role,last_at&order=last_at.desc&limit=500'
    );
    return res.status(200).json({ ok: true, chats: rows || [], cloud: true });
  } catch (e) {
    console.error('wa-chats:', e?.message || e);
    return res.status(200).json({ ok: true, chats: [], cloud: false });
  }
}
