// scripts/build-i18n.mjs
// Генерирует en.html и kz.html из index.html — pre-rendered HTML для /en и /kz.
//
// Логика:
// 1. Читает index.html, извлекает инлайн объект I18N как JS-литерал.
// 2. Для каждого языка (en, kk → файл kz.html):
//    - Заменяет <html lang=...> data-lang=...
//    - Заменяет meta description, og:description, twitter:description, og:title, twitter:title,
//      og:url, og:locale, canonical — на значения языка
//    - Заменяет text content для всех элементов с data-i18n="key"
//    - Заменяет placeholder для data-i18n-placeholder
//    - Заменяет aria-label для data-i18n-aria-label
//    - Вырезает блок ROOT-REDIRECT-START..END (он живёт только на /)
// 3. Сохраняет рядом с index.html.
//
// Запускается Vercel'ом через "buildCommand" в vercel.json или вручную: node scripts/build-i18n.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE = 'https://sits-eta.vercel.app';
const LANG_PATH = { ru: '/', en: '/en', kk: '/kz' };
const OUT_FILE = { en: 'en.html', kk: 'kz.html' };

const src = await readFile(join(ROOT, 'index.html'), 'utf-8');

// --- Извлекаем объект I18N как JS-литерал ---
const m = src.match(/const I18N = (\{[\s\S]+?\n\});\s*\n\s*const LANGS/);
if (!m) {
  console.error('FATAL: cannot locate I18N object literal in index.html');
  process.exit(1);
}
const I18N = new Function('return ' + m[1])();

function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escText(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function pick(lang, key) {
  let v = I18N[lang];
  for (const k of key.split('.')) {
    if (v == null) return null;
    v = v[k];
  }
  return v;
}

function generate(lang) {
  let out = src;
  const path = LANG_PATH[lang];
  const url = SITE + path;
  const meta = I18N[lang]._meta;

  // 1. <html lang=... data-theme=...> + data-lang
  out = out.replace(
    /<html lang="ru" data-theme="dark">/,
    `<html lang="${lang}" data-theme="dark" data-lang="${lang}">`
  );

  // 2. <title> — локализованный per язык (не путать с og:title, который про слоган)
  if (meta.title) {
    out = out.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escText(meta.title)}</title>`
    );
  }

  // 2.1. meta description / og:description / twitter:description
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escAttr(meta.description)}" />`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escAttr(meta.description)}" />`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escAttr(meta.description)}" />`
  );

  // 3. og:title / twitter:title
  if (meta.ogTitle) {
    out = out.replace(
      /<meta property="og:title" content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escAttr(meta.ogTitle)}" />`
    );
    out = out.replace(
      /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${escAttr(meta.ogTitle)}" />`
    );
  }

  // 4. og:url + canonical → URL этого языка
  out = out.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${url}" />`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${url}" />`
  );

  // 5. og:locale
  out = out.replace(
    /<meta property="og:locale" content="[^"]*"\s*\/?>/,
    `<meta property="og:locale" content="${meta.locale}" />`
  );

  // 6. Убираем root-redirect блок (только на /)
  out = out.replace(/<!-- ROOT-REDIRECT-START -->[\s\S]*?<!-- ROOT-REDIRECT-END -->\n?/, '');

  // 6.1. Для /en страница чисто латинская — киррилические preload-ы не нужны
  // (@font-face всё равно зарегистрирован, если вдруг встретится кириллица — загрузится по unicode-range).
  if (lang === 'en') {
    // На /en латинский текст — киррилические preload'ы wasted. @font-face всё равно
    // зарегистрирован, так что если вдруг встретится кириллица, файл загрузится по unicode-range.
    out = out.replace(/[^\S\n]*<link rel="preload" href="\/fonts\/unbounded-\d+-cyrillic\.woff2"[^>]*\/>\n/g, '');
  }

  // 7. Pre-render текстов для всех data-i18n
  out = out.replace(
    /<(\w+)([^>]*\bdata-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/g,
    (match, tag, attrs, key) => {
      const v = pick(lang, key);
      if (v == null) return match;
      return `<${tag}${attrs}>${escText(v)}</${tag}>`;
    }
  );

  // 8. placeholders для data-i18n-placeholder
  out = out.replace(
    /data-i18n-placeholder="([^"]+)"\s+placeholder="[^"]*"/g,
    (match, key) => {
      const v = pick(lang, key);
      if (v == null) return match;
      return `data-i18n-placeholder="${key}" placeholder="${escAttr(v)}"`;
    }
  );

  // 9. aria-label для data-i18n-aria-label
  out = out.replace(
    /data-i18n-aria-label="([^"]+)"\s+aria-label="[^"]*"/g,
    (match, key) => {
      const v = pick(lang, key);
      if (v == null) return match;
      return `data-i18n-aria-label="${key}" aria-label="${escAttr(v)}"`;
    }
  );

  return out;
}

// Контрольные проверки
const stats = [];
for (const lang of ['en', 'kk']) {
  const html = generate(lang);
  const outPath = join(ROOT, OUT_FILE[lang]);
  await writeFile(outPath, html, 'utf-8');
  stats.push({ lang, file: OUT_FILE[lang], bytes: html.length });
}

console.log('Build i18n complete:');
for (const s of stats) {
  console.log(`  ✓ ${s.file.padEnd(10)}  ${(s.bytes/1024).toFixed(1)} KB  (${s.lang})`);
}
