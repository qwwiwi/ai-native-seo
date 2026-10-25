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
//
// GOOGLE RULES (2026-10-18, docs/CONTENT-PIPELINE.md «Правила Google»). FAIL for every
// guide published on/after GOOGLE_RULES_SINCE; older guides get ONE summary line per
// rule (backfill list), so the legacy corpus does not drown the output:
//   - the answer up front: ≥ LEAD_MIN_CHARS of prose before the first `##`, and it
//     mentions a key word of the title (no throat-clearing intro);
//   - ≥ 3 first-hand proofs (screenshots / video / real commands / own data tables /
//     `proofs:` frontmatter list items);
//   - a «Проверено на <что>, <месяц> <год>» line;
//   - an AI-assisted disclosure line («подготовлен с помощью ИИ…»);
//   - `author:` frontmatter;
//   - real dates: valid ISO `published_at`/`updated_at`, not in the future, updated ≥ published;
//   - thin content: body < THIN_MIN_WORDS words.
// FAIL for ALL guides:
//   - `updated_at` bumped with ZERO text change (fake freshness) — vs HEAD for
//     uncommitted work, vs the previous version for an already-committed bump;
//   - slug missing from SLUG_CAT (it would silently fall into the first category — wrong
//     breadcrumb/pillar) or slug ≠ filename (it would never reach the sitemap URL);
//   - a SLUG_CAT category id that the brand taxonomy (`categories`) does not declare;
// WARN for ALL guides:
//   - overlap with an existing guide (title/body similarity) — cannibalisation risk.
//
// The demo guides shipped with the engine were all published before
// GOOGLE_RULES_SINCE, so they are grandfathered by that cutoff (backlog summary only);
// every guide a brand publishes from then on must pass every rule.
//
// Usage: `node scripts/content-lint.mjs` (or `npm run lint`). Also invoked at the
// start of scripts/prerender.mjs so every build is gated regardless of entry point.
// CONTENT_GUIDES_DIR=<dir> lints another MDX directory (tests use it on a copy).

import { promises as fs, existsSync, readFileSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { isMaterialChange, readableWords, changedWords } from "./content-dates.mjs";
import { CAT_NAMES, CAT_PILLAR, DEFAULT_CAT } from "./categories.mjs";
import brand from "./brand.mjs";

// Google-rule gate start: guides published on/after this date must pass every rule.
const GOOGLE_RULES_SINCE = "2026-10-18";
const LEAD_MIN_CHARS = 250;
const THIN_MIN_WORDS = 600;
const MIN_PROOFS = 3;
// Similarity thresholds for the overlap WARN (calibrated on the 47-guide corpus:
// closest legit pairs on 2026-10-18: title 0.40, body 0.07 — a rewrite/copy is 0.3+).
const TITLE_OVERLAP = 0.5;
const BODY_OVERLAP = 0.2;
const RU_MONTHS = "(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = process.env.CONTENT_GUIDES_DIR ? resolve(process.env.CONTENT_GUIDES_DIR) : join(ROOT, "content-guides");
const COVERS = join(ROOT, "site", "covers");

// A spoke should link to ITS category's pillar page (recirculation + topical
// authority) — a Hermes guide linking to /codex/ must NOT satisfy the check.
// We read SLUG_CAT from build-guides-data.mjs (parsed, NOT imported — that file
// auto-runs the build on import) to know each guide's category. Pillar pages come
// from the brand taxonomy (`categories[].pillar`, see scripts/categories.mjs);
// categories without a pillar accept any pillar link or a hub guide the brand lists
// in `content.hubPages`.
const ANY_PILLAR = [...new Set([...Object.values(CAT_PILLAR), ...((brand.content && brand.content.hubPages) || [])])];
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

// ---- Google-rule helpers ------------------------------------------------------
// Generic stop words + the brand's niche words that sit in almost every title
// (brand config `content.titleStopWords`) — they prove nothing about the lead.
const STOP = new Set([
  "2026", "2025", "как", "что", "для", "это", "или", "без", "под", "про", "при", "чем", "чтобы",
  ...((brand.content && brand.content.titleStopWords) || []).map((w) => String(w).toLowerCase()),
]);
function titleWords(title) {
  return readableWords(title).filter((w) => w.length >= 4 && !STOP.has(w));
}
// Lead = prose before the first H2 (the reader's first screen).
function leadOf(body) {
  const cut = body.search(/^##\s/m);
  return (cut >= 0 ? body.slice(0, cut) : body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^(#|```|:::|\||!\[|<)/.test(p))
    .slice(0, 3)
    .join(" ");
}
// First-hand evidence a reader (and Google) can see: real screenshots/images (not
// diagrams), video clips, real commands (shell fences / `$ ` lines), own data tables,
// plus `proofs:` frontmatter items the author lists for anything else (own numbers…).
function countProofs(body, fmProofs) {
  const prose = body;
  const shots = [...prose.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].filter((m) => !/\/images\/diagrams\//.test(m[1])).length;
  const videos = (prose.match(/^:::kinescope\s+\S+/gm) || []).length;
  const cmds = (prose.match(/^```(?:bash|sh|shell|zsh|console|powershell|ps1|terminal)\b/gm) || []).length;
  const tables = (prose.match(/^\|.+\|\s*\n\|[\s:|-]+\|/gm) || []).length;
  const listed = Array.isArray(fmProofs) ? fmProofs.filter((p) => String(p).trim().length >= 10).length : 0;
  return { total: shots + videos + cmds + tables + listed, shots, videos, cmds, tables, listed };
}
function shingles(words, n = 3) {
  const s = new Set();
  for (let i = 0; i + n <= words.length; i++) s.add(words.slice(i, i + n).join(" "));
  return s;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
// YAML list under `key:` (flat parser above only keeps scalars).
function fmList(raw, key) {
  const m = raw.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)+)`, "m"));
  return m ? m[1].split("\n").map((l) => l.replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, "").trim()).filter(Boolean) : [];
}
function validIso(s) {
  return /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(s || "") && !Number.isNaN(new Date(s).getTime());
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

// The file as of the commit BEFORE the last commit that touched it (null if none,
// or if that last commit predates the rule — old history is not re-litigated).
function bodyOfPrevVersion(relPath) {
  try {
    const rows = execFileSync("git", ["log", "-2", "--format=%H %cI", "--", relPath], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim().split("\n").filter(Boolean).map((l) => l.split(" "));
    if (rows.length < 2 || rows[0][1].slice(0, 10) < GOOGLE_RULES_SINCE) return null;
    const raw = execFileSync("git", ["show", `${rows[1][0]}:${relPath}`], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    return parseFrontmatter(raw);
  } catch {
    return null;
  }
}

async function main() {
  const files = (await fs.readdir(SRC)).filter((f) => f.endsWith(".mdx"));
  const slugs = new Set(files.map((f) => basename(f, ".mdx")));
  const fails = [];
  const warns = [];
  const legacy = {}; // rule → legacy slugs missing it (summary, not per-guide noise)
  const docs = []; // for the overlap check

  for (const file of files) {
    const raw = await fs.readFile(join(SRC, file), "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const slug = fm.slug || basename(file, ".mdx");
    const isStub = String(fm.stub).toLowerCase() === "true";
    const F = (msg) => fails.push(`${slug}: ${msg}`);
    const W = (msg) => warns.push(`${slug}: ${msg}`);
    // A category listing page's H1 is the category name (gf-app CategoryPage). A guide
    // with the SAME H1 makes the two pages indistinguishable for Google (the old bug
    // rendered the first guide on the category URL) — FAIL, rename one of them.
    const sameAsCat = Object.entries(CAT_PILLAR).find(([id]) =>
      String(CAT_NAMES[id] || "").trim().toLowerCase() === String(fm.title || "").trim().toLowerCase());
    if (sameAsCat) F(`H1/title «${fm.title}» совпадает с H1 страницы категории ${sameAsCat[1]} — переименуй гайд`);

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
    // Canonical internal URLs only: /guides/<slug>/ with the slash. /guides/<slug> and
    // .html now 301 (Caddy) — a link through a redirect wastes crawl and link equity.
    for (const m of prose.matchAll(/\]\((\/guides\/[a-z0-9-]+(?:\.html)?)(?=[)#?])/g)) {
      F(`внутренняя ссылка ${m[1]} без завершающего «/» — пиши канонический /guides/<slug>/`);
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
      // A MATERIAL body change (or a new title/description) should carry an
      // updated_at bump so the frontmatter stays in sync with the honest date.
      // title/description are scalar in this flat parser; tags is a YAML list the
      // parser doesn't capture as a value, so we compare the two scalars that ARE read.
      const metaChanged = ["title", "description"].some(
        (k) => (head.fm[k] || "") !== (fm[k] || ""));
      if (isMaterialChange(head.body, body) || metaChanged) {
        W("тело/title/description изменились, но `updated_at` не обновлён (freshness)");
      }
    }
    // Fake freshness: the date moved, the text did not. Google learns to ignore a
    // site's dates after this — FAIL for every guide (old or new). Compared against
    // HEAD for uncommitted work; when the file equals HEAD (already committed /
    // squash-merged) against the previous version of the file, so a committed
    // date-only bump is caught too. A small but real text fix (a price, a version)
    // changes ≥1 word and passes; ONLY a bump with zero text change fails.
    const base = head && head.body.trim() === body.trim() && head.fm.updated_at === fm.updated_at
      ? bodyOfPrevVersion(`content-guides/${file}`)
      : head;
    if (base && base.fm.updated_at && fm.updated_at !== base.fm.updated_at && changedWords(base.body, body) === 0) {
      F(`updated_at сдвинут (${base.fm.updated_at} → ${fm.updated_at}) без единой правки текста — ` +
        "дату без изменения контента не двигаем");
    }

    // ---- auto-inclusion: category map + slug/filename (sitemap URL, cross-links) ----
    if (fm.slug && fm.slug !== basename(file, ".mdx")) {
      F(`slug "${fm.slug}" ≠ имя файла — URL в sitemap и кросс-ссылках не совпадут`);
    }
    if (Object.keys(SLUG_CAT).length && !SLUG_CAT[slug]) {
      F(`slug не добавлен в SLUG_CAT (build-guides-data.mjs) — гайд молча уедет в «${CAT_NAMES[DEFAULT_CAT]}» с чужой хлебной крошкой`);
    } else if (SLUG_CAT[slug] && !CAT_NAMES[SLUG_CAT[slug]]) {
      F(`категория «${SLUG_CAT[slug]}» из SLUG_CAT не объявлена в \`categories\` конфига бренда — у гайда не будет имени категории`);
    }

    // ---- Google rules (FAIL for new guides, backfill summary for legacy) ----
    if (!isStub) {
      const pub = String(fm.published_at || "");
      const isNew = !pub || pub.slice(0, 10) >= GOOGLE_RULES_SINCE;
      const G = (rule, msg) => {
        if (isNew) F(`[google] ${msg}`);
        else (legacy[rule] = legacy[rule] || []).push(slug);
      };

      const lead = leadOf(body);
      const tw = titleWords(fm.title || "");
      const leadWords = readableWords(lead);
      const leadHit = tw.some((w) => leadWords.some((lw) => lw.slice(0, 5) === w.slice(0, 5)));
      if (lead.length < LEAD_MIN_CHARS || (tw.length && !leadHit)) {
        G("lead", `ответа нет в первых абзацах: до первого ## нужно ≥${LEAD_MIN_CHARS} симв. прозы со словом из title (сейчас ${lead.length})`);
      }
      const proofs = countProofs(body, fmList(raw, "proofs"));
      if (proofs.total < MIN_PROOFS) {
        G("proofs", `мало доказательств из первых рук: ${proofs.total} < ${MIN_PROOFS} ` +
          `(скриншоты ${proofs.shots}, видео ${proofs.videos}, команды ${proofs.cmds}, таблицы ${proofs.tables}, proofs: ${proofs.listed})`);
      }
      if (!new RegExp(`Проверено на [^\\n]+,\\s*${RU_MONTHS}\\s+20\\d\\d`, "i").test(body)) {
        G("tested", "нет строки «Проверено на <что>, <месяц> <год>»");
      }
      if (!/(с помощью|при участии|вместе с)\s+(ИИ|AI|нейросет|Claude|LLM)/i.test(body)) {
        G("ai", "нет строки о помощи ИИ («Текст подготовлен с помощью ИИ и проверен автором»)");
      }
      if (!fm.author) G("author", "нет `author:` во frontmatter");
      const soon = Date.now() + 864e5;
      const pubT = new Date(fm.published_at).getTime();
      const updT = new Date(fm.updated_at).getTime();
      const datesOk = validIso(fm.published_at) && validIso(fm.updated_at) && pubT <= soon && updT <= soon && updT >= pubT;
      if (!datesOk) G("dates", "даты не настоящие: published_at/updated_at — валидный ISO, не в будущем, updated ≥ published");
      const nWords = readableWords(prose).length;
      if (nWords < THIN_MIN_WORDS) G("thin", `тонкий материал: ${nWords} слов < ${THIN_MIN_WORDS}`);
      docs.push({
        slug, isNew,
        changed: !head || head.body.trim() !== body.trim(),
        tset: new Set(tw),
        words: shingles(readableWords(prose)),
      });
    }
  }

  // ---- overlap / cannibalisation (WARN): only pairs involving a new or edited guide
  // (or every pair with --overlap-all), so the legacy corpus is not re-litigated daily.
  const ALL = process.argv.includes("--overlap-all");
  if (process.argv.includes("--overlap-report")) {
    // Calibration aid: the 10 closest pairs in the corpus.
    const pairs = [];
    for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
      pairs.push([jaccard(docs[i].tset, docs[j].tset), jaccard(docs[i].words, docs[j].words), docs[i].slug, docs[j].slug]);
    }
    for (const k of [0, 1]) {
      console.log(k ? "top body overlap:" : "top title overlap:");
      for (const p of pairs.sort((a, b) => b[k] - a[k]).slice(0, 6)) console.log(`  ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${p[2]} ↔ ${p[3]}`);
    }
  }
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i];
      const b = docs[j];
      if (!ALL && !(a.isNew || b.isNew || a.changed || b.changed)) continue;
      const t = jaccard(a.tset, b.tset);
      const w = jaccard(a.words, b.words);
      if (t >= TITLE_OVERLAP || w >= BODY_OVERLAP) {
        warns.push(`${a.slug} ↔ ${b.slug}: пересечение кластера (title ${t.toFixed(2)}, текст ${w.toFixed(2)}) — ` +
          "не дублируй: расширь существующий гайд или разведи интенты");
      }
    }
  }
  const legacyRules = Object.entries(legacy);
  if (legacyRules.length) {
    console.warn(`  INFO  правила Google обязательны с ${GOOGLE_RULES_SINCE}; бэклог старых гайдов:`);
    for (const [rule, list] of legacyRules) console.warn(`        ${rule.padEnd(7)} ${list.length} гайдов`);
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
