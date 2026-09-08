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
        if (request.status === 429) { resolve({ ok: false, code: "report_rate_limited" }); return; }
        if (request.status < 200 || request.status >= 300) {
          resolve({ ok: false, code: "report_transport_failed" });
          return;
        }
        var answer = null;
        try { answer = JSON.parse(request.responseText || "null"); }
        catch (error) { answer = null; }
        if (answer && answer.ok === true) { resolve({ ok: true }); return; }
        /* The ONE server-supplied value that reaches the scene, and it is
           matched against a fixed list of tokens rather than displayed. */
        var code = answer && typeof answer.code === "string" ? answer.code : "report_transport_failed";
        resolve({ ok: false, code: code });
      };
      try { request.send(JSON.stringify(payload)); }
      catch (error) { resolve({ ok: false, code: "report_transport_failed" }); }
    });
  }

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
      report: report
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
    ensureScene(api, host).render(snapshot, view || {});
    return true;
  }

  window.MakullvenyBookReader = { render: render };
})();
