// brand-isolation.test.mjs — PLAN.md §2 gates of slice A (brand isolation).
//
//   node --test tests/brand-isolation.test.mjs
//
// Unit tests (no browser): brand identity + fail-closed config, brand paths,
// asset selection, hooks, manifest contract. End-to-end tests (Playwright + local
// HTTP, skipped without Playwright): a Loore build from the test fixture into
// build-loore/ with the leak grep, negative builds (foreign asset, foreign counter)
// that must fail and leave the previous output intact.
// BRAND_ISOLATION_EDGELAB=1 adds the slow default-brand build: it must not touch
// build-loore/ and build/ must hold no other brand's files.
// No network sends: never deploys, never pings IndexNow/GSC.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync, existsSync, symlinkSync, readdirSync, rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { identityOf, loadBrandConfig } from "../scripts/brand.mjs";
import { selectBrandAssets, loadHooks, LEGACY_HOOKS, isInside } from "../scripts/brand-paths.mjs";
import { manifestErrors, scanLeaks, imageSize } from "../scripts/build-manifest.mjs";
import { findLeak } from "../scripts/brand-compat.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOORE_CFG = join(ROOT, "brands", "loore", "brand.config.json");
const FIXTURE = "tests/fixtures/loore/content-guides";
const LOORE_OUT = join(ROOT, "build-loore");
// The plan's leak grep (PLAN.md §2), verbatim.
const LEAK_GREP = "edgelab|EdgeLab|109832554|G-J3H4311DJT|Ешиев|ИНН|go.edgelab.space|_home-hero-dashi|author-avatar";

// Child env: no Telegram vars, no inherited brand selection.
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^TELEGRAM_/.test(k) && k !== "BRAND_CONFIG" && k !== "BRAND_CONTENT_DIR"),
);
const node = (args, env = {}, timeout = 600000) =>
  spawnSync(process.execPath, args, { cwd: ROOT, env: { ...baseEnv, ...env }, encoding: "utf8", timeout, maxBuffer: 64 << 20 });
const tmp = (p) => mkdtempSync(join(tmpdir(), `brand-iso-${p}-`));
const looreCfg = () => JSON.parse(readFileSync(LOORE_CFG, "utf8"));

function hashTree(dir) {
  if (!existsSync(dir)) return null;
  const out = {};
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  })(dir);
  return out;
}

// ---- 1. brand identity -------------------------------------------------------------
test("identity: a config under brands/ without an id is rejected (no default-brand fallback)", () => {
  const { id, ...noId } = looreCfg();
  assert.equal(id, "loore");
  assert.throws(() => identityOf(LOORE_CFG, noId), /"id" is required for a brand under brands\/ \(expected "loore"\)/);
  assert.throws(() => identityOf(LOORE_CFG, { ...noId, id: "acme" }), /must equal its brands\/ directory name "loore"/);
  assert.throws(() => identityOf(join(ROOT, "brand.config.json"), { id: "loore" }), /root brand\.config\.json must be "edgelab"/);
  assert.equal(identityOf(join(ROOT, "brand.config.json"), {}).isDefault, true);
});

test("identity: a config without an id outside brands/ is a legacy profile that cannot be built", () => {
  const { id, ...noId } = looreCfg();
  const p = join(tmp("noid"), "brand.config.json");
  writeFileSync(p, JSON.stringify(noId));
  const r = node(["scripts/brand-paths.mjs"], { BRAND_CONFIG: p });
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /no identity field "id"/);
  const b = node(["scripts/prerender.mjs"], { BRAND_CONFIG: p });
  assert.notEqual(b.status, 0, "prerender must refuse an identity-less config");
  assert.match(b.stderr, /no identity field "id"/);
});

// ---- 2. fail-closed config -------------------------------------------------------------
const REQUIRED = [
  "brandName", "domain", "domain.site", "author", "telegram", "palette", "palette.accent", "fonts", "fonts.googleHref",
  "funnel", "funnel.mode", "funnel.docs", "funnel.utm", "mcpIdentity", "analytics", "analytics.metrika",
  "analytics.ga4", "analytics.indexNowKey", "analytics.gscProperty", "assets", "assets.og", "assets.icons", "home",
  "home.heroImage", "home.metaDescription", "seo", "seo.llmsIntro", "categories", "content", "deploy",
  "deploy.webroot", "features", "features.runtime",
];
function without(obj, path) {
  const c = structuredClone(obj);
  const parts = path.split(".");
  const parent = parts.slice(0, -1).reduce((o, k) => o[k], c);
  delete parent[parts[parts.length - 1]];
  return c;
}
test("fail-closed: removing any required Loore field is a build error naming it", () => {
  const dir = tmp("missing");
  for (const key of REQUIRED) {
    const p = join(dir, `${key}.json`);
    writeFileSync(p, JSON.stringify(without(looreCfg(), key)));
    assert.throws(() => loadBrandConfig(p), (e) => e.message.includes(`"${key}"`), `missing ${key} must fail`);
  }
  // explicit null = a disabled feature, accepted (Loore ships with null counters)
  assert.equal(loadBrandConfig(LOORE_CFG).brand.analytics.metrika, null);
});

test("fail-closed: a foreign counter, GA4 id, host, avatar or author fails the Loore config", () => {
  const dir = tmp("foreign");
  const cases = [
    ["analytics.metrika", (c) => { c.analytics.metrika = "109832554"; }],
    ["analytics.ga4", (c) => { c.analytics.ga4 = "G-J3H4311DJT"; }],
    ["home.heroImage", (c) => { c.home.heroImage = "/covers/_home-hero-dashi.webp"; }],
    ["funnel.targetUrl", (c) => { c.funnel.targetUrl = "https://go.edgelab.space/x"; }],
    ["author", (c) => { c.author = { name: "Даши Ешиев", url: null, legal: null, legalEntity: null }; }],
    ["assets.icons", (c) => { c.assets.icons = { ico: "/images/author-avatar.png" }; }],
  ];
  for (const [label, patch] of cases) {
    const c = looreCfg();
    patch(c);
    const p = join(dir, `${label}.json`);
    writeFileSync(p, JSON.stringify(c));
    assert.throws(() => loadBrandConfig(p), /default brand's identity/, `${label} must be rejected`);
  }
  const reserved = looreCfg();
  reserved.id = "edgelab";
  const p = join(dir, "reserved.json");
  writeFileSync(p, JSON.stringify(reserved));
  assert.throws(() => loadBrandConfig(p), /reserved for the default brand/);
});

// ---- 3. paths ------------------------------------------------------------------------------
test("paths: Loore builds into build-loore/ + .build/loore/, never inside build/ or site/", () => {
  const r = node(["scripts/brand-paths.mjs"], { BRAND_CONFIG: "brands/loore/brand.config.json" });
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  assert.equal(p.outputDir, "build-loore");
  assert.equal(p.workDir, ".build/loore");
  assert.equal(p.buildDir, ".build/loore/output");
  assert.equal(p.contentDir, "brands/loore/content-guides");
  assert.equal(p.assetsDir, "brands/loore/assets");
  assert.equal(p.release, true);
  const d = JSON.parse(node(["scripts/brand-paths.mjs"]).stdout);
  assert.equal(d.outputDir, "build");
  assert.equal(d.workDir, "site");
  for (const k of ["outputDir", "workDir", "buildDir", "serveDir"]) {
    assert.ok(!isInside(join(ROOT, p[k]), join(ROOT, "build")), `${k} inside build/`);
    assert.ok(!isInside(join(ROOT, p[k]), join(ROOT, "site")), `${k} inside site/`);
  }
  const f = JSON.parse(node(["scripts/brand-paths.mjs"], { BRAND_CONFIG: "brands/loore/brand.config.json", BRAND_CONTENT_DIR: FIXTURE }).stdout);
  assert.equal(f.release, false, "a fixture build is never a release");
  assert.notEqual(node(["scripts/brand-paths.mjs"], { BRAND_CONTENT_DIR: FIXTURE }).status, 0, "default brand + fixture must fail");
});

// ---- 4. assets -------------------------------------------------------------------------------
test("assets: only referenced brand files are selected; foreign, missing and out-of-root refs fail", () => {
  const root = tmp("assets");
  const assetsDir = join(root, "assets");
  mkdirSync(join(assetsDir, "covers", "a"), { recursive: true });
  mkdirSync(join(assetsDir, "images"), { recursive: true });
  writeFileSync(join(assetsDir, "covers", "a", "cover.webp"), "x");
  writeFileSync(join(assetsDir, "images", "b.png"), "x");
  writeFileSync(join(assetsDir, "images", "unused.png"), "x");
  writeFileSync(join(root, "outside.png"), "x");
  symlinkSync(join(root, "outside.png"), join(assetsDir, "images", "link.png"));
  const paths = { root, assetsDir };
  const cfg = { home: { heroImage: null }, assets: { og: null, logo: null, icons: null } };
  const g = (bodyHtml, cover = "/covers/a/cover.webp?v=1") => [{ slug: "a", cover, bodyHtml }];
  const sel = selectBrandAssets({ guides: g('<figure><img src="/images/b.png" alt=""></figure>'), cfg, paths });
  assert.deepEqual(sel.map((s) => s.url), ["/covers/a/cover.webp", "/images/b.png"], "unused.png must not be copied");
  assert.throws(() => selectBrandAssets({ guides: g('<img src="/images/author-avatar.png">'), cfg, paths }), /missing from brand assets/);
  assert.throws(() => selectBrandAssets({ guides: g("", "/covers/_home-hero-dashi.webp"), cfg, paths }), /missing from brand assets/);
  assert.throws(() => selectBrandAssets({ guides: g('<img src="/images/../outside.png">'), cfg, paths }), /not a clean site-relative path/);
  assert.throws(() => selectBrandAssets({ guides: g('<img src="/images/link.png">'), cfg, paths }), /outside the brand assets root/);
  assert.throws(() => selectBrandAssets({ guides: [], cfg: { ...cfg, home: { heroImage: "/covers/_home-hero-dashi.webp" } }, paths }), /home\.heroImage/);
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(1600, 16);
  png.writeUInt32BE(900, 20);
  assert.deepEqual(imageSize(png), { width: 1600, height: 900 });
});

// ---- 5. hooks --------------------------------------------------------------------------------
test("hooks: legacy defaults without modules; an enabled feature without its module fails", async () => {
  const empty = tmp("hooks");
  const h = await loadHooks({ features: { runtime: false, seoContent: false, picture: false } }, { scriptsDir: empty });
  assert.equal(h.renderPicture({ src: "/images/x.png", alt: "x" }), '<img src="/images/x.png" alt="x" loading="lazy">');
  assert.equal(await h.finalizePage({ html: "<p>a</p>" }), "<p>a</p>");
  assert.equal(h.selectPageData({}), null);
  assert.equal(await h.buildSeoContent({}), null);
  assert.deepEqual(await h.prepareRuntime({}), {});
  for (const k of Object.keys(LEGACY_HOOKS)) assert.equal(typeof h[k], "function", k);
  await assert.rejects(loadHooks({ features: { runtime: true } }, { scriptsDir: empty }), /feature "runtime" is enabled but scripts\/build-runtime\.mjs is missing/);
  await assert.rejects(loadHooks({ features: { picture: true } }, { scriptsDir: empty }), /image-markup\.mjs is missing/);
});

// ---- 6. manifest contract ----------------------------------------------------------------------
test("manifest: identity mismatches and credential-like keys fail the contract", () => {
  const good = {
    schemaVersion: 1, brandId: "loore", brandName: "Loore", canonicalOrigin: "https://blog.loore.ai",
    outputDir: "build-loore", contentDir: "brands/loore/content-guides", release: true,
    deployment: { host: "213.171.6.132", webroot: "/var/www/blog-loore" },
    sitemap: "https://blog.loore.ai/sitemap.xml", indexNow: { keyFile: null }, gscProperty: "sc-domain:loore.ai",
    analytics: { metrika: null, ga4: null }, routes: [{ url: "/", file: "index.html", mobile: false }], assets: [], files: [],
  };
  assert.deepEqual(manifestErrors(good), []);
  const bad = (patch) => manifestErrors({ ...structuredClone(good), ...patch });
  assert.ok(bad({ outputDir: "build" }).some((e) => /outputDir must be "build-loore"/.test(e)));
  assert.ok(bad({ gscProperty: "sc-domain:edgelab.space" }).some((e) => /does not belong/.test(e)));
  assert.ok(bad({ sitemap: "https://blog.edgelab.space/sitemap.xml" }).some((e) => /sitemap/.test(e)));
  assert.ok(bad({ deployment: { host: null, webroot: null } }).some((e) => /explicit deployment host and webroot/.test(e)));
  assert.deepEqual(bad({ deployment: { host: null, webroot: null }, release: false }), [], "a fixture build needs no webroot");
  assert.ok(bad({ gscKeyPath: "/home/x/key.json" }).some((e) => /credential-like key gscKeyPath/.test(e)));
  assert.ok(bad({ analytics: { token: "x" } }).some((e) => /credential-like key analytics\.token/.test(e)));
  assert.ok(manifestErrors(good, { outputDir: join(ROOT, "build") }).some((e) => /does not match the verified dir/.test(e)));
  assert.equal(findLeak("ym(109832554)"), "109832554");
  assert.equal(findLeak("blog.loore.ai"), null);
});

// ---- 7. end-to-end builds (Playwright) ---------------------------------------------------------------
function hasPlaywright() {
  const require = createRequire(import.meta.url);
  const cands = ["playwright", "/opt/homebrew/lib/node_modules/playwright"];
  const g = spawnSync("npm", ["root", "-g"], { encoding: "utf8" });
  if (g.status === 0 && g.stdout.trim()) cands.push(`${g.stdout.trim()}/playwright`);
  return cands.some((c) => { try { require.resolve(c); return true; } catch { return false; } });
}
const E2E = hasPlaywright() && spawnSync("python3", ["--version"]).status === 0;
const skipE2E = E2E ? false : "Playwright/python3 not available";
const buildLoore = (contentDir = FIXTURE) =>
  node(["scripts/prerender.mjs"], { BRAND_CONFIG: "brands/loore/brand.config.json", BRAND_CONTENT_DIR: contentDir });
const TRACKED = () => ({
  data: createHash("sha256").update(readFileSync(join(ROOT, "site", "guides-data.js"))).digest("hex"),
  wrappers: hashTree(join(ROOT, "site", "guides")),
});

test("e2e: Loore fixture build → build-loore/, zero leak-grep matches, own files only", { skip: skipE2E, timeout: 600000 }, async () => {
  const defaultBefore = hashTree(join(ROOT, "build"));
  const trackedBefore = TRACKED();
  const r = buildLoore();
  assert.equal(r.status, 0, `${r.stdout.slice(-3000)}\n${r.stderr.slice(-3000)}`);
  assert.deepEqual(hashTree(join(ROOT, "build")), defaultBefore, "a Loore build must not touch build/");
  assert.deepEqual(TRACKED(), trackedBefore, "a Loore build must not overwrite tracked site/guides-data.js or site/guides/*.html");
  assert.ok(!existsSync(join(ROOT, "build", "loore")), "no nested build/loore");
  const m = JSON.parse(readFileSync(join(LOORE_OUT, "build-manifest.json"), "utf8"));
  assert.equal(m.brandId, "loore");
  assert.equal(m.outputDir, "build-loore");
  assert.equal(m.release, false);
  assert.equal(m.canonicalOrigin, "https://blog.loore.ai");
  assert.deepEqual(m.analytics, { metrika: null, ga4: null });
  // The plan's grep (PLAN.md §2): any match = FAIL. grep exits 1 on no match.
  const grep = spawnSync("grep", ["-rnaE", LEAK_GREP, LOORE_OUT], { encoding: "utf8" });
  assert.equal(grep.status, 1, `leak grep matched:\n${grep.stdout}`);
  const grepI = spawnSync("grep", ["-rnaiE", "edgelab|ешиев|j3h4311|dashi", LOORE_OUT], { encoding: "utf8" });
  assert.equal(grepI.status, 1, `case-insensitive leak grep matched:\n${grepI.stdout}`);
  assert.deepEqual(await scanLeaks(LOORE_OUT), []);
  // A null counter renders no counter: no Metrika/GA4 loader, no counter call.
  const all = Object.keys(hashTree(LOORE_OUT)).map((f) => readFileSync(join(LOORE_OUT, f), "latin1")).join("\n");
  assert.ok(!/mc\.yandex\.ru|googletagmanager|<!-- analytics:/.test(all), "Loore has no counter configured — none may be emitted");
  // Only the brand's referenced assets: nothing from the default brand's covers/images.
  const files = Object.keys(hashTree(LOORE_OUT));
  assert.ok(!files.some((f) => /^(covers|images)\//.test(f)), `foreign asset dirs copied: ${files.filter((f) => /^(covers|images)\//.test(f))}`);
  assert.ok(!files.some((f) => /favicon|icon-32|apple-touch/.test(f)), "the default brand's icons must not be copied");
  assert.ok(files.includes("guides/fixture-brand-isolation.html") && files.includes("m/guides/fixture-brand-isolation.html"));
  assert.ok(files.includes("claude-skills.html"), "the Loore pillar /claude-skills/ is built");
  const v = node(["scripts/build-manifest.mjs", "--verify", "build-loore"]);
  assert.equal(v.status, 0, v.stderr);
});

test("e2e: an injected foreign asset or counter in the output fails verification", { skip: skipE2E }, () => {
  assert.ok(existsSync(join(LOORE_OUT, "build-manifest.json")), "needs the previous e2e build");
  const copy = join(tmp("inject"), "build-loore");
  cpSync(LOORE_OUT, copy, { recursive: true });
  cpSync(join(ROOT, "site", "images", "author-avatar.png"), join(copy, "author-avatar.png"));
  writeFileSync(join(copy, "index.html"), `${readFileSync(join(copy, "index.html"), "utf8")}<script>ym(109832554,"init",{})</script>`);
  const v = node(["scripts/build-manifest.mjs", "--verify", copy]);
  assert.notEqual(v.status, 0);
  assert.match(v.stderr, /unlisted file in output: author-avatar\.png/);
  assert.match(v.stderr, /leak \(path\) author-avatar\.png/);
  assert.match(v.stderr, /file changed after the build: index\.html/);
  assert.match(v.stderr, /leak \(content\) index\.html: "109832554"/);
});

function fixtureVariant(label, mutate) {
  const dir = join(tmp(label), "content-guides");
  cpSync(join(ROOT, FIXTURE), dir, { recursive: true });
  const f = join(dir, "fixture-brand-isolation.mdx");
  writeFileSync(f, mutate(readFileSync(f, "utf8")));
  return dir;
}

test("e2e: content referencing a foreign asset fails before the output is touched", { skip: skipE2E, timeout: 600000 }, () => {
  const before = hashTree(LOORE_OUT);
  const dir = fixtureVariant("asset", (s) => s.replace("## Что проверяет тест", "![аватар](/images/author-avatar.png)\n\n## Что проверяет тест"));
  const r = buildLoore(dir);
  assert.notEqual(r.status, 0, "a foreign asset must fail the build");
  assert.match(r.stderr, /asset \/images\/author-avatar\.png \(body of fixture-brand-isolation\): missing from brand assets/);
  assert.deepEqual(hashTree(LOORE_OUT), before, "the previous build-loore/ must stay intact");
});

test("e2e: a foreign counter in content fails the leak gate; build-loore/ stays intact", { skip: skipE2E, timeout: 600000 }, () => {
  const before = hashTree(LOORE_OUT);
  const dir = fixtureVariant("counter", (s) => s.replace("## Что не проверяет тест", "Счётчик: ym(109832554).\n\n## Что не проверяет тест"));
  const r = buildLoore(dir);
  assert.notEqual(r.status, 0, "a foreign counter must fail the build");
  assert.match(r.stderr, /FAILED the manifest\/leak gate/);
  assert.match(r.stderr, /leak \(content\) .*"109832554"/);
  assert.deepEqual(hashTree(LOORE_OUT), before, "the previous build-loore/ must stay intact");
});

const slowEdge = !E2E ? "Playwright/python3 not available" : process.env.BRAND_ISOLATION_EDGELAB === "1" ? false : "set BRAND_ISOLATION_EDGELAB=1 (full default-brand build, ~4 min)";
test("e2e: a default-brand build leaves build-loore/ intact and ships no other brand's files", { skip: slowEdge, timeout: 900000 }, () => {
  const looreBefore = hashTree(LOORE_OUT);
  assert.ok(looreBefore, "needs build-loore/ from the earlier e2e test");
  const r = node(["scripts/prerender.mjs"]);
  assert.equal(r.status, 0, r.stderr.slice(-3000));
  assert.deepEqual(hashTree(LOORE_OUT), looreBefore, "building the default brand must not delete or change build-loore/");
  const files = Object.keys(hashTree(join(ROOT, "build")));
  assert.ok(!files.some((f) => /fixture-brand-isolation|build-loore|^loore\//.test(f)), "build/ holds another brand's output");
  const m = JSON.parse(readFileSync(join(ROOT, "build", "build-manifest.json"), "utf8"));
  assert.equal(m.brandId, "edgelab");
  assert.equal(m.outputDir, "build");
  assert.ok(!m.routes.some((x) => /loore|fixture/.test(x.url)));
  const v = node(["scripts/build-manifest.mjs", "--verify", "build"]);
  assert.equal(v.status, 0, v.stderr);
});

// Clean the temp fixture variants (best effort).
test.after(() => {
  for (const e of readdirSync(tmpdir())) {
    if (e.startsWith("brand-iso-")) rmSync(join(tmpdir(), e), { recursive: true, force: true });
  }
});
