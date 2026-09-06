/*
  THE READ-ONLY VIEWER's core: config, the fetch, the state machine, and the
  shared utilities book.js and blueprint.js both use. No build step, no
  framework, no dependency. ES5-compatible: this repository has no
  package.json and the README says it must never gain one.

  ─────────────────────────────────────────────────────────────────────────────
  IT MAKES EXACTLY ONE REQUEST
  ─────────────────────────────────────────────────────────────────────────────
  A POST to one function, carrying one opaque token, returning one snapshot.
  No Supabase client, no session, no login, no cookie, no second endpoint, no
  analytics. If that call fails, the page says so and stops.

  CONTRACT CONSUMED: makullveny-share@1 / makullveny-blueprint@1, schemaVersion
  1, as committed in the private Makullveny repo's mak-share edge function and
  mak_publication_read (2026-09-05 migrations). That contract is written and
  committed but not yet applied to the live database, so real traffic will see
  "Shared reading is not open yet" until the owner turns it on — this file is
  ready for the day it does.
*/
(function () {
  "use strict";

  /*
    ───────────────────────────────────────────────────────────────────────────
    CONFIG — DELIBERATELY EMPTY IN GIT
    ───────────────────────────────────────────────────────────────────────────
    See read/config.js for the deploy-time injection story. Nothing here is a
    secret and nothing here is a private path.
  */
  /* Guarded rather than assumed, so the pure functions below (tokenFromHash,
     safeColor, accentFromName, coverFromSnapshot, apiOriginAllowed,
     classifySnapshot, stateForStatus, clampNumber, clampText, byline,
     openGraphFields) can be required and unit-tested under plain Node — see
     tests/. Nothing about browser behavior changes: hasWindow is always true
     in a browser. */
  var hasWindow = typeof window !== "undefined";

  var CONFIG = { apiUrl: "", publishableKey: "" };
  if (hasWindow && window.MAKULLVENY_READER_CONFIG) {
    if (window.MAKULLVENY_READER_CONFIG.apiUrl) CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
    if (window.MAKULLVENY_READER_CONFIG.publishableKey) CONFIG.publishableKey = String(window.MAKULLVENY_READER_CONFIG.publishableKey);
  }

  /*
    ───────────────────────────────────────────────────────────────────────────
    THE ONE HOST THIS PAGE MAY TALK TO
    ───────────────────────────────────────────────────────────────────────────
    read/config.js is written at DEPLOY time, which makes it the one input to
    this page that is not reviewed in git. A tampered or simply mis-deployed
    config could otherwise point apiUrl at any host and this page would post
    the reader's token to it. So the origin is pinned here as well, in code,
    and checked BEFORE the request is opened.

    THIS LIST MUST BE KEPT IN STEP WITH THE `connect-src` DIRECTIVE IN
    read/index.html. They are two independent enforcement points for the same
    fact — the browser refuses the connection, and this file refuses to try —
    and deploying this viewer against a different Supabase project means
    changing BOTH, in the same commit.

    The value is not a secret: a publishable project URL travels in every
    client request the app already makes and is committed in the private app
    repository too. Committing it here is correct.
  */
  var ALLOWED_API_ORIGINS = ["https://ddbksawvchsauiuiwvrl.supabase.co"];

  /* True only for an absolute https URL whose ORIGIN (scheme + host + port) is
     exactly one of the entries above. Origin comparison, never a prefix or a
     substring test: "https://ddbksawvchsauiuiwvrl.supabase.co.evil.com" shares
     a prefix with the real host and must be refused. */
  function apiOriginAllowed(url) {
    var raw = String(url == null ? "" : url);
    if (!raw) return false;
    var parsed;
    try {
      parsed = new URL(raw);
    } catch (error) {
      return false;
    }
    if (parsed.protocol !== "https:") return false;
    for (var i = 0; i < ALLOWED_API_ORIGINS.length; i += 1) {
      if (parsed.origin === ALLOWED_API_ORIGINS[i]) return true;
    }
    return false;
  }

  /* The one schema version this build understands, per item kind. Anything
     else is refused honestly rather than rendered wrong — the contract notes
     this check did not exist anywhere before; it is a defensive addition. */
  var SUPPORTED_FORMATS = {
    "makullveny-share@1": { itemKind: "book", schemaVersion: 1 },
    "makullveny-blueprint@1": { itemKind: "blueprint", schemaVersion: 1 }
  };

  /* ───────────────────────────────────────────── shared, DOM-free helpers ─── */

  function clampNumber(value, min, max, fallback) {
    var n = typeof value === "number" ? value : parseFloat(value);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function clampInt(value, min, max, fallback) {
    var n = clampNumber(value, min, max, fallback);
    return Math.round(n);
  }

  /*
    A short-string cryptographic hash is overkill and unavailable synchronously
    here; this is a stable, deterministic string->int fold (djb2), used only to
    pick a color from OUR OWN safe palette below. It never touches anything an
    attacker could turn into markup or a URL.
  */
  function hashString(value) {
    var s = String(value || "");
    var h = 5381;
    for (var i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  /*
    THE CONTRACT SAYS `accent` IS A NAME, NEVER A COLOR VALUE
    (`^[a-z0-9-]{1,32}$`, "name only"). So the reader owns the palette and
    resolves a name to one of ITS OWN safe, tested colors — the server can never
    hand this page a raw CSS value, which forecloses every color-based CSS
    injection and guarantees every cover reads legibly against this scene.
    The exact name enum the app uses was not available to extract precisely, so
    a deterministic hash-to-palette choice is used: the same name always
    resolves to the same color, which is what "the user's saved cover color"
    needs to mean from here, without trusting the string itself as paint.
  */
  var ACCENT_PALETTE = [
    { name: "walnut", base: "#5b3a29", edge: "#3c2419", ink: "#f3e6d4" },
    { name: "evergreen", base: "#2f4a3a", edge: "#1c2f25", ink: "#eef3ea" },
    { name: "moss", base: "#4c5a34", edge: "#333d22", ink: "#f0f2e6" },
    { name: "espresso", base: "#3a2a22", edge: "#231712", ink: "#f1e5d8" },
    { name: "berry", base: "#5c2b3a", edge: "#3a1a24", ink: "#f3e3e7" },
    { name: "denim", base: "#2e4054", edge: "#1c2836", ink: "#e9eef4" },
    { name: "amber", base: "#7a5322", edge: "#4f3516", ink: "#faf0dc" },
    { name: "plum", base: "#4a3358", edge: "#2e2038", ink: "#eee7f2" }
  ];

  function accentFromName(name) {
    var clean = /^[a-z0-9-]{1,32}$/.test(String(name || "")) ? String(name) : "";
    var index = clean ? hashString(clean) % ACCENT_PALETTE.length : 0;
    return ACCENT_PALETTE[index];
  }

  /*
    ───────────────────────────────────────────────────────────────────────────
    THE EXACT COVER COLOUR — A CROSS-REPO CONTRACT
    ───────────────────────────────────────────────────────────────────────────
    The private Makullveny app emits `coverColor` as a canonical LOWERCASE
    six-digit hex string and NOTHING ELSE is valid: not uppercase, not a
    three-digit shorthand, not rgb(), not a named colour. That strictness is
    the point — one canonical spelling means the reader can compare, cache and
    reason about the value, and an input that is not exactly that shape is a
    contract violation rather than something to be helpfully coerced.

    The derived edge and ink are computed with EXACTLY the integer arithmetic
    below, because the app implements the identical formula and a parity test
    compares the two implementations' outputs. Do not "improve" this into a
    gamma-correct relative-luminance calculation: it would be a better colour
    model and a broken contract. The 299/587/114 weights are the classic
    integer YIQ brightness fold, and 150000 is the midpoint of its 0..255000
    range; the 58% edge is the cover's shadowed spine.

    An invalid or absent coverColor falls back to the legacy accent-NAME
    palette above, which is what every snapshot written before this field
    existed carries. Neither ACCENT_PALETTE nor accentFromName may be removed.
  */
  var COVER_COLOR = /^#[0-9a-f]{6}$/;

  function hexByte(value) {
    var s = value.toString(16);
    return s.length < 2 ? "0" + s : s;
  }

  function coverFromSnapshot(snapshot) {
    var raw = String((snapshot && snapshot.coverColor) || "");
    if (!COVER_COLOR.test(raw)) {
      var legacy = accentFromName(snapshot && snapshot.accent);
      return { base: legacy.base, edge: legacy.edge, ink: legacy.ink };
    }
    var r = parseInt(raw.slice(1, 3), 16);
    var g = parseInt(raw.slice(3, 5), 16);
    var b = parseInt(raw.slice(5, 7), 16);
    return {
      base: raw,
      edge: "#" + hexByte(Math.floor((r * 58) / 100)) + hexByte(Math.floor((g * 58) / 100)) + hexByte(Math.floor((b * 58) / 100)),
      ink: (r * 299 + g * 587 + b * 114) >= 150000 ? "#241a12" : "#f6ecdc"
    };
  }

  /* Strict, allowlist-shaped color validation for the blueprint's vector data
     (stroke/text colors). Never trusted as a raw CSS value beyond this check:
     no url(), no calc(), no custom properties, nothing but a hex triplet or an
     rgb()/rgba() call with plain numbers. */
  var HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  var RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;
  function safeColor(value, fallback) {
    var v = String(value || "").trim();
    if (HEX_COLOR.test(v) || RGB_COLOR.test(v)) return v;
    return fallback;
  }

  /* Defense in depth: the server already enforces these lengths
     (max_title_chars 200, max_description_chars 500, max_credit_chars 120,
     max_credits 40 per mak_publication_read), but this page renders whatever
     a network response claims, and a compromised or buggy upstream should
     never be able to hand this page an unbounded string to lay out. */
  function clampText(value, maxLen) {
    return String(value == null ? "" : value).slice(0, maxLen);
  }

  function clampCredits(list, maxCount, maxLen) {
    var arr = Object.prototype.toString.call(list) === "[object Array]" ? list : [];
    return arr.slice(0, maxCount).map(function (c) { return clampText(c, maxLen); });
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ─────────────────────────────────────────── the sanitizer (book pages) ─── */

  /* Same allowlist the app's publish-time gate enforces, minus `font` and
     `strike` — this only has to be a SUBSET of what the app already permits,
     and confirming the two lists line up is exactly what a parity test in
     tests/ does. */
  var ALLOWED_TAGS = {
    A: 1, B: 1, BLOCKQUOTE: 1, BR: 1, CODE: 1, DEL: 1, DIV: 1, EM: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, HR: 1, I: 1, LI: 1, OL: 1,
    P: 1, PRE: 1, S: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1,
    TABLE: 1, TBODY: 1, TD: 1, TH: 1, THEAD: 1, TR: 1, U: 1, UL: 1
  };

  var ALLOWED_CLASSES = {
    "works-cited": 1, "works-cited-apa": 1, "works-cited-heading": 1,
    "works-cited-entry": 1, "page-break": 1, "academic-title": 1,
    "academic-heading-line": 1, "academic-title-page": 1, "academic-title-line": 1
  };

  function keptAttributes(sourceNode, targetNode) {
    var tag = sourceNode.nodeName;
    if (tag === "A") {
      var href = safeHref(sourceNode.getAttribute("href"));
      if (href) {
        targetNode.setAttribute("href", href);
        targetNode.setAttribute("rel", "noopener noreferrer nofollow");
        targetNode.setAttribute("target", "_blank");
      }
    }
    if (tag === "TD" || tag === "TH") {
      copyNumericAttr(sourceNode, targetNode, "colspan");
      copyNumericAttr(sourceNode, targetNode, "rowspan");
    }
    var className = sourceNode.getAttribute && sourceNode.getAttribute("class");
    if (className) {
      var kept = [];
      var parts = String(className).split(/\s+/);
      for (var i = 0; i < parts.length; i += 1) if (ALLOWED_CLASSES[parts[i]] === 1) kept.push(parts[i]);
      if (kept.length) targetNode.setAttribute("class", kept.join(" "));
    }
  }

  function copyNumericAttr(sourceNode, targetNode, name) {
    var raw = sourceNode.getAttribute(name);
    if (!raw) return;
    var value = parseInt(raw, 10);
    if (isFinite(value) && value > 0 && value <= 100) targetNode.setAttribute(name, String(value));
  }

  function safeHref(raw) {
    var value = String(raw || "").trim();
    if (!value) return "";
    if (value.slice(0, 2) === "//") return "";
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
      return "";
    } catch (error) {
      return "";
    }
  }

  var MAX_DEPTH = 60;

  function copyChildren(sourceParent, targetParent, depth) {
    if (depth > MAX_DEPTH) return;
    var nodes = sourceParent.childNodes;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.nodeType === 3) {
        targetParent.appendChild(document.createTextNode(node.nodeValue));
        continue;
      }
      if (node.nodeType !== 1) continue;
      if (ALLOWED_TAGS[node.nodeName] !== 1) {
        copyChildren(node, targetParent, depth + 1);
        continue;
      }
      var copy = document.createElement(node.nodeName.toLowerCase());
      keptAttributes(node, copy);
      copyChildren(node, copy, depth + 1);
      targetParent.appendChild(copy);
    }
  }

  function sanitizeInto(target, html) {
    var parsed;
    try {
      parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    } catch (error) {
      return;
    }
    copyChildren(parsed.body, target, 0);
  }

  /* ───────────────────────────────────────────────────────── the token ─── */

  var TOKEN_PATTERN = /^[a-z2-9]{16,64}$/;

  function tokenFromHash(hashOverride) {
    /* hashOverride exists only so tests/ can call this without a `window` —
       the browser always omits it and gets window.location.hash. */
    var raw = hashOverride != null ? hashOverride : (hasWindow ? window.location.hash : "");
    var hash = String(raw || "").replace(/^#/, "");
    var parts = hash.split("/");
    var last = "";
    for (var i = 0; i < parts.length; i += 1) if (parts[i]) last = parts[i];
    return TOKEN_PATTERN.test(last) ? last : "";
  }

  /*
    ───────────────────────────────────────────────────────────────────────────
    THE TOKEN'S LIFE: OUT OF THE URL, INTO THIS TAB, NOWHERE ELSE
    ───────────────────────────────────────────────────────────────────────────
    A fragment is never sent to a server and never appears in a Referer — but
    it DOES sit in the address bar, in this tab's history entry, and in
    anything the reader copies or screenshots. So the moment a token is
    captured it is moved into sessionStorage (per-tab, per-origin, cleared when
    the tab closes, and read by nothing but this file) and the fragment is
    stripped with replaceState, which rewrites the current history entry
    instead of adding one and — unlike assigning location.hash — fires no
    hashchange, so the reload listener below stays quiet.

    A RELOAD MUST STILL WORK, which is the whole reason for the storage half:
    after the strip there is no token in the URL, so a refresh would otherwise
    show "this link is not complete" on a page the reader was just reading.

    EVERY ONE OF THESE IS WRAPPED. sessionStorage throws outright in some
    privacy modes (not "returns null" — throws on ACCESS), and replaceState
    throws on a file:// or sandboxed document. A working page beats a tidy
    URL, so each failure is swallowed and the fragment is simply left alone.

    The token is never written to the console, to a text node, to a query
    string, or to any link — it exists in this closure, in sessionStorage, and
    in the POST body, and that is the complete list.
  */
  var TOKEN_STORAGE_KEY = "mak.read.token";

  function rememberToken(token) {
    try {
      if (hasWindow && window.sessionStorage) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch (error) {
      /* Storage blocked. The fragment strip below is what actually depends on
         this having worked, so it is skipped too — see captureToken(). */
    }
  }

  function rememberedToken() {
    try {
      if (!hasWindow || !window.sessionStorage) return "";
      var raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
      /* Re-validated on the way OUT as well: storage is per-origin and this
         page must not POST whatever some other script left under this key. */
      return TOKEN_PATTERN.test(String(raw || "")) ? String(raw) : "";
    } catch (error) {
      return "";
    }
  }

  function stripFragment() {
    try {
      if (hasWindow && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (error) {
      /* Leave the fragment where it is. */
    }
  }

  /* A NEW hash always wins over what this tab remembers, so following a second
     share link in the same tab opens the second reading. Storage is only ever
     the fallback for a reload of a URL this page has already stripped. */
  function captureToken() {
    var fromHash = tokenFromHash();
    if (fromHash) {
      rememberToken(fromHash);
      /* Only strip once the token has somewhere else to live — otherwise a
         reader whose storage is blocked would lose the reading on refresh. */
      if (rememberedToken() === fromHash) stripFragment();
      return fromHash;
    }
    return rememberedToken();
  }

  /* ────────────────────────────────────────────────────────── rendering ─── */

  function el(id) { return document.getElementById(id); }

  function setState(message, tone) {
    var node = el("readerState");
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
    node.className = "reader-state" + (tone ? " reader-state-" + tone : "");
  }

  /*
    THE PURE HALF OF writeOpenGraph, SO IT CAN BE TESTED.

    It also enumerates, in one place, EVERY field of a network response this
    page will ever put in front of a reader: title, description and — only
    when the writer did not publish anonymously — a display name. A server
    that starts sending `reason`, `code`, `plan`, `quota`, `egress` or
    `delivery` cannot reach a reader through here, because nothing reads them.
    That is deliberate: those fields describe the OWNER's account, not the
    reading, and a visitor who was handed a link has no business learning why
    a share is unavailable. See stateForStatus() for the same rule applied to
    HTTP status.
  */
  function openGraphFields(snapshot) {
    var snap = snapshot || {};
    var kindLabel = snap.itemKind === "blueprint" ? "A shared blueprint" : "A shared reading";
    var described = !!snap.description;
    return {
      title: clampText(snap.title, 200) || "Untitled",
      description: described ? clampText(snap.description, 500) : kindLabel + " from Makullveny.",
      /* Clamped like every other rendered string. It used to go into the meta
         content attribute unbounded, which was the one string on this page a
         buggy or hostile upstream could make arbitrarily long. */
      author: (snap.anonymous !== true && snap.displayName) ? clampText(snap.displayName, 200) : ""
    };
  }

  function writeOpenGraph(snapshot) {
    var fields = openGraphFields(snapshot);
    document.title = fields.title + " — Makullveny";
    tag("og:title", fields.title);
    tag("og:description", fields.description);
    tag("og:type", "article");
    if (fields.author) tag("article:author", fields.author);
  }

  function tag(property, content) {
    var meta = document.createElement("meta");
    meta.setAttribute("property", property);
    meta.setAttribute("content", String(content));
    document.head.appendChild(meta);
  }

  /* Clamped for the same reason openGraphFields() clamps: this string is laid
     out on the cover and in the toolbar, and nothing but the server's own
     limits currently bounds it. */
  function byline(snapshot) {
    var snap = snapshot || {};
    if (snap.anonymous === true) return "";
    if (snap.displayName) return clampText(snap.displayName, 200);
    if (snap.handle) return "@" + clampText(snap.handle, 64);
    return "";
  }

  /* ─────────────────────────────────────────────────────────── dispatch ─── */

  function refuse(message) { setState(message, "refused"); }

  function classifySnapshot(snapshot) {
    var meta = SUPPORTED_FORMATS[snapshot && snapshot.format];
    if (!meta) return null;
    if (snapshot.schemaVersion !== meta.schemaVersion) return null;
    if (snapshot.itemKind && snapshot.itemKind !== meta.itemKind) return null;
    return meta.itemKind;
  }

  function render(snapshot, isPreview) {
    var kind = classifySnapshot(snapshot);
    if (!kind) {
      refuse("This link uses a version of Makullveny sharing that this page doesn't support yet. Ask the writer to re-share it, or check back after updating your browser tab.");
      return;
    }
    writeOpenGraph(snapshot);
    el("readerArticle").hidden = false;
    if (isPreview) {
      var badge = el("readerPreviewBadge");
      if (badge) badge.hidden = false;
    }
    /* The Print button ships hidden and is revealed HERE and only here — a
       reading has to exist before there is anything to print. It was bound at
       load but never unhidden, which quietly made the whole @media print block
       in read.css unreachable. */
    var print = el("readerPrint");
    if (print) print.hidden = false;
    setState("");
    if (kind === "book" && window.MakullvenyBookReader) {
      window.MakullvenyBookReader.render(snapshot, { byline: byline(snapshot) });
    } else if (kind === "blueprint" && window.MakullvenyBlueprintReader) {
      window.MakullvenyBlueprintReader.render(snapshot, { byline: byline(snapshot) });
    } else {
      refuse("This page could not open that shared item's viewer.");
    }
  }

  /* ─────────────────────────────────────────────────────────── fetching ─── */

  /*
    ONE SENTENCE PER STATE, and every one of them is written to give away
    nothing an attacker walking tokens could use. "Revoked", "expired" and
    "never existed" all collapse to the same not-found sentence.
  */
  function stateForStatus(status) {
    if (status === 429) return { message: "This page is getting a lot of visits right now — wait a moment and try again.", tone: "retry" };
    if (status === 503) return { message: "This share is paused right now. Ask whoever sent it to check back later.", tone: "retry" };
    if (status === 502 || status === 500) return { message: "Something went wrong on Makullveny's end. Try again shortly.", tone: "retry" };
    if (status === 400) return { message: "This link isn't in a format Makullveny recognizes.", tone: "refused" };
    return { message: "This reading is not available. The link may have been revoked, expired, or never existed.", tone: "refused" };
  }

  function open() {
    /*
      OWNER PREVIEW, WITHOUT A NETWORK CALL AND WITHOUT A BYPASSABLE URL.
      The desktop app's own preview window (a privileged, signed-in Electron
      surface — see mak_publication_preview in the private repo) can load this
      exact page and set window.MAKULLVENY_PREVIEW_SNAPSHOT before this script
      runs, using the same host mechanism it already uses for every other
      pop-out. A stranger typing #preview into a browser has no such global —
      there is nothing here for a fake URL to bypass, because nothing is
      unlocked by the fragment itself. This never contacts the sharing
      endpoint and never mints or checks a token, so it cannot create, list, or
      leak a publication.
    */
    if (window.MAKULLVENY_PREVIEW_SNAPSHOT && typeof window.MAKULLVENY_PREVIEW_SNAPSHOT === "object") {
      render(window.MAKULLVENY_PREVIEW_SNAPSHOT, true);
      return;
    }

    var token = captureToken();
    if (!token) {
      setState("This link is not complete. Ask whoever sent it for the full address.");
      return;
    }
    /*
      NOT-CONFIGURED and CONFIGURED-WRONG READ THE SAME, ON PURPOSE. An empty
      apiUrl is the committed state of read/config.js; an apiUrl pointing
      somewhere other than ALLOWED_API_ORIGINS is a deploy that has been
      tampered with or mis-filled. Neither is the visitor's problem and
      neither may echo the offending URL — not into the page, not into the
      console — because that is exactly the string an attacker who managed to
      rewrite config.js would want reflected back for confirmation.
    */
    if (!CONFIG.apiUrl || !apiOriginAllowed(CONFIG.apiUrl)) {
      setState("Shared reading is not open yet. This link will work once Makullveny's sharing service is live.");
      return;
    }
    setState("Opening…");

    var request = new XMLHttpRequest();
    request.open("POST", CONFIG.apiUrl, true);
    request.setRequestHeader("Content-Type", "application/json");
    if (CONFIG.publishableKey) {
      request.setRequestHeader("apikey", CONFIG.publishableKey);
      request.setRequestHeader("Authorization", "Bearer " + CONFIG.publishableKey);
    }
    request.onload = function () {
      if (request.status !== 200) {
        var known = stateForStatus(request.status);
        setState(known.message, known.tone);
        return;
      }
      var payload = null;
      /* A 200 carrying a body this page cannot read is, to a visitor, the same
         event as a share that is not there: the tone comes from the map rather
         than being hardcoded, so the sentence and its styling agree. It used
         to say "not available" in the "try again" voice. */
      var malformed = stateForStatus(0);
      try {
        payload = JSON.parse(request.responseText);
      } catch (error) {
        setState(malformed.message, malformed.tone);
        return;
      }
      var snapshot = payload && payload.snapshot ? payload.snapshot : payload;
      if (!snapshot || typeof snapshot !== "object") {
        setState(malformed.message, malformed.tone);
        return;
      }
      render(snapshot, false);
    };
    request.onerror = function () {
      setState("This page could not be reached. Check your connection and try again.", "retry");
    };
    request.send(JSON.stringify({ p_token: token }));
  }

  function bind() {
    var print = el("readerPrint");
    if (print) print.addEventListener("click", function () { window.print(); });
    window.addEventListener("hashchange", function () { window.location.reload(); });
  }

  /* Exposed for book.js / blueprint.js and for the pure-logic tests in
     tests/, which require this file under Node and exercise the DOM-free
     functions directly (see tests/README.md). Harmless to expose in the
     browser: none of it is a capability, only pure computation. */
  if (hasWindow) window.MakullvenyReader = {
    el: el,
    setState: setState,
    sanitizeInto: sanitizeInto,
    safeHref: safeHref,
    safeColor: safeColor,
    accentFromName: accentFromName,
    coverFromSnapshot: coverFromSnapshot,
    apiOriginAllowed: apiOriginAllowed,
    clampNumber: clampNumber,
    clampInt: clampInt,
    prefersReducedMotion: prefersReducedMotion,
    tokenFromHash: tokenFromHash,
    classifySnapshot: classifySnapshot,
    stateForStatus: stateForStatus,
    clampText: clampText,
    clampCredits: clampCredits,
    byline: byline,
    openGraphFields: openGraphFields,
    ACCENT_PALETTE: ACCENT_PALETTE,
    ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      tokenFromHash: tokenFromHash,
      safeColor: safeColor,
      accentFromName: accentFromName,
      coverFromSnapshot: coverFromSnapshot,
      apiOriginAllowed: apiOriginAllowed,
      classifySnapshot: classifySnapshot,
      stateForStatus: stateForStatus,
      clampNumber: clampNumber,
      clampInt: clampInt,
      clampText: clampText,
      clampCredits: clampCredits,
      byline: byline,
      openGraphFields: openGraphFields,
      ACCENT_PALETTE: ACCENT_PALETTE,
      ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
      SUPPORTED_FORMATS: SUPPORTED_FORMATS
    };
  }

  if (hasWindow && typeof document !== "undefined" && document.getElementById) {
    bind();
    open();
  }
})();
