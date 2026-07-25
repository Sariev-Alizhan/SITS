// /api/crm-outreach.js — список бизнесов для обзвона/проработки (вкладка «Обзвон»).
// GET                         → все записи
// POST {action:'save', item}  → создать/обновить (назначить исполнителя, статус, заметку)
// POST {action:'delete', id}  → удалить
// POST {action:'import', items:[...]} → массовый импорт из ресёрча
// Защита: тот же логин команды (authUser), rate-limit, Origin-check. Хранилище: Supabase 'call_list'.

import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = ['https://sits-eta.vercel.app'];
const STATUSES = new Set(['new', 'in_progress', 'done', 'rejected']);

const str = (v, max = 400) => String(v == null ? '' : v).slice(0, max);

function toRow(d = {}) {
  const row = {
    id: str(d.id, 80),
    name: str(d.name, 300),
    category: str(d.category, 160),
    segment: str(d.segment, 300),
    contact: str(d.contact, 500),
    contact_type: str(d.contactType || d.contact_type, 60),
    why: str(d.why, 800),
    source: str(d.source, 600),
    assignee: str(d.assignee, 120),
    status: STATUSES.has(d.status) ? d.status : 'new',
    note: str(d.note, 2000),
    strengths: str(d.strengths, 800),
    weaknesses: str(d.weaknesses, 800),
    gap: str(d.gap, 800),
    pain: str(d.pain, 600),
    recommendation: str(d.recommendation, 800),
    action_plan: str(d.actionPlan || d.action_plan, 1500),
    created_at: d.createdAt || d.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (d.ready !== undefined) row.ready = !!d.ready;
  if (d.verified !== undefined) row.verified = !!d.verified;
  if (d.channels && typeof d.channels === 'object') {
    const c = {}; const keys = ['instagram', 'whatsapp', 'phone', 'website', 'twogis', 'telegram', 'email'];
    for (const k of keys) if (d.channels[k]) c[k] = String(d.channels[k]).slice(0, 300);
    row.channels = c;
  }
  return row;
}
function fromRow(r) {
  return {
    id: r.id, name: r.name, category: r.category, segment: r.segment,
    contact: r.contact, contactType: r.contact_type, why: r.why, source: r.source,
    assignee: r.assignee, status: r.status, note: r.note,
    strengths: r.strengths, weaknesses: r.weaknesses, gap: r.gap, pain: r.pain,
    recommendation: r.recommendation, actionPlan: r.action_plan, channels: r.channels || {},
    ready: r.ready, verified: r.verified,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `outreach:${ip}`, limit: 150, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  // тело POST читаем ДО сетевого authUser
  let body = {};
  if (req.method === 'POST') {
    if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });
    try { body = await readBody(req, 1024 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
  }

  const user = await authUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });

  try {
    if (req.method === 'GET') {
      if (!dbReady()) return res.status(200).json({ ok: true, items: [], user, cloud: false });
      try {
        const rows = await db.select('call_list', 'select=*&order=created_at.asc&limit=6000');
        return res.status(200).json({ ok: true, items: (rows || []).map(fromRow), user, cloud: true });
      } catch (e) {
        console.error('outreach read error:', e?.message || e);
        return res.status(200).json({ ok: true, items: [], user, cloud: false });
      }
    }

    if (req.method === 'POST') {
      const action = body.action;

      if (action === 'save') {
        const row = toRow(body.item || {});
        if (!row.id || !row.name) return res.status(400).json({ ok: false, error: 'Нужны id и name' });
        let cloud = false;
        if (dbReady()) {
          try { await db.upsert('call_list', row); cloud = true; }
          catch (e) { console.error('outreach save error:', e?.message || e); }
        }
        return res.status(200).json({ ok: true, item: fromRow(row), cloud });
      }

      if (action === 'delete') {
        const id = str(body.id, 80);
        if (!id) return res.status(400).json({ ok: false, error: 'Нет id' });
        let cloud = false;
        if (dbReady()) {
          try { await db.remove('call_list', `id=eq.${encodeURIComponent(id)}`); cloud = true; }
          catch (e) { console.error('outreach delete error:', e?.message || e); }
        }
        return res.status(200).json({ ok: true, cloud });
      }

      if (action === 'import') {
        const items = Array.isArray(body.items) ? body.items.slice(0, 3000) : [];
        const rows = items.map(toRow).filter((r) => r.id && r.name);
        let imported = 0;
        if (dbReady() && rows.length) {
          try {
            for (let i = 0; i < rows.length; i += 200) {
              await db.upsertMany('call_list', rows.slice(i, i + 200));
              imported += Math.min(200, rows.length - i);
            }
          } catch (e) {
            console.error('outreach import error:', e?.message || e);
            return res.status(200).json({ ok: false, error: 'Ошибка импорта: ' + (e?.message || e), imported });
          }
        }
        return res.status(200).json({ ok: true, imported, cloud: dbReady() });
      }

      return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    console.error('outreach error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
