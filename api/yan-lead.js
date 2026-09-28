// /api/yan-lead.js — клик «Написать в WhatsApp» со страницы /yan (реклама @yan.expert.service).
// Пересылает клик в Apps Script «Лиды WhatsApp — yan.expert.service» (аккаунт raimzhan1907),
// который пишет строку во вкладку «Лиды WhatsApp» таблицы «ЯН разбор ресторана / спа».
import { getClientIp, checkOrigin, readBody } from './_security.js';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwZW3Op75X3orzmHdjWlDT8CG3WXHvvBkfqHyDGKi_TcdxckH9OV_VVq6PN6QhJK6LW/exec';
const SCRIPT_TOKEN = 'yan-wa-7f3k';
const ALLOWED_ORIGINS = ['https://sariyev.com', 'https://www.sariyev.com', 'https://sits-eta.vercel.app'];
// Apps Script после простоя «просыпается» 8–15 с — отсюда длинный таймаут.
export const config = { maxDuration: 30 };

const BOT_UA = /facebookexternalhit|facebookcatalog|meta-externalagent|bot|crawler|spider|preview/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body;
  try { body = await readBody(req, 4 * 1024); } catch { return res.status(400).json({ ok: false }); }
  if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false });
  if (BOT_UA.test(req.headers['user-agent'] || '')) return res.status(200).json({ ok: true, skipped: 'bot' });

  const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
  const code = clean(body.code, 16).replace(/[^A-Z0-9]/gi, '');
  if (!code) return res.status(400).json({ ok: false });

  const params = new URLSearchParams({
    t: SCRIPT_TOKEN, code,
    cr: body.cr === 'rest' ? 'rest' : 'spa',
    ad: clean(body.ad, 120), adset: clean(body.adset, 120), campaign: clean(body.campaign, 120),
    placement: clean(body.placement, 60), device: clean(body.device, 20),
  });
  try {
    const r = await fetch(`${SCRIPT_URL}?${params}`, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const text = await r.text();
    let j = {}; try { j = JSON.parse(text); } catch { /* HTML-ответ Google */ }
    if (!j.ok) console.error('yan-lead: script answered', r.status, r.url.slice(0, 60), text.slice(0, 200));
    return res.status(200).json({ ok: !!j.ok });
  } catch (e) {
    console.error('yan-lead', getClientIp(req), e && e.message);
    return res.status(502).json({ ok: false });
  }
}
