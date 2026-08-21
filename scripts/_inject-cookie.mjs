import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const banner = (await readFile(join(__dirname, '_cookie-banner.html'), 'utf-8')).trim();

const ALL_PAGES = ['index.html', 'price.html', 'avtomatizatsiya.html', 'terms.html', 'privacy.html'];
const ANALYTICS_PAGES = ['index.html', 'price.html', 'avtomatizatsiya.html'];

// --- аналитика: было ---
const OLD_ESM = `<script type="module">
  try {
    const { inject } = await import('https://esm.sh/@vercel/analytics@1.5.0');
    inject();
  } catch (e) { /* analytics not critical */ }
  try {
    const { injectSpeedInsights } = await import('https://esm.sh/@vercel/speed-insights@2.0.0');
    injectSpeedInsights();
  } catch (e) { /* speed insights not critical */ }
</script>`;

// --- аналитика: стало (ядро согласия + отложенная загрузка) ---
const NEW_ESM = `<script>
/* Согласие на cookie — ядро (определяем ДО аналитики) */
(function(){var K='sits-cookie-consent',s=null;try{s=localStorage.getItem(K)}catch(e){}
window.sitsConsent=s;window.__sccQ=window.__sccQ||[];
window.onSitsConsentAll=function(fn){if(window.sitsConsent==='all'){try{fn()}catch(e){}}else{window.__sccQ.push(fn)}};})();
</script>
<script>
/* Vercel Web Analytics + Speed Insights — грузим ТОЛЬКО при согласии «Принять все». Версии залочены от supply-chain. */
window.onSitsConsentAll(function(){
  import('https://esm.sh/@vercel/analytics@1.5.0').then(function(m){m.inject()}).catch(function(){});
  import('https://esm.sh/@vercel/speed-insights@2.0.0').then(function(m){m.injectSpeedInsights()}).catch(function(){});
});
</script>`;

const OLD_INSIGHTS = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>`;

const NEW_INSIGHTS = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
/* Vercel insights-скрипт — только при согласии «Принять все». */
window.onSitsConsentAll(function(){var s=document.createElement('script');s.defer=true;s.src='/_vercel/insights/script.js';document.head.appendChild(s);});</script>`;

for (const page of ALL_PAGES) {
  const path = join(ROOT, page);
  let html = await readFile(path, 'utf-8');
  const before = html;

  if (ANALYTICS_PAGES.includes(page)) {
    if (html.includes(OLD_ESM)) html = html.replace(OLD_ESM, NEW_ESM);
    else if (!html.includes('onSitsConsentAll')) console.warn(`! ${page}: ESM-аналитика не найдена (пропуск)`);
    if (html.includes(OLD_INSIGHTS)) html = html.replace(OLD_INSIGHTS, NEW_INSIGHTS);
    else if (!html.includes("appendChild(s)")) console.warn(`! ${page}: insights-скрипт не найден (пропуск)`);
  }

  // вставка баннера перед последним </body>
  if (!html.includes('id="scc"')) {
    const i = html.lastIndexOf('</body>');
    if (i < 0) { console.warn(`! ${page}: нет </body> (пропуск баннера)`); }
    else html = html.slice(0, i) + banner + '\n' + html.slice(i);
  }

  if (html !== before) { await writeFile(path, html); console.log(`✓ ${page}`); }
  else console.log(`= ${page} (без изменений)`);
}
