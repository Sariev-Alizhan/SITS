// scripts/make-motion.mjs
// Рендерит анимированный креатив marketing/target-sale80-motion.html в MP4:
// детерминированно прогоняет CSS-анимации по кадрам (30 fps, ~7.5 c) и собирает ffmpeg-ом.
// Запуск: node scripts/make-motion.mjs [путь-к-html] [имя-выходного-файла-без-расширения]
//   по умолчанию: marketing/target-sale80-motion.html → marketing/target/sale80-motion.mp4

import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join } from 'node:path';

const CHROME = '/Users/alizhan/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8941;
const HTML = process.argv[2] || 'marketing/target-sale80-motion.html'; // можно с ?fmt=feed&lang=kk
const OUT = process.argv[3] || 'sale80-motion';
const HEIGHT = Number(process.argv[4]) || 1920; // 1920 = 9:16, 1350 = 4:5
const FPS = 30;
const DURATION_MS = 7500;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(f);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(PORT, ok));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: HEIGHT, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${PORT}/${HTML}`, { waitUntil: 'networkidle0' });
await page.evaluateHandle('document.fonts.ready');

// пауза всех анимаций — дальше время двигаем вручную
await page.evaluate(() => document.getAnimations({ subtree: true }).forEach((a) => a.pause()));

const framesDir = '/tmp/sits-motion-frames';
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

const total = Math.round((DURATION_MS / 1000) * FPS);
for (let i = 0; i < total; i++) {
  const t = (i / FPS) * 1000;
  await page.evaluate((ms) => document.getAnimations({ subtree: true }).forEach((a) => { a.currentTime = ms; }), t);
  await page.screenshot({ path: join(framesDir, `f${String(i).padStart(4, '0')}.png`) });
  if (i % 30 === 0) console.log(`кадр ${i}/${total}`);
}
await browser.close();
server.close();

const out = join(ROOT, `marketing/target/${OUT}.mp4`);
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', join(framesDir, 'f%04d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out], { stdio: 'ignore' });
await rm(framesDir, { recursive: true, force: true });
console.log('✓', out);
