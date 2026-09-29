/* Загрузочный экран SITS «Чертёж» — общий для всех публичных страниц.
   Подключение: <script src="/splash.js"></script> первой строкой внутри <body>.
   Знак рисуется линией → заливается и светится → буквы «Sariyev IT Solutions» → счётчик 0–100%.
   Показывается при каждом открытии и обновлении страницы, клик или клавиша — пропустить. */
(function () {
  if (/[?&]nosplash\b/.test(location.search)) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HOLD = reduce ? 700 : 2150; // когда начинаем растворять
  var TAG = 'Sariyev IT Solutions';
  var D = 'M170 0 333 113 290 180 252 155 270 125 170 57 42 144 215 270 178 297 0 171 1 115Z M170 416 7 303 50 236 88 261 70 291 170 359 298 272 125 146 162 119 340 245 339 301Z';

  var css =
  '#sits-splash{position:fixed;inset:0;z-index:2147483000;background:#0c0a0b;color:#f4f1f1;display:grid;place-items:center;overflow:hidden;' +
  'container-type:size;transition:opacity .6s cubic-bezier(.4,0,.2,1),visibility .6s;font-family:Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased}' +
  '#sits-splash.out{opacity:0;visibility:hidden}' +
  '#sits-splash .g{position:absolute;inset:-2px;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);' +
  'background-size:4cqmin 4cqmin;background-position:center;-webkit-mask-image:radial-gradient(closest-side,#000,transparent);mask-image:radial-gradient(closest-side,#000,transparent);opacity:0;animation:ssG 2.1s ease forwards}' +
  '@keyframes ssG{0%{opacity:0;transform:scale(1.08)}40%{opacity:1}100%{opacity:.55;transform:none}}' +
  '#sits-splash .h{position:absolute;width:70cqmin;height:70cqmin;border-radius:50%;background:radial-gradient(closest-side,rgba(226,55,68,.28),transparent);opacity:0;animation:ssF .9s ease 1s forwards}' +
  '#sits-splash .c{position:relative;display:flex;flex-direction:column;align-items:center;gap:4.2cqmin}' +
  '#sits-splash svg{display:block;overflow:visible;height:clamp(110px,32cqmin,280px);width:auto;animation:ssS .9s ease 1.05s forwards}' +
  '#sits-splash path{fill:#e23744;fill-opacity:0;stroke:#ff5a67;stroke-width:3;vector-effect:non-scaling-stroke;stroke-dasharray:1;stroke-dashoffset:1;' +
  'animation:ssD 1s cubic-bezier(.6,0,.3,1) .12s forwards,ssL .5s ease 1s forwards}' +
  '@keyframes ssD{to{stroke-dashoffset:0}}@keyframes ssL{to{fill-opacity:1;stroke-opacity:0}}' +
  '@keyframes ssS{to{filter:drop-shadow(0 0 3cqmin rgba(226,55,68,.55))}}@keyframes ssF{to{opacity:1}}' +
  '#sits-splash .t{display:flex;font-family:Unbounded,"Arial Black",system-ui,sans-serif;font-weight:500;font-size:clamp(12px,2.6cqmin,20px);letter-spacing:.32em;' +
  'text-transform:uppercase;color:#a39d9e;overflow:hidden;white-space:nowrap;padding-left:.32em}' +
  '#sits-splash .t span{display:inline-block;transform:translateY(110%);animation:ssU .55s cubic-bezier(.2,.7,.2,1) forwards}' +
  '@keyframes ssU{to{transform:none}}' +
  '#sits-splash .m{display:flex;align-items:center;gap:14px;width:clamp(160px,36cqmin,300px);opacity:0;animation:ssF .4s ease .25s forwards}' +
  '#sits-splash .b{flex:1;height:2px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden}' +
  '#sits-splash .b i{display:block;height:100%;transform-origin:left;transform:scaleX(0);background:#e23744;animation:ssB 1.85s cubic-bezier(.4,0,.2,1) .15s forwards}' +
  '@keyframes ssB{to{transform:scaleX(1)}}' +
  '#sits-splash .n{font-family:Unbounded,system-ui,sans-serif;font-weight:500;font-size:12px;color:#a39d9e;min-width:3.2em;text-align:right;font-variant-numeric:tabular-nums}' +
  '@media (max-width:420px){#sits-splash .t{letter-spacing:.24em;font-size:11px}}' +
  '@media (prefers-reduced-motion:reduce){#sits-splash *{animation-duration:.01s!important;animation-delay:0s!important}}' +
  /* входные анимации первого экрана ждут конца заставки и играют, когда она растворяется */
  'html.sits-splashing .rise,html.sits-splashing .arm-l,html.sits-splashing .arm-r{animation-play-state:paused!important}';

  var letters = '';
  for (var i = 0; i < TAG.length; i++) {
    var ch = TAG.charAt(i);
    letters += '<span style="animation-delay:' + (0.95 + i * 0.026).toFixed(3) + 's">' + (ch === ' ' ? '&nbsp;' : ch) + '</span>';
  }

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var html = document.documentElement;

  function show() {
    var old = document.getElementById('sits-splash'); if (old) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'sits-splash'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="g"></div><div class="h"></div><div class="c">' +
      '<svg viewBox="-4 -4 348 424"><path pathLength="1" d="' + D + '"/></svg>' +
      '<div class="t">' + letters + '</div>' +
      '<div class="m"><div class="b"><i></i></div><div class="n">0%</div></div></div>';
    document.body.insertBefore(el, document.body.firstChild);

    var prevOverflow = html.style.overflow === 'hidden' ? '' : html.style.overflow;
    html.style.overflow = 'hidden';
    html.classList.add('sits-splashing');

    var n = el.querySelector('.n'), t0 = performance.now(), gone = false;
    (function step(t) {
      var k = Math.min(1, Math.max(0, (t - t0 - 150) / 1850)), e = 1 - Math.pow(1 - k, 3);
      n.textContent = Math.round((reduce ? 1 : e) * 100) + '%';
      if (k < 1 && !gone) requestAnimationFrame(step);
    })(t0);

    function hide() {
      if (gone) return; gone = true;
      el.classList.add('out');
      html.classList.remove('sits-splashing');
      html.style.overflow = prevOverflow;
      window.removeEventListener('keydown', hide);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }
    setTimeout(hide, HOLD);
    el.addEventListener('click', hide);
    window.addEventListener('keydown', hide);
  }

  show();
  // «Назад/Вперёд» восстанавливает страницу из памяти браузера без перезагрузки — показываем заставку и тогда
  window.addEventListener('pageshow', function (e) { if (e.persisted) show(); });
})();
