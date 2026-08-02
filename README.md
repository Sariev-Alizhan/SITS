# SITS — Sariyev IT Solutions

Производственный сайт IT-студии полного цикла + CRM для команды + AI-консультант + маркетинговый инструментарий.

**Прод:** [https://sits-eta.vercel.app](https://sits-eta.vercel.app)

## Что это

- Многоязычный сайт на статическом HTML+CSS+JS — без билд-фреймворка, без React. Главная: `/` (ru), `/en`, `/kz`; отдельная страница прайса `/price` (язык переключается на месте).
- Build-time генерация: `scripts/build-i18n.mjs` собирает `en.html` и `kz.html` из `index.html` + словаря `I18N` на каждом деплое — единый источник правды.
- Serverless-бэкенд на Vercel Functions (`api/*.js`): заявки, CRM, AI.
- **AI-консультант на сайте** (виджет на `/` и `/price`): отвечает по услугам и ценам на RU/KZ/EN и принимает заявки прямо в чате (tool use → CRM + Telegram). Живое демо пакета «Лендинг + AI».
- CRM `/crm` — командная панель: заявки сайта, обзвон, партнёры, сделки, заметки, календарь, стратегия и скрипты продаж, генератор КП с ИИ.
- Сигнатурный визуал: тёмная тема + красный акцент (#e23744), Unbounded + Manrope, dotted grid, grain, курсор-прожектор. Уважает `pointer:fine` и `prefers-reduced-motion`. **Правило бренда: никаких эмодзи — только SVG-иконки (lucide-стиль).**

## Структура

```
index.html              главная: источник правды + словарь I18N
en.html, kz.html        генерируются билд-скриптом, в git не коммитятся
price.html              прайс (3 языка внутри одной страницы)
crm.html                CRM команды
admin.html              старая админка заявок (совместимость)
404.html                брендовая 404

api/
  lead.js               POST заявка с формы (Supabase + Telegram, honeypot, time-trap)
  leads.js / lead-status.js / lead-delete.js   работа с заявками (auth CRM)
  assistant.js          публичный AI-консультант сайта (Claude + tool use save_lead)
  crm-*.js              CRM-эндпоинты (сделки, партнёры, обзвон, заметки, КП с ИИ)
  _db.js / _security.js / _crm-auth.js         общие модули (Supabase, rate-limit, auth)

scripts/
  build-i18n.mjs        генератор en.html / kz.html
  make-vizitka.mjs      визитки PDF+PNG на 3 языках (brand/sits-vizitka*)
  make-target-slides.mjs креативы для таргета: HTML-слайды → PNG (любой файл слайдов)
  make-motion.mjs       анимированные видео-креативы: CSS-анимация → MP4 (ffmpeg)
  end-sale80.mjs        снятие акции −80% одной командой (см. «Акция» ниже)

marketing/              (в git не входит) креативы, тексты объявлений, чеклисты
brand/                  лого, favicon, og-image (+ og-template.html), визитки, OLX-слайды
portfolio/              скриншоты проектов (WebP)
fonts/                  woff2-сабсеты (Unbounded, Manrope, PT Serif) + микро-сабсеты «₸»
sw.js                   Service Worker; ПРИ ЛЮБОЙ ПРАВКЕ СТРАНИЦ ПОДНИМАТЬ ВЕРСИЮ КЭША
vercel.json             buildCommand + cleanUrls + security headers + CSP + cache
```

## Акция −80% (до 1 сентября 2026)

Все цены на сайте, в визитках, креативах и AI-промптах — акционные (база × 0.2).
Снятие 1 сентября: `node scripts/end-sale80.mjs` → build-i18n → make-vizitka → перерендер og-image → commit+push.
Полный чеклист: `marketing/чеклист-снятие-акции.md`. Промпты в `api/assistant.js` и `api/crm-ai.js` скрипт не правит — предупредит, обновить руками.

## Локальная разработка

```bash
npm install
node scripts/build-i18n.mjs        # сборка en.html / kz.html
node scripts/dev-server.mjs        # или python3 -m http.server 8000
```

`/api/*` локально не работают — это serverless functions, для них нужен `vercel dev` или прод.

## Деплой

GitHub → Vercel автодеплой на каждый `git push` в `main`.
Если пуш вдруг не создал деплой — репозиторий выпал из доступа Vercel GitHub App; вернуть:
`gh api -X PUT /user/installations/112029577/repositories/1256964174` (чинили 02.08.2026).
Запасной вариант: `vercel --prod` (CLI слинкован).

## Переменные окружения (Vercel дашборд)

| Переменная | Назначение |
|---|---|
| `SUPABASE_URL` / `SUPABASE_KEY` (`SUPABASE_SERVICE_ROLE_KEY`) | БД: заявки, сделки, партнёры, заметки |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Уведомления о заявках (форма и AI-чат) |
| `ADMIN_PASSWORD` | Мастер-пароль владельца (CRM/админка) |
| `ANTHROPIC_API_KEY` | AI: консультант сайта + генератор КП в CRM |
| `SITE_AI_MODEL` | Модель консультанта сайта (по умолчанию claude-haiku-4-5) |
| `CRM_AI_MODEL` | Модель генератора КП (по умолчанию claude-opus-4-8) |

После изменения переменных — Redeploy.

## Аналитика

Vercel Web Analytics: скрипт стоит на `/` и `/price`; включается кнопкой Dashboard → Analytics → Enable.
UTM-разметка ссылок для рекламных кампаний — в `marketing/target-посты-80.md`.

## Безопасность

- CSP в enforcement-mode; nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, HSTS.
- Форма заявок: honeypot + time-trap + rate-limit per-IP + origin-check.
- AI-консультант: rate-limit 15/5 мин и 60/сутки на IP, origin-check, лимиты длины, без ключа мягко отключается.
- `/crm` и `/admin` под паролем, `no-store`, `noindex`. Секреты только в Vercel env.

## Производительность (Lighthouse mobile ≈ 91)

- Self-hosted шрифты, `font-display:swap`, critical preload.
- Символ ₸ вынесен в микро-сабсеты (~800 байт/вес) — страницы не тянут latin-ext по 50–115 КБ.
- Первый экран прайса рендерится без ожидания JS (reveal-анимации — только ниже фолда).
- Портфолио в WebP + lazy-loading; `Cache-Control: immutable` для статики; Brotli, HTTP/2.

## Стек

`Vanilla HTML + CSS + JS` · `Node.js serverless` · `Vercel` · `Supabase` · `Claude API (Anthropic)` · `Telegram Bot API` · `Puppeteer + ffmpeg (генерация креативов)`

---

Основатель — Сариев Алижан Сабитулы. Контакт: raimzhan1907@gmail.com.
