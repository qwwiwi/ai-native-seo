#!/usr/bin/env node
// Verify the «Похожие материалы» (related) data + rendered block. Run after build.
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build");
let fails = 0;
const fail = (m) => { fails++; console.error("  ✗ " + m); };

// 1) data: each non-stub guide has 3-4 valid related slugs, no self/dupe.
const dataJs = await readFile(join(ROOT, "site", "guides-data.js"), "utf8");
const win = {};
// eslint-disable-next-line no-new-func
new Function("window", dataJs)(win);
const guides = win.__GF_GUIDES || [];
if (guides.length === 0) fail("guides-data.js: __GF_GUIDES empty");
const bySlug = Object.fromEntries(guides.map((g) => [g.slug, g]));
// floor adapts if the catalog ever holds <4 non-stub guides (each can have ≤ N-1 related).
const nonStub = guides.filter((g) => !g.stub).length;
const floor = Math.min(3, Math.max(0, nonStub - 1));
for (const g of guides) {
  if (g.stub) continue;
  const r = g.related || [];
  if (r.length < floor || r.length > 4) fail(`${g.slug}: related.length=${r.length} (want ${floor}-4)`);
  if (r.includes(g.slug)) fail(`${g.slug}: self-link in related`);
  if (new Set(r).size !== r.length) fail(`${g.slug}: duplicate in related`);
  for (const s of r) {
    if (!bySlug[s]) fail(`${g.slug}: related slug "${s}" does not exist`);
    else if (bySlug[s].stub) fail(`${g.slug}: related slug "${s}" is a stub`);
  }
}
console.log(`Checked related data for ${guides.length} guides.`);

// 2) rendered: guide/article pages carry the block; static pages do not.
const list = async (d) => { try { return (await readdir(d)).filter((f) => f.endsWith(".html")).map((f) => join(d, f)); } catch { return []; } };
const guidePages = [...(await list(join(BUILD, "guides"))), ...(await list(join(BUILD, "m", "guides")))];
for (const f of guidePages) {
  const html = await readFile(f, "utf8");
  if (!/class="gp-related"/.test(html)) fail(`${f.replace(BUILD, "build")}: missing gp-related block`);
}
// Pure non-article pages must NOT carry the block. (Category landings like
// claude-code/codex/hermes render a representative GUIDE via the article path, so
// they legitimately show «Похожие» — they are not in this list.)
const PURE_STATIC = [
  "index.html", "library.html", "about.html", "mobile.html",
  "m/index.html", "m/library.html", "m/about.html",
];
for (const rel of PURE_STATIC) {
  try {
    const html = await readFile(join(BUILD, rel), "utf8");
    if (/class="gp-related"/.test(html)) fail(`${rel}: gp-related must NOT be on a pure-static page`);
  } catch {}
}
console.log(`Checked ${guidePages.length} guide pages + ${PURE_STATIC.length} pure-static pages.`);

if (fails) { console.error(`\n✗ ${fails} check(s) failed.`); process.exit(1); }
console.log("\n✓ related / recirculation: all checks passed.");
