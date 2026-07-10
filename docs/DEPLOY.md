# Деплой blog.edgelab.space

Статический портал. Сборка → `build/` → rsync на Timeweb, Caddy обслуживает, Cloudflare DNS (proxied).

## Сборка

```bash
node scripts/prerender.mjs      # билдит данные гайдов + пре-рендерит все роуты + SEO-слой → build/
# или: npm run build
```
`build/` — самодостаточная статика: страницы (контент в HTML), `robots.txt`, `sitemap.xml`,
`llms.txt`, `.well-known/{mcp/server-card.json, api-catalog, agent-skills/index.json}`,
markdown-двойники `guides/<slug>.md`.

## Инфраструктура (живое состояние)

- **Хостинг:** Timeweb `213.171.6.132`, каталог `/var/www/blog-edgelab-space/`, веб-сервер Caddy.
- **DNS:** Cloudflare, зона `edgelab.space`, запись `blog A 213.171.6.132` **proxied** (orange).
  Изменения DNS — глобальным ключом CF (CF_API_TOKEN read-only, см. историю инфры).
- **TLS:** Caddy авто-LE (HTTP-01 проходит через CF). CF SSL = Full.

## Деплой

**Канонический способ — `scripts/deploy.sh`** (бэкап + rsync + chown + авто-пинг IndexNow):
```bash
npm run build                                   # линт-гейт + пре-рендер + SEO-слой
scripts/deploy.sh                               # деплой + IndexNow по всем URL sitemap
scripts/deploy.sh https://blog.edgelab.space/guides/<slug>/   # ...только изменённые URL
# с Mac mini: BLOG_HOST=root@100.116.42.100 scripts/deploy.sh   (Tailscale-адрес бокса)
```
Под капотом (если деплоить руками):
```bash
# С Mac mini публичный 213.171.6.132:22 заблокирован → Tailscale 100.116.42.100 (= тот же бокс).
# С Thrall работает публичный 213.171.6.132 напрямую.
rsync -az --delete -e "ssh -o ConnectTimeout=15" build/ root@100.116.42.100:/var/www/blog-edgelab-space/
ssh root@100.116.42.100 "chown -R www-data:www-data /var/www/blog-edgelab-space"
node scripts/indexnow-submit.mjs                # авто внутри deploy.sh
# 2. Caddy vhost (блок blog.edgelab.space в /etc/caddy/Caddyfile) — см. ниже; меняется редко.
#    Только при правке vhost: backup + validate + reload
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

## IndexNow (мгновенная переиндексация Яндекс + Bing)

`build-seo.mjs` кладёт ключ-файл `build/<KEY>.txt` (KEY = `INDEXNOW_KEY`, body = сам
ключ) — после rsync он резолвится как `https://blog.edgelab.space/<KEY>.txt`. Сразу
ПОСЛЕ деплоя (URL уже живые — IndexNow проверяет резолв) пингуем движки:

```bash
node scripts/indexnow-submit.mjs                      # все URL из sitemap.xml
node scripts/indexnow-submit.mjs https://blog.edgelab.space/guides/<slug>/   # только изменённые
node scripts/indexnow-submit.mjs --dry-run            # проверить payload, не слать
```

Шлёт на `yandex.com/indexnow` + `api.indexnow.org` (Bing/общий). Запускать с Thrall
(сеть к движкам есть). 200/202 = принято. Ключ менять не нужно — он стабилен в репо.

## Caddy vhost (ключевое — device-serving + agent-readiness)

Полный блок — `deploy/caddy-blog-block.txt`. Деплой свапается скриптом
`deploy/swap-caddy-block.py` (brace-match замена блока в `/etc/caddy/Caddyfile`
+ бэкап `.bak.blogfix.<ts>`), затем `caddy validate` + `systemctl reload caddy`.

Ключевые свойства (фикс 2026-06-15 «страницы без стилей»):
- **Нормализующий rewrite** — и `.html`, и чистый URL с trailing-slash дают ОДИН
  файл. Desktop: `^/(.+?)(?:\.html)?/?$` → `/<clean>.html`. Mobile (UA-matched):
  то же → `/m/<clean>.html`. Корень `/` обрабатывается отдельным вложенным
  `handle` (без каскада rewrite — три каскадных правила раньше стомпали друг друга
  и отдавали мобильную главную вместо гайда).
- **CSS/JS — `Cache-Control: no-cache`** (`@assets path *.css *.js *.jsx *.map`).
  Версия `?v=` в URL УБРАНА (ломала регексы пререндера). Свежесть = no-cache +
  чистка CF при деплое (CF может перетирать на `max-age` — поэтому purge обязателен).
- HTML — `no-cache` + `Vary: User-Agent` (CF проходит к origin для UA-детекта).
- `/m/*`, `/mobile.html`, `.well-known`, статика — `@passthrough` (отдаются как есть).

## Пути ассетов и ссылок — ТОЛЬКО АБСОЛЮТНЫЕ (иначе ломается рендер)

**Все** пути ассетов и внутренние ссылки — абсолютные от корня. Относительные
(`../gf-styles.css`, `gf-styles.css`, `guides/X.html`) ЛОМАЮТСЯ: на чистом URL с
trailing-slash браузер резолвит `../gf-styles.css` в `/guides/gf-styles.css` = 404
→ страница без стилей. Поэтому:

- Ассеты: `/gf-styles.css`, `/gf-app.jsx`, `/guides-data.js`, `/image-slot.js`
  (в `site/*.html`, `site/mobile.html`, и шаблоне `scripts/build-guides-data.mjs`).
- Ссылки (`gf-app.jsx`): `PAGES` = `{home:"/",library:"/library/",claude:"/claude-code/",…}`,
  `GUIDE_HREF(slug)` = `/guides/${slug}/`, мобильный nav = `P(k)` (не `mobile.html#k`).
  `GF_BASE` больше не используется (был `../` для подпапки гайдов).
- **При правке CSS/JS** версию НЕ поднимаем — просто пересобрать + rsync + **purge CF**
  (`/gf-styles.css`, `/gf-app.jsx`, `/guides-data.js`, `/image-slot.js`).
- `bakeMobileRoute` (prerender) терпит query/абсолют: регекс `src="[^"]*gf-app\.jsx[^"]*"`
  (раньше ждал ровно `gf-app.jsx"` — `?v=` его ломал → мобильные гайды без `__GF_ROUTE`).
- Презентационный мокап iPhone (`.phone-status`/`.phone-home`) удалён из `gf-app.jsx`
  на уровне разметки. Класс `.phone` оставлен (CSS-переменные + мобильный layout-скоупинг);
  безель/тень/скругление сняты во frameless-override `gf-styles.css`.
- **iPhone full-bleed:** мета viewport несёт `viewport-fit=cover` (контент уходит под нижний
  бар Safari iOS), поверхность страницы — `min-height:100svh`, футер — `env(safe-area-inset-bottom)`.
  Косметика, но при регенерации `site/*.html` сохраняй `viewport-fit=cover` в мета-теге.

### Purge CF (после правки ассетов)
```bash
source ~/.claude-lab/silvana/secrets/cloudflare.env   # CF_EMAIL + CF_GLOBAL_KEY
ZID=$(curl -s -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_GLOBAL_KEY" \
  "https://api.cloudflare.com/client/v4/zones?name=edgelab.space" | jq -r '.result[0].id')
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZID/purge_cache" \
  -H "X-Auth-Email: $CF_EMAIL" -H "X-Auth-Key: $CF_GLOBAL_KEY" -H "Content-Type: application/json" \
  --data '{"files":["https://blog.edgelab.space/gf-styles.css","https://blog.edgelab.space/gf-app.jsx"]}'
```

## Проверка (после деплоя)

- `curl -I https://blog.edgelab.space/` → 200, контент в HTML
- `/robots.txt /sitemap.xml /llms.txt` → 200 с верными content-type
- `/.well-known/{mcp/server-card.json, api-catalog, agent-skills/index.json}` → 200 JSON
- `/library/`, `/guides/<slug>/` → 200 (чистые URL)
- несуществующий путь → **404** (не soft-404)
- isitagentready.com → перепроверить (Discoverability + Bot Access + MCP/API/Skill discovery должны позеленеть)

## TODO до публичного запуска (косметика)

- ~~OG-изображение 404~~ — ИСПРАВЛЕНО: per-slug og:image (обложка гайда `covers/<slug>.webp`) +
  реальный `site/images/og-default.png` fallback (build-seo.mjs).
- agent-skills sha256 (плейсхолдеры).
- Markdown content-negotiation (Accept: text/markdown) — `.md`-двойники пока доступны напрямую.
- Категории hermes/codex пусты (0 гайдов).
- Картинки/схемы в гайдах (намеренно без них — будущий редизайн обложек).
