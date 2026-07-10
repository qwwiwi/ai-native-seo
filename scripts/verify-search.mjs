// verify-search.mjs — end-to-end check of the MiniSearch full-text search on the
// prerendered catalog page (build/library.html).
//
// It serves build/ over http (so absolute "/" asset refs — /minisearch.min.js,
// /guides-data.js, /gf-app.jsx — resolve), drives a real Chrome via Playwright,
// types Russian queries into the catalog search input, and asserts that results
// + highlight marks appear. Clean URLs (e.g. /library/) don't resolve under
// python's http.server, so we visit the flat /library.html file directly.
//
// Run: node scripts/verify-search.mjs   (after `node scripts/prerender.mjs`)

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import net from "node:net";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");

// Resolve Playwright: prefer a local install, fall back to the global one
// (global path differs per host — also resolve `npm root -g` so this runs on
// Mac mini AND Thrall VPS).
let chromium;
const candidates = ["playwright", "/opt/homebrew/lib/node_modules/playwright"];
try {
  const { execFileSync } = await import("node:child_process");
  const gRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  if (gRoot) candidates.push(`${gRoot}/playwright`);
} catch {
  /* npm not on PATH */
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
      "(npm i -g playwright).",
  );
  process.exit(1);
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

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
  return spawn(
    "python3",
    ["-m", "http.server", String(port), "--bind", "127.0.0.1"],
    { cwd: BUILD, stdio: "ignore" },
  );
}

async function waitForServer(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Local server on :${port} did not come up in time`);
}

// Wait until React has mounted the catalog (search input present + cards rendered).
async function waitForCatalog(page) {
  await page.waitForFunction(
    () => !!document.querySelector(".cat-searchbar input") &&
          document.querySelectorAll(".cat-card").length > 0,
    { timeout: 30000 },
  );
  await page.waitForTimeout(300);
}

// Type into the search input, then wait for the result set to settle.
async function typeQuery(page, q) {
  await page.fill(".cat-searchbar input", "");
  await page.fill(".cat-searchbar input", q);
  await page.waitForTimeout(350); // let React re-render the searched set
}

async function countCards(page) {
  return page.$$eval(".cat-card", (els) => els.length);
}
async function countMarks(page) {
  return page.$$eval("mark.hl", (els) => els.length);
}

async function main() {
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
    // System Chrome (Mac mini) → bundled Chromium fallback (Thrall, no system Chrome).
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

    // Surface page errors so a broken script doesn't fail silently.
    page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));

    await page.goto(`${base}/library.html`, { waitUntil: "networkidle", timeout: 45000 });
    await waitForCatalog(page);

    // MiniSearch global must be present (loaded before guides-data.js).
    const hasMini = await page.evaluate(() => typeof window.MiniSearch === "function");
    check("MiniSearch global loaded", hasMini);

    // Baseline: empty query shows all guides.
    const totalCards = await countCards(page);
    check("empty query shows all guides", totalCards >= 10, `got ${totalCards} cards`);

    // 1) Full Russian word query → ≥1 card + ≥1 highlight.
    await typeQuery(page, "база знаний");
    const c1 = await countCards(page);
    const m1 = await countMarks(page);
    check('query "база знаний" returns results', c1 >= 1, `got ${c1} cards`);
    check('query "база знаний" highlights matches', m1 >= 1, `got ${m1} marks`);
    check('query "база знаний" narrows the set', c1 <= totalCards, `${c1} vs ${totalCards}`);

    // 2) Partial word (prefix) — "навык" should match e.g. "навыки".
    await typeQuery(page, "навык");
    const c2 = await countCards(page);
    const m2 = await countMarks(page);
    check('partial word "навык" (prefix) returns results', c2 >= 1, `got ${c2} cards`);
    check('partial word "навык" highlights matches', m2 >= 1, `got ${m2} marks`);

    // 3) Near-typo (fuzzy) — one missing letter, still expect a hit.
    await typeQuery(page, "агены"); // typo of "агенты" (one letter dropped)
    const c3 = await countCards(page);
    check('near-typo "агены" (fuzzy) returns results', c3 >= 1, `got ${c3} cards`);

    // 4) Empty query again → back to all guides.
    await typeQuery(page, "");
    const c4 = await countCards(page);
    check("clearing query restores all guides", c4 === totalCards, `got ${c4}, expected ${totalCards}`);

    // 5) Gibberish → no-results state shown (popular fallback cards still render).
    await typeQuery(page, "zzzqqxwxyz");
    const emptyShown = await page.evaluate(() => !!document.querySelector(".cat-empty-msg"));
    check("gibberish query shows no-results state", emptyShown);

    await page.close();
  } finally {
    await cleanup();
  }

  console.log("");
  if (failures === 0) {
    console.log("ALL CHECKS PASSED");
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
