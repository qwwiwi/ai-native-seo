# blog.edgelab.space load baseline (Thrall, 2026-11-03 19:09 UTC)

Playwright, 390x844, throttled: 150 ms RTT, 1.6 Mbit/s down, CPU x4 (mid phone on 4G).
Server is fast: TTFB 0.14-0.16 s. The slowness is client-side.

| Page | LCP | CLS | DOMContentLoaded | load | transferred |
|---|---|---|---|---|---|
| / (home) | 0.98 s | 0.001 | 9.98 s | 27.1 s | 3.69 MB (images 3.27 MB, 57 requests) |
| /guides/chto-takoe-claude-code/ | **13.9 s** | **0.106** | 10.8 s | 11.0 s | 513 KB |

Biggest items:
- guides-data.js – 274 KB on EVERY page (the whole catalogue), 6.6-7.7 s to arrive under throttling; blocks content.
- Home loads all card covers eagerly: 20+ WebP of 110-150 KB each (3.3 MB).
- gf-app.jsx (37 KB) – the page is a client React prototype; prerendered HTML is re-rendered by JS, so LCP waits for scripts.
- tag.js (Yandex Metrika) 69 KB.
- Article CLS 0.106 is above the 0.1 threshold.
