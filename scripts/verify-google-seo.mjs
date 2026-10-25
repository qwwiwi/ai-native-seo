// verify-google-seo.mjs — post-build check of the Google-facing invariants in build/.
// Run after `npm run build` (also part of `npm run verify` / scripts/check.sh).
// Exit 1 on any failure.
//
//   1. sitemap.xml lists EVERY guide with a real <lastmod> equal to the honest date in
//      guides-data.js, and carries no <changefreq>/<priority>.
//   2. listing pages: the home and /library/ <lastmod> = the newest guide; each
//      category page <lastmod> = the newest guide of that category (max of children).
//   3. every guide page — desktop build/guides/<slug>.html AND mobile
//      build/m/guides/<slug>.html — bakes the «Все материалы» index linking to every
//      other non-stub guide (auto cross-linking; mobile-first indexing).
//   4. every guide page bakes its OWN slug into the funnel UTM
//      (utm_content=<funnel.utm.contentPrefix><slug>), never another guide's.
//   5. JSON-LD BreadcrumbList has no repeated URL (wrong-category crumbs).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import brand from "./brand.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build");
const BASE = String(brand.domain.site).replace(/\/+$/, "");
const UTM = (brand.funnel && brand.funnel.utm) || {};
const UTM_PREFIX = UTM.contentPrefix != null ? String(UTM.contentPrefix) : "blog-";
const fails = [];
const F = (m) => fails.push(m);

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(BUILD, "guides-data.js"), "utf8"), ctx);
const guides = ctx.window.__GF_GUIDES || [];
const cats = ctx.window.__GF_CATS || [];
if (!guides.length) F("guides-data.js: no guides");
const live = guides.filter((g) => !g.stub);
const day = (g) => String(g.updatedAt || "").slice(0, 10);
const maxDay = (gs) => gs.map(day).filter(Boolean).sort().pop();

// 1. sitemap
const sm = readFileSync(join(BUILD, "sitemap.xml"), "utf8");
if (/<changefreq>|<priority>/.test(sm)) F("sitemap.xml still has <changefreq>/<priority>");
const lastmodOf = (loc) => {
  const esc = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = sm.match(new RegExp(`<loc>${esc}</loc>\\s*<lastmod>(\\d{4}-\\d{2}-\\d{2})</lastmod>`));
  return m ? m[1] : null;
};
for (const g of guides) {
  const lm = lastmodOf(`${BASE}/guides/${g.slug}/`);
  if (!lm) F(`sitemap: ${g.slug} missing or without <lastmod>`);
  else if (lm !== day(g)) F(`sitemap: ${g.slug} lastmod ${lm} ≠ honest ${day(g)}`);
}

// 2. listing pages = max(lastmod of their children)
const listings = [
  [`${BASE}/`, guides],
  [`${BASE}/library/`, guides],
  ...cats.filter((c) => c.page).map((c) => [`${BASE}${c.page}`, guides.filter((g) => g.cat === c.id)]),
];
for (const [loc, children] of listings) {
  const lm = lastmodOf(loc);
  const want = maxDay(children);
  if (!lm) F(`sitemap: listing ${loc} missing or without <lastmod>`);
  else if (want && lm !== want) F(`sitemap: listing ${loc} lastmod ${lm} ≠ newest child ${want}`);
}

// 3-5. per-page checks
for (const g of guides) {
  for (const rel of [`guides/${g.slug}.html`, `m/guides/${g.slug}.html`]) {
    const p = join(BUILD, rel);
    if (!existsSync(p)) { F(`${rel}: missing`); continue; }
    const html = readFileSync(p, "utf8");
    if (!g.stub) {
      const i = html.indexOf('class="gp-guide-index"');
      if (i < 0) F(`${rel}: no «Все материалы» index`);
      else {
        const end = html.indexOf("</nav>", i);
        const block = html.slice(i, end > i ? end : undefined);
        const linked = new Set([...block.matchAll(/href="\/guides\/([a-z0-9-]+)\/"/g)].map((x) => x[1]));
        const missing = live.filter((o) => o.slug !== g.slug && !linked.has(o.slug)).map((o) => o.slug);
        if (missing.length) F(`${rel}: index misses ${missing.length} guide(s): ${missing.slice(0, 5).join(", ")}`);
      }
    }
    const utms = [...html.matchAll(/utm_content=([a-z0-9-]+)/g)].map((x) => x[1]);
    // funnel.mode "none" renders no funnel links at all — nothing to attribute then.
    const funnelOn = ((brand.funnel && brand.funnel.mode) || "community") !== "none";
    if (funnelOn && !utms.length) F(`${rel}: no funnel UTM link`);
    // own slug only: the baked funnel links carry <prefix><slug>; author-written
    // in-body links may carry the bare <slug> — both attribute to THIS guide.
    const own = `${UTM_PREFIX}${g.slug}`;
    const foreign = [...new Set(utms.filter((u) => u !== own && u !== g.slug))];
    if (foreign.length) F(`${rel}: foreign utm_content ${foreign.join(", ")} (expected ${own})`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let data;
      try { data = JSON.parse(m[1]); } catch { F(`${rel}: invalid JSON-LD`); continue; }
      for (const node of data["@graph"] || [data]) {
        if (node["@type"] !== "BreadcrumbList") continue;
        const urls = (node.itemListElement || []).map((it) => it.item);
        if (new Set(urls).size !== urls.length) F(`${rel}: BreadcrumbList repeats a URL (${urls.join(" › ")})`);
      }
    }
  }
}

if (fails.length) {
  for (const f of fails.slice(0, 60)) console.error(`  FAIL  ${f}`);
  console.error(`\nverify-google-seo: ${fails.length} failure(s).`);
  process.exit(1);
}
console.log(`verify-google-seo: OK — ${guides.length} guides: sitemap lastmod honest (listings = newest child), ` +
  "cross-guide index on desktop+mobile, own-slug UTM, clean breadcrumbs.");
