// brand.mjs — single source of brand/identity config for the SEO/build layer.
//
// Loads brand.config.json from the repo root. The path can be overridden with
// the BRAND_CONFIG env var (absolute, or relative to the repo root) — this is how
// the same generator builds another brand without a code change:
//   BRAND_CONFIG=brands/<id>/brand.config.json npm run build
//
// The root brand.config.json is the DEFAULT brand (id "edgelab", brand-compat.mjs).
// Every other brand is fail-closed (PLAN.md §2):
//   - a config under brands/ must carry an `id` equal to its directory name (or
//     file name for brands/<id>.json) — a foreign config without an identity can
//     never fall back to the default brand's paths or output;
//   - a config with an `id` must declare EVERY key of STRICT_SCHEMA: a missing key
//     is a build error, a disabled feature is an explicit null (no fallbacks);
//   - its values may not carry the default brand's identity (counter ids, hosts,
//     legal text, avatar) — brand-compat.mjs LEAK_PATTERNS.
// A config outside brands/ WITHOUT an `id` is a legacy white-label profile: the
// SEO tooling may read it, but brand-paths.mjs refuses to build it.
// Zero dependencies — plain fs + JSON.parse.

import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute, relative, resolve, sep, basename } from "node:path";
import { readFileSync } from "node:fs";
import { DEFAULT_BRAND_ID, findLeak } from "./brand-compat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
export const DEFAULT_CONFIG_PATH = join(ROOT, "brand.config.json");

// ---- build-time validation gate (white-label M1, dual-review fix-loop 1) ----
// A white-label engine ingests THIRD-PARTY configs. Every value below ends up
// inside emitted <style>, <script>, href attributes or React hrefs — so a
// malformed/malicious config must fail the BUILD with a clear error, never
// reach the generated HTML. This is the single gate for ALL consumers
// (build-seo, brand-client, prerender, tools/covers).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// Google-Fonts family names: letters/digits/spaces/hyphens (no quotes/braces —
// the value is interpolated into a quoted CSS font-family and a :root block).
const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;
const HTTPS_URL = /^https:\/\/[^"'<>\\ ]+$/;
const BRAND_ID = /^[a-z][a-z0-9-]*$/;
// A site-relative asset path inside the brand's asset root: no scheme, no `..`.
const SITE_PATH = /^\/(?!\/)[A-Za-z0-9/_.-]*$/;
const REL_ASSET = /^[A-Za-z0-9_][A-Za-z0-9/_.-]*$/;
const hasDotDot = (p) => String(p).split("/").includes("..");

let currentPath = "";
function fail(key, value, want) {
  throw new Error(
    `brand config ${currentPath}: "${key}" ${want}, got ${JSON.stringify(value)}`,
  );
}

// Format checks for every brand. null = an explicitly disabled value: it is
// skipped like an absent one here; STRICT_SCHEMA decides whether absence is allowed.
function validateBrand(b) {
  if (typeof b.brandName !== "string" || !b.brandName.trim())
    fail("brandName", b.brandName, "must be a non-empty string");
  for (const [k, v] of Object.entries(b.palette || {}))
    if (!HEX_COLOR.test(String(v))) fail(`palette.${k}`, v, "must be a hex color like #D4FF00");
  for (const k of ["display", "body", "mono", "serif"]) {
    const v = (b.fonts || {})[k];
    if (v != null && !FONT_NAME.test(String(v)))
      fail(`fonts.${k}`, v, "must be a plain font-family name (letters/digits/spaces/hyphens)");
  }
  const gh = (b.fonts || {}).googleHref;
  if (gh != null && (!/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(gh) || /["<>\\]/.test(gh)))
    fail("fonts.googleHref", gh, "must be an https://fonts.googleapis.com/css2? URL without quotes/angle brackets");
  // Outbound URLs rendered as hrefs by the client. React 18 does NOT block
  // javascript: URLs (blocking landed in React 19) — enforce https here once.
  const urlKeys = [
    ["domain.site", b.domain && b.domain.site],
    ["domain.apex", b.domain && b.domain.apex],
    ["author.url", b.author && b.author.url],
    ["telegram.url", b.telegram && b.telegram.url],
    ["telegram.channelUrl", b.telegram && b.telegram.channelUrl],
    ["funnel.targetUrl", b.funnel && b.funnel.targetUrl],
    ["funnel.docs.privacy", b.funnel && b.funnel.docs && b.funnel.docs.privacy],
    ["funnel.docs.offer", b.funnel && b.funnel.docs && b.funnel.docs.offer],
    ["mcpIdentity.serverUrl", b.mcpIdentity && b.mcpIdentity.serverUrl],
    ["mcpIdentity.apiUrl", b.mcpIdentity && b.mcpIdentity.apiUrl],
    ["mcpIdentity.docsUrl", b.mcpIdentity && b.mcpIdentity.docsUrl],
  ];
  for (const [k, v] of urlKeys)
    if (v != null && !HTTPS_URL.test(String(v))) fail(k, v, "must be a clean https:// URL");
  const home = b.home || {};
  if (home.ctaHref != null && !/^(https:\/\/[^"'<>\\ ]+|\/(?!\/)[^"'<>\\ ]*)$/.test(String(home.ctaHref)))
    fail("home.ctaHref", home.ctaHref, "must be https:// or a site-relative /path");
  if (home.heroImage != null && (!SITE_PATH.test(String(home.heroImage)) || hasDotDot(home.heroImage)))
    fail("home.heroImage", home.heroImage, "must be a site-relative /path");
  const assets = b.assets || {};
  for (const k of ["og", "logo"])
    if (assets[k] != null && (!REL_ASSET.test(String(assets[k])) || hasDotDot(assets[k])))
      fail(`assets.${k}`, assets[k], "must be a relative asset path (no scheme, no ..)");
  const a = b.analytics || {};
  if (a.ga4 != null && !/^G-[A-Z0-9]+$/.test(String(a.ga4)))
    fail("analytics.ga4", a.ga4, "must look like G-XXXXXXXXXX");
  if (a.metrika != null && !/^\d+$/.test(String(a.metrika)))
    fail("analytics.metrika", a.metrika, "must be a numeric counter id");
  if (a.indexNowKey != null && !/^[A-Za-z0-9-]{8,64}$/.test(String(a.indexNowKey)))
    fail("analytics.indexNowKey", a.indexNowKey, "must be 8-64 alphanumeric chars");
  // Google Search Console property the deploy submits the sitemap to: a domain
  // property (sc-domain:example.com) or a URL-prefix property (https://…/).
  if (a.gscProperty != null && !/^(sc-domain:[a-z0-9.-]+|https:\/\/[^"'<>\\ ]+\/)$/.test(String(a.gscProperty)))
    fail("analytics.gscProperty", a.gscProperty, "must be sc-domain:<domain> or an https://…/ URL-prefix property");
  // Path to the service-account key FILE (never the key itself; never committed).
  if (a.gscKeyPath !== undefined && (typeof a.gscKeyPath !== "string" || !a.gscKeyPath.trim()))
    fail("analytics.gscKeyPath", a.gscKeyPath, "must be a non-empty file path");
  // UTM of the funnel links (baked into the HTML + the click-time forwarder).
  const utm = (b.funnel && b.funnel.utm) || {};
  for (const k of ["source", "medium", "campaign", "contentPrefix"]) {
    if (utm[k] != null && !/^[A-Za-z0-9_.-]*$/.test(String(utm[k])))
      fail(`funnel.utm.${k}`, utm[k], "must be letters/digits/_ . - only");
  }
  // Taxonomy (scripts/categories.mjs): ids are URL/class-safe, pillars site-relative.
  if (b.categories !== undefined) {
    if (!Array.isArray(b.categories)) fail("categories", b.categories, "must be an array of {id, name, pillar?}");
    const ids = new Set();
    b.categories.forEach((c, i) => {
      const k = `categories[${i}]`;
      if (!c || !/^[a-z][a-z0-9-]*$/.test(String(c.id))) fail(`${k}.id`, c && c.id, "must be a lowercase id (a-z, 0-9, -)");
      if (ids.has(c.id)) fail(`${k}.id`, c.id, "must be unique");
      // ids double as client route names (gf-app PAGES / mobile hash) — a reserved
      // one would hijack the home/catalog/about routes.
      if (["home", "library", "articles", "about", "guide", "mobile"].includes(c.id))
        fail(`${k}.id`, c.id, "must not be a reserved route name (home, library, articles, about, guide, mobile)");
      ids.add(c.id);
      if (typeof c.name !== "string" || !c.name.trim() || /[<>]/.test(c.name))
        fail(`${k}.name`, c.name, "must be a non-empty string without < >");
      if (c.pillar !== undefined && !/^\/[a-z0-9][a-z0-9-]*\/$/.test(String(c.pillar)))
        fail(`${k}.pillar`, c.pillar, "must be a site-relative /slug/ path");
      if (c.description !== undefined && (typeof c.description !== "string" || !c.description.trim() || /[<>]/.test(c.description)))
        fail(`${k}.description`, c.description, "must be a non-empty string without < >");
    });
  }
  const content = b.content || {};
  if (content.titleStopWords !== undefined &&
      (!Array.isArray(content.titleStopWords) || content.titleStopWords.some((w) => typeof w !== "string")))
    fail("content.titleStopWords", content.titleStopWords, "must be an array of strings");
  if (content.hubPages !== undefined &&
      (!Array.isArray(content.hubPages) || content.hubPages.some((p) => !/^\/[a-z0-9/-]*\/$/.test(String(p)))))
    fail("content.hubPages", content.hubPages, "must be an array of site-relative /path/ strings");
  const deploy = b.deploy || {};
  if (deploy.host != null && !/^[A-Za-z0-9.-]+$/.test(String(deploy.host)))
    fail("deploy.host", deploy.host, "must be a plain host name or IP (no user@, no port)");
  if (deploy.webroot != null && (!/^\/[A-Za-z0-9/_.-]+$/.test(String(deploy.webroot)) || hasDotDot(deploy.webroot)))
    fail("deploy.webroot", deploy.webroot, "must be an absolute path without ..");
  return b;
}

// ---- strict schema of a non-default brand (fail-closed, no fallbacks) -----------
// kind: "str" non-empty string · "str?" string or null · "obj" object · "obj?"
// object or null · "arr" non-empty array · "arr0" array · "bool" boolean.
// Nested keys of an "obj?" section are checked only when the section is an object.
const STRICT_SCHEMA = [
  ["id", "str"], ["brandName", "str"],
  ["domain", "obj"], ["domain.site", "str"], ["domain.apex", "str"],
  ["author", "obj?"], ["author.name", "str?"], ["author.url", "str?"], ["author.legal", "str?"], ["author.legalEntity", "str?"],
  ["telegram", "obj?"], ["telegram.url", "str?"], ["telegram.name", "str?"], ["telegram.channelUrl", "str?"], ["telegram.channelName", "str?"],
  ["palette", "obj"], ["palette.ink", "str"], ["palette.accent", "str"], ["palette.offwhite", "str"], ["palette.bgLight", "str"], ["palette.bgDark", "str"],
  ["fonts", "obj"], ["fonts.display", "str"], ["fonts.body", "str"], ["fonts.mono", "str"], ["fonts.serif", "str"], ["fonts.googleHref", "str?"],
  ["funnel", "obj"], ["funnel.mode", "str"], ["funnel.ctaText", "str?"], ["funnel.targetUrl", "str?"], ["funnel.offerText", "str?"],
  ["funnel.docs", "obj?"], ["funnel.docs.privacy", "str?"], ["funnel.docs.offer", "str?"],
  ["funnel.utm", "obj?"], ["funnel.utm.source", "str?"], ["funnel.utm.medium", "str?"], ["funnel.utm.campaign", "str?"], ["funnel.utm.contentPrefix", "str?"],
  ["mcpIdentity", "obj?"],
  ["analytics", "obj"], ["analytics.ga4", "str?"], ["analytics.metrika", "str?"], ["analytics.indexNowKey", "str?"], ["analytics.gscProperty", "str?"],
  ["assets", "obj"], ["assets.og", "str?"], ["assets.logo", "str?"], ["assets.icons", "obj?"],
  ["home", "obj"], ["home.eyebrow", "str"], ["home.title", "str"], ["home.description", "str"], ["home.metaDescription", "str"],
  ["home.ctaText", "str?"], ["home.ctaHref", "str?"], ["home.heroImage", "str?"],
  ["seo", "obj"], ["seo.libraryDescription", "str"], ["seo.aboutDescription", "str"], ["seo.llmsTitle", "str"], ["seo.llmsIntro", "str"],
  ["categories", "arr"],
  ["content", "obj"], ["content.titleStopWords", "arr0"], ["content.hubPages", "arr0"],
  ["deploy", "obj"], ["deploy.host", "str?"], ["deploy.webroot", "str?"],
  ["features", "obj"], ["features.runtime", "bool"], ["features.seoContent", "bool"], ["features.picture", "bool"],
];

const kindOk = {
  str: (v) => typeof v === "string" && v.trim() !== "",
  "str?": (v) => v === null || (typeof v === "string" && v.trim() !== ""),
  obj: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  "obj?": (v) => v === null || (typeof v === "object" && !Array.isArray(v)),
  arr: (v) => Array.isArray(v) && v.length > 0,
  arr0: (v) => Array.isArray(v),
  bool: (v) => typeof v === "boolean",
};
const kindWant = {
  str: "is required (non-empty string)", "str?": "is required (string, or null when not supplied)",
  obj: "is required (object)", "obj?": "is required (object, or null when disabled)",
  arr: "is required (non-empty array)", arr0: "is required (array)", bool: "is required (true/false)",
};

function strictValidate(b) {
  for (const [key, kind] of STRICT_SCHEMA) {
    const parts = key.split(".");
    let parent = b;
    let skip = false;
    for (const p of parts.slice(0, -1)) {
      parent = parent == null ? undefined : parent[p];
      if (parent === null) { skip = true; break; } // disabled section → no nested keys
    }
    if (skip) continue;
    const leaf = parts[parts.length - 1];
    const has = parent !== undefined && Object.prototype.hasOwnProperty.call(parent, leaf);
    const v = has ? parent[leaf] : undefined;
    if (!has || !kindOk[kind](v)) fail(key, v, kindWant[kind]);
  }
  b.categories.forEach((c, i) => {
    if (!c.pillar) fail(`categories[${i}].pillar`, c.pillar, "is required for a non-default brand (fixed pillar routes)");
  });
  if (b.id === DEFAULT_BRAND_ID) fail("id", b.id, `is reserved for the default brand (root brand.config.json)`);
  if (!BRAND_ID.test(b.id)) fail("id", b.id, "must be a lowercase id (a-z, 0-9, -)");
  // No value of another brand: the default brand's counter, hosts, legal text or
  // avatar in a non-default config is a leak, not a fallback.
  const leak = findLeak(JSON.stringify(b));
  if (leak) fail("<any>", leak, "carries the default brand's identity (foreign counter/host/legal/avatar)");
}

/**
 * Identity of a config file. Pure: no env, no fs.
 * @returns {{ id: string|null, isDefault: boolean, legacyProfile: boolean, expectedId: string|null }}
 */
export function identityOf(configPath, b, root = ROOT) {
  const abs = resolve(configPath);
  if (abs === resolve(join(root, "brand.config.json"))) {
    if (b.id !== undefined && b.id !== DEFAULT_BRAND_ID)
      fail("id", b.id, `of the root brand.config.json must be "${DEFAULT_BRAND_ID}" (or absent)`);
    return { id: DEFAULT_BRAND_ID, isDefault: true, legacyProfile: false, expectedId: DEFAULT_BRAND_ID };
  }
  const rel = relative(join(root, "brands"), abs);
  const inBrands = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  const segs = inBrands ? rel.split(sep) : [];
  const expectedId = inBrands ? (segs.length > 1 ? segs[0] : basename(segs[0], ".json")) : null;
  if (b.id === undefined) {
    if (inBrands) fail("id", undefined, `is required for a brand under brands/ (expected "${expectedId}")`);
    return { id: null, isDefault: false, legacyProfile: true, expectedId: null };
  }
  if (expectedId && b.id !== expectedId) fail("id", b.id, `must equal its brands/ directory name "${expectedId}"`);
  return { id: b.id, isDefault: false, legacyProfile: false, expectedId };
}

/**
 * Load + validate one brand config. Throws on any violation.
 * @param {string} configPath absolute path
 * @returns {{ brand: object, identity: object }}
 */
export function loadBrandConfig(configPath, root = ROOT) {
  currentPath = configPath;
  const b = JSON.parse(readFileSync(configPath, "utf8"));
  const identity = identityOf(configPath, b, root);
  if (identity.id && !identity.isDefault) strictValidate(b);
  validateBrand(b);
  return { brand: b, identity: { ...identity, configPath } };
}

const override = process.env.BRAND_CONFIG;
const configPath = override
  ? (isAbsolute(override) ? override : join(ROOT, override))
  : DEFAULT_CONFIG_PATH;

const loaded = loadBrandConfig(configPath);

/** { id, isDefault, legacyProfile, expectedId, configPath } of the selected brand. */
export const brandIdentity = loaded.identity;
export default loaded.brand;
