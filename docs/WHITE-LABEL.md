# White-label — сборка портала под чужой бренд

Движок (M1): один репозиторий → любой бренд. Вся идентичность живёт в
`brand.config.json`; EdgeLab Space — дефолт. Подмена конфига перекрашивает и
переименовывает ВСЁ: SEO-слой, UI (палитра/шрифты/вордмарк/CTA), обложки,
404/redirect-страницы, agent-native карточки (`.well-known/*`).

## Шаги

1. **Конфиг.** Скопируй `brand.config.example.json` → `brands/<brand>.json`,
   заполни: `brandName`, `domain.*`, `author.*`, `telegram.*`, `palette.*`
   (hex), `fonts.*` (Google Fonts имена + собранный `googleHref`), `funnel.*`
   (`mode: "none"` полностью убирает community-CTA), `home.*` (нишевые тексты
   главной: eyebrow, title, description, metaDescription (SEO), CTA, hero-картинка — БЕЗ этого блока
   главная останется с текстами EdgeLab-ниши), `mcpIdentity.*`,
   `analytics.*` (свои Metrika/GA4 ids; `indexNowKey` — свой ключ),
   `assets.*` (og-default + логотип бренда), `categories[]` и `content.*`
   (см. таблицу ниже).

   Новые ключи (все опциональны, проходят валидатор `scripts/brand.mjs`):

   | Ключ | Что |
   |---|---|
   | `analytics.gscProperty` | GSC property: `sc-domain:<domain>` или `https://…/`. Без него сабмит sitemap в Google пропускается (`docs/DEPLOY.md`) |
   | `analytics.gscKeyPath` | путь к JSON-ключу сервис-аккаунта (`~/` раскрывается). Ключ хранится вне репо, **не коммитить** |
   | `funnel.utm.source` / `.campaign` / `.contentPrefix` | UTM ссылок воронки; `utm_content=<contentPrefix><slug>` своей страницы |
   | `categories[]` | `{ id, name, pillar?, description? }` — таксономия; порядок = порядок фасетов и «Все материалы». Без ключа — таксономия демо-контента |
   | `categories[].pillar` | URL страницы-листинга категории (`/claude-code/`); без него — нет средней крошки и своей страницы |
   | `categories[].description` | интро + meta description листинга; без него строится из гайдов (число + заголовки) |
   | `content.titleStopWords` | нишевые слова, которые есть почти в каждом title (не считаются «ответом» в правиле лида) |
   | `content.hubPages` | `/path/` хаб-страниц, которые засчитываются как ссылка на pillar для категорий без своего pillar |

2. **Ассеты.** Положи в `site/images/` свой `og-default` и `logo` (пути из
   `assets.*`), свои обложки в `site/covers/<slug>.webp`. Hero-изображение
   главной — тоже ассет бренда.

3. **Сборка.**
   ```bash
   BRAND_CONFIG=brands/<brand>.json npm run build
   ```
   Prerender инжектит `window.__BRAND` до рендера, build-seo прошивает
   `<head>` каждой страницы (`__BRAND` + `:root` токены + Google-Fonts href),
   генерит sitemap/robots/JSON-LD/llms.txt/server-card на домене бренда и
   404/guides-redirect из конфига. IndexNow-ключ эмитится сайдкаром.

4. **Обложки** (опционально, для новых материалов):
   ```bash
   BRAND_CONFIG=brands/<brand>.json node tools/covers/compose-cover.mjs \
     --bg scene.png --eyebrow "GUIDE · X" --title 'A <lime>B</lime>' --out cover.png
   ```
   Вордмарк, accent и шрифты берутся из конфига (`<lime>` — исторический
   тег, красит в accent бренда).

5. **Деплой** на свой vhost:
   ```bash
   BLOG_HOST=root@<host> BLOG_WEBROOT=/var/www/blog-<brand> scripts/deploy.sh
   ```
   Бэкап перед rsync --delete делается автоматически от `BLOG_WEBROOT`.

## Категории и pillar-страницы

Страница категории — **листинг** (H1 = имя категории, интро, карточка-ссылка на каждый гайд,
JSON-LD `CollectionPage` + `ItemList`), не копия гайда. Какие страницы существуют, решает
`categoryPages()` в `scripts/categories.mjs`: объявлен `pillar` + в категории ≥1 гайд +
есть файл `site/<pillar-slug>.html`. От этого списка строятся prerender-роуты, sitemap,
средняя крошка `BreadcrumbList` и навигация/футеры — ни одна ссылка не ведёт на 404.

Добавить pillar под новый бренд:
1. в `categories[]` задать `pillar: "/<slug>/"` (и, по желанию, `description`);
2. скопировать `site/claude-code.html` → `site/<slug>.html` и поменять в нём
   `window.__GF_CAT = "<id>"`;
3. замапить гайды на `<id>` в `SLUG_CAT` (`scripts/build-guides-data.mjs`).

Гейт — `scripts/verify-category-pages.mjs` (в конце сборки и в `npm run verify`).

## Проверка отсутствия утечек дефолта

После сборки под чужой бренд:

```bash
grep -ril "edgelab" build/ | grep -v guides-data && echo LEAK || echo CLEAN
```

Контент гайдов (`content-guides/*.mdx`) — редакционный слой: бренд приносит
свои материалы или лицензирует существующие; движок этим не управляет.
Поэтому тексты САМИХ гайдов (и их markdown-твины, `llms.txt`, поисковый индекс)
упоминают EdgeLab, пока бренд не заменит контент — это не утечка движка.

## Что где

| Слой | Файл |
|---|---|
| Конфиг бренда | `brand.config.json` / `BRAND_CONFIG=...` |
| Мост в клиент | `scripts/brand-client.mjs` (`window.__BRAND` + `:root` токены) |
| SEO/GEO слой | `scripts/build-seo.mjs` (+ `injectBrandOnly` для off-canonical) |
| UI-фолбэки | `site/gf-app.jsx` (константы из `__BRAND`, EdgeLab = фолбэк) |
| Токены стиля | `site/gf-styles.css` (единый `:root`, `--accent`/`--font-*`) |
| Обложки | `tools/covers/compose-cover.mjs` + `cover-template.html` |
| Таксономия / страницы категорий | `scripts/categories.mjs` (`categoryPages()`) + `site/<pillar>.html` |
| Деплой | `scripts/deploy.sh` (`BLOG_HOST`, `BLOG_WEBROOT`, `ALLOW_DELETE`) |
| Google Search Console | `scripts/gsc-submit-sitemap.mjs` (`analytics.gscProperty`, `analytics.gscKeyPath`) |
| Caddy vhost | `deploy/caddy-blog-block.txt` (бренд-специфичны строка сайта + `root`) |
