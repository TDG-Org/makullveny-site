// Centers the target section in the viewport when an in-page anchor link
// (navbar tabs, the brand logo, hero CTA, etc.) is clicked, instead of
// relying on the browser's default top-alignment anchor scroll.
(function () {
  "use strict";

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  document.addEventListener("click", function (event) {
    // Let modifier/middle clicks do their normal thing (open in a new tab or
    // window) instead of hijacking them into an in-page scroll.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    var link = event.target.closest ? event.target.closest("a[href^='#']") : null;
    if (!link || link.getAttribute("target") === "_blank") {
      return;
    }

    var href = link.getAttribute("href") || "";
    if (href.length < 2) {
      // Bare "#" links have no section to center on; leave default behavior.
      return;
    }

    var target = document.getElementById(href.slice(1));
    if (!target) {
      // No matching section on this page; let the browser handle it normally.
      return;
    }

    event.preventDefault();

    var behavior = prefersReducedMotion() ? "auto" : "smooth";

    if (target.id === "top") {
      // "#top" wraps the whole page (<main id="top">), so centering it would
      // scroll to the vertical midpoint of the entire document. Go to the
      // very top instead, which is what a "home" link should do.
      window.scrollTo({ top: 0, behavior: behavior });
    } else {
      target.scrollIntoView({ behavior: behavior, block: "center", inline: "nearest" });
    }

    if (window.history && window.history.pushState) {
      // Keep the URL bookmarkable without triggering the browser's own
      // (top-aligned) hash-jump, which would fight our centered scroll.
      window.history.pushState(null, "", href);
    }
  });
})();
