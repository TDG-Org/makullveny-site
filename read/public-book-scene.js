/* ===========================================================================
   THE PUBLIC BOOK SCENE -- ONE MODULE, TWO REPOSITORIES.
   ===========================================================================

   A published book, drawn as an object on a desk: the camera looking down, a
   candle burning on the right, a quill lying below the book, and pages that
   turn by rotating about the spine.

   This file and src/styles/modules/public-book-scene.css are copied BYTE FOR
   BYTE into the public site repository as read/public-book-scene.js and
   read/public-book-scene.css. tests/publicSceneParity.test.js fails when the
   two copies drift.

   ---------------------------------------------------------------------------
   WHY ONE FILE RATHER THAN TWO IMPLEMENTATIONS THAT AGREE
   ---------------------------------------------------------------------------
   The owner's requirement is that the preview inside the app and the page a
   stranger opens are THE SAME PICTURE. src/coverColorContract.js solves the
   same class of problem for one colour, and it needs a shared formula, a
   shared fixture and a test in both directions -- because a colour is a small
   thing two implementations can plausibly be asked to agree on.

   A whole scene is not. Two hand-written copies of a 3D book would diverge on
   their first bug fix, and the divergence would be invisible until somebody
   put the two windows side by side. So there is ONE file, copied, and a test
   that the copy is exact. "Identical by construction" is the only version of
   this promise worth making.

   ---------------------------------------------------------------------------
   WHAT THIS FILE MAY NOT DO, BECAUSE HALF OF ITS HOMES ARE A PUBLIC PAGE
   ---------------------------------------------------------------------------
   * NO innerHTML for anything that came from a snapshot. Page bodies go
     through the INJECTED `sanitizeInto`, which is each repository's own
     independent sanitizer -- the app's DOMPurify policy here, read.js's
     allowlist walk there. With no sanitizer injected it falls back to plain
     text, never to markup. Fail closed, always.
   * NO network of its own. The report transport is injected too, and an
     absent transport means the control explains itself rather than lying.
   * NO app tokens, NO theme lookup, NO require(). The site has none of those.
   * NO dependency of any kind. Plain ES5-compatible JavaScript, because the
     public site has no build step at all.

   ---------------------------------------------------------------------------
   THE COORDINATE SYSTEM, ONCE, SO NOTHING BELOW HAS TO RE-EXPLAIN IT
   ---------------------------------------------------------------------------
   .pbs-camera holds translate() and scale() -- SCREEN space.
   .pbs-world  holds rotateX(pitch) and rotateZ(yaw) -- MODEL space.

   Inside .pbs-world the DESK IS THE XY PLANE and +Z IS UP. Lying on the desk
   needs no transform; standing on it is rotateX(-90deg); hovering above it is
   translateZ(). The stylesheet's header says the same thing, deliberately:
   whichever of the two files somebody opens first, the model is there.
   =========================================================================== */
(function () {
  "use strict";

  var VERSION = 1;

  /* ── The camera's limits ──────────────────────────────────────────────────
     PITCH_DEFAULT is 56 rather than 90 on purpose. A true 90-degree overhead
     shot is the one angle at which a book stops looking like an object: no
     thickness is visible, the candle is a disc, and the whole scene reads as a
     flat illustration of itself. 56 is looking down at a desk; 90 is a
     photocopy. The reader can still go to 82 if they want it flatter. */
  var PITCH_DEFAULT = 56, PITCH_MIN = 14, PITCH_MAX = 84;
  /* ── AND THE ANGLE AN OPEN BOOK IS READ FROM ────────────────────────────
     A CLOSED book wants 56: it has boards, a spine and thickness there, and it
     reads as an object somebody left on a desk. An OPEN book wants none of
     that. It wants to be READ, and every degree short of overhead is a degree
     of foreshortening between a reader and a line of text -- plus a keystone
     that makes the near page bigger than the far one, so a spread stops being
     two matching halves.

     So the camera flies overhead as the book opens and flies back as it
     closes. PITCH_READING is the top of the camera's own range rather than a
     literal 90: the last six degrees are worth 0.5% of page height (cos 6° is
     .995) and are invisible in text, while at exactly 90 the page block has no
     thickness, the candle is a disc, and the scene reads as a flat drawing of
     itself. This is as far up as a reader can drag it by hand, too, so the
     button and the drag agree about where "all the way" is. */
  var PITCH_READING = PITCH_MAX;
  /* Long enough to read as a camera MOVING, short enough that a reader who
     just pressed Open is not waiting to read. Sits just under the page turn
     (FLIP_MS) so opening never feels slower than turning. */
  var PITCH_FLIGHT_MS = 620;
  var YAW_DEFAULT = 0, YAW_MIN = -34, YAW_MAX = 34;
  var ZOOM_MIN = 0.3, ZOOM_MAX = 3.4, ZOOM_STEP = 1.18;

  /* The page turn. 720ms is slower than a UI transition and faster than real
     paper, which is the window in which a turn reads as deliberate rather than
     as lag. Measured against the alternatives: under ~450ms it snaps and the
     3D is wasted, over ~900ms a reader moving through a book starts waiting. */
  var FLIP_MS = 720;

  var MAX_PAGES = 500;   /* mirrors mak_publication_read's max_pages_per_item */
  var MAX_NOTE = 600;

  /* ── HOW SMALL A WHOLE PAGE MAY BE SHRUNK BEFORE IT SCROLLS INSTEAD ─────
     See fitPageText(). Below this the words stop being words, so a page that
     long goes back to scrolling rather than becoming a grey block nobody can
     read at any zoom. 0.5 means a page carrying twice what fits still arrives
     WHOLE, which is nearly every page a student will publish. */
  var SHEET_SCALE_FLOOR = 0.5;

  /* ── THE AVATAR FILE NAMES ────────────────────────────────────────────────
     A SECOND COPY OF A LIST, AND IT IS ALLOWED FOR EXACTLY ONE REASON: the
     other copy is src/avatarChoices.js, which does not exist in the public
     repository and must not be shipped there (it carries seven inline SVG
     fallbacks and the picker's vocabulary, none of which a reader needs).

     This is the same trade src/coverColorContract.js makes, and it is paid for
     the same way: tests/publicBookScene.test.js reads avatarChoices.js and
     fails if one file grows an avatar the other has not heard of. Without that
     test this array would be exactly the duplicate-whitelist failure CLAUDE.md
     names -- the page colour that survived in five files.

     Index 0 is null because 0 is NOT an avatar: it is "this writer never chose
     one", which is a real state with its own rendering (the initial letter). */
  var AVATAR_ART = [
    null,
    "mak-avatar-1-turtle-duck.png",
    "mak-avatar-2-frog.png",
    "mak-avatar-3-duck-on-water.png",
    "mak-avatar-4-glider.png",
    "mak-avatar-5-tree.png",
    "mak-avatar-6-jellyfish.png",
    "mak-avatar-7-mushroom.png"
  ];

  /* ── WHY SOMEBODY REPORTS A PAGE ──────────────────────────────────────────
     Short, concrete, and every one of them is something a moderator can act
     on. There is deliberately no "I disagree with this" -- a reporting form
     that invites disagreement collects disagreement, and then somebody has to
     read it all. The keys travel; the labels do not. */
  var REPORT_REASONS = [
    { key: "sexual", label: "Sexual or explicit content" },
    { key: "hate", label: "Hate, harassment or threats" },
    { key: "violence", label: "Violence or self-harm" },
    { key: "copyright", label: "It copies work that is not theirs" },
    { key: "spam", label: "Spam, a scam, or a misleading link" },
    { key: "private", label: "It shares someone's private information" },
    { key: "other", label: "Something else" }
  ];

  /* Refusal codes, matched on -- never on message text. The same rule
     src/shareService.js and src/cloudBackpack.js state, and named to be
     joinable with them. */
  var REPORT_REFUSAL = {
    NOT_READY: "report_not_ready",
    TRANSPORT_FAILED: "report_transport_failed",
    RATE_LIMITED: "report_rate_limited",
    BAD_CODE: "report_bad_code"
  };

  var CANONICAL_COLOR = /^#[0-9a-f]{6}$/;

  /* ── small helpers, all DOM-free ────────────────────────────────────────── */

  function clampNumber(value, min, max, fallback) {
    var n = typeof value === "number" ? value : parseFloat(value);
    if (!isFinite(n)) return fallback;
    return n < min ? min : (n > max ? max : n);
  }

  function clampText(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
  }

  /* Validated HERE as well as by whoever injected it. A custom property is a
     place a string ends up inside CSS, and "the caller already checked" is not
     a property of a file that is copied into a repository with a different
     trust boundary. Anything but a canonical lowercase six-digit hex becomes
     the fallback. */
  function safeColor(value, fallback) {
    var raw = String(value == null ? "" : value).trim().toLowerCase();
    return CANONICAL_COLOR.test(raw) ? raw : fallback;
  }

  /* The same set src/shareSnapshot.js accepts and the same set
     mak_publication_normalize stores: an integer, or a string of digits, and
     nothing else. Not `Math.trunc(Number(value))` -- that turns 3.7 into avatar
     3, which is a malformed value quietly becoming a different valid one, and
     three places agreeing is only worth anything if they agree exactly. */
  function normalizeAvatarId(value) {
    var n = typeof value === "number"
      ? value
      : (/^[0-9]{1,3}$/.test(String(value == null ? "" : value)) ? Number(value) : NaN);
    if (!isFinite(n) || Math.floor(n) !== n) return 0;
    return (n >= 1 && n < AVATAR_ART.length) ? n : 0;
  }

  /* The default cover, and the derivation the two repositories agree on.
     Kept here as a FALLBACK ONLY: when the host injects `coverFrom` -- which
     both of them do, from their own copy of the contract -- that is what is
     used. This exists so a scene created with no host at all still draws a
     book rather than three undefined colours. */
  function coverPartsFrom(hex) {
    var base = safeColor(hex, "#5b3a29");
    var r = parseInt(base.slice(1, 3), 16);
    var g = parseInt(base.slice(3, 5), 16);
    var b = parseInt(base.slice(5, 7), 16);
    var byte = function (n) { var s = n.toString(16); return s.length < 2 ? "0" + s : s; };
    return {
      base: base,
      edge: "#" + byte(Math.floor((r * 58) / 100)) + byte(Math.floor((g * 58) / 100)) + byte(Math.floor((b * 58) / 100)),
      ink: (r * 299 + g * 587 + b * 114) >= 150000 ? "#241a12" : "#f6ecdc"
    };
  }

  /* ── THE ART ──────────────────────────────────────────────────────────────
     Inline SVG rather than PNGs. Two reasons, and the second is the one that
     decided it: the public repository is served straight from a branch with no
     build step, so every binary in it is a byte a stranger downloads forever;
     and a vector stays sharp at 3.4x zoom, which is the whole point of letting
     the reader zoom in. */

  function quillSvg() {
    return '<svg viewBox="0 0 560 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
      + '<defs>'
      + '<linearGradient id="pbsPlume" x1="0" y1="1" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#c9b189"/><stop offset="0.45" stop-color="#efe0c2"/>'
      + '<stop offset="1" stop-color="#fdf6e6"/></linearGradient>'
      + '<linearGradient id="pbsShaft" x1="0" y1="0" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#e8d8b6"/><stop offset="1" stop-color="#b99b6d"/></linearGradient>'
      + '</defs>'
      /* the plume: one broad barb mass, split by the rachis */
      + '<path d="M300 92 C352 44, 424 24, 520 30 C482 62, 446 78, 402 88 C444 86, 476 78, 512 62'
      + ' C476 100, 420 116, 352 112 C384 110, 404 104, 424 96 C388 108, 340 110, 300 92 Z"'
      + ' fill="url(#pbsPlume)" opacity="0.97"/>'
      /* the barb lines, so the plume reads as feather rather than as a leaf */
      + '<g stroke="#b49b74" stroke-width="1.3" opacity="0.55" fill="none">'
      + '<path d="M330 92 C356 70, 392 56, 430 48"/><path d="M352 96 C378 76, 412 64, 452 56"/>'
      + '<path d="M374 99 C400 82, 432 72, 470 64"/><path d="M396 101 C420 88, 450 80, 486 72"/>'
      + '<path d="M338 100 C366 106, 400 108, 436 104"/><path d="M362 104 C390 110, 420 111, 452 107"/>'
      + '</g>'
      /* the rachis, running from the plume down to the nib */
      + '<path d="M520 30 C420 52, 330 82, 232 104 C176 116, 116 124, 60 128"'
      + ' stroke="url(#pbsShaft)" stroke-width="8" fill="none" stroke-linecap="round"/>'
      + '<path d="M520 30 C420 52, 330 82, 232 104 C176 116, 116 124, 60 128"'
      + ' stroke="rgba(255,246,224,0.5)" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
      /* the nib: a split metal point, wet at the tip */
      + '<path d="M62 122 L18 136 L30 141 L64 134 Z" fill="#4a3826"/>'
      + '<path d="M62 124 L26 136 L34 139 L63 133 Z" fill="#7a6144"/>'
      + '<path d="M18 136 L30 141" stroke="#1d1409" stroke-width="1.6" stroke-linecap="round"/>'
      + '<circle cx="21" cy="138" r="3.4" fill="#141018" opacity="0.85"/>'
      + '</svg>';
  }

  function inkpotSvg() {
    return '<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
      + '<defs>'
      + '<radialGradient id="pbsGlass" cx="0.36" cy="0.3" r="0.8">'
      + '<stop offset="0" stop-color="#6d5c46"/><stop offset="0.62" stop-color="#3a2e21"/>'
      + '<stop offset="1" stop-color="#211a12"/></radialGradient>'
      + '<radialGradient id="pbsInk" cx="0.66" cy="0.3" r="0.85">'
      + '<stop offset="0" stop-color="#2b2b3c"/><stop offset="0.5" stop-color="#141422"/>'
      + '<stop offset="1" stop-color="#07070d"/></radialGradient>'
      + '</defs>'
      + '<ellipse cx="64" cy="70" rx="58" ry="54" fill="rgba(8,5,3,0.45)"/>'
      + '<circle cx="64" cy="64" r="56" fill="url(#pbsGlass)"/>'
      + '<circle cx="64" cy="64" r="47" fill="#171208"/>'
      + '<circle cx="64" cy="64" r="42" fill="url(#pbsInk)"/>'
      /* the candle, caught on the meniscus -- the whole reason this reads as
         liquid rather than as a black disc */
      + '<path d="M40 46 A32 32 0 0 1 88 44" stroke="rgba(255,206,140,0.5)" stroke-width="3.4"'
      + ' fill="none" stroke-linecap="round"/>'
      + '<ellipse cx="82" cy="50" rx="9" ry="5" fill="rgba(255,224,170,0.35)" transform="rotate(-24 82 50)"/>'
      + '<circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,236,203,0.18)" stroke-width="1.5"/>'
      + '</svg>';
  }

  /* =========================================================================
     THE SCENE
     ========================================================================= */

  function createScene(options) {
    var opt = options || {};
    var doc = opt.document || (typeof document !== "undefined" ? document : null);
    var win = opt.window || (typeof window !== "undefined" ? window : null);
    if (!doc) throw new Error("The public book scene needs a document to build into.");

    /* THE SANITIZER IS INJECTED AND IS NEVER OPTIONAL IN PRACTICE. Both hosts
       pass their own; a scene built without one still renders, as TEXT. There
       is no code path in this file that assigns snapshot content to
       innerHTML. */
    var sanitizeInto = typeof opt.sanitizeInto === "function" ? opt.sanitizeInto : null;
    var coverFrom = typeof opt.coverFrom === "function" ? opt.coverFrom : null;
    var avatarBase = String(opt.avatarBase == null ? "" : opt.avatarBase);
    var report = opt.report || null;

    var state = {
      pages: [],
      index: 0,
      perSpread: 2,
      open: false,
      animating: false,
      snapshot: null,
      byline: "",
      avatarId: 0,
      token: "",
      preview: false,
      camera: { pitch: PITCH_DEFAULT, yaw: YAW_DEFAULT, zoom: 1, panX: 0, panY: 0 },
      /* A TOKEN, NOT A BOOLEAN. Every pitch flight takes the next number and
         checks it is still the current one on each frame, so a second flight
         (open, then close before it lands) retires the first rather than both
         writing to state.camera.pitch on alternate frames. */
      pitchFlight: 0,
      fitZoom: 1,
      /* Whether the READER has moved the camera since the last fit. A resize
         used to re-fit unconditionally, which threw away a zoom somebody had
         set to read small type -- and on a phone the address bar collapsing
         counts as a resize, so it happened while they were reading. */
      cameraTouched: false
    };

    /* ── EVERY LISTENER THIS FILE OWNS IS WRITTEN DOWN ───────────────────────
       render() is not guaranteed to run once: the app's preview host sets a
       fresh snapshot every time the student edits a field. The site's book.js
       learned this the expensive way -- a second render stacked a second
       complete pointer set on the viewport and every pinch ran the zoom maths
       twice -- so here there is ONE removeEventListener for every
       addEventListener, and nothing calls addEventListener directly. */
    var listeners = [];
    var frames = [];
    var timers = [];

    function on(target, type, handler, opts) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(type, handler, opts);
      listeners.push({ target: target, type: type, handler: handler, options: opts });
    }

    function later(fn, ms) {
      if (!win) return 0;
      var id = win.setTimeout(fn, ms);
      timers.push(id);
      return id;
    }

    function frame(fn) {
      if (!win || typeof win.requestAnimationFrame !== "function") { fn(0); return 0; }
      var id = win.requestAnimationFrame(fn);
      frames.push(id);
      return id;
    }

    function prefersReducedMotion() {
      if (typeof opt.reducedMotion === "boolean") return opt.reducedMotion;
      if (!win || typeof win.matchMedia !== "function") return false;
      try { return win.matchMedia("(prefers-reduced-motion: reduce)").matches === true; }
      catch (error) { return false; }
    }

    /* ── DOM building ───────────────────────────────────────────────────── */

    function make(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function obj(className) { return make("div", "pbs-obj " + className); }

    function button(className, label, title) {
      var node = make("button", "pbs-btn " + className, label);
      node.type = "button";
      if (title) {
        node.title = title;
        node.setAttribute("aria-label", title);
      }
      return node;
    }

    /* SVG is the ONE place innerHTML is used, and it is used on strings this
       file itself wrote three functions ago -- never on a snapshot, never on
       anything that crossed a network. The alternative is 120 lines of
       createElementNS for a drawing that has no dynamic parts at all. */
    function svgInto(node, markup) { node.innerHTML = markup; return node; }

    var els = {};

    function buildSkeleton() {
      var root = make("div", "pbs-root");
      root.setAttribute("data-pbs-version", String(VERSION));

      /* -- the marquee ------------------------------------------------- */
      var marquee = make("div", "pbs-marquee");
      var main = make("div", "pbs-marquee-main");
      els.title = make("h1", "pbs-title");
      els.desc = make("p", "pbs-desc");
      els.facts = make("p", "pbs-facts");
      main.appendChild(els.title);
      main.appendChild(els.desc);
      main.appendChild(els.facts);
      marquee.appendChild(main);

      els.side = make("div", "pbs-marquee-side");
      els.author = make("div", "pbs-author-slot");
      els.side.appendChild(els.author);
      els.reportBtn = button("pbs-report-btn pbs-btn-quiet", "⚑ Report", "Report this page");
      els.side.appendChild(els.reportBtn);
      marquee.appendChild(els.side);
      root.appendChild(marquee);

      /* -- the stage ---------------------------------------------------- */
      var stage = make("div", "pbs-stage");
      els.stage = stage;

      els.badge = make("p", "pbs-badge", "Preview — not published");
      els.badge.hidden = true;
      stage.appendChild(els.badge);

      els.hint = make("p", "pbs-hint", "Drag to move · scroll to zoom · hold Shift and drag to tilt");
      stage.appendChild(els.hint);

      var camera = make("div", "pbs-camera");
      els.camera = camera;
      var world = make("div", "pbs-world");
      els.world = world;
      camera.appendChild(world);
      stage.appendChild(camera);

      world.appendChild(obj("pbs-desk"));
      world.appendChild(obj("pbs-lightpool"));

      /* the quill and the ink, lying on the desk below the book */
      var quill = obj("pbs-quill");
      svgInto(quill, quillSvg());
      world.appendChild(quill);
      var pot = obj("pbs-inkpot");
      svgInto(pot, inkpotSvg());
      world.appendChild(pot);

      /* the candle, on the right */
      var candle = obj("pbs-candle");
      candle.appendChild(obj("pbs-candle-shadow"));
      candle.appendChild(obj("pbs-candle-wax"));
      candle.appendChild(obj("pbs-candle-top"));
      els.flame = obj("pbs-candle-flame");
      candle.appendChild(els.flame);
      candle.appendChild(obj("pbs-candle-halo"));
      world.appendChild(candle);

      /* the book */
      var book = obj("pbs-book");
      els.book = book;
      book.appendChild(obj("pbs-book-shadow"));

      /* closed */
      var closed = obj("pbs-closed");
      els.closed = closed;
      var front = obj("pbs-cover pbs-cover-front");
      var plate = make("div", "pbs-cover-plate");
      els.coverTitle = make("h2", "pbs-cover-title");
      els.coverRule = make("span", "pbs-cover-rule");
      els.coverByline = make("p", "pbs-cover-byline");
      plate.appendChild(els.coverTitle);
      plate.appendChild(els.coverRule);
      plate.appendChild(els.coverByline);
      front.appendChild(plate);
      closed.appendChild(front);
      closed.appendChild(obj("pbs-cover pbs-cover-back"));
      closed.appendChild(obj("pbs-edge pbs-edge-fore"));
      closed.appendChild(obj("pbs-edge pbs-edge-head"));
      closed.appendChild(obj("pbs-edge pbs-edge-tail"));
      closed.appendChild(obj("pbs-spine"));
      book.appendChild(closed);

      /* open */
      var openBox = obj("pbs-open");
      els.open = openBox;
      openBox.hidden = true;

      els.halfLeft = obj("pbs-half pbs-half-left");
      els.stackLeft = make("div", "pbs-stack pbs-stack-left");
      els.pageLeft = make("div", "pbs-page");
      els.halfLeft.appendChild(els.stackLeft);
      els.halfLeft.appendChild(els.pageLeft);

      els.halfRight = obj("pbs-half pbs-half-right");
      els.stackRight = make("div", "pbs-stack pbs-stack-right");
      els.pageRight = make("div", "pbs-page");
      els.halfRight.appendChild(els.stackRight);
      els.halfRight.appendChild(els.pageRight);

      openBox.appendChild(obj("pbs-binding"));
      openBox.appendChild(els.halfLeft);
      openBox.appendChild(els.halfRight);
      book.appendChild(openBox);
      world.appendChild(book);

      /* -- the HUD ------------------------------------------------------ */
      var hud = make("div", "pbs-hud");
      els.hud = hud;

      els.openBtn = button("pbs-open-btn pbs-btn-primary", "Open the book");
      hud.appendChild(els.openBtn);

      els.prev = button("pbs-prev", "‹", "Previous page");
      els.indicator = make("span", "pbs-indicator");
      els.indicator.setAttribute("aria-live", "polite");
      els.next = button("pbs-next", "›", "Next page");
      hud.appendChild(els.prev);
      hud.appendChild(els.indicator);
      hud.appendChild(els.next);
      hud.appendChild(make("span", "pbs-hud-sep"));

      els.zoomOut = button("pbs-zoom-out", "−", "Zoom out");
      /* "Fit the book to the window", NOT "Reset the zoom". It calls
         fitCamera(), which lands on whatever percentage FITS -- about 134% in a
         desktop preview, not 100% -- so the old label promised a number the
         button does not go to, sitting next to a second control also called
         reset. */
      els.zoomLabel = button("pbs-zoom-label pbs-btn-quiet", "100%", "Fit the book to the window");
      els.zoomIn = button("pbs-zoom-in", "+", "Zoom in");
      hud.appendChild(els.zoomOut);
      hud.appendChild(els.zoomLabel);
      hud.appendChild(els.zoomIn);
      hud.appendChild(make("span", "pbs-hud-sep"));

      els.reset = button("pbs-reset pbs-btn-quiet", "Reset view", "Put the camera back where it started");
      hud.appendChild(els.reset);

      stage.appendChild(hud);
      root.appendChild(stage);

      /* -- the report dialog -------------------------------------------- */
      root.appendChild(buildReportDialog());

      els.root = root;
      return root;
    }

    /* ── the marquee's right-hand side ───────────────────────────────────
       Rebuilt rather than mutated on every render, because an anonymous share
       must leave NO author node behind for anything to un-hide. The identity
       fields are absent from the snapshot; the identity node is absent from
       the DOM. Same rule, both halves. */
    function paintSide() {
      els.author.textContent = "";
      if (state.byline) {
        var author = make("div", "pbs-author");
        var avatar = make("span", "pbs-avatar");
        var art = state.avatarId ? AVATAR_ART[state.avatarId] : null;
        if (art && avatarBase) {
          /* The letter is drawn FIRST and the image sits on top of it, so a
             missing file uncovers the letter instead of showing a broken-image
             icon -- the pattern src/avatarChoices.js already uses and for the
             same reason. */
          avatar.appendChild(make("span", "pbs-avatar-letter", state.byline.slice(0, 1).toUpperCase()));
          var img = doc.createElement("img");
          img.src = avatarBase + art;
          img.alt = "";
          img.setAttribute("aria-hidden", "true");
          img.setAttribute("decoding", "async");
          img.draggable = false;
          /* NOT through on(). This node is rebuilt on every render and dies
             with it, so a TRACKED listener here would push a fresh entry onto
             `listeners` per render -- and the app's preview re-renders on
             every keystroke, which is hundreds of dead entries for a student
             typing a description. An own-property handler is collected with
             the node it is on, which is exactly the lifetime wanted. */
          img.onerror = function () { img.hidden = true; };
          avatar.appendChild(img);
        } else {
          avatar.appendChild(make("span", "pbs-avatar-letter", state.byline.slice(0, 1).toUpperCase()));
        }
        author.appendChild(avatar);
        var text = make("div", "pbs-author-text");
        text.appendChild(make("span", "pbs-author-role", "Written by"));
        text.appendChild(make("span", "pbs-author-name", state.byline));
        author.appendChild(text);
        els.author.appendChild(author);
      }
    }

    /* ── the facts row ───────────────────────────────────────────────────
       The page count is COUNTED from the pages that are actually here, never
       taken from a field. A count and a list that disagree is the kind of
       small lie that makes a reader stop trusting the rest of the page. */
    function paintFacts() {
      els.facts.textContent = "";
      var total = state.pages.length;
      addFact(total + " page" + (total === 1 ? "" : "s"));
      if (state.byline) addFact("Shared by " + state.byline);
      else addFact("Shared anonymously");
      var when = state.snapshot && state.snapshot.publishedAt ? String(state.snapshot.publishedAt).slice(0, 10) : "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(when)) addFact("Published " + when);
    }

    function addFact(label) {
      var fact = make("span", "pbs-fact");
      fact.appendChild(make("span", "pbs-fact-dot"));
      fact.appendChild(make("span", null, label));
      els.facts.appendChild(fact);
    }

    /* ── pages ──────────────────────────────────────────────────────────── */

    function paintPage(host, pageIndex, side, leafFace) {
      host.textContent = "";
      var page = state.pages[pageIndex];
      var inner = make("div", "pbs-page-inner");
      /* THE SHEET INSIDE THE PAGE. Everything the writer put on this page goes
         in here and nowhere else, because fitPageText() scales THIS box to make
         it fit -- and a transform on .pbs-page-inner would scale the padding,
         the page number and the gutter with it. */
      var sheet = make("div", "pbs-page-sheet");
      inner.appendChild(sheet);

      if (!page) {
        /* Past the end of the book. Not an error and not a blank page the
           writer put there -- there simply is no leaf, so the half shows the
           board under it. */
        host.appendChild(inner);
        host.appendChild(make("div", "pbs-page-gutter pbs-page-gutter-" + (side === "left" ? "right" : "left")));
        return;
      }

      var label = clampText(page.title, 200);
      if (label) sheet.appendChild(make("p", "pbs-page-label", label));

      var body = make("div", "pbs-page-body");
      void leafFace;
      var html = page.html == null ? "" : String(page.html);
      if (!html.replace(/<[^>]*>/g, "").trim()) {
        body.appendChild(make("div", "pbs-page-blank", "This page was left blank"));
      } else if (sanitizeInto) {
        sanitizeInto(body, html);
      } else {
        /* FAIL CLOSED. No sanitizer means no markup -- the words, and nothing
           that could have been an element. */
        body.textContent = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      sheet.appendChild(body);
      host.appendChild(inner);
      fitPageText(inner, sheet, leafFace === true);

      host.appendChild(make("div", "pbs-page-number", String(pageIndex + 1)));
      host.appendChild(make("div", "pbs-page-gutter pbs-page-gutter-" + (side === "left" ? "right" : "left")));
    }

    /* ── ONE AUTHORED PAGE ARRIVES AS ONE WHOLE PAGE ───────────────────────
       A page in this scene is a fixed rectangle and a published page is not, so
       something has to give. What must NOT give is completeness: whatever a
       student put on a page has to be ON that page when a stranger opens it.
       The first draft simply clipped -- the right-hand page in the very first
       screenshot ended mid-sentence at a hard edge, and zooming did not help,
       because the overflow was hidden: the words were not off-screen, they were
       gone.

       TWO STEPS, IN THIS ORDER, AND THE ORDER IS THE POINT.

       1. THE TYPE SHRINKS, which is what a printed book does. Down to 8.4px and
          no further. This reflows -- the line breaks are not the writer's --
          and that is an acceptable price for a page that FILLS its rectangle,
          which is what a page should look like.

       2. WHAT IS LEFT IS SCALED, uniformly, as one block. This is the step that
          makes the guarantee true. A scale reflows NOTHING: the headings keep
          their ratio to the body, an indent stays an indent, a table keeps its
          columns. It is the page seen from further away, which is exactly what
          a reader with a free camera can undo by zooming in -- and unlike the
          clip, there is something there to zoom in ON.

       So a page of any ordinary length now arrives WHOLE. No fade, no scrollbar,
       nothing below the fold, because there is no fold.

       THE FLOOR, AND WHY SCROLLING SURVIVES BELOW IT. Past SHEET_SCALE_FLOOR the
       type stops being type. A page carrying more than twice what fits is
       better served by the old behaviour -- shrink to 8.4px and SCROLL -- than
       by a grey block that is complete and unreadable. That path is unchanged
       and is still the play-test's fix: the box scrolls, takes the wheel while
       it has somewhere to go, is tabbable for a keyboard, and takes a finger
       through `touch-action: pan-y`. It is now the rare case rather than the
       normal one.

       Measured on the element's own scrollHeight rather than guessed from a
       character count, because a page of headings and a page of prose of the
       same length are not the same height. */
    /**
     * @param inner the .pbs-page-inner -- the fixed rectangle, which is what
     *              the content has to fit INTO. Never scaled itself.
     * @param sheet the .pbs-page-sheet inside it -- everything the writer put
     *              on this page. This is the box that shrinks and scales.
     * @param leaf  true when this is a face of the sheet currently in the air.
     *              A leaf is on screen for 720ms and lands as a normal page that
     *              gets fitted again, so it takes step 1 and step 2 but never
     *              the scrollbar -- one that appeared and vanished mid-turn was
     *              a play-test finding of its own.
     */
    function fitPageText(inner, sheet, leaf) {
      if (!inner || !sheet || typeof sheet.scrollHeight !== "number") return;
      var page = inner.parentNode;
      var size = 11.4;
      sheet.style.fontSize = size + "px";
      sheet.style.transform = "";
      inner.classList.remove("pbs-page-inner-more");
      if (page && page.classList) page.classList.remove("pbs-page-more");
      /* clientHeight is 0 in a detached or display:none subtree. Nothing to fit
         against, so nothing is done and the page keeps the stylesheet's size. */
      var room = inner.clientHeight;
      if (!room) return;

      var guard = 0;
      while (sheet.scrollHeight > room && size > 8.4 && guard < 24) {
        size -= 0.4;
        sheet.style.fontSize = size.toFixed(1) + "px";
        guard += 1;
      }
      if (sheet.scrollHeight <= room) return;

      /* Step two. Read once: scrollHeight is layout height, which a transform
         does not change, so this ratio stays true after it is applied. */
      var scale = room / sheet.scrollHeight;
      if (scale >= SHEET_SCALE_FLOOR) {
        sheet.style.transform = "scale(" + scale.toFixed(4) + ")";
        return;
      }

      /* Past the floor. Back to the type floor and the scrollbar -- and the
         transform is CLEARED first, because a scaled child's scroll range is
         computed from its unscaled layout box, so leaving it on would have
         given the reader a scrollbar that ran out before the words did. */
      sheet.style.transform = "";
      if (leaf) return;
      inner.classList.add("pbs-page-inner-more");
      inner.tabIndex = 0;
      if (page && page.classList) page.classList.add("pbs-page-more");
    }

    function computePerSpread() {
      if (!els.stage) return 2;
      var width = els.stage.clientWidth || 900;
      return width >= 640 ? 2 : 1;
    }

    function paintSpread() {
      var single = state.perSpread === 1;
      els.halfLeft.hidden = single;
      /* The world's origin is the SPINE. With no left half there is nothing on
         the other side of it, so the block shifts to put the one visible page
         back on the origin -- see .pbs-open-single. Without this a narrow
         reader gets half a page and has to drag for the rest. */
      els.open.classList.toggle("pbs-open-single", single);
      if (!single) paintPage(els.pageLeft, state.index, "left");
      paintPage(els.pageRight, single ? state.index : state.index + 1, "right");
      paintStacks();
      paintIndicator();
    }

    /* THE STACKS ARE THE DETAIL THAT MAKES IT AN OBJECT.
       The left block grows and the right block shrinks as the reader moves
       through the book, so at page 2 of 40 there is almost nothing under the
       left hand and a thick wedge under the right. It costs two custom
       properties and it is the difference between a book and a slideshow. */
    function paintStacks() {
      var total = Math.max(state.pages.length, 1);
      var done = Math.min(state.index, total);
      var left = 3 + Math.round((done / total) * 40);
      var right = 3 + Math.round(((total - done) / total) * 40);
      els.root.style.setProperty("--pbs-left-z", left + "px");
      els.root.style.setProperty("--pbs-right-z", right + "px");
      els.root.style.setProperty("--pbs-block-z", (left + right) + "px");
    }

    function paintIndicator() {
      var total = state.pages.length;
      if (!total) { els.indicator.textContent = "No pages"; return; }
      var last = Math.min(state.index + state.perSpread, total);
      var first = state.index + 1;
      els.indicator.textContent = (last > first ? first + "–" + last : String(first)) + " of " + total;
      els.prev.disabled = state.index <= 0 || state.animating;
      els.next.disabled = state.index + state.perSpread >= total || state.animating;
      /* The labels follow what the button DOES. In a two-page spread these move
         the reader by two, and calling that "Previous page" beside an indicator
         reading "3-4 of 6" is the control disagreeing with the readout next to
         it. */
      var unit = state.perSpread === 2 ? "two pages" : "page";
      els.prev.title = "Previous " + unit;
      els.prev.setAttribute("aria-label", "Previous " + unit);
      els.next.title = "Next " + unit;
      els.next.setAttribute("aria-label", "Next " + unit);
    }

    /* ── THE PAGE TURN ───────────────────────────────────────────────────
       A real rotation of a real two-sided sheet about the spine. The physics
       of which face carries which page is worth writing down once, because
       getting it wrong shows as a page that appears twice:

       FORWARD, from spread (i, i+1) to (i+2, i+3):
         the leaf that moves has page i+1 on its front and i+2 on its back.
         The half UNDER it on the right is set to i+3 immediately, because the
         leaf covers it at 0deg and uncovers it as it lifts. The left half
         stays on i until the end, because the leaf covers it at -180deg.

       BACKWARD, from (i, i+1) to (i-2, i-1):
         the leaf that returns has page i-1 on its front and i on its back.
         It starts folded left at -180deg (showing i, which is what the reader
         can already see) and lands flat right at 0deg (showing i-1). So the
         LEFT half is set to i-2 immediately and the right half waits.

       In single-page mode the same leaf and the same origin are used; only the
       left half is absent, so the arithmetic collapses to a step of one. */
    function turn(direction) {
      var total = state.pages.length;
      if (state.animating || !state.open || !total) return false;
      var step = state.perSpread;
      var target = state.index + (direction > 0 ? step : -step);
      if (target < 0 || target > total - 1) return false;
      if (direction > 0 && state.index + step >= total) return false;

      var forward = direction > 0;
      var frontIndex = forward ? state.index + (state.perSpread === 2 ? 1 : 0) : target + (state.perSpread === 2 ? 1 : 0);
      var backIndex = forward ? target : state.index;

      if (prefersReducedMotion()) {
        state.index = target;
        paintSpread();
        return true;
      }

      state.animating = true;
      paintIndicator();

      var leaf = make("div", "pbs-leaf pbs-leaf-forward");
      var faceFront = make("div", "pbs-leaf-face pbs-leaf-face-front");
      var facePage = make("div", "pbs-page");
      faceFront.appendChild(facePage);
      var faceBack = make("div", "pbs-leaf-face pbs-leaf-face-back");
      var backPage = make("div", "pbs-page");
      faceBack.appendChild(backPage);
      var shade = make("div", "pbs-leaf-shade");
      leaf.appendChild(faceFront);
      leaf.appendChild(faceBack);
      leaf.appendChild(shade);
      els.open.appendChild(leaf);

      var savedIndex = state.index;
      state.index = target;
      /* The half that will be REVEALED is repainted now; the half that will be
         COVERED waits until the leaf is over it. */
      if (state.perSpread === 1) {
        paintPage(els.pageRight, target, "right");
      } else if (forward) {
        paintPage(els.pageRight, target + 1, "right");
      } else {
        paintPage(els.pageLeft, target, "left");
      }
      state.index = savedIndex;

      paintLeafFace(facePage, frontIndex, "right");
      paintLeafFace(backPage, backIndex, "left");
      paintStacksFor(target);

      var from = forward ? 0 : -180;
      var to = forward ? -180 : 0;
      var start = 0;

      var tick = function (now) {
        if (!start) start = now;
        var t = Math.min(1, (now - start) / FLIP_MS);
        /* cubic in-out. A sheet of paper does not start or stop instantly, and
           a linear turn is the single most obvious tell that a flip is a
           transform rather than an object. */
        var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        var angle = from + (to - from) * eased;
        leaf.style.transform = "rotateY(" + angle + "deg)";
        /* Darkest as the sheet stands up, which is when it shadows the page
           under it most. sin() rather than a triangle so it has no corner. */
        shade.style.opacity = String(Math.sin(eased * Math.PI) * 0.75);
        if (t < 1) { frame(tick); return; }

        state.index = target;
        if (forward) {
          if (state.perSpread === 2) paintPage(els.pageLeft, target, "left");
          else paintPage(els.pageRight, target, "right");
        } else {
          paintPage(els.pageRight, state.perSpread === 2 ? target + 1 : target, "right");
        }
        if (leaf.parentNode) leaf.parentNode.removeChild(leaf);
        state.animating = false;
        paintStacks();
        paintIndicator();
      };
      frame(tick);
      return true;
    }

    function paintLeafFace(node, pageIndex, side) {
      paintPage(node, pageIndex, side, true);
    }

    function paintStacksFor(index) {
      var total = Math.max(state.pages.length, 1);
      var done = Math.min(Math.max(index, 0), total);
      els.root.style.setProperty("--pbs-left-z", (3 + Math.round((done / total) * 40)) + "px");
      els.root.style.setProperty("--pbs-right-z", (3 + Math.round(((total - done) / total) * 40)) + "px");
    }

    /* ── open / close ───────────────────────────────────────────────────── */

    function setOpen(next) {
      var wanted = next === true;
      if (state.open === wanted) return;
      state.open = wanted;
      els.closed.hidden = wanted;
      els.open.hidden = !wanted;
      if (wanted) {
        state.perSpread = computePerSpread();
        paintSpread();
      }
      paintOpenControls();
      /* THE CAMERA COMES OVERHEAD WITH IT. See PITCH_READING. fitCamera() runs
         on every frame of the flight rather than only at the end, because the
         book's on-screen height GROWS as the foreshortening goes away -- fit
         it once at the start and the spread grows out of the window on the way
         up; fit it once at the end and it jumps. */
      flyPitchTo(wanted ? PITCH_READING : PITCH_DEFAULT);
      if (typeof opt.onOpenChange === "function") opt.onOpenChange(wanted);
    }

    /* The controls that only mean something once the book is open. Painted
       from ONE place, because setOpen() returns early when the state already
       matches and a book published closed then never had its button labelled. */
    function paintOpenControls() {
      els.openBtn.textContent = state.open ? "Close the book" : "Open the book";
      els.prev.hidden = !state.open;
      els.next.hidden = !state.open;
      els.indicator.hidden = !state.open;
    }

    /* ── the camera ─────────────────────────────────────────────────────── */

    function applyCamera() {
      var camera = state.camera;
      var root = els.root.style;
      root.setProperty("--pbs-pitch", camera.pitch.toFixed(2) + "deg");
      root.setProperty("--pbs-yaw", camera.yaw.toFixed(2) + "deg");
      root.setProperty("--pbs-zoom", camera.zoom.toFixed(4));
      root.setProperty("--pbs-pan-x", Math.round(camera.panX) + "px");
      root.setProperty("--pbs-pan-y", Math.round(camera.panY) + "px");
      /* THE FLAME BILLBOARDS. Counter-rotating it by the camera's own pitch is
         what keeps a flame looking like a flame at 84 degrees, where an
         un-billboarded one is a 3px sliver seen edge-on. It is the one place
         in this scene where physical correctness and looking right disagree,
         and looking right wins -- a candle photographed from above still reads
         as a candle because the eye supplies the flame. */
      root.setProperty("--pbs-flame-face", (-camera.pitch).toFixed(2) + "deg");
      els.zoomLabel.textContent = Math.round(camera.zoom * 100) + "%";
      if (typeof opt.onCameraChange === "function") opt.onCameraChange({
        pitch: camera.pitch, yaw: camera.yaw, zoom: camera.zoom, panX: camera.panX, panY: camera.panY
      });
    }

    /* Fits the BOOK, not the desk. The desk is 1720px wide and framing it
       would put the book in the middle distance; a reader opening a link wants
       to be at the page. */
    function fitCamera() {
      var width = (els.stage && els.stage.clientWidth) || 1000;
      var height = (els.stage && els.stage.clientHeight) || 620;
      var modelWidth = state.open && state.perSpread === 2 ? 700 : 400;
      /* The book's on-screen height is its model height foreshortened by the
         pitch, plus room for the block's thickness and the shadow under it. */
      var pitchRadians = state.camera.pitch * Math.PI / 180;
      var modelHeight = 404 * Math.max(0.28, Math.cos(pitchRadians)) + 190;
      var fit = Math.min((width * 0.80) / modelWidth, (height * 0.80) / modelHeight);
      state.fitZoom = clampNumber(fit, ZOOM_MIN, 2.0, 1);
      state.camera.zoom = state.fitZoom;
      state.camera.panX = 0;
      state.camera.panY = 0;
      state.cameraTouched = false;
      applyCamera();
    }

    /* Flies the camera's pitch to `target`, refitting as it goes.

       Nothing else about the camera is animated: pan and zoom belong to the
       reader's hand and an animation that fought a drag would be worse than no
       animation at all. Pitch is the one value the SCENE has an opinion about,
       and it has that opinion exactly twice -- when the book opens and when it
       closes. */
    function flyPitchTo(target) {
      var camera = state.camera;
      var from = camera.pitch;
      var to = clampNumber(target, PITCH_MIN, PITCH_MAX, PITCH_DEFAULT);
      state.pitchFlight += 1;
      var token = state.pitchFlight;
      var canAnimate = win && typeof win.requestAnimationFrame === "function";
      /* SNAP, and this is the honest branch rather than the degraded one. A
         reader who asked for reduced motion asked not to be flown anywhere,
         and a host with no rAF (a test's JSDOM, mainly) must not be handed a
         loop that calls its callback synchronously forever. */
      if (from === to || !canAnimate || prefersReducedMotion()) {
        camera.pitch = to;
        fitCamera();
        return;
      }
      var started = -1;
      function step(now) {
        if (token !== state.pitchFlight) return;  /* superseded, or cancelled */
        var stamp = typeof now === "number" ? now : 0;
        if (started < 0) started = stamp;
        var t = Math.min(1, Math.max(0, (stamp - started) / PITCH_FLIGHT_MS));
        /* easeInOutCubic. A linear pitch reads as a value being changed; this
           reads as a camera leaving and arriving. */
        var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.pitch = from + (to - from) * eased;
        fitCamera();
        if (t < 1) frame(step);
      }
      frame(step);
    }

    /* Retires any flight in the air. Called wherever something else is about to
       become the authority on the camera -- a restored view, or an explicit
       reset -- so the flight cannot land on top of it two frames later. */
    function cancelPitchFlight() { state.pitchFlight += 1; }

    function resetCamera() {
      cancelPitchFlight();
      /* The resting angle depends on what is on the desk. "Reset the view" on an
         OPEN book means the angle that book is read from; sending it back to 56
         would tilt the reader away from the page they are reading, which is the
         opposite of a reset. */
      state.camera.pitch = state.open ? PITCH_READING : PITCH_DEFAULT;
      state.camera.yaw = YAW_DEFAULT;
      fitCamera();
    }

    function zoomBy(factor, originX, originY) {
      var camera = state.camera;
      var next = clampNumber(camera.zoom * factor, ZOOM_MIN, ZOOM_MAX, camera.zoom);
      if (next === camera.zoom) return;
      /* ZOOM ABOUT A POINT. The camera maps a world point p to the screen as
         s = pan + zoom * p, both measured from the stage's centre, because
         .pbs-camera is inset:0 and its transform-origin is therefore that
         centre. Holding s fixed and solving for the new pan is the whole
         derivation, and it is exact only because the rotation lives on a
         different node -- see this file's header. */
      camera.panX = originX - ((originX - camera.panX) * next) / camera.zoom;
      camera.panY = originY - ((originY - camera.panY) * next) / camera.zoom;
      camera.zoom = next;
      state.cameraTouched = true;
      clampPan();
      applyCamera();
    }

    /* A reader cannot lose the desk. The limit is generous -- one and a half
       stage widths -- because the point of a free camera is freedom, but a
       page panned into the void with no way back is not freedom. */
    function clampPan() {
      var width = (els.stage && els.stage.clientWidth) || 1000;
      var height = (els.stage && els.stage.clientHeight) || 620;
      var limitX = width * 1.5, limitY = height * 1.5;
      state.camera.panX = clampNumber(state.camera.panX, -limitX, limitX, 0);
      state.camera.panY = clampNumber(state.camera.panY, -limitY, limitY, 0);
    }

    function stageOrigin(event) {
      var rect = els.stage.getBoundingClientRect
        ? els.stage.getBoundingClientRect()
        : { left: 0, top: 0, width: 1000, height: 620 };
      return {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2
      };
    }

    /* ── input ──────────────────────────────────────────────────────────── */

    var drag = null;
    var pinch = null;
    var pointers = {};

    function bindStage() {
      on(els.stage, "pointerdown", function (event) {
        /* THE HUD AND THE DIALOG ARE NOT THE DESK.
           The HUD is a CHILD of the stage, so without this every press on
           "Open the book", the arrows, the zoom controls or "Reset view" also
           started a camera pan, flipped the cursor to `grabbing` over the
           button, and called setPointerCapture on the stage -- which is the
           classic way a click never lands, because the capture moves the
           pointer events off the button mid-press. It also killed the camera
           hint on the very first press, before anybody had read it. */
        if (event.target && typeof event.target.closest === "function"
            && event.target.closest(".pbs-hud, .pbs-veil, .pbs-page-inner-more")) return;
        pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: state.camera.zoom };
          drag = null;
          return;
        }
        if (ids.length !== 1) return;
        /* Shift, or any button but the primary one, ORBITS. Plain dragging
           PANS, because panning is what a reader reaches for first and an
           orbit they did not ask for is disorienting. */
        drag = {
          mode: (event.shiftKey || event.button === 1 || event.button === 2) ? "orbit" : "pan",
          x: event.clientX,
          y: event.clientY,
          /* Where the press started, so pointerup can tell a TAP from a DRAG.
             Kept separate from x/y, which move with the pointer. */
          fromX: event.clientX,
          fromY: event.clientY
        };
        els.stage.classList.add("pbs-dragging");
        if (els.stage.setPointerCapture) {
          try { els.stage.setPointerCapture(event.pointerId); } catch (error) { /* not capturable */ }
        }
        fadeHint();
      });

      on(els.stage, "pointermove", function (event) {
        if (!pointers[event.pointerId]) return;
        pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
        var ids = Object.keys(pointers);
        if (ids.length === 2 && pinch) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          var distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          var wanted = clampNumber(pinch.zoom * (distance / pinch.distance), ZOOM_MIN, ZOOM_MAX, state.camera.zoom);
          zoomBy(wanted / state.camera.zoom, 0, 0);
          return;
        }
        if (!drag) return;
        var dx = event.clientX - drag.x;
        var dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        state.cameraTouched = true;
        if (drag.mode === "pan") {
          state.camera.panX += dx;
          state.camera.panY += dy;
          clampPan();
        } else {
          state.camera.yaw = clampNumber(state.camera.yaw + dx * 0.28, YAW_MIN, YAW_MAX, state.camera.yaw);
          state.camera.pitch = clampNumber(state.camera.pitch - dy * 0.32, PITCH_MIN, PITCH_MAX, state.camera.pitch);
        }
        applyCamera();
      });

      var release = function (event, cancelled) {
        /* A TAP ON A CLOSED BOOK OPENS IT.
           The first thing anybody does with a book on a screen is click it, and
           for the first draft that did nothing at all -- the only working
           control was a chip at the bottom of the HUD, because the stage's
           cursor is `grab` and a single click was swallowed by the pan. A
           double-click worked and was written down nowhere.

           Discriminated by DISTANCE, not by time: under five pixels of travel
           is a tap, anything more was a drag and must not also open the book
           under the reader's hand. */
        if (!cancelled && drag && drag.mode === "pan" && !state.open
            && Math.abs(event.clientX - drag.fromX) < 5
            && Math.abs(event.clientY - drag.fromY) < 5) {
          setOpen(true);
        }
        delete pointers[event.pointerId];
        if (Object.keys(pointers).length < 2) pinch = null;
        drag = null;
        els.stage.classList.remove("pbs-dragging");
      };
      on(els.stage, "pointerup", release);
      /* A CANCELLED gesture is not a tap. The browser cancels a pointer when it
         takes the gesture over -- a scroll, a system swipe -- and opening the
         book on the way out of one is the app acting on an input the reader
         did not finish making. */
      on(els.stage, "pointercancel", function (event) { release(event, true); });
      on(els.stage, "pointerleave", function (event) { release(event, true); });
      /* An orbit started with the right button must not also open a context
         menu over the desk. */
      on(els.stage, "contextmenu", function (event) { event.preventDefault(); });

      /* THE WHEEL IS THE CAMERA'S, ALWAYS. There is no scrollable page inside
         this scene by design -- a page that scrolls under a camera that also
         zooms is two gestures fighting for one wheel, and the reader loses
         both. passive:false because it must be preventable. */
      on(els.stage, "wheel", function (event) {
        /* A PAGE THAT DID NOT FIT KEEPS THE WHEEL, and only that page, and only
           while it still has somewhere to go. Everywhere else the wheel is the
           camera's, which is the rule this scene is built on -- a page that
           scrolls under a camera that also zooms is two gestures fighting for
           one wheel. The exception exists because the alternative is a reader
           who cannot reach the end of a long page at all.

           `canScroll` is checked in the wheel's own direction so that reaching
           the bottom of the page hands the wheel back to the camera rather than
           swallowing it, which is what makes the boundary feel like paper
           rather than like a stuck control. */
        var over = event.target && typeof event.target.closest === "function"
          ? event.target.closest(".pbs-page-inner-more")
          : null;
        if (over) {
          var room = event.deltaY > 0
            ? over.scrollHeight - over.clientHeight - over.scrollTop > 1
            : over.scrollTop > 1;
          if (room) return;   /* let the page take it */
        }
        event.preventDefault();
        var origin = stageOrigin(event);
        var factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        zoomBy(factor, origin.x, origin.y);
        fadeHint();
      }, { passive: false });

      /* A double-click on the closed book opens it, which is what everybody
         tries. A single click would fight the pan. */
      on(els.stage, "dblclick", function (event) {
        /* The same guard pointerdown carries. Without it a double-click on
           "Open the book" ran open -> close -> open: the right end state,
           reached through a flash. */
        if (event.target && typeof event.target.closest === "function"
            && event.target.closest(".pbs-hud, .pbs-veil, .pbs-badge")) return;
        if (!state.open) setOpen(true);
      });
    }

    function bindControls() {
      on(els.openBtn, "click", function () { setOpen(!state.open); });
      on(els.prev, "click", function () { turn(-1); });
      on(els.next, "click", function () { turn(1); });
      on(els.zoomIn, "click", function () { zoomBy(ZOOM_STEP, 0, 0); });
      on(els.zoomOut, "click", function () { zoomBy(1 / ZOOM_STEP, 0, 0); });
      on(els.zoomLabel, "click", function () { fitCamera(); });
      on(els.reset, "click", resetCamera);
      on(els.reportBtn, "click", openReport);

      /* Gated on this scene's own root being in the document, so two scenes on
         one page (which the app's preview does not do today and might) cannot
         both answer the same arrow key. */
      on(doc, "keydown", function (event) {
        if (!els.root || !els.root.isConnected) return;
        if (!els.veil.hidden) return;   /* the dialog owns the keyboard */
        var tag = event.target && event.target.tagName ? String(event.target.tagName).toLowerCase() : "";
        if (tag === "input" || tag === "textarea") return;
        /* A LONG PAGE KEEPS THE ARROWS while it is focused. Turning the page
           out from under somebody who is arrowing down through the words they
           came for is the wrong answer to the same key. */
        if (event.target && typeof event.target.closest === "function"
            && event.target.closest(".pbs-page-inner-more")) return;
        if (event.key === "ArrowRight" || event.key === "PageDown") { turn(1); }
        else if (event.key === "ArrowLeft" || event.key === "PageUp") { turn(-1); }
        else if (event.key === "+" || event.key === "=") { zoomBy(ZOOM_STEP, 0, 0); }
        else if (event.key === "-") { zoomBy(1 / ZOOM_STEP, 0, 0); }
        else if (event.key === "0") { resetCamera(); }
        else if (event.key === "Enter" && !state.open) { setOpen(true); }
        else return;
        event.preventDefault();
      });

      if (win) {
        on(win, "resize", function () {
          var next = computePerSpread();
          if (next !== state.perSpread) {
            state.perSpread = next;
            /* An odd index in single-page mode is fine; a stale one past the
               end is not. */
            state.index = Math.min(state.index, Math.max(0, state.pages.length - 1));
            if (state.open) paintSpread();
          }
          /* ONLY RE-FIT A CAMERA THE READER HAS NOT MOVED. Re-fitting
             unconditionally discarded a zoom somebody had set to read small
             type -- and on a phone the address bar collapsing is a resize, so
             it happened mid-sentence. A reader who has framed something keeps
             their framing; a reader who has not gets the new window fitted. */
          if (state.cameraTouched) clampPan();
          else fitCamera();
          applyCamera();
        });
      }
    }

    var hintTimer = 0;
    function fadeHint() {
      if (hintTimer || !els.hint || els.hint.hidden) return;
      els.hint.classList.add("pbs-hint-faded");
      hintTimer = later(function () { els.hint.hidden = true; }, 600);
    }

    /* =======================================================================
       REPORTING
       =======================================================================
       WHY THE PUBLIC PAGE HAS NO SUPABASE CLIENT AND NO KEY.

       The requirement is that a person with a TDG account can report a page.
       The obvious build is a sign-in widget on the reader, which needs the
       publishable key in the public repository and a second origin in the
       CSP. It was not built that way, and the reason is worth keeping:

         read/config.js today carries an EMPTY publishableKey, and the public
         repository contains no key of any kind. That is a verified property,
         not an aspiration, and it is cheap to keep and expensive to regain.

       So the account check happens where the service key already lives. The
       reader sends an email address, the mak-share Edge Function asks Supabase
       to mail a one-time code, and the reader types it back. The function
       verifies the code, learns who they are, and files the report under that
       account id. The page holds a six-digit code for about a minute and
       nothing else -- no key, no session, no token in storage.

       That transport is INJECTED, exactly like the app's own publish
       transport, and for the same reason: a control whose server half does not
       answer must be able to SAY so rather than fail at the moment somebody
       presses it. An absent transport is a refusal with a code, never an
       exception. */

    function reportReady() {
      return !!(report && typeof report.requestCode === "function" && typeof report.submit === "function");
    }

    function buildReportDialog() {
      var veil = make("div", "pbs-veil");
      veil.hidden = true;
      els.veil = veil;

      var dialog = make("div", "pbs-dialog");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "pbsReportTitle");
      dialog.tabIndex = -1;
      els.dialog = dialog;

      var heading = make("h2", null, "Report this page");
      heading.id = "pbsReportTitle";
      dialog.appendChild(heading);
      dialog.appendChild(make("p", null,
        "Tell us what is wrong with it. A person reads every report, and the writer is never told who sent one."));

      els.reportAccountNote = make("p", "pbs-dialog-note",
        "Reporting needs a TDG account, so we can tell one person from a hundred. "
        + "We will email you a six-digit code to sign in with — nothing is stored on this page.");
      dialog.appendChild(els.reportAccountNote);

      var reasons = doc.createElement("fieldset");
      reasons.className = "pbs-reasons";
      els.reasons = reasons;
      var legend = doc.createElement("legend");
      legend.textContent = "What is wrong";
      reasons.appendChild(legend);
      els.reasonInputs = [];
      for (var i = 0; i < REPORT_REASONS.length; i += 1) {
        (function (entry) {
          var label = make("label", "pbs-reason");
          var input = doc.createElement("input");
          input.type = "radio";
          input.name = "pbs-report-reason";
          input.value = entry.key;
          on(input, "change", paintReasonPick);
          label.appendChild(input);
          label.appendChild(make("span", null, entry.label));
          reasons.appendChild(label);
          els.reasonInputs.push(input);
        })(REPORT_REASONS[i]);
      }
      dialog.appendChild(reasons);

      els.noteField = make("label", "pbs-field");
      els.noteField.appendChild(make("span", "pbs-field-label", "Anything else (optional)"));
      els.note = doc.createElement("textarea");
      els.note.rows = 3;
      els.note.maxLength = MAX_NOTE;
      els.noteField.appendChild(els.note);
      dialog.appendChild(els.noteField);

      els.emailField = make("label", "pbs-field");
      els.emailField.appendChild(make("span", "pbs-field-label", "Your TDG account email"));
      els.email = doc.createElement("input");
      els.email.type = "email";
      els.email.autocomplete = "email";
      els.email.maxLength = 200;
      els.emailField.appendChild(els.email);
      dialog.appendChild(els.emailField);

      els.codeField = make("label", "pbs-field");
      els.codeField.hidden = true;
      els.codeField.appendChild(make("span", "pbs-field-label", "The six-digit code we emailed you"));
      els.code = doc.createElement("input");
      els.code.type = "text";
      els.code.inputMode = "numeric";
      els.code.autocomplete = "one-time-code";
      els.code.maxLength = 6;
      els.codeField.appendChild(els.code);
      dialog.appendChild(els.codeField);

      /* THE STATUS SITS ABOVE THE BUTTONS, not below them. It is the line that
         says what happened or what is being asked for, and the actions are the
         answer to it -- and when there is no transport the buttons collapse to
         a single Close, which left the one sentence that mattered stranded
         underneath it. Explanation, then the way out; never the reverse. */
      els.reportStatus = make("p", "pbs-dialog-status");
      els.reportStatus.setAttribute("role", "status");
      els.reportStatus.setAttribute("aria-live", "polite");
      dialog.appendChild(els.reportStatus);

      var actions = make("div", "pbs-dialog-actions");
      els.reportCancel = button("pbs-btn-quiet", "Cancel");
      els.reportSend = button("pbs-btn-primary", "Email me a code");
      on(els.reportCancel, "click", closeReport);
      on(els.reportSend, "click", stepReport);
      actions.appendChild(els.reportCancel);
      actions.appendChild(els.reportSend);
      dialog.appendChild(actions);

      veil.appendChild(dialog);

      on(veil, "click", function (event) { if (event.target === veil) closeReport(); });
      on(veil, "keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          /* STOPPED HERE. Without this the event kept bubbling to `window`,
             where publicBookPreviewFrame.js re-checked the veil -- by then
             hidden, because closeReport() had just hidden it -- and forwarded
             an escape to the parent, which tore the whole preview down. One
             Escape closed the dialog AND the page behind it, which is exactly
             what the forwarder's own comment says must not happen. */
          event.stopPropagation();
          closeReport();
          return;
        }
        if (event.key !== "Tab") return;
        /* A small, local focus trap. The app has src/focusTrap.js and the
           public site does not, and one copied file may not depend on a second
           one that only exists in half of its homes. */
        /* HIDDEN CONTROLS ARE NOT FOCUSABLE, and a trap that counts them is
           not a trap. Since the dialog started hiding the whole form when there
           is no transport, `last` was a hidden Send button that Tab could never
           reach -- so focus walked out of the dialog into the page behind, and
           from there Escape stopped working in all three of the places that
           handle it. Filtered by offsetParent, which is null for anything with
           a hidden ancestor as well as for the element itself. */
        var focusable = [];
        var candidates = dialog.querySelectorAll("button, input, textarea, [href]");
        for (var c = 0; c < candidates.length; c += 1) {
          var node = candidates[c];
          if (!node.hidden && node.offsetParent !== null && !node.disabled) focusable.push(node);
        }
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
      });

      return veil;
    }

    function paintReasonPick() {
      for (var i = 0; i < els.reasonInputs.length; i += 1) {
        var input = els.reasonInputs[i];
        var label = input.parentNode;
        if (label && label.classList) label.classList.toggle("pbs-reason-picked", input.checked === true);
      }
    }

    var reportStage = "reason";   /* reason -> code -> done */

    function openReport() {
      reportStage = "reason";
      els.codeField.hidden = true;
      els.code.value = "";
      /* CLEARED, EVERY TIME. After a successful send the dialog kept the reason,
         the note and the address, so Close then Report again presented a filled
         accusation over a live send button -- one click from filing the same
         report twice. */
      els.note.value = "";
      els.email.value = "";
      for (var r = 0; r < els.reasonInputs.length; r += 1) els.reasonInputs[r].checked = false;
      paintReasonPick();
      els.reportSend.disabled = false;
      els.reportSend.hidden = false;
      els.reportSend.textContent = "Email me a code";
      els.reportCancel.hidden = false;
      els.reportCancel.textContent = "Cancel";
      says("", "");

      /* WITH NO TRANSPORT, DO NOT ASK THE QUESTIONS.
         The first version drew the whole form -- seven accusations, a note box,
         "Your TDG account email", "we will email you a six-digit code" -- and
         only then greyed the send button. In the writer's own preview that
         meant being handed a moderation form to accuse yourself with, and for
         any reader it meant filling in a form that was never going to send.
         Ask nothing that cannot be answered: one sentence and a way out. */
      var ready = reportReady();
      els.reasons.hidden = !ready;
      els.noteField.hidden = !ready;
      els.emailField.hidden = !ready;
      els.reportSend.hidden = !ready;
      els.reportAccountNote.hidden = !ready;
      els.reportCancel.textContent = ready ? "Cancel" : "Close";
      if (!ready) {
        says(state.preview
          ? "This is a preview, so there is nothing published to report yet. A reader opening your link will see this button and it will work for them."
          : "Reporting is not open on this page yet. Nothing was sent.",
          state.preview ? "" : "bad");
      }
      els.veil.hidden = false;
      els.dialog.focus();
    }

    function closeReport() {
      els.veil.hidden = true;
      if (els.reportBtn) els.reportBtn.focus();
    }

    function says(message, tone) {
      els.reportStatus.textContent = message || "";
      if (tone) els.reportStatus.setAttribute("data-tone", tone);
      else els.reportStatus.removeAttribute("data-tone");
    }

    function pickedReason() {
      for (var i = 0; i < els.reasonInputs.length; i += 1) {
        if (els.reasonInputs[i].checked) return els.reasonInputs[i].value;
      }
      return "";
    }

    function stepReport() {
      if (!reportReady()) return;
      if (reportStage === "reason") return askForCode();
      return sendReport();
    }

    function askForCode() {
      var reason = pickedReason();
      if (!reason) { says("Pick what is wrong with it first.", "bad"); return; }
      var email = String(els.email.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        says("That does not look like an email address.", "bad");
        return;
      }
      els.reportSend.disabled = true;
      says("Sending a code…", "");
      Promise.resolve()
        .then(function () { return report.requestCode({ token: state.token, email: email }); })
        .then(function (answer) {
          els.reportSend.disabled = false;
          if (!answer || answer.ok !== true) {
            says(refusalSentence(answer && answer.code), "bad");
            return;
          }
          reportStage = "code";
          els.codeField.hidden = false;
          /* THE ADDRESS STAYS ON SCREEN. Hiding it meant the one failure that
             actually happens -- a typo -- ended with "check the email and try
             again" above a field the reader could not see, could not correct,
             and had no way back to. */
          els.emailField.hidden = false;
          els.noteField.hidden = true;
          els.reportSend.textContent = "Send the report";
          says("We emailed a six-digit code to " + email + ". It is good for a few minutes.", "good");
          els.code.focus();
        })
        .catch(function () {
          els.reportSend.disabled = false;
          says(refusalSentence(REPORT_REFUSAL.TRANSPORT_FAILED), "bad");
        });
    }

    function sendReport() {
      var code = String(els.code.value || "").replace(/\D+/g, "");
      if (code.length !== 6) { says("The code is six digits.", "bad"); return; }
      els.reportSend.disabled = true;
      says("Sending…", "");
      Promise.resolve()
        .then(function () {
          return report.submit({
            token: state.token,
            email: String(els.email.value || "").trim(),
            code: code,
            reason: pickedReason(),
            note: clampText(els.note.value, MAX_NOTE)
          });
        })
        .then(function (answer) {
          if (!answer || answer.ok !== true) {
            els.reportSend.disabled = false;
            says(refusalSentence(answer && answer.code), "bad");
            return;
          }
          reportStage = "done";
          els.codeField.hidden = true;
          els.reportSend.hidden = true;
          els.reportCancel.textContent = "Close";
          says("Thank you. A person will read this. You will not hear back unless we need to ask you something.", "good");
        })
        .catch(function () {
          els.reportSend.disabled = false;
          says(refusalSentence(REPORT_REFUSAL.TRANSPORT_FAILED), "bad");
        });
    }

    /* Matched on the CODE, never on the server's message text -- the rule
       every other gate in this codebase follows, and the reason shareService.js
       was rebuilt around a code in the first place. */
    function refusalSentence(code) {
      if (code === REPORT_REFUSAL.RATE_LIMITED) return "That is a lot of reports from here. Try again in a few minutes.";
      if (code === REPORT_REFUSAL.BAD_CODE) return "That code did not match. Check the email and try again.";
      if (code === REPORT_REFUSAL.NOT_READY) return "Reporting is not open on this page yet. Nothing was sent.";
      return "That could not be sent. Nothing about you was recorded.";
    }

    /* =======================================================================
       RENDER
       ======================================================================= */

    /**
     * @param snapshot the NORMALIZED snapshot -- what the server stores and
     *        what a reader is sent. Never a book, never a draft.
     * @param view {
     *   openByDefault, byline, avatarId, token, preview
     * } -- everything the snapshot does not carry, or carries in a form this
     *      renderer should not re-derive. `byline` in particular is computed
     *      once by the host from displayName/handle/anonymous, so an anonymous
     *      snapshot cannot be given a name by a second derivation here.
     */
    function render(snapshot, view) {
      var seen = view || {};
      state.snapshot = snapshot || null;
      state.byline = clampText(seen.byline, 120);
      state.avatarId = state.byline ? normalizeAvatarId(seen.avatarId) : 0;
      state.token = String(seen.token || "");
      state.preview = seen.preview === true;

      var cover = coverFrom ? coverFrom(snapshot) : coverPartsFrom(snapshot && snapshot.coverColor);
      els.root.style.setProperty("--pbs-cover-base", safeColor(cover && cover.base, "#5b3a29"));
      els.root.style.setProperty("--pbs-cover-edge", safeColor(cover && cover.edge, "#3c2419"));
      els.root.style.setProperty("--pbs-cover-ink", safeColor(cover && cover.ink, "#f3e6d4"));

      var title = clampText(snapshot && snapshot.title, 200) || "Untitled";
      els.title.textContent = title;
      els.coverTitle.textContent = title;

      var description = clampText(snapshot && snapshot.description, 500);
      els.desc.textContent = description;
      els.desc.hidden = !description;

      els.coverByline.textContent = state.byline;
      els.coverByline.hidden = !state.byline;
      els.coverRule.hidden = !state.byline;

      /* WHAT THE READER HAD, BEFORE THIS RENDER REPLACES IT. The share sheet
         re-sends on every keystroke, and throwing the reader back to a closed
         book at page one WHILE THEY ARE LOOKING AT IT is the difference between
         a live preview and a flicker. Only kept when the caller asks: an
         arrival always starts the book the way the writer chose. */
      var keep = seen.keepView === true
        ? { open: state.open, index: state.index, cameraTouched: state.cameraTouched, camera: {
            pitch: state.camera.pitch, yaw: state.camera.yaw,
            zoom: state.camera.zoom, panX: state.camera.panX, panY: state.camera.panY } }
        : null;

      var pages = snapshot && Object.prototype.toString.call(snapshot.pages) === "[object Array]"
        ? snapshot.pages
        : [];
      state.pages = pages.slice(0, MAX_PAGES);
      state.index = 0;
      state.perSpread = computePerSpread();

      paintFacts();
      paintSide();
      els.badge.hidden = !state.preview;

      /* THE WRITER'S CHOICE, HONOURED EXACTLY. A book published "open" opens
         the moment the link does; a book published "closed" waits for the
         reader. It is one boolean and it is the difference between handing
         somebody a book and handing them an open book. */
      state.open = false;
      els.closed.hidden = false;
      els.open.hidden = true;
      setOpen(keep ? keep.open : seen.openByDefault === true);
      if (state.open && keep) {
        /* Clamped, because the edit may have removed pages from under them. */
        state.index = clampNumber(keep.index, 0, Math.max(0, state.pages.length - 1), 0);
        paintSpread();
      }
      if (!state.open) {
        paintStacks();
        paintIndicator();
      }
      paintOpenControls();
      if (keep) {
        /* setOpen() above may have launched a pitch flight. The reader's own
           camera is about to be restored over the top of it, so retire it --
           without this the flight lands two frames later and drags the view off
           the angle the reader had set. */
        cancelPitchFlight();
        state.camera.pitch = keep.camera.pitch;
        state.camera.yaw = keep.camera.yaw;
        state.camera.zoom = keep.camera.zoom;
        state.camera.panX = keep.camera.panX;
        state.camera.panY = keep.camera.panY;
        /* AND THE FLAG. setOpen() above calls fitCamera(), which clears it, so
           restoring the five numbers without this left the next window resize
           free to throw away the zoom they describe -- the exact thing the flag
           exists to prevent. */
        state.cameraTouched = keep.cameraTouched;
        applyCamera();
      } else {
        resetCamera();
      }
      return true;
    }

    function mount(host) {
      var target = host || opt.host;
      if (!target) throw new Error("The public book scene needs an element to mount into.");
      target.textContent = "";
      target.appendChild(buildSkeleton());
      bindStage();
      bindControls();
      applyCamera();
      return els.root;
    }

    /* THE OTHER HALF OF on(). Removes every listener, cancels every frame and
       every timer, and empties the host. render() -> destroy() -> mount() must
       leave exactly the number of live listeners one mount leaves. */
    function destroy() {
      for (var i = 0; i < listeners.length; i += 1) {
        var entry = listeners[i];
        try { entry.target.removeEventListener(entry.type, entry.handler, entry.options); }
        catch (error) { /* the node is already gone; nothing to undo */ }
      }
      listeners.length = 0;
      if (win) {
        for (var f = 0; f < frames.length; f += 1) {
          if (typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(frames[f]);
        }
        for (var t = 0; t < timers.length; t += 1) win.clearTimeout(timers[t]);
      }
      frames.length = 0;
      timers.length = 0;
      hintTimer = 0;
      pointers = {};
      drag = null;
      pinch = null;
      if (els.root && els.root.parentNode) els.root.parentNode.removeChild(els.root);
      els = {};
    }

    return {
      mount: mount,
      render: render,
      destroy: destroy,
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      turn: turn,
      resetCamera: resetCamera,
      openReport: openReport,
      closeReport: closeReport,
      /* For tests and for a host that wants to mirror the camera. Returns a
         COPY: a caller that could mutate the live state would be a second
         owner of it. */
      snapshotState: function () {
        return {
          open: state.open,
          index: state.index,
          perSpread: state.perSpread,
          pageCount: state.pages.length,
          byline: state.byline,
          avatarId: state.avatarId,
          preview: state.preview,
          animating: state.animating,
          camera: {
            pitch: state.camera.pitch,
            yaw: state.camera.yaw,
            zoom: state.camera.zoom,
            panX: state.camera.panX,
            panY: state.camera.panY
          }
        };
      },
      node: function () { return els.root || null; }
    };
  }

  var api = {
    VERSION: VERSION,
    AVATAR_ART: AVATAR_ART,
    REPORT_REASONS: REPORT_REASONS,
    REPORT_REFUSAL: REPORT_REFUSAL,
    PITCH_DEFAULT: PITCH_DEFAULT,
    PITCH_READING: PITCH_READING,
    PITCH_FLIGHT_MS: PITCH_FLIGHT_MS,
    SHEET_SCALE_FLOOR: SHEET_SCALE_FLOOR,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    FLIP_MS: FLIP_MS,
    MAX_PAGES: MAX_PAGES,
    coverPartsFrom: coverPartsFrom,
    normalizeAvatarId: normalizeAvatarId,
    safeColor: safeColor,
    createScene: createScene
  };

  if (typeof window !== "undefined") window.MakullvenyPublicBookScene = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
