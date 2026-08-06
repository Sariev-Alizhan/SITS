// Одноразовый замер: где нить паутины пересекает края изображения (в координатах слайда 1080x1350).
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';

const CHROME = '/Users/alizhan/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const img = process.argv[2];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
const res = await page.evaluate(async (url) => {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1350;
  const ctx = c.getContext('2d');
  ctx.drawImage(im, 0, 0, 1080, 1350);
  const lum = (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
  };
  const right = [];
  for (let y = 0; y < 1350; y++) if (lum(1077, y) > 110) right.push(y);
  const top = [];
  for (let x = 0; x < 1080; x++) if (lum(x, 2) > 110) top.push(x);
  // и профиль нити: самая яркая точка в колонках x=700..1070 c шагом 50
  const profile = [];
  for (let x = 700; x <= 1070; x += 50) {
    let best = { y: -1, v: 0 };
    for (let y = 0; y < 700; y++) { const v = lum(x, y); if (v > best.v) best = { y, v: Math.round(v) }; }
    profile.push({ x, ...best });
  }
  return { right, top, profile };
}, `data:image/png;base64,${(await readFile(img)).toString('base64')}`);
console.log(JSON.stringify(res, null, 1));
await browser.close();
