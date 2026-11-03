/* read-through tracker — blog.edgelab.space guide/article pages only.
   Fires scroll-depth milestones (25/50/75/100%) ONCE per page load into:
     • Yandex.Metrika (109832554): reachGoal scroll_N + notBounce at 75% («дочитал»
       → fixes the single-page «время на странице = 0» / bounce problem)
     • GA4: scroll_depth event with percent_scrolled + content_group
   content_group (article|guide) comes from <body data-content-group>.
   No bundler — plain browser JS. Guarded so it is a no-op during prerender
   (Playwright snapshot has no ym/gtag and this script is injected post-snapshot). */
(function () {
  if (typeof window === "undefined" || !window.document) return;
  if (window.__gfScrollBound) return; // survive a React re-mount on the same doc
  window.__gfScrollBound = true;

  var YM = 109832554;
  var marks = [25, 50, 75, 100];
  var fired = {};
  var cg =
    (document.body && document.body.dataset && document.body.dataset.contentGroup) || "";

  // tell GA4 the content group (article vs guide) for events on this page
  try {
    if (typeof window.gtag === "function" && cg) window.gtag("set", { content_group: cg });
  } catch (e) {}

  function pct() {
    var d = document.documentElement;
    var b = document.body || {};
    var top = window.pageYOffset || d.scrollTop || b.scrollTop || 0;
    var docH = Math.max(d.scrollHeight, b.scrollHeight || 0, d.offsetHeight, b.offsetHeight || 0);
    var winH = window.innerHeight || d.clientHeight || 0;
    // read DEPTH = how far down the page the BOTTOM of the viewport has reached
    // (GA4-style, not scrollbar progress). Short page (docH<=winH) → 100%.
    if (docH <= winH) return 100;
    return Math.min(100, Math.round(((top + winH) / docH) * 100));
  }

  function check() {
    var p = pct();
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (p >= m && !fired[m]) {
        fired[m] = true;
        try {
          if (typeof window.ym === "function") {
            window.ym(YM, "reachGoal", "scroll_" + m);
            if (m === 75) window.ym(YM, "notBounce");
          }
        } catch (e) {}
        try {
          if (typeof window.gtag === "function") {
            window.gtag("event", "scroll_depth", {
              percent_scrolled: m,
              page_path: location.pathname,
              content_group: cg || undefined,
            });
          }
        } catch (e) {}
      }
    }
  }

  var t = null;
  function onScroll() {
    if (t) return;
    t = setTimeout(function () {
      t = null;
      check();
    }, 150);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  // initial pass: short pages may already be at 100% on load
  if (document.readyState === "interactive" || document.readyState === "complete") check();
  else document.addEventListener("DOMContentLoaded", check);
})();
