# Loore blog – acceptance checklist (draft, awaiting owner approval)

| ID | Requirement | Contract |
|---|---|---|
| R01 | blog.loore.ai opens over HTTPS and serves the blog | live |
| R02 | Built on the ai-native-seo engine with a Loore brand config (no fork of the engine code) | live |
| R03 | Loore visual style: palette, fonts, logo as on loore.ai | live |
| R04 | At least 10 published articles, each on a distinct real search query | live |
| R05 | First 10+ topics taken from Kaelthas Wordstat plan (brief/KAELTHAS-content-plan.md), starting with 1, 5, 9, 14; owner approves the list | live |
| R06 | Each article has a cover image generated with gpt-image-2 in Loore style | live |
| R07 | SEO/AI layer on: sitemap, robots, JSON-LD, llms.txt, markdown twins, IndexNow | live |
| R08 | Every button and CTA leads to loore.ai/r/blog (raw, not wrapped in go.edgelab.space) and names promo code BLOG | live |
| R09 | Copy rules: no invented numbers; every Loore claim checked against loore.ai/llms-full.txt; Loore positioned by outcome, not as a scraper | live |
| R10 | Content pipeline reused from the EdgeLab blog (Kaelthas answer recorded in brief/) | live |
| R11 | Analytics on (Yandex Metrika / GA4 or the Loore default) | live |
| R12 | Phone 390px and desktop screenshots of the live blog shown to the owner | live |
| R13 | Page speed: research why blog.edgelab.space loads slowly; Loore blog passes Core Web Vitals on mobile (LCP < 2.5 s, CLS < 0.1, INP < 200 ms) measured on the live URL | live |
| R14 | A reusable article-writing skill for Loore blog (query research -> outline -> draft -> fact check vs llms-full.txt -> lint -> cover -> publish), committed to the repo and used for all 10+ articles | live |
