// Server-side UI provider. A must wire renderCta into static page placements.
// Attribution is fixed at render time; no DOM rewriting or storage access.
export const CTA_TEXT = 'Промокод BLOG – скидка на месячные тарифы';
export const CTA_PLACEMENTS = Object.freeze(['header', 'banner', 'cta', 'footer', 'about']);

export function buildCtaUrl({ slug, placement }, brand) {
  if (brand?.id !== 'loore' || brand?.funnel?.targetUrl !== 'https://loore.ai/r/blog') {
    throw new Error('Expected the Loore referral destination');
  }
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('A stable page slug is required');
  }
  if (!CTA_PLACEMENTS.includes(placement)) throw new Error('Unknown CTA placement');
  const url = new URL(brand.funnel.targetUrl);
  // PLAN §4 uses article for all placements, including its footer example.
  url.search = new URLSearchParams({
    utm_source: 'blog', utm_medium: 'article', utm_campaign: slug, utm_content: placement,
  }).toString();
  return url.href;
}

export function renderCta(options, brand) {
  const href = buildCtaUrl(options, brand).replaceAll('&', '&amp;');
  return `<a class="loore-cta" data-cta="${options.placement}" href="${href}">${CTA_TEXT}</a>`;
}
