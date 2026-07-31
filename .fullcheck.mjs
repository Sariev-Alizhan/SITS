import puppeteer from 'puppeteer-core';
const exec = '/Users/alizhan/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await puppeteer.launch({executablePath: exec, headless: 'new'});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.evaluateOnNewDocument(()=>{try{localStorage.setItem('sits-lang','ru')}catch(e){}});
const out = {layout:{}, i18n:{}, links:{}};
for (const w of [1440, 1024, 390, 320]) {
  await page.setViewport({width:w, height:w>500?1000:844});
  for (const [n,u] of [['home','/'],['price','/price']]) {
    await page.goto('https://sits-eta.vercel.app'+u, {waitUntil:'networkidle0'});
    await new Promise(r=>setTimeout(r,900));
    await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,80))}});
    out.layout[`${n}@${w}`] = await page.evaluate(()=>{
      const ov=[];
      document.querySelectorAll('.price-card').forEach(c=>{
        const b=c.querySelector('.pc-badge'), h=c.querySelector('h3,h1');
        if(!b||!h) return;
        const r=document.createRange(); r.selectNodeContents(h);
        const tr=r.getBoundingClientRect(), br=b.getBoundingClientRect();
        if(!(br.left>=tr.right+4||br.right<=tr.left-4||br.top>=tr.bottom||br.bottom<=tr.top)) ov.push(1);
      });
      return [document.scrollingElement.scrollWidth-window.innerWidth, ov.length];
    });
  }
}
await page.setViewport({width:1440, height:1000});
for (const [n,u] of [['home','/'],['price','/price']]) {
  await page.goto('https://sits-eta.vercel.app'+u, {waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,700));
  out.i18n[n] = await page.evaluate(()=>{
    const missing=[];
    ['data-i18n','data-i18n-placeholder','data-i18n-aria-label','data-wa'].forEach(attr=>{
      document.querySelectorAll('['+attr+']').forEach(el=>{
        const k=el.getAttribute(attr);
        for (const lang of ['ru','en','kk']) {
          let v=I18N[lang]; for (const part of k.split('.')) v=v?v[part]:null;
          if (v==null) missing.push(lang+':'+k);
        }
      });
    });
    return [...new Set(missing)];
  });
  out.links[n] = await page.evaluate(()=>({
    wa: document.querySelectorAll('a[href*="wa.me/77774961358"]').length,
    tg: document.querySelectorAll('a[href*="t.me/zhanmate"]').length,
    badBlank: [...document.querySelectorAll('a[target="_blank"]')].filter(a=>!(a.rel||'').includes('noopener')).length,
    pf: document.querySelectorAll('.pf').length,
    cards: document.querySelectorAll('.price-card').length,
  }));
}
// сервис-воркер и оффлайн-кэш не ломают свежесть? проверим версию контента после reload
await page.goto('https://sits-eta.vercel.app/', {waitUntil:'networkidle0'});
await page.reload({waitUntil:'networkidle0'});
out.swReload = await page.evaluate(()=>!!document.querySelector('#pricing'));
await browser.close();
console.log(JSON.stringify(out,null,1));
console.log('JS errors:', errors.length?errors:'none');
