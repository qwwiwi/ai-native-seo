// google-seo.test.mjs — regression tests for the Google-indexing fixes ported from
// the live blog (CHANGELOG.md «Google SEO»). Zero dependencies: node:test only.
//
//   node --test tests/        (or `npm test`; part of scripts/check.sh)
//
// Every test works on throwaway copies under os.tmpdir() (set TMPDIR to keep them
// elsewhere) and never touches build/, the network or a real server. The Caddy and
// deploy tests need the `caddy` / `rsync` binaries and are skipped when missing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync, existsSync, chmodSync, readdirSync } from "node:fs";
import { createServer, request } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p) => mkdtempSync(join(tmpdir(), `ans-${p}-`));
const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, ...opts, env: { ...process.env, ...(opts.env || {}) } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
}

// ---- 1. honest dates (scripts/content-dates.mjs) ----------------------------
test("content-dates: a date bump or a link edit does not move the honest date; a real text change does", async () => {
  const { honestDates, changedWords } = await import("../scripts/content-dates.mjs");
  const repo = tmp("dates");
  const git = (args, date) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd: repo, env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date }, stdio: "pipe",
  });
  git(["init", "-q"], "2026-01-01T00:00:00Z");
  mkdirSync(join(repo, "content-guides"));
  const f = join(repo, "content-guides", "g.mdx");
  const words = Array.from({ length: 80 }, (_, i) => `слово${i}`).join(" ");
  const doc = (upd, body) => `---\nslug: g\npublished_at: 2026-01-01T00:00:00Z\nupdated_at: ${upd}\n---\n\n${body}\n`;

  writeFileSync(f, doc("2026-01-05T00:00:00Z", `Текст про [гайд](/guides/a/). ${words}`));
  git(["add", "."], "2026-02-01T00:00:00Z");
  git(["commit", "-qm", "import"], "2026-02-01T00:00:00Z");
  // bulk import: the frontmatter date (≤ the add commit) wins
  assert.equal(honestDates(repo, "content-guides/g.mdx", "2026-01-05T00:00:00Z", "2026-01-01").updated.slice(0, 10), "2026-01-05");

  // frontmatter-only bump + a link-only edit → still the old date
  writeFileSync(f, doc("2026-03-01T00:00:00Z", `Текст про [гайд](/guides/b/). ${words}`));
  git(["commit", "-qam", "bump"], "2026-03-01T00:00:00Z");
  assert.equal(honestDates(repo, "content-guides/g.mdx", "2026-03-01T00:00:00Z", "2026-01-01").updated.slice(0, 10), "2026-01-05");

  // a material text change (≥ 30 words) → that commit's date
  const more = Array.from({ length: 40 }, (_, i) => `новое${i}`).join(" ");
  writeFileSync(f, doc("2026-04-01T00:00:00Z", `Текст про [гайд](/guides/b/). ${words} ${more}`));
  git(["commit", "-qam", "rewrite"], "2026-04-01T00:00:00Z");
  assert.equal(honestDates(repo, "content-guides/g.mdx", "2026-04-01T00:00:00Z", "2026-01-01").updated.slice(0, 10), "2026-04-01");

  assert.equal(changedWords("a [b](/x/) c", "a [b](/y/) c"), 0, "a link target change is not a text change");
});

// ---- 2. content-lint Google rules (negative + positive) ---------------------
function corpusCopy(name) {
  const dir = join(tmp(name), "content-guides");
  cpSync(join(ROOT, "content-guides"), dir, { recursive: true });
  return dir;
}
const lint = (dir) => run(process.execPath, ["scripts/content-lint.mjs"], { env: { CONTENT_GUIDES_DIR: dir } });

test("content-lint: a bad NEW guide FAILs every Google rule", async () => {
  const dir = corpusCopy("lint-bad");
  writeFileSync(join(dir, "bad-new-guide.mdx"), [
    "---",
    "slug: bad-new-guide-x",
    'title: "Плохой гайд про автоматизацию 2026"',
    'description: "Тонкий гайд без доказательств."',
    "type: guide",
    "published_at: 2026-10-20T10:00:00Z",
    "updated_at: 2026-10-20T10:00:00Z",
    "---",
    "",
    "В этой статье мы расскажем.",
    "",
    "## Шаги",
    "",
    "Смотри [установку](/guides/claude-code-setup) и [команды](/guides/claude-code-commands.html).",
    "",
  ].join("\n"));
  const { code, out } = await lint(dir);
  assert.equal(code, 1, out);
  for (const needle of [
    "[google] ответа нет",
    "[google] мало доказательств",
    "[google] нет строки «Проверено на",
    "[google] нет строки о помощи ИИ",
    "[google] нет `author:`",
    "[google] тонкий материал",
    "/guides/claude-code-setup без завершающего «/»",
    "/guides/claude-code-commands.html без завершающего «/»",
    "≠ имя файла",
    "не добавлен в SLUG_CAT",
  ]) assert.ok(out.includes(needle), `expected «${needle}» in lint output:\n${out}`);
  // the legacy demo corpus is grandfathered (published_at cutoff), not FAILed
  assert.ok(!/FAIL {2}(?!bad-new-guide)[a-z0-9-]+: \[google\]/.test(out), out);
});

test("content-lint: a date bump without a text change FAILs (legacy guide too)", async () => {
  const dir = corpusCopy("lint-bump");
  const f = join(dir, "claude-code-setup.mdx");
  const raw = readFileSync(f, "utf8");
  writeFileSync(f, raw.replace(/^updated_at:.*$/m, "updated_at: 2026-10-21T10:00:00Z"));
  const { code, out } = await lint(dir);
  assert.equal(code, 1, out);
  assert.match(out, /claude-code-setup: updated_at сдвинут .* без единой правки текста/);
});

test("content-lint: a good NEW guide passes the Google rules", async () => {
  const dir = corpusCopy("lint-good");
  // A mapped slug (SLUG_CAT) rewritten as a brand-new piece.
  const filler = Array.from({ length: 70 }, (_, i) =>
    `Шаг ${i} показывает, как сервер отвечает на вызов инструмента номер ${i} без ошибок.`).join(" ");
  writeFileSync(join(dir, "svoy-mcp-server.mdx"), [
    "---",
    "slug: svoy-mcp-server",
    'title: "Свой MCP-сервер 2026: FastMCP за один файл"',
    'description: "Пишем свой MCP-сервер на FastMCP и подключаем его к агенту."',
    "type: guide",
    'author: "Jane Roe"',
    "published_at: 2026-10-20T10:00:00Z",
    "updated_at: 2026-10-20T10:00:00Z",
    "---",
    "",
    "Свой MCP-сервер на FastMCP пишется в один Python-файл: декоратор `@mcp.tool` превращает функцию " +
      "в инструмент, `mcp.run()` запускает сервер, а `claude mcp add` подключает его к агенту. Ниже — " +
      "рабочий пример от пустой папки до вызова инструмента, с командами и выводом терминала.",
    "",
    "Проверено на FastMCP 2.3, macOS 26, октябрь 2026. Текст подготовлен с помощью ИИ и проверен автором.",
    "",
    "## Установка",
    "",
    "```bash\npip install fastmcp\n```",
    "",
    "```bash\npython server.py\n```",
    "",
    "```bash\nclaude mcp add my-server -- python server.py\n```",
    "",
    `Дальше — [готовые серверы](/guides/mcp-servers-claude-code/) и [pillar](/claude-code/). ${filler}`,
    "",
  ].join("\n"));
  const { code, out } = await lint(dir);
  assert.equal(code, 0, out);
  assert.ok(!out.includes("svoy-mcp-server: [google]"), out);
});

// ---- 3. brand config: new identity keys are validated -----------------------
test("brand config: a malformed GSC property / category / UTM value fails the build", async () => {
  const base = JSON.parse(readFileSync(join(ROOT, "brand.config.example.json"), "utf8"));
  const cases = [
    [{ analytics: { ...base.analytics, gscProperty: "javascript:alert(1)" } }, "analytics.gscProperty"],
    [{ categories: [{ id: "Bad Id", name: "X" }] }, "categories[0].id"],
    [{ categories: [{ id: "library", name: "X", pillar: "/x/" }] }, "categories[0].id"],
    [{ categories: [{ id: "x", name: "X", description: "<b>" }] }, "categories[0].description"],
    [{ categories: [{ id: "x", name: "X", pillar: "//evil.example/" }] }, "categories[0].pillar"],
    [{ funnel: { ...base.funnel, utm: { source: "a b" } } }, "funnel.utm.source"],
  ];
  for (const [patch, key] of cases) {
    const p = join(tmp("brand"), "b.json");
    writeFileSync(p, JSON.stringify({ ...base, ...patch }));
    const { code, out } = await run(process.execPath, ["-e", 'import("./scripts/brand.mjs")'], { env: { BRAND_CONFIG: p } });
    assert.notEqual(code, 0, `${key} should be rejected`);
    assert.ok(out.includes(key), `error should name ${key}:\n${out}`);
  }
});

// ---- 4. GSC sitemap submit (mock API, no network) ----------------------------
function mockGoogle(putStatus) {
  const hits = [];
  const srv = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      if (req.url === "/token") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ access_token: "tok" }));
      }
      if (req.method === "PUT") { res.writeHead(putStatus); return res.end(); }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ lastSubmitted: "2026-10-25T00:00:00Z", isPending: false, errors: 0, warnings: 0, contents: [{ type: "web", submitted: "47" }] }));
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, hits, port: srv.address().port })));
}
function fakeKey(port) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const p = join(tmp("gsc"), "sa.json");
  writeFileSync(p, JSON.stringify({ client_email: "bot@proj.iam.gserviceaccount.com", private_key: pem, token_uri: `http://127.0.0.1:${port}/token` }));
  return { p, pem };
}
const gsc = (env, args = []) => run(process.execPath, ["scripts/gsc-submit-sitemap.mjs", ...args], {
  env: { BRAND_CONFIG: "brand.config.example.json", GSC_SITE: "", GSC_SITEMAP: "", ...env },
});

test("gsc-submit-sitemap: property + sitemap come from the brand config; no key → skipped (exit 2)", async () => {
  const { code, out } = await gsc({ GSC_SA_KEY: join(tmp("gsc"), "missing.json") });
  assert.equal(code, 2, out);
  assert.match(out, /site=sc-domain:acme\.example sitemap=https:\/\/blog\.acme\.example\/sitemap\.xml/);
  assert.match(out, /SKIPPED/);
});

test("gsc-submit-sitemap: 403 prints the manual step and never the key", async () => {
  const m = await mockGoogle(403);
  const { p, pem } = fakeKey(m.port);
  const { code, out } = await gsc({ GSC_SA_KEY: p, GSC_API_BASE: `http://127.0.0.1:${m.port}` });
  m.srv.close();
  assert.equal(code, 3, out);
  assert.match(out, /Manual step/);
  assert.match(out, /sc-domain:acme\.example/);
  assert.ok(!out.includes("PRIVATE KEY") && !out.includes(pem.split("\n")[1]), "key material leaked");
});

test("gsc-submit-sitemap: 200 → submitted and status read back", async () => {
  const m = await mockGoogle(204);
  const { p } = fakeKey(m.port);
  const { code, out } = await gsc({ GSC_SA_KEY: p, GSC_API_BASE: `http://127.0.0.1:${m.port}` });
  m.srv.close();
  assert.equal(code, 0, out);
  assert.match(out, /sitemaps\.submit → HTTP 204/);
  assert.ok(m.hits.some((h) => h.startsWith("PUT /sites/sc-domain%3Aacme.example/sitemaps/https%3A%2F%2Fblog.acme.example%2Fsitemap.xml")), m.hits.join("\n"));
});

// ---- 5. deploy.sh deletion guard (local rsync through a fake ssh) ------------
test("deploy.sh: aborts before any prod change when rsync --delete would remove files", { skip: !has("rsync") }, async () => {
  const t = tmp("deploy");
  mkdirSync(join(t, "proj", "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "deploy.sh"), join(t, "proj", "scripts", "deploy.sh"));
  mkdirSync(join(t, "proj", "build"));
  writeFileSync(join(t, "proj", "build", "index.html"), "new");
  mkdirSync(join(t, "web"));
  writeFileSync(join(t, "web", "index.html"), "old");
  writeFileSync(join(t, "web", "fresh-guide.html"), "someone else's newer guide");
  // fake ssh: run the remote command locally, but refuse anything that changes prod
  mkdirSync(join(t, "bin"));
  writeFileSync(join(t, "bin", "ssh"), [
    "#!/bin/sh",
    'while [ $# -gt 0 ]; do case "$1" in -o) shift 2;; -*) shift;; *) break;; esac; done',
    "shift",
    'case "$*" in *tar\\ czf*|*chown*) echo "fake-ssh: refused $*" >&2; exit 97;; esac',
    'exec sh -c "$*"',
    "",
  ].join("\n"));
  chmodSync(join(t, "bin", "ssh"), 0o755);
  const env = { PATH: `${join(t, "bin")}:${process.env.PATH}`, BLOG_HOST: "fakehost", BLOG_WEBROOT: join(t, "web") };

  const r = await run("bash", [join(t, "proj", "scripts", "deploy.sh")], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /\*deleting\s+fresh-guide\.html/);
  assert.match(r.out, /ABORT/);
  assert.ok(!r.out.includes("fake-ssh: refused"), "guard must stop BEFORE backup/rsync");
  assert.ok(existsSync(join(t, "web", "fresh-guide.html")));
  assert.equal(readFileSync(join(t, "web", "index.html"), "utf8"), "old");

  // nothing to delete → the guard lets the deploy through (it then reaches the backup)
  writeFileSync(join(t, "proj", "build", "fresh-guide.html"), "x");
  const ok = await run("bash", [join(t, "proj", "scripts", "deploy.sh")], { env });
  assert.ok(!ok.out.includes("ABORT"), ok.out);
  assert.match(ok.out, /fake-ssh: refused tar czf/);
});

// ---- 6. Caddy block: one URL per page + noindex on non-canonical files --------
async function freePort() {
  return new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
}
function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on("error", reject);
    r.end();
  });
}

test("caddy block: 301 to the canonical /x/ (query kept), noindex on twins/sidecars, styled 404", { skip: !has("caddy") }, async () => {
  const t = tmp("caddy");
  const web = join(t, "web");
  for (const [p, body] of [
    ["index.html", "desktop-home"], ["library.html", "desktop-library"], ["404.html", "styled-404"],
    ["mobile.html", "mobile-shell"], ["guides/x.html", "desktop-guide-x"], ["guides/x.md", "# x"],
    ["llms.txt", "llms"], ["llms-full.txt", "full"], ["search-index.json", "{}"], ["sitemap.xml", "<urlset/>"],
    ["m/index.html", "mobile-home"], ["m/guides/x.html", "mobile-guide-x"],
    [".well-known/mcp/server-card.json", "{}"],
  ]) { mkdirSync(dirname(join(web, p)), { recursive: true }); writeFileSync(join(web, p), body); }
  const port = await freePort();
  const block = readFileSync(join(ROOT, "deploy", "caddy-blog-block.txt"), "utf8")
    .replace(/^\S+ \{/, `http://127.0.0.1:${port} {`)
    .replace(/^\troot \* .*$/m, `\troot * ${web}`);
  const conf = join(t, "Caddyfile");
  writeFileSync(conf, `{\n\tadmin off\n\tstorage file_system ${join(t, "data")}\n}\n\n${block}`);
  const caddy = spawn("caddy", ["run", "--config", conf, "--adapter", "caddyfile"], {
    env: { ...process.env, HOME: t, XDG_DATA_HOME: join(t, "xdg"), XDG_CONFIG_HOME: join(t, "xdg") }, stdio: "pipe",
  });
  let log = "";
  caddy.stderr.on("data", (d) => (log += d));
  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { await get(port, "/sitemap.xml"); up = true; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(up, `caddy did not start:\n${log}`);
    const redirects = [
      ["/guides/x", "/guides/x/"],
      ["/guides/x.html?utm_source=ig&a=b", "/guides/x/?utm_source=ig&a=b"],
      ["/library", "/library/"],
      ["/library.html", "/library/"],
      ["/index.html", "/"],
      ["/index.html?utm_source=ig", "/?utm_source=ig"],
      ["/guides", "/library/"],
      ["/guides/", "/library/"],
      ["/guides.html?x=1", "/library/?x=1"],
    ];
    for (const [from, to] of redirects) {
      const r = await get(port, from);
      assert.equal(r.status, 301, `${from} → ${r.status}`);
      assert.equal(r.headers.location, to, from);
    }
    assert.equal((await get(port, "/guides/x/")).body, "desktop-guide-x");
    assert.equal((await get(port, "/guides/x/", { "User-Agent": "iPhone Mobile" })).body, "mobile-guide-x");
    assert.equal((await get(port, "/mobile.html")).status, 200);
    assert.equal((await get(port, "/sitemap.xml")).headers["x-robots-tag"], undefined, "sitemap must stay indexable");
    assert.equal((await get(port, "/guides/x/")).headers["x-robots-tag"], undefined, "canonical page must stay indexable");
    for (const p of ["/guides/x.md", "/llms.txt", "/llms-full.txt", "/search-index.json", "/.well-known/mcp/server-card.json"]) {
      assert.equal((await get(port, p)).headers["x-robots-tag"], "noindex", p);
    }
    const nf = await get(port, "/no-such-page/");
    assert.equal(nf.status, 404);
    assert.equal(nf.body, "styled-404");
  } finally {
    caddy.kill("SIGTERM");
  }
});

test("swap-caddy-block: swaps the block named by its own site line, not a www. look-alike", { skip: !has("python3") }, async () => {
  const t = tmp("swap");
  const cf = join(t, "Caddyfile");
  writeFileSync(cf, "www.blog.acme.example {\n\tredir https://blog.acme.example{uri}\n}\n\nblog.acme.example {\n\troot * /old\n}\n\nother.example {\n\trespond 1\n}\n");
  const block = join(t, "block.txt");
  writeFileSync(block, "blog.acme.example {\n\troot * /new\n\t@q {\n\t\texpression {query} != \"\"\n\t}\n}\n");
  const r = await run("python3", ["-I", "deploy/swap-caddy-block.py", block], { env: { CADDYFILE: cf } });
  assert.equal(r.code, 0, r.out);
  const out = readFileSync(cf, "utf8");
  assert.ok(out.includes("root * /new") && !out.includes("root * /old"), out);
  assert.ok(out.startsWith("www.blog.acme.example {\n\tredir"), "www. block must stay untouched");
  assert.ok(out.includes("other.example {\n\trespond 1\n}"), out);
  assert.ok(readdirSync(t).some((f) => f.startsWith("Caddyfile.bak.blogfix.")), "backup missing");
});

// ---- 7. the deploy tooling stays white-label ---------------------------------
test("ported scripts carry no hard-coded brand identity", () => {
  for (const f of ["gsc-submit-sitemap.mjs", "verify-google-seo.mjs", "content-dates.mjs", "categories.mjs", "check.sh"]) {
    const p = join(ROOT, "scripts", f);
    assert.ok(existsSync(p), `scripts/${f} missing`);
    const src = readFileSync(p, "utf8");
    assert.ok(!/edgelab|kaelthas|mrqwwiwi|dashi/i.test(src), `scripts/${f} hard-codes a brand identity`);
  }
  assert.ok(readdirSync(join(ROOT, "tests")).length > 0);
});

// ---- 8. category listing pages (verify-category-pages.mjs, the build gate) ----------
// Fixture build: one Hermes guide (default brand config: /hermes/ pillar, site/hermes.html).
function categoryFixture(pageHtml) {
  const b = tmp("catbuild");
  const files = {
    "guides-data.js": 'window.__GF_GUIDES = [{"slug":"g1","title":"Гайд один про агента","desc":"Описание гайда","cat":"hermes","catName":"Hermes"}];\n',
    "index.html": "<h1>home</h1>", "library.html": "<h1>lib</h1>",
    "guides/g1.html": '<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Главная","item":"https://x.example/"},{"name":"Hermes","item":"https://x.example/hermes/"}]}</script>',
    "hermes.html": pageHtml, "m/hermes.html": pageHtml,
  };
  for (const [p, body] of Object.entries(files)) { mkdirSync(dirname(join(b, p)), { recursive: true }); writeFileSync(join(b, p), body); }
  return b;
}
const verifyCats = (dir) => run(process.execPath, ["scripts/verify-category-pages.mjs"], { env: { VERIFY_BUILD_DIR: dir, BRAND_CONFIG: "" } });

test("verify-category-pages: a category page that renders its first guide FAILs the build", async () => {
  const dir = categoryFixture('<meta name="description" content="Гайды по теме «Hermes» от X."><h1 class="gp-h1">Гайд один про агента</h1>' +
    '<div class="gp-article-body">text</div><a href="/codex/">Codex</a>');
  const { code, out } = await verifyCats(dir);
  assert.equal(code, 1, out);
  for (const needle of ["equals the H1 of guide g1", "guide body (.gp-article-body)", "template meta description",
    "no JSON-LD CollectionPage", "link /codex/ has no built page"]) assert.ok(out.includes(needle), `«${needle}»:\n${out}`);
});

test("verify-category-pages: a real listing (own H1, cards, CollectionPage) passes", async () => {
  const ld = JSON.stringify({ "@type": "CollectionPage", mainEntity: { "@type": "ItemList", numberOfItems: 1, itemListElement: [{ url: "https://x.example/guides/g1/" }] } });
  const dir = categoryFixture(`<meta name="description" content="Hermes: 1 материал — Гайд один про агента."><h1>Hermes</h1>` +
    `<a href="/guides/g1/">Гайд один про агента</a><script type="application/ld+json">${ld}</script>`);
  const { code, out } = await verifyCats(dir);
  assert.equal(code, 0, out);
});

test("categories: listing description is built from the guides, not a template", async () => {
  const { categoryDescription } = await import("../scripts/categories.mjs");
  const d = categoryDescription({ id: "x", name: "MCP" }, [{ title: "A" }, { title: "B" }]);
  assert.equal(d, "MCP: 2 материала — A; B.");
  assert.equal(categoryDescription({ id: "x", name: "MCP", description: "Своё" }, []), "Своё");
});

test("content-lint: a guide titled like a category page FAILs", async () => {
  const dir = corpusCopy("lint-cat");
  const f = join(dir, "hermes-intro.mdx");
  writeFileSync(f, readFileSync(f, "utf8").replace(/^title:.*$/m, 'title: "Hermes"'));
  const { code, out } = await lint(dir);
  assert.equal(code, 1, out);
  assert.match(out, /hermes-intro: H1\/title «Hermes» совпадает с H1 страницы категории \/hermes\//);
});

// ---- 9. deploy.sh: backup check fails closed, search pings are independent ---------
// Fake-ssh project: build/ is one file newer than the webroot (no deletions),
// tar/chown are no-ops; `sshDown` = every non-rsync ssh call exits 255 (= ssh
// connection error: the link drops after the dry-run).
function deployFixture({ sshDown = false, indexNowRc = 0 } = {}) {
  const t = tmp("deploy2");
  mkdirSync(join(t, "proj", "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "deploy.sh"), join(t, "proj", "scripts", "deploy.sh"));
  writeFileSync(join(t, "proj", "scripts", "indexnow-submit.mjs"), `console.log("indexnow-ran"); process.exit(${indexNowRc});\n`);
  writeFileSync(join(t, "proj", "scripts", "gsc-submit-sitemap.mjs"), 'console.log("gsc-ran");\n');
  mkdirSync(join(t, "proj", "build"));
  writeFileSync(join(t, "proj", "build", "index.html"), "new build");
  mkdirSync(join(t, "web"));
  writeFileSync(join(t, "web", "index.html"), "old");
  mkdirSync(join(t, "bin"));
  writeFileSync(join(t, "bin", "ssh"), [
    "#!/bin/sh",
    'while [ $# -gt 0 ]; do case "$1" in -o) shift 2;; -*) shift;; *) break;; esac; done',
    "shift",
    ...(sshDown ? ['case "$*" in rsync\\ *) ;; *) echo "fake-ssh: connection refused" >&2; exit 255;; esac'] : []),
    'case "$*" in *tar\\ czf*) echo "fake-ssh: backup ok"; exit 0;; *chown*) exit 0;; esac',
    'exec sh -c "$*"',
    "",
  ].join("\n"));
  chmodSync(join(t, "bin", "ssh"), 0o755);
  const env = { PATH: `${join(t, "bin")}:${process.env.PATH}`, BLOG_HOST: "fakehost", BLOG_WEBROOT: join(t, "web") };
  return { t, deploy: () => run("bash", [join(t, "proj", "scripts", "deploy.sh")], { env }) };
}

test("deploy.sh: an ssh error on the webroot check aborts instead of skipping the backup", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture({ sshDown: true });
  const r = await deploy();
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /ABORT/);
  assert.ok(!r.out.includes("first deploy"), "an ssh error must not read as «webroot absent»");
  assert.equal(readFileSync(join(t, "web", "index.html"), "utf8"), "old", "no rsync without a backup");
});

test("deploy.sh: a genuinely absent webroot is still a first deploy (no backup)", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture();
  const web = join(t, "web");
  execFileSync("rm", ["-r", web]);
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /first deploy, no backup/);
  assert.equal(readFileSync(join(web, "index.html"), "utf8"), "new build");
});

test("deploy.sh: an IndexNow failure still runs the GSC submit and is reported", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture({ indexNowRc: 1 });
  const r = await deploy();
  assert.equal(r.code, 0, `a ping failure must not fail a finished deploy:\n${r.out}`);
  assert.match(r.out, /fake-ssh: backup ok/);
  assert.match(r.out, /indexnow-ran/);
  assert.match(r.out, /gsc-ran/, "GSC submit must run after an IndexNow failure");
  assert.match(r.out, /WARN: IndexNow .*exit 1/);
  assert.equal(readFileSync(join(t, "web", "index.html"), "utf8"), "new build");
});

// ---- 10. verify-google-seo: UTM prefixes + byline/JSON-LD author agree -------------
// Fixture build: one live guide, desktop + mobile page, community funnel.
function seoFixture({ prefix, byline = "Jane Roe", ldAuthor = "Jane Roe" }) {
  const b = tmp("seobuild");
  const base = JSON.parse(readFileSync(join(ROOT, "brand.config.example.json"), "utf8"));
  const cfg = join(b, "brand.json");
  writeFileSync(cfg, JSON.stringify({ ...base, funnel: { ...base.funnel, mode: "community", utm: { ...base.funnel.utm, contentPrefix: prefix } } }));
  const site = "https://blog.acme.example";
  const ld = JSON.stringify({ "@graph": [{ "@type": ["Article", "TechArticle"], author: { "@type": "Person", name: ldAuthor } }] });
  const page = `<nav class="gp-guide-index"></nav><span class="gp-byline-au">${byline} · 10 мин чтения</span>` +
    `<a href="https://acme.example/?utm_source=blog&amp;utm_medium=cta&amp;utm_content=${encodeURIComponent(prefix)}g1">x</a>` +
    `<script type="application/ld+json">${ld}</script>`;
  const files = {
    "brand.json": readFileSync(cfg, "utf8"),
    "guides-data.js": 'window.__GF_GUIDES = [{"slug":"g1","cat":"x","updatedAt":"2026-10-20T00:00:00Z"}];\n',
    "sitemap.xml": `<urlset><url><loc>${site}/guides/g1/</loc><lastmod>2026-10-20</lastmod></url>` +
      `<url><loc>${site}/</loc><lastmod>2026-10-20</lastmod></url><url><loc>${site}/library/</loc><lastmod>2026-10-20</lastmod></url></urlset>`,
    "guides/g1.html": page, "m/guides/g1.html": page,
  };
  for (const [p, body] of Object.entries(files)) { mkdirSync(dirname(join(b, p)), { recursive: true }); writeFileSync(join(b, p), body); }
  return run(process.execPath, ["scripts/verify-google-seo.mjs"], { env: { VERIFY_BUILD_DIR: b, BRAND_CONFIG: cfg } });
}

test("verify-google-seo: a valid brand UTM prefix with uppercase, _ and . is its own slug", async () => {
  for (const prefix of ["blog-", "Acme_test.", "acme_test-"]) {
    const { code, out } = await seoFixture({ prefix });
    assert.equal(code, 0, `prefix ${prefix}:\n${out}`);
  }
});

test("verify-google-seo: a byline that names another author than the JSON-LD FAILs", async () => {
  const { code, out } = await seoFixture({ prefix: "blog-", byline: "Brand Author", ldAuthor: "Jane Roe" });
  assert.equal(code, 1, out);
  assert.match(out, /byline «Brand Author» ≠ JSON-LD author «Jane Roe»/);
});

// ---- 11. build-seo: the article author's URL is never the brand author's -----------
test("build-seo: a custom frontmatter author gets no brand-author URL; the brand author keeps it", async () => {
  const brand = JSON.parse(readFileSync(join(ROOT, "brand.config.json"), "utf8"));
  const { techArticleGraph } = await import("../scripts/build-seo.mjs");
  const author = (g) => techArticleGraph({ slug: "g1", title: "T", desc: "D", ...g }, "body")["@graph"].find((n) => n["@id"]?.endsWith("#article")).author;
  assert.deepEqual(author({ author: "Someone Else" }), { "@type": "Person", name: "Someone Else" });
  assert.deepEqual(author({}), { "@type": "Person", name: brand.author.name, url: brand.author.url });
  assert.deepEqual(author({ author: brand.author.name }), { "@type": "Person", name: brand.author.name, url: brand.author.url });
});

test("gf-app: the visible byline names the article author (brand author fallback)", () => {
  const src = readFileSync(join(ROOT, "site", "gf-app.jsx"), "utf8");
  const calls = [...src.matchAll(/<Byline\b[^>]*\/>/g)].map((m) => m[0]);
  assert.ok(calls.length >= 2, "desktop + mobile bylines");
  for (const c of calls) assert.match(c, /author=\{a\.author\}/, c);
  assert.match(src, /function guideToArticle\(g\)[\s\S]*?\n {4}author: g\.author/, "guideToArticle must carry the author");
  assert.match(src, /function Byline\(\{ author, meta \}\)[\s\S]*?\{author \|\| AUTHOR_NAME\}/);
});
