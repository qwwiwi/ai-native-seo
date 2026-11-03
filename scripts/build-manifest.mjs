// build-manifest.mjs — build-manifest.json: the identity + content contract of one
// brand's build output (PLAN.md §2 / M4). Producer (prerender) and consumers
// (deploy, IndexNow, GSC, verifiers) validate the SAME contract here.
//
// Public metadata only — no credentials, no key paths, no timestamps (the build
// stays reproducible: identical inputs → identical manifest bytes).
//
//   node scripts/build-manifest.mjs --verify <dir>   # validate a finished output dir
//
// verify = manifest schema + identity (brand/origin/outputDir/sitemap/GSC) +
// every emitted file listed with its sha256 (an injected or foreign file fails) +
// for a non-default brand, the leak gate: no default-brand identity token
// (brand-compat.mjs LEAK_PATTERNS) in any emitted file's text or path.

import { createHash } from "node:crypto";
import { promises as fs, existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep, extname, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRAND_ID, findLeak } from "./brand-compat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

export const MANIFEST_FILE = "build-manifest.json";
export const SCHEMA_VERSION = 1;

const MIME = {
  ".html": "text/html", ".md": "text/markdown", ".txt": "text/plain", ".xml": "application/xml",
  ".json": "application/json", ".js": "text/javascript", ".jsx": "text/babel", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
export const mimeOf = (p) => MIME[extname(p).toLowerCase()] || "application/octet-stream";

/** { width, height } of a PNG / JPEG / WebP / GIF buffer, else null. */
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return null;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(sep).join("/");

/** All files under `dir` (relative posix paths, sorted bytewise). */
export async function listFiles(dir) {
  const out = [];
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) out.push(posix(relative(dir, p)));
      else throw new Error(`unexpected non-file entry in build output: ${p}`);
    }
  }
  await walk(dir);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Build the manifest object for a finished output dir (`dir` is where the files
 * are now — the staging dir of a non-default brand; `outputDir` is where they ship from).
 */
export async function createManifest({ brand, identity, paths, dir, routes, assetUrls, deployment }) {
  const files = [];
  for (const rel of await listFiles(dir)) {
    if (rel === MANIFEST_FILE) continue;
    const buf = await fs.readFile(join(dir, rel));
    files.push({ path: rel, bytes: buf.length, sha256: sha256(buf) });
  }
  const assets = [];
  for (const url of assetUrls) {
    const rel = url.replace(/^\//, "");
    const p = join(dir, ...rel.split("/"));
    if (!existsSync(p)) throw new Error(`manifest: selected asset ${url} is not in the output`);
    const buf = await fs.readFile(p);
    const size = imageSize(buf);
    assets.push({ path: rel, mime: mimeOf(rel), bytes: buf.length, width: size ? size.width : null, height: size ? size.height : null });
  }
  const origin = brand.domain.site.replace(/\/+$/, "");
  const a = brand.analytics || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    brandId: identity.id,
    brandName: brand.brandName,
    canonicalOrigin: origin,
    outputDir: posix(relative(paths.root, paths.outputDir)),
    contentDir: posix(relative(paths.root, paths.contentDir)),
    release: !!paths.release,
    deployment: { host: deployment.host ?? null, webroot: deployment.webroot ?? null },
    sitemap: `${origin}/sitemap.xml`,
    indexNow: { keyFile: a.indexNowKey ? `${a.indexNowKey}.txt` : null },
    gscProperty: a.gscProperty ?? null,
    analytics: { metrika: a.metrika ?? null, ga4: a.ga4 ?? null },
    routes,
    assets,
    files,
  };
}

const SECRET_KEY = /secret|token|password|passwd|private|credential|keypath|apikey|api_key|bearer/i;

/** Contract errors of a manifest object (empty array = valid). */
export function manifestErrors(m, { outputDir, root = ROOT } = {}) {
  const errs = [];
  const e = (s) => errs.push(s);
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (m.schemaVersion !== SCHEMA_VERSION) e(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (typeof m.brandId !== "string" || !/^[a-z][a-z0-9-]*$/.test(m.brandId)) e("brandId must be a lowercase id");
  const isDefault = m.brandId === DEFAULT_BRAND_ID;
  let origin = null;
  try {
    const u = new URL(m.canonicalOrigin);
    if (u.protocol !== "https:" || u.pathname !== "/" || u.search || u.hash || m.canonicalOrigin.endsWith("/")) throw new Error();
    origin = u;
  } catch { e("canonicalOrigin must be a bare https://host origin"); }
  const wantOut = isDefault ? "build" : `build-${m.brandId}`;
  if (m.outputDir !== wantOut) e(`outputDir must be "${wantOut}" for brand ${m.brandId}, got ${JSON.stringify(m.outputDir)}`);
  if (outputDir) {
    const rel = posix(relative(root, resolve(outputDir)));
    if (rel !== m.outputDir) e(`manifest outputDir ${JSON.stringify(m.outputDir)} does not match the verified dir ${JSON.stringify(rel)}`);
  }
  if (typeof m.release !== "boolean") e("release must be true/false");
  if (origin && m.sitemap !== `${m.canonicalOrigin}/sitemap.xml`) e("sitemap must be <canonicalOrigin>/sitemap.xml");
  const d = m.deployment || {};
  if (d.webroot != null && (typeof d.webroot !== "string" || !/^\/[A-Za-z0-9/_.-]+$/.test(d.webroot) || d.webroot.split("/").includes(".."))) e("deployment.webroot must be an absolute path");
  if (d.host != null && (typeof d.host !== "string" || !/^[A-Za-z0-9.-]+$/.test(d.host))) e("deployment.host must be a plain host");
  if (!isDefault && m.release && (!d.host || !d.webroot)) e("a release build of a non-default brand needs an explicit deployment host and webroot");
  if (m.gscProperty != null && origin) {
    const p = String(m.gscProperty);
    const dm = p.match(/^sc-domain:([a-z0-9.-]+)$/);
    const ok = dm ? (origin.hostname === dm[1] || origin.hostname.endsWith(`.${dm[1]}`)) : p.startsWith(`${m.canonicalOrigin}/`);
    if (!ok) e(`gscProperty ${p} does not belong to ${m.canonicalOrigin}`);
  }
  if (m.indexNow && m.indexNow.keyFile != null && !/^[A-Za-z0-9-]{8,64}\.txt$/.test(m.indexNow.keyFile)) e("indexNow.keyFile must be <key>.txt");
  if (!Array.isArray(m.routes) || !m.routes.length) e("routes must be a non-empty array");
  else for (const r of m.routes) if (!r || typeof r.url !== "string" || !r.url.startsWith("/") || typeof r.file !== "string") { e(`bad route ${JSON.stringify(r)}`); break; }
  if (!Array.isArray(m.files)) e("files must be an array");
  if (!Array.isArray(m.assets)) e("assets must be an array");
  // No credentials anywhere: key names that look like secrets fail the contract.
  (function walk(o, path) {
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (SECRET_KEY.test(k)) e(`credential-like key ${path}${k} is not allowed in a public manifest`);
        walk(v, `${path}${k}.`);
      }
    }
  })(m, "");
  return errs;
}

/** Leak gate: [{ file, where: "path"|"content", match }] over every file in `dir`. */
export async function scanLeaks(dir) {
  const hits = [];
  for (const rel of await listFiles(dir)) {
    const pm = findLeak(rel);
    if (pm) hits.push({ file: rel, where: "path", match: pm });
    // latin1 keeps every byte (binary-safe, like rg -a) — plus a utf8 pass for Cyrillic tokens.
    const buf = await fs.readFile(join(dir, rel));
    const cm = findLeak(buf.toString("utf8")) || findLeak(buf.toString("latin1"));
    if (cm) hits.push({ file: rel, where: "content", match: cm });
  }
  return hits;
}

/**
 * Full verification of a finished output dir. Returns an array of errors.
 * `asOutputDir`: the dir the files will ship from (a staging dir is verified
 * against its final output dir).
 */
export async function verifyBuildDir(dir, { root = ROOT, expectBrandId, asOutputDir } = {}) {
  const p = join(dir, MANIFEST_FILE);
  if (!existsSync(p)) return [`${MANIFEST_FILE} missing in ${dir}`];
  let m;
  try { m = JSON.parse(readFileSync(p, "utf8")); } catch (err) { return [`${MANIFEST_FILE} is not valid JSON: ${err.message}`]; }
  const errs = manifestErrors(m, { outputDir: asOutputDir || dir, root });
  if (expectBrandId && m.brandId !== expectBrandId) errs.push(`brandId ${m.brandId} ≠ expected ${expectBrandId}`);
  if (Array.isArray(m.files)) {
    const listed = new Map(m.files.map((f) => [f.path, f]));
    const actual = (await listFiles(dir)).filter((f) => f !== MANIFEST_FILE);
    for (const rel of actual) {
      const f = listed.get(rel);
      if (!f) { errs.push(`unlisted file in output: ${rel}`); continue; }
      const h = sha256(await fs.readFile(join(dir, rel)));
      if (h !== f.sha256) errs.push(`file changed after the build: ${rel}`);
    }
    for (const rel of listed.keys()) if (!actual.includes(rel)) errs.push(`listed file missing: ${rel}`);
  }
  if (m.brandId !== DEFAULT_BRAND_ID) {
    for (const h of await scanLeaks(dir)) errs.push(`leak (${h.where}) ${h.file}: ${JSON.stringify(h.match)}`);
  }
  return errs;
}

// CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--verify");
  const dir = i > 0 ? process.argv[i + 1] : null;
  if (!dir) {
    console.error("usage: node scripts/build-manifest.mjs --verify <output dir>");
    process.exit(2);
  }
  const abs = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  const errs = await verifyBuildDir(abs);
  if (errs.length) {
    console.error(`build-manifest: FAIL ${abs}`);
    for (const x of errs.slice(0, 50)) console.error(`  - ${x}`);
    if (errs.length > 50) console.error(`  … ${errs.length - 50} more`);
    process.exit(1);
  }
  console.log(`build-manifest: OK ${abs}`);
}
