// /api/wa-deal-move.js — вручную передвинуть сделку по канбану.
// POST { phone, stage }
import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = ['https://sits-eta.vercel.app'];
const STAGES = ['new', 'dialog', 'qualified', 'quote', 'waiting_payment', 'won', 'lost'];

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `wa-move:${ip}`, limit: 200, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });

  let body;
  try { body = await readBody(req, 8 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });

  const phone = String(body.phone || '').replace(/\D/g, '');
  const stage = String(body.stage || '');
  if (!phone || !STAGES.includes(stage)) return res.status(400).json({ ok: false, error: 'Нужны phone и корректная stage' });
  if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });

  try {
    await db.update('wa_deals', `phone=eq.${phone}`, { stage, updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: true, phone, stage });
  } catch (e) {
    console.error('wa-deal-move:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Не удалось обновить' });
  }
}
