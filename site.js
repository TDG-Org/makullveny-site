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
        // marks the slide the lightbox should open: the stacked slides all
        // receive the click regardless of which one is showing.
        if (k === i) el.setAttribute("data-current", "");
        else el.removeAttribute("data-current");
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
    // The markup ships the <img> with `hidden` on it so a script-less page never
    // flashes a broken-image icon. Once we take over, the box's own `hidden` is
    // what shows and hides the overlay -- so the image must be un-hidden when we
    // open, or the ground shades in over a picture that is still display:none.
    function close() {
      box.hidden = true;
      shot.hidden = true;
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
      // The rotator stacks all five slides on top of each other and only moves
      // opacity, so a click always lands on the last one in the DOM regardless
      // of which is showing. Redirect to the slide the rotator marked current.
      var rotator = img.closest(".rotator");
      if (rotator) {
        img = rotator.querySelector(".rot[data-current]") || img;
      }
      e.preventDefault();
      shot.src = img.currentSrc || img.src;
      shot.alt = img.alt || "";
      shot.hidden = false;
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

  // ── the phone menu ─────────────────────────────────────────────────────────
  // A menu button toggles `.nav-open` on .topbar; the CSS turns the nav from a
  // horizontal row into a drawer under the bar only below its own breakpoint.
  // This has to work with no regard for reduced motion -- it is how a phone
  // reaches the rest of the page, not decoration -- so it runs unconditionally.
  (function () {
    var bar = document.querySelector(".topbar");
    var toggle = bar && bar.querySelector(".nav-toggle");
    var nav = bar && bar.querySelector("nav");
    if (!bar || !toggle || !nav) return;
    function setOpen(open) {
      bar.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    toggle.addEventListener("click", function () {
      setOpen(!bar.classList.contains("nav-open"));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    document.addEventListener("click", function (e) {
      if (bar.classList.contains("nav-open") && !bar.contains(e.target)) setOpen(false);
    });
    // A drawer left open while resizing past the breakpoint would otherwise
    // stay stuck open (or invisibly "open") once the CSS drops the drawer rules.
    window.addEventListener("resize", function () {
      if (window.innerWidth > 820) setOpen(false);
    });
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

  // ── the real version number, wherever a page prints it ────────────────────
  // Replaces the hand-typed number that used to sit in the News masthead and
  // the two footers. Reads the same array the feed does, so the version on the
  // page can never disagree with the release list right next to it.
  (function () {
    var vEls = document.querySelectorAll("[data-latest-version]");
    var dEls = document.querySelectorAll("[data-latest-date]");
    if (!vEls.length && !dEls.length) return;
    var all = window.MAKULLVENY_UPDATES;
    if (!Array.isArray(all) || !all.length || !all[0]) return;
    var latest = all[0];
    if (latest.version) {
      [].forEach.call(vEls, function (el) { el.textContent = latest.version; });
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(latest.date || ""));
    if (m) {
      var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var pretty = Number(m[3]) + " " + MON[Number(m[2]) - 1] + " " + m[1];
      [].forEach.call(dEls, function (el) { el.textContent = pretty; });
    }
  })();

  // ── the theme pickers: bring the newly-picked preview into view ───────────
  // Both the front page's rail/stage browser and the Themes page's swatch rail
  // are a checked-radio + CSS-sibling trick, so picking one never fires a JS
  // event of its own the layout could react to. Phone only: on anything wider
  // the rail and its preview are already both on screen. 820px is the same
  // line the rest of the site draws "phone" at (it's the hamburger-menu
  // breakpoint), so this can't fire on a tablet or a narrower laptop window.
  (function () {
    var PHONE_MAX_WIDTH = 820;
    var groups = [
      { radios: "input[name='theme']", stage: ".stagewrap" },
      { radios: "input[name='coll']", stage: ".coll-stage" }
    ];
    groups.forEach(function (g) {
      var radios = [].slice.call(document.querySelectorAll(g.radios));
      var stage = document.querySelector(g.stage);
      if (!radios.length || !stage) return;
      radios.forEach(function (radio) {
        radio.addEventListener("change", function () {
          if (!radio.checked) return;
          if (window.innerWidth > PHONE_MAX_WIDTH) return;
          stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        });
      });
    });
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
