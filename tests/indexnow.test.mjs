// indexnow.test.mjs — IndexNow submit: changed-only by default, 429 handling, deploy wiring.
// No network: the submit script takes an injected fetch; deploy.sh runs against a fake ssh
// and a stub submit script. Nothing here talks to a real IndexNow endpoint.
//
//   node --test tests/indexnow.test.mjs        (part of `npm test`)

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, chmodSync, readFileSync, utimesSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p) => mkdtempSync(join(tmpdir(), `ans-${p}-`));
const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;
const KEY = "0123456789abcdef0123456789abcdef";

// Lazy import: the module is loaded inside each test so one failure cannot hide the others.
const load = () => import("../scripts/indexnow-submit.mjs");
const brand = (await import("../scripts/brand.mjs")).default;
const SITE = String(brand.domain.site).replace(/\/+$/, "");

// A build/ with the key file and a sitemap of 4 URLs.
function buildFixture() {
  const b = tmp("inbuild");
  writeFileSync(join(b, `${KEY}.txt`), KEY);
  const urls = [`${SITE}/`, `${SITE}/library/`, `${SITE}/guides/a/`, `${SITE}/guides/b/`];
  writeFileSync(join(b, "sitemap.xml"), `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`);
  return { b, urls };
}

// Fake fetch: records every request, answers with the given Response factory.
function fakeFetch(respond = () => new Response("", { status: 200 })) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return respond(calls.length);
  };
  return { fn, calls };
}

async function go(argv, { fetch = fakeFetch(), plan, now } = {}) {
  const { b } = buildFixture();
  const out = [];
  const err = [];
  if (plan !== undefined) {
    writeFileSync(join(b, "..", `${KEY}.plan`), plan);
    argv = [...argv, "--rsync-plan", join(b, "..", `${KEY}.plan`)];
  }
  const { run: submit } = await load();
  const code = await submit({
    argv,
    fetch: fetch.fn,
    buildDir: b,
    now: now ?? (() => new Date("2026-11-13T12:00:00Z")),
    log: (m) => out.push(m),
    error: (m) => err.push(m),
  });
  return { code, out: out.join("\n"), err: err.join("\n"), calls: fetch.calls };
}

test("indexnow: no flags and no changed list submits nothing and says how to send everything", async () => {
  const r = await go([]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.length, 0, "no request without an explicit reason");
  assert.match(r.out, /--all/);
});

test("indexnow: a rsync plan with no content change submits 0 URLs", async () => {
  const r = await go([], { plan: ".d..t...... ./\n" });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.length, 0);
  assert.match(r.out, /0 URL/);
});

test("indexnow: one edited guide submits exactly its URL and the listing that changed, not mobile twins or deletions", async () => {
  const plan = [
    "<fc.t...... guides/a.html",
    "<fc.t...... m/guides/a.html",
    ">fc.t...... library.html", // `>` = the same plan read from the receiving side
    "<fc.t...... sitemap.xml",
    "<fc.t...... guides/a.md",
    "*deleting   old-page.html",
    "cd+++++++++ newdir/",
    "",
  ].join("\n");
  const r = await go([], { plan });
  assert.equal(r.code, 0, r.err);
  assert.ok(r.calls.length > 0);
  for (const c of r.calls) assert.deepEqual(c.body.urlList, [`${SITE}/library/`, `${SITE}/guides/a/`]); // sitemap order
});

test("indexnow: index.html maps to the site root and an unchanged-URL plan entry outside the sitemap is dropped", async () => {
  const r = await go([], { plan: "<fc.t...... index.html\n<f+++++++++ drafts/secret.html\n" });
  assert.equal(r.code, 0, r.err);
  for (const c of r.calls) assert.deepEqual(c.body.urlList, [`${SITE}/`]);
});

test("indexnow: --all submits every sitemap URL", async () => {
  const r = await go(["--all"]);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.calls.length > 0);
  assert.equal(r.calls[0].body.urlList.length, 4);
});

test("indexnow: explicit URLs are still submitted as given", async () => {
  const r = await go([`${SITE}/guides/b/`]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.calls[0].body.urlList, [`${SITE}/guides/b/`]);
});

test("indexnow: HTTP 429 prints the Retry-After wait, sends no second request, exits with the rate-limit code", async () => {
  const f = fakeFetch(() => new Response("slow down", { status: 429, headers: { "Retry-After": "120" } }));
  const r = await go(["--all"], { fetch: f });
  assert.equal(r.calls.length, 1, "no second endpoint, no retry after a 429");
  assert.equal(r.code, 75);
  assert.match(r.err, /429/);
  assert.match(r.err, /Retry-After[^\n]*120 s/);
});

test("indexnow: a Retry-After given as an HTTP date is converted to seconds from now", async () => {
  const f = fakeFetch(() => new Response("", { status: 429, headers: { "Retry-After": "Fri, 13 Nov 2026 12:10:00 GMT" } }));
  const r = await go(["--all"], { fetch: f });
  assert.equal(r.code, 75);
  assert.equal(r.calls.length, 1);
  assert.match(r.err, /600 s/);
});

test("indexnow: a 429 without Retry-After still stops and is distinguishable", async () => {
  const f = fakeFetch(() => new Response("", { status: 429 }));
  const r = await go(["--all"], { fetch: f });
  assert.equal(r.code, 75);
  assert.equal(r.calls.length, 1);
  assert.match(r.err, /no Retry-After/i);
});

// B2: a 429 ends the run with exit 75 and ONE request, whatever Retry-After holds.
// Formatting the wait for the message must never throw into the generic-failure path.
for (const [label, value] of [
  ["an oversized number", "99999999999999999999"],
  ["a number just past the Date range", "8640000000001"],
  ["a negative number", "-5"],
  ["garbage", "soon, please"],
  ["an HTTP date in the past", "Fri, 13 Nov 2020 12:00:00 GMT"],
  ["an HTTP date beyond the representable range", "Fri, 13 Nov 275760 12:00:00 GMT"],
  ["an empty value", ""],
]) {
  test(`indexnow: a 429 with Retry-After = ${label} still stops after one request with exit 75`, async () => {
    const f = fakeFetch(() => new Response("", { status: 429, headers: { "Retry-After": value } }));
    const r = await go(["--all"], { fetch: f });
    assert.equal(r.calls.length, 1, "no second endpoint after a 429");
    assert.equal(r.code, 75, r.err);
    assert.match(r.err, /stopping — no further request/);
    assert.doesNotMatch(r.err, /FAILED/);
  });
}

test("indexnow: an unparseable Retry-After is printed as «unknown», not as a date", async () => {
  const f = fakeFetch(() => new Response("", { status: 429, headers: { "Retry-After": "99999999999999999999" } }));
  const r = await go(["--all"], { fetch: f });
  assert.match(r.err, /unknown/);
  assert.doesNotMatch(r.err, /Invalid|NaN|Infinity/);
});

test("indexnow: a 429 whose diagnostics cannot be built (broken clock) still exits 75 after one request", async () => {
  const f = fakeFetch(() => new Response("", { status: 429, headers: { "Retry-After": "120" } }));
  let n = 0;
  const now = () => {
    if (++n > 0) throw new Error("clock exploded");
    return new Date();
  };
  const r = await go(["--all"], { fetch: f, now });
  assert.equal(r.calls.length, 1);
  assert.equal(r.code, 75, r.err);
});

test("indexnow: a plain server error is exit 1, not the rate-limit code, and the other endpoint is still tried", async () => {
  const f = fakeFetch(() => new Response("", { status: 500 }));
  const r = await go(["--all"], { fetch: f });
  assert.equal(r.code, 1);
  assert.equal(r.calls.length, 2);
});

// ---- deploy.sh wiring: what it hands to the submit script --------------------------
// Fake-ssh project like google-seo.test.mjs; the submit script is a stub that prints
// its arguments and the plan file it was given.
function deployFixture({ webAbsent = false, change = false, rsyncFails = false, sameStat = false } = {}) {
  const t = tmp("indeploy");
  mkdirSync(join(t, "proj", "scripts"), { recursive: true });
  cpSync(join(ROOT, "scripts", "deploy.sh"), join(t, "proj", "scripts", "deploy.sh"));
  writeFileSync(join(t, "proj", "scripts", "indexnow-submit.mjs"), [
    'import { readFileSync } from "node:fs";',
    'const a = process.argv.slice(2);',
    'console.log("stub-args:[" + a.join(" ").replace(/--rsync-plan \\S+/, "--rsync-plan <file>") + "]");',
    'const i = a.indexOf("--rsync-plan");',
    'if (i >= 0) console.log("stub-plan:[" + readFileSync(a[i + 1], "utf8").trim() + "]");',
    "",
  ].join("\n"));
  writeFileSync(join(t, "proj", "scripts", "gsc-submit-sitemap.mjs"), 'console.log("gsc-ran");\n');
  mkdirSync(join(t, "proj", "build", "guides"), { recursive: true });
  writeFileSync(join(t, "proj", "build", "index.html"), "same");
  writeFileSync(join(t, "proj", "build", "guides", "a.html"), change ? "edited" : "same");
  mkdirSync(join(t, "web", "guides"), { recursive: true });
  writeFileSync(join(t, "web", "index.html"), "same");
  writeFileSync(join(t, "web", "guides", "a.html"), "same");
  if (sameStat) {
    // Equal size AND equal mtime, different content: only a content (checksum) compare sees it.
    writeFileSync(join(t, "proj", "build", "guides", "a.html"), "NEW1");
    writeFileSync(join(t, "web", "guides", "a.html"), "OLD1");
    const when = new Date("2026-01-01T00:00:00Z");
    utimesSync(join(t, "proj", "build", "guides", "a.html"), when, when);
    utimesSync(join(t, "web", "guides", "a.html"), when, when);
  }
  mkdirSync(join(t, "bin"));
  writeFileSync(join(t, "bin", "ssh"), [
    "#!/bin/sh",
    'while [ $# -gt 0 ]; do case "$1" in -o) shift 2;; -*) shift;; *) break;; esac; done',
    "shift",
    'case "$*" in *tar\\ czf*) exit 0;; *chown*) exit 0;; esac',
    'exec sh -c "$*"',
    "",
  ].join("\n"));
  chmodSync(join(t, "bin", "ssh"), 0o755);
  if (webAbsent) execRm(join(t, "web"));
  const env = { PATH: `${join(t, "bin")}:${process.env.PATH}`, BLOG_HOST: "fakehost", BLOG_WEBROOT: join(t, "web") };
  return {
    t,
    deploy: (args = []) => new Promise((resolve) => {
      const p = spawn("bash", [join(t, "proj", "scripts", "deploy.sh"), ...args], { cwd: ROOT, env: { ...process.env, ...env } });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => resolve({ code, out }));
    }),
  };
}
function execRm(p) { spawnSync("rm", ["-r", p]); }

test("deploy.sh: a deploy with no content change hands the submit script an empty change list", { skip: !has("rsync") }, async () => {
  const { deploy } = deployFixture();
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /stub-args:\[--rsync-plan <file>\]/);
  assert.match(r.out, /stub-plan:\[\]/);
});

test("deploy.sh: an edited file reaches the submit script as the only change", { skip: !has("rsync") }, async () => {
  const { deploy } = deployFixture({ change: true });
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /stub-plan:\[<f\S+ guides\/a\.html\]/);
});

test("deploy.sh: a first deploy (no previous state) submits nothing automatically and says how to run the full submission", { skip: !has("rsync") }, async () => {
  const { deploy } = deployFixture({ webAbsent: true });
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /stub-args:\[\]/);
  assert.doesNotMatch(r.out, /stub-plan/);
  assert.match(r.out, /indexnow-submit\.mjs --all/);
});

test("deploy.sh: --all and explicit URLs pass straight through, without a change list", { skip: !has("rsync") }, async () => {
  const { deploy } = deployFixture({ change: true });
  const all = await deploy(["--all"]);
  assert.match(all.out, /stub-args:\[--all\]/);
  assert.doesNotMatch(all.out, /stub-plan/);
  const one = await deploy(["https://x.example/guides/a/"]);
  assert.match(one.out, /stub-args:\[https:\/\/x\.example\/guides\/a\/\]/);
});

test("deploy.sh: a rate-limited IndexNow (exit 75) is reported as a wait, not as a broken ping", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture();
  writeFileSync(join(t, "proj", "scripts", "indexnow-submit.mjs"), "process.exit(75);\n");
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /rate-limited/i);
  assert.match(r.out, /gsc-ran/);
});

// B1: the URL reported to IndexNow must be a page that really changed on the server.
test("deploy.sh: equal-size, equal-mtime pages with different content are transferred AND submitted", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture({ sameStat: true });
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(t, "web", "guides", "a.html"), "utf8"), "NEW1", "the destination has the new content");
  assert.match(r.out, /stub-plan:\[<f\S+ guides\/a\.html\]/, "that page is the one submitted");
});

// N1: once the site is live nothing may abort the script.
function failingMktemp(t, body) {
  writeFileSync(join(t, "bin", "mktemp"), `#!/bin/sh\n${body}\n`);
  chmodSync(join(t, "bin", "mktemp"), 0o755);
}

test("deploy.sh: a failing mktemp warns and still runs the GSC submit and the final status", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture({ change: true });
  failingMktemp(t, "exit 1");
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN[^\n]*(temp|plan)/i);
  assert.doesNotMatch(r.out, /stub-args/, "IndexNow is skipped without a change list");
  assert.match(r.out, /gsc-ran/);
  assert.match(r.out, /\[deploy\] done\./);
});

test("deploy.sh: an unwritable plan file warns and still runs the GSC submit and the final status", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture({ change: true });
  failingMktemp(t, `echo "${t}/no-such-dir/plan"`);
  const r = await deploy();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN[^\n]*(temp|plan)/i);
  assert.match(r.out, /gsc-ran/);
  assert.match(r.out, /\[deploy\] done\./);
});

test("deploy.sh: the plan temp file is removed even when the submit step fails", { skip: !has("rsync") }, async () => {
  const { t, deploy } = deployFixture({ change: true });
  writeFileSync(join(t, "proj", "scripts", "indexnow-submit.mjs"), "process.exit(1);\n");
  mkdirSync(join(t, "tmpdir"));
  const spawnEnvDeploy = new Promise((resolve) => {
    const p = spawn("bash", [join(t, "proj", "scripts", "deploy.sh")], {
      cwd: ROOT,
      env: { ...process.env, PATH: `${join(t, "bin")}:${process.env.PATH}`, BLOG_HOST: "fakehost", BLOG_WEBROOT: join(t, "web"), TMPDIR: join(t, "tmpdir") },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
  const r = await spawnEnvDeploy;
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(readdirSync(join(t, "tmpdir")), [], "no plan file left behind");
});
