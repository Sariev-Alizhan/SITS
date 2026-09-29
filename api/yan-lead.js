// /api/yan-lead.js — заявка из формы на странице /yan (реклама @yan.expert.service): ФИО, телефон, 2ГИС, комментарий.
// Пересылает заявку в Apps Script «Лиды WhatsApp — yan.expert.service» (аккаунт raimzhan1907),
// который пишет строку во вкладку «Лиды WhatsApp» таблицы «ЯН разбор ресторана / спа».
import { getClientIp, checkOrigin, readBody } from './_security.js';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwZW3Op75X3orzmHdjWlDT8CG3WXHvvBkfqHyDGKi_TcdxckH9OV_VVq6PN6QhJK6LW/exec';
const SCRIPT_TOKEN = 'yan-wa-7f3k';
const ALLOWED_ORIGINS = ['https://sariyev.com', 'https://www.sariyev.com', 'https://sits-eta.vercel.app'];
// Apps Script обычно отвечает за 3–6 с, но изредка «просыпается» 30+ с. Клиента это не задерживает
// (страница шлёт keepalive-запрос и сразу уходит в WhatsApp), поэтому ждём до ~55 с.
export const config = { maxDuration: 60 };

// Сети Meta (AS32934): проверяющие роботы Meta открывают страницу с уже подставленными метками.
// Настоящий клик идёт с IP самого человека (страница шлёт запрос из его браузера).
const META_NETS = ['31.13.24.0/21','31.13.64.0/18','45.64.40.0/22','57.141.0.0/16','57.144.0.0/14','66.220.144.0/20',
  '69.63.176.0/20','69.171.224.0/19','74.119.76.0/22','102.132.96.0/20','103.4.96.0/22','129.134.0.0/16','157.240.0.0/16',
  '163.70.128.0/17','173.252.64.0/18','179.60.192.0/22','185.60.216.0/22','185.89.216.0/22','204.15.20.0/22'];
const ip4 = s => s.split('.').reduce((a, o) => (a << 8) + (+o), 0) >>> 0;
function isMetaIp(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return /^2a03:2880:/i.test(ip);
  const n = ip4(ip);
  return META_NETS.some(c => { const [b, m] = c.split('/'); const mask = m == 0 ? 0 : (~0 << (32 - m)) >>> 0; return (n & mask) === (ip4(b) & mask); });
}
// Meta иногда отдаёт названия дважды закодированными («Grohe+180+%D1%82…») — раскодируем.
function decodeTwice(v) {
  let s = String(v || '');
  for (let k = 0; k < 2 && /%[0-9A-F]{2}|\+/i.test(s); k++) { try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { break; } }
  return s;
}

const KIND_LABEL = { rest: 'Ресторан / кафе', spa: 'SPA', banya: 'Баня / сауна', other: 'Отель / другое' };

const BOT_UA = /facebookexternalhit|facebookcatalog|meta-externalagent|headless|lighthouse|\bbot\b|bot\/|crawler|spider|preview/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body;
  try { body = await readBody(req, 8 * 1024); } catch { return res.status(400).json({ ok: false }); }
  if (!checkOrigin(req, ALLOWED_ORIGINS)) return res.status(403).json({ ok: false });
  if (BOT_UA.test(req.headers['user-agent'] || '')) return res.status(200).json({ ok: true, skipped: 'bot' });

  // Заявку заполняет живой человек, поэтому метки рекламы не обязательны (органические заходы тоже лиды).
  // От ботов: скрытое поле-ловушка, слишком быстрая отправка, IP сетей Meta.
  if (body.website) return res.status(200).json({ ok: true, skipped: 'honeypot' });
  if (Number(body.ms) > 0 && Number(body.ms) < 1500) return res.status(200).json({ ok: true, skipped: 'fast' });
  if (isMetaIp(getClientIp(req))) return res.status(200).json({ ok: true, skipped: 'meta-ip' });
  const phoneDigits = String(body.phone || '').replace(/\D/g, '');
  // quick — «Сразу написать в WhatsApp» без формы: имя и телефон не обязательны.
  const quick = Number(body.quick) === 1;
  if (!quick && (String(body.name || '').trim().length < 2 || phoneDigits.length < 10)) return res.status(400).json({ ok: false, error: 'form' });
  const utm = v => (String(v || '').includes('{{') ? '' : v);

  const strip = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
  const clean = (v, n) => strip(decodeTwice(v), n); // только для меток рекламы: Meta кодирует их дважды
  // Текст, начинающийся с = + - @, таблица приняла бы за формулу — апостроф делает его обычным текстом (сам апостроф не виден).
  const txt = v => (/^[=+\-@]/.test(v) ? "'" + v : v);
  const code = strip(body.code, 16).replace(/[^A-Z0-9]/gi, '');
  if (!code) return res.status(400).json({ ok: false });

  const params = new URLSearchParams({
    t: SCRIPT_TOKEN, code, quick: quick ? '1' : '',
    // Тип заведения, который выбрал клиент, — в колонку «Направление». Без выбора (старая версия страницы) — по объявлению.
    cr: KIND_LABEL[body.kind] || (body.cr === 'rest' ? 'rest' : 'spa'),
    ad: clean(utm(body.ad), 120), adset: clean(utm(body.adset), 120), campaign: clean(utm(body.campaign), 120),
    placement: clean(utm(body.placement), 60) || 'Сайт', device: strip(body.device, 20),
    name: txt(strip(body.name, 120).replace(/\s+/g, ' ').trim()), phone: phoneDigits ? '+' + phoneDigits.slice(0, 15) : '', gis: txt(strip(body.gis, 300).trim()),
    note: txt(String(body.note || '').replace(/[\u0000-\u0009\u000b-\u001f<>]/g, '').trim().slice(0, 1000)),
  });
  // Apps Script иногда отвечает 404/HTML или «просыпается» дольше обычного — одна повторная попытка.
  // Дубли исключены: скрипт не пишет код, который уже есть в таблице.
  const deadline = Date.now() + 55000;
  for (let attempt = 1; attempt <= 2 && Date.now() < deadline - 3000; attempt++) {
    try {
      // POST: длинный комментарий не влезет в URL. Apps Script отвечает 302 → echo-URL, fetch идёт по нему GET-ом.
      const r = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.fromEntries(params)), redirect: 'follow', signal: AbortSignal.timeout(deadline - Date.now()) });
      const text = await r.text();
      let j = {}; try { j = JSON.parse(text); } catch { /* HTML-ответ Google */ }
      if (j.ok) return res.status(200).json({ ok: true });
      console.error('yan-lead: script answered', attempt, r.status, text.slice(0, 120));
    } catch (e) {
      console.error('yan-lead', attempt, getClientIp(req), e && e.message);
    }
  }
  return res.status(502).json({ ok: false });
}
