// /api/wa.js — единый эндпоинт WhatsApp-канбана для CRM (укладываемся в лимит функций Hobby).
// GET  ?action=chats | ?action=deals | ?action=messages&phone=...
// POST { action:'toggle', phone, enabled } | { action:'move', phone, stage }
import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = ['https://sits-eta.vercel.app'];
const STAGES = ['new', 'dialog', 'qualified', 'quote', 'waiting_payment', 'won', 'lost'];

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `wa:${ip}`, limit: 300, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  let body = {};
  if (req.method === 'POST') {
    if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });
    try { body = await readBody(req, 8 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
  }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });

  const action = (req.method === 'POST' ? body.action : req.query.action) || '';
  if (!dbReady() && ['chats', 'messages', 'deals'].includes(action)) {
    return res.status(200).json({ ok: true, chats: [], messages: [], deals: [], cloud: false });
  }

  try {
    if (req.method === 'GET' && action === 'chats') {
      const chats = await db.select('wa_contacts', 'select=phone,name,bot_enabled,service,last_text,last_role,last_at&order=last_at.desc&limit=500');
      return res.status(200).json({ ok: true, chats: chats || [], cloud: true });
    }
    if (req.method === 'GET' && action === 'deals') {
      const deals = await db.select('wa_deals', 'select=phone,name,title,service,budget,stage,note,updated_at&order=updated_at.desc&limit=1000');
      return res.status(200).json({ ok: true, deals: deals || [], cloud: true });
    }
    if (req.method === 'GET' && action === 'messages') {
      const phone = String(req.query.phone || '').replace(/\D/g, '');
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
      const messages = await db.select('wa_messages', `phone=eq.${phone}&select=id,role,text,created_at&order=created_at.asc&limit=1000`);
      return res.status(200).json({ ok: true, messages: messages || [], cloud: true });
    }
    if (req.method === 'POST' && action === 'toggle') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const enabled = !!body.enabled;
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      await db.upsert('wa_contacts', { phone, bot_enabled: enabled, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, phone, enabled });
    }
    if (req.method === 'POST' && action === 'move') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const stage = String(body.stage || '');
      if (!phone || !STAGES.includes(stage)) return res.status(400).json({ ok: false, error: 'Нужны phone и корректная stage' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      await db.update('wa_deals', `phone=eq.${phone}`, { stage, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, phone, stage });
    }
    return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) {
    console.error('wa:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
