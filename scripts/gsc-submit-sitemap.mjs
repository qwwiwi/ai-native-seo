// gsc-submit-sitemap.mjs — submit the blog sitemap to Google Search Console via the
// Search Console API (webmasters v3 `sitemaps.submit`). Runs from scripts/deploy.sh
// after rsync so Google re-reads the sitemap (with honest lastmod) on every deploy.
//
// Google does NOT support IndexNow (scripts/indexnow-submit.mjs covers Yandex/Bing
// only) and its Indexing API is only for JobPosting / BroadcastEvent pages — so for
// normal guides the sitemap + Search Console is the only legitimate «please recrawl»
// signal. Do not use the Indexing API for guides.
//
// Identity is brand data (brand.config.json):
//   analytics.gscProperty  the GSC property: sc-domain:<domain> or https://…/ prefix
//   analytics.gscKeyPath   path to a service-account JSON key FILE (Full/Owner on
//                          the property); `~/` is expanded. Never commit the key.
//   domain.site            the sitemap URL is <domain.site>/sitemap.xml
// The key is read locally and NEVER printed; only HTTP statuses are logged.
//
// Usage:
//   node scripts/gsc-submit-sitemap.mjs            # submit + read back status
//   node scripts/gsc-submit-sitemap.mjs --dry-run  # resolve config, no network
//   node scripts/gsc-submit-sitemap.mjs --status   # only read back sitemap status
//   node scripts/gsc-submit-sitemap.mjs --top 10   # top guide pages by clicks (28d)
// Env overrides: GSC_SA_KEY (key path), GSC_SITE (property), GSC_SITEMAP (URL),
//   GSC_API_BASE (tests: a mock of https://www.googleapis.com/webmasters/v3).
// Exit: 0 ok · 2 no property / no key (skipped) · 3 permission denied · 1 other failure.

import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import brand from "./brand.mjs";

const expandHome = (p) => (p && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);
const A = brand.analytics || {};
const BASE = String(brand.domain.site).replace(/\/+$/, "");
const KEY_PATH = expandHome(process.env.GSC_SA_KEY || A.gscKeyPath || "");
const SITE = process.env.GSC_SITE || A.gscProperty || "";
const SITEMAP = process.env.GSC_SITEMAP || `${BASE}/sitemap.xml`;
const SCOPE = "https://www.googleapis.com/auth/webmasters";
const WM = (process.env.GSC_API_BASE || "https://www.googleapis.com/webmasters/v3").replace(/\/+$/, "");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const STATUS_ONLY = args.includes("--status");
const TOP_IDX = args.indexOf("--top");

const b64u = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claim}`);
  const jwt = `${head}.${claim}.${b64u(signer.sign(key.private_key))}`;
  const r = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!r.ok) throw new Error(`token exchange failed: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error("token exchange returned no access_token");
  return j.access_token;
}

function explainDenied(status) {
  console.error(`[gsc] HTTP ${status} — the service account lacks permission on ${SITE}.`);
  console.error("[gsc] Manual step for the property owner:");
  console.error(`[gsc]   search.google.com/search-console → property «${SITE}» → Settings →`);
  console.error("[gsc]   Users and permissions → Add user → the service-account e-mail from the key → Full (or Owner).");
  console.error(`[gsc]   Or submit by hand: Sitemaps → «${SITEMAP}» → Submit.`);
}

async function main() {
  console.log(`[gsc] site=${SITE || "-"} sitemap=${SITEMAP}`);
  if (!SITE) {
    console.warn("[gsc] no GSC property (analytics.gscProperty / GSC_SITE) — sitemap submit SKIPPED.");
    process.exit(2);
  }
  if (!KEY_PATH || !existsSync(KEY_PATH)) {
    console.warn("[gsc] service-account key not found (analytics.gscKeyPath / GSC_SA_KEY) — sitemap submit SKIPPED.");
    process.exit(2);
  }
  if (DRY) { console.log("[gsc] --dry-run: key present, no network calls."); return; }
  const key = JSON.parse(readFileSync(KEY_PATH, "utf8"));
  const token = await accessToken(key);
  const auth = { Authorization: `Bearer ${token}` };
  const base = `${WM}/sites/${encodeURIComponent(SITE)}`;

  if (TOP_IDX >= 0) {
    const n = Number(args[TOP_IDX + 1]) || 10;
    const end = new Date(); const start = new Date(Date.now() - 28 * 864e5);
    const r = await fetch(`${base}/searchAnalytics/query`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
        dimensions: ["page"], rowLimit: n,
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: `${new URL(BASE).host}/guides/` }] }],
      }),
    });
    if (r.status === 401 || r.status === 403) { explainDenied(r.status); process.exit(3); }
    if (!r.ok) throw new Error(`searchAnalytics HTTP ${r.status}`);
    for (const row of (await r.json()).rows || []) {
      console.log(`${String(row.clicks).padStart(5)} clicks ${String(row.impressions).padStart(7)} impr  ${row.keys[0]}`);
    }
    return;
  }

  if (!STATUS_ONLY) {
    const r = await fetch(`${base}/sitemaps/${encodeURIComponent(SITEMAP)}`, { method: "PUT", headers: auth });
    if (r.status === 401 || r.status === 403) { explainDenied(r.status); process.exit(3); }
    if (!r.ok) throw new Error(`sitemaps.submit HTTP ${r.status}`);
    console.log(`[gsc] sitemaps.submit → HTTP ${r.status} (accepted)`);
  }
  const g = await fetch(`${base}/sitemaps/${encodeURIComponent(SITEMAP)}`, { headers: auth });
  if (g.status === 401 || g.status === 403) { explainDenied(g.status); process.exit(3); }
  if (!g.ok) throw new Error(`sitemaps.get HTTP ${g.status}`);
  const s = await g.json();
  const sub = (s.contents || []).map((c) => `${c.type}:${c.submitted}`).join(", ");
  console.log(`[gsc] status: lastSubmitted=${s.lastSubmitted || "-"} lastDownloaded=${s.lastDownloaded || "-"} ` +
    `isPending=${s.isPending} errors=${s.errors ?? 0} warnings=${s.warnings ?? 0} contents=[${sub}]`);
}

main().catch((e) => { console.error(`[gsc] ${e.message}`); process.exit(1); });
