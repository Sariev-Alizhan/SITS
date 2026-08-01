// scripts/make-target-slides.mjs
// Рендерит креативы для таргета (HTML со слайдами .slide 1080x1350) в PNG.
// Запуск: node scripts/make-target-slides.mjs [путь-к-html] [префикс-выходных-файлов]
//   по умолчанию: marketing/target-price-slides.html → marketing/target/target-1..N.png
//   акция −80%:   node scripts/make-target-slides.mjs marketing/target-sale80-slides.html sale80

import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const CHROME = '/Users/alizhan/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8917;
const HTML = process.argv[2] || 'marketing/target-price-slides.html';
const PREFIX = process.argv[3] || 'target';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((ok) => server.listen(PORT, ok));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${PORT}/${HTML}`, { waitUntil: 'networkidle0' });
await page.evaluateHandle('document.fonts.ready');

await mkdir(join(ROOT, 'marketing/target'), { recursive: true });
const slides = await page.$$('.slide');
for (let i = 0; i < slides.length; i++) {
  const out = join(ROOT, `marketing/target/${PREFIX}-${i + 1}.png`);
  await slides[i].screenshot({ path: out });
  console.log('✓', out);
}

await browser.close();
server.close();
