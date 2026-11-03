---
name: loore-article
description: Write one Loore blog article (blog.loore.ai) end to end – real search query, answer-first outline, Russian draft in the Loore tone, claim-level fact check against loore.ai/llms-full.txt, BLOG CTA with per-slug UTM, pillar links, engine frontmatter, gpt-image-2 cover brief, content-lint, definition of done. Use for every Loore article (slice E and later); not for EdgeLab.
---

# loore-article – writing one Loore blog article

One run of this skill = one article = one slug. The skill is the repository version of the
pipeline Kaelthas described for the EdgeLab blog (`brief/KAELTHAS-content-plan.md`, «Second
answer»; `docs/CONTENT-PIPELINE.md`), adapted to Loore (`brief/PLAN.md` §4, §6, §9, v2.1).

Language: this file is English; the article, its frontmatter strings and the provenance record
are Russian.

## Inputs and outputs

| | What | Where |
|---|---|---|
| In | topic ID, target query, cluster, audience | `brands/loore/editorial/topics.md` (row for the slug) |
| In | tone, author facts | `brands/loore/editorial/tone.md`, `brands/loore/editorial/author.md` |
| In | GEO rules | `references/geo-rules.md` |
| Out | the article | `brands/loore/content-guides/<slug>.mdx` (from `templates/article.mdx`) |
| Out | provenance: query check, claim → source → date → verdict | `brands/loore/sources/<slug>.md` (from `templates/sources.md`) |
| Out | cover: scene prompt, scene PNG, composed derivatives, manifest | `brands/loore/assets/covers/<slug>/` (brief from `references/cover-brief.md`) |

An E job owns ONLY its own slugs' three paths. Never edit `brands/loore/brand.config.json`,
`brands/loore/slug-categories.json`, engine scripts, UI files or another job's slug (PLAN §1).
If the slug map lacks your slug, stop and ask the slice-A owner; do not add it yourself.

## Hard rules (any violation = not done)

1. **No invented numbers.** Every number in the text (demand, price, credits, limits, counts,
   percentages, durations, «в N раз») has a row in `sources/<slug>.md` with a source URL and the
   date you checked it. No source – delete the number or the sentence.
2. **Every Loore claim is checked against `https://loore.ai/llms-full.txt` fetched today**
   (step 4). Kaelthas's fact list is a lead, not verification.
3. **Outcome positioning.** Loore is described by what the reader gets (кадры чужих рилсов,
   расшифровка, сравнение с нормой автора, данные для своего ChatGPT/Claude). Never call Loore
   «парсер», «скрапер», «scraper», «parser», «граббер». Topic 13 (parser comparison) is not in
   the current list; if it is added later, the word may appear only as the reader's query,
   never as Loore's category.
4. **No «!»** anywhere in the article (title, description, body, FAQ, alt). No emoji, no
   «24/7», no passive-income or guaranteed-result promises, no unsupported «лучший», «самый»,
   «за N минут» without a source or your own measured run.
5. **No FAQ rich-result promises, no indexing promises, no AI-citation promises** (GEO rules).
6. **CTA = exact href + BLOG wording** (step 5). No `go.edgelab.space`, no shortener, no
   other domain.
7. **No EdgeLab leakage.** No EdgeLab author, community, counter, link, logo or wording
   (`brands/loore/editorial/author.md`).
8. **No first-person endorsement** («я сам пользуюсь») unless `author.md` records that the
   named author actually did it. Kaelthas's CTA draft is first person – do not copy it as is.
9. Every unknown fact is a visible `<<PLACEHOLDER: …>>`. A file with a placeholder is not
   publishable; the definition of done greps for it.

## Step 1 – topic and the real query

1. Take the slug's row from `brands/loore/editorial/topics.md`. The list status is «awaiting
   owner approval». Draft is allowed; release (E) is not, until `topics.md` records the owner's
   approval of the exact list (R05).
2. The demand figure in `topics.md` is Kaelthas's recorded Wordstat number (RU, monthly,
   Nov 2026). Copy it into `sources/<slug>.md` attributed exactly so: «Wordstat RU, по данным
   Кельтаса, ноябрь 2026, не перепроверено». Do not round, combine or extrapolate it.
3. Re-check the exact query wording, region and date with Kaelthas (he runs Wordstat on
   request – Yandex Cloud Search API) or Yandex Webmaster/GSC if the blog already has data.
   If you cannot re-check, record «не перепроверено» – do not fabricate a fresh measurement.
4. Write down the intent in one line (what the person typing the query wants to have after
   reading) and the overlapping topics from `topics.md` you must NOT duplicate (cannibalisation;
   lint WARNs at title Jaccard ≥0.5 or body ≥0.2).
5. Demand numbers never go into the article text unless they help the reader; if they do,
   they carry the source sentence.

## Step 2 – answer-first outline

Use this order (PLAN §9; `references/geo-rules.md`):

1. **Lead (before the first `##`)** – the direct answer to the target query in the first
   paragraph, ≥250 characters of prose before the first `##`, containing a key word of the
   title (lint FAIL otherwise). No «в этой статье мы расскажем».
2. **Context** – why the question exists, for whom the answer differs.
3. **Steps / method** – what the reader does, in order. For a prose `type: article` use
   numbered lists, not code fences.
4. **Original example** – one worked example the reader cannot get elsewhere (a real reel
   breakdown, a table you produced). It counts as a first-hand proof only if it is real.
5. **Limits** – what does not work, where Loore stops (llms-full.txt: Loore returns
   measurements and data; scripts are written by the reader's agent).
6. **Where Loore fits** – the native CTA paragraph (step 5).
7. **FAQ** – `## FAQ` with ≥2 real `###` questions people ask around the query.
8. **Sources** – `## Источники`: the external pages you relied on, with dates.

Headings use the words of real queries. Pick `type: article` for prose; use `type: guide` only
when the reader must copy commands or prompts (then code fences/`:::prompt` are allowed and the
EdgeLab guide rules in `docs/CONTENT.md` apply). Articles may not contain ``` fences or `:::`
callouts (lint FAIL).

## Step 3 – draft in the Loore tone

Read `brands/loore/editorial/tone.md` first. Summary: thesis first, short sentences, «ёлочки»,
short dash «–», address the reader as «ты» (Loore's own voice), facts over adjectives, no «!».
Write ≥600 words of real content (lint FAIL below). Required lines in the body (lint FAIL for
articles published on/after 2026-10-18):

- `Проверено на <что именно>, <месяц> <год>.` – what you actually ran or opened (for example
  «на loore.ai/llms-full.txt и пробном аккаунте Loore, ноябрь 2026»). Only things you did.
- `Текст подготовлен с помощью ИИ и проверен автором.` – keep only if the author really
  reviews it; otherwise leave the article unpublished until they do.
- ≥3 first-hand proofs: real screenshots (lint counts any non-diagram image, but a cover
  re-used in the body is not a proof), own data tables, or `proofs:` frontmatter items
  (≥10 chars each) that point to visible evidence in the article. Never list a proof that
  does not exist. Where inline screenshots live for Loore is not yet defined by slices A/C
  (E owns only `content-guides/<slug>.mdx`, `assets/covers/<slug>/`, `sources/<slug>.md`):
  `<<PLACEHOLDER: Loore inline screenshot directory and owner>>` – ask before adding one.

## Step 4 – fact check against llms-full.txt

Full procedure: `references/fact-check.md`. Short form:

1. Fetch `https://loore.ai/llms-full.txt` at writing time; record fetch time (UTC), byte size
   and sha256 in `sources/<slug>.md`.
2. Extract every atomic Loore claim from the draft (capability, platform, tool name, number,
   price, trial, limit, connection method).
3. For each claim, find the line(s) in llms-full.txt; copy the excerpt and line number. Verdict:
   `supported` / `removed` (deleted from the draft) / `rephrased` (narrowed to what the source
   says).
4. Commercial terms (trial, prices, BLOG discount) are not in llms-full.txt by design – its
   «Цены» section says prices live on the storefront. Check them on `https://loore.ai/` (and the
   tariff page) the same day, record the excerpt; for BLOG use `brief/PROMO-BLOG-facts.md`
   (monthly tariffs only, annual excluded). If not found today – remove the claim.
5. Anything else external (Instagram, YouTube, Claude, ChatGPT behaviour) – an official page or
   your own run, with URL and date. No source – remove.

## Step 5 – CTA blocks

Exact href, built per slug and placement (PLAN §4; `brief/PROMO-BLOG-facts.md`):

```
https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<slug>&utm_content=<placement>
```

- Path exactly `/r/blog`, no trailing slash, no shortener, parameters in this order.
- Article body placements: `article-mid` (optional, at most one, after the method/example) and
  `article-end` (required, in the «Где здесь Loore» section). Header/footer/UI CTAs belong to the
  UI (slice B1) – do not add them in MDX.
- Wording: the CTA must name the code and the scope exactly as «Промокод BLOG – скидка на
  месячные тарифы». Do not promise an annual discount, a percentage, or a price unless re-checked
  today (step 4) and recorded.
- The CTA is prose (the engine renders markdown links; `:::cta` is deprecated and FAILs lint in
  articles). It follows from the content: the reader has just seen the manual way, Loore is the
  shorter way to the same outcome.
- Trial («250 кредитов на 3 дня, без карты») may appear only if found on loore.ai the same day
  and recorded; seen on the landing FAQ on 2026-11-03 – re-check, it can change.

Example (replace the slug):

```
Если хочешь получить кадры и расшифровку чужих рилсов прямо в своём Claude или ChatGPT,
подключи Loore. [Промокод BLOG – скидка на месячные тарифы](https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=idei-dlya-rils&utm_content=article-end).
```

## Step 6 – internal links

Pillars (PLAN §9; fixed routes owned by slice A):

| Pillar | Route | Topics |
|---|---|---|
| S – скиллы Claude | `/claude-skills/` | 1, 2, 3, 4 |
| R – рилсы | `/reels/` | 5, 6, 7, 12 |
| I – ИИ для Instagram | `/instagram-ai/` | 9, 10, 11 |
| V – видео в текст | `/video-to-text/` | 14 |

- Link the article's own pillar at least once in the prose (lint WARNs otherwise; treat as
  required). Link a second pillar only if the reader naturally needs it.
- 1–2 in-text links to neighbouring articles as `[описательный якорь](/guides/<slug>/)` with the
  trailing slash (lint FAIL without it), not in the first paragraph, never «здесь»/«тут».
- Link only to articles that exist in `brands/loore/content-guides/` in the same validated wave
  (lint FAILs a broken `/guides/` link; at least one `/guides/` link is required). If no
  neighbour is published yet, coordinate with the other E jobs so the wave has valid links; do
  not link to future slugs.

## Step 7 – frontmatter

Start from `templates/article.mdx`. Fields the engine reads (`docs/CONTENT.md`) and lint
checks:

- `slug` = file name = the slug from `topics.md` (lint FAIL on mismatch).
- `title` – «<реальный запрос> 2026: <хук>», the query at the start, a year, no «!». Must not
  equal a pillar's H1.
- `description` – 1–2 sentences, the visible lead quote and meta description; answer, not meta.
- `summary`, `difficulty`, `estimated_time` (minutes, honest), `tags`.
- `type: article` (or `guide`, see step 2).
- `author` – from `author.md`. While it is a placeholder the article is not publishable.
- `published_at` / `updated_at` – real ISO UTC, not in the future, `updated_at ≥ published_at`.
  Move `updated_at` only with a real text change (lint FAILs a bare bump).
- `proofs` – only real evidence.
- `last_verified_at`, `verified_sources` – date of the step-4 check and the URLs used.
- Informational (not read by the build today; keep for agents and slice C): `target_query`,
  `pillar`, `cover_manifest`, `cover_alt`.

Covers are produced by slice C's pipeline (PLAN §5): `gpt-image-2` scene PNG without text →
`tools/covers` composer (Loore branding, Geist) → 1600×900 master PNG → AVIF/WebP/JPEG at
800 and 1600 px + a separate OG JPEG 1200×675, recorded in a per-slug manifest. Store everything
under `brands/loore/assets/covers/<slug>/`. The exact file names and manifest schema are C's
contract: `<<PLACEHOLDER: confirm cover file names and manifest schema against slice C's tools/covers manifest>>`.
Until C lands, keep `cover_manifest: brands/loore/assets/covers/<slug>/manifest.json`.

## Step 8 – cover brief (gpt-image-2)

Follow `references/cover-brief.md`: one scene per article, Loore palette, **no text, letters,
numbers, logos or UI text in the image** – the title and the Loore mark are composed by
`tools/covers`. Save the exact prompt as `brands/loore/assets/covers/<slug>/prompt.md`. Rotate
subjects across the 12 covers.

## Step 9 – lint and fix

Run from the repository root:

```
CONTENT_GUIDES_DIR=brands/loore/content-guides node scripts/content-lint.mjs
```

(after slice A lands, use whatever brand selection it documents for Loore, for example
`BRAND_CONFIG=brands/loore/brand.config.json`, so the slug map and pillars are Loore's.)
Fix every FAIL. Treat these WARNs as FAIL for Loore launch (PLAN §9): missing FAQ / <2 Q&A,
no year in title, no pillar link, overlap with another guide, missing cover.

Known lint gaps at base `400af0f` (slice C owns `scripts/content-lint.mjs`; check by hand until
fixed):

- the slug map is parsed from `scripts/build-guides-data.mjs` (EdgeLab `SLUG_CAT`), so every
  Loore slug FAILs «slug не добавлен в SLUG_CAT» until slice A's `brands/loore/slug-categories.json`
  is wired into lint – that FAIL is expected, not a reason to edit the engine;
- the cover WARN looks only in `site/covers/<slug>.(webp|png)`, not in
  `brands/loore/assets/covers/<slug>/` – verify the cover manifest yourself;
- the `updated_at` freshness WARN and the fake-date-bump FAIL compare against
  `git show HEAD:content-guides/<file>`, so they are silently skipped for
  `brands/loore/content-guides/` – check by hand: never move `updated_at` without a text change. Then run the
project check (`scripts/check.sh`) when the build for Loore exists. Paste the final lint output
into `sources/<slug>.md`.

## Step 10 – definition of done

All must be true; record the evidence in `sources/<slug>.md`:

- [ ] `topics.md` row matches slug, query and pillar; overlapping topics named.
- [ ] Lead answers the query in the first paragraph (≥250 chars before first `##`).
- [ ] ≥600 words; FAQ ≥2 real questions; «Источники» section with dated URLs.
- [ ] `grep -nP '!(?!\[)' <article>` finds nothing (image syntax `![` excepted); no emoji;
      no «парсер/скрапер» for Loore.
- [ ] Every number and every Loore claim has a `supported` row in `sources/<slug>.md`;
      llms-full.txt fetch time + sha256 recorded.
- [ ] CTA `article-end` present; every loore.ai link matches the exact href with this slug;
      wording «Промокод BLOG – скидка на месячные тарифы»; no annual promise.
- [ ] Own pillar linked; 1–2 neighbour `/guides/<slug>/` links that exist in the wave.
- [ ] Frontmatter complete; dates real; `author` not a placeholder.
- [ ] «Проверено на …, <месяц> <год>.» and the AI-assistance line are present and true.
- [ ] Cover prompt saved; scene has no text; composed derivatives + OG JPEG exist per C's
      manifest.
- [ ] `grep -rn '<<PLACEHOLDER' brands/loore/content-guides/<slug>.mdx brands/loore/sources/<slug>.md` = nothing.
- [ ] content-lint passes with zero FAIL and none of the launch WARNs above (before slice A
      wires the Loore slug map, the only tolerated FAIL is «slug не добавлен в SLUG_CAT», and
      the article is not releasable until it is gone).
- [ ] No EdgeLab literal in the three owned paths (`grep -rniE 'edgelab|ешиев|go\.edgelab'`).

Release (build, deploy, IndexNow) is not part of this skill: the responsible operator ships
after review (PLAN §7, §9).
