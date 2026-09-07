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

// A little depth goes a long way here: these movements are deliberately tiny,
// and all motion is disabled for visitors who prefer reduced motion.
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  var hero = document.querySelector(".hero");
  var lake = document.querySelector(".parallax-art");
  var ticking = false;

  function updateParallax() {
    ticking = false;

    if (hero) {
      var heroProgress = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / hero.offsetHeight));
      hero.style.setProperty("--tree-left-shift", (heroProgress * -18) + "px");
      hero.style.setProperty("--tree-right-shift", (heroProgress * 22) + "px");
      hero.style.setProperty("--hill-shift", (heroProgress * -10) + "px");
      hero.style.setProperty("--hero-glow-shift", (heroProgress * 16) + "px");
      hero.style.setProperty("--hero-ground-shift", (heroProgress * 22) + "px");
      hero.style.setProperty("--mist-far-shift", (heroProgress * 28) + "px");
      hero.style.setProperty("--mist-near-shift", (heroProgress * -42) + "px");
    }

    if (lake) {
      var rect = lake.getBoundingClientRect();
      var distance = (window.innerHeight * 0.5 - (rect.top + rect.height * 0.5)) * 0.035;
      lake.style.setProperty("--art-shift", Math.max(-14, Math.min(14, distance)) + "px");
      lake.style.setProperty("--water-shift", Math.max(-9, Math.min(9, distance * -0.5)) + "px");
    }
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateParallax);
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  requestUpdate();

  var reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    reveals.forEach(function (element) { element.classList.add("is-visible"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach(function (element) { observer.observe(element); });
})();
