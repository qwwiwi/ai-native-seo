import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_UI } from '../scripts/brand-compat.mjs';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const provider = () => import('../brands/loore/ui.js');
const uiData = async () => JSON.parse(await read('../brands/loore/ui.json'));
const placements = ['header', 'banner', 'cta', 'footer', 'about'];
const wording = 'Промокод BLOG – скидка на месячные тарифы';
const brand = JSON.parse(await read('../brands/loore/brand.config.json'));
for (const placement of placements) {
  for (const mobile of [false, true]) {
    test(`exact href: ${placement}, ${mobile ? 'mobile' : 'desktop'}, inbound UTM and blocked storage`, async () => {
      const { buildCtaUrl, renderCta } = await provider();
      const expected = `https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=idei-dlya-rils&utm_content=${placement}`;
      const href = buildCtaUrl({ slug: 'idei-dlya-rils', placement }, brand);
      assert.equal(href, expected);
      const html = renderCta({ slug: 'idei-dlya-rils', placement }, brand);
      assert.ok(html.includes(`href="${expected.replaceAll('&', '&amp;')}"`));
      assert.ok(html.includes(`data-cta="${placement}"`));
      assert.ok(html.includes(wording));
      const listeners = [];
      const document = { addEventListener: (type, fn) => listeners.push([type, fn]) };
      const location = new URL(`https://blog.loore.ai/${mobile ? 'm/' : ''}guides/idei-dlya-rils/?utm_source=foreign&utm_medium=paid&utm_campaign=wrong&utm_content=wrong&utm_term=wrong`);
      const context = { React: {}, URL, URLSearchParams, document, location,
        window: { __BRAND: brand, __GF_VIEW: mobile ? 'mobile' : 'guide', location, document },
        sessionStorage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } };
      const source = await read('../site/gf-app.jsx');
      vm.runInNewContext(source.slice(0, source.indexOf('// M-theme:')), context);
      const anchor = { href };
      assert.equal(anchor.href, expected, 'after shared client load');
      for (const [type, fn] of listeners) if (type === 'click') fn({ target: { closest: () => anchor } });
      assert.equal(anchor.href, expected, 'at click time');
      assert.equal(listeners.length, 0, 'none funnel must not bind host-wide rewriting');
    });
  }
}
test('stable non-article slug and rejected unknown placements', async () => {
  const { buildCtaUrl } = await provider();
  assert.equal(buildCtaUrl({ slug: 'library', placement: 'header' }, brand), 'https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=library&utm_content=header');
  assert.throws(() => buildCtaUrl({ slug: '', placement: 'header' }, brand));
  assert.throws(() => buildCtaUrl({ slug: 'home', placement: 'footer-community' }, brand));
});
function shape(value) {
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, shape(value[k])]));
  return 'leaf';
}
test('UI has exactly DEFAULT_UI keys and approved author identity', async () => {
  const ui = await uiData();
  assert.deepEqual(shape(ui), shape(DEFAULT_UI));
  assert.equal(ui.byline.ariaLabel, 'Даши Ешиев');
  assert.equal(ui.about.hello, 'Автор – Даши Ешиев');
  assert.equal(ui.byline.avatar, '/identity/author-placeholder.svg');
  assert.match(await read('../brands/loore/assets/identity/author-placeholder.svg'), /PLACEHOLDER/);
});
test('BLOG wording for every commercial copy slot', async () => {
  const ui = await uiData();
  for (const value of [ui.bannerCard.button, ui.cta.button, ui.mobile.bannerCta, ui.about.card.text]) assert.equal(value, wording);
});
test('no annual offer, unsupported numbers, scraper or community copy', async () => {
  const ui = await uiData();
  const text = JSON.stringify(ui);
  assert.doesNotMatch(text, /годов|годич|annual|yearly|парсер|скрапер|сообществ|комьюнити|эфир|участник|!|\d/i);
  assert.equal(brand.funnel.mode, 'none');
});
