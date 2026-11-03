# Promo/referral «blog» in Loore prod (read-only check, 2026-11-03 19:12 UTC)

- PromoCode BLOG: owner's account, gridId=house -> monthly prices start 1 790 ₽, pro 3 490 ₽, max 7 990 ₽ (DiscountGridRule priceMinor 179000/349000/799000); monthly only (annual -> interval_not_eligible); active, no expiry, no cap; 0 redemptions.
- PartnerReferralLink slug=blog, label «Трафик с SEO с блога сайта», active, 2 clicks (both 2026-11-03 11:44-11:45 UTC). Partner commission 40%, codeDiscountPercent 10.
- loore.ai/r/blog: 302 to «/», no ?ref; the whole query string (utm_*) survives. Cookies lr_ref, lr_ref_src (utm, referrerHost, clickId), lr_ref_by; 90 days, Domain=loore.ai, first touch wins.
- Every visit -> PartnerReferralClick (code, linkId, utm*, referrerHost, repeatVisit). Signup -> PartnerAttribution (one per user, source link|code, utm*). Purchase discount -> PromoRedemption.
- So: CTA = https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<slug> works and is attributable per article.
