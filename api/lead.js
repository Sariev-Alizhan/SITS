// /api/lead.js — приём заявки с сайта
// 1) Anti-abuse: rate limit per-IP, Origin check, body-size guard, honeypot, time-trap
// 2) Сохраняет в Supabase (таблица leads) — для CRM/админки
// 3) Уведомляет в Telegram
// Обе интеграции опциональны: если переменная не задана — шаг просто пропускается.

import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { db, dbReady } from './_db.js';

const ALLOWED_ORIGINS = [
  'https://sariyev.com', 'https://www.sariyev.com', 'https://sits-eta.vercel.app',
  // при подключении кастомного домена — добавить сюда
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // --- Rate limit: 10 запросов / 5 минут на IP ---
  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `lead:${ip}`, limit: 10, windowSec: 300 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.resetSec || 60));
    return res.status(429).json({ ok: false, error: 'Слишком много запросов. Попробуйте позже.' });
  }

  try {
    let body;
    try { body = await readBody(req, 16 * 1024); }
    catch (e) { return res.status(e.code || 400).json({ ok: false, error: 'Bad request' }); }

    const { name = '', contact = '', service = '', details = '', website = '', formTime = 0 } = body;

    // --- Источник лида: site (по умолчанию), target (реклама), instagram, whatsapp, referral… ---
    // Лиды с таргета/вебхуков приходят сервер-к-серверу — им Origin-check не проходит, поэтому
    // разрешаем приём по секрет-токену (LEAD_INTAKE_TOKEN, фолбэк ADMIN_PASSWORD). Браузерные
    // заявки с сайта проверяем по Origin как раньше.
    const source = String(body.source || req.query.source || 'site').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'site';
    const campaign = String(body.campaign || req.query.campaign || '').replace(/[^\wа-яА-ЯёЁ .\-]/g, '').slice(0, 60).trim();
    const intakeToken = String(body.token || req.headers['x-lead-token'] || '');
    const secret = process.env.LEAD_INTAKE_TOKEN || process.env.ADMIN_PASSWORD || '';
    const serverIntake = !!(secret && intakeToken && intakeToken === secret);

    // --- Origin check (защита от browser-CSRF) — кроме доверенного серверного приёма по токену ---
    if (!serverIntake && !checkOrigin(req, ALLOWED_ORIGINS)) {
      return res.status(403).json({ ok: false, error: 'Forbidden origin' });
    }

    // --- Honeypot: невидимое поле "website". Боты заполняют — silent reject 200 ok. ---
    if (website && String(website).trim().length > 0) {
      return res.status(200).json({ ok: true });
    }

    // --- Time-trap: реальный человек не сабмитит форму за <1.5 секунды после загрузки. ---
    // (только для браузерных заявок — серверный приём таймингом не ограничиваем)
    const dt = Number(formTime);
    if (!serverIntake && dt && Date.now() - dt < 1500) {
      return res.status(200).json({ ok: true });
    }

    if (!name.trim() || !contact.trim()) {
      return res.status(400).json({ ok: false, error: 'Поля «Имя» и «Контакт» обязательны' });
    }

    // Источник упаковываем машинным тегом в начало details (без изменения схемы БД):
    // «[src:target]» или «[src:target|Кампания-осень]». Админка распознаёт его и рисует бейдж.
    const srcTag = (source && source !== 'site') ? `[src:${source}${campaign ? '|' + campaign : ''}] ` : '';
    const rawDetails = String(details).slice(0, 2000);

    const lead = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: String(name).slice(0, 200),
      contact: String(contact).slice(0, 200),
      service: String(service).slice(0, 200),
      details: (srcTag + rawDetails).slice(0, 2100),
      source,
      campaign,
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    // --- 1. Сохранить в Supabase (если подключено) ---
    try {
      if (dbReady()) {
        await db.insert('leads', {
          id: lead.id, name: lead.name, contact: lead.contact,
          service: lead.service, details: lead.details,
          status: lead.status, created_at: lead.createdAt,
        });
      }
    } catch (e) {
      console.error('DB error:', e?.message || e);
    }

    // --- 2. Уведомление в Telegram (если подключено) ---
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
        const srcLabels = { site: 'Сайт', target: 'Таргет/реклама', instagram: 'Instagram', whatsapp: 'WhatsApp', referral: 'Реферал' };
        const srcLine = lead.source && lead.source !== 'site'
          ? `\n🎯 Источник: ${srcLabels[lead.source] || lead.source}${lead.campaign ? ' · ' + lead.campaign : ''}` : '';
        const text =
          `🔔 Новая заявка — SITS${srcLine}\n\n` +
          `👤 Имя: ${lead.name}\n` +
          `📞 Контакт: ${lead.contact}\n` +
          `🧩 Услуга: ${lead.service || '—'}\n` +
          `📝 Описание: ${rawDetails || '—'}\n` +
          `🕒 ${new Date(lead.createdAt).toLocaleString('ru-RU')}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
      }
    } catch (e) {
      console.error('Telegram error:', e?.message || e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e?.message || e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
