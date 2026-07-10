# ai-native-seo

**Движок AI-native SEO-портала.** Один репозиторий → статический контент-портал,
который одинаково хорошо читают люди, поисковики и AI-ответы (ChatGPT, Perplexity,
Алиса, AI Overviews). Живое демо — [blog.edgelab.space](https://blog.edgelab.space):
100+ страниц, собранных этим движком.

Ключевое свойство: **white-label из коробки**. Вся идентичность — бренд, палитра,
шрифты, домен, тексты главной, воронка, аналитика — живёт в одном файле
`brand.config.json`. Подменяешь конфиг — тот же движок собирает такой же портал
под ЛЮБОЙ бренд. Ноль строк кода.

---

## Почему «AI-native SEO»

Классическое SEO оптимизирует под поисковую выдачу. AI-native SEO добавляет слой
для нейросетей и агентов — чтобы контент попадал в AI-ответы (AEO/GEO) и был
удобен агентам как источник:

| Слой | Что эмитится | Для кого |
|---|---|---|
| Классика | title/description, canonical, Open Graph, sitemap.xml, robots.txt | Google, Яндекс |
| Структура | JSON-LD: Organization, WebSite, TechArticle, BreadcrumbList, HowTo, FAQPage | rich-сниппеты, Knowledge Graph |
| AI-слой | `llms.txt` + `llms-full.txt` (весь корпус одним файлом), markdown-твин каждой статьи (`/guides/<slug>.md`), `<link rel="alternate" type="text/markdown">` | ChatGPT, Perplexity, Claude, LLM-краулеры |
| Agent-native | `.well-known/mcp/server-card.json`, `.well-known/api-catalog`, `.well-known/agent-skills/index.json` | AI-агенты, MCP-клиенты |
| Свежесть | IndexNow: автоматический пинг Яндекса и Bing при каждом деплое | мгновенная индексация |
| Аналитика | Яндекс.Метрика (вебвизор, дочитываемость) + GA4 (scroll-depth, content_group) — прошиваются на сборке | измерение эффекта |

Весь этот слой — **100% аддитивный**: дизайн страниц не меняется ни на пиксель.

## Как это работает (архитектура)

```
site/                  ← React-прототип (1:1 дизайн, gf-app.jsx + gf-styles.css)
   │  npm run build
   ▼
scripts/prerender.mjs  ← Playwright рендерит прототип в чистую статику
   ▼
scripts/build-seo.mjs  ← SEO/GEO/AI-слой: head-инъекции, JSON-LD, sitemap,
   │                     llms.txt, markdown-твины, .well-known, 404, IndexNow-ключ
   ▼
build/                 ← готовые статические файлы — деплой как есть
```

Три принципа:

1. **Прототип — канон.** `site/` — 1:1 дизайн-прототип; он рендерится как есть,
   пост-обработка никогда не трогает разметку body.
2. **Идентичность — это данные.** `brand.config.json` на сборке превращается в
   `window.__BRAND` (его читает интерфейс) и CSS-токены `:root` (палитра/шрифты).
   EdgeLab — просто дефолтный конфиг.
3. **Контент — редакционный слой.** Статьи и гайды (`content-guides/*.mdx` +
   `site/guides-data.js`) — демо-наполнение от EdgeLab; свой портал наполняешь
   своим контентом.

## Быстрый старт

Требования: Node 18+, глобальный Playwright (`npm i -g playwright`) с Chrome,
python3 в PATH (локальный http-сервер на время рендера).

```bash
git clone https://github.com/qwwiwi/ai-native-seo && cd ai-native-seo
npm run build        # прототип → build/ (статика + весь SEO/AI-слой)
npx serve build      # локальный предпросмотр
```

## White-label: портал под свой бренд

```bash
mkdir -p brands && cp brand.config.example.json brands/mybrand.json
# заполни: brandName, domain, author, telegram, palette (hex), fonts (Google Fonts),
# funnel (mode: "none" убирает промо-блоки), home (тексты главной + metaDescription),
# analytics (свои Метрика/GA4/IndexNow-ключ), assets (логотип, og-картинка)

BRAND_CONFIG=brands/mybrand.json npm run build
```

Конфиг проходит **строгий валидатор на сборке**: hex-палитра, имена шрифтов,
только-https ссылки, форматы счётчиков. Опечатка или враждебное значение валит
сборку с понятной ошибкой — XSS через конфиг исключён by design.

Проверка чистоты бренда после сборки:

```bash
grep -ril "edgelab" build/ | grep -v guides-data && echo LEAK || echo CLEAN
# тексты демо-гайдов — редакционный слой, замени своим контентом
```

Полная инструкция: [`docs/WHITE-LABEL.md`](docs/WHITE-LABEL.md).

## Обложки

Генератор обложек 1600×900 (вордмарк, акцент и шрифты — из конфига бренда):

```bash
node tools/covers/compose-cover.mjs --bg scene.png \
  --eyebrow "ГАЙД · CLAUDE CODE" --title 'Claude <lime>Code</lime>' \
  --sub "Первая настройка с нуля" --out cover.png
# <lime> красит фрагмент в акцентный цвет бренда; --mono — ч/б сцена
```

## Деплой

```bash
BLOG_HOST=root@myserver BLOG_WEBROOT=/var/www/blog-mybrand scripts/deploy.sh
```

Скрипт сам: бэкапит текущий webroot → rsync → chown → пингует IndexNow по всем
URL из sitemap. Раздача — любой статический сервер (Caddy-блок в `deploy/`).

## Как мерить эффект

- **Яндекс.Метрика** — вебвизор, карта скроллов, «Аналитика контента» (дочитываемость;
  движок кладёт полный текст статьи в JSON-LD `articleBody` — это её требование).
- **GA4** — встроенный scroll-depth и `content_group` (article vs guide).
- **Яндекс.Вебмастер / Google Search Console** — запросы и покрытие индекса.
- **IndexNow** — свежие URL попадают в Яндекс/Bing в течение часов, не недель.

## Структура репозитория

| Путь | Что |
|---|---|
| `brand.config.json` | дефолтный бренд (EdgeLab) — образец заполнения |
| `brand.config.example.json` | болванка для своего бренда (Acme) |
| `site/` | React-прототип: gf-app.jsx (все экраны), gf-styles.css, страницы-обёртки |
| `content-guides/*.mdx` | исходники статей → markdown-твины |
| `scripts/prerender.mjs` | рендер прототипа в статику (Playwright) |
| `scripts/build-seo.mjs` | весь SEO/GEO/AI-слой + 404 + sidecar-файлы |
| `scripts/brand.mjs` | загрузка + валидация конфига бренда (единый gate) |
| `scripts/brand-client.mjs` | мост конфига в клиент: `window.__BRAND` + CSS-токены |
| `scripts/deploy.sh` | деплой + бэкап + IndexNow |
| `scripts/content-lint.mjs` | линт контента перед публикацией |
| `tools/covers/` | генератор обложек |
| `docs/` | WHITE-LABEL, SEO, DEPLOY, CONTENT, ANALYTICS, DESIGN-SYSTEM |

## Статус и лицензия

Движок разработан и используется в продакшене EdgeLab Space (blog.edgelab.space).
Публикуется как открытый исходник для сообщества EdgeLab: используйте для своих
проектов; демо-контент (тексты гайдов, имена, реквизиты в дефолтном конфиге)
принадлежит EdgeLab и подлежит замене в white-label сборках.

Вопросы и доработки — [EdgeLab Space](https://edgelab.space).
