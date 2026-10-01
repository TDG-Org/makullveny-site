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
/*
  /profile/<username> (2026-09-30, the owner): THE CANONICAL ADDRESS. The
  same page, asked by username instead of by token: POST { action:
  "profile_at", username } to the same function, which answers exactly what
  the token read answers for that student's LIVE link (no live link reads as
  not available, the same as a name nobody holds). GitHub Pages has no file
  for /profile/<name>, so 404.html moves it to /profile/#<name> and this
  script puts /profile/<name> back in the address bar (history.replaceState).
  An old /u/#<token> link still opens by token, then shows the canonical
  address the same way. profile/index.html is this page's second door; both
  run this one script.

  ADD FRIEND (2026-09-30): under a visitor's card. Signed out -> a sign-in
  prompt. Your own page -> "This is you". Signed in -> Add friend, which asks
  for your password once (this site keeps no session -- account/me.js) and
  sends ONE request to mak-web-signup's "friend" action: it checks the
  password, asks TDG where the two of you stand and sends the request only
  when TDG allows it -- the same rule the app's Friends sheet uses. The answer
  is one word (requested / friends / already_friends / already_asked / ...),
  said here in one sentence. The password lives in the input and that one
  request body, nowhere else.
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

  /* tdg-core's username shape (the app's logic/tdgSocialService.js). */
  var USERNAME = /^[A-Za-z0-9_]{3,20}$/;

  /* Is this the /profile/ door (not u/)? */
  function isProfilePath(pathname) {
    return /\/profile\/(?:[^/]*\/?)?$/.test(String(pathname || ""));
  }

  /* The username a /profile/ address names: the path's last part
     (/profile/<name>), or the fragment 404.html moved it into
     (/profile/#<name>). Anything that is not a username is "". */
  function usernameFromLocation(pathname, hash) {
    var path = String(pathname || "");
    var m = /\/profile\/([^/?#]+)\/?$/.exec(path);
    var raw = m ? m[1] : String(hash || "").replace(/^#/, "").replace(/^@+/, "").split("/")[0];
    try { raw = decodeURIComponent(raw); } catch (_e) { return ""; }
    raw = raw.replace(/^@+/, "");
    return USERNAME.test(raw) ? raw : "";
  }

  /* The site root, from this script's own address (it lives in u/). */
  var ROOT = (function () {
    var s = hasWindow && typeof document !== "undefined" && document.currentScript && document.currentScript.src;
    return s ? s.replace(/u\/profile\.js(\?.*)?$/, "") : "/";
  })();

  /* The canonical address of a profile: <root>profile/<username>. */
  function canonicalPath(username, root) {
    var base = root != null ? String(root) : ROOT;
    try { base = new URL(base, "https://www.makullveny.com/").pathname; } catch (_e) { base = "/"; }
    if (!/\/$/.test(base)) base += "/";
    return USERNAME.test(String(username || "")) ? base + "profile/" + username : "";
  }

  function showCanonical(username) {
    var path = canonicalPath(username);
    if (!path || !hasWindow || !window.history || typeof window.history.replaceState !== "function") return;
    if (window.location.pathname === path && !window.location.hash) return;
    try { window.history.replaceState(null, "", path); } catch (_e) { /* the old address still works */ }
  }

  function sameName(a, b) {
    return Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
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

  function make(tag, className, words) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (words != null) node.textContent = words;
    return node;
  }

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

  /* A theme key -> its scenery in assets/themes/ (the same pictures the
     page's own background uses). An unknown key draws no banner. */
  var BANNER_FILES = {
    "cozy-cabin": "cabin-background.webp",
    "terminal-hacker": "neon-terminal-background.webp",
    "abyssal-aquarium": "abyssal-aquarium-illustrated-background.webp",
    "aurora-glasshouse": "aurora-glasshouse-illustrated-background.webp",
    "cotton-candy": "cotton-candy-illustrated-background.webp",
    "crimson-atelier": "crimson-atelier-illustrated-background.webp",
    "gilded-arcana": "gilded-arcana-illustrated-background.webp",
    "ink-and-ivory": "ink-and-ivory-illustrated-background.webp",
    "skyline-loft": "skyline-loft-illustrated-background.webp",
    "cherry-blossom": "cherry-blossom-background.webp",
    "garden-of-eden": "garden-of-eden-background.webp",
    "lantern-study": "lantern-study-background.webp",
    "moonlit-observatory": "moonlit-observatory-background.webp",
    "on-the-rock": "on-the-rock-background.webp",
    "rainy-cafe": "rainy-cafe-background.webp",
    "snow-cabin": "snow-cabin-background.webp",
    "woodland-library": "woodland-library-background.webp"
  };
  function bannerFile(key) {
    var base = String(key || "").replace(/-(pink|blue)$/, "");
    return Object.prototype.hasOwnProperty.call(BANNER_FILES, base) ? "../assets/themes/" + BANNER_FILES[base] : "";
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
      },
      /* The banner the student picked in the app (look.banner, else their
         theme): that theme's own scenery from assets/themes/. */
      bannerArt: function (key) {
        return bannerFile(key);
      }
    });
    /* This page's own block under the sidebar card: Add friend, the
       sign-in prompt, or "This is you". */
    if (profile.username) built.sidebar.side.append(friendBlock(profile.username, currentMe()));
    var mount = el("ppProfile");
    mount.replaceChildren(built.host);
    setState("");
    mount.hidden = false;
    return built;
  }

  /* ── add friend ─────────────────────────────────────────────────────── */

  /* mak-web-signup, on the same pinned origin as everything else here. */
  var FRIEND_PATH = "/functions/v1/mak-web-signup";
  function friendEndpoint(apiUrl) {
    if (!apiOriginAllowed(apiUrl)) return "";
    try { return new URL(String(apiUrl)).origin + FRIEND_PATH; } catch (_e) { return ""; }
  }

  function currentMe() {
    return hasWindow && window.MakullvenyMe && typeof window.MakullvenyMe.get === "function" ? window.MakullvenyMe.get() : null;
  }

  /* Which block a visitor sees: "own", "signin" or "add". */
  function friendMode(me, username) {
    if (me && sameName(me.username, username)) return "own";
    return me ? "add" : "signin";
  }

  /* One sentence per answer. `tone` colours it; `done` greys the button. */
  function friendWords(answer, username) {
    var at = "@" + username;
    var outcome = answer && answer.ok === true ? String(answer.outcome || "") : "";
    var error = answer && answer.ok !== true ? String(answer.error || "") : "";
    var OUT = {
      requested: { text: "Request sent. " + at + " will see it in Makullveny.", tone: "ok", done: "Requested" },
      friends: { text: "You and " + at + " are friends now.", tone: "ok", done: "Friends" },
      already_friends: { text: "You and " + at + " are already friends.", tone: "ok", done: "Friends" },
      already_asked: { text: "You already asked. Waiting for " + at + " to say yes.", tone: "ok", done: "Requested" },
      self: { text: "That is you.", tone: "ok", done: "You" },
      not_taking: { text: at + " is not taking friend requests.", tone: "warn", done: "" },
      not_found: { text: "You cannot add " + at + " right now.", tone: "warn", done: "" },
      blocked: { text: "You blocked " + at + ". Unblock them in the app first.", tone: "warn", done: "" },
      limit: { text: "A friend limit is full. Remove a friend or a request in the app first.", tone: "warn", done: "" }
    };
    if (OUT[outcome]) return OUT[outcome];
    var ERR = {
      invalid_credentials: "That password does not match. Try again.",
      email_not_confirmed: "Confirm your email first, then try again.",
      rate_limited: "Too many tries. Wait a few minutes and try again.",
      bad_request: "Type your password to add a friend.",
      offline: "Could not reach Makullveny. Check your connection and try again."
    };
    return { text: ERR[error] || "Something went wrong on our side. Try again in a minute.", tone: "error", done: "" };
  }

  function postJson(url, body, done) {
    var request = new XMLHttpRequest();
    request.open("POST", url, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.timeout = 20000;
    request.onload = function () {
      var data = null;
      try { data = JSON.parse(request.responseText || "null"); } catch (_e) { data = null; }
      done(data && typeof data === "object" ? data : { ok: false, error: request.status === 429 ? "rate_limited" : "server_error" });
    };
    request.onerror = request.ontimeout = function () { done({ ok: false, error: "offline" }); };
    request.send(JSON.stringify(body));
  }

  function friendBlock(username, me) {
    var box = make("div", "pp-add pp-friend");
    var mode = friendMode(me, username);
    box.setAttribute("data-mode", mode);
    var at = "@" + username;

    if (mode === "own") {
      ownShown = true;
      box.append(make("p", "pp-friend-line", "This is you. Friends can add you right here, or as " + at + " in the app."));
      return box;
    }

    if (mode === "signin") {
      var line = make("p", "pp-friend-line");
      var b = make("b", "", at);
      line.append(document.createTextNode("Sign in to add "), b, document.createTextNode(" as a friend."));
      var go = make("a", "pp-friend-btn", "Sign in");
      go.href = ROOT + "account/#signin";
      go.setAttribute("data-me-keep", "");
      box.append(line, go, make("p", "pp-friend-hint", "Or add " + at + " in Makullveny's Friends."));
      return box;
    }

    /* Signed in: the button, then a password row that opens under it. */
    var add = make("button", "pp-friend-btn", "Add friend");
    add.type = "button";
    add.setAttribute("aria-expanded", "false");
    var form = make("form", "pp-friend-form");
    form.hidden = true;
    form.setAttribute("novalidate", "");
    var who = document.createElement("input");
    who.type = "text";
    who.autocomplete = "username";
    who.value = me.username || "";
    who.className = "pp-friend-who";
    who.setAttribute("aria-label", "Your username or email");
    who.placeholder = "Your username or email";
    /* The username is known: a password manager still sees it, the student
       does not have to. Without one (an email-only sign-in), they type it. */
    if (me.username) { who.hidden = true; who.tabIndex = -1; }
    var label = make("label", "pp-friend-label", "Your password, to send it as you");
    var pass = document.createElement("input");
    pass.type = "password";
    pass.autocomplete = "current-password";
    pass.required = true;
    pass.className = "pp-friend-pass";
    pass.id = "ppFriendPass";
    label.htmlFor = pass.id;
    var send = make("button", "pp-friend-btn", "Send request");
    send.type = "submit";
    var row = make("div", "pp-friend-row");
    row.append(pass, send);
    form.append(who, label, row, make("p", "pp-friend-hint", "Makullveny's website keeps no sign-in, so it asks each time."));
    var status = make("p", "pp-friend-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    function say(words) {
      status.textContent = words ? words.text : "";
      status.setAttribute("data-tone", words ? words.tone : "");
      status.hidden = !words;
    }

    add.addEventListener("click", function () {
      form.hidden = !form.hidden;
      add.setAttribute("aria-expanded", String(!form.hidden));
      if (!form.hidden) (me.username ? pass : who).focus();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var url = friendEndpoint(CONFIG.apiUrl);
      var identifier = String(who.value || "").trim();
      var password = String(pass.value || "");
      if (!identifier || !password) { say(friendWords({ ok: false, error: "bad_request" }, username)); return; }
      if (!url) { say(friendWords({ ok: false, error: "server_error" }, username)); return; }
      send.disabled = true;
      send.textContent = "Sending…";
      postJson(url, { action: "friend", identifier: identifier, password: password, target: username }, function (answer) {
        pass.value = "";
        send.disabled = false;
        send.textContent = "Send request";
        var words = friendWords(answer, username);
        say(words);
        if (words.done) {
          form.hidden = true;
          add.textContent = words.done;
          add.disabled = true;
          add.setAttribute("aria-expanded", "false");
          box.setAttribute("data-mode", "done");
        } else if (answer && answer.error === "invalid_credentials") {
          pass.focus();
        }
      });
    });

    box.append(add, form, status);
    return box;
  }

  /* The line under a signed-in student's own card. */
  function ownNote(me) {
    return me && me.username
      ? "This is you. Friends can add you as @" + me.username + " in the app. To show your classes and calendar here, make a profile link in Makullveny."
      : "This is you. Pick a username in the Makullveny app so friends can add you.";
  }

  /* Whether this page is the signed-in student's own (signing out then
     leaves for the sign-in page; on anybody else's it just redraws). */
  var ownShown = false;

  function renderOwn(me) {
    ownShown = true;
    var built = render({ displayName: me.displayName, username: me.username, avatarId: me.avatarId }, Date.now());
    document.title = "Your profile — Makullveny";
    /* The app's renderer draws the card (2026-09-28 merge of the own-profile
       view onto the profile-parity page): the line under it says it is you,
       in place of the "Have Makullveny? Add @x" a visitor reads. */
    var side = built && built.sidebar && built.sidebar.side;
    if (side) {
      Array.prototype.forEach.call(side.querySelectorAll(".pp-add"), function (node) { node.remove(); });
      var add = document.createElement("p");
      add.className = "pp-add";
      add.textContent = ownNote(me);
      side.append(add);
    }
    var foot = el("ppFoot");
    if (foot) {
      foot.replaceChildren(document.createTextNode("Only you see this page, in this browser. "), make("a", "", "Your account"));
      foot.lastChild.href = "../account/";
      foot.lastChild.setAttribute("data-me-keep", "");
    }
  }

  function open() {
    /* A LOCAL PREVIEW ONLY. A page script can set this global before
       profile.js runs (tools and screenshots do); a URL cannot, so there is
       nothing here for a crafted link to switch on. */
    if (window.MAKULLVENY_PROFILE_FIXTURE && typeof window.MAKULLVENY_PROFILE_FIXTURE === "object") {
      render(window.MAKULLVENY_PROFILE_FIXTURE, typeof window.MAKULLVENY_PROFILE_NOW === "number" ? window.MAKULLVENY_PROFILE_NOW : Date.now());
      return;
    }
    var me = currentMe();

    /* THE /profile/ DOOR: by username. */
    if (isProfilePath(window.location.pathname)) {
      var name = usernameFromLocation(window.location.pathname, window.location.hash);
      if (!name && me && me.username) name = me.username;
      if (!name) {
        if (me) { renderOwn(me); return; }
        signInState();
        return;
      }
      showCanonical(name);
      fetchProfile({ action: "profile_at", username: name }, function (payload, status) {
        if (payload) { render(payload, Date.now()); return; }
        /* Your own address with no live link: your own card, as before. */
        if (status === 404 && me && sameName(me.username, name)) { renderOwn(me); return; }
        setState(stateForStatus(status));
      });
      return;
    }

    /* THE OLD u/ DOOR: by token, then the canonical address. */
    var token = tokenFromHash();
    if (!token) {
      /* No token: the signed-in student's OWN page -- at its canonical
         address when they have a username, else drawn here from the three
         public facts account/me.js keeps. */
      if (me && me.username) { window.location.replace(canonicalPath(me.username)); return; }
      if (me) { renderOwn(me); return; }
      signInState();
      return;
    }
    fetchProfile({ action: "profile", token: token }, function (payload, status) {
      if (!payload) { setState(stateForStatus(status)); return; }
      render(payload, Date.now());
      showCanonical(shapeProfile(payload).username);
    });
  }

  function signInState() {
    setState("This link is not complete. Ask whoever sent it for the full address.");
    var state = el("ppState");
    var signin = make("a", "", "Sign in");
    signin.href = ROOT + "account/#signin";
    state.append(document.createElement("br"), signin, document.createTextNode(" to see your own profile."));
  }

  /* ONE request to mak-share; done(payload) on success, done(null, status)
     otherwise (0 = unreachable). */
  function fetchProfile(body, done) {
    if (!CONFIG.apiUrl || !apiOriginAllowed(CONFIG.apiUrl)) {
      setState("Profile links are not open yet.");
      return;
    }
    setState("Opening…");
    var request = new XMLHttpRequest();
    request.open("POST", CONFIG.apiUrl, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = function () {
      if (request.status !== 200) { done(null, request.status); return; }
      var payload = null;
      try { payload = JSON.parse(request.responseText); } catch (error) { payload = null; }
      if (!payload || payload.ok !== true) { done(null, 404); return; }
      done(payload, 200);
    };
    request.onerror = function () { setState("This page could not be reached. Check your connection and try again."); };
    request.timeout = 20000;
    request.ontimeout = function () { setState("This is taking too long to open. Check your connection and reload the page."); };
    request.send(JSON.stringify(body));
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
      ownNote: ownNote,
      isProfilePath: isProfilePath,
      usernameFromLocation: usernameFromLocation,
      canonicalPath: canonicalPath,
      friendMode: friendMode,
      friendWords: friendWords,
      friendEndpoint: friendEndpoint,
      ALLOWED_API_ORIGINS: ALLOWED_API_ORIGINS,
      AVATARS: AVATARS,
      THEMES: THEMES,
      STAGE_BASE: STAGE_BASE
    };
  }

  if (hasWindow && typeof document !== "undefined" && document.getElementById && document.getElementById("ppMain")) {
    window.addEventListener("hashchange", function () { window.location.reload(); });
    /* Signed in or out in another tab: the own card, and the Add friend
       block on anybody's page, both depend on who is signed in. */
    window.addEventListener("storage", function (e) { if (e.key === "makullveny.me.v1") window.location.reload(); });
    window.addEventListener("makullveny-signout", function () {
      if (ownShown) window.location.replace(ROOT + "account/#signin"); else window.location.reload();
    });
    open();
  }
})();
