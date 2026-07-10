# EdgeLab Space — карта путей (routes)

Все маршруты blog.edgelab.space: страницы для людей + пути для агентов/краулеров. В проде каждый
путь — реальный статический файл (или сгенерированная HTML-страница), отдаётся с правильным
`Content-Type`; на несуществующий путь — настоящий 404 (не fallback-индекс).

## Десктоп-страницы (HTML)

| Путь | Экран | Назначение |
|---|---|---|
| `/` | Главная | геро «AI ПОРТАЛ» + секции «Статьи» и «Гайды». |
| `/library/` | Все гайды | каталог гайдов + поиск ⌘K + фасеты/уровни/пагинация. |
| `/claude-code/` | Статья Claude Code | категория `claude`. |
| `/hermes/` | Статья Hermes | категория `hermes`. |
| `/codex/` | Статья Codex | категория `codex`. |
| `/guides/<slug>/` | Страница гайда | конкретный гайд (TL;DR, шаги, FAQ, changelog). |
| `/about/` | О проекте | автор, сообщество, канал, реквизиты. |

Навигация в шапке связывает все страницы; переключатель темы — на каждой.

## Мобильные маршруты

Логика дизайна — одна оболочка с экраном по якорю. В статической проде каждый раздел — обычная
страница (адаптив mobile-first), бургер-меню → шторка слева ведёт на те же пути:
`/` · `/library/` · `/claude-code/` · `/hermes/` · `/codex/` · `/about/`.
На длинных статьях — кнопка «Скопировать для агента» (появляется при скролле).

## Пути для агентов и краулеров (agent-readiness + SEO)

| Путь | Тип | Назначение |
|---|---|---|
| `/robots.txt` | text/plain | правила AI-ботов (GPTBot, OAI-SearchBot, ClaudeBot, Google-Extended, PerplexityBot, YandexBot) + `Sitemap:` + `Content-Signal:`. |
| `/sitemap.xml` | application/xml | канонические URL всех страниц/гайдов + `lastmod`. |
| `/llms.txt` | text/markdown | curated карта для AI-моделей (что это, гайды, MCP, API, безопасность). |
| `/<page>.md` | text/markdown | markdown-двойник каждой страницы/гайда (для `Accept: text/markdown` и llms.txt). |
| `/.well-known/mcp/server-card.json` | application/json | MCP server card (SEP-1649) → наш MCP `mcp.edgelab.space`. |
| `/.well-known/api-catalog` | application/linkset+json | API catalog (RFC 9727) → `api.edgelab.space`. |
| `/.well-known/agent-skills/index.json` | application/json | индекс наших скиллов (agenttinder, edgelab-knowledge-search). |

Плюс: JSON-LD (`TechArticle`/`HowTo`/`FAQPage`/`BreadcrumbList` + `dateModified`) в `<head>` каждой
страницы, `Link`-заголовки (RFC 8288) на главной, внутренняя перелинковка (концепт/reference/
workflow/сравнение). Деталь — в `docs/` и в SEO/agent-чеклисте проекта.

## Серверные правила (Caddy)

- Отдавать реальные файлы с верным `Content-Type`; неизвестный путь → `404` (не индекс).
- `Link`-заголовки на `/`.
- Markdown-negotiation: `Accept: text/markdown` → отдать `.md`-двойник.
- Корректный `Last-Modified`.

## Деплой

Cloudflare DNS: `blog.edgelab.space` → Timeweb. Caddy vhost обслуживает статику из каталога сборки.
Сборка генератором (`scripts/`), деплой через rsync (бэкап прод-папки до выкладки).
