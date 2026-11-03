# Promo/referral «blog» in Loore prod (read-only check, 2026-11-03 19:12 UTC)

- PromoCode BLOG: owner's account, gridId=house -> monthly prices start 1 790 ₽, pro 3 490 ₽, max 7 990 ₽ (DiscountGridRule priceMinor 179000/349000/799000); monthly only (annual -> interval_not_eligible); active, no expiry, no cap; 0 redemptions.
- PartnerReferralLink slug=blog, label «Трафик с SEO с блога сайта», active, 2 clicks (both 2026-11-03 11:44-11:45 UTC). Partner commission 40%, codeDiscountPercent 10.
- loore.ai/r/blog: 302 to «/», no ?ref; the whole query string (utm_*) survives. Cookies lr_ref, lr_ref_src (utm, referrerHost, clickId), lr_ref_by; 90 days, Domain=loore.ai, first touch wins.
- Every visit -> PartnerReferralClick (code, linkId, utm*, referrerHost, repeatVisit). Signup -> PartnerAttribution (one per user, source link|code, utm*). Purchase discount -> PromoRedemption.
- So: CTA = https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<slug> works and is attributable per article.

## Analytics and brand assets (Silvana, swarm silvana::thrall::4f2b05fce0543d0b)
- No API access to the owner's Metrika/GA4. Counters are created in the owner's browser by Codex desktop (as for Kaina 113967417). Silvana tasks Codex: Metrika + GA4 web stream for blog.loore.ai, sends public IDs (today or 04.11 morning after the Codex reset).
- Webmaster + GSC verification: by meta tags. The template must have slots for yandex-verification and google-site-verification; codes come from Silvana.
- No SVG wordmark of Loore exists. Assets: loore-frontend brand/app-icon/loore-appicon-{dark,light,orange}-*.png and public/partners/fonts/geist-*.woff2 (copied to brief/loore-style/). Decision: build the wordmark from the app icon + Geist (no owner question).
