// brand-paths.mjs — where a brand's content, assets, work files and output live,
// plus the frozen build hooks (PLAN.md §1 «Hooks frozen in A», §2).
//
//   resolveBrandPaths() → { contentDir, assetsDir, workDir, serveDir, outputDir,
//                           buildDir, … } for the selected brand (scripts/brand.mjs).
//
// Default brand (root brand.config.json): the legacy layout, unchanged —
//   content-guides/ → site/ (generated data + shell) → build/.
// Any other brand <id>: brands/<id>/content-guides/, brands/<id>/assets/,
//   work dir .build/<id>/ (generated guides-data.js + wrappers, the composed
//   serve root .build/<id>/serve/, the staging output .build/<id>/output/), final
//   output build-<id>/ — a SIBLING of build/, never inside it: scripts/deploy.sh
//   rsyncs build/ with --delete to the default brand's live webroot (v2.1 N1).
// A non-default build never writes into site/, content-guides/ or build/, and a
// default build never touches build-<id>/ or .build/.
//
// BRAND_CONTENT_DIR (test fixtures only) replaces the content dir of a non-default
// brand; the build is then marked release:false in its manifest.

import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { existsSync, statSync, realpathSync, readFileSync } from "node:fs";
import brand, { brandIdentity } from "./brand.mjs";
import { DEFAULT_ASSETS, DEFAULT_UI } from "./brand-compat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");

/** true when `child` is `parent` itself or lies inside it. */
export function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Paths of the selected brand. Throws for a legacy profile (no `id`) and for any
 * layout that would let one brand's build reach another brand's files.
 */
export function resolveBrandPaths(identity = brandIdentity, { root = ROOT, env = process.env } = {}) {
  if (!identity || identity.legacyProfile || !identity.id) {
    throw new Error(
      `brand config ${identity && identity.configPath}: no identity field "id" — a config without an id ` +
        "cannot be built (it would inherit the default brand's output). Add \"id\" and put it under brands/<id>/.",
    );
  }
  const siteDir = join(root, "site");
  const defaultOut = join(root, "build");
  if (identity.isDefault) {
    if (env.BRAND_CONTENT_DIR) throw new Error("BRAND_CONTENT_DIR is only allowed for a non-default brand (test fixtures)");
    return {
      brandId: identity.id,
      isDefault: true,
      root,
      siteDir,
      contentDir: join(root, "content-guides"),
      assetsDir: siteDir,
      workDir: siteDir,
      serveDir: siteDir,
      outputDir: defaultOut,
      buildDir: defaultOut,
      slugCategoriesPath: null,
      release: true,
    };
  }
  const id = identity.id;
  const brandDir = join(root, "brands", id);
  const workDir = join(root, ".build", id);
  const outputDir = join(root, `build-${id}`);
  const fixture = env.BRAND_CONTENT_DIR ? resolve(root, env.BRAND_CONTENT_DIR) : null;
  const paths = {
    brandId: id,
    isDefault: false,
    root,
    siteDir,
    brandDir,
    contentDir: fixture || join(brandDir, "content-guides"),
    assetsDir: join(brandDir, "assets"),
    workDir,
    serveDir: join(workDir, "serve"),
    outputDir,
    // Staging output: gates run here; build-<id>/ is replaced only after they pass,
    // so a failed build never destroys the last good output.
    buildDir: join(workDir, "output"),
    slugCategoriesPath: join(brandDir, "slug-categories.json"),
    fixtureSlugCategoriesPath: fixture ? join(fixture, "slug-categories.json") : null,
    release: !fixture,
  };
  // Never inside the default brand's deploy root, its site/ source or another brand.
  for (const k of ["outputDir", "workDir", "buildDir", "serveDir"]) {
    if (isInside(paths[k], defaultOut)) throw new Error(`${k} ${paths[k]} is inside build/ (deployed to the default brand)`);
    if (isInside(paths[k], siteDir)) throw new Error(`${k} ${paths[k]} is inside site/ (tracked shared source)`);
  }
  if (isInside(paths.contentDir, join(root, "content-guides")))
    throw new Error(`contentDir ${paths.contentDir} is the default brand's content`);
  return paths;
}

/** Throws unless `dir` is exactly one of the selected brand's own writable dirs. */
export function assertOwnDir(dir, paths, kinds = ["outputDir", "buildDir", "serveDir"]) {
  const abs = resolve(dir);
  if (!kinds.some((k) => paths[k] && resolve(paths[k]) === abs)) {
    throw new Error(`refusing to modify ${abs}: not this brand's ${kinds.join("/")} (brand ${paths.brandId})`);
  }
  if (abs === resolve(paths.root) || abs === resolve(paths.siteDir)) throw new Error(`refusing to modify ${abs}`);
  return abs;
}

/** Brand UI data for the client (window.__BRAND.ui). B1 supplies brands/<id>/ui.json;
 *  without it a non-default brand has no UI copy (null → the client renders none). */
export function loadBrandUi(paths) {
  if (paths.isDefault) return DEFAULT_UI;
  const p = join(paths.brandDir, "ui.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

/** Favicon / touch icons of the brand: { ico, png32, apple } site paths, or null. */
export function brandIcons(paths, cfg = brand) {
  if (paths.isDefault) return DEFAULT_ASSETS.icons;
  return (cfg.assets && cfg.assets.icons) || null;
}

// ---- frozen hooks (PLAN.md §1) --------------------------------------------------
// Optional modules of later slices. Each hook has a legacy default that keeps the
// current output; a module that exists is used; a module whose feature is enabled
// in the brand config (`features`) but is missing fails the build.
//   P: scripts/build-runtime.mjs — prepareRuntime(context), prepareSnapshot(page,
//      context), finalizePage({html, route, context}), selectPageData(page, context)
//   C: scripts/seo-content.mjs — buildSeoContent(context)
//   C: scripts/image-markup.mjs — renderPicture(image, options)
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const LEGACY_HOOKS = {
  prepareRuntime: async () => ({}),
  prepareSnapshot: async () => {},
  finalizePage: async ({ html }) => html,
  // null = legacy: every page loads the full guides-data.js dataset.
  selectPageData: () => null,
  buildSeoContent: async () => null,
  // Legacy <img> of an in-body figure; `src`/`alt` arrive already HTML-escaped.
  renderPicture: (image) => `<img src="${image.src}" alt="${image.alt}" loading="lazy">`,
};
const HOOK_MODULES = {
  prepareRuntime: ["build-runtime.mjs", "runtime"],
  prepareSnapshot: ["build-runtime.mjs", "runtime"],
  finalizePage: ["build-runtime.mjs", "runtime"],
  selectPageData: ["build-runtime.mjs", "runtime"],
  buildSeoContent: ["seo-content.mjs", "seoContent"],
  renderPicture: ["image-markup.mjs", "picture"],
};

/** Resolve the hook implementations for this brand. */
export async function loadHooks(cfg = brand, { scriptsDir = __dirname, names = Object.keys(LEGACY_HOOKS) } = {}) {
  const features = (cfg && cfg.features) || {};
  const out = {};
  const mods = {};
  for (const name of names) {
    const [file, feature] = HOOK_MODULES[name];
    const p = join(scriptsDir, file);
    if (existsSync(p)) {
      mods[file] = mods[file] || (await import(p));
      if (typeof mods[file][name] === "function") { out[name] = mods[file][name]; continue; }
      if (features[feature]) throw new Error(`hook ${name}: scripts/${file} has no export ${name} but feature "${feature}" is enabled`);
    } else if (features[feature]) {
      throw new Error(`hook ${name}: feature "${feature}" is enabled but scripts/${file} is missing`);
    }
    out[name] = LEGACY_HOOKS[name];
  }
  return out;
}

/** The one validated build context passed to every hook. */
export async function createBuildContext({ names } = {}) {
  const paths = resolveBrandPaths();
  const hooks = await loadHooks(brand, { names });
  return { brand, identity: brandIdentity, paths, hooks };
}

// ---- asset selection for a non-default brand (PLAN.md §2) -------------------------
// A non-default brand ships only the assets its pages reference, from its own
// assets root. A reference outside that root, a missing file or a foreign asset
// (another brand's file referenced by path) fails the build.

/** Site-relative asset refs (/covers/…, /images/…) in a piece of HTML. */
export function assetRefsInHtml(html) {
  const out = new Set();
  const re = /(?:src|href|srcset)="(\/(?!\/)[^"?#\s]+)(?:[?#][^"]*)?"/g;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    if (/^\/(covers|images|assets)\//.test(m[1])) out.add(m[1]);
  }
  return [...out];
}

/**
 * Every asset the brand's pages need: guide covers, in-body images, home hero,
 * UI images, og/logo and icons. Returns [{ url, rel, file }] sorted by url.
 */
export function selectBrandAssets({ guides, cfg = brand, ui = null, paths }) {
  const refs = new Map(); // url → where it came from (for the error message)
  const add = (u, from) => {
    if (u == null || u === "") return;
    const s = String(u);
    if (/^https?:\/\//.test(s)) return; // external URL — not a local asset
    const clean = s.replace(/[?#].*$/, "");
    if (!refs.has(clean)) refs.set(clean, from);
  };
  for (const g of guides || []) {
    add(g.cover, `cover of ${g.slug}`);
    for (const r of assetRefsInHtml(g.bodyHtml)) add(r, `body of ${g.slug}`);
  }
  add(cfg.home && cfg.home.heroImage, "home.heroImage");
  if (cfg.assets) {
    if (cfg.assets.og) add(`/${cfg.assets.og}`, "assets.og");
    if (cfg.assets.logo) add(`/${cfg.assets.logo}`, "assets.logo");
    for (const [k, v] of Object.entries(cfg.assets.icons || {})) add(v, `assets.icons.${k}`);
  }
  if (ui) {
    if (ui.byline && ui.byline.avatar) add(ui.byline.avatar, "ui.byline.avatar");
    if (ui.about && ui.about.heroImage) add(ui.about.heroImage, "ui.about.heroImage");
  }
  const root = existsSync(paths.assetsDir) ? realpathSync(paths.assetsDir) : null;
  const selected = [];
  for (const [url, from] of refs) {
    if (!url.startsWith("/") || url.startsWith("//") || url.split("/").includes("..")) {
      throw new Error(`asset ${url} (${from}): not a clean site-relative path`);
    }
    const rel = decodeURIComponent(url.slice(1));
    const file = join(paths.assetsDir, ...rel.split("/"));
    if (!root || !existsSync(file) || !statSync(file).isFile()) {
      throw new Error(`asset ${url} (${from}): missing from brand assets ${relative(paths.root, paths.assetsDir)}${sep} — foreign or absent asset`);
    }
    if (!isInside(realpathSync(file), root)) throw new Error(`asset ${url} (${from}): resolves outside the brand assets root`);
    selected.push({ url, rel, file });
  }
  return selected.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

// CLI: print the resolved paths (debugging / tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const p = resolveBrandPaths();
    console.log(JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "string" && isAbsolute(v) ? relative(ROOT, v) || "." : v])), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
