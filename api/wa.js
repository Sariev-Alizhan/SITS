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
    try { body = await readBody(req, 10 * 1024 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Файл слишком большой (лимит ~4 МБ)' }); }
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
    if (req.method === 'POST' && action === 'send') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      const type = ['text', 'image', 'audio', 'video', 'document'].includes(body.type) ? body.type : 'text';
      const text = String(body.text || '').slice(0, 4000);
      const filename = String(body.filename || '').slice(0, 200);
      let media_url = '';
      if (type !== 'text') {
        if (!body.dataBase64) return res.status(400).json({ ok: false, error: 'Нет файла' });
        const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const ext = { image: 'jpg', audio: 'ogg', video: 'mp4', document: (filename.split('.').pop() || 'bin') }[type];
        const path = `${phone}/${Date.now()}.${ext}`;
        const up = await fetch(`${url}/storage/v1/object/wa-media/${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': body.mimetype || 'application/octet-stream' },
          body: Buffer.from(body.dataBase64, 'base64'),
        });
        if (!up.ok) return res.status(500).json({ ok: false, error: 'Не удалось загрузить файл' });
        media_url = `${url}/storage/v1/object/public/wa-media/${path}`;
      }
      if (type === 'text' && !text) return res.status(400).json({ ok: false, error: 'Пустое сообщение' });
      const id = 'ob-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await db.insert('wa_outbox', { id, phone, type, text, media_url, filename, status: 'pending', created_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) {
    console.error('wa:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
