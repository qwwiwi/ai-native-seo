#!/usr/bin/env node
// Verify the read-through analytics instrumentation in build/.
// Run AFTER `npm run build`. Exits non-zero on any failure.
//
// Checks:
//   guide/article pages (build/guides/*.html + build/m/guides/*.html):
//     - JSON-LD present + valid JSON, Article node with articleBody >= 500 chars
//     - Article has @id/url/headline/author/datePublished/articleSection
//     - <body data-content-group="article|guide">
//     - /scroll-depth.js?v=<hash> referenced exactly once
//     - exactly one JSON-LD block and one GA4 loader
//   static pages (home/library/about/category): NO scroll-depth.js, NO articleBody.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD = join(dirname(fileURLToPath(import.meta.url)), "..", "build");
let failures = 0;
const fail = (label, msg) => {
  failures++;
  console.error(`  ✗ ${label}: ${msg}`);
};

function articleNode(graph) {
  // require the emitted shape: @type array that includes "Article"
  return (graph || []).find((n) => Array.isArray(n["@type"]) && n["@type"].includes("Article"));
}

async function checkGuide(file, label) {
  const html = await readFile(file, "utf8");
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return fail(label, "no JSON-LD");
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    return fail(label, `JSON-LD invalid: ${e.message}`);
  }
  const art = articleNode(data["@graph"]);
  if (!art) return fail(label, "no Article node in @graph");
  const bodyLen = (art.articleBody || "").length;
  if (bodyLen < 500) fail(label, `articleBody missing/<500 (len=${bodyLen})`);
  for (const f of ["@id", "url", "headline", "author", "datePublished", "articleSection"]) {
    if (!art[f]) fail(label, `Article missing "${f}"`);
  }
  if (!/\/scroll-depth\.js\?v=[a-f0-9]+/.test(html)) fail(label, "scroll-depth.js missing or not versioned");
  if (!/<body[^>]*data-content-group="(article|guide)"/.test(html)) fail(label, "data-content-group missing on <body>");
  const ld = (html.match(/application\/ld\+json/g) || []).length;
  if (ld !== 1) fail(label, `expected 1 JSON-LD block, got ${ld}`);
  const ss = (html.match(/scroll-depth\.js/g) || []).length;
  if (ss !== 1) fail(label, `expected 1 scroll-depth.js ref, got ${ss}`);
  const ga = (html.match(/gtag\/js\?id=G-J3H4311DJT/g) || []).length;
  if (ga !== 1) fail(label, `expected 1 GA4 loader, got ${ga}`);
}

async function checkStatic(file, label) {
  const html = await readFile(file, "utf8");
  if (/scroll-depth\.js/.test(html)) fail(label, "scroll-depth.js must NOT be on a static page");
  if (/"articleBody"/.test(html)) fail(label, "articleBody must NOT be on a static page");
}

async function listHtml(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".html")).map((f) => join(dir, f));
  } catch {
    return [];
  }
}

const main = async () => {
  const guideFiles = [
    ...(await listHtml(join(BUILD, "guides"))),
    ...(await listHtml(join(BUILD, "m", "guides"))),
  ];
  if (guideFiles.length === 0) {
    console.error("No build/guides/*.html found — run `npm run build` first.");
    process.exit(1);
  }
  console.log(`Verifying ${guideFiles.length} guide/article pages…`);
  for (const f of guideFiles) await checkGuide(f, f.replace(BUILD, "build"));

  // static / category pages = top-level build/*.html + mobile root build/m/*.html
  const staticFiles = [
    ...(await listHtml(BUILD)),
    ...(await listHtml(join(BUILD, "m"))),
  ];
  console.log(`Verifying ${staticFiles.length} static pages (regression)…`);
  for (const f of staticFiles) await checkStatic(f, f.replace(BUILD, "build"));

  if (failures > 0) {
    console.error(`\n✗ ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\n✓ read-through analytics: all checks passed.");
};

main();
