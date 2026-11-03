// classify-diff.mjs <baseDir> <afterDir> — path-by-path comparison of two build trees.
// Every differing file is classified by WHAT differs; anything not explained by an
// enumerated reason is printed as UNEXPLAINED (= FAIL).
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const [base, after] = process.argv.slice(2);
const walk = (dir) => {
  const out = [];
  (function w(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) w(p); else out.push(relative(dir, p));
    }
  })(dir);
  return out.sort();
};
const h = (b) => createHash("sha256").update(b).digest("hex");
const A = new Set(walk(base));
const B = new Set(walk(after));
const lines = [];
let unexplained = 0;
let same = 0;
const onlyBase = [...A].filter((f) => !B.has(f));
const onlyAfter = [...B].filter((f) => !A.has(f));
for (const f of onlyBase) { lines.push(`REMOVED     ${f}  — UNEXPLAINED`); unexplained++; }
for (const f of onlyAfter) {
  if (f === "build-manifest.json") lines.push(`ADDED       ${f}  — new build manifest (PLAN §2, allowed)`);
  else { lines.push(`ADDED       ${f}  — UNEXPLAINED`); unexplained++; }
}
// Known version stamps (?v=<10 hex>) of the three edited shared sources.
const VERSIONED = ["gf-app.jsx", "gf-styles.css", "scroll-depth.js"];
const stripStamp = (s) => s.replace(new RegExp(`((?:/|\\.\\./)(?:${VERSIONED.map((a) => a.replace(/\./g, "\\.")).join("|")}))\\?v=[0-9a-f]{10}`, "g"), "$1?v=<hash>");
const BRAND_RE = /<script id="brand-data">window\.__BRAND=(\{.*?\});<\/script>/;
for (const f of [...A].filter((x) => B.has(x))) {
  const a = readFileSync(join(base, f));
  const b = readFileSync(join(after, f));
  if (h(a) === h(b)) { same++; continue; }
  const reasons = [];
  if (VERSIONED.includes(f)) {
    lines.push(`CHANGED     ${f}  — shared source edited in slice A (literals/comments moved to brand data; listed in A-edgelab-diff notes)`);
    continue;
  }
  let sa = a.toString("utf8");
  let sb = b.toString("utf8");
  // 1) version stamps of the edited shared sources
  const ta = stripStamp(sa), tb = stripStamp(sb);
  if (ta !== sa || tb !== sb) reasons.push("?v= stamps of gf-app.jsx/gf-styles.css/scroll-depth.js");
  sa = ta; sb = tb;
  // 2) brand payload: the same object plus `analytics` + `ui` (EdgeLab compat data)
  const ma = sa.match(BRAND_RE), mb = sb.match(BRAND_RE);
  if (ma && mb && ma[1] !== mb[1]) {
    const pa = JSON.parse(ma[1].replace(/\\u003c/g, "<"));
    const pb = JSON.parse(mb[1].replace(/\\u003c/g, "<"));
    const { analytics, ui, ...rest } = pb;
    const okRest = JSON.stringify(rest) === JSON.stringify(pa);
    const okAdded = analytics && analytics.metrika === "109832554" && analytics.ga4 === "G-J3H4311DJT" && ui && typeof ui === "object";
    if (okRest && okAdded) {
      reasons.push("window.__BRAND payload: +analytics{metrika,ga4} +ui (EdgeLab copy from brand-compat.mjs); all previous keys byte-identical");
      sa = sa.replace(BRAND_RE, "<brand-data>");
      sb = sb.replace(BRAND_RE, "<brand-data>");
    }
  }
  if (sa === sb && reasons.length) lines.push(`CHANGED     ${f}  — ${reasons.join("; ")}`);
  else { lines.push(`CHANGED     ${f}  — UNEXPLAINED${reasons.length ? ` (after: ${reasons.join("; ")})` : ""}`); unexplained++; }
}
console.log(`base files: ${A.size}, after files: ${B.size}, identical: ${same}, differing: ${lines.length}`);
for (const l of lines) console.log(l);
console.log(unexplained ? `RESULT: FAIL — ${unexplained} unexplained difference(s)` : "RESULT: PASS — every difference is enumerated above");
process.exit(unexplained ? 1 : 0);
