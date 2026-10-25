# CONTENT.md — add or edit a guide or article

Content lives in `content-guides/<slug>.mdx` (one file per piece). The build turns it into the
catalog entry, the page, the mobile page, JSON-LD, the sitemap entry and a markdown twin. RU-first,
reader-as-a-colleague tone (no infobiz hype).

## Два типа контента: гайд и статья

The `type` frontmatter field selects the content type (default `guide`):

| | **Гайд** (`type: guide`) | **Статья** (`type: article`) |
|---|---|---|
| Назначение | пошаговая инструкция, технический | читабельный текст-история |
| Тело | заголовки, код, `:::prompt`/`:::tip`, таблицы, шаги | ТОЛЬКО заголовки + текст + картинки/схемы/видео |
| Картинки в теле | нет (text-only; визуал = обложка) | да (`![alt](src)` → figure) |
| TL;DR «Коротко», «Протестировано», «Что понадобится» | да | НЕТ (просто текст) |
| Обложка | **ЧБ-сцена + lime-overlay** (`--mono`) + логотип инструмента | **ЧБ-сцена + lime-overlay** (квадрат, заголовок `<lime>`, eyebrow), БЕЗ логотипа — см. `docs/BANNERS.md`. Гайд vs статья отличаются ТОЛЬКО лого/eyebrow, сцена у обоих ЧБ |
| На главной | секция «Гайды» | секция «Статьи» (`#articles`) |
| Меню | «Гайды» → `/library/` | «Статьи» |
| URL | `/guides/<slug>/` | `/guides/<slug>/` (хлебная крошка «Статьи») |

Both are searched together (MiniSearch over all content). To write an **article**: set
`type: article`, write only headings + prose + `![alt](src)` images; do NOT use code/prompt/callout
blocks (they're for guides). The TL;DR/tested/steps are auto-suppressed for articles.

## 1. Create `content-guides/<slug>.mdx`

`<slug>` is the URL (`/guides/<slug>/`) — lowercase, hyphenated, stable (it is the SEO address; do
not rename a live one).

### Frontmatter (YAML)

Fields the build (`scripts/build-guides-data.mjs`) actually CONSUMES are marked ✅; the others are
kept for humans/consistency but are NOT read by the build (the category comes from `SLUG_CAT`, see §2).

```yaml
---
slug: my-guide                 # ✅ REQUIRED, must equal the filename (the URL)
title: "Заголовок гайда"       # ✅ REQUIRED — H1 + <title> + og:title
description: "1–2 предложения"  # ✅ REQUIRED (гайды И статьи) — card excerpt on home/catalog + subtitle + meta/og:description. БЕЗ него карточка на главной без текста (был баг: ai-tools-tier-list задал только summary). `summary` НЕ заменяет `description`. Также рендерится как видимый ЛИД на странице — жирная serif-цитата с lime-полосой слева (прямой голос автора, как реплика Даши). Пиши его как сильное первое предложение, а не служебный мета-текст.
summary: "Короткий TL;DR"      # ✅ the «Коротко» box (tldr) for GUIDES. Для статей TL;DR подавляется — но `description` всё равно нужен (это карточка).
difficulty: beginner           # ✅ beginner | intermediate | advanced → «Новичок/Средний/Продвинутый»
estimated_time: 20             # ✅ minutes → «20 МИН ЧТЕНИЯ» + JSON-LD
tags:                          # ✅ list → full-text search + JSON-LD keywords
  - claude-code
  - mcp
author: "Имя Автора"           # ✅ REQUIRED for guides published 2026-10-18+ (lint FAIL) → JSON-LD author
published_at: 2026-04-10T12:00:00Z   # ✅ ISO, real date (not in the future) → JSON-LD datePublished
updated_at:   2026-04-10T12:00:00Z   # ✅ ISO, ≥ published_at — bump ONLY with a real text change (lint FAILs a bare bump).
                               #    The SHOWN/sitemap date is the last content COMMIT (scripts/content-dates.mjs), not this field;
                               #    it wins only for the file's creation commit (if not later than it) or an uncommitted edit.
proofs:                        # ✅ optional — first-hand evidence not visible as markup (own numbers, logs…); counts toward the ≥3 proofs rule
  - "Свои замеры за неделю — таблица в разделе «Лимиты»"
what_you_need:                 # ✅ optional → «Что понадобится» list
  - Claude Code (Pro или Max)
outcome: "Что будет в результате"   # ✅ optional → «РЕЗУЛЬТАТ» callout at the end
stub: false                    # ✅ optional — true demotes a «скоро» placeholder in date/time sorts
category: guide                # informational only (NOT read; real category = SLUG_CAT)
tier: free                     # informational only (NOT read)
published: true                # informational only (NOT read — presence in content-guides/ = live)
---
```

### Body (markdown)

Starts after the frontmatter. The mini-parser in `scripts/build-guides-data.mjs` (`mdToHtml`) supports:

- `# Title` — dropped (duplicates the H1).
- `## Heading` — becomes a section + a «На странице» TOC entry (gets `id="sec-N"` for scroll-spy). `###`/`####` for sub-headings.
- ` ```lang … ``` ` fenced code (with a copy button).
- `:::prompt Заголовок … :::` — a copyable prompt block. Also `:::tip`/`:::note`/`:::warning`. **`:::cta` — DEPRECATED/legacy:** CTA не bolt-on блоком, а **нативно прозой** — последняя секция вытекает из контента в сообщество как next step (см. `CONTENT-PIPELINE.md` M2 «Native CTA»). **A file/config TEMPLATE goes in a fenced code block, NOT `:::prompt`** — see `docs/PROMPT-STANDARD.md` (the block holds the literal prompt only; context goes before it).
- Markdown tables (`| a | b |` + `|---|`), `-`/`1.` lists, `**bold**`, inline `` `code` ``, bare URLs.
- `[текст](url)` — **кликабельные inline-ссылки** (`inline()` в `build-guides-data.mjs`): внутренние (`/…`) открываются в той же вкладке, внешние (`http(s)`) — в новой (`target=_blank rel=noopener`). Ставь ссылки прямо в тексте — это рабочий способ кросс-линковки (см. §SEO «Cross-links») и рециркуляции.
- **Images are stripped** в гайдах (text-only body; визуал = обложка — see `docs/BANNERS.md`). Исключение: `/images/diagrams/*.svg` рендерятся в теле И гайдов, И статей (ЧБ блок-схемы); прочие `![alt](src)` — только в статьях. Подробно — `CONTENT-PIPELINE.md` §Visuals.

### Типографика чтения («Пчела»)

Тело гайдов и статей рендерится **serif-лонгридом** (читательская типографика, как pchela.media):
шрифт `PT Serif` (Cyrillic) 19px / 18px на мобиле, line-height 1.72, ширина строки ~720px. Заголовки
остаются `Inter Tight` (sans), код — `JetBrains Mono`. Лид (`description`) — жирная serif-цитата с
lime-полосой слева. Светлая и тёмная темы обе настроены. Автор просто пишет markdown — стиль
применяется автоматически (`--read-serif` в `gf-styles.css`).

## 2. Map the category

Add the slug to `SLUG_CAT` in `scripts/build-guides-data.mjs` — **required: content-lint FAILs an
unmapped slug** (it would silently fall into the first category → wrong breadcrumb/pillar), a slug ≠
filename, or a category id the brand does not declare in `categories[]`. Demo taxonomy: `claude` |
`ai` | `mcp` | `memory` | `design` | `video` | `hermes` | `codex`. `claude` = only Claude-Code-specific
pieces; general AI-agent / model pieces (reviews, model comparisons, prompts) go to `ai`.
It drives the catalog facet, the breadcrumb (category → its pillar page), which category listing page
links the guide, and which nav pillar lists it. A guide `title` must not equal a category page H1
(the category name) — lint FAIL.

## 3. Cover banner (optional but expected)

Drop `site/covers/<slug>.png` (+ `.webp` для веса — `Image.open(png).save(..., 'WEBP', quality=82)`) →
auto-wired (versioned). Recipe: `docs/BANNERS.md`. **Fallback:** без обложки карточка и
`og:image` падают на `site/images/og-default.png` (не ломается), поэтому обложка не
hard-required — но `content-lint` даёт WARN, если её нет (кроме `stub`). На паблик —
ставь обложку.

## 4. Build & check

```bash
node scripts/prerender.mjs
```
Confirm: the guide appears in `build/guides-data.js`, `build/guides/<slug>.html` renders the body
(headings → TOC, code/prompt/table blocks), light + dark both fine, `build/sitemap.xml` has the URL.
Then PR → merge → deploy (`docs/DEPLOY.md`).

## Рециркуляция и аналитика дочитываемости (автоматически)

Цель портала — чтобы читали БОЛЬШЕ одного материала. Это теперь измеряется, и автор ничего не
проводами не соединяет — всё на сборке:

- **Блок «Читайте дальше»** добавляется сразу после текста гайда/статьи, перед CTA (desktop и `/m/`), автоматически (`computeRelated()`
  в `build-guides-data.mjs`): похожие = та же категория + пересечение тегов с inverse-frequency весом
  (редкий общий тег важнее частого). Заглушки (`stub`) исключены. Твоя ручная работа — 1–2 in-text
  кросс-ссылки (см. §SEO), авто-блок — поверх. На страницах категорий блока нет
  (`verify-related.mjs` проверяет и место, и отсутствие).
- **Блок «Все материалы»** — авто-индекс со ссылками на все остальные не-stub гайды внизу каждой
  страницы гайда (desktop и `/m/`). Ссылки воронки на странице несут UTM своего гайда:
  `utm_content=<funnel.utm.contentPrefix><slug>` (`funnel.utm.source/campaign/contentPrefix` —
  из конфига бренда). Проверяет `verify-google-seo.mjs`.
- **Scroll-depth события** на каждой странице материала: 25/50/75/100% → Яндекс.Метрика (счётчик
  `109832554`) `reachGoal scroll_N` + `notBounce` на 75%; GA4 (`G-J3H4311DJT`) `scroll_depth`. Плюс
  `content_group` = `article|guide`.
- **JSON-LD `articleBody`** (полный плоский текст материала) эмитится в `<head>` → включает в Метрике
  «Аналитику контента» (Дочитывания / Доскроллы / Рециркуляция по материалу/автору/разделу).
- Проверяется скриптом `scripts/verify-readthrough-analytics.mjs` (articleBody ≥500 симв. на страницах
  материалов, отсутствует на статике) — гоняется после сборки.

## Where content comes from / history

The 16 live guides were migrated from the old `guides.edgelab.su` (Supabase). 11 are MDX in this
repo; 5 (claudemd-guide, mcp-servers-claude-code, memory-architecture, obsidian-second-brain,
video-automation-skills) were pulled from Supabase and converted to MDX. `codex-intro` &
`hermes-intro` are «coming soon» placeholders. New guides are authored directly as MDX here.

## SEO checklist when adding a guide

**Google rules are a hard gate for new guides — see `CONTENT-PIPELINE.md` «Правила Google»**
(answer up front, ≥3 first-hand proofs, «Проверено на …, <месяц> <год>», AI-assisted line, `author`,
real dates, no date bumps, canonical `/guides/<slug>/` links, no thin/duplicate pieces, and the
«what NOT to do» list).

- Direct answer + a real `summary` (TL;DR) at the top.
- Tags + an accurate `estimated_time`; bump `updated_at` only together with a real text change.
- Headings that match real search queries (tool + task + error), RU-first.
- **Cross-links (required): 1-2 in-text links to other guides/articles** — `[descriptive anchor](/guides/<slug>/)`, placed in the prose where the reader naturally needs the next step (NOT in the first paragraph, NOT inside code/prompt callouts; anchor must be descriptive, never «здесь»/«тут»). The auto «Читайте дальше» block (related materials) is generated by the build — these in-text links are the author's job. Both drive recirculation (a measured metric — see analytics).
- A cover banner (social/OG + card visual).

## Формула тайтла (title = что видят в выдаче)

`title` задаёт H1, `<title>` и og:title (в этом репо они синхронизированы из одного frontmatter-поля) — синяя ссылка в выдаче Яндекс/Google и текст, по которому кликают. Формула:

**«<реальный запрос> <ГОД>: <хук>»**

- **Запрос в начале** — поисковик ранжирует выше, когда запрос в тайтле.
- **Год («2026»)** — сигналит актуальность; усиливает свежесть и цитируемость в AI-ответах (Нейро / ChatGPT / Perplexity).
- **Хук** — короткий крючок для клика.

Живые примеры:
- `Скиллы для Claude Code 2026: сотни бесплатных навыков`
- `MCP-серверы для Claude Code 2026: 15 штук вместо инструментов на $400/мес`
- `Claude + Obsidian 2026: второй мозг, который не спит`

Плохо: `Всё про скиллы` (нет запроса), `Skills` (нет запроса/года/хука), общие тайтлы без запроса.

Title/H1 менять можно в любой момент. **slug/URL — НЕТ** (сломает индексацию + IndexNow/переобход). Менять только видимый title/H1/og, slug не трогать.

## Откуда брать запросы (не выдумывать)

Реальные запросы — из аналитики, не из головы:

- **Яндекс.Вебмастер** (приоритет для RU): запросы с **позицией 4-15** = «почти топ» → выносить в title/заголовки/FAQ и докручивать контентом. (Есть API-скилл `yandex-webmaster`; данные по новому хосту копятся несколько дней после подключения.)
- **Яндекс.Метрика** → отчёт «Поисковые фразы»: что уже привело визиты.

Денежный кластер EdgeLab: «скиллы для Claude Code», «mcp для claude code», «claude + obsidian», «claude.md / метод Карпати».

## После публикации — переиндексация

- **IndexNow** пингуется автоматически на деплой (Яндекс + Bing) — уже в пайплайне (см. `docs/DEPLOY.md`).
- Дополнительно после правок контента/тайтлов — **переобход изменённых URL через Яндекс.Вебмастер API** (квота 150 URL/день) для более быстрой переиндексации. Делает Кельтас.

## FAQ-секция → FAQPage JSON-LD (AEO)

Чтобы гайд эмитил `FAQPage` structured data (это даёт rich-result в Яндекс/Google
и кормит AI-ответы), добавь в тело гайда **видимую** секцию FAQ. Конвенция (парсит
`scripts/build-seo.mjs` → `faqFromBody`):

```markdown
## FAQ

### Нужна ли подписка Claude?
Да, нужен тариф Pro или Max — без него Claude Code не запустится.

### Работает ли на Windows?
Да, через WSL2 — Claude Code живёт в Linux-окружении.
```

- Заголовок секции — `## FAQ` (или `## Частые вопросы` / `## Вопросы и ответы`).
- Каждый вопрос — `### <вопрос>`; ответ — прозой до следующего `###`/`##`.
- Нужно **≥2** пары — иначе FAQPage не эмитится (Google штрафует пустой/спам-FAQ).
- **Контент обязателен видимый.** Разметка строится из реального текста на странице —
  скрытый FAQ-JSON-LD = риск ручной санкции. 3–5 Q&A на гайд — норма.
- HowTo эмитится автоматически на гайдах с заголовками `## Шаг N: …` — отдельной
  разметки не требует.
