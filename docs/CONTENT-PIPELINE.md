# Content pipeline — how a guide or article is made

Agent-native SOP for writing and validating content on blog.edgelab.space.
Companion to `CONTENT.md` (frontmatter + content rules) and `DEPLOY.md`.

## Content type (hard rule)

| Type | Voice | Code/prompts | Cover |
|---|---|---|---|
| **гайд** | technical, instructional | allowed (verified commands) | B&W scene + lime overlay + tool logo |
| **статья** | human longread, prince's TOV | **NONE** — no code, no prompts | B&W scene + lime overlay, logo-less |

The "статья = no code/prompts, prince's TOV" rule is enforced at four gates:
type (M0) → draft (M2) → TOV-judge (M4) → lint hard-fail (M5: a ``` fence in an
article fails the build).

## Milestones

- **M0 · Brief & type** — topic, audience, goal. Decide гайд vs статья. Pull our
  angle from gbrain recall (what we actually did). Assign category (`SLUG_CAT` in
  `scripts/build-guides-data.mjs`) + milestone. **ОБЯЗАТЕЛЬНО: вытащи целевые
  поисковые запросы из Яндекс.Вебмастера (позиции 4-15 = «почти топ», скилл
  `yandex-webmaster`) → артефакт target-query list в M1 fact-sheet. Title/H1 и FAQ
  строятся под эти РЕАЛЬНЫЕ запросы, не выдуманные** (см. CONTENT.md «Формула тайтла»
  / «Откуда брать запросы»).
- **M1 · Sources (weighted)** — gather facts per the source model below; produce a
  sourced fact-sheet (claim → citation).
- **M2 · Draft** — гайд: exact verified commands/configs + code. статья: read the
  TOV first, human language, zero code/prompts. Fill full frontmatter
  (`description` REQUIRED, `type`, `last_verified_at`, `verified_sources`). **Add
  1-2 in-text cross-links** to related guides/articles (`[descriptive anchor](/guides/<slug>/)`,
  not in the first paragraph — see CONTENT.md «Cross-links») → recirculation.
  `inline()` converts any `[text](url)` → clickable `<a>` (internal same-tab /
  external new-tab), so in-text links work anywhere in the body. **Native CTA (НЕ
  bolt-on): последняя секция — естественный next step в сообщество EdgeLab,
  вытекающий из контента (hook → контент → CTA прозой), а НЕ приклеенный `:::cta`
  блок и не инфобиз-нашлёпка.** Note the body renders as a **serif longread** (PT
  Serif, «Пчела»-style) and `description` is the **visible bold-serif lead-quote**
  — write it as a voice line, not meta.
- **M3 · Fact-check (hostile)** — extract atomic claims → test each against the
  anchor → SUPPORTED / REFUTED / STALE / NEEDS_HUMAN. Anchor silent → weighted
  vote. Dual-model adjudication (Opus + Codex). Disagreement → human. Fix P0/P1.
- **M4 · Rubric + TOV** — score the rubric (publish: guide ≥86, article ≥82). An
  article also gets a dedicated TOV-judge (voice, no hype, no infobiz, no leaked code).
  **Рубрика включает строку CTA/Conversion (native CTA вытекает из контента → ведёт
  в сообщество как next step); TOV-чек: «CTA вытекает из контента, без инфобиз-нашлёпки».**
- **M5 · Lint gate (build)** — `scripts/content-lint.mjs` — РЕАЛЬНЫЙ pre-build гейт,
  зашит в `npm run build` И в начало `prerender.mjs` (прямой `node prerender` тоже
  гейтится). **FAIL (exit 1, build aborted):** нет `description` / `type:article` с
  ``` код-фенсом / битая внутренняя `/guides/` ссылка / не-stub гайд без in-text
  `/guides/` кросс-ссылки — **FAIL для ВСЕХ non-stub гайдов** (`LEGACY_NO_CROSSLINK` ПУСТ
  с бэкфилла PR #95; re-add slug только как временное исключение). Для `type:article`
  FAIL также на любой callout-блок (`:::prompt/:::tip/:::note/:::warning/:::cta`).
  **WARN:** нет `## FAQ` / <2 FAQ Q&A / title без
  года / тело изменилось без `updated_at` / нет ссылки на pillar. `npm run lint` для
  проверки без сборки. Fail = no publish.
- **M6 · Publish** — `build-guides-data.mjs` → `prerender.mjs` → `build-seo.mjs` →
  deploy via `scripts/deploy.sh` (rsync + chown + **авто-пинг IndexNow** Яндекс+Bing;
  see `DEPLOY.md`) → пинг Кельтасу на Вебмастер-переобход (**намеренно agent-owned** —
  креды Вебмастера у Кельтаса/другая машина+квота, это не пробел пайплайна). Cover via
  the `codex-image` / `edgelab-covers` skills — **ВСЕ обложки = ЧБ-сцена + lime-overlay
  (`--mono`)**; гайд vs статья отличаются ТОЛЬКО лого (гайд — лого инструмента, статья —
  без) + eyebrow. Полный рецепт — `BANNERS.md`. build-seo ставит **per-slug og:image** = обложка гайда
  (covers/<slug>.webp) + article:published/modified_time автоматически.
  Register slug + milestone. The build auto-adds the «Читайте дальше» related block
  (`computeRelated()`) + the **read-through analytics layer**: scroll-depth events
  (25/50/75/100% → Metrika `scroll_N` + `notBounce`@75 / GA4 `scroll_depth`),
  `content_group` (article|guide), and JSON-LD `articleBody` (full text) →
  Metrika «Аналитика контента» (Дочитывания/Доскроллы/Рециркуляция). Verified by
  `scripts/verify-readthrough-analytics.mjs` + `scripts/verify-related.mjs`.
  **Рециркуляция и дочитываемость — теперь измеряемые метрики успеха материала.**
- **M7 · Freshness (cron)** — `last_verified_at` + TTL (pricing 14d, cli/api 30d,
  article 90d, evergreen 180d) → flag stale → back to M3.

## Source model (validation)

**Canonical anchor** — ground truth; if a fact contradicts it, it is wrong (no vote):
- Official docs of every service the piece mentions.
- GitHub repos at HEAD — the repo/path must actually resolve (200, not 404) + README/CHANGELOG.
- `skills.sh` (The Agent Skills Directory) for any skill claim.
- **Empirical test** — for CLI commands/flags, run the tool (`claude --help`,
  `codex mcp --help`). Real output beats every other source.

**Weighted adjudication** — only when the anchor is silent or sources disagree:
- **50%** our experience — gbrain recall + our `LEARNINGS/decisions/MEMORY` + our skills + logs.
- **25%** Sonar (Perplexity deep research).
- **25%** X (Grok Live Search).

Weights flex by claim type: command/flag → empirical + GitHub; price/limit → X
(freshest) + our recent logs; concept/workflow → our experience.

**Confidence rule:** X/Grok and Sonar can extrapolate or hallucinate versions.
Mark NEEDS_HUMAN (not REFUTED) unless ≥2 sources or a doc/empirical-test agree.
Trust X **post citations** (vendor posts), not Grok's synthesis text.

## How we search X

Engine: xAI **Grok Live Search** on the prince's X Premium+ subscription — Grok
searches X server-side and returns synthesis + post citations (no scraping).
CLI: `x_search.py "query" --handles a,b,c --from 2026-05-01`. Three levers:
1. **query** — natural language, specific: "product + fact + year".
2. **--handles** — restrict to authoritative vendor accounts (Anthropic:
   `AnthropicAI,claudeai,bcherny,alexalbert__`; OpenAI: `OpenAI,sama,embirico,kevinweil`;
   MCP: `modelcontextprotocol`; xAI: `xai`). Watchlist (~51 handles) ships with the skill.
3. **--from/--to** — date window; volatile facts → last 4–6 weeks.

## Subagent distribution (agent-native)

One subagent = one focus; max 5 concurrent; in waves. Subagents return only a
summary (verdict + fixes), never raw material, to keep the orchestrator context clean.
- **M1**: 5 parallel by source — our-experience, empirical, docs-anchor, Sonar, X.
- **M2**: 1 writer (coherent voice).
- **M3**: N hostile fact-checkers in parallel; Opus + Codex cross-family adjudication.
- **M4**: 2 judges — rubric (Opus + Codex) and TOV (Opus).
- **M5/M6**: deterministic scripts, no subagent.
- **M7**: cron flags stale → spawns one M3 checker per guide.
- **Batch mode** (validating many guides): pipeline — each guide independent, waves of 5.

**Models: Opus everywhere; Codex GPT-5.5 as the cross-family second judge. No Sonnet.**
Sonar/X are data sources (Perplexity/Grok), invoked by Opus subagents — not model tiers.

## Rubric (weights)

Accuracy 25 · Commands 20 · Usefulness 15 · Clarity 12 · Structure/SEO 10 ·
Brand-voice 8 · Freshness 10. Publish threshold: guide ≥86, article ≥82.
P0 (block): free-vs-paid wrong · broken command · dead link · deprecated-as-current ·
missing `description`.

## Visuals — illustrations / diagrams / screenshots / video

Four visual types, by role (prince directive 2026-06-17, video added 2026-06-18):

1. **Illustrations — COVERS ONLY.** Generated with `codex-image` (gpt-image-2). **All covers =
   a black-and-white / monochrome SCENE + a lime title/logo OVERLAY** (prince 2026-06-17:
   «слишком много лаймов» → no lime in the generated picture; lime stays in the text/logo).
   Always compose with `--mono` (greys the scene, keeps overlay lime) — like the home hero.
   NOT used inside the body. Recipe: `BANNERS.md`. Covers auto-wire by file presence (`site/covers/<slug>.png`).
2. **Diagrams / block-schemes — IN-BODY, for BOTH articles and guides.** Hand-authored **SVG**,
   **black-and-white** (ink on a self-contained offwhite card, so it reads on light AND dark
   theme) with a single **lime square accent** on the key node (the brand marker — the only
   color). Live at `site/images/diagrams/<name>.svg`, referenced via a markdown image
   `![описание](/images/diagrams/<name>.svg)`. The build renders `/images/diagrams/*` in both
   articles and guides; every OTHER image stays article-only (guides are text-only) — see
   `scripts/build-guides-data.mjs`. Use to explain a concept clearly (e.g. «агент vs бот:
   бот отвечает на вопрос; агент берёт цель → шаги → результат → ты проверяешь»). Reference
   diagram: `site/images/diagrams/agent-vs-bot.svg`.
3. **News / X screenshots — via Playwright.** Open the real post in Chromium (Playwright /
   Playwright MCP), screenshot it, then **validate** the shot (right post, fully in frame, not
   crooked/broken) before embedding. For material that cites a news/announcement as proof.
4. **Video clips — IN-BODY, via `:::kinescope <video_id>`. OPTIONAL.** For эфиры / уроки / live
   demos where a 3–5 min recording teaches better than prose. The directive (in
   `scripts/build-guides-data.mjs`) emits a responsive 16:9 Kinescope player (`figure.gp-video`,
   CSS in `gf-styles.css`); works in BOTH articles and guides; the video id is regex-validated
   (`^[A-Za-z0-9_-]+$`, fail-closed — a bad id emits nothing, no XSS). The line(s) inside the
   block are the caption. **Workflow:** (a) **pick boundaries from timecodes** — our эфир
   transcripts are chaptered (`qwwiwi/online-workshop-edgelab` → `cabinet/transcripts/efir-N.md`,
   `## MM:SS` headers) and the эфир pages carry curated `data-t` seconds; Kinescope also stores
   per-video chapters (query its API). Confirm the source recording aligns with the transcript
   (durations match within a few seconds) before trusting transcript seconds as cut points.
   **MANDATORY check — the cut must match the text.** After cutting, ALWAYS transcribe the
   resulting clip (groq-voice) and compare its content to the section text + the caption it sits
   under: the clip must actually *say what the surrounding text and caption claim*, with no
   off-topic drift at the head/tail. Re-cut if it misses the promised point or wanders. (In the
   kak-vnedrit article this caught 2 bad cuts — one ended before the definition its caption
   promised, one drifted into an off-topic tail.) (b) **cut** with ffmpeg
   (`-ss/-t`, re-encode H.264/AAC + `+faststart`) — **3–5 min COMPLETE teaching segments, not
   soundbites**. (c) **upload as NEW videos** to Kinescope (`curl -T` streaming, into the source
   эфир's folder) — **never touch the existing full-эфир videos**. (d) **embed** `:::kinescope <id>`
   at the START of the relevant section (video leads, text reinforces). **The agent SHOULD
   proactively suggest** a clip when a point is better shown than told (prince 2026-06-18). Worked
   example: the `kak-vnedrit-ai-agentov` article (6 clips, one–two per section).

Always give an image a descriptive `alt` (agent-native + a11y). Diagrams are SVG — crisp at any
size, light, version-controlled, editable by an agent as text.

## Tooling & credentials

Keys live on the Mac mini operator machine **outside this repo** and are NEVER
committed (`.env`/secrets are gitignored). Helper scripts resolve them themselves —
do not paste keys on the command line. Locations (paths and env-var names only):

| Service | Used for | Location (operator machine) | Skill / tool |
|---|---|---|---|
| X / Grok Live Search | X fact source (25%) — prince's **X Premium+** subscription | `~/.hermes/auth.json` → `providers.xai-oauth` (OAuth, no per-call billing) | `~/.claude-lab/silvana/.claude/skills/x-research` |
| Perplexity / Sonar | web deep-research (25%) — **Perplexity API** | `~/.claude-lab/.secrets/perplexity.env` → `PERPLEXITY_API_KEY` (fleet-shared) | `~/.claude-lab/shared/skills/perplexity-research` (`scripts/pplx.sh`) |
| gbrain (recall/memory) | our-experience source (50%) — shared brain | `GBRAIN_BEARER` (channel-plugin `.env`) / `~/.claude-lab/silvana/secrets/dashi-gbrain.token` | MCP `dashi-gbrain-recall` / `-memory` |
| Claude Opus 4.8 | writer + judge | Anthropic **Max** OAuth (Claude Code session) | Claude Code |
| Codex GPT-5.5 | cross-family second judge | `~/.codex` (ChatGPT OAuth) | `codex` CLI |
| Banner / cover (gpt-image-2) | guide & article cover images | `~/.codex` — **Codex subscription** (gpt-image-2, NOT the billing-capped OpenAI image API) | `codex-image` + `edgelab-covers` + `logo-company` skills; recipe in `BANNERS.md` |

The fact-check run results for the current corpus live in the agent workspace:
`~/.claude-lab/silvana/.claude/artifacts/content-qa/findings.md`.
