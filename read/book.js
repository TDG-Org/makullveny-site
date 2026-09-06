/*
  THE BOOK EXPERIENCE. A closed cover on a small warm desk scene; opening it
  reveals a two-page spread (wide) or one page at a time (narrow), with a
  simple, real page-turn transition, pinch/drag zoom, and an optional,
  synthesized page-turn sound that is off until the reader turns it on.

  Reads only window.MakullvenyReader's shared, DOM-free helpers — no second
  copy of the sanitizer or the color/token logic lives here.
*/
(function () {
  "use strict";
  /*
    LOOKED UP LAZILY, NOT AT LOAD TIME. book.js loads before read.js (so its
    synchronous owner-preview path — see read.js's open() — can already find
    window.MakullvenyBookReader defined). read.js is the one that sets
    window.MakullvenyReader, and it always does so before it ever calls
    render() below, so this is safe despite the load order.
  */
  var R;

  var MAX_PAGES = 500; /* mirrors mak_publication_read's max_pages_per_item */
  var ZOOM_MIN = 0.6, ZOOM_MAX = 2.5, ZOOM_STEP = 0.15;

  var state = {
    pages: [],
    index: 0,        /* left-page index of the current spread, or the single page */
    perSpread: 2,
    zoom: 1,
    soundOn: false,
    audioCtx: null,
    animating: false,
    timers: []
  };

  function el(id) { return document.getElementById(id); }

  /*
    ── EVERY LISTENER THIS FILE OWNS IS WRITTEN DOWN ───────────────────────
    render() is not guaranteed to run once. The owner-preview host can set a
    fresh snapshot and call it again, and a future in-page "open another
    reading" would too. Before this, bindControlsOnce() was guarded but
    tendCandle() and attachPanning() were NOT — they sat outside the guard in
    render(), so a second render stacked a second candle-sync pair and a
    second complete pointer/wheel set on the viewport, and every pinch after
    that ran the zoom maths twice.

    So installation goes through on() and is recorded, and teardown() removes
    exactly what was recorded. THERE IS ONE removeEventListener FOR EVERY
    addEventListener IN THIS FILE — that is the invariant, and it is why
    nothing here calls addEventListener directly any more.
  */
  var listeners = [];

  function on(target, type, handler, options) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push({ target: target, type: type, handler: handler, options: options });
  }

  function removeAllListeners() {
    for (var i = 0; i < listeners.length; i += 1) {
      var entry = listeners[i];
      try {
        entry.target.removeEventListener(entry.type, entry.handler, entry.options);
      } catch (error) {
        /* The node or the media-query list is already gone; nothing to undo. */
      }
    }
    listeners.length = 0;
  }

  function clearTimers() {
    for (var i = 0; i < state.timers.length; i += 1) window.clearTimeout(state.timers[i]);
    state.timers.length = 0;
  }

  function later(fn, ms) {
    var id = window.setTimeout(function () { fn(); }, ms);
    state.timers.push(id);
    return id;
  }

  /* ── the paper-shuffle sound: synthesized, never a shipped audio file ──── */

  /*
    NO AudioContext EXISTS UNTIL A READER ASKS FOR ONE. This is called from
    playPageTurn(), which returns immediately unless state.soundOn is true,
    and state.soundOn only becomes true inside the Sound button's click
    handler. Nothing at load time and nothing in render() reaches this
    function — so a reader who never presses Sound never has an audio graph,
    an autoplay prompt, or the battery cost of a running context.
  */
  function ensureAudioCtx() {
    if (state.audioCtx) return state.audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    state.audioCtx = new Ctx();
    return state.audioCtx;
  }

  /* Turning sound off gives the context back rather than parking it: a
     suspended-but-live AudioContext still holds a device handle. */
  function closeAudioCtx() {
    if (!state.audioCtx) return;
    try {
      state.audioCtx.close();
    } catch (error) {
      /* Already closed, or closing twice — either way there is nothing held. */
    }
    state.audioCtx = null;
  }

  function playPageTurn() {
    if (!state.soundOn) return;
    var ctx = ensureAudioCtx();
    if (!ctx) return;
    var duration = 0.22;
    var buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) {
      var t = i / data.length;
      /* white noise shaped by a fast attack / longer decay envelope — a soft
         paper-like hiss, not a tone. */
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
    }
    var source = ctx.createBufferSource();
    source.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    var gain = ctx.createGain();
    gain.gain.value = 0.18;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  /* ── layout ─────────────────────────────────────────────────────────── */

  function computePerSpread() {
    var viewport = el("bookViewport");
    if (!viewport) return 1;
    return viewport.clientWidth >= 620 ? 2 : 1;
  }

  function pageNode(page) {
    var section = document.createElement("div");
    section.className = "book-page";
    if (page && page.title) {
      var heading = document.createElement("p");
      heading.className = "book-page-label";
      heading.textContent = String(page.title).slice(0, 200);
      section.appendChild(heading);
    }
    var body = document.createElement("div");
    body.className = "book-page-body";
    R.sanitizeInto(body, page && page.html);
    section.appendChild(body);
    return section;
  }

  function renderSpread() {
    var host = el("bookLeaves");
    if (!host) return;
    host.innerHTML = "";
    var count = Math.min(state.perSpread, state.pages.length - state.index);
    for (var i = 0; i < Math.max(count, 1); i += 1) {
      var page = state.pages[state.index + i];
      /* An empty page stays empty on purpose — it is part of the book. */
      host.appendChild(pageNode(page || { html: "" }));
    }
    host.className = "book-leaves book-leaves-" + (state.perSpread === 2 ? "spread" : "single");
    updateIndicator();
  }

  function updateIndicator() {
    var node = el("bookPageIndicator");
    if (!node) return;
    var total = state.pages.length;
    var last = Math.min(state.index + state.perSpread, total);
    node.textContent = total === 0 ? "No pages" : (state.index + 1) + (last > state.index + 1 ? "–" + last : "") + " of " + total;
    var prev = el("bookPrev"), next = el("bookNext");
    if (prev) prev.disabled = state.index <= 0;
    if (next) next.disabled = state.index + state.perSpread >= total;
  }

  function goTo(newIndex, playSound) {
    var total = state.pages.length;
    var clamped = Math.max(0, Math.min(newIndex, Math.max(0, total - state.perSpread)));
    if (clamped === state.index || state.animating) return;
    state.index = clamped;

    var host = el("bookLeaves");
    if (!host || R.prefersReducedMotion()) {
      renderSpread();
      if (playSound) playPageTurn();
      return;
    }
    state.animating = true;
    host.classList.add("book-leaves-turning");
    if (playSound) playPageTurn();
    later(function () {
      renderSpread();
      host.classList.remove("book-leaves-turning");
      host.classList.add("book-leaves-settling");
      later(function () {
        host.classList.remove("book-leaves-settling");
        state.animating = false;
      }, 220);
    }, 200);
  }

  /* ── zoom / pan ─────────────────────────────────────────────────────── */

  function applyZoom(z) {
    state.zoom = R.clampNumber(z, ZOOM_MIN, ZOOM_MAX, 1);
    var host = el("bookLeaves");
    if (host) host.style.transform = "scale(" + state.zoom + ")";
    var label = el("bookZoomReset");
    if (label) label.textContent = Math.round(state.zoom * 100) + "%";
    var viewport = el("bookViewport");
    if (viewport) viewport.classList.toggle("book-viewport-zoomed", state.zoom > 1.02);
  }

  function fitZoom() {
    var viewport = el("bookViewport"), host = el("bookLeaves");
    if (!viewport || !host) return;
    var naturalWidth = host.scrollWidth / state.zoom || 1;
    var target = Math.min(1, (viewport.clientWidth - 24) / naturalWidth);
    applyZoom(R.clampNumber(target, ZOOM_MIN, 1, 1));
  }

  function attachPanning(viewport) {
    var dragging = false, lastX = 0, lastY = 0;
    var pointers = {}; /* pinch tracking */

    on(viewport, "pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var count = Object.keys(pointers).length;
      if (count === 1 && state.zoom > 1.02) {
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        viewport.setPointerCapture(e.pointerId);
      }
    });
    on(viewport, "pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!viewport._pinchStart) viewport._pinchStart = { dist: dist, zoom: state.zoom };
        else applyZoom(viewport._pinchStart.zoom * (dist / (viewport._pinchStart.dist || 1)));
        return;
      }
      if (dragging) {
        viewport.scrollLeft -= (e.clientX - lastX);
        viewport.scrollTop -= (e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
      }
    });
    function release(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) viewport._pinchStart = null;
      dragging = false;
    }
    on(viewport, "pointerup", release);
    on(viewport, "pointercancel", release);
    on(viewport, "pointerleave", release);

    on(viewport, "wheel", function (e) {
      if (!e.ctrlKey) return; /* trackpad pinch reports as wheel+ctrlKey */
      e.preventDefault();
      applyZoom(state.zoom - e.deltaY * 0.01);
    }, { passive: false });
  }

  /* ── candle: paused off-screen or when motion is reduced ─────────────── */

  /* Held so render() can re-sync on every call while the LISTENERS are only
     installed once — the state has to be reapplied per render, the wiring
     must not be. */
  var candleSync = null;

  function tendCandle(scope) {
    var candle = scope.querySelector(".candle");
    if (!candle) return;
    candleSync = function () {
      var still = R.prefersReducedMotion() || document.hidden;
      candle.classList.toggle("candle-still", still);
    };
    candleSync();
    on(document, "visibilitychange", candleSync);
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      /* Safari below 14 has only the deprecated addListener, which has no
         tracked-removal counterpart here; skipping it costs a live update of
         a preference that almost never changes mid-read. */
      if (mq.addEventListener) on(mq, "change", candleSync);
    }
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  /*
    ALL of this file's listener installation happens here, behind one guard —
    the candle and the viewport panning included. Nothing outside this
    function calls on().
  */
  function bindControlsOnce(scene) {
    if (bindControlsOnce._bound) return;
    bindControlsOnce._bound = true;

    var cover = el("bookCover");
    on(cover, "click", openBook);
    on(cover, "keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBook(); }
    });

    on(el("bookPrev"), "click", function () { goTo(state.index - state.perSpread, true); });
    on(el("bookNext"), "click", function () { goTo(state.index + state.perSpread, true); });
    on(el("bookZoomIn"), "click", function () { applyZoom(state.zoom + ZOOM_STEP); });
    on(el("bookZoomOut"), "click", function () { applyZoom(state.zoom - ZOOM_STEP); });
    on(el("bookZoomReset"), "click", function () { applyZoom(1); });
    on(el("bookZoomFit"), "click", fitZoom);
    on(el("bookSound"), "click", function () {
      state.soundOn = !state.soundOn;
      /* Off means OFF: the graph is released, not merely muted. */
      if (!state.soundOn) closeAudioCtx();
      this.setAttribute("aria-pressed", String(state.soundOn));
      this.setAttribute("aria-label", "Page-turn sound: " + (state.soundOn ? "on" : "off"));
      this.textContent = "Sound: " + (state.soundOn ? "On" : "Off");
    });

    /* Gated on this renderer's OWN top-level scene node, exactly as
       blueprint.js gates on #blueprintScene — both handlers live on document,
       and only one of the two scenes is ever shown. The inner check stays
       because arrow keys must do nothing while the book is still closed. */
    on(document, "keydown", function (e) {
      if (el("bookScene").hidden) return;
      if (el("bookReading").hidden) return;
      if (e.key === "ArrowLeft") goTo(state.index - state.perSpread, true);
      else if (e.key === "ArrowRight") goTo(state.index + state.perSpread, true);
      else if (e.key === "+" || e.key === "=") applyZoom(state.zoom + ZOOM_STEP);
      else if (e.key === "-") applyZoom(state.zoom - ZOOM_STEP);
      else if (e.key === "0") applyZoom(1);
    });

    on(window, "resize", function () {
      var next = computePerSpread();
      if (next !== state.perSpread) { state.perSpread = next; renderSpread(); }
    });

    tendCandle(scene);
    attachPanning(el("bookViewport"));
  }

  /*
    THE OTHER HALF OF on(). Removes every listener this file installed, drops
    the pending page-turn timers, releases the AudioContext, and resets the
    bind guard so a later render() rebuilds cleanly. render() -> teardown() ->
    render() must leave exactly the same number of live listeners as a single
    render().
  */
  function teardown() {
    removeAllListeners();
    clearTimers();
    closeAudioCtx();
    candleSync = null;
    bindControlsOnce._bound = false;
    state.animating = false;
    var viewport = el("bookViewport");
    if (viewport) viewport._pinchStart = null;
  }

  function openBook() {
    el("bookCover").hidden = true;
    el("bookReading").hidden = false;
    state.perSpread = computePerSpread();
    renderSpread();
    el("bookViewport").focus({ preventScroll: true });
  }

  function render(snapshot, opts) {
    R = window.MakullvenyReader;
    var scene = el("bookScene");
    scene.hidden = false;
    /*
      The writer's EXACT cover colour when the snapshot carries a valid
      `coverColor`, and the legacy accent-name palette when it does not — see
      read.js's coverFromSnapshot() for the contract and the arithmetic.
      Every value still goes through safeColor() on the way into CSS: this
      renderer must not be the reason a future contract change can put a raw
      string into a custom property.
    */
    var cover = R.coverFromSnapshot(snapshot);
    scene.style.setProperty("--book-cover-base", R.safeColor(cover.base, "#5b3a29"));
    scene.style.setProperty("--book-cover-edge", R.safeColor(cover.edge, "#3c2419"));
    scene.style.setProperty("--book-cover-ink", R.safeColor(cover.ink, "#f3e6d4"));

    var title = R.clampText(snapshot.title, 200) || "Untitled";
    el("bookCoverTitle").textContent = title;
    var coverByline = el("bookCoverByline");
    coverByline.textContent = opts.byline;
    coverByline.hidden = !opts.byline;

    el("bookTitle").textContent = title;
    var titleByline = el("bookByline");
    titleByline.textContent = opts.byline;
    titleByline.hidden = !opts.byline;
    var desc = el("bookDescription");
    desc.textContent = R.clampText(snapshot.description, 500);
    desc.hidden = !snapshot.description;

    var pages = Object.prototype.toString.call(snapshot.pages) === "[object Array]" ? snapshot.pages : [];
    state.pages = pages.slice(0, MAX_PAGES);
    state.index = 0;

    var credits = R.clampCredits(snapshot.credits, 40, 120);
    var list = el("bookCreditsList");
    /* Emptied first so a second render() replaces the credits rather than
       appending a second copy of them. */
    list.innerHTML = "";
    for (var c = 0; c < credits.length; c += 1) {
      var item = document.createElement("li");
      item.textContent = credits[c];
      list.appendChild(item);
    }
    el("bookCredits").hidden = !credits.length;

    bindControlsOnce(scene);
    /* Re-applied every render; the listeners behind it are installed once. */
    if (candleSync) candleSync();
    applyZoom(1);
  }

  window.MakullvenyBookReader = { render: render, teardown: teardown };
})();
