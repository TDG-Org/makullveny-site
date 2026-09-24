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
//   7. the home mark: the cross that turns into a sword and says Jesus Loves You
//
// Nothing here is required to READ the page: with this file blocked every
// picture, every word and every link still works, the reveals simply play on
// load, and the bar keeps its ground.

(function () {
  "use strict";

  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = !window.matchMedia || window.matchMedia("(hover: hover)").matches;

  // Search and social metadata use the first line in the HTML. One line is
  // chosen at load, then left alone while somebody reads the page.
  (function () {
    var headline = document.querySelector("[data-hero-headline]");
    if (!headline) return;
    var lines = [
      "Study smarter. <em>Stress less.</em>",
      "Plan clearly. <em>Study calmly.</em>",
      "Turn academic chaos <em>into clarity.</em>",
      "Organize your academia, <em>simplify your life.</em>",
      "Your cozy space for <em>getting things done.</em>",
      "Plan. Focus. <em>Thrive.</em>"
    ];
    headline.innerHTML = lines[Math.floor(Math.random() * lines.length)];
  })();

  // ── 1. the rotator ────────────────────────────────────────────────────────
  // Every slide, caption, dot and window title shares ONE index, so the picture
  // and the words about it can never disagree. Add a slide in design/Main.dc.html
  // and you must add a title here AND in build-site.mjs, or the new picture
  // borrows an older one's name. Six seconds, and a dot takes over when pressed.
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
      "Library Desk — Blueprint",
      "Study Hall — Overview",
      "Study Hall — Courses",
      "Study Hall — Calendar"
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
    // 980 is where the CSS swaps the drawer back for the horizontal row.
    window.addEventListener("resize", function () {
      if (window.innerWidth > 980) setOpen(false);
    });
  })();

  // ── 7. the home mark ──────────────────────────────────────────────────────
  // Press the Home button and the cross at the end of the brand turns into a
  // sword and a sparkle writes "Jesus Loves You" — the TDG site's own
  // flourish, the same one, so pressing Home here and there cannot be told
  // apart. Its look and its clock are bless.css, copied byte for byte from
  // TDG-Site's src/components/Nav.css; this is the part that plays Nav.tsx,
  // written again for a page with no React. The reasons behind each step are
  // in Nav.tsx on the TDG side, and they hold here unchanged:
  //
  //   - THE SWORD NOW, THE WORDS A BEAT LATER. The press mounts only the
  //     sword (a dozen pieces), the words 150ms later and the glitter at
  //     320ms, so the press itself is cheap and the heavy mounts land while
  //     the sword is already turning on the compositor.
  //   - ONE CLOCK. Everything is started on the sword's own start time
  //     (`joinClock`), so a late mount lands in step, never behind.
  //   - ALL READS, THEN ALL WRITES, and each letter's timing is measured once
  //     and kept, so later presses mount with their timing already on.
  //   - THE ROOM IS MEASURED. Beside the link row the row dims for the words
  //     if they would have to shrink below reading size; beside the menu
  //     button the words shrink instead, because that is a control.
  //
  // The subpages link home with a whole page load, which would cut a
  // flourish off after a frame. So there the press only leaves a note for the
  // front page, and the flourish plays when home arrives: the button does the
  // same thing from every page — takes you home and says it there.
  (function () {
    var brand = document.querySelector(".topbar .brand");
    var wrap = brand && brand.querySelector(".nav__markwrap");
    var mark = wrap && wrap.querySelector(".nav__mark");
    var body = mark && mark.querySelector(".nav__mark-body");
    if (!wrap || !mark || !body) return;
    var bar = document.querySelector(".topbar");
    var FLAG = "mk-bless-arrive";
    var plain = function (e) {
      return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    };

    if (brand.getAttribute("href") !== "#top") {
      // A subpage. The note carries a time, so a navigation that never
      // happened cannot surprise somebody who wanders home an hour later.
      brand.addEventListener("click", function (e) {
        if (!plain(e)) return;
        try {
          sessionStorage.setItem(FLAG, String(Date.now()));
        } catch (err) {
          /* storage off: home simply arrives without the flourish */
        }
      });
      return;
    }

    var BLESSING = ["Jesus", "Loves", "You"];
    // Nav.tsx's numbers, which bless.css's clock is written against.
    var BLESS_MS = 5400 + 250;
    var WORDS_LATE_MS = 150;
    var GLITTER_LATE_MS = 320;
    var BLESS_SIZE = 17;
    var MIN_BESIDE_LINKS = 13;
    var MIN_BESIDE_ACTIONS = 10;
    // The same eighteen stars, by the same recipe, as TDG's SPARKS.
    var rand = function (i, salt) {
      var v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    var SPARKS = [];
    for (var i = 0; i < 18; i++) {
      SPARKS.push({
        x: Math.min(0.99, Math.max(0.01, (i + 0.2 + rand(i, 1) * 0.6) / 18)),
        y: (rand(i, 2) < 0.5 ? -1 : 1) * (0.5 + rand(i, 3) * 0.32),
        s: 0.24 + rand(i, 4) * 0.36,
        h: rand(i, 5)
      });
    }

    var timing = {};
    var presses = 0;
    var pressedAt = 0;
    var timers = [];
    var strip = null;
    var mounted = [];

    var el = function (cls, parent, tag) {
      var n = document.createElement(tag || "span");
      if (cls) n.className = cls;
      if (parent) parent.appendChild(n);
      return n;
    };
    var hidden = function (n) {
      n.setAttribute("aria-hidden", "true");
      return n;
    };

    // A centre across in the line's coordinates, up the offset chain.
    var lineCentre = function (line, n) {
      var x = n.offsetWidth / 2;
      for (var m = n; m && m !== line; m = m.offsetParent) x += m.offsetLeft;
      return x;
    };
    // When the sparkle crosses each of `els`, as the fraction of its
    // ease-in-out-sine run CSS reads as --t. Reads only.
    var sparkleTimes = function (s, els) {
      var line = s.querySelector(".nav__bless-line");
      var text = s.querySelector(".nav__bless-text");
      var head = s.querySelector(".nav__bless-head");
      if (!line || !text || !head) return [];
      var span = text.offsetWidth;
      var lead = span - lineCentre(line, head);
      return els.map(function (n) {
        var f = Math.min(1, Math.max(0, (lineCentre(line, n) + lead) / span));
        return (Math.acos(1 - 2 * f) / Math.PI).toFixed(4);
      });
    };
    var joinClock = function (part) {
      if (!part.getAnimations) return;
      var turn = mark.getAnimations()[0];
      var start = turn && turn.startTime != null ? turn.startTime : pressedAt;
      part.getAnimations({ subtree: true }).forEach(function (a) {
        a.startTime = start;
      });
    };
    var keep = function (key, times) {
      if (times.length && (!document.fonts || document.fonts.status === "loaded")) timing[key] = times;
    };

    function mountSword() {
      mounted.push(hidden(el("nav__sword-glow", null)));
      el("nav__sword-glow-light", mounted[0]);
      mounted.push(hidden(el("nav__sword-flash")));
      mounted.push(hidden(el("nav__sword-flash nav__sword-flash--home")));
      mounted.forEach(function (n) {
        wrap.insertBefore(n, mark);
      });
      var cross = hidden(el("nav__mark-cross", body));
      el("nav__mark-bar", cross, "i");
      el("nav__mark-bar", cross, "i");
      var sword = hidden(el("nav__sword", body));
      var sb = el("nav__sword-body", sword);
      var blade = el("nav__sword-blade", el("nav__sword-draw", el("nav__sword-well", sb)));
      el("nav__sword-shine", blade);
      el("nav__sword-shine nav__sword-shine--hold", blade);
      el("nav__sword-grip", sb);
      el("nav__sword-pommel", sb);
      el("nav__sword-guard", sb);
      el("nav__sword-pearl", sb);
      mounted.push(cross, sword);
      mounted.push(hidden(el("nav__glint", wrap)));
      mounted.push(hidden(el("nav__glint nav__glint--home", wrap)));
    }

    function mountWords() {
      var s = hidden(el("nav__bless"));
      el("nav__bless-aura-light", el("nav__bless-aura", s));
      var line = el("nav__bless-line", s);
      var text = el("nav__bless-text", el("nav__bless-hold", el("nav__bless-window-home", el("nav__bless-window", line))));
      var k = 0;
      BLESSING.forEach(function (word) {
        var w = el("nav__bless-word", text);
        word.split("").forEach(function (ch) {
          var letter = el("nav__bless-letter", w);
          letter.setAttribute("data-ch", ch);
          letter.style.setProperty("--k", String(k));
          if (timing.letters) letter.style.setProperty("--t", timing.letters[k]);
          var glyph = el("nav__bless-glyph", letter);
          glyph.setAttribute("data-ch", ch);
          glyph.textContent = ch;
          k++;
        });
      });
      ["write", "home"].forEach(function (leg) {
        var head = el("nav__bless-head", el("nav__bless-runner nav__bless-runner--" + leg, line));
        el("nav__bless-tail", head);
        el("nav__bless-core", head);
        el("nav__bless-star", head);
      });
      wrap.appendChild(s);
      strip = s;

      // ALL READS, THEN ALL WRITES; the size reset and the clock are the only
      // writes the reads may follow.
      wrap.style.removeProperty("--bless-size");
      joinClock(s);
      var letters = [].slice.call(s.querySelectorAll(".nav__bless-letter"));
      var times = timing.letters ? [] : sparkleTimes(s, letters);

      var nav = bar && bar.querySelector("#siteNav");
      var toggle = bar && bar.querySelector(".nav-toggle");
      var drawer = toggle && getComputedStyle(toggle).display !== "none";
      var beside = drawer ? toggle : nav;
      var quiet = false;
      var size = "";
      if (beside) {
        var box = wrap.getBoundingClientRect();
        var point = box.left + box.width / 2 + box.height / 2;
        var last = letters[letters.length - 1];
        var wants = line.getBoundingClientRect().left + lineCentre(line, last) + last.offsetWidth / 2 - point;
        var room = beside.getBoundingClientRect().left - point - 20;
        if (room < wants) {
          var fit = (room / wants) * BLESS_SIZE;
          if (!drawer && fit < MIN_BESIDE_LINKS) quiet = true;
          else size = Math.max(fit, MIN_BESIDE_ACTIONS).toFixed(1) + "px";
        }
      }

      letters.forEach(function (n, j) {
        if (times[j]) n.style.setProperty("--t", times[j]);
      });
      keep("letters", times);
      if (size) wrap.style.setProperty("--bless-size", size);
      if (bar) bar.toggleAttribute("data-bless-quiet", quiet);
    }

    function mountGlitter() {
      if (!strip) return;
      var line = strip.querySelector(".nav__bless-line");
      var g = el("nav__bless-sparks");
      SPARKS.forEach(function (p, j) {
        var sp = el("nav__bless-spark", g);
        sp.style.setProperty("--x", String(p.x));
        sp.style.setProperty("--y", String(p.y));
        sp.style.setProperty("--s", String(p.s));
        sp.style.setProperty("--h", String(p.h));
        if (timing.sparks) sp.style.setProperty("--t", timing.sparks[j]);
        el("nav__bless-twinkle nav__bless-twinkle--write", sp);
        el("nav__bless-twinkle nav__bless-twinkle--hold", sp);
        el("nav__bless-twinkle nav__bless-twinkle--home", sp);
      });
      line.insertBefore(g, line.querySelector(".nav__bless-runner"));
      joinClock(g);
      if (timing.sparks) return;
      var each = [].slice.call(g.querySelectorAll(".nav__bless-spark"));
      var times = sparkleTimes(strip, each);
      each.forEach(function (n, j) {
        if (times[j]) n.style.setProperty("--t", times[j]);
      });
      keep("sparks", times);
    }

    function clear() {
      timers.forEach(clearTimeout);
      timers = [];
      if (strip) strip.remove();
      strip = null;
    }

    function end() {
      clear();
      mounted.forEach(function (n) {
        n.remove();
      });
      mounted = [];
      wrap.removeAttribute("data-bless");
      wrap.style.removeProperty("--bless-size");
      if (bar) bar.removeAttribute("data-bless-quiet");
    }

    // Say it. A second press restarts the whole flourish rather than
    // queueing another: the sword is rewound, the words mounted fresh.
    function say() {
      clear();
      pressedAt = performance.now();
      var n = ++presses;
      if (!wrap.hasAttribute("data-bless")) {
        mountSword();
        wrap.setAttribute("data-bless", "");
      }
      if (wrap.getAnimations) {
        wrap.getAnimations({ subtree: true }).forEach(function (a) {
          a.currentTime = 0;
        });
      }
      timers.push(
        setTimeout(function () {
          if (n === presses) mountWords();
        }, WORDS_LATE_MS),
        setTimeout(function () {
          if (n === presses) mountGlitter();
        }, GLITTER_LATE_MS),
        setTimeout(function () {
          if (n === presses) end();
        }, BLESS_MS)
      );
    }

    // The link still does its own job — back to the top — and says it too.
    // Keyboard Enter on a link arrives as a click, so it is covered.
    brand.addEventListener("click", function (e) {
      if (plain(e)) say();
    });

    // Arrived from a subpage's Home button: say it here, once the page and
    // the words' own face have loaded, so the letters are measured in
    // Cormorant rather than its fallback.
    var note = null;
    try {
      note = sessionStorage.getItem(FLAG);
      sessionStorage.removeItem(FLAG);
    } catch (err) {
      /* storage off: nothing to read */
    }
    if (note && Date.now() - Number(note) < 15000) {
      var go = function () {
        var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
        var late = new Promise(function (r) {
          setTimeout(r, 1500);
        });
        Promise.race([fonts, late]).then(say);
      };
      if (document.readyState === "complete") go();
      else window.addEventListener("load", go, { once: true });
    }
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
  // event of its own the layout could react to. The scroll is restricted to the
  // phone layout, so a desktop or tablet choice never moves the reader.
  (function () {
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
          if (!window.matchMedia("(max-width: 600px)").matches) return;
          stage.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        });
      });
    });
  })();

  // ── 6. pressing Download carries the reader on to the next stop ───────────
  // The app is not code-signed, so a download nobody reads about is a download
  // that never opens. That used to be handled by lighting up a panel somewhere
  // below the button; the trail puts the instructions directly under it now, so
  // the only thing left worth doing is moving the reader on. The moment they
  // press Download, the useful thing to look at is stop two -- not the button
  // they have already used.
  //
  // The delay is deliberate: the browser starts its own download UI on that
  // click, and scrolling the page out from under somebody in the same frame
  // reads as a glitch rather than a hand-off.
  // ── the one-line macOS alternative, copied in one press ──────────────────
  // The command is real text in the page, so it can always be selected and
  // copied by hand; this only saves the selecting. The button says what
  // happened rather than trusting the reader to notice their clipboard
  // changed, and says it for two seconds, which is long enough to read and
  // short enough not to look stuck.
  (function () {
    var buttons = document.querySelectorAll("[data-dl-copy]");
    if (!buttons.length || !navigator.clipboard) return;
    buttons.forEach(function (button) {
      var source = document.getElementById(button.getAttribute("data-dl-copy"));
      if (!source) return;
      var label = button.textContent;
      var settle;
      button.addEventListener("click", function () {
        navigator.clipboard.writeText(source.textContent.trim()).then(
          function () {
            button.textContent = "Copied";
            button.classList.add("is-copied");
            clearTimeout(settle);
            settle = setTimeout(function () {
              button.textContent = label;
              button.classList.remove("is-copied");
            }, 2000);
          },
          function () {
            // Clipboard refused (an insecure origin, or the reader said no).
            // Selecting the line is the fallback, so offer exactly that.
            button.textContent = "Select it";
            var range = document.createRange();
            range.selectNodeContents(source);
            var selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
        );
      });
    });
  })();

  (function () {
    var trail = document.querySelector(".dl-trail");
    if (!trail) return;
    document.addEventListener("click", function (e) {
      var hit = e.target.closest && e.target.closest("[data-dl-get]");
      if (!hit) return;
      var here = hit.closest(".dl-stop");
      var next = here && here.nextElementSibling;
      if (!next) return;
      setTimeout(function () {
        next.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }, 220);
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
