#!/usr/bin/env node
// compose-cover.mjs — render a 1600×900 EdgeLab cover (scene + logo badge + title overlay)
// from assets/cover-template.html via Playwright (chrome-headless-shell).
//
// Usage:
//   node compose-cover.mjs --bg scene.png [--logo logo.svg|png] \
//        --eyebrow "ГАЙД · CLAUDE CODE" --title 'Claude <lime>Code</lime>' \
//        --sub "Первая настройка с нуля" --out /tmp/cover.png
//
// --title supports <lime>…</lime> to color part of the title #D4FF00.
// --logo is optional (omit → no badge). SVG or raster.

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import brand from "../../scripts/brand.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dirname, "cover-template.html");

function arg(name, def = "") {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const bg = arg("bg");
const logo = arg("logo");
const eyebrow = arg("eyebrow");
const title = arg("title");
const sub = arg("sub");
const out = arg("out", "/tmp/edgelab-cover.png");
const mono = process.argv.includes("--mono"); // articles: B&W scene, lime accents kept (per prince 2026-06-17)

if (!bg || !existsSync(bg)) { console.error("ERR: --bg <scene.png> required and must exist"); process.exit(1); }
if (logo && !existsSync(logo)) { console.error("ERR: --logo not found: " + logo); process.exit(1); }

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// title: escape, then re-enable <lime>…</lime>. The tag name stays `lime` for CLI
// back-compat; the rendered color is the brand accent (white-label M1 step 4).
const titleHtml = esc(title).replace(/&lt;lime&gt;/g, '<span class="lime">').replace(/&lt;\/lime&gt;/g, "</span>");
const badgeHtml = logo ? `<div class="badge"><img src="file://${logo}"></div>` : "";

// White-label (M1 step 4): accent, wordmark and fonts come from brand.config.json
// (BRAND_CONFIG env overrides the path — same mechanism as the build scripts).
// EdgeLab defaults reproduce the previous hard-coded template byte-for-byte.
// Fix-loop 2: fonts/palette are OPTIONAL in the config contract (same as the
// build path) — fall back to EdgeLab values instead of crashing; the square is
// conditional for single-word brands (mirrors Logo / notFoundHtml); the brand's
// validated googleHref is preferred over re-constructing weights (a family may
// not ship every weight the template asks for, e.g. Space Grotesk has no 800).
const fonts = brand.fonts || {};
const palette = brand.palette || {};
const accent = palette.accent || "#D4FF00";
const fontDisplay = fonts.display || "Inter Tight";
const fontMono = fonts.mono || "JetBrains Mono";
const brandParts = brand.brandName.split(/\s+/);
const wmA = (brandParts[0] || brand.brandName).toLowerCase();
const wmB = brandParts.slice(1).join(" ").toLowerCase();
const wordmarkHtml = wmB ? `${esc(wmA)}<span class="sq"></span>${esc(wmB)}` : esc(wmA);
const gf = (f) => f.trim().replace(/ /g, "+");
const fontsHref = fonts.googleHref ||
  `https://fonts.googleapis.com/css2?family=${gf(fontDisplay)}:wght@500;600;700;800` +
  `&family=${gf(fontMono)}:wght@500;600&display=swap`;

let html = readFileSync(TEMPLATE, "utf8")
  .replace("__MONO__", mono ? "mono" : "")
  .replace("__BG__", "file://" + bg)
  .replace("__BADGE__", badgeHtml)
  .replace("__EYEBROW__", esc(eyebrow))
  .replace("__TITLE__", titleHtml)
  .replace("__SUB__", esc(sub))
  .replace("__FONTS_HREF__", () => fontsHref)
  .replace("__FONT_DISPLAY__", () => fontDisplay)
  .replace("__FONT_MONO__", () => fontMono)
  .replaceAll("__ACCENT__", () => accent)
  .replace("__WORDMARK__", () => wordmarkHtml);

// temp HTML lives in the OS temp dir (NOT next to the output, which clutters the
// covers/ asset folder and gets committed/deployed). Cleaned up after the render.
const tmpHtml = join(tmpdir(), "edgelab-cover-" + basename(out).replace(/\.png$/, "") + ".html");
writeFileSync(tmpHtml, html);

// resolve playwright (global on the Mac mini) + the headless-shell chrome
const require = createRequire(import.meta.url);
let chromium;
for (const p of ["playwright", "/opt/homebrew/lib/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
if (!chromium) { console.error("ERR: playwright not found (npm i -g playwright)"); process.exit(1); }

const SHELL = process.env.SHELL_CHROME ||
  "/Users/jasonqwwen/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell";

(async () => {
  const launchOpts = existsSync(SHELL) ? { executablePath: SHELL } : {};
  const b = await chromium.launch(launchOpts);
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto("file://" + tmpHtml, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  if (logo) {
    const ok = await p.evaluate(() => { const i = document.querySelector(".badge img"); return !!(i && i.naturalWidth > 0); });
    if (!ok) console.error("WARN: logo did not load — check the --logo path (badge will be empty)");
  }
  await p.screenshot({ path: out });
  await b.close();
  try { rmSync(tmpHtml); } catch (_) {}
  console.log(out);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
