// /api/lead.js — приём заявки с сайта
// 1) Anti-abuse: rate limit per-IP, Origin check, body-size guard, honeypot, time-trap
// 2) Сохраняет в Vercel KV (для CRM)
// 3) Уведомляет в Telegram
// Обе интеграции опциональны: если переменная не задана — шаг просто пропускается.

import { kv } from '@vercel/kv';
import { rateLimit, getClientIp, checkOrigin, parseBody } from './_security.js';

const ALLOWED_ORIGINS = [
  'https://sits-eta.vercel.app',
  // при подключении кастомного домена — добавить сюда
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // --- Origin check (защита от browser-CSRF) ---
  if (!checkOrigin(req, ALLOWED_ORIGINS)) {
    return res.status(403).json({ ok: false, error: 'Forbidden origin' });
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
    try { body = parseBody(req, 16 * 1024); }
    catch (e) { return res.status(e.code || 400).json({ ok: false, error: 'Bad request' }); }

    const { name = '', contact = '', service = '', details = '', website = '', formTime = 0 } = body;

    // --- Honeypot: невидимое поле "website". Боты заполняют — silent reject 200 ok. ---
    if (website && String(website).trim().length > 0) {
      return res.status(200).json({ ok: true });
    }

    // --- Time-trap: реальный человек не сабмитит форму за <1.5 секунды после загрузки. ---
    const dt = Number(formTime);
    if (dt && Date.now() - dt < 1500) {
      return res.status(200).json({ ok: true });
    }

    if (!name.trim() || !contact.trim()) {
      return res.status(400).json({ ok: false, error: 'Поля «Имя» и «Контакт» обязательны' });
    }

    const lead = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: String(name).slice(0, 200),
      contact: String(contact).slice(0, 200),
      service: String(service).slice(0, 200),
      details: String(details).slice(0, 2000),
      createdAt: new Date().toISOString(),
      status: 'new',
    };

    // --- 1. Сохранить в KV (если подключено) ---
    try {
      if (process.env.KV_REST_API_URL) {
        await kv.lpush('leads', JSON.stringify(lead));
      }
    } catch (e) {
      console.error('KV error:', e?.message || e);
    }

    // --- 2. Уведомление в Telegram (если подключено) ---
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
        const text =
          `🔔 Новая заявка — SITS\n\n` +
          `👤 Имя: ${lead.name}\n` +
          `📞 Контакт: ${lead.contact}\n` +
          `🧩 Услуга: ${lead.service || '—'}\n` +
          `📝 Описание: ${lead.details || '—'}\n` +
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
