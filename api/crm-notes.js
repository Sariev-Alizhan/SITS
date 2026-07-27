// /api/crm-notes.js — общая доска заметок команды (вкладка «Заметки»).
// GET → все заметки; POST {action:'add', text} / {action:'delete', id} / {action:'pin', id, pinned}
// Автор берётся с сервера из authUser (подделать нельзя). Хранилище: Supabase 'team_notes'.

import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';
import crypto from 'node:crypto';

const ALLOWED_ORIGINS = ['https://sits-eta.vercel.app'];
const str = (v, m = 4000) => String(v == null ? '' : v).slice(0, m);
const fromRow = (r) => ({ id: r.id, author: r.author, text: r.text, pinned: !!r.pinned, createdAt: r.created_at });

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `notes:${ip}`, limit: 120, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  let body = {};
  if (req.method === 'POST') {
    if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });
    try { body = await readBody(req, 32 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
  }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });

  try {
    if (req.method === 'GET') {
      if (!dbReady()) return res.status(200).json({ ok: true, notes: [], user, cloud: false });
      try {
        const rows = await db.select('team_notes', 'select=*&order=pinned.desc,created_at.desc&limit=500');
        return res.status(200).json({ ok: true, notes: (rows || []).map(fromRow), user, cloud: true });
      } catch (e) {
        console.error('notes read error:', e?.message || e);
        return res.status(200).json({ ok: true, notes: [], user, cloud: false });
      }
    }

    if (req.method === 'POST') {
      const action = body.action;
      if (action === 'add') {
        const text = str(body.text, 4000).trim();
        if (!text) return res.status(400).json({ ok: false, error: 'Пустая заметка' });
        const row = { id: 'nt-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), author: str(user.name || user.login, 120), text, pinned: false, created_at: new Date().toISOString() };
        let cloud = false;
        if (dbReady()) { try { await db.insert('team_notes', row); cloud = true; } catch (e) { console.error('notes add error:', e?.message || e); return res.status(200).json({ ok: false, error: 'Не удалось сохранить (проверьте таблицу team_notes)' }); } }
        return res.status(200).json({ ok: true, note: fromRow(row), cloud });
      }
      if (action === 'delete') {
        const id = str(body.id, 80); if (!id) return res.status(400).json({ ok: false, error: 'Нет id' });
        let cloud = false;
        if (dbReady()) { try { await db.remove('team_notes', `id=eq.${encodeURIComponent(id)}`); cloud = true; } catch (e) { console.error('notes delete:', e?.message || e); } }
        return res.status(200).json({ ok: true, cloud });
      }
      if (action === 'pin') {
        const id = str(body.id, 80); if (!id) return res.status(400).json({ ok: false, error: 'Нет id' });
        if (dbReady()) { try { await db.update('team_notes', `id=eq.${encodeURIComponent(id)}`, { pinned: !!body.pinned }); } catch (e) { console.error('notes pin:', e?.message || e); } }
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
    }
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('notes error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
