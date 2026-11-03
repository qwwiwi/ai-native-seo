import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveBrandPaths } from "./brand-paths.mjs";

// Explicit staging paths are used by prerender before it writes a manifest.
export function verifyContext() {
  const paths = resolveBrandPaths();
  const dir = resolve(process.env.VERIFY_BUILD_DIR || paths.outputDir);
  const file = join(dir, "build-manifest.json");
  if (!existsSync(file)) {
    if (process.env.VERIFY_BUILD_DIR) return { dir, manifest: null };
    throw new Error(`Missing build manifest: ${file}`);
  }
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (!process.env.VERIFY_BUILD_DIR && (manifest.brandId !== paths.brandId || resolve(paths.root, manifest.outputDir) !== dir)) throw new Error("Build manifest does not match selected brand/output");
  return { dir, manifest };
}
export function guideDataPath({ dir, manifest }) {
  const file = "guides-data.js";
  if (manifest && !manifest.files.some(f => f.path === file)) throw new Error("Guide data format is absent from build manifest");
  return join(dir, file);
}
