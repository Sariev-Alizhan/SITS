// /api/wa-deals.js — сделки WhatsApp для канбан-доски в CRM.
import { rateLimit, getClientIp } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `wa-deals:${ip}`, limit: 180, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!dbReady()) return res.status(200).json({ ok: true, deals: [], cloud: false });
  try {
    const deals = await db.select('wa_deals', 'select=phone,name,title,service,budget,stage,note,updated_at&order=updated_at.desc&limit=1000');
    return res.status(200).json({ ok: true, deals: deals || [], cloud: true });
  } catch (e) {
    console.error('wa-deals:', e?.message || e);
    return res.status(200).json({ ok: true, deals: [], cloud: false });
  }
}
