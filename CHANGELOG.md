# Changelog

Все заметные изменения движка. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [2026-10-25]

### Перенесено из эталонного блога

- **Эталонный блог PR #117 — Google SEO-пакет.** Честный `lastmod` из git
  (`scripts/content-dates.mjs`: дата последнего коммита, существенно менявшего текст — ≥30 слов
  или `[content]` в теме коммита); в sitemap нет `changefreq`/`priority`. Сабмит sitemap в Google
  Search Console на каждый деплой (`scripts/gsc-submit-sitemap.mjs`, ключи бренда
  `analytics.gscProperty` / `analytics.gscKeyPath`, env `GSC_SA_KEY` / `GSC_SITE` / `GSC_SITEMAP`).
  Авто-индекс «Все материалы» на каждой странице гайда (desktop и `/m/`); UTM своего гайда
  `utm_content=<funnel.utm.contentPrefix><slug>`. 301 на канонические URL со слэшем,
  `/index.html` → `/`, `/guides(/|.html)` → `/library/` (`deploy/caddy-blog-block.txt`).
  Правила Google в `content-lint` для гайдов с `published_at` ≥ 2026-10-18; для всех гайдов —
  FAIL на сдвиг даты без правки текста, slug вне `SLUG_CAT` / ≠ имени файла, внутреннюю ссылку
  без `/` на конце. Новая демо-категория `ai`.
- **Эталонный блог PR #112 — noindex дублей.** `X-Robots-Tag: noindex` на `/guides/*.md`,
  `/llms.txt`, `/llms-full.txt`, `/search-index.json` (в движке — ещё и `/.well-known/*`);
  `<meta name="robots" content="noindex">` в off-canonical `guide.html` и `mobile.html`.
- **Эталонный блог PR #115 — гейт удалений при деплое.** `scripts/deploy.sh` сначала делает
  `rsync -azn --delete --checksum`; любая строка `*deleting` останавливает деплой до бэкапа и
  rsync (`ALLOW_DELETE=1` — если удаление запланировано); ошибка ssh/rsync — тоже стоп (fail-closed).

### Добавлено

- `scripts/check.sh` / `npm run check` — локальный гейт: content-lint → `npm test` →
  `npm run build` → `npm run verify` (`--no-build` — без сборки). npm-скрипты `lint`, `build`,
  `verify`, `test`, `check`.
- `scripts/verify-google-seo.mjs` и `scripts/verify-category-pages.mjs` (последний — ещё и в конце
  сборки, падение валит билд).
- Ключи бренда: `analytics.gscProperty`, `analytics.gscKeyPath`, `funnel.utm.*`,
  `categories[]` (`id`, `name`, `pillar`, `description`), `content.titleStopWords`, `content.hubPages`.
- `deploy/swap-caddy-block.py [block-file] [site-marker]` — маркер сайта по умолчанию = первая
  строка блока (без захардкоженного хоста); `CADDYFILE` для тестов.

### Исправлено

- **Страницы категорий — листинги, а не копия гайда.** Роут категории раньше рендерил копию её
  первого гайда (тот же H1 и текст под `/claude-code/` и т. п.). Теперь `CategoryPage` в
  `site/gf-app.jsx`: H1 = имя категории, интро = `categories[].description` или авто-текст из
  гайдов (число + заголовки), карточка-ссылка на каждый гайд, meta description = то же интро (без
  шаблона «Гайды по теме X»), JSON-LD `CollectionPage` + `ItemList`. `content-lint` FAIL-ит гайд,
  чей title совпадает с H1 страницы категории.
- **Категории выводятся из контента.** Страницы категорий, средняя крошка `BreadcrumbList`,
  pillar-URL в sitemap, prerender-роуты и навигация/футеры строятся из `categoryPages()`
  (`scripts/categories.mjs`): объявлен `pillar` + ≥1 гайд + есть `site/<pillar-slug>.html`. Ни одна
  крошка или ссылка не ведёт на 404.
- **lastmod листингов = самый свежий дочерний гайд:** главная и `/library/` — самый свежий гайд,
  страница категории — самый свежий гайд категории, `/about/` — фиксированная дата.
- **Семантика пропуска GSC.** Нет property или ключа → exit 2, `deploy.sh` печатает «skipped» и
  продолжает; 401/403 → exit 3 с ручным шагом для владельца property; прочее → exit 1 (WARN).
  `--dry-run`, `--status`, `--top N`.
- **Место блока «Читайте дальше»:** сразу после текста статьи, перед CTA (desktop и `/m/`);
  `verify-related.mjs` проверяет место и отсутствие блока на страницах категорий.
- **Честная дата и коммит-создание файла:** для коммита, который добавил файл (часто bulk-импорт),
  побеждает frontmatter `updated_at`, если он не позже этого коммита — импорт не выдаётся за
  дату правки текста.
