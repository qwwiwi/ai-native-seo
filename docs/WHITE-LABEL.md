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
   `assets.*` (og-default + логотип бренда).

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
| Деплой | `scripts/deploy.sh` (`BLOG_HOST`, `BLOG_WEBROOT`) |
