// Owner rule 2026-11-07: the public site must not mention the old third-party Instagram data vendor (Loore AI is promoted instead).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["content-guides", "site", "scripts", "docs"];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(mdx?|html|js|mjs|jsx|json)$/.test(name)) yield p;
  }
}

test("no old-vendor mentions in content or built site files", () => {
  const hits = [];
  for (const d of DIRS) {
    for (const f of walk(join(ROOT, d))) {
      if (/hiker/i.test(readFileSync(f, "utf8"))) hits.push(f.slice(ROOT.length + 1));
    }
  }
  assert.deepEqual(hits, []);
});
