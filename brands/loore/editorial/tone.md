# Loore blog – tone of voice

Sources: Kaelthas's rules (`brief/KAELTHAS-content-plan.md`), PLAN §9, Loore's own published
text (loore.ai landing and https://loore.ai/llms-full.txt, read 2026-11-03), EdgeLab pipeline
TOV that Kaelthas reused (`docs/CONTENT-PIPELINE.md`). Articles are Russian.

## Voice

- **Thesis first.** The first sentence of the article and of every section says the point.
  Explanations follow.
- **Short sentences.** One thought per sentence. Paragraphs of 2–4 sentences.
- **Address the reader as «ты».** Loore's own landing and docs use «ты» («твой ChatGPT или
  Claude», «Сценарий пишет твой ChatGPT или Claude по этим данным»). Assumption recorded by
  slice D; the owner can veto it.
- **Facts over adjectives.** «показывает, во сколько раз просмотры выше медианы автора» instead
  of «мощная аналитика». Numbers only with a source (`skills/loore-article/references/fact-check.md`).
- **Honest limits.** Say what does not work and where Loore stops. Loore's docs say it plainly:
  Loore returns measurements and data, scripts are written by the reader's agent.
- **Colleague, not infobiz.** No hype, no pressure, no «успей», no «секрет», no «гарантированно».

## Typography

- Quotes: «ёлочки»; nested „лапки“.
- Dash: short dash «–» with spaces (Kaelthas's rule). Do not use the long «—» in new text;
  quotes from Loore's own pages keep their original dashes.
- **No «!»** – not in titles, descriptions, body, FAQ or alt.
- No emoji. No ALL CAPS words except abbreviations (MCP, API, REST, BLOG).
- Names as the brands write them: Loore, Claude, Claude Code, ChatGPT, Instagram, YouTube, MCP.
  The Russian query form («Инстаграм», «рилс») appears where it is the real query.

## Positioning – what Loore is

Describe Loore by the outcome for the reader:

- «открывает твоему ChatGPT или Claude рилсы из Instagram: режет видео на кадры, переводит речь
  в текст и сравнивает просмотры с обычными у автора» (Loore's own one-line description);
- the reader's agent sees the frames and the words of competitors' reels instead of guessing;
- the agent writes scripts on real data, Loore supplies the data.

Never: «парсер», «скрапер», «scraper», «parser», «граббер», «выкачать», «спарсить» for Loore.
Kaelthas: «parser» demand is small and falling; outcome positioning wins.

## Never write

- «24/7», passive income, guaranteed views/followers/revenue, «залетит гарантированно».
- «лучший», «самый», «номер один» without a source.
- Time promises («за 2 минуты», «за 10 минут») unless you measured them yourself and recorded
  the run in `sources/<slug>.md`.
- Indexing, ranking, AI-citation or rich-result promises.
- Prices or discount percentages unless re-checked on loore.ai on the writing day; BLOG is
  described only as «скидка на месячные тарифы».
- First-person endorsement («я сам так собираю идеи») unless `author.md` confirms the author's
  own experience. Kaelthas's CTA draft is first person – rewrite it in the second person.
- Anything from EdgeLab: author, community, «сообщество», «эфиры», `go.edgelab.space`.

## CTA voice

The CTA closes the content naturally: the reader has just seen the manual path, Loore is the
shorter path to the same result. One sentence of outcome, then the link:

> Если хочешь, чтобы твой Claude или ChatGPT сам видел кадры и текст чужих рилсов, подключи
> Loore. [Промокод BLOG – скидка на месячные тарифы](https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<slug>&utm_content=article-end).

Rewrite the first sentence per article; keep the link text and href pattern exact.

## Before / after

| Before | After |
|---|---|
| Loore – мощный парсер Instagram! | Loore показывает твоему Claude кадры и расшифровку чужих рилсов. |
| Мы расскажем, как найти идеи для рилс. | Идеи для рилс берут из роликов, которые уже залетели у похожих авторов. |
| Залетит гарантированно за 10 минут. | Сравни просмотры ролика с медианой автора – так видно, что сработало именно у него. |
