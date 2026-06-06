// Локальный dev-сервер, имитирующий поведение Vercel из vercel.json:
//   /en        → /en.html
//   /kz        → /kz.html
//   /admin     → /admin.html
//   cleanUrls  → /xxx без расширения отдаёт /xxx.html
// Запуск: node scripts/dev-server.mjs   (порт по умолчанию 8765)

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8765);

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.mjs':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.avif':'image/avif',
  '.ico':'image/x-icon',
  '.mp4':'video/mp4',
  '.webm':'video/webm',
  '.mov':'video/quicktime',
  '.woff2':'font/woff2',
  '.woff':'font/woff',
  '.txt':'text/plain; charset=utf-8',
  '.xml':'application/xml; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
};

const REWRITES = {
  '/en': '/en.html',
  '/kz': '/kz.html',
  '/admin': '/admin.html',
};

async function tryFile(p) {
  try { const s = await stat(p); return s.isFile() ? p : null; } catch { return null; }
}

async function resolve(urlPath) {
  if (REWRITES[urlPath]) return join(ROOT, REWRITES[urlPath]);
  if (urlPath === '/' || urlPath === '') return join(ROOT, 'index.html');

  const safe = normalize(urlPath).replace(/^\/+/, '');
  const direct = join(ROOT, safe);
  let f = await tryFile(direct);
  if (f) return f;
  // cleanUrls — попробовать .html
  f = await tryFile(direct + '.html');
  if (f) return f;
  // Папка → index.html внутри
  f = await tryFile(join(direct, 'index.html'));
  if (f) return f;
  return null;
}

// Парсим заголовок Range: "bytes=START-END" / "bytes=START-" / "bytes=-SUFFIX"
function parseRange(header, size) {
  if (!header || !header.startsWith('bytes=')) return null;
  const [s, e] = header.slice(6).split('-');
  let start, end;
  if (s === '' && e !== '') {
    start = Math.max(0, size - Number(e));
    end = size - 1;
  } else {
    start = Number(s);
    end = e ? Number(e) : size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = await resolve(url.pathname);
    if (!file) {
      const nf = await tryFile(join(ROOT, '404.html'));
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(nf ? await readFile(nf) : '404 Not Found');
      return;
    }
    const ext = extname(file).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const st = await stat(file);
    const size = st.size;

    // Range request — обязательно для Safari при воспроизведении видео
    const range = parseRange(req.headers.range, size);
    if (range) {
      const { start, end } = range;
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      const stream = createReadStream(file, { start, end });
      stream.on('error', () => res.end());
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': size,
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`SITS dev → http://localhost:${PORT}/`);
  console.log(`  /     → index.html (RU)`);
  console.log(`  /en   → en.html`);
  console.log(`  /kz   → kz.html`);
  console.log(`  /admin → admin.html`);
});
