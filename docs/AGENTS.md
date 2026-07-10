# AGENTS.md — start here

Onboarding for an agent (or human) who has never seen this repo. Read this first; it links the
rest. Goal: you should be able to **add a guide, make a banner, build, and deploy** after this page.

## 1. What this is and why

**`blog.edgelab.space`** — a free, open portal of guides & articles about AI agents (Claude Code,
Hermes, Codex). It is the **top of the funnel**: free SEO/GEO traffic → the paid **EdgeLab Space**
community (`edgelab.space`, 1490 ₽/мес). The guides stay open and un-paywalled; every page funnels
to «Вступить в сообщество».

**The job is SEO/GEO.** The portal exists to RANK (Google/Yandex) and to be cited by AI answer
engines (AI Overviews, Alice, ChatGPT). So: real text in static HTML (not client-only React),
JSON-LD, sitemap, llms.txt, robots with AI-bot rules, `.well-known` discovery, clean RU-first
content. When you add/change anything, ask «does this help it get found and convert?».

## 2. Stack & architecture (how a page is built)

The design is a **client-side React prototype** (React UMD + in-browser Babel, no framework) kept
**1:1** in `site/`. For SEO that alone is bad (content not in HTML), so the build **prerenders** it:

```
site/                     ← the 1:1 prototype (gf-app.jsx = all components, gf-styles.css, mobile.html)
content-guides/*.mdx      ← guide content (one MDX per guide) — the source of truth for text
scripts/build-guides-data.mjs  ← MDX → site/guides-data.js (catalog + per-guide article data, covers)
scripts/prerender.mjs     ← serves site/, renders every route with Playwright → build/*.html (content baked in)
scripts/build-seo.mjs     ← injects JSON-LD, OG, canonical, favicon; emits sitemap.xml, robots.txt, llms.txt, .well-known, markdown twins
build/                    ← deployable static output (committed; what actually ships)
```

One command builds everything: `node scripts/prerender.mjs` (or `npm run build`). It runs
build-guides-data → prerender (desktop + mobile + per-guide) → build-seo → asset versioning
(`?v=<hash>` on CSS/JS so edits cache-bust). Output is plain static files in `build/`.

- **Routing:** clean URLs (`/guides/<slug>/`, `/library/`, `/claude-code/`, `/about/`) — Caddy
  rewrites; see `docs/ROUTES.md`. Mobile is **device-served** (separate `build/m/` shell by UA).
- **Design:** off-white `#FAF7F2` / ink `#0A0A0A` / lime `#D4FF00`, Inter Tight + JetBrains Mono
  (UI) + **PT Serif** (тело материалов — читательский лонгрид), the lime-square logo. Canon in
  `docs/DESIGN-SYSTEM.md` — do not redesign without the prince.

## 3. Add a guide or article (content) → `docs/CONTENT.md`

Two content types (frontmatter `type`): **гайд** (technical, step-by-step, code/prompts — the
default) and **статья** (readable, only headings + text + images, no code/callouts). Both are
`content-guides/<slug>.mdx`. Short version: write the frontmatter + markdown body, add the slug to
`SLUG_CAT` in `scripts/build-guides-data.mjs`, rebuild. The home splits them into «Гайды» / «Статьи»,
and the cover look differs (guides = lime, articles = B&W). Full schema, the guide↔article table, and
body conventions in `docs/CONTENT.md` (prompts: `docs/PROMPT-STANDARD.md`). Bodies render as a **serif
longread** with a bold-serif lead-quote; markdown links `[text](url)` are clickable; every piece needs
**1-2 in-text cross-links** + gets an auto «Читайте дальше» block, and read-through (scroll/дочитывания)
is instrumented — see `docs/CONTENT.md` «Рециркуляция» + `docs/CONTENT-PIPELINE.md`.

## 4. Make a banner → `docs/BANNERS.md`

Every guide gets a neo-noir + lime cover (scene + tool logo + title). Drop `site/covers/<slug>.png`
and it auto-wires (versioned `?v=` cache-bust). Full recipe + the portable composer
(`tools/covers/compose-cover.mjs`) in `docs/BANNERS.md`.

## 5. Build & deploy → `docs/DEPLOY.md` (read it — it has the canonical commands)

Build, then **PR → merge to `main` (squash), never push `main` directly**, then ship the static `build/`:

```bash
node scripts/prerender.mjs                     # → build/
# (PR + squash-merge to main)
rsync -az --delete -e "ssh -o ConnectTimeout=15" \
  build/ root@100.116.42.100:/var/www/blog-edgelab-space/      # Timeweb via Tailscale
ssh root@100.116.42.100 "chown -R www-data:www-data /var/www/blog-edgelab-space"
```
Caddy serves `/var/www/blog-edgelab-space/` behind Cloudflare (proxied DNS). HTML is `no-cache`;
CSS/JS/guide-covers are `?v=`-versioned (auto cache-bust). **Only when you change a fixed-URL asset
(the two hero banners `_home-hero.png`/`_about-hero.png`) purge Cloudflare** for that URL — purge
command + creds + the Caddy vhost details are in `docs/DEPLOY.md`. Build ONLY on the Mac mini.

## 6. Gotchas (these bite)

- **Cache.** HTML is `no-cache`; CSS/JS/guide-covers are content-versioned (`?v=`). After a deploy a
  human may still see stale assets — hard-refresh (Cmd+Shift+R). The two hero banners
  (`_home-hero.png`, `_about-hero.png`) are at fixed URLs → **purge Cloudflare** after changing them.
- **Clean-URL Caddy** strips/append `.html`; any asset extension not in the passthrough allow-list
  (e.g. `.jsx`, `.map`) gets mangled to 404 — keep the allow-list current (see DEPLOY.md).
- **Relative paths break** on device-served/clean-URL pages — assets & links are ABSOLUTE from root.
- **No Cyrillic in AI-generated images** — overlay text via HTML (BANNERS.md).
- **overflow:hidden on `.gp`** would break the sticky header/sidebars — it is `overflow:clip`.

## Doc map

| Doc | What |
|---|---|
| `docs/CONTENT.md` | add/edit a guide — MDX frontmatter + body conventions |
| `docs/BANNERS.md` | generate a cover banner (scene + logo + title, 16:9) |
| `docs/DEPLOY.md` | build + ship (rsync, Caddy, Cloudflare, cache) |
| `docs/DESIGN-SYSTEM.md` | tokens, logo canon, components |
| `docs/PROMPT-STANDARD.md` | how `:::prompt` blocks must be written |
| `docs/ROUTES.md` | URL map + clean-URL/device-serving |
| `docs/AGENT-HANDOFF.md` | original design-handoff notes |
