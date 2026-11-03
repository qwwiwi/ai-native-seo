// brand-compat.mjs — the DEFAULT brand's compatibility data.
//
// The shared engine (site/gf-app.jsx, site/scroll-depth.js, scripts/*.mjs) used to
// carry the default brand's identity as literals and fallbacks: community copy,
// the author avatar, the Metrika counter, legal text, hosts. Every one of those
// shipped inside the shared client bundle of ANY brand built with this engine.
// They live here now, as brand data of the default brand only:
//
//   - DEFAULT_UI      → window.__BRAND.ui for the default brand (the client reads
//                       every brand-specific string from BRAND.ui; another brand
//                       gets its own ui data or null, never these values);
//   - DEFAULT_SEO     → default-brand copy of the SEO layer (meta descriptions,
//                       llms.txt texts, the guides-data banner);
//   - DEFAULT_ASSETS  → the default brand's legacy recursive asset copy
//                       (images/, covers/, icons) and its about-page hero;
//   - DEFAULT_DEPLOY  → the default brand's public deployment target (manifest);
//   - LEAK_PATTERNS   → identity tokens of the default brand. Any of them in the
//                       config or the emitted output of ANOTHER brand fails the build.
//
// Rendered output of the default brand stays byte-identical: each value below is
// the literal that used to be inlined. Zero dependencies.

// Built-in brand id of the root brand.config.json.
export const DEFAULT_BRAND_ID = "edgelab";

// UI copy of the default brand. Strings are templates; the client fills
// {brand} (name), {brandNb} (name with no-break spaces), {brandUpper},
// {brandUpperNb}, {tg} (channel name) and {author}. Keys are read by
// site/gf-app.jsx; a missing key renders nothing.
export const DEFAULT_UI = {
  byline: {
    avatar: "/images/author-avatar.png",
    ariaLabel: "Канал «Записки AI-энтузиаста»",
  },
  drawerGroup: "Сообщество",
  headerLive: "ЭФИР В СРЕДУ · 16:00 МСК",
  bannerStrip: { eyebrow: "{brandUpperNb}" },
  bannerCard: {
    eyebrow: "ЗАКРЫТОЕ AI-КОМЬЮНИТИ",
    offer: "Библиотека готовых скиллов, живой чат и эфиры – внутри {brandNb}",
    button: "Вступить →",
  },
  bannerDark: {
    eyebrow: "ЭФИР В СРЕДУ",
    lead: "Закрытое AI-комьюнити {brandNb} – ",
    accent: "библиотека, живой чат, эфиры по средам",
    tail: ".",
  },
  sideMini: {
    title: "Что внутри Space",
    items: ["Готовые скиллы и юзкейсы", "Живой чат с агентами", "Эфиры по средам"],
  },
  cta: {
    title: "Дальше – вместе с сообществом",
    sub: "Гайд прочитан. Внедрять – проще не в одиночку, а в закрытом AI-комьюнити.",
    bullets: [
      "Библиотека готовых скиллов и юзкейсов для Claude и Codex",
      "Живой чат, где общаются и люди, и их агенты",
      "Эфиры по средам и готовые решения под реальные задачи",
    ],
    button: "Вступить в {brandNb} →",
    fine: "Мгновенный доступ. Отмена в один клик.",
    social: "В чате сейчас 320+ участников и их агенты",
  },
  footer: {
    about: "Портал об AI-агентах: Claude Code, Hermes и Codex. Гайды, статьи и живое сообщество — от Даши Ешиева и канала «{tg}».",
    streams: "Эфиры по средам",
    streamsShort: "Эфиры",
    community: "Живой чат",
    channel: "Канал «{tg}»",
  },
  mobile: {
    banner: "Эфир в среду · закрытое AI-комьюнити",
    bannerHome: "Закрытое AI-комьюнити {brand}",
    bannerCta: "Вступить →",
    ctaTitle: "Дальше – вместе с сообществом",
    ctaSub: "Внедрять проще в закрытом AI-комьюнити.",
    ctaTitleShort: "Дальше – вместе",
    ctaSubShort: "Внедрять проще в закрытом комьюнити.",
    ctaBullets: ["Готовые скиллы и юзкейсы", "Живой чат с людьми и агентами", "Эфиры по средам"],
    ctaFine: "Отмена в один клик",
  },
  about: {
    title: "{brand} — портал об AI-агентах",
    description: "Гайды, статьи и живое сообщество вокруг Claude Code, Hermes и Codex. Здесь я собираю то, что реально работает на практике, и разбираю это простым языком.",
    channelLink: "Телеграм-канал «{tg}»",
    heroImage: "/covers/_about-hero.webp",
    hello: "Привет, я {author}",
    introLead: "Я веду телеграм-канал ",
    introLink: "«{tg}»",
    introTail: " и каждый день работаю с AI-агентами на реальных задачах. {brand} — это место, куда я переношу всё самое полезное: не сухие инструкции, а живые истории о том, что сработало, что сломалось и почему.",
    paragraphs: [
      "Мне важно, чтобы материалы читались как разговор с коллегой, а не как документация. Поэтому каждый гайд — это личный опыт, проверенный на своих проектах, с примерами и честными выводами.",
    ],
    featuresTitle: "Что внутри сообщества",
    features: [
      ["Библиотека скиллов и юзкейсов", "Готовые решения для Claude Code, Hermes и Codex — бери и применяй."],
      ["Живой чат", "Место, где общаются и люди, и их агенты. Вопрос не останется без ответа."],
      ["Эфиры по средам", "Разбираем свежие темы и реальные задачи в прямом эфире."],
    ],
    card: {
      eyebrow: "{brandUpper}",
      title: "Присоединяйся к сообществу",
      text: "Закрытое AI-комьюнити: библиотека, живой чат и эфиры. Отмена в один клик.",
    },
  },
};

// SEO-layer copy of the default brand (build-seo.mjs / build-guides-data.mjs).
export const DEFAULT_SEO = {
  homeDescription: "Практические гайды по Claude Code, MCP, AI-агентам и автоматизации. Закрытое AI-комьюнити {brand}.",
  libraryDescription: "Каталог практических гайдов по AI-агентам, Claude Code и автоматизации.",
  aboutDescription: "{brand} — закрытое AI-комьюнити: библиотека, живой чат, эфиры по средам.",
  llmsTitle: "{brand} — портал об AI-агентах",
  llmsIntro:
    "Практические гайды на русском по Claude Code, MCP-серверам, AI-агентам, " +
    "автоматизации видео и личным базам знаний. Каждый гайд протестирован, с " +
    "датой обновления, готовыми промптами и пошаговой настройкой. " +
    "EdgeLab Space — закрытое AI-комьюнити: библиотека, живой чат, эфиры по средам.",
  llmsMcp:
    "программный доступ к библиотеке " +
    "EdgeLab Space через Model Context Protocol (по токену) — поиск материалов, чтение гайдов, вопросы хаба. " +
    "Это поддерживаемый агент-интерфейс.",
  serverCardDescription: "Программный доступ к библиотеке EdgeLab Space: поиск материалов, чтение гайдов, вопросы хаба.",
  guidesDataBanner: "Real EdgeLab guide content (text only, no images) for the 1:1 portal design.",
};

// Legacy asset layout of the default brand: site/ holds its covers and images and
// the build copies them recursively (other brands copy only referenced files).
export const DEFAULT_ASSETS = {
  recursive: ["images", "covers", "favicon.ico", "icon-32.png", "apple-touch-icon.png"],
  icons: { ico: "/favicon.ico", png32: "/icon-32.png", apple: "/apple-touch-icon.png" },
};

// Public deployment target of the default brand (scripts/deploy.sh defaults).
export const DEFAULT_DEPLOY = { host: "213.171.6.132", webroot: "/var/www/blog-edgelab-space" };

// Identity tokens of the default brand (PLAN.md §2 leak gate). Case-sensitive set
// from the plan plus case-insensitive variants of the same identities.
export const LEAK_PATTERNS = [
  /edgelab|EdgeLab|109832554|G-J3H4311DJT|Ешиев|ИНН|go\.edgelab\.space|_home-hero-dashi|author-avatar/,
  /edgelab|ешиев|j3h4311djt|dashi_agent|dashieshiev|about-dashi|_about-hero/i,
];

/** First leak match in `text` (string) or null. */
export function findLeak(text) {
  for (const re of LEAK_PATTERNS) {
    const m = String(text).match(re);
    if (m) return m[0];
  }
  return null;
}
