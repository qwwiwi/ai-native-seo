# Checklist

- id: loore-blog
- brief: brief/BRIEF.md
- version: 2

| ID | Brief quote | Contract | Rationale |
|---|---|---|---|
| R01 | создать домен блок дот лур | live | blog.loore.ai opens over HTTPS and serves the blog |
| R02 | есть готовы репозитория | live | Built on the ai-native-seo engine with a Loore brand config (no fork of the engine code) |
| R03 | используя стиль лури | live | Loore visual style: palette, fonts, logo as on loore.ai |
| R04 | нужно писать более 10 статей | live | At least 10 published articles, each on a distinct real search query |
| R05 | спросил кельтас как это у нас сделано уже в блоге | live | First 10+ topics taken from Kaelthas Wordstat plan (brief/KAELTHAS-content-plan.md), starting with 1, 5, 9, 14; owner approves the list |
| R06 | сгенерировать соответственно картинки | live | Each article has a cover image generated with gpt-image-2 in Loore style |
| R07 | чтобы соответственно появляться | live | SEO/AI layer on: sitemap, robots, JSON-LD, llms.txt, markdown twins, IndexNow |
| R08 | чтобы эти все кнопки там везде был переход, призыв на сайт лури.и там блог, мы с Кельтасом там сделали уже промокод блог, чтобы было понятно, что люди с блога пришли. | live | Every button and CTA leads to loore.ai/r/blog (raw, not wrapped in go.edgelab.space) and names promo code BLOG |
| R09 | подумать как это сделать по запросу | live | Copy rules: no invented numbers; every Loore claim checked against loore.ai/llms-full.txt; Loore positioned by outcome, not as a scraper |
| R10 | В общем, сделай это, у Кельтаса спроси, он тебе передаст. | live | Content pipeline reused from the EdgeLab blog (Kaelthas answer recorded in brief/) |
| R11 | чтобы было понятно, что люди с блога пришли. | live | Analytics on (Yandex Metrika / GA4 or the Loore default) |
| R12 | на сайте луре это расположить | live | Phone 390px and desktop screenshots of the live blog shown to the owner |
| R13 | А когда долго загружаются, поисковики это не особо любят. Нужно подумать, чтобы загрузка была. Тоже ресерч по загрузке компонентов сайта нужно тоже понять. | live | Page speed: research why blog.edgelab.space loads slowly; Loore blog passes Core Web Vitals on mobile (LCP < 2.5 s, CLS < 0.1, INP < 200 ms) measured on the live URL |
| R14 | И написать скилл, написание статей, скилл прямо написать. | live | A reusable article-writing skill for Loore blog (query research -> outline -> draft -> fact check vs llms-full.txt -> lint -> cover -> publish), committed to the repo and used for all 10+ articles |
| R15 | То есть сделай ресерч, как правильно писать, создавать движки для SEO, Geo, чтобы они быстро грузились. Сделай ресерч и добавь их. | live | Research how to build fast SEO/GEO engines (image formats, sizes, loading, page weight) committed to brief/; its findings applied to the engine and to every cover image (modern format, responsive sizes) |
| R16 | И еще надо продумать, чтобы следить следующий месяц, два, три. Вообще будет нет трафик приходить, чтобы понимать есть трафик или нет. | live | Traffic monitoring for months 1-3 after launch: a recurring report (visits, search impressions/clicks, AI-referral traffic, BLOG promo redemptions) answering «is traffic coming or not» |
| R17 | Шаблоны именно, которые установщик нужно будет потом доделать | deferred | After the Loore blog is built and its look and load speed are shown to the owner (screenshots + measured CWV), the speed fixes are ported to the shared engine (qwwiwi/ai-native-seo main – the white-label template) and to the templates the installer uses, so every new blog built from them is fast. Deferred by owner 72800: «Сначала блок лури, потом лума трейд, а только потом задачу с AI-NTFCO» – a separate large task after LumaTrade, not part of this blog release. |
