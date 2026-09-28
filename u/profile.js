/*
  A STUDENT'S PROFILE PAGE: the fetch and the host for
  https://www.makullveny.com/u/#<token>. No build step, no framework, no
  dependency.

  THE PAGE ITSELF IS DRAWN BY ./profile-view.js, A BYTE COPY OF THE APP'S
  src/publicProfileView.js (with ./profile-view.css <- the app's
  src/styles/modules/public-profile-view.css). The student edits their profile
  in the app on exactly that renderer, so what they see there is what a
  visitor sees here: the same sidebar, the same widgets in the same order and
  widths, their theme's colours and art (./themes.css, read out of the app),
  or just the colours when they switched the art off. Never edit the two
  copied files here -- change them in the app and copy them over.

  IT MAKES EXACTLY ONE REQUEST: a POST of { action: "profile", token } to the
  mak-share function (the URL comes from read/config.js, and its ORIGIN must be
  in ALLOWED_API_ORIGINS -- the same pinned list read.js holds, and the same
  connect-src u/index.html carries). No key: mak-share runs with verify_jwt
  off, and the token in the fragment is the whole authorization.

  WHAT COMES BACK is re-checked field by field (the view's shapeProfile) even
  though the server already shapes it: a name, an @username, an avatar DIGIT
  (1-7, mapped to this site's own pictures -- never a URL from the network),
  the look (a theme KEY, matched against ./themes.css's own list, never used
  as a URL or a colour), and, only when the student chose them, a bio, class
  and event items of exactly {t, s, e}, an achievements count and Selah's
  numbers. Every string is set with textContent; nothing from the network is
  ever parsed as markup.

  THE TOKEN is read from the fragment (never sent to a web server, never in a
  Referer) and goes in the POST body, never a query string. The fragment is
  left in the address bar on purpose: a profile is something a friend
  bookmarks and comes back to, and the student can switch the link off from
  the app at any time.
*/
(function () {
  "use strict";

  var hasWindow = typeof window !== "undefined";

  var VIEW = (hasWindow && window.MakullvenyProfileView) || (typeof require === "function" ? require("./profile-view.js") : null);

  var CONFIG = { apiUrl: "" };
  if (hasWindow && window.MAKULLVENY_READER_CONFIG && window.MAKULLVENY_READER_CONFIG.apiUrl) {
    CONFIG.apiUrl = String(window.MAKULLVENY_READER_CONFIG.apiUrl);
  }

  /* KEEP IN STEP with read/read.js ALLOWED_API_ORIGINS and the connect-src in
     u/index.html. */
  var ALLOWED_API_ORIGINS = ["https://ddbksawvchsauiuiwvrl.supabase.co"];

  function apiOriginAllowed(url) {
    var raw = String(url == null ? "" : url);
    if (!raw) return false;
    var parsed;
    try { parsed = new URL(raw); } catch (error) { return false; }
    if (parsed.protocol !== "https:") return false;
    for (var i = 0; i < ALLOWED_API_ORIGINS.length; i += 1) {
      if (parsed.origin === ALLOWED_API_ORIGINS[i]) return true;
    }
    return false;
  }

  var TOKEN_PATTERN = /^[a-z2-9]{16,64}$/;

  function tokenFromHash(hashOverride) {
    var raw = hashOverride != null ? hashOverride : (hasWindow ? window.location.hash : "");
    var parts = String(raw || "").replace(/^#/, "").split("/");
    var last = "";
    for (var i = 0; i < parts.length; i += 1) if (parts[i]) last = parts[i];
    last = last.toLowerCase();
    return TOKEN_PATTERN.test(last) ? last : "";
  }

  /* The site's own avatar pictures, by the digit the account stores
     (src/avatarChoices.js in the app is the owner of this order, and of each
     picture's ground colour). */
  var AVATARS = {
    1: { file: "mak-avatar-1-turtle-duck.png", label: "Turtle duck", ground: "#dcefdc" },
    2: { file: "mak-avatar-2-frog.png", label: "Frog", ground: "#dff0d8" },
    3: { file: "mak-avatar-3-duck-on-water.png", label: "Duck on water", ground: "#cfe3f4" },
    4: { file: "mak-avatar-4-glider.png", label: "Glider", ground: "#e3eef8" },
    5: { file: "mak-avatar-5-tree.png", label: "Tree", ground: "#e6f0dc" },
    6: { file: "mak-avatar-6-jellyfish.png", label: "Jellyfish", ground: "#f6dcec" },
    7: { file: "mak-avatar-7-mushroom.png", label: "Mushroom", ground: "#f8e7db" }
  };
  var AVATAR_BASE = "../assets/site/avatars/";
  var STAGE_BASE = "../assets/site/profile/selah-stage-";

  /* Every theme ./themes.css paints. A key not on this list is drawn as Cozy
     Cabin, the app's default -- the key only ever selects one of these. */
  var THEMES = [
    "cozy-cabin", "snow-cabin", "terminal-hacker", "cherry-blossom", "rainy-cafe",
    "garden-of-eden", "woodland-library", "lantern-study", "moonlit-observatory",
    "on-the-rock", "cotton-candy", "skyline-loft", "abyssal-aquarium", "gilded-arcana",
    "aurora-glasshouse", "crimson-atelier", "ink-and-ivory"
  ];

  function shapeProfile(payload) {
    var shaped = VIEW.shapeProfile(payload);
    if (THEMES.indexOf(shaped.look.theme) < 0) shaped.look.theme = "cozy-cabin";
    if (shaped.look.theme !== "terminal-hacker") delete shaped.look.accent;
    if (!shaped.displayName) shaped.displayName = "A Makullveny student";
    return shaped;
  }

  function classCount(list) {
    var seen = {};
    var n = 0;
    for (var i = 0; i < (list || []).length; i += 1) {
      var key = list[i].t.toLowerCase();
      if (!seen[key]) { seen[key] = true; n += 1; }
    }
    return n;
  }

  /* One sentence per state; revoked, unknown and malformed read the same. */
  function stateForStatus(status) {
    if (status === 429) return "This page is getting a lot of visits right now. Wait a moment and try again.";
    if (status === 502 || status === 500 || status === 503) return "Something went wrong on Makullveny's end. Try again shortly.";
    return "This profile is not available. The link may have been turned off, or it never existed.";
  }

  /* ── drawing ────────────────────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function setState(message) {
    var node = el("ppState");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
  }

  /* The look lands on <html>: themes.css keys every token off these. */
  function wearLook(look) {
    var root = document.documentElement;
    root.setAttribute("data-theme", look.theme);
    if (look.accent) root.setAttribute("data-accent", look.accent); else root.removeAttribute("data-accent");
    root.setAttribute("data-bg", look.bg ? "on" : "off");
  }

  function render(payload, nowMs) {
    var profile = shapeProfile(payload);
    wearLook(profile.look);
    document.title = profile.displayName + " on Makullveny";
    var built = VIEW.buildPage(document, profile, {
      now: nowMs,
      avatar: function (id) {
        var a = AVATARS[id];
        return a ? { src: AVATAR_BASE + a.file, ground: a.ground } : null;
      },
      stageArt: function (stage) {
        var n = Math.max(1, Math.min(5, Math.floor(Number(stage) || 1)));
        return STAGE_BASE + n + ".webp";
      }
    });
    /* This page's own line under the sidebar card: how to add them. */
    if (profile.username) {
      var add = document.createElement("p");
      add.className = "pp-add";
      var b = document.createElement("b");
      b.textContent = "@" + profile.username;
      add.append(document.createTextNode("Have Makullveny? Add "), b, document.createTextNode(" in Friends."));
      built.sidebar.side.append(add);
    }
    var mount = el("ppProfile");
    mount.replaceChildren(built.host);
    setState("");
    mount.hidden = false;
  }

  function open() {
    /* A LOCAL PREVIEW ONLY. A page script can set this global before
       profile.js runs (tools and screenshots do); a URL cannot, so there is
       nothing here for a crafted link to switch on. */
    if (window.MAKULLVENY_PROFILE_FIXTURE && typeof window.MAKULLVENY_PROFILE_FIXTURE === "object") {
      render(window.MAKULLVENY_PROFILE_FIXTURE, typeof window.MAKULLVENY_PROFILE_NOW === "number" ? window.MAKULLVENY_PROFILE_NOW : Date.now());
      return;
    }
    var token = tokenFromHash();
    if (!token) {
      setState("This link is not complete. Ask whoever sent it for the full address.");
      return;
    }
    if (!CONFIG.apiUrl || !apiOriginAllowed(CONFIG.apiUrl)) {
      setState("Profile links are not open yet.");
      return;
    }
    setState("Opening…");
    var request = new XMLHttpRequest();
    request.open("POST", CONFIG.apiUrl, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = function () {
      if (request.status !== 200) { setState(stateForStatus(request.status)); return; }
      var payload = null;
      try { payload = JSON.parse(request.responseText); } catch (error) { payload = null; }
      if (!payload || payload.ok !== true) { setState(stateForStatus(404)); return; }
      render(payload, Date.now());
    };
    request.onerror = function () { setState("This page could not be reached. Check your connection and try again."); };
    request.timeout = 20000;
    request.ontimeout = function () { setState("This is taking too long to open. Check your connection and reload the page."); };
    request.send(JSON.stringify({ action: "profile", token: token }));
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      tokenFromHash: tokenFromHash,
      apiOriginAllowed: apiOriginAllowed,
      shapeProfile: shapeProfile,
      weekLayout: VIEW.weekLayout,
      classCount: classCount,
      colourFor: VIEW.colourFor,
      stateForStatus: stateForStatus,
      ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
      AVATARS: AVATARS,
      THEMES: THEMES,
      STAGE_BASE: STAGE_BASE
    };
  }

  if (hasWindow && typeof document !== "undefined" && document.getElementById && document.getElementById("ppMain")) {
    window.addEventListener("hashchange", function () { window.location.reload(); });
    open();
  }
})();
