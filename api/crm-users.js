// /api/crm-users.js — регистрация и управление доступами команды SITS CRM.
// Данные — в отдельной auth-базе (crm_users), см. _authdb.js.
// Роли: super_admin (только alizhan) → раздаёт админку; admin → одобряет людей; manager.
import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser, getAuthUser, sha256 } from './_crm-auth.js';
import { authDb, authDbReady } from './_authdb.js';
import crypto from 'node:crypto';

const ALLOWED_ORIGINS = ['https://sariyev.com', 'https://www.sariyev.com', 'https://sits-eta.vercel.app'];
const cleanLogin = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
const isAdmin = (u) => u && (u.role === 'admin' || u.role === 'super_admin');

export default async function handler(req, res) {
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `crmusers:${ip}`, limit: 60, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  let body = {};
  if (req.method === 'POST') {
    if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });
    try { body = await readBody(req, 64 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Некорректный запрос' }); }
  }
  const action = (req.method === 'POST' ? body.action : req.query.action) || '';

  if (!authDbReady()) return res.status(200).json({ ok: false, error: 'База пользователей не подключена' });

  try {
    // ── Публичные действия (без авторизации) ──
    if (action === 'register') {
      const login = cleanLogin(body.login);
      const name = String(body.name || '').trim().slice(0, 80);
      const pass = String(body.pass || '');
      if (login.length < 3) return res.status(400).json({ ok: false, error: 'Логин: минимум 3 символа (латиница/цифры)' });
      if (!name) return res.status(400).json({ ok: false, error: 'Укажите имя' });
      if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Пароль: минимум 6 символов' });
      const exists = await getAuthUser(login);
      if (exists) return res.status(409).json({ ok: false, error: 'Такой логин уже занят' });
      const salt = crypto.randomBytes(12).toString('hex');
      const hash = sha256(salt + pass);
      await authDb.insert('crm_users', {
        login, name, salt, hash, role: 'manager', status: 'pending',
        created_by: 'self', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, message: 'Заявка отправлена. Дождитесь подтверждения администратором.' });
    }

    if (action === 'signin') {
      // Чёткие сообщения для экрана входа (кто ждёт одобрения, а кто ошибся паролем).
      const login = cleanLogin(body.login);
      const pass = String(body.pass || '');
      const u = await getAuthUser(login);
      if (u && u.hash === sha256((u.salt || '') + pass)) {
        if (u.status !== 'active') return res.status(200).json({ ok: false, pending: true, error: 'Аккаунт ожидает подтверждения администратором.' });
        return res.status(200).json({ ok: true, user: { login: u.login, name: u.name, role: u.role || 'manager' } });
      }
      return res.status(200).json({ ok: false, error: 'Неверный логин или пароль' });
    }

    // ── Требуют авторизации ──
    const me = await authUser(req);
    if (!me) return res.status(401).json({ ok: false, error: 'Нужна авторизация' });

    // Подписка на push-уведомления (любой залогиненный менеджер)
    if (action === 'push_subscribe') {
      const sub = body.sub || {};
      if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return res.status(400).json({ ok: false, error: 'Некорректная подписка' });
      const manager = me.name || me.login;
      try { await authDb.remove('push_subs', `endpoint=eq.${encodeURIComponent(sub.endpoint)}`); } catch {}
      await authDb.insert('push_subs', { manager, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, created_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }
    if (action === 'push_unsubscribe') {
      const ep = String(body.endpoint || '');
      if (ep) { try { await authDb.remove('push_subs', `endpoint=eq.${encodeURIComponent(ep)}`); } catch {} }
      return res.status(200).json({ ok: true });
    }

    // ── Хранилище доступов команды («Доступы»: Instagram, реклама, домены и т.п.) ──
    // Пароли лежат в auth-базе (crm_vault), наружу отдаются только залогиненным по видимости.
    // visibility: 'all' — видят все в команде; 'admins' — только admin/super_admin.
    const VAULT_SETUP_SQL = "create table if not exists crm_vault (id text primary key, service text not null, login text, secret text, url text, note text, visibility text default 'admins', created_by text, created_at timestamptz default now(), updated_at timestamptz default now());";
    const isMissingTable = (e) => { const m = String(e && e.message || ''); return m.includes('42P01') || m.includes('schema cache') || m.includes(' 404'); };
    const vStr = (v, n = 500) => String(v == null ? '' : v).slice(0, n);

    if (action === 'vault_list') {
      try {
        const rows = await authDb.select('crm_vault', 'select=*&order=created_at.asc') || [];
        const admin = isAdmin(me);
        const items = rows
          .filter((r) => admin || (r.visibility || 'admins') === 'all')
          .map((r) => ({ id: r.id, service: r.service, login: r.login, secret: r.secret, url: r.url, note: r.note, visibility: r.visibility || 'admins', createdBy: r.created_by, updatedAt: r.updated_at }));
        return res.status(200).json({ ok: true, items, canEdit: admin });
      } catch (e) {
        if (isMissingTable(e)) return res.status(200).json({ ok: true, items: [], canEdit: isAdmin(me), needsSetup: true, sql: VAULT_SETUP_SQL });
        throw e;
      }
    }

    if (action === 'vault_save') {
      if (!isAdmin(me)) return res.status(403).json({ ok: false, error: 'Добавлять/менять доступы может только админ' });
      const d = body.item || {};
      const service = vStr(d.service, 120).trim();
      if (!service) return res.status(400).json({ ok: false, error: 'Укажите название сервиса (например, Instagram)' });
      const row = {
        id: vStr(d.id, 80) || ('v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
        service,
        login: vStr(d.login, 300),
        secret: vStr(d.secret, 500),
        url: vStr(d.url, 500),
        note: vStr(d.note, 2000),
        visibility: d.visibility === 'all' ? 'all' : 'admins',
        created_by: me.name || me.login,
        updated_at: new Date().toISOString(),
      };
      if (!d.id) row.created_at = new Date().toISOString();
      try {
        await authDb.upsert('crm_vault', row);
        return res.status(200).json({ ok: true, item: { id: row.id, service: row.service, login: row.login, secret: row.secret, url: row.url, note: row.note, visibility: row.visibility, createdBy: row.created_by, updatedAt: row.updated_at } });
      } catch (e) {
        if (isMissingTable(e)) return res.status(200).json({ ok: false, needsSetup: true, sql: VAULT_SETUP_SQL, error: 'Сначала создайте таблицу доступов (см. инструкцию).' });
        throw e;
      }
    }

    if (action === 'vault_delete') {
      if (!isAdmin(me)) return res.status(403).json({ ok: false, error: 'Удалять доступы может только админ' });
      const id = vStr(body.id, 80);
      if (!id) return res.status(400).json({ ok: false, error: 'Нет id' });
      try { await authDb.remove('crm_vault', `id=eq.${encodeURIComponent(id)}`); } catch (e) { if (!isMissingTable(e)) throw e; }
      return res.status(200).json({ ok: true });
    }

    // ── Действия только для админов ──

    if (action === 'list') {
      if (!isAdmin(me)) return res.status(403).json({ ok: false, error: 'Только для админов' });
      const users = await authDb.select('crm_users', 'select=login,name,role,status,created_by,created_at&order=created_at.asc');
      return res.status(200).json({ ok: true, users: users || [], me: { login: me.login, role: me.role } });
    }

    if (action === 'approve' || action === 'reject' || action === 'disable') {
      if (!isAdmin(me)) return res.status(403).json({ ok: false, error: 'Только админ одобряет доступы' });
      const login = cleanLogin(body.login);
      const target = await getAuthUser(login);
      if (!target) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
      if (target.role === 'super_admin') return res.status(403).json({ ok: false, error: 'Нельзя менять супер-админа' });
      const status = action === 'approve' ? 'active' : (action === 'disable' ? 'disabled' : 'rejected');
      if (action === 'reject') {
        await authDb.remove('crm_users', `login=eq.${encodeURIComponent(login)}`);
      } else {
        await authDb.update('crm_users', `login=eq.${encodeURIComponent(login)}`, { status, approved_by: me.login, updated_at: new Date().toISOString() });
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'setrole') {
      // Выдавать/снимать админку может ТОЛЬКО super_admin (alizhan).
      if (me.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'Выдавать админ-доступ может только владелец (alizhan)' });
      const login = cleanLogin(body.login);
      const role = ['admin', 'manager'].includes(body.role) ? body.role : null;
      if (!role) return res.status(400).json({ ok: false, error: 'Роль: admin или manager' });
      const target = await getAuthUser(login);
      if (!target) return res.status(404).json({ ok: false, error: 'Пользователь не найден' });
      if (target.role === 'super_admin') return res.status(403).json({ ok: false, error: 'Нельзя менять роль владельца' });
      await authDb.update('crm_users', `login=eq.${encodeURIComponent(login)}`, { role, updated_at: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) {
    console.error('crm-users:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка' });
  }
}
