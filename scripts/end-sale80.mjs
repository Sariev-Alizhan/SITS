// scripts/end-sale80.mjs
// Снимает акцию «−80% до 1 сентября»: возвращает БАЗОВЫЕ цены (без скидок)
// в price.html, index.html, шаблоне OG и генераторе визиток; поднимает кэш SW.
// Запуск 1 сентября:  node scripts/end-sale80.mjs
// Тест на копии:      node scripts/end-sale80.mjs --dir /tmp/копия-репо
//
// После скрипта (подскажет и сам):
//   node scripts/build-i18n.mjs        — пересобрать en/kz
//   node scripts/make-vizitka.mjs      — перегенерировать визитки
//   перерендерить brand/og-image.png из brand/og-template.html (см. чеклист)
//   git commit + git push + vercel --prod

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : new URL('..', import.meta.url).pathname;

// [файл, [ [текущая строка, замена, обязательна?], ... ]]
const PLAN = [
  ['price.html', [
    // ---- карточки: одна базовая цена вместо old/new/чипа ----
    ['<span class="pc-vals"><s class="pc-old">150 000 ₸</s><b class="pc-new">30 000 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">150 000 ₸</b></span>', true],
    ['<span class="pc-vals"><s class="pc-old">200 000 ₸</s><b class="pc-new">40 000 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">200 000 ₸</b></span>', true], // ×2: лендинг с фото, лендинг+AI
    ['<span class="pc-vals"><s class="pc-old">250 000 ₸</s><b class="pc-new">50 000 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">250 000 ₸</b></span>', true],
    ['<span class="pc-vals"><s class="pc-old">400 000 ₸</s><b class="pc-new">80 000 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">400 000 ₸</b></span>', true],
    ['<s class="pc-old"><span data-i18n="pricing.from">от</span> 1 000 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 200 000 ₸</b><em class="pc-chip">−80%</em>',
     '<b class="pc-new"><span data-i18n="pricing.from">от</span> 1 000 000 ₸</b>', true],
    ['<s class="pc-old"><span data-i18n="pricing.from">от</span> 2 000 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 400 000 ₸</b><em class="pc-chip">−80%</em>',
     '<b class="pc-new"><span data-i18n="pricing.from">от</span> 2 000 000 ₸</b>', true],
    ['<s class="pc-old"><span data-i18n="pricing.from">от</span> 200 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 40 000 ₸</b><em class="pc-chip">−80%</em>',
     '<b class="pc-new"><span data-i18n="pricing.from">от</span> 200 000 ₸</b>', true],
    ['<s class="pc-old"><span data-i18n="pricing.from">от</span> 4 000 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 800 000 ₸</b><em class="pc-chip">−80%</em>',
     '<b class="pc-new"><span data-i18n="pricing.from">от</span> 4 000 000 ₸</b>', true],
    ['<s class="pc-old"><span data-i18n="pricing.from">от</span> 20 000 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 4 000 000 ₸</b><span class="pc-per" data-i18n="pricing.andUp">и выше</span><em class="pc-chip">−80%</em>',
     '<b class="pc-new"><span data-i18n="pricing.from">от</span> 20 000 000 ₸</b><span class="pc-per" data-i18n="pricing.andUp">и выше</span>', true],
    // ---- медиа ----
    ['<span class="pc-vals"><s class="pc-old"><span data-i18n="pricing.from">от</span> 150 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 30 000 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new"><span data-i18n="pricing.from">от</span> 150 000 ₸</b></span>', true], // ×2: съёмка, таргет
    ['<span class="pc-vals"><s class="pc-old"><span data-i18n="pricing.from">от</span> 150 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 30 000 ₸</b><span class="pc-per" data-i18n="pricing.perVideo">/ролик</span><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new"><span data-i18n="pricing.from">от</span> 150 000 ₸</b><span class="pc-per" data-i18n="pricing.perVideo">/ролик</span></span>', true],
    ['<span class="pc-vals"><s class="pc-old">4 500 ₸</s><b class="pc-new">900 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">4 500 ₸</b></span>', true],
    ['<span class="pc-vals"><s class="pc-old">54 000 ₸</s><b class="pc-new">10 800 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">54 000 ₸</b></span>', true],
    ['<span class="pc-vals"><s class="pc-old"><span data-i18n="pricing.from">от</span> 500 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 100 000 ₸</b><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new"><span data-i18n="pricing.from">от</span> 500 000 ₸</b></span>', true],
    ['<span class="pc-vals"><s class="pc-old"><span data-i18n="pricing.from">от</span> 200 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 40 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new"><span data-i18n="pricing.from">от</span> 200 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span></span>', true],
    ['<span class="pc-vals"><s class="pc-old"><span data-i18n="pricing.from">от</span> 300 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 60 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new"><span data-i18n="pricing.from">от</span> 300 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span></span>', true],
    // ---- партнёрства и поддержка ----
    ['<s class="pc-old"><span data-i18n="pricing.from">от</span> 2 000 000 ₸</s><b class="pc-new"><span data-i18n="pricing.from">от</span> 400 000 ₸</b><span class="pc-per" data-i18n="pricing.perYear">/год</span><em class="pc-chip">−80%</em>',
     '<b class="pc-new"><span data-i18n="pricing.from">от</span> 2 000 000 ₸</b><span class="pc-per" data-i18n="pricing.perYear">/год</span>', true],
    ['<span class="pc-vals"><s class="pc-old">50 000 ₸</s><b class="pc-new">10 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">50 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span></span>', true],
    ['<span class="pc-vals"><s class="pc-old">150 000 ₸</s><b class="pc-new">30 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span><em class="pc-chip">−80%</em></span>',
     '<span class="pc-vals"><b class="pc-new">150 000 ₸</b><span class="pc-per" data-i18n="pricing.perMonth">/мес</span></span>', true],
    // ---- бейджи скидок: убираем ----
    ['<span class="pc-badge" data-i18n="pricing.b1">−80%</span>', '', true],
    ['<span class="pc-badge">−80%</span>', '', true], // ×7
    ['<span class="pc-badge" data-i18n="pricing.mBadge">−80% до 1 сентября</span>', '', true], // ×5
    // ---- WhatsApp-ссылки (URL-encoded) ----
    ['AI%C2%BB%20%D0%B7%D0%B0%2040%20000%20%E2%82%B8%20%D0%BF%D0%BE%20%D0%B0%D0%BA%D1%86%D0%B8%D0%B8',
     'AI%C2%BB%20%D0%B7%D0%B0%20200%20000%20%E2%82%B8', true],
    ['%D1%81%D0%BE%D1%84%D1%82%C2%BB%20%D0%B7%D0%B0%2050%20000%20%E2%82%B8%20%D0%BF%D0%BE%20%D0%B0%D0%BA%D1%86%D0%B8%D0%B8',
     '%D1%81%D0%BE%D1%84%D1%82%C2%BB%20%D0%B7%D0%B0%20250%20000%20%E2%82%B8', true],
    ['%D0%B7%D0%B0%2080%20000%20%E2%82%B8%20%D0%BF%D0%BE%20%D0%B0%D0%BA%D1%86%D0%B8%D0%B8',
     '%D0%B7%D0%B0%20400%20000%20%E2%82%B8', true],
    ['%C2%BB%20%D0%BF%D0%BE%20%D0%B0%D0%BA%D1%86%D0%B8%D0%B8', '%C2%BB', false], // wa1 «Лендинг» по акции
    // ---- meta ----
    ['Прайс SITS: сайты и лендинги от 30 000 ₸, AI Video Creator, медиа-продакшн, автоматизация бизнеса и техподдержка. Скидка −80% на всё до 1 сентября.',
     'Прайс SITS: сайты и лендинги от 150 000 ₸, AI Video Creator, медиа-продакшн, автоматизация бизнеса и техподдержка. Официально, по договору.', true],
  ]],

  // Словари i18n — одинаковые в price.html и index.html
  ...['price.html', 'index.html'].map((f) => [f, [
    ['Тотальная распродажа: скидка −80% на все услуги — только до 1 сентября. Успейте зафиксировать цену.',
     'Фиксированные цены — прозрачно и по договору. Следите за акциями в нашем Instagram.', true],
    ['Total sale: −80% off all services — until September 1 only. Lock in your price.',
     'Fixed prices — transparent, under contract. Follow our Instagram for future deals.', true],
    ['Жаппай науқан: барлық қызметтерге −80% жеңілдік — тек 1 қыркүйекке дейін. Бағаны бекітіп үлгеріңіз.',
     'Тұрақты бағалар — ашық және келісімшартпен. Науқандарды Instagram-да қадағалаңыз.', true],
    ["b1:'−80%'", "b1:''", true], // ×3 (ru/en/kk)
    ["mBadge:'−80% до 1 сентября'", "mBadge:''", true],
    ["mBadge:'−80% until Sep 1'", "mBadge:''", true],
    ["mBadge:'1 қыркүйекке дейін −80%'", "mBadge:''", true],
    ['выезд по Астане. Все цены ниже — со скидкой −80% до 1 сентября.', 'выезд по Астане.', true],
    ['across Astana. All prices below are −80% off until September 1.', 'across Astana.', true],
    ['Астана бойынша шығу. Төмендегі барлық бағалар — 1 қыркүйекке дейін −80% жеңілдікпен.', 'Астана бойынша шығу.', true],
    ['крупных проектов. Скидка −80% действует до 1 сентября.', 'крупных проектов.', true],
    ['large-scale projects. −80% off until September 1.', 'large-scale projects.', true],
    ['ірі жобаларға дейін. −80% жеңілдік 1 қыркүйекке дейін.', 'ірі жобаларға дейін.', true],
    ["tz1:'Сайты и лендинги — от 30 000 ₸'", "tz1:'Сайты и лендинги — от 150 000 ₸'", true],
    ["tz5:'Техподдержка — от 10 000 ₸/мес'", "tz5:'Техподдержка — от 50 000 ₸/мес'", true],
    ["tz6:'Приложения и игры — от 40 000 ₸'", "tz6:'Приложения и игры — от 200 000 ₸'", true],
    ["tz1:'Websites and landing pages — from 30 000 KZT'", "tz1:'Websites and landing pages — from 150 000 KZT'", true],
    ["tz5:'Support plans — from 10 000 KZT/mo'", "tz5:'Support plans — from 50 000 KZT/mo'", true],
    ["tz6:'Apps & games — from 40 000 KZT'", "tz6:'Apps & games — from 200 000 KZT'", true],
    ["tz1:'Сайттар мен лендингтер — 30 000 ₸-ден'", "tz1:'Сайттар мен лендингтер — 150 000 ₸-ден'", true],
    ["tz5:'Техникалық қолдау — айына 10 000 ₸-ден'", "tz5:'Техникалық қолдау — айына 50 000 ₸-ден'", true],
    ["tz6:'Қосымшалар мен ойындар — 40 000 ₸-ден'", "tz6:'Қосымшалар мен ойындар — 200 000 ₸-ден'", true],
    ['«Лендинг + AI» за 40 000 ₸ по акции', '«Лендинг + AI» за 200 000 ₸', true],
    ['«Лендинг + софт» за 50 000 ₸ по акции', '«Лендинг + софт» за 250 000 ₸', true],
    ['«Лендинг + софт + AI» за 80 000 ₸ по акции', '«Лендинг + софт + AI» за 400 000 ₸', true],
    ['«Лендинг» по акции', '«Лендинг»', false],
    ['“Landing + AI” package at 40 000 KZT', '“Landing + AI” package at 200 000 KZT', true],
    ['“Landing + software” package at 50 000 KZT', '“Landing + software” package at 250 000 KZT', true],
    ['“Landing + software + AI” package at 80 000 KZT', '“Landing + software + AI” package at 400 000 KZT', true],
    ['«Лендинг + AI» пакеті (40 000 ₸, науқан)', '«Лендинг + AI» пакеті (200 000 ₸)', true],
    ['«Лендинг + софт» пакеті (50 000 ₸, науқан)', '«Лендинг + софт» пакеті (250 000 ₸)', true],
    ['«Лендинг + софт + AI» пакеті (80 000 ₸, науқан)', '«Лендинг + софт + AI» пакеті (400 000 ₸)', true],
    ['og-image.png?v=11', 'og-image.png?v=12', false],
  ]]),

  ['brand/og-template.html', [
    ['\n      <div class="promo"><i></i><span><b>−80%</b> на все услуги — до 1 сентября</span></div>', '', true],
  ]],

  ['scripts/make-vizitka.mjs', [
    // RU (порядок важен: сначала уникальные крупные)
    ["'от 400 000 ₸/год'", "'от 2 000 000 ₸/год'", true],
    ["'от 400 000 ₸'", "'от 2 000 000 ₸'", true],   // приложения
    ["'от 200 000 ₸'", "'от 1 000 000 ₸'", true],   // автоматизация
    ["'от 100 000 ₸'", "'от 500 000 ₸'", true],     // AI Video
    ["'от 40 000 ₸'", "'от 200 000 ₸'", true],      // игры (базовая веб-игра)
    ["'от 900 ₸'", "'от 4 500 ₸'", true],           // медиа
    ["'от 30 000 ₸'", "'от 150 000 ₸'", true],      // ×2: сайты, SMM — базово обе от 150 000
    ["secTag: 'Услуги и цены · −80% до 1 сентября'", "secTag: 'Услуги и цены'", true],
    // EN
    ["'from 400 000 ₸/yr'", "'from 2 000 000 ₸/yr'", true],
    ["'from 400 000 ₸'", "'from 2 000 000 ₸'", true],
    ["'from 200 000 ₸'", "'from 1 000 000 ₸'", true],
    ["'from 100 000 ₸'", "'from 500 000 ₸'", true],
    ["'from 40 000 ₸'", "'from 200 000 ₸'", true],
    ["'from 900 ₸'", "'from 4 500 ₸'", true],
    ["'from 30 000 ₸'", "'from 150 000 ₸'", true],
    ["secTag: 'Services & prices · −80% until Sep 1'", "secTag: 'Services & prices'", true],
    // KK
    ["'жылына 400 000 ₸-ден'", "'жылына 2 000 000 ₸-ден'", true],
    ["'400 000 ₸-ден'", "'2 000 000 ₸-ден'", true],
    ["'200 000 ₸-ден'", "'1 000 000 ₸-ден'", true],
    ["'100 000 ₸-ден'", "'500 000 ₸-ден'", true],
    ["'40 000 ₸-ден'", "'200 000 ₸-ден'", true],
    ["'900 ₸-ден'", "'4 500 ₸-ден'", true],
    ["'30 000 ₸-ден'", "'150 000 ₸-ден'", true],
    ["secTag: 'Қызметтер мен бағалар · 1 қыркүйекке дейін −80%'", "secTag: 'Қызметтер мен бағалар'", true],
  ]],
];

let failed = false;
const touched = new Map();
for (const [file, reps] of PLAN) {
  const path = join(DIR, file);
  let text = touched.get(path) ?? readFileSync(path, 'utf-8');
  for (const [oldS, newS, required] of reps) {
    const n = text.split(oldS).length - 1;
    if (n === 0) {
      const tag = required ? 'ОШИБКА (обязательная замена не найдена)' : 'пропущено (не найдено, необязательно)';
      console.log(`${required ? '✗' : '·'} ${file}: ${tag}: ${oldS.slice(0, 70)}`);
      if (required) failed = true;
      continue;
    }
    text = text.split(oldS).join(newS);
    console.log(`✓ ${file}: ×${n}: ${oldS.slice(0, 70)}`);
  }
  touched.set(path, text);
}

if (failed) {
  console.error('\nСтоп: обязательные замены не найдены — файлы НЕ записаны. Сайт менялся после создания скрипта? Проверь вручную.');
  process.exit(1);
}

// кэш SW: +1
const swPath = join(DIR, 'sw.js');
let sw = readFileSync(swPath, 'utf-8');
sw = sw.replace(/const CACHE = 'sits-v(\d+)';/, (_, v) => `const CACHE = 'sits-v${Number(v) + 1}';`);
touched.set(swPath, sw);

for (const [path, text] of touched) writeFileSync(path, text);
console.log('\nГотово: базовые цены возвращены, кэш SW поднят.');

// остаточная проверка
for (const f of ['price.html', 'index.html']) {
  const t = readFileSync(join(DIR, f), 'utf-8');
  for (const bad of ['−80%', '1 сентября', 'September 1', 'қыркүйек']) {
    if (t.includes(bad)) console.warn(`ВНИМАНИЕ: в ${f} остался фрагмент «${bad}» — проверь вручную.`);
  }
}

console.log(`
Дальше:
  node scripts/build-i18n.mjs      # пересобрать en.html / kz.html
  node scripts/make-vizitka.mjs    # перегенерировать визитки (3 языка)
  # перерендерить brand/og-image.png из brand/og-template.html (см. marketing/чеклист-снятие-акции.md)
  git add -u && git commit -m "Снятие акции −80%: возврат базовых цен" && git push
  vercel --prod                    # вебхук не работает — деплой вручную
`);
