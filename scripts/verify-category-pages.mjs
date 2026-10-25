// verify-category-pages.mjs — post-build gate for the category listing pages and for
// every internal page link. Run by scripts/prerender.mjs right after build-seo (a
// failure fails the build) and by `npm run verify`. Exit 1 on any failure.
//
// Why: a category route used to render a COPY of its first guide (same H1 and body
// under the category URL) — Google sees a duplicate of the guide with a category
// <title>. Each category page (desktop build/<pillar>.html AND mobile m/<pillar>.html)
// must be a real listing:
//   1. its H1 is the category name and equals NO guide's H1 (title);
//   2. no guide body (.gp-article-body) is baked into it;
//   3. it links to every guide of the category;
//   4. its meta description is neither the old «Гайды по теме …» template nor a
//      guide's description;
//   5. its JSON-LD carries a CollectionPage whose ItemList lists every guide.
// Plus, for ALL pages (desktop + mobile, static + guides):
//   6. every BreadcrumbList item resolves to a built page (no crumb → 404 category);
//   7. every site-relative /<page>/ link resolves to a built page (nav → no 404).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { categoryPages } from "./categories.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = process.env.VERIFY_BUILD_DIR || join(ROOT, "build");
const fails = [];
const F = (m) => fails.push(m);

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(BUILD, "guides-data.js"), "utf8"), ctx);
const guides = ctx.window.__GF_GUIDES || [];
// The pages that MUST exist, from the taxonomy + content (not from the build output,
// so a build that silently dropped or mis-rendered a page cannot vouch for itself).
const pages = categoryPages(guides).map((c) => ({ ...c, page: c.pillar }));
if (!guides.length) F("guides-data.js: no guides");

const decode = (s) => String(s)
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;| /g, " ")
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const norm = (s) => decode(s).toLowerCase();
const guideH1 = new Map(guides.map((g) => [norm(g.title), g.slug]));
const h1s = (html) => [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1]));
const metaDesc = (html) => {
  const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  return m ? decode(m[1]) : null;
};
const jsonLd = (html, rel) => {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      out.push(...(data["@graph"] || [data]));
    } catch { F(`${rel}: invalid JSON-LD`); }
  }
  return out;
};
// "/" → index.html, "/x/" → x.html, "/guides/x/" → guides/x.html
const builtFor = (path) => {
  const p = path.replace(/[?#].*$/, "");
  if (p === "/") return "index.html";
  const m = p.match(/^\/([a-z0-9][a-z0-9/-]*?)\/?$/);
  return m ? `${m[1]}.html` : null;
};
const exists = (path) => {
  const f = builtFor(path);
  return !f || existsSync(join(BUILD, f)) || existsSync(join(BUILD, f.replace(/\.html$/, ""), "index.html"));
};

// ---- 1-5. category listing pages -------------------------------------------------
const guideDescs = new Set(guides.map((g) => norm(g.desc || "")).filter(Boolean));
for (const c of pages) {
  const items = guides.filter((g) => g.cat === c.id);
  const file = `${c.page.replace(/^\/|\/$/g, "")}.html`;
  for (const rel of [file, `m/${file}`]) {
    const p = join(BUILD, rel);
    if (!existsSync(p)) { F(`${rel}: category page «${c.name}» missing`); continue; }
    const html = readFileSync(p, "utf8");
    const hs = h1s(html);
    if (hs.length !== 1) F(`${rel}: expected exactly one <h1>, found ${hs.length}`);
    for (const h of hs) {
      if (guideH1.has(h.toLowerCase())) F(`${rel}: H1 «${h}» equals the H1 of guide ${guideH1.get(h.toLowerCase())} — the category page renders a guide, not a listing`);
      else if (h !== c.name) F(`${rel}: H1 «${h}» ≠ category name «${c.name}»`);
    }
    if (/class="gp-article-body"/.test(html)) F(`${rel}: a guide body (.gp-article-body) is baked into the category page`);
    const linked = new Set([...html.matchAll(/href="\/guides\/([a-z0-9-]+)\/"/g)].map((m) => m[1]));
    const missing = items.filter((g) => !linked.has(g.slug)).map((g) => g.slug);
    if (missing.length) F(`${rel}: listing misses ${missing.length} guide(s) of «${c.name}»: ${missing.slice(0, 5).join(", ")}`);
    const d = metaDesc(html);
    if (!d) F(`${rel}: no meta description`);
    else if (/^Гайды по теме «/.test(d)) F(`${rel}: template meta description «${d}»`);
    else if (guideDescs.has(d.toLowerCase())) F(`${rel}: meta description is a guide's description`);
    const coll = jsonLd(html, rel).find((n) => n["@type"] === "CollectionPage");
    const list = coll && coll.mainEntity && coll.mainEntity["@type"] === "ItemList" ? coll.mainEntity : null;
    if (!list) F(`${rel}: no JSON-LD CollectionPage + ItemList`);
    else {
      const urls = new Set((list.itemListElement || []).map((it) => String(it.url || "").replace(/^https?:\/\/[^/]+/, "")));
      const notListed = items.filter((g) => !urls.has(`/guides/${g.slug}/`)).map((g) => g.slug);
      if (list.numberOfItems !== items.length || notListed.length) {
        F(`${rel}: ItemList has ${list.numberOfItems} item(s), category has ${items.length}${notListed.length ? ` (missing ${notListed.slice(0, 5).join(", ")})` : ""}`);
      }
    }
  }
}

// ---- 6-7. breadcrumbs + internal page links on every page -------------------------
const htmlFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".html")) : []);
const all = [
  ...htmlFiles(BUILD),
  ...htmlFiles(join(BUILD, "guides")).map((f) => `guides/${f}`),
  ...htmlFiles(join(BUILD, "m")).map((f) => `m/${f}`),
  ...htmlFiles(join(BUILD, "m", "guides")).map((f) => `m/guides/${f}`),
];
const dead = new Map(); // link → first page that carries it (one line per dead link)
for (const rel of all) {
  const html = readFileSync(join(BUILD, rel), "utf8");
  for (const node of jsonLd(html, rel)) {
    if (node["@type"] !== "BreadcrumbList") continue;
    for (const it of node.itemListElement || []) {
      const path = String(it.item || "").replace(/^https?:\/\/[^/]+/, "") || "/";
      if (!exists(path)) F(`${rel}: BreadcrumbList item «${it.name}» → ${path} has no page`);
    }
  }
  for (const m of html.matchAll(/href="(\/(?:[a-z0-9][a-z0-9-]*\/)?)(?:[?#][^"]*)?"/g)) {
    if (!exists(m[1]) && !dead.has(m[1])) dead.set(m[1], rel);
  }
}
for (const [link, rel] of dead) F(`${rel}: link ${link} has no built page (404)`);

if (fails.length) {
  for (const f of fails.slice(0, 60)) console.error(`  FAIL  ${f}`);
  console.error(`\nverify-category-pages: ${fails.length} failure(s).`);
  process.exit(1);
}
console.log(`verify-category-pages: OK — ${pages.length} category listing page(s) desktop+mobile, ` +
  `${all.length} pages: breadcrumbs and page links resolve.`);
