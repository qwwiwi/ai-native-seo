// build-seo.mjs — the SEO / GEO / agent-readiness layer for blog.edgelab.space.
//
// 100% ADDITIVE and design-safe. It does two kinds of work:
//   1. Post-process each emitted build/*.html + build/guides/*.html: inject into
//      <head> the canonical link, Open Graph + twitter:card meta, an <link rel
//      ="alternate" type="text/markdown"> to the guide's .md twin, and a JSON-LD
//      <script type="application/ld+json"> block. None of this renders visibly —
//      the body markup is never touched, so the 1:1 design stays pixel-identical.
//   2. Emit sidecar files into build/: robots.txt, sitemap.xml, llms.txt,
//      .well-known/{mcp/server-card.json, api-catalog, agent-skills/index.json},
//      and a markdown twin guides/<slug>.md per guide.
//
// Driven entirely by site/guides-data.js (slug, title, desc, dates, toc, steps…)
// + the MDX bodies in content-guides/ for the markdown twins. Called as the final
// step of scripts/prerender.mjs (also runnable standalone: node scripts/build-seo.mjs,
// but only meaningful AFTER prerender has populated build/).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { promises as fs, existsSync, readFileSync, realpathSync } from "node:fs";
import crypto from "node:crypto";
import brand from "./brand.mjs";
import { categoryPages } from "./categories.mjs";
import { brandScriptTag, brandTokensStyle, brandFontsHref, BRAND_SCRIPT_ID } from "./brand-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = join(ROOT, "site");
const BUILD = join(ROOT, "build");
const SRC = join(ROOT, "content-guides");

// ---- brand-driven identity constants ---------------------------------------
// All site identity (domain, author, telegram, MCP, analytics, assets) is read
// from brand.config.json via ./brand.mjs, so the whole SEO/GEO/agent layer can be
// white-labeled by swapping that config — no code change. EdgeLab Space is the
// default brand (see brand.config.json); every value below equals the previous
// hardcoded literal for the default config.
const BASE = brand.domain.site;
const SITE_NAME = brand.brandName;
const AUTHOR_NAME = brand.author.name;
const AUTHOR_URL = brand.author.url;
const PUBLISHER_NAME = brand.brandName;
const PUBLISHER_URL = brand.domain.apex;
const TG = brand.telegram.url; // brand telegram (Organization sameAs)
const OG_IMAGE = `${BASE}/${brand.assets.og}`;
const LANG = "ru";

// IndexNow — instant URL submission to Yandex + Bing (one shared key). The key
// file MUST resolve at <site>/<KEY>.txt with the key as its body; build-seo emits
// it as a sidecar so it always ships with the site. scripts/indexnow-submit.mjs
// reads it from there and pings the engines on deploy.
const INDEXNOW_KEY = brand.analytics.indexNowKey;

// Static (non-guide) routes: built file → canonical clean URL + view kind.
// guide.html (standalone demo) and mobile.html (mobile variant of home) are
// intentionally excluded from canonical/sitemap to avoid duplicate-content URLs.
const PAGE_ROUTES = [
  { file: "index.html", url: "/", kind: "home" },
  { file: "library.html", url: "/library/", kind: "library" },
  { file: "about.html", url: "/about/", kind: "about" },
  // + one { kind: "category" } route per category listing page, appended in main()
  // from the content (categoryPages: declared pillar + ≥1 guide + site file).
];
// Category listing pages that exist (scripts/categories.mjs categoryPages) — the
// single list behind the category routes, the BreadcrumbList middle crumb and the
// sitemap pillar URLs. Filled in main() once the guides are loaded.
let CAT_PAGES = [];

// ---- helpers ---------------------------------------------------------------
function loadGuides() {
  return fs.readFile(join(SITE, "guides-data.js"), "utf8").then((js) => {
    const w = {};
    // eslint-disable-next-line no-new-func
    new Function("window", js)(w);
    return w.__GF_GUIDES || [];
  });
}

function guideUrl(slug) {
  return `${BASE}/guides/${slug}/`;
}

// JSON-LD is embedded inside <script>; escape only what can break out of it.
function jsonLdScript(obj) {
  const json = JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function attr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// Strip YAML frontmatter from an MDX file → clean markdown body for the twin.
function stripFrontmatter(raw) {
  const m = raw.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? raw.slice(m[0].length).replace(/^\n+/, "") : raw;
}

// Markdown body (already frontmatter-stripped) → plain visible text for JSON-LD
// `articleBody`. Yandex «Аналитика контента» needs the article's real text (500+
// chars) to compute «Дочитывания». Strip fences/markup, keep prose; truncate to
// ~5000 chars on a word boundary so we don't bloat all 26×2 pages.
function mdToPlainText(mdBody, max = 5000) {
  let t = String(mdBody || "")
    .replace(/```[\s\S]*?```/g, " ")          // fenced code blocks
    .replace(/^:::.*$/gm, " ")                  // ::: directives (prompt/callout)
    .replace(/^(?:import|export)\s.*$/gm, " ") // MDX import/export lines
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")       // HTML/JSX tags → drop
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images → drop
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")   // links → link text
    .replace(/`([^`]*)`/g, "$1")                // inline code → text
    .replace(/^#{1,6}\s+/gm, "")                // headings markers
    .replace(/[*_>]+/g, " ")                    // emphasis / blockquote markers
    .replace(/\s+/g, " ")                        // collapse whitespace
    .trim();
  if (t.length > max) {
    t = t.slice(0, max);
    const sp = t.lastIndexOf(" ");
    if (sp > max * 0.8) t = t.slice(0, sp);
    t = `${t}…`;
  }
  return t;
}

// ---- JSON-LD builders ------------------------------------------------------
function organizationNode() {
  return {
    "@type": "Organization",
    "@id": `${BASE}/#organization`,
    name: PUBLISHER_NAME,
    url: PUBLISHER_URL,
    logo: `${BASE}/${brand.assets.logo}`,
    sameAs: [TG, PUBLISHER_URL],
  };
}

function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${BASE}/#website`,
    name: SITE_NAME,
    url: `${BASE}/`,
    inLanguage: LANG,
    publisher: { "@id": `${BASE}/#organization` },
  };
}

function breadcrumbNode(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

// Detect "## Шаг N: …" headings in the MDX body → HowTo steps (if any).
function howToSteps(mdxBody) {
  const steps = [];
  const re = /^##\s+(Шаг\s+\d+[^\n]*)$/gim;
  let m;
  while ((m = re.exec(mdxBody)) !== null) {
    steps.push(m[1].trim());
  }
  return steps;
}

// Extract a VISIBLE FAQ section from the MDX body → [{q, a}] for FAQPage JSON-LD.
// Convention (docs/CONTENT.md): a guide adds, anywhere in its body, an H2
//   ## FAQ            (or "## Частые вопросы" / "## Вопросы и ответы")
// followed by H3 questions, each with its answer prose until the next H3/H2:
//   ### Нужна ли подписка Claude?
//   Да, нужен тариф Pro или Max — без него Claude Code не запустится.
//   ### Работает ли на Windows?
//   Да, через WSL2 …
// FAQPage is emitted ONLY from this real, on-page content — Google/Yandex
// require the FAQ to be visible, hidden/spam FAQ schema is penalised. Answers
// are flattened to plain text. Returns [] when there's no FAQ section.
function faqFromBody(mdxBody) {
  const lines = String(mdxBody || "").split("\n");
  // Heading must be EXACTLY the FAQ marker (trailing whitespace only) — a prose
  // section like "## Частые вопросы и ошибки" must NOT hijack the real "## FAQ"
  // (it has no ### Q&A → would yield [] and suppress the real FAQPage below it).
  // \s*$ not \b — JS \b is ASCII-only and fails right after Cyrillic text.
  const faqHeading = /^##\s+(FAQ|Частые вопросы|Вопросы и ответы)\s*$/i;
  let i = 0;
  while (i < lines.length && !faqHeading.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i++; // past the "## FAQ" line
  const out = [];
  let q = null;
  let buf = [];
  let inFence = false; // track ``` fenced code so a "## " / "### " inside a code
  // answer never starts/ends/splits the FAQ section incorrectly.
  const flush = () => {
    if (q !== null) {
      const a = mdToPlainText(buf.join("\n"), 1000).trim();
      const qText = mdToPlainText(q, 300).trim(); // strip any inline markdown in the question
      if (a && qText) out.push({ q: qText, a });
    }
    q = null;
    buf = [];
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      inFence = !inFence;
      if (q !== null) buf.push(line);
      continue;
    }
    if (!inFence && /^##\s+/.test(line)) break; // next H2 → FAQ section ended
    const qm = !inFence && line.match(/^###\s+(.+?)\s*$/);
    if (qm) {
      flush();
      q = qm[1];
      continue;
    }
    if (q !== null) buf.push(line);
  }
  flush();
  return out;
}

// frontmatter `author:` (required for new guides by content-lint) wins; the brand
// author is the fallback. The brand author URL belongs to the brand author only —
// another author has no known page, so the URL is omitted rather than misattributed.
// The visible byline (site/gf-app.jsx Byline) names the same person.
function articleAuthor(guide) {
  const name = guide.author || AUTHOR_NAME;
  return name === AUTHOR_NAME ? { "@type": "Person", name, url: AUTHOR_URL } : { "@type": "Person", name };
}

function techArticleGraph(guide, mdxBody) {
  const url = guideUrl(guide.slug);
  const graph = [
    organizationNode(),
    {
      // ["Article", …]: Yandex «Аналитика контента» recognises Article/NewsArticle/
      // BlogPosting; TechArticle is a subtype of Article — list Article first so the
      // content report picks it up, keep TechArticle for SEO richness.
      "@type": ["Article", "TechArticle"],
      "@id": `${url}#article`,
      headline: guide.title,
      description: guide.desc,
      datePublished: guide.publishedAt || undefined,
      dateModified: guide.updatedAt || undefined,
      inLanguage: LANG,
      keywords: (guide.tags || []).join(", ") || undefined,
      author: articleAuthor(guide),
      publisher: { "@id": `${BASE}/#organization` },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      // only emit image if the cover actually exists (no dead structured-data ref)
      image: existsSync(join(SITE, "covers", `${guide.slug}.webp`))
        ? `${BASE}/covers/${guide.slug}.webp`
        : undefined,
      articleSection: guide.catName,
      // Full visible text → enables «Дочитывания»/«Доскроллы» in Content Analytics.
      articleBody: mdToPlainText(mdxBody),
    },
    // Category crumb → the category's OWN listing page, only when that page exists
    // (CAT_PAGES). A category without one gets no middle crumb: a crumb to a 404
    // pillar, or two crumbs on the same /library/ URL (the old shape), is a broken
    // trail for Google.
    breadcrumbNode([
      { name: "Главная", url: `${BASE}/` },
      { name: "Гайды", url: `${BASE}/library/` },
      ...CAT_PAGES.filter((c) => c.id === guide.cat).map((c) => ({ name: c.name, url: `${BASE}${c.pillar}` })),
      { name: guide.title, url },
    ]),
  ];

  // HowTo only if the guide actually has step headings (graceful skip otherwise).
  const steps = howToSteps(mdxBody);
  if (steps.length > 0) {
    graph.push({
      "@type": "HowTo",
      name: guide.title,
      description: guide.desc,
      inLanguage: LANG,
      // what_you_need → supplies; this is consistent with the visible "Что понадобится".
      supply: (guide.steps || []).map((s) => ({ "@type": "HowToSupply", name: s.t })),
      step: steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s,
        url: `${url}`,
      })),
    });
  }

  // FAQPage only when the guide ships a real, visible "## FAQ" section (≥2 Q&A);
  // otherwise skip gracefully rather than emit empty/spam schema.
  const faq = faqFromBody(mdxBody);
  if (faq.length >= 2) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      inLanguage: LANG,
      mainEntity: faq.map((it) => ({
        "@type": "Question",
        name: it.q,
        acceptedAnswer: { "@type": "Answer", text: it.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

function pageGraph(route, guides) {
  const url = `${BASE}${route.url}`;
  if (route.kind === "home") {
    return {
      "@context": "https://schema.org",
      "@graph": [websiteNode(), organizationNode()],
    };
  }
  if (route.kind === "library") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organizationNode(),
        {
          "@type": "CollectionPage",
          "@id": `${url}#collection`,
          name: `Все гайды — ${SITE_NAME}`,
          url,
          inLanguage: LANG,
          isPartOf: { "@id": `${BASE}/#website` },
          publisher: { "@id": `${BASE}/#organization` },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: guides.length,
            itemListElement: guides.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: guideUrl(g.slug),
              name: g.title,
            })),
          },
        },
        breadcrumbNode([
          { name: "Главная", url: `${BASE}/` },
          { name: "Гайды", url },
        ]),
      ],
    };
  }
  if (route.kind === "about") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organizationNode(),
        {
          "@type": "AboutPage",
          "@id": `${url}#about`,
          name: `О проекте — ${SITE_NAME}`,
          url,
          inLanguage: LANG,
          isPartOf: { "@id": `${BASE}/#website` },
          about: { "@id": `${BASE}/#organization` },
        },
      ],
    };
  }
  if (route.kind === "category") {
    const inCat = guides.filter((g) => g.cat === route.catId);
    return {
      "@context": "https://schema.org",
      "@graph": [
        organizationNode(),
        {
          "@type": "CollectionPage",
          "@id": `${url}#collection`,
          name: `${route.catName} — гайды ${SITE_NAME}`,
          description: route.description,
          url,
          inLanguage: LANG,
          isPartOf: { "@id": `${BASE}/#website` },
          publisher: { "@id": `${BASE}/#organization` },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: inCat.length,
            itemListElement: inCat.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: guideUrl(g.slug),
              name: g.title,
            })),
          },
        },
        breadcrumbNode([
          { name: "Главная", url: `${BASE}/` },
          { name: "Гайды", url: `${BASE}/library/` },
          { name: route.catName, url },
        ]),
      ],
    };
  }
  return null;
}

// ---- analytics -------------------------------------------------------------
// GA4 stream (brand.analytics.ga4) + Yandex.Metrika counter (brand.analytics.metrika),
// both config-driven so a white-label brand injects ITS own tags. Metrika needs
// «Поддомены» ON so blog.* rolls up. Either id may be empty → that vendor's block
// is skipped; if BOTH are empty, ANALYTICS === "" and injectHead skips injection.
// Scripts-only: the Metrika <noscript> pixel is flow content and INVALID inside
// <head> (the parser auto-closes head) — no-JS tracking loss is negligible vs a
// broken head. Injected on every page via injectHead, so desktop + mobile + guides
// all carry it.
const GA4_ID = brand.analytics.ga4 || "";
const METRIKA_ID = brand.analytics.metrika || "";
function analyticsBlock() {
  const parts = [];
  if (GA4_ID) {
    parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>`);
    parts.push(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}');</script>`);
  }
  if (METRIKA_ID) {
    parts.push(`<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(${METRIKA_ID},'init',{webvisor:true,clickmap:true,trackLinks:true,accurateTrackBounce:true});</script>`);
  }
  if (!parts.length) return "";
  const label = [GA4_ID && `GA4 ${GA4_ID}`, METRIKA_ID && `Yandex.Metrika ${METRIKA_ID}`]
    .filter(Boolean)
    .join(" + ");
  return [`<!-- analytics: ${label} -->`, ...parts].join("\n");
}
const ANALYTICS = analyticsBlock();

// Per-page OG image: the guide's own cover WebP (1600×900, content-hashed for
// cache-bust) if it exists, else the site-wide og-default.png fallback. So every
// guide shares to social/AI previews with ITS cover, not one generic image.
function coverOg(slug) {
  if (!slug) return null;
  const p = join(SITE, "covers", `${slug}.webp`);
  if (!existsSync(p)) return null;
  const v = crypto.createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 10);
  return `${BASE}/covers/${slug}.webp?v=${v}`;
}

// ---- <head> injection ------------------------------------------------------
// Build the block of meta/link/JSON-LD tags to splice in just before </head>.
function headBlock({ title, description, canonical, ogType, jsonLd, mdTwin, scrollScript,
                     ogImage, ogImageAlt, published, modified }) {
  const lines = [];
  const img = ogImage || OG_IMAGE; // per-page cover → fallback og-default
  // favicon (EdgeLab Space mark — same icons as edgelab.space / space.edgelab.su)
  lines.push(`<link rel="icon" href="/favicon.ico" sizes="any">`);
  lines.push(`<link rel="icon" type="image/png" href="/icon-32.png" sizes="32x32">`);
  lines.push(`<link rel="apple-touch-icon" href="/apple-touch-icon.png">`);
  lines.push(`<link rel="canonical" href="${attr(canonical)}">`);
  // Open Graph
  lines.push(`<meta property="og:type" content="${ogType}">`);
  lines.push(`<meta property="og:site_name" content="${attr(SITE_NAME)}">`);
  lines.push(`<meta property="og:title" content="${attr(title)}">`);
  if (description) lines.push(`<meta property="og:description" content="${attr(description)}">`);
  lines.push(`<meta property="og:url" content="${attr(canonical)}">`);
  lines.push(`<meta property="og:image" content="${attr(img)}">`);
  lines.push(`<meta property="og:image:width" content="1600">`);
  lines.push(`<meta property="og:image:height" content="900">`);
  lines.push(`<meta property="og:image:alt" content="${attr(ogImageAlt || title)}">`);
  lines.push(`<meta property="og:locale" content="ru_RU">`);
  // article-specific freshness signals (guides/articles only)
  if (ogType === "article") {
    if (published) lines.push(`<meta property="article:published_time" content="${attr(published)}">`);
    if (modified) lines.push(`<meta property="article:modified_time" content="${attr(modified)}">`);
  }
  // Twitter
  lines.push(`<meta name="twitter:card" content="summary_large_image">`);
  lines.push(`<meta name="twitter:title" content="${attr(title)}">`);
  if (description) lines.push(`<meta name="twitter:description" content="${attr(description)}">`);
  lines.push(`<meta name="twitter:image" content="${attr(img)}">`);
  // sitemap + markdown twin
  lines.push(`<link rel="sitemap" type="application/xml" href="/sitemap.xml">`);
  if (mdTwin) {
    lines.push(`<link rel="alternate" type="text/markdown" href="${attr(mdTwin)}">`);
  }
  lines.push(jsonLd);
  // read-through tracker (scroll 25/50/75/100 → Metrika reachGoal + GA4 scroll_depth)
  // — guide/article pages only; external file because prerender strips inline >4KB.
  if (scrollScript) lines.push(`<script src="/scroll-depth.js" defer></script>`);
  return lines.join("\n");
}

// Ensure the page has a <title> and <meta name="description"> matching the data.
// Static pages emitted by the prototype may lack a description meta — add it.
function ensureTitleAndDesc(html, title, description) {
  let out = html;
  // Replace <title>…</title> if a better title is provided (keep existing if absent).
  if (title) {
    if (/<title>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${attr(title)}</title>`);
    } else {
      out = out.replace(/<\/head>/i, `<title>${attr(title)}</title>\n</head>`);
    }
  }
  if (description) {
    if (/<meta\s+name=["']description["'][^>]*>/i.test(out)) {
      out = out.replace(
        /<meta\s+name=["']description["'][^>]*>/i,
        `<meta name="description" content="${attr(description)}">`,
      );
    } else {
      out = out.replace(
        /<\/head>/i,
        `<meta name="description" content="${attr(description)}">\n</head>`,
      );
    }
  }
  return out;
}

// Head-scoped idempotency check for the brand payload (see brandScriptTag).
function hasBrandData(html) {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);
  return head.includes(`id="${BRAND_SCRIPT_ID}"`);
}

// Swap the Google-Fonts href to the brand's one (no-op when the config has none
// or the page has no css2 link). Callback replacement + attr-escape (fix-loop 1).
function swapFontsHref(html) {
  const fontsHref = brandFontsHref(brand);
  if (!fontsHref) return html;
  return html.replace(
    /(<link\s+href=")https:\/\/fonts\.googleapis\.com\/css2[^"]*(")/i,
    (_, pre, post) => `${pre}${attr(fontsHref)}${post}`,
  );
}

async function injectHead(filePath, opts) {
  let html = await fs.readFile(filePath, "utf8");
  html = ensureTitleAndDesc(html, opts.metaTitle, opts.description);
  // White-label (M1): swap the Google-Fonts stylesheet href from brand.config.json
  // so a brand loads ITS webfonts. Rewrites only the URL inside the existing
  // href, so the preconnect + rel stay intact; EdgeLab's href is unchanged.
  // Fix-loop 1: replacement goes through a callback (a literal replacement string
  // would interpret $&/$1 in the URL) and the href is attribute-escaped. The URL
  // shape itself is enforced by the brand.mjs validation gate.
  html = swapFontsHref(html);
  // Fix-loop 2: the SEO block itself gets an idempotency guard too — a second
  // standalone `node scripts/build-seo.mjs` run used to duplicate canonical/og/
  // JSON-LD (only analytics + brand payload were guarded). Every injectHead page
  // receives a canonical link, so its presence in <head> marks a prior pass.
  const headEnd0 = html.search(/<\/head>/i);
  const head0 = headEnd0 === -1 ? html : html.slice(0, headEnd0);
  const block = head0.includes('rel="canonical"') ? "" : headBlock(opts);
  // Splice before the first </head>. Idempotent (skip if already injected) and
  // skip-when-empty (nothing to inject when the brand has no analytics ids).
  const analytics = (!ANALYTICS || html.includes("<!-- analytics:")) ? "" : `${ANALYTICS}\n`;
  // White-label (M1): window.__BRAND (read by the re-mounting React app) + the
  // palette/font :root override, both from brand.config.json. Placed just before
  // </head> — i.e. AFTER the gf-styles.css link — so the :root override wins.
  // Idempotent: skip when a prior pass already injected the brand-data script —
  // detected by its id INSIDE <head> (fix-loop 1: guide body text mentioning
  // window.__BRAND must not suppress the injection).
  const brandHead = hasBrandData(html)
    ? ""
    : `${brandScriptTag(brand)}\n${brandTokensStyle(brand)}\n`;
  html = html.replace(/<\/head>/i, `${block}${block ? "\n" : ""}${analytics}${brandHead}</head>`);
  // content_group for GA4 (article vs guide) — set on <body> post-snapshot so
  // scroll-depth.js can gtag('set',{content_group}). Idempotent.
  if (opts.contentGroup) {
    html = html.replace(/<body\b([^>]*)>/i, (m, a) =>
      a.includes("data-content-group")
        ? m
        : `<body${a} data-content-group="${attr(opts.contentGroup)}">`,
    );
  }
  await fs.writeFile(filePath, html, "utf8");
}

// ---- sidecar files ---------------------------------------------------------

// White-label (M1): off-canonical pages (guide.html — the standalone article demo,
// mobile.html — the anchor-routed mobile shell) are deliberately excluded from the
// canonical/sitemap pass, but they are real, user-reachable pages: without the brand
// payload a white-label build would show EdgeLab fallbacks there. Inject ONLY the
// brand head (fonts href swap + window.__BRAND + :root tokens) — no canonical/JSON-LD.
// Idempotent, same guards as injectHead.
//
// SEO: no canonical means a crawler that reaches guide.html / mobile.html sees a
// duplicate of a real page with no self-declared address → duplicate content. They
// are excluded from the canonical pass on purpose, so the only correct signal is an
// explicit `robots: noindex` (they stay reachable, just not indexable).
async function injectBrandOnly(filePath) {
  if (!existsSync(filePath)) return false;
  let html = await fs.readFile(filePath, "utf8");
  html = swapFontsHref(html);
  if (!hasBrandData(html)) {
    html = html.replace(
      /<\/head>/i,
      `${brandScriptTag(brand)}\n${brandTokensStyle(brand)}\n</head>`,
    );
  }
  if (!/<meta\s+name=["']robots["']/i.test(html)) {
    html = html.replace(/<\/head>/i, `<meta name="robots" content="noindex">\n</head>`);
  }
  await fs.writeFile(filePath, html, "utf8");
  return true;
}

function notFoundHtml() {
  // White-label (M1): wordmark + accent come from brand.config.json, mirroring
  // the Logo component in gf-app.jsx (first word · square · rest, lowercased).
  // Fix-loop 1: palette is optional in the config contract (a step-1 config has
  // none) — fall back to the EdgeLab accent instead of crashing; a single-word
  // brand renders no trailing square; the brand webfont is actually loaded.
  const accent = (brand.palette && brand.palette.accent) || "#D4FF00";
  const fontsHref = brandFontsHref(brand) ||
    "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&display=swap";
  const parts = brand.brandName.split(/\s+/);
  const wordA = (parts[0] || brand.brandName).toLowerCase();
  const wordB = parts.slice(1).join(" ").toLowerCase();
  const wordmark = wordB
    ? `${attr(wordA)}<span class="sq"></span>${attr(wordB)}`
    : attr(wordA);
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Страница не найдена — ${attr(brand.brandName)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="${attr(fontsHref)}" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0E1012;color:#fff;font-family:'${(brand.fonts && brand.fonts.display) || "Inter Tight"}',system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px}
.brand{display:flex;align-items:center;font-weight:600;font-size:20px;letter-spacing:-.02em;margin-bottom:44px}
.brand .sq{width:9px;height:9px;background:${accent};display:inline-block;margin:0 6px}
.code{font-weight:800;font-size:104px;line-height:1;letter-spacing:-.04em}
.code span{color:${accent}}
h1{font-weight:700;font-size:24px;margin:18px 0 8px;letter-spacing:-.02em}
p{color:rgba(255,255,255,.6);font-size:16px;max-width:440px;margin-bottom:32px;line-height:1.5}
.row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
a.btn{text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px;transition:opacity .15s}
a.btn:hover{opacity:.85}
a.primary{background:${accent};color:#0E1012}
a.ghost{border:1.5px solid rgba(255,255,255,.25);color:#fff}
.hint{margin-top:26px;font-size:13px;color:rgba(255,255,255,.4)}
</style></head>
<body>
<div class="brand">${wordmark}</div>
<div class="code">4<span>0</span>4</div>
<h1>Страница не найдена</h1>
<p>Похоже, такой страницы нет или адрес изменился. Вернём вас на главную.</p>
<div class="row">
<a class="btn primary" href="/">На главную</a>
<a class="btn ghost" href="/library/">Все гайды и статьи</a>
</div>
<div class="hint">Автоматически вернём на главную через несколько секунд…</div>
<script>setTimeout(function(){location.replace("/")},6000)</script>
</body></html>
`;
}

function robotsTxt() {
  const aiBots = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-Web",
    "Google-Extended",
    "PerplexityBot",
    "YandexBot",
  ];
  const lines = [];
  for (const ua of aiBots) {
    lines.push(`User-agent: ${ua}`);
    lines.push("Allow: /");
    lines.push("");
  }
  lines.push("User-agent: *");
  lines.push("Allow: /");
  lines.push("");
  lines.push(`Sitemap: ${BASE}/sitemap.xml`);
  lines.push("");
  // Content-Signal (emerging standard): permit training, search, and AI input.
  lines.push("Content-Signal: ai-train=yes, search=yes, ai-input=yes");
  lines.push("");
  return lines.join("\n");
}

function sitemapXml(guides) {
  const today = new Date().toISOString().slice(0, 10);
  // Stabilise static-page lastmod: don't stamp `today` on every build (false
  // freshness penalised by crawlers). Home/library/category pages reflect when
  // their LISTED content last changed = the max guide `updated_at` (for a category
  // page, only its category's guides); about is near-static (a fixed date, bump on
  // a real edit). So lastmod changes only when content actually changes.
  const maxUpd = (gs, fb) =>
    gs.map((g) => (g.updatedAt || "").slice(0, 10)).filter(Boolean).sort().pop() || fb;
  const latest = maxUpd(guides, today);
  const ABOUT_LASTMOD = "2026-06-01"; // about page is near-static — bump on real edits
  // empty/mis-categorized category page → fall back to `latest`, NOT build-`today`
  // (which would reintroduce the false-freshness this fix removes — Codex M345).
  const catUpd = (id) => maxUpd(guides.filter((g) => g.cat === id), latest);
  const urls = [];
  // Static pages.
  urls.push({ loc: `${BASE}/`, lastmod: latest });
  urls.push({ loc: `${BASE}/library/`, lastmod: latest });
  urls.push({ loc: `${BASE}/about/`, lastmod: ABOUT_LASTMOD });
  // Category listing pages (CAT_PAGES: pillar + guides + site file), only those the
  // prerender actually produced (no 404 URLs in the sitemap). lastmod = the newest
  // guide listed on the page (max of its children), like home/library above.
  for (const c of CAT_PAGES) {
    if (!existsSync(join(BUILD, c.file))) {
      console.warn(`  WARN  sitemap: pillar ${c.pillar} of category «${c.id}» has no prerendered page — skipped`);
      continue;
    }
    urls.push({ loc: `${BASE}${c.pillar}`, lastmod: catUpd(c.id) });
  }
  // Guides.
  for (const g of guides) {
    const lastmod = (g.updatedAt || "").slice(0, 10) || today;
    urls.push({ loc: guideUrl(g.slug), lastmod });
  }
  const body = urls
    .map(
      (u) =>
        // No <changefreq>/<priority>: Google ignores both; <lastmod> is the only
        // signal it uses, and only while it stays honest (scripts/content-dates.mjs).
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// llms-full.txt — the FULL text of every guide in one file (llms.txt advertises
// it but it was 404). LLMs/agents fetch this for the whole corpus in one request.
// Built from the same frontmatter-stripped MDX bodies as the per-guide .md twins.
function llmsFullTxt(guides) {
  const parts = [
    "# EdgeLab Space — полный текст гайдов (llms-full.txt)",
    "",
    "> Полное содержимое всех гайдов blog.edgelab.space в одном файле, для загрузки " +
      "корпуса в контекст LLM/агента одним запросом. Источник — markdown-двойники гайдов.",
    "",
  ];
  for (const g of guides) {
    const body = stripFrontmatter(readFileSync(join(SRC, `${g.slug}.mdx`), "utf8")).trim();
    parts.push("---", "", `# ${g.title}`, guideUrl(g.slug), "", body, "");
  }
  return parts.join("\n");
}

function llmsTxt(guides) {
  const lines = [];
  lines.push(`# ${SITE_NAME} — портал об AI-агентах`);
  lines.push("");
  lines.push(
    "> Практические гайды на русском по Claude Code, MCP-серверам, AI-агентам, " +
      "автоматизации видео и личным базам знаний. Каждый гайд протестирован, с " +
      "датой обновления, готовыми промптами и пошаговой настройкой. " +
      "EdgeLab Space — закрытое AI-комьюнити: библиотека, живой чат, эфиры по средам.",
  );
  lines.push("");
  lines.push("## Гайды");
  lines.push("");
  for (const g of guides) {
    const desc = (g.tldr || g.desc || "").replace(/\s+/g, " ").trim();
    lines.push(`- [${g.title}](${guideUrl(g.slug)}): ${desc}`);
  }
  lines.push("");
  lines.push("## Доступ для агентов");
  lines.push("");
  lines.push(
    `- [MCP-сервер](${brand.mcpIdentity.serverUrl}): программный доступ к библиотеке ` +
      "EdgeLab Space через Model Context Protocol (по токену) — поиск материалов, чтение гайдов, вопросы хаба. " +
      "Это поддерживаемый агент-интерфейс.",
  );
  lines.push(
    `- [Документация](${brand.mcpIdentity.docsUrl}): описание MCP-тулов, ` +
      "схемы API, примеры запросов.",
  );
  lines.push("");
  lines.push("## Файлы обнаружения");
  lines.push("");
  lines.push(`- [robots.txt](${BASE}/robots.txt): правила для AI-краулеров + Content-Signal.`);
  lines.push(`- [sitemap.xml](${BASE}/sitemap.xml): карта всех страниц.`);
  lines.push(`- [search-index.json](${BASE}/search-index.json): машиночитаемый индекс поиска по гайдам.`);
  lines.push(`- [MCP server-card](${BASE}/.well-known/mcp/server-card.json): карточка MCP-сервера.`);
  lines.push(`- [API-каталог](${BASE}/.well-known/api-catalog): linkset публичного API.`);
  lines.push(`- [Agent skills](${BASE}/.well-known/agent-skills/index.json): индекс агентских скиллов.`);
  lines.push("");
  return lines.join("\n");
}

function searchIndexJson(guides) {
  // Agent-native, machine-readable search index: one record per guide with the
  // fields an agent needs to locate + open a guide. Mirrors what the in-browser
  // MiniSearch index covers, minus the heavy body text.
  return JSON.stringify(
    guides.map((g) => ({
      slug: g.slug,
      title: g.title,
      desc: g.desc || "",
      category: g.catName,
      level: g.level,
      min: g.min,
      url: `/guides/${g.slug}/`,
      tags: Array.isArray(g.tags) ? g.tags : [],
    })),
    null,
    2,
  );
}

function serverCardJson() {
  // SEP-1649-style server card: a pointer to the EXISTING MCP server.
  return JSON.stringify(
    {
      $schema: "https://modelcontextprotocol.io/schemas/draft/server-card.json",
      serverInfo: {
        name: brand.mcpIdentity.name,
        title: brand.mcpIdentity.title,
        version: "1.0.0",
        description:
          "Программный доступ к библиотеке EdgeLab Space: поиск материалов, чтение гайдов, вопросы хаба.",
        websiteUrl: PUBLISHER_URL,
      },
      transport: {
        type: "streamable-http",
        url: brand.mcpIdentity.serverUrl,
      },
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
      },
      documentationUrl: brand.mcpIdentity.docsUrl,
    },
    null,
    2,
  );
}

function apiCatalogJson() {
  // RFC 9727: api-catalog as application/linkset+json.
  return JSON.stringify(
    {
      linkset: [
        {
          anchor: brand.mcpIdentity.apiUrl,
          // Supported agent interface is the token-gated MCP server; the public
          // unauth REST/openapi was retired (security lockdown 2026-06-15), so we
          // no longer advertise /openapi.json. /health stays public for monitoring.
          "service-doc": [
            {
              href: brand.mcpIdentity.docsUrl,
              type: "text/html",
            },
          ],
          status: [{ href: `${brand.mcpIdentity.apiUrl}/health`, type: "application/json" }],
        },
      ],
    },
    null,
    2,
  );
}

function agentSkillsJson() {
  // Agent Skills Discovery (RFC v0.2.0): index of the brand's skills, sourced
  // from brand.mcpIdentity.skills. sha256 is a placeholder until the skill
  // manifests are published & hashed.
  const placeholder = "sha256-" + "0".repeat(64);
  return JSON.stringify(
    {
      version: "0.2.0",
      skills: (brand.mcpIdentity.skills || []).map((s) => ({
        name: s.name,
        type: s.type,
        description: s.description,
        url: s.url,
        sha256: placeholder,
      })),
    },
    null,
    2,
  );
}

// Per-route <title>/<meta> copy for the static (non-guide) pages. Shared by the
// desktop and mobile passes so a mobile twin gets the SAME title/description as
// its desktop page.
function pageMeta(route) {
  if (route.kind === "home") {
    return {
      metaTitle: `${SITE_NAME} — портал об AI-агентах`,
      title: `${SITE_NAME} — портал об AI-агентах`,
      // White-label fix-loop 2: home.metaDescription (niche block) overrides the
      // home meta; deliberately a SEPARATE field from home.description (the hero
      // text) so adding the niche block does not silently change the default SEO.
      // The default template is byte-identical to the previous literal.
      description:
        (brand.home && brand.home.metaDescription) ||
        `Практические гайды по Claude Code, MCP, AI-агентам и автоматизации. Закрытое AI-комьюнити ${SITE_NAME}.`,
    };
  }
  if (route.kind === "library") {
    return {
      metaTitle: `Все гайды — ${SITE_NAME}`,
      title: `Все гайды — ${SITE_NAME}`,
      description: "Каталог практических гайдов по AI-агентам, Claude Code и автоматизации.",
    };
  }
  if (route.kind === "about") {
    return {
      metaTitle: `О проекте — ${SITE_NAME}`,
      title: `О проекте — ${SITE_NAME}`,
      description: `${SITE_NAME} — закрытое AI-комьюнити: библиотека, живой чат, эфиры по средам.`,
    };
  }
  // category: the listing intro (brand `categories[].description`, else built from
  // the listed guides) — not one «Гайды по теме X» template shared by every category.
  return {
    metaTitle: `${route.catName} — гайды ${SITE_NAME}`,
    title: `${route.catName} — гайды ${SITE_NAME}`,
    description: route.description,
  };
}

// Mobile twins: built file under build/m/ → the DESKTOP route it shares a
// canonical/JSON-LD with. The desktop twin of m/index.html is home ("/").
// m/index.html mirrors index.html (home); the rest keep the same basename.
const mobilePageRoutes = () => PAGE_ROUTES.map((r) => ({ ...r, file: `m/${r.file}` }));

// Inject the desktop canonical + matching JSON-LD into every mobile page. The
// mobile HTML body is never touched — only the <head> — so the mobile design
// stays 1:1. mdTwin is omitted on mobile (the .md twin lives once, at /guides/).
async function injectMobile(guides) {
  // mobile static pages (home/library/about/3 categories).
  for (const route of mobilePageRoutes()) {
    const htmlPath = join(BUILD, route.file);
    try {
      await fs.access(htmlPath);
    } catch {
      console.warn(`  build-seo: ${route.file} not found in build/ — skipped`);
      continue;
    }
    const meta = pageMeta(route);
    // Canonical is the DESKTOP url (route.url), NOT a /m/ url — dynamic serving.
    const jsonLd = jsonLdScript(pageGraph(route, guides));
    await injectHead(htmlPath, {
      metaTitle: meta.metaTitle,
      title: meta.title,
      description: meta.description,
      canonical: `${BASE}${route.url}`,
      ogType: "website",
      jsonLd,
      mdTwin: null,
    });
  }

  // mobile per-guide pages — same canonical + TechArticle graph as the desktop
  // guide, reusing the already-written .md twin link.
  for (const g of guides) {
    const htmlPath = join(BUILD, "m", "guides", `${g.slug}.html`);
    try {
      await fs.access(htmlPath);
    } catch {
      console.warn(`  build-seo: m/guides/${g.slug}.html not found — skipped`);
      continue;
    }
    const mdxRaw = await fs.readFile(join(SRC, `${g.slug}.mdx`), "utf8");
    const mdBody = stripFrontmatter(mdxRaw);
    const jsonLd = jsonLdScript(techArticleGraph(g, mdBody));
    await injectHead(htmlPath, {
      metaTitle: `${g.title} — ${SITE_NAME}`,
      title: g.title,
      description: g.desc,
      canonical: guideUrl(g.slug), // DESKTOP guide url
      ogType: "article",
      jsonLd,
      mdTwin: `/guides/${g.slug}.md`,
      scrollScript: true,
      contentGroup: g.type,
      ogImage: coverOg(g.slug),
      ogImageAlt: g.title,
      published: g.publishedAt,
      modified: g.updatedAt,
    });
  }
}

// ---- main ------------------------------------------------------------------
async function main() {
  const guides = await loadGuides();
  CAT_PAGES = categoryPages(guides);
  for (const c of CAT_PAGES) {
    PAGE_ROUTES.push({ file: c.file, url: c.pillar, kind: "category", catId: c.id, catName: c.name, description: c.description });
  }

  // 1) Per-guide <head> injection + markdown twin.
  for (const g of guides) {
    const htmlPath = join(BUILD, "guides", `${g.slug}.html`);
    const canonical = guideUrl(g.slug);
    const mdTwinRel = `/guides/${g.slug}.md`;

    // markdown twin from the MDX body (frontmatter stripped).
    const mdxRaw = await fs.readFile(join(SRC, `${g.slug}.mdx`), "utf8");
    const mdBody = stripFrontmatter(mdxRaw);
    await fs.writeFile(join(BUILD, "guides", `${g.slug}.md`), mdBody, "utf8");

    const jsonLd = jsonLdScript(techArticleGraph(g, mdBody));
    await injectHead(htmlPath, {
      metaTitle: `${g.title} — ${SITE_NAME}`,
      title: g.title,
      description: g.desc,
      canonical,
      ogType: "article",
      jsonLd,
      mdTwin: mdTwinRel,
      scrollScript: true,
      contentGroup: g.type,
      ogImage: coverOg(g.slug),
      ogImageAlt: g.title,
      published: g.publishedAt,
      modified: g.updatedAt,
    });
  }

  // 2) Static-page <head> injection.
  for (const route of PAGE_ROUTES) {
    const htmlPath = join(BUILD, route.file);
    try {
      await fs.access(htmlPath);
    } catch {
      console.warn(`  build-seo: ${route.file} not found in build/ — skipped`);
      continue;
    }
    const meta = pageMeta(route);
    const jsonLd = jsonLdScript(pageGraph(route, guides));
    await injectHead(htmlPath, {
      metaTitle: meta.metaTitle,
      title: meta.title,
      description: meta.description,
      canonical: `${BASE}${route.url}`,
      ogType: "website",
      jsonLd,
      mdTwin: null,
    });
  }

  // 3) MOBILE <head> injection (dynamic serving: same URL as desktop, different
  // HTML by User-Agent). Each build/m/*.html is the mobile twin of a desktop
  // page and MUST carry the DESKTOP canonical + the same JSON-LD, so search
  // engines see one canonical page regardless of which variant they fetch.
  // mobile home → m/index.html (canonical /), library/about/categories likewise,
  // and each guide's mobile view → m/guides/<slug>.html (canonical /guides/<slug>/).
  await injectMobile(guides);

  // 3b) White-label (M1): brand payload for the off-canonical pages (see
  // injectBrandOnly). guide.html and mobile.html exist after prerender.
  const offCanonical = [];
  for (const f of ["guide.html", "mobile.html"]) {
    if (await injectBrandOnly(join(BUILD, f))) offCanonical.push(f);
  }

  // 4) Sidecar files.
  await fs.writeFile(join(BUILD, "robots.txt"), robotsTxt(), "utf8");
  const sitemap = sitemapXml(guides);
  await fs.writeFile(join(BUILD, "sitemap.xml"), sitemap, "utf8");
  await fs.writeFile(join(BUILD, "llms.txt"), llmsTxt(guides), "utf8");
  await fs.writeFile(join(BUILD, "llms-full.txt"), llmsFullTxt(guides), "utf8");
  await fs.writeFile(join(BUILD, "search-index.json"), searchIndexJson(guides), "utf8");
  // IndexNow key file (served at /<KEY>.txt, body = the key).
  await fs.writeFile(join(BUILD, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY, "utf8");

  // /guides/ (bare directory) → redirect to the catalog /library/, so truncating a
  // /guides/<slug>/ URL to its parent doesn't hit a 404. NB: Caddy normalizes `/guides/`
  // to `/guides.html` (strip trailing slash + add .html), so the stub MUST be guides.html
  // (a guides/index.html would never be served under this Caddy rewrite).
  await fs.writeFile(
    join(BUILD, "guides.html"),
    `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Гайды — ${attr(brand.brandName)}</title>` +
      `<link rel="canonical" href="${BASE}/library/"><meta name="robots" content="noindex">` +
      `<meta http-equiv="refresh" content="0; url=/library/"><script>location.replace("/library/")</script>` +
      `</head><body>Перейти в <a href="/library/">каталог гайдов</a>…</body></html>\n`,
    "utf8",
  );

  // Styled 404 page (served by Caddy `handle_errors`) — on-brand, returns the user home
  // (prominent button + gentle auto-redirect) instead of a bare "Not Found".
  await fs.writeFile(join(BUILD, "404.html"), notFoundHtml(), "utf8");

  await fs.mkdir(join(BUILD, ".well-known", "mcp"), { recursive: true });
  await fs.writeFile(
    join(BUILD, ".well-known", "mcp", "server-card.json"),
    serverCardJson(),
    "utf8",
  );
  await fs.writeFile(join(BUILD, ".well-known", "api-catalog"), apiCatalogJson(), "utf8");
  await fs.mkdir(join(BUILD, ".well-known", "agent-skills"), { recursive: true });
  await fs.writeFile(
    join(BUILD, ".well-known", "agent-skills", "index.json"),
    agentSkillsJson(),
    "utf8",
  );

  // hash one twin just to surface in logs (sanity that twins carry real text).
  const sampleTwin = await fs.readFile(
    join(BUILD, "guides", `${guides[0].slug}.md`),
    "utf8",
  );

  console.log("\nSEO layer emitted:");
  console.log(`  ${guides.length} guide <head> blocks injected (JSON-LD TechArticle + BreadcrumbList)`);
  console.log(`  ${PAGE_ROUTES.length} static-page <head> blocks injected`);
  console.log(`  ${mobilePageRoutes().length} +${guides.length} mobile <head> blocks injected (canonical → desktop twin)`);
  console.log(`  ${offCanonical.length} off-canonical pages brand-injected (${offCanonical.join(", ")})`);
  console.log(`  ${guides.length} markdown twins → build/guides/<slug>.md`);
  console.log(`  robots.txt, sitemap.xml (${(sitemap.match(/<url>/g) || []).length} urls), llms.txt, search-index.json (${guides.length} guides)`);
  console.log(`  .well-known/{mcp/server-card.json, api-catalog, agent-skills/index.json}`);
  console.log(`  sample twin ${guides[0].slug}.md: ${sampleTwin.length} bytes, sha256 ${sha256(sampleTwin).slice(0, 12)}…`);
}

// Run only as a script (prerender spawns it); an import (tests) gets the helpers.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { techArticleGraph };
