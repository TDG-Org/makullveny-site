// Everything on this site that moves.
//
// The pages were designed on a canvas where a DCLogic class held this
// behaviour and re-rendered from state. A plain browser has no such thing, so
// the same six jobs are done here directly, against the markup
// tools/build-site.mjs emits. One file, one listener per job, and every one of
// them a no-op on a page that does not contain its markup -- so the same
// script is safe on all three pages.
//
//   1. the hero rotator, and the caption that changes with it
//   2. the lightbox over any screenshot
//   3. the parallax bands, and the lamplight that follows the pointer
//   4. the reveals, which wait until you have scrolled to them
//   5. the top bar's ground, which fades in once the page moves
//   6. the download controls, which light the first-launch panel
//
// Nothing here is required to READ the page: with this file blocked every
// picture, every word and every link still works, the reveals simply play on
// load, and the bar keeps its ground.

(function () {
  "use strict";

  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = !window.matchMedia || window.matchMedia("(hover: hover)").matches;

  // ── 1. the rotator ────────────────────────────────────────────────────────
  // Five slides and five captions share one index, so the picture and the words
  // about it can never disagree. Six seconds, and a dot takes over when pressed.
  (function () {
    var stage = document.querySelector(".rotator");
    if (!stage) return;
    var slides = [].slice.call(stage.querySelectorAll(".rot"));
    var caps = [].slice.call(document.querySelectorAll(".rc"));
    var dots = [].slice.call(document.querySelectorAll(".rot-dot"));
    var title = document.querySelector(".win-title");
    var TITLES = [
      "Makullveny — Today",
      "Makullveny — Library Desk",
      "Selah: Study Grounds · golden hour",
      "Selah: Study Grounds · night",
      "Library Desk — Blueprint"
    ];
    var i = 0;
    var timer;

    function show(n) {
      i = ((n % slides.length) + slides.length) % slides.length;
      slides.forEach(function (el, k) {
        el.style.opacity = k === i ? "1" : "0";
      });
      caps.forEach(function (el, k) {
        el.style.opacity = k === i ? "1" : "0";
      });
      dots.forEach(function (el, k) {
        el.setAttribute("data-on", k === i ? "true" : "false");
      });
      if (title) title.textContent = TITLES[i] || "";
    }
    function start() {
      clearInterval(timer);
      timer = setInterval(function () {
        show(i + 1);
      }, 6000);
    }
    dots.forEach(function (el, k) {
      el.addEventListener("click", function () {
        show(k);
        start();
      });
    });
    show(0);
    if (!reduce) start();
  })();

  // ── 2. the lightbox ───────────────────────────────────────────────────────
  // Every screenshot on the site opens full size on a shaded ground. One
  // delegated listener rather than a handler per image, so it also covers the
  // theme panels that are swapped in and out.
  (function () {
    var box = document.querySelector(".lightbox");
    if (!box) return;
    var shot = box.querySelector("img");
    function close() {
      box.hidden = true;
      shot.removeAttribute("src");
    }
    close();
    document.addEventListener("click", function (e) {
      if (box.contains(e.target)) {
        close();
        return;
      }
      var img =
        e.target.closest && e.target.closest(".win img, .ill img, .room img, .peek img");
      if (!img) return;
      e.preventDefault();
      shot.src = img.currentSrc || img.src;
      shot.alt = img.alt || "";
      box.hidden = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  })();

  // ── 5. the top bar ────────────────────────────────────────────────────────
  // Its ground is legibility, not decoration, so this runs whatever the motion
  // setting is. At the very top of the page there is nothing behind the links;
  // the moment it moves, a brown fade comes in under them.
  (function () {
    var bar = document.querySelector(".topbar");
    if (!bar) return;
    function stick() {
      bar.classList.toggle("is-stuck", window.scrollY > 8);
    }
    window.addEventListener("scroll", stick, { passive: true });
    stick();
  })();

  // ── the three most recent releases ────────────────────────────────────────
  // The front page used to carry three hand-written release cards, which went
  // stale the moment anything shipped. Both this and updates/ now read the one
  // array a release actually touches -- window.MAKULLVENY_UPDATES, out of
  // updates/updates-data.js. Rendered here rather than in the archive's own
  // updates.js because the two pages draw a release very differently: a row
  // here, a full entry there.
  //
  // Runs BEFORE the reveals below, so the cards it makes are observed with
  // everything else and slide in the same way.
  (function () {
    var feed = document.getElementById("feed");
    if (!feed) return;
    var all = window.MAKULLVENY_UPDATES;
    if (!Array.isArray(all) || !all.length) {
      // the data file is missing or empty; say so once, quietly
      feed.innerHTML =
        '<p class="feed-wait">The release list could not be read. ' +
        '<a href="./updates/">Open the archive</a>.</p>';
      return;
    }
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                  "August", "September", "October", "November", "December"];
    function when(date) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
      if (!m) return String(date || "");
      return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
    }
    function esc(t) {
      var d = document.createElement("div");
      d.textContent = String(t == null ? "" : t);
      return d.innerHTML;
    }
    feed.innerHTML = all
      .slice(0, 3)
      .map(function (entry, i) {
        var lines = Array.isArray(entry.highlights) ? entry.highlights : [];
        return (
          '<div class="entry rv" style="--d:.' + (6 + i * 8) + 's">' +
          '<div class="entry-meta"><b>' + esc(entry.version) + "</b><span>" +
          esc(when(entry.date)) + "</span></div><div>" +
          lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") +
          "</div></div>"
        );
      })
      .join("");
  })();

  // ── how many releases the archive is showing ──────────────────────────────
  // The count used to be typed into the page and was wrong the moment an entry
  // was added. It comes off the same array updates.js renders.
  (function () {
    var out = document.getElementById("updatesCount");
    if (!out) return;
    var all = window.MAKULLVENY_UPDATES;
    var n = Array.isArray(all) ? all.length : 0;
    out.textContent = n
      ? n + (n === 1 ? " release" : " releases") + " shown · newest first"
      : "newest first";
  })();

  // ── 6. pressing Download lights the panel that says how to open it ────────
  // The app is not code-signed, so a download nobody reads about is a download
  // that never opens. Any download control lights the first-launch panel and
  // brings it into view; the class comes off on its own, so a second press
  // plays it again.
  (function () {
    var panel = document.querySelector(".dl-open");
    if (!panel) return;
    var gate;
    document.addEventListener("click", function (e) {
      var hit =
        e.target.closest &&
        e.target.closest(
          "a[href*='#download'], .dl-primary a, .dl, a[href*='makullveny-releases'], #download-panel a[download], #download-panel .button"
        );
      if (!hit) return;
      panel.classList.remove("is-called");
      void panel.offsetWidth;
      panel.classList.add("is-called");
      clearTimeout(gate);
      gate = setTimeout(function () {
        panel.classList.remove("is-called");
      }, 8000);
      panel.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });
  })();

  if (reduce) return;

  // ── 3. the parallax, and the light that follows the pointer ───────────────
  // One rAF-throttled handler per job writing a single custom property; every
  // transform is CSS, so nothing here touches layout.
  (function () {
    var bands = document.querySelectorAll(".band");
    var hero = document.querySelector(".hero");
    if (!bands.length && !hero) return;

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var h = window.innerHeight || 800;
        [].forEach.call(bands, function (band) {
          var r = band.getBoundingClientRect();
          band.style.setProperty(
            "--p",
            ((1 - (r.top + r.height / 2) / h) * 90).toFixed(1) + "px"
          );
        });
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    if (!hero) return;
    var pending = null;
    var raf = 0;
    window.addEventListener(
      "pointermove",
      function (e) {
        pending = e;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var r = hero.getBoundingClientRect();
          if (r.bottom < 0 || r.top > (window.innerHeight || 800)) return;
          var x = (pending.clientX - r.left) / (r.width || 1);
          var y = (pending.clientY - r.top) / (r.height || 1);
          hero.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
          hero.style.setProperty("--my", (y * 100).toFixed(1) + "%");
          hero.style.setProperty("--mxr", (x - 0.5).toFixed(3));
          hero.style.setProperty("--myr", (y - 0.5).toFixed(3));
        });
      },
      { passive: true }
    );
  })();

  // ── 4. the reveals ────────────────────────────────────────────────────────
  // The class on <html> is what switches the CSS from "animate on load" to
  // "animate when seen" -- so a browser with no script here shows every card
  // rather than a page of blanks.
  (function () {
    var all = document.querySelectorAll(".rv");
    if (!all.length) return;
    document.documentElement.classList.add("rv-on");
    var seen = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          seen.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );
    [].forEach.call(all, function (el) {
      // anything already on screen plays now, not on a scroll nobody makes
      if (el.getBoundingClientRect().top < (window.innerHeight || 800)) {
        el.classList.add("is-in");
      } else {
        seen.observe(el);
      }
    });
  })();

  // ── the tilt ──────────────────────────────────────────────────────────────
  // TDG's own card language, and its numbers: src/hooks/useTilt.ts on the TDG
  // site tilts 3.2 degrees through 1100px of perspective with an 8px lift, and
  // feeds a cursor-tracked spotlight and lit rim from --mx/--my. A tap has no
  // cursor to tilt toward, so touch is left flat.
  if (!canHover) return;
  [].forEach.call(document.querySelectorAll("[data-tilt]"), function (el) {
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var px = ((e.clientX - r.left) / r.width) * 2 - 1;
      var py = ((e.clientY - r.top) / r.height) * 2 - 1;
      el.style.transform =
        "perspective(1100px) rotateY(" +
        (px * 3.2).toFixed(2) +
        "deg) rotateX(" +
        (-py * 3.2).toFixed(2) +
        "deg) translateY(-8px)";
      el.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
    });
    el.addEventListener("pointerenter", function () {
      el.setAttribute("data-lit", "true");
    });
    el.addEventListener("pointerleave", function () {
      el.removeAttribute("data-lit");
      el.style.transform = "perspective(1100px) rotateY(0deg) rotateX(0deg) translateY(0)";
    });
  });
})();
