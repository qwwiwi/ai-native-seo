// content-lint.mjs — the PRE-BUILD content gate the pipeline (CONTENT-PIPELINE.md
// M5) promised but never had in code. Enforces the SEO/structure invariants that
// were "documented in prose, held together by author discipline" — now a hard gate.
//
// FAIL (exit 1, blocks the build):
//   - missing `description` frontmatter
//   - `type: article` that contains a ``` code fence (articles are prose-only)
//   - a broken internal /guides/<slug>/ link (target slug has no MDX)
//   - a non-stub guide with ZERO in-text /guides/ cross-links (recirculation)
// WARN (printed, non-blocking):
//   - no `## FAQ` section  /  a FAQ section with < 2 `###` Q&A
//   - title without a year (20xx)
//   - body changed vs git HEAD but `updated_at` not bumped (freshness)
//   - non-stub guide with no in-text link to its category pillar
//
// Usage: `node scripts/content-lint.mjs` (or `npm run lint`). Also invoked at the
// start of scripts/prerender.mjs so every build is gated regardless of entry point.

import { promises as fs, existsSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "content-guides");
const COVERS = join(ROOT, "site", "covers");

// A spoke should link to ITS category's pillar page (recirculation + topical
// authority) — a Hermes guide linking to /codex/ must NOT satisfy the check.
// We read SLUG_CAT from build-guides-data.mjs (parsed, NOT imported — that file
// auto-runs the build on import) to know each guide's category. Categories with a
// pillar page: claude→/claude-code/, hermes→/hermes/, codex→/codex/. Others
// (mcp/memory/design/video) have no pillar page → any pillar link is accepted.
const CAT_PILLAR = { claude: "/claude-code/", hermes: "/hermes/", codex: "/codex/" };
const ANY_PILLAR = ["/claude-code/", "/hermes/", "/codex/", "/guides/claude-code-skills/"];
function loadSlugCat() {
  const cat = {};
  try {
    const src = readFileSync(join(__dirname, "build-guides-data.mjs"), "utf8");
    const block = src.match(/const SLUG_CAT = (\{[\s\S]*?\});/);
    if (block) {
      // parse "slug": "cat" pairs with a regex — no eval (Set-style object literal).
      for (const m of block[1].matchAll(/"([a-z0-9-]+)":\s*"([a-z]+)"/g)) cat[m[1]] = m[2];
    }
  } catch {
    /* parse failed — fall back below */
  }
  return cat;
}
const SLUG_CAT = loadSlugCat();
// Fail VISIBLY, not silently: if SLUG_CAT can't be parsed the category→pillar check
// degrades to category-agnostic (a Hermes guide could satisfy the WARN with /codex/).
// Surface that so the drift is noticed (Codex) instead of weakening the gate quietly.
if (Object.keys(SLUG_CAT).length === 0) {
  console.warn("  WARN  content-lint: SLUG_CAT не распознан в build-guides-data.mjs — pillar-проверка category-agnostic (проверь формат SLUG_CAT)");
}

// LEGACY grandfather — now EMPTY (2026-06-24): all 24 legacy guides were backfilled
// with in-text cross-links, so the rule is FULLY FAIL-enforced for every guide. Keep
// the empty set as the documented mechanism — re-add a slug only as a temporary
// exemption if a future bulk import lands without cross-links.
const LEGACY_NO_CROSSLINK = new Set([]);

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = {};
  if (!m) return { fm, body: raw };
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { fm, body: raw.slice(m[0].length) };
}

function bodyOfGitHead(relPath) {
  try {
    const raw = execFileSync("git", ["show", `HEAD:${relPath}`], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    return parseFrontmatter(raw);
  } catch {
    return null; // new file / not in git
  }
}

async function main() {
  const files = (await fs.readdir(SRC)).filter((f) => f.endsWith(".mdx"));
  const slugs = new Set(files.map((f) => basename(f, ".mdx")));
  const fails = [];
  const warns = [];

  for (const file of files) {
    const raw = await fs.readFile(join(SRC, file), "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const slug = fm.slug || basename(file, ".mdx");
    const isStub = String(fm.stub).toLowerCase() === "true";
    const F = (msg) => fails.push(`${slug}: ${msg}`);
    const W = (msg) => warns.push(`${slug}: ${msg}`);

    // Link checks run on PROSE only (strip fenced code) so a `/guides/x/` shown
    // inside a code example isn't mistaken for a real link (Codex M2).
    const prose = body.replace(/```[\s\S]*?```/g, " ");
    const type = (fm.type || "").toLowerCase().trim();

    // ---- FAIL ----
    if (!fm.description) F("нет `description` (карточка/og/meta пустые)");
    if (type === "article") {
      if (/```/.test(body)) F("type:article содержит ``` код-фенс (статьи — только проза)");
      // CONTENT.md: статьи без callout-блоков (они для гайдов).
      if (/^:::(prompt|tip|note|warning|cta)\b/im.test(body)) {
        F("type:article содержит `:::`-callout (prompt/tip/note/warning/cta) — в статьях запрещён");
      }
    }
    // optional trailing slash so /guides/slug and /guides/slug/ both count (Codex M2)
    const internalLinks = [...prose.matchAll(/\/guides\/([a-z0-9-]+)\/?/g)].map((x) => x[1]);
    for (const target of new Set(internalLinks)) {
      if (target !== slug && !slugs.has(target)) F(`битая внутренняя ссылка /guides/${target}/`);
    }
    const crossLinks = internalLinks.filter((t) => t !== slug);
    if (!isStub && crossLinks.length < 1) {
      if (LEGACY_NO_CROSSLINK.has(slug)) {
        W("нет in-text /guides/ кросс-ссылки — LEGACY-grandfather, бэкфилл нужен (станет FAIL)");
      } else {
        F("нет ни одной in-text /guides/ кросс-ссылки (рециркуляция)");
      }
    }

    // ---- WARN ----
    const hasFaq = /^##\s+(FAQ|Частые вопросы|Вопросы и ответы)(?:\s|$)/im.test(body);
    if (!hasFaq) {
      W("нет секции `## FAQ` (FAQPage не эмитится — потеря AEO)");
    } else {
      const after = body.slice(body.search(/^##\s+(FAQ|Частые вопросы|Вопросы и ответы)/im));
      // next H2 after the FAQ heading (slice(2) to skip the FAQ's own "##"); -1 ⇒
      // FAQ is the last section, so the block runs to end-of-body.
      const nextH2 = after.slice(2).search(/^##\s+/m);
      const faqBlock = nextH2 >= 0 ? after.slice(0, nextH2 + 2) : after;
      const qn = (faqBlock.match(/^###\s+/gm) || []).length;
      if (qn < 2) W(`секция FAQ есть, но < 2 Q&A (${qn}) — FAQPage не эмитится`);
    }
    if (fm.title && !/20\d\d/.test(fm.title)) W("в title нет года (20xx) — слабее на свежесть");
    // Cover: «optional but expected» (CONTENT.md) — нет обложки → карточка/og на
    // fallback og-default. WARN, не FAIL: og:image gracefully падает на og-default.
    if (!isStub && !existsSync(join(COVERS, `${slug}.webp`)) && !existsSync(join(COVERS, `${slug}.png`))) {
      W("нет обложки covers/<slug>.(webp|png) — карточка/og на fallback og-default (см. BANNERS.md)");
    }
    const expectedPillar = CAT_PILLAR[SLUG_CAT[slug]];
    const pillarOk = expectedPillar
      ? body.includes(expectedPillar)
      : ANY_PILLAR.some((p) => body.includes(p)); // categories w/o a pillar page
    if (!isStub && !pillarOk) {
      W(`нет ссылки на pillar-страницу категории (${expectedPillar || "любой pillar"})`);
    }
    const head = bodyOfGitHead(`content-guides/${file}`);
    if (head && head.fm.updated_at === fm.updated_at) {
      const bodyChanged = head.body.trim() !== body.trim();
      // CONTENT.md: правки контента И title/description/tags требуют bump updated_at
      // (переобход). Сравниваем не только тело.
      // title/description are scalar in this flat parser; tags is a YAML list the
      // parser doesn't capture as a value, so we compare the two scalars that ARE read.
      const metaChanged = ["title", "description"].some(
        (k) => (head.fm[k] || "") !== (fm[k] || ""));
      if (bodyChanged || metaChanged) {
        W("тело/title/description изменились, но `updated_at` не обновлён (freshness)");
      }
    }
  }

  for (const w of warns) console.warn(`  WARN  ${w}`);
  if (warns.length) console.warn(`\ncontent-lint: ${warns.length} warning(s).`);
  if (fails.length) {
    for (const f of fails) console.error(`  FAIL  ${f}`);
    console.error(`\ncontent-lint: ${fails.length} blocking error(s) — build aborted.`);
    process.exit(1);
  }
  console.log(`content-lint: ${files.length} guides OK (${warns.length} warnings).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
