// brand-client.mjs — build-time bridge that carries brand.config.json into the
// CLIENT (the React prototype site/gf-app.jsx + site/gf-styles.css).
//
// The portal renders client-side, so brand identity can't be read from Node at
// runtime — it must be baked into every emitted page. This module turns the same
// `brand` object (from ./brand.mjs) into the two artifacts the client consumes:
//
//   1. window.__BRAND  — a curated JSON global gf-app.jsx reads (brandName,
//      palette, fonts, funnel, author, telegram, domain). Injected two ways:
//      prerender adds it via page.addInitScript BEFORE render (so the snapshot
//      shows the right brand), and build-seo writes the <script> into <head> so
//      the re-mounting React app reads the same values.
//   2. <style id="brand-tokens">:root{…}</style> — palette + font CSS vars that
//      override gf-styles.css :root globally (see the de-duped :root there).
//
// EdgeLab Space is the default brand: every value below equals the current
// gf-styles.css / gf-app.jsx literal, so the default build is unchanged.
// Zero dependencies — plain string building.

// Fallback tails appended to each configured font FAMILY so the CSS var equals
// the gf-styles.css :root default for the EdgeLab config. Keep these in sync with
// the :root block in site/gf-styles.css (same stacks, verbatim).
const FONT_TAILS = {
  display: ",sans-serif",
  body: ",system-ui,sans-serif",
  mono: ",monospace",
  serif: ", Georgia, 'Times New Roman', serif",
};

// The subset of brand.config.json exposed to the client. Analytics ids / MCP card
// stay server-only (already baked into <head> by build-seo) — no need on window.
export function brandClientPayload(brand) {
  return {
    brandName: brand.brandName,
    domain: brand.domain,
    author: brand.author,
    telegram: brand.telegram,
    palette: brand.palette,
    fonts: brand.fonts,
    funnel: brand.funnel,
    home: brand.home,
  };
}

// The plain JS statement (no <script> wrapper) — used by prerender's
// page.addInitScript so window.__BRAND exists before the React app mounts.
export function brandInitScript(brand) {
  return `window.__BRAND=${JSON.stringify(brandClientPayload(brand))};`;
}

// The <script> tag written into <head> by build-seo so the re-mounting app reads
// the same brand. `<` is escaped so a value can never break out of the script.
// The id is the injectors' idempotency marker (fix-loop 1: a guide whose article
// text mentions window.__BRAND must not suppress the real injection — the guard
// checks for this id inside <head>, not the whole document).
export const BRAND_SCRIPT_ID = "brand-data";
export function brandScriptTag(brand) {
  const json = JSON.stringify(brandClientPayload(brand)).replace(/</g, "\\u003c");
  return `<script id="${BRAND_SCRIPT_ID}">window.__BRAND=${json};</script>`;
}

// The <style> block that overrides the gf-styles.css :root palette + font vars
// from config. Only keys present in config are emitted; a missing section leaves
// the CSS default in force. Placed after the stylesheet link so it wins.
export function brandTokensStyle(brand) {
  const p = brand.palette || {};
  const f = brand.fonts || {};
  const decls = [];
  if (p.accent) decls.push(`--accent:${p.accent}`);
  if (p.ink) decls.push(`--ink:${p.ink}`);
  if (p.offwhite) decls.push(`--offwhite:${p.offwhite}`);
  if (p.bgLight) decls.push(`--bg-light:${p.bgLight}`);
  if (p.bgDark) decls.push(`--bg-dark:${p.bgDark}`);
  if (f.display) decls.push(`--font-display:'${f.display}'${FONT_TAILS.display}`);
  if (f.body) decls.push(`--font-body:'${f.body}'${FONT_TAILS.body}`);
  // --font-ui is the short 'Inter',sans-serif stack a few controls used verbatim
  // (fix-loop 1: keeps the default build's font-failure metrics byte-identical).
  if (f.body) decls.push(`--font-ui:'${f.body}',sans-serif`);
  if (f.mono) decls.push(`--font-mono:'${f.mono}'${FONT_TAILS.mono}`);
  if (f.serif) decls.push(`--font-serif:'${f.serif}'${FONT_TAILS.serif}`);
  if (!decls.length) return "";
  return `<style id="brand-tokens">:root{${decls.join(";")}}</style>`;
}

// The Google-Fonts stylesheet href for this brand (fallback: EdgeLab default).
export function brandFontsHref(brand) {
  return (brand.fonts && brand.fonts.googleHref) || "";
}
