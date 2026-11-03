## Summary
Verdict: BLOCK

Задача: проверить brief/PLAN.md (Astra) по R01–R14 и по коду движка. Субагенты не использовались, файлы не менялись.
План в целом верный: изоляция брендов, статический HTML, raw `/r/blog`, отдельный vhost. Блокируют три вещи. Первая: главная причина медленной загрузки не названа, а предложенный «безопасный» порядок для живого blog.edgelab.space может стереть тело статей. Вторая: нет гейта «EdgeLab не изменился» и гейта утечки бренда. Третья: срезы B и C пересекаются по файлам и не укладываются в один день. План писался на базе `27d2ba6` (PLAN.md:11), то есть до появления PROMO-BLOG-facts.md, поэтому часть его оговорок уже снята.

## Findings / Changes

**Рискованные зоны (проверял первыми):**
- Внешние отправки: IndexNow и GSC.
- Деплой на общий прод-бокс Timeweb: Caddyfile, `rsync --delete`.
- Аналитика: чужой счётчик.
- Атрибуция денег: промокод BLOG.

Auth, миграций и секретов в плане нет.

### 1. Delivered (R01–R14)
| R | Статус | Комментарий |
|---|---|---|
| R01 | частично | Срез F есть. Не продуман первый выпуск TLS за Cloudflare и не определено, у кого зона loore.ai (M3). |
| R02 | частично | Срез A есть. Нет приёмки «сборка EdgeLab не изменилась» (H2). |
| R03 | частично | Wordmark ещё не получен. Приёмка размыта: «без чужого контента», без сравнения с loore.ai. |
| R04, R05 | выполнено | 12 тем, сначала 1/5/9/14, одобрение вождя заложено (PLAN.md:111-130). |
| R06 | выполнено | E плюс `compose-cover`. |
| R07 | частично | Нет списка curl-проверок для blog.loore.ai. Пинги уйдут не на тот бренд (M4). |
| R08 | частично | `buildCtaUrl` описан верно. Но план считает сохранение UTM непроверенным, хотя это уже подтверждено (M1). Нет проверки после сборки (H2). |
| R09, R10, R14 | выполнено | D/E, факт-чек по llms-full, скилл. |
| R11 | частично | Требует от вождя новый счётчик, хотя R11 разрешает счётчик Loore по умолчанию (M5). |
| R12 | выполнено | G. |
| R13 | частично | Корневая причина пропущена, порядок для EdgeLab небезопасен (H1). Честная оговорка «лабораторная проверка пройдена» — правильно. |

### 2. Design

**H1 (High). R13: главная причина не названа, порядок для живого EdgeLab ломает статьи.**
- Причина. Каждая страница грузит с unpkg `react.development.js`, `react-dom.development.js` и `@babel/standalone`: Babel весит 3,1 МБ без сжатия и 665 КБ в gzip. Потом JSX компилируется прямо в браузере, а при CPU ×4 это и есть основная задержка LCP (site/guides/chto-takoe-claude-code.html:27-34, prerender.mjs:263-275). В baseline этого тоже нет.
- Риск порядка. План предлагает EdgeLab «первым» разбить данные (PLAN.md:67), но перемонтирование через `createRoot` остаётся (gf-app.jsx:1874). Тело статьи React берёт из `bodyHtml` в guides-data (gf-app.jsx:567, :864, :1100). Если данные разбить до отказа от перемонтирования, после отрисовки текст статьи исчезнет. Google рендерит JS и увидит пустую статью.
- Исправление плана:
  - Шаг 0 для обоих брендов, без новых зависимостей: prerender сохраняет скомпилированный вывод Babel в `build/gf-app.js` (сейчас он вырезается, prerender.mjs:250-262). Плюс собственные копии `react.production.min` и `react-dom.production.min` с `defer`, без `text/babel`. Разметка при этом не меняется.
  - Разбиение данных — только после отказа от перемонтирования, либо данные страницы обязательно содержат `bodyHtml`.
  - Добавить в verify проверку: после загрузки длина текста `.gp-article-body` не меньше, чем в пререндере.

**H2 (High). Изоляция: нет гейта регрессии EdgeLab и гейта утечки Loore.**
- Сейчас утечёт:
  - захардкоженный счётчик Метрики EdgeLab: gf-app.jsx:1784, scroll-depth.js:14;
  - «320+ участников»: gf-app.jsx:384;
  - «эфиры»: gf-app.jsx:318, :330;
  - аватар: gf-app.jsx:181;
  - запасные значения EdgeLab для любого отсутствующего ключа конфига: gf-app.jsx:11-40, 190;
  - prerender копирует целиком `covers/` (66 МБ, обложки EdgeLab) и `images/`: prerender.mjs:186-197.
- PLAN.md:39 и :138 это декларируют, но проверки нет.
- Исправление плана:
  - (а) В срез A добавить приёмку: дерево `build/` EdgeLab до и после правок движка совпадает, разница только ожидаемая и перечисленная.
  - (б) После сборки Loore — гейт-grep, при совпадении FAIL: `edgelab|EdgeLab|109832554|G-J3H4311DJT|Ешиев|ИНН|go.edgelab.space|_home-hero-dashi|author-avatar`.
  - (в) Для бренда не по умолчанию запасные значения выключены: если ключа нет, сборка падает.

**H3 (High). Срезы B и C пересекаются и слишком велики.**
- Переход на статическую публикацию распилен между двумя срезами: C в prerender убирает React и `image-slot`, а `article-runtime.js` и замена `Slot` на `<img>` лежат в B (PLAN.md:147-148). Snapshot не сохраняет shadow DOM `<image-slot>`, поэтому, если C выйдет раньше B, обложки пропадут.
- У аналитики два владельца: события в gf-app.jsx и scroll-depth.js — это B, загрузчики в build-seo.mjs:424 — это C.
- Шрифты (п. 5) затрагивают `site/*.html`, генератор обёрток и композер обложек, но не закреплены ни за одним срезом.
- B с effort «low» — это одновременно ребрендинг, токены двух тем, новый рантайм и интерактивный каталог: больше одного дня и самый рискованный код для живого блога.
- Исправление плана:
  - B1 — UI Loore: токены, лого, воронка, CTA.
  - P — perf-рантайм на одного владельца: шаг 0 из H1, затем статика плюс `article-runtime.js`, Slot→img, analytics.js. Последовательно после A; effort не low.
  - C — только SEO-тексты, lint, verify, обложки.
  - E разбить на 3 джоба по 4 статьи.

### 3. Code (утверждения плана, сверенные с кодом)

**M1 (Medium). Факты по промокоду устарели.** План считает сохранение UTM и выгоду BLOG непроверенными (PLAN.md:43, :172), а PROMO-BLOG-facts.md уже подтверждает:
- query сохраняется, атрибуция разбивается по статьям через `utm_campaign=<slug>`;
- BLOG — скидочная сетка только на месячные тарифы 1 790 / 3 490 / 7 990 ₽.

Исправление плана: UTM сразу включены. В тексте CTA не обещать скидку на годовой тариф. «3 дня без карты» остаётся под факт-чеком. Попутно: `utm()` добавляет `/` (gf-app.jsx:68, получится `/r/blog/?…`), а `wireUTMForward` переписывает `utm_campaign`/`utm_content` у каждой ссылки на хост воронки (gf-app.jsx:86-114) и затёр бы схему по slug. План это учитывает (PLAN.md:43); в приёмку нужен тест на точный href.

**M2 (Medium). Новый vhost не добавить существующим скриптом.** `swap-caddy-block.py` завершается с ошибкой, если блок не найден (deploy/swap-caddy-block.py:17-19). Значит, остаётся ручная правка Caddyfile на прод-боксе, где крутится и прод EdgeLab. Исправление плана: однократно добавить `import /etc/caddy/sites/*.caddy` (или режим `--append` с тестом через `CADDYFILE`), бэкап, `caddy validate`, затем reload.

**M3 (Medium). TLS и DNS.** Caddy получает сертификат Let's Encrypt через HTTP-01 за Cloudflare (DEPLOY.md:21). На новой зоне с Full (strict) и «Always Use HTTPS» первый выпуск может упасть (526). Исправление плана: запись сначала DNS-only, выпустить и проверить сертификат, потом proxied + Full (strict). Отдельный шаг: доступ к зоне loore.ai через Сильвану (BRIEF: «спрашиваю Сильваны»).

**M4 (Medium). Guard деплоя неполон.**
- По умолчанию deploy.sh шлёт в webroot EdgeLab (deploy.sh:21-22).
- IndexNow и GSC берут бренд из `BRAND_CONFIG`, а не из сборки (indexnow-submit.mjs:22, :30; gsc-submit-sitemap.mjs:30-37). Если указать `BLOG_WEBROOT` без `BRAND_CONFIG`, URL Loore уйдут с ключом и хостом EdgeLab, а в GSC отправится sitemap EdgeLab.
- Сухой прогон удалений поймает Loore→EdgeLab, только если не задан `ALLOW_DELETE=1`.

Исправление плана: deploy, IndexNow и GSC читают бренд и webroot из manifest сборки. Для бренда не по умолчанию webroot по умолчанию нет. `ALLOW_DELETE` запрещён при несовпадении manifest с webroot.

**M5 (Medium). R11: счётчик и webvisor.** R11 разрешает «Loore default». Общий счётчик loore.ai с включёнными поддоменами видит в одной воронке и визит в блог, и регистрацию — для атрибуции это лучше, и вождю не нужно ничего создавать (PLAN.md:136). Плюс `webvisor:true` (build-seo.mjs:432) нагружает main thread и ухудшает INP: для Loore выключить или запускать отложенно.

**Low (лишнее для первого релиза, вырезать):**
- три варианта WebP 480/800/1600 — хватит одного 800 + 1600 для LCP, плюс lazy и width/height (PLAN.md:61);
- перенос `SLUG_CAT` во frontmatter и общий шаблон категорий — для Loore хватит своей карты (PLAN.md:30);
- контракт файлов с hash в имени (п. 7);
- интерактивный каталог при 12 статьях;
- MCP-сайдкары и agent-skills Loore — достаточно ссылки на mcp.loore.ai, проверенной по llms-full.

### Blocking
- PLAN.md:67 / gf-app.jsx:1874, :567: убрать runtime Babel и dev React шагом 0 (скомпилированный вывод Babel из prerender + собственный React production). Разбиение данных — только после отказа от перемонтирования или с `bodyHtml` текущей страницы; добавить verify длины текста статьи после загрузки.
- PLAN.md:146 / gf-app.jsx:1784, :384, :11-40; prerender.mjs:186-197: приёмка A «build EdgeLab не изменился» плюс гейт-grep утечки EdgeLab в build Loore; запасные значения EdgeLab для бренда не по умолчанию выключить.
- PLAN.md:147-148: перерезать срезы — B1 (UI Loore), P (perf-рантайм, один владелец, после A), C (SEO/lint/verify/обложки); закрепить владельцев шрифтов и аналитики; E на 3×4.

### Non-blocking
- PLAN.md:43, :172: включить UTM по slug сразу, CTA — «скидка на месячный тариф» по PROMO-BLOG-facts.md.
- deploy/swap-caddy-block.py:17: добавить `import sites/*.caddy` или `--append` с тестом.
- PLAN.md:84: TLS — сначала DNS-only, потом proxied + Full (strict); доступ к зоне loore.ai через Сильвану.
- scripts/deploy.sh:21 и indexnow-submit.mjs:30: бренд и webroot из manifest, запрет `ALLOW_DELETE` при несовпадении.
- PLAN.md:136 / build-seo.mjs:432: счётчик Loore по умолчанию с поддоменами; webvisor выключить или отложить.
- PLAN.md:30, :61, :65: вырезать лишнее из списка Low.

Brief gap (H1): в PERF-baseline-2026-11-03.md Babel и React из unpkg не перечислены. Бриф для исполнителя должен был требовать полный список запросов (waterfall), а не «Biggest items».

## Evidence
- `cat` всех файлов brief/, `git log --stat`: план зафиксирован в 4386330, PROMO-факты — в 33463c6, план ссылается на `27d2ba6`.
- Прочитаны:
  - scripts/prerender.mjs: :186-197 копирует все `covers/` и `images/`; :250-275 вырезает вывод Babel и оставляет CDN-скрипты;
  - site/gf-app.jsx:1-120, 1490-1540, 1760-1939: `createRoot`, `ym(109832554)`, запасные значения EdgeLab, UTM forwarder;
  - site/index.html, site/guides/*.html, site/mobile.html;
  - scripts/deploy.sh, deploy/swap-caddy-block.py, deploy/caddy-blog-block.txt, docs/DEPLOY.md;
  - scripts/brand.mjs, scripts/brand-client.mjs, build-seo.mjs:415-440, scroll-depth.js:1-30;
  - content-lint.mjs:72-97, 240-262; verify-google-seo.mjs:35-45, 88-100.
- `grep`: литералы EdgeLab в gf-app.jsx :181, :318, :330, :384, :450.
- `git ls-files`: `site/guides-data.js` и `site/guides/*.html` под git.
- `du`: covers 66 МБ, guides-data.js 1,1 МБ без сжатия.
- Живая проверка (только чтение): `curl` мобильной статьи blog.edgelab.space — подключены `react.development.js`, `react-dom.development.js`, `babel.min.js` с unpkg и `gf-app.jsx` как `text/babel`. Размер `babel.min.js`: 3 137 752 байт без сжатия, 665 298 после gzip.

## Not done / uncertain
- Lighthouse и trace не запускал. То, что Babel и dev React — главный вклад в LCP 13,9 с, выведено из размеров и CPU ×4, а не из профиля. Baseline показывает 513 КБ для статьи, а Babel один весит 665 КБ, то есть baseline, похоже, не учёл сторонние запросы или кэш. Это не сверено.
- Настройки зоны loore.ai в Cloudflare и состояние Caddy на Timeweb не проверял. Сервер блога — Timeweb 213.171.6.132 по DEPLOY.md, а не DigitalOcean.
- Есть ли кириллица в Geist — не проверял.
- Сохраняет ли Babel standalone вывод в DOM в форме, пригодной для записи в файл (шаг 0 из H1), не проверял запуском: это следует из логики prerender.mjs:250-262.
- Тексты Loore (llms-full.txt) не открывал.

## Progress
- 19:17 UTC Прочитал brief, CHECKLIST, PERF, PROMO, KAELTHAS, PLAN.md.
- 19:18 UTC Сверил deploy.sh, swap-caddy-block.py, Caddy-блок и DEPLOY.md.
- 19:19 UTC Сверил brand.mjs, prerender.mjs, шаблоны страниц, gf-app.jsx (перемонтирование, аналитика, UTM, запасные значения).
- 19:20 UTC Проверил живые скрипты blog.edgelab.space и размер Babel; build-seo, lint, verify, scroll-depth.
- 19:21 UTC Обновил PROGRESS.md, написал отчёт.
