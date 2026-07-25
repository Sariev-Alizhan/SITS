// TEMP diagnostic — inspects how the request body arrives. Remove after debugging.
export default async function handler(req, res) {
  const ct = req.headers['content-type'] || '';
  const typ = typeof req.body;
  const isBuf = Buffer.isBuffer(req.body);
  let keys = [];
  try { keys = (req.body && typeof req.body === 'object' && !isBuf) ? Object.keys(req.body) : []; } catch {}
  const asyncIterable = typeof req[Symbol.asyncIterator] === 'function';

  // попытка сырого чтения через события
  let rawLen = 0, rawErr = null, rawSample = '';
  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      let done = false;
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { done = true; resolve(); });
      req.on('error', reject);
      setTimeout(() => { if (!done) resolve(); }, 1500);
    });
    const buf = Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(String(c)))));
    rawLen = buf.length;
    rawSample = buf.toString('utf8').slice(0, 120);
  } catch (e) { rawErr = e && e.message; }

  res.status(200).json({
    method: req.method,
    contentType: ct,
    reqBodyType: typ,
    reqBodyIsBuffer: isBuf,
    reqBodyKeys: keys,
    reqBodyStringSample: typ === 'string' ? String(req.body).slice(0, 120) : undefined,
    asyncIterable,
    rawLen, rawErr, rawSample,
  });
}
