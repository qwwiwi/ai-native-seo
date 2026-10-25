/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard, DCPostIt */
const { useState } = React;

// ---- white-label brand (M1) -----------------------------------------------
// The portal is baked to static HTML with window.__BRAND injected into <head>
// at build time from brand.config.json (see scripts/brand-client.mjs). Every
// brand-tunable literal below reads from it, falling back to the current EdgeLab
// Space values so the raw prototype (opened without an injected __BRAND) still
// renders standalone. Swapping brand.config.json white-labels the whole UI.
const BRAND = (typeof window !== "undefined" && window.__BRAND) || {};
const BRAND_NAME = BRAND.brandName || "EdgeLab Space";
// Non-breaking-space variants so a multi-word brand name never wraps mid-name —
// these reproduce the original `EdgeLab&nbsp;Space` / `EDGELAB&nbsp;SPACE`
// literals (U+00A0 serializes back to &nbsp; in the prerendered HTML).
const BRAND_NB = BRAND_NAME.replace(/ /g, "\u00A0");
const BRAND_UPPER = BRAND_NAME.toUpperCase();
const BRAND_UPPER_NB = BRAND_UPPER.replace(/ /g, "\u00A0");

const FUNNEL = BRAND.funnel || {};
// mode:"none" removes every community CTA / promo banner from the UI.
const FUNNEL_ON = (FUNNEL.mode || "community") !== "none";
const CTA_TEXT = FUNNEL.ctaText || "Вступить в сообщество";
const FUNNEL_URL = (FUNNEL.targetUrl || "https://edgelab.space").replace(/\/+$/, "");
const FUNNEL_OFFER = FUNNEL.offerText || "Закрытое AI-комьюнити: библиотека скиллов, живой чат, эфиры по средам.";

// Home-hero niche texts (white-label M1 step 5) — the niche layer of the home
// page reads from config; EdgeLab literals are the fallbacks.
const HOME = BRAND.home || {};
const HOME_EYEBROW = HOME.eyebrow || "AI ПОРТАЛ";
const HOME_TITLE = HOME.title || "Статьи и гайды по трендовым AI решениям";
const HOME_DESC = HOME.description || "Разбираю на практике Claude Code, дизайн с AI, базы знаний и автоматизацию – живым языком, без сухих инструкций.";
const HOME_CTA_TEXT = HOME.ctaText || "Начать внедрение";
const HOME_CTA_HREF = HOME.ctaHref || "/guides/kak-vnedrit-ai-agentov/";
const HOME_HERO_IMG = HOME.heroImage || "/covers/_home-hero-dashi.webp";

const AUTHOR = BRAND.author || {};
const AUTHOR_NAME = AUTHOR.name || "Даши Ешиев";
const LEGAL_NAME = AUTHOR.legal || "EdgeLab Space";
const LEGAL_ENTITY = AUTHOR.legalEntity || "ИП ЕШИЕВ ЦЫРЕН-ДАШИ БУЛАТОВИЧ · ИНН 032315681243";

// Community-landing apex host — the click-time UTM forwarder rewrites only links
// that point here. Derived from the funnel target so white-labels work too.
const FUNNEL_HOST = (() => {
  try { return new URL(FUNNEL_URL).hostname.replace(/^www\./, ""); } catch (_) { return "edgelab.space"; }
})();

// Funnel UTM is brand data (funnel.utm in the brand config): source / campaign /
// the utm_content prefix of the blog touchpoint.
const UTM = FUNNEL.utm || {};
const UTM_SOURCE = UTM.source || "blog";
const UTM_CAMPAIGN = UTM.campaign || "blog";
const UTM_PREFIX = UTM.contentPrefix != null ? UTM.contentPrefix : "blog-";
// The page this link is baked into — a guide's own slug, else the route name
// (home/library/claude/…). It goes into utm_content as «<prefix><page>», the same
// value the click-time forwarder below sets, so a guide → registration stays
// attributable even when JS does not run (crawlers, copy-link, middle-click).
// Before this fix a hardcoded "claude-code-setup" was baked into EVERY page.
const PAGE_SLUG = (() => {
  try {
    const w = window;
    // Mobile shell routes by hash first (the prerender and interactive mobile.html),
    // then the baked __GF_ROUTE — the same order as the mobile mount-switch below.
    const hash = w.__GF_VIEW === "mobile" ? (w.location.hash || "").replace("#", "") : "";
    const s = w.__GF_SLUG || hash || w.__GF_ROUTE || w.__GF_CAT || w.__GF_VIEW || "home";
    return String(s).replace(/[^a-z0-9-]/gi, "").toLowerCase() || "home";
  } catch (_) { return "home"; }
})();
const utm = (m) => `${FUNNEL_URL}/?utm_source=${UTM_SOURCE}&utm_medium=${m}&utm_campaign=${UTM_CAMPAIGN}&utm_content=${UTM_PREFIX}${PAGE_SLUG}`;

// UTM forwarding (prince 2026-06-17): a visitor who arrives from the IG bio link
// (?utm_source=instagram…) must keep that origin across blog navigation, and the
// community CTA must pass the REAL source to edgelab.space — not «guides» (which
// overwrote it). Capture the inbound UTM once per session; on any click of a link
// to the community landing (apex edgelab.space — NOT blog./platform.) rewrite its
// query to carry the preserved origin + a «blog-» touchpoint. Click-time rewrite
// is prerender/hydration-safe (no SSR markup change).
function captureInboundUTM() {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get("utm_source") && !sessionStorage.getItem("els_inbound_utm")) {
      const u = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => { const v = p.get(k); if (v) u[k] = v; });
      sessionStorage.setItem("els_inbound_utm", JSON.stringify(u));
    }
  } catch (_) {}
}
function wireUTMForward() {
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    let u;
    try { u = new URL(a.href, location.origin); } catch (_) { return; }
    if (u.hostname.replace(/^www\./, "") !== FUNNEL_HOST) return; // community landing apex only (blog./platform. excluded)
    // Touchpoint = the blog page the click came FROM (read at click time, so it is
    // correct under any navigation), not the link's baked-in slug. This replaces the
    // hardcoded SLUG placeholder and also tags bare in-article links to edgelab.space.
    const path = location.pathname.replace(/\/+$/, "");
    const gm = path.match(/\/guides\/([^/]+)/);
    const touch = gm
      ? gm[1]
      : (path === "" || /\/index\.html$/.test(path) ? "home" : (path.split("/").pop() || "home").replace(/\.html$/, ""));
    let inb = null;
    try { inb = JSON.parse(sessionStorage.getItem("els_inbound_utm") || "null"); } catch (_) {}
    // First-touch origin (e.g. instagram/bio) when the visitor arrived with a UTM,
    // else organic «guides». utm_content carries the blog touchpoint either way.
    u.searchParams.set("utm_source", inb && inb.utm_source ? inb.utm_source : UTM_SOURCE);
    if (inb && inb.utm_medium) u.searchParams.set("utm_medium", inb.utm_medium);
    u.searchParams.set("utm_campaign", UTM_CAMPAIGN);
    u.searchParams.set("utm_content", UTM_PREFIX + touch);
    if (inb && inb.utm_term) u.searchParams.set("utm_term", inb.utm_term);
    a.href = u.toString();
  }, true);
}
// Wire unconditionally when a DOM exists — each helper guards its own sessionStorage
// access, so organic «guides» forwarding still works even if storage is unavailable.
try { if (typeof window !== "undefined" && window.document) { captureInboundUTM(); wireUTMForward(); } } catch (_) {}

// M-theme: persist the chosen theme across pages. Default light; dark sticks.
// getStoredTheme seeds React state from localStorage; applyTheme mirrors the
// choice onto <html class="theme-dark"> (so html/body bg is dark too — see CSS)
// + saves it; flipTheme toggles. An inline <head> script applies the html class
// BEFORE paint to avoid a light flash (FOUC) on stored-dark navigations.
function getStoredTheme(fallback) {
  try {
    const v = window.localStorage.getItem("gfTheme");
    if (v === "dark" || v === "light") return v;
  } catch (e) { /* private mode / no storage */ }
  return fallback || "light";
}
function applyTheme(t) {
  try {
    const d = document.documentElement;
    if (t === "dark") d.classList.add("theme-dark"); else d.classList.remove("theme-dark");
    window.localStorage.setItem("gfTheme", t);
  } catch (e) { /* noop */ }
}
function flipTheme(setTheme) {
  setTheme((t) => { const n = t === "dark" ? "light" : "dark"; applyTheme(n); return n; });
}

/* ---------- logo + header ---------- */
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"></path></svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8 5.6 5.6 0 1 0 13.2 9.6z" fill="currentColor"></path></svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3.1"></circle><path d="M8 1.3v1.5M8 13.2v1.5M1.3 8h1.5M13.2 8h1.5M3.3 3.3l1 1M11.7 11.7l1 1M12.7 3.3l-1 1M4.3 11.7l-1 1"></path></svg>
  );
}
function ThemeToggle({ night, onClick }) {
  return (
    <button className="gp-toggle" aria-label="Сменить тему" type="button" onClick={onClick}>{night ? <SunIcon /> : <MoonIcon />}</button>
  );
}

function Logo() {
  // clicking the logo (header/footer/drawer) goes to the home page. The two-part
  // wordmark is derived from the brand name (first word + the rest), so a
  // white-label brand renders its own name; EdgeLab Space → «edgelab ▪ space».
  const parts = BRAND_NAME.split(/\s+/);
  const a = (parts[0] || BRAND_NAME).toLowerCase();
  const b = parts.slice(1).join(" ").toLowerCase();
  return (
    <a href="/" className="el-logo" aria-label={`${BRAND_NAME} — на главную`}><span className="a">{a}</span>{b && <span className="sq"></span>}{b && <span className="b">{b}</span>}</a>
  );
}
// Author byline under the title (guides + articles), Substack-style author header.
// `meta` = optional read-time/date shown after the author («Даши Ешиев · 15 мин чтения»).
function Byline({ meta }) {
  return (
    <a className="gp-byline" href={TG} target="_blank" rel="noopener" aria-label="Канал «Записки AI-энтузиаста»">
      <img className="gp-byline-av" src="/images/author-avatar.png" alt="" width="40" height="40" loading="lazy" />
      <span className="gp-byline-txt">
        <span className="gp-byline-ch">{TG_NAME}</span>
        <span className="gp-byline-au">{AUTHOR_NAME}{meta ? " · " + meta : ""}</span>
      </span>
    </a>
  );
}

const TG = (BRAND.telegram && BRAND.telegram.channelUrl) || "https://t.me/dashi_agent";
const TG_NAME = (BRAND.telegram && BRAND.telegram.channelName) || "Записки AI-энтузиаста";
// funnel docs + landing links (footer)
const DOC_PRIVACY = (FUNNEL.docs && FUNNEL.docs.privacy) || "https://drive.google.com/file/d/1hUEZbJBCdTQcpBqy_OAd8EupZwY9Xpx1/view";
const DOC_OFFER = (FUNNEL.docs && FUNNEL.docs.offer) || "https://drive.google.com/file/d/1i6XeY6SMcuA4uYYxBVpxEPN_EI_AeIH6/view";
// Footer «streams» / «chat» lead to the landing itself with a placement UTM: a
// #streams / #community anchor is not guaranteed to exist on a brand's landing
// (a rebuilt landing dropped them → dead links), and the tag keeps the click
// attributable even when the click-time forwarder does not run.
const ELS_STREAMS = utm("footer-streams");
const ELS_COMMUNITY = utm("footer-community");
function TelegramButton() {
  return (
    <a className="tg-link" href={TG} target="_blank" rel="noopener"><span className="d"></span>Телеграм-канал</a>
  );
}

/* ---------- portal navigation ---------- */
// Absolute clean URLs — work from any page depth / trailing-slash / device-served
// path. No .html, no relative ../ juggling (that broke styling on clean URLs).
const PAGES = { home: "/", library: "/library/", articles: "/#articles", claude: "/claude-code/", hermes: "/hermes/", codex: "/codex/", about: "/about/", guide: "/guide/" };
const GF_BASE = "";
const GUIDE_HREF = (slug) => `/guides/${slug}/`;
const P = (key) => PAGES[key];
const NAV = [["home", "Главная"], ["library", "Гайды"], ["articles", "Статьи"], ["claude", "Claude Code"], ["hermes", "Hermes"], ["codex", "Codex"], ["about", "О проекте"]];
function NavLinks({ cur }) {
  return (
    <nav className="gp-nav">
      {NAV.map(([k, l]) => (<a key={k} className={cur === k ? "cur" : ""} href={P(k)}>{l}</a>))}
    </nav>
  );
}
function JoinBtn() {
  if (!FUNNEL_ON) return null;
  return (<a className="gp-headbtn" href={utm("header")}>{CTA_TEXT} <span className="ar">→</span></a>);
}
function MobileMenuPanel({ cur, open, onClose }) {
  return (
    <div className={"m-drawer-scrim" + (open ? " show" : "")} onClick={onClose}>
      <div className="m-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="m-drawer-head"><Logo /><button className="m-drawer-close" type="button" onClick={onClose}>✕</button></div>
        <nav className="m-drawer-nav">
          {NAV.map(([k, l]) => (<a key={k} className={cur === k ? "cur" : ""} href={P(k)}>{l}</a>))}
        </nav>
        {FUNNEL_ON && <div className="m-drawer-group">Сообщество</div>}
        {FUNNEL_ON && <div className="m-drawer-foot"><a className="m-drawer-join" href={utm("header")}>{CTA_TEXT} →</a></div>}
      </div>
    </div>
  );
}
function PortalHead({ cur, mobile, night, onToggle }) {
  const [menu, setMenu] = useState(false);
  return (
    <React.Fragment>
      <div className={"gp-header" + (night ? " dark" : "")}>
        <div className="gp-head-inner">
          <Logo />
          {!mobile && <NavLinks cur={cur} />}
          <span className="spacer"></span>
          <div className="head-tools">
            <button className="gp-toggle" type="button" onClick={onToggle}>{night ? <SunIcon /> : <MoonIcon />}</button>
            {!mobile && FUNNEL_ON && <a className="gp-headbtn" href={utm("header")}>{CTA_TEXT} <span className="ar">→</span></a>}
            {mobile && <button className={"m-burger" + (menu ? " on" : "")} type="button" aria-label="Меню" onClick={() => setMenu((o) => !o)}><span></span><span></span><span></span></button>}
          </div>
        </div>
      </div>
      {mobile && <MobileMenuPanel cur={cur} open={menu} onClose={() => setMenu(false)} />}
    </React.Fragment>
  );
}

function Header({ dark, util, search = false, night, onToggle, cur = "claude" }) {
  return (
    <React.Fragment>
      <div className={"gp-header" + (dark ? " dark" : "")}>
        <div className="gp-head-inner">
          <Logo />
          <NavLinks cur={cur} />
          <span className="spacer"></span>
          {search && <div className="gp-search"><span className="ic">⌕</span>Поиск по гайдам<span className="kbd">⌘K</span></div>}
          <div className="head-tools">
            <ThemeToggle night={night || dark} onClick={onToggle} />
            {FUNNEL_ON && <a className="gp-headbtn" href={utm("header")}>{CTA_TEXT} <span className="ar">→</span></a>}
          </div>
        </div>
      </div>
      {util && (
        <div className="gp-util">
          <span className="grp"><span><span className="sq"></span>16 ГАЙДОВ</span><span>· MCP</span><span>· CLAUDE CODE</span><span>· АВТОМАТИЗАЦИЯ ВИДЕО</span></span>
          <span className="spacer"></span>
          <span className="live"><span className="live-dot"></span>ЭФИР В СРЕДУ · 16:00 МСК</span>
        </div>
      )}
    </React.Fragment>
  );
}

/* ---------- banners ---------- */
function BannerStrip() {
  if (!FUNNEL_ON) return null;
  return (
    <div className="ban-strip">
      <span className="gp-eyebrow"><span className="dot"></span>{BRAND_UPPER_NB}</span>
      <span className="txt">{FUNNEL_OFFER}</span>
      <span className="spacer"></span>
      <a className="btn" href={utm("banner")}>{CTA_TEXT} →</a>
    </div>
  );
}
function BannerCard({ dark }) {
  if (!FUNNEL_ON) return null;
  return (
    <div className="ban-card">
      <div className="body">
        <span className="gp-eyebrow"><span className="dot"></span>ЗАКРЫТОЕ AI-КОМЬЮНИТИ</span>
        <span className="offer">Библиотека готовых скиллов, живой чат и эфиры – внутри {BRAND_NB}</span>
      </div>
      <span className="spacer"></span>
      <a className="btn" href={utm("banner")}>Вступить →</a>
    </div>
  );
}
function BannerDark() {
  if (!FUNNEL_ON) return null;
  return (
    <div className="ban-dark">
      <span className="gp-eyebrow lime"><span className="live-dot"></span>ЭФИР В СРЕДУ</span>
      <span>Закрытое AI-комьюнити {BRAND_NB} – <span className="lime">библиотека, живой чат, эфиры по средам</span>.</span>
      <span className="spacer"></span>
    </div>
  );
}

/* ---------- sidebar ---------- */
function Sidebar({ mini, group, items, active }) {
  const list = items || ["Введение в Claude Code", "Настройка проекта с нуля", "MCP-серверы и память", "Автоматизация видео", "Архитектура памяти агента"];
  const act = active == null ? 1 : active;
  return (
    <div className="gp-sidebar">
      <div className="gp-side-group">{group || "Гайды · 16"}</div>
      {list.map((it, i) => {
        const label = typeof it === "string" ? it : it.t;
        const slug = typeof it === "string" ? null : it.slug;
        const cls = "gp-side-item" + (i === act ? " active" : "");
        return slug
          ? <a key={i} href={GUIDE_HREF(slug)} className={cls}>{label}</a>
          : <span key={i} className={cls}>{label}</span>;
      })}
      {mini && FUNNEL_ON && (
        <div className="gp-side-mini">
          <div className="h"><span className="live-dot"></span>Что внутри Space</div>
          <ul>
            <li>Готовые скиллы и юзкейсы</li>
            <li>Живой чат с агентами</li>
            <li>Эфиры по средам</li>
          </ul>
          <a className="btn" href={utm("banner")}>{CTA_TEXT}</a>
        </div>
      )}
    </div>
  );
}

/* ---------- end CTA ---------- */
function CtaDark({ grid, social }) {
  if (!FUNNEL_ON) return null;
  return (
    <div className={"cta-dark" + (grid ? " grid" : "")}>
      <div className="cta-brand"><Logo /></div>
      <div className="ttl">Дальше – вместе с сообществом</div>
      <div className="sub">Гайд прочитан. Внедрять – проще не в одиночку, а в закрытом AI-комьюнити.</div>
      <div className="cta-bullets">
        <div className="b"><span className="m"></span>Библиотека готовых скиллов и юзкейсов для Claude и Codex</div>
        <div className="b"><span className="m"></span>Живой чат, где общаются и люди, и их агенты</div>
        <div className="b"><span className="m"></span>Эфиры по средам и готовые решения под реальные задачи</div>
      </div>
      <div className="cta-foot">
        <a className="cta-btn" href={utm("cta")}>Вступить в {BRAND_NB} →</a>
        <span className="cta-fine">Мгновенный доступ. Отмена в один клик.</span>
      </div>
      {social && (
        <div className="cta-social"><span className="live-dot"></span>В чате сейчас 320+ участников и их агенты</div>
      )}
    </div>
  );
}
function CtaLime() {
  if (!FUNNEL_ON) return null;
  return (
    <div className="cta-lime">
      <span className="gp-eyebrow"><span className="dot" style={{ background: "var(--ink)" }}></span>{BRAND_UPPER_NB}</span>
      <div className="ttl">Дальше – вместе с сообществом</div>
      <div className="sub">Гайд прочитан. Внедрять – проще не в одиночку, а в закрытом AI-комьюнити.</div>
      <div className="cta-bullets">
        <div className="b"><span className="m"></span>Библиотека готовых скиллов и юзкейсов для Claude и Codex</div>
        <div className="b"><span className="m"></span>Живой чат, где общаются и люди, и их агенты</div>
        <div className="b"><span className="m"></span>Эфиры по средам и готовые решения под реальные задачи</div>
      </div>
      <div className="cta-foot">
        <a className="cta-btn" href={utm("cta")}>Вступить в {BRAND_NB} →</a>
        <span className="cta-fine">Мгновенный доступ. Отмена в один клик.</span>
      </div>
    </div>
  );
}

/* ---------- rich content blocks ---------- */
function Callout({ children, label }) {
  return (
    <div className="blk-callout">
      <span className="gp-eyebrow"><span className="dot"></span>{label || "СОВЕТ"}</span>
      <p>{children}</p>
    </div>
  );
}
function FlowChart({ vert, nodes, caption }) {
  const ns = nodes || [
    { l: "ПРОМПТ", s: "твой запрос" },
    { l: "CLAUDE CODE", s: "агент", accent: true },
    { l: "MCP", s: "filesystem · git" },
    { l: "РЕЗУЛЬТАТ", s: "правки в коде" },
  ];
  return (
    <figure className="blk-figure">
      <div className={"flow" + (vert ? " vert" : "")}>
        {ns.map((n, i) => (
          <React.Fragment key={i}>
            <div className={"flow-node" + (n.accent ? " accent" : "")}>
              <span className="n-label">{n.l}</span>
              <span className="n-sub">{n.s}</span>
            </div>
            {i < ns.length - 1 && <div className="flow-arrow">→</div>}
          </React.Fragment>
        ))}
      </div>
      <figcaption>{caption || "Схема: путь от запроса до правок в репозитории"}</figcaption>
    </figure>
  );
}
function VideoEmbed({ title }) {
  return (
    <figure className="blk-figure">
      <div className="video-embed">
        <div className="ve-thumb">
          <span className="ve-badge">YouTube</span>
          <span className="ve-play"><svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true"><path d="M3 2l15 9-15 9V2z" fill="#0A0A0A"></path></svg></span>
        </div>
        <div className="ve-bar"><span className="pdot"></span>{title || "Как настроить MCP за 5 минут · EdgeLab"}</div>
      </div>
      <figcaption>Видео с YouTube встраивается в статью, 16:9, грузится по клику</figcaption>
    </figure>
  );
}
function StepsGuide({ steps }) {
  const list = steps || [
    { t: "Установи Claude Code", d: "Один пакет и вход по ключу – пара минут." },
    { t: "Опиши проект в CLAUDE.md", d: "Правила, стек и доверенные команды в одном файле." },
    { t: "Подключи MCP-серверы", d: "filesystem и git закрывают большинство задач." },
  ];
  return (
    <div className="steps">
      {list.map((s, i) => (
        <div className="step" key={i}>
          <span className="num">{String(i + 1).padStart(2, "0")}</span>
          <div className="s-body"><b>{s.t}</b><p>{s.d}</p></div>
        </div>
      ))}
    </div>
  );
}

/* ---------- agent-native / SEO blocks (Layer 1) ---------- */
function Tldr({ text }) {
  return (
    <div className="blk-callout tldr">
      <span className="gp-eyebrow"><span className="dot"></span>Коротко</span>
      <p>{text || "Если совсем коротко: я завёл один файл с описанием проекта и парой доверенных команд — этого хватило, чтобы агент перестал гадать. Всё остальное я добавлял по мере надобности."}</p>
    </div>
  );
}
function TestedBadge({ text }) {
  return (<div className="gp-tested"><span className="sq"></span>{text || "Протестировано на Claude Code v1.2 · 12 июня 2026"}</div>);
}
function Faq({ qa }) {
  const list = qa || [
    ["Нужно ли уметь программировать?", "Нет. Claude Code берёт рутину на себя – но базовое понимание проекта помогает направлять агента."],
    ["Какие MCP-серверы ставить первыми?", "filesystem и git закрывают большинство задач. Остальное добавляй под конкретную задачу, а не заранее."],
    ["Это работает с Codex?", "Да, подход тот же: правила проекта плюс доверенные команды. Отличаются детали запуска."],
  ];
  return (
    <section className="faq">
      <h2>Частые вопросы</h2>
      {list.map(([q, a], i) => (<details key={i}><summary>{q}</summary><p>{a}</p></details>))}
    </section>
  );
}
function Changelog({ items }) {
  const list = items || [
    ["12.06.2026", "Обновлено под Claude Code v1.2, добавлен раздел про MCP-память."],
    ["02.05.2026", "Добавлена блок-схема потока и видео-разбор."],
    ["18.04.2026", "Первая публикация."],
  ];
  return (
    <section className="changelog">
      <h2>История изменений</h2>
      <ul>{list.map(([d, t], i) => (<li key={i}><span className="d">{d}</span><span>{t}</span></li>))}</ul>
    </section>
  );
}

/* ---------- real guides data (from MDX via scripts/build-guides-data.mjs) ---------- */
/* window.__GF_GUIDES / __GF_GUIDE_BY_SLUG are injected by guides-data.js (loaded
   before this file). Each entry already carries title/desc/tldr/tested/meta/level/
   min/steps/outcome/toc/bodyHtml. We adapt them to the article shape the design
   engine expects (side nav, docsnav prev/next, dangerouslySetInnerHTML body). */
const GF_GUIDES = (typeof window !== "undefined" && window.__GF_GUIDES) || [];
const GF_BY_SLUG = (typeof window !== "undefined" && window.__GF_GUIDE_BY_SLUG) || {};
// Category → display name + the guides that belong to it (preserve source order).
// Derived from the data (NOT hand-maintained): every category that has at least one
// guide shows up — a hand list silently dropped mcp/hermes/codex guides from the
// catalog facets. Order = the brand taxonomy (window.__GF_CATS, written into
// guides-data.js from the brand config); an undeclared category goes last.
const GF_CATS = (typeof window !== "undefined" && window.__GF_CATS) || [];
const GUIDE_CATS = (() => {
  const seen = new Map();
  for (const g of GF_GUIDES) if (g.cat && !seen.has(g.cat)) seen.set(g.cat, g.catName || g.cat);
  const order = GF_CATS.map((c) => c.id);
  const rank = (id) => (order.indexOf(id) < 0 ? order.length : order.indexOf(id));
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => rank(a.id) - rank(b.id));
})();
function guidesInCat(catId) {
  return GF_GUIDES.filter((g) => g.cat === catId);
}
// Build the full article object the design's <Content>/<GuidePage> renders.
function guideToArticle(g) {
  if (!g) return null;
  const sibs = guidesInCat(g.cat);
  const idx = sibs.findIndex((s) => s.slug === g.slug);
  const prev = idx > 0 ? sibs[idx - 1] : (sibs.length > 1 ? sibs[sibs.length - 1] : g);
  const next = idx < sibs.length - 1 ? sibs[idx + 1] : (sibs.length > 1 ? sibs[0] : g);
  return {
    slug: g.slug,
    cur: g.cat === "claude" ? "claude" : "library",
    crumbMid: g.catName,
    type: g.type || "guide",
    cover: g.cover || "",
    title: g.title,
    desc: g.desc,
    tldr: g.tldr,
    tested: g.tested,
    meta: g.meta,
    level: g.level,
    side: {
      group: `${g.catName} · ${sibs.length}`,
      items: sibs.map((s) => ({ t: s.title, slug: s.slug })),
      active: Math.max(0, idx),
    },
    toc: g.toc && g.toc.length ? g.toc : ["Введение"],
    docsnav: [prev.title, next.title],
    docsnavSlugs: [prev.slug, next.slug],
    steps: g.steps || [],
    outcome: g.outcome || "",
    bodyHtml: g.bodyHtml || "",
    // «Похожие материалы» (recirculation block) — resolve related slugs → full guides.
    related: (g.related || []).map((s) => GF_BY_SLUG[s]).filter(Boolean),
  };
}
const REAL_ARTICLES = {};
for (const g of GF_GUIDES) REAL_ARTICLES[g.slug] = guideToArticle(g);
// Pick representative guides for the three category landing pages.
function firstInCat(catId, fallbackSlug) {
  const list = guidesInCat(catId);
  return (list[0] && list[0].slug) || fallbackSlug;
}

/* ---------- content body ---------- */
const ARTICLES = {
  claude: {
    cur: "claude", crumbMid: "Claude Code",
    title: "Как я собрал рабочее окружение за один вечер",
    desc: "История о том, как Claude Code из красивой игрушки в демо превратился в инструмент, которому я доверяю реальную работу. Без волшебства — только то, что у меня действительно сработало.",
    tldr: "Если совсем коротко: я завёл один файл с описанием проекта и парой доверенных команд — этого хватило, чтобы агент перестал гадать. Всё остальное добавлял по мере надобности.",
    tested: "Протестировано на Claude Code v1.2 · 12 июня 2026",
    meta: "ОБНОВЛЕНО 12 ИЮНЯ 2026 · 9 МИН ЧТЕНИЯ",
    side: { group: "Claude Code · 6", items: ["Введение в Claude Code", "Рабочее окружение за вечер", "MCP-серверы и память", "Доверенные команды", "Большой репозиторий", "Память агента"], active: 1 },
    toc: ["Агент и контекст", "Инструменты и привычки", "Доверие шаг за шагом", "Обратная связь"],
    docsnav: ["Введение в Claude Code", "MCP-серверы и память"],
    intro: (
      <React.Fragment>
        <h2>С чего всё началось</h2>
        <p>Прошло чуть больше полугода с тех пор, как Claude Code появился в моей работе — и за это время он научил меня куче вещей. Не он сам, конечно, а сам процесс: я набил столько шишек, что грех не поделиться.</p>
        <p>Главное, что я понял: агенты вроде Claude Code или Hermes падают не на интеллекте, а на архитектуре. Чаще всего у меня ломалось не потому, что модель «тупая», а потому что я не дал ей контекст, и инструменты дрались между собой.</p>
        <p>Ниже — ключевые уроки, которые я вынес за это время, чтобы вам не пришлось повторять мои ошибки. Давайте разберём по порядку.</p>
      </React.Fragment>
    ),
    body: (
      <React.Fragment>
        <h2>1. Агент не тупой — ему просто не хватает контекста</h2>
        <p>Первые недели я делал классическую ошибку: кидал задачу без единого слова о проекте и злился, что агент переспрашивает очевидное. Это всё равно что посадить нового человека за чужой код и уйти пить кофе — а потом удивляться, что он сделал не то.</p>
        <p>Однажды вечером я потратил полчаса не на саму задачу, а на то, чтобы по-человечески описать проект: что это, по каким правилам мы тут живём и какие команды можно выполнять без лишних вопросов. Тот же Claude Code, та же модель — но он перестал гадать и начал попадать с первого раза.</p>
        <p><b>Что я понял:</b> модель решает всё меньше. Гораздо важнее контекст, который ты ей даёшь. Если упростить, весь путь от моей просьбы до правок в коде укладывается в простую цепочку:</p>
        <FlowChart />
        <h2>2. Важнее модели — инструменты и привычки</h2>
        <p>Когда контекст появился, всплыла вторая проблема: агент хватался не за те инструменты. Лез искать в интернете то, что лежало в соседнем файле, или запускал тяжёлую команду там, где хватило бы пары строк.</p>
        <p>Я перестал ждать, что он сам угадает, и начал прямо подсказывать: для этой задачи — вот это, для той — вот то. Звучит банально, но именно это сэкономило мне больше всего времени и нервов.</p>
        <Callout label="СОВЕТ">Не пытайтесь подключить всё сразу. Я начал с самого необходимого и добавлял остальное только тогда, когда реально упирался в задачу — так контекст не превращается в свалку.</Callout>
        <h2>3. Доверие строится на маленьких шагах</h2>
        <p>Сначала я перепроверял за агентом каждую строчку — и, честно, это убивало весь смысл. Доверие пришло не сразу: я давал ему задачи поменьше, смотрел на результат, и постепенно отпускал поводья.</p>
        <p>Проще один раз увидеть, чем сто раз прочитать — вот короткое видео, где агент правит код за пару минут, пока я просто наблюдаю.</p>
        <VideoEmbed />
        <p><b>Что я понял:</b> доверие к агенту — это не вера, а привычка. Она нарабатывается на маленьких задачах, где цена ошибки невелика.</p>
        <h2>4. Обратная связь — лучший способ его обучить</h2>
        <p>Самым полезным оказалось не идеально сформулировать задачу с первого раза, а быстро поправлять. Агент сделал — я тут же сказал, что не так, он запомнил это как правило, и следующий результат стал точнее. Маленькая петля, которая работает лучше любых длинных инструкций.</p>
        <p>Если свести всё к простому чек-листу, с которого стоит начать, — вот он, проверенный на моих проектах:</p>
        <StepsGuide />
        <h2>Чем всё закончилось</h2>
        <p>Сейчас Claude Code — это не игрушка из демо, а инструмент, которому я доверяю реальную работу. Он не стал умнее за эти полгода. Умнее стал я — в том, как с ним разговаривать.</p>
        <p>Если вы только начинаете, не пытайтесь повторить всё сразу. Возьмите один урок, попробуйте на своём проекте — и дальше пойдёт само.</p>
      </React.Fragment>
    ),
    faq: [
      ["Нужно ли уметь программировать?", "Нет. Claude Code берёт рутину на себя — но базовое понимание проекта помогает направлять агента."],
      ["Какие MCP-серверы ставить первыми?", "filesystem и git закрывают большинство задач. Остальное добавляй под конкретную задачу, а не заранее."],
      ["Это работает с Codex?", "Да, подход тот же: правила проекта плюс доверенные команды. Отличаются детали запуска."],
    ],
    changelog: [
      ["12.06.2026", "Обновлено под Claude Code v1.2, добавлен раздел про MCP-память."],
      ["02.05.2026", "Добавлена блок-схема потока и видео-разбор."],
      ["18.04.2026", "Первая публикация."],
    ],
  },
  hermes: {
    cur: "hermes", crumbMid: "Hermes",
    title: "Hermes стал моим личным аналитиком",
    desc: "Три месяца я учил агента читать рынок и собирать сводки за меня. Честная история о том, что получилось, а что пока нет — без обещаний лёгких денег.",
    tldr: "Если совсем коротко: я перестал искать «самую умную» модель и занялся процессом — утренние сводки, петля обратной связи и общая память. Это дало куда больше, чем любая смена модели.",
    tested: "Протестировано на Hermes 0.9 · 10 июня 2026",
    meta: "ОБНОВЛЕНО 10 ИЮНЯ 2026 · 8 МИН ЧТЕНИЯ",
    side: { group: "Hermes · 5", items: ["Введение в Hermes", "Личный аналитик", "Утренние сводки", "Петля обратной связи", "Память команды"], active: 1 },
    toc: ["С чего начал", "Утренние сводки", "Петля обратной связи", "Что в итоге"],
    docsnav: ["Введение в Hermes", "Память команды"],
    intro: (
      <React.Fragment>
        <h2>С чего всё началось</h2>
        <p>Я не трейдер и не аналитик. Но каждое утро мне нужно было быстро понимать, что происходит в индустрии — и на это уходил час, который я ненавидел. Тогда я решил переложить эту рутину на Hermes.</p>
        <p>Первый месяц был провальным: агент выдавал простыни текста, в которых тонула суть. Я чуть не бросил. Помогло не «более умная модель», а то, что я наконец перестроил процесс.</p>
        <p>Ниже — три вещи, которые превратили Hermes из болтливого помощника в аналитика, которому я доверяю утро. Разберём по порядку.</p>
      </React.Fragment>
    ),
    body: (
      <React.Fragment>
        <h2>1. Дело было не в модели</h2>
        <p>Я перепробовал кучу моделей в надежде, что какая-то окажется «умнее» и сама начнёт выдавать то, что нужно. Спойлер: не начала. Разница между ними оказалась куда меньше, чем разница между «объяснил, что мне нужно» и «не объяснил».</p>
        <p>Как только я описал, какие источники читать, на что смотреть и в каком виде давать ответ, — качество подскочило на той же самой модели. Путь от запроса до готовой сводки у меня выглядит так:</p>
        <FlowChart nodes={[{ l: "ИСТОЧНИКИ", s: "каналы, новости" }, { l: "HERMES", s: "агент", accent: true }, { l: "ПАМЯТЬ", s: "что важно мне" }, { l: "СВОДКА", s: "10 пунктов" }]} caption="Схема: как Hermes собирает утреннюю сводку" />
        <p><b>Что я понял:</b> гнаться за самой умной моделью — тупик. Сначала наладь процесс, и тогда даже простая модель работает на тебя.</p>
        <h2>2. Ритуал важнее разовых запросов</h2>
        <p>Переломный момент — когда сводки перестали быть разовыми. Я завёл привычку: каждое утро в 10:00 Hermes присылает короткий разбор по тем источникам, что мы вместе отобрали. Не «когда вспомню», а по расписанию.</p>
        <p>Вот как это выглядит вживую — короткое видео, где из десятка источников рождается сводка на пару абзацев.</p>
        <VideoEmbed title="Утренние сводки с Hermes · EdgeLab" />
        <p><b>Что я понял:</b> ценность не в одном гениальном ответе, а в привычке. Регулярность бьёт интеллект.</p>
        <h2>3. Петля обратной связи всё меняет</h2>
        <p>Самое полезное — быстро поправлять. Hermes выдал, я сказал «вот это лишнее, а вот этого не хватает», он запомнил это как правило, и следующая сводка стала точнее. За пару недель ответы стали такими, будто их собирал я сам, только без потраченного часа.</p>
        <p>Если свести всё к простому ритуалу, вот он:</p>
        <StepsGuide steps={[{ t: "Отбери источники вместе с агентом", d: "Не все подряд, а те, которым реально доверяешь." }, { t: "Поставь сводку на расписание", d: "Каждое утро в одно и то же время — это и есть ритуал." }, { t: "Правь сразу и коротко", d: "Каждая правка становится правилом на будущее." }]} />
        <h2>Чем всё закончилось</h2>
        <p>Сейчас я открываю утреннюю сводку как кофе — по привычке. Hermes не предсказывает будущее и не делает меня богаче за ночь. Он просто экономит мне час каждый день и держит в курсе. Для меня этого более чем достаточно.</p>
      </React.Fragment>
    ),
    faq: [
      ["Hermes правда помогает зарабатывать?", "Он помогает быть в курсе и экономит время. Решения по-прежнему за вами — это инструмент, а не оракул."],
      ["Сколько времени на настройку?", "Базовый ритуал собрал за вечер. Дальше он сам становится точнее за счёт правок."],
      ["Нужны ли особые знания?", "Нет. Важнее понимать, какие источники вам действительно полезны."],
    ],
    changelog: [
      ["10.06.2026", "Добавил раздел про петлю обратной связи."],
      ["28.05.2026", "Перевёл сводки на расписание."],
      ["15.05.2026", "Первая публикация."],
    ],
  },
  codex: {
    cur: "codex", crumbMid: "Codex",
    title: "Codex на практике: чего я не ожидал",
    desc: "Сел попробовать на вечер — остался на неделю. Рассказываю, где Codex приятно удивил, а где пришлось перестроить привычки. Личные наблюдения, а не пересказ документации.",
    tldr: "Если совсем коротко: Codex отлично закрывает рутину — ревью, мелкие правки, автоисправления. Но доступы и песочницу стоит настроить с самого начала, иначе нервов уйдёт больше, чем сэкономишь.",
    tested: "Протестировано на Codex · 8 июня 2026",
    meta: "ОБНОВЛЕНО 8 ИЮНЯ 2026 · 7 МИН ЧТЕНИЯ",
    side: { group: "Codex · 4", items: ["Первый запуск Codex", "Ревью пул-реквестов", "Песочница и доступы", "Codex против Claude Code"], active: 0 },
    toc: ["Первое впечатление", "Ревью на автомате", "Песочница", "Что в итоге"],
    docsnav: ["Первый запуск Codex", "Codex против Claude Code"],
    intro: (
      <React.Fragment>
        <h2>Первое впечатление</h2>
        <p>Я подходил к Codex со здоровым скепсисом: ещё один агент, который обещает писать код за меня. Сел попробовать на один вечер — а закрыл ноутбук только через неделю, потому что втянулся.</p>
        <p>Удивило не то, что он пишет код, а то, как аккуратно он берёт на себя скучное: ревью, мелкие правки, рутинные проверки. Но без пары настроек в начале я бы намучился.</p>
        <p>Ниже — что зашло сразу, а что пришлось перенастроить под себя. Разберём по порядку.</p>
      </React.Fragment>
    ),
    body: (
      <React.Fragment>
        <h2>1. Лучше всего заходит на рутине</h2>
        <p>Я не стал сразу поручать Codex большие фичи. Начал с мелочи: причесать функцию, поправить тесты, пройтись по замечаниям. И вот тут он оказался незаменим — то, на что у меня уходил час скуки, он делает за минуты.</p>
        <p>Если упростить, его путь от задачи до готового результата выглядит так:</p>
        <FlowChart nodes={[{ l: "ЗАДАЧА", s: "что нужно" }, { l: "CODEX", s: "агент", accent: true }, { l: "ПЕСОЧНИЦА", s: "безопасный запуск" }, { l: "PR", s: "готовые правки" }]} caption="Схема: как Codex доводит задачу до пул-реквеста" />
        <p><b>Что я понял:</b> не нужно сразу поручать агенту главное. Отдай ему скучное — и он окупится в первый же день.</p>
        <h2>2. Ревью на автомате — то, ради чего стоит остаться</h2>
        <p>Главное открытие — Codex как первый ревьюер. Он проходит по пул-реквесту раньше меня и ловит мелочи, на которые у живого человека уже не хватает внимания. Я прихожу к ревью, когда половина замечаний уже снята.</p>
        <p>Вот как это выглядит на практике — короткое видео разбора одного PR.</p>
        <VideoEmbed title="Codex ревьюит пул-реквест · EdgeLab" />
        <p><b>Что я понял:</b> агент-ревьюер экономит не столько время, сколько внимание команды для действительно важного.</p>
        <h2>3. Песочницу и доступы — сразу</h2>
        <p>Единственное, обо что я споткнулся, — доступы. Поначалу дал слишком много, потом испугался и закрутил гайки так, что он перестал быть полезным. Золотая середина нашлась быстро, но лучше продумать её заранее.</p>
        <p>Вот короткий чек-лист, с которого я бы советовал начать:</p>
        <StepsGuide steps={[{ t: "Запусти в песочнице", d: "Пусть первые задачи идут в изолированной среде." }, { t: "Дай доступы по минимуму", d: "Только то, что нужно для конкретной задачи." }, { t: "Подключи к ревью", d: "Первый проход по PR — лучшее место для старта." }]} />
        <h2>Чем всё закончилось</h2>
        <p>Codex не заменил мне Claude Code — они хорошо делят обязанности. Codex я держу на рутине и ревью, Claude Code — на задачах, где нужно глубже погрузиться в проект. Вместе они закрывают почти всё, и это оказалось удобнее, чем один агент на всё.</p>
      </React.Fragment>
    ),
    faq: [
      ["Codex заменит Claude Code?", "Скорее дополнит. Мне удобнее держать обоих: один на рутине и ревью, другой на глубоких задачах."],
      ["С чего безопасно начать?", "С песочницы и минимальных доступов. Дальше расширяешь по мере доверия."],
      ["Где Codex полезнее всего?", "На ревью пул-реквестов и мелких правках — там он экономит больше всего внимания."],
    ],
    changelog: [
      ["08.06.2026", "Добавил чек-лист по доступам и песочнице."],
      ["30.05.2026", "Раздел про ревью пул-реквестов."],
      ["20.05.2026", "Первая публикация."],
    ],
  },
};

// Static «Скопировать страницу» button at the top of the article (copies the page's
// markdown twin /guides/<slug>.md for pasting into an AI agent). Replaces the old
// floating bottom FAB — sits statically next to the title, does NOT follow scroll.
function CopyPageButton({ slug }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    const done = () => { setCopied(true); window.clearTimeout(window.__cpT); window.__cpT = window.setTimeout(() => setCopied(false), 2400); };
    const doCopy = (text) => {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
      else { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { if (document.execCommand("copy")) done(); } catch (e) {} document.body.removeChild(ta); }
    };
    if (slug) fetch("/guides/" + slug + ".md").then((r) => (r.ok ? r.text() : Promise.reject())).then(doCopy).catch(() => { const a = document.querySelector(".gp-article-body, .m-content"); if (a) doCopy(a.innerText); });
    else { const a = document.querySelector(".gp-article-body, .m-content"); if (a) doCopy(a.innerText); }
  };
  return (
    <button className={"gp-copy" + (copied ? " done" : "")} type="button" onClick={onClick} aria-label="Скопировать страницу для агента">
      {copied ? "✓ Скопировано" : "⧉ Скопировать страницу"}
    </button>
  );
}
function CopyButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={"gp-copy" + (copied ? " done" : "")}
      type="button"
      onClick={() => { setCopied(true); window.clearTimeout(window.__cpT); window.__cpT = window.setTimeout(() => setCopied(false), 2000); }}
    >{copied ? "✓ Скопировано" : "⧉ Скопировать"}</button>
  );
}

// Clean card-description truncation: cut at a sentence end (.!?) near the limit, else
// at the last word boundary, then «…». No mid-word cuts, no «....» artefacts.
function cardDesc(desc, maxLen = 88) {
  const s = String(desc || "").replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;
  const slice = s.slice(0, maxLen);
  const sent = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sent >= maxLen * 0.55) return slice.slice(0, sent + 1); // clean sentence end
  const sp = slice.lastIndexOf(" ");
  return (sp > 0 ? slice.slice(0, sp) : slice).replace(/[\s,.;:–—-]+$/, "") + "…";
}

// «Похожие материалы» — recirculation block at the end of an article/guide. Plain
// <img> covers (NOT <Slot>/<image-slot>: those hydrate separately and may snapshot
// empty during prerender). Cards link to sibling guides → raise recirculation.
function RelatedGuides({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="gp-related">
      <h2>Читайте дальше</h2>
      <div className="gp-related-grid">
        {items.map((g) => (
          <a key={g.slug} className="gp-related-card" href={GUIDE_HREF(g.slug)}>
            {g.cover && (
              <span className="rc-cover"><img src={g.cover} alt={g.title} loading="lazy" /></span>
            )}
            <span className="rc-type">{g.type === "article" ? "Статья" : "Гайд"}</span>
            <span className="rc-title">{g.title}</span>
            {g.desc && <span className="rc-desc">{cardDesc(g.desc)}</span>}
          </a>
        ))}
      </div>
    </section>
  );
}

// «Все материалы» — the cross-guide index at the bottom of every guide/article page
// (desktop AND the /m/ mobile twin, which Google indexes mobile-first). Generated
// from window.__GF_GUIDES at build time, grouped by category — a new guide appears
// on every page automatically, no hand-maintained list. Stubs are excluded; the
// current page is shown as plain text (no self-link).
function GuideIndex({ current }) {
  const groups = GUIDE_CATS
    .map((c) => ({ ...c, items: GF_GUIDES.filter((g) => g.cat === c.id && !g.stub) }))
    .filter((c) => c.items.length > 0);
  if (!groups.length) return null;
  return (
    <nav className="gp-guide-index" aria-label="Все материалы">
      <h2>Все материалы</h2>
      <div className="gi-groups">
        {groups.map((c) => (
          <div key={c.id} className="gi-group">
            <div className="gi-h">{c.name} <span>{c.items.length}</span></div>
            <ul>
              {c.items.map((g) => (
                <li key={g.slug}>
                  {g.slug === current
                    ? <span className="gi-cur">{g.title}</span>
                    : <a href={GUIDE_HREF(g.slug)}>{g.title}</a>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <a className="gi-all" href={P("library")}>Каталог всех гайдов →</a>
    </nav>
  );
}

function Content({ article, cta, rich }) {
  const a = article || ARTICLES.claude;
  const isReal = !!a.bodyHtml; // real MDX-backed guide vs demo JSX article
  const navHref = (slug) => (slug ? GUIDE_HREF(slug) : undefined);
  const isArticle = a.type === "article";
  return (
    <div className={"gp-content" + (isArticle ? " read-article" : "")}>
      {a.cover && (
        <div className="gp-cover"><img src={a.cover} alt={a.title} loading="eager" /></div>
      )}
      <div className="gp-bc">{isArticle ? "Статьи" : <React.Fragment>Гайды <span>/</span> {a.crumbMid} <span>/</span> {isReal ? "Гайд" : "Личный опыт"}</React.Fragment>}</div>
      <div className="gp-h1row">
        <h1 className="gp-h1">{a.title}</h1>
        <CopyPageButton slug={a.slug} />
      </div>
      <Byline meta={a.min ? a.min + " мин чтения" : ""} />
      <p className="gp-desc">{a.desc}</p>
      {!isArticle && rich && a.tldr && <Tldr text={a.tldr} />}
      {isReal ? (
        <React.Fragment>
          {!isArticle && a.steps && a.steps.length > 0 && (
            <React.Fragment>
              <h2>Что понадобится</h2>
              <StepsGuide steps={a.steps} />
            </React.Fragment>
          )}
          <div className="gp-article-body" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
          {!isArticle && a.outcome && <Callout label="РЕЗУЛЬТАТ">{a.outcome}</Callout>}
        </React.Fragment>
      ) : (
        <React.Fragment>
          {a.intro}
          {rich && (
            <React.Fragment>
              {a.body}
              <Faq qa={a.faq} />
              <Changelog items={a.changelog} />
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {cta}

      <RelatedGuides items={a.related} />

      <div className="gp-docsnav">
        <a className="gp-navcard" href={navHref(a.docsnavSlugs && a.docsnavSlugs[0])}><div className="l">← Предыдущий</div><div className="t">{a.docsnav[0]}</div></a>
        <a className="gp-navcard next" href={navHref(a.docsnavSlugs && a.docsnavSlugs[1])}><div className="l">Следующий →</div><div className="t">{a.docsnav[1]}</div></a>
      </div>

      {isReal && <GuideIndex current={a.slug} />}
    </div>
  );
}
function Toc({ items }) {
  const list = items || ["Агент и контекст", "Инструменты и привычки", "Доверие шаг за шагом", "Обратная связь"];
  // scroll-spy: highlight the section the reader is currently in. Each real H2 in
  // the article body has id="sec-<i>" (build-guides-data) matching list index i.
  const [active, setActive] = React.useState(0);
  React.useEffect(() => {
    const heads = Array.prototype.slice.call(document.querySelectorAll(".gp-article-body h2[id]"));
    if (!heads.length) return;
    const onScroll = () => {
      let cur = 0;
      for (let i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top <= 90) cur = i; else break;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const onClick = (e, i) => {
    const el = document.getElementById("sec-" + i);
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  return (
    <div className="gp-toc">
      <div className="h">На странице</div>
      {list.map((t, i) => (
        <a key={i} href={"#sec-" + i} onClick={(e) => onClick(e, i)} className={i === active ? "active" : ""}>{t}</a>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <footer className="gp-footer">
      <div className="gp-foot-inner">
      <div className="gp-foot-main">
        <div className="gp-foot-brand">
          <Logo />
          <p>Портал об AI-агентах: Claude Code, Hermes и Codex. Гайды, статьи и живое сообщество — от Даши Ешиева и канала «{TG_NAME}».</p>
        </div>
        <div className="gp-foot-cols">
          <div className="col">
            <div className="h">Разделы</div>
            <a href={P("claude")}>Claude Code</a>
            <a href={P("hermes")}>Hermes</a>
            <a href={P("codex")}>Codex</a>
            <a href={P("library")}>Все гайды</a>
          </div>
          {FUNNEL_ON && (
          <div className="col">
            <div className="h">{BRAND_NAME}</div>
            <a href={utm("footer")}>{CTA_TEXT} →</a>
            <a href={ELS_STREAMS} target="_blank" rel="noopener">Эфиры по средам</a>
            <a href={ELS_COMMUNITY} target="_blank" rel="noopener">Живой чат</a>
          </div>
          )}
          <div className="col">
            <div className="h">Контакты</div>
            <a href={TG} target="_blank" rel="noopener">Канал «{TG_NAME}»</a>
            <a href={P("about")}>О проекте</a>
          </div>
          <div className="col">
            <div className="h">Документы</div>
            <a href={DOC_PRIVACY} target="_blank" rel="noopener">Политика конфиденциальности</a>
            <a href={DOC_OFFER} target="_blank" rel="noopener">Договор оферты</a>
          </div>
        </div>
      </div>
      <div className="gp-foot-bottom">
        <span>© 2026 {LEGAL_NAME.toUpperCase()}</span>
        <span className="spacer"></span>
        <span>{LEGAL_ENTITY}</span>
      </div>
      </div>
    </footer>
  );
}

/* ---------- full guide page ---------- */
function GuidePage({ dir, initialTheme, banner, cta, mini, social, rich, article, cur }) {
  const a = article || ARTICLES.claude;
  const [theme, setTheme] = useState(() => getStoredTheme(initialTheme));
  const toggle = () => flipTheme(setTheme);
  return (
    <div className={`gp dir-${dir} theme-${theme}`}>
      <Header night={theme === "dark"} onToggle={toggle} cur={cur || a.cur} />
      {banner}
      <div className="gp-layout">
        <Sidebar mini={mini} group={a.side.group} items={a.side.items} active={a.side.active} />
        <Content article={a} cta={cta} rich={rich} />
        <Toc items={a.toc} />
      </div>
      <Footer />
    </div>
  );
}

/* ---------- mobile (variant C) ---------- */
const PAGE_MD = `# Claude Code: настройка проекта с нуля\n\nИсточник: guides.edgelab.su · обновлено 12 июня 2026\n\nКак собрать рабочее окружение Claude Code за вечер — от установки до первого агента.\n\n## Зачем настройка\nClaude Code точнее, когда проект описан явно. Полчаса на настройку окупаются на первой же задаче.\n\n## Шаги\n1. Установи Claude Code\n2. Опиши проект в CLAUDE.md\n3. Подключи MCP filesystem + git\n\n— через ${BRAND_NAME} (${FUNNEL_HOST})`;
function MobileC({ initialTheme, scroll, demoScrolled }) {
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  const toggle = () => flipTheme(setTheme);
  const scRef = React.useRef(null);
  const [showFab, setShowFab] = useState(false);
  const [copied, setCopied] = useState(false);
  React.useEffect(() => {
    if (demoScrolled && scRef.current) { scRef.current.scrollTop = 1650; setShowFab(true); }
  }, [demoScrolled]);
  const onScroll = (e) => { if (scroll) setShowFab(e.target.scrollTop > 1500); };
  const copyPage = () => {
    try { navigator.clipboard && navigator.clipboard.writeText(PAGE_MD); } catch (e) {}
    setCopied(true); window.clearTimeout(window.__fabT); window.__fabT = window.setTimeout(() => setCopied(false), 2600);
  };
  return (
    <div className={"phone theme-" + theme}>
      <div className={"gp-m" + (scroll ? " gp-m-scroll" : "")} ref={scRef} onScroll={onScroll}>
        <div className="m-header">
          <Logo />
          <span className="spacer"></span>
          <button className="gp-toggle" type="button" onClick={toggle}>{night ? <SunIcon /> : <MoonIcon />}</button>
          <button className="m-burger" type="button"><span></span><span></span><span></span></button>
        </div>
        {FUNNEL_ON && (
        <div className="m-banner">
          <span className="live-dot"></span>
          <span className="m-banner-txt">Закрытое AI-комьюнити {BRAND_NAME}</span>
          <a className="m-banner-cta" href={utm("banner")}>Вступить →</a>
        </div>
        )}
        <div className="m-content">
          <div className="m-bc">Гайды / Claude Code</div>
          <h1 className="m-h1">Как я собрал рабочее окружение за один вечер</h1>
          <p className="m-desc">История о том, как Claude Code из игрушки в демо превратился в инструмент, которому я доверяю реальную работу.</p>
          <Tldr />
          <TestedBadge />
          <div className="m-meta">ОБНОВЛЕНО 12 ИЮНЯ 2026 · 9 МИН</div>
          <h2>С чего всё началось</h2>
          <p>Полгода назад я считал Claude Code игрушкой: в демо красиво, в реальном проекте — бесполезно. Пока однажды не потратил полчаса на то, чтобы по-человечески объяснить агенту проект.</p>
          <FlowChart vert={true} />
          <h2>Лучше один раз увидеть</h2>
          <p>Короткое видео: агент правит код за пару минут, пока я наблюдаю.</p>
          <VideoEmbed />
          <h2>Пошагово</h2>
          <StepsGuide />
          <Faq />
          <Changelog />
          {FUNNEL_ON && (
          <div className="m-cta">
            <div className="cta-brand"><Logo /></div>
            <div className="ttl">Дальше – вместе</div>
            <div className="sub">Внедрять проще в закрытом комьюнити.</div>
            <div className="cta-bullets">
              <div className="b"><span className="m"></span>Готовые скиллы и юзкейсы</div>
              <div className="b"><span className="m"></span>Живой чат с людьми и агентами</div>
              <div className="b"><span className="m"></span>Эфиры по средам</div>
            </div>
            <a className="btn" href={utm("cta")}>{CTA_TEXT} →</a>
            <div className="price">Отмена в один клик</div>
          </div>
          )}
        </div>
        <div className="m-footer">
          <Logo />
          <div className="m-foot-cols">
            <div className="col"><div className="h">Гайды</div><a href={P("claude")}>Claude Code</a><a href={P("codex")}>Codex</a><a href={P("hermes")}>Hermes</a></div>
            {FUNNEL_ON && <div className="col"><div className="h">{BRAND_NAME}</div><a href={utm("footer")}>Перейти →</a><a href={ELS_STREAMS} target="_blank" rel="noopener">Эфиры</a></div>}
            <div className="col"><div className="h">Документы</div><a href={DOC_PRIVACY} target="_blank" rel="noopener">Политика</a><a href={DOC_OFFER} target="_blank" rel="noopener">Оферта</a></div>
          </div>
          <div className="m-foot-bottom">© 2026 {LEGAL_NAME.toUpperCase()}<br />{LEGAL_ENTITY}</div>
        </div>
      </div>
    </div>
  );
}
function MobileArticle({ article, initialTheme }) {
  const a = article || ARTICLES.claude;
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  return (
    <div className={"phone home theme-" + theme}>
      <div className="gp-m">
        <PortalHead cur={a.cur} mobile={true} night={night} onToggle={() => flipTheme(setTheme)} />
        {FUNNEL_ON && (
        <div className="m-banner">
          <span className="live-dot"></span>
          <span className="m-banner-txt">Эфир в среду · закрытое AI-комьюнити</span>
          <a className="m-banner-cta" href={utm("banner")}>Вступить →</a>
        </div>
        )}
        <div className="m-content">
          {a.cover && (
            <div className="m-cover"><img src={a.cover} alt={a.title} loading="eager" /></div>
          )}
          <div className="m-bc">{a.type === "article" ? "Статьи" : "Гайды / " + a.crumbMid}</div>
          <h1 className="m-h1">{a.title}</h1>
          <div className="m-copyrow"><CopyPageButton slug={a.slug} /></div>
          <Byline meta={a.min ? a.min + " мин чтения" : ""} />
          <p className="m-desc">{a.desc}</p>
          {a.type !== "article" && a.tldr && <Tldr text={a.tldr} />}
          {a.bodyHtml ? (
            <React.Fragment>
              {a.type !== "article" && a.steps && a.steps.length > 0 && (
                <React.Fragment><h2>Что понадобится</h2><StepsGuide steps={a.steps} /></React.Fragment>
              )}
              <div className="gp-article-body" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
              {a.type !== "article" && a.outcome && <Callout label="РЕЗУЛЬТАТ">{a.outcome}</Callout>}
            </React.Fragment>
          ) : (
            <React.Fragment>
              {a.intro}
              {a.body}
              <Faq qa={a.faq} />
              <Changelog items={a.changelog} />
            </React.Fragment>
          )}
          {FUNNEL_ON && (
          <div className="m-cta">
            <div className="cta-brand"><Logo /></div>
            <div className="ttl">Дальше – вместе с сообществом</div>
            <div className="sub">Внедрять проще в закрытом AI-комьюнити.</div>
            <a className="btn" href={utm("cta")}>{CTA_TEXT} →</a>
          </div>
          )}
          <RelatedGuides items={a.related} />
          {a.bodyHtml && <GuideIndex current={a.slug} />}
        </div>
        <div className="m-footer">
          <Logo />
          <div className="m-foot-cols">
            <div className="col"><div className="h">Разделы</div><a href={P("claude")}>Claude Code</a><a href={P("hermes")}>Hermes</a><a href={P("codex")}>Codex</a></div>
            <div className="col"><div className="h">Проект</div><a href={P("library")}>Все гайды</a><a href={P("about")}>О проекте</a></div>
          </div>
          <div className="m-foot-bottom">© 2026 {LEGAL_NAME.toUpperCase()}<br />{LEGAL_ENTITY}</div>
        </div>
      </div>
    </div>
  );
}
function MobileMenu({ initialTheme }) {
  const [open, setOpen] = useState(true);
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  const guides = ["Введение в Claude Code", "Настройка проекта с нуля", "MCP-серверы и память", "Автоматизация видео", "Архитектура памяти агента"];
  return (
    <div className={"phone theme-" + theme}>
      <div className="gp-m gp-m-vp">
        <div className="m-header">
          <Logo />
          <span className="spacer"></span>
          <button className="gp-toggle" type="button" onClick={() => flipTheme(setTheme)}>{night ? <SunIcon /> : <MoonIcon />}</button>
          <button className="m-burger" type="button" onClick={() => setOpen((o) => !o)}><span></span><span></span><span></span></button>
        </div>
        {FUNNEL_ON && (
        <div className="m-banner">
          <span className="live-dot"></span>
          <span className="m-banner-txt">Закрытое AI-комьюнити {BRAND_NAME}</span>
          <span className="m-banner-cta">Вступить →</span>
        </div>
        )}
        <div className="m-content">
          <div className="m-bc">Гайды / Claude Code</div>
          <h1 className="m-h1">Claude Code: настройка проекта с нуля</h1>
          <p className="m-desc">Рабочее окружение Claude Code за вечер – от установки до первого агента.</p>
        </div>
        <div className={"m-drawer-scrim" + (open ? " show" : "")} onClick={() => setOpen(false)}>
          <div className="m-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="m-drawer-head"><Logo /><button className="m-drawer-close" type="button" onClick={() => setOpen(false)}>✕</button></div>
            <nav className="m-drawer-nav">
              <a className="cur">Гайды</a>
              <a>Claude Code</a>
              <a>Codex</a>
              <a>Hermes</a>
              <a>О проекте</a>
            </nav>
            <div className="m-drawer-group">Гайды · 16</div>
            <div className="m-drawer-list">
              {guides.map((g, i) => (
                <a key={i} className={i === 1 ? "cur" : ""}>{g}</a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockDemo({ heading, intro, children }) {
  return (
    <div className="gp dir-c">
      <div className="gp-content" style={{ paddingTop: 28, paddingBottom: 28 }}>
        <h2 style={{ marginTop: 0 }}>{heading}</h2>
        <p>{intro}</p>
        {children}
      </div>
    </div>
  );
}

/* ============================================================ */
/* ===== real-guides catalog + command palette ===== */
// Facets/counts come from the real 11 guides (window.__GF_GUIDES). Each catalog
// card carries the guide's slug so it links straight to guides/<slug>.html.
const LEVELS = ["Новичок", "Средний", "Продвинутый"];
const CATS = GUIDE_CATS.map((c) => ({
  id: c.id,
  name: c.name,
  n: GF_GUIDES.filter((g) => g.cat === c.id).length,
}));
const ALL_GUIDES = GF_GUIDES.map((g) => ({
  id: g.id,
  slug: g.slug,
  cat: g.cat,
  catName: g.catName,
  type: g.type,
  title: g.title,
  desc: g.desc,
  level: g.level,
  min: g.min,
  // dates drive the «Сначала новые» catalog sort (sortGuides).
  publishedAt: g.publishedAt || "",
  updatedAt: g.updatedAt || "",
  stub: !!g.stub,
}));

/* ---------- full-text search (MiniSearch) ---------- */
// id → UI-shaped guide (the ALL_GUIDES entry the cards/palette render from).
const GUIDE_BY_ID = (() => { const m = {}; for (const g of ALL_GUIDES) m[g.id] = g; return m; })();

// Lazy singleton MiniSearch index over the real guides. Built once on first
// search, then cached. Indexes title/desc/tldr + the full-text `st` field that
// build-guides-data.mjs emits (title+desc+tldr+tags+stripped body). Returns null
// when MiniSearch is unavailable (SSR / prerender) so callers fall back to a
// substring scan.
let __gfSearchIndex; // undefined = not built, null = unavailable, else instance
function getSearchIndex() {
  if (__gfSearchIndex !== undefined) return __gfSearchIndex;
  if (typeof window === "undefined" || !window.MiniSearch) { __gfSearchIndex = null; return null; }
  const idx = new window.MiniSearch({
    idField: "id",
    fields: ["title", "desc", "tldr", "st"],
    storeFields: ["id"],
    searchOptions: { boost: { title: 4, desc: 2, tldr: 2, st: 1 }, prefix: true, fuzzy: 0.2, combineWith: "AND" },
  });
  idx.addAll(GF_GUIDES);
  __gfSearchIndex = idx;
  return idx;
}

// Single source of search truth used by BOTH CommandPalette and Catalog.
// Empty query → all guides (source order). Otherwise MiniSearch ranked results,
// mapped back to UI-shaped guide objects. Falls back to a substring scan if the
// index is unavailable.
function searchGuides(q) {
  if (!q || !q.trim()) return ALL_GUIDES;
  const idx = getSearchIndex();
  if (!idx) {
    const ql = q.trim().toLowerCase();
    return ALL_GUIDES.filter((g) => g.title.toLowerCase().includes(ql) || (g.desc || "").toLowerCase().includes(ql) || g.catName.toLowerCase().includes(ql));
  }
  return idx.search(q).map((r) => GUIDE_BY_ID[r.id]).filter(Boolean);
}

// XSS-safe highlighter: split `text` on the query tokens (case-insensitive,
// prefix/substring) and wrap matches in <mark className="hl">. Returns an array
// of React nodes — never dangerouslySetInnerHTML, so user input is escaped by
// React. Tokens come from whitespace-splitting the query.
function highlight(text, q) {
  const src = String(text == null ? "" : text);
  const tokens = String(q || "").trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [src];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // For each token build two prefix/substring patterns:
  //  (a) the token itself, matched anywhere (substring) — the literal case;
  //  (b) the token's STEM (drop the last 1–2 chars) matched at a word start and
  //      greedily extended over word chars — so an inflected form (Russian
  //      endings: «базу/базе» vs query «база») still gets highlighted. Still
  //      prefix-based, still XSS-safe (we only wrap the text we matched).
  const pats = [];
  for (const t of tokens) {
    pats.push(esc(t));
    if (t.length >= 4) {
      const stem = t.slice(0, Math.max(3, t.length - 2));
      // word-boundary-ish: stem preceded by a non-word char or string start.
      pats.push("(?<![\\wа-яё])" + esc(stem) + "[\\wа-яё]*");
    }
  }
  let re;
  try { re = new RegExp("(" + pats.join("|") + ")", "ig"); }
  catch { re = new RegExp("(" + tokens.map(esc).join("|") + ")", "ig"); } // lookbehind unsupported → token-only
  const parts = src.split(re);
  // String.split with a capturing group interleaves matches at odd indices.
  const nodes = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part == null || part === "") continue;
    if (i % 2 === 1) nodes.push(<mark className="hl" key={i}>{part}</mark>);
    else nodes.push(part);
  }
  return nodes;
}

function CommandPalette({ onClose, initial }) {
  const [q, setQ] = useState(initial || "");
  const [sel, setSel] = useState(0);
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  const results = searchGuides(q).slice(0, 40);
  const groups = {};
  results.forEach((g) => { (groups[g.catName] = groups[g.catName] || []).push(g); });
  let idx = -1;
  return (
    <div className="cmdk-scrim" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <span className="ic">⌕</span>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Найти гайд…" />
          <span className="esc" onClick={onClose}>ESC</span>
        </div>
        <div className="cmdk-results">
          {results.length === 0 && <div className="cmdk-group">Ничего не найдено</div>}
          {Object.keys(groups).map((gn) => (
            <div key={gn}>
              <div className="cmdk-group">{gn} · {groups[gn].length}</div>
              {groups[gn].map((g) => {
                idx++;
                const here = idx;
                return (
                  <a key={g.id} href={GUIDE_HREF(g.slug)} className={"cmdk-item" + (here === sel ? " sel" : "")} onMouseEnter={() => setSel(here)} style={{ color: "inherit", textDecoration: "none" }}>
                    <span className="mk"></span>
                    <span className="it">
                      {highlight(g.title, q)}
                      {g.desc ? <span className="cmdk-desc">{highlight(g.desc, q)}</span> : null}
                    </span>
                    <span className="ic-tag">{g.min} мин</span>
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot"><span><span className="k">↑↓</span>навигация</span><span><span className="k">↵</span>открыть</span><span><span className="k">esc</span>закрыть</span><span className="spacer" style={{ flex: 1 }}></span><span>{results.length} из {ALL_GUIDES.length}</span></div>
      </div>
    </div>
  );
}

// Catalog sort modes. "new" is the default — publishedAt desc, i.e. the toolbar's
// long-standing «Сначала новые» label, now actually applied (before this it was a
// decorative span and the grid showed source order). Search results keep MiniSearch
// relevance order, so sorting applies only with an empty query.
const SORTS = [
  { id: "new", label: "Сначала новые" },
  { id: "time", label: "Быстрые сначала" },
  { id: "cat", label: "По категории" },
];
function sortGuides(list, mode) {
  const a = list.slice();
  // «Скоро» placeholders never lead the date/time views (they'd otherwise top
  // «новые» by newest date and «быстрые» by min reading time, pushing real
  // content + the crawlable above-the-fold below stubs). In «cat» they stay in
  // their category. stub === 1 sorts after stub === 0.
  const stub = (x, y) => (x.stub ? 1 : 0) - (y.stub ? 1 : 0);
  if (mode === "time") return a.sort((x, y) => stub(x, y) || x.min - y.min || x.title.localeCompare(y.title, "ru"));
  if (mode === "cat") return a.sort((x, y) => x.catName.localeCompare(y.catName, "ru") || (y.publishedAt || "").localeCompare(x.publishedAt || ""));
  return a.sort((x, y) => stub(x, y) || (y.publishedAt || y.updatedAt || "").localeCompare(x.publishedAt || x.updatedAt || ""));
}

function Catalog({ initialTheme, mobile, initialCmdk }) {
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  const [cat, setCat] = useState("all");
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");
  const [cmdk, setCmdk] = useState(initialCmdk || false);
  const [sort, setSort] = useState("new");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = React.useRef(null);
  // Full-text search drives the base set; facets (cat + level) filter the
  // searched results. Empty query → all guides, ordered by the chosen sort.
  const base = React.useMemo(() => searchGuides(q), [q]);
  const filtered = base.filter((g) => (cat === "all" || g.cat === cat) && (level === "all" || g.level === level));
  const hasQuery = q.trim().length > 0;
  // Only 11 real guides — show them all (no demo pagination on a small set).
  // Sort applies to the empty-query catalog; with a query we keep relevance order.
  const cards = hasQuery ? filtered : sortGuides(filtered, sort);
  const total = filtered.length;
  React.useEffect(() => {
    if (!sortOpen) return;
    const onDoc = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false); };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [sortOpen]);
  // Hide the open menu if the user starts a search (the toolbar swaps it out).
  React.useEffect(() => { if (hasQuery) setSortOpen(false); }, [hasQuery]);
  // No-results fallback: surface a few first guides so the page is never empty.
  const popular = ALL_GUIDES.slice(0, 3);
  // ⌘K keyboard shortcut still opens the modal palette (the inline input is primary).
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setCmdk(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={(mobile ? "phone " : "cat-desk ") + "theme-" + theme} style={mobile ? {} : { width: "100%", position: "relative" }}>
      <div className={"cat gp dir-c theme-" + theme}>
        <PortalHead cur="library" mobile={mobile} night={night} onToggle={() => flipTheme(setTheme)} />
        <div className="cat-hero">
          <span className="gp-eyebrow"><span className="dot"></span>БИБЛИОТЕКА ГАЙДОВ</span>
          <h1>Гайды по AI-агентам</h1>
          <p className="lead">Claude Code, дизайн, база знаний и автоматизация видео. Найди нужный за секунды — поиском, категориями или по уровню.</p>
          <div className="cat-searchbar">
            <span className="ic">⌕</span>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Найти гайд по названию, теме или тексту…"
              aria-label="Поиск по гайдам"
              autoComplete="off"
              spellCheck={false}
            />
            {q ? <span className="clr" role="button" aria-label="Очистить" onClick={() => setQ("")}>✕</span> : <span className="kbd">⌘K</span>}
          </div>
        </div>
        <div className="cat-body">
          <div className="cat-facets">
            <div className="h">Категории</div>
            <div className={"cat-facet" + (cat === "all" ? " active" : "")} onClick={() => setCat("all")}><span>Все гайды</span><span className="cnt">{ALL_GUIDES.length}</span></div>
            {CATS.map((c) => (
              <div key={c.id} className={"cat-facet" + (cat === c.id ? " active" : "")} onClick={() => setCat(c.id)}><span>{c.name}</span><span className="cnt">{c.n}</span></div>
            ))}
            <div className="lvl">
              <div className="h">Уровень</div>
              <div className={"cat-facet" + (level === "all" ? " active" : "")} onClick={() => setLevel("all")}><span>Любой</span></div>
              {LEVELS.map((l) => (
                <div key={l} className={"cat-facet" + (level === l ? " active" : "")} onClick={() => setLevel(l)}><span>{l}</span></div>
              ))}
            </div>
          </div>
          <div className="cat-main">
            <div className="cat-toolbar">
              <span className="count">{total} гайдов{cat !== "all" ? " · " + CATS.find((c) => c.id === cat).name : ""}{hasQuery ? " · по запросу «" + q.trim() + "»" : ""}</span>
              <span className="spacer"></span>
              {!hasQuery && (
                <div className="cat-sort" ref={sortRef}>
                  <button type="button" className="cat-sort-btn" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen((o) => !o)}>
                    {SORTS.find((s) => s.id === sort).label}<span className="cat-sort-caret">▾</span>
                  </button>
                  {sortOpen && (
                    <div className="cat-sort-menu" role="listbox">
                      {SORTS.map((s) => (
                        <button key={s.id} type="button" role="option" aria-selected={s.id === sort} className={"cat-sort-opt" + (s.id === sort ? " sel" : "")} onClick={() => { setSort(s.id); setSortOpen(false); }}>{s.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {total > 0 ? (
              <div className="cat-grid">
                {cards.map((g) => (
                  <a key={g.id} href={GUIDE_HREF(g.slug)} className="cat-card" style={{ color: "inherit", textDecoration: "none" }}>
                    <span className="tag"><span className="d"></span>{g.catName}</span>
                    <span className="ct">{highlight(g.title, q)}</span>
                    <span className="cd">{highlight(g.desc, q)}</span>
                    <span className="cm"><span>{g.level}</span><span>· {g.min} мин</span></span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="cat-empty">
                <div className="cat-empty-msg">Ничего не найдено по запросу «{q.trim()}»</div>
                <div className="cat-empty-sub">Попробуйте другие слова или загляните в популярные гайды:</div>
                <div className="cat-grid">
                  {popular.map((g) => (
                    <a key={g.id} href={GUIDE_HREF(g.slug)} className="cat-card" style={{ color: "inherit", textDecoration: "none" }}>
                      <span className="tag"><span className="d"></span>{g.catName}</span>
                      <span className="ct">{g.title}</span>
                      <span className="cd">{g.desc}</span>
                      <span className="cm"><span>{g.level}</span><span>· {g.min} мин</span></span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {cmdk && <CommandPalette onClose={() => setCmdk(false)} />}
      </div>
    </div>
  );
}

/* ============================================================ */
/* ===== HOME / blog landing (editorial, human voice) ===== */
function PlayGlyph() {
  return (<svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true"><path d="M2 1.5l12 7.5-12 7.5V1.5z" fill="#0A0A0A"></path></svg>);
}
function Slot({ id, ph, r, src, fit, position }) {
  // Deployed statically (no omelette fill runtime): only render a slot that has a
  // real cover image. Empty placeholders (dashed «Обложка» boxes) are hidden until
  // a cover exists, so the home/category/about pages never show empty frames.
  // `fit` (cover|contain|fill) is forwarded to the image-slot element so a
  // pre-composed banner can be shown whole (contain) instead of cropped (cover).
  if (!src) return null;
  return (<image-slot id={id} src={src} placeholder={ph || ""} radius={String(r || 12)} shape="rounded" fit={fit || undefined} position={position || undefined}></image-slot>);
}
function HomeSecHead({ title }) {
  return (
    <div className="hs-head"><h2>{title}</h2><a className="all" href={P("library")}>Смотреть все →</a></div>
  );
}
function Home({ initialTheme, mobile, idp = "h" }) {
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  // Split by content type: «Статьи» = readable articles, «Гайды» = technical guides.
  const metaShort = (g) => `${g.min} МИН ЧТЕНИЯ`;
  const card = (g) => ({ t: g.title, d: g.desc, m: metaShort(g), slug: g.slug, cover: g.cover, type: g.type });
  const articleList = GF_GUIDES.filter((g) => g.type === "article");
  const guideList = GF_GUIDES.filter((g) => g.type !== "article");
  // Featured articles pinned to the FRONT of the «Статьи» row — same card style, just first
  // (prince 2026-06-18: «закрепить вначале, но не выделять отдельным блоком»). Multiple featured
  // are ordered by the tool roadmap Claude Code → Codex → Hermes (prince 2026-06-18: «вынеси вверх»).
  const FEAT_ORDER = { claude: 0, codex: 1, hermes: 2 };
  const featuredArts = articleList.filter((g) => g.featured).sort((a, b) => (FEAT_ORDER[a.cat] ?? 9) - (FEAT_ORDER[b.cat] ?? 9));
  const orderedArticles = [...featuredArts, ...articleList.filter((g) => !g.featured)];
  const opinion = orderedArticles.slice(0, 3).map(card);     // «Статьи» row, featured (roadmap order) first
  const featured = guideList[0] || GF_GUIDES[0];          // hero «Начать» CTA target
  const guideCards = guideList.map(card);                 // «Гайды» 3-col grid — все гайды (prince 2026-06-17: показывать больше)
  return (
    <div className={(mobile ? "phone " : "") + "home gp dir-c theme-" + theme} style={mobile ? {} : { width: "100%", position: "relative" }}>
      <PortalHead cur="home" mobile={mobile} night={night} onToggle={() => flipTheme(setTheme)} />
      <div className="home-wrap">
        {/* hero */}
        <div className="home-hero">
          <div className="home-hero-inner">
            <div className="txt">
              <span className="eyebrow"><span className="dot"></span>{HOME_EYEBROW}</span>
              <h1>{HOME_TITLE}</h1>
              <p className="desc">{HOME_DESC}</p>
              <a className="read" href={HOME_CTA_HREF}><span className="circ">→</span><span className="lbl">{HOME_CTA_TEXT}</span></a>
            </div>
            <div className="media">
              <Slot id={idp + "-hero"} ph="" r={0} fit="contain" src={HOME_HERO_IMG} />
            </div>
          </div>
        </div>

        {/* articles: 3 cards, featured pinned first */}
        <div className="home-sec" id="articles" style={{ scrollMarginTop: "84px" }}>
          <HomeSecHead title="Статьи" />
          <div className="hs-cards3">
            {opinion.map((g, i) => (
              <a className="pc" href={GUIDE_HREF(g.slug)} key={i} style={{ color: "inherit" }}>
                <Slot id={idp + "-o" + i} ph="Обложка" r={13} src={g.cover} />
                <div className="tag"><span className="d"></span>Статья</div>
                <h4>{g.t}</h4>
                <p>{g.d}</p>
                <div className="cm">{g.m}</div>
              </a>
            ))}
          </div>
        </div>

        {/* guides: uniform card grid (3-col, balanced) */}
        <div className="home-sec">
          <HomeSecHead title="Гайды" />
          <div className="hs-cards3">
            {guideCards.map((g, i) => (
              <a className="pc" href={GUIDE_HREF(g.slug)} key={i} style={{ color: "inherit" }}>
                <Slot id={idp + "-g" + i} ph="Обложка гайда" r={13} src={g.cover} />
                <div className="tag"><span className="d"></span>Гайд</div>
                <h4>{g.t}</h4>
                <p>{g.d}</p>
                <div className="cm">{g.m}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* ===== Category page (Claude Code / Hermes / Codex) ===== */
const CATPAGES = {
  claude: {
    cur: "claude", eyebrow: "Claude Code",
    title: "Claude Code без боли",
    lead: "Личный опыт работы с агентом, который правит код сам: настройка, привычки, разборы реальных задач — по-человечески, без сухих инструкций.",
    featTag: "Claude Code · личный опыт",
    featTitle: "Как я собрал рабочее окружение за один вечер",
    featDesc: "Никакого волшебства — только то, что реально сработало. Что сломалось по дороге и почему полчаса настройки окупились на первой же задаче.",
    featMeta: "12 ИЮНЯ · 9 МИН ЧТЕНИЯ",
    list: [
      { t: "Память, которая не забывает", d: "Почему агент наконец перестал переспрашивать одно и то же.", m: "18 МАЯ · 6 МИН" },
      { t: "День, когда агент написал свой первый скилл", d: "Маленький момент, после которого всё пошло иначе.", m: "14 МАЯ · 5 МИН" },
      { t: "Доверенные команды: меньше вопросов", d: "Как я перестал подтверждать каждый шаг и стал доверять агенту.", m: "9 МАЯ · 6 МИН" },
      { t: "Большой репозиторий и контекст", d: "Что помогло агенту не теряться в проекте на сотни файлов.", m: "2 МАЯ · 8 МИН" },
    ],
    articles: [
      { t: "Почему я перестал гнаться за самой умной моделью", d: "Оказалось, дело вообще не в модели.", m: "3 ИЮНЯ · 6 МИН" },
      { t: "Инструменты решают больше, чем кажется", d: "Один правильный инструмент сэкономил мне неделю.", m: "27 МАЯ · 5 МИН" },
      { t: "Мой CLAUDE.md, который я ношу из проекта в проект", d: "Что в нём лежит и почему он так экономит время.", m: "20 МАЯ · 7 МИН" },
    ],
  },
  hermes: {
    cur: "hermes", eyebrow: "Hermes",
    title: "Hermes — личный аналитик",
    lead: "История о том, как я три месяца учил агента читать рынок и собирать утренние сводки за меня. Что получилось, а что — нет.",
    featTag: "Hermes · личный опыт",
    featTitle: "Hermes стал моим аналитиком",
    featDesc: "Три месяца я учил агента читать рынок за меня. Рассказываю, что из этого вышло — без прикрас и обещаний лёгких денег.",
    featMeta: "25 МАЯ · 8 МИН ЧТЕНИЯ",
    list: [
      { t: "Утренние сводки в 10:00", d: "Как я собрал ритуал, который экономит мне час каждый день.", m: "21 МАЯ · 6 МИН" },
      { t: "Обратная связь = лучший способ обучить агента", d: "Шесть шагов петли, после которых ответы стали точнее.", m: "16 МАЯ · 7 МИН" },
      { t: "Эхо-камера: честно о проблеме", d: "Где агент начинает повторять одно и то же и что я с этим делаю.", m: "10 МАЯ · 5 МИН" },
      { t: "Маршрутизация задач между агентами", d: "Кто за что отвечает в моей связке и почему так.", m: "3 МАЯ · 6 МИН" },
    ],
    articles: [
      { t: "Открытость победит — и вот почему", d: "Честный взгляд на то, куда движется индустрия.", m: "21 МАЯ · 7 МИН" },
      { t: "Как я перестал бояться, что агент ошибётся", d: "Спокойствие приходит, когда у тебя есть петля проверки.", m: "12 МАЯ · 5 МИН" },
      { t: "Память команды: один контекст на всех", d: "Зачем агентам общая память и как её не превратить в свалку.", m: "5 МАЯ · 6 МИН" },
    ],
  },
  codex: {
    cur: "codex", eyebrow: "Codex",
    title: "Codex на практике",
    lead: "Как я подружил Codex с реальными проектами: запуск, ревью, автоисправления. Личные наблюдения, а не пересказ документации.",
    featTag: "Codex · личный опыт",
    featTitle: "Первый запуск Codex: чего я не ожидал",
    featDesc: "Сел попробовать на вечер — остался на неделю. Рассказываю, где Codex приятно удивил, а где пришлось перестроить привычки.",
    featMeta: "8 ИЮНЯ · 7 МИН ЧТЕНИЯ",
    list: [
      { t: "Codex в ревью пул-реквестов", d: "Как агент стал моим первым ревьюером и что это дало команде.", m: "1 ИЮНЯ · 6 МИН" },
      { t: "Автоисправление багов: где предел", d: "Что Codex чинит сам, а где всё ещё нужен человек.", m: "24 МАЯ · 5 МИН" },
      { t: "Песочница и доступы по уму", d: "Как я настроил безопасный запуск без лишней паранойи.", m: "17 МАЯ · 6 МИН" },
      { t: "Codex против Claude Code: мой выбор", d: "Когда беру одно, когда другое — без священных войн.", m: "10 МАЯ · 8 МИН" },
    ],
    articles: [
      { t: "Почему я держу два агента, а не одного", d: "Разные задачи — разные сильные стороны.", m: "30 МАЯ · 6 МИН" },
      { t: "CI и агент: автоматизация без сюрпризов", d: "Как я пустил Codex в пайплайн и спокойно сплю.", m: "23 МАЯ · 7 МИН" },
      { t: "Промпты для Codex, которые реально работают", d: "Несколько приёмов, проверенных на своих проектах.", m: "15 МАЯ · 5 МИН" },
    ],
  },
};
function CategoryPage({ cat, initialTheme, mobile, idp }) {
  const c = CATPAGES[cat] || CATPAGES.claude;
  const p = idp || cat;
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  return (
    <div className={(mobile ? "phone " : "") + "home gp dir-c theme-" + theme} style={mobile ? {} : { width: "100%", position: "relative" }}>
      <PortalHead cur={c.cur} mobile={mobile} night={night} onToggle={() => flipTheme(setTheme)} />
      <div className="home-wrap">
        <div className="home-hero">
          <div className="home-hero-inner">
            <div className="txt">
              <span className="eyebrow"><span className="dot"></span>{c.eyebrow}</span>
              <h1>{c.title}</h1>
              <p className="desc">{c.lead}</p>
              <a className="read" href={PAGES.guide}><span className="circ">→</span><span className="lbl">Читать гайд</span></a>
            </div>
            <div className="media">
              <span className="pln">{c.eyebrow}</span>
              <Slot id={p + "-hero"} ph={"Баннер · " + c.eyebrow} r={0} />
            </div>
          </div>
        </div>
        <div className="home-sec">
          <HomeSecHead title="Гайды" />
          <div className="hs-feat">
            <a className="feat-card" href={PAGES.guide} style={{ color: "inherit" }}>
              <div className="ft-media"><span className="corner">Гайд</span><Slot id={p + "-feat"} ph="Обложка гайда" r={14} /></div>
              <div className="tag"><span className="d"></span>{c.featTag}</div>
              <h3>{c.featTitle}</h3>
              <p className="cd">{c.featDesc}</p>
              <div className="cm">{c.featMeta}</div>
            </a>
            <div className="hs-list">
              {c.list.map((g, i) => (
                <a className="hs-li" href={PAGES.guide} key={i} style={{ color: "inherit" }}>
                  <div className="li-txt"><h4>{g.t}</h4><p>{g.d}</p><div className="cm">{g.m}</div></div>
                  <Slot id={p + "-d" + i} ph="" r={9} />
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="home-sec">
          <HomeSecHead title="Статьи" />
          <div className="hs-cards3">
            {c.articles.map((g, i) => (
              <a className="pc" href={PAGES.guide} key={i} style={{ color: "inherit" }}>
                <Slot id={p + "-a" + i} ph="Обложка" r={13} />
                <div className="tag"><span className="d"></span>Статья</div>
                <h4>{g.t}</h4>
                <p>{g.d}</p>
                <div className="cm">{g.m}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* ===== About page ===== */
function AboutPage({ initialTheme, mobile }) {
  const [theme, setTheme] = useState(getStoredTheme(initialTheme));
  const night = theme === "dark";
  return (
    <div className={(mobile ? "phone " : "") + "home gp dir-c theme-" + theme} style={mobile ? {} : { width: "100%", position: "relative" }}>
      <PortalHead cur="about" mobile={mobile} night={night} onToggle={() => flipTheme(setTheme)} />
      <div className="home-wrap">
        <div className="home-hero">
          <div className="home-hero-inner">
            <div className="txt">
              <span className="eyebrow"><span className="dot"></span>О проекте</span>
              <h1>{BRAND_NAME} — портал об AI-агентах</h1>
              <p className="desc">Гайды, статьи и живое сообщество вокруг Claude Code, Hermes и Codex. Здесь я собираю то, что реально работает на практике, и разбираю это простым языком.</p>
              <a className="read" href={TG} target="_blank" rel="noopener"><span className="circ">→</span><span className="lbl">Телеграм-канал «{TG_NAME}»</span></a>
            </div>
            <div className="media">
              <Slot id="about-hero" ph="" r={0} position="50% 35%" src="/covers/_about-hero.webp" />
            </div>
          </div>
        </div>

        <div className="about-grid">
          <div className="about-main">
            <h2>Привет, я {AUTHOR_NAME}</h2>
            <p>Я веду телеграм-канал <a href={TG} target="_blank" rel="noopener" className="lnk">«{TG_NAME}»</a> и каждый день работаю с AI-агентами на реальных задачах. {BRAND_NAME} — это место, куда я переношу всё самое полезное: не сухие инструкции, а живые истории о том, что сработало, что сломалось и почему.</p>
            <p>Мне важно, чтобы материалы читались как разговор с коллегой, а не как документация. Поэтому каждый гайд — это личный опыт, проверенный на своих проектах, с примерами и честными выводами.</p>
            <h2>Что внутри сообщества</h2>
            <div className="about-feats">
              <div className="af"><span className="m"></span><div><b>Библиотека скиллов и юзкейсов</b><p>Готовые решения для Claude Code, Hermes и Codex — бери и применяй.</p></div></div>
              <div className="af"><span className="m"></span><div><b>Живой чат</b><p>Место, где общаются и люди, и их агенты. Вопрос не останется без ответа.</p></div></div>
              <div className="af"><span className="m"></span><div><b>Эфиры по средам</b><p>Разбираем свежие темы и реальные задачи в прямом эфире.</p></div></div>
            </div>
          </div>
          {FUNNEL_ON && (
          <aside className="about-side">
            <div className="about-card">
              <span className="gp-eyebrow"><span className="dot"></span>{BRAND_UPPER}</span>
              <div className="ac-title">Присоединяйся к сообществу</div>
              <p>Закрытое AI-комьюнити: библиотека, живой чат и эфиры. Отмена в один клик.</p>
              <a className="ac-btn" href={utm("about")}>{CTA_TEXT} →</a>
            </div>
          </aside>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* ============================================================ */
function App() {
  return (
    <DesignCanvas>
      <DCSection id="home" title="Главная — лента гайдов и статей" subtitle="Логика как у блога 0xJeff (большой баннер-герой + разделы с одним крупным материалом и списком остальных), но в нашем стиле варианта C. Тексты — живые человеческие статьи, не технические инструкции. Баннеры — это слоты: перетащите своё изображение, оно сохранится. Десктоп + мобайл, светлая и тёмная тема.">
        <DCArtboard id="homeLight" label="Главная · десктоп · светлая" width={1440} height={2060}>
          <Home initialTheme="light" idp="hl" />
        </DCArtboard>
        <DCArtboard id="homeDark" label="Главная · десктоп · тёмная" width={1440} height={2060}>
          <Home initialTheme="dark" idp="hd" />
        </DCArtboard>
        <DCArtboard id="homeMob" label="Главная · мобайл" width={430} height={2160}>
          <Home initialTheme="light" mobile={true} idp="hm" />
        </DCArtboard>
      </DCSection>

      <DCSection id="cdesk" title="Вариант C — десктоп · светлая и тёмная тема" subtitle="Финальное направление. Тёмный продуктовый слой: тёмный баннер, финальный CTA с логотипом и соцдоказательством, lime-акценты – на светлой и тёмной странице. Переключатель темы в шапке работает (кликни солнце/луну).">
        <DCArtboard id="cLight" label="Десктоп · светлая" width={1180} height={3520}>
          <GuidePage dir="c" initialTheme="light" banner={<BannerDark />} cta={<CtaDark grid={true} social={true} />} rich={true} />
        </DCArtboard>
        <DCArtboard id="cDark" label="Десктоп · тёмная" width={1180} height={3520}>
          <GuidePage dir="c" initialTheme="dark" banner={<BannerDark />} cta={<CtaDark grid={true} social={true} />} rich={true} />
        </DCArtboard>
      </DCSection>

      <DCSection id="cmob" title="Вариант C — мобайл · светлая и тёмная тема" subtitle="Та же страница на телефоне: компактный баннер, блок-схема разворачивается вертикально, меню – drawer слева. Переключатель темы работает.">
        <DCArtboard id="mLight" label="Мобайл · светлая" width={430} height={3060}>
          <MobileC initialTheme="light" />
        </DCArtboard>
        <DCArtboard id="mDark" label="Мобайл · тёмная" width={430} height={3060}>
          <MobileC initialTheme="dark" />
        </DCArtboard>
        <DCArtboard id="cMenu" label="Мобайл · меню открыто · светлая" width={430} height={910}>
          <MobileMenu initialTheme="light" />
          <div className="ab-cap"><b>Меню слева.</b> По тапу на бургер слева выезжает drawer, фон затемняется. Внутри – разделы и список гайдов. Закрытие по «✕» или тапу по затемнению.</div>
        </DCArtboard>
        <DCArtboard id="cMenuD" label="Мобайл · меню открыто · тёмная" width={430} height={910}>
          <MobileMenu initialTheme="dark" />
          <div className="ab-cap"><b>Тёмная тема.</b> Тот же drawer в тёмном стиле – фон #141416, lime-акцент на активном пункте, затемнение фона глубже.</div>
        </DCArtboard>
        <DCArtboard id="cFab" label="Мобайл · «скопировать агенту» (скролл &gt;1500px)" width={430} height={980}>
          <MobileC initialTheme="light" scroll={true} demoScrolled={true} />
          <div className="ab-cap"><b>Кнопка для агента.</b> При прокрутке ниже 1500px всплывает кнопка «Скопировать для агента» – копирует всю страницу в Markdown, чтобы отправить агенту. Кликни – покажет подтверждение.</div>
        </DCArtboard>
      </DCSection>

      <DCSection id="scale" title="500 гайдов — как искать и не утонуть" subtitle="Плоский список из 16 пунктов не работает на масштабе. Решение: страница-библиотека с поиском, категориями (фасеты со счётчиками), уровнем и пагинацией – плюс командная палитра ⌘K для мгновенного поиска из любой точки сайта. Всё на тех же токенах варианта C.">
        <DCArtboard id="catLight" label="Библиотека · десктоп · светлая" width={1180} height={1000}>
          <Catalog initialTheme="light" />
        </DCArtboard>
        <DCArtboard id="catDark" label="Библиотека · десктоп · тёмная" width={1180} height={1000}>
          <Catalog initialTheme="dark" />
        </DCArtboard>
        <DCArtboard id="catCmdk" label="Поиск ⌘K · палитра по 500 гайдам" width={1180} height={1000}>
          <Catalog initialTheme="dark" initialCmdk={true} />
          <div className="ab-cap"><b>Командная палитра.</b> ⌘K (или клик по строке поиска) открывает палитру: живой поиск по всем 500 гайдам, сгруппированный по категориям. Печатай – список фильтруется.</div>
        </DCArtboard>
        <DCArtboard id="catMob" label="Библиотека · мобайл" width={430} height={1520}>
          <Catalog initialTheme="light" mobile={true} />
        </DCArtboard>
      </DCSection>

      <DCSection id="blocks" title="Контент-блоки в статье — вариант C" subtitle="Как в гайд встраиваются блок-схемы, видео с YouTube и пошаговые инструкции. Всё в читательской теме с lime/ink-акцентами.">
        <DCArtboard id="blkFlow" label="Блок-схема / диаграмма" width={760} height={410}>
          <BlockDemo heading="Как работает связка" intro="Сложные потоки показываем схемой – боксы с mono-подписями и стрелками. На узкой ширине схема разворачивается вертикально.">
            <FlowChart />
          </BlockDemo>
        </DCArtboard>
        <DCArtboard id="blkVideo" label="Видео с YouTube" width={760} height={670}>
          <BlockDemo heading="Видео-разбор" intro="Превью 16:9 с lime-кнопкой play и подписью. Реальный плеер грузится по клику – чтобы не тормозить страницу и SEO.">
            <VideoEmbed />
          </BlockDemo>
        </DCArtboard>
        <DCArtboard id="blkSteps" label="Пошаговый гайд + совет" width={760} height={560}>
          <BlockDemo heading="Пошаговая инструкция" intro="Нумерованные шаги с mono-цифрами в lime-квадрате – для чек-листов и туториалов. Ниже – блок «совет».">
            <StepsGuide />
            <Callout label="СОВЕТ">Держи шаги короткими: одно действие – один пункт. Так гайд легче сканировать и он лучше ранжируется.</Callout>
          </BlockDemo>
        </DCArtboard>
      </DCSection>

    </DesignCanvas>
  );
}

// Delegated copy-to-clipboard for code blocks + prompt callouts (M1). Buttons
// (.copy-btn) are baked into the static guide HTML by build-guides-data.mjs; a
// single document-level listener handles all of them (works after re-mount).
// Analytics goal: fire when any «Вступить» CTA is clicked. The CTA links carry
// utm_medium=<placement> (header/banner/cta/footer/about); we read it so GA4 +
// Yandex.Metrika see WHICH placement converts. Capture-phase → fires before the
// page navigates away. Guarded: no-op during prerender (no gtag/ym) or if blocked.
if (typeof document !== "undefined" && !window.__gfCtaBound) {
  window.__gfCtaBound = true;
  document.addEventListener("click", (e) => {
    // Scope to the community-join destination only (edgelab.space). Without the
    // host filter, an editorial workshop link (edgelab.su, utm_campaign=workshop)
    // in a guide body would wrongly fire the join goal and pollute placements.
    const a = e.target.closest && e.target.closest(`a[href*="${FUNNEL_HOST}"][href*="utm_medium="]`);
    if (!a) return;
    const placement = (a.href.match(/utm_medium=([^&]+)/) || [])[1] || "unknown";
    try { if (typeof window.gtag === "function") window.gtag("event", "join_click", { placement: placement, link_url: a.href }); } catch (err) {}
    try { if (typeof window.ym === "function") window.ym(109832554, "reachGoal", "join_click", { placement: placement }); } catch (err) {}
  }, true);
}

if (typeof document !== "undefined" && !window.__gfCopyBound) {
  window.__gfCopyBound = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".copy-btn");
    if (!btn) return;
    const kind = btn.getAttribute("data-copy");
    let text = "";
    if (kind === "code") {
      const pre = btn.closest(".code-block") && btn.closest(".code-block").querySelector("pre");
      text = pre ? pre.innerText : "";
    } else if (kind === "prompt") {
      // Copy the WHOLE prompt body (paragraphs + ol/ul lists), not just <p> —
      // numbered task lists were being silently dropped. Clone, strip the
      // «ПРОМПТ» eyebrow + the button, then take innerText.
      const cal = btn.closest(".blk-callout");
      if (cal) {
        const clone = cal.cloneNode(true);
        clone.querySelectorAll(".gp-eyebrow, .copy-btn").forEach((n) => n.remove());
        text = clone.innerText.trim();
      }
    }
    if (!text) return;
    const done = () => {
      if (!btn.__orig) btn.__orig = btn.innerHTML;
      btn.classList.add("copied");
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.4l3.3 3.3L13 4.4"></path></svg>';
      window.clearTimeout(btn.__t);
      btn.__t = window.setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = btn.__orig;
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {});
    } else {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand("copy")) done(); } catch (err) { /* noop */ }
      document.body.removeChild(ta);
    }
  });
}

// M1b: fixed «Скопировать страницу» button on guide pages — copies the guide's
// markdown twin (/guides/<slug>.md) for pasting into an AI agent. React-managed
// (single instance, no prerender duplication). Falls back to the rendered
// article text if the .md fetch fails. Dark button works on light + dark themes.
function PageCopyFab({ slug }) {
  const [copied, setCopied] = useState(false);
  if (!slug) return null;
  const onClick = () => {
    const done = () => {
      setCopied(true);
      window.clearTimeout(window.__pfT);
      window.__pfT = window.setTimeout(() => setCopied(false), 2600);
    };
    const doCopy = (text) => {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {});
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { if (document.execCommand("copy")) done(); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
      }
    };
    fetch("/guides/" + slug + ".md")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(doCopy)
      .catch(() => {
        const a = document.querySelector(".gp-article-body, .m-content");
        if (a) doCopy(a.innerText);
      });
  };
  return (
    <button className={"page-fab" + (copied ? " done" : "")} type="button" onClick={onClick} aria-label="Скопировать страницу для агента">
      <span className="mk">{copied ? "✓" : <CopyIcon />}</span>
      <span className="lbl">{copied ? "Скопировано — отправьте агенту" : "Скопировать страницу"}</span>
    </button>
  );
}

const __gfRoot = ReactDOM.createRoot(document.getElementById("root"));
if (window.__GF_VIEW === "variantC") {
  // Standalone guide page shows the first real guide.
  const art = REAL_ARTICLES[GF_GUIDES[0] && GF_GUIDES[0].slug] || guideToArticle(GF_GUIDES[0]);
  __gfRoot.render(
    <div className="standalone-c">
      <GuidePage dir="c" initialTheme="light" article={art} cur={art ? art.cur : "claude"} banner={<BannerDark />} cta={<CtaDark grid={true} social={true} />} rich={true} />
    </div>
  );
} else if (window.__GF_VIEW === "home") {
  __gfRoot.render(
    <div className="standalone-c">
      <Home initialTheme="light" idp="page" />
    </div>
  );
} else if (window.__GF_VIEW === "guide") {
  // Per-guide page: guides/<slug>.html sets __GF_SLUG (+ __GF_BASE="../").
  const slug = window.__GF_SLUG;
  const art = REAL_ARTICLES[slug] || REAL_ARTICLES[Object.keys(REAL_ARTICLES)[0]];
  __gfRoot.render(
    <div className="standalone-c">
      <GuidePage dir="c" initialTheme="light" article={art} cur={art ? art.cur : "library"} banner={<BannerDark />} cta={<CtaDark grid={true} social={true} />} rich={true} />
    </div>
  );
} else if (window.__GF_VIEW === "category") {
  // Each category route maps to a representative REAL guide in that category.
  // Hermes/Codex now have placeholder intro guides (cat=hermes/codex).
  const CAT_TO_SLUG = {
    claude: firstInCat("claude", GF_GUIDES[0] && GF_GUIDES[0].slug),
    hermes: firstInCat("hermes", GF_GUIDES[0] && GF_GUIDES[0].slug),
    codex: firstInCat("codex", GF_GUIDES[0] && GF_GUIDES[0].slug),
  };
  const slug = CAT_TO_SLUG[window.__GF_CAT] || CAT_TO_SLUG.claude;
  const art = REAL_ARTICLES[slug] || guideToArticle(GF_GUIDES[0]);
  __gfRoot.render(
    <div className="standalone-c">
      <GuidePage dir="c" initialTheme="light" article={art} cur={window.__GF_CAT === "claude" ? "claude" : (window.__GF_CAT || "claude")} banner={<BannerDark />} cta={<CtaDark grid={true} social={true} />} rich={true} />
    </div>
  );
} else if (window.__GF_VIEW === "about") {
  __gfRoot.render(
    <div className="standalone-c">
      <AboutPage initialTheme="light" />
    </div>
  );
} else if (window.__GF_VIEW === "library") {
  __gfRoot.render(
    <div className="standalone-c">
      <Catalog initialTheme="light" />
    </div>
  );
} else if (window.__GF_VIEW === "mobile") {
  // Route resolution order: live URL hash (interactive nav in mobile.html) wins;
  // then __GF_ROUTE (baked into the prerendered build/m/<page>.html so it
  // re-mounts to the right screen even though dynamic serving strips the hash);
  // then __GF_CAT; default home. __GF_ROUTE is a reserved route name
  // (home/library/claude/hermes/codex/about) or a real guide slug — the legacy
  // "guide" alias below is hash-only and never baked.
  const v = (window.location.hash || "").replace("#", "") || window.__GF_ROUTE || window.__GF_CAT || "home";
  const firstReal = REAL_ARTICLES[GF_GUIDES[0] && GF_GUIDES[0].slug];
  const catReal = (cat) => REAL_ARTICLES[firstInCat(cat, GF_GUIDES[0] && GF_GUIDES[0].slug)];
  const bySlug = REAL_ARTICLES[v];
  const inner = bySlug ? <MobileArticle article={bySlug} />
    : v === "claude" ? <MobileArticle article={catReal("claude")} />
    : v === "hermes" ? <MobileArticle article={catReal("hermes")} />
    : v === "codex" ? <MobileArticle article={catReal("codex")} />
    : v === "guide" ? <MobileArticle article={firstReal} />
    : v === "about" ? <AboutPage initialTheme="light" mobile={true} />
    : v === "library" ? <Catalog initialTheme="light" mobile={true} />
    : <Home initialTheme="light" mobile={true} idp="mob" />;
  // page-copy FAB only on mobile GUIDE/category article views
  const mGuideSlug = bySlug ? v
    : (v === "claude" || v === "hermes" || v === "codex") ? firstInCat(v, GF_GUIDES[0] && GF_GUIDES[0].slug)
    : v === "guide" ? (GF_GUIDES[0] && GF_GUIDES[0].slug)
    : null;
  __gfRoot.render(<div className="mobile-stage">{inner}</div>);
  if (!window.__gfHashWired) { window.__gfHashWired = true; window.addEventListener("hashchange", () => window.location.reload()); }
} else {
  __gfRoot.render(<App />);
}
