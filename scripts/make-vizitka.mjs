// scripts/make-vizitka.mjs
// Генерирует электронные PDF-визитки SITS на трёх языках:
//   brand/sits-vizitka.pdf     (ru)
//   brand/sits-vizitka-en.pdf  (en)
//   brand/sits-vizitka-kz.pdf  (kk)
// Запуск: node scripts/make-vizitka.mjs
// Требует: локальный сервер статики на :8899 (шрифты) и сеть (QR через qrserver).

import puppeteer from 'puppeteer-core';
import { writeFile, unlink } from 'node:fs/promises';

const CHROME = '/Users/alizhan/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const qr = (data) => 'https://api.qrserver.com/v1/create-qr-code/?size=520x520&margin=0&data=' + encodeURIComponent(data);

const I18N = {
  ru: {
    file: 'brand/sits-vizitka.pdf', lang: 'ru',
    title: 'SITS — электронная визитка',
    sub: 'Sariyev IT Solutions — IT-студия полного цикла',
    h1: 'Превращаем идеи<br/>в продукты<span class="dot">.</span>',
    lead: 'Сайты, приложения, игры, AI-видео, медиа-продакшн и автоматизация — <span class="em">от идеи до запуска и сопровождения, под одной крышей.</span> Новейшие технологии и AI на базе Claude (Anthropic).',
    stats: [['10+','проектов запущено в продакшен'],['8','направлений — от веба до игр и AI'],['24/7','поддержка продуктов'],['100%','официально, по договору и NDA']],
    secTag: 'Услуги и цены',
    svc: [
      ['Сайты и лендинги','от 50 000 ₸','Продающие сайты под ключ: дизайн, адаптив, SEO, запуск за 3–7 дней. Вариант с AI-автоответчиком 24/7.'],
      ['Мобильные приложения','от 1 200 000 ₸','iOS и Android под ключ: дизайн, бэкенд, публикация в App Store и Google Play.'],
      ['Разработка игр','от 100 000 ₸','Unity и Unreal: от веб-игр до крупных проектов на мобильные, ПК и PlayStation. Самый крупный кейс — игра за $10 000 000.'],
      ['AI Video Creator','от 500 000 ₸','Реклама и видеоклипы с AI любой сложности: сценарий, генерация, монтаж, звук, помощь с дистрибуцией.'],
      ['Медиа-продакшн','от 4 500 ₸','Проф съёмка по Астане, монтаж часовых роликов, нарезки под Reels и TikTok. Кейс: подкаст Damn Disn × Maunfeld.'],
      ['SMM и таргет','от 150 000 ₸','Ведение TikTok и Instagram под ключ с мобилографом, контентом и аналитикой каждый месяц.'],
      ['Автоматизация бизнеса','от 800 000 ₸','Полная цифровизация под ключ: CRM, AI-агенты на Claude, интеграции с WhatsApp, Kaspi, 1C.'],
      ['Интеграции и команда','от 1 000 000 ₸/год','Международные партнёрства для бизнеса и подбор сильных специалистов в медиа, IT и AI — фокус на Казахстан и СНГ.'],
    ],
    guar: ['Оплата 50/50','30 дней бесплатных правок','Проекты клиентов не публикуем без разрешения','Договор и NDA','Гарантия сопровождения'],
    qrSite: 'Сайт и прайс', qrWa: 'Написать в WhatsApp',
    waMsg: 'Здравствуйте! Пишу с вашей визитки SITS — хочу обсудить проект.',
    footL: '<b>ТОО «SARIYEV IT SOLUTIONS»</b> · БИН 250440005104 · Казахстан, Алматинская область',
    footR: 'Основатель — <b>Сариев Алижан Сабитулы</b>',
  },
  en: {
    file: 'brand/sits-vizitka-en.pdf', lang: 'en',
    title: 'SITS — digital business card',
    sub: 'Sariyev IT Solutions — Full-Cycle IT Studio',
    h1: 'Turning ideas<br/>into products<span class="dot">.</span>',
    lead: 'Websites, apps, games, AI video, media production and automation — <span class="em">from idea to launch and support, under one roof.</span> Cutting-edge technology and AI powered by Claude (Anthropic).',
    stats: [['10+','projects launched to production'],['8','disciplines — from web to games and AI'],['24/7','product support'],['100%','official — contract & NDA']],
    secTag: 'Services & prices',
    svc: [
      ['Websites & landing pages','from 50 000 ₸','Turnkey selling websites: design, responsive, SEO, launch in 3–7 days. Option with a 24/7 AI auto-responder.'],
      ['Mobile apps','from 1 200 000 ₸','Turnkey iOS and Android: design, backend, App Store and Google Play release.'],
      ['Game development','from 100 000 ₸','Unity and Unreal: from web games to large projects for mobile, PC and PlayStation. Our largest case — a $10,000,000 game.'],
      ['AI Video Creator','from 500 000 ₸','AI ads and music videos of any complexity: script, generation, editing, sound, distribution help.'],
      ['Media production','from 4 500 ₸','Pro shoots in Astana, hour-long video editing, cuts for Reels and TikTok. Case: the Damn Disn podcast × Maunfeld.'],
      ['SMM & targeted ads','from 150 000 ₸','End-to-end TikTok and Instagram management with a mobile videographer, content and monthly analytics.'],
      ['Business automation','from 800 000 ₸','Turnkey digitalization: CRM, Claude-powered AI agents, WhatsApp, Kaspi and 1C integrations.'],
      ['Integrations & talent','from 1 000 000 ₸/yr','International partnerships for business and recruiting of strong media, IT & AI specialists — focus on Kazakhstan and the CIS.'],
    ],
    guar: ['Payment 50/50','30 days of free fixes','Client work never published without permission','Contract & NDA','Ongoing care warranty'],
    qrSite: 'Website & pricing', qrWa: 'Chat on WhatsApp',
    waMsg: 'Hi! I found you via the SITS business card — I would like to discuss a project.',
    footL: '<b>SARIYEV IT SOLUTIONS LLP</b> · BIN 250440005104 · Kazakhstan, Almaty region',
    footR: 'Founder — <b>Sariyev Alizhan Sabituly</b>',
  },
  kk: {
    file: 'brand/sits-vizitka-kz.pdf', lang: 'kk',
    title: 'SITS — электрондық визитка',
    sub: 'Sariyev IT Solutions — толық циклді IT-студия',
    h1: 'Идеяларды өнімге<br/>айналдырамыз<span class="dot">.</span>',
    lead: 'Сайттар, қосымшалар, ойындар, AI-видео, медиа-продакшн және автоматтандыру — <span class="em">идеядан іске қосу мен сүйемелдеуге дейін, бір шаңырақ астында.</span> Ең жаңа технологиялар және Claude (Anthropic) негізіндегі AI.',
    stats: [['10+','жоба продакшенге іске қосылды'],['8','бағыт — вебтен ойындар мен AI-ға дейін'],['24/7','өнімдерді қолдау'],['100%','ресми — келісімшарт және NDA']],
    secTag: 'Қызметтер мен бағалар',
    svc: [
      ['Сайттар мен лендингтер','50 000 ₸-ден','Дайын сатушы сайттар: дизайн, адаптив, SEO, 3–7 күнде іске қосу. 24/7 AI-автожауапбергіш нұсқасы бар.'],
      ['Мобильді қосымшалар','1 200 000 ₸-ден','iOS және Android толық дайын: дизайн, бэкенд, App Store мен Google Play-ге жариялау.'],
      ['Ойын жасау','100 000 ₸-ден','Unity және Unreal: веб-ойындардан мобильді, ПК және PlayStation ірі жобаларына дейін. Ең ірі кейс — $10 000 000 ойын.'],
      ['AI Video Creator','500 000 ₸-ден','Кез келген күрделіліктегі AI жарнамалар мен клиптер: сценарий, генерация, монтаж, дыбыс, дистрибуцияға көмек.'],
      ['Медиа-продакшн','4 500 ₸-ден','Астанада кәсіби түсірілім, сағаттық роликтер монтажы, Reels пен TikTok-қа нарезкалар. Кейс: Damn Disn × Maunfeld подкасты.'],
      ['SMM және таргет','150 000 ₸-ден','TikTok пен Instagram-ды толық жүргізу: мобилограф, контент және ай сайынғы аналитика.'],
      ['Бизнесті автоматтандыру','800 000 ₸-ден','Толық цифрландыру: CRM, Claude негізіндегі AI-агенттер, WhatsApp, Kaspi, 1C интеграциялары.'],
      ['Интеграциялар және команда','жылына 1 000 000 ₸-ден','Бизнеске халықаралық серіктестік және медиа, IT & AI мықты мамандарын іріктеу — Қазақстан мен ТМД-ға назар.'],
    ],
    guar: ['Төлем 50/50','30 күн тегін түзетулер','Клиент жұмыстарын рұқсатсыз жарияламаймыз','Келісімшарт және NDA','Сүйемелдеу кепілдігі'],
    qrSite: 'Сайт және бағалар', qrWa: 'WhatsApp-қа жазу',
    waMsg: 'Сәлеметсіз бе! SITS визиткасынан жазып отырмын — жобаны талқылағым келеді.',
    footL: '<b>«SARIYEV IT SOLUTIONS» ЖШС</b> · БСН 250440005104 · Қазақстан, Алматы облысы',
    footR: 'Негізін қалаушы — <b>Сариев Алижан Сабитұлы</b>',
  },
};

const WA_ICON = '<svg viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7a11 11 0 0 0 4.2 3.7c.6.3 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3z"/></svg>';
const TG_ICON = '<svg viewBox="0 0 24 24" fill="#2AABEE"><path d="M9.04 15.51 8.9 19.4c.4 0 .57-.17.78-.37l1.87-1.79 3.88 2.84c.71.39 1.22.19 1.4-.66l2.53-11.87c.23-1.05-.38-1.46-1.07-1.2L3.4 12.06c-1.02.4-1 .96-.18 1.22l3.85 1.2 8.94-5.64c.42-.26.8-.12.49.14l-7.46 6.53z"/></svg>';
const MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#f4f1f1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6.5 9 6.5 9-6.5"/></svg>';
const IG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#f4f1f1" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#f4f1f1" stroke="none"/></svg>';

function render(t) {
  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
<meta charset="UTF-8" />
<title>${t.title}</title>
<link rel="stylesheet" href="/fonts/fonts.css" />
<style>
@page{size:A4;margin:0}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
:root{
  --bg:#0c0a0b; --text:#f4f1f1; --muted:#a89fa1; --faint:#6f696a;
  --red:#e23744; --red-soft:rgba(226,55,68,.14);
  --glass:rgba(255,255,255,.05); --glass-2:rgba(255,255,255,.09);
  --glass-line:rgba(255,255,255,.12); --glass-hi:rgba(255,255,255,.10);
  --fd:'Unbounded','Arial Black',sans-serif;
  --fb:'Manrope',system-ui,sans-serif;
  --fl:'PT Serif',Georgia,serif;
}
html,body{width:210mm;height:297mm;background:var(--bg);color:var(--text);font-family:var(--fb);overflow:hidden}
.page{position:relative;width:210mm;height:297mm;padding:11mm 12mm 9mm;display:flex;flex-direction:column;overflow:hidden}
.page::before{content:"";position:absolute;width:150mm;height:150mm;top:-45mm;right:-40mm;border-radius:50%;
  background:radial-gradient(circle at 50% 50%,rgba(226,55,68,.32),transparent 68%);filter:blur(14mm)}
.page::after{content:"";position:absolute;width:120mm;height:120mm;bottom:-40mm;left:-35mm;border-radius:50%;
  background:radial-gradient(circle at 50% 50%,rgba(226,55,68,.20),transparent 68%);filter:blur(12mm)}
.z{position:relative;z-index:1}
.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7mm}
.logo{font-family:var(--fl);font-weight:700;font-size:34px;letter-spacing:.04em;line-height:1}
.logo b{color:var(--red)}
.head .sub{font-size:9.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:2mm}
.site-pill{display:inline-flex;align-items:center;gap:2.2mm;border:1px solid var(--glass-line);background:var(--glass);
  border-radius:100px;padding:2.6mm 4.5mm;font-size:11px;font-weight:700;letter-spacing:.02em;
  box-shadow:inset 0 1px 0 var(--glass-hi)}
.site-pill i{width:2mm;height:2mm;border-radius:50%;background:var(--red)}
h1{font-family:var(--fd);font-weight:600;font-size:30px;line-height:1.08;letter-spacing:-.02em;margin-bottom:3mm}
h1 .dot{color:var(--red)}
.lead{color:var(--muted);font-size:12.5px;line-height:1.55;max-width:155mm;margin-bottom:5.5mm}
.lead .em{color:var(--text);font-weight:600}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:5.5mm}
.stat{border:1px solid var(--glass-line);background:var(--glass);border-radius:5mm;padding:3.4mm 4mm;
  box-shadow:inset 0 1px 0 var(--glass-hi)}
.stat .v{font-family:var(--fd);font-weight:500;font-size:16px;letter-spacing:-.01em}
.stat .l{font-size:9px;color:var(--muted);margin-top:1mm;line-height:1.35}
.sec-tag{display:flex;align-items:center;gap:2.4mm;font-size:9.5px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:var(--muted);margin-bottom:3mm}
.sec-tag i{width:1.8mm;height:1.8mm;border-radius:50%;background:var(--red)}
.svc{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:5.5mm}
.s{border:1px solid var(--glass-line);background:var(--glass);border-radius:5mm;padding:3.6mm 4.2mm;
  box-shadow:inset 0 1px 0 var(--glass-hi);display:flex;flex-direction:column;gap:1.2mm}
.s .t{display:flex;align-items:baseline;justify-content:space-between;gap:3mm}
.s .n{font-family:var(--fd);font-weight:500;font-size:11px;letter-spacing:-.01em}
.s .p{font-size:9.5px;font-weight:700;color:var(--red);white-space:nowrap}
.s .d{font-size:9.3px;color:var(--muted);line-height:1.45}
.guar{display:flex;flex-wrap:wrap;gap:2.4mm;margin-bottom:5.5mm}
.g{display:inline-flex;align-items:center;gap:2mm;font-size:9.3px;font-weight:600;color:var(--muted);
  border:1px solid var(--glass-line);background:var(--glass);border-radius:100px;padding:2.2mm 3.6mm;
  box-shadow:inset 0 1px 0 var(--glass-hi)}
.g::before{content:"";width:1.6mm;height:1.6mm;border-radius:50%;background:var(--red)}
.contact{display:grid;grid-template-columns:1fr auto auto;gap:4mm;align-items:center;
  border:1px solid rgba(226,55,68,.35);background:linear-gradient(135deg,rgba(226,55,68,.10),rgba(255,255,255,.04) 60%);
  border-radius:6mm;padding:5mm 5.5mm;box-shadow:inset 0 1px 0 var(--glass-hi);margin-top:auto}
.c-rows{display:flex;flex-direction:column;gap:2.6mm}
.c-row{display:flex;align-items:center;gap:3mm}
.c-ico{width:7.5mm;height:7.5mm;border-radius:2.4mm;border:1px solid var(--glass-line);background:var(--glass);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 1px 0 var(--glass-hi)}
.c-ico svg{width:4mm;height:4mm}
.c-k{font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.c-v{font-size:11.5px;font-weight:700;letter-spacing:.01em}
.qr{display:flex;flex-direction:column;align-items:center;gap:1.8mm}
.qr .box{width:26mm;height:26mm;background:#fff;border-radius:3mm;padding:1.6mm;display:flex;align-items:center;justify-content:center}
.qr img{width:100%;height:100%}
.qr .cap{font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:center;max-width:30mm}
.foot{display:flex;justify-content:space-between;align-items:center;gap:4mm;color:var(--faint);
  font-size:8.3px;letter-spacing:.02em;margin-top:4.5mm;padding-top:3.5mm;border-top:1px solid var(--glass-line)}
.foot b{color:var(--muted);font-weight:700}
</style>
</head>
<body>
<div class="page">
  <div class="z head">
    <div>
      <div class="logo">SIT<b>S</b></div>
      <div class="sub">${t.sub}</div>
    </div>
    <div class="site-pill"><i></i>sits-eta.vercel.app</div>
  </div>
  <div class="z">
    <h1>${t.h1}</h1>
    <p class="lead">${t.lead}</p>
  </div>
  <div class="z stats">
    ${t.stats.map(([v,l])=>`<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('\n    ')}
  </div>
  <div class="z">
    <div class="sec-tag"><i></i>${t.secTag}</div>
    <div class="svc">
      ${t.svc.map(([n,p,d])=>`<div class="s"><div class="t"><div class="n">${n}</div><div class="p">${p}</div></div><div class="d">${d}</div></div>`).join('\n      ')}
    </div>
  </div>
  <div class="z guar">
    ${t.guar.map(g=>`<span class="g">${g}</span>`).join('\n    ')}
  </div>
  <div class="z contact">
    <div class="c-rows">
      <div class="c-row"><div class="c-ico">${WA_ICON}</div><div><div class="c-k">WhatsApp</div><div class="c-v">+7 777 496 13 58</div></div></div>
      <div class="c-row"><div class="c-ico">${TG_ICON}</div><div><div class="c-k">Telegram</div><div class="c-v">@zhanmate</div></div></div>
      <div class="c-row"><div class="c-ico">${MAIL_ICON}</div><div><div class="c-k">Email</div><div class="c-v">raimzhan1907@gmail.com</div></div></div>
      <div class="c-row"><div class="c-ico">${IG_ICON}</div><div><div class="c-k">Instagram</div><div class="c-v">@sariyev.it.solutions</div></div></div>
    </div>
    <div class="qr"><div class="box"><img src="${qr('https://sits-eta.vercel.app/price')}" alt="QR" /></div><div class="cap">${t.qrSite}</div></div>
    <div class="qr"><div class="box"><img src="${qr('https://wa.me/77774961358?text=' + t.waMsg)}" alt="QR" /></div><div class="cap">${t.qrWa}</div></div>
  </div>
  <div class="z foot">
    <div>${t.footL}</div>
    <div>${t.footR}</div>
  </div>
</div>
</body>
</html>`;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 1754 });
for (const lang of ['ru', 'en', 'kk']) {
  const t = I18N[lang];
  const tmp = `.vizitka-tmp-${lang}.html`;
  await writeFile(tmp, render(t));
  await page.goto('http://localhost:8899/' + tmp, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  await page.pdf({ path: t.file, format: 'A4', printBackground: true, pageRanges: '1', margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await unlink(tmp);
  console.log('✓', t.file);
}
await browser.close();
