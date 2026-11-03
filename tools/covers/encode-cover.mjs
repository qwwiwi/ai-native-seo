#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function encodeCover(master, outputDir, { budgets = { 800: 100000, 1600: 200000, og: 300000 } } = {}) {
  const { default: sharp } = await import("sharp");
  const input = sharp(master);
  const meta = await input.metadata();
  if (meta.format !== "png" || meta.width !== 1600 || meta.height !== 900) throw new Error("master must be a 1600x900 PNG");
  const slug = basename(master, ".png");
  const variants = [];
  const pending = [];
  for (const width of [800, 1600]) for (const [format, mime] of [["avif", "image/avif"], ["webp", "image/webp"], ["jpeg", "image/jpeg"]]) {
    const ext = format === "jpeg" ? "jpg" : format;
    const path = `${slug}-${width}.${ext}`;
    const buffer = await input.clone().resize(width, width * 9 / 16).toFormat(format, { quality: 65 }).toBuffer();
    if (buffer.length > budgets[width]) throw new Error(`${path} exceeds ${budgets[width]} bytes: ${buffer.length}`);
    variants.push({ path, mime, width, height: width * 9 / 16, bytes: buffer.length });
    pending.push({ path, buffer });
  }
  const ogPath = `${slug}-og.jpg`;
  const ogBuffer = await input.clone().resize(1200, 675).jpeg({ quality: 80 }).toBuffer();
  if (ogBuffer.length > budgets.og) throw new Error(`${ogPath} exceeds ${budgets.og} bytes: ${ogBuffer.length}`);
  const og = { path: ogPath, mime: "image/jpeg", width: 1200, height: 675, bytes: ogBuffer.length };
  const manifest = { master: { path: master, mime: "image/png", width: 1600, height: 900 }, width: 1600, height: 900, variants, og };
  await mkdir(outputDir, { recursive: true });
  for (const file of [...pending, { path: ogPath, buffer: ogBuffer }]) await writeFile(join(outputDir, file.path), file.buffer);
  await writeFile(join(outputDir, `${slug}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [master, outputDir] = process.argv.slice(2);
  if (!master || !outputDir) { console.error("usage: node tools/covers/encode-cover.mjs <master.png> <output-dir>"); process.exitCode = 1; }
  else encodeCover(master, outputDir).catch(e => { console.error(e.message); process.exitCode = 1; });
}
