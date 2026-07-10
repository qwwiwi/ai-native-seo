# Banners / cover images

Every guide, article, and the home/about hero use a **neo-noir cover banner = a black-and-white SCENE
+ a lime title/logo overlay**. This doc is the complete recipe — a fresh agent can produce an
on-brand cover from here.

**POLICY (prince 2026-06-17): the generated SCENE is BLACK-AND-WHITE (monochrome, no color, no lime).
Lime lives ONLY in the OVERLAY — the title accent, the eyebrow, the `edgelab●space` wordmark square.
Compose ALL covers with `--mono` (greys only the scene, keeps the overlay lime). Like the home hero.**

## What a cover is — 3 layers, composed at 16:9 (1600×900)

1. **Scene** — an AI illustration (neo-noir anime, **monochrome / black-and-white, no color, no lime**). No text baked in.
2. **Tool logo** — the real brand mark (Claude Code / Codex / Figma / MCP / Hermes …) in a white badge. NEVER let the model draw a logo.
3. **Title overlay** — the Russian title + subtitle + the `edgelab●space` wordmark + a lime accent, rendered as crisp HTML→PNG. The image model mangles Cyrillic, so **text is never baked into the AI image** — it is always the HTML overlay.

## The recipe

### 1. Scene (AI illustration)

Generated with **gpt-image-2**. In the Orgrimmar fleet this runs through the `codex-image` skill
(Codex subscription, no per-image billing). Any gpt-image-2 access works. Quality `high`, aspect
`landscape`. **STYLE ANCHOR — paste verbatim** (consistency comes from identical wording):

> Neo-noir anime style, cel-shaded sharp clean linework, dramatic high contrast, wet reflections, moody cinematic atmosphere, widescreen cinematic framing, emotional tension. STRICTLY BLACK AND WHITE / MONOCHROME GRAYSCALE — deep ink-black and charcoal base with warm off-white highlights and bright white neon glow. NO color of any kind: no lime, no yellow, no neon hue, no pink, no red, no cyan. Pure monochrome only. No text, no letters, no words anywhere.

Prepend a per-cover **SCENE** describing the subject/environment, then the anchor.

**VARIETY (hard rule):** do NOT make every scene «a hooded operator in a neon city / at a computer» — they read as samey. Keep the STYLE, rotate the SUBJECT: no-human abstracts (knowledge graph, agent-node network, rivers of code), object heroes (a glowing book of rules, a grid of skill blocks, floating UI), different environments (server hall, design studio, rooftop, void). Add `abstract, no human` to break the figure pattern.

### 2. Tool logo (SVG/PNG)

Pull the real brand mark — never generate it. In the fleet this is the `logo-company` skill
(`find-logo.sh <brand> default` → SVG from the glincker/thesvg set; `update-cache.sh <brand>` to
fetch a missing one). For the three pillars use the in-repo `site/images/{claudecode,codex,hermes}.png` (source; the build copies `site/images/` → `build/images/`).
**Hermes = our own anime-girl mascot**, not the generic «hermes» brand icon. Omit the logo for hero/about banners (they are logo-less).

### 3. Compose (HTML → PNG) — in-repo, portable

`tools/covers/compose-cover.mjs` (needs Playwright + a Chromium) renders `tools/covers/cover-template.html`:

```bash
node tools/covers/compose-cover.mjs \
  --bg scene.png --logo logo.svg \
  --eyebrow "ГАЙД · CLAUDE CODE" \
  --title 'Claude <lime>Code</lime>' \
  --sub "Первая настройка с нуля" \
  --out site/covers/<slug>.png
```
- `--title` supports `<lime>…</lime>` to color part of the title.
- `--logo` optional (omit → no badge, for hero/about).
- Output is 1600×900.

**Prince-approved specs (don't change):** title **122px**, subtitle **46px**, eyebrow **21px** (Inter Tight 800 + JetBrains Mono); lime `#D4FF00` is the only bright color; the `edgelab●space` wordmark is HTML text + an 11px lime square (border `rgba(255,255,255,.85)` on the dark cover), rendered 1:1 — never an image.

## All covers — one look: B&W scene + lime overlay

**Every cover** (guide, article, hero) = a **monochrome black-and-white scene** + the **lime overlay**
(title `<lime>` accent, eyebrow, `edgelab●space` wordmark square). Only the *scene* is greyscale; the
overlay keeps the lime EdgeLab style — exactly like the home hero (prince 2026-06-17: «слишком много
лаймов» → NO lime in the generated picture; lime stays in the text/logo overlay).

Generate a monochrome scene (the B&W style anchor above) and **always compose with `--mono`** (greys
only the scene, keeps the overlay lime). The only difference by type: a **guide** cover keeps the tool
logo badge + eyebrow «ГАЙД · <TOOL>»; an **article** cover uses eyebrow «СТАТЬЯ» and usually no `--logo`.

```bash
node tools/covers/compose-cover.mjs --bg bw-scene.png --mono \
  --eyebrow "ГАЙД · CLAUDE CODE" --title 'Claude <lime>Code</lime>' --sub "..." \
  --logo "$(~/.claude-lab/silvana/.claude/skills/logo-company/scripts/find-logo.sh claude-code default)" \
  --out site/covers/<slug>.png
```
(`--mono` greys ONLY the scene; `<lime>` in the title still renders lime — the intended overlay accent.
Do NOT grayscale the final composed PNG — that would kill the overlay lime.) See `docs/CONTENT.md` for
article vs guide.

## Wiring a cover into the site

Drop the PNG at `site/covers/<slug>.png`. That's it:
- `scripts/build-guides-data.mjs` → `coverFor()` auto-detects it (file presence) and sets `guide.cover = /covers/<slug>.png?v=<hash>`. The **`?v=<content-hash>`** is an automatic cache-bust — re-generating a cover changes the URL, so Cloudflare + browsers fetch the new one with no purge needed.
- It renders as the guide-page hero (`.gp-cover`) AND the home/catalog card (16:9 `<image-slot src>`).
- `scripts/prerender.mjs` copies `site/covers/` → `build/covers/` (`covers` is in its `ASSETS` list).

Special hero banners (NOT guide covers, logo-less, hardcoded src in `gf-app.jsx`):
- `site/covers/_home-hero.png` — home hero.
- `site/covers/_about-hero.png` — /about hero.
These are at a fixed URL (no `?v=`) — after changing one, purge Cloudflare for that URL (see `docs/DEPLOY.md`).

## Gotchas

- **No Cyrillic in the AI image** — overlay it. **Lime only** — say «lime is the ONLY bright color» or it drifts to pink/teal. **Logo overlaid, never generated.**
- compose-cover.mjs writes its temp HTML to the OS temp dir (not next to the output) so `covers/` stays clean.
- Pass the logo path directly with `--logo path/to/logo.svg`. compose-cover.mjs warns when the logo image fails to load (empty badge) — if that happens the path was wrong (e.g. an un-exported shell var that didn't reach the command). Always verify the badge rendered.

The full Orgrimmar skill (with the scene-prompt + logo references) lives at
`~/.claude-lab/silvana/.claude/skills/edgelab-covers/`; this repo carries the portable composer + this doc.

## Performance — covers MUST be WebP

PNG covers are 1–2.4 MB each; the home loaded ~12 MB of them. **Convert every cover to WebP**
(≈14× smaller, ~45–245 KB) — `coverFor()` already prefers `<slug>.webp` over `<slug>.png`:

```bash
python3 - <<'PY'
from PIL import Image; import pathlib
for png in pathlib.Path('site/covers').glob('*.png'):
    Image.open(png).convert('RGB').save(png.with_suffix('.webp'),'WEBP',quality=82,method=6)
PY
```
Keep the PNG as the source (it's the compose output + a fallback); the page serves the `.webp`.
Run this after generating any new cover. Result: home transfer 12.8 MB → ~1.3 MB.
