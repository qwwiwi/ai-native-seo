# Loore blog – content plan from Kaelthas (swarm kaelthas::thrall::4b26bc94fe73cfdf, 2026-11-03)

## Rules
- Promo code: BLOG (same as in the URL).
- Ref link: loore.ai/r/blog, used RAW. Do NOT wrap it in go.edgelab.space (EdgeLab's Sink). A separate Loore shortener comes later.
- Position Loore by outcome (Claude skills, AI for Instagram, reel ideas), not as a «scraper»: «parser» demand is tiny and falling.

## CTA draft
«Я сам собираю идеи для рилсов так: Loore подключается к Claude или ChatGPT, достаёт рилсы конкурентов с кадрами и текстом и показывает, какие залетели выше нормы автора. Сценарий дальше пишет Claude по фактам. 3 дня бесплатно, без карты, промокод BLOG: loore.ai/r/blog»

## Headlines (Wordstat RU monthly in brackets)
1. Скиллы Claude: 12 лучших и как их установить за 2 минуты (7 300 + 1 950)
2. Claude Code skills с GitHub: что поставить, а что пропустить (1 350)
3. Скилл для Claude, который разбирает рилсы конкурентов (370)
4. Как подключить Instagram к Claude через MCP (57 + 65)
5. Где брать идеи для рилс, если всё уже снято (2 300)
6. Как найти вирусные рилсы в своей нише за 10 минут (660)
7. Почему рилс залетел: разбор по кадрам и первым 3 секундам (660)
8. Сценарий рилса через ChatGPT: не из головы, а по залетевшим роликам
9. ИИ для Инстаграма: что реально работает в 2026 (1 270)
10. Аналитика Instagram аккаунта бесплатно: какие цифры смотреть (490 + 140)
11. Анализ конкурентов в Instagram: пошагово с Claude (44, hot intent)
12. Статистика рилс: что значат охват, досмотры и «выше нормы автора» (660)
13. Парсер Instagram в 2026: Apify, API или MCP – сравнение (150 + 130)
14. Как получить текст из видео YouTube и отдать его Claude (about 500)
15. Расшифровка рилса в текст: 3 способа (60)

Start with 1, 5, 9, 14 (biggest demand plus a direct bridge to Loore). 13 works as an honest comparison (Loore wins on MCP).

## Loore facts (from loore.ai/llms-full.txt, per Kaelthas – verify before publishing)
129 MCP tools. Platforms: Instagram, YouTube (transcripts, channels, trending Shorts), TikTok, Threads, X, Reddit, Telegram channels, competitor ads (Meta/Google/TikTok/LinkedIn). Reel storyboard, tracking with the «x times above the author's norm» metric, ready skills. Connects to Claude and ChatGPT via MCP (mcp.loore.ai/mcp) or REST. Free trial: 250 credits for 3 days, no card.

## Wordstat RU monthly, Nov 2026
claude skills 7 300 (x40 YoY, peak 11 000 in July); скиллы claude 1 950; claude code github 1 350; claude code skills 770; скиллы claude code 380; идеи для рилс 2 300; ии для инстаграма 1 270; вирусные рилс 660; статистика рилс 660; youtube to text ~500; аналитика инстаграм 490; нейросеть для инстаграм 420; парсер инстаграм 150 (230 a year ago); mcp instagram 57; mcp youtube 65; скачать рилс 55 000 (downloader intent, useless).

## Second answer (swarm kaelthas::thrall::c4397395b5ee7221)
- Promo: BLOG; link loore.ai/r/blog raw. Verified by Kaelthas: /r/blog -> 200, lands on loore.ai/. NOT verified: what BLOG gives and where attribution shows. Check in the Loore backend (blossom partner codes). Suggestion: add ?utm_source=blog&utm_medium=article&utm_campaign=<slug> if the redirect keeps the query.
- Docs: qwwiwi/edgelab-portal-space/docs – CONTENT.md, CONTENT-PIPELINE.md, BANNERS.md, SEO.md, DESIGN-SYSTEM.md, PROMPT-STANDARD.md, WHITE-LABEL.md. Skills: qwwiwi/kaelthas-agent/skills (content-engine, reel-radar, instagram-superpower, landing-page-copywriter). Wordstat client not on GitHub; Kaelthas can run checks on request.
- Pipeline: demand via Yandex Cloud Search API Wordstat (100 req/h); Webmaster + GSC for positions. One content-guides/<slug>.mdx per article, frontmatter per docs/CONTENT.md, slug in SLUG_CAT (scripts/build-guides-data.mjs). Gate: node scripts/content-lint.mjs CLEAN (year in title, cover, >=1 pillar link, >=2 FAQ -> FAQPage, CTA as prose). TOV: short dash, «», no emoji, thesis first, numbers over adjectives; never '24/7' or passive income. Covers: B&W gpt-image-2 scene, no text -> tools/covers/compose-cover.mjs (absolute logo path) -> WebP q82. Build: node scripts/prerender.mjs, ONE at a time, 110-200 s. Deploy: PR -> owner OK -> scripts/deploy.sh (rsync + IndexNow) -> Webmaster recrawl -> curl check.
