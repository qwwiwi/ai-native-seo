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

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promises as fs, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import net from "node:net";
import brand from "./brand.mjs";
import { brandInitScript } from "./brand-client.mjs";
import { CATEGORIES, categoryPages, pillarFile } from "./categories.mjs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = join(ROOT, "site");
const BUILD = join(ROOT, "build");

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
  const dataPath = join(SITE, "guides-data.js");
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
      console.warn(`  WARN  prerender: category «${c.id}» declares pillar ${c.pillar} but site/${pillarFile(c.pillar)} is missing — no listing page`);
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

// Static assets that the emitted pages still need at runtime.
const ASSETS = [
  "gf-styles.css",
  "gf-app.jsx",
  "image-slot.js",
  "minisearch.min.js",
  "guides-data.js",
  "scroll-depth.js",
  "images",
  "covers",
  "favicon.ico",
  "icon-32.png",
  "apple-touch-icon.png",
];

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

async function copyAssets() {
  for (const a of ASSETS) {
    await fs.cp(join(SITE, a), join(BUILD, a), { recursive: true });
  }
}

// Wait until React has produced real content inside #root, not just the empty
// mount node. We poll the child count + text length, then add a short settle
// so late effects (image-slot hydration, fonts) finish.
async function waitForReactRender(page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById("root");
      if (!root) return false;
      const hasChildren = root.children.length > 0;
      const hasText = (root.textContent || "").trim().length > 200;
      return hasChildren && hasText;
    },
    { timeout: 30000 },
  );
  // settle for late renders / async effects
  await page.waitForTimeout(1200);
}

// Strip Babel's injected output, then snapshot DOCTYPE + the rendered DOM.
// Shared by the desktop and mobile passes so both emit identical, re-mountable
// HTML. Returns { html, rootTextLen }.
async function snapshotRendered(page) {
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

async function runNode(script, label) {
  await new Promise((resolve, reject) => {
    const p = spawn("node", [join(__dirname, script)], { cwd: ROOT, stdio: "inherit" });
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
  {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync("node", [join(__dirname, "content-lint.mjs")], { stdio: "inherit" });
    } catch {
      console.error("\nprerender: content-lint FAILED — build aborted.");
      process.exit(1);
    }
  }

  await runBuildGuidesData();
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

    // Fresh build dir.
    await fs.rm(BUILD, { recursive: true, force: true });
    await fs.mkdir(BUILD, { recursive: true });
    await copyAssets();
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
      // then writes the persistent <script> for the re-mount. EdgeLab default →
      // same values as the in-app fallback, so the snapshot is unchanged.
      await page.addInitScript(brandInitScript(brand));
      const url = `${base}/${route}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await waitForReactRender(page);

      // Snapshot. Asset refs are relative (gf-styles.css, gf-app.jsx,
      // image-slot.js, images/...) and resolve against build/.
      const { html, rootTextLen } = await snapshotRendered(page);
      const outPath = join(BUILD, route);
      await fs.writeFile(outPath, html, "utf8");

      results.push({ route, bytes: Buffer.byteLength(html), rootTextLen });
      console.log(
        `  prerendered ${route.padEnd(16)} -> build/${route}  ` +
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

      let { html, rootTextLen } = await snapshotRendered(page);
      // /m/ pages are one (guides: two) levels deeper than the site root, so
      // bump bare asset refs by the matching number of ../.
      html = rewriteMobileAssets(html, r.depth);
      // Bake the route so the page re-mounts to the right screen without a hash.
      html = bakeMobileRoute(html, r.hash);
      const outPath = join(BUILD, r.out);
      await fs.writeFile(outPath, html, "utf8");

      results.push({ route: r.out, bytes: Buffer.byteLength(html), rootTextLen });
      console.log(
        `  prerendered mobile #${r.hash.padEnd(28)} -> build/${r.out}  ` +
          `(${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, root text ${rootTextLen} chars)`,
      );
      await page.close();
    }

    // SEO/GEO/agent layer runs last: it post-processes the just-written build/
    // HTML <head>s (desktop + mobile) and emits the sidecar files into build/.
    await runBuildSeo();

    // Category gate: every category page must be a real listing (its own H1 — never
    // a guide's — guide cards, CollectionPage) and no crumb/nav link may 404.
    await runNode("verify-category-pages.mjs", "category-page check");

    // Cache-busting: append ?v=<content-hash> to every CSS/JS asset ref in the
    // emitted HTML. Cloudflare caches *.css with max-age (overriding origin
    // no-cache), so a content change must change the URL or browsers serve the
    // stale file for hours. A per-file content hash means each edit = new URL =
    // instant fresh fetch, while a given version is safely cacheable forever.
    await applyAssetVersion();

    console.log("\nDone. Static output in build/ — deploy as plain files.");
    return results;
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
