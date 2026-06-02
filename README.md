# SITS — Sariyev IT Solutions

Производственный сайт IT-студии полного цикла + защищённая CRM для заявок.

**Прод:** [https://sits-eta.vercel.app](https://sits-eta.vercel.app)

## Что это

- Многоязычный одностраничник на статическом HTML+CSS+JS — без билд-фреймворка, без React. Три реальных URL: `/` (русский, по умолчанию), `/en` (английский), `/kz` (казахский).
- Build-time генерация: `scripts/build-i18n.mjs` собирает `en.html` и `kz.html` из `index.html` + словаря `I18N` на каждом деплое — единый источник правды, языковые версии не расходятся.
- Backend для формы заявки на Vercel Serverless Functions (`api/*.js`): приём в Telegram-бот + сохранение в Upstash Redis.
- CRM `/admin` — пароль-защищённая страница с фильтром, статусами (новая → в работе → закрыта), экспортом в CSV и удалением.
- Сигнатурный визуал: аврора-фон + dotted grid + grain, курсор-прожектор, магнитная CTA, 3D-наклон карточек портфолио. Всё уважает `pointer:fine` и `prefers-reduced-motion`.

## Структура

```
index.html              источник правды + словарь I18N + I18N-only JS-перевод
en.html, kz.html        генерируются билд-скриптом, в git не коммитятся
admin.html              CRM-панель
404.html                брендовая 404

api/
  lead.js               POST приём заявки (Telegram + KV + honeypot)
  leads.js              GET список заявок (auth: ADMIN_PASSWORD)
  lead-status.js        POST смена статуса
  lead-delete.js        POST удаление

scripts/build-i18n.mjs  генератор языковых HTML

brand/                  лого, favicon, og-image, фото основателя
portfolio/              скриншоты 9 проектов (WebP, оптимизированы)
fonts/                  40 woff2 (Unbounded 400-800, Manrope 400-700, PT Serif 700)
                        + fonts.css для admin/404

docs/
  design-brief.md       дизайн-направление и брендбук
  content.json          справочник данных
  SETUP-CRM.md          инструкция по переменным окружения

vercel.json             buildCommand + cleanUrls + security headers + CSP + cache
sitemap.xml             3 URL с cross-hreflang
robots.txt              разрешено всё кроме /admin
```

## Локальная разработка

```bash
npm install
node scripts/build-i18n.mjs        # сборка en.html / kz.html
python3 -m http.server 8000        # статический preview
# открыть http://localhost:8000/
```

`/api/*` локально не работают — это serverless functions, для них нужен `vercel dev` или прод.

## Деплой

GitHub → Vercel автодеплой на каждый `git push` в `main`. Языковые HTML и preload`овые шрифты пересобираются автоматически (`buildCommand` в `vercel.json`).

## Переменные окружения (только в Vercel дашборде)

| Переменная | Где взять | Назначение |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/token` | Уведомления о новых заявках |
| `TELEGRAM_CHAT_ID` | @userinfobot → `/start` | Куда слать уведомления |
| `ADMIN_PASSWORD` | придумываешь сам, 16+ символов | Логин в CRM `/admin` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | автоматом от Storage → Upstash Redis | Хранение заявок |

После любого изменения переменных — `Redeploy`.

## SEO

- Каждый язык — отдельный URL с правильным `<html lang>`, `<title>`, `meta description`, `og:locale`, `canonical`, `og:url`.
- 4 hreflang-альтернативы (ru / en / kk / x-default) на каждой странице.
- `sitemap.xml` с тремя URL и перекрёстными `xhtml:link rel="alternate"`.
- og-image 1200×630 в фирменном стиле.

## Безопасность

- `Content-Security-Policy` в **enforcement-mode**.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, HSTS.
- Honeypot-поле в форме отбрасывает ботов тихо (200 OK без сохранения и без уведомления).
- Все секреты только в Vercel env, никогда в коде.
- `/admin` под паролем + `no-store` cache + `X-Robots-Tag: noindex`.

## Производительность

- Self-hosted шрифты (40 woff2) с `font-display:swap` + 4 critical preload (Unbounded 600/700 latin+cyrillic). FOUT исключён.
- Портфолио в WebP с lazy-loading (15 МБ → 0.6 МБ суммарно).
- `Cache-Control: max-age=1y, immutable` для `/brand/`, `/portfolio/`, `/fonts/`.
- Brotli on Vercel CDN, HTTP/2.

## Стек

`Vanilla HTML + CSS + JS` · `Node.js serverless` · `Vercel` · `Upstash Redis (KV)` · `Telegram Bot API` · `Vercel Web Analytics`

---

Основатель — Сариев Алижан Сабитулы. Контакт: raimzhan1907@gmail.com.
