## Summary

Проведён read-only ресёрч R13, R15 и R16 по коду движка и первичным источникам. Файлы не изменялись, коммитов нет.

Главные рекомендации: убрать повторный React-mount статей, выдавать responsive AVIF/WebP и отдельный JPEG для превью, измерять реальные Core Web Vitals и еженедельно сверять поисковый трафик с переходами и активациями BLOG.

## Findings / Changes

### TL;DR

- Baseline статьи: LCP 13,9 с, CLS 0,106; это лабораторный замер EdgeLab, не Loore.
- Основные кандидаты на исправление: повторный React-mount, общий каталог с текстами, изображения и шрифты.
- Для страниц: AVIF + WebP; для OG рекомендуем отдельный JPEG 1200×675.
- Считать бюджетами: HTML ≤100 КБ сжатый, initial JS ≤20 КБ сжатый, LCP-картинка ≤100 КБ на мобильном.
- Цель проверять на live mobile: p75 LCP <2,5 с, CLS <0,1, INP <200 мс.
- Разрешить поисковых AI-ботов; разрешение training-ботов — отдельное решение.
- Google игнорирует `llms.txt`; гарантий использования его AI-поисковиками не найдено.
- Google прекратил показы FAQ rich results в мае 2026 года.
- Первые три месяца измерять индексацию → показы → визиты → CTA → BLOG redemption; прогнозов в числах нет.
- Все бюджеты ниже — предлагаемые инженерные цели, а не требования поисковых систем.

### 1. Изображения

**Рекомендация.** Для обложек и обычных inline-изображений генерировать AVIF и WebP в `<picture>`, с JPEG fallback для фотографий и PNG при необходимой прозрачности или чёткости интерфейсных скриншотов. Сравнивать визуальное качество текста на обложках и скриншотах: AVIF не всегда даёт лучший результат при одинаковом размере. Для старых браузеров JPEG fallback выпускается как минимум в ширинах 800 и 1600 px. Responsive-размеры сокращают передачу, если соответствуют фактической ширине отображения. [web.dev: responsive images](https://web.dev/articles/serve-responsive-images), [MDN: responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images).

Предлагаемые стартовые бюджеты, подлежащие проверке на реальных изображениях:

| Ресурс | Ширины | Бюджет передачи |
|---|---|---|
| Обложка статьи 16:9 | 480, 800, 1200, 1600 px | мобильный вариант ≤100 КБ; 1600 px ≤200 КБ |
| Карточка | 320, 480, 800 px | ≤40 КБ для типичного мобильного варианта |
| Inline | 480, 800, 1200, 1600 px, без увеличения исходника | ≤150 КБ на мобильный вариант; сложные скриншоты — исключения после проверки |

Для статьи начать с `sizes="(max-width: 768px) calc(100vw - 32px), 800px"`; для карточки — `sizes="(max-width: 600px) calc(100vw - 32px), (max-width: 1024px) 50vw, 33vw"`. Значения необходимо сверить с реальной CSS-шириной: иначе браузер выберет неверный ресурс.

Задавать реальные `width` и `height` каждому `<img>`, в том числе inline, и сохранять одинаковое соотношение сторон вариантов. Это резервирует место до загрузки. Для выявленного по trace LCP-изображения — обычный eager `<img fetchpriority="high">`; остальным изображениям ниже первого экрана — `loading="lazy"`. Не применять high ко всем карточкам и не предполагать, что обложка всегда является LCP: им может оказаться текст. [web.dev: LCP](https://web.dev/articles/optimize-lcp), [web.dev: CLS](https://web.dev/articles/optimize-cls).

**OG.** Отдельный абсолютный HTTPS URL на JPEG 1200×675, целевой размер ≤300 КБ, с `og:image`, `og:image:width`, `og:image:height`, alt и `twitter:card=summary_large_image`. JPEG/PNG — консервативный выбор для Telegram/VK/X, но утверждать, что они **обязательны** или что все три платформы одинаково поддерживают WebP/AVIF, по открытым источникам не могу. Проверить реальные превью всех трёх площадок после публикации, включая обрезку и кэш.

**Pipeline.** `gpt-image-2` PNG → существующий Playwright composer с финальным текстом и брендом → master PNG → `sharp` выпускает адаптивные AVIF/WebP, JPEG fallback и отдельный OG JPEG; сохранять имена, размеры и MIME в manifest. Выбирать quality по визуальной проверке и бюджету; `sharp` поддерживает нужные форматы. Добавление `sharp` оправдано единым автоматизированным конвейером resize и кодирования; до внедрения проверить наличие и совместимость зависимости. [Sharp: output options](https://sharp.pixelplumbing.com/api-output/).

**Changes to the engine / plan**

- [tools/covers/compose-cover.mjs](tools/covers/compose-cover.mjs:99): оставить 1600×900 master; добавить отдельный этап преобразования и manifest, используя локальный Geist.
- [site/gf-app.jsx](site/gf-app.jsx:846): article/mobile covers и карточки перевести на `<picture>`, размеры и корректный приоритет. Главная всё ещё использует `Slot` на строке 1498.
- [scripts/build-guides-data.mjs](scripts/build-guides-data.mjs:267): inline `<img>` сейчас получает lazy, но не размеры; генерировать responsive-разметку из manifest.
- [scripts/build-seo.mjs](scripts/build-seo.mjs:446): `coverOg` сейчас выбирает WebP; указывать отдельный OG JPEG.
- [deploy/caddy-blog-block.txt](deploy/caddy-blog-block.txt:73): добавить `*.avif` в passthrough, иначе мобильная маршрутизация может искать HTML вместо файла.

### 2. Быстрый статический движок

**Проверено в репозитории.** [Baseline](brief/PERF-baseline-2026-11-03.md:1) сообщает о замере Thrall: мобильная статья LCP 13,9 с, CLS 0,106, 513 КБ; главная — 3,69 МБ, из них 3,27 МБ изображений. `guides-data.js` указан как 274 КБ на каждой странице. Эти измерения здесь не повторялись; baseline не доказывает единственную причину задержки.

Пререндер сохраняет скрипты React/Babel ([scripts/prerender.mjs:267](scripts/prerender.mjs:267)), а клиент вызывает `createRoot` ([site/gf-app.jsx:1874](site/gf-app.jsx:1874)). Это повторный mount, а не React hydration. [site/guide.html:26](site/guide.html:26) подключает development React, Babel, поиск, общий каталог и приложение; [scripts/build-guides-data.mjs:457](scripts/build-guides-data.mjs:457) включает `bodyHtml` в данные. [brand.config.json:26](brand.config.json:26) задаёт четыре Google Fonts семейства.

**Предлагаемые бюджеты на холодной мобильной загрузке:** HTML ≤100 КБ Brotli, critical CSS ≤14 КБ сжатого, initial first-party JS ≤20 КБ сжатого, всего до первого экрана ≤300 КБ передачи без аналитики, TTFB ≤0,8 с. Это гипотезы для достижения целей, а не гарантия CWV. Выделять минимальный above-the-fold CSS в HTML; остальной CSS загружать без нарушения начальной отрисовки. Убрать React/Babel и полный каталог из статей, оставить небольшой runtime темы, меню, копирования и CTA; поиск и его индекс загружать по запросу. Не терять доступность и работоспособность ссылок без JS.

Geist self-hosted WOFF2: Latin/Cyrillic `unicode-range`, только используемые начертания, `font-display: swap`; preload только действительно критичного файла, с `crossorigin`. Проверить, что русская строка не ждёт невостребованный Latin preload, и подобрать метрики fallback против CLS.

[Текущий Caddy](deploy/caddy-blog-block.txt:5) использует gzip и revalidation ассетов. Для immutable-кэша сначала перейти на hash в имени CSS/JS/изображений/шрифтов; HTML — revalidate. Для Caddy: `encode zstd gzip`; Brotli — только при наличии проверенного модуля или на CDN. Не обещать Brotli штатной директивой Caddy. Для nginx Brotli также требует доступного модуля; иначе gzip. Проверять `Content-Encoding` и cache headers фактического origin/CDN. [Caddy encode](https://caddyserver.com/docs/caddyfile/directives/encode).

Измерять LCP, CLS и INP на **75-м перцентиле реальных мобильных посещений**, отдельно от Lighthouse. Лабораторно: 390×844, 4G/CPU throttling, пять холодных прогонов, trace LCP и layout shifts; INP подтверждать полевым RUM, когда данных достаточно. [web.dev: Web Vitals](https://web.dev/articles/vitals).

**Changes to the engine / plan**

- [scripts/prerender.mjs](scripts/prerender.mjs:267): в публикуемой статье сохранять HTML, удалять клиентские React/Babel и монтирование; проверить desktop и `/m/`.
- [scripts/build-guides-data.mjs](scripts/build-guides-data.mjs:343): разделить build manifest, компактные карточки и отдельно загружаемый поисковый индекс.
- [site/guide.html](site/guide.html:7), [site/gf-styles.css](site/gf-styles.css): локальные шрифты, критический CSS и небольшой `site/article-runtime.js`; аналогично мобильному шаблону.
- [scripts/build-seo.mjs](scripts/build-seo.mjs:415): отложить сторонние analytics с очередью ранних событий и проверить измерение.
- [deploy/caddy-blog-block.txt](deploy/caddy-blog-block.txt:30): versioned assets и безопасная политика cache; сохранить корректную выдачу мобильного HTML при CDN-кэшировании.
- Добавить измерение после внедрения и контроль регрессий меню, поиска, темы, CTA, CLS и источников LCP на обоих брендах.

### 3. GEO и индексация

**Подтверждено.** Обычный crawlable HTML с видимым текстом, ссылками, canonical и доступом для ботов — основа. Для Google AI Overviews страница должна быть индексируема и пригодна для показа со snippet; специальных AI schema или файлов Google не требует. Попадание в ответ не гарантировано. [Google: AI optimization](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

Предлагаемая политика `robots.txt`:

- Разрешить `Googlebot`, `YandexBot`, `OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot` и `Claude-User`; убедиться, что CDN не блокирует их.
- `GPTBot` и `ClaudeBot` связаны с обучением, а не являются условием поисковой индексации; `Google-Extended` управляет использованием для продуктов Google generative AI и не заменяет Googlebot. Их разрешение или запрет — отдельная политика владельца, не обещание повышения поискового трафика.
- `ChatGPT-User` совершает запросы по инициативе пользователя; OpenAI указывает, что robots для них могут не применяться. Правила `OAI-SearchBot` и `GPTBot` независимы. [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers), [Google crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/overview-google-crawlers).

`llms.txt` можно оставить как необязательный каталог для совместимых инструментов. Google прямо говорит, что игнорирует его. Perplexity публикует собственный `llms.txt` для навигации по документации; это **не подтверждает**, что её поисковый бот использует такой файл сторонних сайтов для ранжирования. Сведений об использовании сторонних `llms.txt` перечисленными AI-поисковиками в открытых документах не подтверждено.

`Article`/`TechArticle`, `BreadcrumbList`, `Organization` заполнять фактическими данными и согласовывать с видимым содержимым; `FAQPage` — только при реальном FAQ, без обещания преимуществ. Google сообщил, что FAQ rich results больше не показываются с 7 мая 2026. Структурированные данные не обязательны для GEO и не гарантируют rich result. [Google: обновления Search Central](https://developers.google.com/search/updates).

**Редакционная рекомендация, не требование AI:** начать статью коротким прямым ответом, затем дать контекст, ограничения, доказательства, пошаговые действия и источники. Делать оригинальные полезные материалы, а не переписывать текст ради предполагаемого AI-формата: Google прямо отвергает необходимость специального «чанкинга» и переписывания исключительно под AI.

**Changes to the engine / plan**

- [scripts/build-seo.mjs](scripts/build-seo.mjs:670): добавить актуальные `Claude-SearchBot` и `Claude-User`; сделать training-политику конфигурируемой. Текущий файл уже разрешает OAI-SearchBot, GPTBot, PerplexityBot и Google-Extended.
- [scripts/build-seo.mjs](scripts/build-seo.mjs:136): сохранить Organization, BreadcrumbList и существующий TechArticle; проверять JSON-LD против содержимого desktop/mobile и не считать FAQ сигналом rich result.
- [scripts/build-seo.mjs](scripts/build-seo.mjs:761): брендировать существующий `llms.txt`, не ставить его в критический путь GEO.
- В шаблоне контента и lint предусмотреть видимый краткий ответ, авторство, источники и дату существенного обновления; не выдумывать факты.

### 4. Мониторинг трафика, месяцы 1–3

**Еженедельно, по завершённым датам с учётом задержек:**

| Этап | Показатели |
|---|---|
| Доступность | HTTP, sitemap, canonical/noindex, опубликованные URL и статус индексирования |
| Поиск | GSC и Yandex Webmaster: показы, клики, CTR, запросы и страницы; динамика к предыдущей неделе |
| Посещения | Metrika/GA4: визиты или сессии по источнику и landing page; отдельно AI referrals |
| Воронка | клики CTA, переходы `/r/blog` по `utm_campaign=<slug>`, BLOG redemptions |
| Скорость | мобильные полевые p75 LCP/CLS/INP и число наблюдений |

Для AI-referral выделять точные hostname `chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com` и их проверенные варианты в конфиге; сохранять landing page и первый referrer/UTM. Проверять фактические входящие домены перед расширением правил. Часть переходов потеряет referrer или попадёт в direct; клики не равны цитированиям. Google AI Overviews отдельно по referrer достоверно не выделить: это поисковый трафик. Метки ChatGPT `utm_source=chatgpt.com` учитывать при наличии, но действующую документацию OpenAI для этой детали открыть не удалось.

[Локальная проверка промо](brief/PROMO-BLOG-facts.md:1) сообщает: `/r/blog` сохраняет UTM, пишет `PartnerReferralClick`, а `PromoRedemption` фиксирует применение промокода. Предлагаемый CTA: `https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<slug>&utm_content=<placement>`. Проверить после выпуска весь redirect и сохранение UTM. Redemption по коду BLOG не обязательно имеет доказанную связь с конкретной статьёй: использовать связь с attribution/click **только после проверки схемы и ключей**, считать отдельно неподтверждённые применения. Сырые клики, повторные визиты, уникальные пользователи и покупки не смешивать.

**Ожидания по месяцам — качественные, не прогноз:**

1. Месяц 1: проверить доступность, обнаружение и индексацию, первые показы и качество атрибуции. Нулевой поисковый трафик сам по себе ещё не доказывает провал.
2. Месяц 2: сравнить опубликованные и индексированные URL, запросы с показами и посадочные страницы; исправлять проблемы и улучшать материалы с релевантными показами.
3. Месяц 3: оценить тренды поисковых кликов, AI-referrals и подтверждённых переходов/активаций, принимая во внимание малые выборки и источники продвижения.

Google указывает, что для большинства сайтов обнаружение и индексация занимают три дня или больше; ни индексация, ни показы не гарантированы. Yandex описывает отдельные стадии обхода, обработки и формирования результатов. Первичные источники не дают надёжного прогноза числа визитов нового поддомена по месяцам. [Google: crawling](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors), [Yandex: indexing](https://www.yandex.com/support/webmaster/en/yandex-indexing/site-indexing).

**Автоматический отчёт.** Еженедельный job с фиксированным часовым поясом собирает завершённую неделю и предыдущую, сохраняет дату обновления каждого источника, ошибки и неполные данные как `unavailable`, а не ноль; пересчитывает последние недели из-за задержек. Источники:

- **Search Console API:** Search Analytics по дате/странице/запросу; URL Inspection по опубликованным URL для статуса в индексе. Это не API сводного числа всех индексированных страниц; агрегат считать по проверенному списку URL и показывать покрытие/квоты. Нужны Google Cloud project с включённым API, OAuth или service account с доступом к verified property и scope `webmasters.readonly`. [Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect).
- **Yandex Webmaster API:** данные сайта, поиска и индексации; зарегистрированное OAuth-приложение, токен с соответствующим доступом, подтверждённый сайт и его ID. [Yandex Webmaster API](https://yandex.com/dev/webmaster/).
- **Metrika API:** отчёты по источникам/посадочным и событиям; OAuth token с правами чтения, ID счётчика и доступ к нему. [Metrika authorization](https://yandex.com/dev/metrika/en/intro/authorization).
- **GA4 Data API, если используется:** project/API, read access к property, OAuth/service account и property ID. Точные доступные измерения и семантику отчёта проверить при внедрении.
- **Loore DB:** отдельная read-only учётная запись и агрегирующие запросы к `PartnerReferralClick`, `PromoRedemption` и при подтверждённой связи `PartnerAttribution`; без выгрузки персональных данных. Схема, даты и правила дедупликации требуют проверки.

**Changes to the engine / plan**

- [site/gf-app.jsx](site/gf-app.jsx:68): заменить конструктор CTA на `URL`/`URLSearchParams`, сохранить `/r/blog`, slug и placement; привязать события к явному `data-cta`.
- [site/scroll-depth.js](site/scroll-depth.js:1) и будущий `site/analytics.js`: конфигурируемые счётчики, единые события CTA и сбор RUM; исключить двойную инициализацию.
- Добавить `scripts/report-traffic.mjs` и конфиг `reports/traffic-sources.json`: адаптеры API, нормализация дат, hostnames, агрегаты и статусы ошибок; секреты получать только из защищённого окружения.
- Добавить read-only SQL в отдельный файл после проверки схемы Loore; в отчёте разделить переходы, подтверждённые attribution и все BLOG redemptions.
- После подключения доступов настроить расписание и место хранения отчёта отдельно; в этом задании расписание не создавалось.

### Sources

Все внешние источники выше — первичные и открыты 2026-11-03. Для страниц без указанной даты публикации используется дата просмотра. Особо значимые датированные изменения: [Google Search updates](https://developers.google.com/search/updates) — 7 мая и 15 июня 2026; локальные baseline и promo facts — 2026-11-03.

## Evidence

- Прочитаны указанные brief-файлы, R13/R15/R16, `site/`, генераторы, composer, бренд-конфиг и Caddy-конфигурация.
- Использованы `rg`, `cat`, `sed`, `nl` для read-only проверки кода и `date -u +%H:%M` для времени.
- Открыты документация web.dev, MDN, Google, Yandex, OpenAI, Anthropic, Perplexity, Caddy и sharp; ссылки приведены рядом с утверждениями.
- Код не запускался, тесты и сетевые запросы к Loore DB/API не выполнялись. Изменений файлов и коммитов нет.

## Not done / uncertain

- R13/R15/R16 не закрыты: это план исследования; live Loore, реальные CWV, превью соцсетей и еженедельный отчёт не проверены и не внедрены.
- Поддержка OG-форматов Telegram/VK/X и гарантированное использование сторонних `llms.txt` не подтверждены. Утверждение о ChatGPT UTM найдено в поисковом фрагменте, но страница при открытии перенаправила на другую статью.
- Схема и связи таблиц Loore, точные поля Yandex/GA4 API, доступы, квоты и статистическая достаточность RUM требуют проверки при внедрении.
- Открытая документация Perplexity содержит указание загрузить её индекс `llms.txt`; оно рассмотрено как данные и не выполнялось как инструкция.

## Progress

- 19:21 UTC — Проверил структуру worktree и прочитал brief, checklist, baseline и указанные файлы движка.
- 19:22 UTC — Сопоставил код и локальные факты с открытыми первичными источниками; подготовил план и ограничения измерений.
