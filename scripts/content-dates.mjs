// content-dates.mjs — honest «last modified» dates for guides, from git history.
//
// Google uses <lastmod> / dateModified only while they stay trustworthy: a date that
// moves without a real content change teaches it to ignore the signal for the whole
// site. So the build no longer trusts the frontmatter `updated_at` alone. The honest
// date of a guide = the commit date of the LAST commit that materially changed its
// TEXT. Cosmetic edits do not count:
//   - frontmatter-only edits (date bumps, tags, cover tweaks);
//   - link-only edits (a URL changed, a cross-link wrapped around existing words);
//   - whitespace / punctuation / markdown-markup churn;
//   - small diffs below MIN_CHANGED_WORDS words (a reworded CTA, a typo fix).
// A small but real factual fix (price, version, command) counts when its commit
// subject contains «[content]».
//
// Special cases:
//   - the commit that ADDED the file (often a bulk import) is not proof the text was
//     written that day → a frontmatter `updated_at` not later than it wins;
//   - an uncommitted material edit (guide being written right now) → the frontmatter
//     `updated_at` if it is newer than the last content commit;
//   - a file not in git yet → frontmatter dates;
//   - never earlier than `published_at`.
//
// Shared by build-guides-data.mjs (catalog dates → sitemap / JSON-LD / «Обновлено»)
// and content-lint.mjs (FAIL on a date bump without a content change).

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// A change smaller than this many words (symmetric difference of the normalized
// word multisets) is treated as cosmetic.
export const MIN_CHANGED_WORDS = 30;

function runGit(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20,
    });
  } catch {
    return null;
  }
}

let shallowChecked = false;

function toIso(d) {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString();
}
const ms = (d) => (d ? new Date(d).getTime() || 0 : 0);

/** Strip YAML frontmatter. */
export function bodyOf(raw) {
  const s = String(raw || "");
  const m = s.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? s.slice(m[0].length) : s;
}

/**
 * Normalize a markdown body to the words a reader actually reads: links collapse
 * to their anchor text; URLs, markup, punctuation, case and whitespace vanish.
 */
export function readableWords(body) {
  return String(body || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/https?:\/\/\S+/g, " ") // bare URLs
    .replace(/[`*_>#|~=:\-–—()[\]{}.,;!?«»"'/\\]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Number of words changed between two bodies (multiset symmetric difference). */
export function changedWords(a, b) {
  const count = (ws) => ws.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  const A = count(readableWords(a));
  const B = count(readableWords(b));
  let diff = 0;
  for (const [w, n] of A) diff += Math.abs(n - (B.get(w) || 0));
  for (const [w, n] of B) if (!A.has(w)) diff += n;
  return diff;
}

export function isMaterialChange(a, b) {
  return changedWords(a, b) >= MIN_CHANGED_WORDS;
}

/**
 * The last commit that materially changed the body of `relPath`, walking history
 * newest → oldest. Returns { date, creation, fmUpdated? } (creation = that commit
 * ADDED the file; fmUpdated = its frontmatter `updated_at` at that commit) or null
 * when git has no history for it.
 */
export function lastContentCommit(root, relPath) {
  // A shallow clone ends history early: its oldest commit would look like the file's
  // creation and dates would differ from a full clone. Say so loudly.
  if (!shallowChecked) {
    shallowChecked = true;
    if ((runGit(root, ["rev-parse", "--is-shallow-repository"]) || "").trim() === "true") {
      console.warn("[content-dates] WARN: shallow clone — honest dates need full history (fetch --unshallow)");
    }
  }
  const log = runGit(root, ["log", "--follow", "--name-only", "--format=@@%H %cI %s", "--", relPath]);
  if (!log || !log.trim()) return null;
  // "@@<sha> <date>" header lines, each followed by the file's path at that commit
  // (--follow tracks renames, so the path can differ per commit).
  const commits = [];
  for (const line of log.split("\n")) {
    if (line.startsWith("@@")) {
      const [sha, date, ...subj] = line.slice(2).split(" ");
      // «[content]» in the commit subject marks a small but REAL factual update
      // (a price, a version, a command) that should move the date anyway.
      commits.push({ sha, date, path: null, forced: /\[content\]/i.test(subj.join(" ")) });
    } else if (line.trim() && commits.length && !commits[commits.length - 1].path) {
      commits[commits.length - 1].path = line.trim();
    }
  }
  if (!commits.length) return null;
  const rawAt = (c) => runGit(root, ["show", `${c.sha}:${c.path || relPath}`]);
  const bodyAt = (c) => {
    const raw = rawAt(c);
    return raw == null ? null : bodyOf(raw);
  };
  // The creation commit's OWN frontmatter date: a later date-only bump must not
  // replace it (that would move the honest date to the import day).
  const created = (c) => ({ date: toIso(c.date), creation: true, fmUpdated: fmUpdatedOf(rawAt(c)) });
  let newer = bodyAt(commits[0]);
  for (let i = 0; i < commits.length; i++) {
    const older = i + 1 < commits.length ? bodyAt(commits[i + 1]) : null;
    if (older == null) return created(commits[i]);
    if (commits[i].forced || isMaterialChange(newer, older)) return { date: toIso(commits[i].date), creation: false };
    newer = older;
  }
  return created(commits[commits.length - 1]);
}

/** Frontmatter `updated_at` of a raw MDX file (ISO, or "" when absent/invalid). */
function fmUpdatedOf(raw) {
  const m = String(raw || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const v = m && m[1].match(/^updated_at:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  return v ? toIso(v[1]) : "";
}

/**
 * Honest dates for one guide file.
 * @param {string} root repo root
 * @param {string} relPath e.g. "content-guides/<slug>.mdx"
 * @param {string} fmUpdated frontmatter updated_at
 * @param {string} fmPublished frontmatter published_at
 * @returns {{ updated: string, published: string, source: string }} ISO (UTC) dates
 */
export function honestDates(root, relPath, fmUpdated, fmPublished) {
  const fmU = toIso(fmUpdated);
  const published = toIso(fmPublished) || fmU;
  const last = lastContentCommit(root, relPath);
  if (!last) return { updated: fmU || published, published, source: "frontmatter (not in git)" };

  // Uncommitted material edit → the author's frontmatter date if it is newer.
  const abs = join(root, relPath);
  const head = runGit(root, ["show", `HEAD:${relPath}`]);
  if (existsSync(abs) && head != null) {
    const work = readFileSync(abs, "utf8");
    if (isMaterialChange(bodyOf(work), bodyOf(head)) && ms(fmU) > ms(last.date)) {
      return { updated: fmU, published, source: "frontmatter (uncommitted edit)" };
    }
  }
  let updated = last.date;
  let source = "git (last content commit)";
  // The date the file was added with, else (no date at creation) today's frontmatter.
  const fmAtCreation = last.creation ? last.fmUpdated || fmU : "";
  if (fmAtCreation && ms(fmAtCreation) <= ms(last.date)) {
    updated = fmAtCreation;
    source = "frontmatter (added in git, no content commits since)";
  }
  if (published && ms(updated) < ms(published)) updated = published;
  return { updated, published, source };
}
