// categories.mjs — the guide taxonomy: category id → display name → pillar page.
//
// Identity is data: a brand declares its categories in brand.config.json
//   "categories": [{ "id": "claude", "name": "Claude Code", "pillar": "/claude-code/" }, …]
// The array order is the display order (catalog facets, the «Все материалы» index).
// `pillar` is optional — a category without its own pillar page gets no middle
// breadcrumb and no sitemap entry of its own. A pillar page exists only while the
// category has guides (categoryPages below) and site/<pillar-slug>.html sets
// window.__GF_CAT to the id. `description` (optional) is the listing intro + meta
// description; without it one is built from the listed guides. Without the key the engine falls back
// to the taxonomy of the bundled demo content, so an older config builds unchanged.
//
// Which guide belongs to which category stays editorial (SLUG_CAT in
// build-guides-data.mjs); content-lint FAILs a slug that is unmapped or mapped to an
// id that is not declared here.
//
// Shared by build-guides-data.mjs (catName + window.__GF_CATS), build-seo.mjs
// (BreadcrumbList, sitemap, category <head>), prerender.mjs (category routes),
// content-lint.mjs (pillar check) and verify-category-pages.mjs.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import brand from "./brand.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "site");

// Taxonomy of the demo content in content-guides/ (the editorial layer).
export const DEMO_CATEGORIES = [
  { id: "claude", name: "Claude Code", pillar: "/claude-code/" },
  { id: "ai", name: "AI-агенты и модели" },
  { id: "mcp", name: "MCP-серверы" },
  { id: "memory", name: "База знаний" },
  { id: "design", name: "Дизайн" },
  { id: "video", name: "Автоматизация видео" },
  { id: "hermes", name: "Hermes", pillar: "/hermes/" },
  { id: "codex", name: "Codex", pillar: "/codex/" },
];

export const CATEGORIES = Array.isArray(brand.categories) && brand.categories.length
  ? brand.categories.map(({ id, name, pillar, description }) => ({
    id, name, ...(pillar ? { pillar } : {}), ...(description ? { description } : {}),
  }))
  : DEMO_CATEGORIES;

export const CAT_NAMES = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
export const CAT_PILLAR = Object.fromEntries(CATEGORIES.filter((c) => c.pillar).map((c) => [c.id, c.pillar]));
// An unmapped slug would land here — content-lint FAILs that before it can happen.
export const DEFAULT_CAT = CATEGORIES[0].id;

// "/claude-code/" → "claude-code.html": the site/ source page and the build/ output
// of a pillar (the mobile twin is m/<same file>).
export const pillarFile = (pillar) => `${String(pillar).replace(/^\/|\/$/g, "")}.html`;

const plural = (n, one, few, many) => {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};

/**
 * Intro + meta description of a category listing page. The brand's own
 * `categories[].description` wins; otherwise it is built from the listed guides
 * (count + their titles) — never a «Гайды по теме X» template that is the same
 * on every category page.
 */
export function categoryDescription(cat, guides) {
  if (cat.description) return cat.description;
  const titles = guides.map((g) => g.title).filter(Boolean);
  const n = titles.length;
  let s = `${cat.name}: ${n} ${plural(n, "материал", "материала", "материалов")} — ${titles.slice(0, 3).join("; ")}` +
    `${n > 3 ? " и другие" : ""}.`;
  if (s.length > 200) s = `${s.slice(0, 199).replace(/\s+\S*$/, "")}…`;
  return s;
}

/**
 * The category landing pages that EXIST, derived from content: a declared pillar,
 * at least one guide in the category and its site/<pillar-slug>.html. Breadcrumbs, the sitemap, the prerender
 * routes and the nav all read this list, so none of them can point at a pillar
 * that has no page (or keep a page for a category whose guides moved away).
 * @param {Array<{cat: string, title: string, slug: string}>} guides
 */
export function categoryPages(guides) {
  return CATEGORIES.filter((c) => c.pillar).map((c) => {
    const items = guides.filter((g) => g.cat === c.id);
    return { ...c, file: pillarFile(c.pillar), count: items.length, description: categoryDescription(c, items) };
  }).filter((c) => c.count > 0 && existsSync(join(SITE, c.file)));
}
