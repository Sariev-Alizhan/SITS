// /api/crm-ai.js — ИИ-ассистент для генерации КП (Claude Messages API через fetch).
// POST {prompt}  → {ok, kp:{client, company, contact, items:[{name,qty,price}], note, validity}}
// Защита: тот же логин команды (заголовки x-crm-login / x-crm-pass), rate-limit.
// Требует env ANTHROPIC_API_KEY. Модель: CRM_AI_MODEL (по умолчанию claude-opus-4-8).
// Без ключа возвращает {ok:false, code:'no_key'} — фича мягко отключена.

import { rateLimit, getClientIp, checkOrigin, readBody } from './_security.js';
import { authUser } from './_crm-auth.js';

const ALLOWED_ORIGINS = ['https://sariyev.com', 'https://www.sariyev.com', 'https://sits-eta.vercel.app'];

const CATALOG_HINT = `Ориентиры цен (₸; синхронизированы с прайсом сайта; можно корректировать под объём):
Лендинг 150000; Лендинг с фото/видео 200000; Лендинг+AI 200000; Лендинг+софт 250000; Лендинг+софт+AI 400000; Автоматизация бизнеса под ключ 1000000;
Внедрение CRM Fibonacci Control 150000; Настройка/поддержка CRM в мес 50000; Интеграция WhatsApp/Instagram/API 60000; Бизнес-автоматизация процессов 200000; Аудит и настройка бизнес-процессов 120000;
Мобильное приложение 2000000; Игра лёгкая веб 200000; Игра средняя 4000000;
AI Content Creator проект 500000; AI Love Story 250000;
Техподдержка классическая в мес 50000; Техподдержка с особым вниманием в мес 150000; Международные интеграции в год 2000000.`;

const SYSTEM = `Ты — ассистент компании SITS (бренд автоматизации — Fibonacci Control) по составлению коммерческих предложений (КП) на автоматизацию бизнеса, внедрение CRM и IT-услуги.
По описанию задачи клиента собери позиции КП с реалистичными ценами в тенге (₸).
${CATALOG_HINT}
Верни СТРОГО валидный JSON без markdown и пояснений, вида:
{"client":"имя контакта или пусто","company":"компания или пусто","contact":"телефон/@/email или пусто","items":[{"name":"услуга","qty":1,"price":150000}],"note":"условия: предоплата, срок, гарантия","validity":"14 дней"}
Правила: 3–7 позиций; qty целое ≥1; price число без пробелов; note кратко и по делу на русском; никаких других полей. Только JSON.`;

function extractJson(text) {
  if (!text) return null;
  const s = text.indexOf('{'); const e = text.lastIndexOf('}');
  if (s < 0 || e < s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = getClientIp(req);
  const rl = await rateLimit({ key: `crm-ai:${ip}`, limit: 30, windowSec: 300 });
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.resetSec || 60)); return res.status(429).json({ ok: false, error: 'Слишком много запросов' }); }

  if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false, error: 'Forbidden origin' });

  // ВАЖНО: тело читаем ДО сетевого authUser (ходит в БД) — иначе тело теряется.
  let body;
  try { body = await readBody(req, 8 * 1024); } catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
  const prompt = String(body.prompt || '').trim().slice(0, 3000);

  if (!(await authUser(req))) return res.status(401).json({ ok: false, error: 'Неверный логин или пароль' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ ok: false, code: 'no_key', error: 'ИИ-ассистент не настроен: добавьте ANTHROPIC_API_KEY в Vercel.' });

  if (!prompt) return res.status(400).json({ ok: false, error: 'Опишите задачу для КП' });

  const model = process.env.CRM_AI_MODEL || 'claude-opus-4-8';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Задача клиента: ${prompt}\n\nСобери КП. Ответь только JSON.` }],
      }),
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => '');
      console.error('anthropic error', r.status, errTxt.slice(0, 300));
      const msg = r.status === 401 ? 'Неверный ANTHROPIC_API_KEY' : r.status === 429 ? 'Лимит запросов к ИИ, попробуйте позже' : 'Ошибка ИИ-сервиса';
      return res.status(200).json({ ok: false, error: msg });
    }

    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const kp = extractJson(text);
    if (!kp || !Array.isArray(kp.items)) return res.status(200).json({ ok: false, error: 'ИИ вернул некорректный ответ, попробуйте переформулировать' });

    // санитизация
    const items = kp.items.slice(0, 12).map((it) => ({
      name: String(it.name || '').slice(0, 200),
      qty: Math.max(1, Math.min(100000, Math.round(Number(it.qty) || 1))),
      price: Math.max(0, Math.min(1e11, Math.round(Number(it.price) || 0))),
    })).filter((it) => it.name);

    return res.status(200).json({
      ok: true,
      kp: {
        client: String(kp.client || '').slice(0, 200),
        company: String(kp.company || '').slice(0, 200),
        contact: String(kp.contact || '').slice(0, 200),
        items,
        note: String(kp.note || '').slice(0, 2000),
        validity: String(kp.validity || '14 дней').slice(0, 80),
      },
    });
  } catch (e) {
    console.error('crm-ai error', e?.message || e);
    return res.status(200).json({ ok: false, error: 'Не удалось связаться с ИИ-сервисом' });
  }
}
