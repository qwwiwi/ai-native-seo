// brand.mjs — single source of brand/identity config for the SEO/build layer.
//
// Loads brand.config.json from the repo root. The path can be overridden with
// the BRAND_CONFIG env var (absolute, or relative to the repo root) — this is how
// the same generator white-labels for a different brand without a code change:
//   BRAND_CONFIG=brand.config.example.json npm run build
//
// EdgeLab Space is the default brand (brand.config.json). Swapping the config
// rewrites the whole SEO / GEO / agent-native identity layer (domains, author,
// MCP server card, analytics ids). Zero dependencies — plain fs + JSON.parse.

import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const override = process.env.BRAND_CONFIG;
const configPath = override
  ? (isAbsolute(override) ? override : join(ROOT, override))
  : join(ROOT, "brand.config.json");

const brand = JSON.parse(readFileSync(configPath, "utf8"));

// ---- build-time validation gate (white-label M1, dual-review fix-loop 1) ----
// A white-label engine ingests THIRD-PARTY configs. Every value below ends up
// inside emitted <style>, <script>, href attributes or React hrefs — so a
// malformed/malicious config must fail the BUILD with a clear error, never
// reach the generated HTML. This is the single gate for ALL consumers
// (build-seo, brand-client, prerender, tools/covers).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// Google-Fonts family names: letters/digits/spaces/hyphens (no quotes/braces —
// the value is interpolated into a quoted CSS font-family and a :root block).
const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;
const HTTPS_URL = /^https:\/\/[^"'<>\\ ]+$/;

function fail(key, value, want) {
  throw new Error(
    `brand config ${configPath}: "${key}" ${want}, got ${JSON.stringify(value)}`,
  );
}

function validateBrand(b) {
  if (typeof b.brandName !== "string" || !b.brandName.trim())
    fail("brandName", b.brandName, "must be a non-empty string");
  for (const [k, v] of Object.entries(b.palette || {}))
    if (!HEX_COLOR.test(String(v))) fail(`palette.${k}`, v, "must be a hex color like #D4FF00");
  for (const k of ["display", "body", "mono", "serif"]) {
    const v = (b.fonts || {})[k];
    if (v !== undefined && !FONT_NAME.test(String(v)))
      fail(`fonts.${k}`, v, "must be a plain font-family name (letters/digits/spaces/hyphens)");
  }
  const gh = (b.fonts || {}).googleHref;
  if (gh !== undefined && (!/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(gh) || /["<>\\]/.test(gh)))
    fail("fonts.googleHref", gh, "must be an https://fonts.googleapis.com/css2? URL without quotes/angle brackets");
  // Outbound URLs rendered as hrefs by the client. React 18 does NOT block
  // javascript: URLs (blocking landed in React 19) — enforce https here once.
  const urlKeys = [
    ["domain.site", b.domain && b.domain.site],
    ["domain.apex", b.domain && b.domain.apex],
    ["author.url", b.author && b.author.url],
    ["telegram.url", b.telegram && b.telegram.url],
    ["telegram.channelUrl", b.telegram && b.telegram.channelUrl],
    ["funnel.targetUrl", b.funnel && b.funnel.targetUrl],
    ["funnel.docs.privacy", b.funnel && b.funnel.docs && b.funnel.docs.privacy],
    ["funnel.docs.offer", b.funnel && b.funnel.docs && b.funnel.docs.offer],
    ["mcpIdentity.serverUrl", b.mcpIdentity && b.mcpIdentity.serverUrl],
    ["mcpIdentity.apiUrl", b.mcpIdentity && b.mcpIdentity.apiUrl],
    ["mcpIdentity.docsUrl", b.mcpIdentity && b.mcpIdentity.docsUrl],
  ];
  for (const [k, v] of urlKeys)
    if (v !== undefined && !HTTPS_URL.test(String(v))) fail(k, v, "must be a clean https:// URL");
  const home = b.home || {};
  if (home.ctaHref !== undefined && !/^(https:\/\/[^"'<>\\ ]+|\/(?!\/)[^"'<>\\ ]*)$/.test(String(home.ctaHref)))
    fail("home.ctaHref", home.ctaHref, "must be https:// or a site-relative /path");
  if (home.heroImage !== undefined && !/^\/[^"'<>\\ ]*$/.test(String(home.heroImage)))
    fail("home.heroImage", home.heroImage, "must be a site-relative /path");
  const a = b.analytics || {};
  if (a.ga4 !== undefined && !/^G-[A-Z0-9]+$/.test(String(a.ga4)))
    fail("analytics.ga4", a.ga4, "must look like G-XXXXXXXXXX");
  if (a.metrika !== undefined && !/^\d+$/.test(String(a.metrika)))
    fail("analytics.metrika", a.metrika, "must be a numeric counter id");
  if (a.indexNowKey !== undefined && !/^[A-Za-z0-9-]{8,64}$/.test(String(a.indexNowKey)))
    fail("analytics.indexNowKey", a.indexNowKey, "must be 8-64 alphanumeric chars");
  return b;
}

export default validateBrand(brand);
