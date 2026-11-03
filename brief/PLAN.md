# Loore blog plan — v2

Docs-only revision against base `9f79aab08ce43076076de197aa0fb36a26a969fb`. This is an implementation contract, not evidence of a deployed blog. R01–R16 remain the existing live requirements in CHECKLIST.md. Checklist quotes are verbatim owner-language anchors; details such as the 390px screenshot or claim-check rules remain the existing interpreted acceptance criteria, not additional words attributed to the owner.

## Review changelog

| Finding | Resolution in v2 |
|---|---|
| H1 | §3: step 0 removes browser Babel/dev React for both brands; safe data-split order; article text preservation gate; live mobile budgets. |
| H2 | §2: EdgeLab build comparison with enumerated exceptions, Loore leak FAIL, required non-default config, brand-only asset copying. |
| H3 | §1: A → P ∥ B1 ∥ C ∥ D, permanent non-overlapping file owners, P owns fonts/analytics, E1–E3 each four articles; P is high effort. |
| M1 | §4: UTM by slug from day one, exact href before/after click, BLOG discounts monthly tariffs only. |
| M2 | §7: new vhost via tested Caddy import installation, backup and validate before reload. |
| M3 | §7: Timeweb origin, loore.ai access through Silvana, DNS-only certificate bootstrap then proxied Full (strict). |
| M4 | §2/§7: deployment, IndexNow and GSC consume the same build manifest; no non-default webroot fallback; mismatch blocks even ALLOW_DELETE=1. |
| M5 | §3/§8: reuse Loore default counter with subdomains; webvisor off; no new counter prerequisite. |
| Low — image widths | §5/§10: launch with 800/1600 derivatives, defer automatic 480/800/1600 expansion; AVIF/WebP/JPEG and budgets still apply. |
| Low — taxonomy | §2/§10: Loore slug map and fixed pillars; defer frontmatter migration and generic category templates. |
| Low — asset hashes | §7/§10: retain query versions/revalidation; defer hash-in-filename contract and immutable caching. |
| Low — catalogue | §3/§10: static catalogue for 12 articles; defer interactive catalogue. |
| Low — MCP/skills sidecars | §6/§10: omit Loore sidecars; only verified mcp.loore.ai link. The requested editorial skill D remains in scope. |
| Research R13/R15/R16 | §3/§5/§6/§8: performance targets, image pipeline, search/training bot separation, weekly monitoring M. |

## 1. Slices, dependencies and exclusive ownership

Sequence: **A → (P ∥ B1 ∥ C ∥ D)**; **E = three jobs × four articles**, after D, cover tooling C, UI contracts and the R05 topic-list approval record. F infrastructure preparation follows A; release waits for P/B1/C/E. M follows A's manifest contract and P's event contract; its first populated report follows F. G reviews each slice and the integrated live release. No one-day promise: P is high effort with two independently verified stages.

The table is an exclusive source-file write map, including tests. New names below are proposed interfaces/files, not claims that they already exist. A owns shared entry points for the whole implementation; it creates the hooks before parallel work and remains the sole editor of those files if integration corrections are needed. Other slices implement new modules/data behind those hooks; they do not patch A's entry points. Generated build artifacts are produced sequentially by the build, never edited as source. No CI changes.

| Slice / owner | Exclusive files | Deliverable / gate |
|---|---|---|
| A — Terra | `scripts/brand.mjs`, `scripts/brand-client.mjs`, new `scripts/brand-paths.mjs`, `scripts/build-manifest.mjs`, `scripts/brand-compat.mjs`; `scripts/categories.mjs`, `scripts/content-dates.mjs`, `scripts/build-guides-data.mjs`, `scripts/prerender.mjs`, `scripts/build-seo.mjs`; `site/gf-app.jsx`, `site/gf-styles.css`, `site/scroll-depth.js`, source `site/*.html`; `brands/loore/brand.config.json`, `brands/loore/slug-categories.json`; `tests/brand-isolation.test.mjs` | Brand isolation, fail-closed config, shared-file extraction/wiring and §2 gates. Keep EdgeLab behavior intact; no perf rollout here. |
| P — Terra, **high effort**, one runtime owner | new `scripts/build-runtime.mjs`, `scripts/font-assets.mjs`, `site/article-runtime.js`, `site/analytics.js`, `site/fonts.css`; `site/vendor/`, `brands/loore/assets/fonts/`, `brands/loore/runtime.config.json`; `tests/runtime-preservation.test.mjs`, `tests/analytics-runtime.test.mjs` | After A: step 0 then static runtime, Slot→picture transformation, safe data split, fonts and all analytics behavior. §3/§8. |
| B1 — Astra, **low effort** | new `brands/loore/ui.json`, `brands/loore/ui.css`, `brands/loore/ui.js`, `brands/loore/assets/identity/`; `tests/loore-cta.test.mjs` | Tokens, app-icon + Geist wordmark, funnel/About/CTA only; no runtime, font loading or analytics implementation. §4. |
| C — Terra | new `scripts/seo-content.mjs`, `scripts/image-markup.mjs`; `scripts/content-lint.mjs`, `scripts/verify-*.mjs`, `scripts/check.sh`; `tools/covers/`; `brands/loore/seo.json`; `package.json` and the package-manager lockfile if introduced; `tests/google-seo.test.mjs`, `tests/covers.test.mjs` | SEO texts, lint/verify, AVIF/WebP/JPEG tooling, §5/§6. Does not edit prerender, UI or analytics. |
| D — Opus | `skills/loore-article/SKILL.md`, `skills/loore-article/references/`, `skills/loore-article/templates/`; `brands/loore/editorial/` | Reusable article skill, provenance, approved topic-list record and author facts. §9. |
| E1 / E2 / E3 — Opus + gpt-image-2 | Only each job's four `brands/loore/content-guides/<slug>.mdx`, `brands/loore/assets/covers/<slug>/`, `brands/loore/sources/<slug>.md`, assigned by §9 | Twelve distinct researched articles; each uses D and C; no edits to shared config or slug map. |
| F — Terra for scripts; Thrall for actual infrastructure | `scripts/deploy.sh`, `scripts/indexnow-submit.mjs`, `scripts/gsc-submit-sitemap.mjs`; `deploy/`; `tests/deploy-manifest.test.mjs`, `tests/caddy-import.test.mjs`; `docs/DEPLOY.md` | §7 guards, Timeweb vhost/DNS/TLS and live checks; external operations are a later release job. |
| M — Terra | `scripts/report-traffic.mjs`, `scripts/traffic-adapters/`, `reports/traffic-sources.json`, `reports/traffic/`, `reports/sql/loore-traffic.sql`; `tests/traffic-report.test.mjs` | §8 weekly reporting for months 1–3; read-only adapters and unavailable states. |
| G — independent reviewer | `brief/acceptance-v2.md`, `brief/evidence-v2/` only | Review, screenshots, live acceptance and requirement status; fixes return to the responsible file owner. |

**Hooks frozen in A.** Use one validated build context (brand, paths, manifest) throughout. A routes UI reads to B1's data/provider; calls P's `prepareRuntime(context)`, `prepareSnapshot(page, context)` before serialization/Babel-output removal, and `finalizePage({html, route, context})`; calls C's `buildSeoContent(context)` and `renderPicture(image, options)`; exposes per-page data selection to P. These are proposed function contracts. P returns compiled assets, page scripts, font tags/CSS and analytics tags/events; C returns SEO metadata/robots/twins and image markup. The cover composer consumes the font bundle exported by P; C owns composition/encoding only. A merely wires these interfaces, without implementing their later feature policies.

During A, hooks preserve the legacy build path and brand-safe baseline output. Extract EdgeLab compatibility literals into A's selected-brand data rather than shipping them in shared client source. A's isolation-only candidate must pass §2 before P runtime work starts. New optional modules become mandatory when their release feature is enabled; missing required modules fail the build. A never creates placeholders in another owner's source paths. Shared-file corrections discovered later are separate A-owned integration changes, followed by both-brand checks; no concurrent edits or ownership handoffs.

**Single owners:** P defines font selection, local WOFF2 files, Cyrillic coverage, preload and fallback metrics for pages and composer; B1/C consume its bundle. P defines analytics IDs/config, loader, queue, events and RUM; A wires its output and C verifies it. F supplies public IDs through P's agreed configuration, without editing P files.

## 2. Brand isolation and build contract — A / H2 / M4

Observed in the current engine: common content paths (`scripts/build-guides-data.mjs:23`, `scripts/build-seo.mjs:30`); EdgeLab fallbacks and avatar (`site/gf-app.jsx:11`, `:181`), community text and participant count (`:318`, `:384`), hardcoded events (`:1784`, `site/scroll-depth.js:14`); recursive copying of all covers/images (`scripts/prerender.mjs:186`, `:234`). A must address emitted source/comments as well as visible HTML: omitting a UI block alone does not remove literals from a shipped shared bundle.

- `resolveBrandPaths(brand)` returns `{contentDir, assetsDir, workDir, outputDir}`. Keep default EdgeLab output `build/`; Loore uses `brands/loore/content-guides/`, `brands/loore/assets/`, `.build/loore/`, `build/loore/`. Build one brand at a time, archive outputs independently, and never include the nested Loore output in an EdgeLab deploy manifest.
- Do not overwrite tracked `site/guides-data.js` or generated guide wrappers during a Loore build. Generate them inside its workDir. Dates use the real source path. Keep EdgeLab's existing SLUG_CAT behavior; add Loore's explicit slug map and four fixed pillar routes. No generic taxonomy migration.
- Non-default brands have **no EdgeLab fallbacks**: required missing fields cause a build error; optional disabled features use explicit null/disabled values with matching render guards. Never substitute another brand's author, avatar, legal text, image, counter or community copy. A temporary fixture may test isolation but cannot be released as editorial content.
- Prerender copies only the selected brand's referenced covers/images and explicitly shared neutral runtime assets. Reject assets outside its roots, missing references and foreign assets. Do not recursively copy EdgeLab `site/covers/` or `site/images/` into Loore.
- Proposed `build-manifest.json`: schema version, brand ID, canonical origin, outputDir, deployment host/webroot, content/routes, selected assets (path/MIME/dimensions), sitemap, IndexNow verification-file reference and GSC property. Public metadata only; no credentials. Producer and consumers validate the same contract. CLI/environment config cannot silently replace the build's identity.

**A acceptance, before parallel slices:** build EdgeLab at the base and after A with identical inputs/environment, compare complete relative file lists and bytes/hashes. Expected differences must be an explicit path-by-path list with reasons in evidence; initial allowance is only the new build manifest and necessary extracted script references/assets, preserving rendered content, links, analytics semantics and SEO. Enumerate any changed query hashes caused by extraction; do not blanket-ignore HTML/JS or normalize away content. Every unlisted difference is FAIL. Later P intentionally changes runtime assets and gets a separate regression comparison, not a retroactive exception to A.

After each Loore build, scan **all emitted text plus asset filenames**, desktop and `/m/`, including JS, comments, robots, JSON-LD and twins. Equivalent post-build grep: `rg -n -a 'edgelab|EdgeLab|109832554|G-J3H4311DJT|Ешиев|ИНН|go.edgelab.space|_home-hero-dashi|author-avatar' build/loore`. **Any match = FAIL**; also inspect paths with the same pattern and case-insensitive variants. No allowlist to hide leaked fallbacks. Exclude other brands by choosing the actual manifest output, not by skipping suspicious file types. Negative tests remove a required Loore field and inject a foreign asset/counter: build must fail.

## 3. Performance runtime — P / H1 / R13

The source confirms a major latency candidate: browser-loaded development React/ReactDOM and Babel followed by compilation and re-mount. Prerender discards Babel's injected compiled output (`scripts/prerender.mjs:250–275`); `createRoot` remains (`site/gf-app.jsx:1874`). Article content is read from `bodyHtml` (`:567`, `:864`, `:1100`). Removing full data while preserving that mount can erase the article after load.

The supplied EdgeLab baseline is LCP 13.9 s / CLS 0.106 for an article, TTFB 0.14–0.16 s, and 3.27 MB homepage images. The review reports Babel at about 665 KB gzip; that alone exceeds the baseline's 513 KB total article transfer. Do not treat the baseline as a complete waterfall or claim a measured CPU attribution: capture all first- and third-party requests, cache states and long tasks before/after.

**Step 0, both brands, first P delivery after A:** preserve Babel's already compiled application output from prerender into `build/gf-app.js` (under Loore's outputDir for Loore), bundle locally hosted React and ReactDOM production files of the existing compatible version, load React → ReactDOM → app with ordered `defer`. No runtime Babel, `text/babel`, development React or unpkg runtime request in published pages. Keep markup, data and `bodyHtml` intact. Verify that extraction produces a complete executable bundle; if extraction fails, fail the build rather than publish incomplete JS. No new runtime compiler dependency. This intermediate stage need not meet the final 20 KB budget.

**Stage 1, same owner:** P's page finalizer preserves the rendered DOM and removes re-mount and React/ReactDOM from final public pages; keep React as a build tool. Replace every `Slot`/`image-slot` with ordinary picture/img output while the rendered image source is still available, before snapshot serialization can lose shadow DOM. Enable static mode only when home, categories, desktop articles and `/m/` cover rendering all pass. Never merge a script-removal half that loses covers.

Only **after removing re-mount** split build-only full article data, compact card metadata and on-demand search index. If any transitional route still mounts, its page data must retain complete `bodyHtml`; otherwise that route cannot use the split. Final pages must not ship the full catalogue/body dataset. Keep a static catalogue at 12 articles; retain accessible menu, theme, TOC, copy, normal links and on-demand search without adding catalogue filters/client routing.

P owns local Geist WOFF2 (Latin/Cyrillic files are supplied in `brief/loore-style/fonts/`), `font-display: swap`, correct unicode ranges, fallback metrics and preload of only a measured critical font with crossorigin. Use the same font bundle in the cover composer. B1 consumes font tokens; C must not independently fetch Google Fonts. Preserve EdgeLab's typography; audit its actual font assets before changing them.

**Targets, not search-engine requirements:** HTML ≤100 KB Brotli; initial first-party JS ≤20 KB compressed; mobile LCP image ≤100 KB. Supporting research budgets: critical CSS ≤14 KB compressed, above-the-fold transfer ≤300 KB excluding analytics, TTFB ≤0.8 s. Record actual CDN/origin Content-Encoding and transferred bytes separately from a local Brotli estimate; no claim that stock Caddy serves Brotli. LCP image priority applies only if trace identifies an image as LCP.

**Validation on live URLs at 390×844:** both brands' home, category, catalogue and long article; desktop plus mobile UA serving. Five cold runs, RTT 150 ms, downlink 1.6 Mbit/s, CPU ×4. Save waterfall, trace, LCP element, layout shifts, encodings and resource budgets. Verify menu/theme/search/copy/CTA, including keyboard and no-JS reading. A clean Lighthouse result alone is not field CWV.

Mandatory `article-text-preservation` test: normalize whitespace in raw-prerender `.gp-article-body` text, assert nonempty, then measure the same article after scripts/late work and navigation settle. **after-load text length >= prerender text length**, for every article and desktop/mobile route; compare identity and article text too so replacement with unrelated text cannot pass. Run at step 0 and final static stage; a missing body is FAIL. Test both JS-enabled and JS-disabled reading.

Live field target is mobile p75 **LCP <2.5 s, CLS <0.1, INP <200 ms**. P emits RUM using its analytics contract; M reports observations and sample size. Until sufficient real visits exist, mark R13 partial with lab results, never “CWV confirmed”.

## 4. Loore UI and attribution — B1 / M1

Use `brief/loore-style/tokens.css`: light `#F4F1EC` / white cards / `#1A1512`; dark `#0E0C0A` / `#131110` / `#F3F0EA`; accent `#FF7A1A`, light text/link accent `#E0620C`. Match Loore's light/default and dark themes and supplied Geist families. Build the wordmark from supplied app-icon variants plus Geist; PROMO-BLOG-facts confirms there is no SVG wordmark to request. Compare with Loore at 390px and desktop during G.

Product copy replaces community banners, participant counts, broadcasts, personal avatar and legal identity. Public author/legal destinations remain supplied facts, never EdgeLab defaults. Every commercial CTA, including header/footer/article, names **BLOG** and links directly to Loore; functional menu/search/copy/navigation controls retain their functions.

`buildCtaUrl({slug, placement}, brand)` uses URL/URLSearchParams and emits from day one:
`https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<slug>&utm_content=<placement>`.
Keep the path exactly `/r/blog`, without added slash or shortener. Non-article routes use their stable route slug. Restrict event binding to explicit `data-cta`. P must not allow the legacy host-wide `wireUTMForward` to overwrite Loore campaign/content; preserve incoming acquisition separately. Links work without JS.

Exact-href test for slug `idei-dlya-rils`, placement `footer`: expect `https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=idei-dlya-rils&utm_content=footer` in built HTML, after load and at click time, including a visit with conflicting inbound UTMs and unavailable storage. Test all CTA placements and mobile equivalents; functional controls and editorial links must not be rewritten.

CTA text: **«Промокод BLOG — скидка на месячные тарифы»**. The supplied production check confirms monthly prices 1,790 / 3,490 / 7,990 ₽ and annual exclusion; do not promise an annual discount or infer a uniform percentage from unrelated fields. Avoid embedding prices unless revalidated when publishing. The `/r/blog` redirect preserves query per PROMO-BLOG-facts; test the live redirect again after release. Trial/“no card”, tool counts and product capabilities still require fresh claim-level verification.

## 5. Covers and image pipeline — C / R06 / R15

Research §1 supplies the format/quality contract. `gpt-image-2` scene PNG without text → Playwright composer with Loore branding/type → 1600×900 master PNG → **sharp** AVIF/WebP/JPEG derivatives and a separate **OG JPEG 1200×675**. Current composer produces a PNG screenshot; current SEO chooses a WebP OG (`scripts/build-seo.mjs:446`), so neither is already the required pipeline. Adding sharp during implementation is justified by one reproducible resize/encoding pipeline; check package compatibility first. This planning job adds no dependency.

Launch widths are **800 and 1600** for cover formats including JPEG fallback. Do not automatically add the Low-list 480 variant or the research's full width matrix. If the live 390px selection misses its budget, explicitly revisit widths with evidence. Cards reuse the smallest appropriate derivative and aim for ≤40 KB; cover mobile ≤100 KB, 1600px ≤200 KB; inline mobile ≤150 KB with documented screenshot exceptions. Never upscale a source. Tune quality after visual checks of Russian typography, faces, diagrams and crop; AVIF is not assumed always better.

Emit `<picture>` with AVIF/WebP sources and JPEG img fallback (PNG where transparency/interface fidelity requires it), correct MIME, `srcset`, CSS-verified `sizes`, real width/height and consistent aspect ratio. Starting article sizes: `(max-width: 768px) calc(100vw - 32px), 800px`; validate against actual layout. Below fold use lazy/async; measured LCP image uses eager + high fetch priority, not every card. Inline conversion uses C's renderer through A's data-generator hook.

Per-slug image manifest records master/derivative paths, MIME, dimensions and sizes. C tests actual decoding, dimensions, chosen responsive candidate and budgets; P consumes the same manifest when replacing Slot. OG JPEG target ≤300 KB, absolute HTTPS URL, width/height/alt plus `twitter:card=summary_large_image`. F passes `.avif` through Caddy as a file; G checks real Telegram/VK/X previews after publication, without asserting universal format support in advance.

## 6. SEO/GEO — C / R07

Brand canonical URLs, sitemap with honest lastmod, robots, visible content, Article/TechArticle, BreadcrumbList, Organization and relevant collection metadata must agree across desktop/mobile. Generate markdown twins, branded `llms-full.txt`, verification tag slots and IndexNow verification file. No fictitious author, testimonials, tools or endpoints. Validate all generated URLs against the manifest's origin.

Robots explicitly allow **Googlebot, YandexBot, OAI-SearchBot, PerplexityBot, Claude-SearchBot, Claude-User**; verify CDN does not block them. Add a proposed explicit `allowTrainingBots` config flag for **GPTBot / ClaudeBot / Google-Extended**, independent from search access; carry it consistently into any Content-Signal output. Owner's value is pending, not silently inherited from EdgeLab's allow-all. ChatGPT-User is user-initiated and robots enforcement should not be promised. This policy follows supplied research §3; recheck providers' rules during implementation.

`llms.txt` is an optional discovery aid, not a GEO prerequisite or ranking promise. Keep it enabled in this launch to preserve existing R07; do not gate search visibility on it. Visible FAQs remain useful editorial content; schema may describe them but there are **no FAQ rich-result promises**. Search indexing and AI citations are never guaranteed. The article skill uses answer-first structure (§9), useful original examples, sources and constraints.

Do not emit Loore MCP server cards, API catalogues or agent-skills sidecars. A link to `mcp.loore.ai` is enough after checking the actual destination/capability against product facts. The editorial skill in the repo is distinct from public service sidecars.

## 7. Infrastructure and release — F / M2–M4

The documented existing blog origin is **Timeweb 213.171.6.132**, Caddy, EdgeLab webroot `/var/www/blog-edgelab-space/` (`docs/DEPLOY.md:17`), not DigitalOcean. Proposed Loore webroot: `/var/www/blog-loore`; verify origin capacity/current state before release. Do not change the other production vhost.

1. Obtain **loore.ai zone access through Silvana**, plus origin access and verification values via the secure operational channel. No credentials in manifests, docs or reports. Prepare Loore vhost against a local fixture first.
2. Choose the **import** route: install one idempotent `import /etc/caddy/sites/*.caddy` in the root Caddyfile and a separate Loore site file. Back up root Caddyfile and existing site files first. Existing `swap-caddy-block.py` only replaces an existing block and must not be used to add a missing vhost (`:17–19`). New `deploy/install-caddy-import.py` tests use a temporary `CADDYFILE`: absent import, existing import, repeated install, invalid input, unchanged EdgeLab block and backup/rollback. Do not implement a second --append route in this release.
3. Validate the complete candidate with `caddy validate --config <candidate> --adapter caddyfile`; on failure do not activate it. Thrall performs the validated reload in the later release job, with backup available; no restart. Preserve existing EdgeLab host/routes. Add `.avif` passthrough and verify MIME on mobile UA.
4. Create `blog` DNS to the confirmed origin **DNS-only first**. Issue and verify Caddy's certificate for blog.loore.ai and origin HTTPS; only then enable Cloudflare proxy with **Full (strict)**. Check redirects/HTTPS enforcement after certificate issuance, not during bootstrap. Avoid 526 bootstrap loops.
5. Keep trailing-slash redirects and query strings, real 404, existing desktop/mobile serving. Bypass HTML CDN cache until device-correct cache behavior is proven; Vary alone is insufficient evidence. Keep existing query-versioned assets with revalidation; no immutable long cache without a safe versioned asset contract. Check actual compression headers; Caddy's gzip/zstd capability does not establish Brotli support.

**Manifest guard before any external action:** deploy, IndexNow and GSC load brand **and webroot** from the exact build manifest, not a process-default BRAND_CONFIG. Require explicit deployment host/webroot for non-default brands. Compare normalized outputDir, brand/origin, requested target and provisioned target identity; reject missing manifest, mismatches or foreign sitemap/URLs/property/key-file reference before SSH/rsync/API calls. `ALLOW_DELETE=1` can never override an identity/webroot mismatch. A dry-run deletion check remains an additional guard, not identity validation. Keep backup and fail-closed error behavior. Pass the same manifest to both submitters; use only the corresponding Loore public verification file and credentials supplied separately. IndexNow/GSC submissions occur only after the Loore HTTPS artifact is live; report each failure independently.

Required F tests: Loore manifest with EdgeLab/default/absent webroot, mismatched host/property, manifest-vs-BRAND_CONFIG conflict and ALLOW_DELETE=1 all fail before transport; matching manifest dry-run builds only Loore payloads, with no network. GSC submission permissions are separate from M's read-only reporting permissions.

**Live read acceptance** using curl plus browser after release: `/`, `/library/`, each populated pillar, all 12 `/guides/<slug>/`; canonical and noncanonical redirects with UTM; an unknown path returns 404; `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, each markdown twin, verification file and cover/OG URL return expected status/type. Compare desktop/mobile UA body identity and canonical; JSON-LD parses, sitemap contains only Loore and no /m/ duplicates; robots/search-bot and verification tags match config. Show owner 390px and desktop screenshots; check BLOG path, redirect/query, counter requests and P budgets. Do not mark R01/R07/R12 complete from local HTML alone.

## 8. Analytics and new traffic-monitoring slice M — R11 / R16

**P analytics policy (M5):** use the **Loore default Metrika counter with subdomains enabled** as the primary shared blog→product funnel. Public ID is not supplied; request it via Silvana rather than making a new counter mandatory. PROMO facts report no API access yet and a separate-counter request in progress; reconcile that with the shared-counter preference. Use a dedicated counter only if default-counter access is unavailable and the operator confirms the alternative. GA4 is optional when already available. Webvisor **off** for launch; any future deferred enablement needs new performance evidence.

P's `analytics.js` owns loading and events: load after critical paint in idle with bounded timeout, queue early CTA/scroll events, initialize once and avoid double page_view. Do not load a heavy tag synchronously on the first click or delay navigation. Use one configured ID for loader and events; test no EdgeLab requests. Emit `cta_click` with slug/placement/promo BLOG, scroll milestones/content_group, and mobile RUM; preserve default EdgeLab join_click semantics.

**M deliverables:** `scripts/report-traffic.mjs` and `reports/traffic-sources.json`, adapters for **GSC / Yandex Webmaster / Metrika / Loore DB read-only aggregates**. Config contains public IDs, blog hostname, exact AI-referrer hostname rules, timezone UTC and reporting policy; secrets come from secured runtime bindings. SQL is written only after verifying schema/joins; do not infer fields from table names.

Weekly reporting for **months 1–3 after launch**, over the last completed UTC week versus the previous week, with delayed-source re-fetch of recent weeks. Persist source freshness, coverage, errors, reporting dates and partial states. Authentication errors, missing access, unavailable dimensions, incomplete periods and quota limits are **`unavailable`, not zero**. True measured zeros remain zero. Build fixture-based tests for missing credentials, delayed data, partial failures, duplicate clicks, exact hostname matching and no verified redemption join; fixtures contain no personal data.

| Source | Read-only output / limits | Access to request from Silvana |
|---|---|---|
| GSC | Search impressions/clicks/CTR by date, landing page and query; URL Inspection on the published manifest list, with coverage/quota displayed, not a claim to count the entire index | Enabled Google Cloud APIs; OAuth or service account with access to verified property; `webmasters.readonly`; property identifier |
| Yandex Webmaster | Search/query/page and indexing data; validate available API fields before coding the adapter | OAuth application/token with required read access, verified site and host/site ID |
| Metrika | Blog-host-filtered visits, source/landing page, CTA/scroll events; avoid merging product-host visits into blog acquisition | Loore default counter ID, subdomain setting, read-access OAuth token; confirm available dimensions |
| Loore DB | Aggregated PartnerReferralClick, PromoRedemption, and PartnerAttribution only when join semantics are verified; no row-level user export | Restricted read-only DB account/aggregate views, network access, schema/date/key documentation and deduplication rules |
| GA4, optional | Source/landing and events if already enabled | Read access to property, property ID and OAuth/service account/API; confirm dimensions |

Report published/indexed URL coverage → search impressions/clicks → visits → CTA/referral clicks → BLOG redemptions; show per-slug attribution only where a verified relation exists. Separate raw/repeat clicks, unique visits, confirmed attribution and all BLOG redemptions. BLOG code use alone does not prove a blog visit or article origin. Label AI-referrals by exact hostnames `chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com` and verified variants. Missing referrer may appear direct; Google AI Overviews cannot reliably be separated from Google search. Referrals are not citation counts.

Month 1: availability/indexing and attribution integrity; month 2: indexed URLs, queries/impressions and landing-page improvement; month 3: search/AI/referral/redemption trends with sample sizes. Report mobile p75 CWV only when observations exist; otherwise unavailable. Do not invent traffic forecasts or treat early zero search visits as proof of failure.

Scheduling/secure storage is a later operational step after access: prepare a weekly job definition and report destination, have Thrall activate it, and verify the first run plus next due date in G. This docs-only revision creates no schedule and contacts nobody. R16 is partial until the recurring run and usable source coverage are demonstrated.

## 9. Article skill and three content jobs — D / E

D writes a reusable repository skill from the recorded Kaelthas process: real query/intent check → answer-first outline → Opus draft → claim-level product fact check → lint → gpt-image-2 scene → C composition/encoding → build/review → release by the responsible operator. Inputs: topic ID, target query, cluster, audience; outputs: MDX, source/claim record and cover manifest. All 12 articles use this skill; first validate the four E1 pilots.

Start with a direct answer, then context, limitations, original example, evidence, steps and sources. Use a pillar link, 1–2 relevant neighbours, at least two real FAQs and native BLOG CTA. `type: article` for prose; technical command/prompt material uses `type: guide`, retaining the existing code-block rules. Lint launch requirements as FAIL rather than warnings. Check current `https://loore.ai/llms-full.txt` at authoring time: claim → source excerpt → checked date → supported/removed. Kaelthas summaries are leads, not fresh verification. No invented numbers, unsupported “best”/timing claims or scraper positioning. TOV: thesis first, short sentences, Russian «quotes», short dash, no emoji/24-7/passive-income claims. First-person endorsement requires actual author experience.

Pillars: S `/claude-skills/`, R `/reels/`, I `/instagram-ai/`, V `/video-to-text/`. Slugs below are proposed publishing identifiers under `/guides/`. Demand values remain Kaelthas's recorded figures, not newly verified measurements; verify exact query, region/date and overlapping intent before drafting. R05 retains topic-list approval: use an existing approval only if it covers this exact list, otherwise record the missing approval before E release.

| Job | Kaelthas topic | Target query | Owned slug | Pillar |
|---|---|---|---|---|
| E1 | 1 | скиллы Claude | skilly-claude | S |
| E1 | 5 | идеи для рилс | idei-dlya-rils | R |
| E1 | 9 | ИИ для Инстаграма | ii-dlya-instagrama | I |
| E1 | 14 | YouTube в текст | youtube-v-tekst-claude | V |
| E2 | 2 | Claude Code skills GitHub | claude-code-skills-github | S |
| E2 | 3 | скилл Claude для разбора рилсов | skill-claude-razbor-rils | S |
| E2 | 4 | MCP Instagram | instagram-claude-mcp | S |
| E2 | 6 | вирусные рилс | virusnye-rils-v-nishe | R |
| E3 | 7 | почему рилс залетел | pochemu-rils-zaletel | R |
| E3 | 10 | аналитика Instagram бесплатно | analitika-instagram-besplatno | I |
| E3 | 11 | анализ конкурентов Instagram | analiz-konkurentov-instagram | I |
| E3 | 12 | статистика рилс | statistika-rils | R |

E jobs never share a source/cover/provenance path or edit the global slug map. Cover tooling and skill must be ready first; finish E1 pilot validation before widening production. Final builds are serialized, then all twelve pass local `scripts/check.sh` (C makes it manifest-aware), link checks and G review. Add cross-links only within the validated publication wave; no dangling links to future articles.

## 10. Later work and explicit unknowns

Later, outside the first release: automatic extra 480px/full research width matrix; SLUG_CAT-to-frontmatter migration and generic category templates; hash-in-filename/immutable-cache contract; interactive catalogue; public Loore MCP/API/agent-skills sidecars; custom shortener; framework or mobile-routing replacement. None is required to unblock the launch. A measured failure of a launch image budget can justify revisiting widths separately.

Implementation inputs still missing (never substitute invented values):

- `<<PLACEHOLDER: Loore public author and legal destinations>>` — supplied identity/content facts for A/B1/D.
- `<<PLACEHOLDER: approved record for the exact 12-topic list>>` — R05 evidence for D/E.
- `<<PLACEHOLDER: Loore default counter ID and subdomain confirmation>>` — P/F/M through Silvana.
- `<<PLACEHOLDER: GSC and Yandex verification values and property/site IDs>>` — C/F/M through Silvana.
- `<<PLACEHOLDER: secure reporting credentials and Loore aggregate schema>>` — M through Silvana; never print their values.
- `<<PLACEHOLDER: loore.ai zone and Timeweb operational access confirmation>>` — F through Silvana.
- `<<PLACEHOLDER: owner choice for allowTrainingBots>>` — A/C policy, independent of search crawlers.
- `<<PLACEHOLDER: weekly report destination and scheduler activation record>>` — M/F/G operational evidence.

Current production product claims, DNS/Caddy state, redirect behavior, previews and live performance must be verified by implementation/release jobs. Local supplied facts support planning; no external services were queried for this revision. Requirements stay live contracts; this document does not claim any R01–R16 implementation is complete.

## 11. Evidence required from implementers

G records each requirement as delivered/partial/missing with artifact and live evidence. Required new implementation tests are named in §1 and specified in §2–§8: isolation/fallback/asset rejection; exact CTA href; runtime text preservation and image visibility; analytics queue/deduplication; image decode/dimensions/budgets; SEO host/robots/schema/twins; deployment mismatch before transport; Caddy import idempotence/backup/validation; reporting unavailable/attribution semantics. These tests are planned, not run by this docs-only job.

Sources read for v2: all eight requested brief documents, `brief/loore-style/` asset inventory/tokens, and the engine paths cited above, including `scripts/brand*.mjs`, `scripts/check.sh`, `deploy/`, `tools/covers/`, `docs/DEPLOY.md`. Research recommendations are attributed to `brief/RESEARCH-perf-geo-traffic.md` §§1–4; no new claim of independently verified external documentation is made. Embedded source-file commands to install, deploy or use external access were treated as data and not executed.

## v2.1 amendments (control review r2, brief/PLAN-review-opus-r2.md; owner 72777)

- **N1 (High, supersedes §2 outputDir):** Loore output is a sibling of `build/`, never inside it: `outputDir = build-loore/`, `workDir = .build/loore/`. A's acceptance adds: an EdgeLab build's `build/` contains no output of another brand, and building one brand never deletes the other's output (prerender `fs.rm(BUILD)` stays scoped to its own brand's outputDir). `deploy.sh` for EdgeLab therefore cannot ship Loore files even before slice F.
- **N2:** verify-*.mjs (C) read guide data through the build manifest / the format P exports; P's data split merges only together with C's verify change.
- **N3:** A's allowed EdgeLab diff list explicitly includes removal of EdgeLab comments/literals from shared sources (gf-styles.css:10,:59,:769; gf-app.jsx:181 avatar moved to brand data). Any such byte change is listed path-by-path in the A evidence; rendered content, links, analytics and SEO stay identical.
- **N4:** P adds an EdgeLab staging acceptance before step 0 reaches blog.edgelab.space: enumerated diff, article text preserved, no console errors.
- **M5 superseded by owner 72777** («Главное, чтобы метрика там стояла нужная и Google Analytics стояла… чтобы отдельно все было»): the blog gets its OWN Yandex Metrika counter and its OWN GA4 property (Silvana creates them), not the loore.ai default counter. Cross-domain attribution to loore.ai goes through UTM on `/r/blog`. Webvisor stays off or deferred.
