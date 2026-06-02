// /api/lead.js — приём заявки с сайта
// 1) сохраняет заявку в Vercel KV (для CRM)
// 2) присылает уведомление в Telegram
// Обе интеграции опциональны: если переменная не задана — шаг просто пропускается.

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { name = '', contact = '', service = '', details = '', website = '' } = body;

    // Honeypot: невидимое поле "website". Люди его не видят, боты заполняют.
    // Возвращаем 200 ok без сохранения — бот не поймёт, что отлуплен.
    if (website && String(website).trim().length > 0) {
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
      console.error('KV error:', e);
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
      console.error('Telegram error:', e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }
}
