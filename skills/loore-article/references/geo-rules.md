# GEO and search rules for Loore articles

Source: `brief/RESEARCH-perf-geo-traffic.md` §3 (research job, primary sources opened
2026-11-03) and `brief/PLAN.md` §6. These are editorial rules, not ranking guarantees. Re-check
the linked provider pages when a rule matters for a decision; providers change them.

## What is confirmed

- **Plain crawlable HTML is the base.** Visible text, links, canonical URL and bot access. For
  Google AI Overviews a page must be indexable and eligible for a snippet; Google does not
  require special AI schema or files. Appearing in an AI answer is not guaranteed.
  [Google: AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- **No «chunking» rewrite for AI.** Google explicitly rejects the need to rewrite or chunk
  content specially for AI. Write original, useful material.
  (stated in research §3 without a separate link; most likely the AI optimization guide above –
  re-open it before quoting this to anyone)
- **FAQ rich results are gone.** Google reported that FAQ rich results are no longer shown
  since 7 May 2026. Keep a visible FAQ because readers use it; schema may describe it; never
  promise a rich result.
  [Google Search Central updates](https://developers.google.com/search/updates)
- **Structured data is optional for GEO** and does not guarantee a rich result. Article /
  TechArticle, BreadcrumbList and Organization must match visible content (the engine emits
  them; the author only keeps the visible text truthful). `FAQPage` only for a real visible FAQ.
- **`llms.txt` is not a GEO prerequisite.** Google says it ignores it; no open documentation
  confirms that AI search bots use third-party `llms.txt` for ranking. The blog keeps it as an
  optional discovery aid (PLAN §6).
- **Indexing takes time and is not guaranteed.** Google: discovery and indexing take three days
  or more for most sites.
  [Google: crawling](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors),
  [Yandex: indexing](https://www.yandex.com/support/webmaster/en/yandex-indexing/site-indexing)
- **Search bots vs training bots are separate** (engine/robots concern, not the article's):
  OAI-SearchBot, PerplexityBot, Claude-SearchBot, Claude-User are search/user agents; GPTBot,
  ClaudeBot, Google-Extended relate to training/generative use and are an owner policy.
  [OpenAI crawlers](https://developers.openai.com/api/docs/bots),
  [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler),
  [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers),
  [Google crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/overview-google-crawlers)

## Editorial rules derived from it (recommendation, not an AI requirement)

1. **Answer first.** The first paragraph answers the target query directly. Then context,
   limits, evidence, steps, sources (PLAN §9). Lint enforces ≥250 characters before the first
   `##` with a title key word.
2. **Original, useful examples.** One worked example per article that only we can show (a real
   breakdown, an own table, a real screenshot). Do not paraphrase other articles.
3. **Real sources, visible.** An `## Источники` section with the URLs relied on and the date
   checked. Facts about Loore come from `https://loore.ai/llms-full.txt` checked the same day.
4. **Dates are real.** `published_at`/`updated_at` real; the shown date and sitemap lastmod come
   from the last content commit (`scripts/content-dates.mjs`). Never bump a date without a text
   change; never add a year to the title without updating the content.
5. **Authorship.** A real public author (`brands/loore/editorial/author.md`). No fictitious
   author, testimonials, tools or endpoints (PLAN §6).
6. **Limits stated.** Say what the method does not do. It is useful to readers and keeps the
   answer quotable without overclaiming.
7. **No promises** of indexing, positions, AI citations, rich results or traffic numbers.
8. **Visible FAQ only.** ≥2 real questions; no hidden FAQ text or markup-only Q&A (manual
   action risk – `docs/CONTENT-PIPELINE.md` «Чего НЕ делать»).
9. **No scaled content abuse.** Each article is researched and reviewed individually; the 12
   are distinct intents, not variations of one text.
10. **Canonical internal links** `/guides/<slug>/` with the slash; no links through redirects.

## What the article author does NOT handle

robots.txt, JSON-LD, sitemap, markdown twins, IndexNow, verification tags, image formats –
those are engine slices A/C/F. The author only provides truthful visible content and the cover
inputs.
