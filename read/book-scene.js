(function () {
  "use strict";

  /* ===========================================================================
     THE BOOK A STRANGER OPENS -- the site half of one shared scene.
     ===========================================================================

     read/public-book-scene.js and read/public-book-scene.css are COPIES. They
     come from the Makullveny app repository (src/publicBookScene.js and
     src/styles/modules/public-book-scene.css) byte for byte, and a test over
     there fails the moment the two drift. Do not edit them here; edit them
     there and copy them over. The whole reason the app's preview and this page
     look identical is that they are running the same file.

     THIS file is the only part that is site-only, and it is deliberately thin.
     It owns three things the scene refuses to own for itself:

       1. WHERE TO MOUNT, and the fact that a second render must not build a
          second scene on top of the first.
       2. WHAT THE SNAPSHOT DOES NOT CARRY -- the byline, the avatar digit, the
          token and whether this is a preview. read.js computes the byline (it
          already owned byline(), and identity belongs in ONE place); this file
          passes it on without re-deriving it.
       3. THE REPORT TRANSPORT. See the bottom of this file.

     WHAT THIS FILE MAY NEVER CONTAIN, same rule as read.js's header: no key of
     any kind, no service-role anything, nothing that identifies a reader or a
     writer, and no user content. It sends one token -- the one already in the
     reader's own URL fragment -- to one function, at one pinned origin.
     ======================================================================== */

  var MOUNT_ID = "bookScene";
  var AVATAR_BASE = "../assets/site/avatars/";

  var scene = null;

  function reader() { return window.MakullvenyReader || null; }

  /* ── the report transport ───────────────────────────────────────────────
     Two calls on the SAME endpoint read.js already uses -- no second host, no
     second config entry, and no key: mak-share is deployed with verify_jwt
     off, so a POST carrying neither `apikey` nor `Authorization` is answered.
     read/config.js explains why that is deliberate and why this repository
     therefore holds no key at all.

     The origin is re-checked here rather than trusted from config, because a
     mis-deployed or tampered config.js must not be able to make this page post
     a reader's email address to some other host. read.js's own fetch does the
     same check for the same reason; ALLOWED_API_ORIGINS is the one list.

     A REFUSAL IS A CODE, NEVER A SENTENCE. The scene matches on
     REPORT_REFUSAL.* and writes its own words, so nothing the server says is
     ever put on screen -- a server-authored string rendered to a reader is a
     server that can write to this page. */
  /* WHAT THE SCENE IS TOLD, from one reply. Pure, so tests/ pins it.
     A wrong or malformed code comes back as 401 / 400 `{ error: "bad_code" }`
     (mak-share's verifyReporter). It used to fall into the non-2xx branch and
     read "That could not be sent", so the scene's own "That code did not
     match" was unreachable (2026-09-24). */
  function reportAnswer(status, text) {
    if (status === 429) return { ok: false, code: "report_rate_limited" };
    var answer = null;
    try { answer = JSON.parse(text || "null"); }
    catch (error) { answer = null; }
    if ((status === 400 || status === 401) && answer && answer.error === "bad_code") {
      return { ok: false, code: "report_bad_code" };
    }
    if (status < 200 || status >= 300) return { ok: false, code: "report_transport_failed" };
    if (answer && answer.ok === true) return { ok: true };
    /* The ONE server-supplied value that reaches the scene, and it is
       matched against a fixed list of tokens rather than displayed. */
    var code = answer && typeof answer.code === "string" ? answer.code : "report_transport_failed";
    return { ok: false, code: code };
  }

  function post(action, body) {
    var config = window.MAKULLVENY_READER_CONFIG || {};
    var url = String(config.apiUrl || "");
    var api = reader();
    if (!url || !api || !api.apiOriginAllowed(url)) {
      return Promise.resolve({ ok: false, code: "report_not_ready" });
    }
    var payload = {};
    for (var key in body) if (Object.prototype.hasOwnProperty.call(body, key)) payload[key] = body[key];
    payload.action = action;

    return new Promise(function (resolve) {
      var request = new XMLHttpRequest();
      try { request.open("POST", url, true); }
      catch (error) { resolve({ ok: false, code: "report_transport_failed" }); return; }
      request.setRequestHeader("Content-Type", "application/json");
      /* No apikey and no Authorization header. See the header above. */
      request.timeout = 15000;
      request.onerror = function () { resolve({ ok: false, code: "report_transport_failed" }); };
      request.ontimeout = function () { resolve({ ok: false, code: "report_transport_failed" }); };
      request.onload = function () {
        resolve(reportAnswer(request.status, request.responseText));
      };
      try { request.send(JSON.stringify(payload)); }
      catch (error) { resolve({ ok: false, code: "report_transport_failed" }); }
    });
  }

  /* ── views, likes and the link (20260924100000) ────────────────────────
     A LIKE NAMES A BROWSER, NEVER A PERSON. This page keeps one random id
     (32 hex characters) in its own storage and sends it with a like; mak-share
     hashes it before it reaches the database, which keeps one like per id per
     page. Which pages this browser liked is remembered here too, so a reload
     draws the heart filled. Storage that throws (private mode, blocked site
     data) just means no memory -- the like still works. */
  var READER_ID_KEY = "makullveny-reader-id";
  var LIKED_KEY = "makullveny-liked";

  function store() {
    try { return window.localStorage || null; } catch (error) { return null; }
  }

  function readerId() {
    var box = store();
    var id = "";
    try { id = box ? String(box.getItem(READER_ID_KEY) || "") : ""; } catch (error) { id = ""; }
    if (/^[a-f0-9]{32}$/.test(id)) return id;
    var bytes = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(bytes) : bytes.forEach(function (_v, i) { bytes[i] = Math.floor(Math.random() * 256); });
    id = Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    try { if (box) box.setItem(READER_ID_KEY, id); } catch (error) { /* no memory */ }
    return id;
  }

  /* THE LIST HOLDS FINGERPRINTS, NOT TOKENS. A share token is the whole
     authorization for a reading, and read.js keeps it in per-tab
     sessionStorage and nowhere else. localStorage outlives the tab, so the
     like memory keeps a one-way 53-bit fingerprint of each token instead
     (cyrb53): enough to redraw a filled heart, useless as a way in. A stray
     collision can only draw one heart filled that should not be. */
  function fingerprint(token) {
    var str = String(token || "");
    var h1 = 0xdeadbeef;
    var h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i += 1) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return "f1:" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function likedList() {
    var box = store();
    try {
      var list = JSON.parse(box ? box.getItem(LIKED_KEY) || "[]" : "[]");
      if (Object.prototype.toString.call(list) !== "[object Array]") return [];
      /* only fingerprints survive a read, so nothing token-shaped lingers */
      return list.filter(function (entry) { return /^f1:[0-9a-f]{1,14}$/.test(String(entry)); });
    } catch (error) { return []; }
  }

  function rememberLiked(token, liked) {
    var box = store();
    if (!box || !token) return;
    var mark = fingerprint(token);
    var list = likedList().filter(function (entry) { return entry !== mark; });
    if (liked) list.unshift(mark);
    try { box.setItem(LIKED_KEY, JSON.stringify(list.slice(0, 500))); } catch (error) { /* no memory */ }
  }

  function postLike(token, like) {
    var config = window.MAKULLVENY_READER_CONFIG || {};
    var url = String(config.apiUrl || "");
    var api = reader();
    if (!url || !api || !api.apiOriginAllowed(url)) return Promise.resolve({ ok: false });
    return new Promise(function (resolve) {
      var request = new XMLHttpRequest();
      try { request.open("POST", url, true); } catch (error) { resolve({ ok: false }); return; }
      request.setRequestHeader("Content-Type", "application/json");
      request.timeout = 15000;
      request.onerror = function () { resolve({ ok: false }); };
      request.ontimeout = function () { resolve({ ok: false }); };
      request.onload = function () {
        if (request.status < 200 || request.status >= 300) { resolve({ ok: false }); return; }
        var answer = null;
        try { answer = JSON.parse(request.responseText || "null"); } catch (error) { answer = null; }
        if (!answer || answer.ok !== true) { resolve({ ok: false }); return; }
        /* Two values only, and both are checked for shape. */
        var likes = typeof answer.likes === "number" && isFinite(answer.likes) && answer.likes >= 0 ? Math.floor(answer.likes) : null;
        resolve({ ok: true, likes: likes, liked: answer.liked === true });
      };
      try { request.send(JSON.stringify({ action: "like", token: token, reader: readerId(), like: like !== false })); }
      catch (error) { resolve({ ok: false }); }
    });
  }

  var social = {
    like: function (input) {
      return postLike(input.token, input.like).then(function (answer) {
        if (answer && answer.ok === true) rememberLiked(input.token, answer.liked === true);
        return answer;
      });
    }
  };

  var report = {
    requestCode: function (input) {
      return post("report_otp", { token: input.token, email: input.email });
    },
    submit: function (input) {
      return post("report_submit", {
        token: input.token,
        email: input.email,
        code: input.code,
        reason: input.reason,
        note: input.note
      });
    }
  };

  /* ── mounting ───────────────────────────────────────────────────────────
     ONE scene for the life of the page. read.js renders once in the normal
     case and twice when a preview snapshot is replaced, and a second mount()
     would build a second complete pointer set on the stage -- the exact defect
     the scene's own teardown test exists for. */
  function ensureScene(api, host) {
    if (scene) return scene;
    scene = api.createScene({
      document: document,
      window: window,
      host: host,
      /* read.js's sanitizer, not a second one. It is a fresh allowlist walk
         over a document the reader's own browser parsed, and it is the same
         one the flat viewer used before this scene existed. */
      sanitizeInto: reader() ? reader().sanitizeInto : null,
      /* And read.js's cover derivation, which is the agreed-formula half of the
         contract with the app (src/coverColorContract.js). The scene falls back
         to its own copy if this is missing; passing it keeps ONE answer. */
      coverFrom: reader() ? reader().coverFromSnapshot : null,
      avatarBase: AVATAR_BASE,
      report: report,
      social: social
    });
    scene.mount(host);
    return scene;
  }

  /**
   * @param snapshot the snapshot read.js fetched and classified.
   * @param view     { byline, avatarId, openByDefault, token, preview } --
   *                 read.js owns every one of these. `byline` in particular is
   *                 already "" for an anonymous snapshot, and this file does not
   *                 second-guess it: a renderer that could reconstruct a name
   *                 would be a second place privacy depends on.
   */
  function render(snapshot, view) {
    var api = window.MakullvenyPublicBookScene;
    var host = document.getElementById(MOUNT_ID);
    if (!api || !host) {
      var fallback = reader();
      if (fallback) fallback.setState("This page could not open the book viewer.", "refused");
      return false;
    }
    host.hidden = false;
    var seen = view || {};
    /* Whether THIS browser liked the page, from its own memory. */
    if (seen.token && !seen.preview) seen.liked = likedList().indexOf(fingerprint(seen.token)) !== -1;
    ensureScene(api, host).render(snapshot, seen);
    return true;
  }

  window.MakullvenyBookReader = { render: render, reportAnswer: reportAnswer };
})();
