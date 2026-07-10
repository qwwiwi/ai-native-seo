# Аналитика блога — дочитываемость (read-through)

Как меряется глубина чтения статей и гайдов на blog.edgelab.space, и как читать эти метрики.
Полная карта SEO-измерения (поисковая видимость, подбор запросов, инструменты) — [`SEO.md`](SEO.md).

## Что меряем

Для каждой статьи/гайда — на какую глубину её реально читают (а не просто открывают). Главный сигнал — **% дочитавших до 75%** (scroll_75).

## Код инструментирования

`site/scroll-depth.js` на каждой странице гайда/статьи шлёт:
- Яндекс.Метрика: `ym(109832554, 'reachGoal', 'scroll_25|50|75|100')` + `notBounce` на 75%.
- GA4: `gtag('event', 'scroll_depth', { percent_scrolled, page_path, content_group })`.
- Плюс на странице: JSON-LD с `articleBody` (полный текст) и `<body data-content-group="article|guide">`.

## Яндекс.Метрика — счётчик 109832554 (edgelab.space)

JS-цели (тип «JavaScript-событие»):

| Цель | event id | goal id |
|------|----------|---------|
| Дочитал 25% | `scroll_25` | 571008764 |
| Дочитал 50% | `scroll_50` | 571008765 |
| Дочитал 75% (KPI) | `scroll_75` | 571008766 |
| Дочитал 100% | `scroll_100` | 571008767 |

Включено: **Вебвизор + карта скроллинга**; **Аналитика контента** (активируется от JSON-LD-разметки — отчёты «Дочитывания / Доскроллы / Рециркуляция» по материалам/авторам/рубрикам).

Как прочитать % дочитавших по страницам (через скилл `yandex-metrika`):
```
metrika_report.py --site space \
  --metrics ym:s:visits,ym:s:goal571008766reaches,ym:s:goal571008766conversionRate \
  --dimensions ym:s:startURL --sort=-ym:s:visits
```
`goal571008766conversionRate` = % дочитавших до 75% (KPI), разрез по странице.

## GA4 — проперть 541632754 (стрим edgelab.space, G-J3H4311DJT)

- Custom dimension **`percent_scrolled`** (scope Event) — создана; показывает глубину скролла в отчётах.
- Встроенное измерение **`contentGroup`** (`article` / `guide`) — разрез по типу контента.

Как прочитать (через скилл `google-analytics`):
```
ga4_report.py --site space --dimensions pagePath,customEvent:percent_scrolled --metrics eventCount --order -eventCount
ga4_report.py --site space --dimensions contentGroup --metrics sessions,eventCount
```

Нюанс GA4: custom dimension применяется **вперёд** (не задним числом) — наполняется по мере новых событий.

## Кто настраивал

Код дочитываемости — портал (PR измерения дочитываемости статей). Цели Метрики, Вебвизор и GA4-измерение — Кельтас (sa-kaelthas) через Management/Admin API, 2026-06-18.
