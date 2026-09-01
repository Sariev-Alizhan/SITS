// /api/wa.js — единый эндпоинт WhatsApp-канбана для CRM (укладываемся в лимит функций Hobby).
// GET  ?action=chats | ?action=deals | ?action=messages&phone=...
// POST { action:'toggle', phone, enabled } | { action:'move', phone, stage }
import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';
import { db, dbReady } from './_db.js';
import { authDb, authDbReady } from './_authdb.js';

// Рабочие окна созвонов (время Астаны): Пн–Пт 09:00–20:00, Сб–Вс/праздники 13:00–16:30.
const KZ_HOLIDAYS = new Set(['01-01', '01-02', '03-08', '03-21', '03-22', '03-23', '05-01', '05-07', '05-09', '07-06', '08-30', '10-25', '12-16']);
function callWindowOK(dateStr, timeStr) {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  if (!Y || !M || !D || Number.isNaN(h) || Number.isNaN(mi)) return false;
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
  const mins = h * 60 + mi;
  const weekend = dow === 0 || dow === 6 || KZ_HOLIDAYS.has(String(M).padStart(2, '0') + '-' + String(D).padStart(2, '0'));
  return weekend ? (mins >= 13 * 60 && mins <= 16 * 60 + 30) : (mins >= 9 * 60 && mins <= 20 * 60);
}

// Карта phone→менеджер из отдельной auth-базы (chat_managers).
async function managerMap() {
  if (!authDbReady()) return {};
  try {
    const rows = await authDb.select('chat_managers', 'select=phone,manager&limit=5000');
    const m = {}; (rows || []).forEach((r) => { if (r.manager) m[r.phone] = r.manager; });
    return m;
  } catch { return {}; }
}

const ALLOWED_ORIGINS = ['https://sariyev.com', 'https://www.sariyev.com', 'https://sits-eta.vercel.app'];
const STAGES = ['new', 'dialog', 'qualified', 'call_invited', 'quote', 'contract_invited', 'waiting_payment', 'won', 'lost'];

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
  if (!dbReady() && ['chats', 'messages', 'deals', 'calls', 'schedule'].includes(action)) {
    return res.status(200).json({ ok: true, chats: [], messages: [], deals: [], calls: [], cloud: false });
  }

  try {
    if (req.method === 'GET' && action === 'chats') {
      const chats = await db.select('wa_contacts', 'select=phone,name,bot_enabled,hidden,service,last_text,last_role,last_at&order=last_at.desc&limit=500') || [];
      const mm = await managerMap();
      chats.forEach((c) => { c.manager = mm[c.phone] || null; });
      return res.status(200).json({ ok: true, chats, cloud: true });
    }
    if (req.method === 'GET' && action === 'managers') {
      let managers = [];
      if (authDbReady()) { try { managers = await authDb.select('crm_users', 'select=login,name&status=eq.active&order=name.asc') || []; } catch {} }
      return res.status(200).json({ ok: true, managers });
    }
    if (req.method === 'POST' && action === 'assign') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const manager = String(body.manager || '').slice(0, 80);
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
      if (!authDbReady()) return res.status(200).json({ ok: false, error: 'База пользователей не подключена' });
      await authDb.upsert('chat_managers', { phone, manager: manager || null, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, phone, manager });
    }
    if (req.method === 'GET' && action === 'stats') {
      const deals = await db.select('wa_deals', 'select=phone,stage,budget&limit=5000') || [];
      const mm = await managerMap();
      const agg = {};
      for (const d of deals) {
        const m = mm[d.phone] || '— не назначен';
        agg[m] = agg[m] || { manager: m, total: 0, won: 0, sum: 0 };
        agg[m].total++;
        if (d.stage === 'won') { agg[m].won++; agg[m].sum += Number(String(d.budget || '').replace(/[^\d.]/g, '')) || 0; }
      }
      return res.status(200).json({ ok: true, stats: Object.values(agg).sort((a, b) => b.sum - a.sum) });
    }
    // Разбивка «сколько продавцы обработали по дням»: за каждый день — сколько диалогов вёл менеджер
    // (по его ответам role=agent), сколько ответов, сколько новых сделок и сколько закрыто.
    // Данные берём из существующих таблиц (wa_messages/wa_deals) + карта chat_managers — без изменения схемы.
    if (req.method === 'GET' && action === 'stats_daily') {
      // Период: либо days=N (последние N дней), либо произвольный from/to (YYYY-MM-DD, по Астане).
      const days = Math.min(366, Math.max(1, Number(req.query.days) || 30));
      const reDate = /^\d{4}-\d{2}-\d{2}$/;
      const qFrom = reDate.test(String(req.query.from || '')) ? String(req.query.from) : '';
      const qTo = reDate.test(String(req.query.to || '')) ? String(req.query.to) : '';
      // Астана = UTC+5: локальная дата D начинается в (D-1)T19:00Z.
      let sinceISO, untilISO = null;
      if (qFrom && qTo && qFrom <= qTo) {
        sinceISO = new Date(new Date(qFrom + 'T00:00:00Z').getTime() - 5 * 3600000).toISOString();
        untilISO = new Date(new Date(qTo + 'T00:00:00Z').getTime() + (24 - 5) * 3600000).toISOString();
        if (new Date(untilISO) - new Date(sinceISO) > 366 * 86400000) sinceISO = new Date(new Date(untilISO).getTime() - 366 * 86400000).toISOString();
      } else {
        sinceISO = new Date(Date.now() - days * 86400000).toISOString();
      }
      const untilFilter = untilISO ? `&created_at=lt.${untilISO}` : '';
      // Астана = UTC+5 без перевода часов → ключ дня получаем сдвигом на +5ч.
      const dayKey = (ts) => new Date(new Date(ts).getTime() + 5 * 3600000).toISOString().slice(0, 10);
      const mm = await managerMap();
      const map = {}; // 'day|manager' → { date, manager, chats:Set, msgs, newDeals, won }
      const cell = (date, manager) => {
        const k = date + '|' + manager;
        if (!map[k]) map[k] = { date, manager, chats: new Set(), msgs: 0, newDeals: 0, won: 0, firstTs: null, lastTs: null };
        return map[k];
      };
      // «Во сколько работал»: первое/последнее сообщение менеджера за день (Астана, ЧЧ:ММ)
      const hhmm = (ts) => new Date(new Date(ts).getTime() + 5 * 3600000).toISOString().slice(11, 16);
      // Ответы менеджеров (role=agent) — постранично, чтобы обойти max-rows Supabase.
      for (let offset = 0; offset < 60000; offset += 1000) {
        const chunk = await db.select('wa_messages', `role=eq.agent&created_at=gte.${sinceISO}${untilFilter}&select=phone,created_at&order=created_at.asc&limit=1000&offset=${offset}`);
        if (!chunk || !chunk.length) break;
        for (const m of chunk) {
          const mgr = mm[m.phone] || '— не назначен';
          const c = cell(dayKey(m.created_at), mgr);
          c.chats.add(m.phone); c.msgs++;
          if (!c.firstTs || m.created_at < c.firstTs) c.firstTs = m.created_at;
          if (!c.lastTs || m.created_at > c.lastTs) c.lastTs = m.created_at;
        }
        if (chunk.length < 1000) break;
      }
      // Новые сделки и закрытия по дням.
      const deals = await db.select('wa_deals', `select=phone,stage,created_at,updated_at&limit=5000`) || [];
      const inRange = (ts) => ts && ts >= sinceISO && (!untilISO || ts < untilISO);
      for (const d of deals) {
        const mgr = mm[d.phone] || '— не назначен';
        if (inRange(d.created_at)) cell(dayKey(d.created_at), mgr).newDeals++;
        if (d.stage === 'won' && inRange(d.updated_at)) cell(dayKey(d.updated_at), mgr).won++;
      }
      const rows = Object.values(map)
        .map((c) => ({ date: c.date, manager: c.manager, chats: c.chats.size, msgs: c.msgs, newDeals: c.newDeals, won: c.won, from: c.firstTs ? hhmm(c.firstTs) : '', to: c.lastTs ? hhmm(c.lastTs) : '' }))
        .sort((a, b) => (a.date === b.date ? b.chats - a.chats : b.date.localeCompare(a.date)));
      return res.status(200).json({ ok: true, days, rows });
    }
    if (req.method === 'GET' && action === 'deals') {
      const deals = await db.select('wa_deals', 'select=phone,name,title,service,budget,stage,note,updated_at&order=updated_at.desc&limit=1000');
      return res.status(200).json({ ok: true, deals: deals || [], cloud: true });
    }
    if (req.method === 'GET' && action === 'calls') {
      const calls = await db.select('wa_calls', 'select=id,phone,name,scheduled_at,topic,status&order=scheduled_at.asc&limit=500');
      return res.status(200).json({ ok: true, calls: calls || [], cloud: true });
    }
    // Общее командное расписание созвонов (все менеджеры видят, любой добавляет).
    // Участники/ссылка/автор упакованы в поле topic как JSON — без изменения схемы БД.
    if (req.method === 'GET' && action === 'schedule') {
      const calls = await db.select('wa_calls', 'select=id,phone,name,scheduled_at,topic,status&order=scheduled_at.asc&limit=1000');
      return res.status(200).json({ ok: true, calls: calls || [], cloud: true });
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
    if (req.method === 'POST' && action === 'hide') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const hidden = !!body.hidden;
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      await db.upsert('wa_contacts', { phone, hidden, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, phone, hidden });
    }
    if (req.method === 'POST' && action === 'move') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const stage = String(body.stage || '');
      if (!phone || !STAGES.includes(stage)) return res.status(400).json({ ok: false, error: 'Нужны phone и корректная stage' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      await db.update('wa_deals', `phone=eq.${phone}`, { stage, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, phone, stage });
    }
    // Менеджер сам вписывает цену/бюджет сделки из чата (поле «Цена» в панели).
    if (req.method === 'POST' && action === 'budget') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const budget = String(body.budget == null ? '' : body.budget).slice(0, 100);
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет phone' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      const now = new Date().toISOString();
      const ex = await db.select('wa_deals', `phone=eq.${phone}&select=phone`);
      if (ex && ex.length) await db.update('wa_deals', `phone=eq.${phone}`, { budget, updated_at: now });
      else await db.insert('wa_deals', { phone, budget, stage: 'new', title: 'Заявка WhatsApp', created_at: now, updated_at: now });
      return res.status(200).json({ ok: true, phone, budget });
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
      // Удобство: ответил в незакреплённый чат → чат автоматически закрепляется за тобой
      // (менеджеры забывают назначать себя — статистика оставалась «не назначен»).
      let assigned = null;
      try {
        if (authDbReady()) {
          const cur = await authDb.select('chat_managers', `phone=eq.${phone}&select=manager`);
          if (!cur || !cur.length || !cur[0].manager) {
            assigned = String(user.name || user.login || '').slice(0, 80);
            if (assigned) await authDb.upsert('chat_managers', { phone, manager: assigned, updated_at: new Date().toISOString() });
          }
        }
      } catch {}
      return res.status(200).json({ ok: true, assigned });
    }
    if (req.method === 'POST' && action === 'new_chat') {
      // Менеджер начинает диалог с новым клиентом по номеру.
      const phone = String(body.phone || '').replace(/\D/g, '');
      const name = String(body.name || '').slice(0, 120).trim();
      const text = String(body.text || '').slice(0, 4000).trim();
      if (phone.length < 10) return res.status(400).json({ ok: false, error: 'Некорректный номер' });
      if (!text) return res.status(400).json({ ok: false, error: 'Пустое сообщение' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      const now = new Date().toISOString();
      const contact = { phone, bot_enabled: false, last_text: text, last_role: 'agent', last_at: now, updated_at: now };
      if (name) contact.name = name;
      await db.upsert('wa_contacts', contact);
      const id = 'ob-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await db.insert('wa_outbox', { id, phone, type: 'text', text, media_url: '', filename: '', status: 'pending', created_at: now });
      // Начал диалог сам → чат сразу закрепляется за тобой.
      try {
        if (authDbReady()) {
          const mgr = String(user.name || user.login || '').slice(0, 80);
          if (mgr) await authDb.upsert('chat_managers', { phone, manager: mgr, updated_at: now });
        }
      } catch {}
      return res.status(200).json({ ok: true, phone });
    }
    if (req.method === 'POST' && action === 'add_call') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const name = String(body.name || '').slice(0, 200);
      const dt = String(body.datetime || '').trim();
      const topic = String(body.topic || '').slice(0, 500);
      if (!phone) return res.status(400).json({ ok: false, error: 'Нет номера' });
      const m = dt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
      if (!m) return res.status(400).json({ ok: false, error: 'Некорректная дата/время' });
      if (!callWindowOK(m[1], m[2])) return res.status(400).json({ ok: false, error: 'Время вне рабочих окон (Пн–Пт 09:00–20:00, Сб–Вс 13:00–16:30)' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      const iso = new Date(`${m[1]}T${m[2]}:00+05:00`).toISOString();
      const id = 'call-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await db.insert('wa_calls', { id, phone, name, scheduled_at: iso, topic, chat_phone: phone, status: 'scheduled', created_at: new Date().toISOString() });
      return res.status(200).json({ ok: true, id });
    }
    if (req.method === 'POST' && action === 'del_call') {
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ ok: false, error: 'Нет id' });
      if (dbReady()) await db.remove('wa_calls', `id=eq.${encodeURIComponent(id)}`);
      return res.status(200).json({ ok: true });
    }
    // Добавить/изменить созвон в общем расписании (гибко: телефон и время — по желанию, участники + ссылка).
    if (req.method === 'POST' && action === 'sched_add') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      const name = String(body.name || '').slice(0, 200);
      const dt = String(body.datetime || '').trim();
      const topic = String(body.topic || '').slice(0, 500);
      const link = String(body.link || '').slice(0, 500);
      const invited = Array.isArray(body.invited) ? body.invited.map((x) => String(x).slice(0, 80)).filter(Boolean).slice(0, 20) : [];
      const m = dt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
      if (!m) return res.status(400).json({ ok: false, error: 'Укажите дату и время' });
      if (!dbReady()) return res.status(200).json({ ok: false, error: 'CRM (Supabase) не подключён' });
      const iso = new Date(`${m[1]}T${m[2]}:00+05:00`).toISOString();
      const createdBy = String(user.name || user.login || '').slice(0, 80);
      // Пакуем тему + ссылку + участников + автора в поле topic (JSON), чтобы не менять схему wa_calls.
      const meta = JSON.stringify({ t: topic, link, invited, by: createdBy });
      const row = { phone, name, scheduled_at: iso, topic: meta, chat_phone: phone, status: 'scheduled' };
      let id = String(body.id || '');
      if (id) { await db.update('wa_calls', `id=eq.${encodeURIComponent(id)}`, row); }
      else { id = 'call-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); row.id = id; row.created_at = new Date().toISOString(); await db.insert('wa_calls', row); }
      return res.status(200).json({ ok: true, id });
    }
    if (req.method === 'POST' && action === 'sched_status') {
      const id = String(body.id || '');
      const status = String(body.status || '').slice(0, 40);
      if (!id) return res.status(400).json({ ok: false, error: 'Нет id' });
      if (dbReady()) await db.update('wa_calls', `id=eq.${encodeURIComponent(id)}`, { status });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) {
    console.error('wa:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
