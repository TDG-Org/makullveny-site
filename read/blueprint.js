/*
  THE BLUEPRINT EXPERIENCE. Read-only, vector, drafting-desk styled. No book
  metaphor: blueprints are ordered sheets of strokes and text, and this file
  draws exactly those, in exactly that order, on exactly the paper style the
  writer chose.

  SECURITY NOTE: nothing here ever parses a string of markup. Every SVG node
  is built with createElementNS and every attribute is a validated number or a
  string checked against read.js's safeColor()/clampNumber(). A hostile
  snapshot cannot inject an element, an event handler, or a url() — there is
  no innerHTML path from the network response to this DOM at all.
*/
(function () {
  "use strict";
  /* Looked up lazily — see book.js's header comment for why. */
  var R;

  var MAX_SHEETS = 24;
  /*
    MAX_STROKES_TOTAL IS A TOTAL, AND IT DID NOT USED TO BE. It was spent
    fresh inside renderSheet() for every sheet, so its name promised 4000 and
    its behaviour allowed 24 x 4000 = 96,000 paths from one snapshot. The
    budget is now spent ONCE, at render() time, across the sheets in order —
    so a hostile payload cannot buy more drawing by splitting it up — and a
    per-sheet cap sits under it so one sheet cannot swallow the whole
    allowance and leave every later sheet blank.
  */
  var MAX_STROKES_TOTAL = 4000;
  var MAX_STROKES_PER_SHEET = 1200;
  var MAX_TEXTS_PER_SHEET = 200;
  var MAX_POINTS_PER_STROKE = 20000;
  var MAX_COORD = 1e6;
  var ZOOM_MIN = 0.4, ZOOM_MAX = 4, ZOOM_STEP = 0.2;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var state = { sheets: [], index: 0, zoom: 1 };

  function el(id) { return document.getElementById(id); }

  /*
    ── LISTENER BOOKKEEPING ────────────────────────────────────────────────
    Same contract as book.js: every listener this file installs is recorded
    and teardown() removes exactly those. bindOnce() already guarded the
    installation correctly (attachPanning is called from INSIDE it, which is
    the bug book.js had); what was missing was the way back out.
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
        /* Node already gone; nothing to undo. */
      }
    }
    listeners.length = 0;
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var key in attrs) if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
    return node;
  }

  var DASH = { dashed: "10 8", dotted: "2 6" };

  function strokeToPath(stroke) {
    var points = Object.prototype.toString.call(stroke && stroke.points) === "[object Array]" ? stroke.points : [];
    points = points.slice(0, MAX_POINTS_PER_STROKE);
    if (points.length < 2) return null;
    var d = "";
    for (var i = 0; i < points.length; i += 1) {
      var p = points[i];
      var x = R.clampNumber(p && p.x, -MAX_COORD, MAX_COORD, null);
      var y = R.clampNumber(p && p.y, -MAX_COORD, MAX_COORD, null);
      if (x === null || y === null) continue;
      d += (d ? " L " : "M ") + x + " " + y;
    }
    if (!d) return null;
    var path = svgEl("path", {
      d: d,
      fill: "none",
      stroke: R.safeColor(stroke.color, "#2b3a4a"),
      "stroke-opacity": R.clampNumber(stroke.opacity, 0, 1, 1),
      "stroke-width": R.clampNumber(stroke.lineWidth, 0.25, 200, 2),
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    var dash = DASH[stroke.style];
    if (dash) path.setAttribute("stroke-dasharray", dash);
    return path;
  }

  function textToNode(item) {
    var x = R.clampNumber(item && item.x, -MAX_COORD, MAX_COORD, null);
    var y = R.clampNumber(item && item.y, -MAX_COORD, MAX_COORD, null);
    if (x === null || y === null) return null;
    var node = svgEl("text", {
      x: x, y: y,
      fill: R.safeColor(item.color, "#2b3a4a"),
      "font-size": R.clampNumber(item.size, 6, 400, 16),
      "font-family": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    });
    /* textContent only — never innerHTML — so nothing in the string can ever
       become a node. */
    node.textContent = String((item && item.text) || "").slice(0, 200);
    return node;
  }

  /*
    THE VIEWBOX IS MEASURED FROM THE SAME NUMBERS THE PATH IS DRAWN FROM.
    strokeToPath() and textToNode() clamp every coordinate to +/-MAX_COORD, so
    measuring the RAW values here (which is what this did — isFinite only)
    meant one point at 1e300 produced an absurd viewBox and scaled the whole
    sheet into an invisible speck, while the drawn geometry stayed inside a
    million units. Same clamp, same window, on both paths.
  */
  function sheetExtent(sheet) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function consider(rawX, rawY) {
      var x = R.clampNumber(rawX, -MAX_COORD, MAX_COORD, null);
      var y = R.clampNumber(rawY, -MAX_COORD, MAX_COORD, null);
      if (x === null || y === null) return;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    (sheet.strokes || []).forEach(function (s) {
      ((s && s.points) || []).forEach(function (p) { consider(p && p.x, p && p.y); });
    });
    (sheet.texts || []).forEach(function (t) { consider(t && t.x, t && t.y); });
    if (!isFinite(minX)) return { x: 0, y: 0, w: 800, h: 600 };
    var pad = 40;
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2 || 800, h: (maxY - minY) + pad * 2 || 600 };
  }

  function renderSheet(sheet, index, total) {
    var extent = sheetExtent(sheet);
    var svg = svgEl("svg", {
      viewBox: extent.x + " " + extent.y + " " + extent.w + " " + extent.h,
      preserveAspectRatio: "xMidYMid meet",
      role: "img",
      "aria-label": "Blueprint sheet " + (index + 1) + " of " + total
    });
    svg.setAttribute("class", "blueprint-sheet blueprint-paper-" + (["grid", "fine", "dots", "plain"].indexOf(sheet.paper) >= 0 ? sheet.paper : "grid"));

    /* Already trimmed against the running total in render(); the per-sheet cap
       is repeated here so this function is safe on its own terms too. */
    var strokes = Object.prototype.toString.call(sheet.strokes) === "[object Array]" ? sheet.strokes : [];
    var drawable = Math.min(strokes.length, MAX_STROKES_PER_SHEET);
    for (var i = 0; i < drawable; i += 1) {
      var path = strokeToPath(strokes[i]);
      if (path) svg.appendChild(path);
    }
    var texts = Object.prototype.toString.call(sheet.texts) === "[object Array]" ? sheet.texts : [];
    for (var t = 0; t < Math.min(texts.length, MAX_TEXTS_PER_SHEET); t += 1) {
      var node = textToNode(texts[t]);
      if (node) svg.appendChild(node);
    }
    return svg;
  }

  function paintCurrent() {
    var host = el("blueprintSheetWrap");
    host.innerHTML = "";
    var sheet = state.sheets[state.index];
    if (sheet) host.appendChild(renderSheet(sheet, state.index, state.sheets.length));
    host.style.transform = "scale(" + state.zoom + ")";
    var indicator = el("bpSheetIndicator");
    indicator.textContent = state.sheets.length ? ("Sheet " + (state.index + 1) + " of " + state.sheets.length) : "No sheets";
    el("bpPrev").disabled = state.index <= 0;
    el("bpNext").disabled = state.index >= state.sheets.length - 1;
  }

  function applyZoom(z) {
    state.zoom = R.clampNumber(z, ZOOM_MIN, ZOOM_MAX, 1);
    var host = el("blueprintSheetWrap");
    if (host) host.style.transform = "scale(" + state.zoom + ")";
    el("bpZoomReset").textContent = Math.round(state.zoom * 100) + "%";
  }

  function fitZoom() {
    var viewport = el("blueprintViewport"), host = el("blueprintSheetWrap");
    if (!viewport || !host) return;
    var natural = host.scrollWidth / state.zoom || 1;
    applyZoom(R.clampNumber((viewport.clientWidth - 24) / natural, ZOOM_MIN, ZOOM_MAX, 1));
  }

  function attachPanning(viewport) {
    var dragging = false, lastX = 0, lastY = 0;
    on(viewport, "pointerdown", function (e) {
      if (state.zoom <= 1.02) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      viewport.setPointerCapture(e.pointerId);
    });
    on(viewport, "pointermove", function (e) {
      if (!dragging) return;
      viewport.scrollLeft -= (e.clientX - lastX);
      viewport.scrollTop -= (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
    });
    function release() { dragging = false; }
    on(viewport, "pointerup", release);
    on(viewport, "pointercancel", release);
    on(viewport, "pointerleave", release);
    on(viewport, "wheel", function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyZoom(state.zoom - e.deltaY * 0.01);
    }, { passive: false });
  }

  function bindOnce() {
    if (bindOnce._bound) return;
    bindOnce._bound = true;
    on(el("bpPrev"), "click", function () { if (state.index > 0) { state.index -= 1; paintCurrent(); } });
    on(el("bpNext"), "click", function () { if (state.index < state.sheets.length - 1) { state.index += 1; paintCurrent(); } });
    on(el("bpZoomIn"), "click", function () { applyZoom(state.zoom + ZOOM_STEP); });
    on(el("bpZoomOut"), "click", function () { applyZoom(state.zoom - ZOOM_STEP); });
    on(el("bpZoomReset"), "click", function () { applyZoom(1); });
    on(el("bpZoomFit"), "click", fitZoom);
    /* Gated on this renderer's own top-level scene node — the mirror of the
       #bookScene check in book.js. */
    on(document, "keydown", function (e) {
      if (el("blueprintScene").hidden) return;
      if (e.key === "ArrowLeft" && state.index > 0) { state.index -= 1; paintCurrent(); }
      else if (e.key === "ArrowRight" && state.index < state.sheets.length - 1) { state.index += 1; paintCurrent(); }
      else if (e.key === "+" || e.key === "=") applyZoom(state.zoom + ZOOM_STEP);
      else if (e.key === "-") applyZoom(state.zoom - ZOOM_STEP);
      else if (e.key === "0") applyZoom(1);
    });
    attachPanning(el("blueprintViewport"));
  }

  /* The other half of on(): removes every listener this file installed and
     resets the guard, so render() -> teardown() -> render() leaves exactly
     the listener count of a single render(). This renderer holds no timer, no
     observer and no AudioContext — there is nothing else to release. */
  function teardown() {
    removeAllListeners();
    bindOnce._bound = false;
  }

  function render(snapshot, opts) {
    R = window.MakullvenyReader;
    var scene = el("blueprintScene");
    scene.hidden = false;
    /* The writer's exact cover colour when the contract supplies one, the
       legacy accent-name palette otherwise — see read.js's
       coverFromSnapshot(). safeColor() still guards the way into CSS. */
    var cover = R.coverFromSnapshot(snapshot);
    scene.style.setProperty("--blueprint-accent", R.safeColor(cover.base, "#1c2a3a"));

    el("blueprintTitle").textContent = R.clampText(snapshot.title, 200) || "Untitled";
    var byline = el("blueprintByline");
    byline.textContent = opts.byline;
    byline.hidden = !opts.byline;
    var desc = el("blueprintDescription");
    desc.textContent = R.clampText(snapshot.description, 500);
    desc.hidden = !snapshot.description;

    var scaleNode = el("blueprintScale");
    var scale = snapshot.scale;
    if (scale && isFinite(scale.per) && scale.per > 0 && typeof scale.unit === "string" && /^[a-zA-Z" ']{1,12}$/.test(scale.unit)) {
      scaleNode.textContent = "Scale: 1 square = " + scale.per + " " + scale.unit;
      scaleNode.hidden = false;
    } else {
      scaleNode.hidden = true;
    }

    var sheets = Object.prototype.toString.call(snapshot.sheets) === "[object Array]" ? snapshot.sheets : [];
    /* Each sheet inherits the top-level paper style so renderSheet can read
       sheet.paper uniformly, without inventing a per-sheet field the
       contract does not define. */
    /* THE STROKE BUDGET IS SPENT HERE, ONCE, IN SHEET ORDER. Earlier sheets
       get what they ask for up to the per-sheet cap; when the running total
       runs out, later sheets draw nothing rather than the whole snapshot
       drawing 24 x MAX_STROKES_TOTAL paths. */
    var budget = MAX_STROKES_TOTAL;
    state.sheets = sheets.slice(0, MAX_SHEETS).map(function (sheet) {
      var raw = Object.prototype.toString.call(sheet && sheet.strokes) === "[object Array]" ? sheet.strokes : [];
      var take = Math.min(raw.length, MAX_STROKES_PER_SHEET, budget);
      budget -= take;
      return { strokes: raw.slice(0, take), texts: sheet && sheet.texts, paper: snapshot.paper };
    });
    state.index = 0;

    var credits = R.clampCredits(snapshot.credits, 40, 120);
    var list = el("blueprintCreditsList");
    /* Emptied first so a second render() replaces the credits, never doubles
       them. */
    list.innerHTML = "";
    for (var c = 0; c < credits.length; c += 1) {
      var item = document.createElement("li");
      item.textContent = credits[c];
      list.appendChild(item);
    }
    el("blueprintCredits").hidden = !credits.length;

    bindOnce();
    applyZoom(1);
    paintCurrent();
  }

  window.MakullvenyBlueprintReader = { render: render, teardown: teardown };
})();
