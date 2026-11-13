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

## Перед деплоем: локальный гейт `scripts/check.sh`

CI нет — гейт запускается руками перед каждым push/деплоем:

```bash
scripts/check.sh              # content-lint → npm test → npm run build → npm run verify
scripts/check.sh --no-build   # то же без сборки — проверки по уже собранному build/
```

- `npm test` — `node --test` по `tests/*.test.mjs` из `package.json` (юнит/регрессии, без сети;
  `tests/indexnow.test.mjs` — отправка в IndexNow с подменой сети: настоящие адреса не вызываются).
- `npm run verify` — пост-билд проверки: `verify-google-seo.mjs` (sitemap/lastmod, «Все
  материалы», UTM своего slug, крошки), `verify-category-pages.mjs` (страницы категорий —
  листинги, все ссылки/крошки резолвятся), `verify-related.mjs`, `verify-readthrough-analytics.mjs`.
- Без `build/sitemap.xml` вариант `--no-build` падает — сначала собрать.

## Где собирать

Где угодно, где есть Node + Playwright + Chromium/Chrome и python3 (см. `package.json`
`comments.prerender`). Если пре-рендер упал с `TimeoutError` на `networkidle` — это сеть:
перезапусти `npm run build` один раз.

## Деплой

### Гейт удалений: сухой прогон (встроен в `deploy.sh`)

`deploy.sh` синхронизирует webroot **с `--delete`**: всё, чего нет в `build/`, на проде
удаляется. Поэтому первым шагом скрипт делает сухой прогон:

```bash
rsync -azn --delete --checksum --out-format='%i %n' build/ "$BLOG_HOST:$BLOG_WEBROOT/"
```

- Есть хоть одна строка `*deleting` → деплой **останавливается ДО бэкапа и rsync** и печатает
  список. `ALLOW_DELETE=1 scripts/deploy.sh` — только если удаление запланировано.
- Ошибка ssh/rsync в сухом прогоне тоже обрывает деплой (fail-closed: сбой не читается как
  «удалений нет»).

Типовая причина незапланированных удалений: собрана ветка без свежих материалов из `main`
(слияние `main` сделано локально и не отправлено туда, где идёт сборка). Деплой такой сборки
снёс бы с прода чужие свежие гайды вместе с обложками — смёржи `main` и пересобери.

**Канонический способ — `scripts/deploy.sh`** (сухой прогон с гейтом удалений → бэкап → rsync →
chown → уведомление IndexNow → сабмит sitemap в Google Search Console):
```bash
npm run build                                   # линт-гейт + пре-рендер + SEO-слой
scripts/deploy.sh                               # деплой + IndexNow ТОЛЬКО по страницам, чей контент изменился
scripts/deploy.sh https://blog.edgelab.space/guides/<slug>/   # ...вместо этого — ровно эти URL
scripts/deploy.sh --all                         # ...вместо этого — все URL sitemap (редко, осознанно)
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

## IndexNow (уведомление Яндекса и Bing об изменённых страницах)

**IndexNow** — это протокол, которым сайт сообщает поисковикам: «эта страница появилась или
изменилась, зайдите и посмотрите». Это **уведомление, а не гарантия**: сами поисковики
пишут, что IndexNow «не гарантирует, что страницы будут просканированы или проиндексированы»
([indexnow.org/documentation](https://www.indexnow.org/documentation),
[bing.com/indexnow/getstarted](https://www.bing.com/indexnow/getstarted)), а ответ 200/202 значит
только «получили». Слать им весь сайт при каждом деплое тоже не предполагается («not designed
for submitting every URL on your site at once», [indexnow.org/faq](https://www.indexnow.org/faq)) —
поэтому по умолчанию уходят только изменённые страницы.

`build-seo.mjs` кладёт ключ-файл `build/<KEY>.txt` (KEY = `INDEXNOW_KEY`, body = сам
ключ) — после rsync он резолвится как `https://blog.edgelab.space/<KEY>.txt`. Сразу
ПОСЛЕ деплоя (URL уже живые — IndexNow проверяет резолв) `deploy.sh` уведомляет движки.

**Как скрипт узнаёт, что изменилось.** Предыдущее состояние — это живой webroot на сервере.
Сухой прогон `rsync --checksum` (он нужен для гейта удалений) уже перечисляет файлы, чьё
содержимое отличается от живого или которых там ещё нет; из этого списка берутся страницы
(`.html`), которые есть в `sitemap.xml`. Отдельный файл состояния нигде не хранится.

| Ситуация | Что уходит в IndexNow |
|---|---|
| Деплой без изменений контента | 0 URL, запросов в сеть нет |
| Правка одного гайда | URL этого гайда, плюс листинги (главная, каталог, страница категории), если их HTML тоже изменился |
| Первый деплой (webroot ещё нет — сравнивать не с чем) | ничего автоматически; скрипт печатает команду `--all` |
| `scripts/deploy.sh <url>…` | ровно эти URL |
| `scripts/deploy.sh --all` | все URL из `sitemap.xml` |

```bash
node scripts/indexnow-submit.mjs https://blog.edgelab.space/guides/<slug>/   # только эти URL
node scripts/indexnow-submit.mjs --all                # ВСЕ URL из sitemap.xml (редко, осознанно)
node scripts/indexnow-submit.mjs --dry-run --all      # проверить payload, не слать
node scripts/indexnow-submit.mjs                      # ничего не шлёт, печатает подсказку
```

Шлёт на `yandex.com/indexnow` + `api.indexnow.org` (Bing/общий; отправка на одну точку
расшаривается между движками, вторая — лишь дополнение). Запускать с Thrall (сеть к
движкам есть). 200/202 = принято. Ключ менять не нужно — он стабилен в репо.

**Коды выхода `indexnow-submit.mjs`:**

| Код | Значение | Что делать |
|---|---|---|
| 0 | отправлено, либо слать было нечего | — |
| 1 | ошибка: плохие аргументы, URL не с нашего хоста, сеть, ответ не 200/202/429 | смотреть строки выше, перезапустить |
| 75 | **HTTP 429 — слишком много запросов.** Скрипт печатает время ожидания из заголовка `Retry-After` (в секундах и моментом, раньше которого повторять нельзя), **не делает ни одного следующего запроса** и останавливается | подождать указанное время и запустить снова только для изменённых URL; не повторять в цикле — каждая повторная попытка продлевает блокировку |

`deploy.sh` на код 75 не падает (сайт уже выложен): печатает предупреждение «IndexNow is
rate-limited» и продолжает отправку sitemap в Google.

## Журнал визитов роботов: приходят ли OAI-SearchBot и bingbot

**Зачем.** Чтобы страница могла попасть в ответ ChatGPT, OpenAI требует пускать на сайт его
поискового робота **OAI-SearchBot** и не блокировать его адреса на хостинге или в CDN
(сети доставки, у нас это Cloudflare) — см. [`AI-VISIBILITY.md`](AI-VISIBILITY.md). Проверить
это можно только по журналу сервера: в нём видно, кто заходил, под каким именем
(**User-Agent** — строка, которой программа представляется сайту) и что получил в ответ.
Код 200 — страницу отдали, 403 — не пустили. Поэтому в `deploy/caddy-blog-block.txt`
включён журнал `log`: одна строка JSON на запрос, файл `/var/log/caddy/blog-access.log`.

**Один раз на сервере** (до свапа блока; делает владелец сервера):
```bash
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy   # пользователь веб-сервера может называться иначе — проверь `ps -o user= -C caddy`
```
Дальше — обычный свап блока (раздел «Редиректы и noindex») и `caddy validate … && systemctl reload caddy`.

**Ротация** (чтобы журнал не заполнил диск): новый файл при 50 МБ, хранятся 5 последних, но не
старше 30 дней. В журнале есть IP посетителей — это персональные данные: не выкладывайте
журнал в открытый доступ и не копируйте его в чаты.

**Как проверить визиты роботов.** Нужен `jq` (утилита для чтения JSON; ставится `apt install jq`).
Сколько раз каждый робот приходил и с каким кодом ответа:
```bash
jq -r 'select(.request.headers["User-Agent"][0] | test("OAI-SearchBot|bingbot"; "i")) | [(.request.headers["User-Agent"][0] | capture("(?<bot>OAI-SearchBot|bingbot)"; "i").bot), .status] | @tsv' /var/log/caddy/blog-access.log | sort | uniq -c
```
Результат читается так: `12  OAI-SearchBot  200` — робот приходил 12 раз и получал страницу.
Без `jq` то же для одного робота: `grep -i oai-searchbot /var/log/caddy/blog-access.log | grep -o '"status":[0-9]*' | sort | uniq -c`.

- Везде 200 — роботов пускают.
- Есть 403 (или 401, 5xx) — их блокирует хостинг, Cloudflare (режим блокировки AI-ботов) или
  правило файрвола: это надо чинить, не дожидаясь контента. Проверка Cloudflare — вне репозитория.
- Строк нет совсем — это ещё не доказательство, что робот не приходил. Возможны две причины:
  либо он пока не заходил (это не ошибка; новые и маленькие сайты роботы навещают нечасто),
  либо запрос отклонил CDN (сеть-посредник между посетителем и вашим сервером; здесь это
  Cloudflare) — тогда он не дошёл до Caddy, и в журнале сервера (его называют «origin», то есть
  «исходный сервер») следа нет. Поэтому при пустом результате откройте и журнал событий самого
  CDN (в Cloudflare — раздел Security → Events: там видно, какие запросы заблокированы и каким
  правилом) и поищите там OAI-SearchBot и bingbot. Пока оба журнала не проверены, вывод
  «робот не заходил» делать нельзя. Журнал сервера стоит смотреть через несколько дней после
  включения.

**Настоящий ли это OAI-SearchBot.** Любой может назваться `OAI-SearchBot` в User-Agent.
OpenAI публикует список адресов своего робота: <https://openai.com/searchbot.json>
(источник: [OpenAI, боты](https://developers.openai.com/api/docs/bots)). Чтобы сверить:

1. Достаньте адрес посетителя. Сайт стоит за Cloudflare, поэтому поле `request.remote_ip` —
   это адрес Cloudflare, а настоящий лежит в заголовке `Cf-Connecting-Ip` (Caddy пишет все
   заголовки запроса в журнал):
   ```bash
   jq -r 'select(.request.headers["User-Agent"][0] | test("OAI-SearchBot"; "i")) | (.request.headers["Cf-Connecting-Ip"][0] // .request.remote_ip)' /var/log/caddy/blog-access.log | sort | uniq -c
   ```
2. Скачайте список и проверьте адрес (подставьте свой IP вместо `203.0.113.5`; скрипт берёт из файла
   все записи вида `адрес/число` и сверяет, не рассчитывая на конкретную структуру файла):
   ```bash
   curl -s https://openai.com/searchbot.json -o /tmp/searchbot.json
   python3 -c 'import sys,re,ipaddress as i; nets=[i.ip_network(m,strict=False) for m in re.findall(r"[0-9a-fA-F:.]+/\d+", open(sys.argv[1]).read())]; ip=i.ip_address(sys.argv[2]); print("в списке OpenAI" if any(ip in n for n in nets if n.version==ip.version) else "НЕТ в списке OpenAI")' /tmp/searchbot.json 203.0.113.5
   ```
   «НЕТ в списке» при имени `OAI-SearchBot` — самозванец: на ваш контент он влияния не имеет.

Для `bingbot` проверка адреса в этом гайде не описана — первоисточник для неё не открывался.
Список OpenAI меняется (в файле есть поле с датой создания) — скачивайте свежий перед сверкой.

## Google Search Console (sitemap на каждый деплой)

IndexNow — только Яндекс/Bing; у Google IndexNow нет, а Indexing API разрешён только для
JobPosting/BroadcastEvent (для гайдов — **запрещён**). Сигнал Google на переобход = `sitemap.xml`
с честным `lastmod`. Поэтому `deploy.sh` после rsync и IndexNow запускает
`scripts/gsc-submit-sitemap.mjs`: `sitemaps.submit` (Search Console API) на
`<domain.site>/sitemap.xml`, затем читает статус обратно (lastSubmitted / lastDownloaded / errors).

Конфиг — данные бренда:

| Ключ | Что |
|---|---|
| `analytics.gscProperty` | property: `sc-domain:<domain>` или URL-prefix `https://…/` |
| `analytics.gscKeyPath` | путь к JSON-ключу сервис-аккаунта (Full/Owner на property); `~/` раскрывается. Ключ **не коммитится** и не печатается |

Env-оверрайды: `GSC_SA_KEY` (путь к ключу), `GSC_SITE` (property), `GSC_SITEMAP` (URL sitemap).

| Exit | Значение | Что делает `deploy.sh` |
|---|---|---|
| 0 | засабмичено | — |
| 2 | нет property или нет ключа — пропуск | печатает «GSC submit skipped», деплой продолжается |
| 3 | 401/403 — у сервис-аккаунта нет прав | скрипт печатает ручной шаг для владельца property; деплой — WARN |
| 1 | прочая ошибка | WARN, деплой не падает (сайт уже выложен) |

```bash
node scripts/gsc-submit-sitemap.mjs --dry-run   # проверить конфиг и наличие ключа, без сети
node scripts/gsc-submit-sitemap.mjs --status    # только статус sitemap
node scripts/gsc-submit-sitemap.mjs --top 10    # топ страниц /guides/ по кликам за 28 дней
```

## Редиректы и noindex (один URL на страницу)

Всё ниже — в `deploy/caddy-blog-block.txt` (vhost блога). White-label: бренд-специфичны только
строка сайта (хост из `domain.site`) и `root` (= `BLOG_WEBROOT`).

| Откуда | Куда / что |
|---|---|
| `/x`, `/x.html`, `/guides/x`, `/guides/x.html` | 301 → `/x/`, `/guides/x/` (query/UTM сохраняется) |
| `/index.html` | 301 → `/` |
| `/guides`, `/guides/`, `/guides.html` | 301 → `/library/` |
| `/guides/*.md` (markdown-двойники), `/llms.txt`, `/llms-full.txt`, `/search-index.json`, `/.well-known/*` | `X-Robots-Tag: noindex` (доступны агентам, вне индекса; канон — HTML) |
| несуществующий путь | настоящий 404 со стилизованной `/404.html` (`handle_errors`) |

Off-canonical оболочки `guide.html` и `mobile.html` получают от `build-seo.mjs`
`<meta name="robots" content="noindex">`. Caddy 2.6 не знает шорткода `{?query}` — поэтому
у каждого редиректа пара матчеров «с query / без».

Свап блока на хосте:
```bash
python3 deploy/swap-caddy-block.py [block-file] [site-marker]
#   block-file  по умолчанию /tmp/caddy-blog-block.txt (копия deploy/caddy-blog-block.txt)
#   site-marker по умолчанию — первая строка блока («<host> {»)
#   CADDYFILE=<path> — другой Caddyfile (тесты); бэкап .bak.blogfix.<ts> рядом с ним
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
```

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
