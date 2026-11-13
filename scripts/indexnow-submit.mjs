// indexnow-submit.mjs — notify IndexNow (Yandex + Bing) about changed/new URLs so
// they can re-crawl them sooner than the next scheduled crawl.
//
// IndexNow is a notification, NOT a guarantee: the engines state it "does not
// guarantee that web pages will be crawled or indexed" (indexnow.org/documentation),
// and HTTP 200/202 only means "received". It is also not meant for sending the whole
// site at once ("publish only URLs changing", indexnow.org/faq) — so by default this
// script sends ONLY URLs whose content changed, and a full submission needs --all.
//
// IndexNow is one protocol shared by Yandex, Bing, Seznam… A single key file
// (build/<KEY>.txt, emitted by build-seo.mjs) authenticates us. We POST to both
// the Yandex-native endpoint and the generic api.indexnow.org. A submission to one
// endpoint is shared with the others, so the second call is a cheap extra, not a
// requirement; it is skipped once any endpoint answers 429.
//
// Usage (run AFTER deploy, when the URLs are already live — IndexNow validates
// that the submitted URLs resolve):
//   node scripts/indexnow-submit.mjs <url> [url…]          # only these URLs
//   node scripts/indexnow-submit.mjs --rsync-plan <file>   # only URLs of the files listed
//                                                          # in a rsync dry-run plan
//                                                          # (deploy.sh does this)
//   node scripts/indexnow-submit.mjs --all                 # EVERY sitemap URL (explicit)
//   node scripts/indexnow-submit.mjs                       # nothing: prints how to send
//   add --dry-run to any of them: print the payload, send nothing
//
// The rsync plan is the output of `rsync -n --checksum --out-format='%i %n'` between
// build/ and the live webroot: with --checksum a line `<f…` (or `>f…`) means that file's CONTENT
// differs from what is live (or is new). Its URL is submitted only if it is in the
// sitemap, so mobile twins (m/…), sidecars and other non-page files are ignored.
//
// Exit codes: 0 ok / nothing to send · 1 failure (bad input, network, non-429 error)
//             · 75 rate limited (HTTP 429): the Retry-After wait is printed, no
//               further request is made in this run — rerun after the wait.
//
// Reads the key from build/<KEY>.txt (the single file present in build/), so the
// key never has to be duplicated here.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promises as fs, realpathSync } from "node:fs";
import brand from "./brand.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");

// HOST/BASE derive from the active brand config (brand.domain.site), so IndexNow
// submits to the brand's own host — no hardcoded domain.
const BASE = String(brand.domain.site).replace(/\/+$/, "");
const HOST = new URL(BASE).hostname;
const ENDPOINTS = [
  "https://yandex.com/indexnow", // Yandex-native
  "https://api.indexnow.org/indexnow", // generic (Bing / Seznam / shared)
];

/** Exit code for HTTP 429: distinguishable from a plain failure (1). EX_TEMPFAIL. */
export const EXIT_RATE_LIMITED = 75;

async function findKey(buildDir) {
  // The key file is the lone <32-hex>.txt sitting at build/ root.
  const entries = await fs.readdir(buildDir);
  const keyFile = entries.find((f) => /^[a-f0-9]{8,128}\.txt$/i.test(f));
  if (!keyFile) {
    throw new Error("IndexNow key file not found in build/ — run build-seo first");
  }
  const key = (await fs.readFile(join(buildDir, keyFile), "utf8")).trim();
  return { key, keyLocation: `${BASE}/${keyFile}` };
}

async function sitemapUrls(buildDir) {
  const xml = await fs.readFile(join(buildDir, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Sitemap URLs whose page file is listed as changed in a rsync dry-run plan.
 * Only `<f…` / `>f…` lines count (a file transferred: new or different content;
 * `<` when the plan was made by the sending side, as in a push over ssh); `*deleting`,
 * directory lines never match.
 */
function changedUrls(planText, sitemap) {
  const changed = new Set();
  for (const line of planText.split("\n")) {
    const m = /^[<>]f.{9} (.+)$/.exec(line);
    if (!m) continue;
    const file = m[1];
    if (!file.endsWith(".html") || file.startsWith("m/")) continue;
    changed.add(file === "index.html" ? `${BASE}/` : `${BASE}/${file.slice(0, -".html".length)}/`);
  }
  return sitemap.filter((u) => changed.has(u));
}

/** Longest wait (one year, in seconds) treated as a real Retry-After; anything beyond is «unknown». */
const MAX_WAIT_SECONDS = 365 * 24 * 3600;

/**
 * Seconds to wait from a Retry-After header (delta-seconds or HTTP-date). Returns null
 * when the value is absent, unparseable or beyond MAX_WAIT_SECONDS. Only used for the
 * message: the 429 stop does not depend on it.
 */
function retryAfterSeconds(value, now) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const v = String(value).trim();
  let seconds;
  if (/^\d+$/.test(v)) {
    seconds = Number(v);
  } else {
    const t = Date.parse(v);
    if (Number.isNaN(t)) return null;
    seconds = Math.max(0, Math.ceil((t - now().getTime()) / 1000));
  }
  return Number.isFinite(seconds) && seconds <= MAX_WAIT_SECONDS ? seconds : null;
}

/** Message for a 429. Never throws: a broken header or clock degrades to «unknown». */
function rateLimitMessage(header, now) {
  const absent = header === null || header === undefined || String(header).trim() === "";
  let wait = null;
  try {
    wait = retryAfterSeconds(header, now);
  } catch {
    wait = null;
  }
  if (wait === null) {
    return absent
      ? "IndexNow: rate limited and the server sent no Retry-After — wait before the next run (at least an hour), then rerun."
      : "IndexNow: rate limited. Retry-After: unknown (the server's value could not be read) — wait at least an hour before the next run, then rerun.";
  }
  try {
    const until = new Date(now().getTime() + wait * 1000).toISOString();
    return `IndexNow: rate limited. Retry-After: ${wait} s (do not retry before ${until}).`;
  } catch {
    return `IndexNow: rate limited. Retry-After: ${wait} s (the retry time could not be computed).`;
  }
}

/**
 * Run the submit. Everything with a side effect is injectable so tests never touch
 * the network or the real build/: fetch, buildDir, now, log, error.
 * Returns the process exit code.
 */
export async function run({
  argv,
  fetch: fetchImpl = globalThis.fetch,
  buildDir = BUILD,
  now = () => new Date(),
  log = console.log,
  error = console.error,
}) {
  const dryRun = argv.includes("--dry-run");
  const all = argv.includes("--all");
  const urlArgs = argv.filter((a) => a.startsWith("http"));
  const planIdx = argv.indexOf("--rsync-plan");
  const planFile = planIdx >= 0 ? argv[planIdx + 1] : undefined;
  if (planIdx >= 0 && !planFile) {
    error("--rsync-plan needs a file path.");
    return 1;
  }

  let urlList;
  if (urlArgs.length) {
    urlList = urlArgs;
  } else if (all) {
    urlList = await sitemapUrls(buildDir);
    if (!urlList.length) {
      error("No URLs to submit.");
      return 1;
    }
  } else if (planFile) {
    let planText;
    try {
      planText = await fs.readFile(planFile, "utf8");
    } catch (err) {
      error(`Cannot read the rsync plan ${planFile}: ${err.message}`);
      return 1;
    }
    urlList = changedUrls(planText, await sitemapUrls(buildDir));
    if (!urlList.length) {
      log("IndexNow: 0 URL(s) changed since the previous deploy — nothing to submit.");
      return 0;
    }
  } else {
    log("IndexNow: nothing to submit — by default only changed URLs are sent, and none were given.");
    log("  Changed pages:  node scripts/indexnow-submit.mjs <url> [url…]");
    log("  Whole site:     node scripts/indexnow-submit.mjs --all   (use rarely: IndexNow is not meant for the full site on every deploy)");
    return 0;
  }

  const { key, keyLocation } = await findKey(buildDir);
  // IndexNow rule: every submitted URL must be on HOST. Parse the URL — a naive
  // startsWith(BASE) would accept https://<host>.evil.com / …@evil.com.
  const bad = urlList.filter((u) => {
    try {
      const x = new URL(u);
      return x.protocol !== "https:" || x.hostname !== HOST;
    } catch {
      return true;
    }
  });
  if (bad.length) {
    error(`Refusing — ${bad.length} URL(s) not on https://${HOST}: ${JSON.stringify(bad.slice(0, 3))}`);
    return 1;
  }

  const payload = { host: HOST, key, keyLocation, urlList };
  log(`IndexNow: ${urlList.length} URL(s), key ${key.slice(0, 6)}…, keyLocation ${keyLocation}`);
  if (dryRun) {
    log(JSON.stringify(payload, null, 2));
    log("(dry-run — nothing sent)");
    return 0;
  }

  let failures = 0;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // IndexNow success = 200 or 202 ("received", not "indexed"); 400/403/422 are
      // actionable failures; 429 = too many requests → stop, honour Retry-After.
      if (res.status === 200 || res.status === 202) {
        log(`  ${endpoint} → ${res.status} ${res.statusText}`);
      } else if (res.status === 429) {
        // The stop must not depend on the header: reading it and formatting the wait
        // are guarded, and the return below is unconditional.
        let header = null;
        try {
          header = res.headers.get("Retry-After");
        } catch {
          header = null;
        }
        error(`  ${endpoint} → 429 Too Many Requests`);
        error(rateLimitMessage(header, now));
        error("IndexNow: stopping — no further request in this run.");
        return EXIT_RATE_LIMITED;
      } else {
        failures++;
        const body = await res.text().catch(() => "");
        error(`  ${endpoint} → ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
      }
    } catch (err) {
      failures++;
      error(`  ${endpoint} → FAILED: ${err.message}`);
    }
  }
  if (failures) {
    error(`IndexNow: ${failures}/${ENDPOINTS.length} endpoint(s) failed.`);
    return 1;
  }
  return 0;
}

// Run as a script (not when imported by tests).
const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  run({ argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
