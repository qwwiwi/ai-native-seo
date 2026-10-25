// categories.mjs — the guide taxonomy: category id → display name → pillar page.
//
// Identity is data: a brand declares its categories in brand.config.json
//   "categories": [{ "id": "claude", "name": "Claude Code", "pillar": "/claude-code/" }, …]
// The array order is the display order (catalog facets, the «Все материалы» index).
// `pillar` is optional — a category without its own pillar page gets no middle
// breadcrumb and no sitemap entry of its own. Without the key the engine falls back
// to the taxonomy of the bundled demo content, so an older config builds unchanged.
//
// Which guide belongs to which category stays editorial (SLUG_CAT in
// build-guides-data.mjs); content-lint FAILs a slug that is unmapped or mapped to an
// id that is not declared here.
//
// Shared by build-guides-data.mjs (catName + window.__GF_CATS), build-seo.mjs
// (BreadcrumbList + sitemap pillar URLs) and content-lint.mjs (pillar check).

import brand from "./brand.mjs";

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
  ? brand.categories.map(({ id, name, pillar }) => (pillar ? { id, name, pillar } : { id, name }))
  : DEMO_CATEGORIES;

export const CAT_NAMES = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name]));
export const CAT_PILLAR = Object.fromEntries(CATEGORIES.filter((c) => c.pillar).map((c) => [c.id, c.pillar]));
// An unmapped slug would land here — content-lint FAILs that before it can happen.
export const DEFAULT_CAT = CATEGORIES[0].id;
