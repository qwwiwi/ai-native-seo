import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeCover } from "../tools/covers/encode-cover.mjs";
import { renderPicture } from "../scripts/image-markup.mjs";
let sharp;
try { ({ default: sharp } = await import("sharp")); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }

test("cover derivatives decode with dimensions, budgets and OG JPEG", { skip: !sharp && "sharp is not installed" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "covers-"));
  const master = join(dir, "sample.png");
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#a65723" } }).png().toFile(master);
  const m = await encodeCover(master, join(dir, "out"));
  assert.equal(m.variants.length, 6);
  for (const v of [...m.variants, m.og]) {
    const b = await readFile(join(dir, "out", v.path));
    const meta = await sharp(b).metadata();
    assert.equal(meta.width, v.width); assert.equal(meta.height, v.height);
    assert.equal(meta.format, v.mime === "image/avif" ? "heif" : v.mime.split("/")[1]);
    assert.equal(b.length, v.bytes);
    assert.ok(b.length <= (v === m.og ? 300000 : v.width === 800 ? 100000 : 200000));
  }
  assert.equal(m.og.mime, "image/jpeg");
  await assert.rejects(encodeCover(master, join(dir, "fail"), { budgets: { 800: 1, 1600: 1, og: 1 } }), /exceeds/);
});

test("picture sets responsive sources and LCP priority only when requested", () => {
  const variants = ["avif", "webp", "jpeg"].flatMap(f => [800,1600].map(width => ({ mime: `image/${f}`, path: `/covers/a-${width}.${f}`, width })));
  const image = { variants, width: 1600, height: 900, alt: "A" };
  const lazy = renderPicture(image, { kind: "card" });
  assert.match(lazy, /type="image\/avif"/); assert.match(lazy, /loading="lazy"/); assert.doesNotMatch(lazy, /fetchpriority/);
  assert.match(renderPicture(image, { lcp: true }), /fetchpriority="high" loading="eager"/);
});
