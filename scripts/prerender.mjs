// prerender.mjs — bake the 1:1 React prototype (site/) into static, SEO-ready HTML.
//
// The prototype renders client-side: each .html sets window.__GF_VIEW / __GF_CAT,
// loads React 18 UMD + @babel/standalone from the unpkg CDN, then compiles
// gf-app.jsx (type=text/babel) and mounts it into #root via ReactDOM.createRoot.
//
// Crawlers and AI readers see an empty <div id="root"></div> on the raw file.
// This script drives a real Chrome (Playwright), lets React render each route,
// then snapshots document.documentElement.outerHTML — so the emitted
// build/<route>.html carries the real text in its body. The <script> tags that
// load gf-app.jsx are kept, so React re-mounts on load and interactivity
// (Cmd+K, theme toggle, mobile drawer) still works.
//
// Pipeline: serve site/ over local HTTP (file:// can't fetch+compile the babel
// bundle) -> Playwright renders each route -> capture HTML -> write to build/
// -> copy static assets into build/ so the output dir is self-contained.
//
// Build:   node scripts/prerender.mjs      (or: npm run build)
// Output:  build/  (deployable as plain static files)
//
// Brands (scripts/brand-paths.mjs, PLAN.md §2): the default brand builds exactly as
// before — serve site/, write build/. Another brand (BRAND_CONFIG=brands/<id>/
// brand.config.json) composes its own serve root .build/<id>/serve/ (shared shell +
// runtime from site/, its generated data, ONLY the assets its pages reference from
// brands/<id>/assets/), renders into the staging dir .build/<id>/output/, passes the
// manifest + leak gate there and only then replaces build-<id>/. One brand's build
// never deletes or writes another brand's output.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import { promises as fs, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import net from "node:net";
import brand from "./brand.mjs";
import { brandInitScript } from "./brand-client.mjs";
import { CATEGORIES, categoryPages, pillarFile } from "./categories.mjs";
import { createBuildContext, selectBrandAssets, loadBrandUi, assertOwnDir } from "./brand-paths.mjs";
import { DEFAULT_ASSETS, DEFAULT_DEPLOY } from "./brand-compat.mjs";
import { createManifest, manifestErrors, verifyBuildDir, listFiles, MANIFEST_FILE } from "./build-manifest.mjs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// One validated build context (brand, paths, hooks) for the whole build. A config
// without an identity, a missing required key or a missing required hook module
// fails here, before anything is written.
let CONTEXT;
try {
  CONTEXT = await createBuildContext();
} catch (err) {
  console.error(`prerender: ${err.message}`);
  process.exit(1);
}
const PATHS = CONTEXT.paths;
const HOOKS = CONTEXT.hooks;
const SITE = PATHS.serveDir; // the HTTP root the pages render from
const DATA_DIR = PATHS.workDir; // generated guides-data.js + guides/<slug>.html
const BUILD = PATHS.buildDir; // where this run writes (staging dir for a non-default brand)
const relRoot = (p) => relative(ROOT, p).split(sep).join("/");

// Resolve Playwright: prefer a local install, fall back to the global one. The
// global path differs per host (Mac mini: homebrew; Thrall VPS: ~/.local), so we
// also resolve `npm root -g` dynamically — this build runs on BOTH.
let chromium;
const candidates = ["playwright", "/opt/homebrew/lib/node_modules/playwright"];
try {
  // execFileSync (no shell, static args) — npm root -g prints the global modules dir.
  const { execFileSync } = await import("node:child_process");
  const gRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  if (gRoot) candidates.push(`${gRoot}/playwright`);
} catch {
  /* npm not on PATH — keep the static candidates */
}
for (const p of candidates) {
  try {
    ({ chromium } = require(p));
    break;
  } catch {
    /* try next */
  }
}
if (!chromium) {
  console.error(
    "Playwright not found. Install locally (npm i -D playwright) or globally " +
      "(npm i -g playwright). This build uses the GLOBAL install at " +
      "/opt/homebrew/lib/node_modules/playwright.",
  );
  process.exit(1);
}

// Routes to prerender. Each .html in site/ already sets its own __GF_VIEW.
// We just open it; the page itself decides which view to render.
const ROUTES = [
  "index.html", // home
  "library.html", // catalog
  // + one listing page per category (site/<pillar>.html), from categoryRoutes()
  "about.html", // about page
  "guide.html", // standalone guide (variantC → first real guide)
  "mobile.html", // mobile home (#home default)
];

// Read the generated guides-data.js (window.__GF_GUIDES) — the single source of
// truth for slugs, kept in sync with the MDX by build-guides-data.mjs.
async function loadGuides() {
  const dataPath = join(DATA_DIR, "guides-data.js");
  const js = await fs.readFile(dataPath, "utf8");
  const sandbox = { window: {} };
  // guides-data.js is `window.__GF_GUIDES = [...]; ...` — eval in a tiny sandbox.
  // eslint-disable-next-line no-new-func
  new Function("window", js)(sandbox.window);
  return sandbox.window.__GF_GUIDES || [];
}

// Category listing pages: derived from the taxonomy + content (categoryPages: a
// declared pillar with ≥1 guide and its site/<pillar>.html), never a hand list — a
// category whose guides moved away loses its page, a pillar without a site file is
// reported instead of silently 404-ing. Desktop file + mobile hash (= category id).
async function categoryRoutes() {
  const guides = await loadGuides();
  for (const c of CATEGORIES) {
    if (c.pillar && !existsSync(join(SITE, pillarFile(c.pillar))) && guides.some((g) => g.cat === c.id)) {
      console.warn(`  WARN  prerender: category «${c.id}» declares pillar ${c.pillar} but ${relRoot(SITE)}/${pillarFile(c.pillar)} is missing — no listing page`);
    }
  }
  return categoryPages(guides).map((c) => ({ id: c.id, file: c.file }));
}

// Per-guide pages: site/guides/<slug>.html → build/guides/<slug>.html.
async function guideRoutes() {
  const guides = await loadGuides();
  return guides.map((g) => `guides/${g.slug}.html`);
}

// ---------------------------------------------------------------------------
// MOBILE prerender (M5). The site has NO responsive CSS — mobile is a SEPARATE
// shell, site/mobile.html, whose React mount-switch (gf-app.jsx, __GF_VIEW=
// "mobile") picks a screen from the URL HASH: #home / #library / #claude /
// #hermes / #codex / #about, plus #<guide-slug> → the MobileArticle view of any
// real guide (REAL_ARTICLES[v]). We open mobile.html#<route> in Chrome, let the
// mobile screen render, and snapshot it into build/m/, mirroring desktop routes.
//
// DYNAMIC SERVING: these /m/ files are NOT separate public URLs. Caddy serves
// them at the SAME desktop URL by User-Agent. So each m/*.html canonical points
// to its DESKTOP twin (done in build-seo.mjs), and asset refs are rewritten to
// the right depth (m/ is one level deep, m/guides/ is two) so the static pages
// render on their own.
//
// hash → { out: file under build/m/, depth: how many ../ to prepend to assets }.
const MOBILE_ROUTES = [
  { hash: "home", out: "m/index.html", depth: 1 },
  { hash: "library", out: "m/library.html", depth: 1 },
  // + { hash: <category id>, out: m/<pillar>.html } per category listing page
  { hash: "about", out: "m/about.html", depth: 1 },
];

// Per-guide MOBILE pages: mobile.html#<slug> → build/m/guides/<slug>.html. The
// mount-switch already resolves an arbitrary slug via REAL_ARTICLES[hash], so no
// gf-app.jsx change is needed — we just drive each of the 11 slugs.
async function mobileGuideRoutes() {
  const guides = await loadGuides();
  return guides.map((g) => ({
    hash: g.slug,
    out: `m/guides/${g.slug}.html`,
    depth: 2,
  }));
}

// The mobile shell ships bare relative asset refs (gf-styles.css, gf-app.jsx,
// guides-data.js, image-slot.js) because site/mobile.html sits at the site root.
// Under build/m/ the pages are one (or two, for guides) levels deeper, so bump
// each bare asset ref to the right number of ../ — exactly how the desktop
// per-guide pages use ../. CDN (https://) and already-prefixed refs are left
// untouched. The mobile nav's `mobile.html#…` hash links are runtime navigation
// resolved by Caddy device-routing at deploy time, so they stay as-is.
const MOBILE_ASSETS = ["gf-styles.css", "gf-app.jsx", "guides-data.js", "image-slot.js"];
function rewriteMobileAssets(html, depth) {
  const prefix = "../".repeat(depth);
  let out = html;
  for (const asset of MOBILE_ASSETS) {
    // Match (src|href)="<asset>" only when the value is the bare asset (no path
    // prefix), so we never double-prefix or touch CDN URLs.
    const re = new RegExp(`((?:src|href)=")(${asset.replace(/[.]/g, "\\.")})(")`, "g");
    out = out.replace(re, `$1${prefix}$2$3`);
  }
  // Also bump any bare images/<file> ref (mobile image slots are empty today, so
  // none are emitted — this is defensive: the moment a mobile screen ships a
  // raster <img src="images/…"> it must resolve from the deeper /m/ dir too).
  out = out.replace(/((?:src|href)=")(images\/[^"]+)(")/g, `$1${prefix}$2$3`);
  return out;
}

// Bake the route into the prerendered file so it re-mounts to the right screen.
// Under dynamic serving the live URL is the DESKTOP url (e.g. /library/) with no
// #hash, so the mobile mount-switch can't read the route from window.location.
// We set window.__GF_ROUTE just before the gf-app.jsx script; the switch reads
// `hash || __GF_ROUTE || __GF_CAT || "home"`, so interactive mobile.html (no
// __GF_ROUTE) is unaffected while these static pages self-route. `route` is the
// reserved name (home/library/claude/hermes/codex/about) or a guide slug.
function bakeMobileRoute(html, route) {
  const tag = `<script>window.__GF_ROUTE = ${JSON.stringify(route)};</script>\n  `;
  // Insert right before the text/babel gf-app.jsx script (asset refs already
  // rewritten, so match the depth-prefixed src too).
  const m = html.match(/(\s*)<script type="text\/babel" src="[^"]*gf-app\.jsx[^"]*"><\/script>/);
  if (!m) return html; // shape changed — leave as-is rather than corrupt output
  return html.replace(m[0], `\n  ${tag}${m[0].trimStart()}`);
}

// Static assets that the emitted pages still need at runtime: the shared, brand-
// neutral runtime (+ the brand's generated guides-data.js), then the brand's own
// assets — the default brand's legacy recursive set (brand-compat DEFAULT_ASSETS),
// another brand's referenced files only (selectBrandAssets).
const RUNTIME_ASSETS = [
  "gf-styles.css",
  "gf-app.jsx",
  "image-slot.js",
  "minisearch.min.js",
  "scroll-depth.js",
];
// Shell pages of the client (each sets its own __GF_VIEW); a non-default brand gets
// them retitled into its serve root, plus one generated page per pillar.
const SHELL_PAGES = ["index.html", "library.html", "about.html", "guide.html", "mobile.html"];
const PILLAR_TEMPLATE = "claude-code.html"; // a category shell: __GF_VIEW="category" + __GF_CAT

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  // Serve site/ over HTTP so gf-app.jsx can be fetched + compiled by Babel.
  const proc = spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: SITE, stdio: "ignore" },
  );
  return proc;
}

async function waitForServer(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.once("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Local server on :${port} did not come up in time`);
}

async function copyAssets(selected) {
  const list = PATHS.isDefault
    ? [...RUNTIME_ASSETS, "guides-data.js", ...DEFAULT_ASSETS.recursive]
    : [...RUNTIME_ASSETS, "guides-data.js", ...selected.map((s) => s.rel)];
  for (const a of list) {
    await fs.cp(join(SITE, a), join(BUILD, a), { recursive: true });
  }
}

const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The serve root of a non-default brand: shared shell + runtime from site/ (titles
// replaced by the brand's own), generated pillar pages, the brand's guides-data.js
// + guide wrappers from its work dir and ONLY its referenced assets. The default
// brand keeps serving site/ directly.
async function composeServeDir(selected) {
  const dir = assertOwnDir(SITE, PATHS, ["serveDir"]);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  for (const a of RUNTIME_ASSETS) await fs.cp(join(PATHS.siteDir, a), join(dir, a));
  const retitle = (html, title, file) => {
    if (!/<title>[\s\S]*?<\/title>/.test(html)) throw new Error(`shell ${file}: no <title> to replace`);
    return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`);
  };
  for (const f of SHELL_PAGES) {
    const html = await fs.readFile(join(PATHS.siteDir, f), "utf8");
    await fs.writeFile(join(dir, f), retitle(html, brand.brandName, f), "utf8");
  }
  const tpl = await fs.readFile(join(PATHS.siteDir, PILLAR_TEMPLATE), "utf8");
  const catRe = /window\.__GF_CAT = "[^"]*";/;
  if (!catRe.test(tpl)) throw new Error(`shell ${PILLAR_TEMPLATE}: no window.__GF_CAT to replace`);
  for (const c of CATEGORIES.filter((x) => x.pillar)) {
    const html = retitle(tpl, `${c.name} — ${brand.brandName}`, PILLAR_TEMPLATE)
      .replace(catRe, `window.__GF_CAT = ${JSON.stringify(c.id)};`);
    await fs.writeFile(join(dir, pillarFile(c.pillar)), html, "utf8");
  }
  await fs.cp(join(DATA_DIR, "guides-data.js"), join(dir, "guides-data.js"));
  await fs.cp(join(DATA_DIR, "guides"), join(dir, "guides"), { recursive: true });
  for (const s of selected) {
    await fs.mkdir(dirname(join(dir, s.rel)), { recursive: true });
    await fs.cp(s.file, join(dir, s.rel));
  }
  console.log(`Serve root ${relRoot(dir)}: shared shell + ${selected.length} brand asset(s) from ${relRoot(PATHS.assetsDir)}`);
}

// build-manifest.json of this run (scripts/build-manifest.mjs), validated before it
// is written. Assets: the default brand's legacy recursive set, another brand's
// selected files.
async function writeManifest(catRoutes, selected) {
  const guides = await loadGuides();
  const assetUrls = PATHS.isDefault
    ? (await listFiles(BUILD))
      .filter((f) => DEFAULT_ASSETS.recursive.some((a) => f === a || f.startsWith(`${a}/`)))
      .map((f) => `/${f}`)
    : selected.map((s) => s.url);
  const manifest = await createManifest({
    brand,
    identity: CONTEXT.identity,
    paths: PATHS,
    dir: BUILD,
    routes: manifestRoutes(catRoutes, guides),
    assetUrls,
    deployment: PATHS.isDefault ? DEFAULT_DEPLOY : brand.deploy,
  });
  const errs = manifestErrors(manifest, { outputDir: PATHS.outputDir });
  if (errs.length) throw new Error(`build manifest invalid: ${errs.join("; ")}`);
  await fs.writeFile(join(BUILD, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Build manifest: ${MANIFEST_FILE} (brand ${manifest.brandId}, ${manifest.routes.length} routes, ${manifest.assets.length} assets, ${manifest.files.length} files)`);
}

// Public routes of the build (desktop file + its /m/ twin share one URL).
function manifestRoutes(catRoutes, guides) {
  const desktop = [
    { file: "index.html", url: "/" },
    { file: "library.html", url: "/library/" },
    { file: "about.html", url: "/about/" },
    ...catRoutes.map((c) => ({ file: c.file, url: CATEGORIES.find((x) => x.id === c.id).pillar })),
    ...guides.map((g) => ({ file: `guides/${g.slug}.html`, url: `/guides/${g.slug}/` })),
  ];
  return desktop.flatMap((r) => [
    { url: r.url, file: r.file, mobile: false },
    { url: r.url, file: `m/${r.file}`, mobile: true },
  ]).filter((r) => existsSync(join(BUILD, r.file)));
}

// Wait until React has produced real content inside #root, not just the empty
// mount node. We poll the child count + text length, then add a short settle
// so late effects (image-slot hydration, fonts) finish. The text threshold is 200
// chars for the default brand (unchanged); a new brand's sparse pages (an about
// page without brand copy yet) render less, so it waits for 40.
const MIN_ROOT_TEXT = PATHS.isDefault ? 200 : 40;
async function waitForReactRender(page) {
  await page.waitForFunction(
    (minText) => {
      const root = document.getElementById("root");
      if (!root) return false;
      const hasChildren = root.children.length > 0;
      const hasText = (root.textContent || "").trim().length > minText;
      return hasChildren && hasText;
    },
    MIN_ROOT_TEXT,
    { timeout: 30000 },
  );
  // settle for late renders / async effects
  await page.waitForTimeout(1200);
}

// Strip Babel's injected output, then snapshot DOCTYPE + the rendered DOM.
// Shared by the desktop and mobile passes so both emit identical, re-mountable
// HTML. Returns { html, rootTextLen }.
async function snapshotRendered(page, route) {
  // Frozen hook (PLAN.md §1): P's prepareSnapshot runs on the live page BEFORE the
  // Babel output is removed and the DOM is serialized (legacy: no-op).
  await HOOKS.prepareSnapshot({ page, route }, CONTEXT);
  // Before snapshotting, remove the compiled JS that @babel/standalone INJECTS
  // into the DOM when it transpiles the type="text/babel" gf-app.jsx script.
  // Playwright would otherwise capture that injected inline <script> and, on
  // reload, it runs at the TOP of <body> — before React UMD loads — throwing
  // "React is not defined". We keep only the original tags (React/ReactDOM/Babel
  // CDN + the text/babel gf-app.jsx + window.__GF_* config), so on reload Babel
  // re-compiles cleanly in the correct order, exactly like the untouched
  // prototype.
  await page.evaluate(() => {
    for (const s of Array.from(document.querySelectorAll("script"))) {
      if (s.src) continue; // keep external (CDN, image-slot.js)
      if (s.type === "text/babel") continue; // keep the source script
      const t = s.textContent || "";
      // The original inline config scripts are tiny (window.__GF_VIEW/_CAT).
      // Babel's injected output is large and carries its helper signatures.
      const isBabelOutput =
        t.includes("_slicedToArray") ||
        t.includes("_arrayWithHoles") ||
        t.includes("_createClass") ||
        t.includes("React.createElement") ||
        t.length > 4000;
      if (isBabelOutput) s.remove();
    }
  });

  // Snapshot the fully rendered DOM (DOCTYPE + html). The script tags that load
  // React/Babel/gf-app.jsx are preserved, so the page re-mounts on load and
  // stays interactive.
  const html =
    "<!DOCTYPE html>\n" +
    (await page.evaluate(() => document.documentElement.outerHTML));
  const rootTextLen = await page.evaluate(
    () => (document.getElementById("root")?.textContent || "").trim().length,
  );
  return { html, rootTextLen };
}

async function runBuildGuidesData() {
  // Regenerate site/guides-data.js + site/guides/<slug>.html from the MDX source
  // so the prerender always reflects the current content.
  await new Promise((resolve, reject) => {
    const p = spawn("node", [join(__dirname, "build-guides-data.mjs")], {
      cwd: ROOT,
      stdio: "inherit",
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-guides-data exited ${code}`))));
  });
}

async function runNode(script, label, env = {}) {
  await new Promise((resolve, reject) => {
    const p = spawn("node", [join(__dirname, script)], { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} (${script}) FAILED — exit ${code}`))));
  });
}

async function runBuildSeo() {
  // After all HTML is snapshotted into build/, add the SEO / GEO / agent layer:
  // <head> JSON-LD + meta/canonical injection (design-safe, body untouched),
  // plus sidecar files (robots/sitemap/llms/.well-known) and markdown twins.
  await new Promise((resolve, reject) => {
    const p = spawn("node", [join(__dirname, "build-seo.mjs")], {
      cwd: ROOT,
      stdio: "inherit",
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-seo exited ${code}`))));
  });
}

// Append ?v=<content-hash> to each CSS/JS asset ref across all emitted HTML.
// Hash is per-file (sha256, first 10 hex of the build/ copy), so editing one
// asset only re-versions that asset. Refs are absolute (e.g. `="/gf-app.jsx"`),
// so a single anchored replace per asset covers desktop, mobile and guide pages.
const VERSIONED_ASSETS = [
  "gf-styles.css",
  "gf-app.jsx",
  "guides-data.js",
  "minisearch.min.js",
  "image-slot.js",
  "scroll-depth.js",
];
async function applyAssetVersion() {
  // Compute a content hash for each asset that exists in build/.
  const ver = {};
  for (const a of VERSIONED_ASSETS) {
    try {
      const buf = await fs.readFile(join(BUILD, a));
      ver[a] = createHash("sha256").update(buf).digest("hex").slice(0, 10);
    } catch {
      /* asset not present (e.g. image-slot.js missing) — skip */
    }
  }
  // Walk build/ for *.html and rewrite each `(src|href)="/<asset>"` ref.
  async function walk(dir) {
    const out = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (e.name.endsWith(".html")) out.push(p);
    }
    return out;
  }
  const files = await walk(BUILD);
  let edited = 0;
  for (const f of files) {
    let html = await fs.readFile(f, "utf8");
    let changed = false;
    for (const a of Object.keys(ver)) {
      // Match the bare absolute ref only (not an already-versioned one).
      const re = new RegExp(`((?:src|href)="/${a.replace(/[.]/g, "\\.")})(")`, "g");
      const next = html.replace(re, `$1?v=${ver[a]}$2`);
      if (next !== html) { html = next; changed = true; }
    }
    if (changed) { await fs.writeFile(f, html, "utf8"); edited++; }
  }
  console.log(
    `Asset versioning: ${Object.keys(ver).length} assets hashed, ${edited} HTML files stamped` +
      ` (${Object.entries(ver).map(([a, h]) => `${a}=${h}`).join(", ")}).`,
  );
}

async function main() {
  // Pre-build content gate (CONTENT-PIPELINE.md M5): content-lint must pass before
  // we render. A FAIL (missing description / article-with-code / broken internal
  // link / new guide with no cross-link) aborts the build. Runs here too — not only
  // via `npm run build` — so a direct `node scripts/prerender.mjs` is also gated.
  if (PATHS.isDefault) {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync("node", [join(__dirname, "content-lint.mjs")], { stdio: "inherit" });
    } catch {
      console.error("\nprerender: content-lint FAILED — build aborted.");
      process.exit(1);
    }
  } else {
    // content-lint.mjs reads the default brand's SLUG_CAT / git paths; making it
    // brand-aware is slice C's (it owns content-lint). Never silently: say so.
    console.warn(`  WARN  prerender: content-lint skipped for brand «${PATHS.brandId}» — content-lint.mjs is not brand-aware yet`);
  }

  await runBuildGuidesData();

  // A non-default brand: select its referenced assets (a foreign, missing or
  // out-of-root asset fails HERE — before any output is touched), then compose its
  // serve root.
  let selected = [];
  if (!PATHS.isDefault) {
    selected = selectBrandAssets({ guides: await loadGuides(), cfg: brand, ui: loadBrandUi(PATHS), paths: PATHS });
    await composeServeDir(selected);
  }
  // Frozen hook (PLAN.md §1): P's prepareRuntime(context) — compiled assets, page
  // scripts, font/analytics tags. Legacy: {} (the pages keep their current runtime).
  CONTEXT.runtime = await HOOKS.prepareRuntime(CONTEXT);

  const port = await getFreePort();
  const server = startServer(port);
  const base = `http://127.0.0.1:${port}`;

  let browser;
  const cleanup = async () => {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  };
  process.on("exit", () => server.kill("SIGTERM"));

  try {
    await waitForServer(port);

    // Prefer the system Google Chrome (Mac mini), but fall back to Playwright's
    // bundled Chromium so the build also runs on Thrall VPS (no system Chrome).
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      console.warn("  prerender: system Chrome not found — using bundled Chromium");
      browser = await chromium.launch({ headless: true });
    }

    // Fresh build dir — this brand's own dir only (build/ for the default brand, the
    // staging dir .build/<id>/output/ for another); never another brand's output.
    assertOwnDir(BUILD, PATHS, ["buildDir"]);
    await fs.rm(BUILD, { recursive: true, force: true });
    await fs.mkdir(BUILD, { recursive: true });
    await copyAssets(selected);
    await fs.mkdir(join(BUILD, "guides"), { recursive: true });

    const catRoutes = await categoryRoutes();
    const allRoutes = [...ROUTES, ...catRoutes.map((c) => c.file), ...(await guideRoutes())];

    const results = [];
    // ---- desktop pass (1440px viewport, asset refs untouched) ----
    for (const route of allRoutes) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1200 },
      });
      // White-label (M1): seed window.__BRAND from brand.config.json BEFORE the
      // React app mounts, so the snapshot renders with the right brand. build-seo
      // then writes the persistent <script> for the re-mount (the default brand's
      // payload carries its UI copy, so its snapshot is unchanged).
      await page.addInitScript(brandInitScript(brand));
      const url = `${base}/${route}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await waitForReactRender(page);

      // Snapshot. Asset refs are relative (gf-styles.css, gf-app.jsx,
      // image-slot.js, images/...) and resolve against build/.
      const pageRoute = { file: route, mobile: false };
      const snap = await snapshotRendered(page, pageRoute);
      const { rootTextLen } = snap;
      // Frozen hooks (PLAN.md §1): per-page data selection + P's page finalizer.
      // Legacy: null data (every page loads the full guides-data.js), html as is.
      const pageData = HOOKS.selectPageData(pageRoute, CONTEXT);
      const html = await HOOKS.finalizePage({ html: snap.html, route: pageRoute, context: CONTEXT, pageData });
      const outPath = join(BUILD, route);
      await fs.writeFile(outPath, html, "utf8");

      results.push({ route, bytes: Buffer.byteLength(html), rootTextLen });
      console.log(
        `  prerendered ${route.padEnd(16)} -> ${relRoot(BUILD)}/${route}  ` +
          `(${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, root text ${rootTextLen} chars)`,
      );
      await page.close();
    }

    // ---- mobile pass (390px phone viewport, asset refs bumped for /m/ depth) ----
    // Same mobile.html shell, different URL hash → different mobile screen.
    await fs.mkdir(join(BUILD, "m"), { recursive: true });
    await fs.mkdir(join(BUILD, "m", "guides"), { recursive: true });
    const mobileRoutes = [
      ...MOBILE_ROUTES,
      ...catRoutes.map((c) => ({ hash: c.id, out: `m/${c.file}`, depth: 1 })),
      ...(await mobileGuideRoutes()),
    ];
    for (const r of mobileRoutes) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      // Seed window.__BRAND before the mobile screen mounts (see desktop pass).
      await page.addInitScript(brandInitScript(brand));
      const url = `${base}/mobile.html#${r.hash}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await waitForReactRender(page);

      const pageRoute = { file: r.out, mobile: true, hash: r.hash };
      let { html, rootTextLen } = await snapshotRendered(page, pageRoute);
      // /m/ pages are one (guides: two) levels deeper than the site root, so
      // bump bare asset refs by the matching number of ../.
      html = rewriteMobileAssets(html, r.depth);
      // Bake the route so the page re-mounts to the right screen without a hash.
      html = bakeMobileRoute(html, r.hash);
      const pageData = HOOKS.selectPageData(pageRoute, CONTEXT);
      html = await HOOKS.finalizePage({ html, route: pageRoute, context: CONTEXT, pageData });
      const outPath = join(BUILD, r.out);
      await fs.writeFile(outPath, html, "utf8");

      results.push({ route: r.out, bytes: Buffer.byteLength(html), rootTextLen });
      console.log(
        `  prerendered mobile #${r.hash.padEnd(28)} -> ${relRoot(BUILD)}/${r.out}  ` +
          `(${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, root text ${rootTextLen} chars)`,
      );
      await page.close();
    }

    // SEO/GEO/agent layer runs last: it post-processes the just-written build/
    // HTML <head>s (desktop + mobile) and emits the sidecar files into build/.
    await runBuildSeo();

    // Category gate: every category page must be a real listing (its own H1 — never
    // a guide's — guide cards, CollectionPage) and no crumb/nav link may 404.
    await runNode("verify-category-pages.mjs", "category-page check", { VERIFY_BUILD_DIR: BUILD });

    // Cache-busting: append ?v=<content-hash> to every CSS/JS asset ref in the
    // emitted HTML. Cloudflare caches *.css with max-age (overriding origin
    // no-cache), so a content change must change the URL or browsers serve the
    // stale file for hours. A per-file content hash means each edit = new URL =
    // instant fresh fetch, while a given version is safely cacheable forever.
    await applyAssetVersion();

    // Build manifest (PLAN.md §2 / M4): brand identity, routes, selected assets and
    // every emitted file — the contract deploy/IndexNow/GSC validate before acting.
    await writeManifest(catRoutes, selected);

    if (PATHS.isDefault) {
      console.log("\nDone. Static output in build/ — deploy as plain files.");
      return results;
    }
    // Non-default brand: manifest + leak gate on the staging dir, then — and only
    // then — replace build-<id>/ (a failed gate leaves the previous output intact).
    const errs = await verifyBuildDir(BUILD, { asOutputDir: PATHS.outputDir });
    if (errs.length) {
      console.error(`\nprerender: brand «${PATHS.brandId}» output FAILED the manifest/leak gate:`);
      for (const e of errs.slice(0, 40)) console.error(`  - ${e}`);
      throw new Error(`brand gate failed (${errs.length} problem(s)); ${relRoot(PATHS.outputDir)}/ left untouched`);
    }
    const out = assertOwnDir(PATHS.outputDir, PATHS, ["outputDir"]);
    await fs.rm(out, { recursive: true, force: true });
    await fs.rename(BUILD, out);
    const final = await verifyBuildDir(out);
    if (final.length) throw new Error(`brand gate failed after publish to ${relRoot(out)}: ${final[0]}`);
    console.log(`\nDone. Static output in ${relRoot(out)}/ (brand «${PATHS.brandId}», release=${PATHS.release}) — manifest + leak gate passed.`);
    return results;
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
