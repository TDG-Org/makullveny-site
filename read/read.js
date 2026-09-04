/*
  THE READ-ONLY VIEWER for a Makullveny published snapshot.

  No build step, no framework, no dependency. ES5-compatible on purpose: this
  repository has no package.json and the README says it must never gain one.

  ─────────────────────────────────────────────────────────────────────────────
  IT MAKES EXACTLY ONE REQUEST
  ─────────────────────────────────────────────────────────────────────────────
  A POST to one function, carrying one opaque token, returning one snapshot.
  There is no Supabase client on this page, no session, no login, no cookie, no
  second endpoint and no analytics. If that one call fails, the page says so and
  stops.
*/
(function () {
  "use strict";

  /*
    ───────────────────────────────────────────────────────────────────────────
    CONFIG — DELIBERATELY EMPTY IN GIT
    ───────────────────────────────────────────────────────────────────────────
    `apiUrl` is the tdg-core function that resolves a token, and `publishableKey`
    is the anon key that function is called with. Both are left EMPTY here.

    * `publishableKey` is designed to be public and is not a secret, so
      committing one would not be a leak — but committing it here would tie a
      public repository to a specific project and make rotating it a code
      change. It is filled in at deploy time.
    * The SERVER DOES NOT EXIST YET. `tdg_shares`, `tdg_share_read`,
      `tdg_share_publish` and `tdg_share_revoke` are specified in the Makullveny
      repo at docs/decisions/sharing/2026-09-03-published-snapshots.md and have
      not been created. Until they are, this page cannot open anything, and it
      SAYS THAT rather than showing an empty article and letting a reader wonder
      whether the writing was deleted.

    Nothing below is a secret, and nothing below is a private path.
  */
  var CONFIG = {
    apiUrl: "",
    publishableKey: ""
  };

  /*
    Deploy-time configuration, and the reason it is a global rather than an edit
    to the lines above: filling those in would mean a COMMIT to a public
    repository every time the project or the key changed, and rotating a key
    would be a code change. A deploy writes a one-line read/config.js:

        window.MAKULLVENY_READER_CONFIG = { apiUrl: "...", publishableKey: "..." };

    That file is gitignored. Neither value is a secret -- a publishable key is
    designed to be public -- but neither belongs in git either.

    It is also what makes this page TESTABLE: a harness can set the global and
    stub XMLHttpRequest, and then the sanitizer below is exercised through the
    real code path rather than through a copy of it.
  */
  if (window.MAKULLVENY_READER_CONFIG) {
    if (window.MAKULLVENY_READER_CONFIG.apiUrl) CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
    if (window.MAKULLVENY_READER_CONFIG.publishableKey) CONFIG.publishableKey = String(window.MAKULLVENY_READER_CONFIG.publishableKey);
  }

  /*
    ───────────────────────────────────────────────────────────────────────────
    THE SANITIZER — AN ALLOWLIST WALK, NOT A REGEX AND NOT innerHTML
    ───────────────────────────────────────────────────────────────────────────
    The app already sanitized this on publish. This runs again because a
    snapshot in transit is not a snapshot this page produced, and because the two
    halves live in different repositories with different trust boundaries.

    It parses into an INERT document (DOMParser gives one with no browsing
    context, so nothing loads and nothing runs while we are still deciding) and
    then REBUILDS every node by hand into the live document. A node that is not
    on the list is not copied — it cannot survive by being spelled unusually,
    nested strangely, or serialized into something that re-parses differently.

    This list only has to be a SUBSET of what the app permits, and it is.
  */
  var ALLOWED_TAGS = {
    A: 1, B: 1, BLOCKQUOTE: 1, BR: 1, CODE: 1, DEL: 1, DIV: 1, EM: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, HR: 1, I: 1, LI: 1, OL: 1,
    P: 1, PRE: 1, S: 1, SMALL: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1,
    TABLE: 1, TBODY: 1, TD: 1, TH: 1, THEAD: 1, TR: 1, U: 1, UL: 1
  };

  /* Classes that MEAN something on a public page. Everything else is the app's
     private vocabulary and is dropped. */
  var ALLOWED_CLASSES = {
    "works-cited": 1, "works-cited-apa": 1, "works-cited-heading": 1,
    "works-cited-entry": 1, "page-break": 1, "academic-title": 1,
    "academic-heading-line": 1, "academic-title-page": 1, "academic-title-line": 1
  };

  /* Only three attributes survive, and two of them are on one tag each. There is
     deliberately no `style`, no `src`, no `id`, no `data-*` and no `aria-*`:
     a published page is prose, and every one of those is a lever. */
  function keptAttributes(sourceNode, targetNode) {
    var tag = sourceNode.nodeName;
    if (tag === "A") {
      var href = safeHref(sourceNode.getAttribute("href"));
      if (href) {
        targetNode.setAttribute("href", href);
        /* A published page must not hand the destination a Referer or a window
           handle back to this tab. */
        targetNode.setAttribute("rel", "noopener noreferrer nofollow");
        targetNode.setAttribute("target", "_blank");
      }
    }
    if (tag === "TD" || tag === "TH") {
      copyNumeric(sourceNode, targetNode, "colspan");
      copyNumeric(sourceNode, targetNode, "rowspan");
    }
    var className = sourceNode.getAttribute && sourceNode.getAttribute("class");
    if (className) {
      var kept = [];
      var parts = String(className).split(/\s+/);
      for (var i = 0; i < parts.length; i += 1) {
        if (ALLOWED_CLASSES[parts[i]] === 1) kept.push(parts[i]);
      }
      if (kept.length) targetNode.setAttribute("class", kept.join(" "));
    }
  }

  function copyNumeric(sourceNode, targetNode, name) {
    var raw = sourceNode.getAttribute(name);
    if (!raw) return;
    var value = parseInt(raw, 10);
    /* A hostile colspan is a rendering denial-of-service, not a script. Bound it
       rather than trusting the number. */
    if (isFinite(value) && value > 0 && value <= 100) targetNode.setAttribute(name, String(value));
  }

  /*
    http and https ONLY, resolved through the URL parser rather than matched with
    a regex — javascript:, data:, vbscript:, file: and a protocol-relative
    //evil.example are all things a regex gets wrong and a parser does not.
  */
  function safeHref(raw) {
    var value = String(raw || "").trim();
    if (!value) return "";
    /*
      A PROTOCOL-RELATIVE URL IS REFUSED BEFORE THE PARSER SEES IT, and this is
      not redundant with the check below. `new URL("//evil.example", href)`
      inherits the PAGE's scheme, so on https it resolves to https and would be
      allowed -- the parser cannot tell us the author never named a scheme. The
      app's own sanitizer refuses these, so one arriving here means the snapshot
      is not one the app produced, which is exactly when to be strict.
    */
    if (value.slice(0, 2) === "//") return "";
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
      return "";
    } catch (error) {
      return "";
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

  /* Depth-bounded: a snapshot nested ten thousand deep would otherwise blow the
     stack before it rendered anything. */
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
      if (node.nodeType !== 1) continue;   /* comments, CDATA, everything else */
      if (ALLOWED_TAGS[node.nodeName] !== 1) {
        /* Keep the words, drop the wrapper — the same shape the app's sanitizer
           produces, so the two agree on the output for an unknown tag. */
        copyChildren(node, targetParent, depth + 1);
        continue;
      }
      var copy = document.createElement(node.nodeName.toLowerCase());
      keptAttributes(node, copy);
      copyChildren(node, copy, depth + 1);
      targetParent.appendChild(copy);
    }
  }

  /* ───────────────────────────────────────────────────────── the token ─── */

  /*
    The token is the LAST segment of the fragment. Everything before it —
    "@handle", a slug — is decoration this page never sends anywhere.
  */
  function tokenFromHash() {
    var hash = String(window.location.hash || "").replace(/^#/, "");
    var parts = hash.split("/");
    var last = "";
    for (var i = 0; i < parts.length; i += 1) if (parts[i]) last = parts[i];
    return /^[a-z2-9]{16,64}$/.test(last) ? last : "";
  }

  /* ────────────────────────────────────────────────────────── rendering ─── */

  function el(id) { return document.getElementById(id); }

  function setState(message) {
    var node = el("readerState");
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
  }

  function setText(node, value) {
    if (!node) return;
    node.textContent = value == null ? "" : String(value);
    node.hidden = !node.textContent;
  }

  /*
    OPEN GRAPH, built here rather than in the markup, so exactly one place
    decides — and it is the place that knows whether the share is anonymous. An
    anonymous snapshot produces a card that names no person: no author tag, and
    nothing about the writer in the title or the description.
  */
  function writeOpenGraph(snapshot) {
    var title = snapshot.title || "A shared reading";
    document.title = title + " — Makullveny";
    tag("og:title", title);
    if (snapshot.description) tag("og:description", snapshot.description);
    tag("og:type", "article");
    if (snapshot.anonymous !== true && snapshot.displayName) {
      tag("article:author", String(snapshot.displayName));
    }
  }

  function tag(property, content) {
    var meta = document.createElement("meta");
    meta.setAttribute("property", property);
    meta.setAttribute("content", String(content));
    document.head.appendChild(meta);
  }

  function render(snapshot) {
    writeOpenGraph(snapshot);
    setText(el("readerTitle"), snapshot.title || "Untitled");

    /* An anonymous snapshot has no identity FIELDS at all, so there is nothing
       to hide here — but the check is written anyway, because this page must be
       correct about a snapshot it did not build. */
    var byline = "";
    if (snapshot.anonymous !== true) {
      byline = snapshot.displayName || (snapshot.handle ? "@" + snapshot.handle : "");
    }
    setText(el("readerByline"), byline);
    setText(el("readerDescription"), snapshot.description || "");

    var pagesHost = el("readerPages");
    var pages = Object.prototype.toString.call(snapshot.pages) === "[object Array]" ? snapshot.pages : [];
    for (var i = 0; i < pages.length; i += 1) {
      var section = document.createElement("section");
      section.className = "reader-page";
      var body = document.createElement("div");
      body.className = "reader-page-body";
      sanitizeInto(body, pages[i] && pages[i].html);
      section.appendChild(body);
      pagesHost.appendChild(section);
    }

    var credits = Object.prototype.toString.call(snapshot.credits) === "[object Array]" ? snapshot.credits : [];
    if (credits.length) {
      var list = el("readerCreditsList");
      for (var c = 0; c < credits.length; c += 1) {
        var item = document.createElement("li");
        /* textContent, never innerHTML: a credit is a name somebody typed. */
        item.textContent = String(credits[c]);
        list.appendChild(item);
      }
      el("readerCredits").hidden = false;
    }

    el("readerArticle").hidden = false;
    el("readerPrint").hidden = false;
    setState("");
  }

  /* ─────────────────────────────────────────────────────────── fetching ─── */

  function open() {
    var token = tokenFromHash();
    if (!token) {
      setState("This link is not complete. Ask whoever sent it for the full address.");
      return;
    }
    if (!CONFIG.apiUrl) {
      /* HONEST, not blank. A reader who sees an empty page assumes the writing
         was deleted; this tells them the truth. */
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
      if (request.status !== 200) { refused(); return; }
      var payload = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch (error) {
        refused();
        return;
      }
      var snapshot = payload && payload.snapshot ? payload.snapshot : payload;
      if (!snapshot || typeof snapshot !== "object" || !snapshot.pages) { refused(); return; }
      render(snapshot);
    };
    request.onerror = function () {
      setState("This page could not be reached. Check your connection and try again.");
    };
    /* ONE argument, and it is the token the reader already has. */
    request.send(JSON.stringify({ p_token: token }));
  }

  /*
    ONE SENTENCE FOR EVERY REFUSAL, and that is a security property rather than
    laziness. "Revoked", "expired" and "never existed" must be indistinguishable
    from outside, or the page becomes an oracle that tells a stranger walking
    tokens which of their guesses were once real.
  */
  function refused() {
    setState("This reading is not available. The link may have been revoked, or it may have expired.");
  }

  function bind() {
    var print = el("readerPrint");
    if (print) print.addEventListener("click", function () { window.print(); });
    /* A share opened, then the reader pastes a different link into the same
       tab: the fragment changes without a navigation, so re-open by hand. */
    window.addEventListener("hashchange", function () { window.location.reload(); });
  }

  bind();
  open();
})();
