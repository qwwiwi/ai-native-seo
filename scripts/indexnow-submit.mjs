// indexnow-submit.mjs — ping IndexNow (Yandex + Bing) with changed/new URLs so
// they re-crawl instantly instead of waiting for the next scheduled crawl.
//
// IndexNow is one protocol shared by Yandex, Bing, Seznam… A single key file
// (build/<KEY>.txt, emitted by build-seo.mjs) authenticates us. We POST to both
// the Yandex-native endpoint and the generic api.indexnow.org so both engines
// get it directly (they also share submissions, but pinging both is belt-and-
// suspenders and the task asks for Яндекс+Bing).
//
// Usage (run AFTER deploy, when the URLs are already live — IndexNow validates
// that the submitted URLs resolve):
//   node scripts/indexnow-submit.mjs                # all sitemap URLs
//   node scripts/indexnow-submit.mjs <url> [url…]   # only these (changed-only)
//   node scripts/indexnow-submit.mjs --dry-run      # print payload, send nothing
//
// Reads the key from build/<KEY>.txt (the single file present in build/), so the
// key never has to be duplicated here.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promises as fs } from "node:fs";
import brand from "./brand.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");

// HOST/BASE derive from the active brand config (brand.domain.site), so IndexNow
// submits to the brand's own host — no hardcoded domain.
const BASE = brand.domain.site;
const HOST = new URL(BASE).hostname;
const ENDPOINTS = [
  "https://yandex.com/indexnow", // Yandex-native
  "https://api.indexnow.org/indexnow", // generic (Bing / Seznam / shared)
];

async function findKey() {
  // The key file is the lone <32-hex>.txt sitting at build/ root.
  const entries = await fs.readdir(BUILD);
  const keyFile = entries.find((f) => /^[a-f0-9]{8,128}\.txt$/i.test(f));
  if (!keyFile) {
    throw new Error("IndexNow key file not found in build/ — run build-seo first");
  }
  const key = (await fs.readFile(join(BUILD, keyFile), "utf8")).trim();
  return { key, keyLocation: `${BASE}/${keyFile}` };
}

async function sitemapUrls() {
  const xml = await fs.readFile(join(BUILD, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const urlArgs = args.filter((a) => a.startsWith("http"));

  const { key, keyLocation } = await findKey();
  const urlList = urlArgs.length ? urlArgs : await sitemapUrls();
  if (!urlList.length) {
    console.error("No URLs to submit.");
    process.exit(1);
  }
  // IndexNow rule: every submitted URL must be on HOST. Parse the URL — a naive
  // startsWith(BASE) would accept https://blog.edgelab.space.evil.com / …@evil.com.
  const bad = urlList.filter((u) => {
    try {
      const x = new URL(u);
      return x.protocol !== "https:" || x.hostname !== HOST;
    } catch {
      return true;
    }
  });
  if (bad.length) {
    console.error(`Refusing — ${bad.length} URL(s) not on https://${HOST}:`, bad.slice(0, 3));
    process.exit(1);
  }

  const payload = { host: HOST, key, keyLocation, urlList };
  console.log(`IndexNow: ${urlList.length} URL(s), key ${key.slice(0, 6)}…, keyLocation ${keyLocation}`);
  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    console.log("(dry-run — nothing sent)");
    return;
  }

  let failures = 0;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // IndexNow success = 200 or 202; 400/403/422/429 are actionable failures.
      if (res.status === 200 || res.status === 202) {
        console.log(`  ${endpoint} → ${res.status} ${res.statusText}`);
      } else {
        failures++;
        const body = await res.text().catch(() => "");
        console.error(`  ${endpoint} → ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
      }
    } catch (err) {
      failures++;
      console.error(`  ${endpoint} → FAILED: ${err.message}`);
    }
  }
  if (failures) {
    console.error(`IndexNow: ${failures}/${ENDPOINTS.length} endpoint(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
