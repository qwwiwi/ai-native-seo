# SEO-стек blog.edgelab.space — чем меряем и что у нас есть

Карта измерения поисковой видимости и сбора данных. Дополняет [`ANALYTICS.md`](ANALYTICS.md)
(дочитываемость/read-through) — здесь про поисковую производительность, подбор запросов и инструменты.
Всё тянется **agent-native** (API/скиллы, не UI) агентом-маркетологом (sa-kaelthas).

## Воронка измерения

```
IG / контент → клик (Sink) → визит (Метрика / GA4) → поисковая видимость (Вебмастер / GSC)
            → дочитал (scroll, см. ANALYTICS.md) → цель / CTA в EdgeLab Space
```

Сшивка по UTM (Sink хранит UTM в таргете) и времени. Метрика приоритетна для РФ (Яндекс ~94% + Вебвизор), GA4/GSC — под Google и AI-движки.

## Поисковая видимость (search performance)

### Яндекс.Вебмастер — главный для РФ
- Хосты (все verified): `edgelab.su` + `edgelab.space` + `blog.edgelab.space` (счётчики Метрики 109832512 / 109832554).
- Данные: запросы, позиции, индексация, sitemap, переобход (reindex API, квота 150/день).
- Тянет: скилл `yandex-webmaster` (`report` / `check` / `recrawl`), OAuth-токен (живой, тот же что у Метрики).

### Google Search Console — под Google + AI Overviews
- Domain-property `edgelab.space` — **verified** (DNS TXT, 2026-06-24); покрывает blog. и апекс.
- Пользователи: владелец `mrqwwiwi@gmail.com` (Owner) + сервис-аккаунт `kaelthas-ga-reader@sylvanas-487716` (Full).
- Данные: запросы / позиции / CTR в Google, индексация, sitemap.
- Программный доступ — через тот же SA-ключ; **Search Console API включён** в проекте `sylvanas-487716`. Скилл `google-search-console` (`sites` / `query` / `sitemaps` / `inspect`) — собран и работает. Sitemap засабмичен (0 ошибок); pillar `claude-code-skills` уже «Submitted and indexed» в Google.
- Приоритет: вторичный для РФ (главный — Яндекс), нужен под Google + цитирование в AI Overviews.

## Поведение на сайте

- **Яндекс.Метрика:** `edgelab.su` = 109832512, `edgelab.space`/`blog.` = 109832554. Включено: Вебвизор + карта скроллинга + Аналитика контента + цели дочитываемости (`scroll_75` = KPI, см. ANALYTICS.md). Скилл `yandex-metrika`.
- **GA4:** проперть 541632754, два стрима (su = G-WQRTESXK2Z, space = G-J3H4311DJT), `percent_scrolled` + `contentGroup`. Скилл `google-analytics`.
- **Теги ставятся напрямую (`gtag`)** в `<head>` страниц билдом (`build-seo.mjs`). **Google Tag Manager НЕ используем** — теги хардкодятся, не через GTM-контейнер.

## Подбор запросов (keyword research)

- **Яндекс.Wordstat** — частотность и семантика (top/dynamics), источник тем/тайтлов. Скилл `yandex-wordstat` (Yandex Cloud Search API) — **рабочий** (биллинг Yandex Cloud подключён 2026-06-24; проверено живьём: `wordstat.py top 'claude code'` = 82322 показов/мес). Питает обязательный шаг M0 (тайтлы/FAQ под реальные запросы).

## Верх воронки (клики)

- **Sink — `go.edgelab.space`** — брендовый редирект + клик-аналитика переходов из IG/контента. Скилл `sink-shortlinks`. Прячет `t.me`/UTM, считает клики (Cloudflare Analytics Engine).

## Распространение и индексация (сторона сайта)

`scripts/build-seo.mjs` генерит: robots (AI-allowlist + Content-Signal), sitemap (стабильный lastmod), `llms.txt` + `llms-full.txt`, JSON-LD (Article/TechArticle/FAQPage/HowTo/BreadcrumbList/Organization/WebSite/CollectionPage), per-slug og:image, IndexNow-ключ. `deploy.sh` авто-пингует IndexNow (Яндекс + Bing). Плюс MCP-сервер и `/.well-known/*` (см. README / `ROUTES.md`).

## Кто чем владеет

- **Сайтовая машинерия** (robots/sitemap/llms/JSON-LD/IndexNow + теги Метрики и GA4 на страницах) — этот репозиторий, деплоит Тралл.
- **Внешнее измерение** (Вебмастер, GSC, Wordstat, отчёты Метрики/GA4, Sink) — агент Кельтас через скиллы, agent-native.
- **Cloudflare/DNS** (апекс, верификации владения) — Сильвана.

## История

- 2026-06-24: Вебмастер — blog. добавлен хостом и verified; SEO-пайплайн P0+P1 зашит в код (content-lint, og:image, llms-full.txt, авто-IndexNow); кластер «скиллы для Claude Code» + бэкфилл кросс-ссылок на 24 legacy-гайда (внутренняя перелинковка — FAIL-гейт); GSC подключён (domain verified + SA Full + Search Console API включён + скилл `google-search-console` собран + sitemap засабмичен; pillar уже «Submitted and indexed» в Google); биллинг Yandex Cloud подключён → скилл `yandex-wordstat` разблокирован и работает (питает M0).
- 2026-06-18: цели дочитываемости + Вебвизор + GA4-измерение (см. ANALYTICS.md).
